import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {main,productionReviewSelection,productionReviewClient} from './production-run.mjs';
import {workflowReviewClient} from './prototype-run.mjs';
import {CachedCodexCliReviewClient} from './production/cached-cli-review.mjs';
import {SessionReviewClient} from './production/session-review.mjs';
import {ResponsesClient} from './production/api.mjs';
import {ProductionRun} from './production/runner.mjs';

function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-cli-entry-'));
 t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.match(path.basename(root),/^webart-cli-entry-/);fs.rmSync(root,{recursive:true,force:true})});
 const write=(file,value)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(value))};
 return {root,write};
}
const runDirectory='docs/production/runs/entry-campaign';
const evaluator=mode=>({runId:'calibrated-fixture',reviewer:{id:'fixture-reviewer',mode,requestedModel:null}});
const cliEvaluator=()=>evaluator('evidence-only-fresh-codex-cli');
const controlledCli=(root,model)=>new CachedCodexCliReviewClient({root,directory:runDirectory+'/cli-review',model,spawnImpl:()=>{throw Error('A controlled entry test must not launch a CLI')}});

test('production CLI selection is explicit and only an explicit CLI flag overrides its account model',t=>{
 const {root,write}=fixture(t);write('configuration.json',{ids:['010'],model:'api-model-is-not-cli-authorization'});
 const options=productionReviewSelection(['configuration.json','--cli'],{root,now:123456});
 assert.equal(options.mode,'cli');assert.equal(options.requestedModel,undefined);assert.equal(options.directory,'docs/production/runs/cli-123456/cli-review');
 const client=new CachedCodexCliReviewClient({root,directory:options.directory,model:options.requestedModel});
 assert.equal(client.requestedModel,null);assert.equal(client.model,'codex-account-default');assert.equal(client.requests,0);
 const override=productionReviewSelection(['configuration.json','--cli','--model','explicit-model'],{root,now:123456});assert.equal(override.requestedModel,'explicit-model');
 assert.equal(productionReviewSelection(['configuration.json'],{root}).mode,'api');
 assert.equal(productionReviewSelection(['configuration.json','--session','--queue-only'],{root}).mode,'session');
});

test('unknown, conflicting and incomplete entry options fail before reading config or launching a client',async()=>{
 await assert.rejects(main(['does-not-exist.json','--clii']),/Unknown production option/);
 for(const flags of [['--cli','--session'],['--cli','--cli'],['--cli','--model'],['--cli','--resume'],['--model','fixture'],['--cli','--queue-only'],['--resume','docs/production/runs/api-fixture/run.json']])assert.throws(()=>productionReviewSelection(['does-not-exist.json',...flags]));
});

test('runtime hints are CLI-only, mutually exclusive and cannot override a resume',t=>{
 const {root}=fixture(t),executable=path.join(root,'codex.exe'),calibration='docs/production/runs/calibrated/calibration-review.json';
 for(const flags of [
  ['--cli-executable',executable],['--session','--runtime-calibration',calibration],['--check','--cli-executable',executable],
  ['--cli','--cli-executable'],['--cli','--runtime-calibration'],['--cli','--cli-executable',executable,'--runtime-calibration',calibration],
  ['--cli','--resume','docs/production/runs/api-fixture/run.json','--cli-executable',executable],
  ['--cli','--resume','docs/production/runs/api-fixture/run.json','--runtime-calibration',calibration],
 ])assert.throws(()=>productionReviewSelection(['cfg.json',...flags],{root}));
 const selection=productionReviewSelection(['cfg.json','--cli'],{root,now:123});
 assert.equal(productionReviewClient({root,selection,maxRequests:8,runtimeVersionProbe:()=>{throw Error('An initial no-hint selection must not require prior calibration')}}).executable,'codex');
 const api=productionReviewSelection(['cfg.json'],{root});assert.equal(productionReviewClient({root,selection:api,maxRequests:8}),undefined);
 const session=productionReviewSelection(['cfg.json','--session','--queue-only'],{root,now:123});
 assert.ok(productionReviewClient({root,selection:session,maxRequests:8}) instanceof SessionReviewClient);
});

test('CLI resume uses only its recorded directory and never switches a session or API run',t=>{
 const {root,write}=fixture(t),file='docs/production/runs/api-fixture/run.json';
 const prior={runId:'api-fixture',execution:'fresh-codex-cli-evidence-review',reviewDirectory:runDirectory+'/cli-review'};
 write(file,prior);assert.equal(productionReviewSelection(['cfg.json','--cli','--resume',file],{root}).directory,prior.reviewDirectory);
 assert.throws(()=>productionReviewSelection(['cfg.json','--session','--resume',file],{root}),/mode differs/);
 for(const execution of ['current-conversation-evidence-review','live-responses-api','controlled-fixture']){write(file,{...prior,execution});assert.throws(()=>productionReviewSelection(['cfg.json','--cli','--resume',file],{root}),/mode differs/)}
 for(const reviewDirectory of [undefined,runDirectory+'/review-queue','../cli-review','docs/production/runs/other/cli-review/extra']){write(file,{...prior,reviewDirectory});assert.throws(()=>productionReviewSelection(['cfg.json','--cli','--resume',file],{root}),/recorded CLI review directory/)}
 write(file,{...prior,runId:'api-other'});assert.throws(()=>productionReviewSelection(['cfg.json','--cli','--resume',file],{root}),/run identity/);
});

