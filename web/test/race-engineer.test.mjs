import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/race-engineer.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
const {recommendRace,lapConditions}=exports;
const roster=[1,2,3,4].map(n=>({driver_id:String(n),display_name:`Driver ${n}`}));
const inputs={conditions:"dry",includeUnknown:false,targetMin:65,maxStintMin:65,tankL:120,measuredBurnL:null,manualLapS:null,reserveL:3};
const laps=(driver="1",pace=480000,session="1",conditions={rain:"none"})=>Array.from({length:6},(_,i)=>({driver_id:driver,session_id:session,number:i+1,at:"2026-11-01T10:00:00.000Z",t:pace,comparable:true,excluded_reasons:[],metrics:{fuel_l:120-i*10},conditions}));
await test("Nürburgring uses roster pace, whole laps, fuel margin and reserve",()=>{
 const report=recommendRace("nurburgring_24h",1440,roster,[...laps(),...laps("2",500000)],inputs);
 assert.equal(report.plan.laps,7);assert.equal(report.plan.startFuelL,88);assert.equal(report.plan.addFuelL,77);assert.equal(report.plan.reserveL,11);
 assert.equal(report.plan.stintMin,56);assert.equal(report.plan.estimatedStops,25);
 assert(report.plan.startFuelL<=inputs.tankL);assert(report.plan.slowStintMin<=inputs.maxStintMin);
 assert(report.warnings.some(w=>w.includes("lack matching")));assert(report.guidance[0].includes("Nordschleife"));
});
await test("dry, wet and unknown sessions remain separate",()=>{
 const pool=[...laps(),...laps("1",600000,"2",{rain:"light"}),...laps("1",420000,"3",null)];
 assert.equal(recommendRace("nurburgring",60,roster,pool,inputs).drivers[0].paceMs,480000);
 assert.equal(recommendRace("nurburgring",60,roster,pool,{...inputs,conditions:"wet"}).drivers[0].paceMs,600000);
 const mixed=recommendRace("nurburgring",60,roster,pool,{...inputs,includeUnknown:true});
 assert.equal(mixed.drivers[0].validLaps,12);assert(mixed.warnings.some(w=>w.includes("unknown conditions")));
 assert.equal(lapConditions({rain:"none",grip_worst:"damp"}),"wet");assert.equal(lapConditions(null),"unknown");
});
await test("pit laps, invalid laps, gaps, refuels and session boundaries do not fabricate fuel burn",()=>{
 const pool=laps();pool[1].excluded_reasons=["pit_in"];pool[2].number=10;pool[3].metrics.fuel_l=120;pool[4].session_id="2";pool[5].comparable=false;
 const report=recommendRace("nurburgring_24h",60,roster,pool,inputs);
 assert.equal(report.burnL,null);assert.equal(report.plan,null);assert(report.drivers[0].cleanPct<100);
});
await test("other drivers are excluded and too few laps never become measured pace",()=>{
 const report=recommendRace("nurburgring_24h",60,roster,[...laps("99",100000),...laps().slice(0,2)],inputs);
 assert.equal(report.paceS,null);assert.equal(report.starter,null);assert.equal(report.plan,null);
});
await test("missing telemetry produces requests for evidence; manual measurements remain explicit",()=>{
 const missing=recommendRace("nurburgring_24h",60,roster,[],{...inputs,tankL:null});assert.equal(missing.plan,null);
 const manual=recommendRace("nurburgring_24h",60,roster,[],{...inputs,measuredBurnL:12,manualLapS:500});
 assert(manual.plan);assert.equal(manual.burnSource,"Measured input");assert(manual.confidence.includes("Provisional"));
});
await test("fuel planning uses the highest measured driver median rather than hiding a high-consumption driver",()=>{
 const high=laps("2").map((l,i)=>({...l,metrics:{fuel_l:120-i*15}}));
 const report=recommendRace("nurburgring_24h",60,roster,[...laps(),...high],inputs);
 assert.equal(report.burnL,15);assert.equal(report.safeBurnL,16.5);assert.equal(report.drivers[1].fuelL,15);
});
await test("tank limits, impossible stints, GP distinction and rounding are respected",()=>{
 const report=recommendRace("nurburgring",60,roster,laps(),{...inputs,tankL:45});assert.equal(report.plan.laps,3);
 assert(report.guidance[0].includes("GP"));
 assert.equal(recommendRace("nurburgring_24h",60,roster,laps(),{...inputs,tankL:10}).plan,null);
 assert.equal(recommendRace("nurburgring_24h",60,roster,laps(),{...inputs,maxStintMin:1}).plan,null);
 const rounded=recommendRace("nurburgring_24h",60,roster,laps(),{...inputs,tankL:44.05});assert(rounded.plan.startFuelL<=44.05);
 assert.throws(()=>recommendRace("nurburgring",60,roster,[],{...inputs,targetMin:NaN}));
});
await test("practice evidence distinguishes confidence and target-length endurance",()=>{
 const report=recommendRace("nurburgring_24h",60,roster,roster.flatMap(d=>[...laps(d.driver_id,480000,"1"),...laps(d.driver_id,480000,"2")]),inputs);
 assert(report.confidence.includes("Stronger"));assert.equal(report.drivers[0].longestRunMin,48);assert(report.drivers[0].advice.includes("target-length"));
});

