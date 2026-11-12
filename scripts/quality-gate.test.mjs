import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
import {validateCalibration,validateReview,evaluateQuality,assertProductionQuality,assertRetainedPreview,loadQualityPolicy} from './quality-gate.mjs';
import {ROOT,loadCollection,fingerprint,main as collectionMain} from './collection.mjs';
import {qualityStatus} from './production-flow.mjs';
import {buildQualityPacket} from './quality-packet.mjs';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-quality-gate-'));t.after(()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true})});
 const write=(file,data)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),data)};
 const frame=(name,width,height)=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(width,16);b.writeUInt32BE(height,20);write(name,b);return{path:name,sha256:digest(b)}};
 // These headers are structural fixtures only; the tests do not grade images.
 const desktop=frame('evidence/desktop.png',1440,900),mobile=frame('evidence/mobile.png',390,844);
 const calibration=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/production/quality-calibration.json'),'utf8'));
 write('calibration.json',JSON.stringify(calibration));write('webart.quality.json',JSON.stringify({schemaVersion:2,enabled:true,revision:calibration.revision,calibration:'calibration.json',retainedForComparison:[]}));
 const cohort={schemaVersion:2,purpose:'reviewer-calibration',runId:'fixture-run',reviewer:{id:'fixture-judge',mode:'blind-evidence-only',implementationContextIncluded:false},calibrationRevision:calibration.revision,samples:[calibration.baseline,...calibration.negatives].map(s=>({...s,verdict:s.class,finding:'Structural comparison fixture with a concrete finding, not an aesthetic measurement.',evidence:[{...desktop,viewport:'desktop'},{...mobile,viewport:'mobile'}]}))};write('cohort.json',JSON.stringify(cohort));
 const states=['desktop','mobile'].flatMap(viewport=>['opening','middle','transition','ending'].map((state,i)=>{const b=Buffer.from(fs.readFileSync(path.join(root,viewport==='desktop'?desktop.path:mobile.path)));b[32]=i+1;const filename=`evidence/${viewport}-${state}.png`;write(filename,b);return{viewport,state,finalAssets:true,loaded:true,evidence:[{path:filename,sha256:digest(b)}]}}));
 const makeReview=phase=>({schemaVersion:2,phase,calibrationRevision:calibration.revision,benchmarkSha256:calibration.baseline.sourceSha256,sourceSha256:'a'.repeat(64),reviewer:{id:'fixture-judge',calibrationRunId:'fixture-run',mode:'blind-evidence-only',inputScope:'benchmark+negative+reference+candidate',implementationContextIncluded:false},decision:'admit',vetoes:[],states:structuredClone(states),dimensions:calibration.dimensions.map(key=>({key,againstBenchmark:'peer',finding:'This is a structurally complete comparison fixture, not a claim that a real design is beautiful.',benchmarkEvidence:[desktop],candidateEvidence:[desktop]})),signatureFeatures:[{name:"fixture-signature",core:true,retained:true,role:'signature',sceneLevel:true,visualPurpose:'Structural fixture for a core scene-level visual behavior that must survive adaptation.',referenceEvidence:[desktop],candidateEvidence:[desktop]}],motion:['pointer','scroll'].map(input=>({input,normal:true,forward:true,reverse:true,leaveOrStop:true,reduced:true,primaryVisual:true,evidence:[desktop,mobile,desktop]}))});
 return{root,write,calibration,cohort,desktop,mobile,makeReview};
}
test('current user calibration retains001 and blocks all five falsely high-rated sources',()=>{
 const statuses=qualityStatus();assert.equal(statuses[0].decision,'approved-user-baseline');assert.equal(statuses.filter(s=>s.decision==='blocked-below-user-benchmark').length,5);
 for(const entry of loadCollection().templates.filter(e=>e.id!=='001')){assert.throws(()=>assertProductionQuality(ROOT,{...entry,qualityReview:'invented-95.json'},fingerprint(entry)),/below-user-benchmark/);assert.throws(()=>collectionMain(['trial-files-manifest',entry.manifest]),/below-user-benchmark/)}
});
test('actual calibrated cohort evidence matches user labels; changed labels cannot validate',t=>{
 const f=fixture(t);assert.equal(validateCalibration(f.root,f.cohort,f.calibration),true);const wrong=structuredClone(f.cohort);wrong.samples[5].verdict='benchmark';assert.throws(()=>validateCalibration(f.root,wrong,f.calibration),/cannot distinguish/);
 const evidence=structuredClone(f.cohort);evidence.samples[1].evidence=[f.desktop];assert.throws(()=>validateCalibration(f.root,evidence,f.calibration),/both viewports/);
});
test('one below-benchmark dimension cannot be compensated by six above-benchmark dimensions',t=>{
 const f=fixture(t),r=f.makeReview('prototype');r.dimensions.forEach(d=>d.againstBenchmark='above');r.dimensions.find(d=>d.key==='scroll-choreography').againstBenchmark='below';assert.throws(()=>validateReview(f.root,r,f.calibration,'prototype','a'.repeat(64)),/scroll-choreography/);
});
test('reference admission can precede any prototype while the prototype review still needs its actual candidate',t=>{
 const f=fixture(t),reference=f.makeReview('reference');reference.reviewer.inputScope='benchmark+negative+reference';assert.equal(validateReview(f.root,reference,f.calibration,'reference'),true);
 const prototype=f.makeReview('prototype');prototype.reviewer.inputScope='benchmark+negative+reference';assert.throws(()=>validateReview(f.root,prototype,f.calibration,'prototype','a'.repeat(64)),/art review/);
});
test('self-awarded totals, implementation-context reviews and loss of core source qualities block admission',t=>{
 const f=fixture(t);for(const change of [r=>r.score=95,r=>r.reviewer.implementationContextIncluded=true,r=>delete r.signatureFeatures[0].name,r=>r.signatureFeatures.push({...r.signatureFeatures[0]}),r=>r.signatureFeatures[0].retained=false,r=>r.signatureFeatures[0].role='utility',r=>r.signatureFeatures[0].sceneLevel=false,r=>r.vetoes.push('ordinary opening')]){const r=f.makeReview('prototype');change(r);assert.throws(()=>validateReview(f.root,r,f.calibration,'prototype','a'.repeat(64)),/Quality gate/)}
});
test('wrong phase, stale source, unpainted state, wrong viewport and single-anchor motion are rejected',t=>{
 const f=fixture(t);for(const change of [r=>r.phase='reference',r=>r.sourceSha256='b'.repeat(64),r=>r.states[0].loaded=false,r=>r.states[0].evidence=[f.mobile],r=>r.motion[0].evidence=[f.desktop],r=>r.states.pop(),r=>r.states[1].evidence=r.states[0].evidence,r=>r.motion[0].evidence=[f.desktop,f.desktop,f.desktop]]){const r=f.makeReview('prototype');change(r);assert.throws(()=>validateReview(f.root,r,f.calibration,'prototype','a'.repeat(64)),/Quality gate/)}
});
test('evidence fingerprints detect substitutions; missing evidence and disabled policy fail closed',t=>{
 const f=fixture(t),r=f.makeReview('prototype');f.write(f.desktop.path,'substituted evidence');assert.throws(()=>validateReview(f.root,r,f.calibration,'prototype','a'.repeat(64)),/changed/);f.write('webart.quality.json',JSON.stringify({schemaVersion:2,enabled:false}));assert.throws(()=>loadQualityPolicy(f.root),/must be enabled/);
});
test('reference-only approval cannot authorize full implementation or packaging',t=>{
 const f=fixture(t);f.write('reference.json',JSON.stringify(f.makeReview('reference')));f.write('contract.json',JSON.stringify({schemaVersion:2,id:'011',sourceSha256:'a'.repeat(64),calibrationRevision:f.calibration.revision,calibrationReview:'cohort.json',referenceReview:'reference.json',prototypeReview:'missing.json',assetPlan:{heroRoleLocked:true,replacementCompared:true,rightsVerified:true,lowCostIsNotMerit:true,evidence:[f.desktop]}}));
 const entry={id:'011',qualityReview:'contract.json'};assert.equal(evaluateQuality(f.root,entry,'a'.repeat(64),'reference').decision,'admitted-for-review');assert.throws(()=>assertProductionQuality(f.root,entry,'a'.repeat(64),'package'),/incomplete-comparison/);
 f.write('prototype.json',JSON.stringify(f.makeReview('prototype')));const c=JSON.parse(fs.readFileSync(path.join(f.root,'contract.json')));c.prototypeReview='prototype.json';f.write('contract.json',JSON.stringify(c));assert.equal(assertProductionQuality(f.root,entry,'a'.repeat(64),'package').decision,'admitted-for-review');
 f.cohort.purpose='ground-truth-audit';f.write('cohort.json',JSON.stringify(f.cohort));assert.throws(()=>assertProductionQuality(f.root,entry,'a'.repeat(64),'package'),/fresh reviewer/);f.cohort.purpose='reviewer-calibration';f.write('cohort.json',JSON.stringify(f.cohort));const swapped=f.makeReview('prototype');swapped.reviewer.id='un-calibrated-judge';f.write('prototype.json',JSON.stringify(swapped));assert.throws(()=>assertProductionQuality(f.root,entry,'a'.repeat(64),'package'),/calibrated evaluator/);
});
test('retention permits only existing source and exact bytes, not quality admission or a repackaged archive',()=>{
 const policy=JSON.parse(fs.readFileSync(path.join(ROOT,'webart.quality.json'),'utf8'));const entry=loadCollection().templates.find(e=>e.id==='010'),retained=policy.retainedForComparison.find(e=>e.id==='010');assert.equal(assertRetainedPreview(ROOT,entry,retained.sourceSha256,retained).decision,'existing-user-authorized-comparison-only');assert.throws(()=>assertRetainedPreview(ROOT,entry,retained.sourceSha256,{...retained,bytes:retained.bytes+1}),/source\/archive changed/);assert.throws(()=>assertProductionQuality(ROOT,entry,retained.sourceSha256),/below-user-benchmark/);
});
test('review input strips old scores, costs and implementation context; mappings stay separate',t=>{
 const f=fixture(t);const capture={result:'captured-not-scored',pages:[{id:'001',title:'secret grade95',score:95,cost:100,implementationReason:'already complete',sourceSha256:'1'.repeat(64),evidence:[{...f.desktop,name:'1440-opening'}]},{id:'010',title:'secret grade80',score:80,cost:0,sourceSha256:'2'.repeat(64),evidence:[{...f.mobile,name:'390-opening'}]}]};f.write('capture.json',JSON.stringify(capture));const output=buildQualityPacket(f.root,'capture.json'),input=fs.readFileSync(path.join(f.root,output.input),'utf8'),html=fs.readFileSync(path.join(f.root,output.comparison),'utf8');for(const secret of ['secret grade','implementationReason','already complete','"score":','"cost":'])assert.ok(!input.includes(secret)&&!html.includes(secret));assert.equal(JSON.parse(input).implementationContextIncluded,false);assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,output.key))).length,2);assert.notEqual(output.key,output.input);
});
