// Pure ACC strategy rules, shared by the browser and tests. No model or paid service.
export type EngineerLap = {
  driver_id: string; session_id: string; number: number; at: string; t: number;
  comparable: boolean; excluded_reasons: string[];
  metrics: { fuel_l?: number } | null;
  conditions: { rain?: string | null; grip?: string | null; grip_worst?: string | null } | null;
};
export type EngineerDriver = { driver_id: string; display_name: string };
export type EngineerInputs = {
  conditions: "dry" | "wet"; includeUnknown: boolean; targetMin: number; maxStintMin: number | null;
  tankL: number | null; measuredBurnL: number | null; manualLapS: number | null; reserveL: number | null;
};
export const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round = (n: number, digits = 1) => Number(n.toFixed(digits));
const up = (n: number) => Math.ceil((n - 1e-9) * 10) / 10;
const positive = (n: number | null, max: number) => n !== null && Number.isFinite(n) && n > 0 && n <= max;
const flying = (lap: EngineerLap) => Number.isFinite(lap.t) && lap.t > 0 && !lap.excluded_reasons.some((r) => r.startsWith("pit_") || r === "distance" || r === "track_edges");
export function lapConditions(c: EngineerLap["conditions"]): "dry" | "wet" | "unknown" {
  if (!c) return "unknown";
  const rain = c.rain?.toLowerCase(), grip = c.grip_worst?.toLowerCase() || c.grip?.toLowerCase();
  if ((rain && rain !== "none") || ["damp", "wet", "flooded"].includes(grip ?? "")) return "wet";
  if (rain === "none" || ["green", "fast", "optimum"].includes(grip ?? "")) return "dry";
  return "unknown";
}
export function recommendRace(track: string, durationMin: number, roster: EngineerDriver[], laps: EngineerLap[], input: EngineerInputs) {
  const nord = track === "nurburgring_24h", gp = track === "nurburgring";
  const warnings: string[] = [];
  if (!positive(input.targetMin, 240) || input.targetMin < 10 || (input.maxStintMin !== null && !positive(input.maxStintMin, 240)) ||
      (input.tankL !== null && !positive(input.tankL, 200)) || (input.measuredBurnL !== null && !positive(input.measuredBurnL, 40)) ||
      (input.manualLapS !== null && !positive(input.manualLapS, 3600)) || (input.reserveL !== null && (!Number.isFinite(input.reserveL) || input.reserveL < 0 || input.reserveL > 50)) ||
      !positive(durationMin, 1440)) throw new Error("Check the race duration, stint limits, fuel inputs and lap time.");
  const matches = (l: EngineerLap) => lapConditions(l.conditions) === input.conditions || (input.includeUnknown && lapConditions(l.conditions) === "unknown");
  const ids = new Set(roster.map((r) => r.driver_id));
  const eligible = laps.filter((l) => ids.has(l.driver_id) && matches(l));
  const drivers = roster.map((driver) => {
    const all = eligible.filter((l) => l.driver_id === driver.driver_id);
    const runs = [...all].sort((a,b) => a.session_id.localeCompare(b.session_id) || a.number - b.number);
    const timed = runs.filter((l) => flying(l) && l.comparable);
    const times = timed.map((l) => l.t), paceMs = times.length >= 3 ? median(times) : null;
    const scatterPct = paceMs ? round(100 * median(times.map((v) => Math.abs(v - paceMs))) / paceMs, 2) : null;
    const complete = all.filter(flying), cleanPct = complete.length ? round(100 * timed.length / complete.length) : null;
    let longestMs = 0, runMs = 0, previous: EngineerLap | null = null;
    for (const l of runs) {
      if (!l.comparable || !flying(l)) { runMs = 0; previous = null; continue; }
      runMs = previous && previous.session_id === l.session_id && previous.number + 1 === l.number ? runMs + l.t : l.t;
      longestMs = Math.max(longestMs, runMs); previous = l;
    }
    const sessions = new Set(timed.map((l) => l.session_id)).size;
    const latest = timed.map((l) => l.at).sort().at(-1) ?? null;
    const evidence = times.length >= 10 && sessions >= 2 ? "stronger" : times.length >= 3 ? "limited" : "insufficient";
    const longestRunMin = round(longestMs / 60000);
    const target = Math.min(input.targetMin, input.maxStintMin ?? input.targetMin);
    const advice = times.length < 3 ? "Complete at least three clean laps in this car and layout."
      : (cleanPct ?? 0) < 90 ? "Prioritise clean running; prove a repeatable single stint before longer blocks."
      : longestRunMin >= 2 * target && sessions >= 2 ? "Practice supports considering consecutive stints; confirm driver-time rules, rest and availability."
      : longestRunMin >= target ? "Observed clean running covers the target stint; confirm traffic and conditions."
      : "Complete a continuous target-length practice run before committing to longer blocks.";
    return { ...driver, advice, validLaps: times.length, completeLaps: complete.length, sessions, paceMs, scatterPct, cleanPct, longestRunMin: round(longestMs / 60000), latest, evidence };
  });
  const reliable = drivers.filter((d) => d.paceMs !== null);
  const paceS = input.manualLapS ?? (reliable.length ? Math.min(...reliable.map((d) => d.paceMs!)) / 1000 : null);
  const slowLapS = input.manualLapS ?? (reliable.length ? Math.max(...reliable.map((d) => d.paceMs!)) / 1000 : null);
  // Adjacent lap averages estimate consumption between mid-lap points. Never bridge pit laps,
  // session boundaries, missing lap numbers, refuelling or another driver's data.
  const drops: number[] = [];
  const driverDrops = new Map<string, number[]>();
  const ordered = [...eligible].sort((a,b) => a.driver_id.localeCompare(b.driver_id) || a.session_id.localeCompare(b.session_id) || a.number - b.number);
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i-1], b = ordered[i], fa = a.metrics?.fuel_l, fb = b.metrics?.fuel_l;
    if (a.driver_id !== b.driver_id || a.session_id !== b.session_id || b.number !== a.number + 1 || !a.comparable || !b.comparable || !flying(a) || !flying(b) ||
        typeof fa !== "number" || typeof fb !== "number" || !Number.isFinite(fa) || !Number.isFinite(fb) || fa > 200 || fb < 0) continue;
    const drop = fa - fb;
    if (drop >= 0.1 && drop <= 40) {
      drops.push(drop);
      const values = driverDrops.get(a.driver_id) ?? [];
      values.push(drop); driverDrops.set(a.driver_id, values);
    }
  }
  const fuelProfiles = [...driverDrops.values()].filter((values) => values.length >= 3).map(median);
  const burn = input.measuredBurnL ?? (fuelProfiles.length ? Math.max(...fuelProfiles) : null);
  const burnSource = input.measuredBurnL !== null ? "Measured input" : burn !== null ? `Estimated highest driver median (${fuelProfiles.length} measured drivers; ${drops.length} adjacent average-fuel-load drops)` : "Missing consumption data";
  const safeBurn = burn === null ? null : up(burn * 1.1);
  const reserve = safeBurn === null ? null : up(Math.max(input.reserveL ?? 0, safeBurn));
  let plan: { laps: number; stintMin: number; slowStintMin: number; startFuelL: number; addFuelL: number; reserveL: number; estimatedStops: number } | null = null;
  if (paceS && slowLapS && safeBurn && reserve !== null && input.tankL) {
    const limitMin = Math.min(input.targetMin, input.maxStintMin ?? input.targetMin);
    const timeLaps = Math.floor(limitMin * 60 / slowLapS);
    const fuelLaps = Math.floor((input.tankL - reserve + 1e-9) / safeBurn);
    let count = Math.min(timeLaps, fuelLaps);
    while (count > 0 && up(count * safeBurn + reserve) > input.tankL) count--;
    if (count >= 1) {
      const stintMin = count * paceS / 60;
      plan = { laps: count, stintMin: round(stintMin, 2), slowStintMin: round(count * slowLapS / 60, 2), startFuelL: up(count * safeBurn + reserve), addFuelL: up(count * safeBurn), reserveL: reserve,
        estimatedStops: Math.max(0, Math.ceil((durationMin * 60 / paceS + 1) / count) - 1) };
      if (count === fuelLaps && fuelLaps < timeLaps) warnings.push("Tank capacity limits this stint before the requested time target.");
      if (stintMin < 10) warnings.push("This stint is shorter than the planner’s 10-minute minimum; review the inputs before saving targets.");
    } else warnings.push("The tank/reserve or stint limit cannot cover one complete lap with these inputs.");
  }
  if (!paceS) warnings.push("At least three clean laps from a roster driver, or a manual lap time, are needed for timing.");
  if (!burn) warnings.push("Enter measured litres per lap or upload consecutive laps with fuel-load readings.");
  if (!input.tankL) warnings.push("Enter this ACC car’s tank capacity from the game; the engineer does not guess it.");
  if (reserve !== null && reserve > 50) warnings.push("The one-lap reserve exceeds the saved strategy’s 50 L limit; review consumption before applying.");
  if (input.includeUnknown) warnings.push("You included sessions with unknown conditions; their pace and fuel may not match this race.");
  if (input.maxStintMin === null) warnings.push("No league stint limit entered. The target is a planning preference, not an ACC rule.");
  if (drivers.some((d) => d.evidence === "insufficient")) warnings.push("Some roster drivers lack matching practice evidence. Their pace and endurance remain unverified.");
  const stronger = reliable.filter((d) => d.evidence === "stronger");
  const starter = [...(stronger.length ? stronger : reliable)].sort((a,b) => {
    const score = (d: typeof a) => (d.cleanPct ?? 0) * 0.65 + Math.max(0, 100 - (d.scatterPct ?? 10) * 15) * 0.35;
    return score(b) - score(a) || a.paceMs! - b.paceMs!;
  })[0] ?? null;
  const guidance = [
    nord ? "Nordschleife: plan stops at whole-lap boundaries and keep at least one lap of fuel as reserve. A missed pit entry costs a long extra lap." : gp ? "Nürburgring GP: analyse GP laps separately from the 24h layout; use the shorter lap to review stop timing more frequently." : "General ACC guidance; Nürburgring-specific rules apply only to the matching layouts.",
    "Consumption estimates use consecutive lap-average tank readings, not measured fuel flow. Pit laps, refuelling rises and gaps are excluded; the highest sufficiently sampled driver median is used.",
    "Fuel uses a stated 10% consumption margin plus at least one lap of reserve. Review the margin after a representative practice run.",
    "Stop count assumes race-duration running plus one finishing lap and ignores time spent in pits. It is a conservative estimate, not a required pit-stop rule.",
    input.conditions === "wet" ? "Use wet-session pace only. Reassess fuel and braking margins as grip changes; session-wide rain cannot identify every local track condition." : "Dry-session evidence supports this estimate. Recalculate if rain, grip or pace changes.",
    "ACC tyre wear is unavailable in these uploads. Confirm tyre changes, driver-time limits, night suitability, availability, rest and pit-lane timing with the team.",
  ];
  return { trackLabel: nord ? "Nürburgring 24h / Nordschleife" : gp ? "Nürburgring GP" : track.replaceAll("_", " "), drivers: drivers.map((d) => ({ ...d, fuelL: (driverDrops.get(d.driver_id)?.length ?? 0) >= 3 ? round(median(driverDrops.get(d.driver_id)!), 2) : null })), starter, paceS, slowLapS, burnL: burn === null ? null : round(burn, 2), safeBurnL: safeBurn, burnSource, fuelSamples: drops.length, plan, warnings, guidance,
    confidence: reliable.length === roster.length && roster.length >= 4 && drivers.every((d) => d.evidence === "stronger") && !input.includeUnknown && input.manualLapS === null ? "Stronger practice evidence; rule and fuel checks still required" : "Provisional; review sample sizes and assumptions" };
}
export type EngineerReport = ReturnType<typeof recommendRace>;
