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

await test("planning drivers reserve assignments without creating login profiles",async(t)=>{
  const db=new PGlite();
  try {
    await db.exec(`create table driver(id bigint primary key,display_name text,avatar_url text,discord_id text,is_admin boolean default false);
      insert into driver(id,display_name) select n,'Driver '||n from generate_series(1,12) n;
      create table event(id bigint generated always as identity primary key,title text,track_key text,starts_at timestamptz,duration_min int,kind text,league text,server text,notes text,min_pit_stops int,created_by bigint references driver);`);
    for(const path of ["../../db/migrations/0020_race_hq.sql","../scripts/migrations/0021_race_signups.sql","../scripts/migrations/0022_car_teams.sql","../scripts/migrations/0024_stint_booking.sql","../scripts/migrations/0025_race_agenda_and_qualifying.sql","../scripts/migrations/0026_stint_trades.sql","../scripts/migrations/0027_planning_drivers.sql","../scripts/migrations/0028_race_clock.sql","../scripts/migrations/0029_stint_timer.sql"])
      await db.exec(readFileSync(new URL(path,import.meta.url),"utf8"));
    let me = null;
    const sql = adapter(db), cache = new Map();
    function load(path) {
      path = resolve(path);
      if (cache.has(path)) return cache.get(path);
      const exports = {}; cache.set(path, exports);
      const js = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      vm.runInNewContext(js, { exports, Response, URL, console, require: (id) => {
        if (id === "server-only") return {};
        if (id === "@/lib/auth") return { currentDriver: async () => me };
        if (id === "@/lib/db" || id === "./db") return { sql };
        if (id.startsWith("@/")) return load(resolve(id.slice(2)) + ".ts");
        if (id.startsWith("./")) return load(resolve(path, "..", id) + ".ts");
        throw new Error("Unexpected dependency: " + id);
      }});
      return exports;
    }



    const planning=load("app/api/race-hq/[id]/cars/[carId]/planning-drivers/route.ts"),carRoute=load("app/api/race-hq/[id]/cars/[carId]/route.ts");
    const schedule=load("app/api/race-hq/[id]/cars/[carId]/schedule/route.ts"),hq=load("lib/race-hq.ts");
    const as=(id,review=false)=>{me={id:String(id),display_name:"Driver "+id,is_admin:false,is_reviewer:review};};
    const start=new Date(Date.now()+86400000).toISOString();
    await db.query("insert into event(title,track_key,starts_at,duration_min,status,qualifying_starts_at) values('Planning','nurburgring_24h',$1,480,'upcoming',$2)",[start,new Date(+new Date(start)-1800000).toISOString()]);
    await db.exec("insert into event_car(event_id,number,name) values(1,'330','A'),(1,'331','B')");
    await db.exec("insert into event_role(event_id,driver_id,role) values(1,1,'lead')");
    await db.exec("insert into event_signup(event_id,driver_id) select 1,n from generate_series(1,9) n");
    await db.exec("insert into event_car_driver(event_id,event_car_id,driver_id,sort_order) select 1,case when n<4 then 1 else 2 end,n,n from generate_series(1,8) n where n<>4");
    const request=(body,origin="https://example.com")=>new Request("https://example.com/api/race-hq/1/cars/1/planning-drivers",{method:"PATCH",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
    const context=(car="1")=>({params:Promise.resolve({id:"1",carId:car})});
    const plan=(body,car="1",origin)=>planning.PATCH(request(body,origin),context(car));
    const car=(body,car="1")=>carRoute.PATCH(request(body),context(car));
    const change=async(body,car="1")=>{const revision=(await db.query("select schedule_revision from event_car where id=$1",[car])).rows[0].schedule_revision;return schedule.PATCH(request({revision,...body}),context(car));};
    const rows=async()=> (await db.query("select * from event_car_stint where event_car_id=1 order by n")).rows;
    let person;
    await t.test("a non-admin race lead can add a name; other drivers and reviewers cannot",async()=>{
      as(2);assert.equal((await plan({action:"add",name:"Future teammate"})).status,403);
      as(1,true);assert.equal((await plan({action:"add",name:"Future teammate"})).status,403);
      as(1);assert.equal((await plan({action:"add",name:"Future teammate"},"1","https://evil.example")).status,403);
      assert.equal((await plan({action:"add",name:"Future teammate"})).status,200);
      person=String((await db.query("select id from event_planning_driver where event_car_id=1")).rows[0].id);
      assert.equal((await db.query("select count(*)::int n from driver")).rows[0].n,12);
      assert.equal((await plan({action:"add",name:"future TEAMMATE"})).status,409);
      assert.equal((await plan({action:"add",name:"x".repeat(81)})).status,400);
    });
    await t.test("three joined drivers plus one planning driver can form a confirmed roster and rotation",async()=>{
      assert.equal((await car({action:"roster",driver_ids:["1","2","3"],confirmed:true})).status,200);
      assert.equal((await car({action:"generate"})).status,200);
      const stints=await rows();assert.equal(stints.length,8);
      assert.equal(stints.filter(s=>String(s.planning_driver_id)===person).length,2);
      assert(stints.filter(s=>s.planning_driver_id!==null).every(s=>s.driver_id===null));
      const data=await hq.raceHQ("1",me);
      assert.equal(data.planning_drivers.length,1);assert.equal(data.stints[6].driver,"Future teammate");
      assert.equal(data.cars[0].roster_confirmed,true);
    });
    await t.test("leads can reserve single race and qualifying slots, and the full plan can be confirmed",async()=>{
      const stint=(await rows())[0];
      assert.equal((await change({action:"assign",stint_id:String(stint.id),driver_id:null,planning_driver_id:person})).status,200);
      assert.equal((await change({action:"qualifier",driver_id:null,planning_driver_id:person})).status,200);
      const draft=(await rows()).map(s=>({id:String(s.id),driver_id:s.driver_id===null?null:String(s.driver_id),planning_driver_id:s.planning_driver_id===null?null:String(s.planning_driver_id),
        starts_at:new Date(s.starts_at).toISOString(),ends_at:new Date(s.ends_at).toISOString(),note:"Planned handover"}));
      assert.equal((await change({action:"save",stints:draft})).status,200);
      assert.equal((await change({action:"save",stints:[{...draft[0],driver_id:"1"},...draft.slice(1)]})).status,400);
      assert.equal((await change({action:"status",status:"confirmed"})).status,200);
      assert.equal((await change({action:"status",status:"open"})).status,200);
      as(2);
      const result=await change({action:"claim",stint_id:String(stint.id)});assert.equal(result.status,409);assert.match((await result.json()).error,/reserved/);
      assert.equal((await change({action:"qualifier",driver_id:"2"})).status,409);
      assert.equal((await change({action:"assign",stint_id:String(stint.id),driver_id:"2",planning_driver_id:null})).status,403);
      as(1);
    });
    await t.test("planning assignments are isolated to their car and cannot be linked to an unavailable profile",async()=>{
      assert.equal((await plan({action:"add",name:"Other car reserve"},"2")).status,200);
      const foreign=String((await db.query("select id from event_planning_driver where event_car_id=2")).rows[0].id);
      assert.equal((await change({action:"assign",stint_id:String((await rows())[1].id),driver_id:null,planning_driver_id:foreign})).status,400);
      assert.equal((await plan({action:"link",planning_driver_id:person,driver_id:"12"})).status,400);
      assert.equal((await plan({action:"link",planning_driver_id:person,driver_id:"5"})).status,409);
      as(2);assert.equal((await plan({action:"link",planning_driver_id:person,driver_id:"4"})).status,403);as(1);
    });
    await t.test("linking after Discord signup moves every reserved drive to the account without retiming",async()=>{
      await db.exec("insert into driver(id,display_name,discord_id) values(13,'Real Discord driver','123456789');insert into event_signup(event_id,driver_id) values(1,13)");
      const before=await rows(),reserved=before.filter(s=>String(s.planning_driver_id)===person);
      assert.equal((await plan({action:"link",planning_driver_id:person,driver_id:"13"})).status,200);
      const after=await rows();
      assert.deepEqual(after.map(s=>[s.id,s.n,s.starts_at,s.ends_at,s.note]),before.map(s=>[s.id,s.n,s.starts_at,s.ends_at,s.note]));
      for(const old of reserved){const next=after.find(s=>s.id===old.id);assert.equal(Number(next.driver_id),13);assert.equal(next.planning_driver_id,null);}
      const info=(await db.query("select * from event_car where id=1")).rows[0];assert.equal(Number(info.qualifying_driver_id),13);assert.equal(info.qualifying_planning_driver_id,null);assert.equal(info.roster_confirmed,true);
      assert.equal((await db.query("select count(*)::int n from driver")).rows[0].n,13);
      as(13);const data=await hq.raceHQ("1",me);assert.equal(data.stints.filter(s=>String(s.driver_id)==="13").length,reserved.length);
      assert.equal(data.planning_drivers.filter(p=>String(p.event_car_id)==="1").length,0);
      as(1);assert.equal((await plan({action:"link",planning_driver_id:person,driver_id:"13"})).status,409);
    });
    await t.test("the combined six-driver limit applies and removing a future planning spot frees only its reservations",async()=>{
      assert.equal((await plan({action:"add",name:"Reserve two"})).status,200);
      assert.equal((await plan({action:"add",name:"Reserve three"})).status,200);
      assert.equal((await plan({action:"add",name:"Seventh driver"})).status,409);
      const p=String((await db.query("select id from event_planning_driver where event_car_id=1 and linked_driver_id is null and removed_at is null order by id")).rows[0].id);
      const slot=(await rows())[1];
      assert.equal((await change({action:"assign",stint_id:String(slot.id),driver_id:null,planning_driver_id:p})).status,200);
      assert.equal((await plan({action:"remove",planning_driver_id:p})).status,200);
      const next=(await rows()).find(s=>s.id===slot.id);assert.equal(next.planning_driver_id,null);assert.equal(next.driver_id,null);
      assert.equal((await db.query("select count(*)::int n from event_car_driver where event_car_id=2")).rows[0].n,4);
    });
    await t.test("started planned drives require identity linking rather than deletion",async()=>{
      const p=String((await db.query("select id from event_planning_driver where event_car_id=1 and linked_driver_id is null and removed_at is null")).rows[0].id);
      const slot=(await rows())[2];assert.equal((await change({action:"assign",stint_id:String(slot.id),driver_id:null,planning_driver_id:p})).status,200);
      await db.query("update event_car_stint set starts_at=now()-interval '1 minute' where id=$1",[slot.id]);
      const before=(await rows()).find(s=>s.id===slot.id);
      assert.equal((await plan({action:"remove",planning_driver_id:p})).status,409);
      assert.equal((await plan({action:"link",planning_driver_id:p,driver_id:"1"})).status,200);
      const after=(await rows()).find(s=>s.id===slot.id);assert.equal(Number(after.driver_id),1);assert.equal(+new Date(after.starts_at),+new Date(before.starts_at));
    });
    await t.test("finished races keep planning records read-only",async()=>{
      await db.exec("update event set status='finished',archived_at=now() where id=1");
      assert.equal((await plan({action:"add",name:"Too late"})).status,409);
    });
  }finally{await db.close();}
});


