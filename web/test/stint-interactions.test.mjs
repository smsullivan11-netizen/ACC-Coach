import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import vm from "node:vm";
import ts from "typescript";

// Exercise the real component event handlers and payloads. Browser focus/layout
// still need a browser; this small hook host does not pretend to implement a DOM.
function host() {
  let current;
  const cache=new Map();
  const react={
    useState:(initial)=>current.state(initial),
    useRef:()=>({current:null}),
    useEffect:()=>{},
  };
  const jsx=(type,props,key)=>({type,props:props??{},key});
  function load(path){
    path=resolve(path);if(cache.has(path))return cache.get(path);
    const exports={};cache.set(path,exports);
    const compiled=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
    const errors=compiled.diagnostics?.filter((d)=>d.category===ts.DiagnosticCategory.Error)??[];
    assert.equal(errors.length,0,"TSX should transpile");
    vm.runInNewContext(compiled.outputText,{exports,Intl,crypto,require:(id)=>{
      if(id==="react")return react;
      if(id==="react/jsx-runtime")return {jsx,jsxs:jsx,Fragment:"fragment"};
      if(id.endsWith(".css"))return {__esModule:true,default:new Proxy({},{get:(_,p)=>String(p)})};
      if(id.startsWith("@/"))return load(resolve(id.slice(2))+".ts");
      if(id.startsWith("./"))return load(resolve(path,"..",id)+".tsx");
      throw new Error("Unexpected client dependency "+id);
    }});
    return exports;
  }
  function mount(component,props){
    const values=[];let index=0;
    const root={props,tree:null,state(initial){
      const n=index++;if(!(n in values))values[n]=typeof initial==="function"?initial():initial;
      return [values[n],(value)=>{values[n]=typeof value==="function"?value(values[n]):value;}];
    },render(){index=0;current=root;root.tree=component(root.props);return root.tree;}};
    root.render();return root;
  }
  return {load,mount};
}
function nodes(tree){
  if(tree==null||typeof tree!=="object")return [];
  if(Array.isArray(tree))return tree.flatMap(nodes);
  return [tree,...nodes(tree.props?.children)];
}
const label=(node)=>node==null?"":typeof node==="string"||typeof node==="number"?String(node):Array.isArray(node)?node.map(label).join(""):label(node.props?.children);
const button=(root,text)=>nodes(root.render()).find((n)=>n.type==="button"&&label(n).includes(text));
const flush=()=>new Promise((done)=>setImmediate(done));
async function click(root,text){const node=button(root,text);assert(node,"Missing button: "+text);assert(!node.props.disabled,"Disabled button: "+text);node.props.onClick();await flush();root.render();}
const plain=(v)=>JSON.parse(JSON.stringify(v));
function fixture(){
  const start=Date.now()+86400000;
  const car={id:"1",number:"330",name:"Car A",roster_confirmed:true,schedule_status:"draft",schedule_revision:1,qualifying_driver_id:null,qualifying_driver:null};
  const data={event:{id:"1",starts_at:new Date(start).toISOString(),duration_min:180,status:"upcoming",archived_at:null,qualifying_starts_at:new Date(start-1800000).toISOString(),qualifying_min:25},
    cars:[car],me:{id:"1",display_name:"Alice"},can_lead:false,
    planning_drivers:[],signups:[{driver_id:"1",display_name:"Alice"}],preferences:[],trades:[],strategies:[],
    rosters:[{event_car_id:"1",driver_id:"1",display_name:"Alice"},{event_car_id:"1",driver_id:"2",display_name:"Bob"},{event_car_id:"1",driver_id:"3",display_name:"Charlie"},{event_car_id:"1",driver_id:"4",display_name:"Dana"}],
    stints:[null,"1","2"].map((driver,i)=>({id:String(i+1),n:i+1,event_car_id:"1",driver_id:driver,driver:driver==="1"?"Alice":driver==="2"?"Bob":null,
      starts_at:new Date(start+i*3600000).toISOString(),ends_at:new Date(start+(i+1)*3600000).toISOString(),note:null}))};
  return {car,data,now:Date.now()};
}
await test("clicking a schedule row opens booking directly, with no editor step",async()=>{
  const h=host(),f=fixture(),calls=[];
  const root=h.mount(h.load("app/race-hq/StintSchedule.tsx").default,{...f,busy:false,setSelected:()=>{},
    onAction:async(body)=>{calls.push(plain(body));return true;},onTrade:async()=>true,onPreference:async()=>true});
  assert(!button(root,"Customize schedule"));
  const row=nodes(root.tree).find((n)=>n.type==="button"&&n.props["aria-label"]?.startsWith("Stint 1,"));
  assert(row);row.props.onClick();root.render();
  const child=nodes(root.tree).find((n)=>typeof n.type==="function"&&n.type.name==="StintActions");
  assert(child,"Click should open stint details");
  const modal=h.mount(child.type,child.props);
  await click(modal,"I’ll drive this stint");
  assert.deepEqual(calls,[{action:"claim",stint_id:"1",revision:1}]);
});
await test("preferences on an occupied stint do not call booking or trading",async()=>{
  const h=host(),f=fixture(),pref=[],booking=[],trades=[];
  const props={...f,stintId:"3",busy:false,time:()=> "10:30",zone:"UTC",close:()=>{},
    onAction:async b=>{booking.push(b);return true;},onTrade:async b=>{trades.push(b);return true;},
    onPreference:async b=>{pref.push(plain(b));f.data.preferences=b.preferred?[{stint_id:"3",driver_id:"1",display_name:"Alice"}]:[];return true;}};
  const root=h.mount(h.load("app/race-hq/StintActions.tsx").default,props);
  await click(root,"Prefer this stint");await click(root,"remove preference");
  assert.deepEqual(pref,[{stint_id:"3",preferred:true},{stint_id:"3",preferred:false}]);
  assert.equal(f.data.stints[2].driver_id,"2");assert.equal(booking.length,0);assert.equal(trades.length,0);
});
await test("clicking a teammate’s stint can offer a specific owned stint as a swap",async()=>{
  const h=host(),f=fixture(),calls=[];
  const root=h.mount(h.load("app/race-hq/StintActions.tsx").default,{...f,stintId:"3",busy:false,time:()=> "10:30",zone:"UTC",close:()=>{},
    onAction:async()=>true,onPreference:async()=>true,onTrade:async b=>{calls.push(plain(b));return true;}});
  const select=nodes(root.tree).find((n)=>n.type==="select");select.props.onChange({target:{value:"2"}});root.render();
  await click(root,"Propose swap");
  assert.deepEqual(calls,[{action:"offer",revision:1,to_driver_id:"2",give_stint_id:"2",take_stint_id:"3"}]);
  assert.equal(f.data.stints[1].driver_id,"1");assert.equal(f.data.stints[2].driver_id,"2");
});
await test("a changed revision blocks booking until the driver reviews current details",async()=>{
  const h=host(),f=fixture();
  const root=h.mount(h.load("app/race-hq/StintActions.tsx").default,{...f,stintId:"1",busy:false,time:()=> "10:30",zone:"UTC",close:()=>{},onAction:async()=>true,onPreference:async()=>true,onTrade:async()=>true});
  f.car.schedule_revision=2;root.render();
  assert.equal(button(root,"I’ll drive this stint").props.disabled,true);
  await click(root,"Use latest details");
  assert.equal(button(root,"I’ll drive this stint").props.disabled,false);
});
await test("only incoming offers present accept and decline; outgoing offers can be cancelled",async()=>{
  const h=host(),f=fixture(),calls=[];
  f.data.me={id:"2",display_name:"Bob"};
  f.data.trades=[{id:"1",event_car_id:"1",from_driver_id:"1",to_driver_id:"2",from_driver:"Alice",to_driver:"Bob",give_stint_id:"2",take_stint_id:"3",give_n:2,take_n:3,
    give_starts_at:f.data.stints[1].starts_at,give_ends_at:f.data.stints[1].ends_at,take_starts_at:f.data.stints[2].starts_at,take_ends_at:f.data.stints[2].ends_at}];
  const root=h.mount(h.load("app/race-hq/StintOffers.tsx").default,{data:f.data,carId:"1",now:f.now,busy:false,time:()=> "10:30",zone:"UTC",onTrade:async b=>{calls.push(plain(b));return true;}});
  await click(root,"Accept swap");assert.deepEqual(calls,[{action:"accept",trade_id:"1"}]);
  f.data.me={id:"1",display_name:"Alice"};root.render();assert(!button(root,"Accept swap"));assert(button(root,"Cancel offer"));
});


