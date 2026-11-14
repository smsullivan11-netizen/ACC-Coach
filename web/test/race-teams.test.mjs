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

await test("independent car teams, strategies and signup lifecycle", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create table driver (id bigint primary key, display_name text not null, avatar_url text, discord_id text, is_admin boolean default false);
      insert into driver (id,display_name,avatar_url,is_admin) select n, 'Driver '||n, null, n=1 from generate_series(1,18) n;
      create table event (id bigint generated always as identity primary key, title text, track_key text, starts_at timestamptz,
        duration_min int, kind text, league text, server text, notes text, min_pit_stops int, created_by bigint references driver);
    `);
    await db.exec(readFileSync(new URL("../../db/migrations/0020_race_hq.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../scripts/migrations/0021_race_signups.sql", import.meta.url), "utf8"));
    await db.exec(`insert into event (title, starts_at, duration_min, status) values ('Legacy', now()-interval '10 days', 120, 'finished');
      insert into event_car (event_id, number, name) values(1,'1','Legacy A'),(1,'2','Legacy B');
      insert into event_car_stint(event_car_id,n,driver_id,starts_at,ends_at) values
        (1,1,1,now()-interval '10 days',now()-interval '10 days'+interval '1 hour'),
        (2,1,1,now()-interval '10 days',now()-interval '10 days'+interval '1 hour'),
        (1,2,2,now()-interval '10 days'+interval '1 hour',now()-interval '10 days'+interval '2 hours');`);
    const oldStints = (await db.query("select * from event_car_stint order by id")).rows;
    await db.exec(readFileSync(new URL("../scripts/migrations/0022_car_teams.sql", import.meta.url), "utf8"));
    await t.test("migration preserves historical schedules and leaves ambiguous drivers unassigned", async () => {
      assert.deepEqual((await db.query("select * from event_car_stint order by id")).rows, oldStints);
      const roster = (await db.query("select * from event_car_driver")).rows;
      assert.equal(roster.length, 1); assert.equal(Number(roster[0].driver_id), 2);
    });
    await db.exec(readFileSync(new URL("../scripts/migrations/0024_stint_booking.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../scripts/migrations/0025_race_agenda_and_qualifying.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../scripts/migrations/0026_stint_trades.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../scripts/migrations/0027_planning_drivers.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../scripts/migrations/0028_race_clock.sql", import.meta.url), "utf8"));
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
    const create = load("app/api/race-hq/route.ts"), carRoute = load("app/api/race-hq/[id]/cars/[carId]/route.ts");
    const planRoute = load("app/api/race-hq/[id]/route.ts"), signup = load("app/api/race-hq/[id]/signup/route.ts");
    const hq = load("lib/race-hq.ts");
    const req = (path, method, body, origin = "https://example.com") => new Request("https://example.com" + path, { method, headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
    const as = (id, admin = false) => { me = { id: String(id), display_name: "Driver " + id, is_admin: admin, avatar_url: null }; };
    as(1, true);
    const starts = new Date(Date.now() + 86400000).toISOString();
    let eventId, a, b;
    await t.test("create two cars with different stint targets and open registration", async () => {
      const response = await create.POST(req("/api/race-hq", "POST", { title: "Two car race", track_key: "spa", starts_at: starts, duration_min: 1440, cars: [{ number: "330", name: "Car A", stint_min: 60 }, { number: "331", name: "Car B", stint_min: 90 }] }));
      assert.equal(response.status, 200); eventId = String((await response.json()).event_id);
      const data = await hq.raceHQ(eventId, me); [a,b] = data.cars.map((c) => String(c.id));
      assert.equal(data.cars.length, 2); assert.equal(data.stints.length, 0);
      assert.deepEqual(Array.from(data.strategies, (s) => s.stint_min).sort(), [60,90]);
    });
    const change = (car, body, origin) => carRoute.PATCH(req(`/api/race-hq/${eventId}/cars/${car}`, "PATCH", body, origin), { params: Promise.resolve({ id: eventId, carId: car }) });
    const join = (registered) => signup.POST(req(`/api/race-hq/${eventId}/signup`, "POST", { registered }), { params: Promise.resolve({ id: eventId }) });
    await t.test("authentication and permissions protect car changes", async () => {
      me = null; assert.equal((await change(a,{action:"roster",driver_ids:[],confirmed:false})).status,401);
      as(18); assert.equal((await change(a,{action:"roster",driver_ids:[],confirmed:false})).status,403);
      as(1,true); assert.equal((await change(a,{action:"roster",driver_ids:[],confirmed:false},"https://evil.example")).status,403);
    });
    await t.test("register drivers, enforce 4–6 and disjoint rosters", async () => {
      for(let id=1;id<=12;id++){as(id); assert.equal((await join(true)).status,200);}
      as(1,true);
      assert.equal((await change(a,{action:"roster",driver_ids:["1","2","3"],confirmed:true})).status,400);
      assert.equal((await change(a,{action:"roster",driver_ids:["1","1","2","3"],confirmed:true})).status,400);
      assert.equal((await change(a,{action:"roster",driver_ids:["1","2","3","17"],confirmed:true})).status,400);
      assert.equal((await change(a,{action:"roster",driver_ids:["1","2","3","4","5","6","7"],confirmed:true})).status,400);
      assert.equal((await change(a,{action:"roster",driver_ids:["1","2"],confirmed:false})).status,200);
      assert.equal((await change(a,{action:"generate"})).status,409);
      assert.equal((await change(a,{action:"roster",driver_ids:["1","2","3","4"],confirmed:true})).status,200);
      assert.equal((await change(b,{action:"roster",driver_ids:["1","5","6","7"],confirmed:true})).status,409);
      assert.equal((await change(b,{action:"roster",driver_ids:["5","6","7","8","9","10"],confirmed:true})).status,200);
      as(1); assert.equal((await join(false)).status,409); as(1,true);
    });
    const strategyA = { stint_min:60,starting_fuel_l:110,refuel_l:70,reserve_l:3,tyre_plan:"every_stop",min_pit_stops:23,pit_window:"Lap 28–30",notes:"Car A dry setup" };
    const strategyB = { ...strategyA,stint_min:90,starting_fuel_l:105,refuel_l:80,tyre_plan:"as_needed",min_pit_stops:15,notes:"Car B wet setup" };
    await t.test("strategies save independently and invalid changes leave both cars intact", async () => {
      assert.equal((await change(a,{action:"strategy",strategy:strategyA})).status,200);
      assert.equal((await change(b,{action:"strategy",strategy:strategyB})).status,200);
      assert.equal((await change(a,{action:"strategy",strategy:{...strategyA,refuel_l:-1}})).status,400);
      assert.equal((await change(a,{action:"strategy",strategy:{...strategyA,tyre_plan:"invalid"}})).status,400);
      assert.equal((await change("999",{action:"strategy",strategy:strategyA})).status,404);
      assert.equal((await change("1",{action:"strategy",strategy:strategyA})).status,404);
      const data=await hq.raceHQ(eventId,me);
      assert.equal(data.strategies.find(s=>String(s.event_car_id)===a).notes,strategyA.notes);
      assert.equal(data.strategies.find(s=>String(s.event_car_id)===b).notes,strategyB.notes);
    });
    await t.test("each generated schedule uses only its roster and covers the complete race", async () => {
      assert.equal((await change(a,{action:"generate"})).status,200);
      assert.equal((await change(b,{action:"generate"})).status,200);
      const data=await hq.raceHQ(eventId,me);
      for(const [car,count,drivers] of [[a,24,[1,2,3,4]],[b,16,[5,6,7,8,9,10]]]) {
        const stints=Array.from(data.stints).filter(s=>String(s.event_car_id)===car);
        assert.equal(stints.length,count); assert.equal(stints[0].starts_at,starts);
        assert.equal(+new Date(stints.at(-1).ends_at),+new Date(starts)+1440*60000);
        assert(stints.every(s=>drivers.includes(Number(s.driver_id))));
        stints.slice(1).forEach((s,i)=>assert.equal(s.starts_at,stints[i].ends_at));
      }
      const bBefore=(await db.query("select * from event_car_stint where event_car_id=$1 order by n",[b])).rows;
      assert.equal((await change(a,{action:"generate"})).status,200);
      assert.deepEqual((await db.query("select * from event_car_stint where event_car_id=$1 order by n",[b])).rows,bBefore);
    });
    await t.test("legacy plan endpoint cannot bypass booking and revision checks", async () => {
      const data=await hq.raceHQ(eventId,me), stints=Array.from(data.stints).filter(s=>String(s.event_car_id)===a).map(s=>({...s,id:String(s.id),driver_id:String(s.driver_id)}));
      const save=(rows)=>planRoute.PATCH(req(`/api/race-hq/${eventId}`,"PATCH",{action:"plan",car_id:a,stints:rows}),{params:Promise.resolve({id:eventId})});
      assert.equal((await save(stints)).status,409);
      assert.equal((await save([{...stints[0],driver_id:"5"},...stints.slice(1)])).status,409);
      assert.equal((await save(stints.slice(1))).status,409);
      assert.equal((await save([stints[0],stints[0],...stints.slice(2)])).status,409);
    });
    await t.test("roster removal clears unfinished assignments, isolates other car and permits withdrawal", async () => {
      assert.equal((await change(a,{action:"roster",driver_ids:["2","3","4","11"],confirmed:true})).status,200);
      const rows=(await db.query("select * from event_car_stint where event_car_id=$1 and driver_id=1",[a])).rows;
      assert.equal(rows.length,0);
      assert.equal((await db.query("select count(*)::int as n from event_car_driver where event_car_id=$1",[b])).rows[0].n,6);
      as(1); assert.equal((await join(false)).status,200); as(1,true);
    });
    await t.test("concurrent roster edits cannot claim the same driver for both cars", async () => {
      const results=await Promise.all([
        change(a,{action:"roster",driver_ids:["2","3","4","12"],confirmed:true}),
        change(b,{action:"roster",driver_ids:["5","6","7","8","9","12"],confirmed:true}),
      ]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      assert.equal((await db.query("select count(*)::int as n from event_car_driver where event_id=$1 and driver_id=12",[eventId])).rows[0].n,1);
    });
    await t.test("live race disallows rebuild and archive makes car settings read-only", async () => {
      await db.query("update event set status='live' where id=$1",[eventId]);
      assert.equal((await change(a,{action:"generate"})).status,409);
      await db.query("update event set status='finished',archived_at=now() where id=$1",[eventId]);
      assert.equal((await change(a,{action:"strategy",strategy:strategyA})).status,409);
      assert.equal((await change(a,{action:"roster",driver_ids:[],confirmed:false})).status,409);
      const data=await hq.raceHQ(eventId,me); assert.equal(data.rosters.length,10); assert.equal(data.strategies.length,2);
    });
  } finally { await db.close(); }
});

