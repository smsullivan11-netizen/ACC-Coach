"""
Fake ACC: simulates a car on a 2.8 km track and produces the three shared memory pages, to test
the recorder and the recording pipeline without the game.

Two ways to use it:
- live: publishes the pages in shared memory in real time (400 Hz physics, 120 Hz graphics),
  like the game does:  python tests/fake_acc.py --live --prefix Local\\acctest_
- offline: write_session() writes a full session straight into an .accrec file (no waiting).

Coordinates are written like ACC's: x and z horizontal, y up, in metres.
"""
import argparse
import ctypes
import json
import mmap
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import acc_shm as shm
import accrec

PHYSICS_HZ, GRAPHICS_HZ = 400, 120
A_LAT, A_ACC, A_BRAKE, V_MAX, V_PIT = 15.0, 6.0, 14.0, 70.0, 22.0
PIT_IN_M, PIT_OUT_M = 300.0, 200.0        # pit lane: from L − 300 m to 200 m after the line
PLAYER_SLOT, PLAYER_ID = 3, 1003          # carID[3] == playerCarID
CAR = "bmw_m4_gt3"                         # has a known steering lock (270°)


class Track:
    """Closed curve, its curvature and a grip/brake/acceleration-limited speed profile (1 m grid)."""

    def __init__(self):
        u = np.linspace(0, 2 * np.pi, 200001)
        x = 500 * np.cos(u) + 100 * np.cos(3 * u)
        z = 280 * np.sin(u) + 60 * np.sin(2 * u)
        s = np.concatenate([[0], np.cumsum(np.hypot(np.diff(x), np.diff(z)))])
        self.length = s[-1]
        self.s = np.arange(0, self.length, 1.0)
        x, z = np.interp(self.s, s, x), np.interp(self.s, s, z)
        dx, dz = np.gradient(x), np.gradient(z)
        ddx, ddz = np.gradient(dx), np.gradient(dz)
        k = (dx * ddz - dz * ddx) / (dx * dx + dz * dz) ** 1.5
        k = np.convolve(np.pad(k, 10, mode="wrap"), np.ones(21) / 21, "same")[10:-10]
        v = np.minimum(V_MAX, np.sqrt(A_LAT / np.maximum(np.abs(k), 1e-6)))
        n = len(v)
        for _ in range(2):   # periodic forward (acceleration) and backward (braking) passes
            for i in range(1, 2 * n):
                v[i % n] = min(v[i % n], np.sqrt(v[(i - 1) % n] ** 2 + 2 * A_ACC))
            for i in range(2 * n - 2, -1, -1):
                v[i % n] = min(v[i % n], np.sqrt(v[(i + 1) % n] ** 2 + 2 * A_BRAKE))
        # Start/finish line in the middle of the fastest straight, as on real circuits
        i0 = int(np.argmax(np.convolve(np.pad(v, 100, mode="wrap"), np.ones(201), "same")[100:-100]))
        self.x, self.z, self.k, self.v = (np.roll(a, -i0) for a in (x, z, k, v))
        self.y = 4 * np.sin(2 * np.pi * self.s / self.length) + 2 * np.sin(6 * np.pi * self.s / self.length)
        self.heading = np.unwrap(np.arctan2(np.gradient(self.z), np.gradient(self.x)))

    def at(self, s: float, table):
        return np.interp(s % self.length, self.s, table, period=self.length)


