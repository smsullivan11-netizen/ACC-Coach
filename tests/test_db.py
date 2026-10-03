"""
Reference import of a session bundle into Postgres (db/migrations/*.sql) + ranking tests.
The site uses the same logic in TypeScript (web/lib/import-bundle.ts): keep both in step.

Usage: DATABASE_URL=postgresql://… python tests/test_db.py [real_bundle.json.gz]
Works in an "acc_test" schema that is recreated on every run.
"""
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT), str(ROOT / "tests")]
import acc_telemetry as acc
import bundle as bdl
import corners as cn
import fake_acc
import recording
import test_synthetic as syn

DSN = os.environ.get("DATABASE_URL", "postgresql://postgres:test@localhost:5433/postgres")

CORNER_COLUMNS = ["time_s", "entry_speed_kmh", "lift_point_m", "braking_point_m", "brake_release_m",
                  "max_brake_pct", "min_speed_kmh", "apex_m", "throttle_pickup_m", "full_throttle_m",
                  "coasting_s", "exit_speed_kmh"]


class Rejected(Exception):
    """Bundle refused (HTTP 409/422 response on the site)."""


def _upsert(cur, sql_insert: str, params: tuple, sql_select: str, key: tuple) -> int:
    row = cur.execute(sql_insert + " on conflict do nothing returning id", params).fetchone()
    return row[0] if row else cur.execute(sql_select, key).fetchone()[0]


def import_results(conn, res: dict) -> int:
    """Server .json → server_session + official_lap (all drivers)."""
    with conn.cursor() as cur:
        track = cur.execute("select id from track where simulator = 'acc' and key = %s",
                            (res["trackName"],)).fetchone()
        if not track:
            raise Rejected(f"unknown track: {res['trackName']}")
        ss = _upsert(cur, "insert into server_session (track_id, server_name, file_name, session_type, ended_at, raw)"
                          " values (%s, %s, %s, %s, %s, %s)",
                     (track[0], res.get("serverName", ""), res.get("SessionFile", "?"), res.get("sessionType"),
                      res.get("Date"), Jsonb(res)),
                     "select id from server_session where server_name = %s and file_name = %s",
                     (res.get("serverName", ""), res.get("SessionFile", "?")))
        steam = {}
        for line in res.get("sessionResult", {}).get("leaderBoardLines", []):
            for i, d in enumerate(line["car"].get("drivers", [])):
                steam[(line["car"]["carId"], i)] = d.get("playerId")
        index = {}
        for x in res.get("laps", []):
            car = x["carId"]
            index[car] = index.get(car, 0) + 1
            sid = steam.get((car, x.get("driverIndex", 0)))
            cur.execute("insert into official_lap (server_session_id, car_number_id, lap_index, steam_id, driver_id,"
                        " lap_time_ms, valid, splits_ms) values (%s, %s, %s, %s,"
                        " (select id from driver where steam_id = %s), %s, %s, %s) on conflict do nothing",
                        (ss, car, index[car], sid, sid, x["laptime"], x["isValidForBest"], x.get("splits")))
    return ss


