"""
Live test of the recorder against the fake ACC (real time, about 15 s).

The fake publishes pages in shared memory under a test prefix (never ACC's own names) following
a scenario: menu, practice, pause, practice, qualifying, menu. The recorder records it; then the
files are checked: one file per session, nothing from the menu, pause frames kept, no physics
packet torn (fields from two different steps), and the share of missed packets.

Usage: python tests/test_recorder.py
"""
import json
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import acc_shm as shm
import accrec
import recorder

PREFIX = "Local\\acctest_"


def main():
    out = Path(tempfile.mkdtemp())
    fake = subprocess.Popen([sys.executable, str(ROOT / "tests" / "fake_acc.py"), "--live", "--prefix", PREFIX],
                            stdout=subprocess.PIPE, text=True)
    rec = recorder.Recorder(out, PREFIX, log=lambda *a, **k: None)
    stop = threading.Event()
    thread = threading.Thread(target=rec.run, args=(stop,))
    cpu0, wall0 = time.process_time(), time.perf_counter()
    thread.start()
    stdout, _ = fake.communicate(timeout=120)
    time.sleep(1.0)
    stop.set()
    thread.join()
    cpu = (time.process_time() - cpu0) / (time.perf_counter() - wall0)
    fake_info = json.loads(stdout.strip().splitlines()[-1])
    print(f"Fake: {fake_info['physics_total']} physics packets, {fake_info['late_writes']} written >2 ms late")

    files = sorted(out.glob("*.accrec"))
    print("Files:", [f.name for f in files])
    assert len(files) == 2, "one file per session (practice, then qualifying)"
    assert "practice" in files[0].name and "qualify" in files[1].name

    pids = []
    for f, s in zip(files, rec.files):
        r = accrec.read_recording(f, ["packetId", "absVibrations", "speedKmh"],
                                  ["packetId", "status", "session", "sessionIndex"])
        pid = r.physics["packetId"]
        torn = int(np.sum(r.physics["absVibrations"] != pid))
        dt = np.diff(r.physics["t_ns"]) / 1e6
        status = set(np.unique(r.graphics["status"]).tolist())
        print(f"  {f.name}: {len(pid)} physics packets, median interval {np.median(dt):.2f} ms, "
              f"{len(r.graphics['t_ns'])} graphics frames, statuses {sorted(shm.STATUS[x] for x in status)}, "
              f"torn {torn}, recorder counted {s['missed']} missed, {f.stat().st_size / 1e3:.0f} KB")
        assert torn == 0, "torn reads"
        assert status <= {shm.STATUS_LIVE, shm.STATUS_PAUSE}, "menu frames recorded"
        assert r.header["session"]["player"] == "Test Driver" and r.static_text("track") == "fake_track"
        pids.append(pid)
    r = accrec.read_recording(files[0], ["packetId"], ["status"])
    assert shm.STATUS_PAUSE in r.graphics["status"], "pause frames kept in the practice file"

    # Both files together must hold every packet published from the start of the recording
    sessions = fake_info["sessions"]
    allp = np.concatenate(pids)
    assert np.all(np.diff(allp) > 0), "packets out of order or duplicated"
    lag = allp[0] - sessions["0/0"]["first"]
    total_expected = sessions["1/1"]["last"] - allp[0] + 1
    total_missed = total_expected - len(allp)
    at_switch = pids[1][0] - pids[0][-1] - 1
    print(f"Start lag {lag} packets; {at_switch} lost at the session switch")
    assert lag <= 10, "recording started late"
    assert total_missed == sum(s["missed"] for s in rec.files) + at_switch, "recorder's missed count is wrong"

    rate = 100 * total_missed / total_expected
    seconds = sum(s["seconds"] for s in rec.files)
    mb_per_hour = sum(f.stat().st_size for f in files) / seconds * 3600 / 1e6
    print(f"Missed {total_missed}/{total_expected} physics packets ({rate:.2f} %); recorder CPU ≈ {cpu:.0%} "
          f"of one core; ≈ {mb_per_hour:.0f} MB per hour")
    assert rate < 1.0, "too many missed packets"
    print("OK")


if __name__ == "__main__":
    main()