class Car:
    """Car following the profile, with a per-lap pace factor and racing line offset.
    mode: "box" (stopped in the pits), "pit_out", "racing", "pit_in", "rolling" (racing from the start)."""

    def __init__(self, track: Track, mode: str = "box", lap_factors=(1.0,), invalid_laps=(), in_lap=None):
        self.t = track
        self.mode = mode
        self.s = track.length - PIT_IN_M if mode == "box" else 0.0     # distance since the session start
        self.v = 0.0 if mode == "box" else track.at(0, track.v)
        self.completed = 0
        self.lap_factors, self.invalid_laps, self.in_lap = lap_factors, set(invalid_laps), in_lap
        self.lap_start, self.last_lap_ms, self.best_ms = 0.0, 0, 0
        self.valid = 1
        self.box_time = 0.0
        self.done = False
        self.distance = 0.0
        self.a = 0.0
        self.time = 0.0
        self.flat_out = False

    @property
    def pos(self) -> float:          # position on the lap (m from the line)
        return self.s % self.t.length

    def in_pit_lane(self) -> bool:
        return self.mode in ("box", "pit_out", "pit_in")

    def step(self, dt: float):
        tr = self.t
        if self.mode == "box":
            self.box_time += dt
            target = 0.0
            if self.box_time > 3.0 and not self.done:
                self.mode = "pit_out"
        elif self.mode == "pit_out":
            target = V_PIT
            if self.completed >= 1 and self.pos >= PIT_OUT_M:
                self.mode = "racing"
        elif self.mode == "pit_in":
            target = V_PIT if not (self.completed > self.in_lap and self.pos >= 150) else 0.0
            if target == 0.0 and self.v < 0.1:
                self.mode, self.done, self.box_time = "box", True, 0.0
        else:
            f = self.lap_factors[min(self.completed, len(self.lap_factors)) - 1] if self.completed else 1.0
            target = tr.at(self.s, tr.v) * f
            self.flat_out = target >= V_MAX * f - 0.01          # at top speed: full throttle
            if self.in_lap is not None and self.completed == self.in_lap and self.pos >= tr.length - PIT_IN_M:
                self.mode = "pit_in"
        dv = np.clip(target - self.v, -A_BRAKE * dt, A_ACC * dt)
        self.a = dv / dt
        before = self.pos
        self.v = max(0.0, self.v + dv)
        self.s += self.v * dt
        self.distance += self.v * dt
        self.time += dt
        if self.v > 0 and self.pos < before:     # line crossed
            lap_ms = round((self.time - self.lap_start) * 1000)
            if self.completed >= 1:
                self.last_lap_ms = lap_ms
                if self.valid and (not self.best_ms or lap_ms < self.best_ms):
                    self.best_ms = lap_ms
            self.completed += 1
            self.lap_start, self.valid = self.time, 1
        if self.completed in self.invalid_laps and self.pos > tr.length / 2:
            self.valid = 0                                   # track limits exceeded mid-lap

    def position(self):
        tr = self.t
        lap = max(self.completed, 1)
        offset = (0.6 + 0.3 * lap) * np.sin(2 * np.pi * self.pos / 350)       # line differs per lap
        hd = tr.at(self.s, tr.heading)
        x = tr.at(self.s, tr.x) - offset * np.sin(hd)
        z = tr.at(self.s, tr.z) + offset * np.cos(hd)
        return x, tr.at(self.s, tr.y), z, hd


