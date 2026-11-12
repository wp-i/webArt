import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import os from'node:os';import{spawnSync}from'node:child_process';import{ROOT}from'./collection.mjs';import{assertReferenceSelection}from'./production/references.mjs';import{hash}from'./production/api.mjs';
test('known rejected domains stop before browsing, including www and a different path',()=>{
 for(const url of['https://focalglow.co/','https://www.focalglow.co/new?ref=test'])assert.throws(()=>assertReferenceSelection(ROOT,url),e=>e.code==='rejected-reference');
 assert.throws(()=>assertReferenceSelection(ROOT,'https://focalglow.co/',{reason:'We would like another look.'}),/具体新证据/);assert.equal(assertReferenceSelection(ROOT,'https://animejs.com/').newAdmission,false);
});
test('the legacy scouting CLI cannot bypass rejection with an arbitrary short reason',()=>{
 const args=['scripts/inspect-reference.mjs','ws://127.0.0.1:1/devtools/browser/fixture','https://focalglow.co/','rejected-cli-fixture'];
 const skipped=spawnSync(process.execPath,args,{cwd:ROOT,encoding:'utf8',timeout:2500,windowsHide:true});assert.equal(skipped.status,0);assert.equal(JSON.parse(skipped.stdout).result,'skipped-known-rejection');
 const bypass=spawnSync(process.execPath,[...args,'1440','900','quick','--recheck=I want another look'],{cwd:ROOT,encoding:'utf8',timeout:2500,windowsHide:true});assert.notEqual(bypass.status,0);assert.match(bypass.stderr,/text-only recheck/);
});
test('offline model preparation refuses a known failed asset plan before opening the converter or changing bytes',()=>{
 const files=['assets/candidates/campo-v2/hand-realistic-rigged.glb','assets/candidates/campo-v2/cork-plate.glb','docs/production/runs/2026-10-17-reference-trial/007-asset-preparation-02.json'],before=files.map(file=>hash(fs.readFileSync(path.join(ROOT,file))));
 const result=spawnSync(process.execPath,['scripts/prepare-model-assets.mjs','docs/assets/recipes/campo-02-replay.json','--blender=.webart/nonexistent-converter.exe'],{cwd:ROOT,encoding:'utf8',timeout:2500,windowsHide:true});
 assert.notEqual(result.status,0);assert.match(result.stderr,/具体新证据/);assert.deepEqual(files.map(file=>hash(fs.readFileSync(path.join(ROOT,file)))),before);
});
test('rechecking needs immutable new evidence and a decision, and never grants quality admission',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-reference-selection-'));t.after(()=>{if(!path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe cleanup');fs.rmSync(root,{recursive:true,force:true})});fs.mkdirSync(path.join(root,'docs/production'),{recursive:true});fs.writeFileSync(path.join(root,'docs/production/reference-index.json'),JSON.stringify({references:[{name:'Rejected fixture',url:'https://example.org/',status:'rejected'}]}));
 const write=(name,text)=>{fs.writeFileSync(path.join(root,name),text);return{path:name,sha256:hash(Buffer.from(text))}},record=write('decision.md','Explicit changed-scope engineering fixture decision.'),evidence=write('new-evidence.json','New observation engineering fixture.');const recheck={reason:'A concrete changed condition is recorded for this engineering fixture; visual admission still requires the complete reference gate.',record,evidence:[evidence]};assert.equal(assertReferenceSelection(root,'https://example.org/',recheck).newAdmission,false);fs.appendFileSync(path.join(root,evidence.path),'tampered');assert.throws(()=>assertReferenceSelection(root,'https://example.org/',recheck),/changed/);
});
