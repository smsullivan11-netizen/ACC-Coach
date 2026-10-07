"""
Test of acc_log.py on made-up ACC logs (the lines copied from real ones, 2026-10-07): offline and
online session loads, the BoP of the player's car among several, the server name as the log mangles
it (each UTF-8 byte as its own character, emoji as surrogates), and a session in a rotated log.

Usage: python tests/test_acc_log.py
"""
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import acc_log

TEAM = "🏎️ PCGroup Racing ┃ Practice & Trackday ┃ Pcgroup"
LFM = "lowfuelmotorsport.com | Caseking Prime Series | Practice 1 EU | S23W12 | Brands Hatch Circuit #LFMPREU"


def mangle(name: str) -> str:
    """What ACC writes: CESU-8 bytes (emoji as two surrogates), every byte ≥ 0x80 sign-extended."""
    cesu = "".join(c if ord(c) < 0x10000 else
                   "".join(chr(u) for u in (0xD800 + ((ord(c) - 0x10000) >> 10), 0xDC00 + ((ord(c) - 0x10000) & 0x3FF)))
                   for c in name).encode("utf-8", "surrogatepass")
    return "".join(chr(b) if b < 0x80 else chr(0xFF00 | b) for b in cesu)


def line(t: str, text: str) -> str:
    return f"[2026.10.03-{t}][443]{text}\r\n"


def main():
    folder = Path(tempfile.mkdtemp())
    os.environ["ACC_LOG_DIR"] = str(folder)
    old = (line("12.00.00:000", "LogKsPhysics: Step: LoadingsessionPage Native Start")      # offline
           + line("12.00.02:000", "LogKsRacing: Lekaj try to possess Car 0 (Player 1, NetCar 0)"))
    (folder / "AC2-backup-2026.10.03-12.30.00.log").write_bytes("﻿Log file open\r\n".encode() + old.encode())
    current = (
        line("15.28.16:014", f"LogKsPhysics: Connecting to server '{mangle(LFM)}' with track brands_hatch")
        + line("15.28.16:052", "LogKsPhysics: Step: LoadingsessionPage Native Start")
        + line("15.28.17:300", "LogKsPhysics: Setting CarId 1004 additional BoP: 15 kg, 0.000000 restrictor")
        + line("15.28.17:388", "LogKsPhysics: Setting CarId 1001 additional BoP: -16 kg, 0.190000 restrictor")
        + line("15.28.17:388", "LogKsRacing: Lekaj try to possess Car 1001 (Player 1, NetCar 0)")
        + line("19.40.50:728", f"LogKsPhysics: Connecting to server '{mangle(TEAM)}' with track nurburgring_24h")
        + line("19.40.50:806", "LogKsPhysics: Step: LoadingsessionPage Native Start")
        + line("19.40.59:543", "LogKsRacing: Lekaj try to possess Car 1001 (Player 1, NetCar 0)")
        + line("22.11.48:834", "LogKsPhysics: Step: LoadingsessionPage Native Start")          # offline again
    )
    (folder / "AC2.log").write_bytes(current.encode("utf-8"))
    acc_log.LOGS_DIR = folder

    at = lambda t: datetime.fromisoformat(f"2026-10-03T{t}+00:00")
    checks = {
        "offline session in a rotated log": (acc_log.session_server(at("12:05:00")),
                                             {"server_name": None, "ballast_kg": None, "restrictor_pct": None}),
        "LFM server, the player's car's BoP": (acc_log.session_server(at("15:30:00")),
                                               {"server_name": LFM, "ballast_kg": -16.0, "restrictor_pct": 19.0}),
        "team server, name decoded, no BoP": (acc_log.session_server(at("19:41:30")),
                                              {"server_name": TEAM, "ballast_kg": None, "restrictor_pct": None}),
        "offline after online": (acc_log.session_server(at("22:30:00")),
                                 {"server_name": None, "ballast_kg": None, "restrictor_pct": None}),
        "naive time = UTC": (acc_log.session_server(datetime(2026, 10, 3, 15, 30)),
                             {"server_name": LFM, "ballast_kg": -16.0, "restrictor_pct": 19.0}),
        "before any load": (acc_log.session_server(at("11:00:00")), None),
        "no log folder": (acc_log.session_server(at("15:30:00"), folder / "missing"), None),
    }
    failed = 0
    for name, (got, want) in checks.items():
        ok = got == want
        failed += not ok
        print(f"{'OK  ' if ok else 'FAIL'} {name}" + ("" if ok else f": {got!r} != {want!r}"))
    # Files whose last write is long before the session cannot hold it: skipped without reading
    stale = folder / "AC2-backup-2026.10.01-10.00.00.log"
    stale.write_bytes(line("09.00.00:000", "LogKsPhysics: Step: LoadingsessionPage Native Start").encode())
    os.utime(stale, (datetime(2026, 10, 1, tzinfo=timezone.utc).timestamp(),) * 2)
    got = acc_log.session_server(at("09:30:00"))
    print(f"{'OK  ' if got is None else 'FAIL'} older logs skipped")
    failed += got is not None
    if failed:
        raise SystemExit(f"{failed} check(s) failed")
    print("All checks passed")


if __name__ == "__main__":
    main()
