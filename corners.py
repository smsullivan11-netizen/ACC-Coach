"""
Corners: a track's corner map and per-corner metrics.

The map (tracks/<track>.json) is built once from a reference lap, then reused for every lap and
every driver: same corners, same boundaries, same numbers. A corner runs from the speed peak
before it to the speed peak after it (end of one straight → end of the next); its metrics are
recomputed lap by lap inside those boundaries.

Inputs: laps resampled by acc_telemetry.resample_by_distance (1 m grid), with the cleaned
channels THROTTLE_NB, BRAKE_ZONE and BRAKE_FILLED.
"""
import hashlib
import json
from pathlib import Path

import numpy as np

TRACKS_DIR = Path(__file__).resolve().parent / "tracks"

CORNER_DROP_KMH = 10.0   # minimum peak-to-dip speed drop for a dip to count as a corner
SMOOTH_M = 15            # m: speed smoothing before detection
FULL_THROTTLE = 98.0     # %: full throttle
PICKUP_THROTTLE = 10.0   # %: throttle pickup
COAST_THROTTLE = 5.0     # %: below this, with no brake = coasting


# --- Corner map ---------------------------------------------------------------

def _smooth(x: np.ndarray, n: int) -> np.ndarray:
    pad = np.pad(x, n // 2, mode="edge")
    return np.convolve(pad, np.ones(n) / n, mode="same")[n // 2:n // 2 + len(x)]


def _zigzag(v: np.ndarray, h: float):
    """Alternating peaks and dips more than h apart (indices)."""
    peaks, valleys = [], []
    i_max = i_min = 0
    trend = 0          # 1: looking for a peak, -1: for a dip, 0: unknown
    for i, x in enumerate(v):
        if x > v[i_max]:
            i_max = i
        if x < v[i_min]:
            i_min = i
        if trend >= 0 and v[i_max] - x > h:
            peaks.append(i_max)
            trend, i_min = -1, i
        elif trend <= 0 and x - v[i_min] > h:
            valleys.append(i_min)
            trend, i_max = 1, i
    return peaks, valleys


def build_corner_map(r: dict, track: str, source: str = "", drop_kmh: float = CORNER_DROP_KMH) -> dict:
    """Detects the corners of a resampled lap (speed dips of at least drop_kmh)."""
    d = r["dist"]
    v = 3.6 * _smooth(r["SPEED"], SMOOTH_M)
    peaks, valleys = _zigzag(v, drop_kmh)
    # A dip right at the line is not a corner: it is the start or end of the lap
    valleys = [a for a in valleys if SMOOTH_M < a < len(d) - 1 - SMOOTH_M]
    corners = []
    for n, a in enumerate(valleys, start=1):
        start = max((p for p in peaks if p < a), default=0)
        end = min((p for p in peaks if p > a), default=len(d) - 1)
        corners.append({"id": n, "name": None, "start_m": round(float(d[start]), 1),
                        "apex_m": round(float(d[a]), 1), "end_m": round(float(d[end]), 1)})
    if corners:   # corners cover the whole lap: sum of corner times = lap time
        corners[0]["start_m"] = 0.0
        corners[-1]["end_m"] = round(float(d[-1]), 1)
    return {"track": track, "length_m": round(float(d[-1] + (d[1] - d[0])), 1), "version": 1,
            "source": source, "drop_kmh": drop_kmh, "corners": corners}


def map_hash(cmap: dict) -> str:
    """Fingerprint of the boundaries (not the names): two maps with the same version must match."""
    key = [(c["id"], c["start_m"], c["apex_m"], c["end_m"]) for c in cmap["corners"]]
    return hashlib.sha256(json.dumps([cmap["track"], cmap["length_m"], key]).encode()).hexdigest()[:16]


def map_path(track: str) -> Path:
    return TRACKS_DIR / f"{track}.json"


def load_corner_map(track: str) -> dict | None:
    p = map_path(track)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def save_corner_map(cmap: dict) -> Path:
    """Saves the map; if a map already existed, the version is incremented (names are kept for
    corners whose apex moved by less than 30 m)."""
    p = map_path(cmap["track"])
    old = load_corner_map(cmap["track"])
    if old:
        cmap["version"] = old["version"] + 1
        for c in cmap["corners"]:
            near = [o for o in old["corners"] if o.get("name") and abs(o["apex_m"] - c["apex_m"]) < 30]
            if near:
                c["name"] = near[0]["name"]
    TRACKS_DIR.mkdir(exist_ok=True)
    p.write_text(json.dumps(cmap, ensure_ascii=False, indent=1), encoding="utf-8")
    return p


def scaled_corners(cmap: dict, length_m: float) -> list[dict]:
    """Corner boundaries rescaled to the reference length used for resampling."""
    k = length_m / cmap["length_m"]
    return [{**c, "start_m": c["start_m"] * k, "apex_m": c["apex_m"] * k, "end_m": c["end_m"] * k}
            for c in cmap["corners"]]


def corner_label(c: dict) -> str:
    return f"T{c['id']}" + (f" {c['name']}" if c.get("name") else "")


# --- Per-corner metrics ---------------------------------------------------------

def _run_around(mask: np.ndarray, i: int) -> tuple[int, int] | None:
    """Bounds [start, end) of the run of True containing index i (None if mask[i] is False)."""
    if not mask[i]:
        return None
    s = i
    while s > 0 and mask[s - 1]:
        s -= 1
    e = i
    while e < len(mask) and mask[e]:
        e += 1
    return s, e


def corner_metrics(r: dict, corners: list[dict]) -> list[dict]:
    """Metrics of each corner for one lap. Distances in m from the line;
    None when the event does not happen (flat-out corner: no lift, no braking)."""
    d, t = r["dist"], r["time"]
    v = 3.6 * r["SPEED"]
    thr, brk = r["THROTTLE_NB"], r["BRAKE_FILLED"]
    braking = r["BRAKE_ZONE"] > 0.5
    partial = thr < FULL_THROTTLE
    dt = np.gradient(t)
    m = lambda i: None if i is None else round(float(d[min(i, len(d) - 1)]), 1)

    out = []
    for c in corners:
        s, e = (int(x) for x in np.searchsorted(d, [c["start_m"], c["end_m"]]))
        e = min(e, len(d) - 1)
        a = s + int(np.argmin(v[s:e + 1]))                  # this lap's apex = minimum speed

        # Braking point: start of the main braking event before the apex, i.e. the braking run that
        # loses the most speed (a brief dab close to the apex does not count). May be before the
        # corner start when the driver brakes early.
        b_run, drop = None, -np.inf
        for i in np.flatnonzero(braking[s:a + 1] & ~np.concatenate([[False], braking[s:a]])) + s:
            run = _run_around(braking, int(i))
            loss = v[run[0]] - v[min(run[1], a)]
            if loss > drop:
                b_run, drop = run, loss
        brake_on, brake_off = (b_run[0], b_run[1]) if b_run else (None, None)

        # Lift: start of the partial-throttle run around the braking point; when the driver is still
        # at full throttle as the brake goes on (overlap), the first lift after it. Without braking:
        # around the apex, or the last one before it (full throttle may be back at minimum speed).
        anchor = brake_on if brake_on is not None else a
        run = _run_around(partial, anchor)
        if run is None and brake_on is not None:
            after = np.flatnonzero(partial[brake_on:a + 1])
            run = _run_around(partial, brake_on + int(after[0])) if len(after) else None
        elif run is None:
            before = np.flatnonzero(partial[s:anchor + 1])
            run = _run_around(partial, s + int(before[-1])) if len(before) else None
        lift = run[0] if run else None

        # Full throttle: first full throttle from the apex on
        full = None
        if lift is not None:
            hits = np.flatnonzero(~partial[a:e + 1])
            full = a + int(hits[0]) if len(hits) else None

        # Throttle pickup: after brake release (or the lift), first throttle above the threshold
        pickup = None
        if lift is not None:
            frm = brake_off if brake_off is not None else lift
            hits = np.flatnonzero(thr[frm:e + 1] > PICKUP_THROTTLE)
            pickup = frm + int(hits[0]) if len(hits) else None

        coast = 0.0
        if lift is not None:
            seg = slice(lift, full if full is not None else e + 1)
            coast = float(dt[seg][(thr[seg] < COAST_THROTTLE) & ~braking[seg]].sum())

        out.append({
            "corner": c["id"],
            "time_s": round(float(t[e] - t[s]), 3),
            "entry_speed_kmh": round(float(v[lift if lift is not None else s]), 1),
            "lift_point_m": m(lift),
            "braking_point_m": m(brake_on),
            "brake_release_m": m(brake_off),
            "max_brake_pct": round(float(brk[brake_on:brake_off].max()), 1) if b_run else None,
            "min_speed_kmh": round(float(v[a]), 1),
            "apex_m": m(a),
            "throttle_pickup_m": m(pickup),
            "full_throttle_m": m(full),
            "coasting_s": round(coast, 3),
            "exit_speed_kmh": round(float(v[e]), 1),
        })
    return out


def compare_corners(ma: list[dict], mb: list[dict], corners: list[dict]) -> list[dict]:
    """A − B differences per corner. Distances: positive = later on track for A."""
    def diff(x, y):
        return None if x is None or y is None else round(x - y, 1)

    rows = []
    for c, a, b in zip(corners, ma, mb):
        rows.append({
            "corner": c, "dt_s": round(a["time_s"] - b["time_s"], 3),
            "d_braking_m": diff(a["braking_point_m"], b["braking_point_m"]),
            "d_min_speed_kmh": diff(a["min_speed_kmh"], b["min_speed_kmh"]),
            "d_pickup_m": diff(a["throttle_pickup_m"], b["throttle_pickup_m"]),
            "d_full_throttle_m": diff(a["full_throttle_m"], b["full_throttle_m"]),
        })
    return rows
