import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {ROOT,loadCollection,fingerprint,candidateFiles} from './collection.mjs';
import {ProductionRun,validateConfig,validateCapturePlan,planStatus,loadPlan,nextStep} from './production/runner.mjs';
import {ResponsesClient,responseText,hash} from './production/api.mjs';
import {FrameSet,loadCohort,calibrate} from './production/evidence.mjs';
import {validateFiles,serveDirectory,resolveFonts,assertFontSources,fonts,storeTrialArchive} from './production/project.mjs';
import {object,str} from './production/schemas.mjs';
import {checkContentBudget} from './production/browser.mjs';
import {fillContent,validateContent,contentViteConfig} from './production/content.mjs';
import {pathToFileURL} from 'node:url';
import {validateAsset} from './production/assets.mjs';
import {validateRenderingPlan,assertRenderingSource,validateFallbackCapture} from './production/rendering.mjs';
import {captureProcessBudget} from './production/process.mjs';
import {SessionReviewClient,submitSessionReview} from './production/session-review.mjs';

const config={ids:['010'],model:'test-vision-model'};
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-static-production-'));t.after(()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('webart-static-production-'));fs.rmSync(root,{recursive:true,force:true})});const write=(file,value)=>{const p=path.join(root,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value))};return {root,write}}
const output=value=>({status:'completed',id:'fixture-response',model:'fixture-model',usage:{input_tokens:12,output_tokens:4,total_tokens:16,input_tokens_details:{cached_tokens:5}},output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});

test('calibration uses settled benchmark chapters and the actual forward ending, never a reverse opening',()=>{
 const cohort=loadCohort(ROOT),baseline=cohort[0];
 assert.match(baseline.states.find(s=>s.viewport==='desktop'&&s.state==='transition').name,/scroll-0.33-/);
 assert.match(baseline.states.find(s=>s.viewport==='desktop'&&s.state==='middle').name,/scroll-0.67-/);
 for(const page of cohort)for(const view of ['desktop','mobile'])assert.match(page.states.find(s=>s.viewport===view&&s.state==='ending').name,/scroll-1-/);
});

test('fixed config refuses the benchmark, duplicate/unknown ids and autonomous reference selection',()=>{
 assert.throws(()=>validateConfig({...config,ids:['001']}),/验收基准/);assert.throws(()=>validateConfig({...config,ids:['010','010']}));assert.throws(()=>validateConfig({...config,ids:['999']}));assert.throws(()=>validateConfig({...config,references:['https://example.org']}),/静态计划/);assert.throws(()=>validateConfig({...config,maxRequests:0}));
});
test('unready plans stop before any model call or source change; ready plans must validate fully',()=>{
 const entries=loadCollection().templates,before=entries.map(e=>fingerprint(e));let calls=0;
 for(const p of planStatus()){
  if(p.ready)assert.equal(loadPlan(ROOT,p.id).status,'locked');
  else{assert.ok(p.reason);assert.throws(()=>new ProductionRun({config:{...config,ids:[p.id]},services:{client:{json:()=>{calls++;throw Error('unexpected')}}}}))}
  assert.throws(()=>new ProductionRun({config:{...config,ids:[p.id]},services:{loadPlan:()=>{throw Error('incomplete static plan fixture')},client:{json:()=>{calls++;throw Error('unexpected')}}}}),/incomplete static plan fixture/);
 }
 assert.equal(calls,0);assert.deepEqual(entries.map(e=>fingerprint(e)),before);
});
test('changing a status to locked does not turn an incomplete plan into readiness',t=>{
 const f=fixture(t),policy=JSON.parse(fs.readFileSync(path.join(ROOT,'webart.production.json')));policy.plans=[{id:'010',path:'docs/production/plans/010.json'}];f.write('webart.production.json',policy);f.write('docs/production/plans/010.json',{id:'010',status:'locked'});
 f.write('webart.quality.json',JSON.parse(fs.readFileSync(path.join(ROOT,'webart.quality.json'))));f.write('docs/production/quality-calibration.json',JSON.parse(fs.readFileSync(path.join(ROOT,'docs/production/quality-calibration.json'))));assert.equal(planStatus(f.root)[0].ready,false);assert.throws(()=>loadPlan(f.root,'010'));
 policy.autonomousDiscovery=true;f.write('webart.production.json',policy);assert.throws(()=>planStatus(f.root),/固定配置/);
});
test('capture positions, selectors and readiness come from a complete static plan',()=>{
 const base={url:'https://example.org/',ready:"document.fonts.status==='loaded'",pointer:{selector:'canvas'},states:{opening:0,transition:.25,middle:.6,ending:1}};
 assert.equal(validateCapturePlan(base),base);assert.throws(()=>validateCapturePlan({...base,states:{...base.states,opening:.1}}),/默认开场/);assert.throws(()=>validateCapturePlan({...base,url:'http://127.0.0.1:4280/'}));assert.throws(()=>validateCapturePlan({...base,states:{...base.states,middle:2}}));
});

