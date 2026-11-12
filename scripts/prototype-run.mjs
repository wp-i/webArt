import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,child,loadCollection,template,fingerprint} from './collection.mjs';
import {referencePreflight} from './production-flow.mjs';
import {hash,ProductionError,ResponsesClient} from './production/api.mjs';
import {verifyEvidence,loadQualityPolicy,loadRejectedSources,recordRejectedSource,validateReview,assertCalibratedReviewer} from './quality-gate.mjs';
import {buildProject,serveDirectory} from './production/project.mjs';
import {browserEndpoint,runCapture,command} from './production/process.mjs';
import {validateCapturePlan} from './production/runner.mjs';
import {validateContent} from './production/content.mjs';
import {loadCohort,review} from './production/evidence.mjs';
import {validateVisualContract,assertVisualCapture,validateVisualReview} from './production/visual-contract.mjs';
import {SessionReviewClient} from './production/session-review.mjs';
import {CachedCodexCliReviewClient} from './production/cached-cli-review.mjs';
import {resolveCalibratedCliRuntime} from './production/cli-runtime.mjs';

const read=(root,file)=>JSON.parse(fs.readFileSync(child(root,file),'utf8'));
const need=(ok,message)=>{if(!ok)throw new ProductionError('prototype-workflow-invalid',message)};
const evidence=(root,file)=>({path:file,sha256:hash(fs.readFileSync(child(root,file)))});
const captureFiles=c=>[...c.states.flatMap(s=>s.evidence),...c.motion.flatMap(m=>m.evidence)];
const captureOnly=cfg=>Object.fromEntries(Object.entries(cfg).filter(([key])=>!['url','manifest','slug','output'].includes(key)));
const captureTools=['scripts/capture-production.mjs','scripts/production/device-metrics.mjs','scripts/production/native-scroll.mjs','scripts/production/visual-contract.mjs'];

// Both prototype stages keep the calibrated transport and its campaign queue.
// A supplied fixture may omit transport metadata; a real transport cannot be
// relabelled with a calibration from another review mode.
export function workflowReviewClient({root,runDirectory,evaluator,client,maxRequests=32,onProgress=()=>{},onUsage=()=>{},onReuse=()=>{},runtimeVersionProbe}){
 const mode=evaluator.reviewer?.mode,cli=mode==='evidence-only-fresh-codex-cli',session=mode==='evidence-only-current-conversation';
 need(/^docs\/production\/runs\/[a-z0-9-]+$/.test(runDirectory),'Use the calibrated production campaign directory');
 const directory=runDirectory+(cli?'/cli-review':'/review-queue');
 if(!client){
  need(cli||session,'An API calibration requires its explicit API review client');
  const runtime=cli?resolveCalibratedCliRuntime({root,calibration:evaluator,versionProbe:runtimeVersionProbe}):undefined;
  client=cli?new CachedCodexCliReviewClient({root,directory,executable:runtime.executable,model:evaluator.reviewer.requestedModel??undefined,maxRequests,onPending:onProgress,onUsage:event=>{onUsage(event);onProgress({stage:'cli-review-usage',...event})},onReuse:event=>{onReuse(event);onProgress({stage:'cli-review-reused',...event})}}):new SessionReviewClient({root,directory,resume:true,defer:true,maxRequests,onPending:onProgress});
 }
 const actualMode=client.reviewerMetadata?.mode,execution=client.execution;
 if(cli||actualMode==='evidence-only-fresh-codex-cli'||execution==='fresh-codex-cli-evidence-review'){
  need(cli&&actualMode==='evidence-only-fresh-codex-cli'&&execution==='fresh-codex-cli-evidence-review','Review client differs from the calibrated review mode');
  need((client.requestedModel??null)===(evaluator.reviewer.requestedModel??null),'CLI model override differs from the calibrated request');
  const actualDirectory=client.relativeDirectory??path.relative(root,client.directory??'').replaceAll('\\','/');
  need(actualDirectory===directory,'CLI review client must reuse the calibrated campaign directory');
 }else if(actualMode==='evidence-only-current-conversation'||execution==='current-conversation-evidence-review')need(session&&actualMode==='evidence-only-current-conversation'&&execution==='current-conversation-evidence-review','Review client differs from the calibrated review mode');
 else if(client instanceof ResponsesClient||execution==='live-responses-api')need(mode==='blind-evidence-only','API client differs from the calibrated review mode');
 else need(actualMode===undefined&&(execution===undefined||execution==='controlled-fixture'),'Unknown review client transport');
 return client;
}

