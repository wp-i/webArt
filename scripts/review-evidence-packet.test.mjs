import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {ROOT} from './collection.mjs';
import {hash} from './production/api.mjs';
import {dimensions} from './production/schemas.mjs';
import {buildReviewPacket,calibrate,loadCohort,review} from './production/evidence.mjs';
import {CodexCliReviewClient,disabledCliFeatures} from './production/cli-review.mjs';

// These are controlled image/transport fixtures, never new design approvals.
const desktopNames=['1440-opening','1440-scroll-0.16-1','1440-scroll-0.33-2','1440-scroll-0.5-3','1440-scroll-0.67-4','1440-scroll-0.84-5','1440-scroll-1-6','1440-scroll-0.5-7','1440-scroll-0-8','1440-pointer-0.2','1440-pointer-0.8','1440-pointer-leave','1440-held','1440-released','1440-reduced'];
const mobileNames=['390-opening','390-scroll-0.33-12','390-scroll-0.67-13','390-scroll-1-14','390-scroll-0-15','390-reduced'];
const originalNames=[...desktopNames,...mobileNames];
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0}
function png(width,height,color){
 const chunk=(name,data)=>{const type=Buffer.from(name),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([size,type,data,crc])};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;
 const pixels=Buffer.alloc((width+1)*height,color);for(let y=0;y<height;y++)pixels[y*(width+1)]=0;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-review-packet-'));
 t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.match(path.basename(root),/^webart-review-packet-/);fs.rmSync(root,{recursive:true,force:true})});
 const write=(file,value)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),Buffer.isBuffer(value)||typeof value==='string'?value:JSON.stringify(value))};
 const evidence=originalNames.map((name,index)=>{
  const width=name.startsWith('1440')?1440:390,color=name==='1440-scroll-0.5-7'?4:index+1,bytes=png(width,width===1440?900:844,color),file='fixture/'+name+'.png';
  write(file,bytes);return {name,path:file,sha256:hash(bytes)};
 });
 const byName=new Map(evidence.map(e=>[e.name,e]));
 const states=['desktop','mobile'].flatMap(viewport=>{
  const names=viewport==='desktop'?['1440-opening','1440-scroll-0.33-2','1440-scroll-0.67-4','1440-scroll-1-6']:['390-opening','390-scroll-0.33-12','390-scroll-0.67-13','390-scroll-1-14'];
  return ['opening','transition','middle','ending'].map((state,index)=>({...byName.get(names[index]),viewport,state}));
 });
 const motion=[...[.16,.33,.5,.67,.84,1,.5,0].map(requested=>({width:1440,input:'native-wheel',requested})),{width:1440,input:'pointer',fraction:.2},{width:1440,input:'pointer',fraction:.8},{width:1440,input:'leave-stop'},...[.33,.67,1,0].map(requested=>({width:390,input:'native-wheel',requested}))];
 const baseline={id:'001',sourceSha256:'a'.repeat(64),userScore:95,states,evidence,motion};
 const negatives=Array.from({length:5},(_,i)=>({...baseline,id:String(i+6).padStart(3,'0'),sourceSha256:String(i+1).repeat(64),userScore:80}));
 write('webart.quality.json',{schemaVersion:2,enabled:true,revision:'controlled-test-only',calibration:'calibration.json'});
 write('calibration.json',{revision:'controlled-test-only',baseline,negatives,dimensions});
 write('docs/production/prompts/REVIEW_PAIR.md','Controlled request fixture; do not grant artistic or publication approval.');
 write('docs/production/prompts/CALIBRATE_REVIEWER.md','Controlled calibration fixture; no artistic evaluation is performed.');
 const capture={result:'captured-not-scored',errors:[],sourceSha256:'b'.repeat(64),states:states.map(s=>({viewport:s.viewport,state:s.state,evidence:[{path:s.path,sha256:s.sha256}]})),motion:[{viewport:'desktop',input:'scroll',context:'actual-forward-reverse',evidence:['1440-opening','1440-scroll-1-6','1440-scroll-0.5-7','1440-scroll-0-8'].map(name=>byName.get(name))}]};
 return {root,write,baseline,cohort:[baseline,negatives[0]],allSamples:[baseline,...negatives],reference:capture,candidate:structuredClone(capture)};
}

