import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,child} from './collection.mjs';
import {ProductionRun,validateConfig,planStatus} from './production/runner.mjs';
import {loadCohort} from './production/evidence.mjs';
import {availableAssets} from './production/project.mjs';
import {SessionReviewClient} from './production/session-review.mjs';
import {CachedCodexCliReviewClient} from './production/cached-cli-review.mjs';
import {inspectCliRuntime,resolveCalibratedCliRuntime} from './production/cli-runtime.mjs';
import {verifyEvidence} from './quality-gate.mjs';
import {publishProduction} from './production-publish.mjs';

export function productionReviewSelection(args,{root=ROOT,now=Date.now()}={}){
 const [configPath,...flags]=args;if(!configPath||configPath.startsWith('--'))throw Error('Usage: node scripts/production-run.mjs <config.json> [--check | --session | --cli] [--model <cli-model>] [--cli-executable <absolute-codex.exe> | --runtime-calibration <calibration-review.json>] [--resume <run.json>]');
 let mode='api',selected=false,resumeFile,requestedModel,cliExecutable,runtimeCalibration,publish=false,queueOnly=false;
 const seen=new Set();
 for(let i=0;i<flags.length;i++){
  const flag=flags[i];if(seen.has(flag))throw Error('Duplicate production option: '+flag);seen.add(flag);
  if(['--check','--session','--cli'].includes(flag)){if(selected)throw Error('Choose one production review mode');mode=flag.slice(2);selected=true}
  else if(['--resume','--model','--cli-executable','--runtime-calibration'].includes(flag)){const value=flags[++i];if(!value||value.startsWith('--'))throw Error('Missing value for '+flag);if(flag==='--resume')resumeFile=value;else if(flag==='--model')requestedModel=value;else if(flag==='--cli-executable')cliExecutable=value;else runtimeCalibration=value}
  else if(flag==='--publish')publish=true;
  else if(flag==='--queue-only')queueOnly=true;
  else throw Error('Unknown production option: '+flag);
 }
 if(requestedModel!==undefined&&(mode!=='cli'||!/^[a-zA-Z0-9._:-]{1,100}$/.test(requestedModel)))throw Error('--model requires --cli and an explicit valid model identifier');
 if(queueOnly&&mode!=='session')throw Error('--queue-only requires --session');
 if(resumeFile&&!['session','cli'].includes(mode))throw Error('Resume requires --session or --cli and an existing run.json');
 if(cliExecutable!==undefined||runtimeCalibration!==undefined){
  if(mode!=='cli')throw Error('CLI runtime selection requires --cli');
  if(cliExecutable!==undefined&&runtimeCalibration!==undefined)throw Error('Choose one CLI runtime source');
  if(resumeFile)throw Error('CLI resume restores its original calibration runtime; runtime overrides are not permitted');
 }
 let directory=mode==='cli'?'docs/production/runs/cli-'+now+'/cli-review':mode==='session'?'docs/production/runs/session-'+now+'/review-queue':undefined;
 if(resumeFile){
  if(!/^docs\/production\/runs\/api-[a-z0-9-]+\/run\.json$/.test(resumeFile))throw Error('Resume requires an actual production run.json');
  const prior=JSON.parse(fs.readFileSync(child(root,resumeFile),'utf8')),execution=mode==='cli'?'fresh-codex-cli-evidence-review':'current-conversation-evidence-review';
  if(prior.execution!==execution)throw Error('Resume review mode differs from the recorded execution');
  if(resumeFile!=='docs/production/runs/'+prior.runId+'/run.json')throw Error('Resume run identity differs from its recorded path');
  if(mode==='cli'){
   if(typeof prior.reviewDirectory!=='string'||!/^docs\/production\/runs\/[a-z0-9-]+\/cli-review$/.test(prior.reviewDirectory))throw Error('Interrupted CLI run has no recorded CLI review directory');
   directory=prior.reviewDirectory;
  }else{
   const calibrationFile=child(root,resumeFile.replace(/run\.json$/,'calibration-review.json'));
   if(fs.existsSync(calibrationFile)){const calibration=JSON.parse(fs.readFileSync(calibrationFile,'utf8'));if(!calibration.reviewReceipt?.path)throw Error('Interrupted run has no verifiable session calibration');directory=path.posix.dirname(calibration.reviewReceipt.path)}
   else{if(prior.status!=='awaiting-review'||prior.pendingReview?.role!=='calibration')throw Error('Interrupted calibration has no immutable pending packet');directory=path.posix.dirname(prior.pendingReview.requestFile)}
  }
 }
 return {configPath,mode,resumeFile,requestedModel,cliExecutable,runtimeCalibration,directory,publish,queueOnly};
}

