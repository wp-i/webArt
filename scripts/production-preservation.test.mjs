import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {ROOT} from './collection.mjs';
import {loadRejectedSources,evaluateQuality,recordRejectedSource,validateRejectedReview} from './quality-gate.mjs';
import {loadCohort,review} from './production/evidence.mjs';
import {hash} from './production/api.mjs';
import {validateVisualContract,visualContractHash,validateVisualReview,assertVisualCapture,visualMeasurementFailures} from './production/visual-contract.mjs';
import {resolveLockedModules,mergeLockedModules,assertPackagedModules,loadRejectedCoreModules,recordRejectedCoreModules} from './production/locked-modules.mjs';
import {nextStep,loadPlan} from './production/runner.mjs';

const read=file=>JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-preservation-'));t.after(()=>{assert.ok(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('webart-preservation-'));fs.rmSync(root,{recursive:true,force:true})});const write=(p,v)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v))};return {root,write}}
export function contractFixture(signature='instrument'){
 const description='Controlled structural fixture for the configured subject, material and visual function; this is not an aesthetic approval.';
 return {schemaVersion:1,states:Object.fromEntries(['opening','transition','middle','ending'].map(state=>[state,{subject:description,material:description,composition:description,role:description,visibleCharacters:{desktop:180,mobile:140},subjectSelectors:[{selector:'[data-subject]',minimumViewportArea:.08,maxInstances:1}]}])),continuity:[{id:'same-instrument',states:['opening','middle','ending'],identity:description,signature}]};
}
test('all real rejected prototypes remain blocked after renaming or an invented new peer certificate',()=>{
 const rejected=loadRejectedSources(ROOT);assert.ok(rejected.length>=3);
 for(const r of rejected){const result=evaluateQuality(ROOT,{id:'999',qualityReview:'new-claimed-95.json'},r.sourceSha256);assert.equal(result.decision,'blocked-previously-rejected-source');assert.equal(result.review,r.review.path)}
 const p=read('docs/production/quality-calibration.json');assert.equal(evaluateQuality(ROOT,{id:'999',qualityReview:'new-claimed-95.json'},p.negatives[0].sourceSha256).decision,'blocked-below-user-benchmark');
});

test('a real late responsive rejection binds all twenty states and its measured runtime',()=>{
 const item=loadRejectedSources(ROOT).find(r=>read(r.review.path).phase==='full-qa');assert.ok(item);
 const report=read(item.review.path);validateRejectedReview(ROOT,report,item.sourceSha256);
 assert.throws(()=>validateRejectedReview(ROOT,{...report,decision:'admit'},item.sourceSha256));
 assert.throws(()=>validateRejectedReview(ROOT,{...report,responsiveChecks:report.responsiveChecks.slice(1)},item.sourceSha256),/every measured/);
 const other=structuredClone(report);other.responsiveChecks.at(-1).evidence=other.responsiveChecks[0].evidence;assert.throws(()=>validateRejectedReview(ROOT,other,item.sourceSha256),/substituted/);
 assert.throws(()=>validateRejectedReview(ROOT,{...report,runtimeEvidence:{...report.runtimeEvidence,sha256:'0'.repeat(64)}},item.sourceSha256),/changed/);
});

test('actual rejected material modules cannot be renamed or given a new admit certificate',()=>{
 const rejected=loadRejectedCoreModules(ROOT);assert.ok(rejected.length>=3);
 for(const item of rejected){
  assert.throws(()=>resolveLockedModules(ROOT,[{sha256:item.sourceSha256,target:'src/locked/renamed.js',approval:{path:'new-invented-admit.json'}}],{mode:'local-3d'},[{name:'renamed'}]),/已被实际拒绝/);
 }
 assert.equal(loadPlan(ROOT,'010').status,'locked');
});