test('review packet retains eight stable states and every original benchmark process frame in recorded order',t=>{
 const f=fixture(t),{packet,benchmarkProcess}=buildReviewPacket(f),again=buildReviewPacket(f);
 assert.deepEqual([...packet.frames],[...again.packet.frames]);assert.deepEqual(benchmarkProcess,again.benchmarkProcess);
 assert.deepEqual([...packet.frames].slice(0,8).map(([id,e])=>({id,label:e.label,path:e.path})),f.baseline.states.map((e,i)=>({id:'benchmark-'+i,label:`${e.viewport} ${e.state}`,path:e.path})));
 assert.equal(packet.ids('benchmark').length,29);
 assert.deepEqual(benchmarkProcess.flatMap(context=>context.originalCaptureNames),originalNames);
 for(const context of benchmarkProcess)for(const [index,id]of context.frames.entries()){
  const frame=packet.frames.get(id),name=context.originalCaptureNames[index];assert.equal(frame.role,'benchmark');assert.equal(frame.name,name);assert.match(frame.label,new RegExp(`^${context.viewport} ${context.context} process ${index} `));assert.ok(frame.label.endsWith('capture '+name));
  assert.deepEqual(packet.resolve([id],'benchmark'),[{path:frame.path,sha256:frame.sha256}]);assert.throws(()=>packet.resolve([id],'candidate'),/错误对象/);
 }
 const mobile=benchmarkProcess.find(c=>c.viewport==='mobile'&&c.context==='scroll');assert.equal(mobile.input,'native-wheel');assert.match(mobile.limitations,/do not establish a finger\/touch gesture/);
 assert.match(benchmarkProcess.find(c=>c.context==='pointer').limitations,/no additional reverse path/);
 assert.ok(benchmarkProcess.filter(c=>c.context==='reduced').every(c=>c.limitations.includes('not a recorded pointer, hold or touch sequence')));
});

test('identical verified pixels have one image payload per role while all ordered contextual IDs remain usable',t=>{
 const f=fixture(t),{packet}=buildReviewPacket(f),inputs=packet.inputs({deduplicate:true}),images=inputs.filter(p=>p.type==='input_image');
 const groups=new Set([...packet.frames.values()].map(e=>e.role+':'+e.sha256));assert.equal(images.length,groups.size);assert.ok(images.length<packet.frames.size);
 const duplicate=f.baseline.evidence.find(e=>e.name==='1440-scroll-0.5-3').sha256;
 const relevant=images.filter(image=>image.evidence.sha256===duplicate);assert.equal(relevant.length,3,'separate benchmark, reference and candidate roles retain their own image input');
 const labels=inputs.filter(p=>p.type==='input_text').map(p=>p.text),benchmark=labels.find(label=>label.includes('capture 1440-scroll-0.5-3'));
 assert.ok(benchmark.includes('capture 1440-scroll-0.5-7'));assert.ok(benchmark.endsWith('Each retains its own capture context.'));
 for(const [id,e]of packet.frames)assert.equal(labels.filter(label=>label.split('\n').includes(id+' '+e.label)).length,1);
});

test('missing benchmark pointer, hold, reduced or complete scroll proof stops before any reviewer call',async t=>{
 const f=fixture(t);let calls=0,saves=0;
 const options={...f,evaluator:{reviewer:{id:'controlled'},runId:'controlled'},phase:'prototype',client:{json:async()=>{calls++;throw Error('unexpected client call')}},save:()=>{saves++},filename:'not-written.json'};
 for(const name of ['1440-pointer-0.2','1440-pointer-0.8','1440-pointer-leave','1440-held','1440-released','1440-reduced','390-reduced','1440-scroll-0.16-1','1440-scroll-0.5-7','390-scroll-0-15']){
  const cohort=structuredClone(f.cohort);cohort[0].evidence=cohort[0].evidence.filter(e=>e.name!==name);
  await assert.rejects(review({...options,cohort}),/基准缺少/);
 }
 const noRecords=structuredClone(f.cohort);delete noRecords[0].motion;await assert.rejects(review({...options,cohort:noRecords}),/实际输入记录/);
 const noLeave=structuredClone(f.cohort);noLeave[0].motion=noLeave[0].motion.filter(m=>m.input!=='leave-stop');await assert.rejects(review({...options,cohort:noLeave}),/实际指针/);
 assert.equal(calls,0);assert.equal(saves,0);
});