test('retaining a native pointer position requires explicit scene identity and valid rest coordinates',()=>{
 const base={ready:'true',pointer:{selector:'.index',retainPosition:true,scene:'#materials'},states:{opening:0,transition:.3,middle:{selector:'#materials'},ending:1}};
 assert.equal(validateCapturePlan(base,{local:true}),base);
 assert.throws(()=>validateCapturePlan({...base,pointer:{selector:'.index',retainPosition:true}},{local:true}),/实际到达/);
 assert.throws(()=>validateCapturePlan({...base,pointer:{...base.pointer,retainPosition:'yes'}},{local:true}),/布尔值/);
 for(const initialPointer of [{x:1.1,y:0},{x:0},{x:0,y:0,scene:'#other'}])assert.throws(()=>validateCapturePlan({...base,initialPointer},{local:true}),/明确坐标/);
 assert.equal(validateCapturePlan({...base,initialPointer:{x:.98,y:.02}},{local:true}).initialPointer.x,.98);
 assert.equal(validateCapturePlan({...base,trustedTouch:true,processScenes:['#about','#ending'],pointer:{...base.pointer,inspect:'.photo'}},{local:true}).trustedTouch,true);
 for(const processScenes of [[],['#about'],['#about','#about'],['#about',42]])assert.throws(()=>validateCapturePlan({...base,processScenes},{local:true}),/固定选择器/);
 assert.throws(()=>validateCapturePlan({...base,trustedTouch:'true'},{local:true}),/布尔配置/);
});
test('the process budget permits the actual 219-second source capture without enlarging candidate limits',()=>{
 const historical=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/evidence/redo-v2/2026-10-17/007-oryzo-reference-02/capture.json'))),elapsed=Date.parse(historical.finished)-Date.parse(historical.started);
 assert.ok(elapsed>135000&&elapsed<240000);assert.ok(captureProcessBudget({url:historical.url,deadlineMs:240000})>elapsed);
 assert.equal(captureProcessBudget({url:'http://127.0.0.1:4323/'}),135000);assert.throws(()=>captureProcessBudget({url:'http://127.0.0.1:4323/',deadlineMs:240000}));assert.throws(()=>captureProcessBudget({url:historical.url,manifest:'candidate/manifest.json',deadlineMs:240000}));assert.throws(()=>captureProcessBudget({url:historical.url,deadlineMs:240001}));
});

