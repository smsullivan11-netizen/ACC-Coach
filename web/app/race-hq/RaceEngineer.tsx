"use client";
import { useState } from "react";
import { recommendRace, type EngineerDriver, type EngineerLap, type EngineerInputs, type EngineerReport } from "@/lib/race-engineer";
import type { CarStrategy, RaceHQData } from "@/lib/race-hq";
import styles from "./RaceHQ.module.css";

type Evidence = { roster: EngineerDriver[]; cars: { key: string; name: string | null }[]; selectedCar: string; track: string; laps: EngineerLap[] };
const inputClass = "mt-1 w-full rounded-lg border border-white/20 bg-zinc-900 p-2 text-sm text-white";
const lapTime = (s: number | null) => s === null ? "—" : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const fields = [
  ["tankL", "ACC tank capacity (L)", 1, 200, 0.1],
  ["measuredBurnL", "Measured consumption (L/lap, optional)", 0.1, 40, 0.1],
  ["manualLapS", "Lap time override (seconds, optional)", 1, 3600, 0.1],
  ["targetMin", "Target stint (minutes)", 10, 240, 1],
  ["maxStintMin", "League maximum driving stint (minutes, optional)", 1, 240, 1],
  ["reserveL", "Minimum reserve (L, optional)", 0, 50, 0.1],
] as const;
export default function RaceEngineer({ data, carId, source, canDraft, onDraft }: {
  data: RaceHQData; carId: string; source: CarStrategy; canDraft: boolean; onDraft: (patch: Partial<CarStrategy>) => void;
}) {
  const [evidence, setEvidence] = useState<Evidence | null>(null), [car, setCar] = useState("");
  const [input, setInput] = useState<EngineerInputs>({ conditions: "dry", includeUnknown: false, targetMin: source.stint_min, maxStintMin: null, tankL: null, measuredBurnL: null, manualLapS: null, reserveL: source.reserve_l === null ? null : Number(source.reserve_l) });
  const [report, setReport] = useState<EngineerReport | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  function change(patch: Partial<EngineerInputs>) { setInput((i) => ({ ...i, ...patch })); setReport(null); }
  async function analyse() {
    setBusy(true); setError(null); setReport(null);
    try {
      const response = await fetch(`/api/race-hq/${data.event.id}/cars/${carId}/engineer${car ? `?car=${encodeURIComponent(car)}` : ""}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load driver stats.");
      setEvidence(result); setCar(result.selectedCar);
      if (!result.selectedCar) { setError("Choose the ACC car model, then analyse again. Different car models are kept separate."); return; }
      if (!result.roster.length) { setError("Assign drivers in Teams first so the engineer can analyse this car’s roster."); return; }
      setReport(recommendRace(result.track, data.event.duration_min, result.roster, result.laps, input));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const plan = report?.plan;
  const canApply = plan && plan.stintMin >= 10 && plan.reserveL <= 50 && canDraft;
  return <section className="mt-6 rounded-xl border border-accent/25 bg-accent/[0.03] p-4" aria-labelledby="engineer-heading">
    <h4 id="engineer-heading" className="text-lg font-semibold text-white">ACC Race Engineer</h4>
    <p className="mt-2 text-sm text-zinc-300">Track-specific strategy reasoning from this car’s roster and recent practice. No paid AI service. Nürburgring GP and the 24h layout are analysed separately.</p>
    <p className="mt-2 text-xs text-zinc-400">Uses up to 20 recent non-qualifying sessions per driver from the last 60 days, capped at 1,500 laps each. Fuel, setup and track temperature can affect the observed pace.</p>
    <form className="mt-4" onSubmit={(e) => { e.preventDefault(); void analyse(); }}>
      {evidence && <label className="mb-4 block text-sm text-zinc-300">ACC car model<select className={inputClass} value={car} onChange={(e) => { setCar(e.target.value); setReport(null); }}><option value="">Choose a car</option>{evidence.cars.map((c) => <option key={c.key} value={c.key}>{c.name || c.key.replaceAll("_", " ")}</option>)}</select></label>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-zinc-300">Expected conditions<select className={inputClass} value={input.conditions} onChange={(e) => change({ conditions: e.target.value as "dry" | "wet" })}><option value="dry">Dry</option><option value="wet">Wet / damp</option></select></label>
        {fields.map(([key, label, min, max, step]) => <label key={key} className="text-sm text-zinc-300">{label}<input className={inputClass} type="number" min={min} max={max} step={step} required={key === "targetMin"} value={input[key] ?? ""} onChange={(e) => change({ [key]: e.target.value === "" ? null : Number(e.target.value) })} /></label>)}
      </div>
      <label className="mt-4 flex min-h-11 items-center gap-3 text-sm text-zinc-300"><input type="checkbox" checked={input.includeUnknown} onChange={(e) => change({ includeUnknown: e.target.checked })} /> Include practice with unknown conditions</label>
      <button className={`${styles.primary} mt-3`} disabled={busy}>{busy ? "Analysing…" : "Analyse driver stats & strategy"}</button>
    </form>
    {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    {report && <div className="mt-5 space-y-5" aria-live="polite">
      <div><h5 className="font-semibold text-white">{report.trackLabel} · {input.conditions} · {car.replaceAll("_", " ")}</h5><p className="mt-1 text-sm text-amber-200">{report.confidence}</p></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs text-zinc-300"><caption className="mb-2 text-left text-sm font-semibold text-white">Matching driver evidence</caption><thead><tr>{["Driver", "Clean / flying laps", "Median pace", "Scatter", "Clean %", "Est. L/lap", "Longest clean run"].map((label) => <th scope="col" key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{report.drivers.map((d) => <tr className="border-t border-white/10" key={d.driver_id}><th scope="row" className="p-2 font-normal">{d.display_name}<span className="block text-zinc-500">{d.sessions} sessions · {d.evidence}{d.latest ? ` · ${new Date(d.latest).toLocaleDateString()}` : ""}</span></th><td className="p-2">{d.validLaps} / {d.completeLaps}</td><td className="p-2">{lapTime(d.paceMs === null ? null : d.paceMs / 1000)}</td><td className="p-2">{d.scatterPct === null ? "—" : `${d.scatterPct}%`}</td><td className="p-2">{d.cleanPct === null ? "—" : `${d.cleanPct}%`}</td><td className="p-2">{d.fuelL ?? "—"}</td><td className="p-2">{d.longestRunMin} min</td></tr>)}</tbody></table></div>
      <ul className="space-y-2 text-sm text-zinc-300">{report.drivers.map((d) => <li key={d.driver_id}><strong className="text-white">{d.display_name}:</strong> {d.advice}</li>)}</ul>
      {report.starter && <p className="text-sm text-zinc-300"><strong className="text-white">Opening-stint practice candidate: {report.starter.display_name}.</strong> Stronger practice samples are considered first. Ranked by clean-lap rate (65%) and lap-time consistency (35%), with pace breaking ties. Traffic experience, night driving, availability and rest need a team check. This does not change the roster order.</p>}
      <p className="text-sm text-zinc-300">Consumption: {report.burnL === null ? "not available" : `${report.burnL} L/lap`} · {report.burnSource}. {report.safeBurnL !== null && `Planning consumption with margin: ${report.safeBurnL} L/lap.`}</p>
      {plan && <div className="rounded-lg bg-white/5 p-4"><h5 className="font-semibold text-white">Suggested pit target: after {plan.laps} laps</h5><p className="mt-2 text-sm text-zinc-200">About {plan.stintMin}–{plan.slowStintMin} minutes across the observed driver pace range. Start with {plan.startFuelL} L; add up to {plan.addFuelL} L at a planned stop after checking remaining fuel. Reserve: {plan.reserveL} L.</p><p className="mt-2 text-sm text-zinc-400">Estimated stops: {plan.estimatedStops}. Compare against the saved minimum-stop rule ({source.min_pit_stops ?? "not set"}); the engineer leaves that rule as entered.</p>
        {canApply && <button className={`${styles.primary} mt-3`} onClick={() => onDraft({ stint_min: Math.floor(plan.stintMin), starting_fuel_l: String(plan.startFuelL), refuel_l: String(plan.addFuelL), reserve_l: String(plan.reserveL) })}>Review these targets as a draft</button>}
        <p className="mt-2 text-xs text-zinc-400">Drafting fills fuel targets and a conservative whole-minute stint target. Review and save the strategy yourself. Your existing stint schedule, tyre plan, pit rules and notes stay in place; coordinate actual stops by lap and driver pace.</p>
      </div>}
      {report.warnings.length > 0 && <ul className="list-disc space-y-2 pl-5 text-sm text-amber-200">{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      <details><summary className="cursor-pointer text-sm font-semibold text-white">Why this strategy?</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-300">{report.guidance.map((g) => <li key={g}>{g}</li>)}<li>Median clean lap time represents pace. Scatter is the median absolute deviation from that pace; it is not a crash-risk prediction. Longest clean run is observed practice, not a guaranteed driving limit.</li></ul></details>
    </div>}
  </section>;
}
