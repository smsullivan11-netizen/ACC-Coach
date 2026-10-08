// ACC setup files (Setups library, user's request 2026-10-08). Safe on server and client.
// The file ACC writes to Documents\Assetto Corsa Competizione\Setups\<car>\<track>\<name>.json (checked
// on 814 real files: every one has exactly carName, basicSetup, advancedSetup and trackBopType;
// trackBopType is a BoP group shared by several tracks, so the track is chosen at upload). Values are
// the game's "clicks" (indexes), 0-based: the viewer shows them as the game's menus do.

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

// --- What the viewer shows -----------------------------------------------------------------

export type Cell =
  | { kind: "single"; label: string; value: string; hint?: string }
  | { kind: "axles"; label: string; front: string; rear: string; frontLabel?: string; rearLabel?: string; hint?: string }
  | { kind: "wheels"; label: string; values: string[]; hint?: string }          // FL FR RL RR
  | { kind: "pair"; label: string; values: [string, string]; labels: [string, string]; hint?: string };
export type Tab = { key: string; label: string; cells: Cell[]; extra?: { title: string; cells: Cell[] }[] };

const psi = (click: number) => (20.3 + 0.1 * click).toFixed(1);
const deg = (v: number) => `${v.toFixed(2)}°`;
const clicks = (v: number) => String(v);
const litres = (v: number) => `${Math.round(v * 10) / 10} L`;
const pad = (v: number) => `Pad ${v + 1}`;
const compound = (v: number) => (v === 1 ? "Wet" : "Dry");

/** The setup as the game's six setup tabs lay it out (Tyres, Electronics, Fuel & Strategy, Mechanical
 *  Grip, Dampers, Aero). Tolerant: a field missing from an older file is left out. */
export function setupTabs(f: SetupFile): Tab[] {
  const b = f.basicSetup, a = f.advancedSetup, al = b.alignment, st = b.strategy, mb = a.mechanicalBalance, ae = a.aeroBalance;
  const cells = (list: (Cell | null)[]) => list.filter((c): c is Cell => c != null);
  const w = (label: string, v: number[] | undefined, fmt: (x: number) => string, hint?: string): Cell | null =>
    v && v.length === 4 ? { kind: "wheels", label, values: v.map(fmt), hint } : null;
  const s = (label: string, v: number | undefined, fmt: (x: number) => string = clicks, hint?: string): Cell | null =>
    v == null ? null : { kind: "single", label, value: fmt(v), hint };

  const tyres = cells([
    s("Compound", b.tyres.tyreCompound, compound),
    w("Tyre pressures (cold, psi)", b.tyres.tyrePressure, psi, "The game's range starts at 20.3 psi in 0.1 psi clicks"),
    w("Camber (clicks)", al.camber, clicks, "Clicks as in the game's menu (the degrees depend on ride height and the rest of the setup)"),
    w("Toe (clicks)", al.toe, clicks),
    { kind: "pair", label: "Caster (clicks)", values: [clicks(al.casterLF), clicks(al.casterRF)], labels: ["Left", "Right"] },
    s("Steering ratio", al.steerRatio),
  ]);
  const el = b.electronics;
  const electronics = cells([
    s("Traction control", el.tC1), s("TC cut (TC2)", el.tC2), s("ABS", el.abs),
    s("ECU map", el.eCUMap, (v) => `Map ${v + 1}`), s("Fuel mix", el.fuelMix), s("Telemetry laps", el.telemetryLaps),
  ]);
  const strategy: Tab = {
    key: "strategy", label: "Fuel & Strategy",
    cells: cells([
      s("Fuel", st.fuel, litres), s("Pit stops", st.nPitStops), s("Tyre set", st.tyreSet, (v) => String(v + 1)),
      { kind: "axles", label: "Brake pads", front: pad(st.frontBrakePadCompound), rear: pad(st.rearBrakePadCompound) },
      s("Fuel per lap (measured)", st.fuelPerLap, (v) => `${v.toFixed(2)} L`),
    ]),
    extra: (st.pitStrategy ?? []).slice(0, Math.max(st.nPitStops, 0)).map((p, i) => ({
      title: `Pit stop ${i + 1}`,
      cells: cells([
        s("Fuel to add", p.fuelToAdd, litres), s("Compound", p.tyres.tyreCompound, compound), s("Tyre set", p.tyreSet, (v) => String(v + 1)),
        w("Tyre pressures (cold, psi)", p.tyres.tyrePressure, psi),
        { kind: "axles", label: "Brake pads", front: pad(p.frontBrakePadCompound), rear: pad(p.rearBrakePadCompound) },
      ]),
    })),
  };
  const mechanical = cells([
    { kind: "axles", label: "Anti-roll bar", front: clicks(mb.aRBFront), rear: clicks(mb.aRBRear) },
    w("Wheel rate (springs)", mb.wheelRate, clicks),
    w("Bump stop rate (up)", mb.bumpStopRateUp, clicks),
    w("Bump stop rate (down)", mb.bumpStopRateDn, clicks),
    w("Bump stop range", mb.bumpStopWindow, clicks),
    s("Brake power", mb.brakeTorque, clicks, "Clicks, as in the game's menu"),
    s("Brake bias", mb.brakeBias, (v) => (v > 0 ? `+${v}` : String(v)), "Clicks from the car's default"),
    s("Preload (diff)", a.drivetrain?.preload),
  ]);
  const d = a.dampers;
  const dampers = cells([
    w("Bump (slow)", d.bumpSlow, clicks), w("Bump (fast)", d.bumpFast, clicks),
    w("Rebound (slow)", d.reboundSlow, clicks), w("Rebound (fast)", d.reboundFast, clicks),
  ]);
  const aero = cells([
    w("Ride height", ae.rideHeight, clicks, "Clicks above the minimum, as in the game's menu"),
    s("Splitter", ae.splitter), s("Rear wing", ae.rearWing),
    ae.brakeDuct?.length === 2
      ? { kind: "pair", label: "Brake ducts", values: [clicks(ae.brakeDuct[0]), clicks(ae.brakeDuct[1])], labels: ["Front", "Rear"] }
      : null,
  ]);
  return [
    { key: "tyres", label: "Tyres", cells: tyres },
    { key: "electronics", label: "Electronics", cells: electronics },
    strategy,
    { key: "mechanical", label: "Mechanical Grip", cells: mechanical },
    { key: "dampers", label: "Dampers", cells: dampers },
    { key: "aero", label: "Aero", cells: aero },
  ];
}

/** The numbers a setup list shows at a glance. */
export function setupSummary(f: SetupFile) {
  const p = f.basicSetup.tyres.tyrePressure;
  return {
    wing: f.advancedSetup.aeroBalance.rearWing,
    pressure: `${psi(p[0])} / ${psi(p[2])}`,   // front left / rear left
    tc: `${f.basicSetup.electronics.tC1}/${f.basicSetup.electronics.tC2}/${f.basicSetup.electronics.abs}`,
    bias: f.advancedSetup.mechanicalBalance.brakeBias,
  };
}
