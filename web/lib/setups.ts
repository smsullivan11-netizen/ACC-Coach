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
import { fmt, unitsFor } from "./setup-units";
export type Tab = { key: string; label: string; cells: Cell[]; extra?: { title: string; cells: Cell[] }[] };

const psi = (click: number) => (20.3 + 0.1 * click).toFixed(1);
const clicks = (v: number) => String(v);
const litres = (v: number) => `${v} L`;
const compound = (v: number) => (v === 1 ? "Wet" : "Dry");
const oneBased = (v: number) => String(v + 1);   // tyre set, brake pads, ECU map and pit stops count from 1 in the menu

/** The setup as the game's six setup tabs lay it out (Tyres, Electronics, Fuel & Strategy, Mechanical
 *  Grip, Dampers, Aero), with the units of the game's menu where they are known for this car
 *  (lib/setup-units.ts: the clicks are shown otherwise) and the game's own names and order.
 *  Tolerant: a field missing from an older file is left out. */
export function setupTabs(f: SetupFile, carClass?: string | null): Tab[] {
  const u = unitsFor(f.carName, carClass);
  const b = f.basicSetup, a = f.advancedSetup, al = b.alignment, st = b.strategy, mb = a.mechanicalBalance, ae = a.aeroBalance;
  const cells = (list: (Cell | null)[]) => list.filter((c): c is Cell => c != null);
  // Four wheels: in units when this car's table is known (the label says which), else clicks
  const w = (label: string, v: number[] | undefined, conv: ((c: number[]) => string[] | null) | null, unit: string, hint?: string): Cell | null => {
    if (!v || v.length !== 4) return null;
    const shown = conv?.(v);
    return shown ? { kind: "wheels", label: `${label}${unit ? ` (${unit})` : ""}`, values: shown, hint }
                 : { kind: "wheels", label: `${label} (clicks)`, values: v.map(clicks), hint };
  };
  const s = (label: string, v: number | undefined, fmtv: (x: number) => string = clicks, hint?: string): Cell | null =>
    v == null ? null : { kind: "single", label, value: fmtv(v), hint };
  const axles = (label: string, front: string, rear: string): Cell => ({ kind: "axles", label, front, rear });

  const tyres: Cell[] = cells([
    s("Tyre compound", b.tyres.tyreCompound, compound),
    w("Tyre pressures", b.tyres.tyrePressure, (c) => c.map(psi), "psi, cold", "The game's range starts at 20.3 psi in 0.1 psi steps"),
    w("Toe", al.toe, (c) => fmt.toe(u, c), "°"),
    w("Camber", al.camber, (c) => fmt.camber(u, c), "°"),
    (() => {
      const l = fmt.caster(u, al.casterLF), r = fmt.caster(u, al.casterRF);
      return l && r
        ? { kind: "pair", label: "Caster", values: [l, r], labels: ["Left", "Right"], hint: u.caster?.estimated ? "The step per click (0.1°) is estimated" : undefined } as Cell
        : { kind: "pair", label: "Caster (clicks)", values: [clicks(al.casterLF), clicks(al.casterRF)], labels: ["Left", "Right"] } as Cell;
    })(),
  ]);
  const el = b.electronics;
  const electronics = cells([
    s("TC", el.tC1), s("ABS", el.abs), s("ECU map", el.eCUMap, oneBased), s("Telemetry laps", el.telemetryLaps), s("TC2", el.tC2),
  ]);
  const strategy: Tab = {
    key: "strategy", label: "Fuel & Strategy",
    cells: cells([
      s("Fuel", st.fuel + 2, litres, "The file stores the litres above 2 L"), s("Tyre", b.tyres.tyreCompound, compound), s("Tyre set", st.tyreSet, oneBased),
      axles("Brakes (pad compound)", oneBased(st.frontBrakePadCompound), oneBased(st.rearBrakePadCompound)),
      s("Fuel per lap (estimate)", st.fuelPerLap, (v) => `${v.toFixed(2)} L`, "The game's estimate when the setup was saved; it recalculates it for the session you load it in"),
    ]),
    // The game's "N° pitstop" starts at 1: the first stop is pitStrategy[0]
    extra: (st.pitStrategy ?? []).slice(0, Math.max(st.nPitStops, 0) + 1).map((p, i, all) => ({
      title: all.length > 1 ? `Pit stop ${i + 1}` : "Pit stop",
      cells: cells([
        s("Fuel to add", p.fuelToAdd, litres), s("Tyre", p.tyres.tyreCompound, compound),
        w("Tyre pressures", p.tyres.tyrePressure, (c) => c.map(psi), "psi, cold"),
        axles("Brakes (pad compound)", oneBased(p.frontBrakePadCompound), oneBased(p.rearBrakePadCompound)),
      ]),
    })),
  };
  const bias = fmt.brakeBias(u, mb.brakeBias);
  const mechanical = cells([
    axles("Anti-roll bar", clicks(mb.aRBFront), clicks(mb.aRBRear)),
    s("Brake power", mb.brakeTorque + 80, (v) => `${v} %`, "The file stores the clicks above 80 %"),
    bias ? { kind: "single", label: "Brake bias", value: bias, hint: u.brakeBias?.estimated ? "0.2 % per click is estimated from the game's screens" : undefined }
         : s("Brake bias (clicks)", mb.brakeBias, (v) => (v > 0 ? `+${v}` : String(v))),
    f.basicSetup.alignment.steerRatio != null
      ? (() => { const v = fmt.steer(u, al.steerRatio); return v ? { kind: "single", label: "Steer ratio", value: v } as Cell : s("Steer ratio (clicks)", al.steerRatio); })()
      : null,
    w("Wheel rate", mb.wheelRate, (c) => fmt.wheelRate(u, c), ""),
    w("Bump stop rate", mb.bumpStopRateUp, (c) => fmt.bumpStopRate(u, c), ""),
    w("Bump stop range", mb.bumpStopWindow, (c) => c.map(clicks), ""),
    a.drivetrain?.preload != null ? { kind: "single", label: "Preload differential", value: `${20 + 10 * a.drivetrain.preload} Nm`, hint: "20 Nm + 10 Nm per click" } as Cell : null,
  ]);
  const d = a.dampers;
  const dampers = cells([
    w("Bump", d.bumpSlow, (c) => c.map(clicks), ""), w("Fast bump", d.bumpFast, (c) => c.map(clicks), ""),
    w("Rebound", d.reboundSlow, (c) => c.map(clicks), ""), w("Fast rebound", d.reboundFast, (c) => c.map(clicks), ""),
  ]);
  const rh = fmt.rideHeight(u, ae.rideHeight);
  const aero = cells([
    rh ? { kind: "axles", label: "Ride height (mm)", front: `${rh[0]}`, rear: `${rh[1]}` } as Cell
       : axles("Ride height (clicks)", clicks(ae.rideHeight[0]), clicks(ae.rideHeight[2])),
    s("Rear wing", ae.rearWing), s("Splitter", ae.splitter),
    ae.brakeDuct?.length === 2 ? axles("Brake ducts", clicks(ae.brakeDuct[0]), clicks(ae.brakeDuct[1])) : null,
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
