"""
Recorder sessions (.accrec) → laps for the analysis pipeline, and a check of real recordings.

Usage:
  python recording.py check recordings/<file>.accrec     layout and data sanity report
  python acc_telemetry.py recordings/<file>.accrec       analysis, like a MoTeC file

Lap boundaries and lap times come from the game itself (lap timer and completed-lap counter),
lap validity from its isValidLap flag, pit laps from isInPitLane, the position along the lap from
normalizedCarPosition, and the car's position on the map from its coordinates.
"""
import os
import sys
from datetime import datetime
from types import SimpleNamespace

import numpy as np

import acc_shm as shm
import accrec
from acc_telemetry import Lap, POS_CHANNELS, TRACK_LENGTHS, clean_inputs, fmt, hold


def game_clock(pid: np.ndarray, t_s: np.ndarray, g: dict | None = None):
    """Physics time from packet ids: one packet = one physics step, so polling jitter disappears
    and pauses (no packets) take no time. The step length is calibrated against the game's own lap
    timer (median over laps; 2.500 ms in ACC), else measured against the recorder clock over long
    continuous stretches (less reliable: the packet counter misbehaves in the pits and menus)."""
    d = np.diff(pid).astype(float)
    d[d <= 0] = 1                              # packet counter reset (session restart)
    dt = np.diff(t_s)
    rough = np.median(dt / d)
    breaks = dt > 4 * d * rough + 0.05         # pause or stall
    seg = np.concatenate([[0], np.cumsum(breaks)])
    span = steps = 0.0
    for k in np.unique(seg):
        i = np.flatnonzero(seg == k)
        if len(i) > 1:
            span += t_s[i[-1]] - t_s[i[0]]
            steps += d[i[0]:i[-1]].sum()
    step = span / steps if steps else rough
    count = np.concatenate([[0.0], np.cumsum(d)])

    if g is not None and len(g["t_ns"]) > 100:
        # Lap timer (ms) against packet count, lap by lap (skipping the first second of each lap,
        # around the timer reset)
        at_frame = np.interp(g["t_ns"] / 1e9, t_s, count)
        slopes = []
        for lap in np.unique(g["completedLaps"]):
            m = (g["completedLaps"] == lap) & (g["iCurrentTime"] > 1000)
            if m.sum() > 200 and np.ptp(at_frame[m]) > 0:
                slopes.append(np.polyfit(at_frame[m], g["iCurrentTime"][m], 1)[0] / 1000)
        slopes = [x for x in slopes if 0.5 * step < x < 2 * step]
        if slopes:
            step = float(np.median(slopes))
    return count * step, step


def _position_source(p: dict, g: dict, p_tg: np.ndarray, g_tg: np.ndarray):
    """Car position per physics packet: mean of the four tyre contact points when the game fills
    them in consistently with the speed, else the player's coordinates from the graphics page."""
    cp = p["tyreContactPoint"].mean(axis=1)
    moving = p["speedKmh"] > 30
    if moving.sum() > 50 and np.abs(cp).max() > 1:
        step = np.linalg.norm(np.diff(cp, axis=0), axis=1)
        dt = np.diff(p_tg)
        ratio = np.median(step[moving[1:]] / np.maximum(dt[moving[1:]], 1e-6) / (p["speedKmh"][1:][moving[1:]] / 3.6))
        if 0.8 < ratio < 1.25:
            return cp, "tyre contact points (physics)"
    gc = g[accrec.PLAYER_COORDINATES]
    ok = np.isfinite(gc).all(axis=1)
    if ok.sum() < 2:
        return None, "none"
    return np.column_stack([np.interp(p_tg, g_tg[ok], gc[ok, i]) for i in range(3)]), "car coordinates (graphics)"


