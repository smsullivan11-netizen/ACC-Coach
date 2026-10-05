"""
ACC shared memory: page layouts and a read-only reader (Windows only).

While ACC runs, it publishes three memory pages that any app on the same PC can read:
- physics  (Local\\acpmf_physics):  player's car, updated every physics step (400 Hz since v1.8);
- graphics (Local\\acpmf_graphics): session/lap state and the position of every car, every frame;
- static   (Local\\acpmf_static):   track, car, driver name; set when a session starts.

Layouts follow Kunos' "ACC Shared Memory Documentation v1.8.12" (C structs packed on 4 bytes,
wchar_t = 2 bytes). Field names follow that document. The reader never creates the pages: it only
opens the ones ACC created, so nothing exists (and nothing is read) while the game is closed.
"""
import ctypes
import sys

import numpy as np

# --- Layouts (official field order) ---------------------------------------------
# (name, type, shape): type "i" = int32, "f" = float32, "w" = wchar_t string of `shape` characters

PHYSICS_FIELDS = [
    ("packetId", "i"), ("gas", "f"), ("brake", "f"), ("fuel", "f"), ("gear", "i"), ("rpm", "i"),
    ("steerAngle", "f"), ("speedKmh", "f"), ("velocity", "f", 3), ("accG", "f", 3),
    ("wheelSlip", "f", 4), ("wheelLoad", "f", 4), ("wheelPressure", "f", 4), ("wheelAngularSpeed", "f", 4),
    ("tyreWear", "f", 4), ("tyreDirtyLevel", "f", 4), ("tyreCoreTemp", "f", 4), ("camberRad", "f", 4),
    ("suspensionTravel", "f", 4), ("drs", "f"), ("tc", "f"), ("heading", "f"), ("pitch", "f"), ("roll", "f"),
    ("cgHeight", "f"), ("carDamage", "f", 5), ("numberOfTyresOut", "i"), ("pitLimiterOn", "i"), ("abs", "f"),
    ("kersCharge", "f"), ("kersInput", "f"), ("autoShifterOn", "i"), ("rideHeight", "f", 2),
    ("turboBoost", "f"), ("ballast", "f"), ("airDensity", "f"), ("airTemp", "f"), ("roadTemp", "f"),
    ("localAngularVel", "f", 3), ("finalFF", "f"), ("performanceMeter", "f"), ("engineBrake", "i"),
    ("ersRecoveryLevel", "i"), ("ersPowerLevel", "i"), ("ersHeatCharging", "i"), ("ersIsCharging", "i"),
    ("kersCurrentKJ", "f"), ("drsAvailable", "i"), ("drsEnabled", "i"), ("brakeTemp", "f", 4),
    ("clutch", "f"), ("tyreTempI", "f", 4), ("tyreTempM", "f", 4), ("tyreTempO", "f", 4),
    ("isAIControlled", "i"), ("tyreContactPoint", "f", (4, 3)), ("tyreContactNormal", "f", (4, 3)),
    ("tyreContactHeading", "f", (4, 3)), ("brakeBias", "f"), ("localVelocity", "f", 3),
    ("p2pActivations", "i"), ("p2pStatus", "i"), ("currentMaxRpm", "f"), ("mz", "f", 4), ("fx", "f", 4),
    ("fy", "f", 4), ("slipRatio", "f", 4), ("slipAngle", "f", 4), ("tcInAction", "i"), ("absInAction", "i"),
    ("suspensionDamage", "f", 4), ("tyreTemp", "f", 4), ("waterTemp", "f"), ("brakePressure", "f", 4),
    ("frontBrakeCompound", "i"), ("rearBrakeCompound", "i"), ("padLife", "f", 4), ("discLife", "f", 4),
    ("ignitionOn", "i"), ("starterEngineOn", "i"), ("isEngineRunning", "i"), ("kerbVibration", "f"),
    ("slipVibrations", "f"), ("gVibrations", "f"), ("absVibrations", "f"),
]