function teamFixture() {
  const f=fixture();f.data.can_lead=true;
  f.data.cars.push({...f.car,id:"2",number:"331",name:"Car B",roster_confirmed:false});
  f.data.signups=Array.from({length:9},(_,i)=>({driver_id:String(i+1),display_name:"Driver "+(i+1)}));
  f.data.rosters.push(...[5,6,7].map(n=>({event_car_id:"2",driver_id:String(n),display_name:"Driver "+n})));
  return f;
}
function secondRoster(h,f,onSave) {
  const teams=h.mount(h.load("app/race-hq/CarTeams.tsx").default,{data:f.data,busy:false,onSave});
  const node=nodes(teams.tree).find(n=>typeof n.type==="function"&&n.type.name==="Roster"&&n.props.car.id==="2");
  assert(node,"Second car should have its own roster component");
  return h.mount(node.type,node.props);
}
function checkbox(root,name) {
  const row=nodes(root.render()).find(n=>n.type==="label"&&label(n).includes(name));
  assert(row,"Missing driver choice "+name);
  return nodes(row).find(n=>n.type==="input"&&n.props.type==="checkbox");
}
function choose(root,name,checked) {
  const input=checkbox(root,name);assert(!input.props.disabled,"Driver choice must be editable");
  input.props.onChange({target:{checked}});root.render();
}
await test("car two explains its missing fourth driver and confirms the selected roster independently",async()=>{
  const h=host(),f=teamFixture(),calls=[];
  const root=secondRoster(h,f,async(carId,body)=>{
    calls.push([carId,plain(body)]);
    f.data.cars[1].roster_confirmed=body.confirmed;
    f.data.rosters=f.data.rosters.filter(r=>r.event_car_id!==carId).concat(body.driver_ids.map(id=>({event_car_id:carId,driver_id:id,display_name:"Driver "+id})));
    return true;
  });
  await click(root,"Assign registered drivers");
  assert.equal(button(root,"Confirm roster").props.disabled,true);
  assert(nodes(root.tree).some(n=>n.props?.role==="status"&&label(n).includes("Select 1 more driver")));
  choose(root,"Driver 8",true);
  assert.equal(button(root,"Confirm roster").props.disabled,false);
  await click(root,"Confirm roster");
  assert.deepEqual(calls,[["2",{action:"roster",driver_ids:["5","6","7","8"],confirmed:true}]]);
  assert(nodes(root.tree).some(n=>n.props?.role==="status"&&label(n).includes("Car #331 roster confirmed")));
  assert(!button(root,"Confirm roster"),"Successful save should close the editor");
  assert.equal(f.data.rosters.filter(r=>r.event_car_id==="1").length,4);
});
await test("a rejected second-car save shows the exact server reason beside the button",async()=>{
  const h=host(),f=teamFixture();
  const root=secondRoster(h,f,async(_id,_body,_message,onError)=>{onError("A driver can belong to only one car in this race.");return false;});
  await click(root,"Assign registered drivers");choose(root,"Driver 8",true);await click(root,"Confirm roster");
  assert(nodes(root.tree).some(n=>n.props?.role==="alert"&&label(n)==="A driver can belong to only one car in this race."));
  assert(button(root,"Confirm roster"),"A rejected save should keep the editor open");
  assert.equal(checkbox(root,"Driver 8").props.checked,true);
});
await test("a driver assigned to the other car during editing remains removable",async()=>{
  const h=host(),f=teamFixture(),calls=[];
  const root=secondRoster(h,f,async(id,body)=>{calls.push([id,plain(body)]);return true;});
  await click(root,"Assign registered drivers");choose(root,"Driver 8",true);
  f.data.rosters.push({event_car_id:"1",driver_id:"8",display_name:"Driver 8"});root.render();
  assert.equal(checkbox(root,"Driver 8").props.checked,true);
  assert.equal(checkbox(root,"Driver 8").props.disabled,false);
  assert.equal(button(root,"Confirm roster").props.disabled,true);
  choose(root,"Driver 8",false);choose(root,"Driver 9",true);await click(root,"Confirm roster");
  assert.deepEqual(calls,[["2",{action:"roster",driver_ids:["5","6","7","9"],confirmed:true}]]);
});
await test("a withdrawn selected signup stays visible so the lead can remove it",async()=>{
  const h=host(),f=teamFixture();
  const root=secondRoster(h,f,async()=>true);
  await click(root,"Assign registered drivers");choose(root,"Driver 8",true);
  f.data.signups=f.data.signups.filter(s=>s.driver_id!=="8");root.render();
  assert.equal(checkbox(root,"Driver 8").props.checked,true);
  assert.equal(button(root,"Confirm roster").props.disabled,true);
  assert(label(root.tree).includes("no longer registered"));
  choose(root,"Driver 8",false);assert.equal(checkbox(root,"Driver 9").props.disabled,false);
});

