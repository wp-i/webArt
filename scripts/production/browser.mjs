import fs from 'node:fs';
import path from 'node:path';
import {child} from '../collection.mjs';
import {browserMediaInventory} from '../browser-media-inventory.mjs';
import {ProductionError,hash} from './api.mjs';
import {validateRenderingPlan,failureModes} from './rendering.mjs';
import {assertReferenceSelection} from './references.mjs';
import {deviceMetrics,deviceAgent} from './device-metrics.mjs';
import {inspectNativeRange} from './native-range.mjs';

const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function assertControlActionStart(browser,declaration,resultCheck){
 if(declaration?.prepare&&!await browser.evaluate(declaration.prepare.check))throw new ProductionError('controls-failed','控件行动前的固定准备状态已丢失');
 if(resultCheck&&await browser.evaluate(resultCheck))throw new ProductionError('controls-failed','控件行动前目标结果已成立，不能证明本次输入有效');
}
async function prepareControlAction({browser,declaration,resultCheck,input,root,output,evidence}){
 if(!declaration?.prepare)return;
 const p=declaration.prepare,keys={Home:36,End:35,ArrowRight:39,ArrowLeft:37};
 if(typeof p.selector!=='string'||!Array.isArray(p.keys)||!p.keys.length||p.keys.length>4||p.keys.some(k=>!keys[k])||typeof p.check!=='string')throw new ProductionError('controls-failed','控件前置状态须为固定原生键盘操作及实际结果');
 const at=await browser.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(p.selector)});if(!e)throw Error('Missing prerequisite control');const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await browser.page('Input.dispatchMouseEvent',{type:'mouseMoved',...at});await browser.page('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...at});await browser.page('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...at});
 for(const key of p.keys){await browser.page('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:keys[key]});await browser.page('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:keys[key]})}await delay(150);
 await assertControlActionStart(browser,declaration,resultCheck);
 evidence.push({state:input+'-prepared',...await browser.shot(root,output+'-'+input+'-prepared.jpg')});
}
export class BrowserPage {
 static async create(endpoint,signal){
  if(!/^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\//.test(endpoint))throw new ProductionError('browser-configuration','只连接任务浏览器');
  const instance=new BrowserPage();instance.ws=new WebSocket(endpoint);instance.pending=new Map();instance.serial=0;
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new ProductionError('browser-timeout','任务浏览器未连接')),12000);instance.ws.addEventListener('open',()=>{clearTimeout(t);resolve()},{once:true});instance.ws.addEventListener('error',()=>{clearTimeout(t);reject(new ProductionError('browser-unavailable','任务浏览器不可用'))},{once:true})});
  instance.ws.addEventListener('message',({data})=>{const m=JSON.parse(data),p=instance.pending.get(m.id);if(p){clearTimeout(p.timer);instance.pending.delete(m.id);m.error?p.reject(new ProductionError('browser-command',m.error.message)):p.resolve(m.result)}});
  instance.ws.addEventListener('close',()=>{for(const p of instance.pending.values()){clearTimeout(p.timer);p.reject(new ProductionError('browser-disconnected','任务浏览器中断'))}instance.pending.clear()});
  const created=await instance.send('Target.createTarget',{url:'about:blank'});instance.target=created.targetId;
  instance.sid=(await instance.send('Target.attachToTarget',{targetId:instance.target,flatten:true})).sessionId;
  await instance.page('Page.enable');await instance.page('Runtime.enable');
  if(signal){instance.abort=()=>instance.close();signal.addEventListener('abort',instance.abort,{once:true});instance.signal=signal}
  return instance;
 }
 send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++this.serial,timer=setTimeout(()=>{this.pending.delete(id);reject(new ProductionError('browser-timeout',method+' 超时'))},15000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))})}
 page(method,params={}){return this.send(method,params,this.sid)}
 async evaluate(expression){const result=await this.page('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new ProductionError('browser-evaluation','浏览器状态检查失败');return result.result.value}
 async viewport(width,height){this.deviceBrowserVersion??=await this.send('Browser.getVersion');await this.page('Emulation.setUserAgentOverride',deviceAgent(this.deviceBrowserVersion,width));await this.page('Emulation.setDeviceMetricsOverride',deviceMetrics(width,height));await this.page('Emulation.setTouchEmulationEnabled',{enabled:width<700,maxTouchPoints:1});await this.page('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]})}
 async navigate(url){const target=new URL(url),navigation=await this.page('Page.navigate',{url});if(navigation.errorText)throw new ProductionError('evidence-needed','页面导航失败，不能当作已审查');for(let i=0;i<100;i++){try{if(await this.evaluate(`location.protocol===${JSON.stringify(target.protocol)}&&location.hostname.replace(/^www\\./,'')===${JSON.stringify(target.hostname.replace(/^www\./,''))}&&location.port===${JSON.stringify(target.port)}&&document.readyState==='complete'&&document.fonts.status==='loaded'&&[...document.images].filter(e=>{const r=e.getBoundingClientRect();return r.width>100&&r.top<innerHeight&&r.bottom>0}).every(e=>e.complete&&e.naturalWidth>0)`)){await delay(450);return}}catch(error){if(!/navigated|context.*(?:destroyed|found)|closed/i.test(error.message))throw error}await delay(100)}throw new ProductionError('evidence-needed','页面未完成加载，不能当作已审查')}
 async shot(root,relative){const data=await this.page('Page.captureScreenshot',{format:'jpeg',quality:88,captureBeyondViewport:false}),bytes=Buffer.from(data.data,'base64'),filename=child(root,relative);fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,bytes);return {path:relative,sha256:hash(bytes)}}
 async close(){if(this.closed)return;this.closed=true;if(this.signal)this.signal.removeEventListener('abort',this.abort);if(this.ws.readyState===1){await this.send('Target.closeTarget',{targetId:this.target}).catch(()=>{});this.ws.close()}}
}
export function referenceUrl(value){
 let url;try{url=new URL(value)}catch{throw new ProductionError('invalid-reference','参考网址无效')}
 if(url.protocol!=='https:'||url.username||url.password||url.port||/^(localhost|.*\.local|.*\.localhost|127\..*|0\..*|10\..*|192\.168\..*|172\.(1[6-9]|2\d|3[01])\..*|\[.*\])$/i.test(url.hostname)||/^\d/.test(url.hostname))throw new ProductionError('invalid-reference','参考必须是公开 HTTPS 网页');return url.href;
}
export function checkContentBudget(measured,budget){
 const failures=[];
 if(measured.characters>budget.totalCharacters)failures.push('页面占位文字超出已锁定总量');
 if(measured.paragraphs.some(length=>length>budget.paragraphCharacters))failures.push('说明段落过长');
 if(new Set(measured.media).size!==measured.media.length)failures.push('同一主要素材在页内重复');
 if(measured.unconfiguredControls)failures.push('出现合同之外的控件');
 if(measured.missingScenes.length)failures.push('缺少已锁定内容场景');
 if(measured.contentMismatches?.length)failures.push('实际文案不符合固定内容配置');
 return {result:failures.length?'failed-static-contract':'passed-static-contract',failures};
}
export async function inspectStaticContract({root,endpoint,url,plan,output,signal}){
 const page=await BrowserPage.create(endpoint,signal),report={checks:[],result:'running'};
 try{
  for(const [width,height] of [[1440,900],[390,844]]){
   await page.viewport(width,height);await page.navigate(url);
   const measured=await page.evaluate(`(()=>{const painted=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0&&!e.closest('.sr-only')};const paragraphs=[...document.querySelectorAll('p')].filter(painted).map(e=>e.innerText.trim().length);const media=[...document.querySelectorAll('img,video')].filter(e=>painted(e)&&e.getBoundingClientRect().width>80&&e.getBoundingClientRect().height>80).map(e=>e.currentSrc||e.src);const configured=${JSON.stringify(plan.controls)};return {characters:document.body.innerText.trim().length,paragraphs,media,unconfiguredControls:[...document.querySelectorAll('a,button,input,select,textarea,summary,[role="button"]')].filter(painted).filter(e=>!configured.some(c=>e.matches(c.selector))).length,missingScenes:${JSON.stringify(plan.qa.scenes)}.filter(s=>!document.querySelector(s)||!painted(document.querySelector(s)))}})()`);
   if(plan.content)measured.contentMismatches=await page.evaluate(`(()=>{const content=${JSON.stringify(plan.content)},required=${JSON.stringify(plan.requiredContent)};return [...required.filter(key=>!document.querySelector('[data-content="'+key+'"]')),...[...document.querySelectorAll('[data-content]')].filter(e=>!Object.hasOwn(content,e.dataset.content)||e.textContent.trim().replace(/\\s+/g,' ')!==content[e.dataset.content].trim().replace(/\\s+/g,' ')).map(e=>e.dataset.content)]})()`);
   report.checks.push({width,...measured,...checkContentBudget(measured,plan.contentBudget)});
  }
  report.result=report.checks.every(c=>c.result==='passed-static-contract')?'passed-static-contract':'failed-static-contract';return report;
 }finally{const filename=child(root,output);fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,JSON.stringify(report,null,2));await page.close()}
}
export async function inspect({root,endpoint,url,output,signal,recheck}){
 referenceUrl(url);assertReferenceSelection(root,url,recheck);
 const browser=await BrowserPage.create(endpoint,signal);
 try{
  const evidence=[];let metadata;
  for(const [viewport,width,height] of [['desktop',1440,900],['mobile',390,844]]){
   await browser.viewport(width,height);await browser.navigate(url);
   const state=await browser.evaluate(`({url:location.href,title:document.title,text:document.body.innerText.slice(0,1800),height:document.documentElement.scrollHeight,images:document.images.length,scenes:[...document.querySelectorAll('section,main,canvas,video,[id]')].filter(e=>e.getBoundingClientRect().width>50).slice(0,25).map(e=>({tag:e.tagName,id:e.id,class:e.className?.toString().slice(0,90),height:Math.round(e.getBoundingClientRect().height)}))})`);
   if(new URL(state.url).hostname.replace(/^www\./,'')!==new URL(url).hostname.replace(/^www\./,''))throw new ProductionError('redirected-reference','参考重定向到了其他来源');
   if(viewport==='desktop'){metadata=state;metadata.inventory=await browser.evaluate(browserMediaInventory)}
   evidence.push({...await browser.shot(root,output+'/'+viewport+'-opening.jpg'),viewport,state:'opening'});
  }
  return {metadata,evidence};
 }finally{await browser.close()}
}
export async function inspectControls({root,endpoint,url,output,signal,expected=[],ready}){
 const browser=await BrowserPage.create(endpoint,signal),report={result:'running',viewports:[],started:new Date().toISOString()};
 try{
  for(const [viewport,width,height] of [['desktop',1440,900],['mobile',390,844],['narrow',320,844]]){
   await browser.page('Page.bringToFront');await browser.viewport(width,height);await browser.navigate(url);
   const selectors=await browser.evaluate(`(()=>{const elements=[...document.querySelectorAll('a,button,input:not([type="hidden"]),select,textarea,summary,[role="button"]')];return elements.map((e,i)=>{e.setAttribute('data-webart-audit',i);return {selector:'[data-webart-audit="'+i+'"]',tag:e.tagName,type:e.type||'',href:e.getAttribute('href'),label:(e.getAttribute('aria-label')||e.innerText||e.name||'').slice(0,90)}})})()`);
   if(expected.length){const matches=await browser.evaluate(`(()=>{const expected=${JSON.stringify(expected)};return {missing:expected.filter(c=>!document.querySelector(c.selector)).map(c=>c.selector),unconfigured:[...document.querySelectorAll('[data-webart-audit]')].filter(e=>!expected.some(c=>e.matches(c.selector))).length}})()`);if(matches.missing.length||matches.unconfigured)throw new ProductionError('controls-failed','实际控件与静态配置不一致')}
   const controls=[];
   for(const item of selectors){
    const declaredIndex=await browser.evaluate(`(${JSON.stringify(expected)}).findIndex(c=>document.querySelector(${JSON.stringify(item.selector)}).matches(c.selector))`),declaration=expected[declaredIndex];
    // Each control starts from a clean document. Counts and open states from a
    // previous control cannot accidentally satisfy the next control's checks.
    let sceneY;
    const resetControlDocument=async()=>{
     await browser.navigate(url);
     if(ready){let loaded=false;for(let n=0;n<100;n++){if(await browser.evaluate(ready)){loaded=true;break}await delay(100)}if(!loaded)throw new ProductionError('controls-evidence-needed','检查控件前页面主视觉未就绪')}
     await browser.evaluate(`(()=>{[...document.querySelectorAll('a,button,input:not([type="hidden"]),select,textarea,summary,[role="button"]')].forEach((e,i)=>e.setAttribute('data-webart-audit',i))})()`);
     sceneY=undefined;
     if(declaration?.scene){
      const location=await browser.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(declaration.scene)});if(!e)throw Error('Missing control scene');return scrollY+e.getBoundingClientRect().top})()`);
      sceneY=location;
      const steps=Math.max(1,Math.ceil(Math.abs(location)/Math.max(1,height/2)));
      for(let n=0;n<steps;n++){if(width<700){
       const start=height*.82,distance=Math.min(height*.55,Math.max(80,location-await browser.evaluate('scrollY')));
       await browser.page('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:12,y:start,radiusX:4,radiusY:4,force:1}]});
       for(let k=1;k<=12;k++){await browser.page('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:12,y:start-distance*k/12,radiusX:4,radiusY:4,force:1}]});await delay(20)}
       await browser.page('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      }else await browser.page('Input.dispatchMouseEvent',{type:'mouseWheel',x:width/2,y:height/2,deltaY:location/steps,deltaX:0});await delay(100)}
      await delay(750);
     }
    };
    await resetControlDocument();
    const selector=JSON.stringify(item.selector),evidence=[],actionOutput=output+`/${viewport}-${controls.length}`;
    const activeCheck=declaration?.activeCheck||(item.tag==='SUMMARY'?`document.querySelector(${selector}).closest('details').open`:['checkbox','radio'].includes(item.type)?`document.querySelector(${selector}).checked`:undefined);
    await prepareControlAction({browser,declaration,resultCheck:activeCheck,input:'keyboard',root,output:actionOutput,evidence});
    const visible=await browser.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(item.selector)}),s=getComputedStyle(e),r=e.getBoundingClientRect();return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&Number(s.opacity)>0})()`);
    if(!visible){if(declaration?.scene)throw new ProductionError('controls-failed',`${viewport} ${declaration.selector} 在场景中未显示（scrollY=${await browser.evaluate('scrollY')}）`);continue}
    if(item.tag==='SELECT')throw new ProductionError('controls-evidence-needed','原生下拉展开需要直接视觉核验，不能自动记为完成');
    await browser.evaluate(`(()=>{const e=document.querySelector(${selector}),r=e.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight)e.scrollIntoView({block:'center',behavior:'instant'})})()`);await delay(150);
    evidence.push({state:'default',...await browser.shot(root,output+`/${viewport}-${controls.length}-default.jpg`)});
    const bounds=await browser.evaluate(`(()=>{const e=document.querySelector(${selector}),r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await browser.page('Input.dispatchMouseEvent',{type:'mouseMoved',...bounds});await delay(180);evidence.push({state:'hover',...await browser.shot(root,output+`/${viewport}-${controls.length}-hover.jpg`)});
    let focused=false;for(let n=0;n<=selectors.length+2;n++){
     await browser.page('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await browser.page('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
     if(sceneY!==undefined){const drift=sceneY-await browser.evaluate('scrollY');if(Math.abs(drift)>2){await browser.page('Input.dispatchMouseEvent',{type:'mouseWheel',x:12,y:height*.8,deltaX:0,deltaY:drift});await delay(750)}}
     if(await browser.evaluate(`document.activeElement===document.querySelector(${selector})`)){focused=true;break}
    }
    if(!focused)throw new ProductionError('controls-failed','可见控件不能通过键盘访问');
    evidence.push({state:'focus',...await browser.shot(root,output+`/${viewport}-${controls.length}-focus.jpg`)});
    if(item.tag==='INPUT'&&item.type==='range'){
     await inspectNativeRange({browser,selector:item.selector,declaration,viewport,width,root,output:output+'/'+controls.length,evidence});
    }else if(item.tag==='BUTTON'||item.tag==='SUMMARY'||['checkbox','radio'].includes(item.type)){
     if(item.tag==='BUTTON'&&!declaration?.activeCheck)throw new ProductionError('controls-evidence-needed','按钮须事先配置可观察的实际行动结果');
     const checkbox=['checkbox','radio'].includes(item.type),key=checkbox?' ':'Enter',code=checkbox?'Space':'Enter',windowsVirtualKeyCode=checkbox?32:13;
     await assertControlActionStart(browser,declaration,activeCheck);
     await browser.page('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode,...(!checkbox?{text:'\r',unmodifiedText:'\r'}:{})});await browser.page('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode});await delay(200);
     if(!await browser.evaluate(activeCheck))throw new ProductionError('controls-failed','控件没有产生静态合同要求的实际结果');
     evidence.push({state:'activated',...await browser.shot(root,output+`/${viewport}-${controls.length}-activated.jpg`)});
     await browser.page('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await browser.page('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
     const check=width<700?declaration?.touchCheck:declaration?.mouseCheck;
     if(item.tag==='BUTTON'&&!check)throw new ProductionError('controls-evidence-needed','按钮须静态配置鼠标和触摸的实际结果');
     // Keyboard activation may already have satisfied an idempotent action.
     // Recreate its native prerequisite before proving another input path.
     const restoreDefault=!declaration?.prepare&&check&&await browser.evaluate(check);
     if(restoreDefault)await resetControlDocument();
     await prepareControlAction({browser,declaration,resultCheck:check,input:width<700?'touch':'mouse',root,output:actionOutput,evidence});
     const before=await browser.evaluate(item.tag==='SUMMARY'?`document.querySelector(${selector}).closest('details').open`:checkbox?`document.querySelector(${selector}).checked`:'null');
     const actualBounds=await browser.evaluate(`(()=>{const e=document.querySelector(${selector}),before=e.getBoundingClientRect();if(before.top<0||before.bottom>innerHeight)e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
     if(restoreDefault)evidence.push({state:(width<700?'touch':'mouse')+'-prepared',...await browser.shot(root,actionOutput+(width<700?'-touch':'-mouse')+'-prepared.jpg')});
     await assertControlActionStart(browser,declaration,check);
     if(width<700){await browser.page('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...actualBounds,radiusX:4,radiusY:4,force:1}]});await browser.page('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}else{await browser.page('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...actualBounds});await browser.page('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...actualBounds})}
     await delay(200);
     const physicalCheck=check||(item.tag==='SUMMARY'?`document.querySelector(${selector}).closest('details').open!==${before}`:`document.querySelector(${selector}).checked!==${before}`);
     if(!await browser.evaluate(physicalCheck))throw new ProductionError('controls-failed','鼠标或触摸未产生静态合同要求的实际结果');
     evidence.push({state:width<700?'touch-result':'mouse-result',...await browser.shot(root,output+`/${viewport}-${controls.length}-physical.jpg`)});
    }else if(['INPUT','TEXTAREA'].includes(item.tag))throw new ProductionError('controls-evidence-needed','输入控件的选中/空结果/异常状态须补齐，当前不能记为完成');
    if(item.tag==='A'&&(!item.href||item.href==='#'||/^javascript:/i.test(item.href)))throw new ProductionError('controls-failed','页面包含没有用途的行动链接');
    if(item.tag==='A'&&item.href.startsWith('#')&&!await browser.evaluate(`!!document.getElementById(${JSON.stringify(item.href.slice(1))})`))throw new ProductionError('controls-failed','行动指向不存在的内容');
    if(item.tag==='A'&&item.href.startsWith('#')){
     await browser.page('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await browser.page('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await delay(700);
     if(!await browser.evaluate(`location.hash===${JSON.stringify(item.href)}&&Math.abs(document.getElementById(${JSON.stringify(item.href.slice(1))}).getBoundingClientRect().top)<innerHeight`))throw new ProductionError('controls-failed','锚点未通过实际键盘行动抵达内容');
     evidence.push({state:'navigated',...await browser.shot(root,output+`/${viewport}-${controls.length}-navigated.jpg`)});
    }
    controls.push({...item,focused,evidence});
   }
   report.viewports.push({viewport,width,controls});
  }
  report.result='captured-not-visually-approved';return report;
 }catch(error){report.result='failed-controls';report.failure={code:error.code,message:error.message};throw error}finally{report.finished=new Date().toISOString();const filename=child(root,output+'/controls.json');fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,JSON.stringify(report,null,2)+'\n');await browser.close()}
}

