import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const cache=new Map();let writes=0;
function load(path){path=resolve(path);if(cache.has(path))return cache.get(path);const exports={};cache.set(path,exports);
 const require=(id)=>{
  if(id==='./db')return {sql:{begin:()=>{writes++;throw Error('Unexpected database write');}}};
  if(id==='./acc-identity'||id==='./cars'||id==='./track-catalog')return load(resolve(dirname(path),id+'.ts'));
  return {};
 };
 vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require});return exports;
}
const {accIdentityError}=load('lib/acc-identity.ts');
const {importBundle}=load('lib/import-bundle.ts');
const bundle={format:'acc-coach/session',version:1,simulator:'acc',source:{kind:'shared_memory',file:'test.accrec',sha256:'test'},session:{track:'cota',car:'ford_mustang_gt3'}};
await test('ACU tracks cannot be relabelled as ACC or merged into COTA',async()=>{
 for(const track of ['acu_unitedstates','ACU unitedstates','acu_mexico_2021','ACU Mexico 2021','ks_nordschleife','__proto__']){
  const bad={...bundle,session:{...bundle.session,track}};
  assert(accIdentityError(bad));await assert.rejects(()=>importBundle(bad,'1'),/Unsupported ACC track/);
 }
 assert.equal(writes,0);
});
await test('old ACC payloads remain compatible with genuine tracks and case variants',()=>{
 for(const track of ['cota','COTA','nurburgring','nurburgring_24h','Zolder'])assert.equal(accIdentityError({...bundle,session:{...bundle.session,track}}),null);
 assert.equal(accIdentityError({...bundle,session:{...bundle.session,car:null}}),null);
});
await test('simulator and non-ACC cars are checked independently',async()=>{
 for(const bad of [{...bundle,simulator:'ac'},{...bundle,session:{...bundle.session,car:'ks_porsche_911_gt3_rs'}},{...bundle,session:{...bundle.session,car:'formula_hybrid_2021'}}]){
  assert(accIdentityError(bad));await assert.rejects(()=>importBundle(bad,'1'));
 }
 assert.equal(writes,0);
});
await test('new positive provenance accepted; mismatched process proof rejected',()=>{
 const proof={simulator:'acc',method:'windows-process',executable:'AC2-Win64-Shipping.exe'};
 assert.equal(accIdentityError({...bundle,source:{...bundle.source,simulator_identity:proof}}),null);
 assert(accIdentityError({...bundle,source:{...bundle.source,simulator_identity:{...proof,executable:'acs.exe'}}}));
});
