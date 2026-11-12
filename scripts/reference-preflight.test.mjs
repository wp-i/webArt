import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {ROOT} from './collection.mjs';
import {referencePreflight,beginCandidate} from './production-flow.mjs';
import {visualContractHash} from './production/visual-contract.mjs';
const source='docs/production/runs/2026-10-13-redo/010-reference-review.json',cohort='docs/production/runs/2026-10-13-redo/reviewer-calibration.json';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-reference-preflight-'));
 t.after(()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true})});
 const copy=file=>{const output=path.join(root,file);fs.mkdirSync(path.dirname(output),{recursive:true});fs.copyFileSync(path.join(ROOT,file),output)};
 const write=(file,data)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),JSON.stringify(data))};
 const report=JSON.parse(fs.readFileSync(path.join(ROOT,source))),cal=JSON.parse(fs.readFileSync(path.join(ROOT,cohort)));
 // Controlled gate fixture, not a new visual judgment of this historical reference.
 report.signatureFeatures.forEach((f,i)=>{f.name='fixture-signature-'+i});const description='Controlled structural fixture for required subject, material, composition and visual purpose; not art approval.';
 report.visualContract={schemaVersion:1,states:Object.fromEntries(['opening','transition','middle','ending'].map(state=>[state,{subject:description,material:description,composition:description,role:description,visibleCharacters:{desktop:180,mobile:140},subjectSelectors:[{selector:'canvas',minimumViewportArea:.08,maxInstances:1}]}])),continuity:[]};report.visualContractSha256=visualContractHash(report.visualContract);
 report.stateChecks=report.states.map(s=>({viewport:s.viewport,state:s.state,subject:'preserved',material:'preserved',composition:'preserved',role:'preserved',finding:description,evidence:s.evidence}));report.continuityChecks=[];
 const paths=new Set();function walk(value){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object'){if(value.path&&value.sha256)paths.add(value.path);Object.values(value).forEach(walk)}}walk(report);walk(cal);paths.forEach(copy);
 copy('docs/production/quality-calibration.json');copy('webart.quality.json');write(source,report);write(cohort,cal);
 write('webart.collection.json',{schemaVersion:1,templates:[{id:'001',slug:'baseline',manifest:'baseline.json'},{id:'007',slug:'campovivo',manifest:'campovivo.json'},{id:'010',slug:'pace',manifest:'pace.json'}]});
 return{root,report,cal,write};
}
test('an admitted reference creates only a locked private study entry, with no release permission',t=>{
 const f=fixture(t),directory='.webart/prototypes/preflight-study';
 f.report.reviewer.inputScope='benchmark+negative+reference';f.write(source,f.report);
 const result=beginCandidate(f.root,'010',directory,source,cohort);
 assert.equal(result.decision,'reference-admitted-for-prototype-only');assert.equal(result.packageAuthorized,false);assert.equal(result.inventoryChanged,false);
 assert.deepEqual(fs.readdirSync(path.join(f.root,directory)),['reference-admission.json']);
 assert.equal(fs.existsSync(path.join(f.root,'public')),false);
 assert.throws(()=>beginCandidate(f.root,'010',directory,source,cohort),/overwritten or revived/);
});
test('every material reference deficit stops before a study directory or asset is created',t=>{
 const f=fixture(t),directory='.webart/prototypes/blocked-study';
 for(const key of f.report.dimensions.map(d=>d.key)){
  const r=structuredClone(f.report);r.dimensions.find(d=>d.key===key).againstBenchmark='below';f.write(source,r);
  assert.throws(()=>beginCandidate(f.root,'007',directory,source,cohort),/below the accepted benchmark/);
  assert.equal(fs.existsSync(path.join(f.root,directory)),false);
 }
 for(const decision of ['reject','evidence-needed']){const r=structuredClone(f.report);r.decision=decision;f.write(source,r);assert.throws(()=>beginCandidate(f.root,'007',directory,source,cohort),/not admitted/);assert.equal(fs.existsSync(path.join(f.root,directory)),false)}
});
test('early admission still requires current reviewer binding, intact evidence and scene-level input',t=>{
 const f=fixture(t);
 for(const mutate of [r=>r.reviewer.id='uncalibrated',r=>r.motion[0].primaryVisual=false,r=>r.signatureFeatures[0].retained=false,r=>r.states[0].evidence[0].sha256='f'.repeat(64)]){
  const r=structuredClone(f.report);mutate(r);f.write(source,r);assert.throws(()=>referencePreflight(f.root,source,cohort));
 }
 f.write(source,f.report);f.cal.purpose='ground-truth-audit';f.write(cohort,f.cal);assert.throws(()=>referencePreflight(f.root,source,cohort),/fresh calibrated reviewer/);
 assert.throws(()=>beginCandidate(f.root,'001','.webart/prototypes/benchmark',source,cohort),/benchmark/);
 assert.throws(()=>beginCandidate(f.root,'010','.webart/prototypes/../escape',source,cohort),/private prototype/);
});
test('private creation cannot follow a linked ancestor even when its prototypes folder does not exist',t=>{
 const f=fixture(t),storage=path.join(f.root,'owned-elsewhere');fs.mkdirSync(storage);fs.symlinkSync(storage,path.join(f.root,'.webart'),process.platform==='win32'?'junction':'dir');
 assert.throws(()=>beginCandidate(f.root,'010','.webart/prototypes/linked-study',source,cohort),/Symbolic links/);
 assert.equal(fs.existsSync(path.join(storage,'prototypes')),false);
});
