import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {ROOT,child} from './collection.mjs';
import {serveDirectory} from './production/project.mjs';
import {browserEndpoint,runCapture} from './production/process.mjs';

// Engineering fixture only: actual native input reveals a late image which
// increases the document height. No image or judgment here is a design sample.
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'webart-scroll-layout-'));
const id='scroll-layout-'+new Date().toISOString().replace(/[-:.TZ]/g,'');
const output='docs/evidence/redo-v2/static-pipeline/'+id;
fs.mkdirSync(child(ROOT,output),{recursive:true});
let host;
try{
 fs.writeFileSync(path.join(temporary,'index.html'),'<!doctype html><meta name="viewport" content="width=device-width"><title>Engineering layout fixture</title><link rel="stylesheet" href="/style.css"><main><section>Opening · engineering fixture</section><section>Transition</section><section>Middle</section><div id="late-slot"></div><section class="ending">True document end · no visual approval</section></main><script src="/app.js"></script>');
 fs.writeFileSync(path.join(temporary,'style.css'),'body{margin:0;background:#ededed;color:#202020;font:24px sans-serif}section{height:100vh;box-sizing:border-box;padding:30px;border-top:1px solid #aaa}.ending{display:flex;align-items:flex-end;background:#cbd7ce}img{display:block;width:100%;height:auto}');
 fs.writeFileSync(path.join(temporary,'late.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1400"><rect width="1440" height="1400" fill="#d5c4b5"/><text x="40" y="100" font-size="40">Delayed engineering media · not a design sample</text></svg>');
 fs.writeFileSync(path.join(temporary,'app.js'),`window.__fixtureReady=true;let queued=false;addEventListener('scroll',()=>{if(!queued&&scrollY>document.documentElement.scrollHeight-innerHeight-120){queued=true;window.__fixtureReady=false;setTimeout(()=>{const image=new Image();image.alt='Delayed layout test image';image.onload=()=>{document.querySelector('#late-slot').append(image);window.__fixtureReady=true};image.src='/late.svg'},180)}});`);
 host=await serveDirectory(temporary);
 const capture=await runCapture({root:ROOT,endpoint:await browserEndpoint({root:ROOT}),cfg:{url:host.url,ready:'window.__fixtureReady===true',states:{opening:0,transition:.2,middle:.5,ending:1},settleMs:260,output},filename:output+'/config.json'});
 if(capture.result!=='captured-not-scored'||capture.states.length!==8)throw Error('Layout regression capture incomplete');
 const checks=capture.states.filter(s=>s.state==='ending').map(s=>({viewport:s.viewport,y:s.layout.y,actualEnd:s.layout.documentHeight-s.layout.viewportHeight,documentGrew:s.layout.documentHeight>s.layout.viewportHeight*4+100,evidence:s.evidence[0]}));
 if(checks.length!==2||checks.some(c=>!c.documentGrew||Math.abs(c.y-c.actualEnd)>3))throw Error('Captured ending is based on the stale initial layout');
 const result={result:'passed-engineering-layout-regression',runId:id,checks,modelCalls:0,visualAdmission:false,capture:output+'/capture.json'};
 fs.writeFileSync(child(ROOT,output+'/result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{
 if(host)await new Promise(resolve=>host.server.close(resolve));
 if(path.dirname(temporary)!==os.tmpdir()||!path.basename(temporary).startsWith('webart-scroll-layout-'))throw Error('Unsafe engineering fixture cleanup');
 fs.rmSync(temporary,{recursive:true,force:true});
}
