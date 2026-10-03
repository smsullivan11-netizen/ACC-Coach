"""
Synthetic ACC session (.ld + .ldx + server .json) to test acc_telemetry without real data.

Scenario: start in the pits, L1 = out-lap, L2–L4 flying laps (L3 invalid on the server
and the fastest), L5 = in-lap. The last beacon is missing from the .ldx (completed with TIME).
The brake trace "chatters" and auto-blips (46 %) appear on downshifts.

Usage: python tests/test_synthetic.py
"""
import datetime
import json
import struct
import sys
import tempfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import ldparser
import acc_telemetry as acc
import bundle
import corners as cn

L = 3900.0                      # m
CORNERS = [(300, 35), (650, 18), (1250, 25), (2000, 40), (2300, 32), (2750, 35), (3000, 30), (3450, 33)]
VMAX, DECEL, PIT_V = 66.0, 12.0, 22.0
F_IN, F_GEAR, F_TIME = 60, 20, 50
LAP_FACTORS = [1.0, 0.98, 1.01, 1.0, 0.99]   # L1..L5 (L3 the fastest)


def target_speed(s):
    s = s % L
    v = VMAX
    for pos, vmin in CORNERS:
        dist = min(abs(s - pos), L - abs(s - pos))
        v = min(v, np.sqrt(vmin ** 2 + 2 * DECEL * dist))
    return v


