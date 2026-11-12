import fs from 'node:fs';import path from 'node:path';
import {ROOT,child,loadCollection,template,fingerprint,manifestFiles} from './collection.mjs';
import {beginCandidate} from './production-flow.mjs';
import {loadPlan} from './production/runner.mjs';
import {loadRenderer,writeRendererProject,assertRendererPlan} from './production/renderers.mjs';
import {serveDirectory} from './production/project.mjs';
import {browserEndpoint,command,runCapture} from './production/process.mjs';
import {hash} from './production/api.mjs';
import {validateResponsiveCapture} from './production/responsive.mjs';
import {fileURLToPath} from 'node:url';
import {inspectPerformance,loadPerformancePolicy,validatePerformanceReport} from './production/performance.mjs';

// An actual, deterministic build and browser check. This does not fabricate an
// evaluator verdict, create an archive or turn a replay into a new style.
export async function replayRenderer({root=ROOT,id='010',contentFile,signal}={}){
 const plan=loadPlan(root,id),renderer=loadRenderer(root,plan.renderer.id),contract=renderer.contract;
 if(contentFile)plan.content=JSON.parse(fs.readFileSync(child(root,contentFile),'utf8'));
 assertRendererPlan(root,plan);
 const runId='renderer-replay-'+new Date().toISOString().replace(/[-:.TZ]/g,''),directory='.webart/prototypes/'+runId,output='docs/evidence/redo-v2/static-pipeline/'+runId,entry=template(loadCollection(root),id);
 const before=loadCollection(root).templates.map(entry=>({entry,sha256:fingerprint(entry,root)}));
 fs.mkdirSync(child(root,output),{recursive:true});
 beginCandidate(root,id,directory,contract.referenceReview,contract.calibrationReview);
 let host;
 try{
  const project=await writeRendererProject({root,directory,entry,plan,signal});
  const actual=manifestFiles({...entry,manifest:project.manifest},root).files;
  const differences=actual.filter(file=>hash(fs.readFileSync(file.source))!==hash(fs.readFileSync(renderer.files.find(original=>original.archive===file.archive).source))).map(file=>file.archive);
  if(differences.some(file=>!['index.html','src/content.json'].includes(file))||!project.contentChanged&&differences.length)throw Error('Replay changed frozen source');
  host=await serveDirectory(child(root,directory+'/dist'));
  const endpoint=await browserEndpoint({root,signal});
  const capture=await runCapture({root,endpoint,cfg:{...plan.prototypeCapture,url:host.url,manifest:project.manifest,slug:entry.slug,visualContract:plan.visualContract,output:output+'/page'},filename:output+'/capture-config.json',signal});
  const config={...plan.qa,visualStates:plan.prototypeCapture.states,origin:host.url,output:output+'/full-qa'};
  fs.writeFileSync(child(root,output+'/qa-config.json'),JSON.stringify(config,null,2)+'\n');
  await command(process.execPath,[path.join(root,'scripts/qa-page.mjs'),endpoint,output+'/qa-config.json','full'],{cwd:root,signal,timeout:135000});
  const runtime=JSON.parse(fs.readFileSync(child(root,output+'/full-qa/runtime.json'),'utf8'));runtime.sourceSha256=project.sourceSha256;
  fs.writeFileSync(child(root,output+'/full-qa/runtime.json'),JSON.stringify(runtime,null,2)+'\n');
  const responsive=validateResponsiveCapture(root,runtime,project.sourceSha256);
  const performance=await inspectPerformance({root,endpoint,url:host.url,plan,output:output+'/performance.json',sourceSha256:project.sourceSha256,signal});
  validatePerformanceReport(performance,loadPerformancePolicy(root),plan.performance,project.sourceSha256);
  if(runtime.result!=='passed-observable-checks'||runtime.errors.length||capture.sourceSha256!==project.sourceSha256||fingerprint({...entry,manifest:project.manifest},root)!==project.sourceSha256)throw Error('Renderer replay failed actual browser/source checks');
  if(!before.every(sample=>fingerprint(sample.entry,root)===sample.sha256))throw Error('Official comparison source changed');
  const result={schemaVersion:1,result:'passed-engineering-replay',runId,rendererId:renderer.definition.id,directory,...project,differences,sourceFiles:actual.length,responsiveStates:responsive.length,prototypeStates:capture.states.length,runtime:output+'/full-qa/runtime.json',capture:output+'/page/capture.json',performance:output+'/performance.json',modelCalls:0,newArchives:0,inventoryChanged:false,visualAdmission:false,limitations:'Actual build and browser verification only. No independent reviewer or new style acceptance. The source renderer remains internally qualified and awaiting user review.'};
  fs.writeFileSync(child(root,output+'/result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));return result;
 }catch(error){fs.writeFileSync(child(root,output+'/failure.json'),JSON.stringify({runId,code:error.code,message:error.message,output:error.details?.output??null,visualAdmission:false},null,2)+'\n');throw error}
 finally{if(host)await new Promise(resolve=>host.server.close(resolve))}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [id='010',flag,file,...extra]=process.argv.slice(2);
 if(extra.length||flag!==undefined&&(flag!=='--content'||!file)){console.error('Usage: node scripts/renderer-replay.mjs [010] [--content workspace-relative-content.json]');process.exitCode=1}
 else try{await replayRenderer({id,contentFile:file})}catch(error){console.error(error.message);process.exitCode=1}
}
