import fs from 'node:fs';
import path from 'node:path';

// Configuration supplies expectations; observable checks never supply an aesthetic score.
const [endpoint,configPath,mode='full']=process.argv.slice(2);
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
if(!endpoint?.startsWith('ws://127.0.0.1:')||!config.origin.startsWith('http://127.0.0.1:'))throw new Error('Local QA only');
const dir=path.resolve(config.output);fs.mkdirSync(dir,{recursive:true});
const report={started:new Date().toISOString(),origin:config.origin,mode,viewports:[],states:[],transitions:[],arbitrary:[],checks:{},errors:[]};
function record(){report.finished=new Date().toISOString();fs.writeFileSync(path.join(dir,'runtime.json'),JSON.stringify(report,null,2)+'\n');fs.appendFileSync(path.join(dir,'attempts.jsonl'),JSON.stringify({started:report.started,finished:report.finished,result:report.result,failure:report.failure,mode,errors:report.errors.length})+'\n')}
const deadline=setTimeout(()=>{report.result='failed';report.failure='QA exceeded its 120 second deadline';record();console.error(report.failure);process.exit(2)},120000);
const ws=new WebSocket(endpoint);let serial=0,scriptDisabled=false;const pending=new Map(),errors=[];
await new Promise((r,j)=>{const timer=setTimeout(()=>j(new Error('Browser connection timed out')),15000);ws.addEventListener('open',()=>{clearTimeout(timer);r()},{once:true});ws.addEventListener('error',()=>{clearTimeout(timer);j(new Error('Browser connection unavailable; restore the task browser and retry'))},{once:true})}).catch(error=>{report.result='failed';report.failure=error.message;record();clearTimeout(deadline);console.error(error.message);process.exit(1)});
ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(!p)return;clearTimeout(p.t);pending.delete(m.id);m.error?p.j(new Error(m.error.message)):p.r(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Network.loadingFailed'&&!m.params.canceled){if(scriptDisabled&&m.params.type==='Script'&&m.params.blockedReason==='csp')report.checks.intentionalNoScriptBlocks=(report.checks.intentionalNoScriptBlocks||0)+1;else errors.push(m.params)}});
const send=(method,params={},sessionId)=>new Promise((r,j)=>{const id=++serial,t=setTimeout(()=>{pending.delete(id);j(new Error(method+' timed out'))},15000);pending.set(id,{r,j,t});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))});
let targetId,sessionId;
try{({targetId}=await send('Target.createTarget',{url:'about:blank'}));({sessionId}=await send('Target.attachToTarget',{targetId,flatten:true}));}
catch(error){report.result='failed';report.failure=error.message;record();clearTimeout(deadline);ws.close();console.error(error.message);process.exit(1)}
const page=(m,p={})=>send(m,p,sessionId);
const ev=async(expression)=>{const r=await page('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const assert=(v,m)=>{if(!v)throw new Error(m)};
const waitFor=async(expression)=>{for(let i=0;i<60;i++){if(await ev(expression))return;await sleep(80)}throw new Error('Not ready: '+expression)};
const settle=()=>scriptDisabled?sleep(120):ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
async function viewport(width,height,touch=false){await page('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});await page('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:1});await settle()}
const ready = `document.readyState==='complete'&&document.images.length===${config.images}&&[...document.images].every(i=>i.complete&&i.naturalWidth)&&document.fonts.status==='loaded'`;
async function navigate(){const before=await ev('performance.timeOrigin');await page('Page.navigate',{url:config.origin});await waitFor(`performance.timeOrigin!==${before}&&${ready}`);await settle()}
async function capture(name,full=false){
 await ev('Promise.all([...document.images].map(image=>image.decode()))');
 if(full){
  // Decode is not proof of off-screen rasterization in headless Chrome.
  const saved=await ev('scrollY'),max=await ev('Math.max(0,document.documentElement.scrollHeight-innerHeight)'),step=await ev('Math.max(1,Math.round(innerHeight*.7))');
  for(let y=0;y<max+step;y+=step){await ev(`scrollTo({top:${Math.min(y,max)},behavior:'instant'})`);await settle();await sleep(100)}
  await ev(`scrollTo({top:${saved},behavior:'instant'})`);
 }
 await settle();await sleep(120);
 const clip=full?await ev('({x:0,y:0,width:innerWidth,height:document.documentElement.scrollHeight,scale:1})'):undefined;
 const r=await page('Page.captureScreenshot',{format:'png',captureBeyondViewport:full,...(clip?{clip}:{})});
 fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(r.data,'base64'))
}
const measure=()=>ev(`(()=>({viewport:[innerWidth,innerHeight],height:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth,missing:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length,fonts:[...document.fonts].map(f=>({family:f.family,status:f.status})),clipped:[...document.querySelectorAll('h1,h2,p,summary')].filter(e=>!e.matches('.sr-only')&&e.getBoundingClientRect().height>0&&getComputedStyle(e).display!=='inline'&&e.scrollWidth>e.clientWidth+2).map(e=>e.textContent.slice(0,70)),scenes:${JSON.stringify(config.scenes)}.map(s=>({selector:s,visible:!!document.querySelector(s)&&document.querySelector(s).getBoundingClientRect().height>0}))}))()`);
async function key(key,code,vk){const text=key==='Enter'?'\r':key===' '?' ':undefined;await page('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk,...(text?{text,unmodifiedText:text}:{})});await page('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk});await settle()}
async function tabTo(selector){for(let n=0;n<50;n++){await key('Tab','Tab',9);if(await ev(`document.activeElement.matches(${JSON.stringify(selector)})`))return}throw new Error('Unreachable by Tab: '+selector)}
async function touch(selector){const pos=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await page('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...pos,radiusX:4,radiusY:4,force:1}]});await page('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle()}
report.errors=errors;
try{
 await page('Page.enable');await page('Runtime.enable');await page('Network.enable');await page('Page.bringToFront');await page('Emulation.setScriptExecutionDisabled',{value:false});
 for(const [w,h,name] of (mode==='gate'?[[1440,900,'desktop'],[390,844,'mobile']]:[[1440,900,'desktop'],[2048,912,'wide'],[768,1024,'tablet'],[390,844,'mobile'],[320,844,'narrow']])){await viewport(w,h);await navigate();report.viewports.push({name,...await measure()});await capture(name+'-full',true);await capture(name+'-opening')}
 for(const [w,h,name] of [[1440,900,'desktop'],[390,844,'mobile']]){
  await viewport(w,h);await navigate();const max=await ev('document.documentElement.scrollHeight-innerHeight');const boundaries=await ev(`${JSON.stringify(config.scenes)}.map(selector=>({selector,top:document.querySelector(selector).getBoundingClientRect().top+scrollY}))`);
  const offsets=[{name:'opening',y:0},{name:'middle',y:Math.min(max,boundaries[1]?.top??max/2)},{name:'transition',y:Math.max(0,(boundaries[1]?.top??max/2)-h*.45)},{name:'ending',y:max}];
  for(const state of offsets){await ev(`scrollTo({top:${Math.round(state.y)},behavior:'instant'})`);await capture(name+'-'+state.name);report.states.push({viewport:name,state:state.name,y:await ev('scrollY')})}
  if(mode==='gate')continue;
  for(let b=0;b<boundaries.length;b++){const top=boundaries[b].top;for(const f of [.25,.5,.75]){const y=Math.max(0,Math.min(max,top-h+h*f));await ev(`scrollTo({top:${Math.round(y)},behavior:'instant'})`);await capture(`${name}-boundary-${b}-${f*100}`);report.transitions.push({viewport:name,boundary:boundaries[b].selector,fraction:f,y:await ev('scrollY')})}}
  for(const f of [.14,.37,.61,.84]){await ev(`scrollTo({top:${Math.round(max*f)},behavior:'instant'})`);await capture(`${name}-arbitrary-${f*100}`);report.arbitrary.push({viewport:name,fraction:f,y:await ev('scrollY')})}
  await page('Input.dispatchMouseEvent',{type:'mouseWheel',x:100,y:400,deltaX:0,deltaY:-20000});await waitFor('scrollY===0');await page('Input.dispatchMouseEvent',{type:'mouseWheel',x:100,y:400,deltaX:0,deltaY:20000});await waitFor('scrollY==='+max);await page('Input.dispatchMouseEvent',{type:'mouseWheel',x:100,y:400,deltaX:0,deltaY:-20000});await waitFor('scrollY===0');report.checks[name+'Wheel']=true;
 }
 if(mode!=='gate'){
  await viewport(1440,900);await navigate();
  report.checks.links=await ev(`Array.from(document.querySelectorAll('a')).map(a=>({href:a.getAttribute('href'),valid:a.getAttribute('href').startsWith('mailto:')||(a.getAttribute('href').startsWith('#')&&!!document.querySelector(a.getAttribute('href')))||(${JSON.stringify(config.documentPaths||[])}.includes(new URL(a.href).pathname)&&new URL(a.href).origin===location.origin)}))`);assert(report.checks.links.every(l=>l.valid),'Invalid template link');
  const count=await ev('document.querySelectorAll("main details").length');report.checks.disclosures=count;
  if(count){await tabTo('main details summary');await key('Enter','Enter',13);assert(await ev('document.querySelector("main details").open'),'Enter disclosure failed');await capture('keyboard-open');await key(' ','Space',32);assert(await ev('!document.querySelector("main details").open'),'Space disclosure failed');report.checks.keyboard=true}
  await page('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await navigate();assert(await ev('matchMedia("(prefers-reduced-motion:reduce)").matches'),'Reduced motion emulation failed');await capture('reduced-opening');report.checks.reduced=true;
  await page('Emulation.setScriptExecutionDisabled',{value:true});scriptDisabled=true;const beforeReload=await ev('performance.timeOrigin');await page('Page.reload');await waitFor(`performance.timeOrigin!==${beforeReload}&&${ready}`);if(count){await tabTo('main details summary');await key('Enter','Enter',13);assert(await ev('document.querySelector("main details").open'),'No-script disclosure failed')}report.checks.noScript=await measure();await capture('no-script',true);await page('Emulation.setScriptExecutionDisabled',{value:false});scriptDisabled=false;
  await viewport(390,844,true);await navigate();await ev('window.__touches=[];document.addEventListener("pointerdown",e=>window.__touches.push({type:e.pointerType,trusted:e.isTrusted}))');if(count){await touch('main details summary');assert(await ev('document.querySelector("main details").open'),'Touch disclosure failed');await capture('touch-open');await touch('main details summary');report.checks.touch=await ev('window.__touches');assert(report.checks.touch.every(e=>e.type==="touch"&&e.trusted),'Trusted touch missing')}
  await ev('scrollTo(0,0)');await page('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:12,y:700,radiusX:4,radiusY:4,force:1}]});for(let y=680;y>=200;y-=40){await page('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:12,y,radiusX:4,radiusY:4,force:1}]});await sleep(20)}await page('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await waitFor('scrollY>0');report.checks.touchScroll=await ev('scrollY');
 }
 const bad=report.viewports.find(v=>v.overflow||v.missing||v.clipped.length||v.scenes.some(s=>!s.visible)||v.fonts.some(f=>f.status!=='loaded')||config.fonts.some(f=>!v.fonts.find(x=>x.family===f)));assert(!bad,'Viewport defect: '+JSON.stringify(bad));assert(!errors.length,'Runtime/resource errors');report.result='passed-observable-checks';
}catch(e){report.result='failed';report.failure=e.message;process.exitCode=1}
finally{record();console.log(JSON.stringify({result:report.result,failure:report.failure,viewports:report.viewports,states:report.states.length,transitions:report.transitions.length,arbitrary:report.arbitrary.length,checks:report.checks,errors}));await send('Target.closeTarget',{targetId}).catch(()=>{});ws.close();clearTimeout(deadline)}