def simulate():
    dt = 1 / F_IN
    s, t, lap = L - 300, 0.0, 0     # start in the pit lane, 300 m before the line
    crossings, rows = [], []
    blip_phase = 0
    while True:
        in_pit = (lap == 0 and s > L - 300) or (lap == 1 and s < 200) or (lap == 5 and s > L - 300) or lap >= 6
        factor = LAP_FACTORS[min(max(lap, 1), 5) - 1]
        v_here = target_speed(s) * factor
        v_ahead = target_speed(s + 15) * factor
        if in_pit:
            v, thr, brk = (PIT_V, 30.0, 0.0) if lap < 6 else (0.0, 0.0, 0.0)
        elif v_ahead < v_here - 0.2:          # braking zone
            v, thr = v_here, 0.0
            k = len(rows)
            brk = 0.0 if k % 6 < 2 else 90.0  # chattering brake
            blip_phase += 1
            # auto-blip ~0.07 s every 0.5 s, after the lift and not at the very end of braking
            if 10 <= blip_phase % 30 < 14 and target_speed(s + 40) * factor < v_here - 0.2:
                thr = 46.0
        else:
            v, thr, brk = v_here, 100.0, 0.0
            blip_phase = 0
        steer = sum(80 * np.exp(-(((s - p) % L if (s - p) % L < L / 2 else (s - p) % L - L) / 40) ** 2)
                    * (1 if n % 2 else -1) for n, (p, _) in enumerate(CORNERS))
        gear = float(np.clip(1 + int(v // 12), 1, 6))
        rows.append((v, thr, brk, steer, gear, 2000 + 100 * v))
        s += v * dt
        t += dt
        if s >= L:
            s -= L
            lap += 1
            crossings.append(t)
        if lap >= 6 and t > crossings[-1] + 3:
            break
    return np.array(rows), crossings


def write_ld(path, rows, crossings):
    n = len(rows)
    t = np.arange(n) / F_IN
    tg = np.arange(int(n * F_GEAR / F_IN)) / F_GEAR
    tt = np.arange(int(n * F_TIME / F_IN)) / F_TIME
    last = np.array([max([c for c in crossings if c <= x], default=0.0) for x in tt])
    chans = {
        "SPEED": (F_IN, rows[:, 0]), "THROTTLE": (F_IN, rows[:, 1]), "BRAKE": (F_IN, rows[:, 2]),
        "STEERANGLE": (F_IN, rows[:, 3]), "RPMS": (F_IN, rows[:, 5]),
        "GEAR": (F_GEAR, acc.hold(tg, t, rows[:, 4])), "TIME": (F_TIME, tt - last),
    }
    meta_ptr = struct.calcsize(ldparser.ldHead.fmt) + struct.calcsize(ldparser.ldEvent.fmt)
    size = struct.calcsize(ldparser.ldChan.fmt)
    data_ptr = meta_ptr + len(chans) * size
    channs = []
    for k, (name, (freq, x)) in enumerate(chans.items()):
        mp = meta_ptr + k * size
        c = ldparser.ldChan(None, mp, mp - size if k else 0, mp + size if k < len(chans) - 1 else 0,
                            data_ptr, len(x), np.float32, freq, 0, 1, 1, 0, name, name[:8], "")
        c._data = x.astype(np.float32)
        data_ptr += c._data.nbytes
        channs.append(c)
    event = ldparser.ldEvent("test", "R", "", 0, None)
    head = ldparser.ldHead(meta_ptr, struct.calcsize(ldparser.ldHead.fmt) + 0, struct.calcsize(ldparser.ldHead.fmt),
                           event, "Test Driver", "test_car", "test_track", datetime.datetime(2026, 10, 3), "")
    head.data_ptr = meta_ptr + len(chans) * size
    ldparser.ldData(head, channs).write(str(path))


def write_ldx(path, crossings):
    markers = "".join(f'<Marker Version="100" ClassName="BCN" Time="{c * 1e6:.0f}"/>' for c in crossings[:-1])
    path.write_text(f'<?xml version="1.0"?><LDXFile><Layers><MarkerBlock>{markers}</MarkerBlock></Layers></LDXFile>')


def write_results(path, crossings):
    times = np.diff(crossings)                      # L1..L5
    laps = [{"carId": 1001, "driverIndex": 0, "laptime": int(round(x * 1000)),
             "isValidForBest": i != 2} for i, x in enumerate(times)]
    rng = np.random.default_rng(0)                   # another car, with close lap times
    laps += [{"carId": 1002, "driverIndex": 0, "laptime": int(round((x + rng.normal(0, 0.3)) * 1000)),
              "isValidForBest": True} for x in times]
    res = {"trackName": "test_track", "laps": laps, "sessionResult": {"leaderBoardLines": [
        {"car": {"carId": 1001, "drivers": [{"firstName": "Test", "lastName": "Driver", "shortName": "TDR"}]}},
        {"car": {"carId": 1002, "drivers": [{"firstName": "Other", "lastName": "Guy", "shortName": "OTG"}]}}]}}
    path.write_text(json.dumps(res), encoding="utf-16")


def main():
    rows, crossings = simulate()
    out = Path(tempfile.mkdtemp())
    ld = out / "session.ld"
    write_ld(ld, rows, crossings)
    write_ldx(ld.with_suffix(".ldx"), crossings)
    write_results(out / "results.json", crossings)

    head, laps, ref = acc.load_session(str(ld))
    car, n = acc.match_official(laps, acc.read_results(str(out / "results.json")), head.driver)
    for l in laps:
        print(f"L{l.number}: {acc.fmt(l.lap_time)} {l.distance:6.0f} m pit={l.pit or '-'} "
              f"official={l.official_time} server_valid={l.official_valid} comparable={l.comparable}")

    assert len(laps) == 5, "the missing last beacon must be completed with TIME"
    assert [l.pit for l in laps] == ["out", "", "", "", "in"]
    assert laps[0].reasons() == ["pit_out"]
    assert car == 1001 and n == 5
    assert laps[2].official_valid is False and not laps[2].comparable
    assert all(abs(l.lap_time - l.official_time) < acc.OFFICIAL_TOL for l in laps)
    assert [l.number for l in laps if l.comparable] == [2, 4]

    for l in laps[1:4]:
        zone = l.data["BRAKE_ZONE"] > 0.5
        thr_nb, thr = l.data["THROTTLE_NB"], l.data["THROTTLE"]
        assert (thr[zone] == 46).any(), "the scenario must contain blips"
        assert not (thr_nb[zone] == 46).any(), "blips not removed"
        assert (thr_nb[~zone] == thr[~zone]).all(), "throttle changed outside braking zones"
        assert (l.data["BRAKE_FILLED"][zone] > acc.BRAKE_ON).all(), "brake gaps not filled"
        # The braking point (zone start) stays the raw brake onset
        starts = np.flatnonzero(np.diff(zone.astype(int)) == 1) + 1
        assert (l.data["BRAKE"][starts] > acc.BRAKE_ON).all()

    r = acc.resample_by_distance(laps[1], ref)
    assert set(np.unique(r["GEAR"])) <= set(range(1, 7)), "non-integer gears"
    m = acc.lap_metrics(r)
    print("Metrics L2:", {k: round(v, 1) for k, v in m.items()})
    assert 0 < m["braking_pct"] < 50 and 50 < m["full_throttle_pct"] < 100

    check_corners(laps, ref)
    cn.TRACKS_DIR = out / "tracks"          # do not write into the project folder
    sys.argv = ["acc_telemetry.py", str(ld), "--results", str(out / "results.json"),
                "--bundle", str(out / "session.json.gz")]
    acc.main()
    check_corner_map_storage(laps, ref)
    check_bundle(out / "session.json.gz", laps, ref, ld)
    print("OK —", out)


def check_corners(laps, ref):
    r2, r4 = (acc.resample_by_distance(laps[i], ref) for i in (1, 3))
    cmap = cn.build_corner_map(r4, "test_track")
    corners = cn.scaled_corners(cmap, ref)
    apexes = [c["apex_m"] for c in corners]
    print("Detected corners (apex m):", [round(a) for a in apexes])
    assert len(corners) == len(CORNERS), "one corner per speed dip"
    assert all(abs(a - pos) < 15 for a, (pos, _) in zip(apexes, CORNERS)), "apexes misplaced"
    assert corners[0]["start_m"] == 0 and abs(corners[-1]["end_m"] - r4["dist"][-1]) < 0.1

    m2 = cn.corner_metrics(r2, corners)
    for c, x, (pos, vmin) in zip(corners, m2, CORNERS):
        assert abs(x["min_speed_kmh"] - 3.6 * vmin * LAP_FACTORS[1]) < 3, (c, x)
        assert x["lift_point_m"] <= x["braking_point_m"] < x["apex_m"], (c, x)
        assert x["braking_point_m"] < x["full_throttle_m"], (c, x)
        assert x["brake_release_m"] <= x["throttle_pickup_m"], (c, x)
        assert x["max_brake_pct"] == 90
    assert abs(sum(x["time_s"] for x in m2) - r2["time"][-1]) < 0.05, "corners ≠ full lap"

    rows = cn.compare_corners(m2, cn.corner_metrics(r4, corners), corners)
    assert all(x["dt_s"] > 0 for x in rows), "L2 (98 %) must lose time to L4 everywhere"
    assert abs(sum(x["dt_s"] for x in rows) - (laps[1].lap_time - laps[3].lap_time)) < 0.05


def check_corner_map_storage(laps, ref):
    # Built on the first run from the best comparable lap (L4), loaded afterwards
    saved = cn.load_corner_map("test_track")
    assert saved and saved["version"] == 1 and saved["source"].endswith("L4")
    saved["corners"][1]["name"] = "Druids"
    cn.map_path("test_track").write_text(json.dumps(saved), encoding="utf-8")
    cmap, how = acc.corner_map_for("test_track", laps, ref, "x.ld", rebuild=True)
    assert cmap["version"] == 2 and cmap["corners"][1]["name"] == "Druids", "name lost on rebuild"


def check_bundle(path, laps, ref, ld):
    b = bundle.read_bundle(str(path))
    assert b["format"] == bundle.FORMAT and b["version"] == bundle.VERSION
    assert b["session"]["official"]["car_id"] == 1001
    assert b["session"]["official"]["drivers"][0]["short_name"] == "TDR"
    assert [x["excluded_reasons"] for x in b["laps"]] == [["pit_out"], [], ["server_invalid"], [], ["pit_in"]]
    assert all(x["official_lap_time_ms"] == x["lap_time_ms"] for x in b["laps"])
    l2 = b["laps"][1]
    assert len(l2["corners"]) == len(CORNERS) and l2["metrics"]["max_speed_kmh"] > 200
    r2 = acc.resample_by_distance(laps[1], ref)
    ch = l2["trace"]["channels"]
    assert l2["trace"]["length"] == len(r2["dist"])
    assert np.abs(bundle.decode_channel(ch["speed_ms"]) - r2["SPEED"]).max() <= 0.005 + 1e-9
    assert np.abs(bundle.decode_channel(ch["time_s"]) - r2["time"]).max() <= 0.0005 + 1e-9
    assert set(bundle.decode_channel(ch["gear"])) <= set(range(1, 7))
    print(f"Bundle: {path.stat().st_size / 1024:.0f} KB for {len(b['laps'])} laps")


if __name__ == "__main__":
    main()