export function assertNewPrototypeSource(root,sourceSha256){
 need(!loadQualityPolicy(root).calibration.negatives.some(n=>n.sourceSha256===sourceSha256),'User-rejected comparison source cannot become a new prototype');
 const rejected=loadRejectedSources(root).find(r=>r.sourceSha256===sourceSha256);
 need(!rejected,'Rejected source cannot be reviewed again: '+(rejected?.review?.path??''));
}

export function reusablePrototypeCapture(root,{cfg,sourceSha256,plan,dependencies,exclude}){
 const expected=JSON.stringify(captureOnly({...plan.prototypeCapture,visualContract:plan.visualContract}));
 for(const name of fs.readdirSync(child(root,cfg.runDirectory)).filter(n=>n.startsWith('prototype-'+cfg.id+'-')).sort()){
  const directory=cfg.runDirectory+'/'+name;if(directory===exclude||!fs.existsSync(child(root,directory+'/state.json')))continue;
  const prior=read(root,directory+'/state.json');if(prior.sourceSha256!==sourceSha256)continue;
  if(!captureTools.every(tool=>prior.dependencies?.some(d=>d.path===tool&&d.sha256===dependencies.find(e=>e.path===tool)?.sha256)))continue;
  for(let attempt=0;attempt<2;attempt++){
   const file=directory+'/capture-'+attempt+'.json',configFile=directory+'/capture-config-'+attempt+'.json';
   if(!fs.existsSync(child(root,file))||!fs.existsSync(child(root,configFile)))continue;
   const config=read(root,configFile);if(JSON.stringify(captureOnly(config))!==expected)continue;
   const capture=read(root,file);if(capture.result!=='captured-not-scored'||capture.sourceSha256!==sourceSha256||capture.errors?.length!==0)continue;
   verifyEvidence(root,captureFiles(capture));
   return {capture,config,record:{capture:evidence(root,file),configuration:evidence(root,configFile),stage:'capture-only',reviewReused:false}};
  }
 }
 return null;
}

