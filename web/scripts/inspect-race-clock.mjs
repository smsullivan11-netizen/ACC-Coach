// Read-only deployment verification. Logs race timing metadata, never credentials.
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import postgres from "postgres";
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync("lib/race-clock.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
const sql=postgres(process.env.DATABASE_URL.trim(),{max:1,prepare:false,onnotice:()=>{}});
try{
  await sql.begin(async tx=>{
    await tx`set transaction isolation level repeatable read, read only`;
    const [event]=await tx`select id,status,duration_min,clock_source,clock_mode,clock_remaining_s,clock_manual_remaining_s,
      to_char(starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as starts_at,
      to_char(clock_updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as clock_updated_at,
      to_char(clock_manual_updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as clock_manual_updated_at,
      to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as server_now
      from event where archived_at is null and status in ('upcoming','live') order by starts_at limit 1`;
    if(!event){console.log("Race clock verification: no active event");return;}
    const clock=exports.raceClock(event,Date.parse(event.server_now));
    console.log("Race clock verification:",JSON.stringify({event_id:event.id,saved_status:event.status,display_phase:clock.phase,source:clock.source,mode:clock.mode,
      remaining:exports.raceClockText(clock.remaining),server_now:event.server_now,last_sync:clock.syncedAt===null?null:new Date(clock.syncedAt).toISOString()}));
  });
}finally{await sql.end();}
