import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SessionReviewClient,submitSessionReview,validateStructured,cancelSessionReview} from './production/session-review.mjs';
import {imageInput} from './production/api.mjs';
import {evidenceReviewer,validateSessionReceipt} from './quality-gate.mjs';
const schema={type:'object',additionalProperties:false,required:['decision'],properties:{decision:{type:'string',enum:['reject','admit']}}};

test('deferred review exits with an immutable pending packet and resumes without another request',async t=>{
 const root=fixture(t),directory='docs/production/runs/deferred/review-queue';
 const input={role:'prototype-review',instructions:'Actual source and evidence',text:'Compare four states',images:imageInput(path.join(root,'frame.png'),'candidate-0 desktop opening'),schema};
 let first;
 await assert.rejects(new SessionReviewClient({root,directory,defer:true,onPending:e=>first=e}).json(input),error=>error.code==='review-pending'&&error.details.requestFile===first.requestFile);
 const filename=path.join(root,first.requestFile),original=fs.readFileSync(filename);
 assert.ok(!fs.existsSync(filename.replace('request.json','receipt.json')));
 let resumed;
 await assert.rejects(new SessionReviewClient({root,directory,defer:true,resume:true,onPending:e=>resumed=e}).json(input),{code:'review-pending'});
 assert.equal(resumed.requestFile,first.requestFile);assert.deepEqual(fs.readFileSync(filename),original);
 assert.equal(fs.readdirSync(path.join(root,directory)).filter(f=>f.endsWith('-request.json')).length,1);
 submitSessionReview({root,requestFile:first.requestFile,result:{decision:'reject'}});
 const client=new SessionReviewClient({root,directory,defer:true,resume:true});
 assert.deepEqual(await client.json(input),{decision:'reject'});
 assert.ok(client.lastReviewReceipt);assert.deepEqual(fs.readFileSync(filename),original);
});