GRAPHICS_FIELDS = [
    ("packetId", "i"), ("status", "i"), ("session", "i"), ("currentTime", "w", 15), ("lastTime", "w", 15),
    ("bestTime", "w", 15), ("split", "w", 15), ("completedLaps", "i"), ("position", "i"),
    ("iCurrentTime", "i"), ("iLastTime", "i"), ("iBestTime", "i"), ("sessionTimeLeft", "f"),
    ("distanceTraveled", "f"), ("isInPit", "i"), ("currentSectorIndex", "i"), ("lastSectorTime", "i"),
    ("numberOfLaps", "i"), ("tyreCompound", "w", 33), ("replayTimeMultiplier", "f"),
    ("normalizedCarPosition", "f"), ("activeCars", "i"), ("carCoordinates", "f", (60, 3)), ("carID", "i", 60),
    ("playerCarID", "i"), ("penaltyTime", "f"), ("flag", "i"), ("penalty", "i"), ("idealLineOn", "i"),
    ("isInPitLane", "i"), ("surfaceGrip", "f"), ("mandatoryPitDone", "i"), ("windSpeed", "f"),
    ("windDirection", "f"), ("isSetupMenuVisible", "i"), ("mainDisplayIndex", "i"),
    ("secondaryDisplayIndex", "i"), ("tcLevel", "i"), ("tcCutLevel", "i"), ("engineMap", "i"),
    ("absLevel", "i"), ("fuelXLap", "f"), ("rainLights", "i"), ("flashingLights", "i"), ("lightsStage", "i"),
    ("exhaustTemperature", "f"), ("wiperLevel", "i"), ("driverStintTotalTimeLeft", "i"),
    ("driverStintTimeLeft", "i"), ("rainTyres", "i"), ("sessionIndex", "i"), ("usedFuel", "f"),
    ("deltaLapTime", "w", 15), ("iDeltaLapTime", "i"), ("estimatedLapTime", "w", 15),
    ("iEstimatedLapTime", "i"), ("isDeltaPositive", "i"), ("iSplit", "i"), ("isValidLap", "i"),
    ("fuelEstimatedLaps", "f"), ("trackStatus", "w", 33), ("missingMandatoryPits", "i"), ("clock", "f"),
    ("directionLightsLeft", "i"), ("directionLightsRight", "i"), ("globalYellow", "i"),
    ("globalYellow1", "i"), ("globalYellow2", "i"), ("globalYellow3", "i"), ("globalWhite", "i"),
    ("globalGreen", "i"), ("globalChequered", "i"), ("globalRed", "i"), ("mfdTyreSet", "i"),
    ("mfdFuelToAdd", "f"), ("mfdTyrePressureLF", "f"), ("mfdTyrePressureRF", "f"),
    ("mfdTyrePressureLR", "f"), ("mfdTyrePressureRR", "f"), ("trackGripStatus", "i"), ("rainIntensity", "i"),
    ("rainIntensityIn10min", "i"), ("rainIntensityIn30min", "i"), ("currentTyreSet", "i"),
    ("strategyTyreSet", "i"), ("gapAhead", "i"), ("gapBehind", "i"),
]

STATIC_FIELDS = [
    ("smVersion", "w", 15), ("acVersion", "w", 15), ("numberOfSessions", "i"), ("numCars", "i"),
    ("carModel", "w", 33), ("track", "w", 33), ("playerName", "w", 33), ("playerSurname", "w", 33),
    ("playerNick", "w", 33), ("sectorCount", "i"), ("maxTorque", "f"), ("maxPower", "f"), ("maxRpm", "i"),
    ("maxFuel", "f"), ("suspensionMaxTravel", "f", 4), ("tyreRadius", "f", 4), ("maxTurboBoost", "f"),
    ("deprecated1", "f"), ("deprecated2", "f"), ("penaltiesEnabled", "i"), ("aidFuelRate", "f"),
    ("aidTireRate", "f"), ("aidMechanicalDamage", "f"), ("aidAllowTyreBlankets", "f"), ("aidStability", "f"),
    ("aidAutoClutch", "i"), ("aidAutoBlip", "i"), ("hasDRS", "i"), ("hasERS", "i"), ("hasKERS", "i"),
    ("kersMaxJ", "f"), ("engineBrakeSettingsCount", "i"), ("ersPowerControllerCount", "i"),
    ("trackSplineLength", "f"), ("trackConfiguration", "w", 33), ("ersMaxJ", "f"), ("isTimedRace", "i"),
    ("hasExtraLap", "i"), ("carSkin", "w", 33), ("reversedGridPositions", "i"), ("pitWindowStart", "i"),
    ("pitWindowEnd", "i"), ("isOnline", "i"), ("dryTyresName", "w", 33), ("wetTyresName", "w", 33),
]