def _crossings(g: dict, g_tg: np.ndarray) -> list[dict]:
    """Line crossings: frames where completedLaps increases. Exact instant = frame time − the
    game's lap timer at that frame; official lap time = iLastTime once updated."""
    laps = g["completedLaps"]
    out = []
    for k in np.flatnonzero(np.diff(laps) > 0) + 1:
        cur = g["iCurrentTime"][k]
        t = g_tg[k] - cur / 1000 if 0 <= cur < 1000 else g_tg[k]
        nxt = np.flatnonzero(g["iLastTime"][k:k + 60] != g["iLastTime"][k - 1])
        last_ms = int(g["iLastTime"][k + nxt[0]]) if len(nxt) else int(g["iLastTime"][k])
        out.append({"t": float(t), "frame": int(k), "official_ms": last_ms})
    return out


def load_recording(path: str, track_length: float | None = None, tol: float = 0.03):
    """Same contract as acc_telemetry.load_session: (head, laps, reference length)."""
    rec = accrec.read_recording(path)
    p, g = rec.physics, rec.graphics
    st = rec.static_text
    track, car = st("track"), st("carModel")
    head = SimpleNamespace(
        venue=track, vehicleid=car, source_kind="shared_memory",
        driver=" ".join(x for x in (st("playerName"), st("playerSurname")) if x),
        datetime=datetime.fromisoformat(rec.header["local_time"]) if "local_time" in rec.header else datetime.now(),
        session_type=rec.header.get("session", {}).get("type"))
    if len(p["t_ns"]) < 2 or len(g["t_ns"]) < 2:
        return head, [], 0.0

    p_tg, step = game_clock(p["packetId"], p["t_ns"] / 1e9, g)
    f = round(1 / step)
    g_tg = np.interp(g["t_ns"] / 1e9, p["t_ns"] / 1e9, p_tg)
    live = np.isin(g["status"], (shm.STATUS_LIVE, shm.STATUS_PAUSE))
    pos, _ = _position_source(p, g, p_tg, g_tg)
    npos_u = np.unwrap(g["normalizedCarPosition"].astype(float), period=1.0)
    lock = shm.STEER_LOCK_DEG.get(car)
    crossings = _crossings(g, g_tg)

    laps = []
    for n, (c0, c1) in enumerate(zip(crossings[:-1], crossings[1:]), start=1):
        a, b = c0["t"], c1["t"]
        tq = a + np.arange(int((b - a) * f)) / f
        ip = lambda x: np.interp(tq, p_tg, x)
        data = {
            "SPEED": ip(p["speedKmh"]) / 3.6,
            "THROTTLE": 100 * ip(p["gas"]),
            "BRAKE": 100 * ip(p["brake"]),
            "CLUTCH": 100 * ip(p["clutch"]),
            "STEER_NORM": ip(p["steerAngle"]),
            "GEAR": hold(tq, p_tg, p["gear"]).astype(float) - 1,       # ACC: 0 = R, 1 = N, 2 = 1st
            "RPMS": ip(p["rpm"]),
            # ACC fills the float flags abs / tc (0 or 1); absInAction / tcInAction stay at 0
            "ABS_ACTIVE": (hold(tq, p_tg, p["abs"]) > 0).astype(float),
            "TC_ACTIVE": (hold(tq, p_tg, p["tc"]) > 0).astype(float),
            "NPOS": np.interp(tq, g_tg, npos_u) % 1.0,
        }
        if lock:
            data["STEERANGLE"] = data["STEER_NORM"] * lock / 2
        if pos is not None:
            data.update({name: ip(pos[:, i]) for i, name in enumerate(POS_CHANNELS)})

        in_lap = (g_tg > a + 0.1) & (g_tg < b) & live
        pit = g["isInPitLane"][(g_tg >= a) & (g_tg < b)] > 0
        frames = np.flatnonzero((g_tg >= a) & (g_tg < b))
        side = ""
        if pit.any():
            first = g_tg[frames[np.argmax(pit)]] - a
            side = "out" if first < 0.1 * (b - a) else "in"
        laps.append(Lap(n, a, b, b - a, float(data["SPEED"].sum() / f), data, {k: f for k in data}, pit=side,
                        game_time=c1["official_ms"] / 1000 if c1["official_ms"] > 0 else None,
                        game_valid=bool(np.all(g["isValidLap"][in_lap] > 0)) if in_lap.any() else None))
    if not laps:
        return head, laps, 0.0

    ref = track_length or TRACK_LENGTHS.get(track) or float(np.median([l.distance for l in laps]))
    for l in laps:
        l.dist_ok = abs(l.distance - ref) / ref < tol
        clean_inputs(l)
    return head, laps, ref