// A new style is still authored and visually judged. This driver owns every
// repeatable step between source and that judgment; it cannot publish/package.
export function prototypeIdentity(root,configFile){
 const cfg=read(root,configFile);
 need(cfg.schemaVersion===1&&/^docs\/production\/runs\/[a-z0-9-]+$/.test(cfg.runDirectory),'Use a production campaign directory');
 need(/^\.webart\/prototypes\/[a-z0-9-]+$/.test(cfg.directory),'Use an isolated prototype directory');
 const entry=template(loadCollection(root),cfg.id);need(entry.id!=='001','The benchmark is frozen');
 const admission=referencePreflight(root,cfg.referenceReview,cfg.calibrationReview),prior=read(root,cfg.directory+'/reference-admission.json');
 need(prior.id===cfg.id&&prior.referenceReview.sha256===admission.referenceReview.sha256&&prior.calibrationReview.sha256===admission.calibrationReview.sha256,'Reference admission changed');
 const plan=read(root,cfg.plan),sourceSha256=fingerprint({...entry,manifest:cfg.directory+'/manifest.json'},root);
 need(plan.id===cfg.id,'Plan identity mismatch');validateCapturePlan(plan.prototypeCapture,{local:true});validateVisualContract(plan.visualContract,plan.coreSignatures);validateContent(plan.content,plan.requiredContent);
 need(JSON.stringify(read(root,cfg.directory+'/src/content.json'))===JSON.stringify(plan.content),'Source text differs from the static plan');
 assertNewPrototypeSource(root,sourceSha256);
 const dependencies=[configFile,cfg.plan,cfg.referenceReview,cfg.calibrationReview,plan.referenceCapture.output+'/capture.json',...['capture-production.mjs','production/device-metrics.mjs','production/native-scroll.mjs','production/visual-contract.mjs','production/evidence.mjs','production/prompts/REVIEW_PAIR.md'].map(p=>p.startsWith('production/prompts/')?'docs/'+p:'scripts/'+p)].map(file=>evidence(root,file));
 const identity=hash(JSON.stringify({sourceSha256,dependencies}));
 return {cfg,entry,plan,sourceSha256,dependencies,identity,directory:cfg.runDirectory+'/prototype-'+cfg.id+'-'+identity.slice(0,16)};
}
export async function runPrototype(configFile,{root=ROOT,check=false,services={},onProgress=()=>{}}={}){
 const locked=prototypeIdentity(root,configFile),{cfg,entry,plan,sourceSha256,identity,directory,dependencies}=locked;
 if(check)return {status:'ready-for-prototype-workflow',id:cfg.id,sourceSha256,identity,modelCodeGenerationCalls:0,packageAuthorized:false};
 fs.mkdirSync(child(root,directory),{recursive:true});
 const stateFile=directory+'/state.json';
 let state=fs.existsSync(child(root,stateFile))?read(root,stateFile):{schemaVersion:1,id:cfg.id,identity,sourceSha256,dependencies,createdAt:new Date().toISOString(),stages:[],captures:[],reviews:[],modelCodeGenerationCalls:0,packageAuthorized:false};
 need(state.identity===identity&&state.sourceSha256===sourceSha256,'Workflow identity changed');
 const save=(file,value)=>fs.writeFileSync(child(root,directory+'/'+file),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 const persist=(status,extra={})=>{state={...state,...extra,status,updatedAt:new Date().toISOString()};if(status!=='awaiting-review')delete state.pendingReview;if(status!=='failed')delete state.failure;state.stages.push({status,at:state.updatedAt});fs.writeFileSync(child(root,stateFile),JSON.stringify(state,null,2)+'\n');onProgress({id:cfg.id,status,stateFile,...extra})};
 const record=(field,event)=>{(state[field]??=[]).push(event);state.updatedAt=new Date().toISOString();fs.writeFileSync(child(root,stateFile),JSON.stringify(state,null,2)+'\n')};
 let host;
 try{
  const evaluator=read(root,cfg.calibrationReview),client=workflowReviewClient({root,runDirectory:cfg.runDirectory,evaluator,client:services.client,onProgress,onUsage:event=>record('usage',event),onReuse:event=>record('reviewReuses',event)});
  need(!state.execution||state.execution===(client.execution??'controlled-fixture'),'Saved workflow review mode changed');
  state.execution=client.execution??'controlled-fixture';if(client.directory)state.reviewDirectory=path.isAbsolute(client.directory)?path.relative(root,client.directory).replaceAll('\\','/'):client.directory;
  // Rebuild before every resumed step: dist is not part of the source manifest.
  if(!services.buildProject&&!fs.existsSync(child(root,cfg.directory+'/node_modules/vite/bin/vite.js'))){
   persist('preparing-dependencies');
   await command(process.env.WEBART_POWERSHELL??'pwsh.exe',['-NoProfile','-Command','& npm.cmd ci --ignore-scripts --no-audit --no-fund; exit $LASTEXITCODE'],{cwd:child(root,cfg.directory),timeout:180000});
   need(fingerprint({...entry,manifest:cfg.directory+'/manifest.json'},root)===sourceSha256,'Dependency preparation changed source');
  }
  await (services.buildProject??buildProject)({root,directory:cfg.directory});
  need(fingerprint({...entry,manifest:cfg.directory+'/manifest.json'},root)===sourceSha256,'Build changed source');
  const reference=read(root,plan.referenceCapture.output+'/capture.json'),referenceReview=read(root,cfg.referenceReview);
  need(reference.result==='captured-not-scored'&&reference.errors?.length===0,'Reference capture is incomplete');verifyEvidence(root,captureFiles(reference));
  need(JSON.stringify(reference.states)===JSON.stringify(referenceReview.states),'Reference capture is not the approved reference state set');
  const cohort=loadCohort(root),negative=cohort.find(c=>c.id===(plan.comparison?.negativeId??cfg.id));need(negative,'Missing adjacent negative');
  for(let attempt=0;attempt<2;attempt++){
   const captureFile=directory+'/capture-'+attempt+'.json',reviewFile=directory+'/review-'+attempt+'.json';
   let capture;
   if(fs.existsSync(child(root,captureFile))){
    capture=read(root,captureFile);need(capture.sourceSha256===sourceSha256&&capture.result==='captured-not-scored'&&capture.errors?.length===0,'Saved capture cannot be reused');verifyEvidence(root,captureFiles(capture));assertVisualCapture(capture,plan.visualContract);
   }else{
    const reusable=attempt===0?reusablePrototypeCapture(root,{cfg,sourceSha256,plan,dependencies,exclude:directory}):null;
    if(reusable){
     assertVisualCapture(reusable.capture,plan.visualContract);save('capture-'+attempt+'.json',reusable.capture);save('capture-config-'+attempt+'.json',reusable.config);capture=reusable.capture;
     state.captures.push({...evidence(root,captureFile),reusedFrom:reusable.record});persist('capture-reused',{attempt});
    }else{
    persist('capturing',{attempt});
    host??=await serveDirectory(child(root,cfg.directory+'/dist'));
    const endpoint=await (services.browserEndpoint??browserEndpoint)({root});
    const captureCfg={...plan.prototypeCapture,url:host.url,manifest:cfg.directory+'/manifest.json',slug:entry.slug,visualContract:plan.visualContract,output:'docs/evidence/production/'+path.posix.basename(directory)+'/attempt-'+attempt};
    const captured=await (services.runCapture??runCapture)({root,endpoint,cfg:captureCfg,filename:directory+'/capture-config-'+attempt+'.json'});
    need(captured.sourceSha256===sourceSha256,'Capture source changed');verifyEvidence(root,dependencies);assertVisualCapture(captured,plan.visualContract);verifyEvidence(root,captureFiles(captured));save('capture-'+attempt+'.json',captured);capture=captured;
    state.captures.push(evidence(root,captureFile));
    }
   }
   let verdict;
   if(fs.existsSync(child(root,reviewFile))){
    verdict=read(root,reviewFile);
    need(verdict.reviewer?.id===evaluator.reviewer.id&&verdict.reviewer?.calibrationRunId===evaluator.runId&&verdict.sourceSha256===sourceSha256,'Saved review identity changed');
    verifyEvidence(root,verdict.states.flatMap(s=>s.evidence));
    need(verdict.states.every(s=>capture.states.some(c=>c.viewport===s.viewport&&c.state===s.state&&JSON.stringify(c.evidence)===JSON.stringify(s.evidence))),'Saved review does not describe this capture');
   }else{
    persist('reviewing',{attempt});
    verdict=await (services.review??review)({root,client,cohort:[cohort[0],negative],evaluator,phase:'prototype',reference,candidate:capture,expectedSignatures:plan.coreSignatures,visualContract:plan.visualContract,save,filename:'review-'+attempt+'.json'});
    verifyEvidence(root,dependencies);need(fingerprint({...entry,manifest:cfg.directory+'/manifest.json'},root)===sourceSha256,'Source changed during review');
    state.reviews.push(evidence(root,reviewFile));
   }
   assertCalibratedReviewer(root,evaluator,verdict,'prototype-review');
   if(verdict.decision==='reject'){
    recordRejectedSource(root,cfg.id,reviewFile);persist('rejected',{nextAction:'revise-static-plan-and-create-new-candidate',fixTasks:verdict.fixTasks});return state;
   }
   if(verdict.decision==='admit'){
    validateReview(root,verdict,loadQualityPolicy(root).calibration,'prototype',sourceSha256);validateVisualReview(root,verdict,plan.visualContract);
    persist('prototype-admitted',{nextAction:'full-implementation-and-full-qa',review:evidence(root,reviewFile),capture:evidence(root,captureFile)});return state;
   }
   need(verdict.decision==='evidence-needed'&&verdict.nextAction==='recapture','Unsupported review action');
   if(attempt===1){persist('evidence-incomplete',{nextAction:'revise-capture-plan',fixTasks:verdict.fixTasks});return state}
   persist('recapturing',{attempt:1,fixTasks:verdict.fixTasks});
  }
 }catch(error){
  if(error.code==='review-pending'){persist('awaiting-review',{pendingReview:error.details,nextAction:'submit-actual-review-and-rerun-same-command'});return state}
  persist('failed',{failure:{code:error.code??'prototype-workflow-failed',message:error.message,...(error.details?.output?{diagnostic:error.details.output}:{})},nextAction:'repair-recorded-failure'});throw error;
 }finally{if(host)await new Promise(resolve=>host.server.close(resolve))}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await runPrototype(process.argv[2],{check:process.argv.includes('--check'),onProgress:event=>console.log(JSON.stringify(event))});console.log(JSON.stringify(result,null,2));if(['failed','rejected','evidence-incomplete'].includes(result.status))process.exitCode=1}catch(error){console.error(error.message);process.exitCode=1}
}
