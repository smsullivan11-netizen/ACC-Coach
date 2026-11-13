"use client";
import type { RaceHQData } from "@/lib/race-hq";
import styles from "./StintSchedule.module.css";
export default function StintOffers({data,carId,now,busy,time,zone,onTrade}:{
  data:RaceHQData;carId:string;now:number;busy:boolean;time:(ms:number)=>string;zone:string;
  onTrade:(body:unknown,message:string)=>Promise<boolean>;
}) {
  const offers=data.trades.filter((t)=>t.event_car_id===carId);
  if(!offers.length)return null;
  return <section className={styles.offers} aria-label="Stint offers"><h4>Your stint offers</h4><p className={styles.hint}>Both drivers must agree before an assignment changes.</p>
    {offers.map((t)=>{
      const incoming=t.to_driver_id===data.me.id;
      const matches=(id:string|null,owner:string,a:string|null,b:string|null)=>!id||data.stints.some((s)=>s.id===id&&s.driver_id===owner&&s.starts_at===a&&s.ends_at===b&&+new Date(s.starts_at)>now);
      const current=matches(t.give_stint_id,t.from_driver_id,t.give_starts_at,t.give_ends_at)&&matches(t.take_stint_id,t.to_driver_id,t.take_starts_at,t.take_ends_at);
      const future=t.give_stint_id?data.stints.find((s)=>s.id===t.give_stint_id):data.stints.find((s)=>s.id===t.take_stint_id);
      const describe=(n:number|null,a:string|null,b:string|null)=>`Stint ${n??"removed"} · ${a?time(+new Date(a)):"—"} → ${b?time(+new Date(b)):"—"} · ${zone}`;
      return <article className={styles.row} key={t.id}><strong>{incoming?`${t.from_driver} sent you a ${t.give_stint_id&&t.take_stint_id?"swap":"cover"} request`:`Waiting for ${t.to_driver}`}</strong>
        {t.give_stint_id&&<p className={styles.hint}>{t.from_driver} → {t.to_driver}: {describe(t.give_n,t.give_starts_at,t.give_ends_at)}</p>}
        {t.take_stint_id&&<p className={styles.hint}>{t.to_driver} → {t.from_driver}: {describe(t.take_n,t.take_starts_at,t.take_ends_at)}</p>}
        {!current&&<p className={styles.warning}>An assignment or time changed. This offer can no longer be accepted.</p>}
        <div className={styles.tools}>{incoming?<><button type="button" className={styles.primary} disabled={busy||!current||!future||data.event.status==="finished"||Boolean(data.event.archived_at)} onClick={()=>void onTrade({action:"accept",trade_id:t.id},"Offer accepted. Both drivers’ schedules are updated.")}>Accept {t.give_stint_id&&t.take_stint_id?"swap":"cover"}</button><button type="button" disabled={busy} onClick={()=>void onTrade({action:"decline",trade_id:t.id},"Offer declined. Assignments are unchanged.")}>Decline</button></>:<button type="button" disabled={busy} onClick={()=>void onTrade({action:"cancel",trade_id:t.id},"Offer cancelled.")}>Cancel offer</button>}</div>
      </article>;
    })}
  </section>;
}
