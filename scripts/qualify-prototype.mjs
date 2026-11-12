import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,child,template,loadCollection,fingerprint,manifestFiles} from './collection.mjs';
import {referencePreflight,beginCandidate} from './production-flow.mjs';
import {ProductionRun,validateCapturePlan} from './production/runner.mjs';
import {verifyEvidence,loadQualityPolicy,validateReview,assertCalibratedReviewer} from './quality-gate.mjs';
import {validateVisualContract,validateVisualReview,assertVisualCapture} from './production/visual-contract.mjs';
import {validateRenderingPlan} from './production/rendering.mjs';
import {validatePerformancePlan} from './production/performance.mjs';
import {validateContent} from './production/content.mjs';
import {workflowReviewClient} from './prototype-run.mjs';
import {loadCohort} from './production/evidence.mjs';
import {resolveFonts,buildProject,serveDirectory} from './production/project.mjs';
import {validateAsset} from './production/assets.mjs';
import {inspectStaticContract} from './production/browser.mjs';
import {browserEndpoint,command} from './production/process.mjs';
import {hash,ProductionError} from './production/api.mjs';

const read=(root,file)=>JSON.parse(fs.readFileSync(child(root,file),'utf8'));
const need=(ok,message)=>{if(!ok)throw new ProductionError('first-style-qualification-invalid',message)};

export function qualificationInput(root,configFile){
 const cfg=read(root,configFile),workflow=read(root,cfg.prototypeWorkflow),plan=read(root,cfg.plan),base=template(loadCollection(root),cfg.id);
 need(cfg.schemaVersion===1&&plan.id===cfg.id&&workflow.id===cfg.id&&cfg.id!=='001','Qualification identity mismatch');
 const source={...base,manifest:workflow.directory+'/manifest.json'},sourceSha256=fingerprint(source,root),prototype=read(root,cfg.prototypeCapture),verdict=read(root,cfg.prototypeReview);
 const admission=referencePreflight(root,workflow.referenceReview,workflow.calibrationReview),evaluator=read(root,workflow.calibrationReview),{calibration}=loadQualityPolicy(root);
 assertCalibratedReviewer(root,evaluator,verdict,'prototype-review');
 validateReview(root,verdict,calibration,'prototype',sourceSha256);validateVisualReview(root,verdict,plan.visualContract);assertVisualCapture(prototype,plan.visualContract);
 need(prototype.sourceSha256===sourceSha256&&JSON.stringify(prototype.states)===JSON.stringify(verdict.states),'Prototype capture changed');
 validateCapturePlan(plan.referenceCapture,{root});validateCapturePlan(plan.prototypeCapture,{local:true});validateVisualContract(plan.visualContract,plan.coreSignatures);validateContent(plan.content,plan.requiredContent);resolveFonts(plan.fonts,root);validateRenderingPlan(plan.rendering);validatePerformancePlan(plan.performance);
 need(plan.calibrationRevision===calibration.revision&&plan.approval?.record&&plan.assetPlan.heroRoleLocked&&plan.assetPlan.rightsVerified&&plan.assetPlan.replacementCompared&&plan.assetPlan.lowCostIsNotMerit===true,'Missing approved first-style static plan');
 verifyEvidence(root,plan.assetPlan.evidence);
 need(plan.assets?.length<=6&&plan.assets?.length>0&&plan.controls?.length&&plan.contentBudget.totalCharacters<=900&&plan.contentBudget.paragraphCharacters<=120,'Invalid source/media/control budget');
 for(const a of plan.assets){need(a.assetId&&a.creator&&a.source&&a.license&&a.distributionBasis&&a.verified&&a.desktopCrop&&a.mobileCrop,'Incomplete asset role/rights');verifyEvidence(root,[{path:a.localPath,sha256:a.sha256}]);validateAsset(fs.readFileSync(child(root,a.localPath)),a.localPath)}
 need(plan.qa.images>=0&&['desktop','wide','tablet','mobile','narrow'].every(v=>plan.qa.composition?.[v]?.length>=30),'Missing five-width expectations');
 need(JSON.stringify(read(root,workflow.directory+'/src/content.json'))===JSON.stringify(plan.content),'Source text changed');
 const inputs=[configFile,cfg.plan,cfg.prototypeWorkflow,cfg.prototypeReview,cfg.prototypeCapture,admission.referenceReview.path,admission.calibrationReview.path].map(file=>({path:file,sha256:hash(fs.readFileSync(child(root,file)))}));
 return {cfg,workflow,plan,base,source,sourceSha256,prototype,verdict,evaluator,inputs,identity:hash(JSON.stringify({sourceSha256,inputs}))};
}

