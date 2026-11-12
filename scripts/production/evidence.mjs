import fs from 'node:fs';
import crypto from 'node:crypto';
import {safeFile,verifyEvidence,verifyFrame,loadQualityPolicy,validateCalibration,validateReview} from '../quality-gate.mjs';
import {loadCollection,fingerprint,child} from '../collection.mjs';
import {ProductionError,imageInput,hash} from './api.mjs';
import {calibrationSchema,reviewSchema} from './schemas.mjs';
import {visualContractHash,validateVisualReview} from './visual-contract.mjs';
import {consumeCliReview} from './review-consumption.mjs';

const need=(ok,message)=>{if(!ok)throw new ProductionError('invalid-review',message)};
export class FrameSet {
 constructor(root){this.root=root;this.frames=new Map()}
 add(role,evidence,label){verifyEvidence(this.root,[evidence]);const id=role+'-'+this.frames.size;this.frames.set(id,{...evidence,role,label});return id}
 inputs({deduplicate=false}={}){
  if(!deduplicate)return [...this.frames].flatMap(([id,e])=>imageInput(safeFile(this.root,e.path),id+' '+e.label));
  // Identical screenshots still retain every contextual frame ID in the
  // report, but the visual reviewer only needs one copy of the same pixels.
  const groups=new Map();
  for(const [id,e] of this.frames){verifyEvidence(this.root,[e]);const key=e.role+':'+e.sha256;if(!groups.has(key))groups.set(key,{e,labels:[]});groups.get(key).labels.push(id+' '+e.label)}
  return [...groups.values()].flatMap(({e,labels})=>imageInput(safeFile(this.root,e.path),labels.join('\n')+(labels.length>1?'\nThese frame IDs have identical verified pixels. Each retains its own capture context.':'')));
 }
 ids(role){return [...this.frames].filter(([,e])=>e.role===role).map(([id])=>id)}
 resolve(ids,role){need(Array.isArray(ids)&&ids.length>0,'审查缺少具体画面依据');return ids.map(id=>{const e=this.frames.get(id);need(e&&e.role===role,'审查引用了错误对象或不存在的画面');return {path:e.path,sha256:e.sha256}})}
}
export function loadCohort(root,capturePath='docs/evidence/quality-calibration/capture.json'){
 const {calibration}=loadQualityPolicy(root),capture=JSON.parse(fs.readFileSync(safeFile(root,capturePath),'utf8'));
 need(capture.result==='captured-not-scored','先取得六份真实设计的完整对照证据');
 const collection=loadCollection(root);
 return [calibration.baseline,...calibration.negatives].map(sample=>{
  const entry=collection.templates.find(x=>x.id===sample.id),page=capture.pages.find(x=>x.id===sample.id);
  need(entry&&page?.sourceSha256===sample.sourceSha256&&fingerprint(entry,root)===sample.sourceSha256,'比较样本源码已经变化');
  verifyEvidence(root,page.evidence);
  const states=[];
  for(const width of [1440,390]){
   const frames=page.evidence.filter(x=>x.name.startsWith(width+'-scroll-'));
   const opening=page.evidence.find(x=>x.name===width+'-opening');
   need(opening&&frames.length>=3,'比较样本缺少完整路径');
   const ending=frames.find(e=>e.name.startsWith(width+'-scroll-1-'));
   // The frozen benchmark is a four-chapter stage: 1/6 and 1/2 are
   // deliberately dark crossfades, not its settled chapter compositions.
   const stagedBenchmark=sample.id===calibration.baseline.id&&width===1440;
   const transition=stagedBenchmark?frames.find(e=>e.name.startsWith(width+'-scroll-0.33-')):frames[0];
   const middle=frames.find(e=>e.name.startsWith(width+(stagedBenchmark?'-scroll-0.67-':'-scroll-0.5-')))??frames.find(e=>e.name.startsWith(width+'-scroll-0.67-'));
   need(ending&&middle,'比较样本缺少真实中段或到达结尾的画面，不能使用反向返回开场帧');
   need(transition,'基准缺少实际章节状态');
   for(const [state,e] of [['opening',opening],['transition',transition],['middle',middle],['ending',ending]])states.push({...e,state,viewport:width===1440?'desktop':'mobile'});
  }
  return {...sample,states,evidence:page.evidence,motion:page.motion,viewports:page.viewports};
 });
}
export async function calibrate({root,client,cohort,runId,save,runDirectory}){
 const {calibration}=loadQualityPolicy(root),packet=new FrameSet(root),labels=new Map();
 const cliReview=client.reviewerMetadata?.mode==='evidence-only-fresh-codex-cli';
 need(!cliReview||runDirectory,'CLI 校准须先保存当前运行的私有顺序，不能在缺少运行目录时请求审查');
 const orderFile=runDirectory?runDirectory+'/calibration-order-private.json':undefined;
 let shuffled;
 if(orderFile&&fs.existsSync(child(root,orderFile))){
  const order=JSON.parse(fs.readFileSync(child(root,orderFile),'utf8'));
  need(order.runId===runId&&order.samples?.length===6&&new Set(order.samples.map(s=>s.id)).size===6,'校准恢复顺序不属于当前运行');
  shuffled=order.samples.map((item,index)=>{
   const sample=cohort.find(c=>c.id===item.id);
   need(item.label===String.fromCharCode(65+index)&&sample?.sourceSha256===item.sourceSha256&&JSON.stringify(sample.states.map(({viewport,state,path,sha256})=>({viewport,state,path,sha256})))===JSON.stringify(item.states),'校准恢复样本或实际四态已经变化');
   return {x:sample};
  });
 }else{
  shuffled=cohort.map(x=>({x,key:crypto.randomBytes(12).toString('hex')})).sort((a,b)=>a.key.localeCompare(b.key));
  if(orderFile)save('calibration-order-private.json',{schemaVersion:1,runId,samples:shuffled.map(({x},index)=>({label:String.fromCharCode(65+index),id:x.id,sourceSha256:x.sourceSha256,states:x.states.map(({viewport,state,path,sha256})=>({viewport,state,path,sha256}))}))});
 }
 shuffled.forEach(({x},index)=>{const label=String.fromCharCode(65+index);labels.set(label,x);x.states.forEach(e=>packet.add('sample',e,`${label} ${e.viewport} ${e.state}`))});
 const orderEvidence=cliReview?{path:orderFile,sha256:hash(fs.readFileSync(safeFile(root,orderFile)))}:undefined;
 const result=await client.json({role:'calibration',instructions:fs.readFileSync(safeFile(root,'docs/production/prompts/CALIBRATE_REVIEWER.md'),'utf8')+' 每个finding至少30字符。',text:'评估开场、字体与媒体、素材质感、整页收束和手机构图。逐个输出标签与 verdict。',images:packet.inputs(),schema:calibrationSchema});
 need(result.labels?.length===6&&new Set(result.labels.map(x=>x.label)).size===6,'校准必须逐项覆盖六个匿名样本');
 let report={schemaVersion:2,purpose:'reviewer-calibration',calibrationRevision:calibration.revision,runId,reviewer:{id:client.model+':'+runId,mode:'blind-evidence-only',implementationContextIncluded:false,...client.reviewerMetadata},samples:result.labels.map(item=>{
  const sample=labels.get(item.label);need(sample,'未知校准标签');return {id:sample.id,sourceSha256:sample.sourceSha256,verdict:item.verdict,finding:item.finding,evidence:sample.states.map(({viewport,path,sha256})=>({viewport,path,sha256}))};
 })};
 if(cliReview)report=await consumeCliReview({root,client,role:'calibration',context:{calibrationRevision:calibration.revision,runId,reviewerId:client.model+':'+runId,order:orderEvidence},report});
 else if(client.lastReviewReceipt)report.reviewReceipt=client.lastReviewReceipt;
 save('calibration-review.json',report);validateCalibration(root,report,calibration);return report;
}
export function addCapture(packet,role,capture){
 need(capture.result==='captured-not-scored'&&capture.states?.length===8&&capture.errors?.length===0,'加载或采证失败，不能进行视觉放行');
 capture.states.forEach(s=>s.evidence.forEach(e=>packet.add(role,e,`${s.viewport} ${s.state}`)));
 // Actual forward/reverse/leave/reduced sequences, rather than image changes inferred from code.
 for(const m of capture.motion)m.evidence.forEach((e,i)=>packet.add(role,e,`${m.viewport} ${m.input}${m.context?' '+m.context:''} process ${i} (ordered)`));
}
function addBenchmarkProcess(packet,benchmark){
 const evidence=benchmark.evidence;
 need(Array.isArray(evidence)&&evidence.length>0&&new Set(evidence.map(e=>e.name)).size===evidence.length,'基准缺少完整原始过程证据或存在重复命名');
 need(Array.isArray(benchmark.motion),'基准缺少实际输入记录');
 verifyEvidence(packet.root,evidence);
 const byName=new Map(evidence.map(e=>[e.name,e])),process=[],used=new Set();
 const frame=name=>{const e=byName.get(name);need(e,'基准缺少实际过程画面：'+name);return e};
 const add=(viewport,context,input,frames,limitations)=>{
  const ids=frames.map((e,i)=>{verifyFrame(packet.root,[e],viewport);used.add(e.name);return packet.add('benchmark',e,`${viewport} ${context} process ${i} (recorded order) capture ${e.name}`)});
  process.push({viewport,context,input,frames:ids,originalCaptureNames:frames.map(e=>e.name),...(limitations?{limitations}:{})});
 };
 for(const [width,viewport,expected]of [[1440,'desktop',[.16,.33,.5,.67,.84,1,.5,0]],[390,'mobile',[.33,.67,1,0]]]){
  const scroll=evidence.filter(e=>e.name.startsWith(width+'-scroll-'));
  const records=benchmark.motion.filter(m=>m.width===width&&m.input==='native-wheel');
  need(scroll.length===expected.length&&records.length===expected.length&&scroll.every((e,i)=>{
   const match=e.name.match(/^(1440|390)-scroll-([\d.]+)-(\d+)$/);
   return match&&Number(match[2])===expected[i]&&records[i].requested===expected[i]&&(i===0||Number(match[3])>Number(scroll[i-1].name.match(/-(\d+)$/)[1]));
  }),'基准缺少完整、按实录顺序的正反滚动过程：'+width);
  add(viewport,'scroll','native-wheel',[frame(width+'-opening'),...scroll],width===390?'The recorded mobile input was native-wheel; these frames do not establish a finger/touch gesture.':undefined);
  if(width===1440){
   const pointer=benchmark.motion.filter(m=>m.width===width&&(m.input==='pointer'||m.input==='leave-stop'));
   need(pointer.length===3&&pointer[0].input==='pointer'&&pointer[0].fraction===.2&&pointer[1].input==='pointer'&&pointer[1].fraction===.8&&pointer[2].input==='leave-stop','基准缺少实际指针移动和离开记录');
   add(viewport,'pointer','pointer, leave-stop',['1440-pointer-0.2','1440-pointer-0.8','1440-pointer-leave'].map(frame),'Only the two recorded pointer positions and leave/stop are supplied; no additional reverse path was captured.');
   add(viewport,'hold-release','held/released captures',['1440-held','1440-released'].map(frame));
  }
  add(viewport,'reduced','reduced-motion capture',[frame(width+'-reduced')],'This is the recorded reduced-motion reload viewport, not a recorded pointer, hold or touch sequence under reduced motion.');
 }
 // Do not silently drop an additional original capture if the frozen packet
 // gains evidence that this process mapping does not yet understand.
 need(used.size===evidence.length,'基准有未映射的原始过程画面，须先补齐过程上下文');
 return process;
}
export function buildReviewPacket({root,cohort,reference,candidate}){
 const packet=new FrameSet(root),benchmark=cohort?.[0];
 need(benchmark?.states?.length===8,'基准缺少桌面和手机的八个稳定状态');
 benchmark.states.forEach(e=>{verifyFrame(root,[e],e.viewport);packet.add('benchmark',e,`${e.viewport} ${e.state}`)});
 const benchmarkProcess=addBenchmarkProcess(packet,benchmark);
 cohort.slice(1).forEach((p,i)=>p.states.filter(e=>e.state==='opening'||e.state==='ending').forEach(e=>packet.add('negative',e,`user-rejected ${i+1} ${e.viewport} ${e.state}`)));
 addCapture(packet,'reference',reference);if(candidate)addCapture(packet,'candidate',candidate);
 return {packet,benchmarkProcess};
}
export async function review({root,client,cohort,evaluator,phase,reference,candidate,expectedSignatures=[],visualContract,save,filename}){
 const {calibration}=loadQualityPolicy(root),{packet,benchmarkProcess}=buildReviewPacket({root,cohort,reference,candidate});
 const role=phase==='reference'?'reference':'candidate';
 const result=await client.json({role:phase+'-review',instructions:fs.readFileSync(safeFile(root,'docs/production/prompts/REVIEW_PAIR.md'),'utf8'),text:JSON.stringify({phase,compareRole:role,frameRoles:{benchmark:packet.ids('benchmark'),negative:packet.ids('negative'),reference:packet.ids('reference'),candidate:packet.ids('candidate')},requiredDimensions:calibration.dimensions,visualContract,expectedSignatures:expectedSignatures.map(f=>({name:f.name,visualPurpose:f.visualPurpose})),benchmarkProcess,motionOrder:'Each context retains its recorded order. Benchmark input names and limitations are listed in benchmarkProcess. Reference and candidate process order follows their captured motion records; do not infer unrecorded gestures or reduced-motion interaction.',purpose:'直接展示产品/作品/服务及行动的1–5屏完整可编辑页面，少占位文字。'}),images:packet.inputs({deduplicate:true}),schema:reviewSchema,maxOutputTokens:10000});
 let report={schemaVersion:2,phase,calibrationRevision:calibration.revision,benchmarkSha256:calibration.baseline.sourceSha256,sourceSha256:candidate?.sourceSha256??null,reviewer:{...evaluator.reviewer,inputScope:phase==='reference'?'benchmark+negative+reference':'benchmark+negative+reference+candidate',calibrationRunId:evaluator.runId},decision:result.decision,vetoes:result.decision==='admit'?[]:result.fixTasks,states:(candidate??reference).states,dimensions:result.dimensions.map(d=>({...d,benchmarkEvidence:packet.resolve(d.benchmarkFrames,'benchmark'),candidateEvidence:packet.resolve(d.candidateFrames,role)})),signatureFeatures:result.signatureFeatures.map(f=>({...f,role:'signature',referenceEvidence:packet.resolve(f.referenceFrames,'reference'),...(phase==='prototype'?{candidateEvidence:packet.resolve(f.candidateFrames,'candidate')}:{})})),motion:result.motion.map(m=>({...m,evidence:packet.resolve(m.frames,role)})),nextAction:result.nextAction,fixTasks:result.fixTasks};
 need(new Set(result.dimensions.map(d=>d.key)).size===7&&result.dimensions.length===7,'审查遗漏了品质维度');
 need(result.decision!=='admit'||result.nextAction==='admit','审查结论和修正任务冲突');
 // Missing/changed core features always replace the direction, even when a model asks for a cosmetic fix.
 if(result.signatureFeatures.some(f=>!f.core||!f.retained||!f.sceneLevel)){report.decision='reject';report.nextAction='replace-direction';report.vetoes.push('核心视觉特征丢失，不能用总评通过抵消');report.fixTasks.push('核心失败退回静态计划，不进行局部收尾')}
 if(result.dimensions.some(d=>d.againstBenchmark==='below')){report.decision='reject';report.nextAction='replace-direction';report.vetoes.push('存在低于基准的品质维度');report.fixTasks.push('修改静态计划和试片后重新比较，不允许平均补偿')}
 if(expectedSignatures.some(f=>!result.signatureFeatures.some(x=>x.name===f.name))){report.decision='reject';report.nextAction='replace-direction';report.vetoes.push('试片审查遗漏了母版核心特征');report.fixTasks.push('重新选择能保留全部核心特征的方向')}
 report.visualContract=visualContract;report.visualContractSha256=visualContractHash(visualContract);
 report.stateChecks=result.stateChecks.map(({frames,...c})=>({...c,evidence:packet.resolve(frames,role)}));
 report.continuityChecks=result.continuityChecks.map(({frames,...c})=>({...c,evidence:packet.resolve(frames,role)}));
 const preservation=[...report.stateChecks.flatMap(c=>['subject','material','composition','role'].map(k=>c[k])),...report.continuityChecks.map(c=>c.status)];
 if(preservation.some(s=>s!=='preserved')){const lost=preservation.includes('lost')||report.decision==='reject';report.decision=lost?'reject':'evidence-needed';report.nextAction=lost?'replace-direction':'recapture';report.vetoes.push('四状态主体、材质、构图、作用或身份关系未完整保留');report.fixTasks.push('修订已锁定的视觉合同或补齐实际状态证据，不能用局部润色抵消核心失败')}
 if(report.decision==='reject'&&!report.vetoes.length){report.vetoes.push('独立视觉审查拒绝此版本，不能继续打包');report.fixTasks.push('按成对画面中的明确差距修订静态计划')}
 if(client.reviewerMetadata?.mode==='evidence-only-fresh-codex-cli')report=await consumeCliReview({root,client,role:phase+'-review',context:{calibrationRevision:calibration.revision,benchmarkSha256:calibration.baseline.sourceSha256,sourceSha256:candidate?.sourceSha256??null,reviewerId:evaluator.reviewer.id,calibrationRunId:evaluator.runId,states:(candidate??reference).states,frames:[...packet.frames].map(([id,{role,label,path,sha256}])=>({id,role,label,path,sha256}))},report});
 else if(client.lastReviewReceipt)report.reviewReceipt=client.lastReviewReceipt;
 save(filename,report);
 if(report.decision==='admit'){validateReview(root,report,calibration,phase,candidate?.sourceSha256);validateVisualReview(root,report,visualContract)}
 return report;
}