class Pages:
    """Fills the three ctypes structs from the car state."""

    def __init__(self, car: Car, session: int = 0, session_index: int = 0):
        self.car = car
        self.p, self.g, self.st = shm.Physics(), shm.Graphics(), shm.Static()
        self.p_id = self.g_id = 0
        self.session, self.session_index = session, session_index
        st = self.st
        st.smVersion, st.acVersion, st.track, st.carModel = "1.9", "1.10.2", "fake_track", CAR
        st.playerName, st.playerSurname, st.playerNick = "Test", "Driver", "TDR"
        st.numberOfSessions, st.numCars, st.sectorCount, st.maxRpm, st.isOnline = 1, 5, 3, 7000, 0
        st.dryTyresName, st.wetTyresName = "DHF", "WH"
        st.maxFuel, st.isTimedRace = 120.0, 1

    def physics(self) -> bytes:
        c, p = self.car, self.p
        self.p_id += 1
        x, y, z, hd = c.position()
        gear = int(np.clip(1 + c.v // 12, 1, 6))
        p.packetId = self.p_id
        p.gas = 1.0 if c.a > 0.5 or (c.flat_out and c.a > -0.5) else (0.3 if c.v > 1 and c.a > -0.5 else 0.0)
        p.brake = float(np.clip(-c.a / A_BRAKE, 0, 1)) if c.a < -0.5 else 0.0
        p.gear = gear + 1                                   # ACC: 0 = R, 1 = N, 2 = 1st
        p.rpm = max(1000, int(c.v / (12 * gear) * 7000))   # each gear tops out at 7000 rpm
        p.steerAngle = float(np.clip(c.t.at(c.s, c.t.k) * 30, -1, 1)) if c.v > 0 else 0.0
        p.speedKmh = c.v * 3.6
        p.velocity[:] = (c.v * np.cos(hd), 0.0, c.v * np.sin(hd))
        p.heading = hd
        p.fuel = 50.0 - c.distance / 2000
        # Race engineer fields: pads and discs wear with distance, pressures and core temperatures
        # build up over the first 8 km (front-left a bit hotter)
        warm = min(1.0, c.distance / 8000)
        p.padLife[:] = [29.0 - c.distance / (40000 if w < 2 else 30000) for w in range(4)]
        p.discLife[:] = [32.0 - c.distance / 250000] * 4
        p.wheelPressure[:] = [24.6 + (2.6 if w == 0 else 2.3) * warm for w in range(4)]
        p.tyreCoreTemp[:] = [70.0 + 18.0 * warm] * 4
        for w, (lon, lat) in enumerate(((1.3, -0.8), (1.3, 0.8), (-1.3, -0.8), (-1.3, 0.8))):
            p.tyreContactPoint[w][:] = (x + lon * np.cos(hd) - lat * np.sin(hd), y,
                                        z + lon * np.sin(hd) + lat * np.cos(hd))
        p.abs = float(p.brake > 0.9)                # like ACC: the float flag, absInAction stays 0
        p.absVibrations = float(self.p_id)          # copy of packetId at the very end: detects torn reads
        return bytes(p)

    def graphics(self, status: int) -> bytes:
        c, g = self.car, self.g
        self.g_id += 1
        x, y, z, _ = c.position()
        g.packetId, g.status, g.session, g.sessionIndex = self.g_id, status, self.session, self.session_index
        g.completedLaps = g.numberOfLaps = c.completed
        g.iCurrentTime = round((c.time - c.lap_start) * 1000)
        g.iLastTime, g.iBestTime = c.last_lap_ms, c.best_ms
        g.normalizedCarPosition = c.pos / c.t.length
        g.distanceTraveled = c.distance
        g.isInPitLane = int(c.in_pit_lane())
        g.isInPit = int(c.mode == "box")
        g.isValidLap = c.valid
        g.currentSectorIndex = int(3 * c.pos / c.t.length)
        g.sessionTimeLeft, g.fuelXLap = max(0.0, 3600_000 - c.time * 1000), 1.5
        g.mfdTyrePressureLF = g.mfdTyrePressureRF = g.mfdTyrePressureLR = g.mfdTyrePressureRR = 25.5
        g.activeCars, g.playerCarID = 5, PLAYER_ID
        for i in range(5):                       # player in slot 3, other cars elsewhere on track
            g.carID[i] = 1000 + i
            s_other = (c.s + 400 * (i + 1)) % c.t.length
            g.carCoordinates[i][:] = (c.t.at(s_other, c.t.x), c.t.at(s_other, c.t.y), c.t.at(s_other, c.t.z))
        g.carCoordinates[PLAYER_SLOT][:] = (x, y, z)
        return bytes(g)


def events(phases, car: Car, pages: Pages):
    """(time s, page, bytes) in time order. Each phase: dict(status, seconds or None = until the
    car's script ends, session, index). The car only moves while the status is live."""
    t = 0.0
    dt_p, dt_g = 1 / PHYSICS_HZ, 1 / GRAPHICS_HZ
    next_g = 0.0
    yield t, "static", bytes(pages.st)
    for ph in phases:
        pages.session, pages.session_index = ph.get("session", 0), ph.get("index", 0)
        end = t + ph["seconds"] if ph["seconds"] is not None else float("inf")
        while t < end and not (ph["seconds"] is None and car.done and car.box_time > 2.0):
            t += dt_p
            if ph["status"] == shm.STATUS_LIVE:
                car.step(dt_p)
                yield t, "physics", pages.physics()
            if t >= next_g:
                next_g += dt_g
                yield t, "graphics", pages.graphics(ph["status"])


SESSION = [{"status": shm.STATUS_LIVE, "seconds": None}]
LAP_FACTORS = (1.0, 0.98, 1.01, 1.0, 0.99)    # L1 out-lap … L5 in-lap; L3 fastest but invalid


def write_session(path, lap_factors=LAP_FACTORS, invalid_laps=(3,), drop_every=997, seed=0) -> dict:
    """Full offline session (pit start, out-lap, flying laps, in-lap) straight into an .accrec file.
    Timestamps get polling jitter and one physics packet in `drop_every` is dropped, like a recorder
    that missed some. Returns what the converter should find."""
    track = Track()
    car = Car(track, "box", lap_factors, invalid_laps, in_lap=len(lap_factors))
    pages = Pages(car)
    rng = np.random.default_rng(seed)
    w = None
    crossings, lap_ms = [], []
    last_completed = 0
    for t, page, raw in events(SESSION, car, pages):
        if page == "static":
            w = accrec.Writer(path, raw, {"session": {"track": "fake_track", "car": CAR, "type": "practice"}})
            continue
        if page == "physics" and pages.p_id % drop_every == 0:
            continue
        if car.completed != last_completed:
            crossings.append(car.lap_start)
            lap_ms.append(car.last_lap_ms)
            last_completed = car.completed
        w.add(page, int((t + rng.uniform(0, 0.0008)) * 1e9), raw)
        if pages.p_id % 400 == 0:
            w.flush()
    w.close()
    return {"track_length": track.length, "crossings": crossings, "lap_ms": lap_ms[1:],
            "lap_factors": lap_factors, "invalid_laps": invalid_laps, "car": CAR}


LIVE_SCENARIO = [   # menu, practice, pause, practice, qualifying, menu
    {"status": shm.STATUS_OFF, "seconds": 1.0},
    {"status": shm.STATUS_LIVE, "seconds": 5.0, "session": 0, "index": 0},
    {"status": shm.STATUS_PAUSE, "seconds": 1.0, "session": 0, "index": 0},
    {"status": shm.STATUS_LIVE, "seconds": 2.0, "session": 0, "index": 0},
    {"status": shm.STATUS_LIVE, "seconds": 2.5, "session": 1, "index": 1},
    {"status": shm.STATUS_OFF, "seconds": 1.0},
]


def run_live(prefix: str, scenario=LIVE_SCENARIO) -> dict:
    """Publishes the pages in shared memory in real time. Returns per-session packet counts."""
    track = Track()
    car = Car(track, "rolling")
    pages = Pages(car)
    maps = {page: mmap.mmap(-1, ctypes.sizeof(spec[1]), tagname=prefix + spec[0])
            for page, spec in shm.PAGES.items()}
    sessions = {}
    t0 = time.perf_counter()
    late = 0
    for t, page, raw in events(scenario, car, pages):
        while (rem := t0 + t - time.perf_counter()) > 0.0008:
            time.sleep(0.0003)
        while time.perf_counter() < t0 + t:
            pass
        if time.perf_counter() - (t0 + t) > 0.002:
            late += 1
        maps[page][:len(raw)] = raw
        if page == "physics":
            key = f"{pages.session}/{pages.session_index}"
            sessions.setdefault(key, {"first": pages.p_id, "last": pages.p_id})["last"] = pages.p_id
    time.sleep(0.5)
    for m in maps.values():
        m.close()
    return {"sessions": sessions, "late_writes": late, "physics_total": pages.p_id}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--prefix", default="Local\\acctest_")
    a = ap.parse_args()
    if a.live:
        print(json.dumps(run_live(a.prefix)), flush=True)
