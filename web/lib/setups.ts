// ACC setup files (Setups library, user's request 2026-10-08). Safe on server and client.
// The file ACC writes to Documents/Assetto Corsa Competizione/Setups/<car>/<track>/<name>.json (checked
// on 814 real files: every one has exactly carName, basicSetup, advancedSetup and trackBopType;
// trackBopType is a BoP group shared by several tracks, so the track is chosen at upload). The library
// stores the file as it is and gives it back; there is no viewer (dropped by the user: too inconsistent
// from car to car). Checks below only make sure an upload is an ACC setup.

export type SetupFile = {
  carName: string;
  basicSetup: {
    tyres: { tyreCompound: number; tyrePressure: number[] };
    alignment: { camber: number[]; toe: number[]; staticCamber?: number[]; casterLF: number; casterRF: number; steerRatio: number };
    electronics: { tC1: number; tC2: number; abs: number; eCUMap: number; fuelMix?: number; telemetryLaps?: number };
    strategy: {
      fuel: number; nPitStops: number; tyreSet: number; frontBrakePadCompound: number; rearBrakePadCompound: number; fuelPerLap?: number;
      pitStrategy?: { fuelToAdd: number; tyres: { tyreCompound: number; tyrePressure: number[] }; tyreSet: number; frontBrakePadCompound: number; rearBrakePadCompound: number }[];
    };
  };
  advancedSetup: {
    mechanicalBalance: {
      aRBFront: number; aRBRear: number; wheelRate: number[]; bumpStopRateUp: number[]; bumpStopRateDn: number[];
      bumpStopWindow: number[]; brakeTorque: number; brakeBias: number;
    };
    dampers: { bumpSlow: number[]; bumpFast: number[]; reboundSlow: number[]; reboundFast: number[] };
    aeroBalance: { rideHeight: number[]; splitter: number; rearWing: number; brakeDuct: number[] };
    drivetrain: { preload: number };
  };
  trackBopType?: number;
};

export const KINDS = [
  { value: "qualifying", label: "Qualifying" },
  { value: "race", label: "Race" },
  { value: "wet", label: "Wet" },
  { value: "other", label: "Other" },
] as const;
export type Kind = (typeof KINDS)[number]["value"];

/** Guesses the kind from a file name ("… Q01", "qualy", "R02", "wet", "rain"): race otherwise unknown. */
export function guessKind(name: string): Kind {
  const n = ` ${name.toLowerCase().replace(/[_\-.]+/g, " ")} `;
  if (/\b(wet|rain|w\d+)\b/.test(n)) return "wet";
  if (/\b(q|qualy|quali|qualifying|hotlap|esport q)\d*\b/.test(n) || /\bq\d+\b/.test(n)) return "qualifying";
  if (/\b(r|race|endurance|sprint)\d*\b/.test(n) || /\br\d+\b/.test(n)) return "race";
  return "other";
}

const nums = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every((x) => typeof x === "number" && Number.isFinite(x));
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Checks that a parsed file looks like an ACC setup; returns the reason it does not, else null. */
export function setupProblem(d: unknown): string | null {
  const f = d as Partial<SetupFile> | null;
  if (!f || typeof f !== "object") return "not a setup file";
  if (typeof f.carName !== "string" || !f.carName) return "no carName: not an ACC setup";
  const b = f.basicSetup, a = f.advancedSetup;
  if (!b || !a) return "no basicSetup / advancedSetup: not an ACC setup";
  if (!nums(b.tyres?.tyrePressure, 4)) return "tyre pressures missing";
  if (!nums(b.alignment?.camber, 4) || !nums(b.alignment?.toe, 4)) return "alignment missing";
  if (!num(b.electronics?.tC1) || !num(b.electronics?.abs)) return "electronics missing";
  if (!num(b.strategy?.fuel)) return "strategy missing";
  const m = a.mechanicalBalance;
  if (!m || !num(m.aRBFront) || !num(m.brakeBias) || !nums(m.wheelRate, 4)) return "mechanical balance missing";
  const dm = a.dampers;
  if (!dm || !nums(dm.bumpSlow, 4) || !nums(dm.reboundFast, 4)) return "dampers missing";
  if (!a.aeroBalance || !nums(a.aeroBalance.rideHeight, 4) || !num(a.aeroBalance.rearWing)) return "aero missing";
  return null;
}