// Exercise the application's real fallback; the audit never reveals it itself.
export async function inspectRenderingFallback({root,endpoint,url,output,plan,signal}){
 validateRenderingPlan(plan.rendering);
 if(plan.rendering.mode!=='local-3d')throw new ProductionError('rendering-contract','只有必要局部3D需要渲染故障采证');
 const report={result:'running',checks:[],started:new Date().toISOString()};
 try{
  for(const mode of failureModes)for(const [width,height] of [[1440,900],[390,844],[320,844]]){
   const page=await BrowserPage.create(endpoint,signal);
   try{
    await page.viewport(width,height);
    if(mode==='context-unavailable')await page.page('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{let attempts=0;Object.defineProperty(window,'__webartUnavailableContextAttempts',{get:()=>attempts});const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(['webgl','webgl2','experimental-webgl'].includes(kind)){attempts++;return null}return original.call(this,kind,...args)}})()`});
    await page.navigate(url);
    if(mode==='context-lost'){
     let ready=false;for(let n=0;n<100;n++){if(await page.evaluate(plan.prototypeCapture.ready)){ready=true;break}await delay(100)}
     if(!ready)throw new ProductionError('rendering-failed','正常3D尚未就绪，不能冒充丢失上下文测试');
     const started=await page.evaluate(`(()=>{const canvas=document.querySelector(${JSON.stringify(plan.rendering.canvasSelector)});if(!canvas)return false;const gl=canvas.getContext('webgl2')||canvas.getContext('webgl')||canvas.getContext('experimental-webgl');const extension=gl?.getExtension('WEBGL_lose_context');if(!extension)return false;let observed=false;Object.defineProperty(window,'__webartContextLossObserved',{get:()=>observed});canvas.addEventListener('webglcontextlost',event=>{observed=event.isTrusted},{once:true});extension.loseContext();return true})()`);
     if(!started)throw new ProductionError('rendering-evidence-needed','未能触发真实WebGL上下文丢失');
    }
    let ready=false;for(let n=0;n<100;n++){if(await page.evaluate(plan.rendering.fallback.ready)){ready=true;break}await delay(100)}
    if(!ready)throw new ProductionError('rendering-failed','实际渲染故障后没有完整备用画面');
    const observed=await page.evaluate(mode==='context-unavailable'?'window.__webartUnavailableContextAttempts>0':'window.__webartContextLossObserved===true');
    if(!observed)throw new ProductionError('rendering-evidence-needed','渲染故障未真实发生');
    const states=[],positions=plan.prototypeCapture.states[width<700?'mobile':'desktop']??plan.prototypeCapture.states;
    for(const state of ['opening','transition','middle','ending']){
     const position=positions[state];
     const y=await page.evaluate(typeof position==='number'?`Math.max(0,document.documentElement.scrollHeight-innerHeight)*${position}`:`(()=>{const e=document.querySelector(${JSON.stringify(position.selector)});if(!e)throw Error('Missing fallback scene');return scrollY+e.getBoundingClientRect().top-innerHeight*${position.offset??0}})()`);
     await page.evaluate(`scrollTo({top:${y},behavior:'instant'})`);await delay(180);
     const measured=await page.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(plan.rendering.fallback.selector)}),r=e?.getBoundingClientRect(),s=e&&getComputedStyle(e);return {contentVisible:!!(r&&r.width>1&&r.height>1&&r.top<innerHeight&&r.bottom>0&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0&&(e.innerText.trim()||e.querySelector('img,svg'))),overflow:document.documentElement.scrollWidth>innerWidth+1}})()`);
     if(!measured.contentVisible||measured.overflow)throw new ProductionError('rendering-failed','3D备用路径空白、不可见或横向溢出');
     states.push({state,...measured,evidence:await page.shot(root,`${output}/${mode}-${width}-${state}.jpg`)});
    }
    report.checks.push({mode,width,height,trigger:{observed},states});
   }finally{await page.close()}
  }
  report.result='captured-not-visually-approved';return report;
 }catch(error){report.result='failed-rendering-fallback';report.failure={code:error.code??'browser-failure',message:error.message};throw error}
 finally{report.finished=new Date().toISOString();const filename=child(root,output+'/rendering.json');fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,JSON.stringify(report,null,2)+'\n')}
}
