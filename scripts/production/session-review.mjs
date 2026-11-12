import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {child} from '../collection.mjs';
import {hash,ProductionError} from './api.mjs';
import {verifyEvidence} from '../quality-gate.mjs';

export const sessionProvenance={kind:'current-conversation',independent:false,contextIsolated:false};
const need=(ok,message)=>{if(!ok)throw new ProductionError('session-review-invalid',message)};
export function validateStructured(value,schema,at='result'){
  need(schema&&['object','array','string','boolean','number','integer'].includes(schema.type),'Unsupported review schema');
  if(schema.type==='object'){
    need(value&&typeof value==='object'&&!Array.isArray(value),at+' must be an object');
    need((schema.required??[]).every(k=>Object.hasOwn(value,k)),at+' is missing required fields');
    need(schema.additionalProperties!==false||Object.keys(value).every(k=>Object.hasOwn(schema.properties,k)),at+' has unapproved fields');
    for(const [key,entry] of Object.entries(value))if(schema.properties[key])validateStructured(entry,schema.properties[key],at+'.'+key);
  }else if(schema.type==='array'){need(Array.isArray(value),at+' must be an array');value.forEach((v,i)=>validateStructured(v,schema.items,at+'['+i+']'))}
  else{need(typeof value===(schema.type==='integer'?'number':schema.type),at+' has the wrong type');if(schema.type==='integer')need(Number.isInteger(value),at+' must be an integer')}
  if(schema.enum)need(schema.enum.includes(value),at+' is not an allowed value');
  return true;
}
export function readReviewRequest(root,requestFile){
  const bytes=fs.readFileSync(child(root,requestFile)),request=JSON.parse(bytes);
  need(request.schemaVersion===1&&request.provenance?.kind==='current-conversation'&&request.provenance.independent===false&&request.provenance.contextIsolated===false,'Missing honest review provenance');
  verifyEvidence(root,request.images);
  return {request,requestSha256:hash(bytes)};
}
export function submitSessionReview({root,requestFile,result,reviewer='current-conversation-art-director'}){
  const {request,requestSha256}=readReviewRequest(root,requestFile);validateStructured(result,request.outputSchema);
  need(typeof reviewer==='string'&&reviewer.trim().length>=5,'Reviewer identity required');
  const responseFile=requestFile.replace(/request\.json$/,'response.json');need(responseFile!==requestFile,'Invalid request filename');
  const response={schemaVersion:1,requestId:request.id,requestSha256,reviewedAt:new Date().toISOString(),reviewer,provenance:sessionProvenance,result};
  fs.writeFileSync(child(root,responseFile),JSON.stringify(response,null,2)+'\n',{flag:'wx'});return {responseFile,requestId:request.id};
}
export function cancelSessionReview({root,requestFile,reason}){
  const {request,requestSha256}=readReviewRequest(root,requestFile);need(reason?.length>=5,'Cancellation needs a reason');
  const responseFile=requestFile.replace(/request\.json$/,'response.json');
  fs.writeFileSync(child(root,responseFile),JSON.stringify({requestId:request.id,requestSha256,cancelled:true,reason,provenance:sessionProvenance},null,2)+'\n',{flag:'wx'});return {responseFile,cancelled:true};
}
export class SessionReviewClient{
  constructor({root,directory,model='current-conversation',signal,maxRequests=32,timeoutMs=1800000,onPending=()=>{},pollMs=250,resume=false,defer=false}){
    need(/^docs\/production\/runs\/[a-z0-9-]+\/review-queue$/.test(directory),'Use a private production review queue');
    this.root=root;this.directory=directory;this.model=model;this.signal=signal;this.maxRequests=maxRequests;this.timeoutMs=timeoutMs;this.onPending=onPending;this.pollMs=pollMs;this.requests=0;
    this.execution='current-conversation-evidence-review';this.reviewerMetadata={mode:'evidence-only-current-conversation',implementationContextIncluded:false,...sessionProvenance};
    fs.mkdirSync(child(root,directory),{recursive:true});
    this.resume=resume;this.defer=defer;this.consumed=new Set();
    if(resume)this.requests=fs.readdirSync(child(root,directory)).filter(f=>f.endsWith('-request.json')).length;
  }
  async json({role,instructions,text,images=[],schema,search=false}){
    need(!search&&['calibration','reference-review','prototype-review','style-review','controls-review'].includes(role),'Session client only accepts fixed evidence review roles');
    if(this.resume){
      let label;const expected=[];for(const input of images){if(input.type==='input_text')label=input.text;else{need(input.evidence&&label,'Missing review frame');expected.push({label,sha256:input.evidence.sha256});label=undefined}}
      for(const filename of fs.readdirSync(child(this.root,this.directory)).filter(f=>f.endsWith('-request.json')).sort()){
        const file=this.directory+'/'+filename;if(this.consumed.has(file))continue;
        const {request,requestSha256}=readReviewRequest(this.root,file);
        if(request.role!==role||request.instructions!==instructions||request.text!==text||JSON.stringify(request.outputSchema)!==JSON.stringify(schema)||JSON.stringify(request.images.map(({label,sha256})=>({label,sha256})))!==JSON.stringify(expected))continue;
        this.consumed.add(file);return this.consume(file,request,requestSha256,schema);
      }
    }
    need(++this.requests<=this.maxRequests,'Review request budget exceeded');
    need(!this.signal?.aborted,'Review cancelled');
    const id=String(this.requests).padStart(2,'0')+'-'+role+'-'+crypto.randomBytes(4).toString('hex');
    const frameDirectory=this.directory+'/'+id+'-frames';fs.mkdirSync(child(this.root,frameDirectory));
    let label;const evidence=[],sourceMap=[];
    for(const input of images){
      if(input.type==='input_text'){label=input.text;continue}
      need(input.type==='input_image'&&input.evidence&&label,'Review images must come from verified local frames');
      const relative=path.relative(this.root,input.evidence.path).replaceAll('\\','/');verifyEvidence(this.root,[{path:relative,sha256:input.evidence.sha256}]);
      const anonymous=frameDirectory+'/'+String(evidence.length).padStart(3,'0')+path.extname(relative);
      fs.copyFileSync(child(this.root,relative),child(this.root,anonymous),fs.constants.COPYFILE_EXCL);
      evidence.push({path:anonymous,sha256:input.evidence.sha256,label});sourceMap.push({frame:anonymous,source:relative,sha256:input.evidence.sha256});label=undefined;
    }
    need(evidence.length>0,'No real visual evidence supplied');verifyEvidence(this.root,evidence);
    fs.writeFileSync(child(this.root,this.directory+'/'+id+'-private-source-map.json'),JSON.stringify(sourceMap,null,2)+'\n',{flag:'wx'});
    const requestFile=this.directory+'/'+id+'-request.json';
    const request={schemaVersion:1,id,role,createdAt:new Date().toISOString(),provenance:sessionProvenance,instructions,text,images:evidence,outputSchema:schema};
    const bytes=Buffer.from(JSON.stringify(request,null,2)+'\n'),requestSha256=hash(bytes);
    fs.writeFileSync(child(this.root,requestFile),bytes,{flag:'wx'});
    const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const viewer='<!doctype html><meta charset="utf-8"><title>'+escape(role)+'</title><style>body{font:16px system-ui;background:#eee;color:#111;margin:24px}main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}figure{margin:0;background:white;padding:8px}img{width:100%;height:340px;object-fit:contain}pre{white-space:pre-wrap}details{margin:20px 0}</style><h1>'+escape(role)+'</h1><p>Current conversation review. Context is not isolated. No automatic approval.</p><details><summary>Review instructions and expected output</summary><pre>'+escape(instructions+'\n'+text+'\n'+JSON.stringify(schema,null,2))+'</pre></details><main>'+evidence.map(e=>'<figure><figcaption>'+escape(e.label)+'</figcaption><img loading="lazy" src="'+escape(path.posix.relative(this.directory,e.path))+'"></figure>').join('')+'</main>';
    fs.writeFileSync(child(this.root,requestFile.replace(/request\.json$/,'viewer.html')),viewer,{flag:'wx'});
    return this.consume(requestFile,request,requestSha256,schema);
  }
  async consume(requestFile,request,requestSha256,schema){
    const {id,role,images:evidence}=request;
    this.onPending({stage:'awaiting-session-review',requestFile,role,images:evidence.length,provenance:sessionProvenance,resumed:this.resume});
    const responseFile=requestFile.replace(/request\.json$/,'response.json'),start=Date.now();
    // A scheduler can finish this step, review the immutable packet, and invoke
    // the same command again. Pending evidence never becomes a rejection/pass.
    if(this.defer&&!fs.existsSync(child(this.root,responseFile)))throw new ProductionError('review-pending','Actual visual review is pending',{requestFile,requestSha256,role,viewerFile:requestFile.replace(/request\.json$/,'viewer.html')});
    while(!fs.existsSync(child(this.root,responseFile))){
      need(!this.signal?.aborted,'Review cancelled');need(Date.now()-start<this.timeoutMs,'Session review timed out; no approval granted');
      await new Promise(resolve=>setTimeout(resolve,this.pollMs));
    }
    const response=JSON.parse(fs.readFileSync(child(this.root,responseFile),'utf8'));
    need(hash(fs.readFileSync(child(this.root,requestFile)))===requestSha256,'Review request changed while waiting');verifyEvidence(this.root,evidence);
    need(response.requestId===id&&response.requestSha256===requestSha256,'Stale review response');
    if(response.cancelled)throw new ProductionError('session-review-cancelled',response.reason);
    need(response.provenance?.kind==='current-conversation'&&response.provenance.independent===false&&response.provenance.contextIsolated===false&&response.reviewer?.length>=5&&response.reviewedAt,'Incorrectly attributed review response');
    validateStructured(response.result,schema);
    const receiptFile=requestFile.replace(/request\.json$/,'receipt.json');
    const receipt={requestId:id,role,requestFile,responseFile,requestSha256,responseSha256:hash(fs.readFileSync(child(this.root,responseFile))),provenance:sessionProvenance,consumedAt:new Date().toISOString()};
    if(fs.existsSync(child(this.root,receiptFile))){const prior=JSON.parse(fs.readFileSync(child(this.root,receiptFile),'utf8'));need(prior.requestSha256===receipt.requestSha256&&prior.responseSha256===receipt.responseSha256&&prior.role===role,'Consumed review receipt changed')}
    else fs.writeFileSync(child(this.root,receiptFile),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
    this.lastReviewReceipt={path:receiptFile,sha256:hash(fs.readFileSync(child(this.root,receiptFile)))};
    return response.result;
  }
}
