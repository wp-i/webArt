import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {ROOT} from './collection.mjs';
import {loadPerformancePolicy,validatePerformancePlan,validatePerformanceReport,performanceFailures,assertPerformanceDelivery} from './production/performance.mjs';
import {loadRenderer,assertRendererPlan} from './production/renderers.mjs';
const loaded=loadPerformancePolicy(ROOT),plan={schemaVersion:1,mode:'local-3d',states:{opening:30,transition:0,middle:30,ending:0}},digest='a'.repeat(64);
function fixture(){const checks=[];for(const p of loaded.policy.profiles)for(const [mode,states] of [['normal',Object.keys(plan.states)],['reduced',Object.keys(plan.states)],['native',['roundtrip']],['hidden',['background']]])for(const state of states){const active=mode==='native'||mode==='normal'&&plan.states[state]>0;checks.push({profile:p.id,width:p.width,height:p.height,dpr:p.dpr,cpu:p.cpu,mode,state,durationMs:1200,rafSamples:72,rafP95Ms:16.7,rafP99Ms:25,longTaskMaxMs:0,drawCalls:active?900:0,renderFrames:active?36:0,peakDrawCalls:active?25:0,peakTriangles:active?44000:0,drawingBufferPixels:1300000,actualMode:'local-3d',visibility:mode==='hidden'?'hidden':'visible',...(mode==='native'?{cold:true,reachedEnd:true,returnedToOpening:true}:{})})}return{schemaVersion:1,measurement:'native-input-browser-gl-v1',policySha256:loaded.sha256,sourceSha256:digest,plan:structuredClone(plan),result:'passed-performance-budget',checks}}
const validates=report=>validatePerformanceReport(report,loaded,plan,digest);
test('performance contract accepts only complete source-bound native measurements, never a self-awarded score',()=>{
 assert.equal(validates(fixture()),true);
 for(const change of [r=>r.sourceSha256='b'.repeat(64),r=>r.policySha256='b'.repeat(64),r=>r.result='95',r=>r.checks.pop(),r=>r.checks.push(r.checks[0]),r=>r.measurement='self-score',r=>r.plan.states.opening=60]){const r=fixture();change(r);assert.throws(()=>validates(r))}
});
test('GPU budget blocks excessive geometry, draws, pixels and uncapped rendering even with a passing engineering label',()=>{
 for(const [key,value] of [['peakTriangles',360001],['peakDrawCalls',101],['drawingBufferPixels',4500001],['renderFrames',60],['renderFrames',0]]){const r=fixture();r.checks[0][key]=value;assert.throws(()=>validates(r))}
});
test('idle, reduced-motion and real background must stop GPU work; low idle compositor cadence is not page stutter',()=>{
 for(const mode of ['normal','reduced','hidden']){const r=fixture(),c=r.checks.find(c=>c.mode===mode&&(mode!=='normal'||c.state==='ending'));c.drawCalls=1;assert.throws(()=>validates(r));c.drawCalls=0;c.renderFrames=1;assert.throws(()=>validates(r))}
 const r=fixture();r.checks.filter(c=>c.mode==='reduced'||c.mode==='normal'&&plan.states[c.state]===0).forEach(c=>{c.rafP95Ms=210;c.rafP99Ms=220;c.rafSamples=5});assert.equal(validates(r),true);
 r.checks.find(c=>c.mode==='hidden').visibility='visible';assert.throws(()=>validates(r));
});
test('native motion and phone pressure cannot be replaced with static screenshots or desktop conditions',()=>{
 for(const change of [c=>c.reachedEnd=false,c=>c.returnedToOpening=false,c=>c.rafP95Ms=51,c=>c.longTaskMaxMs=161,c=>c.dpr=1,c=>c.cpu=1,c=>c.durationMs=200,c=>c.actualMode='dom',c=>c.visibility='hidden']){const r=fixture();change(r.checks.find(c=>c.profile==='mobile-stress'&&c.mode==='native'));assert.throws(()=>validates(r))}
});
test('static budget cannot be widened or a second historical exemption added',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-perf-test-'));t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true})});
 const write=p=>fs.writeFileSync(path.join(root,'webart.performance.json'),JSON.stringify(p));
 for(const edit of [p=>p.limits.renderFps=60,p=>p.limits.idleDrawCalls=1,p=>p.limits.trianglesPerFrame=900000,p=>p.profiles[1].cpu=1,p=>p.profiles[1].dpr=1,p=>p.sampleMs=100,p=>p.historicalReadOnly.push(digest)]){const p=structuredClone(loaded.policy);edit(p);write(p);assert.throws(()=>loadPerformancePolicy(root))}
 for(const p of [{}, {...plan,states:{...plan.states,opening:60}}, {...plan,states:{opening:30,middle:30,ending:30}}, {...plan,states:{opening:30,transition:30,middle:30,ending:30}}])assert.throws(()=>validatePerformancePlan(p));
});
test('final delivery cannot omit performance; old Pace may only be read as history, never newly registered',()=>{
 assert.throws(()=>assertPerformanceDelivery(ROOT,{},digest),/缺少实际性能报告/);
 const old=loaded.policy.historicalReadOnly[0],historical={qualityReview:'renderers/pace-precision-v1/contract.json'};assert.deepEqual(assertPerformanceDelivery(ROOT,historical,old,{allowHistorical:true}),{historicalReadOnly:true});assert.throws(()=>assertPerformanceDelivery(ROOT,historical,old),/缺少实际性能报告/);
 assert.throws(()=>assertPerformanceDelivery(ROOT,{qualityReview:'.webart/prototypes/renamed/contract.json'},old,{allowHistorical:true}),/缺少实际性能报告/);
 assert.ok(performanceFailures(fixture(),loaded.policy,plan).length===0);
 const historicalRenderer=loadRenderer(ROOT,'pace-precision-v1');
 assert.throws(()=>assertRendererPlan(ROOT,{renderer:{id:historicalRenderer.definition.id,sourceSha256:historicalRenderer.definition.sourceSha256}}),/缺少实际性能报告/);
});
