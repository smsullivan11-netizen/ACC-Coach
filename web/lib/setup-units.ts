// Real units for a setup file's clicks (user's request, 2026-10-08). The file stores the game's
// clicks; the game's menu shows degrees, N/m, mm, %... Derived by putting the user's three setup files
// next to screenshots of the game's own setup screens (ACC 1.10.4): Ford Mustang GT3 "GO 1.10.2 MUSTANG
// GT3 BAR Q Esport", BMW M4 GT3 "GO2 M4 GT3 HUN E Q01" and Porsche 992 GT3 R "992 Sprint - Fast".
// Safe on server and client.
//
// Same on all three cars (so used for every car, GT3 for the camber): tyre pressure 20.3 psi + 0.1 per
// click; fuel = click + 2 L; tyre set, brake pads, ECU map and the number of pit stops are 1-based in the
// menu; brake power 80 % + 1 per click; differential preload 20 Nm + 10 per click; camber -4.0° front /
// -3.5° rear + 0.1° per click.
// Different per car (known for these three only, the others stay in clicks): toe, caster, steering ratio,
// ride height, brake bias, springs and bump stop rate. Marked "estimated" where only the step is a guess.

export type Units = {
  camber?: { front: number; rear: number; step: number };
  toe?: { front: number; rear: number; step: number };
  caster?: { base: number; step: number; estimated?: boolean };
  steer?: { base: number; step: number };
  rideHeight?: { front: number; rear: number };
  brakeBias?: { base: number; step: number; estimated?: boolean };
  wheelRate?: { front: Record<number, number>; rear: Record<number, number> };          // click → N/m, as seen
  bumpStopRate?: { base: number; step: number } | { front: Record<number, number>; rear: Record<number, number> };
};

const GT3_CAMBER = { front: -4.0, rear: -3.5, step: 0.1 };

export const UNITS: Record<string, Units> = {
  ford_mustang_gt3: {
    toe: { front: -0.2, rear: -0.1, step: 0.01 },
    caster: { base: 8.3, step: 0.1, estimated: true },
    steer: { base: 10, step: 1 },
    rideHeight: { front: 50, rear: 50 },
    brakeBias: { base: 48.5, step: 0.2, estimated: true },
    wheelRate: { front: { 0: 105000 }, rear: { 0: 90000 } },
    bumpStopRate: { front: { 0: 200 }, rear: { 0: 200 } },
  },
  bmw_m4_gt3: {
    toe: { front: -0.2, rear: 0, step: 0.01 },
    caster: { base: 8.2, step: 0.1, estimated: true },
    steer: { base: 10, step: 1 },
    rideHeight: { front: 50, rear: 50 },
    brakeBias: { base: 49.2, step: 0.2, estimated: true },
    wheelRate: { front: { 1: 120000 }, rear: { 0: 90000 } },
    bumpStopRate: { base: 200, step: 50 },
  },
  porsche_992_gt3_r: {
    toe: { front: -0.4, rear: -0.4, step: 0.01 },
    caster: { base: 9.4, step: 0.1, estimated: true },
    steer: { base: 13, step: 0.5 },
    rideHeight: { front: 53, rear: 55 },
    brakeBias: { base: 43.0, step: 0.2, estimated: true },
    wheelRate: { front: { 3: 119000 }, rear: { 2: 156000 } },
    bumpStopRate: { base: 300, step: 100 },
  },
};

/** The car's known conversions (the GT3 camber is shared by every GT3). */
export function unitsFor(carKey: string, cls?: string | null): Units {
  return { ...(cls === "GT3" ? { camber: GT3_CAMBER } : {}), ...UNITS[carKey] };
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const signed = (v: number, d: number) => `${v < 0 ? "−" : ""}${Math.abs(round(v, d)).toFixed(d)}`;

// Each converter returns the display strings for the four wheels (FL FR RL RR) or one value, or null
// when this car's table is not known (the viewer then shows the clicks).
export const fmt = {
  camber: (u: Units, c: number[]) => u.camber ? c.map((v, i) => `${signed((i < 2 ? u.camber!.front : u.camber!.rear) + v * u.camber!.step, 1)}°`) : null,
  toe: (u: Units, c: number[]) => u.toe ? c.map((v, i) => `${signed((i < 2 ? u.toe!.front : u.toe!.rear) + v * u.toe!.step, 2)}°`) : null,
  caster: (u: Units, v: number) => u.caster ? `${round(u.caster.base + v * u.caster.step, 1).toFixed(1)}°` : null,
  steer: (u: Units, v: number) => u.steer ? (u.steer.step < 1 ? round(u.steer.base + v * u.steer.step, 1).toFixed(1) : String(round(u.steer.base + v * u.steer.step, 1))) : null,
  rideHeight: (u: Units, c: number[]) => u.rideHeight ? [u.rideHeight.front + c[0], u.rideHeight.rear + c[2]] : null,   // [front, rear] in mm
  brakeBias: (u: Units, v: number) => u.brakeBias ? `${round(u.brakeBias.base + v * u.brakeBias.step, 1).toFixed(1)} %` : null,
  wheelRate: (u: Units, c: number[]) => {
    const t = u.wheelRate;
    if (!t) return null;
    const v = c.map((x, i) => (i < 2 ? t.front : t.rear)[x]);
    return v.every((x) => x != null) ? v.map((x) => `${x} N/m`) : null;
  },
  bumpStopRate: (u: Units, c: number[]) => {
    const t = u.bumpStopRate;
    if (!t) return null;
    const v = "base" in t ? c.map((x) => t.base + x * t.step) : c.map((x, i) => (i < 2 ? t.front : t.rear)[x]);
    return v.every((x) => x != null) ? v.map((x) => `${x} N`) : null;
  },
};