test('scene selectors cannot smuggle source-only absolute positions or input actions into candidate captures',()=>{
 const base={ready:'true',pointer:{selector:'canvas'},states:{opening:0,transition:.25,middle:{selector:'#hand',offset:.5},ending:1}};
 assert.equal(validateCapturePlan(base,{local:true}),base);
 for(const middle of [{selector:'#hand',y:6000},{selector:'#hand',click:'#secret'},{selector:'#hand',wheels:30},{y:6000,offset:.5},{selector:''},{selector:'#hand',offset:'0.5'},{selector:'#hand',offset:NaN},[]]){
  assert.throws(()=>validateCapturePlan({...base,states:{...base.states,middle}},{local:true}),/只接受已配置/);
 }
 const reference={...base,url:'https://example.org/',states:{...base.states,middle:{y:6000}}};
 assert.equal(validateCapturePlan(reference),reference);
 assert.throws(()=>validateCapturePlan({...reference,states:{...reference.states,middle:{y:6000,selector:'#hand'}}}),/只接受已配置/);
 assert.throws(()=>validateCapturePlan({...base,states:{...base.states,middle:{y:6000}}},{local:true}),/只接受已配置/);
});
test('frozen production never patches page code after rejection, including a cosmetic finish',()=>{
 const base={decision:'reject',nextAction:'local-finish',dimensions:[{againstBenchmark:'peer'}],signatureFeatures:[{core:true,retained:true,sceneLevel:true}],fixTasks:['one isolated spacing defect']};assert.equal(nextStep(base),'stop-for-plan-revision');assert.equal(nextStep(base,{finishes:1}),'stop-for-plan-revision');assert.equal(nextStep({...base,dimensions:[{againstBenchmark:'below'}]}),'stop-for-plan-revision');assert.equal(nextStep({...base,signatureFeatures:[{core:true,retained:false,sceneLevel:true}]}),'stop-for-plan-revision');assert.equal(nextStep({decision:'evidence-needed',nextAction:'recapture'}),'recapture');assert.equal(nextStep({decision:'evidence-needed',nextAction:'recapture'},{recaptures:1}),'stop-for-plan-revision');
});
test('API sends only structured task data, keeps key out of inputs and records actual returned usage',async()=>{
 const usage=[],requests=[];const client=new ResponsesClient({apiKey:'fixture-secret-key',model:'fixture-model',onUsage:x=>usage.push(x),fetchImpl:async(url,options)=>{requests.push({url,...options});return {ok:true,json:async()=>output({finding:'fixture'})}}});
 assert.deepEqual(await client.json({role:'evidence-review',instructions:'Review evidence only',text:'No implementation context',schema:object({finding:str})}),{finding:'fixture'});
 const request=requests[0],data=JSON.parse(request.body);assert.equal(request.url,'https://api.openai.com/v1/responses');assert.equal(request.headers.Authorization,'Bearer fixture-secret-key');assert.ok(!request.body.includes('fixture-secret-key'));assert.equal(data.store,false);assert.equal(data.text.format.strict,true);assert.equal(data.tools,undefined);assert.equal(usage[0].usage.input_tokens_details.cached_tokens,5);
});
test('API does not allow autonomous tools, retry billed errors or exceed configured calls',async()=>{
 let calls=0;const client=new ResponsesClient({apiKey:'fixture',model:'fixture',maxRequests:1,fetchImpl:async()=>{calls++;return {ok:false,status:429}}});await assert.rejects(client.json({search:true}),/不允许模型自主/);assert.equal(calls,0);await assert.rejects(client.json({role:'review',schema:object({finding:str})}),/用量限制/);await assert.rejects(client.json({role:'review',schema:object({finding:str})}),/调用预算/);assert.equal(calls,1);
 const abort=new AbortController();abort.abort();const interrupted=new ResponsesClient({apiKey:'fixture',model:'fixture',signal:abort.signal,fetchImpl:async()=>{throw Error('must not request')}});await assert.rejects(interrupted.json({}),/已停止/);
});
test('incomplete/refused/empty responses cannot count as passed reviews',()=>{
 for(const value of [{status:'incomplete'}, {status:'completed',output:[{content:[{type:'refusal'}]}]}, {status:'completed',output:[]}])assert.throws(()=>responseText(value));
});
test('review evidence must belong to the claimed role and its original bytes',()=>{
 const cohort=loadCohort(ROOT),packet=new FrameSet(ROOT),benchmark=packet.add('benchmark',cohort[0].states[0],'opening'),candidate=packet.add('candidate',cohort[1].states[0],'opening');assert.ok(packet.resolve([candidate],'candidate'));assert.throws(()=>packet.resolve([benchmark],'candidate'),/错误对象/);assert.throws(()=>packet.resolve(['invented-frame'],'candidate'));assert.throws(()=>packet.add('candidate',{...cohort[0].states[0],sha256:'a'.repeat(64)},'changed'));
});

