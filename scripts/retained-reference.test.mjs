import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {ROOT} from './collection.mjs';import{hash}from'./production/api.mjs';import{loadRetainedReference,validateRetainedReferenceConfig}from'./production/retained-reference.mjs';import{validateCapturePlan}from'./production/runner.mjs';
test('retained reference reuses only actual admitted evidence, preserving every bound image and verdict',()=>{
 const record=path=>({path,sha256:hash(fs.readFileSync(ROOT+'/'+path))}),run='docs/production/runs/2026-10-19-four-redesigns';
 const cfg={url:'https://www.ottografie.nl/',output:'docs/evidence/redo-v2/2026-10-21/009-otto-reference-11-grouped',retainedEvidence:{capture:record('docs/evidence/redo-v2/2026-10-21/009-otto-reference-11-grouped/capture.json'),review:record(run+'/009-reference-review.json'),calibration:record(run+'/calibration-review.json')}};
 assert.equal(loadRetainedReference(ROOT,cfg).states.length,8);assert.equal(validateCapturePlan(cfg,{root:ROOT}),cfg);
 for(const url of ['https://different.example/','https://www.ottografie.nl/completely-different-page/','https://www.ottografie.nl/?variant=other','https://www.ottografie.nl/#another-scene']){
  assert.throws(()=>loadRetainedReference(ROOT,{...cfg,url}),/source URL differs/);
 }
 // Only the URL parser's normalizations (host case, default port, root slash) are accepted.
 assert.equal(loadRetainedReference(ROOT,{...cfg,url:'https://WWW.OTTOGRAFIE.NL:443'}).states.length,8);
 assert.throws(()=>loadRetainedReference(ROOT,{...cfg,retainedEvidence:{...cfg.retainedEvidence,capture:{...cfg.retainedEvidence.capture,sha256:'0'.repeat(64)}}}),/changed or empty evidence/);
 assert.throws(()=>validateRetainedReferenceConfig({...cfg,output:'docs/evidence/different'}),/actual capture/);
 assert.throws(()=>validateCapturePlan({...cfg,url:'http://127.0.0.1:1234/'},{local:true,root:ROOT}),/cannot replace a candidate/);
});
