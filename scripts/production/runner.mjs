import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {ROOT,child,loadCollection,template,fingerprint} from '../collection.mjs';
import {beginCandidate,candidateQuality} from '../production-flow.mjs';
import {loadQualityPolicy,verifyEvidence,recordRejectedSource,loadRejectedSources,validateCalibration,validateReview} from '../quality-gate.mjs';
import {ResponsesClient,ProductionError,hash} from './api.mjs';
import {loadCohort,calibrate,review,FrameSet} from './evidence.mjs';
import {loadStyleCohort} from './style-cohort.mjs';
import {consumeCliReview} from './review-consumption.mjs';
import {browserEndpoint,command,runCapture} from './process.mjs';
import {referenceUrl,inspectControls,inspectStaticContract,inspectRenderingFallback} from './browser.mjs';
import {serveDirectory,verifyDelivery,resolveFonts,storeTrialArchive,buildProject} from './project.mjs';
import {controlsReviewSchema,styleReviewSchema} from './schemas.mjs';
import {validateContent} from './content.mjs';
import {validateAsset} from './assets.mjs';
import {validateRenderingPlan,validateFallbackCapture} from './rendering.mjs';
import {validateVisualContract,assertVisualCapture,validateVisualReview} from './visual-contract.mjs';
import {resolveLockedModules} from './locked-modules.mjs';
import {validateResponsiveCapture,validateResponsiveReview} from './responsive.mjs';
import {assertReferenceSelection} from './references.mjs';
import {validateRetainedReferenceConfig,loadRetainedReference} from './retained-reference.mjs';
import {assertRendererPlan,writeRendererProject,existingRendererArchive} from './renderers.mjs';
import {loadPerformancePolicy,validatePerformancePlan,inspectPerformance,validatePerformanceReport} from './performance.mjs';
import {engineeringBinding,engineeringCheckpointFile,writeEngineeringCheckpoint,readEngineeringCheckpoint} from './checkpoints.mjs';
import {inspectNativeGalleries} from './native-galleries.mjs';