test('changed bytes, wrong viewport dimensions, reordered and unmapped original captures cannot be used as benchmark process proof',t=>{
 const f=fixture(t),held=f.baseline.evidence.find(e=>e.name==='1440-held'),file=path.join(f.root,held.path),original=fs.readFileSync(file);
 fs.appendFileSync(file,'changed');assert.throws(()=>buildReviewPacket(f),/changed/);fs.writeFileSync(file,original);
 const wrong=structuredClone(f.cohort),bytes=png(390,844,19);f.write(held.path,bytes);wrong[0].evidence.find(e=>e.name==='1440-held').sha256=hash(bytes);assert.throws(()=>buildReviewPacket({...f,cohort:wrong}),/wrong viewport/);fs.writeFileSync(file,original);
 const reordered=structuredClone(f.cohort);[reordered[0].evidence[2],reordered[0].evidence[3]]=[reordered[0].evidence[3],reordered[0].evidence[2]];assert.throws(()=>buildReviewPacket({...f,cohort:reordered}),/正反滚动过程/);
 const unknown=structuredClone(f.cohort);unknown[0].evidence.push({...held,name:'1440-unmapped'});assert.throws(()=>buildReviewPacket({...f,cohort:unknown}),/未映射/);
});

test('the real frozen cohort maps all 21 original benchmark captures without changing calibration selection',()=>{
 const cohort=loadCohort(ROOT),reference=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/evidence/redo-v2/2026-10-15/010-reference/capture.json'),'utf8'));
 const before=JSON.stringify(cohort),{packet,benchmarkProcess}=buildReviewPacket({root:ROOT,cohort:[cohort[0],cohort.at(-1)],reference});
 assert.equal(JSON.stringify(cohort),before);assert.deepEqual(benchmarkProcess.flatMap(c=>c.originalCaptureNames),originalNames);assert.equal(packet.ids('benchmark').length,29);
 const benchmarkImages=packet.inputs({deduplicate:true}).filter(p=>p.type==='input_image'&&cohort[0].evidence.some(e=>e.sha256===p.evidence.sha256));assert.equal(benchmarkImages.length,20);
});

test('request text exposes the actual benchmark process and calibration still attaches exactly 48 images',async t=>{
 const f=fixture(t);let reviews=0,calibrations=0;
 await assert.rejects(review({...f,evaluator:{reviewer:{id:'controlled'},runId:'controlled'},phase:'prototype',save:()=>assert.fail('no result should be saved'),filename:'not-written.json',client:{json:async input=>{
  reviews++;const text=JSON.parse(input.text);assert.deepEqual(text.benchmarkProcess.flatMap(c=>c.originalCaptureNames),originalNames);assert.equal(text.frameRoles.benchmark.length,29);assert.equal(text.compareRole,'candidate');assert.match(text.motionOrder,/do not infer unrecorded gestures/);throw Error('controlled stop before any model execution');
 }}}),/controlled stop/);
 await assert.rejects(calibrate({...f,cohort:f.allSamples,runId:'controlled',save:()=>assert.fail('no calibration result should be saved'),client:{json:async input=>{calibrations++;assert.equal(input.images.filter(p=>p.type==='input_image').length,48);throw Error('controlled calibration stop')}}}),/controlled calibration stop/);
 assert.equal(reviews,1);assert.equal(calibrations,1);
});

test('CLI calibration requires its persisted private order before any request',async t=>{
 const f=fixture(t);let calls=0;
 await assert.rejects(calibrate({...f,cohort:f.allSamples,runId:'controlled',client:{reviewerMetadata:{mode:'evidence-only-fresh-codex-cli'},json:async()=>{calls++}},save:()=>assert.fail('missing run directory cannot save an order')}),/私有顺序/);
 assert.equal(calls,0);
});

