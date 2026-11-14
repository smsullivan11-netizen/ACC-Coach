export type ClockInput = {
  starts_at:string;duration_min:number;status:"upcoming"|"live"|"finished";archived_at?:string|null;
  clock_source:"schedule"|"manual"|"acc"|null;clock_remaining_s:number|null;clock_updated_at:string|null;
  clock_mode?:"auto"|"manual";clock_manual_remaining_s?:number|null;clock_manual_updated_at?:string|null;
};
export function raceClock(event:ClockInput,now:number) {
  const total=event.duration_min*60,start=Date.parse(event.starts_at);
  const manual=event.clock_mode==="manual"&&event.clock_manual_remaining_s!=null&&event.clock_manual_updated_at!=null;
  const seconds=manual?event.clock_manual_remaining_s!:event.clock_remaining_s;
  const updated=manual?event.clock_manual_updated_at!:event.clock_updated_at;
  const at=updated?Date.parse(updated):NaN;
  const anchored=Number.isFinite(at)&&seconds!=null&&Number.isFinite(seconds)&&seconds>=0&&(manual||event.clock_source==="manual"||event.clock_source==="acc");
  const source=manual?"manual":anchored?event.clock_source!:"schedule";
  const finished=event.status==="finished"||Boolean(event.archived_at);
  const before=!finished&&!anchored&&event.status!=="live"&&now<start;
  const finishAt=anchored?at+seconds!*1000:start+total*1000;
  const remaining=finished?0:Math.max(0,Math.ceil(((before?start:finishAt)-now)/1000));
  const phase=finished?"finished":before?"upcoming":remaining===0?"elapsed":"live";
  const elapsed=before?0:Math.max(0,Math.min(total,total-remaining));
  return {phase,source,remaining,elapsed,progress:total>0?elapsed/total*100:0,finishAt,
    syncedAt:anchored?at:null,syncAge:anchored?Math.max(0,Math.floor((now-at)/1000)):null,
    mode:event.clock_mode??"auto"};
}
export const raceClockText=(seconds:number)=>{
  const n=Math.max(0,Math.floor(seconds));
  return [Math.floor(n/3600),Math.floor(n%3600/60),n%60].map(v=>String(v).padStart(2,"0")).join(":");
};
export const raceClockSample=(serverMs:number,sentAt:number,receivedAt:number)=>({
  serverMs:serverMs+Math.max(0,receivedAt-sentAt)/2,clientMs:receivedAt,
});
export const alignedRaceTime=(sample:{serverMs:number;clientMs:number},monotonicNow:number)=>
  sample.serverMs+Math.max(0,monotonicNow-sample.clientMs);