function adapter(db){return (parts,...values)=>db.query(parts.reduce((q,p,i)=>q+(i?`$${i}`:"")+p,""),values).then(r=>r.rows);}
await test("real engineer route protects access and selects ACC, exact layout/car, roster and recent non-qualifying evidence",async()=>{
 const db=new PGlite();let signedIn=false;
 try{
 await db.exec(`create table driver(id bigint primary key,display_name text);
 create table event(id bigint primary key,track_key text);
 create table event_car(id bigint primary key,event_id bigint,car_key text);
 create table event_car_driver(event_id bigint,event_car_id bigint,driver_id bigint,sort_order int);
 create table track(id bigint primary key,simulator text,key text);
 create table car(id bigint primary key,simulator text,key text,name text);
 create table session(id bigint primary key,driver_id bigint,track_id bigint,car_id bigint,recorded_at timestamp,uploaded_at timestamptz,session_type text,rating_type text,conditions jsonb);
 create table lap(session_id bigint,number int,official_lap_time_ms int,game_lap_time_ms int,lap_time_ms int,comparable boolean,excluded_reasons text[],metrics jsonb);
 insert into driver values(1,'Alice'),(2,'Bob');insert into event values(1,'nurburgring_24h'),(2,'nurburgring');
 insert into event_car values(1,1,'ford'),(2,2,'ford');insert into event_car_driver values(1,1,1,0),(2,2,2,0);
 insert into track values(1,'acc','nurburgring_24h'),(2,'acc','nurburgring'),(3,'other','nurburgring_24h');
 insert into car values(1,'acc','ford','Ford'),(2,'acc','porsche','Porsche'),(3,'other','ford','Other simulator');
 insert into session select n,case when n=7 then 2 else 1 end,case when n=2 then 2 when n=8 then 3 else 1 end,
 case when n=3 then 2 when n=9 then 3 else 1 end,now()-case when n=5 then interval '100 days' else interval '1 day' end,now(),
 case when n=4 then 'hotlap' else 'practice' end,null,'{"rain":"none"}' from generate_series(1,10) n;
 insert into lap select n,1,null,null,480000,true,case when n=6 then array['track_edges'] else array[]::text[] end,'{"fuel_l":100}' from generate_series(1,10) n;`);
 const route={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/api/race-hq/[id]/cars/[carId]/engineer/route.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:route,Response,URL,require:id=>id==="@/lib/auth"?{currentDriver:async()=>signedIn?{id:"1"}:null}:{sql:adapter(db)}});
 const get=(carId="1",extra="")=>route.GET(new Request(`https://example.com/api/race-hq/1/cars/${carId}/engineer${extra}`),{params:Promise.resolve({id:"1",carId})});
 assert.equal((await get()).status,401);signedIn=true;assert.equal((await get("2")).status,404);assert.equal((await get("1","?car=invalid")).status,400);
 const response=await get();assert.equal(response.status,200);const data=await response.json();assert.equal(data.track,"nurburgring_24h");assert.equal(data.selectedCar,"ford");
 assert.deepEqual(data.laps.map(l=>l.session_id).sort(),["1","10"]);assert.equal(data.roster.length,1);assert.equal(data.cars.length,2);assert(response.headers.get("cache-control").includes("no-store"));
 const otherCar=await(await get("1","?car=porsche")).json();assert.deepEqual(otherCar.laps.map(l=>l.session_id),["3"]);
 }finally{await db.close();}
});
