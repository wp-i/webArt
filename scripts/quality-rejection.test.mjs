import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {evaluateQuality,loadRejectedSources,recordRejectedSource,validateRejectedReview} from './quality-gate.mjs';

const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const provenance={kind:'current-conversation',independent:false,contextIsolated:false};
const views=[['desktop',1440,900],['wide',2048,912],['tablet',768,1024],['mobile',390,844],['narrow',320,844]];
const states=['opening','transition','middle','ending'];
const finding='Controlled engineering rejection fixture for a focus outline obscuring a control; this grants no aesthetic approval.';

// Encode actual, distinct grayscale PNGs rather than header-only image stubs.
function png(width,height,shade){
 const chunk=(name,data)=>{const type=Buffer.from(name),payload=Buffer.concat([type,data]);let crc=0xffffffff;for(const byte of payload){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}const result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);payload.copy(result,4);result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;
 const pixels=Buffer.alloc((width+1)*height,shade);for(let row=0;row<height;row++)pixels[row*(width+1)]=0;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}

function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-rejection-'));
 t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('webart-rejection-'));fs.rmSync(root,{recursive:true,force:true})});
 const write=(file,value)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,Buffer.isBuffer(value)||typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');return {path:file,sha256:hash(fs.readFileSync(target))}};
 const sourceSha256=hash('controlled source with a rejected control'),requestId='24-controls-review-fixture';
 const responsive=views.flatMap(([viewport,width,height])=>states.map((state,index)=>({viewport,width,height,state,evidence:write(`frames/${viewport}-${state}.png`,png(width,height,20+views.findIndex(v=>v[0]===viewport)*4+index))})));
 const images=responsive.map((frame,index)=>({...write(`queue/images/${index}.png`,fs.readFileSync(path.join(root,frame.evidence.path))),label:`responsive-composition-${index} ${frame.viewport} ${frame.width} ${frame.state}`}));
 const request={schemaVersion:1,id:requestId,role:'controls-review',provenance,images};
 const result={decision:'reject',responsiveComposition:'pass',responsiveChecks:responsive.map((frame,index)=>({viewport:frame.viewport,state:frame.state,subject:'preserved',composition:'preserved',actions:'preserved',finding,frames:[`responsive-composition-${index}`]})),findings:[finding]};
 const response={requestId,provenance,result};
 const receipt={requestId,role:'controls-review',requestFile:'queue/request.json',responseFile:'queue/response.json',provenance};
 const runtime={sourceSha256,result:'passed-observable-checks',responsive};
 const review={decision:'reject',responsiveComposition:'pass',phase:'full-qa',sourceSha256,vetoes:[finding],reviewer:{mode:'evidence-only-current-conversation',implementationContextIncluded:false,...provenance},responsiveChecks:result.responsiveChecks.map(({frames,...check},index)=>({...check,evidence:[responsive[index].evidence]}))};
 const sealSession=()=>{receipt.requestSha256=write(receipt.requestFile,request).sha256;response.requestSha256=receipt.requestSha256;receipt.responseSha256=write(receipt.responseFile,response).sha256;review.reviewReceipt=write('queue/receipt.json',receipt)};
 const sealRuntime=()=>review.runtimeEvidence=write('runtime.json',runtime);
 sealSession();sealRuntime();
 const calibration={revision:'fixture',baseline:{id:'001',sourceSha256:hash('benchmark'),userScore:95},negatives:Array.from({length:5},(_,index)=>({id:String(index+2).padStart(3,'0'),sourceSha256:hash('negative '+index),userScore:80}))};
 write('webart.quality.json',{schemaVersion:2,enabled:true,revision:'fixture',calibration:'calibration.json',rejectedSources:'rejected.json'});write('calibration.json',calibration);
 const seed={decision:'reject',phase:'prototype',sourceSha256:hash('prior rejected source'),vetoes:[finding],states:[{evidence:[responsive[0].evidence]}]};
 write('rejected.json',{schemaVersion:1,sources:[{id:'010',sourceSha256:seed.sourceSha256,reason:finding,review:write('prior-review.json',seed)}]});
 return {root,write,sourceSha256,review,runtime,request,response,receipt,sealSession,sealRuntime};
}

test('a control rejection with passing static composition is registered by source and blocks renamed candidates',t=>{
 const f=fixture(t);validateRejectedReview(f.root,f.review,f.sourceSha256);
 const prior=loadRejectedSources(f.root)[0];f.write('controls-review.json',f.review);recordRejectedSource(f.root,'009','controls-review.json');
 const rejected=loadRejectedSources(f.root);assert.equal(rejected.length,2);assert.deepEqual(rejected[0],prior);assert.match(rejected[1].reason,/完整QA.*控件/);
 const result=evaluateQuality(f.root,{id:'999',manifest:'renamed/moved/source.json'},f.sourceSha256);
 assert.equal(result.decision,'blocked-previously-rejected-source');assert.equal(result.review,'controls-review.json');
 const before=fs.readFileSync(path.join(f.root,'rejected.json'));recordRejectedSource(f.root,'999','controls-review.json');assert.deepEqual(fs.readFileSync(path.join(f.root,'rejected.json')),before);
 f.review.decision='pass';f.write('controls-review.json',f.review);
 assert.equal(evaluateQuality(f.root,{id:'999'},f.sourceSha256).decision,'blocked-invalid-rejection-ledger');
});

