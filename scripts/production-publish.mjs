import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,child,candidateFiles,loadCollection,fingerprint} from './collection.mjs';
import {syncShowcase} from './showcase-sync.mjs';
import {loadRenderer} from './production/renderers.mjs';
import {command,browserEndpoint} from './production/process.mjs';
import {verifyHttp} from './release-collection.mjs';
import {hash} from './production/api.mjs';
import {getShowcase} from './showcase.mjs';

export function galleryQAConfig(items,output){
  return {origin:'http://127.0.0.1:4180/',output,images:items.length,paintedImages:'.work-preview img',fonts:['Manrope'],scenes:['.intro','.work-grid','.work:nth-child(3)','.site-footer'],documentPaths:[...new Set(['/','/preview.html',...items.flatMap(item=>[item.preview,item.download])])]};
}

export function publicationFailure(error,stage){
  const failure={failure:error.message,failureStage:stage,failureCode:error.code??null};
  if(typeof error.details?.output==='string')failure.failureOutput=error.details.output.slice(-16000);
  return failure;
}

export async function ensureCollectionPreview({root=ROOT,run=command}={}){
  const args=['-NoProfile','-File',path.join(root,'scripts/start-preview.ps1'),'-Profile','collection'];
  try{return await run(process.env.WEBART_POWERSHELL??'pwsh.exe',args,{cwd:root,timeout:45000})}
  catch(error){
    if(error.code!=='stage-timeout')throw error;
    // A cold launch can finish just after its caller times out. Re-enter the
    // same ownership/HTTP health check once; it does not grant a QA pass.
    return run(process.env.WEBART_POWERSHELL??'pwsh.exe',args,{cwd:root,timeout:45000});
  }
}

export function publicationPlan(root,run,config){
  if(run.status!=='ready-for-user-review'||!['current-conversation-evidence-review','live-responses-api','fresh-codex-cli-evidence-review'].includes(run.execution))throw Error('Only a completed real review run can synchronize the homepage; fixtures are forbidden');
  if(config.schemaVersion!==1||!config.authorization?.date||!config.authorization?.record||!Array.isArray(config.items)||new Set(config.items.map(i=>i.id)).size!==config.items.length)throw Error('Missing or ambiguous static publication authorization');
  fs.readFileSync(child(root,config.authorization.record));
  if(!run.deliveries?.length||new Set(run.deliveries.map(d=>d.id)).size!==run.ids?.length||!run.ids.every(id=>run.deliveries.some(d=>d.id===id)))throw Error('Run has incomplete deliveries');
  return run.deliveries.map(delivery=>{
    if(delivery.directory!==`.webart/prototypes/${run.runId}-${delivery.id}`)throw Error('Publication candidate does not belong to this actual run');
    const item=config.items?.find(i=>i.id===delivery.id);if(!item)throw Error('No approved publication metadata for '+delivery.id);
    const renderer=loadRenderer(root,item.rendererId);
    if(item.sourceSha256!==delivery.sourceSha256||renderer.definition.sourceSha256!==delivery.sourceSha256||renderer.archive.sha256!==delivery.sha256||renderer.archive.bytes!==delivery.bytes)throw Error('Publication must use the same registered source and unique archive as the actual run');
    const validated=candidateFiles(delivery.directory+'/delivery.json',root);
    if(fingerprint({manifest:delivery.directory+'/manifest.json',slug:renderer.entry.slug},root)!==delivery.sourceSha256||!validated.files.length)throw Error('Actual run source changed before publication');
    return item;
  });
}
export async function publishProduction({root=ROOT,runFile,configFile='webart.publication.json'}){
  if(!/^docs\/production\/runs\/[a-z0-9-]+\/run\.json$/.test(runFile))throw Error('Choose a completed production run');
  const run=JSON.parse(fs.readFileSync(child(root,runFile),'utf8')),config=JSON.parse(fs.readFileSync(child(root,configFile),'utf8')),items=publicationPlan(root,run,config);
  const originals=['webart.showcase.json','public/showcase.json',...items.flatMap(i=>{const renderer=loadRenderer(root,i.rendererId);return ['public/'+renderer.entry.slug+'-source.zip',`public/collection/${i.id}.webp`,`public/collection/${i.id}-small.webp`]})].map(file=>({file,bytes:fs.readFileSync(child(root,file))}));
  const record={schemaVersion:1,runId:run.runId,execution:run.execution,sourceRun:runFile,started:new Date().toISOString(),items:[],result:'running'};
  let attempt=1,receiptFile=runFile.replace(/run\.json$/,'publication.json');
  while(fs.existsSync(child(root,receiptFile))){attempt++;receiptFile=runFile.replace(/run\.json$/,`publication-attempt-${String(attempt).padStart(2,'0')}.json`)}
  const evidenceOutput=`docs/evidence/publication/${run.runId}/attempt-${String(attempt).padStart(2,'0')}`;record.attempt=attempt;
  let stage='synchronize-qualified-item';
  try{
    for(const item of items)record.items.push(await syncShowcase({root,...item,date:config.authorization.date,authorizationRecord:config.authorization.record}));
    stage='build-collection';
    await command(process.env.WEBART_POWERSHELL??'pwsh.exe',['-NoProfile','-Command','& npm.cmd run build; exit $LASTEXITCODE'],{cwd:root,timeout:180000});
    stage='task-browser-health';
    const endpoint=await browserEndpoint({root});
    stage='collection-preview-health';
    await ensureCollectionPreview({root});
    const qa=galleryQAConfig(getShowcase(root),evidenceOutput);
    const qaFile=runFile.replace(/run\.json$/,`publication-qa-config-${String(attempt).padStart(2,'0')}.json`);fs.writeFileSync(child(root,qaFile),JSON.stringify(qa,null,2)+'\n',{flag:'wx'});
    stage='collection-layout-qa';
    await command(process.execPath,[path.join(root,'scripts/qa-page.mjs'),endpoint,qaFile,'full'],{cwd:root,timeout:135000});
    stage='collection-functional-qa';
    await command(process.execPath,[path.join(root,'scripts/qa-showcase.mjs'),endpoint,qa.origin,evidenceOutput],{cwd:root,timeout:135000});
    stage='collection-http-and-archives';
    record.http=await verifyHttp(loadCollection(root),root);record.result='passed';
    record.evidence=[evidenceOutput+'/runtime.json',evidenceOutput+'/functional.json'].map(file=>({path:file,sha256:hash(fs.readFileSync(child(root,file)))}));
  }catch(error){
    for(const original of originals)fs.writeFileSync(child(root,original.file),original.bytes);
    record.result='failed-rolled-back';Object.assign(record,publicationFailure(error,stage));
    try{await command(process.env.WEBART_POWERSHELL??'pwsh.exe',['-NoProfile','-Command','& npm.cmd run build; exit $LASTEXITCODE'],{cwd:root,timeout:180000})}catch(rollbackError){record.rollbackBuildFailure=rollbackError.message}
    throw error;
  }finally{record.finished=new Date().toISOString();fs.writeFileSync(child(root,receiptFile),JSON.stringify(record,null,2)+'\n',{flag:'wx'});fs.writeFileSync(child(root,runFile.replace(/run\.json$/,'publication-latest.json')),JSON.stringify({path:receiptFile,sha256:hash(fs.readFileSync(child(root,receiptFile))),result:record.result},null,2)+'\n')}
  return record;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(await publishProduction({runFile:process.argv[2],configFile:process.argv[3]??'webart.publication.json'}),null,2))}catch(error){console.error(error.message);process.exitCode=1}
}
