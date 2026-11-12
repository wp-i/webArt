import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {workflowConfig,workflowStatus,workflowStep,workflowSelection,main} from './workflow-step.mjs';

function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-workflow-'));t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.match(path.basename(root),/^webart-workflow-/);fs.rmSync(root,{recursive:true,force:true})});return root}
test('unprepared references stay visible and perform no generation, QA or publication',async t=>{
 const root=fixture(t),items=['007','008','009'].map(id=>({id,stage:'reference-needed',nextAction:'Complete actual reference evidence.'}));
 fs.writeFileSync(path.join(root,'webart.workflow.json'),JSON.stringify({schemaVersion:1,items}));
 const before=fs.readdirSync(root);assert.equal(workflowStatus(root).length,3);
 const results=await workflowStep({root,all:true});assert.ok(results.every(r=>r.status==='needs-reference-plan'));assert.deepEqual(fs.readdirSync(root),before);
 await assert.rejects(workflowStep({root,id:'001'}),/Unknown/);
});
test('workflow cannot target the benchmark, duplicate an item or enable autonomous discovery',t=>{
 const root=fixture(t),file='webart.workflow.json';
 for(const items of [[{id:'001',stage:'qualification'}],[{id:'006',stage:'prototype'},{id:'006',stage:'qualification'}],[{id:'007',stage:'search-and-generate'}]]){
  fs.writeFileSync(path.join(root,file),JSON.stringify({schemaVersion:1,items}));assert.throws(()=>workflowConfig(root,file));
 }
});

test('both status forms are read-only and never dispatch generation or publication',async t=>{
 const root=fixture(t),file='webart.workflow.json',items=['006','007','008','009'].map(id=>({id,stage:'reference-needed',nextAction:'Complete actual reference evidence.'}));
 fs.writeFileSync(path.join(root,file),JSON.stringify({schemaVersion:1,items}));
 const before=fs.readFileSync(path.join(root,file)),entries=fs.readdirSync(root),calls=[];
 const step=()=>{throw Error('A status query must never execute workflowStep, model review or publication')};
 for(const arg of ['status','--status']){
  const result=await main([arg],{root,file,step,status:(actualRoot,actualFile)=>{calls.push({root:actualRoot,file:actualFile});return workflowStatus(actualRoot,actualFile)},onProgress:()=>{throw Error('Status must not produce execution progress')}});
  assert.equal(result.length,4);assert.ok(result.every(row=>row.status==='needs-reference-plan'));
 }
 assert.deepEqual(calls,[{root,file},{root,file}]);assert.deepEqual(fs.readdirSync(root),entries);assert.deepEqual(fs.readFileSync(path.join(root,file)),before);
});

test('unknown and conflicting CLI arguments fail before reading configuration or executing work',async()=>{
 const invalid=[
  ['statuz'],['--statuz'],['status','typo'],['--status','--typo'],['--all','extra'],['006','extra'],['--all','--unknown'],
  ['001'],['010'],['6'],['006','006'],['007','008'],['--all','--all'],['--status','--status'],['status','--status'],
  ['status','006'],['006','--status'],['--status','--all'],['--all','status'],['--all','007'],['008','--all'],
 ];
 let reads=0,executions=0,progress=0;
 const status=()=>{reads++;throw Error('Invalid arguments must not read workflow configuration')},step=()=>{executions++;throw Error('Invalid arguments must not start workflowStep')};
 for(const args of invalid)await assert.rejects(main(args,{root:path.join(os.tmpdir(),'nonexistent-workflow-cli-fixture'),status,step,onProgress:()=>{progress++}}),/Usage:|Unknown workflow argument|Duplicate workflow|Choose one workflow|cannot be combined/);
 assert.equal(reads,0);assert.equal(executions,0);assert.equal(progress,0);
});

test('default execution, --all and one supported ID retain their exact existing selection',async()=>{
 const calls=[],root=path.join(os.tmpdir(),'controlled-workflow-cli'),file='controlled.json',onProgress=()=>{},result=[{status:'controlled-no-model-no-publication'}];
 const status=()=>{throw Error('Execution selection must not become a status query')},step=async options=>{calls.push(options);return result};
 for(const id of ['006','007','008','009'])assert.equal(await main([id],{root,file,status,step,onProgress}),result);
 assert.equal(await main(['--all'],{root,file,status,step,onProgress}),result);
 assert.equal(await main([],{root,file,status,step,onProgress}),result);
 assert.deepEqual(calls,[...['006','007','008','009'].map(id=>({root,file,id,all:false,onProgress})),{root,file,id:undefined,all:true,onProgress},{root,file,id:undefined,all:false,onProgress}]);
 assert.deepEqual(workflowSelection(['status']),{mode:'status'});assert.deepEqual(workflowSelection(['--status']),{mode:'status'});
});