# --- Check of a real recording ------------------------------------------------------

def check(path: str):
    """Report to run on the first real recordings: if the layout were wrong, these checks would
    fail loudly (speeds that disagree, values out of range, positions that do not move)."""
    rec = accrec.read_recording(path, accrec.PHYSICS_DEFAULT + ["currentMaxRpm", "wheelAngularSpeed"])
    p, g, h = rec.physics, rec.graphics, rec.header
    st = rec.static_text
    results = []

    def verdict(ok, name, detail):
        results.append(ok)
        print(f"  [{'PASS' if ok else 'WARN'}] {name}: {detail}")

    print(f"File: {path}{' (last chunk truncated)' if rec.truncated else ''}")
    print(f"  ACC {st('acVersion')}, shared memory {st('smVersion')}; track {st('track')}, car {st('carModel')}, "
          f"player '{st('playerName')} {st('playerSurname')}' ({st('playerNick')}), "
          f"session {h.get('session', {}).get('type')}, online {bool(rec.static['isOnline'])}")
    n_p, n_g = len(p["t_ns"]), len(g["t_ns"])
    if n_p < 100 or n_g < 10:
        print("  Not enough data to check.")
        return False
    dur = (p["t_ns"][-1] - p["t_ns"][0]) / 1e9
    pid = p["packetId"]
    gaps = np.diff(pid)
    missed = int(np.sum(gaps[gaps > 1] - 1))
    p_tg, step = game_clock(pid, p["t_ns"] / 1e9, g)
    g_rate = n_g / ((g["t_ns"][-1] - g["t_ns"][0]) / 1e9)
    size = os.path.getsize(path)
    print(f"  {dur / 60:.1f} min recorded; physics {n_p} packets, game step {step * 1000:.3f} ms "
          f"({1 / step:.1f} Hz), missed {missed} ({100 * missed / (n_p + missed):.2f} %); graphics {n_g} frames "
          f"({g_rate:.0f} Hz); {size / 1e6:.1f} MB ({size / max(dur, 1) * 3.6e3 / 1e6:.0f} MB per hour)")

    texts = [st(x) for x in ("track", "carModel", "smVersion")]
    verdict(all(t and t.isprintable() for t in texts), "static page text", ", ".join(texts))
    verdict(abs(1 / step - 400) < 5 or abs(1 / step - 333) < 5, "physics rate",
            f"{1 / step:.1f} Hz (expected 400 Hz since ACC 1.8)")

    moving = p["speedKmh"] > 20
    if moving.sum() > 100:
        vel = np.linalg.norm(p["velocity"], axis=1) * 3.6
        err = np.median(np.abs(vel[moving] - p["speedKmh"][moving]) / p["speedKmh"][moving])
        verdict(err < 0.05, "speedKmh vs |velocity|", f"median difference {100 * err:.1f} %")
    for name, lo, hi in (("gas", 0, 1), ("brake", 0, 1), ("clutch", 0, 1), ("steerAngle", -1, 1)):
        x = p[name]
        verdict(bool(np.all((x >= lo - 1e-3) & (x <= hi + 1e-3))), f"{name} range",
                f"{x.min():.3f} … {x.max():.3f} (expected {lo} … {hi})")
    verdict(bool(np.all((p["gear"] >= 0) & (p["gear"] <= 9))) and 0 <= p["rpm"].min() and p["rpm"].max() < 20000,
            "gear / rpm range", f"gear {p['gear'].min()} … {p['gear'].max()}, rpm {p['rpm'].min()} … {p['rpm'].max()}")

    # Gear numbering: each gear value should have its own speed/rpm ratio (ACC: 0 = R, 1 = N, 2 = 1st)
    m = moving & (p["rpm"] > 3000) & (p["clutch"] < 0.05)
    if m.sum() > 100:
        ratios = {int(k): np.median(p["speedKmh"][m & (p["gear"] == k)] / p["rpm"][m & (p["gear"] == k)] * 1000)
                  for k in np.unique(p["gear"][m]) if np.sum(m & (p["gear"] == k)) > 50}
        ordered = [ratios[k] for k in sorted(ratios)]
        verdict(all(b > a for a, b in zip(ordered, ordered[1:])), "gear numbering",
                "km/h per 1000 rpm by gear value: " + ", ".join(f"{k}→{v:.1f}" for k, v in sorted(ratios.items())))

    g_tg = np.interp(g["t_ns"] / 1e9, p["t_ns"] / 1e9, p_tg)
    gc = g[accrec.PLAYER_COORDINATES]
    ok = np.isfinite(gc).all(axis=1)
    verdict(ok.mean() > 0.95, "player found in carID[]", f"{100 * ok.mean():.1f} % of frames")
    if ok.sum() > 100:
        span = np.ptp(gc[ok], axis=0)
        vertical = int(np.argmin(span))
        # Over ~0.5 s stretches: about 1 frame in 10 repeats the previous position
        k = max(1, round(0.5 * g_rate))
        pts, tts = gc[ok][::k], g_tg[ok][::k]
        moved = np.linalg.norm(np.diff(pts, axis=0), axis=1)
        dtg = np.diff(tts)
        sp =np.array([np.mean(p["speedKmh"][(p_tg >= a) & (p_tg < b)]) if b > a else 0
                       for a, b in zip(tts[:-1], tts[1:])]) / 3.6
        mv = (sp > 10) & (dtg > 0)
        ratio = np.median(moved[mv] / dtg[mv] / sp[mv]) if mv.any() else float("nan")
        verdict(0.9 < ratio < 1.1, "car coordinates", f"extent x/y/z {span[0]:.0f}/{span[1]:.0f}/{span[2]:.0f} m, "
                f"vertical axis = {'xyz'[vertical]}, distance moved / speed = {ratio:.3f} (1 = metres)")
        cp = p["tyreContactPoint"].mean(axis=1)
        gi = np.column_stack([np.interp(p_tg, g_tg[ok], gc[ok, i]) for i in range(3)])
        dist = np.median(np.linalg.norm(cp - gi, axis=1))
        verdict(dist < 5, "tyre contact points vs car coordinates", f"median distance {dist:.2f} m")
    np_ = g["normalizedCarPosition"]
    verdict(bool(np.all((np_ >= 0) & (np_ <= 1))) and np.ptp(np_) > 0.5, "normalizedCarPosition",
            f"{np_.min():.3f} … {np_.max():.3f}")

    head, laps, ref = load_recording(path)
    print(f"  Laps ({len(laps)} complete, reference {ref:.0f} m):")
    for l in laps:
        gt = "" if l.game_time is None else f"  game {fmt(l.game_time)} ({1000 * (l.lap_time - l.game_time):+.0f} ms)"
        flags = ", ".join(x for x in (("valid" if l.game_valid else "INVALID") if l.game_valid is not None else "",
                                      f"pit {l.pit}" if l.pit else "") if x)
        print(f"    L{l.number}: {fmt(l.lap_time)} {l.distance:7.0f} m{gt}  {flags}")
    timed = [l for l in laps if l.game_time and not l.pit]
    if timed:
        worst = max(abs(l.lap_time - l.game_time) for l in timed)
        verdict(worst < 0.01, "lap times vs game", f"largest difference {1000 * worst:.1f} ms")
    print(f"  {sum(results)}/{len(results)} checks passed")
    return all(results)


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] != "check":
        raise SystemExit("Usage: python recording.py check <file.accrec>")
    sys.exit(0 if check(sys.argv[2]) else 1)
