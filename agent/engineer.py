"""Live race engineer: reads ACC's shared memory (~20 Hz) while the recorder records, and keeps a
state for the local engineer page (engineer_server.py): fuel calculator, tyre pressure advice,
tyre wear, brake wear and damage. Pure logic: `feed()` takes decoded pages, so a recording can be
replayed through it (tests).

ACC does not publish tyre wear (tyreWear stays 0, checked on a real recording): tyre wear is
derived from its effect, the fuel-corrected lap time trend over the stint, as a percentage of a
"worn" loss (settings). Brake pads and discs are published in mm (padLife / discLife): their wear
is exact.
"""
import math
import statistics
from dataclasses import dataclass, field

# Fuel weight per track (s lost per lap for 10 kg, measured in ACC by OhneSpeed) and minimum-fuel
# reference (litres) — same values as web/lib/fuel.ts
FUEL_KG_PER_L = 0.72
S_PER_10KG = {
    "imola": 0.175, "monza": 0.15, "brands_hatch": 0.125, "barcelona": 0.15, "paul_ricard": 0.175, "spa": 0.2,
    "cota": 0.2, "donington": 0.125, "hungaroring": 0.175, "indianapolis": 0.175, "kyalami": 0.16,
    "laguna_seca": 0.125, "misano": 0.15, "mount_panorama": 0.18, "nurburgring_24h": 0.78, "nurburgring": 0.15,
    "red_bull_ring": 0.15, "oulton_park": 0.15, "valencia": 0.175, "silverstone": 0.2, "snetterton": 0.175,
    "suzuka": 0.18, "watkins_glen": 0.175, "zandvoort": 0.15, "zolder": 0.15,
}
REF_L = {k: 8 for k in ("brands_hatch", "zolder", "misano", "donington", "oulton_park", "laguna_seca", "zandvoort",
                        "red_bull_ring", "hungaroring", "valencia", "kyalami", "imola", "barcelona", "indianapolis",
                        "snetterton")}
REF_L.update({k: 10 for k in ("spa", "monza", "silverstone", "suzuka", "cota", "paul_ricard", "mount_panorama",
                              "nurburgring", "watkins_glen")}, nurburgring_24h=15)


def fuel_seconds(track: str, fuel_l: float) -> float:
    per_kg = S_PER_10KG.get(track.lower(), 0.16) / 10
    return per_kg * FUEL_KG_PER_L * max(0.0, fuel_l - REF_L.get(track.lower(), 10))


DEFAULT_SETTINGS = {
    "target_psi": 26.9,        # hot pressure aimed at, all four tyres (team's choice)
    "advice_min_km": 15.0,     # running in the stint before pressure advice (team: 15 km; ACC Drive: 20 km)
    "tyre_worn_pct": 2.8,      # 100 % tyre wear = this much slower per lap than on fresh tyres (team: ~3 s at Spa)
    "pad_worn_mm": 10.0,       # pads at risk below this (ACC dev: red dot in the HUD under 10 mm) = 90 % worn
    "fuel_margin_laps": 1.0,   # extra fuel on top of what the race needs
    "duct_psi_per_click": 0.2, # hot pressure change per brake duct click (opening lowers it; small since ACC 1.8)
}
# Temperature windows (ACC 1.8+ guides: Coach Dave, The Pit Crew, Trinacria; checked against the real
# Brands Hatch recording: front brake peaks 580-650 °C, rear 460-530 °C, tyre cores 70-92 °C)
TYRE_CORE_C = (70, 75, 90, 100)          # cold < 70 ≤ warming < 75 ≤ optimal ≤ 90 < warm ≤ 100 < overheating
BRAKE_PEAK_C = {"front": (450, 700), "rear": (300, 500)}   # lap peak: below = too cold, above = overheating
WHEELS = ("FL", "FR", "RL", "RR")
DAMAGE_ZONES = ("front", "rear", "left", "right", "centre")
SESSION_TYPES = {-1: "unknown", 0: "practice", 1: "qualify", 2: "race", 3: "hotlap", 4: "time_attack"}
MIN_FLYING = 4                  # laps in a stint before a tyre wear trend
ATM_PSI, KELVIN = 14.7, 273.15


