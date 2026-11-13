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

await test("stint trades and non-binding preferences",async(t)=>{
  const db=new PGlite();
  try {
    await db.exec(`create table driver(id bigint primary key,display_name text,avatar_url text,discord_id text,is_admin boolean default false);
      insert into driver(id,display_name) select n,'Driver '||n from generate_series(1,10) n;
      create table event(id bigint generated always as identity primary key,title text,track_key text,starts_at timestamptz,duration_min int,kind text,league text,server text,notes text,min_pit_stops int,created_by bigint references driver);`);
    for(const path of ["../../db/migrations/0020_race_hq.sql","../scripts/migrations/0021_race_signups.sql","../scripts/migrations/0022_car_teams.sql","../scripts/migrations/0024_stint_booking.sql","../scripts/migrations/0025_race_agenda_and_qualifying.sql","../scripts/migrations/0026_stint_trades.sql"])
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


    const route=load("app/api/race-hq/[id]/cars/[carId]/trades/route.ts");
    const preferences=load("app/api/race-hq/[id]/cars/[carId]/preferences/route.ts");
    const hq=load("lib/race-hq.ts");
    const as=(id,review=false)=>{me={id:String(id),display_name:"Driver "+id,is_admin:false,is_reviewer:review};};
    const start=new Date(Date.now()+86400000).toISOString();
    await db.query("insert into event(title,track_key,starts_at,duration_min,status) values('Trades','nurburgring_24h',$1,240,'upcoming')",[start]);
    await db.exec("insert into event_car(event_id,number,name,roster_confirmed,schedule_status) values(1,'330','A',true,'confirmed'),(1,'331','B',true,'open')");
    await db.exec("insert into event_signup(event_id,driver_id) select 1,n from generate_series(1,9) n");
    await db.exec("insert into event_car_driver(event_id,event_car_id,driver_id) select 1,case when n<5 then 1 else 2 end,n from generate_series(1,8) n");
    for(const car of [1,2])for(let i=0;i<4;i++)await db.query("insert into event_car_stint(event_car_id,n,driver_id,starts_at,ends_at) values($1,$2,$3,$4,$5)",
      [car,i+1,(car-1)*4+i+1,new Date(+new Date(start)+i*3600000).toISOString(),new Date(+new Date(start)+(i+1)*3600000).toISOString()]);
    const request=(body,origin="https://example.com")=>new Request("https://example.com/api/race-hq/1/cars/1/trades",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
    const call=(body,car="1",origin)=>route.POST(request(body,origin),{params:Promise.resolve({id:"1",carId:car})});
    const prefer=(stint,preferred,car="1")=>preferences.POST(request({stint_id:String(stint),preferred}),{params:Promise.resolve({id:"1",carId:car})});
    const assignments=async()=> (await db.query("select id,driver_id,starts_at,ends_at from event_car_stint order by id")).rows;
    const offer=async(give,take,to="2")=>{
      const response=await call({action:"offer",to_driver_id:to,give_stint_id:give===null?null:String(give),take_stint_id:take===null?null:String(take)});
      assert.equal(response.status,200,JSON.stringify(await response.json()));
      return String((await db.query("select id from event_stint_trade order by id desc limit 1")).rows[0].id);
    };
    await t.test("an assigned stint can collect multiple preferences without changing the driver",async()=>{
      const before=await assignments();
      as(1);assert.equal((await prefer(2,true)).status,200);assert.equal((await prefer(2,true)).status,200);
      as(3);assert.equal((await prefer(2,true)).status,200);
      let data=await hq.raceHQ("1",me);assert.equal(data.preferences.length,2);
      assert.deepEqual(await assignments(),before);
      as(1);assert.equal((await prefer(2,false)).status,200);
      data=await hq.raceHQ("1",me);assert.equal(data.preferences.length,1);assert.equal(Number(data.preferences[0].driver_id),3);
    });
    await t.test("preference eligibility and car ownership are checked",async()=>{
      me=null;assert.equal((await prefer(2,true)).status,401);
      as(10,true);assert.equal((await prefer(2,true)).status,403);
      as(10);assert.equal((await prefer(2,true)).status,403);
      as(1);assert.equal((await prefer(5,true)).status,404);
      assert.equal((await prefer(2,true,"2")).status,404);
    });
    let swapId;
    await t.test("offering a swap preserves both assignments until the recipient agrees",async()=>{
      const before=await assignments();as(1);
      swapId=await offer(1,2);
      assert.deepEqual(await assignments(),before);
      assert.equal((await call({action:"offer",to_driver_id:"2",give_stint_id:"1",take_stint_id:"2"})).status,409);
      const data=await hq.raceHQ("1",me);assert.equal(data.trades.length,1);
      as(3);assert.equal((await call({action:"accept",trade_id:swapId})).status,403);
      assert.equal((await call({action:"cancel",trade_id:swapId})).status,403);
      as(1);assert.equal((await call({action:"accept",trade_id:swapId})).status,403);
    });
    await t.test("accepting a confirmed-plan swap exchanges both drivers atomically and protects stale editors",async()=>{
      const before=await assignments(),rev=(await db.query("select schedule_revision from event_car where id=1")).rows[0].schedule_revision;
      as(2);assert.equal((await call({action:"accept",trade_id:swapId})).status,200);
      const after=await assignments();assert.equal(Number(after[0].driver_id),2);assert.equal(Number(after[1].driver_id),1);
      assert.deepEqual(after.slice(2),before.slice(2));
      assert.deepEqual(after.map(r=>[r.id,r.starts_at,r.ends_at]),before.map(r=>[r.id,r.starts_at,r.ends_at]));
      const car=(await db.query("select * from event_car where id=1")).rows[0];assert.equal(car.schedule_revision,rev+1);assert.equal(car.schedule_status,"confirmed");
      assert.equal((await call({action:"accept",trade_id:swapId})).status,409);
    });
    await t.test("cover requests work in either direction, with explicit consent",async()=>{
      as(1);const give=await offer(2,null,"3");
      as(3);assert.equal((await call({action:"accept",trade_id:give})).status,200);
      assert.equal(Number((await assignments())[1].driver_id),3);
      as(1);const take=await offer(null,2,"3");
      as(3);assert.equal((await call({action:"accept",trade_id:take})).status,200);
      assert.equal(Number((await assignments())[1].driver_id),1);
    });
    await t.test("decline and cancellation do not change assignments",async()=>{
      const before=await assignments();as(1);const id=await offer(2,3,"3");
      as(3);assert.equal((await call({action:"decline",trade_id:id})).status,200);
      as(1);const next=await offer(2,3,"3");assert.equal((await call({action:"cancel",trade_id:next})).status,200);
      assert.deepEqual(await assignments(),before);
    });
    await t.test("roster boundaries, ownership, malformed offers and origin are enforced",async()=>{
      as(1);
      for(const body of [
        {action:"offer",to_driver_id:"5",give_stint_id:"2",take_stint_id:"5"},
        {action:"offer",to_driver_id:"2",give_stint_id:"3",take_stint_id:"1"},
        {action:"offer",to_driver_id:"2",give_stint_id:null,take_stint_id:null},
        {action:"offer",to_driver_id:"2",give_stint_id:"2",take_stint_id:"2"},
      ])assert([400,409].includes((await call(body)).status));
      assert.equal((await call({action:"offer",to_driver_id:"2",give_stint_id:"2",take_stint_id:"1"},"2")).status,403);
      assert.equal((await call({action:"offer"},"1","https://evil.example")).status,403);
      as(9);assert.equal((await call({action:"offer",to_driver_id:"2",give_stint_id:"2",take_stint_id:"1"})).status,403);
      as(10,true);assert.equal((await call({action:"offer"})).status,403);
      me=null;assert.equal((await call({action:"offer"})).status,401);
    });
    await t.test("changed assignments, retimed slots and changed rosters invalidate pending offers",async()=>{
      as(1);const id=await offer(2,3,"3");
      await db.exec("update event_car_stint set starts_at=starts_at+interval '1 minute' where id=3");
      as(3);assert.equal((await call({action:"accept",trade_id:id})).status,409);
      await db.exec("update event_car_stint set starts_at=starts_at-interval '1 minute' where id=3");
      await db.exec("update event_car_stint set driver_id=4 where id=3");
      assert.equal((await call({action:"accept",trade_id:id})).status,409);
      await db.exec("update event_car_stint set driver_id=3 where id=3");
      await db.exec("update event_car set roster_confirmed=false where id=1");
      assert.equal((await call({action:"accept",trade_id:id})).status,403);
      await db.exec("update event_car set roster_confirmed=true where id=1");
      assert.equal((await call({action:"decline",trade_id:id})).status,200);
    });
    await t.test("cross-car overlaps block acceptance without partially applying a swap",async()=>{
      as(1);const id=await offer(2,3,"3");
      await db.exec("update event_car_stint set driver_id=3 where id=6");
      const before=await assignments();as(3);assert.equal((await call({action:"accept",trade_id:id})).status,409);
      assert.deepEqual(await assignments(),before);assert.equal((await call({action:"decline",trade_id:id})).status,200);
      await db.exec("update event_car_stint set driver_id=6 where id=6");
    });
    await t.test("concurrent accepts choose one offer and cancel conflicting alternatives",async()=>{
      as(1);const a=await offer(2,3,"3"),b=await offer(2,4,"4");
      as(3);const first=call({action:"accept",trade_id:a});as(4);const second=call({action:"accept",trade_id:b});
      assert.deepEqual((await Promise.all([first,second])).map(r=>r.status).sort(),[200,409]);
      const statuses=(await db.query("select status from event_stint_trade where id in ($1,$2) order by id",[a,b])).rows.map(r=>r.status);
      assert.deepEqual(statuses,["accepted","cancelled"]);
    });
    await t.test("started stints cannot be preferred, offered or accepted",async()=>{
      // Driver 1 now owns stint 3 after the preceding swap.
      as(1);const id=await offer(3,4,"4");
      await db.exec("update event_car_stint set starts_at=now()-interval '1 minute' where id=3");
      assert.equal((await prefer(3,true)).status,409);
      assert.equal((await call({action:"offer",to_driver_id:"4",give_stint_id:"3",take_stint_id:"4"})).status,409);
      as(4);assert.equal((await call({action:"accept",trade_id:id})).status,409);
    });
    await t.test("archived races reject trades and preferences",async()=>{
      await db.exec("update event set status='finished',archived_at=now() where id=1");as(1);
      assert.equal((await call({action:"offer",to_driver_id:"4",give_stint_id:null,take_stint_id:"4"})).status,409);
      assert.equal((await prefer(4,true)).status,409);
    });
  }finally{await db.close();}
});
