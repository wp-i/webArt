import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import os from'node:os';import{hash}from'./production/api.mjs';import{validateResponsiveCapture,validateResponsiveReview,responsiveViews}from'./production/responsive.mjs';
test('five-width visual evidence cannot omit tablet, reuse another viewport, or change after review',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-responsive-gate-'));t.after(()=>{if(!path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe cleanup');fs.rmSync(root,{recursive:true,force:true})});
 // Header-only PNG signatures test dimension validation, not visual acceptance.
 const states=responsiveViews.flatMap(([viewport,width,height])=>['opening','transition','middle','ending'].map(state=>{const bytes=Buffer.alloc(25);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);const file=viewport+'-'+state+'.png';fs.writeFileSync(path.join(root,file),bytes);return{viewport,width,height,state,evidence:{path:file,sha256:hash(bytes)}}})),r={result:'passed-observable-checks',sourceSha256:'a'.repeat(64),responsive:states};
 assert.equal(validateResponsiveCapture(root,r,r.sourceSha256).length,20);
 const reviewed={sourceSha256:r.sourceSha256,responsiveComposition:'pass',responsiveChecks:states.map(s=>({viewport:s.viewport,state:s.state,subject:'preserved',composition:'preserved',actions:'preserved',finding:'Controlled evidence-binding regression, not a visual approval of this fixture.',evidence:[s.evidence]}))};assert.equal(validateResponsiveReview(root,r,reviewed),true);
 const lost=structuredClone(reviewed);lost.responsiveChecks.find(s=>s.viewport==='tablet').composition='lost';assert.throws(()=>validateResponsiveReview(root,r,lost),/not preserved/);
 const borrowed=structuredClone(reviewed);borrowed.responsiveChecks.find(s=>s.viewport==='tablet').evidence=[states[0].evidence];assert.throws(()=>validateResponsiveReview(root,r,borrowed),/not preserved/);
 const empty=structuredClone(reviewed);delete empty.responsiveChecks[0].finding;assert.throws(()=>validateResponsiveReview(root,r,empty),/not preserved/);
 assert.throws(()=>validateResponsiveReview(root,r,{...reviewed,responsiveChecks:reviewed.responsiveChecks.slice(1)}),/incomplete/);
 assert.throws(()=>validateResponsiveCapture(root,{...r,responsive:states.filter(s=>s.viewport!=='tablet')},r.sourceSha256),/incomplete/);
 const swapped=structuredClone(r);swapped.responsive.find(s=>s.viewport==='tablet').evidence=states[0].evidence;assert.throws(()=>validateResponsiveCapture(root,swapped,r.sourceSha256),/wrong viewport/);
 fs.appendFileSync(path.join(root,states[0].evidence.path),'changed');assert.throws(()=>validateResponsiveCapture(root,r,r.sourceSha256),/changed/);
});