@dataclass
class Lap:
    number: int
    time_s: float
    fuel_used: float
    fuel_avg: float
    valid: bool
    pit: bool
    km: float
    pressure: list            # average hot pressure per wheel while moving (psi)
    core: list = None         # average tyre core temperature per wheel while moving (°C)
    brake_avg: list = None    # average brake temperature per wheel while moving (°C)
    brake_peak: list = None   # hottest brake temperature per wheel over the lap (°C)
    corrected_s: float = 0.0  # lap time without the cost of the fuel above minimum fuel


@dataclass
class Stint:
    laps: list = field(default_factory=list)
    km: float = 0.0
    # Pressure reference: average hot pressure and core temperature of the first lap completed past
    # advice_min_km (tyres warm, no air lost yet). With the gas law (absolute pressure ∝ absolute
    # temperature) it gives the pressure each tyre should have at any temperature: less = air lost
    # (kerbs, contact). Reset at each pit exit (new tyres).
    ref_p: list = None
    ref_t: list = None


def expected_psi(ref_p: float, ref_t: float, core_t: float) -> float:
    return (ref_p + ATM_PSI) * (core_t + KELVIN) / (ref_t + KELVIN) - ATM_PSI


def theil_sen(xs, ys) -> float:
    slopes = [(ys[j] - ys[i]) / (xs[j] - xs[i]) for i in range(len(xs)) for j in range(i + 1, len(xs)) if xs[j] != xs[i]]
    return statistics.median(slopes) if slopes else 0.0


