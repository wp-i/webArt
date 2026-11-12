import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,child,loadCollection,template,receipt} from './collection.mjs';
import {loadRenderer} from './production/renderers.mjs';
import {assertPerformanceDelivery} from './production/performance.mjs';
import {hash} from './production/api.mjs';
import {BrowserPage} from './production/browser.mjs';
import {browserEndpoint,command} from './production/process.mjs';
import {getShowcase} from './showcase.mjs';

export async function syncShowcase({root=ROOT,id,rendererId,description,background,authorizationRecord='docs/DECISIONS.md',date}){
  if(!date||!description||!/^#[0-9a-f]{6}$/i.test(background??''))throw Error('Provide the approved date, short description and background');
  fs.readFileSync(child(root,authorizationRecord));
  const configFile=child(root,'webart.showcase.json'),config=JSON.parse(fs.readFileSync(configFile,'utf8'));
  const item=config.items.find(i=>i.id===id),base=template(loadCollection(root),id),renderer=loadRenderer(root,rendererId);
  if(!item||id==='001'||renderer.definition.templateId!==id||!config.authorization.trialIds.includes(id))throw Error('Sync updates one authorized existing draft; it cannot add styles or change 001');
  const handoff=JSON.parse(fs.readFileSync(child(root,renderer.definition.qualification.path),'utf8'));
  assertPerformanceDelivery(root,handoff,renderer.definition.sourceSha256);
  const archive=fs.readFileSync(child(root,renderer.archive.archivePath));
  receipt({...base,release:renderer.archive},child(root,renderer.archive.archivePath),root);
  // Only use the desktop opening already bound to the complete visual gate.
  const review=JSON.parse(fs.readFileSync(child(root,renderer.contract.prototypeReview),'utf8'));
  const opening=review.states.find(s=>s.viewport==='desktop'&&s.state==='opening').evidence[0];
  const image=fs.readFileSync(child(root,opening.path));if(hash(image)!==opening.sha256)throw Error('Opening evidence changed');
  const endpoint=await browserEndpoint({root}),page=await BrowserPage.create(endpoint);let thumbnails;
  try{thumbnails=await page.evaluate(`(async()=>{const image=new Image();image.src='data:image/jpeg;base64,${image.toString('base64')}';await image.decode();if(image.naturalWidth<1200||Math.abs(image.naturalWidth/image.naturalHeight-1.6)>.02)throw Error('Opening must be a real desktop viewport');return [1200,600].map(width=>{const c=document.createElement('canvas');c.width=width;c.height=width/1.6;c.getContext('2d').drawImage(image,0,0,c.width,c.height);return c.toDataURL('image/webp',.9).split(',')[1]})})()`)}finally{await page.close()}
  await command(process.execPath,[path.join(root,'scripts/renderer-preview.mjs'),rendererId],{cwd:root,timeout:90000});
  const replacements=[{file:'public/'+base.slug+'-source.zip',bytes:archive},...[id+'.webp',id+'-small.webp'].map((name,i)=>({file:'public/collection/'+name,bytes:Buffer.from(thumbnails[i],'base64')}))];
  const previous=replacements.map(r=>({...r,old:fs.readFileSync(child(root,r.file))})),oldConfig=fs.readFileSync(configFile);
  const history=child(root,'.webart/comparison/'+id);fs.mkdirSync(history,{recursive:true});
  for(const r of previous)if(!r.old.equals(r.bytes)){const dest=path.join(history,hash(r.old)+'-'+path.basename(r.file));if(!fs.existsSync(dest))fs.writeFileSync(dest,r.old,{flag:'wx'})}
  item.description=description;item.background=background;item.date=date;
  item.revision={rendererId,sourceSha256:renderer.definition.sourceSha256,archiveSha256:renderer.archive.sha256,authorization:{date,record:authorizationRecord},thumbnails:replacements.slice(1).map(r=>({path:r.file,sha256:hash(r.bytes)}))};
  try{
    for(const r of replacements)fs.writeFileSync(child(root,r.file),r.bytes);
    fs.writeFileSync(configFile,JSON.stringify(config,null,2)+'\n');
    const items=getShowcase(root);fs.writeFileSync(child(root,'public/showcase.json'),JSON.stringify({schemaVersion:1,templates:items},null,2)+'\n');
  }catch(error){for(const r of previous)fs.writeFileSync(child(root,r.file),r.old);fs.writeFileSync(configFile,oldConfig);throw error}
  return {id,rendererId,sourceSha256:renderer.definition.sourceSha256,archiveSha256:renderer.archive.sha256,items:config.items.length,newArchives:0,comparisonSourceChanged:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [id,rendererId,description,background,date]=process.argv.slice(2);
  try{console.log(JSON.stringify(await syncShowcase({id,rendererId,description,background,date}),null,2))}catch(e){console.error(e.message);process.exitCode=1}
}
