"""
Session bundle sent by the local agent to the team site — format v1.

One bundle = one processed file (MoTeC .ld or recorder .accrec): metadata, the corner map used,
and for each lap the lap times, status, lap metrics, per-corner metrics and resampled traces.
The site has nothing to recompute: it stores and displays. Data keys in snake_case,
distances in m from the line, speeds in km/h in the metrics and m/s in the traces.

Traces: regular distance grid (step_m); each channel is an array of little-endian integers
encoded in base64, real value = integer × scale (Int16Array/Int32Array on the JS side).
Uploaded file: gzip-compressed JSON (.json.gz).
"""
import base64
import gzip
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

import acc_telemetry as acc
import corners as cn
from version import __version__

FORMAT = "acc-coach/session"
VERSION = 1
AGENT = {"name": "acc-coach", "version": __version__}

TRACE_STEP_M = 1.0
TRACE_CHANNELS = {   # name in the bundle: (resampled channel, type, scale)
    "time_s": ("time", "int32", 0.001),
    "speed_ms": ("SPEED", "int16", 0.01),
    "throttle_pct": ("THROTTLE", "int16", 0.1),
    "throttle_clean_pct": ("THROTTLE_NB", "int16", 0.1),
    "brake_pct": ("BRAKE", "int16", 0.1),
    "brake_clean_pct": ("BRAKE_FILLED", "int16", 0.1),
    "steering_deg": ("STEERANGLE", "int16", 0.1),
    "steering_norm": ("STEER_NORM", "int16", 0.0001),     # recorder: raw input −1…1
    "gear": ("GEAR", "int8", 1),
    "abs_pct": ("ABS_PCT", "int8", 1),                    # recorder: share of time with ABS working (%)
    "tc_pct": ("TC_PCT", "int8", 1),                      # recorder (0.1.3): share of time with TC working (%)
    "tc_level": ("TC_LEVEL", "int8", 1),                  # recorder (0.1.3): electronics settings
    "tc2_level": ("TC2_LEVEL", "int8", 1),
    "abs_level": ("ABS_LEVEL", "int8", 1),
    "engine_map": ("ENGINE_MAP", "int8", 1),
    "pos_x_m": ("POS_X", "int32", 0.01),                   # recorder: car position in game coordinates
    "pos_y_m": ("POS_Y", "int32", 0.01),
    "pos_z_m": ("POS_Z", "int32", 0.01),
}


def encode_channel(x: np.ndarray, dtype: str, scale: float) -> dict:
    q = np.round(np.asarray(x) / scale).astype(np.dtype(dtype).newbyteorder("<"))
    return {"dtype": dtype, "scale": scale, "data": base64.b64encode(q.tobytes()).decode("ascii")}


def decode_channel(ch: dict) -> np.ndarray:
    raw = base64.b64decode(ch["data"])
    return np.frombuffer(raw, dtype=np.dtype(ch["dtype"]).newbyteorder("<")) * ch["scale"]


def car_from_filename(ld_path: Path, track: str) -> str | None:
    """ACC names exports <track>-<car>-<n>-<date>-<time>.ld; the .ld itself often leaves
    vehicleid empty."""
    parts = ld_path.stem.split("-")
    return parts[1] if len(parts) >= 5 and parts[0] == track else None


def official_info(results: dict, car_id) -> dict:
    """What the server .json says about the session and the matched car."""
    line = next((x for x in results.get("sessionResult", {}).get("leaderBoardLines", [])
                 if x["car"]["carId"] == car_id), None)
    car = line["car"] if line else {}
    return {
        "session_file": results.get("SessionFile"),
        "session_type": results.get("sessionType"),
        "server_name": results.get("serverName"),
        "date": results.get("Date"),
        "car_id": car_id,
        "race_number": car.get("raceNumber"),
        "car_model": car.get("carModel"),
        "drivers": [{"first_name": d.get("firstName"), "last_name": d.get("lastName"),
                     "short_name": d.get("shortName"), "player_id": d.get("playerId")}
                    for d in car.get("drivers", [])],
    }


def build_bundle(source_path: str, head, laps: list, ref: float, cmap: dict,
                 results: dict | None = None, car_id=None) -> dict:
    source_path = Path(source_path)
    kind = getattr(head, "source_kind", "motec")
    corners = cn.scaled_corners(cmap, ref)
    out_laps = []
    for l in laps:
        entry = {
            "number": l.number,
            "lap_time_ms": round(l.lap_time * 1000),
            "official_lap_time_ms": None if l.official_time is None else round(l.official_time * 1000),
            "game_lap_time_ms": None if l.game_time is None else round(l.game_time * 1000),
            "game_valid": l.game_valid,
            "valid": l.valid,
            "comparable": l.comparable,
            "excluded_reasons": l.reasons(),
            "distance_m": round(l.distance, 1),
            "metrics": None, "corners": None, "trace": None,
        }
        if l.dist_ok:   # complete lap: metrics and traces are meaningful
            r = acc.resample_by_distance(l, ref, TRACE_STEP_M)
            entry["metrics"] = {k: round(v, 3) for k, v in acc.lap_metrics(r).items()}
            if getattr(l, "fuel_l", None) is not None:   # app 0.1.6+: the site corrects lap times for the fuel's weight
                entry["metrics"]["fuel_l"] = round(l.fuel_l, 1)
            entry["corners"] = cn.corner_metrics(r, corners)
            entry["trace"] = {"step_m": TRACE_STEP_M, "length": len(r["dist"]), "channels": {
                name: encode_channel(r[src], dtype, scale)
                for name, (src, dtype, scale) in TRACE_CHANNELS.items() if src in r}}
        out_laps.append(entry)

    return {
        "format": FORMAT,
        "version": VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "agent": AGENT,
        "simulator": "acc",
        "source": {"kind": kind, "file": source_path.name,
                   "sha256": hashlib.sha256(source_path.read_bytes()).hexdigest()},
        "session": {
            "track": head.venue,
            "track_length_m": ref,
            "car": head.vehicleid or car_from_filename(source_path, head.venue),
            "type": getattr(head, "session_type", None),
            "recorded_at": head.datetime.isoformat(),   # PC local time (MoTeC: ≈ end of the recording)
            "driver_name": head.driver or None,
            "conditions": getattr(head, "conditions", None),   # recorder only: temperatures, grip, rain, wind, time of day
            "official": official_info(results, car_id) if results and car_id is not None else None,
        },
        "corner_map": {**{k: cmap.get(k) for k in ("track", "version", "length_m", "corners")},
                       "provisional": bool(cmap.get("provisional")), "hash": cn.map_hash(cmap)},
        "laps": out_laps,
    }


def write_bundle(bundle: dict, path: str) -> Path:
    path = Path(path)
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, separators=(",", ":"))
    return path


def read_bundle(path: str) -> dict:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)
