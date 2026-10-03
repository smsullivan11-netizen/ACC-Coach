"""
ACC telemetry analysis — prototype. Reads MoTeC exports (.ld + .ldx) and recorder files (.accrec).

Dependency: ldparser.py (https://github.com/gotzl/ldparser, GPL-3.0), placed next to this file.
Usage: python acc_telemetry.py <session.ld | recording.accrec> [lapA lapB] [--results results.json]
                               [--track-length M] [--raw] [--rebuild-corners] [--bundle out.json.gz]
"""
import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import ldparser

import corners as cn

INPUTS = ["SPEED", "THROTTLE", "BRAKE", "STEERANGLE", "GEAR", "RPMS"]
DISCRETE = {"GEAR", "BRAKE_ZONE", "ABS_ACTIVE", "TC_ACTIVE"}   # not to be linearly interpolated
POS_CHANNELS = ("POS_X", "POS_Y", "POS_Z")                     # car position (recorder only)

# Input cleaning
BRAKE_ON = 5.0       # %: braking threshold
BRAKE_GAP_S = 0.3    # s: shorter gaps inside a braking zone are filled (brake trace "chatter")
THROTTLE_ON = 5.0    # %
BLIP_MAX_S = 0.3     # s: a shorter throttle pulse inside a braking zone = auto-blip

# Official lengths (m), keyed by the .ld venue; otherwise median of the laps (unreliable with 1-2 laps)
TRACK_LENGTHS = {"brands_hatch": 3908, "nurburgring_24h": 25378}

PIT_SPEED_RATIO = 0.6  # speed at the line < 60 % of the median → pit out-lap / in-lap
OFFICIAL_TOL = 0.05    # s: max gap between telemetry lap time and server lap time


@dataclass
class Lap:
    number: int
    t_start: float      # s from the start of the file
    t_end: float
    lap_time: float     # s
    distance: float     # m, integrated from SPEED
    data: dict          # channel -> np.ndarray (native frequency)
    freqs: dict
    dist_ok: bool = True                 # distance consistent with the reference length
    pit: str = ""                        # "out" / "in" if the lap goes through the pits
    official_time: float | None = None   # lap time from the server .json, if matched
    official_valid: bool | None = None   # isValidForBest from the server .json
    game_time: float | None = None       # lap time published by the game (recorder only)
    game_valid: bool | None = None       # the game's isValidLap flag over the lap (recorder only)

    @property
    def valid(self) -> bool:
        return self.dist_ok and self.official_valid is not False and self.game_valid is not False

    @property
    def comparable(self) -> bool:
        return self.valid and not self.pit

    def reasons(self) -> list[str]:
        """Exclusion codes (stored as is; display labels: REASON_LABELS)."""
        r = [] if self.dist_ok else ["distance"]
        if self.official_valid is False:
            r.append("server_invalid")
        if self.game_valid is False:
            r.append("game_invalid")
        if self.pit:
            r.append(f"pit_{self.pit}")
        return r


REASON_LABELS = {"distance": "distance", "server_invalid": "invalid (server)", "game_invalid": "invalid (game)",
                 "pit_out": "pit out-lap", "pit_in": "pit in-lap"}


def reasons_text(lap: Lap) -> str:
    return ", ".join(REASON_LABELS[r] for r in lap.reasons())


# --- Signal helpers -----------------------------------------------------------

def _runs(mask: np.ndarray):
    """Starts and (exclusive) ends of runs of True."""
    m = np.diff(np.concatenate([[0], mask.astype(np.int8), [0]]))
    return np.flatnonzero(m == 1), np.flatnonzero(m == -1)


def close_gaps(mask: np.ndarray, n: int) -> np.ndarray:
    """Fills gaps (False) shorter than n samples that sit between two True values."""
    out = mask.copy()
    for s, e in zip(*_runs(~mask)):
        if s > 0 and e < len(mask) and e - s < n:
            out[s:e] = True
    return out


