const deadline=setTimeout(()=>process.exit(2),50000);
import fs from 'node:fs';
import path from 'node:path';
const [endpoint,url,label,width='1440',height='900',mode='quick',...options]=process.argv.slice(2);
if(!/^wss?:\/\/127\.0\.0\.1:/.test(endpoint)||!/^https?:\/\//.test(url)||!/^[a-z0-9-]+$/.test(label)||!['quick','deep'].includes(mode))throw new Error('Provide local browser, source URL, label, width, height and quick/deep');
const directory=path.resolve('.webart/references');
const indexPath=path.resolve('docs/production/reference-index.json');
const sourceHost=new URL(url).hostname.replace(/^www\./,'');
const known=fs.existsSync(indexPath)?JSON.parse(fs.readFileSync(indexPath,'utf8')).references.find(r=>new URL(r.url).hostname.replace(/^www\./,'')===sourceHost):null;
const recheck=options.find(v=>v.startsWith('--recheck='))?.slice(10);
if(known?.status==='rejected'&&!recheck){console.log(JSON.stringify({result:'skipped-known-rejection',name:known.name,reason:known.reason}));clearTimeout(deadline);process.exit(0)}
if(recheck&&recheck.length<12)throw new Error('A recheck requires a concrete new-evidence reason');
fs.mkdirSync(directory,{recursive:true});
const ws=new WebSocket(endpoint);let serial=0;const pending=new Map();
await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}}});
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timeout'));},method==='Page.navigate'||method==='Page.captureScreenshot'?25000:10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
const {targetId}=await send('Target.createTarget',{url:'about:blank'});
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
const page=(method,params)=>send(method,params,sessionId);
const evaluate=async(expression)=>{const r=await page('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
await page('Page.enable');await page('Runtime.enable');
await page('Emulation.setDeviceMetricsOverride',{width:+width,height:+height,deviceScaleFactor:1,mobile:+width<700});
await page('Page.bringToFront');
await page('Page.navigate',{url});
for(let i=0;i<50;i++){if(await evaluate('document.readyState!=="loading" && document.body && document.body.innerText.length>100'))break;await new Promise(r=>setTimeout(r,150));}
await evaluate('Promise.race([document.fonts.ready.then(()=>true),new Promise(r=>setTimeout(r,1500))])');
for(let i=0;i<32;i++){
  const ready=await evaluate("[...document.images].filter(e=>{const r=e.getBoundingClientRect();return r.width>100&&r.height>100&&r.top<innerHeight&&r.bottom>0}).every(e=>e.complete&&e.naturalWidth>0)");
  if(ready)break;
  await new Promise(r=>setTimeout(r,250));
}
await page('Page.bringToFront');
await new Promise(r=>setTimeout(r,2500));
const opening=await page('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(directory,label+'-opening.png'),Buffer.from(opening.data,'base64'));
const initial=await evaluate(`({url:location.href,title:document.title,viewport:[innerWidth,innerHeight],height:document.documentElement.scrollHeight,images:document.images.length,videos:document.querySelectorAll('video').length,canvas:document.querySelectorAll('canvas').length,headings:[...document.querySelectorAll('h1,h2,h3')].map(e=>e.innerText),text:document.body.innerText.slice(0,12000),links:[...document.querySelectorAll('a')].map(e=>({text:e.innerText.slice(0,60),href:e.href})).filter(e=>e.text)})`);
initial.recheckReason=recheck??null;
if(mode==='quick'){initial.mode=mode;fs.writeFileSync(path.join(directory,label+'.json'),JSON.stringify(initial,null,2)+'\n');console.log(JSON.stringify({label,url:initial.url,title:initial.title,height:initial.height,images:initial.images,videos:initial.videos,canvas:initial.canvas,mode}));ws.close();clearTimeout(deadline);process.exit(0)}
await evaluate('window.scrollTo(0,Math.min(document.documentElement.scrollHeight-innerHeight,innerHeight))');await new Promise(r=>setTimeout(r,500));
const middle=await page('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(directory,label+'-middle.png'),Buffer.from(middle.data,'base64'));
await evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');await new Promise(r=>setTimeout(r,500));
const ending=await page('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(directory,label+'-ending.png'),Buffer.from(ending.data,'base64'));
await evaluate('window.scrollTo(0,0)');
const full=await page('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:await evaluate('({x:0,y:0,width:innerWidth,height:document.documentElement.scrollHeight,scale:1})')});fs.writeFileSync(path.join(directory,label+'-full.png'),Buffer.from(full.data,'base64'));

initial.targetId=targetId;initial.mode=mode;fs.writeFileSync(path.join(directory,label+'.json'),JSON.stringify(initial,null,2)+'\n');
console.log(JSON.stringify({label,url:initial.url,targetId,viewport:initial.viewport,height:initial.height,images:initial.images,videos:initial.videos,canvas:initial.canvas,headings:initial.headings,text:initial.text.slice(0,900)}));ws.close();clearTimeout(deadline);
