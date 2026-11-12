import fs from 'node:fs';
import path from 'node:path';
const [endpoint,mode='full',origin='http://127.0.0.1:4209/']=process.argv.slice(2);
if(!endpoint?.startsWith('ws://127.0.0.1:')||!['gate','full'].includes(mode))throw Error('Use the local task browser and gate/full mode');
const dir='docs/evidence/009-near-and-far';fs.mkdirSync(dir,{recursive:true});
const report={started:new Date().toISOString(),mode,origin,result:'running',views:[],errors:[]};
const output=path.join(dir,mode==='gate'?'motion-gate.json':'inputs.json');
function record(){report.finished=new Date().toISOString();fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');fs.appendFileSync(path.join(dir,'input-attempts.jsonl'),JSON.stringify({started:report.started,finished:report.finished,mode,result:report.result,failure:report.failure})+'\n')}
const deadline=setTimeout(()=>{report.result='failed';report.failure='Input audit exceeded 120 seconds';record();process.exit(2)},120000);
const ws=new WebSocket(endpoint),pending=new Map();let serial=0;
await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});
ws.addEventListener('message',({data})=>{const m=JSON.parse(data),p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.j(Error(m.error.message)):p.r(m.result)}if(m.method==='Runtime.exceptionThrown')report.errors.push(m.params)});
const send=(method,params={},sessionId)=>new Promise((r,j)=>{const id=++serial,timer=setTimeout(()=>j(Error(method+' timeout')),12000);pending.set(id,{r,j,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))});
const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
const page=(m,p={})=>send(m,p,sessionId),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ev=async expression=>{const r=await page('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
const assert=(v,m)=>{if(!v)throw Error(m)};
async function navigate(){await page('Page.navigate',{url:origin});for(let i=0;i<70;i++){if(await ev('document.readyState==="complete"&&document.fonts.status==="loaded"&&document.images.length===3&&[...document.images].every(i=>i.complete&&i.naturalWidth)'))return;await sleep(100)}throw Error('Page not ready')}
async function capture(name){const r=await page('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(r.data,'base64'))}
async function box(selector){return ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)}
async function point(p,touch=false){if(touch){await page('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,radiusX:4,radiusY:4,force:1}]});await page('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}else{await page('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await page('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await page('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1})}await sleep(170)}
async function click(selector,touch=false){await point(await box(selector),touch)}
async function key(key,code,vk){await page('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk,...(key==='Enter'?{text:'\r'}:{})});await page('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk});await sleep(150)}
try{
 await page('Page.enable');await page('Runtime.enable');await page('Page.bringToFront');
 for(const width of (mode==='gate'?[1440,390]:[1440,390,320])){
  await page('Emulation.setDeviceMetricsOverride',{width,height:width===1440?900:844,deviceScaleFactor:1,mobile:width<700});await page('Emulation.setTouchEmulationEnabled',{enabled:width<700,maxTouchPoints:1});await page('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await navigate();
  const view={width,normal:[],controls:[],reduced:[]};report.views.push(view);
  const max=await ev('document.documentElement.scrollHeight-innerHeight');
  for(const progress of [0,.25,.5,.75,1,.75,.5,.25,0]){await ev(`scrollTo({top:${max*progress},behavior:'instant'})`);await sleep(80);view.normal.push(await ev(`({progress:${progress},y:scrollY,hero:getComputedStyle(document.querySelector('.hero-picture')).transform,wash:getComputedStyle(document.querySelector('.hero')).getPropertyValue('--wash'),side:getComputedStyle(document.querySelector('.series')).getPropertyValue('--side')})`))}
  assert(view.normal[0].hero!==view.normal[4].hero,'No normal hero progress');assert(view.normal[0].side!==view.normal[4].side,'No normal gradient progress');
  const p=await box('.hero-picture .picture-link');await page('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+55,y:p.y+25});await sleep(700);
  view.pointer=await ev('({fine:matchMedia("(hover:hover) and (pointer:fine)").matches,x:document.querySelector(".hero-picture .picture-link").style.getPropertyValue("--mx"),transform:getComputedStyle(document.querySelector(".hero-picture img")).transform})');
  if(width===1440){assert(parseFloat(view.pointer.x)!==0,'Mouse feedback missing');await capture('input-hover-1440');await page('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await sleep(700);assert(parseFloat(await ev('document.querySelector(".hero-picture .picture-link").style.getPropertyValue("--mx")'))===0,'Pointer leave did not reset')}
  const stable=await ev('getComputedStyle(document.querySelector(".hero-picture")).transform');await sleep(200);assert(stable===await ev('getComputedStyle(document.querySelector(".hero-picture")).transform'),'Drawing continued after input');
  if(mode==='full'){
   await ev('window.__trusted=[];document.addEventListener("pointerdown",e=>__trusted.push({type:e.pointerType,trusted:e.isTrusted,target:e.target.outerHTML.slice(0,120)}))');
   for(const [i,name] of ['coast','street','dunes'].entries()){
    const selector=`button[data-photo="${name}"]`;await click(selector,width<700);assert(await ev('!!document.querySelector(".photo-dialog")?.open'),'Photo did not open: '+JSON.stringify(await ev('({active:document.activeElement.outerHTML.slice(0,120),input:__trusted,y:scrollY})')));assert(await ev(`document.querySelector('.photo-dialog img').complete&&document.querySelector('.photo-dialog img').naturalWidth>0&&document.querySelector('.photo-count').textContent===${JSON.stringify(`${i+1} / 3`)}`),'Viewer image/count missing');await capture(`input-${name}-open-${width}`);
    const layout=await ev('(()=>{const d=document.querySelector(".photo-dialog").getBoundingClientRect(),i=document.querySelector(".photo-dialog img").getBoundingClientRect();return{dialogHeight:d.height,imageHeight:i.height,viewportHeight:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth}})()');assert(!layout.overflow,'Viewer overflow');if(width<700)assert(layout.dialogHeight-layout.imageHeight<160&&layout.dialogHeight<layout.viewportHeight-40,'Mobile viewer has an empty paper stage');
    assert(await ev('document.activeElement.matches(".photo-close")'),'Initial viewer focus missing');await key('Escape','Escape',27);assert(!await ev('!!document.querySelector(".photo-dialog")?.open'),'Escape did not close');assert(await ev(`document.activeElement.matches(${JSON.stringify(selector)})`),'Viewer did not return focus');view.controls.push({name,open:true,escape:true,focus:true,layout});
   }
   await click('button[data-photo="coast"]',width<700);await click('.photo-next',width<700);assert(await ev('document.querySelector(".photo-count").textContent==="2 / 3"'),'Next photo failed');await key('ArrowLeft','ArrowLeft',37);assert(await ev('document.querySelector(".photo-count").textContent==="1 / 3"'),'Previous key failed');await click('.photo-previous',width<700);assert(await ev('document.querySelector(".photo-count").textContent==="3 / 3"'),'Wrap failed');await capture(`input-gallery-end-${width}`);await click('.photo-close',width<700);
   await key('Enter','Enter',13);assert(await ev('!!document.querySelector(".photo-dialog")?.open'),'Enter activation failed');await point({x:3,y:3},width<700);assert(!await ev('!!document.querySelector(".photo-dialog")?.open'),'Backdrop did not close');
   await click('.studio summary',width<700);assert(await ev('document.querySelector("details").open'),'Notes failed');await capture(`input-notes-${width}`);await click('.studio summary',width<700);assert(!await ev('document.querySelector("details").open'),'Notes did not close');
   view.trusted=await ev('__trusted');assert(view.trusted.length>=10&&view.trusted.every(p=>p.trusted&&p.type===(width<700?'touch':'mouse')),'Trusted input missing');view.controls.push({arrows:true,keys:true,wrap:true,buttonClose:true,backdrop:true,notes:true});
  }
  await page('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await navigate();
  for(const progress of [0,.5,1,0]){await ev(`scrollTo({top:${max*progress},behavior:'instant'})`);await sleep(80);view.reduced.push(await ev(`({progress:${progress},shift:getComputedStyle(document.querySelector('.hero')).getPropertyValue('--shift'),wash:getComputedStyle(document.querySelector('.hero')).getPropertyValue('--wash'),image:getComputedStyle(document.querySelector('.hero-picture img')).transform})`))}
  assert(view.reduced.every(s=>s.shift==='0px'&&s.wash==='0'&&s.image==='none'),'Reduced motion was not static');
 }
 assert(!report.errors.length,'Runtime errors');report.result='passed';
}catch(error){report.result='failed';report.failure=error.message;process.exitCode=1}
finally{record();console.log(JSON.stringify({result:report.result,failure:report.failure,views:report.views.map(v=>({width:v.width,scroll:v.normal.length,controls:v.controls.length,reduced:v.reduced.length})),errors:report.errors.length}));await send('Target.closeTarget',{targetId}).catch(()=>{});ws.close();clearTimeout(deadline)}