def hold(tq: np.ndarray, tn: np.ndarray, x: np.ndarray) -> np.ndarray:
    """Zero-order hold: last known value at each instant tq (discrete channels)."""
    i = np.searchsorted(tn, tq, side="right") - 1
    return x[np.clip(i, 0, len(x) - 1)]


# --- Reading and lap splitting --------------------------------------------------

def read_beacons(ldx_path: Path) -> list[float]:
    """Line-crossing instants (s), read from the .ldx (stored in µs)."""
    if not ldx_path.exists():
        return []
    xml = ldx_path.read_text(errors="ignore")
    return sorted(float(t) / 1e6 for t in re.findall(r'ClassName="BCN"[^>]*Time="([^"]+)"', xml))


def time_resets(time_ch: np.ndarray, freq: float) -> list[float]:
    """Resets of the TIME channel = line crossings (aborted laps included).
    Exact instant = sample instant − TIME value right after the reset
    (~1 ms precision, versus 20 ms from the sample alone)."""
    jumps = np.flatnonzero(np.diff(time_ch) < -1.0) + 1
    return [i / freq - time_ch[i] for i in jumps]


def clean_inputs(lap: Lap) -> None:
    """Adds the cleaned channels to the lap:
    - BRAKE_ZONE: 1 inside a braking zone (brake > threshold, short gaps filled);
    - BRAKE_FILLED: brake with short drops below the threshold interpolated. These drops
      (clean steps ~70 → 0 → ~70 within 0.1-0.25 s, at the edges of ABS episodes) are a logging
      artefact: they are not in the replay. Braking points are read from raw BRAKE;
    - THROTTLE_NB: throttle without the automatic downshift blips (~47-50 %, 0.1 s).
    """
    brk, fb = lap.data["BRAKE"], lap.freqs["BRAKE"]
    thr, ft = lap.data["THROTTLE"], lap.freqs["THROTTLE"]

    on = brk > BRAKE_ON
    zone = close_gaps(on, int(BRAKE_GAP_S * fb))
    filled = brk.copy()
    for s, e in zip(*_runs(~on)):
        if s > 0 and e < len(brk) and zone[s:e].all():
            filled[s:e] = np.interp(np.arange(s, e), [s - 1, e], [brk[s - 1], brk[e]])

    zone_t = hold(np.arange(len(thr)) / ft, np.arange(len(zone)) / fb, zone)
    thr_nb = thr.copy()
    for s, e in zip(*_runs(thr > THROTTLE_ON)):
        if e - s < BLIP_MAX_S * ft and zone_t[s:e].any():
            thr_nb[s:e] = 0.0

    lap.data.update(BRAKE_ZONE=zone.astype(float), BRAKE_FILLED=filled, THROTTLE_NB=thr_nb)
    lap.freqs.update(BRAKE_ZONE=fb, BRAKE_FILLED=fb, THROTTLE_NB=ft)


def mark_pit_laps(laps: list[Lap]) -> None:
    """A lap that starts (out) or ends (in) slowly at the line went through the pits."""
    def line_speed(l: Lap, end: bool) -> float:
        v, n = l.data["SPEED"], max(1, int(l.freqs["SPEED"]))   # 1 s of data
        return float(v[-n:].mean() if end else v[:n].mean())

    ok = [l for l in laps if l.dist_ok]
    if not ok:
        return
    ref = float(np.median([line_speed(l, False) for l in ok]))
    for l in laps:
        if line_speed(l, False) < PIT_SPEED_RATIO * ref:
            l.pit = "out"
        elif line_speed(l, True) < PIT_SPEED_RATIO * ref:
            l.pit = "in"


