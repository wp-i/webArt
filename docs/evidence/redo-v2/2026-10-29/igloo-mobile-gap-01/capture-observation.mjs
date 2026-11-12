import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),out='docs/evidence/redo-v2/2026-10-29/igloo-mobile-gap-01';
const {BrowserPage}=await import(pathToFileURL(path.join(root,'scripts/production/browser.mjs')));
if(fs.existsSync(path.join(root,out,'observation.json')))throw Error('Preserve prior observation');
const b=await BrowserPage.create(process.argv[2]),wait=ms=>new Promise(r=>setTimeout(r,ms));
const report={schemaVersion:1,purpose:'Bounded actual mobile source gap observation only; no candidate, assets or admission',url:'https://www.igloo.inc/',started:new Date().toISOString(),deadlineMs:180000,frameLimit:42,frames:[],actions:[],errors:[],result:'running'};
const save=()=>fs.writeFileSync(path.join(root,out,'observation.json'),JSON.stringify(report,null,2)+'\n');
const state=()=>b.evaluate(`({url:location.href,width:innerWidth,height:innerHeight,screen:[screen.width,screen.height],reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,visibility:document.visibilityState,focus:document.hasFocus(),y:scrollY,heightDocument:document.documentElement.scrollHeight,ua:navigator.userAgent})`);
async function shot(label){if(report.frames.length>=42||report.frames.some(f=>f.label===label)||!/^[a-z0-9-]+$/.test(label))throw Error('Frame limit or unique label violation');const s=await state();if(s.width!==390||s.height!==844||s.screen[0]!==390||s.screen[1]!==844||s.visibility!=='visible'||!s.focus)throw Error('Unexpected mobile viewport or visibility');const f={label,at:new Date().toISOString(),state:s,evidence:await b.shot(root,out+'/'+label+'.jpg')};report.frames.push(f);save();console.log(JSON.stringify({frame:f}));}
let ended=false;
async function finish(result){if(ended)return;ended=true;report.result=result;report.finished=new Date().toISOString();save();await b.close();console.log(JSON.stringify({result,frames:report.frames.length,output:out}));process.exit(result==='observed-not-admitted'?0:1)}
const deadline=setTimeout(()=>finish('bounded-deadline'),180000);
const point=(x,y)=>({x,y,radiusX:4,radiusY:4,force:1});
async function moveFinger(a,z){for(let j=1;j<=14;j++){await b.page('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(a[0]+(z[0]-a[0])*j/14,a[1]+(z[1]-a[1])*j/14)]});await wait(30)}}
try{
 await b.viewport(390,844);await b.page('Page.bringToFront');report.browser=await b.send('Browser.getVersion');await b.navigate(report.url);await wait(8500);await shot('normal-opening');
 const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
 for await(const line of lines){if(!line.trim())continue;const c=JSON.parse(line);
 if(c.op==='finish'){clearTimeout(deadline);await finish('observed-not-admitted');break}
 if(c.op==='horizontal'){
  const a=c.from??[90,450],z=c.to??[300,450];await b.page('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(...a)]});await moveFinger(a,z);await wait(220);report.actions.push({type:'native-finger-horizontal-forward',from:a,to:z,heldBeforeFrameMs:220,at:new Date().toISOString(),reduced:(await state()).reduced});await shot(c.label+'-held-forward');await moveFinger(z,a);await wait(220);report.actions.push({type:'native-finger-horizontal-reverse',from:z,to:a,heldBeforeFrameMs:220,at:new Date().toISOString(),reduced:(await state()).reduced});await shot(c.label+'-held-reverse');await b.page('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(1100);await shot(c.label+'-released');
 }else if(c.op==='vertical'){
  for(let i=0;i<(c.n??1);i++){const a=[c.x??195,c.from??650],z=[c.x??195,c.to??250];await b.page('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(...a)]});await moveFinger(a,z);await wait(220);await b.page('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});report.actions.push({type:'native-finger-vertical',from:a,to:z,heldBeforeReleaseMs:220,at:new Date().toISOString(),reduced:(await state()).reduced});await wait(c.settle??1100);await shot(c.label+'-'+(i+1))}
 }else if(c.op==='reduced'){
  await b.page('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:c.value?'reduce':'no-preference'}]});report.actions.push({type:'motion-preference',reduced:c.value,at:new Date().toISOString()});if(c.reload){await b.navigate(report.url);await wait(8500)}else await wait(1100);await shot(c.label);
 }else if(c.op==='wait'){await wait(Math.min(c.ms??1500,3000));await shot(c.label)}
 else if(c.op==='shot')await shot(c.label);
 else throw Error('Unsupported observation operation');
 }
}catch(e){report.errors.push(e.message);await finish('incomplete')}
