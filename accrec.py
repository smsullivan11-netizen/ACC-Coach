"""
.accrec recording format (v2): raw ACC shared memory pages, as written by recorder.py.

File layout:
  magic b"ACCREC\\x00\\x01"
  u32 header length + header (UTF-8 JSON): format, version, created_at, page sizes, session info
  u32 static length + static page (raw bytes)
  chunks until the end of the file, each: u32 compressed length + zlib data, which decompresses to
    u32 n_physics, u32 n_graphics,
    n_physics records (i64 t_ns + physics page), then n_graphics records (i64 t_ns + graphics page)
  t_ns: recorder clock (perf_counter_ns) relative to the start of the file.
  v2 stores each block of records column-wise (byte k of every record, then byte k + 1…): similar
  values sit together and the file is ~35 % smaller than v1 (records one after the other).

Raw pages are kept on purpose: if a field turns out to be decoded wrongly, past recordings can be
re-read with a corrected layout. A truncated last chunk (crash, power cut) is ignored.
"""
import json
import queue
import struct
import threading
import zlib
from dataclasses import dataclass
from pathlib import Path

import numpy as np

import acc_shm as shm

MAGIC = b"ACCREC\x00\x01"
FORMAT, VERSION = "accrec", 2
READABLE_VERSIONS = (1, 2)
LAYOUT = "acc-shm-1.8.12"

# Fields extracted by default when reading (the full pages stay in the file)
PHYSICS_DEFAULT = ["packetId", "gas", "brake", "clutch", "gear", "rpm", "steerAngle", "speedKmh", "velocity",
                   "accG", "heading", "pitch", "roll", "localVelocity", "localAngularVel", "tyreContactPoint",
                   "abs", "absInAction", "tc", "tcInAction", "numberOfTyresOut", "wheelSlip", "fuel"]
GRAPHICS_DEFAULT = ["packetId", "status", "session", "completedLaps", "position", "iCurrentTime", "iLastTime",
                    "iBestTime", "distanceTraveled", "isInPit", "isInPitLane", "isValidLap", "currentSectorIndex",
                    "sessionIndex", "normalizedCarPosition", "activeCars", "playerCarID", "flag", "penalty"]
PLAYER_COORDINATES = "playerCoordinates"   # derived: carCoordinates of the player's car only


def _record_dtype(page: str) -> np.dtype:
    return np.dtype([("t_ns", "<i8"), ("page", shm.PAGES[page][2])])


class Writer:
    """Appends records in memory and writes them as compressed chunks from a background thread,
    so compression never delays the polling loop."""

    def __init__(self, path, static_raw: bytes, info: dict, level: int = 6):
        self.path = Path(path)
        self.level = level
        self.counts = {"physics": 0, "graphics": 0}
        self.bytes_written = 0
        self._pending = {"physics": [], "graphics": []}
        self._queue = queue.Queue()
        self._file = open(self.path, "wb")
        header = {"format": FORMAT, "version": VERSION, "layout": LAYOUT,
                  "page_sizes": {p: s[2].itemsize for p, s in shm.PAGES.items()}, **info}
        h = json.dumps(header, ensure_ascii=False).encode("utf-8")
        self._file.write(MAGIC + struct.pack("<I", len(h)) + h + struct.pack("<I", len(static_raw)) + static_raw)
        self._file.flush()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def add(self, page: str, t_ns: int, raw: bytes):
        self._pending[page].append(struct.pack("<q", t_ns) + raw)
        self.counts[page] += 1

    def flush(self):
        p, g = self._pending["physics"], self._pending["graphics"]
        if p or g:
            self._queue.put((p, g))
            self._pending = {"physics": [], "graphics": []}

    def _run(self):
        while (item := self._queue.get()) is not None:
            p, g = item
            cols = [np.frombuffer(b"".join(recs), np.uint8).reshape(len(recs), -1).T.tobytes() if recs else b""
                    for recs in (p, g)]
            data = zlib.compress(struct.pack("<II", len(p), len(g)) + cols[0] + cols[1], self.level)
            self._file.write(struct.pack("<I", len(data)) + data)
            self._file.flush()
            self.bytes_written += 4 + len(data)

    def close(self):
        self.flush()
        self._queue.put(None)
        self._thread.join()
        self._file.close()


@dataclass
class Recording:
    header: dict
    static: np.void          # decoded static page
    physics: dict            # field -> array (one row per physics packet), plus "t_ns"
    graphics: dict           # field -> array (one row per graphics frame), plus "t_ns"
    truncated: bool          # last chunk incomplete (recorder killed)

    def static_text(self, field: str) -> str:
        return shm.text(self.static[field])


def _records(block: bytes, offset: int, n: int, dtype: np.dtype, columnwise: bool) -> np.ndarray:
    if not columnwise:
        return np.frombuffer(block, dtype, n, offset=offset)
    cols = np.frombuffer(block, np.uint8, n * dtype.itemsize, offset=offset).reshape(dtype.itemsize, n)
    return np.ascontiguousarray(cols.T).view(dtype).ravel()


def _extract(block: np.ndarray, fields: list) -> dict:
    out = {"t_ns": block["t_ns"].copy()}
    pages = block["page"]
    for f in fields:
        if f == PLAYER_COORDINATES:
            ids, player = pages["carID"], pages["playerCarID"]
            idx = np.argmax(ids == player[:, None], axis=1)        # slot of the player's car
            found = (ids == player[:, None]).any(axis=1)
            coords = pages["carCoordinates"][np.arange(len(pages)), idx]
            coords[~found] = np.nan
            out[f] = coords
        else:
            out[f] = pages[f].copy()
    return out


def read_recording(path, physics_fields: list | None = None, graphics_fields: list | None = None) -> Recording:
    """Reads a recording. Only the requested fields are kept in memory (an hour at 400 Hz is
    ~1.4 million physics records), but every field of the layout can be requested."""
    pf = physics_fields or PHYSICS_DEFAULT
    gf = graphics_fields or GRAPHICS_DEFAULT + [PLAYER_COORDINATES]
    dp, dg = _record_dtype("physics"), _record_dtype("graphics")
    parts = {"physics": [], "graphics": []}
    truncated = False
    with open(path, "rb") as f:
        if f.read(len(MAGIC)) != MAGIC:
            raise ValueError(f"{path}: not an .accrec file")
        (n,) = struct.unpack("<I", f.read(4))
        header = json.loads(f.read(n).decode("utf-8"))
        if header.get("version") not in READABLE_VERSIONS:
            raise ValueError(f"{path}: unsupported .accrec version {header.get('version')}")
        columnwise = header["version"] >= 2
        (n,) = struct.unpack("<I", f.read(4))
        static = shm.decode("static", f.read(n))
        while len(size := f.read(4)) == 4:
            (n,) = struct.unpack("<I", size)
            data = f.read(n)
            try:
                block = zlib.decompress(data)
            except zlib.error:
                truncated = True
                break
            n_p, n_g = struct.unpack_from("<II", block)
            p = _records(block, 8, n_p, dp, columnwise)
            g = _records(block, 8 + n_p * dp.itemsize, n_g, dg, columnwise)
            parts["physics"].append(_extract(p, pf))
            parts["graphics"].append(_extract(g, gf))
        truncated = truncated or len(size) not in (0, 4)

    def merge(chunks, fields):
        keys = ["t_ns"] + fields
        if not chunks:
            return {k: np.array([]) for k in keys}
        return {k: np.concatenate([c[k] for c in chunks]) for k in keys}

    return Recording(header, static, merge(parts["physics"], pf), merge(parts["graphics"], gf), truncated)
