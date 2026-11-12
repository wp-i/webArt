import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {BrowserPage} from './browser.mjs';
import {nativePositionTo} from './native-scroll.mjs';
import {ProductionError} from './api.mjs';
import {deviceMetrics} from './device-metrics.mjs';

const need=(value,message)=>{if(!value)throw new ProductionError('performance-gate',message)};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const file=(root,name)=>{need(typeof name==='string'&&/^[\w./-]+$/.test(name)&&!name.split('/').some(s=>!s||s==='..'||s==='.'),'性能记录路径无效');const target=path.resolve(root,name);need(target.startsWith(path.resolve(root)+path.sep),'性能记录越界');let current=root;for(const s of name.split('/')){current=path.join(current,s);need(!fs.lstatSync(current).isSymbolicLink(),'性能记录不允许链接')}return target};
export function loadPerformancePolicy(root){
 const bytes=fs.readFileSync(path.join(root,'webart.performance.json')),policy=JSON.parse(bytes);
 need(policy.schemaVersion===1&&policy.revision==='2026-10-18-page-design-budget-v1'&&policy.sampleMs>=1000&&policy.sampleMs<=2000&&policy.settleMs>=1000&&policy.settleMs<=2000,'性能预算缺失或采样不足');
 const expected=[['desktop',1440,900,1,1,34,75,100],['mobile-stress',390,844,2,4,50,100,160]];
 need(policy.profiles?.length===2&&expected.every(([id,width,height,dpr,cpu,p95,p99,long])=>{const p=policy.profiles.find(p=>p.id===id);return p&&p.width===width&&p.height===height&&p.dpr===dpr&&p.cpu===cpu&&p.rafP95Ms>0&&p.rafP95Ms<=p95&&p.rafP99Ms>0&&p.rafP99Ms<=p99&&p.longTaskMaxMs>0&&p.longTaskMaxMs<=long}),'不能降低五宽度 QA 以外的性能压力配置');
 const maxima={renderFps:31,drawCallsPerFrame:100,trianglesPerFrame:360000,drawingBufferPixels:4500000,idleDrawCalls:0,reducedDrawCalls:0,hiddenDrawCalls:0};
 need(Object.keys(maxima).every(k=>Number.isFinite(policy.limits?.[k])&&policy.limits[k]>=0&&policy.limits[k]<=maxima[k]),'性能预算不能放宽');
 need(JSON.stringify(policy.historicalReadOnly)===JSON.stringify(['be63cc3efc3ada19053f19ef3d0d3e7f568d4e367f9b0aeafd8ac3d92740a3de']),'不能增加历史性能豁免');
 return {policy,sha256:sha(bytes)};
}
export function validatePerformancePlan(plan){
 need(plan?.schemaVersion===1&&['dom','local-3d'].includes(plan.mode)&&Object.keys(plan.states??{}).sort().join(',')==='ending,middle,opening,transition','性能计划须锁定全部四状态');
 need(Object.values(plan.states).every(fps=>[0,30].includes(fps)),'只允许静态或最多 30 帧的局部 3D 状态');
 need(plan.mode!=='local-3d'||Object.values(plan.states).includes(0),'局部 3D 不能贯穿全页持续重绘');return plan;
}
export function performanceFailures(report,policy,plan){
 const failures=[],add=(ok,message)=>{if(!ok)failures.push(message)};
 add(report?.schemaVersion===1&&report.measurement==='native-input-browser-gl-v1','缺少真实浏览器测量');
 const checks=report?.checks??[];
 add(checks.length===policy.profiles.length*10,'性能状态数量不足');
 for(const profile of policy.profiles)for(const [mode,states] of [['normal',Object.keys(plan.states)],['reduced',Object.keys(plan.states)],['native',['roundtrip']],['hidden',['background']]])for(const state of states){
  const list=checks.filter(c=>c.profile===profile.id&&c.mode===mode&&c.state===state);add(list.length===1,`${profile.id}/${mode}/${state} 重复或缺失`);if(list.length!==1)continue;
  const c=list[0],tag=`${profile.id}/${mode}/${state}`;
  add(c.cpu===profile.cpu&&c.width===profile.width&&c.height===profile.height&&c.dpr===profile.dpr&&c.durationMs>=policy.sampleMs*.95,tag+' 压力/采样时长不符');
  add(c.actualMode===plan.mode,tag+' 实际渲染方式不符');
  if(mode==='hidden')add(c.visibility==='hidden',tag+' 未真实进入后台');
  else{
   add(c.visibility==='visible',tag+' 前台状态不可见');
   // Browsers may suppress compositor callbacks when nothing changes. Idle
   // cadence is not stutter: assert no GPU work and no main-thread long tasks.
   if(mode==='native'||mode==='normal'&&plan.states[state]>0)add(c.rafSamples>=15&&Number.isFinite(c.rafP95Ms)&&c.rafP95Ms<=profile.rafP95Ms&&Number.isFinite(c.rafP99Ms)&&c.rafP99Ms<=profile.rafP99Ms,tag+' 动态帧耗时超预算');
   add(Number.isFinite(c.longTaskMaxMs)&&c.longTaskMaxMs<=profile.longTaskMaxMs,tag+' 出现长任务');
  }
  add(Number.isFinite(c.drawCalls)&&c.drawCalls>=0&&Number.isFinite(c.renderFrames)&&c.renderFrames>=0,tag+' 缺实际 GPU 计数');
  add(c.drawingBufferPixels<=policy.limits.drawingBufferPixels&&c.peakDrawCalls<=policy.limits.drawCallsPerFrame&&c.peakTriangles<=policy.limits.trianglesPerFrame,tag+' 场景超过静态预算');
  if(mode==='normal'&&plan.states[state]===0||mode==='reduced'||mode==='hidden')add(c.drawCalls===0&&c.renderFrames===0,tag+' 无变化状态仍持续绘制');
  else add(c.renderFrames/(c.durationMs/1000)<=policy.limits.renderFps,tag+' 实时绘制帧率超预算');
  if(mode==='normal'&&plan.mode==='local-3d'&&plan.states[state]>0)add(c.renderFrames>=10,tag+' 动态被静态替代');
  if(mode==='native')add(c.cold===true&&c.reachedEnd&&c.returnedToOpening,tag+' 未完成首次进入时的真实正反输入');
 }
 return failures;
}
export function validatePerformanceReport(report,{policy,sha256},plan,digest){
 validatePerformancePlan(plan);need(report.sourceSha256===digest&&report.policySha256===sha256&&JSON.stringify(report.plan)===JSON.stringify(plan),'性能证据源码/预算/状态已过期');
 const failures=performanceFailures(report,policy,plan);need(report.result==='passed-performance-budget'&&!failures.length,failures.join('；')||'性能未通过');return true;
}
export function assertPerformanceDelivery(root,handoff,digest,{allowHistorical=false}={}){
 const loaded=loadPerformancePolicy(root);
 const originalContract=['renderers/pace-precision-v1/contract.json','.webart/prototypes/010-precision-responsive-20261016/contract.json'].includes(handoff.qualityReview);
 if(allowHistorical&&originalContract&&loaded.policy.historicalReadOnly.includes(digest)&&!handoff.performance)return {historicalReadOnly:true};
 const item=handoff.performance;need(item?.capture&&/^[a-f0-9]{64}$/.test(item.sha256??''),'缺少实际性能报告，不能打包/登记');
 const bytes=fs.readFileSync(file(root,item.capture));need(sha(bytes)===item.sha256,'性能证据被改写');
 const contract=JSON.parse(fs.readFileSync(file(root,handoff.qualityReview),'utf8'));
 validatePerformanceReport(JSON.parse(bytes),loaded,contract.performance,digest);return true;
}