test('identical control screenshots can share image payloads without dropping frame context or crossing roles',()=>{
 const packet=new FrameSet(ROOT),e=loadCohort(ROOT)[0].states[0];
 const first=packet.add('control',e,'default'),second=packet.add('control',e,'hover'),other=packet.add('responsive-composition',e,'desktop opening');
 const inputs=packet.inputs({deduplicate:true});assert.equal(inputs.filter(i=>i.type==='input_image').length,2);assert.equal(packet.inputs().filter(i=>i.type==='input_image').length,3);
 assert.ok(inputs[0].text.includes(first+' default'));assert.ok(inputs[0].text.includes(second+' hover'));assert.ok(!inputs[0].text.includes(other+' desktop'));
 assert.deepEqual(packet.resolve([second],'control'),[{path:e.path,sha256:e.sha256}]);assert.throws(()=>packet.resolve([other],'control'));
});
test('new reviewer calibration cannot relabel every real negative as the benchmark',async t=>{
 const f=fixture(t),cohort=loadCohort(ROOT);f.write('webart.quality.json',JSON.parse(fs.readFileSync(path.join(ROOT,'webart.quality.json'))));f.write('docs/production/quality-calibration.json',JSON.parse(fs.readFileSync(path.join(ROOT,'docs/production/quality-calibration.json'))));for(const sample of cohort)for(const e of sample.states)f.write(e.path,fs.readFileSync(path.join(ROOT,e.path)));
 f.write('docs/production/prompts/CALIBRATE_REVIEWER.md',fs.readFileSync(path.join(ROOT,'docs/production/prompts/CALIBRATE_REVIEWER.md')));
 let prompt;const client={model:'fixture',json:async value=>{prompt=value;return {labels:Array.from('ABCDEF',label=>({label,verdict:'benchmark',finding:'This controlled fixture intentionally mislabels every negative as the benchmark and must fail.'}))}}};
 await assert.rejects(calibrate({root:f.root,client,cohort,runId:'fixture',save:()=>{}}),/cannot distinguish/);assert.ok(!prompt.text.includes('sourceSha256'));assert.ok(!prompt.text.includes('userScore'));assert.equal(prompt.images.filter(x=>x.type==='input_image').length,48);
});