const cliFixtureSource=`import fs from 'node:fs';
const [answerFile,model,...args]=process.argv.slice(2);
if(args.includes('--version')){console.log('codex-cli controlled-packet-fixture');process.exit(0)}
if(args.includes('features')){for(const feature of ${JSON.stringify(disabledCliFeatures)})console.log(feature+' stable false');console.log('skip_host_skill_discovery experimental true');console.log('unified_exec stable true');process.exit(0)}
for await(const bytes of process.stdin){}
if(model==='technical-failure')process.exit(9);
const answer=fs.readFileSync(answerFile,'utf8');fs.writeFileSync(args[args.indexOf('--output-last-message')+1],answer);
for(const event of [{type:'thread.started',thread_id:'controlled-no-model-thread'},{type:'turn.started'},{type:'item.completed',item:{id:'answer',type:'agent_message',text:answer}},{type:'turn.completed',model,usage:{input_tokens:1,output_tokens:1}}])console.log(JSON.stringify(event));`;
function cliFixture(t,{technicalFailure=false}={}){
 const base=fs.mkdtempSync(path.join(ROOT,'.webart','review-packet-cli-')),directory=path.relative(ROOT,base).replaceAll('\\','/'),packets=new Set(),finding='Controlled subprocess validates evidence receipt binding only; it does not evaluate art or grant visual admission.';
 const write=(file,value)=>{fs.mkdirSync(path.dirname(path.join(base,file)),{recursive:true});fs.writeFileSync(path.join(base,file),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n')};
 write('controlled-cli.mjs',cliFixtureSource);const calls=[];
 const client=new CodexCliReviewClient({root:ROOT,directory:directory+'/cli-review',executable:'controlled-no-model',maxRequests:2,deadlineMs:10000,spawnImpl:(executable,args,settings)=>{
  calls.push(args);let model='controlled-probe';const answerFile=path.join(base,'controlled-answer.json');
  if(args.includes('--cd')){
   packets.add(args[args.indexOf('--cd')+1]);const request=JSON.parse(fs.readFileSync(client.lastAttempt.requestFile,'utf8'));model=technicalFailure?'technical-failure':'controlled-'+request.role;
   if(request.role==='calibration'){
    const order=JSON.parse(fs.readFileSync(path.join(base,'calibration-order-private.json'),'utf8'));
    write('controlled-answer.json',{labels:order.samples.map(sample=>({label:sample.label,verdict:sample.id==='001'?'benchmark':'below-benchmark',finding}))});
   }else{
    const p=JSON.parse(request.text),target=p.frameRoles[p.compareRole];
    write('controlled-answer.json',{decision:'reject',nextAction:'replace-direction',fixTasks:['Controlled fixture remains rejected; no design is admitted.'],dimensions:p.requiredDimensions.map(key=>({key,againstBenchmark:'below',finding,benchmarkFrames:[p.frameRoles.benchmark[0]],candidateFrames:[target[0]]})),signatureFeatures:[{name:'controlled-core',core:true,retained:false,sceneLevel:false,visualPurpose:finding,referenceFrames:[p.frameRoles.reference[0]],candidateFrames:[target[0]]}],stateChecks:['desktop','mobile'].flatMap((viewport,v)=>['opening','transition','middle','ending'].map((state,i)=>({viewport,state,subject:'lost',material:'lost',composition:'lost',role:'lost',finding,frames:[target[v*4+i]]}))),continuityChecks:[],motion:['pointer','scroll'].map(input=>({input,normal:false,forward:false,reverse:false,leaveOrStop:false,reduced:false,primaryVisual:false,frames:target.slice(0,3)}))});
   }
  }
  return spawn(process.execPath,[path.join(base,'controlled-cli.mjs'),answerFile,model,...args],settings);
 }});
 t.after(()=>{
  for(const packet of packets){assert.equal(path.dirname(packet),os.tmpdir());assert.match(path.basename(packet),/^webart-cli-evidence-/);fs.rmSync(packet,{recursive:true,force:true})}
  assert.equal(path.dirname(base),path.join(ROOT,'.webart'));assert.match(path.basename(base),/^review-packet-cli-/);fs.rmSync(base,{recursive:true,force:true});
 });
 return {base,directory,client,calls,save:write};
}

test('CLI calibration and paired review save consumed canonical receipts with each invocation model identity',async t=>{
 const f=cliFixture(t),cohort=loadCohort(ROOT),runId='controlled-consumption-only';
 const evaluator=await calibrate({root:ROOT,client:f.client,cohort,runId,runDirectory:f.directory,save:f.save});
 assert.equal(evaluator.reviewer.actualModel,'controlled-calibration');assert.equal(evaluator.reviewer.independent,false);assert.equal(evaluator.reviewer.contextIsolated,true);
 const calibrationReceipt=JSON.parse(fs.readFileSync(path.join(ROOT,evaluator.reviewReceipt.path),'utf8'));
 assert.equal(calibrationReceipt.kind,'portable-cli-review-consumption');assert.equal(calibrationReceipt.visualAdmissionGranted,false);
 const calibrationRawPath=f.client.lastAttempt.receiptFile,calibrationRaw=fs.readFileSync(calibrationRawPath);
 assert.notEqual(evaluator.reviewReceipt.path,path.relative(ROOT,calibrationRawPath).replaceAll('\\','/'));
 const reference={result:'captured-not-scored',errors:[],states:cohort[0].states.map(({viewport,state,path,sha256})=>({viewport,state,loaded:true,finalAssets:true,evidence:[{path,sha256}]})),motion:[]},candidate={...structuredClone(reference),sourceSha256:'b'.repeat(64)};
 const report=await review({root:ROOT,client:f.client,cohort:[cohort[0],cohort.at(-1)],evaluator,phase:'prototype',reference,candidate,visualContract:{schemaVersion:1,states:{},continuity:[]},expectedSignatures:[{name:'controlled-core',visualPurpose:'Controlled fixture only, never a claim of retained artistic quality.'}],save:f.save,filename:'prototype-review.json'});
 assert.equal(report.decision,'reject');assert.equal(report.reviewer.actualModel,'controlled-prototype-review');assert.equal(report.reviewer.id,evaluator.reviewer.id);assert.equal(report.reviewer.calibrationRunId,runId);
 assert.deepEqual(f.client.lastReviewReceipt,report.reviewReceipt);assert.deepEqual(fs.readFileSync(calibrationRawPath),calibrationRaw,'later consumption does not overwrite earlier raw receipts');
 const receipt=JSON.parse(fs.readFileSync(path.join(ROOT,report.reviewReceipt.path),'utf8')),context=JSON.parse(fs.readFileSync(path.join(ROOT,receipt.context.path),'utf8'));
 assert.equal(receipt.kind,'portable-cli-review-consumption');assert.equal(receipt.visualAdmissionGranted,false);assert.equal(context.frames.filter(frame=>frame.role==='benchmark').length,29);assert.deepEqual(context.states,candidate.states);
 assert.equal(f.calls.filter(args=>args.includes('exec')).length,2,'one controlled execution per role, without adapter replay');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.base,'prototype-review.json'),'utf8')),report);
});

test('a technical CLI failure cannot save or consume a paired review',async t=>{
 const f=cliFixture(t,{technicalFailure:true}),cohort=loadCohort(ROOT),reference={result:'captured-not-scored',errors:[],states:cohort[0].states.map(({viewport,state,path,sha256})=>({viewport,state,evidence:[{path,sha256}]})),motion:[]};
 await assert.rejects(review({root:ROOT,client:f.client,cohort:[cohort[0],cohort.at(-1)],evaluator:{reviewer:{id:'controlled'},runId:'controlled'},phase:'reference',reference,visualContract:{schemaVersion:1,states:{},continuity:[]},save:f.save,filename:'must-not-exist.json'}),{code:'cli-review-exit'});
 assert.equal(f.client.lastReviewReceipt,undefined);assert.equal(fs.existsSync(path.join(f.base,'must-not-exist.json')),false);assert.equal(fs.existsSync(path.join(f.client.lastAttempt.directory,'consumption-context.json')),false);assert.equal(fs.existsSync(path.join(f.client.lastAttempt.directory,'consumed')),false);
});
