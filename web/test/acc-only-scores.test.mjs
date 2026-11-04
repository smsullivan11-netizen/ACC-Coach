import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

await test('ACC-only scores correct existing contamination without altering source records', async (t) => {
 const db = new PGlite();
 try {
  await db.exec(`
   create table track(id bigint primary key,simulator text,key text);
   create table car(id bigint primary key,simulator text,key text);
   create table session(id bigint primary key,driver_id bigint,track_id bigint,car_id bigint,recorded_at timestamp,uploaded_at timestamptz);
   create table lap(id bigint primary key,session_id bigint,lap_time_ms int);
   create table driver_rating(id bigint primary key,driver_id bigint,session_id bigint,rating real,session_score real,pace real,consistency real,clean real,smoothness real,laps int,created_at timestamptz default now());
   insert into track values (1,'acc','cota'),(2,'acc','acu_unitedstates'),(3,'acc','nurburgring_24h'),(4,'acc','acu_mexico_2021'),(5,'acc','spa'),(6,'other','cota');
   insert into car values(1,'acc','ford_mustang_gt3'),(2,'acc','formula_hybrid_2021'),(3,'other','ford_mustang_gt3');
   insert into session values
    (1,1,1,1,'2026-01-01', '2026-01-01'),(2,1,2,1,'2026-01-02','2026-01-02'),
    (3,1,3,1,'2026-01-03','2026-01-03'),(4,1,4,1,'2026-01-04','2026-01-04'),
    (5,1,1,1,'2026-01-05','2026-01-05'),(6,1,1,1,'2026-01-06','2026-01-06'),
    (7,1,4,1,'2027-01-01','2027-01-01'),(8,2,2,1,'2026-01-01','2026-01-01'),
    (9,3,1,1,'2026-01-01','2026-01-01'),(10,3,3,1,'2026-01-02','2026-01-02'),
    (11,4,1,null,'2026-01-01','2026-01-01'),(12,4,1,2,'2026-01-02','2026-01-02'),
    (13,4,1,3,'2026-01-03','2026-01-03'),(14,4,6,1,'2026-01-04','2026-01-04');
   insert into lap select id,id,123456 from session;
   insert into driver_rating (id,driver_id,session_id,rating,session_score,pace,consistency,clean,smoothness,laps)
    select id,driver_id,id,99,case id when 1 then 60 when 3 then 80 when 5 then 90 when 6 then 70 when 9 then 40 when 10 then 60 when 11 then 55 else 100 end,50,50,50,50,
      case when id in(5,9,10) then 2 else 5 end from session;
  `);
  const snapshot = async () => Promise.all(['session','lap','driver_rating'].map(async table => (await db.query(`select * from ${table} order by id`)).rows));
  const before = await snapshot();
  await db.exec(readFileSync(new URL('../scripts/migrations/0023_acc_only_scores.sql',import.meta.url),'utf8'));
  await t.test('invalid tracks are absent from score history and raw cached scores are ignored',async()=>{
   const rows=(await db.query('select id,rating from acc_driver_rating where driver_id=1 order by id')).rows;
   assert.deepEqual(rows.map(r=>Number(r.id)),[1,3,5,6]);assert.deepEqual(rows.map(r=>r.rating),[60,70,70,75]);
   assert.equal((await db.query('select count(*)::int as n from acc_driver_rating where driver_id=2')).rows[0].n,0);
  });
  await t.test('five-lap qualification, fallback and missing-car compatibility are preserved',async()=>{
   assert.equal((await db.query('select rating from acc_driver_rating where id=10')).rows[0].rating,50);
   const rows=(await db.query('select id,rating from acc_driver_rating where driver_id=4')).rows;
   assert.equal(rows.length,1);assert.equal(Number(rows[0].id),11);assert.equal(rows[0].rating,55);
  });
  await t.test('unsupported recent sessions do not move the valid-session 60-day window',async()=>{
   assert.equal((await db.query('select rating from acc_driver_rating where driver_id=1 order by id desc limit 1')).rows[0].rating,75);
  });
  await t.test('creating the score projection does not mutate sessions, laps or historical rating rows',async()=>{
   assert.deepEqual(await snapshot(),before);
  });
  await t.test('future legacy-host writes are excluded automatically and future ACC evidence still counts',async()=>{
   await db.exec(`insert into session values(15,1,4,1,'2027-02-01','2027-02-01');
    insert into driver_rating values(15,1,15,100,100,100,100,100,100,5,now());`);
   assert.equal((await db.query('select rating from acc_driver_rating where driver_id=1 order by id desc limit 1')).rows[0].rating,75);
   await db.exec(`insert into session values(16,1,5,1,'2026-05-01','2027-02-02');
    insert into driver_rating values(16,1,16,99,50,50,50,50,50,5,now());`);
   assert.equal((await db.query('select rating from acc_driver_rating where id=16')).rows[0].rating,50);
   assert.equal((await db.query('select rating from driver_rating where id=16')).rows[0].rating,99);
  });
 } finally { await db.close(); }
});
await test('all score consumers read the corrected projection, preserving raw writes',()=>{
 function walk(path){for(const entry of readdirSync(path,{withFileTypes:true})){
  if(['node_modules','.next','test','scripts'].includes(entry.name))continue;
  const p=join(path,entry.name);if(entry.isDirectory())walk(p);
  else if(/\.tsx?$/.test(p)){for(const line of readFileSync(p,'utf8').split('\n')){
   if(line.includes('from driver_rating')&&!line.includes('delete from'))assert.fail(`Unfiltered score read: ${p}: ${line}`);
  }}
 }}walk('.');
 const source=readFileSync('lib/ratings.ts','utf8');assert(source.includes('insert into driver_rating'));assert(source.includes('from acc_rating_evidence'));
});
await test('rating processor skips unsupported sessions before reading laps or writing a rating',async()=>{
 const vm=await import('node:vm');const ts=(await import('typescript')).default;
 const {resolve,dirname}=await import('node:path');const modules=new Map();
 function load(path){path=resolve(path);if(modules.has(path))return modules.get(path);const exports={};modules.set(path,exports);
  vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:id=>['./acc-identity','./cars','./track-catalog'].includes(id)?load(resolve(dirname(path),id+'.ts')):{}});return exports;
 }
 const {rateSession}=load('lib/ratings.ts');let queries=0;
 const tx=async()=>{queries++;return[{driver_id:'1',track_id:'1',track:'acu_mexico_2021',simulator:'acc',car:'ford_mustang_gt3',car_simulator:'acc',car_class:'GT3',session_type:'practice',rating_type:null}];};
 assert.equal(await rateSession(tx,'1'),null);assert.equal(queries,1);
});
