import fs from 'node:fs';
import path from 'node:path';

// Trusted pointer/keyboard/touch input; screenshots supplement the full page audit.
const [endpoint] = process.argv.slice(2);
if (!endpoint?.startsWith('ws://127.0.0.1:')) throw Error('Use the task browser');
const ws = new WebSocket(endpoint), jobs = new Map(); let serial = 0;
const report={started:new Date().toISOString(),pages:[],result:'running'};
const record=()=>{report.finished=new Date().toISOString();fs.writeFileSync('docs/evidence/revisions-runtime.json',JSON.stringify(report,null,2)+'\n');fs.appendFileSync('docs/evidence/revisions-attempts.jsonl',JSON.stringify({started:report.started,finished:report.finished,result:report.result,failure:report.failure})+'\n')};
fs.writeFileSync('docs/evidence/revisions-runtime.json',JSON.stringify(report,null,2)+'\n');
const deadline = setTimeout(() => {report.result='failed';report.failure='Input review exceeded 120 seconds';record();process.exit(2)}, 120000);
await new Promise((r,j) => { ws.addEventListener('open',r,{once:true}); ws.addEventListener('error',j,{once:true}); });
ws.addEventListener('message',({data}) => {const m=JSON.parse(data),p=jobs.get(m.id);if(p){clearTimeout(p.timer);jobs.delete(m.id);m.error?p.j(Error(m.error.message)):p.r(m.result)}});
const send=(method,params={},sessionId)=>new Promise((r,j)=>{const id=++serial,timer=setTimeout(()=>j(Error(method+' timeout')),12000);jobs.set(id,{r,j,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))});
const {targetId}=await send('Target.createTarget',{url:'about:blank'});
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
const page=(m,p={})=>send(m,p,sessionId);
const ev=async expression=>{const r=await page('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(value,message)=>{if(!value)throw Error(message)};
async function key(key,code,vk){await page('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk,...(key==='Enter'?{text:'\r'}:{})});await page('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk});await sleep(100)}
async function box(selector){return ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)}
async function click(selector,touch=false){const p=await box(selector);await sleep(130);if(touch){await page('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,radiusX:3,radiusY:3,force:1}]});await page('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}else{await page('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await page('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await page('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1})}await sleep(360)}
async function capture(directory,name){const r=await page('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(directory,name+'.png'),Buffer.from(r.data,'base64'))}
try{
 await page('Page.enable');await page('Runtime.enable');await page('Page.bringToFront');
 for(const id of ['006','007','008']){
  const directory=path.resolve('docs/evidence/'+({'006':'006-house-of-ivory','007':'007-campovivo','008':'008-sill'}[id]));fs.mkdirSync(directory,{recursive:true});
  const record={id,scroll:[],controls:[],motion:[]};report.pages.push(record);
  for(const width of [1440,390,320]){
   await page('Emulation.setDeviceMetricsOverride',{width,height:width===1440?900:844,deviceScaleFactor:1,mobile:width<700});await page('Emulation.setTouchEmulationEnabled',{enabled:width<700,maxTouchPoints:1});await page('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await page('Page.navigate',{url:'http://127.0.0.1:420'+id.slice(-1)+'/'});
   for(let n=0;n<80;n++){if(await ev("document.readyState==='complete'&&[...document.images].every(i=>i.complete&&i.naturalWidth)&&document.fonts.status==='loaded'"))break;await sleep(70)}
   assert(await ev("!matchMedia('(prefers-reduced-motion:reduce)').matches"),'Normal motion emulation failed');record.controls.push({width,normalMotion:true,finePointer:await ev("matchMedia('(hover:hover) and (pointer:fine)').matches")});const max=await ev('document.documentElement.scrollHeight-innerHeight');
   for(const fraction of [0,.25,.5,.75,1,.75,.5,.25,0]){await ev(`scrollTo({top:${Math.round(max*fraction)},behavior:'instant'})`);await sleep(420);record.scroll.push({width,fraction,y:await ev('scrollY')});if(width!==320){record.motion.push({width,fraction,styles:await ev(`({hero:getComputedStyle(document.querySelector('.hero img')).transform,projects:[...document.querySelectorAll('.project-image')].map(e=>({clip:getComputedStyle(e).clipPath,transform:getComputedStyle(e.querySelector('img')).transform})),quote:document.querySelector('.studio em')?getComputedStyle(document.querySelector('.studio em')).color:null})`)});if(record.scroll.filter(s=>s.width===width&&s.fraction===fraction).length===1)await capture(directory,`motion-${width}-${fraction*100}`)}}
   const normal=record.motion.filter(m=>m.width===width);if(width!==320)assert(new Set(normal.map(m=>m.styles.hero)).size>1,id+' normal scroll motion did not change');const count=await ev('document.querySelectorAll("main details").length');
   for(let i=1;i<=count;i++){
    const selector=`main details:nth-child(${i}) summary`;
    if(width===1440){const p=await box(selector);await page('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await sleep(700);await capture(directory,`control-${width}-project-${i}-hover`);}
    await click(selector,width<700);assert(await ev(`document.querySelectorAll('main details')[${i-1}].open`),id+' project failed');await capture(directory,`control-${width}-project-${i}-open`);await click(selector,width<700);assert(await ev(`!document.querySelectorAll('main details')[${i-1}].open`),id+' project close failed');record.controls.push({width,project:i,openClose:true,touch:width<700});
   }
   if(id==='006'&&width<700){await click('.mobile-nav summary',true);assert(await ev("document.querySelector('.mobile-nav').open"),'Menu did not open');await capture(directory,`control-${width}-menu-open`);await key('Escape','Escape',27);assert(await ev("!document.querySelector('.mobile-nav').open&&document.activeElement.matches('.mobile-nav summary')"),'Menu Escape/focus failed');await click('.mobile-nav summary',true);await click('.mobile-nav a[href="#spaces"]',true);assert(await ev("!document.querySelector('.mobile-nav').open"),'Menu link failed to close');record.controls.push({width,menu:true,escapeFocus:true,linkCloses:true})}
   if(id==='007'){
    await ev("document.querySelector('.photo-track').scrollTo({left:0,behavior:'instant'})");await sleep(350);
    assert(await ev("document.querySelector('[data-direction=\"-1\"]').disabled"),'Previous must be disabled at start');
    await click('[data-direction="1"]',width<700);assert(await ev("document.querySelector('.photo-track').scrollLeft>50"),'Next did not move');await capture(directory,`control-${width}-next`);
    await click('[data-direction="1"]',width<700);await sleep(500);assert(await ev("document.querySelector('[data-direction=\"1\"]').disabled&&document.querySelector('.photo-counter').textContent==='03 / 03'"),'Carousel end/counter failed');await capture(directory,`control-${width}-end`);
    await click('[data-direction="-1"]',width<700);assert(await ev("!document.querySelector('[data-direction=\"1\"]').disabled"),'Previous failed');
    await ev("document.querySelector('.photo-track').focus()");await key('Home','Home',36);await sleep(500);assert(await ev("document.querySelector('.photo-track').scrollLeft<4"),'Keyboard Home failed');await key('End','End',35);await sleep(550);assert(await ev("document.querySelector('[data-direction=\"1\"]').disabled"),'Keyboard End failed');await capture(directory,`control-${width}-focus`);
    await ev("document.querySelector('.photo-track').scrollTo({left:0,behavior:'instant'});document.querySelector('.photo-track').scrollIntoView({block:'center',behavior:'instant'})");await sleep(400);const position=await ev("(()=>{const r=document.querySelector('.photo').getBoundingClientRect();return{x:Math.min(innerWidth-45,r.right-40),y:r.top+r.height/2}})()");
    if(width<700){await page('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...position,radiusX:3,radiusY:3,force:1}]});for(let x=position.x-20;x>40;x-=25){await page('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:position.y,radiusX:3,radiusY:3,force:1}]});await sleep(20)}await page('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
    else{await page('Input.dispatchMouseEvent',{type:'mousePressed',...position,button:'left',clickCount:1});for(let x=position.x-30;x>position.x-480;x-=30){await page('Input.dispatchMouseEvent',{type:'mouseMoved',x,y:position.y,button:'left',buttons:1});await sleep(12)}await page('Input.dispatchMouseEvent',{type:'mouseReleased',x:position.x-480,y:position.y,button:'left',clickCount:1})}
    await sleep(700);assert(await ev("document.querySelector('.photo-track').scrollLeft>40"),'Drag/swipe failed');await capture(directory,`control-${width}-gesture`);record.controls.push({width,previousNext:true,endCounter:true,keyboardHomeEnd:true,gesture:true,touch:width<700});
   }
   await page('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await ev(`scrollTo({top:${Math.round(max*.5)},behavior:'instant'})`);await sleep(500);const reduced=await ev("({active:matchMedia('(prefers-reduced-motion:reduce)').matches,transform:getComputedStyle(document.querySelector('.hero img')).transform})");assert(reduced.active&&reduced.transform==='none',id+' reduced motion still moves');record.controls.push({width,reducedMotion:true});
  }
 }
 report.result='passed';
}catch(error){report.result='failed';report.failure=error.message;process.exitCode=1}
finally{record();console.log(JSON.stringify({result:report.result,failure:report.failure,pages:report.pages.map(p=>({id:p.id,scroll:p.scroll.length,controls:p.controls.length}))}));await send('Target.closeTarget',{targetId}).catch(()=>{});ws.close();clearTimeout(deadline)}
