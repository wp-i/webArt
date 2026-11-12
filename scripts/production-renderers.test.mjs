import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {ROOT,child,loadCollection,template,fingerprint,validateTrialDelivery} from './collection.mjs';
import {loadRenderer,assertRendererPlan,materializeRenderer,validateRendererContent} from './production/renderers.mjs';
import {beginCandidate} from './production-flow.mjs';
import {ProductionRun,loadPlan} from './production/runner.mjs';
import {registerRenderer,existingRendererArchive} from './production/renderers.mjs';
import {spawnSync} from 'node:child_process';
const json=file=>JSON.parse(fs.readFileSync(child(ROOT,file),'utf8'));
const plan=json('docs/production/plans/010.json');
const id=plan.renderer.id,directory='renderers/'+id;
const defaults=json(directory+'/source/src/content.json'),rules=json(directory+'/content-rules.json');
function copyFixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-renderer-test-'));
 t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('webart-renderer-test-'));fs.rmSync(root,{recursive:true,force:true})});
 for(const file of ['webart.renderers.json','webart.collection.json','webart.quality.json','webart.performance.json','docs/production/quality-calibration.json',json(directory+'/renderer.json').deliveryReceipt.path]){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(child(ROOT,file),target)}
 fs.cpSync(child(ROOT,directory),path.join(root,directory),{recursive:true});return root;
}
function candidate(t,label){
 const destination='.webart/prototypes/renderer-test-'+label+'-'+Date.now(),target=child(ROOT,destination);
 beginCandidate(ROOT,'010',destination,'docs/production/runs/2026-10-16-actual-trial/010-reference-review.json','docs/production/runs/2026-10-16-actual-trial/reviewer-calibration.json');
 t.after(()=>{assert.ok(target.startsWith(child(ROOT,'.webart/prototypes')+path.sep));fs.rmSync(target,{recursive:true,force:true})});return destination;
}
test('actual complete renderer binds current source, full QA and pending user acceptance',()=>{
 const renderer=loadRenderer(ROOT,id);assert.equal(renderer.definition.sourceSha256,plan.renderer.sourceSha256);assert.equal(renderer.definition.status,'internal-qualified-user-pending');assert.equal(renderer.definition.templateId,'010');assert.equal(loadPlan(ROOT,'010').renderer.id,id);
 assert.throws(()=>loadRenderer(ROOT,'unknown-style'),/未登记/);assert.throws(()=>loadRenderer(ROOT,'../001'));
});
test('changing frozen CSS, JavaScript, dependency versions or definition stops before any review or output',t=>{
 const root=copyFixture(t);
 for(const file of ['src/styles.css','src/main.js','package-lock.json']){
  const target=path.join(root,directory,'source',file),bytes=fs.readFileSync(target);fs.appendFileSync(target,'\n ');assert.throws(()=>loadRenderer(root,id),/源码已变化/);fs.writeFileSync(target,bytes);
 }
 const definition=path.join(root,directory,'renderer.json');fs.appendFileSync(definition,' ');assert.throws(()=>loadRenderer(root,id),/changed or empty evidence/);
});
test('field limits block text walls, CJK font substitution, utility changes, missing fields and source injection',()=>{
 const values=[{...defaults,brand:'A very long brand'}, {...defaults,'hero-title':'A title without fixed line break'}, {...defaults,'hero-title':'标题\n下一行'}, {...defaults,'hero-note':'x'.repeat(46)}, {...defaults,'release-label':'Buy now'}, {...defaults,'hero-title':'<script>\nAttack'}, {...defaults,css:'body{display:none}'}];
 const missing={...defaults};delete missing.brand;values.push(missing);
 for(const value of values)assert.throws(()=>validateRendererContent(value,rules,defaults,plan.requiredContent));
 assert.equal(validateRendererContent({...defaults,brand:'Pace 04','hero-note':'A & B. Form in motion.'},rules,defaults,plan.requiredContent),true);
});
test('plan cannot silently switch template identity, lower QA, change controls or inject renderer code',()=>{
 for(const value of [{...plan,id:'009'}, {...plan,renderer:{...plan.renderer,sourceSha256:'0'.repeat(64)}}, {...plan,qa:{...plan.qa,composition:{}}}, {...plan,controls:[]}, {...plan,renderer:{...plan.renderer,files:[]}}])assert.throws(()=>assertRendererPlan(ROOT,value));
});
test('unmodified replay preserves exact approved bytes and never copies an old admission',t=>{
 const destination=candidate(t,'default'),entry=template(loadCollection(ROOT),'010');
 const reordered=Object.fromEntries(Object.entries(plan.content).reverse());
 const result=materializeRenderer({root:ROOT,directory:destination,entry,plan:{...plan,content:reordered}});
 assert.equal(result.sourceSha256,plan.renderer.sourceSha256);assert.equal(result.codeGenerationCalls,0);assert.equal(result.visualAdmissionReused,false);assert.equal(result.requiresFreshReview,true);
 for(const file of ['contract.json','delivery.json','dist','node_modules'])assert.equal(fs.existsSync(child(ROOT,destination+'/'+file)),false);
 assert.throws(()=>materializeRenderer({root:ROOT,directory:destination,entry,plan}),/已有源文件/);
});
test('changed content changes only content slots and cannot reuse old fingerprint approval',t=>{
 const destination=candidate(t,'content'),entry=template(loadCollection(ROOT),'010'),content={...defaults,brand:'Pace 04','hero-note':'A & B. Form in motion.'};
 const result=materializeRenderer({root:ROOT,directory:destination,entry,plan:{...plan,content}});assert.notEqual(result.sourceSha256,plan.renderer.sourceSha256);
 for(const file of ['src/main.js','src/styles.css','src/locked/instrument-scene.js','package-lock.json'])assert.deepEqual(fs.readFileSync(child(ROOT,destination+'/'+file)),fs.readFileSync(child(ROOT,directory+'/source/'+file)));
 assert.ok(fs.readFileSync(child(ROOT,destination+'/index.html'),'utf8').includes('A &amp; B. Form in motion.'));
 const definition=json(directory+'/renderer.json'),handoff=json(definition.qualification.path),trial={...entry,projectDir:destination,manifest:result.manifest,qualityReview:definition.contract.path,status:'draft',stage:'trial',records:handoff.records,trialApproval:handoff.trialApproval};
 assert.throws(()=>validateTrialDelivery(trial,handoff,ROOT),/source changed since QA approval/);
});
test('unknown renderer or oversized content stops the real production constructor before model calls',()=>{
 let calls=0;const client={json:()=>{calls++;throw Error('Unexpected model call')}};
 for(const value of [{...plan,renderer:{id:'unknown-style',sourceSha256:plan.renderer.sourceSha256}},{...plan,content:{...defaults,brand:'X'.repeat(30)}}]){
  assert.throws(()=>new ProductionRun({root:ROOT,config:{ids:['010'],model:'fixture'},services:{client,loadPlan:()=>{assertRendererPlan(ROOT,value);return value}}}));
 }
 assert.equal(calls,0);assert.equal(typeof ProductionRun.prototype.produce,'undefined');
});
test('unqualified source and duplicate revisions cannot enter the renderer registry or modify it',async t=>{
 const root=copyFixture(t),registry=fs.readFileSync(path.join(root,'webart.renderers.json'));
 await assert.rejects(registerRenderer({root,id,candidatePath:'not-a-candidate.json',planPath:'unused',rulesPath:'unused'}),/已登记/);
 await assert.rejects(registerRenderer({root,id:'unqualified-v1',candidatePath:'webart.package.010.json',planPath:'unused',rulesPath:'unused'}),/private prototype/);
 await assert.rejects(registerRenderer({root,id:'no-version',candidatePath:'unused',planPath:'unused',rulesPath:'unused'}),/明确版本/);
 assert.deepEqual(fs.readFileSync(path.join(root,'webart.renderers.json')),registry);assert.equal(fs.existsSync(path.join(root,'renderers/unqualified-v1')),false);
});
test('registered renderer validates in a fresh workspace with only non-ignored proof/source inputs',async t=>{
 const observed=new Set(),original=fs.readFileSync;
 try{
  fs.readFileSync=function(file,...options){if(typeof file==='string'&&path.isAbsolute(file)&&file.startsWith(ROOT+path.sep))observed.add(file);return original.call(this,file,...options)};
  loadPlan(ROOT,'010');
 }finally{fs.readFileSync=original}
 for(const file of Object.values(json(directory+'/qualification.json').records))observed.add(child(ROOT,file));
 const paths=[...observed].map(file=>path.relative(ROOT,file).replaceAll('\\','/'));
 assert.ok(paths.length>200);assert.ok(!paths.some(file=>file.startsWith('.webart/')),'Qualification must not depend on private working files');
 const ignored=spawnSync('git',['check-ignore','--stdin'],{cwd:ROOT,input:paths.join('\n')+'\n',encoding:'utf8'});
 assert.equal(ignored.status,1,'Required inputs must survive a fresh checkout: '+(ignored.error?.message??ignored.stderr??'')+ignored.stdout);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-renderer-portable-'));
 t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('webart-renderer-portable-'));fs.rmSync(root,{recursive:true,force:true})});
 for(const file of paths){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(child(ROOT,file),target)}
 assert.equal(loadPlan(root,'010').renderer.id,id);
 const privateDir='.webart/prototypes/registration-fixture',definition=json(directory+'/renderer.json'),sourceHandoff=json(definition.qualification.path),manifest=json(definition.manifest.path);
 const write=(file,value)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(value,null,2)+'\n')};
 for(const file of loadRenderer(root,id).files){const target=path.join(root,privateDir,file.archive);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file.source,target)}
 write(privateDir+'/manifest.json',{...manifest,files:manifest.files.map(file=>({source:privateDir+'/'+file.archive,archive:file.archive}))});
 fs.copyFileSync(path.join(root,definition.contract.path),path.join(root,privateDir,'contract.json'));
 write(privateDir+'/delivery.json',{...sourceHandoff,manifest:privateDir+'/manifest.json',qualityReview:privateDir+'/contract.json'});
 const css=path.join(root,privateDir,'src/styles.css'),cssBytes=fs.readFileSync(css);fs.appendFileSync(css,' ');
 await assert.rejects(registerRenderer({root,id:'pace-registration-fixture-v1',candidatePath:privateDir+'/delivery.json',planPath:'docs/production/plans/010.json',rulesPath:directory+'/content-rules.json'}),/source changed since QA approval/);
 fs.writeFileSync(css,cssBytes);
 assert.throws(()=>existingRendererArchive({root,plan,sourceSha256:plan.renderer.sourceSha256}),/本地缺失/);
 fs.cpSync(path.join(ROOT,'scripts'),path.join(root,'scripts'),{recursive:true});fs.copyFileSync(child(ROOT,'docs/assets/font-registry.json'),path.join(root,'docs/assets/font-registry.json'));
 const receipt=json(definition.deliveryReceipt.path);fs.mkdirSync(path.dirname(path.join(root,receipt.archivePath)),{recursive:true});fs.copyFileSync(child(ROOT,receipt.archivePath),path.join(root,receipt.archivePath));
 const result=await registerRenderer({root,id:'pace-registration-fixture-v1',candidatePath:privateDir+'/delivery.json',planPath:'docs/production/plans/010.json',rulesPath:directory+'/content-rules.json',archiveReceiptPath:definition.deliveryReceipt.path});
 assert.equal(result.sourceSha256,plan.renderer.sourceSha256);assert.equal(result.newArchives,0);assert.equal(loadRenderer(root,result.id).definition.status,'internal-qualified-user-pending');
 const reused=existingRendererArchive({root,plan,sourceSha256:plan.renderer.sourceSha256});assert.equal(reused.archivePath,receipt.archivePath);assert.equal(reused.archiveReused,true);
 assert.equal(existingRendererArchive({root,plan,sourceSha256:'0'.repeat(64)}),null);
 fs.appendFileSync(path.join(root,receipt.archivePath),' ');assert.throws(()=>existingRendererArchive({root,plan,sourceSha256:plan.renderer.sourceSha256}),/字节已变化/);
});
test('every active registered plan validates from its durable proof and source files',t=>{
 const active=json('webart.production.json').plans.map(p=>json(p.path)).filter(p=>p.status==='locked'&&p.renderer);
 assert.ok(active.length>=2,'The second qualified style must be covered');
 for(const plan of active){
  const definition=json('renderers/'+plan.renderer.id+'/renderer.json');
  const observed=new Set(),original=fs.readFileSync;
  try{fs.readFileSync=function(file,...options){if(typeof file==='string'&&path.isAbsolute(file)&&file.startsWith(ROOT+path.sep))observed.add(file);return original.call(this,file,...options)};loadPlan(ROOT,definition.templateId)}finally{fs.readFileSync=original}
  for(const file of Object.values(json(definition.qualification.path).records))observed.add(child(ROOT,file));
  const paths=[...observed].map(file=>path.relative(ROOT,file).replaceAll('\\','/'));
  assert.ok(!paths.some(file=>file.startsWith('.webart/')),'Active plan depends on private files: '+definition.id);
  const ignored=spawnSync('git',['check-ignore','--stdin'],{cwd:ROOT,input:paths.join('\n')+'\n',encoding:'utf8'});
  assert.equal(ignored.status,1,'Ignored qualification inputs for '+definition.id+': '+ignored.stdout+ignored.stderr);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-active-plan-portable-'));
  t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('webart-active-plan-portable-'));fs.rmSync(root,{recursive:true,force:true})});
  for(const file of paths){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(child(ROOT,file),target)}
  assert.equal(loadPlan(root,definition.templateId).renderer.id,definition.id);
 }
});
