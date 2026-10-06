"""Race engineer (agent/engineer.py, agent/engineer_server.py):
1. a full fake session replayed through the engineer: laps, fuel per lap, pressure advice, brakes;
2. live: fake ACC publishing in shared memory, the engineer's reader thread and its web page.
Nothing is written to the real %APPDATA%: settings are not saved.

python tests/test_engineer.py
"""
import json
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "agent"), str(ROOT), str(ROOT / "tests")]
import accrec  # noqa: E402
import fake_acc  # noqa: E402
from engineer import Engineer  # noqa: E402
from engineer_server import LiveEngineer  # noqa: E402

PF = ["fuel", "speedKmh", "wheelPressure", "tyreCoreTemp", "padLife", "discLife", "carDamage", "suspensionDamage"]
GF = ["isInPitLane", "completedLaps", "iLastTime", "isValidLap", "sessionTimeLeft", "fuelXLap", "iCurrentTime",
      "mfdTyrePressureLF", "mfdTyrePressureRF", "mfdTyrePressureLR", "mfdTyrePressureRR", "status"]


def replay(path: Path, track: str, car: str) -> Engineer:
    r = accrec.read_recording(str(path), physics_fields=PF, graphics_fields=GF)
    p, g = r.physics, r.graphics
    st = {"track": track, "carModel": car, "maxFuel": 120.0, "isTimedRace": 1}
    e = Engineer()
    for k in range(0, len(p["t_ns"]), 20):                       # 400 Hz → 20 Hz, like the live reader
        t = p["t_ns"][k]
        j = max(0, int(np.searchsorted(g["t_ns"], t)) - 1)
        if g["status"][j] == 2:
            e.feed(t / 1e9, {f: p[f][k] for f in PF}, {f: g[f][j] for f in GF}, st)
    return e


def main():
    out = Path(tempfile.mkdtemp())
    expect = fake_acc.write_session(out / "session.accrec")
    e = replay(out / "session.accrec", "fake_track", fake_acc.CAR)
    s = e.state()
    laps = s["laps"]
    print("laps", [(l["n"], round(l["time"], 3), round(l["fuel"], 3), l["valid"], l["pit"]) for l in laps])
    assert [round(l["time"] * 1000) for l in laps] == expect["lap_ms"], ("lap times = the game's", expect["lap_ms"])
    per_lap = expect["track_length"] / 2000                       # fake ACC burns 1 L per 2 km
    assert abs(s["fuel"]["per_lap"] - per_lap) < 0.05, (s["fuel"]["per_lap"], per_lap)
    assert s["fuel"]["laps_left"] and s["fuel"]["needed"] > 0, s["fuel"]
    assert s["pressure_ready"], "pressure advice after 10 km"
    fl, rr = s["tyres"][0], s["tyres"][3]
    assert abs(fl["lap_psi"] - 27.2) < 0.05 and abs(fl["advice"] - 25.2) < 0.06, fl     # 25.5 set, 0.3 psi too high
    assert abs(rr["lap_psi"] - 26.9) < 0.05 and abs(rr["change"]) < 0.06, rr            # on target
    assert s["brakes"][2]["pad_pct"] > s["brakes"][0]["pad_pct"] > 0, "rear pads wear faster in fake ACC"
    assert not s["damage"]["any"]
    print("replay: OK", json.dumps({k: s[k] for k in ("fuel", "wear", "stint")}, default=float)[:300])

    # Real recording (when present): numbers seen in the game
    real = ROOT / "recordings" / "20261004-001243_brands_hatch_ford_mustang_gt3_practice.accrec"
    if real.exists():
        r = replay(real, "brands_hatch", "ford_mustang_gt3").state()
        assert [round(l["time"], 3) for l in r["laps"][1:3]] == [85.87, 85.15], r["laps"]
        assert 2.0 < r["fuel"]["per_lap"] < 2.5 and 26.0 < r["tyres"][0]["lap_psi"] < 27.0, r["fuel"]
        print("real Brands Hatch recording: OK")

    # Live: fake ACC in shared memory, the reader thread and the web page
    prefix = "Local\\acceng_"
    game = subprocess.Popen([sys.executable, str(ROOT / "tests" / "fake_acc.py"), "--live", "--prefix", prefix],
                            stdout=subprocess.PIPE, text=True)
    live = LiveEngineer(ROOT / "agent" / "assets" / "engineer.html", {}, lambda s: None, prefix)
    stop = threading.Event()
    threading.Thread(target=live.run, args=(stop,), daemon=True).start()
    live.serve(shared=False)
    try:
        state, t0 = {}, time.time()
        while time.time() - t0 < 10 and not state.get("active"):
            time.sleep(0.5)
            state = json.load(urllib.request.urlopen(f"{live.url}/state"))
        assert state.get("active") and state["track"] == "fake_track", state
        assert state["fuel"]["current"] > 0 and state["tyres"][0]["live_psi"] > 24, state["tyres"][0]
        page = urllib.request.urlopen(live.url).read().decode()
        assert "Race engineer" in page
        print("live: OK", live.url)
    finally:
        stop.set()
        game.wait(timeout=30)
        live.server.shutdown()
    print("OK")


if __name__ == "__main__":
    main()