def load_session(ld_path: str, track_length: float | None = None, tol: float = 0.03):
    ld_path = Path(ld_path)
    head, channels = ldparser.read_ldfile(str(ld_path))
    ch = {c.name: c for c in channels}
    freqs = {n: ch[n].freq for n in INPUTS if n in ch}
    data = {n: ch[n].data.astype(float) for n in INPUTS if n in ch}
    duration = len(data["SPEED"]) / freqs["SPEED"]

    # Lap boundaries: .ldx beacons, completed with TIME (last lap without a beacon).
    # When both exist, the instant derived from TIME wins: the beacon only has
    # 6 significant digits (10 ms resolution beyond 1000 s into the session).
    beacons = read_beacons(ld_path.with_suffix(".ldx"))
    resets = time_resets(ch["TIME"].data.astype(float), ch["TIME"].freq)
    bounds = [next((r for r in resets if abs(r - b) < 0.5), b) for b in beacons]
    bounds += [r for r in resets if all(abs(r - b) > 0.5 for b in beacons)]
    bounds = sorted(b for b in bounds if b <= duration + 0.1)

    def first_sample(t, f):   # first sample at or after instant t
        return int(np.ceil(t * f - 1e-6))

    laps = []
    for i, (a, b) in enumerate(zip(bounds[:-1], bounds[1:]), start=1):
        seg = {n: x[first_sample(a, freqs[n]):first_sample(b, freqs[n])] for n, x in data.items()}
        dist = seg["SPEED"].sum() / freqs["SPEED"]
        laps.append(Lap(i, a, b, b - a, dist, seg, dict(freqs)))
    if not laps:
        return head, laps, 0.0

    # Validation: distance consistent with the track length (median if unknown)
    ref = track_length or TRACK_LENGTHS.get(head.venue) or float(np.median([l.distance for l in laps]))
    for l in laps:
        l.dist_ok = abs(l.distance - ref) / ref < tol
        clean_inputs(l)
    mark_pit_laps(laps)
    return head, laps, ref


def load_any(path: str, track_length: float | None = None):
    """MoTeC export (.ld) or recorder file (.accrec) → (head, laps, reference length)."""
    if Path(path).suffix.lower() == ".accrec":
        import recording
        return recording.load_recording(path, track_length)
    return load_session(path, track_length)


# --- Cross-check with server results ---------------------------------------------

def read_results(json_path: str) -> dict:
    """ACC server results: often UTF-16 LE, sometimes UTF-8."""
    raw = Path(json_path).read_bytes()
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        enc = "utf-16"
    elif raw[1:2] == b"\x00":
        enc = "utf-16-le"
    else:
        enc = "utf-8-sig"
    return json.loads(raw.decode(enc))


def driver_cars(results: dict, driver: str) -> set:
    """carIds of the cars with a driver matching the .ld driver name (empty if unknown)."""
    name = driver.casefold().strip()
    cars = set()
    for line in results.get("sessionResult", {}).get("leaderBoardLines", []):
        for d in line.get("car", {}).get("drivers", []):
            full = f"{d.get('firstName', '')} {d.get('lastName', '')}".casefold().strip()
            if name and name in (full, d.get("lastName", "").casefold(), d.get("shortName", "").casefold()):
                cars.add(line["car"]["carId"])
    return cars


def match_official(laps: list[Lap], results: dict, driver: str = "", tol: float = OFFICIAL_TOL):
    """Aligns the sequence of telemetry laps with one car's laps in the .json (times in ms):
    keeps the car and offset that match the most laps within ±tol.
    Fills official_time / official_valid. Returns (carId, number of matched laps)."""
    by_car = {}
    for x in results.get("laps", []):
        by_car.setdefault(x["carId"], []).append(x)
    candidates = driver_cars(results, driver) & by_car.keys() or by_car.keys()

    tel = np.array([l.lap_time for l in laps])
    i = np.arange(len(tel))
    best = (None, 0, 0)   # carId, offset, score
    for car in candidates:
        ot = np.array([x["laptime"] / 1000 for x in by_car[car]])
        for k in range(-len(tel) + 1, len(ot)):          # tel[i] <-> ot[i + k]
            j = i + k
            m = (j >= 0) & (j < len(ot))
            score = int((np.abs(tel[m] - ot[j[m]]) < tol).sum())
            if score > best[2]:
                best = (car, k, score)

    car, k, score = best
    # A single matched lap can be a coincidence (cars often have very close lap times)
    if car is None or score < min(2, len(laps)):
        return None, 0
    off = by_car[car]
    for l in laps:
        j = l.number - 1 + k
        if 0 <= j < len(off) and abs(l.lap_time - off[j]["laptime"] / 1000) < tol:
            l.official_time = off[j]["laptime"] / 1000
            l.official_valid = bool(off[j].get("isValidForBest", True))
    return car, score