# Enums (official document)
STATUS = {0: "off", 1: "replay", 2: "live", 3: "pause"}
SESSION_TYPES = {-1: "unknown", 0: "practice", 1: "qualify", 2: "race", 3: "hotlap", 4: "time_attack",
                 5: "drift", 6: "drag", 7: "hotstint", 8: "hotstint_superpole"}
STATUS_OFF, STATUS_REPLAY, STATUS_LIVE, STATUS_PAUSE = 0, 1, 2, 3

# Lock-to-lock steering angle (°) per car (full left to full right), from Coach Dave Academy's
# "Correct steering locks and ratios in ACC" (checked by the team in game: Ford Mustang GT3 516°,
# McLaren 720S GT3 Evo 480°). steerAngle (−1…1) × lock / 2 = steering wheel angle. (Kunos's
# official Appendix 5 gives half these values, the angle to each side.) Cars missing here: steering
# stays normalised. Keep in sync with web/lib/steering.ts.
STEER_LOCK_DEG = {
    # GT3
    "amr_v12_vantage_gt3": 640, "amr_v8_vantage_gt3": 640, "audi_r8_lms": 720, "audi_r8_lms_evo": 720,
    "audi_r8_lms_evo_ii": 720, "bentley_continental_gt3_2016": 640, "bentley_continental_gt3_2018": 640,
    "bmw_m6_gt3": 565, "bmw_m4_gt3": 516, "jaguar_g3": 720, "ferrari_488_gt3": 480, "ferrari_488_gt3_evo": 480,
    "ferrari_296_gt3": 800, "ford_mustang_gt3": 516, "honda_nsx_gt3": 620, "honda_nsx_gt3_evo": 450,
    "lamborghini_huracan_gt3": 620, "lamborghini_huracan_gt3_evo": 620, "lamborghini_huracan_gt3_evo2": 620,
    "lamborghini_gallardo_rex": 720, "lexus_rc_f_gt3": 640, "mclaren_650s_gt3": 480, "mclaren_720s_gt3": 480,
    "mclaren_720s_gt3_evo": 480, "mercedes_amg_gt3": 640, "mercedes_amg_gt3_evo": 640,
    "nissan_gt_r_gt3_2017": 640, "nissan_gt_r_gt3_2018": 640, "porsche_991_gt3_r": 800,
    "porsche_991ii_gt3_r": 800, "porsche_992_gt3_r": 800,
    # GT4
    "alpine_a110_gt4": 720, "amr_v8_vantage_gt4": 640, "audi_r8_gt4": 720, "bmw_m4_gt4": 500,
    "chevrolet_camaro_gt4r": 720, "ginetta_g55_gt4": 720, "ktm_xbow_gt4": 580, "maserati_mc_gt4": 900,
    "mclaren_570s_gt4": 480, "mercedes_amg_gt4": 500, "porsche_718_cayman_gt4_mr": 800,
    # Single make and GT2
    "lamborghini_huracan_st": 620, "lamborghini_huracan_st_evo2": 620, "porsche_991ii_gt3_cup": 800,
    "porsche_992_gt3_cup": 540, "bmw_m2_cs_racing": 360, "ferrari_488_challenge_evo": 480,
    "audi_r8_lms_gt2": 720, "ktm_xbow_gt2": 582, "maserati_mc20_gt2": 480, "mercedes_amg_gt2": 492,
    "porsche_991ii_gt2_rs_cs_evo": 720, "porsche_935": 720,
}


def _ctypes_struct(name: str, fields: list) -> type:
    """C struct with #pragma pack(4), as in ACC's header: gives the exact offsets and size."""
    base = {"i": ctypes.c_int32, "f": ctypes.c_float, "w": ctypes.c_wchar if sys.platform == "win32"
            else ctypes.c_uint16}
    cfields = []
    for f in fields:
        t = base[f[1]]
        for n in reversed(np.atleast_1d(f[2]) if len(f) > 2 else []):
            t = t * int(n)
        cfields.append((f[0], t))
    return type(name, (ctypes.Structure,), {"_pack_": 4, "_fields_": cfields})