test('calibration queued before interruption keeps exactly the same private order and evidence on resume',async t=>{
 const f=fixture(t),cohort=loadCohort(ROOT),runDirectory='docs/production/runs/calibration-resume',directory=runDirectory+'/review-queue';
 for(const file of ['webart.quality.json','docs/production/quality-calibration.json','docs/production/prompts/CALIBRATE_REVIEWER.md'])f.write(file,fs.readFileSync(path.join(ROOT,file)));
 for(const sample of cohort)for(const e of sample.states)f.write(e.path,fs.readFileSync(path.join(ROOT,e.path)));
 const save=(name,value)=>f.write(runDirectory+'/'+name,value);let pending;
 const options={root:f.root,cohort,runId:'calibration-resume',runDirectory,save};
 await assert.rejects(calibrate({...options,client:new SessionReviewClient({root:f.root,directory,defer:true,onPending:e=>pending=e})}),{code:'review-pending'});
 const orderFile=path.join(f.root,runDirectory,'calibration-order-private.json'),original=fs.readFileSync(orderFile),first=pending.requestFile;
 await assert.rejects(calibrate({...options,client:new SessionReviewClient({root:f.root,directory,resume:true,defer:true,onPending:e=>pending=e})}),{code:'review-pending'});
 assert.equal(pending.requestFile,first);assert.deepEqual(fs.readFileSync(orderFile),original);
 const order=JSON.parse(original);
 submitSessionReview({root:f.root,requestFile:first,result:{labels:order.samples.map(s=>({label:s.label,verdict:s.id==='001'?'benchmark':'below-benchmark',finding:'Engineering fixture binds the known calibration label to the exact unchanged frames; this is not a visual quality prediction.'}))}});
 const report=await calibrate({...options,client:new SessionReviewClient({root:f.root,directory,resume:true,defer:true})});
 assert.equal(report.runId,'calibration-resume');assert.ok(report.reviewReceipt);assert.equal(report.reviewer.independent,false);
 assert.equal(fs.readdirSync(path.join(f.root,directory)).filter(p=>p.endsWith('-request.json')).length,1);
 const altered=cohort.map((sample,i)=>i?sample:{...sample,states:sample.states.map((s,n)=>n?s:{...s,sha256:'0'.repeat(64)})});
 await assert.rejects(calibrate({...options,cohort:altered,client:new SessionReviewClient({root:f.root,directory,resume:true,defer:true})}),/四态已经变化/);
});
test('model cannot change package scripts, add remote resources or escape editable source paths',()=>{
 const files=[{path:'index.html',content:'<meta name="viewport" content="width=device-width"><script type="module" src="/src/main.js"></script>'},{path:'src/main.js',content:"import './styles.css';"},{path:'src/styles.css',content:'body { color: #111 }'}];assert.equal(validateFiles(files),true);
 for(const file of [{path:'../package.json',content:'evil'},{path:'package.json',content:'evil'},{path:'src/remote.js',content:"fetch('https://example.com')"},{path:'src/dynamic.js',content:'new Function("evil")'},{path:'src/escape.js',content:"import value from '../../docs/private.md?raw';"},{path:'src/escape.css',content:'@import "../../private.css";'}])assert.throws(()=>validateFiles([...files,file]));
});
test('configured content limits reject walls of placeholder copy, repeated images and invented controls',()=>{
 const measured={characters:300,paragraphs:[50,60],media:['hero.webp','work.webp'],unconfiguredControls:0,missingScenes:[]},budget={totalCharacters:650,paragraphCharacters:100};assert.equal(checkContentBudget(measured,budget).result,'passed-static-contract');
 for(const change of [{characters:651},{paragraphs:[101]},{media:['hero.webp','hero.webp']},{unconfiguredControls:1},{missingScenes:['[data-scene="ending"]']}])assert.equal(checkContentBudget({...measured,...change},budget).result,'failed-static-contract');
});
test('literal configured copy replaces model prose, escapes markup and rejects missing/unknown slots',()=>{
 const files=[{path:'index.html',content:'<h1 data-content="brand">Freestyle model copy</h1><p data-content="note">Long invented marketing</p>'}],content={brand:'A & B',note:'<script>literal text</script>'};const result=fillContent(files,content,['brand','note']);assert.ok(result[0].content.includes('A &amp; B'));assert.ok(result[0].content.includes('&lt;script&gt;'));assert.ok(!result[0].content.includes('Freestyle'));assert.throws(()=>fillContent(files,{brand:'A'},['brand']));assert.throws(()=>fillContent([{path:'index.html',content:'<h1>No slot</h1>'}],content,['brand']));assert.throws(()=>validateContent({},[]));assert.throws(()=>validateFiles([{path:'src/content.json',content:'{}'}]));
});
test('editing only the content config updates default HTML on the next dev/build transform',async t=>{
 const f=fixture(t);f.write('src/content.json',{brand:'First brand'});f.write('vite.config.mjs',contentViteConfig(['brand']));const config=(await import(pathToFileURL(path.join(f.root,'vite.config.mjs')).href)).default,html='<h1 data-content="brand">Old model prose</h1>';assert.ok(config.plugins[0].transformIndexHtml(html).includes('First brand'));f.write('src/content.json',{brand:'New & configured'});assert.ok(config.plugins[0].transformIndexHtml(html).includes('New &amp; configured'));f.write('src/content.json',{});assert.throws(()=>config.plugins[0].transformIndexHtml(html));
});
test('private candidate handoff cannot package arbitrary sources or replace001',()=>{
 assert.throws(()=>candidateFiles('webart.package.007.json'),/private prototype/);assert.throws(()=>candidateFiles('.webart/prototypes/../delivery.json'),/Unsafe/);
});
test('preview serves only allowlisted local paths, with restrictive runtime network policy',async t=>{
 const f=fixture(t);f.write('index.html','fixture preview');f.write('assets/photo.webp','fixture bytes');const host=await serveDirectory(f.root);t.after(()=>new Promise(r=>host.server.close(r)));const response=await fetch(host.url);assert.equal(response.status,200);assert.ok(response.headers.get('content-security-policy').includes("connect-src 'self'"));assert.equal(hash(Buffer.from(await response.text())),hash(Buffer.from('fixture preview')));assert.equal((await fetch(host.url+'assets/missing.webp')).status,404);assert.equal((await fetch(host.url+'assets/%2e%2e%2f%2e%2e%2foutside')).status,404);
});
test('local detailed GLB models are allowed while external resources and unconfigured decoders are blocked',()=>{
 const glb=document=>{const json=Buffer.from(JSON.stringify(document)),length=Math.ceil(json.length/4)*4,bytes=Buffer.alloc(20+length,32);bytes.write('glTF');bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(length,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);return bytes};
 assert.equal(validateAsset(glb({asset:{version:'2.0'}}),'owned.glb').kind,'self-contained-local-model');for(const value of [{asset:{version:'2.0'},images:[{uri:'https://example.org/texture.png'}]},{asset:{version:'2.0'},buffers:[{uri:'../other.bin'}]},{asset:{version:'2.0'},extensionsRequired:['KHR_draco_mesh_compression']}])assert.throws(()=>validateAsset(glb(value),'owned.glb'));assert.throws(()=>validateAsset(Buffer.from('not a model'),'owned.glb'));assert.throws(()=>validateAsset(Buffer.from('not an image'),'owned.webp'));
});