test('historical full-QA responsive rejections still validate with session or historical blind provenance',t=>{
 const f=fixture(t);f.review.responsiveComposition='reject';f.response.result.responsiveComposition='reject';f.sealSession();
 validateRejectedReview(f.root,f.review,f.sourceSha256);
 f.review.reviewer={mode:'blind-evidence-only',implementationContextIncluded:false};delete f.review.reviewReceipt;
 validateRejectedReview(f.root,f.review,f.sourceSha256);
});

for(const mode of ['pass','evidence-needed'])test(`a ${mode} response cannot be rewritten as a control rejection`,t=>{
 const f=fixture(t);f.response.result.decision=mode;f.sealSession();
 assert.throws(()=>validateRejectedReview(f.root,f.review,f.sourceSha256),/passing or inconsistent response/);
});

test('cancelled responses and pending composition evidence do not become rejected sources',t=>{
 const f=fixture(t);f.response.cancelled=true;f.sealSession();
 assert.throws(()=>validateRejectedReview(f.root,f.review,f.sourceSha256),/cancelled/);
 delete f.response.cancelled;f.response.result.responsiveComposition='evidence-needed';f.sealSession();
 assert.throws(()=>validateRejectedReview(f.root,f.review,f.sourceSha256),/inconsistent response/);
 f.review.responsiveComposition='evidence-needed';assert.throws(()=>validateRejectedReview(f.root,f.review,f.sourceSha256),/actual full-QA/);
});

test('a report cannot change the original composition verdict even when the response really rejects',t=>{
 const f=fixture(t);f.response.result.responsiveComposition='reject';f.sealSession();
 assert.throws(()=>validateRejectedReview(f.root,f.review,f.sourceSha256),/inconsistent response/);
});

test('the control-only path requires the current-conversation receipt and cannot be relabelled blind',t=>{
 const f=fixture(t);delete f.review.reviewReceipt;
 assert.throws(()=>validateRejectedReview(f.root,f.review,f.sourceSha256));
 f.review.reviewer={mode:'blind-evidence-only',implementationContextIncluded:false};
 assert.throws(()=>validateRejectedReview(f.root,f.review,f.sourceSha256),/actual current-conversation receipt/);
});

test('the original receipt, response, request and evidence fingerprints cannot be overwritten',t=>{
 const f=fixture(t);
 for(const file of ['queue/receipt.json','queue/response.json','queue/request.json','queue/images/0.png']){
  const target=path.join(f.root,file),before=fs.readFileSync(target);fs.appendFileSync(target,' ');
  assert.throws(()=>validateRejectedReview(f.root,f.review,f.sourceSha256),/changed/);fs.writeFileSync(target,before);
 }
});

test('the receipt must retain the actual controls-review role and request identity',t=>{
 const f=fixture(t);f.receipt.role='prototype-review';f.sealSession();
 assert.throws(()=>validateRejectedReview(f.root,f.review,f.sourceSha256),/wrong provenance/);
 f.receipt.role='controls-review';f.response.requestId='different-request';f.sealSession();
 assert.throws(()=>validateRejectedReview(f.root,f.review,f.sourceSha256),/stale/);
});

test('changed report or measured runtime sources cannot inherit the rejection',t=>{
 const f=fixture(t),other=hash('another source');
 assert.throws(()=>validateRejectedReview(f.root,{...f.review,sourceSha256:other},f.sourceSha256),/real rejection/);
 f.review.sourceSha256=other;assert.throws(()=>validateRejectedReview(f.root,f.review,other),/same-source/);
 f.review.sourceSha256=f.sourceSha256;f.runtime.sourceSha256=other;f.sealRuntime();
 assert.throws(()=>validateRejectedReview(f.root,f.review,f.sourceSha256),/same-source/);
});

test('all twenty real states, five fixed widths and matching report evidence remain mandatory',t=>{
 const f=fixture(t),last=f.review.responsiveChecks.at(-1),original=last.evidence;
 last.evidence=f.review.responsiveChecks[0].evidence;assert.throws(()=>validateRejectedReview(f.root,f.review,f.sourceSha256),/substituted/);last.evidence=original;
 f.review.responsiveChecks.pop();assert.throws(()=>validateRejectedReview(f.root,f.review,f.sourceSha256),/every measured/);f.review.responsiveChecks.push(last);
 f.runtime.responsive.at(-1).width=321;f.sealRuntime();assert.throws(()=>validateRejectedReview(f.root,f.review,f.sourceSha256),/every measured/);
});

test('rehashing a substituted runtime state does not make it part of the original reviewed request',t=>{
 const f=fixture(t),frame=f.runtime.responsive[0];
 frame.evidence=f.write(frame.evidence.path,png(frame.width,frame.height,240));f.review.responsiveChecks[0].evidence=[frame.evidence];f.sealRuntime();
 assert.throws(()=>validateRejectedReview(f.root,f.review,f.sourceSha256),/unreviewed responsive state/);
});

test('a responsive state must cite its own original response frame',t=>{
 const f=fixture(t);f.response.result.responsiveChecks[0].frames=['responsive-composition-1'];f.sealSession();
 assert.throws(()=>validateRejectedReview(f.root,f.review,f.sourceSha256),/unreviewed responsive state/);
});

test('changed state bytes are blocked before registration',t=>{
 const f=fixture(t);fs.appendFileSync(path.join(f.root,f.runtime.responsive[0].evidence.path),'changed');
 assert.throws(()=>validateRejectedReview(f.root,f.review,f.sourceSha256),/changed/);
});
