import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {ROOT,loadCollection,fingerprint} from './collection.mjs';
const [endpoint,origin='http://127.0.0.1:4180',only='all']=process.argv.slice(2);
if(!/^ws:\/\/127\.0\.0\.1:\d+\//.test(endpoint||'')||new URL(origin).hostname!=='127.0.0.1')throw new Error('Use the task browser endpoint and local previews');
const dir=path.join(ROOT,'docs/evidence/quality-calibration');fs.mkdirSync(dir,{recursive:true});const entries=loadCollection().templates.filter(e=>only==='all'||e.id===only);if(!entries.length)throw new Error('No registered design');
const report={started:new Date().toISOString(),purpose:'paired quality evidence, not aesthetic scoring',pages:[],errors:[]};let ws,serial=0,targetId,sessionId;const pending=new Map();
const save=()=>fs.writeFileSync(path.join(dir,'capture.json'),JSON.stringify(report,null,2)+'\n');
const deadline=setTimeout(()=>{report.result='failed';report.failure='Capture deadline at '+report.phase;save();process.exit(2)},180000);
const send=(method,params={},sid)=>new Promise((r,j)=>{const id=++serial,t=setTimeout(()=>{pending.delete(id);j(new Error(method+' timeout'))},method==='Page.captureScreenshot'?20000:12000);pending.set(id,{r,j,t});ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}))});const sleep=ms=>new Promise(r=>setTimeout(r,ms));const assert=(v,m)=>{if(!v)throw new Error(m)};
const page=(m,p={})=>send(m,p,sessionId);const ev=async(expression)=>{const r=await page('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
async function ready(){for(let n=0;n<70;n++){if(await ev(`document.readyState==='complete'&&document.fonts.status==='loaded'&&[...document.images].filter(e=>{const r=e.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0}).every(e=>e.complete&&e.naturalWidth)&&(!document.querySelector('.load-cover')||document.querySelector('.load-cover').getBoundingClientRect().bottom<1)`))return;await sleep(100)}throw new Error('Visible content not ready')}
async function shot(record,name){report.phase=record.id+'/'+name;await sleep(110);const r=await page('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const filename=`${record.id}-${name}.png`;const bytes=Buffer.from(r.data,'base64');fs.writeFileSync(path.join(dir,filename),bytes);record.evidence.push({name,path:'docs/evidence/quality-calibration/'+filename,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})}
const motion=()=>ev(`({y:scrollY,progress:(document.documentElement.scrollHeight-innerHeight)?scrollY/(document.documentElement.scrollHeight-innerHeight):0,paint:[...document.querySelectorAll('.chapter,.hero img,.coast img,.project-image img,.picture-link img,.phone,.note,.visual__light,.passage__light')].slice(0,18).map(e=>({selector:e.className,transform:getComputedStyle(e).transform,opacity:getComputedStyle(e).opacity,clip:getComputedStyle(e).clipPath})),body:document.body.innerText.slice(0,300)})`);
try{
 ws=new WebSocket(endpoint);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.t);pending.delete(m.id);m.error?p.j(new Error(m.error.message)):p.r(m.result)}}else if(m.sessionId===sessionId&&m.method==='Runtime.exceptionThrown')report.errors.push(m.params)});
 ({targetId}=await send('Target.createTarget',{url:'about:blank'}));({sessionId}=await send('Target.attachToTarget',{targetId,flatten:true}));await page('Page.enable');await page('Runtime.enable');await page('Page.bringToFront');
 for(const entry of entries){
  const record={id:entry.id,title:entry.title,sourceSha256:fingerprint(entry),evidence:[],viewports:[],motion:[]};report.pages.push(record);
  for(const [width,height] of [[1440,900],[390,844]]){
   await page('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});await page('Emulation.setTouchEmulationEnabled',{enabled:width<700,maxTouchPoints:1});await page('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
   const time=await ev('performance.timeOrigin');await page('Page.navigate',{url:origin+(entry.preview||`/${entry.projectDir}/`)});for(let n=0;n<50;n++){if(await ev(`performance.timeOrigin!==${time}`))break;await sleep(70)}await ready();await sleep(entry.id==='001'?400:120);await page('Input.dispatchMouseEvent',{type:'mouseMoved',x:4,y:4});await shot(record,width+'-opening');
   const max=await ev('document.documentElement.scrollHeight-innerHeight');record.viewports.push({width,height,scrollRange:max,finePointer:await ev('matchMedia("(hover:hover) and (pointer:fine)").matches')});
   for(const fraction of (width===1440?[.16,.33,.5,.67,.84,1,.5,0]:[.33,.67,1,0])){
    const before=await ev('scrollY');await page('Input.dispatchMouseEvent',{type:'mouseWheel',x:8,y:height*.7,deltaX:0,deltaY:Math.round(max*fraction-before)});for(let n=0;n<40;n++){if(await ev(`Math.abs(scrollY-${Math.round(max*fraction)})<3`))break;await sleep(35)}await sleep(230);record.motion.push({width,input:'native-wheel',requested:fraction,...await motion()});await shot(record,`${width}-scroll-${fraction}-${record.motion.length}`);
   }
   if(width===1440){
    const selector={'001':'.hero-section','006':'.hero','007':'.coast','008':'.hero','009':'.picture-link','010':'.phone-wrap'}[entry.id];
    const b=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:Math.max(25,r.left),y:Math.max(90,r.top),width:r.width,height:Math.min(r.height,innerHeight-100)}})()`);
    for(const f of [.2,.8]){await page('Input.dispatchMouseEvent',{type:'mouseMoved',x:Math.min(width-30,b.x+b.width*f),y:Math.min(height-50,b.y+b.height*.55)});await sleep(450);record.motion.push({width,input:'pointer',fraction:f,...await motion()});await shot(record,`${width}-pointer-${f}`)}
    await page('Input.dispatchMouseEvent',{type:'mouseMoved',x:3,y:3});await sleep(500);record.motion.push({width,input:'leave-stop',...await motion()});await shot(record,width+'-pointer-leave');
    if(entry.id==='001'){
     const y=Math.round(max*2/3);await ev(`scrollTo({top:${y},behavior:'instant'})`);await sleep(400);const p=await ev(`(()=>{const r=document.querySelector('.expose-control').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await page('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await page('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await sleep(500);await shot(record,'1440-held');await page('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});await sleep(450);await shot(record,'1440-released');
    }
   }
   await page('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await page('Page.reload');await ready();await shot(record,width+'-reduced');
  }
  save();console.log(JSON.stringify({id:entry.id,frames:record.evidence.length,sourceSha256:record.sourceSha256}));
 }
 assert(!report.errors.length,'Runtime errors in evidence capture');report.result='captured-not-scored';
}catch(e){report.result='failed';report.failure=e.message;process.exitCode=1}
finally{report.finished=new Date().toISOString();save();if(ws?.readyState===1){await send('Target.closeTarget',{targetId}).catch(()=>{});ws.close()}clearTimeout(deadline);console.log(JSON.stringify({result:report.result,failure:report.failure,pages:report.pages.length}))}