export async function qualifyPrototype(configFile,{root=ROOT,check=false,services={},onProgress=()=>{}}={}){
 const input=qualificationInput(root,configFile),{cfg,workflow,plan,base,source,sourceSha256,prototype,evaluator,inputs,identity}=input;
 if(check)return {status:'ready-for-first-style-full-qualification',id:cfg.id,sourceSha256,identity,codeGenerationCalls:0};
 let pointer=fs.existsSync(child(root,cfg.pointer))?read(root,cfg.pointer):null;
 need(!pointer||pointer.identity===identity,'Qualification source/plan changed; use a new config/pointer');
 if(pointer){const prior=read(root,pointer.runFile);if(prior.status==='ready-for-user-review'){verifyEvidence(root,inputs);return prior}}
 let run;
 const record=(field,event)=>{if(run){(run.report[field]??=[]).push(event);run.persist()}};
 const client=workflowReviewClient({root,runDirectory:workflow.runDirectory,evaluator,client:services.client,onProgress,onUsage:event=>record('usage',event),onReuse:event=>record('reviewReuses',event)});
 run=new ProductionRun({root,config:{ids:[cfg.id],model:client.model??'current-conversation',maxRequests:32},services:{loadPlan:()=>plan,client},onProgress,resumeFile:pointer?.runFile});
 run.report.productionMode='first-style-qualification';run.report.qualificationContinuationOf=workflow.runDirectory;run.report.inputIdentity=identity;
 run.report.scope='Deterministic qualification of an already authored and visually admitted prototype. New-style authoring and actual visual judgments are not zero-LLM.';
 if(!pointer){pointer={identity,inputs,runFile:run.dir+'/run.json'};fs.writeFileSync(child(root,cfg.pointer),JSON.stringify(pointer,null,2)+'\n',{flag:'wx'})}
 const id=cfg.id,directory='.webart/prototypes/'+run.id+'-'+id,reviewFile=id+'-prototype-0-0.json';let host;
 try{
  for(const [from,to] of [[workflow.calibrationReview,'calibration-review.json'],[workflow.referenceReview,id+'-reference.json'],[cfg.prototypeReview,reviewFile]]){
   const target=run.dir+'/'+to;if(fs.existsSync(child(root,target)))need(hash(fs.readFileSync(child(root,from)))===hash(fs.readFileSync(child(root,target))),'Saved qualification review changed');else fs.copyFileSync(child(root,from),child(root,target),fs.constants.COPYFILE_EXCL);
  }
  if(!fs.existsSync(child(root,directory))){
   beginCandidate(root,id,directory,run.dir+'/'+id+'-reference.json',run.dir+'/calibration-review.json');
   for(const file of manifestFiles(source,root).files){const target=child(root,directory+'/'+file.archive);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file.source,target,fs.constants.COPYFILE_EXCL)}
   const manifest=read(root,source.manifest);manifest.files=manifest.files.map(f=>({...f,source:directory+'/'+f.archive}));fs.writeFileSync(child(root,directory+'/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
   for(const [from,to] of [[plan.brief,'brief.md'],[plan.referenceMap,'reference-map.md']])fs.copyFileSync(child(root,from),child(root,directory+'/'+to));
  }
  need(fingerprint({...base,manifest:directory+'/manifest.json'},root)===sourceSha256,'Qualification copy differs from admitted source');
  if(!fs.existsSync(child(root,directory+'/node_modules/vite/bin/vite.js')))await command(process.env.WEBART_POWERSHELL??'pwsh.exe',['-NoProfile','-Command','& npm.cmd ci --ignore-scripts --no-audit --no-fund; exit $LASTEXITCODE'],{cwd:child(root,directory),timeout:180000});
  await buildProject({root,directory});host=await serveDirectory(child(root,directory+'/dist'));
  const endpoint=await browserEndpoint({root});
  const staticCheck=await inspectStaticContract({root,endpoint,url:host.url,plan,output:run.dir+'/'+id+'-static-contract.json'});need(staticCheck.result==='passed-static-contract','Static content or controls failed; revise the static plan/source');
  const capturePath=run.evidenceDir+'/'+id+'-prototype-0-0/capture.json';fs.mkdirSync(path.dirname(child(root,capturePath)),{recursive:true});if(!fs.existsSync(child(root,capturePath)))fs.writeFileSync(child(root,capturePath),JSON.stringify(prototype,null,2)+'\n',{flag:'wx'});
  await run.qualifyCandidate({plan,entry:base,project:{manifest:directory+'/manifest.json'},prototype,cohort:loadCohort(root),host,endpoint,directory,reviewFile});
  run.report.status=run.report.deliveries.length===1?'ready-for-user-review':'stopped-for-plan-revision';
 }catch(error){
  if(error.code==='review-pending'){run.report.status='awaiting-review';run.report.pendingReview=error.details}else{run.report.status='failed';run.report.failure={code:error.code??'qualification-failed',message:error.message,...(error.details?.output?{diagnostic:error.details.output}:{})}}
 }finally{if(host)await new Promise(resolve=>host.server.close(resolve));verifyEvidence(root,inputs);run.report.finished=new Date().toISOString();run.persist();onProgress({status:run.report.status,runFile:pointer.runFile,pendingReview:run.report.pendingReview,failure:run.report.failure})}
 return run.report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await qualifyPrototype(process.argv[2],{check:process.argv.includes('--check'),onProgress:e=>console.log(JSON.stringify(e))});console.log(JSON.stringify({status:result.status,sourceSha256:result.sourceSha256,runId:result.runId,deliveries:result.deliveries},null,2));if(!['ready-for-first-style-full-qualification','ready-for-user-review','awaiting-review'].includes(result.status))process.exitCode=1}catch(error){console.error(error.message);process.exitCode=1}
}