class Engineer:
    def __init__(self, settings: dict | None = None):
        self.settings = {**DEFAULT_SETTINGS, **(settings or {})}
        self.reset()

    def reset(self):
        self.track = self.car = ""
        self.max_fuel = 0.0
        self.laps: list[Lap] = []
        self.stint = Stint()
        self.stints = 0
        self.completed = None
        self.t = None
        self._lap = None          # running sums for the lap in progress
        self.live = {}
        self.pad_new = [0.0] * 4
        self.disc_new = [0.0] * 4
        self.in_pit = False
        self.prev_cur = None
        self.closed_at = None

    def _new_lap(self, fuel: float):
        self._lap = {"fuel0": fuel, "fuel_sum": 0.0, "n": 0, "valid": True, "pit": False, "km": 0.0,
                     "p_sum": [0.0] * 4, "c_sum": [0.0] * 4, "p_t": 0.0, "b_sum": [0.0] * 4, "b_max": [0.0] * 4}

    # --- input --------------------------------------------------------------------------------

    def feed(self, t: float, p, g, st):
        """One sample: t in seconds, p / g / st = decoded physics / graphics / static records."""
        if not any(float(x) for x in p["padLife"]):
            return                                # garage or loading: ACC zeroes the car's data
        track, car = _text(st["track"]), _text(st["carModel"])
        if (track, car) != (self.track, self.car):
            self.reset()
            self.track, self.car = track, car
        self.max_fuel = float(st["maxFuel"])
        dt = 0.0 if self.t is None else max(0.0, min(1.0, t - self.t))
        self.t = t
        fuel, speed = float(p["fuel"]), float(p["speedKmh"])
        pressures = [float(x) for x in p["wheelPressure"]]
        in_pit = bool(g["isInPitLane"])
        completed = int(g["completedLaps"])

        # Pads and discs: a jump up = new parts fitted (pit stop)
        for i in range(4):
            pad, disc = float(p["padLife"][i]), float(p["discLife"][i])
            if pad > self.pad_new[i] + 0.5 or self.pad_new[i] == 0:
                self.pad_new[i] = pad
            if disc > self.disc_new[i] + 0.5 or self.disc_new[i] == 0:
                self.disc_new[i] = disc

        # Stint: a new one when leaving the pit lane (tyres and fuel changed)
        if self.in_pit and not in_pit:
            self.stint = Stint()
            self.stints += 1
        self.in_pit = in_pit

        if self._lap is None:
            self._new_lap(fuel)
        lap = self._lap
        km = speed * dt / 3600
        lap["km"] += km
        self.stint.km += km
        lap["fuel_sum"] += fuel
        lap["n"] += 1
        lap["valid"] &= bool(g["isValidLap"])
        lap["pit"] |= in_pit
        if speed > 50:                            # pressures settle at speed, not in the pit lane
            for i in range(4):
                lap["p_sum"][i] += pressures[i] * dt
                lap["c_sum"][i] += float(p["tyreCoreTemp"][i]) * dt
                lap["b_sum"][i] += float(p["brakeTemp"][i]) * dt
            lap["p_t"] += dt
        for i in range(4):
            lap["b_max"][i] = max(lap["b_max"][i], float(p["brakeTemp"][i]))

        # Lap end = the lap timer resets (hotlap mode does not count invalid laps in completedLaps).
        # Time = the timer just before the reset; corrected to the game's iLastTime when completedLaps
        # confirms the lap within 2 s
        cur = int(g["iCurrentTime"])
        if self.prev_cur is not None and cur < self.prev_cur - 5000:
            self._close_lap(len(self.laps) + 1, (self.prev_cur + dt * 1000) / 1000, fuel)
            self.closed_at = t
        if (self.completed is not None and completed == self.completed + 1 and int(g["iLastTime"]) > 0
                and self.laps and self.closed_at is not None and t - self.closed_at < 2):
            self.laps[-1].time_s = int(g["iLastTime"]) / 1000
            self.laps[-1].corrected_s = self.laps[-1].time_s - fuel_seconds(self.track, self.laps[-1].fuel_avg)
        self.completed = completed
        self.prev_cur = cur

        self.live = {
            "fuel": fuel, "speed": speed, "pressures": pressures, "in_pit": in_pit,
            "core_temps": [float(x) for x in p["tyreCoreTemp"]], "brake_temps": [float(x) for x in p["brakeTemp"]],
            "pad_compound": [int(p["frontBrakeCompound"]) + 1, int(p["rearBrakeCompound"]) + 1],
            "pads": [float(x) for x in p["padLife"]], "discs": [float(x) for x in p["discLife"]],
            "damage": [float(x) for x in p["carDamage"]], "suspension": [float(x) for x in p["suspensionDamage"]],
            "mfd_pressures": [float(g[f"mfdTyrePressure{w}"]) for w in ("LF", "RF", "LR", "RR")],
            "time_left": float(g["sessionTimeLeft"]) / 1000, "timed": bool(st["isTimedRace"]),
            "session": SESSION_TYPES.get(int(g["session"]), "unknown"),
            "game_fuel_per_lap": float(g["fuelXLap"]), "current_lap_s": int(g["iCurrentTime"]) / 1000,
        }

    def _close_lap(self, number: int, time_s: float, fuel_end: float):
        lap = self._lap
        used = lap["fuel0"] - fuel_end
        pressure = [s / lap["p_t"] for s in lap["p_sum"]] if lap["p_t"] > 10 else None
        core = [s / lap["p_t"] for s in lap["c_sum"]] if lap["p_t"] > 10 else None
        brake_avg = [s / lap["p_t"] for s in lap["b_sum"]] if lap["p_t"] > 10 else None
        out = Lap(number, time_s, used, lap["fuel_sum"] / max(1, lap["n"]), lap["valid"],
                  lap["pit"] or used < 0, lap["km"], pressure, core, brake_avg,
                  list(lap["b_max"]) if any(lap["b_max"]) else None)
        if (self.stint.ref_p is None and pressure and not out.pit
                and self.stint.km >= self.settings["advice_min_km"]):
            self.stint.ref_p, self.stint.ref_t = pressure, core
        out.corrected_s = time_s - fuel_seconds(self.track, out.fuel_avg)
        self.laps.append(out)
        self.stint.laps.append(out)
        self._new_lap(fuel_end)

    # --- output -------------------------------------------------------------------------------

    def state(self) -> dict:
        s, live = self.settings, self.live
        if not live:
            return {"active": False}
        flying = [l for l in self.laps if not l.pit and l.fuel_used > 0]
        recent = flying[-3:]
        fpl = statistics.mean(l.fuel_used for l in recent) if recent else (live["game_fuel_per_lap"] or None)
        lap_s = statistics.mean(l.time_s for l in recent) if recent else None

        fuel = {"current": live["fuel"], "per_lap": fpl, "avg_lap_s": lap_s, "measured_laps": len(recent),
                "laps_in_tank": live["fuel"] / fpl if fpl else None,
                "max_stint_laps": self.max_fuel / fpl if fpl and self.max_fuel else None,
                "time_left": live["time_left"]}
        if fpl and lap_s and live["timed"] and live["time_left"] > 0:
            # Timed race: the race ends with the lap in progress when the clock runs out, plus one
            laps_left = math.ceil(max(0.0, live["time_left"] - (lap_s - live["current_lap_s"])) / lap_s) + 1
            needed = (laps_left + s["fuel_margin_laps"]) * fpl
            to_add = max(0.0, needed - live["fuel"])
            fuel.update(laps_left=laps_left, needed=needed, to_add=min(to_add, max(0.0, self.max_fuel - live["fuel"]) if self.max_fuel else to_add),
                        stops=math.ceil(to_add / (self.max_fuel - fpl)) if self.max_fuel > fpl and to_add > 0 else 0)

        # Pressure advice and pressure loss. Once the stint has its reference (first lap past
        # advice_min_km), each lap's pressure "without loss" = what the gas law gives at that lap's
        # core temperature; loss = that − the measured pressure. The advice uses the pressure without
        # loss: it follows temperature changes (track cooling…) but air lost on kerbs does not push
        # it up at the end of a stint.
        st_ = self.stint
        last = next((l for l in reversed(st_.laps) if l.pressure and l.core and not l.pit), None)
        ready = st_.ref_p is not None and last is not None
        tyres = []
        for i, w in enumerate(WHEELS):
            hot = last.pressure[i] if last else None
            loss = delta = None
            if ready:
                clean = expected_psi(st_.ref_p[i], st_.ref_t[i], last.core[i])
                loss = max(0.0, clean - hot)
                delta = s["target_psi"] - (hot + loss)
            tyres.append({"wheel": w, "live_psi": live["pressures"][i], "lap_psi": hot, "core_c": live["core_temps"][i],
                          "loss": loss, "change": delta, "set": live["mfd_pressures"][i],
                          "advice": round((live["mfd_pressures"][i] + delta) * 10) / 10 if delta is not None else None})

        # Tyre wear: fuel-corrected lap time trend over the stint's flying laps (out-lap and first
        # flying lap left out: tyres still coming in)
        stint_flying = [l for l in self.stint.laps if not l.pit and l.valid][1:]
        wear = {"laps": len(stint_flying), "per_lap_s": None, "lost_s": None, "pct": None}
        if len(stint_flying) >= MIN_FLYING:
            xs = [l.number for l in stint_flying]
            slope = max(0.0, theil_sen(xs, [l.corrected_s for l in stint_flying]))
            base = min(l.corrected_s for l in stint_flying[:3])
            lost = slope * (xs[-1] - xs[0])
            wear.update(per_lap_s=slope, lost_s=lost, pct=min(150.0, 100 * lost / (base * s["tyre_worn_pct"] / 100)))

        # Brakes: pads in mm and %: new = 0 %, the risk thickness (10 mm, ACC's red dot) = 90 %;
        # wear per lap over the stint, laps left until the risk thickness
        pads = []
        laps_done = max(1, len(self.stint.laps))
        for i, w in enumerate(WHEELS):
            used = max(0.0, self.pad_new[i] - live["pads"][i])
            usable = max(0.1, self.pad_new[i] - s["pad_worn_mm"])
            pads.append({"wheel": w, "pad_mm": live["pads"][i], "disc_mm": live["discs"][i],
                         "pad_pct": min(100.0, 90 * used / usable), "at_risk": live["pads"][i] < s["pad_worn_mm"],
                         "per_lap_mm": used / laps_done if self.stint.laps else None,
                         "laps_left": (live["pads"][i] - s["pad_worn_mm"]) / (used / laps_done) if self.stint.laps and used > 0 else None})

        temps = self._temperatures(s, live)

        return {
            "active": True, "track": self.track, "session": live["session"], "timed": live["timed"],
            "temps": temps, "car": self.car, "settings": s,
            "stint": {"number": self.stints + 1, "laps": len(self.stint.laps), "km": self.stint.km, "in_pit": live["in_pit"]},
            "fuel": fuel, "tyres": tyres, "pressure_ready": ready, "wear": wear, "brakes": pads,
            "damage": {"zones": dict(zip(DAMAGE_ZONES, live["damage"])), "suspension": dict(zip(WHEELS, live["suspension"])),
                       "any": any(x > 0 for x in live["damage"] + live["suspension"])},
            "laps": [{"n": l.number, "time": l.time_s, "fuel": l.fuel_used, "valid": l.valid, "pit": l.pit} for l in self.laps[-12:]],
        }

    def _temperatures(self, s: dict, live: dict) -> dict:
        """Tyre core and brake temperatures (live and last lap), and brake duct advice per axle from
        the brake peaks of the last 3 laps, with the cold pressure change that keeps the hot pressures."""
        last = next((l for l in reversed(self.laps) if not l.pit and l.core and l.brake_peak), None)
        lo, warm, hi, over = TYRE_CORE_C

        def tyre_state(c):
            return None if c is None else "cold" if c < lo else "warming" if c < warm else "optimal" if c <= hi else "warm" if c <= over else "hot"

        tyres = [{"wheel": w, "live": live["core_temps"][i], "lap_avg": last.core[i] if last else None,
                  "state": tyre_state(last.core[i] if last else live["core_temps"][i])} for i, w in enumerate(WHEELS)]
        brakes, ducts = [], {}
        for axle, idx in (("front", (0, 1)), ("rear", (2, 3))):
            cold, hot = BRAKE_PEAK_C[axle]
            for i in idx:
                peak = last.brake_peak[i] if last else None
                brakes.append({"wheel": WHEELS[i], "live": live["brake_temps"][i], "lap_peak": peak,
                               "lap_avg": last.brake_avg[i] if last else None,
                               "state": None if peak is None else "cold" if peak < cold else "hot" if peak > hot else "optimal"})
            # axle peak: median over the last 3 laps (one lap with a late braking does not flip the advice)
            recent = [l for l in self.laps if not l.pit and l.brake_peak][-3:]
            peak = statistics.median(max(l.brake_peak[i] for i in idx) for l in recent) if recent else None
            clicks = 0
            if peak is not None and peak > hot:
                clicks = 1 if peak <= hot + 75 else 2          # open: more cooling
            elif peak is not None and peak < cold:
                clicks = -1                                    # close: brakes (and tyres) warmer
            ducts[axle] = {"peak": peak, "window": [cold, hot], "clicks": clicks,
                           # opening lowers the hot pressures: add the same amount cold to keep them
                           "psi": round(clicks * s["duct_psi_per_click"], 2),
                           "pads": live["pad_compound"][0 if axle == "front" else 1]}
        return {"tyres": tyres, "brakes": brakes, "ducts": ducts, "window_tyre": [lo, warm, hi, over]}


def _text(chars) -> str:
    if isinstance(chars, str):
        return chars
    import acc_shm as shm
    return shm.text(chars)
