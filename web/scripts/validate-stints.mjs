// Independent checks run together so a failure does not hide the remaining results.
import {spawn} from "node:child_process";
const checks=[
  ["Race clock and sync","node",["test/race-clock.test.mjs"]],
  ["Planning-driver lifecycle","node",["test/planning-drivers.test.mjs"]],
  ["Trade and preference rules","node",["test/stint-trades.test.mjs"]],
  ["Stint click interactions","node",["--test","test/stint-interactions.test.mjs"]],
  ["Booking and qualifying rules","npm",["run","test:stints"]],
  ["Car teams","npm",["run","test:race-teams"]],
  ["ESLint","npm",["run","lint","--","--max-warnings=0","app/race-hq","lib/race-hq.ts","lib/race-clock.ts","app/api/race-hq"]],
];
const results=await Promise.all(checks.map(([name,command,args])=>new Promise((resolve)=>{
  const child=spawn(command,args,{stdio:"inherit"});
  child.once("error",()=>resolve({name,code:1}));
  child.once("exit",(code)=>resolve({name,code:code??1}));
})));
for(const result of results)console.log(result.name+": "+(result.code===0?"PASS":"FAIL"));
if(results.some((r)=>r.code!==0))process.exitCode=1;

