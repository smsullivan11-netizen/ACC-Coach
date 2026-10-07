"""
ACC's own log (%LOCALAPPDATA%\\AC2\\Saved\\Logs\\AC2.log, older runs AC2-backup-<date>.log): the server a
session was driven on and the balance of performance the server gave the player's car. The shared
memory has neither (its `ballast` field is documented as unused).

When the game loads a session it writes, in this order (checked in real logs, 2026-10-07):
  LogKsPhysics: Connecting to server '<name>' with track <track>          (online only)
  LogKsPhysics: Step: LoadingsessionPage Native Start
  LogKsPhysics: Setting CarId 1001 additional BoP: -22 kg, 0.190000 restrictor   (only with a BoP)
  LogKsRacing: <surname> try to possess Car 1001 (Player 1, NetCar 0)
Line times are UTC. Read only; nothing found (no log, game on another PC) = None.
"""
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

LOGS_DIR = Path(os.environ.get("ACC_LOG_DIR")                   # tests: a folder of made-up logs
                or Path(os.environ.get("LOCALAPPDATA", Path.home())) / "AC2" / "Saved" / "Logs")

STAMP = re.compile(rb"^\[(\d{4})\.(\d\d)\.(\d\d)-(\d\d)\.(\d\d)\.(\d\d):(\d{3})\]")
CONNECT = re.compile(rb"Connecting to server '(.*)' with track (\S+)")
LOAD = b"Step: LoadingsessionPage Native Start"
BOP = re.compile(rb"Setting CarId (\d+) additional BoP: (-?[\d.]+) kg, (-?[\d.]+) restrictor")
POSSESS = re.compile(rb"try to possess Car (\d+)")
CONNECT_BEFORE_LOAD_S = 10          # the server line comes ~0.1 s before the load starts


def server_text(raw: bytes) -> str:
    """The log writes each UTF-8 byte of the server's name as its own character (U+FF80-U+FFFF, the
    byte sign-extended), and emoji as UTF-16 surrogates: undo both. '🏎️ PCGroup Racing ┃ …'."""
    s = raw.decode("utf-8", "replace")
    b = bytearray()
    for ch in s:
        o = ord(ch)
        b.extend([o & 0xFF] if 0xFF80 <= o <= 0xFFFF else ch.encode("utf-8"))
    text = bytes(b).decode("utf-8", "surrogatepass")
    return text.encode("utf-16-le", "surrogatepass").decode("utf-16-le", "replace").strip()


def _stamp(line: bytes) -> datetime | None:
    m = STAMP.match(line)
    if not m:
        return None
    y, mo, d, h, mi, s, ms = (int(x) for x in m.groups())
    return datetime(y, mo, d, h, mi, s, ms * 1000, tzinfo=timezone.utc)


def _loads(path: Path) -> list[dict]:
    """Every session load in one log file: {at, server, track, car_ids: {id: (kg, restrictor)}, car}."""
    loads, last_connect = [], None
    try:
        data = path.read_bytes()
    except OSError:
        return loads
    for line in data.splitlines():
        if b"LogKs" not in line:
            continue
        if b"Connecting to server" in line:
            m = CONNECT.search(line)
            if m and (at := _stamp(line)):
                last_connect = (at, server_text(m.group(1)), m.group(2).decode("ascii", "replace"))
        elif LOAD in line:
            at = _stamp(line)
            if at is None:
                continue
            online = last_connect and timedelta(0) <= at - last_connect[0] <= timedelta(seconds=CONNECT_BEFORE_LOAD_S)
            loads.append({"at": at, "server": last_connect[1] if online else None,
                          "track": last_connect[2] if online else None, "bop": {}, "car": None})
            last_connect = None
        elif loads and b"additional BoP" in line:
            m = BOP.search(line)
            if m:
                loads[-1]["bop"][int(m.group(1))] = (float(m.group(2)), float(m.group(3)))
        elif loads and loads[-1]["car"] is None and b"try to possess" in line:
            m = POSSESS.search(line)
            if m:
                loads[-1]["car"] = int(m.group(1))
    return loads


def session_server(started_at: datetime, logs_dir: Path | None = None) -> dict | None:
    """The server and BoP of the session that was running at `started_at` (an aware datetime, or
    naive UTC): {server_name, ballast_kg, restrictor_pct}, values None when the log does not say.
    None when no session load before that moment is found."""
    logs_dir = Path(logs_dir or LOGS_DIR)
    at = started_at if started_at.tzinfo else started_at.replace(tzinfo=timezone.utc)
    try:
        # Logs still written after the session started (the game's current one, or a backup of a
        # later-closed run); older ones cannot hold it
        files = [p for p in logs_dir.glob("AC2*.log") if p.stat().st_mtime >= at.timestamp() - 60]
    except OSError:
        return None
    best = None
    for path in files:
        for load in _loads(path):
            if load["at"] <= at + timedelta(seconds=2) and (best is None or load["at"] > best["at"]):
                best = load
    if best is None:
        return None
    bop = best["bop"].get(best["car"]) if best["car"] in best["bop"] else (
        next(iter(best["bop"].values())) if len(best["bop"]) == 1 else None)
    return {
        "server_name": best["server"],
        "ballast_kg": bop[0] if bop else None,
        # The log gives the restrictor as a fraction (0.19 = 19 %)
        "restrictor_pct": round(bop[1] * 100, 1) if bop else None,
    }
