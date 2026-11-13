"use client";
import {useState} from "react";
import type {RaceHQData} from "@/lib/race-hq";
import styles from "./RaceHQ.module.css";
type Action=(carId:string,body:unknown,message:string,onError?:(message:string)=>void)=>Promise<boolean>;
export default function PlanningDrivers({data,carId,busy,onAction}:{data:RaceHQData;carId:string;busy:boolean;onAction:Action}) {
  const [name,setName]=useState(""),[links,setLinks]=useState<Record<string,string>>({}),[error,setError]=useState<string|null>(null);
  const people=(data.planning_drivers??[]).filter(p=>p.event_car_id===carId);
  const roster=data.rosters.filter(r=>r.event_car_id===carId);
  const other=new Set(data.rosters.filter(r=>r.event_car_id!==carId).map(r=>r.driver_id));
  const writable=data.can_lead&&data.event.status!=="finished"&&!data.event.archived_at;
  async function perform(body:unknown,message:string) {
    setError(null);let failure="The planning driver was not saved.";
    try {const ok=await onAction(carId,body,message,m=>{failure=m;});if(!ok)setError(failure);return ok;}
    catch(e){setError(e instanceof Error?e.message:failure);return false;}
  }
  return <div className="mt-5 border-t border-white/10 pt-4">
    <h5 className="font-semibold text-white">Planning drivers · awaiting Discord</h5>
    <p className="mt-2 text-xs text-zinc-400">Reserve stints by name before signup. Link the person’s Discord profile here after they join; all reserved stints move to their account.</p>
    {people.map(person=><article key={person.id} className="mt-3 rounded-lg border border-white/15 p-3">
      <p className="text-sm font-semibold text-amber-200">{person.name} · awaiting Discord</p>
      {writable&&<><label className="mt-3 block text-xs text-zinc-300">Signed-up Discord driver
        <select className="mt-1 w-full rounded-lg border border-white/20 bg-zinc-900 p-2 text-sm text-white" disabled={busy} value={links[person.id]??""} onChange={e=>setLinks(all=>({...all,[person.id]:e.target.value}))}>
          <option value="">Choose their account after signup…</option>
          {data.signups.filter(s=>!other.has(s.driver_id)).map(s=><option key={s.driver_id} value={s.driver_id}>{s.display_name}</option>)}
        </select>
      </label><div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className={styles.primary} disabled={busy||!links[person.id]} onClick={()=>void perform({action:"link",planning_driver_id:person.id,driver_id:links[person.id]},`${person.name} linked. Their stints are now in their account.`)}>Link account & assign stints</button>
        <button type="button" className="text-xs text-zinc-400" disabled={busy} onClick={()=>void perform({action:"remove",planning_driver_id:person.id},`${person.name} planning spot removed.`)}>Remove planning spot</button>
      </div></>}
    </article>)}
    {!people.length&&<p className="mt-3 text-xs text-zinc-500">No planning drivers for this car.</p>}
    {writable&&<details className="mt-4"><summary className="cursor-pointer text-sm text-accent">Add driver before Discord signup</summary>
      <form className="mt-3 space-y-3" onSubmit={async e=>{e.preventDefault();if(await perform({action:"add",name},`${name.trim()} added as a planning driver.`))setName("");}}>
        <label className="block text-sm text-zinc-300">Driver name<input className="mt-1 w-full rounded-lg border border-white/20 bg-zinc-900 p-2 text-white" required maxLength={80} value={name} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="Name your team knows them by" /></label>
        <button className={styles.primary} disabled={busy||!name.trim()||roster.length+people.length>=6}>Add planning driver</button>
        {roster.length+people.length>=6&&<p className="text-xs text-amber-200">This car already has six joined or planning drivers.</p>}
      </form>
    </details>}
    {error&&<p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
  </div>;
}
