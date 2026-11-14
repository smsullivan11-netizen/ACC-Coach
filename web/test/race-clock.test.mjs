import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

// Run the real route handlers and tagged SQL against isolated PostgreSQL. No live credentials.
function adapter(conn) {
  const sql = (parts, ...values) => {
    if (!parts.raw) return { list: parts };
    const args = [];
    let query = parts[0];
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (value && typeof value === "object" && "list" in value) {
        query += "(" + value.list.map((v) => { args.push(v); return "$" + args.length; }).join(",") + ")";
      } else { args.push(value); query += "$" + args.length; }
      query += parts[i + 1];
    }
    return conn.query(query, args).then((r) => r.rows);
  };
  sql.begin = (fn) => conn.transaction((tx) => fn(adapter(tx)));
  return sql;
}


const pure={};
vm.runInNewContext(ts.transpileModule(readFileSync("lib/race-clock.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:pure});
const {raceClock,raceClockText,raceClockSample,alignedRaceTime}=pure;
const green=Date.parse("2026-11-14T10:30:00Z");
const scheduled={starts_at:new Date(green).toISOString(),duration_min:1440,status:"upcoming",archived_at:null,
  clock_source:"schedule",clock_remaining_s:null,clock_updated_at:null,clock_mode:"auto",clock_manual_remaining_s:null,clock_manual_updated_at:null};
await test("countdown switches to race time at green flag even without a desktop update",()=>{
  assert.equal(raceClock(scheduled,green-1).remaining,1);
  const start=raceClock(scheduled,green);assert.equal(start.phase,"live");assert.equal(start.remaining,86400);
  const later=raceClock(scheduled,green+7200000);assert.equal(later.phase,"live");assert.equal(later.remaining,79200);assert.equal(later.elapsed,7200);
});
await test("a late-start manual reading defines the correct shared finish and counts continuously",()=>{
  const at=green+7200000+123000,event={...scheduled,clock_mode:"manual",clock_manual_remaining_s:79200,clock_manual_updated_at:new Date(at).toISOString()};
  const reading=raceClock(event,at+15000);assert.equal(reading.remaining,79185);assert.equal(reading.source,"manual");
  assert.equal(reading.finishAt,green+86400000+123000);assert.equal(raceClockText(reading.remaining),"21:59:45");
});
await test("legacy-host ACC writes cannot overwrite a lead’s dedicated manual anchor",()=>{
  const at=green+7200000,event={...scheduled,status:"live",clock_mode:"manual",clock_manual_remaining_s:72000,clock_manual_updated_at:new Date(at).toISOString(),
    clock_source:"acc",clock_remaining_s:12,clock_updated_at:new Date(at+10000).toISOString()};
  assert.equal(raceClock(event,at+30000).remaining,71970);assert.equal(raceClock(event,at+30000).source,"manual");
  const automatic=raceClock({...event,clock_mode:"auto"},at+15000);assert.equal(automatic.source,"acc");assert.equal(automatic.remaining,7);
});
await test("zero remaining signals the final lap without auto-archiving the race",()=>{
  const ended=raceClock(scheduled,green+86400000);assert.equal(ended.remaining,0);assert.equal(ended.phase,"elapsed");assert.equal(ended.progress,100);
  assert.equal(raceClock({...scheduled,status:"finished"},green).phase,"finished");
  assert.equal(raceClock({...scheduled,archived_at:new Date(green).toISOString()},green).remaining,0);
});
await test("phone time uses the server sample and monotonic elapsed time, then realigns after resume",()=>{
  const sample=raceClockSample(green+7200000,1000,1200);
  assert.equal(alignedRaceTime(sample,11200),green+7210100);
  // A backgrounded phone may suspend its timer; the new server sample replaces that old base.
  const resumed=raceClockSample(green+7800000,11200,11600);
  assert.equal(alignedRaceTime(resumed,12600),green+7801200);
  assert.equal(raceClock(scheduled,alignedRaceTime(resumed,12600)).phase,"live");
});
await test("clock API, database and fresh viewer agree on a shared authoritative reading",async(t)=>{
  const db=new PGlite();
  try {
    await db.exec(`create table driver(id bigint primary key,display_name text,avatar_url text,discord_id text,is_admin boolean default false);
      insert into driver(id,display_name) select n,'Driver '||n from generate_series(1,9) n;
      create table event(id bigint generated always as identity primary key,title text,track_key text,starts_at timestamptz,duration_min int,kind text,league text,server text,notes text,min_pit_stops int,created_by bigint references driver);`);
    for(const path of ["../../db/migrations/0020_race_hq.sql","../scripts/migrations/0021_race_signups.sql","../scripts/migrations/0022_car_teams.sql","../scripts/migrations/0024_stint_booking.sql","../scripts/migrations/0025_race_agenda_and_qualifying.sql","../scripts/migrations/0026_stint_trades.sql","../scripts/migrations/0027_planning_drivers.sql"])
      await db.exec(readFileSync(new URL(path,import.meta.url),"utf8"));
    await db.exec("insert into event(title,starts_at,duration_min,status,archived_at,clock_source,clock_remaining_s,clock_updated_at) values('Old manual',now()-interval '2 days',1440,'finished',now()-interval '1 day','manual',3600,now()-interval '1 hour')");
    await db.exec(readFileSync(new URL("../scripts/migrations/0028_race_clock.sql",import.meta.url),"utf8"));
    const old=(await db.query("select clock_mode,clock_manual_remaining_s from event where id=1")).rows[0];
    assert.equal(old.clock_mode,"manual");assert.equal(old.clock_manual_remaining_s,3600);
    let me = null;
    const sql = adapter(db), cache = new Map();
    function load(path) {
      path = resolve(path);
      if (cache.has(path)) return cache.get(path);
      const exports = {}; cache.set(path, exports);
      const js = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      vm.runInNewContext(js, { exports, Response, URL, console, require: (id) => {
        if (id === "server-only") return {};
        if (id === "@/lib/auth") return { currentDriver: async () => me, driverFromRequest: async () => me };
        if (id === "@/lib/db" || id === "./db") return { sql };
        if (id.startsWith("@/")) return load(resolve(id.slice(2)) + ".ts");
        if (id.startsWith("./")) return load(resolve(path, "..", id) + ".ts");
        throw new Error("Unexpected dependency: " + id);
      }});
      return exports;
    }

    const route=load("app/api/race-hq/[id]/route.ts"),live=load("app/api/race-hq/live/route.ts"),hq=load("lib/race-hq.ts");
    const start=new Date(Date.now()-7200000).toISOString();
    await db.query("insert into event(title,track_key,starts_at,duration_min,status,clock_source) values('Live race','nurburgring_24h',$1,1440,'upcoming','schedule')",[start]);
    await db.exec("insert into event_car(event_id,number,name,roster_confirmed) values(2,'330','A',true)");
    await db.exec("insert into event_role(event_id,driver_id,role) values(2,1,'lead')");
    await db.exec("insert into event_car_driver(event_id,event_car_id,driver_id) select 2,1,n from generate_series(2,5) n");
    const as=id=>{me={id:String(id),display_name:"Driver "+id,is_admin:false};};
    const request=(path,body,origin="https://example.com")=>new Request("https://example.com"+path,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
    const change=(body,origin)=>route.PATCH(request("/api/race-hq/2",body,origin),{params:Promise.resolve({id:"2"})});
    const packet=body=>live.POST(request("/api/race-hq/live",body));
    const event=async()=>(await db.query("select * from event where id=2")).rows[0];
    await t.test("fresh GET is live after scheduled green even while the raw row still says upcoming",async()=>{
      as(1);const data=await hq.raceHQ("2",me);assert.equal(data.event.status,"live");
      const clock=raceClock(data.event,Date.parse(data.event.server_now));assert.equal(clock.phase,"live");assert(clock.remaining>79000);
      assert.equal((await event()).status,"upcoming");
    });
    await t.test("only event leads can sync, and malformed or stale readings are rejected",async()=>{
      me=null;assert.equal((await change({action:"clock",remaining_s:72000})).status,401);
      as(2);assert.equal((await change({action:"clock",remaining_s:72000})).status,403);
      as(1);assert.equal((await change({action:"clock",remaining_s:72000},"https://evil.example")).status,403);
      for(const remaining_s of [-1,86401,0.5,null,"72000"])assert.equal((await change({action:"clock",mode:"manual",remaining_s})).status,400);
      assert.equal((await change({action:"clock",mode:"manual",remaining_s:72000,observed_at:new Date(Date.now()-300000).toISOString()})).status,400);
    });
    await t.test("a non-admin race lead saves a shared manual reading with its observation time",async()=>{
      as(1);const observed=new Date(Date.now()-5000).toISOString();
      assert.equal((await change({action:"clock",mode:"manual",status:"live",remaining_s:72000,observed_at:observed})).status,200);
      const saved=await event();assert.equal(saved.clock_mode,"manual");assert.equal(saved.clock_manual_remaining_s,72000);assert.equal(new Date(saved.clock_manual_updated_at).toISOString(),observed);
      const data=await hq.raceHQ("2",me),clock=raceClock(data.event,Date.parse(data.event.server_now));
      assert.equal(clock.source,"manual");assert(clock.remaining<=71995&&clock.remaining>=71980);
    });
    await t.test("old-host field writes and new desktop heartbeats leave the manual countdown in charge",async()=>{
      await db.exec("update event set clock_source='acc',clock_remaining_s=12,clock_updated_at=now() where id=2");
      as(2);const response=await packet({track:"nurburgring_24h",remaining_s:50000,session:"race"});assert.equal(response.status,200);assert.equal((await response.json()).displayed,"manual");
      const saved=await event();assert.equal(saved.clock_manual_remaining_s,72000);
      const data=await hq.raceHQ("2",me),clock=raceClock(data.event,Date.parse(data.event.server_now));
      assert.equal(clock.source,"manual");assert(clock.remaining>71980);
    });
    await t.test("a lead can enable automatic timing and use the latest ACC anchor",async()=>{
      as(1);assert.equal((await change({action:"clock",mode:"auto"})).status,200);
      const data=await hq.raceHQ("2",me),clock=raceClock(data.event,Date.parse(data.event.server_now));
      assert.equal(clock.source,"acc");assert(clock.remaining<=50000&&clock.remaining>49990);
    });
    await t.test("desktop timing accepts roster drivers, rejects bad sessions and ignores nonparticipants",async()=>{
      as(2);assert.equal((await packet({track:"nurburgring_24h",remaining_s:null,session:"race"})).status,400);
      assert.equal((await packet({track:"nurburgring_24h",remaining_s:1000,session:"qualifying"})).status,400);
      const mismatch=await packet({track:"spa",remaining_s:1000,session:"race"});assert.equal(mismatch.status,200);assert.equal((await mismatch.json()).matched,false);
      as(9);const outsider=await packet({track:"nurburgring_24h",remaining_s:50000,session:"race"});assert.equal((await outsider.json()).matched,false);
    });
    await t.test("zero can be synced without finishing, and a closed race cannot be resurrected",async()=>{
      as(1);assert.equal((await change({action:"clock",mode:"manual",remaining_s:0})).status,200);
      const data=await hq.raceHQ("2",me);assert.equal(data.event.status,"live");assert.equal(raceClock(data.event,Date.parse(data.event.server_now)).phase,"elapsed");
      await db.exec("update event set status='finished',archived_at=now() where id=2");
      assert.equal((await change({action:"clock",mode:"manual",remaining_s:72000})).status,409);
      as(2);const late=await packet({track:"nurburgring_24h",remaining_s:50000,session:"race"});assert.equal((await late.json()).matched,false);
      assert.equal((await event()).status,"finished");
    });
  }finally{await db.close();}
});

