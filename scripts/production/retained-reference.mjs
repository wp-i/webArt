import fs from 'node:fs';
import path from 'node:path';
import {child} from '../collection.mjs';
import {verifyEvidence} from '../quality-gate.mjs';
import {referencePreflight} from '../production-flow.mjs';
import {ProductionError} from './api.mjs';
const need=(ok,message)=>{if(!ok)throw new ProductionError('retained-reference-invalid',message)};
export function validateRetainedReferenceConfig(cfg){
 const r=cfg.retainedEvidence;
 need(r&&Object.keys(r).sort().join(',')==='calibration,capture,review','Retained reference must bind capture, actual review and calibration');
 for(const item of Object.values(r))need(item&&typeof item.path==='string'&&item.path.startsWith('docs/')&&/^[a-f0-9]{64}$/.test(item.sha256??'')&&Object.keys(item).sort().join(',')==='path,sha256','Retained reference is missing an immutable document fingerprint');
 need(cfg.output===path.posix.dirname(r.capture.path)&&path.posix.basename(r.capture.path)==='capture.json','Retained reference output must identify its actual capture');
 return cfg;
}
export function loadRetainedReference(root,cfg){
 validateRetainedReferenceConfig(cfg);const r=cfg.retainedEvidence;verifyEvidence(root,Object.values(r));
 const read=file=>JSON.parse(fs.readFileSync(child(root,file),'utf8')),capture=read(r.capture.path),review=read(r.review.path);
 referencePreflight(root,r.review.path,r.calibration.path);
 need(capture.result==='captured-not-scored'&&capture.sourceSha256===null&&capture.errors?.length===0&&capture.states?.length===8,'Retained reference capture is not complete');
 need(new URL(capture.url).href===new URL(cfg.url).href,'Retained reference source URL differs from the bound capture');
 need(JSON.stringify(capture.states)===JSON.stringify(review.states),'Retained reference capture and reviewed states differ');
 const frames=[...capture.states.flatMap(s=>s.evidence),...capture.motion.flatMap(m=>m.evidence)];verifyEvidence(root,frames);
 const keys=new Set(frames.map(e=>e.path+':'+e.sha256));
 need(review.motion.every(m=>m.evidence.every(e=>keys.has(e.path+':'+e.sha256))),'Retained reference motion is not from the bound capture');
 return capture;
}
