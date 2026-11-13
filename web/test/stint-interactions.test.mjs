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
    signups:[{driver_id:"1",display_name:"Alice"}],preferences:[],trades:[],strategies:[],
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