test('session resume retains its immutable pending calibration queue',t=>{
 const {root,write}=fixture(t),file='docs/production/runs/api-session/run.json',directory=runDirectory+'/review-queue';
 write(file,{runId:'api-session',execution:'current-conversation-evidence-review',status:'awaiting-review',pendingReview:{role:'calibration',requestFile:directory+'/01-calibration-fixture-request.json'}});
 assert.equal(productionReviewSelection(['cfg.json','--session','--resume',file],{root}).directory,directory);
});

test('prototype and qualification retain explicit controlled clients and their requested model',t=>{
 const {root}=fixture(t),first=workflowReviewClient({root,runDirectory,evaluator:cliEvaluator(),client:controlledCli(root)}),next=workflowReviewClient({root,runDirectory,evaluator:cliEvaluator(),client:controlledCli(root)});
 assert.ok(first instanceof CachedCodexCliReviewClient);assert.ok(next instanceof CachedCodexCliReviewClient);
 assert.equal(first.relativeDirectory,runDirectory+'/cli-review');assert.equal(next.relativeDirectory,first.relativeDirectory);assert.equal(first.requestedModel,null);assert.equal(first.model,'codex-account-default');assert.equal(first.requests,0);
 const overridden=workflowReviewClient({root,runDirectory,evaluator:{...cliEvaluator(),reviewer:{...cliEvaluator().reviewer,requestedModel:'explicit-model'}},client:controlledCli(root,'explicit-model')});assert.equal(overridden.requestedModel,'explicit-model');
});

test('workflow retains the explicitly supplied client reuse handler without adding usage',t=>{
 const {root}=fixture(t),progress=[],usage=[],reuses=[];
 const supplied=new CachedCodexCliReviewClient({root,directory:runDirectory+'/cli-review',onUsage:event=>usage.push(event),onReuse:event=>{reuses.push(event);progress.push({stage:'cli-review-reused',...event})}});
 const client=workflowReviewClient({root,runDirectory,evaluator:cliEvaluator(),client:supplied});
 const event={kind:'verified-cli-review-reuse',receipt:{path:runDirectory+'/cli-review/retained/receipt.json',sha256:'a'.repeat(64)},originalCliInvocations:1,newCliInvocations:0,newModelCalls:0,backendRequestCount:null,independent:false};
 client.onReuse(event);assert.deepEqual(reuses,[event]);assert.deepEqual(usage,[]);assert.equal(progress[0].stage,'cli-review-reused');assert.equal(progress[0].newModelCalls,0);assert.equal(client.requests,0);
});

test('workflow transport, model and campaign mismatches stop before any model call',t=>{
 const {root}=fixture(t);let calls=0;const json=()=>{calls++;throw Error('A model call is forbidden in this test')};
 const cli=workflowReviewClient({root,runDirectory,evaluator:cliEvaluator(),client:controlledCli(root)});cli.json=json;
 const session=workflowReviewClient({root,runDirectory,evaluator:evaluator('evidence-only-current-conversation')});session.json=json;
 const api=new ResponsesClient({apiKey:'fixture',model:'fixture-model',fetchImpl:json});
 assert.ok(session instanceof SessionReviewClient);
 for(const client of [session,api,{json}])assert.throws(()=>workflowReviewClient({root,runDirectory,evaluator:cliEvaluator(),client}),/calibrated review mode/);
 for(const mode of ['evidence-only-current-conversation','blind-evidence-only'])assert.throws(()=>workflowReviewClient({root,runDirectory,evaluator:evaluator(mode),client:cli}),/calibrated review mode/);
 assert.throws(()=>workflowReviewClient({root,runDirectory,evaluator:evaluator('evidence-only-current-conversation'),client:api}),/API client differs/);
 assert.throws(()=>workflowReviewClient({root,runDirectory,evaluator:evaluator('blind-evidence-only'),client:session}),/calibrated review mode/);
 assert.throws(()=>workflowReviewClient({root,runDirectory,evaluator:evaluator('blind-evidence-only')}),/explicit API review client/);
 assert.equal(workflowReviewClient({root,runDirectory,evaluator:evaluator('blind-evidence-only'),client:api}),api);
 const controlled={json};assert.equal(workflowReviewClient({root,runDirectory,evaluator:evaluator('blind-evidence-only'),client:controlled}),controlled);
 assert.throws(()=>workflowReviewClient({root,runDirectory,evaluator:{...cliEvaluator(),reviewer:{...cliEvaluator().reviewer,requestedModel:'different-model'}},client:cli}),/model override differs/);
 assert.throws(()=>workflowReviewClient({root,runDirectory:'docs/production/runs/another',evaluator:cliEvaluator(),client:cli}),/campaign directory/);
 assert.equal(calls,0);
});

test('a selected cached CLI cannot invoke a model or create a run before its static plan is ready',t=>{
 const {root,write}=fixture(t);write('webart.collection.json',{schemaVersion:1,templates:[{id:'010',slug:'fixture-design',manifest:'fixture-manifest.json'}]});
 let calls=0;const client=new CachedCodexCliReviewClient({root,directory:runDirectory+'/cli-review',spawnImpl:()=>{calls++;throw Error('CLI must not launch')}});
 assert.throws(()=>new ProductionRun({root,config:{ids:['010'],model:'fixture-model'},services:{client,loadPlan:()=>{throw Error('Static plan is not ready')}}}),/Static plan is not ready/);
 assert.equal(calls,0);assert.equal(client.requests,0);assert.equal(fs.existsSync(path.join(root,'docs/production/runs')),false);
});