test('core rejection registration checks real source and frame bytes, preserves duplicate records and detects edited decisions',t=>{
 const f=fixture(t),cohort=loadCohort(ROOT)[0],source='export const rejectedFixture = true;';f.write('module.js',source);f.write('webart.quality.json',{rejectedCoreModules:'rejected.json'});f.write('rejected.json',{schemaVersion:1,modules:[]});
 const states=['desktop','mobile'].map(viewport=>{const sample=cohort.states.find(s=>s.viewport===viewport&&s.state==='opening'),file=viewport+'.jpg';f.write(file,fs.readFileSync(path.join(ROOT,sample.path)));return {viewport,state:'opening',evidence:[{path:file,sha256:hash(fs.readFileSync(path.join(f.root,file)))}]}});
 const report={phase:'asset-module',id:'007',decision:'reject',vetoes:['Controlled engineering rejection fixture, not an art judgment.'],finding:'This controlled engineering fixture verifies immutable rejection persistence without granting any visual admission.',files:[{path:'module.js',sha256:hash(Buffer.from(source))}],states};f.write('review.json',report);
 assert.throws(()=>recordRejectedCoreModules(f.root,'001','review.json'),/冻结第一稿/);
 assert.equal(recordRejectedCoreModules(f.root,'007','review.json').total,1);const before=fs.readFileSync(path.join(f.root,'rejected.json'),'utf8');
 assert.equal(recordRejectedCoreModules(f.root,'007','review.json').total,1);assert.equal(fs.readFileSync(path.join(f.root,'rejected.json'),'utf8'),before);
 f.write('module.js','changed');assert.throws(()=>recordRejectedCoreModules(f.root,'007','review.json'),/changed/);f.write('module.js',source);
 report.decision='admit';f.write('review.json',report);assert.throws(()=>loadRejectedCoreModules(f.root),/changed/);
});
test('new rejection is persisted with its exact review; rewriting that review invalidates the ledger',t=>{
 const f=fixture(t),policy=read('webart.quality.json');f.write('webart.quality.json',policy);f.write(policy.calibration,read(policy.calibration));const ledger=read(policy.rejectedSources);f.write(policy.rejectedSources,ledger);
 const observed=new Set(),original=fs.readFileSync;try{fs.readFileSync=function(file,...args){if(typeof file==='string'&&file.startsWith(ROOT+path.sep))observed.add(file);return original.call(this,file,...args)};loadRejectedSources(ROOT)}finally{fs.readFileSync=original}
 for(const file of observed)f.write(path.relative(ROOT,file).replaceAll('\\','/'),fs.readFileSync(file));
 const reject=read(ledger.sources[0].review.path);reject.sourceSha256='a'.repeat(64);for(const s of reject.states)for(const e of s.evidence)f.write(e.path,fs.readFileSync(path.join(ROOT,e.path)));f.write('new-rejection.json',reject);recordRejectedSource(f.root,'010','new-rejection.json');assert.equal(loadRejectedSources(f.root).length,ledger.sources.length+1);assert.equal(evaluateQuality(f.root,{id:'011'},reject.sourceSha256).decision,'blocked-previously-rejected-source');
 reject.decision='admit';f.write('new-rejection.json',reject);assert.equal(evaluateQuality(f.root,{id:'011'},reject.sourceSha256).decision,'blocked-invalid-rejection-ledger');
});
test('visual contract requires specific four-state roles, short viewport budgets and named identity relationships',()=>{
 const c=contractFixture(),signatures=[{name:'instrument'}];assert.equal(validateVisualContract(c,signatures),c);
 for(const change of [c=>delete c.states.ending,c=>c.states.ending.role='CTA',c=>c.states.middle.material='generic shape',c=>c.states.opening.visibleCharacters.mobile=900,c=>c.continuity[0].signature='unknown',c=>c.states.ending.subjectSelectors=[]]){const bad=structuredClone(c);change(bad);assert.throws(()=>validateVisualContract(bad,signatures))}
 const noContinuity=structuredClone(c);noContinuity.continuity=[];assert.equal(validateVisualContract(noContinuity,signatures),noContinuity);
});
test('actual state measurements reject walls of copy, missing/tiny/repeated subjects and absent metrics',()=>{
 const c=contractFixture(),s=c.states.middle,m={characters:80,subjects:[{selector:'[data-subject]',visibleInstances:1,largestViewportArea:.4}]};assert.deepEqual(visualMeasurementFailures(m,s,'mobile'),[]);
 for(const bad of [undefined,{...m,characters:141},{...m,characters:null},{...m,subjects:[]},{...m,subjects:[{...m.subjects[0],largestViewportArea:.001}]},{...m,subjects:[{...m.subjects[0],visibleInstances:2}]}])assert.ok(visualMeasurementFailures(bad,s,'mobile').length);
 const capture={visualContractSha256:visualContractHash(c),states:['desktop','mobile'].flatMap(viewport=>Object.keys(c.states).map(state=>({viewport,state,visualMeasurement:m})))};assert.equal(assertVisualCapture(capture,c),true);delete capture.states[7].visualMeasurement;assert.throws(()=>assertVisualCapture(capture,c));
});
test('state-specific visual loss overrides an otherwise all-peer model answer and cannot trigger a finish',async()=>{
 const cohort=loadCohort(ROOT),reference=read('docs/evidence/redo-v2/2026-10-15/010-reference/capture.json'),candidate=read('docs/evidence/redo-v2/010-prototype-3d-pinned/capture.json'),contract=contractFixture();let calls=0;
 const client={json:async({text,instructions})=>{calls++;assert.ok(instructions.includes('continuityChecks'));const p=JSON.parse(text),frames=p.frameRoles.candidate;assert.deepEqual(p.visualContract,contract);return {decision:'admit',nextAction:'admit',fixTasks:[],dimensions:p.requiredDimensions.map(key=>({key,againstBenchmark:'peer',finding:'Controlled contradictory model output: all global dimensions claim peer, while a specific ending is lost.',benchmarkFrames:[p.frameRoles.benchmark[0]],candidateFrames:[frames[0]]})),signatureFeatures:[{name:'instrument',core:true,retained:true,sceneLevel:true,visualPurpose:'Controlled fixture for preserving the full instrument identity across the complete visual sequence.',referenceFrames:[p.frameRoles.reference[0]],candidateFrames:[frames[0]]}],stateChecks:candidate.states.map((s,i)=>({viewport:s.viewport,state:s.state,subject:'preserved',material:s.state==='middle'?'lost':'preserved',composition:'preserved',role:s.state==='ending'?'lost':'preserved',finding:'The ending is an ordinary replacement and the original instrument/material role was lost in this state.',frames:[frames[i]]})),continuityChecks:['desktop','mobile'].map(viewport=>({id:'same-instrument',viewport,status:'lost',finding:'The sequence changes to an unrelated shape instead of keeping the same recognizable instrument identity.',frames:candidate.states.flatMap((s,i)=>s.viewport===viewport&&contract.continuity[0].states.includes(s.state)?[frames[i]]:[])})),motion:['pointer','scroll'].map(input=>({input,normal:true,forward:true,reverse:true,leaveOrStop:true,reduced:true,primaryVisual:true,frames:frames.slice(-5)}))}}};
 const report=await review({root:ROOT,client,cohort:[cohort[0],cohort.at(-1)],evaluator:{reviewer:{id:'fixture'},runId:'fixture'},phase:'prototype',reference,candidate,expectedSignatures:[{name:'instrument',visualPurpose:'Controlled visual purpose for the instrument identity and material preservation.'}],visualContract:contract,save:()=>{},filename:'not-written'});
 assert.equal(calls,1);assert.equal(report.decision,'reject');assert.equal(nextStep(report),'stop-for-plan-revision');assert.throws(()=>validateVisualReview(ROOT,report,contract));
 // Even changing the verdicts cannot replace ending evidence with the opening frame.
 report.stateChecks.forEach(c=>{c.material='preserved';c.role='preserved'});report.continuityChecks.forEach(c=>c.status='preserved');assert.equal(validateVisualReview(ROOT,report,contract),true);
 report.stateChecks.find(c=>c.state==='ending').evidence=report.states[0].evidence;assert.throws(()=>validateVisualReview(ROOT,report,contract),/不能用开场/);
});
test('locked geometry/material is injected unchanged, cannot be rewritten or merely archived unused',t=>{
 const f=fixture(t),source='export const instrument = { material: "approved fixture", geometry: "approved fixture" };';f.write('assets/model.js',source);const samples=loadCohort(ROOT)[0].states;for(const viewport of ['desktop','mobile'])f.write('evidence/'+viewport+'.jpg',fs.readFileSync(path.join(ROOT,samples.find(s=>s.viewport===viewport&&s.state==='opening').path)));const evidence=['desktop','mobile'].map(viewport=>({viewport,path:'evidence/'+viewport+'.jpg',sha256:hash(fs.readFileSync(path.join(f.root,'evidence/'+viewport+'.jpg')))}));const approval={schemaVersion:1,decision:'admit',finding:'Engineering fixture approval record only; this does not grant an actual art asset visual admission.',files:[{path:'assets/model.js',sha256:hash(Buffer.from(source))}],evidence};f.write('approval.json',approval);
 const modules=[{source:'assets/model.js',sha256:hash(Buffer.from(source)),target:'src/locked/instrument.js',creator:'WebArt engineering fixture',sourceDescription:'Original test fixture, no third-party model',license:'Private test fixture',distributionBasis:'Original fixture solely for local automated testing; no public or commercial artwork is supplied.',verified:'2026-10-16',interface:'Import instrument as the approved geometry and material object for the controlled integration fixture.',signatures:['instrument'],approval:{path:'approval.json',sha256:hash(fs.readFileSync(path.join(f.root,'approval.json')))}}];
 const locked=resolveLockedModules(f.root,modules,{mode:'local-3d'},[{name:'instrument'}]);const files=[{path:'src/main.js',content:"import {instrument} from './locked/instrument.js'; console.log(instrument);"}];assert.equal(mergeLockedModules(files,locked)[1].content,source);
 assert.throws(()=>mergeLockedModules([...files,{path:modules[0].target,content:'changed'}],locked),/不能创建或改写/);assert.throws(()=>mergeLockedModules([{path:'src/main.js',content:'No import'}],locked),/省略/);assert.throws(()=>resolveLockedModules(f.root,[],{mode:'local-3d'},[{name:'instrument'}]),/先批准/);
 assert.throws(()=>mergeLockedModules([{path:'src/main.js',content:files[0].content+"import * as THREE from 'three'; new THREE.TorusGeometry();"}],locked),/不能另建3D代理/);
 f.write('candidate/src/locked/instrument.js',source);f.write('manifest.json',{files:[{archive:'src',source:'candidate/src'}]});assert.doesNotThrow(()=>assertPackagedModules(f.root,{manifest:'manifest.json'},modules));f.write('candidate/src/locked/instrument.js','cheap replacement');assert.throws(()=>assertPackagedModules(f.root,{manifest:'manifest.json'},modules),/已改变/);
 const noRights=structuredClone(modules);delete noRights[0].distributionBasis;assert.throws(()=>resolveLockedModules(f.root,noRights,{mode:'local-3d'},[{name:'instrument'}]),/分发依据/);
 f.write('assets/model.js','changed material');assert.throws(()=>resolveLockedModules(f.root,modules,{mode:'local-3d'},[{name:'instrument'}]),/changed/);
});

