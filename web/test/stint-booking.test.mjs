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

await test("custom schedules and driver booking use the real handlers", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create table driver (id bigint primary key, display_name text not null, avatar_url text, is_admin boolean default false);
      insert into driver select n, 'Driver '||n, null, n=1 from generate_series(1,10) n;
      create table event (id bigint generated always as identity primary key, title text, track_key text, starts_at timestamptz,
        duration_min int, kind text, league text, server text, notes text, min_pit_stops int, created_by bigint references driver);`);
    for (const file of ["../../db/migrations/0020_race_hq.sql", "../scripts/migrations/0021_race_signups.sql", "../scripts/migrations/0022_car_teams.sql", "../scripts/migrations/0024_stint_booking.sql"])
      await db.exec(readFileSync(new URL(file, import.meta.url), "utf8"));
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

    const route = load("app/api/race-hq/[id]/cars/[carId]/schedule/route.ts");
    const carRoute = load("app/api/race-hq/[id]/cars/[carId]/route.ts");
    const hq = load("lib/race-hq.ts");
    const as = (id, admin = false) => { me = { id: String(id), display_name: "Driver " + id, is_admin: admin }; };
    const start = new Date(Date.now() + 86400000).toISOString();
    await db.query("insert into event(title,track_key,starts_at,duration_min,status) values('Booking test','nurburgring_24h',$1,240,'upcoming')", [start]);
    await db.exec("insert into event_car(event_id,number,name,roster_confirmed) values(1,'330','A',true),(1,'331','B',true)");
    await db.exec("insert into event_signup(event_id,driver_id) select 1,n from generate_series(2,9) n");
    await db.exec("insert into event_car_driver(event_id,event_car_id,driver_id,sort_order) select 1,case when n<6 then 1 else 2 end,n,n from generate_series(2,9) n");
    const revision = async (car = "1") => (await db.query("select schedule_revision from event_car where id=$1", [car])).rows[0].schedule_revision;
    const request = (body, origin = "https://example.com") => new Request("https://example.com/api/race-hq/1/cars/1/schedule", {
      method: "PATCH", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const invoke = (body, car = "1", origin) => route.PATCH(request(body, origin), { params: Promise.resolve({ id: "1", carId: car }) });
    const change = async (action, values = {}, car = "1") => invoke({ action, revision: await revision(car), ...values }, car);
    const rows = async (car = "1") => (await db.query("select * from event_car_stint where event_car_id=$1 order by n", [car])).rows;
    const editable = async (car = "1") => (await rows(car)).map((s) => ({ id: String(s.id), driver_id: s.driver_id == null ? null : String(s.driver_id),
      starts_at: new Date(s.starts_at).toISOString(), ends_at: new Date(s.ends_at).toISOString(), note: s.note }));
    const slots = [0,1,2,3].map((i) => ({ id: null, driver_id: null, starts_at: new Date(+new Date(start)+i*3600000).toISOString(),
      ends_at: new Date(+new Date(start)+(i+1)*3600000).toISOString(), note: null }));
    as(1,true);
    await t.test("leads can create empty slots independently for both cars", async () => {
      assert.equal((await change("save",{stints:slots})).status,200);
      assert.equal((await change("save",{stints:slots},"2")).status,200);
      assert.equal((await rows()).length,4);
      assert((await rows()).every((r)=>r.driver_id===null));
      const data = await hq.raceHQ("1",me);
      assert.equal(data.cars[0].schedule_revision,1);
      assert.equal(data.cars[0].schedule_status,"draft");
    });
    await t.test("permissions, origin, car ownership and revision are checked", async () => {
      me=null; assert.equal((await change("save",{stints:slots})).status,401);
      as(2); assert.equal((await change("save",{stints:slots})).status,403);
      assert.equal((await change("status",{status:"open"})).status,403);
      as(1,true);
      assert.equal((await invoke({action:"save",revision:await revision(),stints:slots},"1","https://evil.example")).status,403);
      assert.equal((await invoke({action:"save",stints:slots})).status,400);
      assert.equal((await invoke({action:"status",revision:0,status:"open"})).status,409);
      assert.equal((await invoke({action:"status",revision:0,status:"open"},"999")).status,404);
    });
    await t.test("gaps, overlaps, foreign IDs, duplicate IDs and invalid drivers cannot be saved", async () => {
      const before=await rows(), plan=await editable();
      for (const bad of [
        plan.slice(1), [{...plan[0],ends_at:plan[1].ends_at},...plan.slice(1)],
        [{...plan[0],id:String((await rows("2"))[0].id)},...plan.slice(1)],
        [plan[0],{...plan[1],id:plan[0].id},...plan.slice(2)],
        [{...plan[0],driver_id:"6"},...plan.slice(1)],
        [{...plan[0],note:"x".repeat(301)},...plan.slice(1)],
        [{...plan[0],starts_at:plan[0].starts_at.slice(0,-1)},...plan.slice(1)],
      ]) assert([400,409].includes((await change("save",{stints:bad})).status));
      assert.deepEqual(await rows(),before);
    });
    await t.test("booking opens only after a valid confirmed roster and cannot confirm vacancies", async () => {
      await db.exec("update event_car set roster_confirmed=false where id=1");
      assert.equal((await change("status",{status:"open"})).status,409);
      await db.exec("update event_car set roster_confirmed=true where id=1");
      assert.equal((await change("status",{status:"confirmed"})).status,409);
      assert.equal((await change("status",{status:"open"})).status,200);
      as(6); assert.equal((await change("claim",{stint_id:String((await rows())[0].id)})).status,403);
      as(10); assert.equal((await change("claim",{stint_id:String((await rows())[0].id)})).status,403);
    });
    await t.test("simultaneous bookings cannot double-book a slot; stale lead edits preserve bookings", async () => {
      const rev=await revision(), plan=await editable(), stint=plan[0].id;
      as(2); const first=invoke({action:"claim",revision:rev,stint_id:stint});
      as(3); const second=invoke({action:"claim",revision:rev,stint_id:stint});
      assert.deepEqual((await Promise.all([first,second])).map((r)=>r.status).sort(),[200,409]);
      assert.equal(Number((await rows())[0].driver_id),2);
      as(1,true); assert.equal((await invoke({action:"save",revision:rev,stints:plan})).status,409);
      assert.equal(Number((await rows())[0].driver_id),2);
      as(3); assert.equal((await change("claim",{stint_id:stint})).status,409);
      assert.equal((await change("release",{stint_id:stint})).status,403);
      as(2); assert.equal((await change("release",{stint_id:stint})).status,200);
      assert.equal((await rows())[0].driver_id,null);
      assert.equal((await change("claim",{stint_id:stint})).status,200);
    });
    await t.test("confirmation locks self-service until the lead reopens booking", async () => {
      as(1,true);
      const plan=(await editable()).map((s,i)=>({...s,driver_id:String(i+2)}));
      assert.equal((await change("save",{stints:plan})).status,200);
      assert.equal((await db.query("select schedule_status from event_car where id=1")).rows[0].schedule_status,"draft");
      as(2); assert.equal((await change("release",{stint_id:plan[0].id})).status,409);
      as(1,true); assert.equal((await change("status",{status:"confirmed"})).status,200);
      as(2); assert.equal((await change("release",{stint_id:plan[0].id})).status,409);
      as(1,true); assert.equal((await change("status",{status:"open"})).status,200);
    });
    await t.test("split and merge preserve other assignments and keep the other car intact", async () => {
      const other=await rows("2"), plan=await editable(), first=plan[0], midpoint=new Date(+new Date(first.starts_at)+1800000).toISOString();
      const split=[{...first,ends_at:midpoint},{...first,id:null,driver_id:null,starts_at:midpoint},...plan.slice(1)];
      assert.equal((await change("save",{stints:split})).status,200);
      const result=await editable(); assert.equal(result.length,5); assert.equal(result[0].id,first.id); assert.equal(result[1].driver_id,null);
      assert.equal((await change("save",{stints:[{...result[0],ends_at:result[1].ends_at},...result.slice(2)]})).status,200);
      assert.equal((await rows()).length,4);
      assert.deepEqual(await rows("2"),other);
    });
    await t.test("legacy rebuild cannot erase an open schedule and roster changes require fresh review", async () => {
      assert.equal((await change("status",{status:"open"})).status,200);
      const carChange=(body)=>carRoute.PATCH(request(body),{params:Promise.resolve({id:"1",carId:"1"})});
      assert.equal((await carChange({action:"generate"})).status,409);
      const rev=await revision();
      assert.equal((await carChange({action:"roster",driver_ids:["2","3","4","5"],confirmed:true})).status,200);
      assert.equal(await revision(),rev+1);
      assert.equal((await db.query("select schedule_status from event_car where id=1")).rows[0].schedule_status,"draft");
    });
    await t.test("overlapping legacy assignments across cars prevent booking", async () => {
      // Existing historical schedules can predate the single-car roster rule.
      await db.query("update event_car_stint set driver_id=2 where event_car_id=2 and n=1");
      const plan=await editable(); plan[0].driver_id=null;
      assert.equal((await change("save",{stints:plan})).status,200);
      assert.equal((await change("status",{status:"open"})).status,200);
      as(2); assert.equal((await change("claim",{stint_id:plan[0].id})).status,409);
      await db.exec("update event_car_stint set driver_id=null where event_car_id=2");
      assert.equal((await change("claim",{stint_id:plan[0].id})).status,200);
      as(1,true);
    });
    await t.test("live editing preserves completed and active stints while allowing future changes", async () => {
      const liveStart=new Date(Date.now()-90*60000).toISOString(), shift=+new Date(liveStart)-+new Date(start);
      await db.query("update event set starts_at=$1,status='live' where id=1",[liveStart]);
      await db.query("update event_car_stint set starts_at=starts_at+($1*interval '1 millisecond'),ends_at=ends_at+($1*interval '1 millisecond') where event_car_id=1",[shift]);
      const plan=await editable(), firstTwo=(await rows()).slice(0,2);
      as(2); assert.equal((await change("release",{stint_id:plan[0].id})).status,409);
      as(3); assert.equal((await change("release",{stint_id:plan[1].id})).status,409);
      as(1,true);
      assert.equal((await change("save",{stints:[{...plan[0],driver_id:"3"},...plan.slice(1)]})).status,409);
      assert.equal((await change("save",{stints:[plan[0],{...plan[1],note:"Changed live stint"},...plan.slice(2)]})).status,409);
      const third=plan[2], midpoint=new Date(+new Date(third.starts_at)+1800000).toISOString();
      assert.equal((await change("save",{stints:[...plan.slice(0,2),{...third,ends_at:midpoint},{...third,id:null,starts_at:midpoint,driver_id:null},plan[3]]})).status,200);
      assert.deepEqual((await rows()).slice(0,2),firstTwo);
    });
    await t.test("archive blocks claims, lead edits and publishing", async () => {
      await db.exec("update event set status='finished',archived_at=now() where id=1");
      assert.equal((await change("save",{stints:await editable()})).status,409);
      assert.equal((await change("status",{status:"open"})).status,409);
      as(2); assert.equal((await change("claim",{stint_id:String((await rows())[2].id)})).status,409);
      const count=(await db.query("select count(*)::int n from event_update where event_id=1 and event_car_id=1")).rows[0].n;
      assert(count>8,"successful schedule changes should appear in the shared race feed");
    });
  } finally { await db.close(); }
});
