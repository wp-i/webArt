import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {BrowserPage,inspectControls} from './production/browser.mjs';
import {hash} from './production/api.mjs';

// Exercise the actual control-audit lifecycle with a controlled CDP substitute.
// This checks audit behavior; it is not browser evidence or visual admission.
function fixture(t,{brokenInput,prepareValue=2.4,check='Number(document.querySelector("#distance").value)===2.4',losePreparationOnTab=false,kind='reset'}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'webart-control-preconditions-'));
 t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.match(path.basename(root),/^webart-control-preconditions-/);fs.rmSync(root,{recursive:true,force:true})});
 const realTimeout=globalThis.setTimeout;
 t.mock.method(globalThis,'setTimeout',(fn,_ms,...args)=>realTimeout(fn,0,...args));
 const model={value:1,focus:null,width:0,height:0,actions:[],preparations:[],shots:[],navigations:0,closed:false};
 const attributes=new Map();
 const rect=x=>({x,y:100,left:x,right:x+60,top:100,bottom:130,width:60,height:30});
 const button={tagName:'BUTTON',type:'button',innerText:'Reset view',name:'',setAttribute:(key,value)=>attributes.set(key,String(value)),getAttribute:key=>attributes.get(key)??null,matches:selector=>selector==='#reset-view',getBoundingClientRect:()=>rect(300),scrollIntoView:()=>{}};
 const range={get value(){return String(model.value)},getBoundingClientRect:()=>rect(100)};
 const output={get value(){return model.value.toFixed(1)+'×'}};
 const document={
  get activeElement(){return model.focus},
  // The protocol fixture inventories only the action under test. Its range is
  // supplied as a preparation surface, not as a second audited control.
  querySelectorAll:()=>[button],
  querySelector:selector=>selector==='#distance'?range:selector==='#distance-value'?output:selector==='#reset-view'||selector==='[data-webart-audit="0"]'?button:null
 };
 const context=vm.createContext({document,getComputedStyle:()=>({visibility:'visible',display:'block',opacity:'1'}),scrollY:0,innerHeight:900});
 const activate=input=>{model.actions.push({input,before:model.value,width:model.width});if(input!==brokenInput)model.value=kind==='counter'?model.value+1:1};
 const browser={
  viewport:async(width,height)=>{model.width=width;model.height=height;context.innerHeight=height},
  navigate:async()=>{model.value=kind==='reset'?1:0;model.focus=null;attributes.clear();model.navigations++},
  evaluate:async expression=>vm.runInContext(expression,context),
  page:async(method,event)=>{
   if(method==='Input.dispatchMouseEvent'&&event.type==='mouseReleased'){
    if(event.x<200)model.focus=range;
    else{model.focus=button;activate('mouse')}
   }
   if(method==='Input.dispatchKeyEvent'&&event.type==='keyDown'){
    if(event.key==='End'&&model.focus===range){model.value=prepareValue;model.preparations.push({value:model.value,width:model.width})}
    if(event.key==='Tab'){model.focus=button;if(losePreparationOnTab)model.value=1.5}
    if(event.key==='Enter'&&model.focus===button)activate('keyboard');
   }
   if(method==='Input.dispatchTouchEvent'&&event.type==='touchStart')model.focus=button;
   if(method==='Input.dispatchTouchEvent'&&event.type==='touchEnd')activate('touch');
  },
  shot:async(_root,file)=>{const snapshot={path:file,value:model.value,width:model.width};model.shots.push(snapshot);return {path:file,sha256:hash(JSON.stringify(snapshot))}},
  close:async()=>{model.closed=true}
 };
 t.mock.method(BrowserPage,'create',async()=>browser);
 const resultCheck='Number(document.querySelector("#distance").value)===1 && document.querySelector("#distance-value").value==="1.0×"';
 const declaration={selector:'#reset-view',...(kind==='reset'?{prepare:{selector:'#distance',keys:['End'],check}}:{}),activeCheck:resultCheck,mouseCheck:kind==='counter'?'Number(document.querySelector("#distance").value)===2':resultCheck,touchCheck:kind==='counter'?'Number(document.querySelector("#distance").value)===2':resultCheck};
 const run=()=>inspectControls({root,endpoint:'controlled-fixture',url:'http://127.0.0.1:1234/',output:'evidence',expected:[declaration]});
 return {root,model,run};
}

