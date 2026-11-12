import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,child} from './collection.mjs';
import {runPrototype} from './prototype-run.mjs';
import {qualifyPrototype,qualificationInput} from './qualify-prototype.mjs';
import {loadRenderer,registerRenderer} from './production/renderers.mjs';
import {loadPlan} from './production/runner.mjs';
import {hash} from './production/api.mjs';
import {verifyEvidence} from './quality-gate.mjs';
import {publishProduction} from './production-publish.mjs';

const read=(root,file)=>JSON.parse(fs.readFileSync(child(root,file),'utf8'));
const writeSame=(root,file,value)=>{const bytes=JSON.stringify(value,null,2)+'\n';if(fs.existsSync(child(root,file))){if(fs.readFileSync(child(root,file),'utf8')!==bytes)throw Error('Existing workflow receipt changed: '+file)}else{fs.mkdirSync(path.dirname(child(root,file)),{recursive:true});fs.writeFileSync(child(root,file),bytes,{flag:'wx'})}};

export function workflowConfig(root,file){
 const cfg=read(root,file);
 if(cfg.schemaVersion!==1||!Array.isArray(cfg.items)||!cfg.items.length||new Set(cfg.items.map(i=>i.id)).size!==cfg.items.length||cfg.items.some(i=>!['006','007','008','009'].includes(i.id)||!['reference-needed','prototype','qualification'].includes(i.stage)))throw Error('Workflow must explicitly list the four redesigns and their fixed stages');
 return cfg;
}
export function workflowStatus(root=ROOT,file='webart.workflow.json'){
 return workflowConfig(root,file).items.map(item=>{
  if(item.stage==='reference-needed')return {id:item.id,status:'needs-reference-plan',nextAction:item.nextAction};
  if(item.stage==='qualification'){
   const config=read(root,item.config);if(!fs.existsSync(child(root,config.pointer)))return {id:item.id,status:'ready-for-full-qualification'};
   const pointer=read(root,config.pointer),run=read(root,pointer.runFile);
   const latest=pointer.runFile.replace(/run\.json$/,'publication-latest.json');
   if(fs.existsSync(child(root,latest))){const receipt=read(root,latest);verifyEvidence(root,[receipt]);return {id:item.id,status:receipt.result==='passed'?'published':'publication-failed',publication:receipt.path}}
   return {id:item.id,status:run.status,stage:run.stage,pendingReview:run.pendingReview?.requestFile,nextAction:run.status==='ready-for-user-review'?'register-and-publish':undefined,runFile:pointer.runFile,failure:run.failure};
  }
  return {id:item.id,status:'prototype-plan-ready',config:item.config};
 });
}
async function registerAndPublish(root,item,run,onProgress){
 const input=qualificationInput(root,item.config),{plan}=input,delivery=run.deliveries.find(d=>d.id===item.id),def=item.renderer;
 if(!delivery||!def||def.sourceSha256!==delivery.sourceSha256)throw Error('Registration must use the statically selected same qualified source');
 const receiptFile=run.deliveries[0].qaRecord.replace(/^docs\/qa\//,'docs/production/runs/'+run.runId+'/').replace(/\.md$/,'-archive-receipt.json');
 writeSame(root,receiptFile,{id:item.id,sourceSha256:delivery.sourceSha256,archivePath:delivery.archivePath,bytes:delivery.bytes,sha256:delivery.sha256,previewAndAllAssets:delivery.http.previewAndAllAssets,archiveHttp:delivery.http.archiveHttp});
 const registrationPlan={...plan,status:'locked'},planFile='docs/production/runs/'+run.runId+'/'+item.id+'-registration-plan.json';writeSame(root,planFile,registrationPlan);
 const registered=read(root,'webart.renderers.json').renderers.some(r=>r.id===def.id);
 if(!registered){onProgress({id:item.id,status:'registering-qualified-renderer'});await registerRenderer({root,id:def.id,candidatePath:delivery.directory+'/delivery.json',planPath:planFile,rulesPath:def.rules,archiveReceiptPath:receiptFile})}
 const renderer=loadRenderer(root,def.id);if(renderer.definition.sourceSha256!==delivery.sourceSha256||renderer.archive.sha256!==delivery.sha256)throw Error('Registered renderer differs from actual delivery');
 const activePlan='docs/production/plans/'+item.id+'.json',next={...registrationPlan,renderer:{id:def.id,sourceSha256:def.sourceSha256}};
 if(JSON.stringify(read(root,activePlan))!==JSON.stringify(next)){
  const backup='.webart/comparison/plans/'+item.id+'-before-'+def.id+'.json';fs.mkdirSync(path.dirname(child(root,backup)),{recursive:true});if(!fs.existsSync(child(root,backup)))fs.copyFileSync(child(root,activePlan),child(root,backup),fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(child(root,activePlan),JSON.stringify(next,null,2)+'\n');
 }
 loadPlan(root,item.id);
 const latest='docs/production/runs/'+run.runId+'/publication-latest.json';
 if(fs.existsSync(child(root,latest))){const receipt=read(root,latest);verifyEvidence(root,[receipt]);if(receipt.result==='passed')return {status:'published',publication:receipt.path,newModelRequests:0}}
 onProgress({id:item.id,status:'publishing-qualified-item'});return {status:'published',publication:await publishProduction({root,runFile:'docs/production/runs/'+run.runId+'/run.json'})};
}
export async function workflowStep({root=ROOT,file='webart.workflow.json',id,all=false,onProgress=()=>{}}={}){
 const cfg=workflowConfig(root,file),items=id?cfg.items.filter(i=>i.id===id):cfg.items;
 if(!items.length)throw Error('Unknown workflow item');const results=[];
 for(const item of items){
  if(item.stage==='reference-needed'){results.push({id:item.id,status:'needs-reference-plan',nextAction:item.nextAction});continue}
  try{
   const run=item.stage==='prototype'?await runPrototype(item.config,{root,onProgress}):await qualifyPrototype(item.config,{root,onProgress});
   const result={id:item.id,status:run.status};
   if(run.status==='ready-for-user-review')Object.assign(result,await registerAndPublish(root,item,run,onProgress));
   else if(run.pendingReview)result.pendingReview=run.pendingReview.requestFile;
   results.push(result);
  }catch(error){results.push({id:item.id,status:'failed',reason:error.message})}
  if(!all)break;
 }
 return results;
}

// Status is deliberately an explicit operation. Unrecognised arguments must
// never fall through to the first executable workflow item.
export function workflowSelection(args){
 if(!Array.isArray(args)||args.some(arg=>typeof arg!=='string'))throw Error('Usage: node scripts/workflow-step.mjs [status | --status | --all | <006|007|008|009>]');
 let status=false,all=false,id;
 for(const arg of args){
  if(arg==='status'||arg==='--status'){if(status)throw Error('Duplicate workflow status option');status=true}
  else if(arg==='--all'){if(all)throw Error('Duplicate workflow --all option');all=true}
  else if(['006','007','008','009'].includes(arg)){
   if(id!==undefined)throw Error(id===arg?'Duplicate workflow ID: '+arg:'Choose one workflow ID or --all');id=arg;
  }else throw Error('Unknown workflow argument: '+arg);
 }
 if(status&&(all||id!==undefined))throw Error('Workflow status cannot be combined with execution options');
 if(all&&id!==undefined)throw Error('Choose one workflow ID or --all');
 return status?{mode:'status'}:{mode:'step',id,all};
}

export async function main(args=process.argv.slice(2),{root=ROOT,file='webart.workflow.json',status=workflowStatus,step=workflowStep,onProgress=()=>{}}={}){
 const selection=workflowSelection(args);
 return selection.mode==='status'?status(root,file):await step({root,file,id:selection.id,all:selection.all,onProgress});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await main(process.argv.slice(2),{onProgress:e=>console.log(JSON.stringify(e))});console.log(JSON.stringify(result,null,2));if(result.some(r=>['failed','publication-failed'].includes(r.status)))process.exitCode=1}catch(error){console.error(error.message);process.exitCode=1}
}
