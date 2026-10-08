// Corrections to OhneSpeed's default-BoP GT3 times (user's request, 2026-10-08). Safe on server and client.
//
// The sheet's older cars have times no GT3 can be off by: the 2018 Ferrari 488 is 105.2 % overall and
// up to +14.8 % on some tracks, nine cars are exactly +14.8 % at Laguna Seca (placeholders), and every
// one of them has no race setups in the sheet (measured: current cars 0.2-0.9 %, worst track +1.8 %).
// With such a reference, any lap in those cars scored 100 pace and the too-fast check could not work.
// Three steps, in this order, on the default-BoP GT3 rows (the LFM tabs have current cars only; GT4
// gets step 1 only, see adjustDefault):
//  1. Good cars (sheet average within GOOD_PCT of the fastest car): a track more than GUARD_PTS worse
//     than the car's own median gap is a placeholder: replaced by the track's fastest time × (1 + median).
//  2. Other cars that GOSetups' sheet has (user's file, lib/reference-data/gosetups-gt3.json): its gap to
//     the Mustang on each track applied to OhneSpeed's Mustang time there (median gap where it lacks one).
//  3. The rest (user's rule): OhneSpeed's order and spacing kept, the whole group moved up so its fastest
//     car sits behind the slowest corrected car by the gap between the two slowest corrected cars. The
//     Jaguar G3 is left out of that step (user's choice: a G3 really is ~2.3 % slower; counting it put
//     the 488 at +5.2 %).
// Corrected rows keep their car and track; their `source` says which step made them (sourceLabel).

import gosetups from "./reference-data/gosetups-gt3.json";

export const GOOD_PCT = 2.0;
export const GUARD_PTS = 3.0;   // placeholders are +6 % and more; a real weak track (KTM GT4 at Monza +2.4 %) stays
const ANCHOR = "ford_mustang_gt3";
const STEP_EXCLUDE = new Set(["jaguar_g3"]);

export const SOURCE_GUARD = "estimate:guard", SOURCE_GOSETUPS = "estimate:gosetups", SOURCE_OLDER = "estimate:older";

/** Where a reference time comes from, in words (lap_reference.source). */
export function sourceLabel(source: string | null | undefined): string {
  switch (source) {
    case SOURCE_GUARD: return "OhneSpeed's time for this track looked wrong: the car's usual gap to the fastest car instead";
    case SOURCE_GOSETUPS: return "Estimate: GOSetups' gap to the Mustang, on OhneSpeed's Mustang time (OhneSpeed's time for this car looked wrong)";
    case SOURCE_OLDER: return "Estimate for an older car: OhneSpeed's order kept, its gap moved up behind the corrected cars";
    default: return "OhneSpeed's sheet";
  }
}
/** Short name of a reference's origin, for "Reference Ford: … (origin, BoP)". */
export function sourceShort(source: string | null | undefined): string {
  switch (source) {
    case SOURCE_GUARD: return "OhneSpeed, adjusted";
    case SOURCE_GOSETUPS: return "GOSetups estimate";
    case SOURCE_OLDER: return "Estimate (older car)";
    default: return "OhneSpeed";
  }
}
export const isEstimate = (source: string | null | undefined) => !!source?.startsWith("estimate:");

type Row = { bop: string; car_class: string; track_key: string; car_key: string; time_ms: number; source: string };
export type Adjustment = { car: string; step: "guard" | "gosetups" | "older"; from_pct: number; to_pct: number; tracks: number };

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/** Corrects the default-BoP rows in place: GT3 all three steps, GT4 the track guard only (its cars
 *  are all within 2.2 %, but single tracks are placeholders too: BMW M4 GT4 +11.1 % at Zolder, Aston
 *  +7.5 % at Snetterton, Camaro +6.9 % at Paul Ricard). Other rows untouched; returns what changed. */
export function adjustDefault<T extends Row>(rows: T[]): Adjustment[] {
  return [...adjustClass(rows, "GT3", true), ...adjustClass(rows, "GT4", false)];
}

