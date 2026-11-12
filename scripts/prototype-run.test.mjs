import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {hash} from './production/api.mjs';
import {ROOT} from './collection.mjs';
import {assertNewPrototypeSource,reusablePrototypeCapture} from './prototype-run.mjs';
import {loadQualityPolicy,loadRejectedSources} from './quality-gate.mjs';

test('unchanged rejected real source stops before build, capture or model work',()=>{
 assert.throws(()=>assertNewPrototypeSource(ROOT,loadQualityPolicy(ROOT).calibration.negatives[0].sourceSha256),/User-rejected/);
 assert.throws(()=>assertNewPrototypeSource(ROOT,loadRejectedSources(ROOT)[0].sourceSha256),/Rejected source/);
});

test('capture reuse binds source, static capture plan, tools and every actual image',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-prototype-cache-'));
 t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.match(path.basename(root),/^webart-prototype-cache-/);fs.rmSync(root,{recursive:true,force:true})});
 const write=(file,value)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,typeof value==='string'?value:JSON.stringify(value))};
 const runDirectory='docs/production/runs/cache',directory=runDirectory+'/prototype-006-prior',sourceSha256='a'.repeat(64),cfg={id:'006',runDirectory};
 const prototypeCapture={ready:'true',states:{opening:0,transition:.3,middle:.6,ending:1},pointer:{selector:'.index'}},visualContract={schemaVersion:1,states:{}},plan={prototypeCapture,visualContract};
 const dependencies=['scripts/capture-production.mjs','scripts/production/device-metrics.mjs','scripts/production/native-scroll.mjs','scripts/production/visual-contract.mjs'].map(file=>({path:file,sha256:hash(file)}));
 const framePath='docs/evidence/cache/real-frame.jpg';write(framePath,'Actual fixture bytes');const e={path:framePath,sha256:hash('Actual fixture bytes')};
 write(directory+'/state.json',{sourceSha256,dependencies});
 write(directory+'/capture-config-0.json',{...prototypeCapture,visualContract,url:'http://127.0.0.1:1234/',output:'docs/evidence/cache',manifest:'private/manifest.json',slug:'house-of-ivory'});
 write(directory+'/capture-0.json',{sourceSha256,result:'captured-not-scored',errors:[],states:[{evidence:[e]}],motion:[{evidence:[e]}]});
 const options={cfg,sourceSha256,plan,dependencies};
 const reused=reusablePrototypeCapture(root,options);assert.ok(reused);assert.equal(reused.record.stage,'capture-only');assert.equal(reused.record.reviewReused,false);
 assert.equal(reusablePrototypeCapture(root,{...options,sourceSha256:'b'.repeat(64)}),null);
 assert.equal(reusablePrototypeCapture(root,{...options,plan:{...plan,prototypeCapture:{...prototypeCapture,enterMs:500}}}),null);
 assert.equal(reusablePrototypeCapture(root,{...options,dependencies:dependencies.map((e,i)=>i?e:{...e,sha256:'0'.repeat(64)})}),null);
 assert.equal(reusablePrototypeCapture(root,{...options,dependencies:dependencies.map(e=>e.path.endsWith('device-metrics.mjs')?{...e,sha256:'0'.repeat(64)}:e)}),null);
 write(framePath,'Changed bytes');assert.throws(()=>reusablePrototypeCapture(root,options),/changed or empty evidence/);
});