// Inject observers before navigation. Wrappers call the real browser methods
// unchanged: no scene API, scroll forcing, fake frame counts or visual shortcut.
const instrument=`(()=>{
 const stats={drawCalls:0,renderFrames:0,triangles:0,peakDrawCalls:0,peakTriangles:0,frameDraws:0,frameTriangles:0,pixels:0,gpu:null};
 const context=gl=>{stats.pixels=Math.max(stats.pixels,gl.drawingBufferWidth*gl.drawingBufferHeight);if(!stats.gpu){const ext=gl.getExtension('WEBGL_debug_renderer_info');stats.gpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)}};
 for(const Type of [window.WebGLRenderingContext,window.WebGL2RenderingContext])if(Type){
  const proto=Type.prototype;
  for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced'])if(Object.hasOwn(proto,name)){
   const original=proto[name];proto[name]=function(...args){stats.drawCalls++;stats.frameDraws++;const instances=name.includes('Instanced')?args.at(-1):1,count=name.startsWith('drawElements')?args[1]:args[2],triangles=args[0]===this.TRIANGLES?count/3*instances:0;stats.triangles+=triangles;stats.frameTriangles+=triangles;stats.peakDrawCalls=Math.max(stats.peakDrawCalls,stats.frameDraws);stats.peakTriangles=Math.max(stats.peakTriangles,stats.frameTriangles);stats.pixels=Math.max(stats.pixels,this.drawingBufferWidth*this.drawingBufferHeight);if(!stats.gpu){const ext=this.getExtension('WEBGL_debug_renderer_info');stats.gpu=ext?this.getParameter(ext.UNMASKED_RENDERER_WEBGL):this.getParameter(this.RENDERER)}return original.apply(this,args)};
  }
  if(Object.hasOwn(proto,'clear')){const original=proto.clear;proto.clear=function(...args){context(this);stats.renderFrames++;stats.frameDraws=stats.frameTriangles=0;return original.apply(this,args)}}
 }
 let sample,observer;
 window.__webartPerformanceStart=()=>{const intervals=[],longTasks=[],start=performance.now(),initial={...stats};let last=start,raf;
  observer?.disconnect();observer=new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.startTime>=start)longTasks.push(e.duration)});observer.observe({type:'longtask'});
  const tick=now=>{intervals.push(now-last);last=now;raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick);
  stats.peakDrawCalls=stats.peakTriangles=stats.frameDraws=stats.frameTriangles=0;
  sample={finish(){cancelAnimationFrame(raf);for(const e of observer.takeRecords())if(e.startTime>=start)longTasks.push(e.duration);observer.disconnect();intervals.sort((a,b)=>a-b);return{durationMs:performance.now()-start,rafSamples:intervals.length,rafP95Ms:intervals[Math.floor(intervals.length*.95)]??null,rafP99Ms:intervals[Math.floor(intervals.length*.99)]??null,longTaskMaxMs:Math.max(0,...longTasks),drawCalls:stats.drawCalls-initial.drawCalls,renderFrames:stats.renderFrames-initial.renderFrames,peakDrawCalls:stats.peakDrawCalls,peakTriangles:stats.peakTriangles,drawingBufferPixels:stats.pixels,gpu:stats.gpu,actualMode:stats.gpu?'local-3d':'dom',visibility:document.visibilityState}}};
 };window.__webartPerformanceFinish=()=>sample.finish();
})()`;