test('font selection and usage are locked before production, including exact font and license bytes',()=>{
 for(const font of fonts)assert.equal(resolveFonts([{id:font.id,role:'configured-family'}],ROOT)[0].id,font.id);
 const selected=[{id:'manrope',role:'display-and-body'}];assert.equal(resolveFonts(selected,ROOT)[0].name,'Manrope');assert.equal(assertFontSources([{content:"url('/assets/manrope.woff2')"}],selected).length,1);
 for(const invalid of [[],[{id:'unknown',role:'display'}],[{id:'manrope',role:''}],[...selected,...selected]])assert.throws(()=>resolveFonts(invalid));
 assert.throws(()=>assertFontSources([{content:"url('/assets/instrument-serif.woff2')"}],selected),/合同之外/);assert.throws(()=>assertFontSources([{content:'font-family: Arial'}],selected),/省略/);
});
test('3D cannot be silently introduced, omitted or admitted with an unspecified fallback',()=>{
 const rendering={mode:'local-3d',canvasSelector:'canvas',fallback:{selector:'[data-fallback]',ready:"window.__webartRendering==='fallback'"}},source=[{content:"import * as THREE from 'three';"}];
 assert.equal(assertRenderingSource(source,rendering),true);assert.equal(validateRenderingPlan({mode:'dom'}).mode,'dom');assert.throws(()=>validateRenderingPlan({mode:'local-3d'}));assert.throws(()=>assertRenderingSource(source,{mode:'dom'}));assert.throws(()=>assertRenderingSource([{content:'No 3D implementation'}],rendering));
});
test('rendering-failure evidence must bind the source and cover both real failures at three widths',()=>{
 const sourceSha256='a'.repeat(64),report={result:'captured-not-visually-approved',sourceSha256,checks:['context-unavailable','context-lost'].flatMap(mode=>[1440,390,320].map(width=>({mode,width,trigger:{observed:true},states:['opening','transition','middle','ending'].map(state=>({state,contentVisible:true,overflow:false,evidence:{path:'fixture.jpg',sha256:'b'.repeat(64)}}))})))};
 assert.equal(validateFallbackCapture(report,sourceSha256).length,24);assert.throws(()=>validateFallbackCapture(report,'c'.repeat(64)));const missing=structuredClone(report);missing.checks.pop();assert.throws(()=>validateFallbackCapture(missing,sourceSha256));const forged=structuredClone(report);forged.checks[3].trigger.observed=false;assert.throws(()=>validateFallbackCapture(forged,sourceSha256));const duplicate=structuredClone(report);duplicate.checks[5].width=390;assert.throws(()=>validateFallbackCapture(duplicate,sourceSha256));
});
test('archive transfer verifies bytes before deleting staging and never overwrites a private delivery',t=>{
 const f=fixture(t),temporary=path.join(os.tmpdir(),'webart-'+path.basename(f.root)+'.zip'),archivePath='.webart/trials/api-transfer-fixture-source.zip',bytes=Buffer.from('Engineering transfer fixture, not a produced archive.');t.after(()=>{if(fs.existsSync(temporary))fs.unlinkSync(temporary)});fs.writeFileSync(temporary,bytes);
 assert.throws(()=>storeTrialArchive({root:f.root,temporary,archivePath,expectedSha256:'0'.repeat(64)}),/字节已改变/);assert.equal(fs.existsSync(temporary),true);assert.equal(fs.existsSync(path.join(f.root,archivePath)),false);
 assert.equal(storeTrialArchive({root:f.root,temporary,archivePath,expectedSha256:hash(bytes)}).sha256,hash(bytes));assert.equal(fs.existsSync(temporary),false);assert.deepEqual(fs.readFileSync(path.join(f.root,archivePath)),bytes);
 fs.writeFileSync(temporary,bytes);assert.throws(()=>storeTrialArchive({root:f.root,temporary,archivePath,expectedSha256:hash(bytes)}),error=>error.code==='EEXIST');assert.equal(fs.existsSync(temporary),true);assert.deepEqual(fs.readFileSync(path.join(f.root,archivePath)),bytes);
});
