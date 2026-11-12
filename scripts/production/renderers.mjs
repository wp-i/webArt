import fs from 'node:fs';
import path from 'node:path';
import {ROOT,child,template,loadCollection,manifestFiles,fingerprint,validateTrialDelivery,candidateFiles} from '../collection.mjs';
import {verifyEvidence} from '../quality-gate.mjs';
import {ProductionError,hash} from './api.mjs';
import {fillContent,validateContent} from './content.mjs';
import {command} from './process.mjs';
import {buildProject} from './project.mjs';
import {referencePreflight} from '../production-flow.mjs';
import {assertPerformanceDelivery} from './performance.mjs';

const need=(ok,message)=>{if(!ok)throw new ProductionError('renderer-invalid',message)};
const read=(root,file)=>JSON.parse(fs.readFileSync(child(root,file),'utf8'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sourceArchives=['index.html','package.json','package-lock.json','vite.config.js','src','public/assets','README.md','LICENSE.md','THIRD_PARTY_NOTICES.md'];
// These are production inputs, not model suggestions. A new composition or test
// plan must be registered and reviewed as a new renderer revision.
const planKeys=['brief','referenceMap','referenceCapture','prototypeCapture','coreSignatures','visualContract','assetPlan','assets','fonts','rendering','lockedModules','comparison','style','controls','contentBudget','requiredContent','qa','performance'];
export const rendererPlanHash=plan=>hash(Buffer.from(JSON.stringify(Object.fromEntries(planKeys.map(key=>[key,plan[key]])))));

export function validateRendererContent(content,rules,defaults,required){
 validateContent(content,required);
 need(rules?.schemaVersion===1&&Number.isInteger(rules.totalCharacters)&&rules.totalCharacters>0&&rules.totalCharacters<=900,'完整模板缺少固定文案限制');
 need(same(Object.keys(content).sort(),Object.keys(defaults).sort())&&same(Object.keys(rules.fields??{}).sort(),Object.keys(defaults).sort()),'内容配置不能增加、删除字段或夹带源码/图片');
 need(Object.values(content).reduce((n,value)=>n+value.length,0)<=rules.totalCharacters,'内容超出整页固定预算');
 for(const [key,value] of Object.entries(content)){
  const rule=rules.fields[key];need(rule&&typeof rule.editable==='boolean','文案槽缺少可编辑边界：'+key);
  if(!rule.editable){need(value===defaults[key],'不能改写固定交互标签或计数：'+key);continue}
  const lines=value.split('\n');
  need(Number.isInteger(rule.maxCharacters)&&rule.maxCharacters>0&&rule.maxCharacters<=200&&Number.isInteger(rule.lines)&&rule.lines>=1&&rule.lines<=2&&Number.isInteger(rule.maxLineCharacters)&&rule.maxLineCharacters>0&&rule.maxLineCharacters<=100,'文案槽限制无效：'+key);
  need(rule.charset==='basic-latin'&&/^[\x20-\x7e\n]+$/.test(value)&&!/[<>]/.test(value),'文案字符超出已审字体和纯文本范围：'+key);
  need(value.length<=rule.maxCharacters&&lines.length===rule.lines&&lines.every(line=>line.trim()===line&&line.length>0&&line.length<=rule.maxLineCharacters),'文案超出已审长度或换行限制：'+key);
 }
 return true;
}

export function loadRenderer(root=ROOT,id){
 need(typeof id==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id),'必须选择已登记的完整模板');
 const registry=read(root,'webart.renderers.json');need(registry.schemaVersion===1&&Array.isArray(registry.renderers)&&new Set(registry.renderers.map(r=>r.id)).size===registry.renderers.length,'完整模板注册表无效');
 const registration=registry.renderers.find(r=>r.id===id);need(registration,'完整模板未登记；不能退回模型临时拼页');
 verifyEvidence(root,[registration.definition]);const def=read(root,registration.definition.path);
 need(def.schemaVersion===1&&def.id===id&&/^\d{3}$/.test(def.templateId)&&def.templateId!=='001'&&def.status==='internal-qualified-user-pending','完整模板尚未完成内部准入或试图改写基准');
 need(def.directory==='renderers/'+id&&def.sourceDirectory===def.directory+'/source'&&registration.definition.path===def.directory+'/renderer.json','完整模板必须使用独立、版本化的源目录');
 for(const key of ['manifest','contract','qualification','contentRules'])need(def[key]?.path===def.directory+'/'+({contentRules:'content-rules',qualification:'qualification',manifest:'manifest',contract:'contract'}[key])+'.json','模板记录目录不匹配');
 verifyEvidence(root,['manifest','contract','qualification','contentRules'].map(key=>def[key]));
 need(def.deliveryReceipt?.path&&/^[a-f0-9]{64}$/.test(def.deliveryReceipt.sha256??''),'完整模板缺少唯一已核验归档的绑定');verifyEvidence(root,[def.deliveryReceipt]);const archive=read(root,def.deliveryReceipt.path);validateArchiveReceipt(archive,def);
 need(/^[a-f0-9]{64}$/.test(def.sourceSha256??'')&&/^[a-f0-9]{64}$/.test(def.planSha256??''),'完整模板缺少源码或执行计划指纹');
 const handoff=read(root,def.qualification.path),base=template(loadCollection(root),def.templateId);
 need(handoff.id===base.id&&handoff.manifest===def.manifest.path&&handoff.qualityReview===def.contract.path,'完整模板资格记录没有绑定同一稿件');
 const entry={...base,projectDir:def.sourceDirectory,manifest:def.manifest.path,qualityReview:def.contract.path,status:'draft',stage:'trial',records:handoff.records,trialApproval:handoff.trialApproval};
 const {config,files}=manifestFiles(entry,root);
 need(same(config.files,sourceArchives.map(archive=>({source:def.sourceDirectory+'/'+archive,archive}))),'完整模板必须锁定整页源码、依赖及本地素材白名单');
 need(fingerprint(entry,root)===def.sourceSha256,'完整模板源码已变化；必须登记新版本并重新审查');
 validateTrialDelivery(entry,handoff,root);
 const defaults=read(root,def.sourceDirectory+'/src/content.json'),rules=read(root,def.contentRules.path);
 validateRendererContent(defaults,rules,defaults,def.requiredContent);
 return {definition:def,entry,config,files,defaults,rules,archive,contract:read(root,def.contract.path)};
}

function validateArchiveReceipt(receipt,definition){
 need(receipt.id===definition.templateId&&receipt.sourceSha256===definition.sourceSha256&&/^\.webart\/trials\/api-[a-z0-9-]+-source\.zip$/.test(receipt.archivePath??'')&&Number.isInteger(receipt.bytes)&&receipt.bytes>0&&/^[a-f0-9]{64}$/.test(receipt.sha256??'')&&receipt.previewAndAllAssets==='passed'&&receipt.archiveHttp==='passed','完整模板必须绑定同一源码的唯一已核验归档收据');
}
export function existingRendererArchive({root=ROOT,plan,sourceSha256}){
 const renderer=assertRendererPlan(root,plan);
 if(sourceSha256!==renderer.definition.sourceSha256)return null;
 const {archive}=renderer,filename=child(root,archive.archivePath);
 need(fs.existsSync(filename),'已登记唯一源码包在本地缺失，请恢复该归档；不能另造同源码副本');
 need(fs.lstatSync(filename).isFile()&&fs.statSync(filename).size===archive.bytes&&hash(fs.readFileSync(filename))===archive.sha256,'已登记源码包字节已变化；停止交付，不另生成副本');
 return {...archive,archiveReused:true};
}

export function assertRendererPlan(root,plan){
 need(plan.renderer&&same(Object.keys(plan.renderer).sort(),['id','sourceSha256']),'静态计划必须指定完整模板版本及源码指纹');
 const renderer=loadRenderer(root,plan.renderer.id),{definition,contract}=renderer;
 assertPerformanceDelivery(root,read(root,definition.qualification.path),definition.sourceSha256);
 need(definition.templateId===plan.id&&definition.sourceSha256===plan.renderer.sourceSha256,'不能给另一稿套用同一风格或过期模板');
 need(rendererPlanHash(plan)===definition.planSha256,'执行计划已偏离完整模板；须新版本复审，不能临场放宽QA或改构图');
 for(const key of ['visualContract','rendering','lockedModules','assetPlan','performance'])need(same(plan[key],contract[key]),'模板与计划的视觉/素材合同不一致：'+key);
 need(same(plan.requiredContent,definition.requiredContent),'模板默认内容槽已改变');
 validateRendererContent(plan.content,renderer.rules,renderer.defaults,definition.requiredContent);return renderer;
}

export function materializeRenderer({root=ROOT,directory,entry,plan}){
 const renderer=assertRendererPlan(root,plan),{definition,defaults,config,files}=renderer;
 need(entry.id===definition.templateId&&entry.slug===config.slug,'成品身份不能替换完整模板');
 need(/^\.webart\/prototypes\/[a-z0-9-]+$/.test(directory),'实例必须位于一个新的私有原型目录');
 const target=child(root,directory);need(fs.existsSync(path.join(target,'reference-admission.json')),'完整模板实例化仍须先通过本轮参考门');
 const admission=read(root,directory+'/reference-admission.json');need(admission.id===entry.id,'参考前置资格属于另一稿件');
 verifyEvidence(root,[admission.referenceReview,admission.calibrationReview]);referencePreflight(root,admission.referenceReview.path,admission.calibrationReview.path);
 need(fs.readdirSync(target).every(file=>['reference-admission.json','brief.md','reference-map.md'].includes(file)),'实例目录已有源文件，不能覆盖上轮产物');
 // Copy exact source bytes. Never reconstruct dependencies, notices, CSS or JS.
 for(const file of files){const destination=child(root,directory+'/'+file.archive);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(file.source,destination,fs.constants.COPYFILE_EXCL)}
 const normalizedContent=Object.fromEntries(Object.keys(defaults).map(key=>[key,plan.content[key]])),changed=Object.keys(defaults).some(key=>plan.content[key]!==defaults[key]);
 if(changed){
  const index=path.join(target,'index.html'),filled=fillContent([{path:'index.html',content:fs.readFileSync(index,'utf8')}],plan.content,definition.requiredContent);
  fs.writeFileSync(index,filled[0].content);fs.writeFileSync(path.join(target,'src/content.json'),JSON.stringify(normalizedContent,null,2)+'\n');
 }
 const manifest={...config,files:config.files.map(rule=>({source:directory+'/'+rule.archive,archive:rule.archive}))};
 fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const result={manifest:directory+'/manifest.json',sourceSha256:fingerprint({...entry,manifest:directory+'/manifest.json'},root),rendererId:definition.id,rendererSourceSha256:definition.sourceSha256,contentChanged:changed,codeGenerationCalls:0,visualAdmissionReused:false,requiresFreshReview:true};
 if(!changed)need(result.sourceSha256===definition.sourceSha256,'原样回放不等于已审源码，停止后续步骤');
 fs.writeFileSync(path.join(target,'renderer-origin.json'),JSON.stringify(result,null,2)+'\n');return result;
}

export async function writeRendererProject(options){
 const result=materializeRenderer(options),cwd=child(options.root,options.directory);
 await command(process.env.WEBART_POWERSHELL??'pwsh.exe',['-NoProfile','-Command','& npm.cmd ci --ignore-scripts --no-audit --no-fund; if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}'],{cwd,signal:options.signal,timeout:180000});
 await buildProject(options);
 need(fingerprint({...options.entry,manifest:result.manifest},options.root)===result.sourceSha256,'安装或构建改变了完整模板源码');return result;
}

export async function registerRenderer({root=ROOT,id,candidatePath,planPath,rulesPath,archiveReceiptPath}){
 need(typeof id==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*-v[1-9][0-9]*$/.test(id),'完整模板名称必须包含明确版本');
 const registryFile=child(root,'webart.renderers.json'),registry=read(root,'webart.renderers.json'),previous=fs.readFileSync(registryFile);
 need(registry.schemaVersion===1&&Array.isArray(registry.renderers)&&!registry.renderers.some(item=>item.id===id),'完整模板版本已登记，不能覆盖');
 // The same executable v2 package gate is required before library registration.
 const validated=candidateFiles(candidatePath,root),handoff=read(root,candidatePath),plan=read(root,planPath),rules=read(root,rulesPath),base=template(loadCollection(root),handoff.id);
 need(plan.id===base.id&&base.id!=='001'&&plan.status==='locked','只登记已完成本轮内部批准的非基准试片');
 need(same(validated.config.files.map(file=>file.archive),sourceArchives),'源项目缺少整页固定白名单');
 const candidateEntry={...base,manifest:handoff.manifest},sourceSha256=fingerprint(candidateEntry,root),contract=read(root,handoff.qualityReview),contentFile=validated.files.find(file=>file.archive==='src/content.json');
 need(contentFile,'源码没有独立内容配置');const defaults=JSON.parse(fs.readFileSync(contentFile.source,'utf8'));
 need(same(defaults,plan.content),'登记计划文案与实际已审源码不一致');validateRendererContent(defaults,rules,defaults,plan.requiredContent);
 assertPerformanceDelivery(root,handoff,sourceSha256);
 for(const key of ['visualContract','rendering','lockedModules','assetPlan','performance'])need(same(plan[key],contract[key]),'登记计划与实际审查合同不同：'+key);
 const archive=read(root,archiveReceiptPath);validateArchiveReceipt(archive,{templateId:base.id,sourceSha256});
 need(hash(fs.readFileSync(child(root,archive.archivePath)))===archive.sha256&&fs.statSync(child(root,archive.archivePath)).size===archive.bytes,'登记归档与收据不符');
 await command(process.env.WEBART_POWERSHELL??'pwsh.exe',['-NoProfile','-File',path.join(root,'scripts/verify-package.ps1'),'-CandidatePath',candidatePath,'-ArchivePath',child(root,archive.archivePath),'-Trial'],{cwd:root,timeout:240000});
 const directory='renderers/'+id,sourceDirectory=directory+'/source',target=child(root,directory);need(!fs.existsSync(target),'模板源目录已经存在');
 fs.mkdirSync(child(root,'renderers'),{recursive:true});fs.mkdirSync(target);
 const write=(file,value)=>{const destination=child(root,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'})};
 const pin=file=>({path:file,sha256:hash(fs.readFileSync(child(root,file)))});
 try{
  for(const file of validated.files)write(sourceDirectory+'/'+file.archive,fs.readFileSync(file.source));
  write(directory+'/manifest.json',{...validated.config,files:sourceArchives.map(archive=>({source:sourceDirectory+'/'+archive,archive}))});
  write(directory+'/contract.json',fs.readFileSync(child(root,handoff.qualityReview)));write(directory+'/content-rules.json',rules);
  write(directory+'/qualification.json',{...handoff,manifest:directory+'/manifest.json',qualityReview:directory+'/contract.json',records:{...handoff.records,brief:plan.brief,reference:plan.referenceMap}});
  const definition={schemaVersion:1,id,templateId:base.id,status:'internal-qualified-user-pending',directory,sourceDirectory,sourceSha256,planSha256:rendererPlanHash(plan),requiredContent:plan.requiredContent,deliveryReceipt:pin(archiveReceiptPath),...Object.fromEntries(['manifest','contract','qualification','contentRules'].map(key=>[key,pin(directory+'/'+(key==='contentRules'?'content-rules':key)+'.json')])),limitations:'Internally qualified only; user acceptance is pending. Registration and replay do not create a new design or guarantee user acceptance.'};
  write(directory+'/renderer.json',definition);
  const candidate={...base,projectDir:sourceDirectory,manifest:definition.manifest.path,qualityReview:definition.contract.path,status:'draft',stage:'trial',records:read(root,definition.qualification.path).records,trialApproval:handoff.trialApproval};
  need(fingerprint(candidate,root)===sourceSha256&&fingerprint(candidateEntry,root)===sourceSha256,'登记复制期间源码变化');validateTrialDelivery(candidate,read(root,definition.qualification.path),root);
  // Do not change the plan or publish the source. Registration is one explicit
  // local action; the caller must pin this revision in its static plan.
  registry.renderers.push({id,definition:pin(directory+'/renderer.json')});fs.writeFileSync(registryFile,JSON.stringify(registry,null,2)+'\n');loadRenderer(root,id);
  return {id,sourceSha256,renderer:{id,sourceSha256},sourceFiles:validated.files.length,newArchives:0,publicInventoryChanged:false,userAcceptance:'pending'};
 }catch(error){
  fs.writeFileSync(registryFile,previous);
  need(target.startsWith(child(root,'renderers')+path.sep)&&path.basename(target)===id,'拒绝清理非本轮模板目录');fs.rmSync(target,{recursive:true,force:true});throw error;
 }
}