# --- Analysis -------------------------------------------------------------------

def resample_by_distance(lap: Lap, ref_length: float, step: float = 1.0) -> dict:
    """Resamples a lap onto a common distance grid (m). Distance comes from the game's position
    along the lap (NPOS, recorder files) when available, otherwise from integrated speed."""
    v = lap.data["SPEED"]
    f = lap.freqs["SPEED"]
    d = None
    if "NPOS" in lap.data:
        u = np.unwrap(lap.data["NPOS"], period=1.0)
        u -= u[0]
        if 0.95 < u[-1] < 1.05:             # a full lap (pit lanes can leave the track spline)
            d = np.maximum.accumulate(u) * ref_length
    if d is None:
        d = np.concatenate([[0], np.cumsum(v[:-1]) / f])
        d *= ref_length / d[-1]              # rescaling: compensates integration drift
    t = np.arange(len(v)) / f
    grid = np.arange(0, ref_length, step)
    tq = np.interp(grid, d, t)
    out = {"dist": grid, "time": tq}
    for n, x in lap.data.items():
        tn = np.arange(len(x)) / lap.freqs[n]
        out[n] = hold(tq, tn, x) if n in DISCRETE else np.interp(tq, tn, x)
    return out


def lap_metrics(r: dict) -> dict:
    """First input metrics (to be refined with the team), on cleaned inputs. Steering activity is in
    °/s when the steering wheel angle is known, otherwise in % of full lock per second."""
    thr = r["THROTTLE_NB"]
    braking = r["BRAKE_ZONE"] > 0.5
    dt = np.gradient(r["time"])
    total = dt.sum()
    m = {
        "full_throttle_pct": float(100 * dt[thr > 98].sum() / total),
        "braking_pct": float(100 * dt[braking].sum() / total),
        "avg_throttle_pct": float(np.average(thr, weights=dt)),
        "max_speed_kmh": float(3.6 * r["SPEED"].max()),
    }
    steer, key = (r["STEERANGLE"], "steering_rate_deg_s") if "STEERANGLE" in r else \
        (100 * r["STEER_NORM"], "steering_rate_pct_s")
    m[key] = float(np.average(np.abs(np.gradient(steer) / np.maximum(dt, 1e-3)), weights=dt))
    return m