def import_bundle(conn, b: dict, driver_id: int) -> int:
    """Session bundle → session, lap, corner_result, lap_trace. All or nothing (transaction)."""
    if b.get("format") != bdl.FORMAT or b.get("version") != 1:
        raise Rejected("unsupported bundle format")
    s, cm = b["session"], b["corner_map"]
    with conn.transaction(), conn.cursor() as cur:
        if cur.execute("select 1 from session where source_sha256 = %s", (b["source"]["sha256"],)).fetchone():
            raise Rejected("session already uploaded")
        track = _upsert(cur, "insert into track (simulator, key, length_m) values (%s, %s, %s)",
                        (b["simulator"], s["track"], s["track_length_m"]),
                        "select id from track where simulator = %s and key = %s", (b["simulator"], s["track"]))
        car = None
        if s["car"]:
            model = (s["official"] or {}).get("car_model")
            car = _upsert(cur, "insert into car (simulator, key, acc_model_id) values (%s, %s, %s)",
                          (b["simulator"], s["car"], model),
                          "select id from car where simulator = %s and key = %s", (b["simulator"], s["car"]))

        # Corner map: the first non-provisional version becomes the reference;
        # after that, same version = same fingerprint, otherwise the bundle is refused.
        map_id = None
        if not cm["provisional"]:
            row = cur.execute("select id, hash from corner_map where track_id = %s and version = %s",
                              (track, cm["version"])).fetchone()
            if row and row[1] != cm["hash"]:
                raise Rejected(f"corner map v{cm['version']} differs from the site's")
            if row:
                map_id = row[0]
            else:
                map_id = cur.execute("insert into corner_map (track_id, version, hash, length_m, definition)"
                                     " values (%s, %s, %s, %s, %s) returning id",
                                     (track, cm["version"], cm["hash"], cm["length_m"], Jsonb(cm))).fetchone()[0]
                cur.executemany("insert into corner (corner_map_id, number, name, start_m, apex_m, end_m)"
                                " values (%s, %s, %s, %s, %s, %s)",
                                [(map_id, c["id"], c["name"], c["start_m"], c["apex_m"], c["end_m"])
                                 for c in cm["corners"]])

        off = s["official"]
        ss = None
        if off:
            row = cur.execute("select id from server_session where server_name = %s and file_name = %s",
                              (off.get("server_name") or "", off["session_file"])).fetchone()
            ss = row[0] if row else None

        try:
            session = cur.execute(
                "insert into session (driver_id, track_id, car_id, server_session_id, source_kind, source_file,"
                " source_sha256, recorded_at, session_type, bundle_version, agent_version)"
                " values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id",
                (driver_id, track, car, ss, b["source"]["kind"], b["source"]["file"], b["source"]["sha256"],
                 datetime.fromisoformat(s["recorded_at"]), s.get("type"), b["version"],
                 b["agent"]["version"])).fetchone()[0]
        except psycopg.errors.UniqueViolation:
            raise Rejected("session already uploaded")

        for l in b["laps"]:
            official_lap = None
            if ss and l["official_lap_time_ms"] is not None:
                row = cur.execute("select id from official_lap where server_session_id = %s and car_number_id = %s"
                                  " and lap_time_ms = %s", (ss, off["car_id"], l["official_lap_time_ms"])).fetchone()
                official_lap = row[0] if row else None
            lap = cur.execute(
                "insert into lap (session_id, number, lap_time_ms, official_lap_time_ms, official_lap_id,"
                " game_lap_time_ms, game_valid, valid, comparable, excluded_reasons, distance_m, metrics,"
                " corner_map_id) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id",
                (session, l["number"], l["lap_time_ms"], l["official_lap_time_ms"], official_lap,
                 l.get("game_lap_time_ms"), l.get("game_valid"), l["valid"], l["comparable"],
                 l["excluded_reasons"], l["distance_m"], Jsonb(l["metrics"]) if l["metrics"] else None,
                 map_id if l["corners"] else None)).fetchone()[0]
            if map_id and l["corners"]:
                cur.executemany(
                    f"insert into corner_result (lap_id, corner_map_id, corner_number, {', '.join(CORNER_COLUMNS)})"
                    f" values (%s, %s, %s, {', '.join(['%s'] * len(CORNER_COLUMNS))})",
                    [(lap, map_id, c["corner"], *(c[k] for k in CORNER_COLUMNS)) for c in l["corners"]])
            if l["trace"]:
                cur.execute("insert into lap_trace (lap_id, step_m, length, channels) values (%s, %s, %s, %s)",
                            (lap, l["trace"]["step_m"], l["trace"]["length"], Jsonb(l["trace"]["channels"])))
    return session


# --- Test ---------------------------------------------------------------------

def synthetic_bundle(out: Path, name: str, factors: list[float], driver: str) -> tuple[dict, dict]:
    """Complete synthetic session for one driver: bundle + server .json."""
    syn.LAP_FACTORS = factors
    rows, crossings = syn.simulate()
    ld = out / f"{name}.ld"
    syn.write_ld(ld, rows, crossings)
    syn.write_ldx(ld.with_suffix(".ldx"), crossings)
    syn.write_results(out / f"{name}.json", crossings)
    res = acc.read_results(str(out / f"{name}.json"))
    res["SessionFile"] = name
    for line in res["sessionResult"]["leaderBoardLines"]:   # distinct Steam IDs
        for d in line["car"]["drivers"]:
            d["playerId"] = f"S{driver}-{d['shortName']}"
    head, laps, ref = acc.load_session(str(ld))
    car, _ = acc.match_official(laps, res, head.driver)
    cmap, _ = acc.corner_map_for(head.venue, laps, ref, ld.name)
    return bdl.build_bundle(str(ld), head, laps, ref, cmap, res, car), res


