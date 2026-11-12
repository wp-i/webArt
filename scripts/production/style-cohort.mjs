import fs from 'node:fs';
import {ROOT,child,loadCollection,fingerprint} from '../collection.mjs';
import {getShowcase} from '../showcase.mjs';
import {verifyEvidence} from '../quality-gate.mjs';
import {loadRenderer} from './renderers.mjs';
import {loadCohort} from './evidence.mjs';
import {hash,ProductionError} from './api.mjs';

const need=(ok,message)=>{if(!ok)throw new ProductionError('style-cohort-invalid',message)};
const digestPattern=/^[a-f0-9]{64}$/;
function readCapture(root,file) {
  const bytes=fs.readFileSync(child(root,file));
  return {report:JSON.parse(bytes),capture:{path:file,sha256:hash(bytes)}};
}
function selectStates(root,states,{runtime=false}={}) {
  need(Array.isArray(states),'Style comparison is missing actual states');
  const selected=[];
  for(const viewport of ['desktop','mobile'])for(const state of ['opening','transition','middle','ending']) {
    const matches=states.filter(frame=>frame.viewport===viewport&&frame.state===state);
    need(matches.length===1,`Style comparison needs exactly one ${viewport}/${state} state`);
    const frame=matches[0],evidence=runtime?[frame.evidence]:frame.evidence??[frame];
    if(runtime)need(frame.width===(viewport==='desktop'?1440:390),'Style comparison viewport does not match its label');
    verifyEvidence(root,evidence);
    selected.push(...evidence.map(({path,sha256})=>({viewport,state,path,sha256})));
  }
  return selected;
}

// Calibration keeps the user's frozen quality labels. Only the style gate
// resolves the versions currently shown, with earlier same-run deliveries
// replacing an older presentation of the same design.
export function loadStyleCohort(root=ROOT,{candidateId,frozenCohort,deliveries=[],services={}}={}) {
  need(/^\d{3}$/.test(candidateId??''),'Style comparison needs a candidate identity');
  const shown=(services.getShowcase??getShowcase)(root),collection=loadCollection(root);
  need(Array.isArray(shown)&&new Set(shown.map(item=>item.id)).size===shown.length,'Style showcase identities are ambiguous');
  need(Array.isArray(deliveries),'Style deliveries are invalid');
  const earlier=deliveries.filter(delivery=>delivery.id!==candidateId);
  need(new Set(earlier.map(delivery=>delivery.id)).size===earlier.length,'Style deliveries contain duplicate identities');
  const overlays=new Map(earlier.map(delivery=>[delivery.id,delivery]));
  const identities=[...shown.filter(item=>item.id!==candidateId),...earlier.filter(delivery=>!shown.some(item=>item.id===delivery.id))];
  let frozenCapture,frozen;
  return identities.map(item=>{
    const base=collection.templates.find(entry=>entry.id===item.id);
    need(base&&item.id!==candidateId,'Style comparison has an unknown identity');
    const delivery=overlays.get(item.id);
    if(delivery) {
      need(digestPattern.test(delivery.sourceSha256??'')&&/^\.webart\/prototypes\/[a-z0-9-]+$/.test(delivery.directory??''),'Earlier style delivery is missing its source identity');
      need(fingerprint({manifest:delivery.directory+'/manifest.json',slug:base.slug},root)===delivery.sourceSha256,'Earlier style delivery source changed');
      if(delivery.rendererId) {
        const renderer=(services.loadRenderer??loadRenderer)(root,delivery.rendererId);
        need(renderer.definition.templateId===item.id&&renderer.definition.sourceSha256===delivery.sourceSha256&&fingerprint(renderer.entry,root)===delivery.sourceSha256,'Earlier style delivery renderer source mismatch');
      }
      const {report,capture}=readCapture(root,delivery.capturePath);
      need(report.result==='captured-not-scored'&&report.sourceSha256===delivery.sourceSha256&&report.errors?.length===0,'Earlier style delivery capture source mismatch or failure');
      return {id:item.id,sourceSha256:delivery.sourceSha256,rendererId:delivery.rendererId??null,origin:'earlier-delivery',capture,states:selectStates(root,report.states)};
    }
    if(item.rendererId) {
      const renderer=(services.loadRenderer??loadRenderer)(root,item.rendererId),definition=renderer.definition;
      need(definition.id===item.rendererId&&definition.templateId===item.id&&digestPattern.test(item.sourceSha256??'')&&definition.sourceSha256===item.sourceSha256&&fingerprint(renderer.entry,root)===item.sourceSha256,'Current style renderer source mismatch');
      verifyEvidence(root,[definition.qualification]);
      const handoff=JSON.parse(fs.readFileSync(child(root,definition.qualification.path),'utf8'));
      need(handoff.id===item.id&&handoff.trialApproval?.sourceSha256===item.sourceSha256,'Current style qualification source mismatch');
      const {report,capture}=readCapture(root,handoff.trialApproval.runtime);
      need(report.mode==='full'&&report.result==='passed-observable-checks'&&report.sourceSha256===item.sourceSha256&&report.errors?.length===0,'Current style runtime source mismatch or failure');
      return {id:item.id,sourceSha256:item.sourceSha256,rendererId:item.rendererId,origin:'current-showcase',capture,states:selectStates(root,report.responsive,{runtime:true})};
    }
    frozen??=frozenCohort??loadCohort(root);
    const sample=frozen.find(entry=>entry.id===item.id),sourceSha256=fingerprint(base,root);
    need(sample&&sample.sourceSha256===sourceSha256&&(!item.sourceSha256||item.sourceSha256===sourceSha256),'Unrevised style source no longer matches the frozen evidence');
    frozenCapture??=readCapture(root,'docs/evidence/quality-calibration/capture.json');
    const page=frozenCapture.report.pages?.find(entry=>entry.id===item.id);
    need(frozenCapture.report.result==='captured-not-scored'&&page?.sourceSha256===sourceSha256,'Frozen style capture source mismatch');
    const states=selectStates(root,sample.states);
    need(states.every(frame=>page.evidence.some(e=>e.path===frame.path&&e.sha256===frame.sha256)),'Frozen style states do not belong to their source capture');
    return {id:item.id,sourceSha256,rendererId:null,origin:'frozen-showcase',capture:frozenCapture.capture,states};
  });
}
