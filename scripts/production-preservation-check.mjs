import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {ROOT,loadCollection,fingerprint} from './collection.mjs';
import {serveDirectory} from './production/project.mjs';
import {browserEndpoint,runCapture} from './production/process.mjs';
import {BrowserPage} from './production/browser.mjs';
import {measureVisualState,visualMeasurementFailures} from './production/visual-contract.mjs';

// Native browser rejection regressions. No model verdicts or art admission.
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'webart-preservation-browser-')),directory='docs/evidence/redo-v2/static-pipeline/preservation-regression',before=loadCollection().templates.map(e=>({id:e.id,sha256:fingerprint(e)}));
const description='Engineering fixture for the locked subject, visible footprint and state role; this is not a real design acceptance.';
const contract={schemaVersion:1,states:Object.fromEntries(['opening','transition','middle','ending'].map(state=>[state,{subject:description,material:description,composition:description,role:description,visibleCharacters:{desktop:180,mobile:140},subjectSelectors:[{selector:'[data-subject="'+state+'"]',minimumViewportArea:.08,maxInstances:1}]}])),continuity:[]};
const cases=[
 {id:'copy-wall',state:'middle',change:html=>html.replace('MIDDLE','<p>'+('Visual copy '.repeat(7))+'</p><p>'+('Visual copy '.repeat(7))+'</p><p>'+('Visual copy '.repeat(7))+'</p>'),reason:'文字'},
 {id:'ordinary-ending',state:'ending',change:html=>html.replace('<div class="subject" data-subject="ending">ENDING</div>','<p>Contact</p><button>Get in touch</button>'),reason:'主体'},
 {id:'tiny-subject',state:'middle',change:html=>html.replace('data-subject="middle"','data-subject="middle" style="width:8px;height:8px"'),reason:'主体'},
 {id:'repeated-subject',state:'middle',change:html=>html.replace('MIDDLE</div>','MIDDLE</div><div class="subject duplicate" data-subject="middle">REPEATED</div>'),reason:'主体'},
 {id:'hidden-ancestor',state:'transition',change:html=>html.replace('id="transition"','id="transition" style="opacity:0"'),reason:'主体'}
];
const base=`<!doctype html><meta name="viewport" content="width=device-width"><title>Engineering failure regression</title><style>*{box-sizing:border-box}body{margin:0;background:#e5e4df;color:#242420;font:24px Arial}section{height:100vh;position:relative;padding:8vh 5vw}.subject{width:80vw;height:70vh;background:#777763;color:white;padding:30px;font-size:32px}p{font-size:18px;line-height:1.5;max-width:650px}.duplicate{position:absolute;left:10vw;top:20vh;width:60vw;height:45vh;background:#66776f}</style>`+['opening','transition','middle','ending'].map(s=>`<section id="${s}"><div class="subject" data-subject="${s}">${s.toUpperCase()}</div></section>`).join('');
const host=await serveDirectory(temp),report={purpose:'Real native-browser failure regressions; no aesthetic admission, model calls or produced design.',started:new Date().toISOString(),cases:[],realModelCalls:0,archivesCreated:0};
try{
 const endpoint=await browserEndpoint({root:ROOT});
 for(const c of cases){
  fs.writeFileSync(path.join(temp,'index.html'),c.change(base));const output=directory+'/'+c.id,filename=output+'/config.json';fs.mkdirSync(path.join(ROOT,output),{recursive:true});
  try{await runCapture({root:ROOT,endpoint,cfg:{url:host.url,output,ready:'true',states:{opening:0,transition:{selector:'#transition',offset:0},middle:{selector:'#middle',offset:0},ending:{selector:'#ending',offset:0}},visualContract:contract,pointer:{selector:'[data-subject="opening"]'}},filename});throw Error('Expected this native failure to stop capture: '+c.id)}catch(error){
   const capture=JSON.parse(fs.readFileSync(path.join(ROOT,output,'capture.json'),'utf8'));assert.equal(capture.result,'failed');const failed=capture.states.find(s=>s.visualFailures?.length);assert.equal(failed?.state,c.state);assert.ok(failed.visualFailures.some(s=>s.includes(c.reason)));report.cases.push({id:c.id,result:'correctly-blocked',viewport:failed.viewport,state:failed.state,measurement:failed.visualMeasurement,failures:failed.visualFailures,evidence:failed.evidence});
  }
 }
 const mobile=await BrowserPage.create(endpoint);
 try{
  await mobile.viewport(390,844);
  for(const c of cases){
   fs.writeFileSync(path.join(temp,'index.html'),c.change(base));await mobile.navigate(host.url);
   const target=await mobile.evaluate(`document.querySelector('#${c.state}').getBoundingClientRect().top+scrollY`);
   await mobile.page('Input.dispatchMouseEvent',{type:'mouseWheel',x:8,y:100,deltaX:0,deltaY:target});
   await mobile.evaluate(`new Promise((resolve,reject)=>{let n=0;const check=()=>Math.abs(scrollY-${target})<3?resolve():n++>100?reject(Error('Native scroll did not reach the configured state')):requestAnimationFrame(check);check()})`);
   const measured=await mobile.evaluate(`(${measureVisualState.toString()})(${JSON.stringify(contract.states[c.state])})`),failures=visualMeasurementFailures(measured,contract.states[c.state],'mobile');assert.ok(failures.some(s=>s.includes(c.reason)),c.id+' mobile rejection');
   report.cases.push({id:c.id,result:'correctly-blocked',viewport:'mobile',state:c.state,measurement:measured,failures,evidence:[await mobile.shot(ROOT,directory+'/'+c.id+'/mobile-'+c.state+'.jpg')]});
  }
 }finally{await mobile.close()}
 assert.deepEqual(loadCollection().templates.map(e=>({id:e.id,sha256:fingerprint(e)})),before);report.officialSourcesUnchanged=true;report.result='passed-rejection-regression';console.log(JSON.stringify({result:report.result,cases:report.cases.length,realModelCalls:0,archivesCreated:0}));
}finally{
 report.finished=new Date().toISOString();fs.mkdirSync(path.join(ROOT,directory),{recursive:true});fs.writeFileSync(path.join(ROOT,directory,'receipt.json'),JSON.stringify(report,null,2)+'\n');await new Promise(r=>host.server.close(r));
 if(path.dirname(temp)!==os.tmpdir()||!path.basename(temp).startsWith('webart-preservation-browser-'))throw Error('Unsafe fixture cleanup');fs.rmSync(temp,{recursive:true,force:true});
}