const read=(root,file)=>JSON.parse(fs.readFileSync(child(root,file),'utf8'));
const need=(ok,message,code='invalid-plan')=>{if(!ok)throw new ProductionError(code,message)};
export function validateConfig(config,root=ROOT){
 need(config&&Array.isArray(config.ids)&&config.ids.length>0&&config.ids.length<=5&&new Set(config.ids).size===config.ids.length,'选择1–5份待重做设计','configuration-required');
 const entries=config.ids.map(id=>template(loadCollection(root),id));need(!entries.some(e=>e.id==='001'),'第一稿是验收基准，不进入重做队列','benchmark-frozen');
 need(typeof config.model==='string'&&/^[a-zA-Z0-9._:-]{1,100}$/.test(config.model),'请配置支持图像和结构化输出的模型','configuration-required');
 need(!config.references?.length,'参考和素材只能来自已锁定静态计划，不能交给模型临时选择','static-plan-required');
 const maxRequests=config.maxRequests??32;need(Number.isInteger(maxRequests)&&maxRequests>=1&&maxRequests<=64,'调用预算须在1–64之间','request-budget');return {ids:entries.map(e=>e.id),model:config.model,maxRequests};
}
export function validateCapturePlan(cfg,{local=false,root}={}){
 need(cfg.trustedTouch===undefined||typeof cfg.trustedTouch==='boolean','实际触摸采证必须使用显式布尔配置');
 need(cfg.processScenes===undefined||Array.isArray(cfg.processScenes)&&cfg.processScenes.length>=2&&cfg.processScenes.length<=6&&new Set(cfg.processScenes).size===cfg.processScenes.length&&cfg.processScenes.every(s=>typeof s==='string'&&s.trim().length>0&&s.length<=200),'完整过程场景须为2–6个不同的固定选择器');
 need(cfg.pointer?.inspect===undefined||typeof cfg.pointer.inspect==='string'&&cfg.pointer.inspect.trim().length>0&&cfg.pointer.inspect.length<=200,'取景表面须为固定选择器');
 if(local){need(!cfg.url||cfg.url.startsWith('http://127.0.0.1:'),'成品采证只使用本地预览')}else referenceUrl(cfg.url);
 if(cfg.retainedEvidence){need(!local,'Retained reference evidence cannot replace a candidate capture');validateRetainedReferenceConfig(cfg);need(root,'Retained reference validation requires its workspace');loadRetainedReference(root,cfg);return cfg}
 for(const view of ['desktop','mobile']){
  const positions=cfg.states?.[view]??cfg.states;need(['opening','transition','middle','ending'].every(k=>k in (positions??{})),'静态采证计划必须覆盖四状态');need(positions.opening===0,'默认开场不能藏在滚动或点击后');
  for(const value of Object.values(positions)){
   const ratio=typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;
   const object=value&&typeof value==='object'&&!Array.isArray(value);
   const selector=object&&Object.keys(value).every(key=>['selector','offset'].includes(key))&&typeof value.selector==='string'&&value.selector.trim().length>0&&value.selector.length<=200&&(value.offset===undefined||Number.isFinite(value.offset)&&value.offset>=0&&value.offset<=1);
   const absolute=object&&!local&&Object.keys(value).length===1&&Number.isFinite(value.y)&&value.y>=0&&value.y<=100000;
   need(ratio||selector||absolute,'只接受已配置的原生滚动比例、场景选择器或参考绝对位置，不能混入点击、滚轮或第二种定位方式');
  }
 }
 need(cfg.pointer?.selector&&cfg.ready&&cfg.ready.length<=1000,'缺少实际渲染表面或最终加载条件');
 need(cfg.deadlineMs===undefined||Number.isInteger(cfg.deadlineMs)&&cfg.deadlineMs>=10000&&cfg.deadlineMs<=(local?120000:240000),'采证预算超出参考/候选固定上限');
 need(cfg.wheelIntervalMs===undefined||Number.isInteger(cfg.wheelIntervalMs)&&cfg.wheelIntervalMs>=16&&cfg.wheelIntervalMs<=64,'原生滚轮间隔须在16–64ms之间');
 need(['scene','position','y'].filter(key=>cfg.pointer[key]!==undefined).length<=1,'指针场景定位只能选一种静态方式');
 need(cfg.pointer.retainPosition===undefined||typeof cfg.pointer.retainPosition==='boolean','保留指针场景必须是显式布尔值');
 need(!cfg.pointer.retainPosition||['scene','position','y'].some(key=>cfg.pointer[key]!==undefined),'保留指针位置须配置实际到达的场景');
 need(cfg.initialPointer===undefined||cfg.initialPointer&&Object.keys(cfg.initialPointer).length===2&&['x','y'].every(key=>Number.isFinite(cfg.initialPointer[key])&&cfg.initialPointer[key]>=0&&cfg.initialPointer[key]<=1),'初始指针须是视口内明确坐标');
 need(cfg.pointer.position===undefined||Number.isFinite(cfg.pointer.position)&&cfg.pointer.position>=0&&cfg.pointer.position<=1,'指针比例不合法');
 need(cfg.pointer.y===undefined||!local&&Number.isFinite(cfg.pointer.y)&&cfg.pointer.y>=0&&cfg.pointer.y<=100000,'绝对指针位置只允许已配置的参考路径');return cfg;
}
function productionPolicy(root){
 const policy=read(root,'webart.production.json');need(policy.schemaVersion===1&&policy.mode==='configuration-driven'&&policy.productionMode==='frozen-renderer'&&policy.autonomousDiscovery===false&&policy.autonomousAssetSelection===false&&policy.autonomousCapturePlanning===false&&policy.publicInventoryMutation===false&&policy.maxLocalFinish===0&&policy.maxEvidenceRecapture===1&&JSON.stringify(policy.llmRoles)===JSON.stringify(['reviewer-calibration','evidence-review']),'生产入口必须由固定配置和脚本驱动','invalid-production-policy');
 const stages=['plan-validation','reviewer-calibration','reference-capture','reference-gate','renderer-materialization','prototype-capture','prototype-gate','style-check','full-qa','performance-qa','control-review','single-source-package','http-verification'];need(JSON.stringify(policy.stageOrder)===JSON.stringify(stages),'生产阶段不能跳过或重新排列','invalid-production-policy');
 need(Array.isArray(policy.plans)&&new Set(policy.plans.map(p=>p.id)).size===policy.plans.length&&policy.plans.every(p=>p.id!=='001'&&/^docs\/production\/plans\/[a-z0-9-]+\.json$/.test(p.path)),'生产计划注册表无效','invalid-production-policy');const quality=loadQualityPolicy(root).policy;need(quality.visualContractRequired===true&&quality.rejectedSources,'生产入口不能关闭四状态合同或历史拒绝拦截','invalid-production-policy');return policy;
}
export function planStatus(root=ROOT){
 return productionPolicy(root).plans.map(item=>{const p=read(root,item.path);let ready=false,reason=p.blocker??null;if(p.status==='locked'){try{loadPlan(root,item.id);ready=true}catch(error){reason=error.message}}return {id:item.id,status:p.status,ready,reason,nextAction:p.nextAction??null,...(p.readinessRecord?{readinessRecord:p.readinessRecord}:{}),path:item.path}});
}
export function loadPlan(root,id){
 const item=productionPolicy(root).plans.find(x=>x.id===id);need(item,'当前设计缺少静态生产计划','plan-required');const p=read(root,item.path);
 need(p.status==='locked',`${id}：${p.blocker??'参考、素材和关键状态尚未锁定'}`,'plan-not-ready');
 const {calibration}=loadQualityPolicy(root);loadRejectedSources(root);need(p.id===id&&id!=='001'&&p.calibrationRevision===calibration.revision&&p.approval?.record&&p.approval?.date,'计划身份、验收版本或内部批准记录无效');
 for(const file of [p.approval.record,p.brief,p.referenceMap,p.assetPlan.record])fs.readFileSync(child(root,file));
 validateCapturePlan(p.referenceCapture,{root});validateCapturePlan(p.prototypeCapture,{local:true});
 assertReferenceSelection(root,p.referenceCapture.url,p.referenceCapture.recheck);
 need(p.coreSignatures?.length&&p.coreSignatures.every(f=>f.name&&f.visualPurpose?.length>=30)&&p.assetPlan.heroRoleLocked&&p.assetPlan.replacementCompared&&p.assetPlan.rightsVerified&&p.assetPlan.lowCostIsNotMerit===true,'静态计划未锁定核心特征和素材品质/许可');verifyEvidence(root,p.assetPlan.evidence);
 need(Array.isArray(p.assets)&&p.assets.length<=6&&new Set(p.assets.map(a=>a.assetId)).size===p.assets.length,'素材角色重复或超过限额');
 for(const a of p.assets){need(/^[a-z0-9-]+$/.test(a.assetId)&&a.role&&a.desktopCrop&&a.mobileCrop&&a.creator&&a.source&&a.license&&a.verified&&a.distributionBasis,'素材缺少角色、裁切或源码分发依据');verifyEvidence(root,[{path:a.localPath,sha256:a.sha256}]);validateAsset(fs.readFileSync(child(root,a.localPath)),a.localPath)}
 need(calibration.negatives.some(x=>x.id===p.comparison?.negativeId),'必须配置邻近负样本');
 need(Array.isArray(p.controls)&&p.controls.length>0&&p.style&&Number.isInteger(p.qa?.images)&&p.qa.images>=0&&p.qa.scenes?.length>=2&&p.qa.scenes.length<=5&&Array.isArray(p.qa.fonts),'必须事先配置控件、风格差异及整页QA期待');
 need(['desktop','wide','tablet','mobile','narrow'].every(view=>p.qa.composition?.[view]?.length>=30),'必须静态锁定五宽度的主体范围、文字关系和行动位置');
 need(Number.isInteger(p.contentBudget?.totalCharacters)&&p.contentBudget.totalCharacters>0&&p.contentBudget.totalCharacters<=900&&p.contentBudget.paragraphCharacters>0&&p.contentBudget.paragraphCharacters<=120,'必须锁定短占位文案预算');validateContent(p.content,p.requiredContent);
 const selectedFonts=resolveFonts(p.fonts,root);need(JSON.stringify(p.qa.fonts)===JSON.stringify(selectedFonts.map(f=>f.name)),'QA字体期待必须对应静态选择，不能由模型临场换字体');validateRenderingPlan(p.rendering);loadPerformancePolicy(root);validatePerformancePlan(p.performance);need(p.performance.mode===p.rendering.mode,'性能计划与实际渲染计划不同');validateVisualContract(p.visualContract,p.coreSignatures);resolveLockedModules(root,p.lockedModules,p.rendering,p.coreSignatures);assertRendererPlan(root,p);return p;
}
export function nextStep(report,{recaptures=0}={}){
 if(report.decision==='admit'&&report.nextAction==='admit')return 'admit';
 if(report.nextAction==='recapture'&&report.decision==='evidence-needed'&&recaptures===0)return 'recapture';return 'stop-for-plan-revision';
}
export class ProductionRun {
 constructor({root=ROOT,config,apiKey,signal,onProgress=()=>{},services={},resumeFile}){
  this.root=root;this.config=validateConfig(config,root);this.signal=signal;this.onProgress=onProgress;this.services=services;
  // Plans must be ready before any model charge or prototype directory creation.
  this.plans=this.config.ids.map(id=>(services.loadPlan??loadPlan)(root,id));need(apiKey||services.client,'尚未配置本地 API Key，真实模型执行未启动','configuration-required');
  this.resuming=Boolean(resumeFile);let prior;
 if(resumeFile){need(/^docs\/production\/runs\/api-[a-z0-9-]+\/run\.json$/.test(resumeFile),'恢复路径必须是实际运行记录');prior=read(root,resumeFile);need(['current-conversation-evidence-review','fresh-codex-cli-evidence-review'].includes(prior.execution)&&services.client?.execution===prior.execution&&JSON.stringify(prior.ids)===JSON.stringify(this.config.ids)&&['running','failed','awaiting-review'].includes(prior.status)&&!prior.deliveries?.length&&!prior.candidates?.length,'只能恢复未交付且未被视觉拒绝的同一会话运行');need(resumeFile==='docs/production/runs/'+prior.runId+'/run.json','恢复运行身份不匹配');if(prior.execution==='fresh-codex-cli-evidence-review')need(prior.requestedModel===services.client.requestedModel&&prior.model===services.client.model,'恢复CLI审查配置已改变')}
  this.id=prior?.runId??('api-'+new Date().toISOString().replace(/[-:.TZ]/g,'')+'-'+crypto.randomBytes(4).toString('hex'));this.dir='docs/production/runs/'+this.id;this.evidenceDir='docs/evidence/production/'+this.id;fs.mkdirSync(child(root,this.dir),{recursive:true});
  this.report={schemaVersion:1,runId:this.id,mode:'configuration-driven',productionMode:'frozen-renderer',codeGenerationCalls:0,execution:services.client?.execution??(services.client?'controlled-fixture':'live-responses-api'),started:new Date().toISOString(),model:services.client?.execution==='fresh-codex-cli-evidence-review'?services.client.model:this.config.model,ids:this.config.ids,status:'running',stage:'preparing',usage:[],candidates:[],deliveries:[],inventoryChanged:false,visualAcceptance:'pending-user-review'};
  if(prior){this.report={...prior,status:'running',resumes:[...(prior.resumes??[]),{at:new Date().toISOString(),fromStage:prior.stage,previousFailure:prior.failure??null}]};delete this.report.failure;delete this.report.finished;delete this.report.pendingReview}
  this.client=services.client??new ResponsesClient({apiKey,model:this.config.model,signal,maxRequests:this.config.maxRequests,onUsage:u=>{this.report.usage.push(u);this.persist()}});
  if(this.client.execution==='fresh-codex-cli-evidence-review'){this.report.reviewDirectory=path.relative(this.root,this.client.directory).replaceAll('\\','/');this.report.requestedModel=this.client.requestedModel}
  this.save=(name,value)=>{const file=this.dir+'/'+name;fs.writeFileSync(child(root,file),JSON.stringify(value,null,2)+'\n');return file};this.persist();
 }
 persist(){fs.writeFileSync(child(this.root,this.dir+'/run.json'),JSON.stringify(this.report,null,2)+'\n')}
 stage(stage,message){need(!this.signal?.aborted,'本轮已停止','cancelled');this.report.stage=stage;this.persist();this.onProgress({stage,message,status:this.report.status,runId:this.id})}
 reject(id,stage,r){this.report.candidates.push({id,stage,decision:r.decision,nextAction:'stop-for-plan-revision',fixTasks:r.fixTasks});this.persist()}
 async capture(endpoint,cfg,label){
  if(cfg.retainedEvidence){const capture=loadRetainedReference(this.root,cfg);this.save(label+'-retained-reference.json',{mode:'verified-retained-reference',url:cfg.url,...cfg.retainedEvidence,newBrowserCapture:false,newVisualApproval:false});return capture}
  if(cfg.staticContent){const values=JSON.stringify(cfg.staticContent);cfg={...cfg,ready:`(${cfg.ready}) && (()=>{const values=${values};return [...document.querySelectorAll('[data-content]')].every(e=>Object.hasOwn(values,e.dataset.content)&&e.textContent.trim().replace(/\\s+/g,' ')===values[e.dataset.content].trim().replace(/\\s+/g,' '))})()`}}
  const config={...cfg,output:this.evidenceDir+'/'+label},configFile=this.dir+'/'+label+'-config.json';
  if(this.resuming&&fs.existsSync(child(this.root,config.output+'/capture.json'))){
   const previous=read(this.root,configFile),normalize=c=>{const result={...c};if(c.manifest&&c.url?.startsWith('http://127.0.0.1:'))delete result.url;return JSON.stringify(result)};
   need(normalize(previous)===normalize(config),'恢复采证配置已改变，须新运行');const captured=read(this.root,config.output+'/capture.json');need(captured.result==='captured-not-scored'&&captured.errors?.length===0,'恢复的采证未完成');
   verifyEvidence(this.root,[...captured.states.flatMap(s=>s.evidence),...captured.motion.flatMap(m=>m.evidence)]);return captured;
  }
  return (this.services.runCapture??runCapture)({root:this.root,endpoint,cfg:config,filename:configFile,signal:this.signal});
 }
 async reviewed(options){
  const file=this.dir+'/'+options.filename;
  if(this.resuming&&fs.existsSync(child(this.root,file))){const result=read(this.root,file);need(result.reviewer?.id===options.evaluator.reviewer.id&&result.reviewer.calibrationRunId===options.evaluator.runId,'恢复审核者不匹配');validateReview(this.root,result,loadQualityPolicy(this.root).calibration,options.phase,options.candidate?.sourceSha256);validateVisualReview(this.root,result,options.visualContract);return result}
  return review(options);
 }
 async execute(){
  let before=[];
  try{
   before=loadCollection(this.root).templates.map(entry=>({entry,sha256:fingerprint(entry,this.root)}));
   this.stage('calibration','一次校准，验证审查者能区分第一稿和其余五稿');const cohort=(this.services.loadCohort??loadCohort)(this.root);let evaluator;
   if(this.resuming&&fs.existsSync(child(this.root,this.dir+'/calibration-review.json'))){evaluator=read(this.root,this.dir+'/calibration-review.json');validateCalibration(this.root,evaluator,loadQualityPolicy(this.root).calibration);need(evaluator.runId===this.id,'恢复校准不属于本轮')}
   else evaluator=await (this.services.calibrate??calibrate)({root:this.root,client:this.client,cohort,runId:this.id,save:this.save,runDirectory:this.dir});
   const endpoint=await (this.services.browserEndpoint??browserEndpoint)({root:this.root,signal:this.signal});
   for(const plan of this.plans){
    const id=plan.id,entry=template(loadCollection(this.root),id),comparison=[cohort[0],cohort.find(c=>c.id===plan.comparison.negativeId)];
    this.stage('reference-capture','按固定采证计划审查参考完整路径');let capture=await this.capture(endpoint,plan.referenceCapture,id+'-reference');
    let reference=await this.reviewed({root:this.root,client:this.client,cohort:comparison,evaluator,phase:'reference',reference:capture,expectedSignatures:plan.coreSignatures,visualContract:plan.visualContract,save:this.save,filename:id+'-reference.json'});
    if(nextStep(reference)==='recapture'){capture=await this.capture(endpoint,plan.referenceCapture,id+'-reference-recapture');reference=await review({root:this.root,client:this.client,cohort:comparison,evaluator,phase:'reference',reference:capture,expectedSignatures:plan.coreSignatures,visualContract:plan.visualContract,save:this.save,filename:id+'-reference.json'})}
    if(reference.decision!=='admit'){this.reject(id,'reference',reference);continue}
    const directory='.webart/prototypes/'+this.id+'-'+id;
    if(this.resuming&&fs.existsSync(child(this.root,directory+'/reference-admission.json'))){const admission=read(this.root,directory+'/reference-admission.json');verifyEvidence(this.root,[admission.referenceReview,admission.calibrationReview]);need(admission.id===id,'恢复试片身份不匹配')}
    else beginCandidate(this.root,id,directory,this.dir+'/'+id+'-reference.json',this.dir+'/calibration-review.json');
    for(const [from,to] of [[plan.brief,'brief.md'],[plan.referenceMap,'reference-map.md']])fs.copyFileSync(child(this.root,from),child(this.root,directory+'/'+to));
    this.stage('renderer-materialization','实例化已准入完整模板，仅填入受限内容；整页代码生成调用为零');const finishes=0;let recaptures=0;
    let project;
    if(this.resuming&&fs.existsSync(child(this.root,directory+'/renderer-origin.json'))){project=read(this.root,directory+'/renderer-origin.json');need(project.rendererId===plan.renderer.id&&project.rendererSourceSha256===plan.renderer.sourceSha256&&fingerprint({...entry,manifest:project.manifest},this.root)===project.sourceSha256&&JSON.stringify(read(this.root,directory+'/src/content.json'))===JSON.stringify(plan.content),'恢复源码或内容已改变');if(!fs.existsSync(child(this.root,directory+'/dist/index.html')))await buildProject({root:this.root,directory,signal:this.signal})}
    else project=await (this.services.writeRendererProject??writeRendererProject)({root:this.root,directory,entry,plan,signal:this.signal});
    const host=await serveDirectory(child(this.root,directory+'/dist'));
    try{
     while(true){
      const staticCheck=await inspectStaticContract({root:this.root,endpoint,url:host.url,plan,output:this.dir+`/${id}-static-contract-${finishes}.json`,signal:this.signal});
      if(staticCheck.result!=='passed-static-contract'){this.reject(id,'static-contract',{decision:'reject',fixTasks:staticCheck.checks.flatMap(c=>c.failures)});break}
      const prototype=await this.capture(endpoint,{...plan.prototypeCapture,url:host.url,manifest:project.manifest,slug:entry.slug,staticContent:plan.content,visualContract:plan.visualContract},`${id}-prototype-${finishes}-${recaptures}`);
      assertVisualCapture(prototype,plan.visualContract);
      need(!loadRejectedSources(this.root).some(s=>s.sourceSha256===prototype.sourceSha256),'未改变的拒绝源码不能再次付费请求视觉放行','rejected-source-unchanged');
      const reviewFile=id+`-prototype-${finishes}-${recaptures}.json`;
      const verdict=await this.reviewed({root:this.root,client:this.client,cohort:comparison,evaluator,phase:'prototype',reference:capture,candidate:prototype,expectedSignatures:reference.signatureFeatures,visualContract:plan.visualContract,save:this.save,filename:reviewFile}),action=nextStep(verdict,{finishes,recaptures});
      if(verdict.decision==='reject')recordRejectedSource(this.root,id,this.dir+'/'+reviewFile);
      if(action==='recapture'){recaptures++;continue}
      if(action!=='admit'){this.reject(id,'prototype',verdict);break}
      await this.qualifyCandidate({plan,entry,project,reference,prototype,cohort,host,endpoint,directory,reviewFile,finishes,recaptures});break;
     }
    }finally{await new Promise(resolve=>host.server.close(resolve))}
   }
   this.report.status=this.report.deliveries.length===this.config.ids.length?'ready-for-user-review':'stopped-for-plan-revision';
  }catch(error){if(error.code==='review-pending'){this.report.status='awaiting-review';this.report.pendingReview=error.details}else{this.report.status=this.signal?.aborted?'cancelled':'failed';this.report.failure={code:error.code??'production-failed',message:error.message};if(error.details?.output){const output=String(error.details.output).split(this.client.apiKey||'\0').join('[redacted]');this.report.failure.diagnostic=this.save('engineering-failure.json',{stage:this.report.stage,code:error.code,output})}}}
  finally{this.client.apiKey=undefined;try{need(before.every(x=>fingerprint(x.entry,this.root)===x.sha256),'正式比较样本发生变化','official-source-changed')}catch(error){this.report.status='failed';this.report.failure={code:'official-source-changed',message:error.message}}this.report.finished=new Date().toISOString();this.persist();this.onProgress({stage:'finished',status:this.report.status,runId:this.id})}
  return this.report;
 }
 async qualifyCandidate({plan,entry,project,reference,prototype,cohort,host,endpoint,directory,reviewFile,finishes=0,recaptures=0}){
  const id=plan.id;
  const sourceSha256=fingerprint({...entry,manifest:project.manifest},this.root),contract={schemaVersion:2,id,calibrationRevision:plan.calibrationRevision,sourceSha256,calibrationReview:this.dir+'/calibration-review.json',referenceReview:this.dir+'/'+id+'-reference.json',prototypeReview:this.dir+'/'+reviewFile,assetPlan:plan.assetPlan,visualContract:plan.visualContract,lockedModules:plan.lockedModules,rendering:plan.rendering,performance:plan.performance};fs.writeFileSync(child(this.root,directory+'/contract.json'),JSON.stringify(contract,null,2));candidateQuality(this.root,id,project.manifest,directory+'/contract.json');
  const style=await this.checkStyle(plan,prototype,cohort,sourceSha256);if(!style){this.reject(id,'style-review',{decision:'reject',fixTasks:['与已有稿的结构差异不足，修改静态计划']});return false}
  const binding=engineeringBinding(this.root,plan,sourceSha256),checkpointFile=engineeringCheckpointFile(this.root,this.dir+'/'+id+'-engineering-checkpoint.json',{binding,sourceSha256});
  let runtimePath;
  if(fs.existsSync(child(this.root,checkpointFile)))runtimePath=readEngineeringCheckpoint(this.root,checkpointFile,{binding,sourceSha256}).directory;
  else{runtimePath=this.evidenceDir+'/'+id+'-full-qa';let attempt=1;while(fs.existsSync(child(this.root,runtimePath))){attempt++;runtimePath=this.evidenceDir+'/'+id+'-full-qa-attempt-'+String(attempt).padStart(2,'0')}this.report.qaAttempts??=[];this.report.qaAttempts.push({id,attempt,directory:runtimePath,binding,sourceSha256});this.persist()}
  const runtimeFile=runtimePath+'/runtime.json',performanceCapture=runtimePath+'/performance.json';
  let runtime,controls,renderingCapture;
  if(fs.existsSync(child(this.root,checkpointFile))){
   const checkpoint=readEngineeringCheckpoint(this.root,checkpointFile,{binding,sourceSha256});
   runtime=read(this.root,runtimeFile);controls=read(this.root,runtimePath+'/controls/controls.json');renderingCapture=checkpoint.renderingCapture;
   this.stage('engineering-reused','复用同一源码、计划和检查版本下的完整QA证据，不重复采集');
  }else{
   this.stage('full-qa','执行固定五宽度、完整路径及控件检查');this.save(id+'-qa-config.json',{...plan.qa,visualStates:plan.prototypeCapture.states,origin:host.url,output:runtimePath});
   await command(process.execPath,[path.join(this.root,'scripts/qa-page.mjs'),endpoint,this.dir+'/'+id+'-qa-config.json','full'],{cwd:this.root,signal:this.signal,timeout:135000});
   runtime=read(this.root,runtimeFile);runtime.sourceSha256=sourceSha256;fs.writeFileSync(child(this.root,runtimeFile),JSON.stringify(runtime,null,2));
   controls=await inspectControls({root:this.root,endpoint,url:host.url,output:runtimePath+'/controls',signal:this.signal,expected:plan.controls,ready:plan.prototypeCapture.ready});
   controls.sourceSha256=sourceSha256;fs.writeFileSync(child(this.root,runtimePath+'/controls/controls.json'),JSON.stringify(controls,null,2));
   if(plan.qa.galleries?.length)await inspectNativeGalleries({root:this.root,endpoint,url:host.url,galleries:plan.qa.galleries,output:runtimePath+'/galleries',sourceSha256});
   if(plan.rendering.mode==='local-3d'){
    const output=runtimePath+'/rendering',fallback=await inspectRenderingFallback({root:this.root,endpoint,url:host.url,output,plan,signal:this.signal});fallback.sourceSha256=sourceSha256;
    validateFallbackCapture(fallback,sourceSha256);renderingCapture=output+'/rendering.json';fs.writeFileSync(child(this.root,renderingCapture),JSON.stringify(fallback,null,2));
   }
   this.stage('performance-qa','实际测量静止、连续原生输入、手机压力、减少动态及后台');
   const performance=await inspectPerformance({root:this.root,endpoint,url:host.url,plan,output:performanceCapture,sourceSha256,signal:this.signal});
   validatePerformanceReport(performance,loadPerformancePolicy(this.root),plan.performance,sourceSha256);validateResponsiveCapture(this.root,runtime,sourceSha256);
   need(fingerprint({...entry,manifest:project.manifest},this.root)===sourceSha256,'源码在完整QA期间发生变化');
   writeEngineeringCheckpoint(this.root,checkpointFile,{binding,sourceSha256,directory:runtimePath,renderingCapture});
  }
  validatePerformanceReport(read(this.root,performanceCapture),loadPerformancePolicy(this.root),plan.performance,sourceSha256);
  const frames=new FrameSet(this.root);controls.viewports.forEach(v=>v.controls.forEach(c=>c.evidence.forEach(e=>frames.add('control',e,`${v.viewport} ${c.label} ${e.state}`))));need(frames.frames.size,'页面没有可用的行动','controls-failed');
  for(const check of runtime.checks?.noScriptActions??[]){need(check.result==='passed-native-no-script-action','Native no-script action is incomplete');frames.add('control',check.evidence,`no-script ${check.selector} ${check.kind} native-result`)}
  const responsiveFrames=validateResponsiveCapture(this.root,runtime,sourceSha256).map(s=>({viewport:s.viewport,state:s.state,frame:frames.add('responsive-composition',s.evidence,`${s.viewport} ${s.width} ${s.state}`)}));
  if(plan.qa.galleries?.length){const galleries=read(this.root,runtimePath+'/galleries/galleries.json');need(galleries.result==='passed-native-gallery-input-not-visually-approved'&&galleries.sourceSha256===sourceSha256,'Native gallery evidence is incomplete');galleries.checks.forEach(c=>c.evidence.forEach(e=>frames.add('control',e,`${c.mode} ${c.width} gallery ${e.state}`)))}
  if(renderingCapture)read(this.root,renderingCapture).checks.forEach(c=>c.states.forEach(s=>frames.add('rendering-fallback',s.evidence,`${c.mode} ${c.width} ${s.state}`)));
  let controlReview=await this.client.json({role:'controls-review',instructions:fs.readFileSync(child(this.root,'docs/production/prompts/CHECK_CONTROLS.md'),'utf8'),text:JSON.stringify({expected:plan.controls,composition:plan.qa.composition,responsiveFrames,rendering:plan.rendering}),images:frames.inputs({deduplicate:true}),schema:controlsReviewSchema});
  controlReview.responsiveChecks=controlReview.responsiveChecks.map(({frames:ids,...check})=>({...check,evidence:frames.resolve(ids,'responsive-composition')}));
  controlReview.sourceSha256=sourceSha256;controls.sourceSha256=sourceSha256;fs.writeFileSync(child(this.root,runtimePath+'/controls/controls.json'),JSON.stringify(controls,null,2));
  controlReview.phase='full-qa';const evaluator=read(this.root,this.dir+'/calibration-review.json');controlReview.reviewer={...evaluator.reviewer};
  if(this.client.lastReviewReceipt)controlReview.reviewReceipt=this.client.lastReviewReceipt;
  controlReview.runtimeEvidence={path:runtimeFile,sha256:hash(fs.readFileSync(child(this.root,runtimeFile)))};
  if(controlReview.decision==='reject')controlReview.vetoes=controlReview.findings;
  if(this.client.reviewerMetadata?.mode==='evidence-only-fresh-codex-cli')controlReview=consumeCliReview({root:this.root,client:this.client,role:'controls-review',context:{sourceSha256,reviewerId:evaluator.reviewer.id,calibrationRunId:evaluator.runId,runtimeEvidence:controlReview.runtimeEvidence,frames:[...frames.frames].map(([id,{role,label,path,sha256}])=>({id,role,label,path,sha256}))},report:controlReview});
  this.save(id+'-controls-review.json',controlReview);
  if(controlReview.decision==='reject'){recordRejectedSource(this.root,id,this.dir+'/'+id+'-controls-review.json');this.reject(id,'full-qa',{decision:'reject',fixTasks:controlReview.findings});return false}
  validateResponsiveReview(this.root,runtime,controlReview);
  need(controlReview.decision==='pass'&&controlReview.responsiveComposition==='pass'&&controlReview.renderingFallback===(plan.rendering.mode==='local-3d'?'pass':'not-applicable'),'五宽度构图、控件或渲染失败备用的视觉检查未通过','controls-review-failed');
  need(fingerprint({...entry,manifest:project.manifest},this.root)===sourceSha256,'QA后源码变化，须重采证','source-changed');
  const qaRecord='docs/qa/'+this.id+'-'+id+'.md';fs.mkdirSync(path.dirname(child(this.root,qaRecord)),{recursive:true});fs.writeFileSync(child(this.root,qaRecord),`# ${entry.title} 配置驱动试产\n\n双品质门与完整工程检查通过，等待用户视觉验收。\nSource SHA256: ${sourceSha256}\nRuntime: ${runtimePath}/runtime.json\n`);
  const handoff={schemaVersion:1,id,manifest:project.manifest,qualityReview:directory+'/contract.json',records:{brief:directory+'/brief.md',reference:directory+'/reference-map.md',assets:plan.assetPlan.record,qa:qaRecord},trialApproval:{sourceSha256,runtime:runtimePath+'/runtime.json'},controls:{capture:runtimePath+'/controls/controls.json',review:this.dir+'/'+id+'-controls-review.json'},rendering:{mode:plan.rendering.mode,...(renderingCapture?{capture:renderingCapture}:{})},performance:{capture:performanceCapture,sha256:hash(fs.readFileSync(child(this.root,performanceCapture)))},styleReview:this.dir+'/'+id+'-style-review.json'};fs.writeFileSync(child(this.root,directory+'/delivery.json'),JSON.stringify(handoff,null,2));
  this.stage('packaging','唯一源码包、独立安装构建及HTTP检查');const existing=plan.renderer?existingRendererArchive({root:this.root,plan,sourceSha256}):null;let archivePath,bytes;
  if(existing){
   archivePath=existing.archivePath;await command(process.env.WEBART_POWERSHELL??'pwsh.exe',['-NoProfile','-File',path.join(this.root,'scripts/verify-package.ps1'),'-CandidatePath',directory+'/delivery.json','-ArchivePath',child(this.root,archivePath),'-Trial'],{cwd:this.root,signal:this.signal,timeout:240000});bytes=fs.readFileSync(child(this.root,archivePath));
  }else{
   const temporary=path.join(os.tmpdir(),'webart-'+this.id+'-'+id+'.zip');await command(process.env.WEBART_POWERSHELL??'pwsh.exe',['-NoProfile','-File',path.join(this.root,'scripts/package-template.ps1'),'-CandidatePath',directory+'/delivery.json','-Trial','-StagePath',temporary],{cwd:this.root,signal:this.signal,timeout:240000});
   bytes=fs.readFileSync(temporary);archivePath='.webart/trials/'+this.id+'-'+id+'-source.zip';storeTrialArchive({root:this.root,temporary,archivePath,expectedSha256:hash(bytes)});
  }
  const http=await verifyDelivery(this.root,directory,host.url,archivePath);
  this.report.deliveries.push({id,title:entry.title,directory,archivePath,bytes:bytes.length,sha256:hash(bytes),archiveReused:Boolean(existing),sourceSha256,qaRecord,capturePath:this.evidenceDir+`/${id}-prototype-${finishes}-${recaptures}/capture.json`,http,quality:'calibrated-review-passed-user-review-pending'});this.persist();return true;
 }
 async checkStyle(plan,prototype,cohort,sourceSha256){
  this.stage('style-review','品质门后比较实际风格差异');
  const deliveries=this.report.deliveries.map(delivery=>({...delivery,rendererId:delivery.rendererId??this.plans?.find(p=>p.id===delivery.id)?.renderer?.id}));
  const options={candidateId:plan.id,frozenCohort:cohort,deliveries},comparisonCohort=loadStyleCohort(this.root,options),packet=new FrameSet(this.root);
  prototype.states.forEach(s=>s.evidence.forEach(e=>packet.add('candidate',e,s.viewport+' '+s.state)));
  comparisonCohort.forEach(c=>c.states.forEach(e=>packet.add('existing',e,c.id+' '+e.viewport+' '+e.state)));
  let style=await this.client.json({role:'style-review',instructions:fs.readFileSync(child(this.root,'docs/production/prompts/CHECK_STYLE.md'),'utf8')+' 每项finding至少30字符。',text:JSON.stringify({...plan.style,otherIds:comparisonCohort.map(c=>c.id)}),images:packet.inputs(),schema:styleReviewSchema});
  need(JSON.stringify(loadStyleCohort(this.root,options))===JSON.stringify(comparisonCohort),'风格审查期间实际展示版本或证据变化，须使用新请求复核','style-cohort-changed');
  style.sourceSha256=sourceSha256;style.comparisonCohort=comparisonCohort;if(this.client.lastReviewReceipt)style.reviewReceipt=this.client.lastReviewReceipt;
  if(this.client.reviewerMetadata?.mode==='evidence-only-fresh-codex-cli'){const evaluator=read(this.root,this.dir+'/calibration-review.json');style=consumeCliReview({root:this.root,client:this.client,role:'style-review',context:{sourceSha256,reviewerId:evaluator.reviewer.id,calibrationRunId:evaluator.runId,comparisonCohort,frames:[...packet.frames].map(([id,{role,label,path,sha256}])=>({id,role,label,path,sha256}))},report:style})}
  this.save(plan.id+'-style-review.json',style);return style.decision==='distinct'&&comparisonCohort.some(c=>c.id===style.nearestId)&&!style.openingAndAssetBothRepeated&&style.comparisons.length===4&&new Set(style.comparisons.map(c=>c.dimension)).size===4&&style.comparisons.filter(c=>c.different).length>=3&&style.comparisons.every(c=>c.finding.length>=30);
 }
}
