import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import{fingerprint}from'./collection.mjs';
import {visualContractHash,measureVisualState,visualMeasurementFailures} from './production/visual-contract.mjs';
import{assertReferenceSelection}from'./production/references.mjs';
import{nativeWheelTo,nativePositionTarget,nativePositionTo,nativeTouchTo}from'./production/native-scroll.mjs';
import {deviceMetrics,deviceAgent} from './production/device-metrics.mjs';
// Capture only. Actual evidence can reject a candidate; this program awards no aesthetic rating.
const [endpoint,configPath]=process.argv.slice(2);const cfg=JSON.parse(fs.readFileSync(configPath,'utf8'));
if(!/^ws:\/\/127\.0\.0\.1:\d+\//.test(endpoint||'')||!/^https?:\/\//.test(cfg.url))throw new Error('Use a task-browser endpoint and an explicit reference/preview URL');
if(new URL(cfg.url).protocol==='https:')assertReferenceSelection(process.cwd(),cfg.url,cfg.recheck);
const output=path.resolve(cfg.output);if(!output.startsWith(path.resolve('docs/evidence')+path.sep))throw new Error('Capture output must remain in docs/evidence');fs.mkdirSync(output,{recursive:true});
const manifestEntry=cfg.manifest?{slug:cfg.slug,manifest:cfg.manifest}:null;const hash=b=>crypto.createHash('sha256').update(b).digest('hex');const report={schemaVersion:2,started:new Date().toISOString(),url:cfg.url,sourceSha256:manifestEntry?fingerprint(manifestEntry):cfg.sourceSha256??null,states:[],motion:[],errors:[],result:'running'};let serial=0,targetId,sid;const pending=new Map();const ws=new WebSocket(endpoint);const sleep=ms=>new Promise(r=>setTimeout(r,ms));
if(cfg.visualContract)report.visualContractSha256=visualContractHash(cfg.visualContract);
const save=()=>fs.writeFileSync(path.join(output,'capture.json'),JSON.stringify(report,null,2)+'\n');const captureBudget=cfg.deadlineMs??120000;if(!Number.isInteger(captureBudget)||captureBudget<10000||captureBudget>(new URL(cfg.url).protocol==='https:'&&!manifestEntry?240000:120000))throw Error('Capture deadline exceeds the allowed reference/candidate budget');const deadline=setTimeout(()=>{report.result='failed';report.failure='Production capture exceeded '+captureBudget/1000+' seconds';save();process.exit(2)},captureBudget);
const send=(method,params={},sessionId)=>new Promise((r,j)=>{const id=++serial,t=setTimeout(()=>{pending.delete(id);j(new Error(method+' timeout'))},18000);pending.set(id,{r,j,t});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))});
ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.t);pending.delete(m.id);m.error?p.j(new Error(m.error.message)):p.r(m.result)}}else if(m.sessionId===sid&&m.method==='Runtime.exceptionThrown')report.errors.push(m.params.exceptionDetails)});
const page=(m,p={})=>send(m,p,sid);const ev=async(expression)=>{const r=await page('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
const visibleImages=`[...document.images].filter(e=>{let r=e.getBoundingClientRect(),left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.visibility==='hidden'||s.display==='none'||Number(s.opacity)===0)return false;if(p!==e){const b=p.getBoundingClientRect();if(/hidden|clip|auto|scroll/.test(s.overflowX)){left=Math.max(left,b.left);right=Math.min(right,b.right)}if(/hidden|clip|auto|scroll/.test(s.overflowY)){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom)}}}return right-left>80&&bottom-top>80})`;
const visibleVideos=`[...document.querySelectorAll('video')].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>80&&r.height>80&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0&&e.readyState>=2&&e.videoWidth>100})`;
async function ready(requireImages=!!cfg.requireVisibleImages,requireMedia=!!cfg.requireVisibleMedia){const expectedHost=new URL(cfg.url).hostname.replace(/^www\./,'');const documentReady=cfg.allowInteractiveDocument===true&&cfg.ready?`['interactive','complete'].includes(document.readyState)`:`document.readyState==='complete'`;for(let n=0;n<Math.min(300,Math.max(120,(cfg.readyTimeoutMs??12000)/100));n++){if(await ev(`location.hostname.replace(/^www\\./,'')===${JSON.stringify(expectedHost)}&&${documentReady}&&document.fonts.status==='loaded'&&(!${requireImages}||${visibleImages}.length>0)&&(!${requireMedia}||${visibleImages}.length+${visibleVideos}.length>0)&&${visibleImages}.every(e=>e.complete&&e.naturalWidth>100)&&(${cfg.ready||'true'})`))return;await sleep(100)}throw new Error('Final visible media/fonts were not ready')}
let activePosition=null;
async function shot(name){const requireImages=cfg.imageRequiredStates?cfg.imageRequiredStates.some(state=>name.endsWith('-'+state)):!!cfg.requireVisibleImages;const requireMedia=cfg.mediaRequiredStates?cfg.mediaRequiredStates.some(state=>name.endsWith('-'+state)):!!cfg.requireVisibleMedia;if(activePosition!==null)await nativePositionTo({evaluate:ev,page},activePosition,{ready:()=>ready(requireImages,requireMedia),settleMs:cfg.settleMs??320,intervalMs:cfg.wheelIntervalMs??32});else{await ready(requireImages,requireMedia);await sleep(cfg.settleMs??320)}if(manifestEntry&&fingerprint(manifestEntry)!==report.sourceSha256)throw new Error('Candidate source changed during capture; restart the whole evidence run');const r=await page('Page.captureScreenshot',{format:'jpeg',quality:88,captureBeyondViewport:false});const bytes=Buffer.from(r.data,'base64');const folder=path.join(output,name);fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,'contact-sheet.jpg');fs.writeFileSync(file,bytes);return{path:path.relative(process.cwd(),file).replaceAll('\\','/'),sha256:hash(bytes)}}
if(cfg.wheelIntervalMs!==undefined&&(!Number.isInteger(cfg.wheelIntervalMs)||cfg.wheelIntervalMs<16||cfg.wheelIntervalMs>64))throw Error('Native wheel interval must be 16–64ms');
async function wheelTo(y){return nativeWheelTo({evaluate:ev,page},y,{intervalMs:cfg.wheelIntervalMs??32})}
async function positionTo(position){activePosition=position;return wheelTo(await nativePositionTarget({evaluate:ev,page},position))}
try{
 await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});
 const deviceBrowserVersion=await send('Browser.getVersion');
 for(const [viewport,width,height]of [['desktop',1440,900],['mobile',390,844]]){
  if(targetId)await send('Target.closeTarget',{targetId});({targetId}=await send('Target.createTarget',{url:'about:blank'}));({sessionId:sid}=await send('Target.attachToTarget',{targetId,flatten:true}));await page('Page.enable');await page('Runtime.enable');await page('Page.bringToFront');
  await page('Emulation.setUserAgentOverride',deviceAgent(deviceBrowserVersion,width));await page('Emulation.setDeviceMetricsOverride',deviceMetrics(width,height));await page('Emulation.setTouchEmulationEnabled',{enabled:width<700,maxTouchPoints:1});await page('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await page('Page.navigate',{url:cfg.url});await ready();await sleep(cfg.enterMs??500);
  // A pointer left over from another target can activate a source hover preview
  // before its default opening is recorded. Explicit rest coordinates are part
  // of this capture's static input; they do not change the page or its media.
  if(cfg.initialPointer){const p=cfg.initialPointer;if(!['x','y'].every(k=>Number.isFinite(p[k])&&p[k]>=0&&p[k]<=1))throw Error('Initial pointer must use normalized viewport coordinates');await page('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x*width,y:p.y*height});await sleep(cfg.settleMs??320)}
  const targets=cfg.states[viewport]??cfg.states;
  for(const [state,value]of Object.entries(targets)){
   let release;activePosition=null;
   if(typeof value==='object'&&'click'in value){const at=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(value.click)});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await page('Input.dispatchMouseEvent',{type:'mouseMoved',...at});await page('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...at});await page('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...at});await sleep(cfg.stageSettleMs??1300)}
   else if(typeof value==='object'&&'drag'in value){const{from,to}=value.drag;const a={x:from[0]*width,y:from[1]*height},b={x:to[0]*width,y:to[1]*height};if(width<700){await page('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});for(let n=1;n<=10;n++){await page('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*n/10,y:a.y+(b.y-a.y)*n/10}]});await sleep(45)}release=()=>page('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}else{await page('Input.dispatchMouseEvent',{type:'mouseMoved',...a});await page('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...a});for(let n=1;n<=10;n++){await page('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,x:a.x+(b.x-a.x)*n/10,y:a.y+(b.y-a.y)*n/10});await sleep(45)}release=()=>page('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...b})}}
   else if(typeof value==='object'&&'wheels'in value){for(const delta of value.wheels){if(width<700&&cfg.nativeStage)await page('Input.synthesizeScrollGesture',{x:width*.5,y:height*.8,yDistance:-delta,gestureSourceType:'touch',speed:600});else await page('Input.dispatchMouseEvent',{type:'mouseWheel',x:200,y:400,deltaX:0,deltaY:delta});await sleep(cfg.stageSettleMs??1300)}}
   else if(typeof value==='object'&&'wheel'in value){await page('Input.dispatchMouseEvent',{type:'mouseWheel',x:200,y:400,deltaX:0,deltaY:value.wheel});await sleep(cfg.stageSettleMs??1300)}
   else await positionTo(value);
   const evidence=await shot(viewport+'-'+state),layout=await ev('({y:scrollY,documentHeight:document.documentElement.scrollHeight,viewportHeight:innerHeight})'),captured={viewport,state,finalAssets:true,loaded:true,y:layout.y,layout,evidence:[evidence]};
   if(cfg.visualContract){const expected=cfg.visualContract.states[state];captured.visualMeasurement=await ev(`(${measureVisualState.toString()})(${JSON.stringify(expected)})`);captured.visualFailures=visualMeasurementFailures(captured.visualMeasurement,expected,viewport)}
   report.states.push(captured);if(captured.visualFailures?.length)throw new Error(viewport+'/'+state+': '+captured.visualFailures.join('; '));if(release){await release();await sleep(cfg.stageSettleMs??1300)}
  }
  const sequence={viewport,input:'scroll',forward:true,reverse:true,normal:true,leaveOrStop:true,reduced:false,primaryVisual:null,evidence:[]};
  if(cfg.nativeStage){activePosition=null;for(const delta of [0,300,600,-600,-300]){await page('Input.dispatchMouseEvent',{type:'mouseWheel',x:200,y:400,deltaX:0,deltaY:delta});await sleep(cfg.stageSettleMs??1300);sequence.evidence.push(await shot(`${viewport}-scroll-${sequence.evidence.length}`))}}else for(const fraction of [0,.25,.5,.75,1,.75,.5,.25,0]){await positionTo(fraction);sequence.evidence.push(await shot(`${viewport}-scroll-${sequence.evidence.length}`))}report.motion.push(sequence);
  if(cfg.processScenes){
   const scenes={viewport,input:'scroll',context:'complete-scenes',forward:true,reverse:true,normal:true,leaveOrStop:true,reduced:false,primaryVisual:null,evidence:[]};
   for(const selector of [...cfg.processScenes,...cfg.processScenes.slice(0,-1).reverse()]){await positionTo({selector});scenes.evidence.push(await shot(viewport+'-scene-process-'+scenes.evidence.length))}
   report.motion.push(scenes);
  }
  if(cfg.trustedTouch&&viewport==='mobile'){
   const touch={viewport,input:'scroll',context:'trusted-touch',interaction:'touch',forward:true,reverse:true,normal:true,leaveOrStop:true,reduced:false,primaryVisual:null,evidence:[]};
   activePosition=null;
   for(const fraction of [0,.5,1,.5,0]){await nativeTouchTo({evaluate:ev,page},await nativePositionTarget({evaluate:ev,page},fraction));touch.evidence.push(await shot('mobile-touch-'+touch.evidence.length))}
   report.motion.push(touch);
  }
  if(cfg.pointer&&viewport==='desktop'){
    if(cfg.pointer.y!==undefined){if(manifestEntry||new URL(cfg.url).protocol!=='https:'||!Number.isFinite(cfg.pointer.y)||cfg.pointer.y<0||cfg.pointer.y>100000)throw Error('Absolute pointer target requires an explicit source path');await positionTo({y:cfg.pointer.y});await sleep(cfg.pointer.settleMs??cfg.settleMs??320)}
    if(cfg.pointer.position!==undefined){if(!Number.isFinite(cfg.pointer.position)||cfg.pointer.position<0||cfg.pointer.position>1)throw Error('Pointer position must lie on the native document path');await positionTo(cfg.pointer.position);await sleep(cfg.pointer.settleMs??cfg.settleMs??320)}
    if(cfg.pointer.scene){await positionTo({selector:cfg.pointer.scene});await sleep(cfg.pointer.settleMs??cfg.settleMs??320)}
   const selector=cfg.pointer.selector;if(!cfg.nativeStage&&!cfg.pointer.retainPosition){const offset=await ev(`Math.max(0,(innerHeight-document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().height)/innerHeight/2)`);await nativePositionTo({evaluate:ev,page},{selector,offset},{ready,settleMs:cfg.pointer.settleMs??cfg.settleMs??320,intervalMs:cfg.wheelIntervalMs??32})}activePosition=null;const bounds=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Pointer target is missing');const r=e.getBoundingClientRect(),s=getComputedStyle(e);if(r.width<1||r.height<1||r.right<=0||r.left>=innerWidth||r.bottom<=0||r.top>=innerHeight||s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)throw Error('Pointer target is not painted; choose the actual rendered surface');return{x:r.x,y:r.y,width:r.width,height:r.height}})()`);const vertical=cfg.pointer.axis==='vertical';const start={x:Math.max(20,Math.min(width-25,bounds.x+bounds.width*(vertical?.55:.35))),y:Math.max(25,Math.min(height-25,bounds.y+bounds.height*(vertical?.7:.5)))},end=vertical?{x:start.x,y:Math.max(30,start.y-height*.25)}:{x:Math.min(width-25,bounds.x+bounds.width*.7),y:start.y};const motion={viewport,input:'pointer',normal:true,forward:true,reverse:true,leaveOrStop:true,reduced:false,primaryVisual:null,evidence:[]};
   await page('Input.dispatchMouseEvent',{type:'mouseMoved',...start});motion.evidence.push(await shot('desktop-pointer-start'));if(cfg.pointer.drag){await page('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...start});await sleep(100)}
   let previous=start;for(const p of [end,start]){for(let n=1;n<=10;n++){await page('Input.dispatchMouseEvent',{type:'mouseMoved',button:cfg.pointer.drag?'left':'none',buttons:cfg.pointer.drag?1:0,x:previous.x+(p.x-previous.x)*n/10,y:previous.y+(p.y-previous.y)*n/10});await sleep(30)}motion.evidence.push(await shot('desktop-pointer-'+motion.evidence.length));previous=p}
   if(cfg.pointer.drag)await page('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...start});
   if(cfg.pointer.inspect){
    const b=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(cfg.pointer.inspect)}),r=e?.getBoundingClientRect();if(!r||r.width<1||r.height<1||r.top<0||r.bottom>innerHeight)throw Error('Inspection surface is not fully visible');return{x:r.x,y:r.y,w:r.width,h:r.height}})()`);
    for(const [x,y]of [[.25,.35],[.75,.65],[.25,.35]]){await page('Input.dispatchMouseEvent',{type:'mouseMoved',x:b.x+b.w*x,y:b.y+b.h*y});motion.evidence.push(await shot('desktop-pointer-inspect-'+motion.evidence.length))}
   }
   for(const selector of cfg.pointer.clickSelectors??[]){const at=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Visible pointer action is missing or disabled');const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await page('Input.dispatchMouseEvent',{type:'mouseMoved',...at});await page('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...at});await page('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...at});await sleep(cfg.stageSettleMs??1300);motion.evidence.push(await shot('desktop-pointer-action-'+motion.evidence.length))}
   await page('Input.dispatchMouseEvent',{type:'mouseMoved',x:3,y:3});motion.evidence.push(await shot('desktop-pointer-leave'));report.motion.push(motion);
  }
  await page('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const pointerMotion=report.motion.find(m=>m.viewport===viewport&&m.input==='pointer');
  if(pointerMotion){
   const target=cfg.pointer.scene?{selector:cfg.pointer.scene}:cfg.pointer.y!==undefined?{y:cfg.pointer.y}:cfg.pointer.position;
   if(target!==undefined)await positionTo(target);
   await ready();await sleep(cfg.pointer.settleMs??cfg.settleMs??320);
   const b=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(cfg.pointer.selector)}),r=e?.getBoundingClientRect();if(!r||r.width<1||r.height<1||r.bottom<0||r.top>innerHeight)throw Error('Reduced pointer surface is not visible');return{x:Math.max(20,Math.min(innerWidth-25,r.x+r.width*.45)),y:Math.max(25,Math.min(innerHeight-25,r.y+r.height*.5)),endX:Math.max(20,Math.min(innerWidth-25,r.x+r.width*.65))}})()`);
   await page('Input.dispatchMouseEvent',{type:'mouseMoved',x:b.x,y:b.y});
   if(cfg.pointer.drag)await page('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:b.x,y:b.y});
   await page('Input.dispatchMouseEvent',{type:'mouseMoved',button:cfg.pointer.drag?'left':'none',buttons:cfg.pointer.drag?1:0,x:b.endX,y:b.y});
   if(cfg.pointer.drag)await page('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:b.endX,y:b.y});
   pointerMotion.evidence.push(await shot(viewport+'-pointer-reduced'));pointerMotion.reduced=true;
  }
  if(cfg.processScenes){
   const scenes=report.motion.find(m=>m.viewport===viewport&&m.context==='complete-scenes');
   for(const selector of [cfg.processScenes.at(-1),cfg.processScenes[0]]){await positionTo({selector});scenes.evidence.push(await shot(viewport+'-scene-reduced-'+scenes.evidence.length))}scenes.reduced=true;
  }
  if(cfg.trustedTouch&&viewport==='mobile'){
   activePosition=null;const touch=report.motion.find(m=>m.context==='trusted-touch');
   for(const fraction of [.5,0]){await nativeTouchTo({evaluate:ev,page},await nativePositionTarget({evaluate:ev,page},fraction));touch.evidence.push(await shot('mobile-touch-reduced-'+touch.evidence.length))}
  }
  await positionTo(0);const reducedFrame=await shot(viewport+'-reduced');report.motion.filter(m=>m.viewport===viewport&&m.input==='scroll').forEach(m=>{m.reduced=true;m.evidence.push(reducedFrame)});
 }
 if(report.errors.length)throw new Error('Runtime exception in captured page');report.result='captured-not-scored';
}catch(e){report.result='failed';report.failure=e.message;process.exitCode=1}finally{report.finished=new Date().toISOString();save();if(ws.readyState===1){if(targetId)await send('Target.closeTarget',{targetId}).catch(()=>{});ws.close()}clearTimeout(deadline);console.log(JSON.stringify({result:report.result,states:report.states.length,motion:report.motion.length,failure:report.failure}))}
