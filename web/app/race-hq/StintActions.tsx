"use client";
import { useEffect, useRef, useState } from "react";
import type { RaceHQData } from "@/lib/race-hq";
import styles from "./StintSchedule.module.css";
type Action = (body:unknown,message:string)=>Promise<boolean>;
export default function StintActions({data,car,stintId,now,busy,time,zone,onAction,onTrade,onPreference,close,feedback}:{
  data:RaceHQData;car:RaceHQData["cars"][number];stintId:string;now:number;busy:boolean;
  time:(ms:number)=>string;zone:string;onAction:Action;onTrade:Action;onPreference:Action;close:()=>void;feedback?:string|null;
}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [revision,setRevision]=useState(car.schedule_revision);
  const [recipient,setRecipient]=useState(""),[exchange,setExchange]=useState("");
  const [failed,setFailed]=useState(false);
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
  const qualifying=stintId==="qualifying";
  const slot=data.stints.find((s)=>s.id===stintId && s.event_car_id===car.id);
  const driverId=qualifying?car.qualifying_driver_id:slot?.driver_id??null;
  const driverName=qualifying?car.qualifying_driver:slot?.driver??null;
  const starts=qualifying?data.event.qualifying_starts_at:slot?.starts_at;
  const ends=qualifying&&starts?new Date(+new Date(starts)+data.event.qualifying_min*60000).toISOString():slot?.ends_at;
  const roster=data.rosters.filter((r)=>r.event_car_id===car.id);
  const mine=driverId===data.me.id;
  const member=roster.some((r)=>r.driver_id===data.me.id);
  const participant=data.signups.some((s)=>s.driver_id===data.me.id)||data.rosters.some((r)=>r.driver_id===data.me.id);
  const future=Boolean(starts && +new Date(starts)>now);
  const writable=data.event.status!=="finished"&&!data.event.archived_at&&!data.me.is_reviewer&&future;
  const stale=revision!==car.schedule_revision;
  const canDrive=writable&&member&&car.roster_confirmed;
  const booking=car.schedule_status!=="confirmed";
  const available=data.stints.filter((s)=>s.event_car_id===car.id&&+new Date(s.starts_at)>now);
  const ownSlots=available.filter((s)=>s.driver_id===data.me.id);
  const targetSlots=available.filter((s)=>s.driver_id===recipient);
  const preferred=data.preferences.some((p)=>p.stint_id===stintId&&p.driver_id===data.me.id);
  const preferenceNames=data.preferences.filter((p)=>p.stint_id===stintId).map((p)=>p.display_name);
  const label=qualifying?"Qualifying":`Stint ${slot?.n??"removed"}`;
  async function run(action:()=>Promise<boolean>,dismiss=true) {
    setFailed(false);
    if(await action()){if(dismiss)close();}else setFailed(true);
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="stint-action-title"
    onCancel={(e)=>{e.preventDefault();if(!busy)close();}}
    onClick={(e)=>{if(e.target===e.currentTarget&&!busy)close();}}>
    <div className={styles.dialogBody}>
      <header className={styles.header}><div><p className={styles.hint}>Car #{car.number} · {car.name}</p><h3 id="stint-action-title">{label}</h3></div><button type="button" disabled={busy} onClick={close} aria-label="Close stint details">Close</button></header>
      <p className={styles.dialogTime}>{starts&&ends?`${time(+new Date(starts))} → ${time(+new Date(ends))} · ${zone}`:"This slot is no longer scheduled."}</p>
      <p className={styles.notice}>Assigned driver: <strong>{driverName??"Open slot"}{mine?" · you":""}</strong></p>
      {slot?.note&&<p className={styles.note}>{slot.note}</p>}
      {stale&&<p className={styles.warning} role="status">The schedule changed while this was open. Review the latest details before booking or trading. <button type="button" disabled={busy} onClick={()=>{setRevision(car.schedule_revision);setExchange("");setRecipient("");setFailed(false);}}>Use latest details</button></p>}
      {!qualifying && writable && <div className={styles.preferenceBox}>
        <button type="button" aria-pressed={preferred} disabled={busy||!participant} onClick={()=>void run(()=>onPreference({stint_id:stintId,preferred:!preferred},
          preferred?"Preference removed.":"Your preference is visible to the team."),false)}>{preferred?"★ Preferred · remove preference":"☆ Prefer this stint"}</button>
        <p className={styles.hint}>Shows when you’d like to drive. The assigned driver stays the same.</p>
        {!participant&&<p className={styles.hint}>Sign up for this race to mark your preferences.</p>}
        {preferenceNames.length>0&&<p className={styles.hint}>Preferred by: {preferenceNames.join(", ")}</p>}
      </div>}
      {!future && <p className={styles.hint}>Started and completed stints are locked.</p>}
      {writable&&!canDrive&&<p className={styles.hint}>To book or trade, join this car’s confirmed roster in Teams.</p>}
      {canDrive && !driverId && booking && <button type="button" className={styles.primary} disabled={busy||stale} onClick={()=>void run(()=>onAction(
        qualifying?{action:"qualifier",driver_id:data.me.id,revision}:{action:"claim",stint_id:stintId,revision},"You’re assigned to this stint."))}>I’ll drive this stint</button>}
      {canDrive && booking && mine && <button type="button" disabled={busy||stale} onClick={()=>void run(()=>onAction(
        qualifying?{action:"qualifier",driver_id:null,revision}:{action:"release",stint_id:stintId,revision},"Your stint was released."))}>Release my stint</button>}
      {canDrive&&!booking&&(!driverId||qualifying)&&<p className={styles.hint}>This plan is confirmed. A race lead can reopen booking for changes.</p>}
      {canDrive&&!qualifying&&driverId && (mine||roster.some((r)=>r.driver_id===driverId)) && <section className={styles.tradeForm} aria-label="Arrange a stint trade">
        <h4>{mine?"Offer your stint to a teammate":"Ask to drive this stint"}</h4>
        <p className={styles.hint}>The other driver must accept. Until then, both assignments stay as they are.</p>
        {mine?<><label>Teammate<select disabled={busy||stale} value={recipient} onChange={(e)=>{setRecipient(e.target.value);setExchange("");}}><option value="">Choose a teammate…</option>{roster.filter((r)=>r.driver_id!==data.me.id).map((r)=><option key={r.driver_id} value={r.driver_id}>{r.display_name}</option>)}</select></label>
          {recipient&&<label>In exchange for<select disabled={busy||stale} value={exchange} onChange={(e)=>setExchange(e.target.value)}><option value="">Nothing · ask them to cover my stint</option>{targetSlots.map((s)=><option key={s.id} value={s.id}>Stint {s.n} · {time(+new Date(s.starts_at))}</option>)}</select></label>}
          <button type="button" disabled={busy||stale||!recipient} onClick={()=>void run(()=>onTrade({action:"offer",to_driver_id:recipient,give_stint_id:stintId,take_stint_id:exchange||null},"Offer sent. Your teammate can accept it in Stints."))}>{exchange?"Propose swap":"Ask teammate to cover"}</button>
        </>:<><label>Offer one of your stints<select disabled={busy||stale} value={exchange} onChange={(e)=>setExchange(e.target.value)}><option value="">No swap · I’d like to cover it</option>{ownSlots.map((s)=><option key={s.id} value={s.id}>Stint {s.n} · {time(+new Date(s.starts_at))}</option>)}</select></label>
          <button type="button" disabled={busy||stale} onClick={()=>void run(()=>onTrade({action:"offer",to_driver_id:driverId,give_stint_id:exchange||null,take_stint_id:stintId},"Request sent. The assigned driver needs to accept."))}>{exchange?"Propose swap":"Request this stint"}</button>
        </>}
      </section>}
      {canDrive&&qualifying&&driverId&&!mine&&<p className={styles.hint}>A race lead can change the qualifying assignment.</p>}
      {failed&&<p className={styles.warning} role="alert">{feedback||"That change could not be saved. Review the latest schedule and try again."}</p>}
    </div>
  </dialog>;
}