def plot_overlay(ra: dict, rb: dict, la: Lap, lb: Lap, out_png: str, title: str, raw: bool = False,
                 corners: list[dict] | None = None):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    d = ra["dist"]
    delta = ra["time"] - rb["time"]
    thr, brk = ("THROTTLE", "BRAKE") if raw else ("THROTTLE_NB", "BRAKE_FILLED")
    steer = ("Steering (°)", ra["STEERANGLE"], rb["STEERANGLE"]) if "STEERANGLE" in ra and "STEERANGLE" in rb \
        else ("Steering (% of lock)", 100 * ra["STEER_NORM"], 100 * rb["STEER_NORM"])
    rows = [("Speed (km/h)", 3.6 * ra["SPEED"], 3.6 * rb["SPEED"]),
            ("Throttle (%)" if raw else "Throttle (%, no blips)", ra[thr], rb[thr]),
            ("Brake (%)" if raw else "Brake (%, filled)", ra[brk], rb[brk]),
            steer]
    fig, ax = plt.subplots(5, 1, figsize=(14, 12), sharex=True,
                           gridspec_kw={"height_ratios": [1.2, 2, 1, 1, 1.2]})
    ax[0].plot(d, delta, color="k")
    ax[0].axhline(0, color="grey", lw=0.5)
    ax[0].set_ylabel(f"Δt L{la.number}−L{lb.number} (s)")
    for i, (lab, a, b) in enumerate(rows, start=1):
        ax[i].plot(d, a, lw=1, label=f"L{la.number} ({la.lap_time:.3f} s)")
        ax[i].plot(d, b, lw=1, label=f"L{lb.number} ({lb.lap_time:.3f} s)")
        ax[i].set_ylabel(lab)
    for k, c in enumerate(corners or []):
        if k % 2:
            for x in ax:
                x.axvspan(c["start_m"], c["end_m"], color="0.93", zorder=0, lw=0)
        ax[0].text(c["apex_m"], 1.01, f"T{c['id']}", transform=ax[0].get_xaxis_transform(),
                   ha="center", va="bottom", fontsize=7 if len(corners) < 30 else 5)
    ax[1].legend(loc="lower right")
    ax[-1].set_xlabel("Distance (m)")
    fig.suptitle(title)
    fig.tight_layout()
    fig.savefig(out_png, dpi=110)


