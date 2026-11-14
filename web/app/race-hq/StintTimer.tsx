"use client";
import {useState} from "react";
import type {RaceHQData} from "@/lib/race-hq";
import {raceClockText} from "@/lib/race-clock";
import styles from "./StintTimer.module.css";
export default function StintTimer({data,car,now,busy,onAction,feedback}:{data:RaceHQData;car:RaceHQData["cars"][number];now:number;busy:boolean;feedback?:string|null;onAction:(body:unknown,message:string)=>Promise<boolean>}){
  const [minutes,setMinutes]=useState(data.strategies.find(s=>s.event_car_id===car.id)?.stint_min??65),[failed,setFailed]=useState(false);
  const started=car.stint_timer_started_at?Date.parse(car.stint_timer_started_at):null;
  const elapsed=started===null?0:Math.max(0,Math.floor((now-started)/1000));
  const remaining=(car.stint_timer_duration_min??minutes)*60-elapsed;
  const canControl=(data.can_lead||data.rosters.some(r=>r.event_car_id===car.id&&r.driver_id===data.me.id))&&!data.me.is_reviewer&&data.event.status!=="finished"&&!data.event.archived_at;
  async function act(action:"start"|"clear"){
    if(started!==null&&!window.confirm(action==="start"?"Start the next stint now? This replaces the current stint timer.":"Clear this car’s stint timer?"))return;
    setFailed(false);
    const ok=await onAction({action,revision:car.stint_timer_revision??0,...(action==="start"?{duration_min:minutes}:{})},
      action==="start"?"Stint timer started for this car.":"Stint timer cleared.");
    if(!ok)setFailed(true);
  }
  return <section className={styles.timer} aria-label={`Car ${car.number} stint timer`}>
    <header><h4>Stint timer · #{car.number}</h4><span>{started===null?"Ready for next handover":remaining<0?"Target exceeded":"Running"}</span></header>
    {started===null?<p className={styles.hint}>Hit Start at the actual handover. This timer is shared with the team.</p>:<div className={styles.readings}>
      <div><small>{remaining<0?"Over target":"Stint remaining"}</small><strong role="timer" aria-live="off">{remaining<0?"+":""}{raceClockText(Math.abs(remaining))}</strong></div>
      <div><small>Elapsed</small><strong>{raceClockText(elapsed)}</strong></div>
    </div>}
    {started!==null&&<p className={styles.hint}>Started {new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).format(started)} UTC · {car.stint_timer_duration_min} min target</p>}
    {canControl&&<div className={styles.controls}><label>Target minutes<input type="number" inputMode="numeric" min={1} max={240} value={minutes} disabled={busy} onChange={e=>setMinutes(Number(e.target.value))}/></label>
      <button type="button" disabled={busy||!Number.isInteger(minutes)||minutes<1||minutes>240} onClick={()=>void act("start")}>{started===null?"Start stint now":"Start next stint"}</button>
      {started!==null&&<button type="button" disabled={busy} onClick={()=>void act("clear")}>Clear timer</button>}
    </div>}
    <p className={styles.hint}>The timer keeps running when you leave the page. Set the target before starting the next stint.</p>
    {failed&&<p role="alert" className={styles.error}>{feedback??"The timer was not updated. Refresh and try again."}</p>}
  </section>;
}