def _numpy_dtype(struct: type, fields: list) -> np.dtype:
    """Same layout as a numpy dtype, to decode thousands of records at once."""
    fmt = {"i": "<i4", "f": "<f4", "w": "<u2"}
    names, formats, offsets = [], [], []
    for f in fields:
        names.append(f[0])
        formats.append((fmt[f[1]], f[2]) if len(f) > 2 else fmt[f[1]])
        offsets.append(getattr(struct, f[0]).offset)
    return np.dtype({"names": names, "formats": formats, "offsets": offsets, "itemsize": ctypes.sizeof(struct)})


Physics = _ctypes_struct("Physics", PHYSICS_FIELDS)
Graphics = _ctypes_struct("Graphics", GRAPHICS_FIELDS)
Static = _ctypes_struct("Static", STATIC_FIELDS)

PAGES = {   # page -> (suffix of the shared memory name, ctypes struct, numpy dtype)
    "physics": ("physics", Physics, _numpy_dtype(Physics, PHYSICS_FIELDS)),
    "graphics": ("graphics", Graphics, _numpy_dtype(Graphics, GRAPHICS_FIELDS)),
    "static": ("static", Static, _numpy_dtype(Static, STATIC_FIELDS)),
}
DEFAULT_PREFIX = "Local\\acpmf_"


def text(chars) -> str:
    """wchar_t array (uint16 values) → str, up to the first NUL."""
    a = np.asarray(chars, dtype="<u2")
    end = np.flatnonzero(a == 0)
    return a[:end[0] if len(end) else len(a)].tobytes().decode("utf-16-le", errors="replace")


def decode(page: str, raw: bytes) -> np.void:
    """One page snapshot → numpy record (fields by name)."""
    return np.frombuffer(raw, dtype=PAGES[page][2], count=1)[0]


# --- Read-only access (Windows API) ----------------------------------------------

FILE_MAP_READ = 0x0004


class SharedMemory:
    """Read-only view of ACC's pages. open() returns False while the game is not running."""

    def __init__(self, prefix: str = DEFAULT_PREFIX):
        self.prefix = prefix
        self.views = {}     # page -> (handle, address, size)
        k = ctypes.WinDLL("kernel32", use_last_error=True)
        k.OpenFileMappingW.argtypes = [ctypes.c_uint32, ctypes.c_int, ctypes.c_wchar_p]
        k.OpenFileMappingW.restype = ctypes.c_void_p
        k.MapViewOfFile.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_uint32,
                                    ctypes.c_size_t]
        k.MapViewOfFile.restype = ctypes.c_void_p
        k.UnmapViewOfFile.argtypes = [ctypes.c_void_p]
        k.CloseHandle.argtypes = [ctypes.c_void_p]
        self._k = k

    def open(self) -> bool:
        if self.views:
            return True
        for page, (suffix, struct, _) in PAGES.items():
            handle = self._k.OpenFileMappingW(FILE_MAP_READ, False, self.prefix + suffix)
            if not handle:
                self.close()
                return False
            size = ctypes.sizeof(struct)
            addr = self._k.MapViewOfFile(handle, FILE_MAP_READ, 0, 0, size)
            if not addr:
                self._k.CloseHandle(handle)
                self.close()
                return False
            self.views[page] = (handle, addr, size)
        return True

    def close(self):
        for handle, addr, _ in self.views.values():
            self._k.UnmapViewOfFile(addr)
            self._k.CloseHandle(handle)
        self.views = {}

    def packet_id(self, page: str) -> int:
        return ctypes.c_int32.from_address(self.views[page][1]).value

    def snapshot(self, page: str, retries: int = 3) -> bytes:
        """Copy of a page. For physics/graphics, the copy is retried if the game wrote a new packet
        while we were copying (packetId changed), so fields never mix two different steps."""
        _, addr, size = self.views[page]
        for _ in range(retries):
            before = ctypes.c_int32.from_address(addr).value
            raw = ctypes.string_at(addr, size)
            if page == "static" or ctypes.c_int32.from_address(addr).value == before:
                return raw
        return raw

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