function adjustClass<T extends Row>(rows: T[], cls: string, full: boolean): Adjustment[] {
  const mine = rows.filter((r) => r.bop === "default" && r.car_class === cls);
  const byCar = new Map<string, Map<string, T>>();
  for (const r of mine) {
    if (!byCar.has(r.car_key)) byCar.set(r.car_key, new Map());
    byCar.get(r.car_key)!.set(r.track_key, r);
  }
  const tracks = [...new Set(mine.map((r) => r.track_key))];
  const fastest = (cars: string[]) => new Map(tracks.map((t) => [t, Math.min(...cars.map((c) => byCar.get(c)?.get(t)?.time_ms ?? Infinity))]));
  const gapPct = (c: string, t: string, best: Map<string, number>) => 100 * (byCar.get(c)!.get(t)!.time_ms / best.get(t)! - 1);
  const avgGap = (c: string, best: Map<string, number>) => mean([...byCar.get(c)!.keys()].filter((t) => Number.isFinite(best.get(t)!)).map((t) => gapPct(c, t, best)));

  const all = [...byCar.keys()];
  const first = fastest(all);
  const sheetGap = new Map(all.map((c) => [c, avgGap(c, first)]));
  const good = full ? all.filter((c) => sheetGap.get(c)! <= GOOD_PCT) : all;
  const bad = all.filter((c) => !good.includes(c));
  const best = fastest(good);
  const out: Adjustment[] = [];
  const set = (r: T, ms: number, source: string) => { r.time_ms = Math.round(ms); r.source = source; };

  // 1. Placeholder tracks of the good cars
  for (const c of good) {
    const gaps = new Map([...byCar.get(c)!.keys()].map((t) => [t, gapPct(c, t, best)]));
    const m = median([...gaps.values()]);
    let n = 0, worst = 0;
    for (const [t, g] of gaps) if (g > m + GUARD_PTS) { set(byCar.get(c)!.get(t)!, best.get(t)! * (1 + m / 100), SOURCE_GUARD); n++; worst = Math.max(worst, g); }
    if (n) out.push({ car: c, step: "guard", from_pct: worst, to_pct: m, tracks: n });
  }

  if (!full) return out;

  // 2. Cars GOSetups has, through their gap to the Mustang
  const gos = gosetups.cars as Record<string, Record<string, number>>;
  const anchor = byCar.get(ANCHOR), gosAnchor = gos[ANCHOR];
  const viaGos = anchor && gosAnchor ? bad.filter((c) => gos[c]) : [];
  for (const c of viaGos) {
    const ratios = new Map(tracks.filter((t) => gos[c][t] && gosAnchor[t]).map((t) => [t, gos[c][t] / gosAnchor[t]]));
    const usual = median([...ratios.values()]);
    for (const [t, r] of byCar.get(c)!) {
      const a = anchor!.get(t);
      if (a) set(r, a.time_ms * (ratios.get(t) ?? usual), SOURCE_GOSETUPS);
    }
    out.push({ car: c, step: "gosetups", from_pct: sheetGap.get(c)!, to_pct: avgGap(c, best), tracks: byCar.get(c)!.size });
  }

  // 3. The rest: OhneSpeed's order and spacing, moved up behind the slowest corrected car
  const rest = bad.filter((c) => !viaGos.includes(c));
  const corrected = [...good, ...viaGos].filter((c) => !STEP_EXCLUDE.has(c)).map((c) => avgGap(c, best)).sort((a, b) => b - a);
  if (rest.length && corrected.length >= 2) {
    const step = corrected[0] - corrected[1];
    const shift = Math.min(...rest.map((c) => sheetGap.get(c)!)) - (corrected[0] + step);
    if (shift > 0) for (const c of rest) {
      const to = sheetGap.get(c)! - shift;
      for (const [t, r] of byCar.get(c)!) if (Number.isFinite(best.get(t)!)) set(r, best.get(t)! * (1 + to / 100), SOURCE_OLDER);
      out.push({ car: c, step: "older", from_pct: sheetGap.get(c)!, to_pct: to, tracks: byCar.get(c)!.size });
    }
  }
  return out;
}