test('reset audits rebuild and retain a changed prerequisite for every keyboard, mouse and touch action',async t=>{
 const f=fixture(t),report=await f.run();
 assert.equal(report.result,'captured-not-visually-approved');
 assert.deepEqual(f.model.actions.map(a=>a.input),['keyboard','mouse','keyboard','touch','keyboard','touch']);
 assert.ok(f.model.actions.every(a=>a.before===2.4));
 assert.equal(f.model.preparations.length,6);
 for(const view of report.viewports){
  const prepared=view.controls[0].evidence.filter(e=>e.state.endsWith('-prepared'));
  assert.deepEqual(prepared.map(e=>e.state),['keyboard-prepared',view.width<700?'touch-prepared':'mouse-prepared']);
  assert.ok(prepared.every(e=>f.model.shots.some(s=>s.path===e.path&&s.value===2.4&&s.width===view.width)));
 }
 assert.ok(f.model.closed);
});

for(const input of ['keyboard','mouse','touch'])test(`an ineffective ${input} reset cannot inherit a previous successful input`,async t=>{
 const f=fixture(t,{brokenInput:input});
 await assert.rejects(f.run(),e=>e.code==='controls-failed'&&/没有产生|未产生/.test(e.message));
 const attempted=f.model.actions.filter(a=>a.input===input);assert.equal(attempted.length,1);assert.equal(attempted[0].before,2.4);
 const saved=JSON.parse(fs.readFileSync(path.join(f.root,'evidence/controls.json'),'utf8'));
 assert.equal(saved.result,'failed-controls');assert.ok(f.model.closed);
 assert.ok(f.model.shots.some(s=>s.path.endsWith(`-${input}-prepared.jpg`)&&s.value===2.4));
});

test('a preparation that already satisfies the result stops before activation',async t=>{
 const f=fixture(t,{prepareValue:1,check:'Number(document.querySelector("#distance").value)===1'});
 await assert.rejects(f.run(),e=>e.code==='controls-failed'&&/目标结果已成立/.test(e.message));
 assert.deepEqual(f.model.actions,[]);
});

test('keyboard traversal cannot silently discard the verified prerequisite',async t=>{
 const f=fixture(t,{losePreparationOnTab:true});
 await assert.rejects(f.run(),e=>e.code==='controls-failed'&&/准备状态已丢失/.test(e.message));
 assert.deepEqual(f.model.actions,[]);
});

test('idempotent controls without an explicit preparation restore and record their native default before physical input',async t=>{
 const f=fixture(t,{kind:'selection'}),report=await f.run();
 assert.equal(report.result,'captured-not-visually-approved');assert.ok(f.model.actions.every(a=>a.before===0));
 assert.equal(f.model.navigations,9);
 for(const view of report.viewports){const state=view.width<700?'touch-prepared':'mouse-prepared';assert.ok(view.controls[0].evidence.some(e=>e.state===state&&f.model.shots.some(s=>s.path===e.path&&s.value===0)))}
});

test('an ineffective idempotent physical action without explicit preparation is rejected after restoring the document',async t=>{
 const f=fixture(t,{kind:'selection',brokenInput:'mouse'});
 await assert.rejects(f.run(),e=>e.code==='controls-failed'&&/未产生/.test(e.message));
 assert.deepEqual(f.model.actions.map(a=>a.before),[0,0]);
});

test('sequential counter contracts keep their unsatisfied second-action condition',async t=>{
 const f=fixture(t,{kind:'counter'}),report=await f.run();
 assert.equal(report.result,'captured-not-visually-approved');
 assert.deepEqual(f.model.actions.map(a=>a.before),[0,1,0,1,0,1]);assert.equal(f.model.navigations,6);
});