test('deferred review refuses tampered evidence before it can consume a completed response',async t=>{
 const root=fixture(t),directory='docs/production/runs/deferred-tamper/review-queue';let pending;
 const input={role:'prototype-review',instructions:'Compare',text:'Evidence',images:imageInput(path.join(root,'frame.png'),'candidate-0'),schema};
 await assert.rejects(new SessionReviewClient({root,directory,defer:true,onPending:e=>pending=e}).json(input),{code:'review-pending'});
 submitSessionReview({root,requestFile:pending.requestFile,result:{decision:'admit'}});
 const request=JSON.parse(fs.readFileSync(path.join(root,pending.requestFile)));
 fs.appendFileSync(path.join(root,request.images[0].path),'tamper');
 await assert.rejects(new SessionReviewClient({root,directory,defer:true,resume:true}).json(input));
 assert.ok(!fs.existsSync(path.join(root,pending.requestFile.replace('request.json','receipt.json'))));
});
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-review-'));t.after(()=>{assert.ok(root.startsWith(os.tmpdir()+path.sep));fs.rmSync(root,{recursive:true,force:true})});fs.writeFileSync(path.join(root,'frame.png'),Buffer.from('89504e470d0a1a0a','hex'));return root}
test('session queue waits for a real attributed response; a rejection stays a rejection',async t=>{
 const root=fixture(t);let pending;const client=new SessionReviewClient({root,directory:'docs/production/runs/test/review-queue',pollMs:5,timeoutMs:1000,onPending:e=>pending=e});
 const result=client.json({role:'reference-review',instructions:'Compare actual evidence',text:'No implementation reasons',images:imageInput(path.join(root,'frame.png'),'reference-0 desktop opening'),schema});
 assert.ok(pending.requestFile);assert.equal(fs.existsSync(path.join(root,pending.requestFile.replace('request.json','response.json'))),false);
 const request=JSON.parse(fs.readFileSync(path.join(root,pending.requestFile)));assert.match(request.images[0].path,/-frames\/000.png$/);assert.equal(request.provenance.independent,false);assert.ok(!JSON.stringify(request).includes('base64'));
 submitSessionReview({root,requestFile:pending.requestFile,result:{decision:'reject'}});
 assert.deepEqual(await result,{decision:'reject'});assert.ok(fs.existsSync(path.join(root,pending.requestFile.replace('request.json','receipt.json'))));
 const report={reviewer:client.reviewerMetadata,reviewReceipt:client.lastReviewReceipt,decision:'reject'};
 validateSessionReceipt(root,report,'reference-review');
 assert.throws(()=>validateSessionReceipt(root,{...report,decision:'admit'},'reference-review'),/promoted/);
 assert.throws(()=>validateSessionReceipt(root,report,'prototype-review'),/provenance/);
 assert.throws(()=>validateSessionReceipt(root,{...report,reviewReceipt:undefined},'reference-review'));
 assert.throws(()=>submitSessionReview({root,requestFile:pending.requestFile,result:{decision:'admit'}}),/EEXIST/);
});
test('an explicit cancellation ends a pending review without manufacturing a visual verdict',async t=>{
 const root=fixture(t);let pending;const client=new SessionReviewClient({root,directory:'docs/production/runs/test/review-queue',pollMs:5,onPending:e=>pending=e});
 const result=client.json({role:'reference-review',instructions:'Review',text:'',images:imageInput(path.join(root,'frame.png'),'reference-0'),schema});
 cancelSessionReview({root,requestFile:pending.requestFile,reason:'Invalid visual evidence; recapture required'});
 await assert.rejects(result,/recapture required/);assert.equal(client.lastReviewReceipt,undefined);
});
test('changed evidence and changed requests cannot consume an approval',async t=>{
 for(const target of ['image','request']){
  const root=fixture(t);let pending;const client=new SessionReviewClient({root,directory:'docs/production/runs/test/review-queue',pollMs:5,onPending:e=>pending=e});
  const result=client.json({role:'reference-review',instructions:'Review',text:'Evidence',images:imageInput(path.join(root,'frame.png'),'reference-0'),schema});
  submitSessionReview({root,requestFile:pending.requestFile,result:{decision:'admit'}});
  const request=JSON.parse(fs.readFileSync(path.join(root,pending.requestFile)));
  fs.appendFileSync(path.join(root,target==='image'?request.images[0].path:pending.requestFile),' ');
  await assert.rejects(result,/changed|fingerprint/);
 }
});
test('strict responses, missing review, cancellation and overstated provenance fail closed',async t=>{
 assert.throws(()=>validateStructured({decision:'admit',score:95},schema),/unapproved/);
 assert.throws(()=>validateStructured({decision:'pass'},schema),/allowed/);
 const root=fixture(t),client=new SessionReviewClient({root,directory:'docs/production/runs/test/review-queue',timeoutMs:10,pollMs:5});
 await assert.rejects(client.json({role:'reference-review',instructions:'',text:'',images:imageInput(path.join(root,'frame.png'),'frame'),schema}),/timed out/);
 const abort=new AbortController();abort.abort();const cancelled=new SessionReviewClient({root,directory:'docs/production/runs/test/review-queue',signal:abort.signal});
 await assert.rejects(cancelled.json({role:'reference-review',images:[],schema}),/cancelled/);
 assert.equal(evidenceReviewer({...client.reviewerMetadata}),true);
 assert.equal(evidenceReviewer({...client.reviewerMetadata,independent:true}),false);
 assert.equal(evidenceReviewer({...client.reviewerMetadata,contextIsolated:true}),false);
 assert.equal(evidenceReviewer({...client.reviewerMetadata,implementationContextIncluded:true}),false);
 assert.equal(JSON.stringify(imageInput(path.join(root,'frame.png'),'frame')).includes('evidence'),false,'local provenance must not leak into Responses API fields');
});

test('an interrupted reviewer resumes the exact pending packet and immutable receipt without a new request',async t=>{
 const root=fixture(t),directory='docs/production/runs/test/review-queue',abort=new AbortController();let pending;
 const params={role:'style-review',instructions:'Compare actual pictures',text:'Fixed comparison',images:imageInput(path.join(root,'frame.png'),'candidate-0'),schema};
 const original=new SessionReviewClient({root,directory,signal:abort.signal,pollMs:5,onPending:e=>pending=e});
 const interrupted=original.json(params);abort.abort();await assert.rejects(interrupted,/cancelled/);
 const file=pending.requestFile;const resumed=new SessionReviewClient({root,directory,resume:true,pollMs:5,onPending:e=>pending=e});
 const result=resumed.json(params);assert.equal(pending.requestFile,file);assert.equal(pending.resumed,true);
 submitSessionReview({root,requestFile:file,result:{decision:'admit'}});assert.deepEqual(await result,{decision:'admit'});
 const receipt=fs.readFileSync(path.join(root,file.replace('request.json','receipt.json')));
 const replay=new SessionReviewClient({root,directory,resume:true,pollMs:5});assert.deepEqual(await replay.json(params),{decision:'admit'});
 assert.deepEqual(fs.readFileSync(path.join(root,file.replace('request.json','receipt.json'))),receipt);
 assert.equal(fs.readdirSync(path.join(root,directory)).filter(f=>f.endsWith('-request.json')).length,1);
});