await test("a race lead can confirm three joined drivers plus a named planning spot",async()=>{
  const h=host(),f=teamFixture(),calls=[];
  f.data.planning_drivers=[{id:"20",event_car_id:"2",name:"Future teammate"}];
  const root=secondRoster(h,f,async(id,body)=>{calls.push([id,plain(body)]);return true;});
  await click(root,"Assign registered drivers");
  assert.equal(button(root,"Confirm roster").props.disabled,false);
  assert(label(root.tree).includes("1 awaiting Discord"));
  await click(root,"Confirm roster");
  assert.deepEqual(calls,[["2",{action:"roster",driver_ids:["5","6","7"],confirmed:true}]]);
});
await test("any race lead can add and link a planning driver using the signed-up profile",async()=>{
  const h=host(),f=fixture(),calls=[];
  f.data.can_lead=true;f.data.me.is_admin=false;
  f.data.planning_drivers=[];
  const root=h.mount(h.load("app/race-hq/PlanningDrivers.tsx").default,{data:f.data,carId:"1",busy:false,onAction:async(id,body)=>{calls.push([id,plain(body)]);return true;}});
  const input=nodes(root.tree).find(n=>n.type==="input");input.props.onChange({target:{value:"Future teammate"}});root.render();
  const form=nodes(root.tree).find(n=>n.type==="form");await form.props.onSubmit({preventDefault(){}});await flush();root.render();
  assert.deepEqual(calls,[["1",{action:"add",name:"Future teammate"}]]);
  f.data.planning_drivers=[{id:"20",event_car_id:"1",name:"Future teammate"}];root.render();
  const select=nodes(root.tree).find(n=>n.type==="select");select.props.onChange({target:{value:"1"}});root.render();
  await click(root,"Link account & assign stints");
  assert.deepEqual(calls[1],["1",{action:"link",planning_driver_id:"20",driver_id:"1"}]);
});
await test("a reserved planning-driver stint cannot be claimed as an open slot",async()=>{
  const h=host(),f=fixture();
  f.data.stints[0].planning_driver_id="20";f.data.stints[0].driver="Future teammate";
  f.data.planning_drivers=[{id:"20",event_car_id:"1",name:"Future teammate"}];
  const root=h.mount(h.load("app/race-hq/StintActions.tsx").default,{...f,stintId:"1",busy:false,time:()=> "10:30",zone:"UTC",close:()=>{},onAction:async()=>true,onPreference:async()=>true,onTrade:async()=>true});
  assert(!button(root,"I’ll drive this stint"));
  assert(label(root.tree).includes("awaiting Discord"));
});
await test("a race lead can enter ACC time remaining through the prominent sync control",async()=>{
  const h=host(),f=fixture(),calls=[];
  const root=h.mount(h.load("app/race-hq/RaceClock.tsx").default,{event:f.data.event,now:f.now,canLead:true,busy:false,connection:"online",onSync:async b=>{calls.push(plain(b));return true;}});
  await click(root,"Sync race clock");
  const child=nodes(root.tree).find(n=>typeof n.type==="function"&&n.type.name==="ClockSync");
  assert(child);const modal=h.mount(child.type,child.props);
  const inputs=nodes(modal.tree).filter(n=>n.type==="input");
  ["2","15","30"].forEach((value,i)=>{inputs[i].props.onChange({target:{value}});modal.render();});
  const form=nodes(modal.tree).find(n=>n.type==="form");await form.props.onSubmit({preventDefault(){}});await flush();
  assert.deepEqual(calls,[{action:"clock",mode:"manual",status:"live",remaining_s:8130,observed_at:new Date(f.now).toISOString()}]);
});
await test("viewers get the clock without sync controls, and invalid minute entries cannot be saved",async()=>{
  const h=host(),f=fixture();
  const root=h.mount(h.load("app/race-hq/RaceClock.tsx").default,{event:f.data.event,now:f.now,canLead:false,busy:false,connection:"offline",onSync:async()=>true});
  assert(!button(root,"Sync race clock"));assert(label(root.tree).includes("Offline"));
  root.props.canLead=true;await click(root,"Sync race clock");
  const child=nodes(root.tree).find(n=>typeof n.type==="function"&&n.type.name==="ClockSync");
  const modal=h.mount(child.type,{...child.props,connection:"online"});
  const minutes=nodes(modal.tree).find(n=>n.type==="input"&&n.props["aria-label"]==="Minutes");minutes.props.onChange({target:{value:"60"}});modal.render();
  assert.equal(button(modal,"Sync to this time remaining").props.disabled,true);
});

