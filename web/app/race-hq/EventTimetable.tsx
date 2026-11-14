"use client";
import { useState } from "react";
import type { RaceHQData } from "@/lib/race-hq";
import type { Agenda } from "@/lib/race-agenda";
import styles from "./StintSchedule.module.css";
const phases = [["practice","Practice"],["briefing","Driver briefing"],["qualifying","Qualifying"]] as const;
export default function EventTimetable({ data, busy, onSave }: {
  data: RaceHQData; busy: boolean; onSave: (body: unknown) => Promise<boolean>;
}) {
  const event = data.event;
  const [editor,setEditor] = useState<{revision:number;agenda:Agenda}|null>(null);
  const time = (iso:string) => new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(iso));
  const open = () => {
    const start=+new Date(event.starts_at);
    setEditor({revision:event.timing_revision,agenda:{
      starts_at:event.starts_at,duration_min:event.duration_min,
      practice_starts_at:event.practice_starts_at??new Date(start-90*60000).toISOString(),practice_min:event.practice_min,
      briefing_starts_at:event.briefing_starts_at??new Date(start-40*60000).toISOString(),briefing_min:event.briefing_min,
      qualifying_starts_at:event.qualifying_starts_at??new Date(start-30*60000).toISOString(),qualifying_min:event.qualifying_min,
    }});
  };
  const stale=Boolean(editor && editor.revision!==event.timing_revision);
  const patch=(values:Partial<Agenda>)=>setEditor((e)=>e&&({...e,agenda:{...e.agenda,...values}}));
  const field=(key:keyof Agenda,label:string) => <label>{label} (UTC)<input required type="datetime-local" value={String(editor!.agenda[key]).slice(0,16)}
    onChange={(e)=>{if(e.target.value)patch({[key]:new Date(e.target.value+"Z").toISOString()});}} /></label>;
  return <section className={styles.panel} aria-label="Event timetable">
    <header className={styles.header}><div><h3>Event timetable</h3><p>All session times below are UTC.</p></div>
      {!editor && data.can_lead && event.status==="upcoming" && !event.archived_at && <button type="button" disabled={busy} onClick={open}>Edit timetable</button>}</header>
    {editor ? <form onSubmit={async(e)=>{e.preventDefault();if(await onSave({revision:editor.revision,agenda:editor.agenda}))setEditor(null);}}>
      {stale && <p className={styles.warning} role="alert">The timetable changed. <button type="button" onClick={open}>Reload latest timetable</button></p>}
      <fieldset disabled={busy||stale} className={styles.rows}>
        {phases.map(([key,label])=><div className={styles.fields} key={key}>{field(`${key}_starts_at`,label)}
          <label>Minutes<input type="number" min={1} max={240} required value={editor.agenda[`${key}_min`]} onChange={(e)=>patch({[`${key}_min`]:Number(e.target.value)})} /></label></div>)}
        <div className={styles.fields}>{field("starts_at","Race start")}<label>Race minutes<input type="number" min={30} max={1440} required disabled={data.stints.length>0} value={editor.agenda.duration_min} onChange={(e)=>patch({duration_min:Number(e.target.value)})} /></label></div>
      </fieldset>
      <p className={styles.notice}>Moving the race start shifts both cars’ stints together, preserving drivers, notes and durations. Plans return to draft for review. Race duration stays fixed while stint plans exist.</p>
      <div className={styles.tools}><button disabled={busy||stale} className={styles.primary}>Save timetable</button><button disabled={busy} type="button" onClick={()=>setEditor(null)}>Cancel</button></div>
    </form> : <div className={styles.rows}>
      {phases.map(([key,label])=><div className={styles.rowHead} key={key}><strong>{label}</strong><span>{event[`${key}_starts_at`] ? time(event[`${key}_starts_at`]!) : "Not scheduled"} UTC · {event[`${key}_min`]} min</span></div>)}
      <div className={styles.rowHead}><strong>Race</strong><span>{time(event.starts_at)} UTC · {event.duration_min/60} hours</span></div>
      <p className={styles.hint}>Scheduled finish: {time(new Date(+new Date(event.starts_at)+event.duration_min*60000).toISOString())} UTC.</p>
    </div>}
  </section>;
}
