import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {ROOT,loadCollection,template,fingerprint,child} from './collection.mjs';
import {loadQualityPolicy,validateCalibration,validateReview,safeFile,evaluateQuality,assertProductionQuality,evidenceReviewer,assertCalibratedReviewer} from './quality-gate.mjs';
import crypto from 'node:crypto';
import {buildQualityPacket} from './quality-packet.mjs';
import {validateVisualContract,validateVisualReview} from './production/visual-contract.mjs';
import {recordRejectedCoreModules} from './production/locked-modules.mjs';
export function qualityStatus(root=ROOT){return loadCollection(root).templates.map(entry=>({id:entry.id,title:entry.title,...evaluateQuality(root,entry,fingerprint(entry,root))}))}
export function candidateQuality(root,id,manifest,contract,phase='prototype'){
 if(!['reference','prototype'].includes(phase))throw new Error('An isolated candidate cannot package or release');
 const entry=template(loadCollection(root),id);
 if(entry.id==='001')throw new Error('The accepted benchmark cannot be replaced by a candidate');
 for(const file of [manifest,contract])if(typeof file!=='string'||!file.startsWith('.webart/prototypes/')||file.includes('..')||file.includes('\\'))throw new Error('Candidate files must remain in the private prototype directory');
 const candidate={...entry,manifest,qualityReview:contract};
 return {...assertProductionQuality(root,candidate,fingerprint(candidate,root),phase),id:entry.id,isolatedCandidate:true,inventoryChanged:false};
}
export function main(args=process.argv.slice(2),root=ROOT){
 const [command,id,extra]=args;
 if(command==='status')return qualityStatus(root);
 if(command==='packet')return buildQualityPacket(root,id);
 if(command==='calibrate'){const {calibration}=loadQualityPolicy(root);const report=JSON.parse(fs.readFileSync(path.resolve(root,id),'utf8'));validateCalibration(root,report,calibration);return {result:'calibration-matches-user-labels',samples:report.samples.length,notAestheticPrediction:true}}
 if(command==='gate'){
  const entry=template(loadCollection(root),id),source=fingerprint(entry,root),phase=extra||'prototype';if(!['reference','prototype','package','release'].includes(phase))throw new Error('Unknown production phase');
  return assertProductionQuality(root,entry,source,phase);
 }
 if(command==='gate-candidate')return candidateQuality(root,id,extra,args[3],args[4]||'prototype');
 if(command==='preflight-reference')return referencePreflight(root,id,extra);
 if(command==='begin-candidate')return beginCandidate(root,id,extra,args[3],args[4]);
 if(command==='reject-core-modules')return recordRejectedCoreModules(root,id,extra);
 if(command==='capture-current'){
  const result=spawnSync(process.execPath,[path.join(root,'scripts/capture-quality.mjs'),id,'http://127.0.0.1:4180',extra||'all'],{cwd:root,stdio:'inherit',windowsHide:true});if(result.status!==0)throw new Error('Comparison capture failed');return {result:'evidence-captured-not-scored'};
 }
 throw new Error('Usage: node scripts/production-flow.mjs status | packet <capture.json> | calibrate <report> | preflight-reference <reference-review> <calibration-review> | begin-candidate <id> <new-private-directory> <reference-review> <calibration-review> | reject-core-modules <id> <actual-rejection-report> | gate <id> [reference|prototype|package|release] | gate-candidate <id> <private-manifest> <private-contract> [reference|prototype] | capture-current <browser-ws> [id]');
}
export function referencePreflight(root,referencePath,calibrationPath){
 const {calibration,policy}=loadQualityPolicy(root),read=file=>JSON.parse(fs.readFileSync(safeFile(root,file),'utf8')),evaluator=read(calibrationPath),review=read(referencePath);
 validateCalibration(root,evaluator,calibration);
 if(evaluator.purpose!=='reviewer-calibration'||!evaluator.runId||!evaluator.reviewer?.id||!evidenceReviewer(evaluator.reviewer))throw new Error('A fresh calibrated reviewer is required before prototype work');
 if(review.reviewer?.id!==evaluator.reviewer.id||review.reviewer.calibrationRunId!==evaluator.runId)throw new Error('Reference review is not bound to its calibrated reviewer');
 assertCalibratedReviewer(root,evaluator,review,'reference-review');
 validateReview(root,review,calibration,'reference');
 if(policy.visualContractRequired){validateVisualContract(review.visualContract,review.signatureFeatures);validateVisualReview(root,review,review.visualContract)}
 const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(safeFile(root,file))).digest('hex');
 return {decision:'reference-admitted-for-prototype-only',referenceReview:{path:referencePath,sha256:hash(referencePath)},calibrationReview:{path:calibrationPath,sha256:hash(calibrationPath)},reviewerId:evaluator.reviewer.id,inventoryChanged:false,packageAuthorized:false,limitations:'Checks evidence and the recorded comparison; it does not predict visual quality or authorize full implementation.'};
}
export function beginCandidate(root,id,directory,referencePath,calibrationPath){
 const entry=template(loadCollection(root),id);
 if(entry.id==='001')throw new Error('The accepted benchmark cannot be replaced by a candidate');
 if(typeof directory!=='string'||!/^\.webart\/prototypes\/[a-z0-9-]+$/.test(directory))throw new Error('Use one new private prototype directory');
 const admission=referencePreflight(root,referencePath,calibrationPath);
 const target=child(root,directory);
 if(fs.existsSync(target))throw new Error('An existing candidate cannot be overwritten or revived');
 fs.mkdirSync(target,{recursive:true});
 const filename=directory+'/reference-admission.json';fs.writeFileSync(path.resolve(root,filename),JSON.stringify({...admission,id:entry.id,createdAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
 return {...admission,id:entry.id,admission:filename};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{console.log(JSON.stringify(main(),null,2))}catch(error){console.error(error.message);process.exitCode=1}}