// Selecting a previous calibration selects only its runtime. Every fresh
// ProductionRun still performs its own calibration; no judgment is reused.
export function productionReviewClient({root=ROOT,selection,maxRequests,onProgress=()=>{},onUsage=()=>{},onReuse=()=>{},runtimeVersionProbe}){
 const {mode,directory,resumeFile,requestedModel,queueOnly,cliExecutable,runtimeCalibration}=selection;
 if(mode==='session')return new SessionReviewClient({root,directory,model:'current-conversation',maxRequests,onPending:onProgress,resume:Boolean(resumeFile),defer:queueOnly});
 if(mode!=='cli')return undefined;
 let runtime;
 if(resumeFile){
  if(cliExecutable!==undefined||runtimeCalibration!==undefined)throw Error('CLI resume runtime overrides are not permitted');
  const calibrationFile=resumeFile.replace(/run\.json$/,'calibration-review.json');
  if(!fs.existsSync(child(root,calibrationFile)))throw Error('CLI resume has no completed original calibration; no runtime was selected or review launched');
  const calibration=JSON.parse(fs.readFileSync(child(root,calibrationFile),'utf8')),prior=JSON.parse(fs.readFileSync(child(root,resumeFile),'utf8'));
  if(calibration.runId!==prior.runId||prior.requestedModel!==(requestedModel??null)||(calibration.reviewer?.requestedModel??null)!==(requestedModel??null))throw Error('CLI resume calibration identity or requested model differs from the original run');
  if(calibration.reviewer?.mode!=='evidence-only-fresh-codex-cli'||!calibration.reviewReceipt?.path)throw Error('CLI resume has no completed original calibration; no runtime was selected or review launched');
  verifyEvidence(root,[calibration.reviewReceipt]);
  const receipt=JSON.parse(fs.readFileSync(child(root,calibration.reviewReceipt.path),'utf8'));
  if(!receipt.request?.path)throw Error('CLI resume calibration has no original execution request');
  verifyEvidence(root,[receipt.request]);
  if(path.posix.dirname(path.posix.dirname(receipt.request.path))!==directory)throw Error('CLI resume calibration belongs to another review directory');
  runtime=resolveCalibratedCliRuntime({root,calibration,versionProbe:runtimeVersionProbe});
 }else if(runtimeCalibration!==undefined)runtime=resolveCalibratedCliRuntime({root,calibration:runtimeCalibration,versionProbe:runtimeVersionProbe});
 else if(cliExecutable!==undefined)runtime=inspectCliRuntime({root,executable:cliExecutable,versionProbe:runtimeVersionProbe});
 return new CachedCodexCliReviewClient({root,directory,...(runtime?{executable:runtime.executable}:{}),model:requestedModel,maxRequests,onPending:onProgress,onUsage,onReuse});
}

export async function main(args=process.argv.slice(2)){
 const selection=productionReviewSelection(args),{configPath,mode,resumeFile,requestedModel,publish}=selection;
 const suppliedConfig=JSON.parse(fs.readFileSync(path.resolve(configPath),'utf8'));
 const config=validateConfig(mode==='cli'?{...suppliedConfig,model:requestedModel??'codex-account-default'}:suppliedConfig);
 if(mode==='check'){const plans=planStatus(ROOT).filter(p=>config.ids.includes(p.id));if(!plans.every(p=>p.ready))process.exitCode=1;return {result:plans.every(p=>p.ready)?'ready-for-configured-execution':'blocked-plan-not-ready',mode:'configuration-driven',productionMode:'frozen-renderer',codeGenerationCalls:0,plans,cohort:loadCohort(ROOT).length,licensedAssets:availableAssets(ROOT).length,keyConfigured:Boolean(process.env.WEBART_OPENAI_API_KEY),liveGenerationRun:false,liveReviewRun:false}}
 const onProgress=event=>console.log(JSON.stringify(event));
 let run;
 const onUsage=event=>{if(run){run.report.usage.push(event);run.persist()}onProgress({stage:'cli-review-usage',...event})};
 const onReuse=event=>{if(run){(run.report.reviewReuses??=[]).push(event);run.persist()}onProgress({stage:'cli-review-reused',...event})};
 const client=productionReviewClient({root:ROOT,selection,maxRequests:config.maxRequests,onProgress,onUsage,onReuse});
 run=new ProductionRun({config,apiKey:process.env.WEBART_OPENAI_API_KEY,onProgress,services:client?{client}:{},resumeFile});const result=await run.execute();if(!['ready-for-user-review','awaiting-review'].includes(result.status))process.exitCode=1;
 if(result.status==='ready-for-user-review'&&publish)result.publication=await publishProduction({runFile:run.dir+'/run.json'});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{console.log(JSON.stringify(await main(),null,2))}catch(error){console.error(error.message);process.exitCode=1}}