def main():
    out = Path(tempfile.mkdtemp())
    cn.TRACKS_DIR = out / "tracks"
    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute("drop schema if exists acc_test cascade")
        conn.execute("create schema acc_test")
        conn.execute("set search_path to acc_test")
        for migration in sorted((ROOT / "db" / "migrations").glob("*.sql")):
            conn.execute(migration.read_text(encoding="utf-8"))

        alice = conn.execute("insert into driver (display_name, steam_id) values ('Alice', 'SA-TDR') returning id").fetchone()[0]
        bob = conn.execute("insert into driver (display_name, steam_id) values ('Bob', 'SB-TDR') returning id").fetchone()[0]

        # Alice: L2 and L4 comparable (98 % and 100 %); Bob faster (101 % and 102 %)
        ba, ra = synthetic_bundle(out, "alice", [1.0, 0.98, 1.01, 1.0, 0.99], "A")
        bb, rb = synthetic_bundle(out, "bob", [1.0, 1.01, 1.03, 1.02, 0.99], "B")
        assert ba["corner_map"]["hash"] == bb["corner_map"]["hash"], "same map for both drivers"

        for res, b, d in ((ra, ba, alice), (rb, bb, bob)):
            res["trackName"] = b["session"]["track"]
            conn.execute("insert into track (key, length_m) values (%s, %s) on conflict do nothing",
                         (b["session"]["track"], b["session"]["track_length_m"]))
            import_results(conn, res)
            import_bundle(conn, b, d)

        q = lambda sql, *p: conn.execute(sql, p).fetchall()
        print("Laps:", q("select count(*), count(*) filter (where comparable), count(official_lap_id) from lap")[0])
        print("Official laps linked to a driver:", q("select count(*) from official_lap where driver_id is not null")[0][0])
        ranking = q("select d.display_name, r.lap_time_ms, r.position, r.gap_ms from lap_ranking r"
                    " join driver d on d.id = r.driver_id order by r.position")
        print("Ranking:", ranking)
        assert [x[0] for x in ranking] == ["Bob", "Alice"] and ranking[0][1] == min(
            l["lap_time_ms"] for l in bb["laps"] if l["comparable"])

        corners = q("select corner_number, d.display_name, position, round(gap_s::numeric, 3) from corner_ranking r"
                    " join driver d on d.id = r.driver_id where position = 1 order by corner_number")
        print("Best per corner:", corners)
        assert len(corners) == len(syn.CORNERS) and all(x[1] == "Bob" for x in corners)

        theo = dict(q("select d.display_name, theoretical_s from theoretical_best t join driver d on d.id = t.driver_id"))
        print("Theoretical best laps:", theo)
        best_bob = min(l["lap_time_ms"] for l in bb["laps"] if l["comparable"]) / 1000
        assert float(theo["Bob"]) <= best_bob + 0.01

        # Refusals: same file twice, different map under the same version number
        for bad, why in ((ba, "already uploaded"),
                         ({**bb, "source": {**bb["source"], "sha256": "x"},
                           "corner_map": {**bb["corner_map"], "hash": "other"}}, "corner map")):
            try:
                import_bundle(conn, bad, alice)
                raise AssertionError("bundle wrongly accepted")
            except Rejected as e:
                assert why in str(e), e
        assert q("select count(*) from session")[0][0] == 2, "a refusal must leave nothing in the database"

        # Recorder session (fake ACC): game lap times and validity, car position in the traces
        fake = out / "recorder.accrec"
        fake_acc.write_session(fake)
        head, laps, ref = recording.load_recording(str(fake))
        cmap, _ = acc.corner_map_for(head.venue, laps, ref, fake.name)
        rb_ = bdl.build_bundle(str(fake), head, laps, ref, cmap)
        import_bundle(conn, rb_, alice)
        rows = q("select l.number, l.game_lap_time_ms, l.game_valid, l.excluded_reasons, l.comparable,"
                 " t.channels ? 'pos_x_m', (select count(*) from corner_result c where c.lap_id = l.id)"
                 " from lap l join session s on s.id = l.session_id left join lap_trace t on t.lap_id = l.id"
                 " where s.source_kind = 'shared_memory' order by l.number")
        print("Recorder session:", rows)
        assert [r[2] for r in rows] == [True, True, False, True, True]
        assert all(r[1] == round(l.game_time * 1000) for r, l in zip(rows, laps))
        assert all(r[5] for r in rows) and all(r[6] == len(cmap["corners"]) for r in rows)
        assert rows[2][3] == ["game_invalid"]

        # Real bundle (optional): provisional map → laps imported without per-corner results
        if len(sys.argv) > 1:
            real = bdl.read_bundle(sys.argv[1])
            import_bundle(conn, real, alice)
            print("Real bundle:", q("select l.number, l.lap_time_ms, l.official_lap_time_ms, l.comparable,"
                                    " l.excluded_reasons, (select count(*) from corner_result c where c.lap_id = l.id),"
                                    " pg_column_size(t.channels) from lap l join session s on s.id = l.session_id"
                                    " left join lap_trace t on t.lap_id = l.id where s.source_file = %s",
                                    real["source"]["file"]))
        print("Trace storage:", q("select pg_size_pretty(pg_total_relation_size('lap_trace'))")[0][0])
    print("OK")


if __name__ == "__main__":
    main()
