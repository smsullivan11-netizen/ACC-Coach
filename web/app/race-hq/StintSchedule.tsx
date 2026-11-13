"use client";

import { useState } from "react";
import type { RaceHQData } from "@/lib/race-hq";
import styles from "./StintSchedule.module.css";
import StintActions from "./StintActions";
import StintOffers from "./StintOffers";

type DraftSlot = { key: string; id: string | null; driver_id: string | null; minutes: number; note: string };
type Props = {
  data: RaceHQData; car: RaceHQData["cars"][number]; now: number; busy: boolean;
  setSelected: (id: string) => void;
  onAction: (body: unknown, message: string) => Promise<boolean>;
  onTrade: (body: unknown, message: string) => Promise<boolean>;
  onPreference: (body: unknown, message: string) => Promise<boolean>;
  feedback?: string | null;
};
export default function StintSchedule({ data, car, now, busy, setSelected, onAction, onTrade, onPreference, feedback }: Props) {
  const source = data.stints.filter((s) => s.event_car_id === car.id).sort((a, b) => a.n - b.n);
  const roster = data.rosters.filter((r) => r.event_car_id === car.id);
  const mine = roster.some((r) => r.driver_id === data.me.id);
  const writable = data.event.status !== "finished" && !data.event.archived_at;
  const lead = data.can_lead && writable;
  const start = +new Date(data.event.starts_at), end = start + data.event.duration_min * 60000;
  const [editor, setEditor] = useState<{ revision: number; slots: DraftSlot[] } | null>(null);
  const [interval, setInterval] = useState(data.strategies.find((s) => s.event_car_id === car.id)?.stint_min ?? 65);
  const [local, setLocal] = useState(false), [onlyMine, setOnlyMine] = useState(false);
  const [selectedStint,setSelectedStint]=useState<string|null>(null),[onlyPreferred,setOnlyPreferred]=useState(false);
  const [error, setError] = useState<string | null>(null);
  const stale = editor !== null && editor.revision !== car.schedule_revision;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    ...(local ? {} : { timeZone: "UTC" }),
  });
  const time = (ms: number) => formatter.format(ms);
  const zone = local ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const toDraft = (): DraftSlot[] => source.map((s) => ({ key: s.id, id: s.id, driver_id: s.driver_id,
    minutes: (+new Date(s.ends_at) - +new Date(s.starts_at)) / 60000, note: s.note ?? "" }));
  const openEditor = () => { setError(null); setOnlyMine(false); setEditor({ revision: car.schedule_revision, slots: toDraft() }); };
  const patch = (key: string, values: Partial<DraftSlot>) => setEditor((e) => e && ({ ...e, slots: e.slots.map((s) => s.key === key ? { ...s, ...values } : s) }));
  const locked = (s: DraftSlot) => Boolean(s.id && source.some((r) => r.id === s.id && +new Date(r.starts_at) <= now));
  const newSlot = (minutes: number): DraftSlot => ({ key: crypto.randomUUID(), id: null, driver_id: null, minutes, note: "" });
  let cursor = start;
  const draft = editor?.slots.map((s) => {
    const begins = cursor; cursor += s.minutes * 60000;
    return { ...s, starts_at: begins, ends_at: cursor };
  }) ?? [];
  const invalid = draft.length < 1 || draft.length > 300 || draft.some((s) => !Number.isFinite(s.minutes) || s.minutes < 1 || s.minutes > 240) || cursor !== end;
  const vacancies = source.filter((s) => !s.driver_id).length;
  const needsQualifier = Boolean(data.event.qualifying_starts_at && !car.qualifying_driver_id);
  const qualifyingFuture = Boolean(data.event.qualifying_starts_at && +new Date(data.event.qualifying_starts_at)>now);
  const qualifyingAction = (driver: string | null) => onAction({ action:"qualifier",driver_id:driver,revision:car.schedule_revision },
    driver ? "Qualifying driver saved." : "Qualifying slot released.");
  const changeStatus = (status: "draft" | "open" | "confirmed") => onAction({ action: "status", status, revision: car.schedule_revision },
    status === "open" ? "Booking is open. Drivers can choose stints for this car." : status === "confirmed" ? "Schedule confirmed." : "Schedule returned to draft.");
  function generate() {
    if (!Number.isInteger(interval) || interval < 5 || interval > 240) { setError("Choose a slot length between 5 and 240 whole minutes."); return; }
    let remaining = data.event.duration_min;
    const slots: DraftSlot[] = [];
    while (remaining > 0) { const minutes = Math.min(interval, remaining); slots.push(newSlot(minutes)); remaining -= minutes; }
    setEditor((e) => e && ({ ...e, slots })); setError(null);
  }
  function split(index: number) {
    setEditor((e) => {
      if (!e) return e;
      const s = e.slots[index], first = Math.floor(s.minutes / 2);
      return { ...e, slots: [...e.slots.slice(0, index), { ...s, minutes: first }, newSlot(s.minutes - first), ...e.slots.slice(index + 1)] };
    });
  }
  function merge(index: number) {
    setEditor((e) => {
      if (!e) return e;
      const a = e.slots[index], b = e.slots[index + 1];
      return { ...e, slots: [...e.slots.slice(0, index), { ...a, minutes: a.minutes + b.minutes,
        driver_id: a.driver_id === b.driver_id ? a.driver_id : null, note: [a.note, b.note].filter(Boolean).join(" / ").slice(0,300) }, ...e.slots.slice(index + 2)] };
    });
  }
  return <section className={styles.panel} aria-labelledby="stint-schedule-title">
    <header className={styles.header}><div><h3 id="stint-schedule-title">Stint schedule</h3><p>Click a stint to drive it, mark a preference, or arrange a swap.</p></div>
      <span className={styles.badge}>{car.schedule_status === "open" ? "Open for booking" : car.schedule_status === "confirmed" ? "Confirmed" : "Draft"}</span></header>
    <div className={styles.cars}>{data.cars.map((c) => <button type="button" key={c.id} aria-pressed={c.id === car.id} disabled={Boolean(editor) || busy} onClick={() => setSelected(c.id)}>#{c.number} · {c.name}</button>)}</div>
    <p className={styles.hint}>{time(start)} → {time(end)} · {data.event.duration_min / 60}h · {zone}</p>
    <div className={styles.tools}>
      <button type="button" onClick={() => setLocal(!local)}>{local ? "Show UTC" : "Show my time"}</button>
      {!editor && <button type="button" aria-pressed={onlyMine} onClick={() => {setOnlyMine(!onlyMine);setOnlyPreferred(false);}}>{onlyMine ? "Show all stints" : "My stints"}</button>}
      {!editor && <button type="button" aria-pressed={onlyPreferred} onClick={()=>{setOnlyPreferred(!onlyPreferred);setOnlyMine(false);}}>{onlyPreferred?"Show all preferences":"My preferences"}</button>}
    </div>
    {!editor && <div className={styles.notice}>
      {car.schedule_status === "draft" ? "Choose your stints directly below. The race lead can confirm the plan once everyone is assigned." :
        car.schedule_status === "open" ? `${vacancies} open slot${vacancies === 1 ? "" : "s"}. Drivers can book or release future stints for their own car.` :
          "Confirmed race plan. You can still mark preferences or arrange a trade with a teammate."}
      {!mine && writable && <p>Sign up for the race and ask a lead to add you to this car’s roster before booking.</p>}
      {!car.roster_confirmed && <p>Confirm 4–6 drivers in Teams before opening booking.</p>}
    </div>}
    {lead && !editor && <details className={styles.leadControls}><summary>Race lead controls</summary>
      <div className={styles.tools}>
        <button type="button" disabled={busy} onClick={openEditor}>{source.length?"Edit times and assignments":"Create stint slots"}</button>
        {car.schedule_status!=="open"&&<button type="button" disabled={busy||!source.length||!car.roster_confirmed} onClick={()=>void changeStatus("open")}>Open booking</button>}
        {car.schedule_status!=="confirmed"&&<button type="button" disabled={busy||!source.length||vacancies>0||needsQualifier||!car.roster_confirmed} onClick={()=>void changeStatus("confirmed")}>Confirm schedule</button>}
        {car.schedule_status!=="draft"&&<button type="button" disabled={busy} onClick={()=>void changeStatus("draft")}>Return to draft</button>}
      </div>
      {vacancies>0&&<p className={styles.hint}>{vacancies} race slots still need a driver before confirmation.</p>}
      {qualifyingFuture&&<label>Qualifying driver<select disabled={busy} value={car.qualifying_driver_id??""} onChange={(e)=>void qualifyingAction(e.target.value||null)}>
        <option value="">Open slot</option>{roster.map((r)=><option key={r.driver_id} value={r.driver_id}>{r.display_name}</option>)}</select></label>}
    </details>}
    {!editor && <button type="button" className={`${styles.row} ${styles.slot}`} disabled={busy} onClick={()=>setSelectedStint("qualifying")} aria-label={`Qualifying slot for car ${car.number}, ${car.qualifying_driver??"open slot"}`}>
      <span className={styles.rowHead}><strong>Qualifying · #{car.number}</strong><span>{car.qualifying_driver??"Open slot"}{car.qualifying_driver_id===data.me.id?" · you":""}</span></span>
      <span className={styles.slotTime}>{data.event.qualifying_starts_at?`${time(+new Date(data.event.qualifying_starts_at))} → ${time(+new Date(data.event.qualifying_starts_at)+data.event.qualifying_min*60000)} · ${zone} · ${data.event.qualifying_min} min`:"Qualifying time not scheduled."}</span>
      <span className={styles.slotAction}>View qualifying slot →</span>
    </button>}
    {!editor && <StintOffers data={data} carId={car.id} now={now} busy={busy} time={time} zone={zone} onTrade={onTrade} />}
    {editor ? <>
      <div className={styles.notice}>Change durations to move the following handovers together. Saving returns the plan to draft. Save or cancel before switching cars.</div>
      {stale && <div className={styles.warning} role="alert">Someone changed the schedule while you were editing. Your draft is preserved, but you must reload the latest plan before saving. <button type="button" onClick={openEditor}>Reload latest plan</button></div>}
      {start > now && <div className={styles.tools}>
        <label>Slot length (min)<input type="number" min={5} max={240} step={1} value={interval} onChange={(e) => setInterval(Number(e.target.value))} /></label>
        <button type="button" disabled={busy || stale} onClick={generate}>Generate open slots</button>
        <span>Replaces this unsaved draft with empty slots. The last slot ends at the race finish.</span>
      </div>}
      <div className={styles.rows}>{draft.map((s, i) => {
        const fixed = locked(s);
        return <article className={styles.row} key={s.key}>
          <div className={styles.rowHead}><strong>Stint {i + 1}</strong><span>{time(s.starts_at)} → {time(s.ends_at)}</span>{fixed && <span>Started · locked</span>}</div>
          <div className={styles.fields}>
            <label>Driver<select disabled={fixed || busy || stale} value={s.driver_id ?? ""} onChange={(e) => patch(s.key, { driver_id: e.target.value || null })}>
              <option value="">Open slot</option>
              {s.driver_id && !roster.some((r) => r.driver_id === s.driver_id) && <option value={s.driver_id}>{source.find((r) => r.id === s.id)?.driver ?? "Former roster driver"}</option>}
              {roster.map((r) => <option key={r.driver_id} value={r.driver_id}>{r.display_name}</option>)}
            </select></label>
            <label>Minutes<input type="number" min={1} max={240} step={1} disabled={fixed || busy || stale} value={s.minutes} onChange={(e) => patch(s.key, { minutes: Number(e.target.value) })} /></label>
            <label>Handover note<input maxLength={300} disabled={fixed || busy || stale} value={s.note} onChange={(e) => patch(s.key, { note: e.target.value })} /></label>
          </div>
          {!fixed && <div className={styles.tools}>
            <button type="button" disabled={busy || stale || s.minutes < 2 || draft.length >= 300} onClick={() => split(i)}>Split</button>
            <button type="button" disabled={busy || stale || !draft[i + 1] || locked(draft[i + 1]) || s.minutes + (draft[i + 1]?.minutes ?? 0) > 240} onClick={() => merge(i)}>Merge with next</button>
            <button type="button" disabled={busy || stale} onClick={() => setEditor((e) => e && ({ ...e, slots: e.slots.filter((r) => r.key !== s.key) }))}>Remove</button>
          </div>}
        </article>;
      })}</div>
      <div className={styles.tools}>
        <button type="button" disabled={busy || stale || draft.length >= 300} onClick={() => setEditor((e) => e && ({ ...e, slots: [...e.slots, newSlot(interval >= 5 && interval <= 240 ? interval : 65)] }))}>Add slot</button>
        {draft.length > 0 && !locked(draft[draft.length - 1]) && <button type="button" disabled={busy || stale || draft[draft.length - 1].minutes + (end - cursor) / 60000 < 1 || draft[draft.length - 1].minutes + (end - cursor) / 60000 > 240}
          onClick={() => patch(draft[draft.length - 1].key, { minutes: draft[draft.length - 1].minutes + (end - cursor) / 60000 })}>Fit last slot to race finish</button>}
      </div>
      <p className={invalid ? styles.warning : styles.hint} role="status">{Math.round((cursor - start) / 60000)} / {data.event.duration_min} minutes planned.
        {cursor !== end && ` Adjust by ${Math.round((end - cursor) / 60000)} minutes to reach the scheduled finish.`} Every slot must be 1–240 minutes.</p>
      {error && <p role="alert" className={styles.warning}>{error}</p>}
      <div className={styles.tools}>
        <button type="button" className={styles.primary} disabled={busy || stale || invalid} onClick={async () => {
          const ok = await onAction({ action: "save", revision: editor.revision, stints: draft.map((s) => ({
            id: s.id, driver_id: s.driver_id, starts_at: new Date(s.starts_at).toISOString(), ends_at: new Date(s.ends_at).toISOString(), note: s.note || null,
          })) }, "Schedule saved as draft. Review it, then open booking or confirm.");
          if (ok) setEditor(null);
        }}>Save draft schedule</button>
        <button type="button" disabled={busy} onClick={() => { setEditor(null); setError(null); }}>Cancel edits</button>
      </div>
    </> : <>
      {!source.length && <p className={styles.notice}>No stint slots yet. A race lead can create an empty schedule here, or build an assigned rotation in Strategy.</p>}
      <div className={styles.rows}>{source.filter((s)=>(!onlyMine||s.driver_id===data.me.id)&&(!onlyPreferred||data.preferences.some((p)=>p.stint_id===s.id&&p.driver_id===data.me.id))).map((s)=>{
        const future=+new Date(s.starts_at)>now,active=!future&&+new Date(s.ends_at)>now;
        const preferences=data.preferences.filter((p)=>p.stint_id===s.id);
        const preferred=preferences.some((p)=>p.driver_id===data.me.id);
        return <button type="button" className={`${styles.row} ${styles.slot}`} key={s.id} disabled={busy}
          data-active={active||undefined} data-preferred={preferred||undefined} data-mine={s.driver_id===data.me.id||undefined}
          onClick={()=>setSelectedStint(s.id)} aria-label={`Stint ${s.n}, ${s.driver??"open slot"}, ${time(+new Date(s.starts_at))} ${zone}`}>
          <span className={styles.rowHead}><strong>Stint {s.n} · {s.driver??"Open slot"}{s.driver_id===data.me.id?" · you":""}</strong><span>{Math.round((+new Date(s.ends_at)-+new Date(s.starts_at))/60000)} min{active?" · on track":!future?" · completed":""}</span></span>
          <span className={styles.slotTime}>{time(+new Date(s.starts_at))} → {time(+new Date(s.ends_at))} · {zone}</span>
          {s.note&&<span className={styles.note}>{s.note}</span>}
          {preferences.length>0&&<span className={styles.preferenceNames}>★ Preferred by: {preferences.map((p)=>p.driver_id===data.me.id?"you":p.display_name).join(", ")}</span>}
          <span className={styles.slotAction}>{writable&&future?s.driver_id===data.me.id?"Your stint · offer or swap →":s.driver_id?"Prefer, cover or swap →":"I want this stint →":"View stint →"}</span>
        </button>;
      })}</div>
      {onlyMine&&!source.some((s)=>s.driver_id===data.me.id)&&<p className={styles.notice}>You haven’t booked any stints for this car.</p>}
      {onlyPreferred&&!source.some((s)=>data.preferences.some((p)=>p.stint_id===s.id&&p.driver_id===data.me.id))&&<p className={styles.notice}>Click a stint and choose “Prefer this stint” to add it here.</p>}
      {roster.length > 0 && <div className={styles.totals}><h4>Planned time per driver</h4>{roster.map((r) => {
        const slots = source.filter((s) => s.driver_id === r.driver_id), minutes = Math.round(slots.reduce((sum, s) => sum + (+new Date(s.ends_at) - +new Date(s.starts_at)) / 60000, 0));
        return <p key={r.driver_id}><span>{r.display_name}</span><strong>{Math.floor(minutes / 60)}h {minutes % 60}m · {slots.length} stint{slots.length === 1 ? "" : "s"}{car.qualifying_driver_id===r.driver_id ? " + qualifying" : ""}</strong></p>;
      })}</div>}
    </>}
    {selectedStint&&<StintActions key={selectedStint} data={data} car={car} stintId={selectedStint} now={now} busy={busy}
      time={time} zone={zone} onAction={onAction} onTrade={onTrade} onPreference={onPreference} feedback={feedback} close={()=>setSelectedStint(null)} />}
  </section>;
}