export async function inspectPerformance({root,endpoint,url,plan,output,sourceSha256,signal}){
 const loaded=loadPerformancePolicy(root),{policy}=loaded,configuration=validatePerformancePlan(plan.performance),page=await BrowserPage.create(endpoint,signal);
 const report={schemaVersion:1,measurement:'native-input-browser-gl-v1',started:new Date().toISOString(),sourceSha256,policySha256:loaded.sha256,plan:configuration,url,checks:[],limitations:'Task-browser Intel/ANGLE GPU; CPU slowdown and high-DPR emulation are pressure tests, not a physical mobile GPU certification.'};
 const wait=ms=>new Promise((resolve,reject)=>{const t=setTimeout(resolve,ms);if(signal?.aborted){clearTimeout(t);reject(new Error('Cancelled'))}});
 const ready=async()=>{for(let i=0;i<120;i++){if(await page.evaluate(plan.prototypeCapture.ready))return;await wait(100)}throw new ProductionError('performance-gate','主视觉未就绪')};
 const start=()=>page.evaluate('window.__webartPerformanceStart()');
 const finish=async(profile,mode,state)=>{const check={profile:profile.id,width:profile.width,height:profile.height,dpr:profile.dpr,cpu:profile.cpu,mode,state,...await page.evaluate('window.__webartPerformanceFinish()')};report.checks.push(check);return check};
 try{
  await page.page('Page.addScriptToEvaluateOnNewDocument',{source:instrument});
  for(const profile of policy.profiles){
   await page.viewport(profile.width,profile.height);await page.page('Emulation.setDeviceMetricsOverride',deviceMetrics(profile.width,profile.height,profile.dpr));await page.page('Emulation.setCPUThrottlingRate',{rate:profile.cpu});await page.page('Page.bringToFront');await page.navigate(url);await ready();
   // Measure the first entry before the four-state tour warms hidden materials.
   await start();const end=await nativePositionTo(page,1,{settleMs:200}),begin=await nativePositionTo(page,0,{settleMs:200});await wait(policy.sampleMs);const motion=await finish(profile,'native','roundtrip');
   const location=await page.evaluate('({y:scrollY,max:Math.max(0,document.documentElement.scrollHeight-innerHeight)})');motion.cold=true;motion.reachedEnd=Boolean(end);motion.returnedToOpening=Boolean(begin)&&location.y<2;
   for(const mode of ['normal','reduced']){
    await page.page('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:mode==='reduced'?'reduce':'no-preference'}]});
    for(const state of Object.keys(configuration.states)){
     const positions=plan.prototypeCapture.states[profile.width<700?'mobile':'desktop']??plan.prototypeCapture.states;
     await nativePositionTo(page,positions[state],{settleMs:policy.settleMs});await start();await wait(policy.sampleMs);await finish(profile,mode,state);
    }
   }
   await page.page('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await nativePositionTo(page,0,{settleMs:policy.settleMs});
   await wait(policy.settleMs);const other=await page.send('Target.createTarget',{url:'about:blank'});
   try{await wait(150);await start();await wait(policy.sampleMs);await finish(profile,'hidden','background')}finally{await page.send('Target.closeTarget',{targetId:other.targetId});await page.page('Page.bringToFront')}
  }
  report.failures=performanceFailures(report,policy,configuration);report.result=report.failures.length?'failed-performance-budget':'passed-performance-budget';
 }catch(error){report.result='failed-performance-budget';report.failure=error.message;throw error}
 finally{report.finished=new Date().toISOString();const target=path.resolve(root,output);need(target.startsWith(path.resolve(root)+path.sep),'性能输出越界');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');await page.page('Emulation.setCPUThrottlingRate',{rate:1}).catch(()=>{});await page.close()}
 return report;
}