def plot_lines(ra: dict, rb: dict, la: Lap, lb: Lap, out_png: str, title: str, corners: list[dict],
               ma: list[dict], mb: list[dict], rows: list[dict], zooms: int = 3):
    """Racing lines of both laps: the whole track, then zooms on the corners where A loses the most,
    with each lap's braking point (●) and throttle pickup (▲)."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    pa, pb = (np.column_stack([r[c] for c in POS_CHANNELS]) for r in (ra, rb))
    i, j = sorted(np.argsort(np.ptp(pa, axis=0))[-2:])     # the two horizontal axes
    d = ra["dist"]
    at = lambda m: int(np.clip(np.searchsorted(d, m), 0, len(d) - 1))
    colors = ("C0", "C1")
    labels = (f"L{la.number} ({la.lap_time:.3f} s)", f"L{lb.number} ({lb.lap_time:.3f} s)")

    fig = plt.figure(figsize=(16, 9))
    grid = fig.add_gridspec(zooms, 3)
    ax = fig.add_subplot(grid[:, :2])
    for p, c, lab in zip((pa, pb), colors, labels):
        ax.plot(p[:, i], p[:, j], color=c, lw=1, label=lab)
    for c in corners:
        k = at(c["apex_m"])
        ax.annotate(f"T{c['id']}", (pa[k, i], pa[k, j]), fontsize=8, ha="center", va="bottom")
    ax.plot(pa[0, i], pa[0, j], "ks", ms=5)
    # ACC: y up, x and z horizontal; seen from above, z points down the page (otherwise the map is
    # mirrored: checked at Brands Hatch, where Druids must be a right-hander)
    mirror = (i, j) == (0, 2)
    if mirror:
        ax.invert_yaxis()
    ax.set_aspect("equal", adjustable="datalim")
    ax.axis("off")
    ax.legend(loc="best")
    ax.set_title(title)

    worst = sorted(rows, key=lambda x: -x["dt_s"])[:zooms]
    for z, row in enumerate(worst):
        c = row["corner"]
        a, b = ma[c["id"] - 1], mb[c["id"] - 1]
        k = at(b["apex_m"])
        lo, hi = at(b["apex_m"] - 60), at(b["apex_m"] + 60)      # lines differ by metres: zoom close
        axz = fig.add_subplot(grid[z, 2])
        for p, m, col in zip((pa, pb), (a, b), colors):
            axz.plot(p[lo:hi + 1, i], p[lo:hi + 1, j], color=col, lw=1.5)
            for key, marker in (("braking_point_m", "o"), ("throttle_pickup_m", "^")):
                if m[key] is not None and lo <= at(m[key]) <= hi:
                    axz.plot(p[at(m[key]), i], p[at(m[key]), j], marker, color=col, ms=6)
        # Lateral gap at B's apex, signed towards the inside of the corner
        q = lambda p, n: p[np.clip(n, 0, len(p) - 1)][[i, j]]
        tang = q(pb, k + 3) - q(pb, k - 3)
        normal = np.array([-tang[1], tang[0]]) / max(np.linalg.norm(tang), 1e-9)
        d1, d2 = q(pb, k) - q(pb, k - 15), q(pb, k + 15) - q(pb, k)
        turn = np.sign(d1[0] * d2[1] - d1[1] * d2[0]) or 1.0
        inside = float(np.dot(q(pa, k) - q(pb, k), normal) * turn)
        if mirror:
            axz.invert_yaxis()
        axz.set_aspect("equal", adjustable="datalim")
        axz.set_xticks([])
        axz.set_yticks([])
        axz.set_title(f"T{c['id']}: L{la.number} {row['dt_s']:+.3f} s, {abs(inside):.1f} m "
                      f"{'inside' if inside > 0 else 'outside'} at apex, min speed {a['min_speed_kmh']:.0f} "
                      f"vs {b['min_speed_kmh']:.0f} km/h", fontsize=9)
    fig.tight_layout()
    fig.savefig(out_png, dpi=110)


def fmt(t: float) -> str:
    return f"{int(t // 60)}:{t % 60:06.3f}"


def main():
    p = argparse.ArgumentParser(description="ACC telemetry analysis (MoTeC .ld + .ldx, or recorder .accrec)")
    p.add_argument("file", help=".ld file (with its .ldx next to it) or .accrec recording")
    p.add_argument("laps", nargs="*", type=int, help="two lap numbers to compare: A B")
    p.add_argument("--results", help="ACC server results .json (cross-check)")
    p.add_argument("--track-length", type=float, help="track length (m), otherwise median of the laps")
    p.add_argument("--raw", action="store_true", help="plot raw throttle and brake, without cleaning")
    p.add_argument("--rebuild-corners", action="store_true",
                   help="rebuild the corner map from the best comparable lap")
    p.add_argument("--bundle", help="write the session bundle (.json.gz) to upload to the site")
    args = p.parse_args()
    if len(args.laps) not in (0, 2):
        p.error("give zero or two lap numbers")

    head, laps, ref = load_any(args.file, args.track_length)
    if not laps:
        raise SystemExit("No complete lap in this file.")
    print(" — ".join(x for x in (head.venue, head.vehicleid, head.driver) if x) + f" — reference {ref:.0f} m")

    results = car = None
    if args.results:
        results = read_results(args.results)
        if results.get("trackName") not in (None, head.venue):
            print(f"Server results ignored: track {results['trackName']} ≠ {head.venue}")
            results = None
        else:
            car, n = match_official(laps, results, head.driver)
            print(f"Server results: car {car}, {n} lap{'s' * (n != 1)} matched" if car is not None
                  else "Server results: no lap matched")

    for l in laps:
        off = "".join(f"  {name} {fmt(t)} ({l.lap_time - t:+.3f})"
                      for name, t in (("game", l.game_time), ("server", l.official_time)) if t is not None)
        status = "OK" if l.comparable else "EXCLUDED: " + reasons_text(l)
        print(f"  L{l.number}: {fmt(l.lap_time)}  {l.distance:6.0f} m  {status}{off}")

    cmap, how = corner_map_for(head.venue, laps, ref, Path(args.file).name, args.rebuild_corners)
    corners = cn.scaled_corners(cmap, ref)
    print(f"Corner map: {len(corners)} corners, {how}")

    if args.bundle:
        import bundle
        path = bundle.write_bundle(bundle.build_bundle(args.file, head, laps, ref, cmap, results, car),
                                   args.bundle)
        print(f"Session bundle: {path} ({path.stat().st_size / 1024:.0f} KB)")

    comparable = [l for l in laps if l.comparable]
    if args.laps:
        a, b = args.laps
        if not all(1 <= n <= len(laps) for n in (a, b)):
            p.error(f"lap numbers must be between 1 and {len(laps)}")
        for n in (a, b):
            if not laps[n - 1].comparable:
                print(f"  Warning: L{n} is excluded from comparisons ({reasons_text(laps[n - 1])})")
    elif len(comparable) >= 2:
        best = min(comparable, key=lambda l: l.lap_time)
        a = next(l for l in comparable if l is not best).number
        b = best.number
    else:
        for l in comparable or [l for l in laps if l.dist_ok]:
            m = lap_metrics(resample_by_distance(l, ref))
            print(f"  Metrics L{l.number}: " + ", ".join(f"{k}={v:.1f}" for k, v in m.items()))
        print("Fewer than two comparable laps: no overlay (give two lap numbers to force one).")
        return

    la, lb = laps[a - 1], laps[b - 1]
    ra, rb = resample_by_distance(la, ref), resample_by_distance(lb, ref)
    for l, r in ((la, ra), (lb, rb)):
        m = lap_metrics(r)
        print(f"  Metrics L{l.number}: " + ", ".join(f"{k}={v:.1f}" for k, v in m.items()))
    ma, mb = cn.corner_metrics(ra, corners), cn.corner_metrics(rb, corners)
    rows = cn.compare_corners(ma, mb, corners)
    print_corner_comparison(rows, a, b)
    out = str(Path(args.file).with_suffix("")) + f"_L{a}_vs_L{b}"
    plot_overlay(ra, rb, la, lb, out + ".png", f"{head.venue} — L{a} vs L{b}", raw=args.raw, corners=corners)
    print("Plot:", out + ".png")
    if all(c in r for c in POS_CHANNELS for r in (ra, rb)):
        plot_lines(ra, rb, la, lb, out + "_lines.png", f"{head.venue} — racing lines L{a} vs L{b}",
                   corners, ma, mb, rows)
        print("Racing lines:", out + "_lines.png")


def corner_map_for(track: str, laps: list[Lap], ref: float, source: str, rebuild: bool = False):
    """Saved map if there is one; otherwise built from the best comparable lap and saved;
    without a comparable lap, a provisional map that is not saved."""
    cmap = None if rebuild else cn.load_corner_map(track)
    if cmap:
        return cmap, f"map {cn.map_path(track).name} v{cmap['version']}"
    comparable = [l for l in laps if l.comparable]
    pool = comparable or [l for l in laps if l.dist_ok] or laps
    best = min(pool, key=lambda l: l.lap_time)
    cmap = cn.build_corner_map(resample_by_distance(best, ref), track, f"{source} L{best.number}")
    if not comparable:
        cmap["provisional"] = True
        return cmap, f"provisional from L{best.number} (no comparable lap), not saved"
    return cmap, f"built from L{best.number} → {cn.save_corner_map(cmap)} v{cmap['version']}"


def print_corner_comparison(rows: list[dict], a: int, b: int, top: int = 8):
    """Corners where L{a} loses the most time to L{b}, with the input differences."""
    f = lambda x, unit: "    -" if x is None else f"{x:+5.0f}{unit}"
    print(f"  Corners where L{a} loses the most to L{b} (distances: + = later):")
    print(f"    {'corner':<16} {'Δt':>7}  {'braking':>9} {'min speed':>10} {'pickup':>9} {'full thr.':>9}")
    for row in sorted(rows, key=lambda x: -x["dt_s"])[:top]:
        print(f"    {cn.corner_label(row['corner']):<16} {row['dt_s']:+7.3f}  "
              f"{f(row['d_braking_m'], ' m'):>9} {f(row['d_min_speed_kmh'], ' km/h'):>10} "
              f"{f(row['d_pickup_m'], ' m'):>9} {f(row['d_full_throttle_m'], ' m'):>9}")
    print(f"    {'total':<16} {sum(x['dt_s'] for x in rows):+7.3f}")


if __name__ == "__main__":
    main()
