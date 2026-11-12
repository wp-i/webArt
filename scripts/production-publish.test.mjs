import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT,child} from './collection.mjs';
import {getShowcase} from './showcase.mjs';
import {ensureCollectionPreview,galleryQAConfig,publicationFailure,publicationPlan} from './production-publish.mjs';
import {loadRenderer} from './production/renderers.mjs';

test('publication failure preserves the actual failed stage and bounded child diagnostic without reclassifying success',()=>{
 const error=Object.assign(new Error('本地检查失败'),{code:'stage-failed',details:{output:'x'.repeat(16000)+'actual iframe readiness failure'}});
 const result=publicationFailure(error,'collection-functional-qa');
 assert.equal(result.failure,'本地检查失败');assert.equal(result.failureStage,'collection-functional-qa');assert.equal(result.failureCode,'stage-failed');assert.equal(result.failureOutput.length,16000);assert.ok(result.failureOutput.endsWith('actual iframe readiness failure'));
 assert.deepEqual(publicationFailure(new Error('missing archive'),'collection-http-and-archives'),{failure:'missing archive',failureStage:'collection-http-and-archives',failureCode:null});
});

test('a preview cold-launch timeout rechecks the same service once without weakening either deadline',async()=>{
 const calls=[],timeout=Object.assign(new Error('cold launch timed out'),{code:'stage-timeout'});
 const result=await ensureCollectionPreview({root:ROOT,run:async(...args)=>{calls.push(args);if(calls.length===1)throw timeout;return 'Preview ready'}});
 assert.equal(result,'Preview ready');assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0][2].timeout,45000);assert.ok(calls[0][1].includes('collection'));
 let failures=0;await assert.rejects(ensureCollectionPreview({root:ROOT,run:async()=>{failures++;throw timeout}}),/cold launch/);assert.equal(failures,2);
 failures=0;await assert.rejects(ensureCollectionPreview({root:ROOT,run:async()=>{failures++;throw Object.assign(new Error('unrecognized service'),{code:'stage-failed'})}}),/unrecognized/);assert.equal(failures,1);
});
test('gallery QA derives the actual registered preview and download routes without loosening link checks',()=>{
 const items=getShowcase(),qa=galleryQAConfig(items,'docs/evidence/publication/test');
 assert.equal(qa.images,6);assert.ok(qa.documentPaths.includes('/'));assert.ok(qa.documentPaths.includes('/preview.html'));
 for(const item of items){assert.ok(qa.documentPaths.includes(item.preview));assert.ok(qa.documentPaths.includes(item.download))}
 assert.ok(qa.documentPaths.includes('/designs/010-pace-precision-v2/'));
 assert.equal(qa.documentPaths.some(p=>p.includes('*')),false);
});
test('homepage publication rejects mock reviews, missing static metadata and a mismatched source or run',t=>{
 // Reconstruct a byte-identical engineering candidate from the durable qualified
 // renderer. Tests must not depend on an ignored previous production workspace.
 const renderer=loadRenderer(ROOT,'pace-precision-v2'),runId='api-publication-test-'+Date.now(),directory='.webart/prototypes/'+runId+'-010',target=child(ROOT,directory);
 fs.mkdirSync(target,{recursive:true});t.after(()=>{assert.equal(path.dirname(target),child(ROOT,'.webart/prototypes'));assert.ok(path.basename(target).startsWith('api-publication-test-'));fs.rmSync(target,{recursive:true,force:true})});
 for(const file of renderer.files){const destination=child(ROOT,directory+'/'+file.archive);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(file.source,destination)}
 const write=(file,value)=>fs.writeFileSync(child(ROOT,directory+'/'+file),JSON.stringify(value,null,2)+'\n');
 write('manifest.json',{...renderer.config,files:renderer.config.files.map(rule=>({source:directory+'/'+rule.archive,archive:rule.archive}))});
 write('contract.json',renderer.contract);
 const qualified=JSON.parse(fs.readFileSync(child(ROOT,renderer.definition.qualification.path),'utf8'));
 write('delivery.json',{...qualified,manifest:directory+'/manifest.json',qualityReview:directory+'/contract.json'});
 const run={runId,status:'ready-for-user-review',execution:'current-conversation-evidence-review',ids:['010'],deliveries:[{id:'010',directory,sourceSha256:renderer.definition.sourceSha256,sha256:renderer.archive.sha256,bytes:renderer.archive.bytes}]};
 const config=JSON.parse(fs.readFileSync('webart.publication.json','utf8'));
 assert.equal(run.status,'ready-for-user-review');assert.equal(publicationPlan(ROOT,run,config)[0].id,'010');
 assert.throws(()=>publicationPlan(ROOT,{...run,execution:'controlled-fixture'},config),/fixtures/);
 assert.throws(()=>publicationPlan(ROOT,{...run,status:'running'},config),/completed real/);
 assert.throws(()=>publicationPlan(ROOT,{...run,ids:['006']},config),/incomplete/);
 assert.throws(()=>publicationPlan(ROOT,run,{...config,items:[]}),/metadata/);
 assert.throws(()=>publicationPlan(ROOT,{...run,deliveries:run.deliveries.map(d=>({...d,sourceSha256:'0'.repeat(64)}))},config),/same registered source/);
 assert.throws(()=>publicationPlan(ROOT,{...run,runId:'api-another-run'},config),/belong/);
});
