"""
Offline test of recorder files: a full fake session (pit start, out-lap, flying laps, one lap
invalidated by the game, in-lap) written straight into an .accrec file, then read back through
the whole pipeline: laps, flags, lap times, positions, corners, bundle, plots and the check report.

Usage: python tests/test_recording.py
"""
import sys
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT), str(ROOT / "tests")]
import acc_telemetry as acc
import bundle
import corners as cn
import fake_acc
import recording


def main():
    out = Path(tempfile.mkdtemp())
    path = out / "session.accrec"
    expect = fake_acc.write_session(path)
    print(f"Fake session: {path.stat().st_size / 1e6:.1f} MB, laps {expect['lap_ms']} ms")

    head, laps, ref = recording.load_recording(str(path))
    for l in laps:
        print(f"  L{l.number}: {acc.fmt(l.lap_time)} game {acc.fmt(l.game_time)} {l.distance:6.0f} m "
              f"pit={l.pit or '-'} game_valid={l.game_valid} comparable={l.comparable}")
    assert (head.venue, head.vehicleid, head.driver) == ("fake_track", "bmw_m4_gt3", "Test Driver")
    assert len(laps) == 5
    assert [l.pit for l in laps] == ["out", "", "", "", "in"]
    assert [l.game_valid for l in laps] == [True, True, False, True, True]
    assert [l.reasons() for l in laps] == [["pit_out"], [], ["game_invalid"], [], ["pit_in"]]
    assert [l.number for l in laps if l.comparable] == [2, 4]
    for l, ms in zip(laps, expect["lap_ms"]):
        assert l.game_time == ms / 1000, "lap time published by the game"
        assert abs(l.lap_time - ms / 1000) < 0.003, f"L{l.number} boundaries off by {l.lap_time - ms / 1000:+.4f} s"
    assert abs(ref - expect["track_length"]) / expect["track_length"] < 0.01

    l2 = laps[1]
    assert l2.freqs["SPEED"] == 400
    assert all(np.isfinite(x).all() for x in l2.data.values()), "gaps from missed packets must be bridged"
    assert set(np.unique(l2.data["GEAR"])) <= set(range(1, 7)), "ACC gear offset (2 = 1st) not removed"
    assert np.allclose(l2.data["STEERANGLE"], l2.data["STEER_NORM"] * 258), "steering lock of the BMW M4 GT3 = 516° lock to lock"

    r2, r4 = acc.resample_by_distance(laps[1], ref), acc.resample_by_distance(laps[3], ref)
    pa, pb = (np.column_stack([r[c] for c in acc.POS_CHANNELS]) for r in (r2, r4))
    gap = np.linalg.norm(pa - pb, axis=1)
    print(f"Line gap L2/L4 at the same distance: median {np.median(gap):.2f} m, max {gap.max():.2f} m")
    assert 0.1 < np.median(gap) < 2.0 and gap.max() < 3.0, "positions must align by distance along the lap"
    cmap = cn.build_corner_map(r4, "fake_track")
    track = fake_acc.Track()
    _, dips = cn._zigzag(3.6 * track.v, cn.CORNER_DROP_KMH)      # corners of the fake's own speed profile
    print("Corners (apex m):", [round(c["apex_m"]) for c in cmap["corners"]], "expected", dips)
    assert len(cmap["corners"]) == len(dips)
    # The apex (slowest point) is ambiguous along a constant-radius arc: it must lie where the true
    # speed is within 1 km/h of the corner's minimum
    for c, d in zip(cmap["corners"], dips):
        assert 3.6 * (track.at(c["apex_m"], track.v) - track.v[d]) < 1.0, (c, d)

    cn.TRACKS_DIR = out / "tracks"
    sys.argv = ["acc_telemetry.py", str(path), "--bundle", str(out / "session.json.gz")]
    acc.main()
    b = bundle.read_bundle(str(out / "session.json.gz"))
    assert b["source"]["kind"] == "shared_memory" and b["session"]["driver_name"] == "Test Driver"
    assert [x["game_valid"] for x in b["laps"]] == [True, True, False, True, True]
    assert all(x["game_lap_time_ms"] == ms for x, ms in zip(b["laps"], expect["lap_ms"]))
    # Fuel load per lap (app 0.1.6): fake ACC burns 1 L per 2 km from 50 L, so it falls lap after lap
    fuels = [x["metrics"]["fuel_l"] for x in b["laps"] if x["metrics"]]
    assert len(fuels) >= 3 and all(40 < f < 50 for f in fuels) and fuels == sorted(fuels, reverse=True), fuels
    channels = b["laps"][1]["trace"]["channels"]
    assert {"pos_x_m", "pos_y_m", "pos_z_m", "steering_norm", "steering_deg"} <= channels.keys()
    x = bundle.decode_channel(channels["pos_x_m"])
    assert np.abs(x - r2["POS_X"]).max() <= 0.006
    assert (out / "session_L2_vs_L4_lines.png").exists()

    print()
    assert recording.check(str(path)), "check report"
    lap_timer(out, expect)
    print("OK —", out)


