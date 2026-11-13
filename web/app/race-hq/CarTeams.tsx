"use client";
import { useState } from "react";
import type { RaceHQData } from "@/lib/race-hq";
import styles from "./RaceHQ.module.css";
type Props = {
  data: RaceHQData; busy: boolean;
  onSave: (carId: string, body: unknown, message: string, onError?: (message: string) => void) => Promise<boolean>;
};
export default function CarTeams(props: Props) {
  return <div className="space-y-5"><div><h3 className="text-xl font-semibold text-white">Car teams</h3><p className="mt-2 text-sm text-zinc-400">Sign up first, then a lead assigns 4–6 drivers per car. Each driver belongs to one car per race.</p></div><div className="grid gap-5 md:grid-cols-2">{props.data.cars.map((car) => <Roster key={car.id} {...props} car={car} />)}</div></div>;
}
function Roster({ data, car, busy, onSave }: Props & { car: RaceHQData["cars"][number] }) {
  const roster = data.rosters.filter((r) => r.event_car_id === car.id);
  const [editing, setEditing] = useState(false), [selected, setSelected] = useState<string[]>([]);
  const [editNames, setEditNames] = useState<Record<string,string>>({});
  const [error, setError] = useState<string | null>(null), [saved, setSaved] = useState<string | null>(null), [saving,setSaving] = useState(false);
  const allowed = new Map([...data.signups.map((s) => [s.driver_id, s.display_name] as const), ...roster.map((r) => [r.driver_id, r.display_name] as const)]);
  const other = new Map(data.rosters.filter((r) => r.event_car_id !== car.id).map((r) => [r.driver_id, data.cars.find((c) => c.id === r.event_car_id)?.number]));
  // Keep stale checked choices visible so they can be removed after a poll or another lead's edit.
  const choices = new Map([...allowed, ...selected.map((id) => [id, allowed.get(id) ?? editNames[id] ?? "Driver no longer available"] as const)]);
  const conflicts = selected.filter((id) => other.has(id) || !allowed.has(id));
  const available = [...allowed.keys()].filter((id) => !other.has(id) && !selected.includes(id));
  const issue = conflicts.length ? "A selected driver is no longer available for this car. Uncheck the marked driver." :
    selected.length < 4 ? `Select ${4-selected.length} more driver${4-selected.length===1?"":"s"} to confirm car #${car.number} (4–6 required).` :
    selected.length > 6 ? "Choose no more than six drivers." : null;
  const reasonId = `roster-confirm-reason-${car.id}`;
  const unresolved = data.stints.some((s) => s.event_car_id === car.id && (!s.driver_id || !roster.some((r) => r.driver_id === s.driver_id)) && new Date(s.ends_at) > new Date(data.event.server_now));
  async function save(confirmed: boolean) {
    setError(null);setSaved(null);setSaving(true);
    let failure = "Roster was not saved. Please try again.";
    try {
      const ok = await onSave(car.id, { action: "roster", driver_ids: selected, confirmed },
        `Car #${car.number} roster ${confirmed ? "confirmed" : "draft saved"}.`, (message) => { failure=message; });
      if (ok) { setSaved(`Car #${car.number} roster ${confirmed?"confirmed":"draft saved"}.`);setEditing(false); }
      else setError(failure);
    } catch (e) { setError(e instanceof Error ? e.message : failure); }
    finally { setSaving(false); }
  }
  return <section className="card p-4" aria-label={`Car ${car.number} roster`}><h4 className="text-lg font-semibold text-white">#{car.number} · {car.name}</h4>
    <p className={`mt-2 text-sm ${car.roster_confirmed ? "text-emerald-300" : "text-amber-300"}`}>{car.roster_confirmed ? "Confirmed" : "Draft · needs confirmation"} · {roster.length}/6 drivers</p>
    {saved && <p role="status" className="mt-3 text-sm text-emerald-300">{saved}</p>}
    {unresolved && <p className="mt-3 text-sm text-amber-300">This plan has unassigned or former-team drivers. Review the stints after confirming the roster.</p>}
    {!editing ? <><ol className="my-4 space-y-2 text-sm text-zinc-200">{roster.map((r, i) => <li key={r.driver_id}>{i + 1}. {r.display_name}{r.driver_id === data.me.id ? " · you" : ""}</li>)}</ol>{!roster.length && <p className="my-4 text-sm text-zinc-400">No drivers assigned yet.</p>}
      {data.can_lead && data.event.status !== "finished" && !data.event.archived_at && <button type="button" className={styles.primary} disabled={busy} onClick={() => { setSelected(roster.map((r) => r.driver_id));setEditNames(Object.fromEntries(allowed));setError(null);setSaved(null);setEditing(true); }}>Assign registered drivers</button>}
    </> : <><fieldset className="mt-4 space-y-1"><legend className="mb-2 text-sm text-zinc-300">Choose drivers ({selected.length}/6)</legend>{[...choices].map(([id, name]) => {
      const checked=selected.includes(id), unavailable=other.has(id)||!allowed.has(id);
      return <label key={id} className="flex min-h-11 items-center gap-3 rounded-md px-2 py-2 text-sm text-zinc-200 hover:bg-white/5">
        <input type="checkbox" checked={checked} disabled={busy || saving || (!checked && (unavailable || selected.length>=6))}
          aria-invalid={checked&&unavailable||undefined}
          onChange={(e) => {setError(null);setSelected((all) => e.target.checked ? [...all, id] : all.filter((d) => d !== id));}} />
        <span>{name}{other.has(id)?` · assigned to #${other.get(id)}`:!allowed.has(id)?" · no longer registered":""}{checked&&unavailable?" · uncheck to continue":""}</span>
      </label>;
    })}{!choices.size && <p className="text-sm text-zinc-400">No signups yet. Drivers can register above.</p>}</fieldset>
      <p className="mt-3 text-xs text-zinc-400">Selection order sets the starting rotation. Removing a driver clears future assignments; started stints are kept.</p>
      <p id={reasonId} role="status" className={`mt-3 text-sm ${issue?"text-amber-300":"text-zinc-300"}`}>{issue ?? `Ready to confirm ${selected.length} drivers for car #${car.number}.`}</p>
      {selected.length<4&&!available.length&&<p className="mt-2 text-sm text-zinc-400">No additional registered drivers are available for this car. Another teammate needs to sign up, or a lead must move a driver from the other car first.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className={styles.primary} aria-describedby={reasonId} disabled={busy || saving || Boolean(issue)} onClick={() => void save(true)}>{saving?"Saving…":"Confirm roster"}</button>
        <button type="button" disabled={busy || saving || conflicts.length>0} className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white" onClick={() => void save(false)}>Save draft</button>
        <button type="button" disabled={busy || saving} className="px-3 py-2 text-sm text-zinc-300" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </>}
  </section>;
}
