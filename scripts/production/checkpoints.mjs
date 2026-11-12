import fs from 'node:fs';
import path from 'node:path';
import {child} from '../collection.mjs';
import {verifyEvidence} from '../quality-gate.mjs';
import {hash,ProductionError} from './api.mjs';

export function engineeringBinding(root,plan,sourceSha256){
 const inputs=['scripts/qa-page.mjs','scripts/production/browser.mjs','scripts/production/device-metrics.mjs','scripts/production/native-scroll.mjs','scripts/production/native-range.mjs','scripts/production/native-galleries.mjs','scripts/production/painted-images.mjs','scripts/production/responsive.mjs','scripts/production/performance.mjs','webart.performance.json'].map(file=>({path:file,sha256:hash(fs.readFileSync(child(root,file)))}));
 return hash(JSON.stringify({sourceSha256,inputs,...Object.fromEntries(['qa','controls','prototypeCapture','rendering','performance'].map(k=>[k,plan[k]]))}));
}
export function writeEngineeringCheckpoint(root,file,{binding,sourceSha256,directory,renderingCapture}){
 const artifacts=fs.readdirSync(child(root,directory),{recursive:true}).map(p=>directory+'/'+p.replaceAll('\\','/')).filter(p=>fs.statSync(child(root,p)).isFile()).sort().map(p=>({path:p,sha256:hash(fs.readFileSync(child(root,p)))}));
 const checkpoint={schemaVersion:1,binding,sourceSha256,directory,renderingCapture:renderingCapture??null,artifacts,createdAt:new Date().toISOString()};
 verifyEvidence(root,artifacts);fs.writeFileSync(child(root,file),JSON.stringify(checkpoint,null,2)+'\n',{flag:'wx'});return checkpoint;
}
export function readEngineeringCheckpoint(root,file,{binding,sourceSha256}){
 const saved=JSON.parse(fs.readFileSync(child(root,file),'utf8'));
 if(saved.schemaVersion!==1||saved.binding!==binding||saved.sourceSha256!==sourceSha256)throw new ProductionError('stale-engineering-checkpoint','QA source, plan, policy or checking code changed; reuse is forbidden');
 verifyEvidence(root,saved.artifacts);return saved;
}
export function engineeringCheckpointFile(root,file,expected){
 if(!/^[a-f0-9]{64}$/.test(expected.binding)||!/^[a-f0-9]{64}$/.test(expected.sourceSha256))throw new ProductionError('invalid-engineering-binding','Engineering source and checking version fingerprints are required');
 if(!fs.existsSync(child(root,file)))return file;
 try{readEngineeringCheckpoint(root,file,expected);return file}
 catch(error){if(error.code!=='stale-engineering-checkpoint')throw error}
 // A checking-version change requires fresh QA. Keep the prior checkpoint and
 // every image intact; never rebind them to the new inspector or hide tampering.
 const next=file.replace(/\.json$/,'-'+expected.binding+'.json');
 if(next===file)throw new ProductionError('invalid-engineering-checkpoint','Checkpoint must use a JSON filename');
 if(fs.existsSync(child(root,next)))readEngineeringCheckpoint(root,next,expected);
 return next;
}
