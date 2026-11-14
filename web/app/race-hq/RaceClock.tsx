"use client";
import {useEffect,useRef,useState} from "react";
import type {RaceEvent} from "@/lib/race-hq";
import {raceClock,raceClockText} from "@/lib/race-clock";
import styles from "./RaceClock.module.css";
type Action=(body:unknown,message:string)=>Promise<boolean>;
type Props={event:RaceEvent;now:number;canLead:boolean;busy:boolean;onSync:Action;feedback?:string|null;connection:"online"|"offline"|"reconnecting"};
const utc=(ms:number)=>new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).format(ms);
export default function RaceClock({event,now,canLead,busy,onSync,feedback,connection}:Props){
  const clock=raceClock(event,now),[editing,setEditing]=useState(false);
  const label=clock.phase==="upcoming"?"RACE STARTS IN":clock.phase==="finished"?"RACE COMPLETE":clock.phase==="elapsed"?"RACE TIMER ELAPSED":"RACE LIVE";
  const source=clock.source==="acc"?"ACC timing":clock.source==="manual"?"Lead synced":"Schedule estimate";
  return <section className={styles.clock} aria-label="Race clock">
    <header><span className={clock.phase==="live"?styles.live:styles.phase}>{label}</span>
      {canLead&&clock.phase!=="finished"&&<button type="button" onClick={()=>setEditing(true)} disabled={busy}>Sync race clock</button>}</header>
    <div className={styles.timer} role="timer" aria-live="off" aria-label={clock.phase==="upcoming"?"Time until race start":"Race time remaining"}>{raceClockText(clock.remaining)}</div>
    <p className={styles.caption}>{clock.phase==="upcoming"?"Until scheduled green flag":clock.phase==="elapsed"?"Timer reached zero · final lap / finish still needs confirmation":"TIME REMAINING"}</p>
    <div className={styles.progress} role="progressbar" aria-label="Race elapsed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clock.progress)}><span style={{width:clock.progress+"%"}}/></div>
    <div className={styles.summary}><span>{raceClockText(clock.elapsed)} elapsed</span><span>{source}</span></div>
    {clock.phase!=="finished"&&<p className={styles.detail}>{clock.phase==="upcoming"?"Green flag: ":"Expected timer zero: "}{utc(clock.phase==="upcoming"?Date.parse(event.starts_at):clock.finishAt)} UTC</p>}
    {clock.syncedAt!==null&&<p className={styles.detail}>Last {clock.source==="acc"?"ACC update":"lead sync"}: {utc(clock.syncedAt)} UTC{clock.source==="acc"&&clock.syncAge!==null&&clock.syncAge>30?" · continuing from that reading":""}</p>}
    {clock.source==="schedule"&&clock.phase!=="upcoming"&&clock.phase!=="finished"&&<p className={styles.detail}>Using the timetable. A race lead can match this to ACC with “Sync race clock”.</p>}
    {connection!=="online"&&<p className={styles.warning} role="status">{connection==="offline"?"Offline · continuing the last known clock.":"Refreshing the shared race clock…"}</p>}
    {editing&&<ClockSync event={event} now={now} busy={busy} feedback={feedback} connection={connection} onSync={onSync} close={()=>setEditing(false)}/>}
  </section>;
}
function ClockSync({event,now,busy,onSync,close,feedback,connection}:{event:RaceEvent;now:number;busy:boolean;onSync:Action;close:()=>void;feedback?:string|null;connection:Props["connection"]}){
  const clock=raceClock(event,now),initial=clock.phase==="upcoming"?event.duration_min*60:clock.remaining;
  const [fields,setFields]=useState(()=>raceClockText(initial).split(":")),[failed,setFailed]=useState(false);
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const node=ref.current;node?.showModal();return()=>node?.close();},[]);
  const values=fields.map(Number),seconds=values[0]*3600+values[1]*60+values[2];
  const valid=fields.every(v=>/^\d{1,2}$/.test(v))&&values[0]>=0&&values[1]>=0&&values[1]<60&&values[2]>=0&&values[2]<60&&seconds<=event.duration_min*60;
  async function save(body:unknown,message:string){setFailed(false);if(await onSync(body,message))close();else setFailed(true);}
  return <dialog className={styles.dialog} ref={ref} aria-labelledby="clock-sync-title" onCancel={e=>{e.preventDefault();if(!busy)close();}} onClick={e=>{if(e.target===e.currentTarget&&!busy)close();}}>
    <div className={styles.dialogBody}><header><h3 id="clock-sync-title">Sync race clock to ACC</h3><button type="button" disabled={busy} onClick={close}>Close</button></header>
      <p>Check the in-game <strong>time remaining</strong>, enter it below, then press Sync. This sets the shared clock for both cars and everyone viewing from their phone.</p>
      <form onSubmit={async e=>{e.preventDefault();if(valid)await save({action:"clock",mode:"manual",status:"live",remaining_s:seconds,observed_at:new Date(now).toISOString()},"Race clock synced. Everyone sees the updated time remaining.");}}>
        <div className={styles.fields}>{["Hours","Minutes","Seconds"].map((label,i)=><label key={label}>{label}<input aria-label={label} inputMode="numeric" type="number" min={0} max={i===0?24:59} required value={fields[i]} disabled={busy} onChange={e=>{const value=e.target.value;setFields(all=>all.map((v,n)=>n===i?value:v));}}/></label>)}</div>
        <p className={styles.detail}>The shared countdown keeps running after you close this page. Your sync stays in control until a lead chooses automatic timing.</p>
        {!valid&&<p role="status" className={styles.warning}>Enter a valid time between 00:00:00 and {raceClockText(event.duration_min*60)}.</p>}
        <button className={styles.primary} disabled={busy||!valid||connection!=="online"}>{busy?"Syncing…":"Sync to this time remaining"}</button>
      </form>
      {event.clock_mode==="manual"&&<button type="button" disabled={busy||connection!=="online"} onClick={()=>void save({action:"clock",mode:"auto"},"Automatic timing enabled. ACC updates can now refresh the clock.")}>Use automatic timing</button>}
      <p className={styles.detail}>Automatic timing uses ACC updates when available, otherwise the last synced clock or the scheduled start.</p>
      {failed&&<p className={styles.warning} role="alert">{feedback??"The clock could not be synced. Refresh and try again."}</p>}
    </div>
  </dialog>;
}