def lap_timer(out: Path, expect: dict):
    """App 0.3.0: laps on the game's own lap timer. Real laps had pauses counted in (ACC keeps sending
    physics packets while paused, its lap timer stops: famas +1.99 s just before the line, So +149 s)
    and short sessions a clock a few % off (-0.9 s, -6.5 s)."""
    cr = expect["crossings"]              # cr[0] = end of L1 / start of L2 (car time, s)
    path = out / "paused.accrec"
    paused = fake_acc.write_session(path, pauses=[(cr[0] + 20.0, 30.0), (cr[2] + (cr[3] - cr[2]) - 0.6, 2.0)])
    _, laps, ref = recording.load_recording(str(path))
    for l, ms in zip(laps, paused["lap_ms"]):
        print(f"  paused session L{l.number}: {acc.fmt(l.lap_time)} game {acc.fmt(ms / 1000)} {l.distance:6.0f} m")
        assert abs(l.lap_time - ms / 1000) < 0.003, f"L{l.number}: a pause must not count ({l.lap_time - ms / 1000:+.3f} s)"
    assert paused["lap_ms"] == expect["lap_ms"], "the pauses do not change the driving"
    for k in (1, 3):                        # the paused laps: same distance and trace as without pause
        assert abs(laps[k].distance - ref) / ref < 0.01, (k, laps[k].distance, ref)
        r = acc.resample_by_distance(laps[k], ref)
        assert np.diff(r["time"]).max() < 0.2, f"L{k + 1}: the trace must not stand still over the pause"
        assert abs(r["time"][-1] - laps[k].lap_time) < 0.05

    # A packet clock 5 % off (short sessions): the laps still follow the game's timer
    real = recording.game_clock
    try:
        recording.game_clock = lambda *a, **k: tuple(x * 1.05 for x in real(*a, **k))
        _, laps, _ = recording.load_recording(str(out / "session.accrec"))
    finally:
        recording.game_clock = real
    worst = max(abs(l.lap_time - ms / 1000) for l, ms in zip(laps, expect["lap_ms"]))
    print(f"  clock 5 % off: lap times within {1000 * worst:.1f} ms of the game's")
    assert worst < 0.003
    # ... and the traces too: same positions at the same distance as with the right clock, same
    # distance covered (the lap time alone comes from the game whenever it publishes one)
    _, good, _ = recording.load_recording(str(out / "session.accrec"))
    for a, b in zip(laps, good):
        assert abs(a.distance - b.distance) < 3, (a.number, a.distance, b.distance)
    ra, rb = acc.resample_by_distance(laps[1], ref), acc.resample_by_distance(good[1], ref)
    drift = np.abs(ra["time"] - rb["time"]).max()
    print(f"  clock 5 % off: L2 trace within {1000 * drift:.1f} ms of the right one")
    assert drift < 0.01

    # Laps the game does not time (hotlap mode, invalid laps): the lap time comes from the timer fit
    from accrec import read_recording
    rec = read_recording(str(path))
    p_tg, _ = recording.game_clock(rec.physics["packetId"], rec.physics["t_ns"] / 1e9, rec.graphics)
    g_tg = np.interp(rec.graphics["t_ns"] / 1e9, rec.physics["t_ns"] / 1e9, p_tg)
    cr = recording._crossings(rec.graphics, g_tg)
    for c0, c1, ms in zip(cr[:-1], cr[1:], paused["lap_ms"]):
        _, est = recording.lap_timer(rec.graphics, g_tg, c0["t"], c1["t"], None)
        assert abs(est - ms / 1000) < 0.01, f"untimed lap: {est:.3f} s, game {ms / 1000:.3f} s"
    print("  untimed laps (hotlap mode): within 10 ms of the game's timer, pauses left out")


if __name__ == "__main__":
    main()
