"use client";

import { ArrowDown, ArrowUp, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { lapTime } from "@/lib/format";

type Stint = { driver_id: string | null; minutes: number };
type D = { id: string; name: string; pace_ms: number | null };

// Endurance line-up: stints in order, the clock time of each driver change, laps per stint from each
// driver's race pace, and each driver's total. Admins edit and save; everyone sees the saved plan.
export default function Lineup({ eventId, startIso, duration, saved, suggested, drivers, pitLossS, editable }: {
  eventId: string; startIso: string; duration: number; saved: Stint[]; suggested: Stint[]; drivers: D[]; pitLossS: number; editable: boolean;
}) {
  const router = useRouter();
  const [stints, setStints] = useState<Stint[]>(saved.length ? saved : suggested);
  const [message, setMessage] = useState<string | null>(saved.length ? null : "Suggested from the sign-ups and race pace: adjust, then save.");
  const byId = new Map(drivers.map((d) => [d.id, d]));
  const total = stints.reduce((a, s) => a + s.minutes, 0);
  const start = new Date(startIso).getTime();

  const update = (i: number, s: Partial<Stint>) => setStints(stints.map((x, j) => (j === i ? { ...x, ...s } : x)));
  const move = (i: number, d: number) => {
    const next = [...stints];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setStints(next);
  };
  async function save() {
    const res = await fetch(`/api/events/${eventId}/stints`, { method: "POST", body: JSON.stringify({ stints }) });
    setMessage(res.ok ? "Line-up saved." : "Could not save.");
    router.refresh();
  }

  // Start time of each stint (minutes since the start, summed in order)
  const offsets = stints.map((_, i) => stints.slice(0, i).reduce((a, s) => a + s.minutes, 0));
  const totals = new Map<string, number>();
  for (const s of stints) if (s.driver_id) totals.set(s.driver_id, (totals.get(s.driver_id) ?? 0) + s.minutes);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Stint</th><th>Driver</th><th className="text-right">Minutes</th><th>From</th><th className="text-right">≈ Laps</th>{editable && <th />}</tr></thead>
          <tbody>
            {stints.map((s, i) => {
              const from = new Date(start + offsets[i] * 60000);
              const pace = s.driver_id ? byId.get(s.driver_id)?.pace_ms : null;
              const laps = pace ? Math.floor((s.minutes * 60000 - (i > 0 ? pitLossS * 1000 : 0)) / pace) : null;
              return (
                <tr key={i}>
                  <td className="display text-zinc-400">{i + 1}</td>
                  <td>
                    {editable ? (
                      <select value={s.driver_id ?? ""} onChange={(e) => update(i, { driver_id: e.target.value || null })} className="input py-1">
                        <option value="">—</option>
                        {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    ) : <span className="text-white">{s.driver_id ? byId.get(s.driver_id)?.name ?? "?" : "—"}</span>}
                  </td>
                  <td className="text-right">
                    {editable ? <input type="number" min={1} value={s.minutes} onChange={(e) => update(i, { minutes: Math.max(1, Number(e.target.value) || 1) })} className="input w-20 py-1 text-right" />
                      : s.minutes}
                  </td>
                  <td className="tabular whitespace-nowrap text-zinc-400">
                    {from.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    <span className="text-zinc-600"> (+{Math.round((from.getTime() - start) / 60000)} min)</span>
                  </td>
                  <td className="text-right text-zinc-300" title={pace ? `race pace ${lapTime(pace)}` : "no pace data on this track"}>{laps ?? "–"}</td>
                  {editable && (
                    <td className="whitespace-nowrap text-right">
                      <button disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-zinc-500 hover:text-white disabled:opacity-30" aria-label="Up"><ArrowUp size={14} /></button>
                      <button disabled={i === stints.length - 1} onClick={() => move(i, 1)} className="p-1 text-zinc-500 hover:text-white disabled:opacity-30" aria-label="Down"><ArrowDown size={14} /></button>
                      <button onClick={() => setStints(stints.filter((_, j) => j !== i))} className="p-1 text-zinc-500 hover:text-red-400" aria-label="Remove"><Trash2 size={14} /></button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className={total === duration ? "text-emerald-400" : "text-orange-400"}>
          {total} / {duration} min{total !== duration && ` (${total > duration ? "+" : ""}${total - duration})`}
        </span>
        {[...totals.entries()].map(([id, m]) => <span key={id} className="text-zinc-400">{byId.get(id)?.name}: <span className="text-white">{m} min</span></span>)}
      </div>
      {editable && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setStints([...stints, { driver_id: null, minutes: 30 }])} className="btn btn-ghost"><Plus size={14} /> Stint</button>
          <button onClick={() => { setStints(suggested); setMessage("Suggestion restored: save to keep it."); }} className="btn btn-ghost"><Sparkles size={14} /> Suggest again</button>
          <button onClick={save} className="btn btn-primary"><Save size={14} /> Save line-up</button>
        </div>
      )}
      {message && <p className="mt-2 text-sm text-zinc-400">{message}</p>}
    </div>
  );
}
