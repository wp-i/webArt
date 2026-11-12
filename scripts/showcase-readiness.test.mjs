import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {frameReady,preparePreview} from './production/showcase-readiness.mjs';

function previewFixture({images=[{top:20},{top:1300,lazy:true},{top:2500,lazy:true}],ready=true,cover=false,opacity=1}={}) {
  const state={y:0,parentY:0,events:[],evaluations:[],images:images.map(image=>({...image,loaded:!image.lazy&&!image.broken}))};
  const elements=state.images.map(image=>({
    loading:image.lazy?'lazy':'eager',
    get complete(){return image.loaded||!!image.broken},
    get naturalWidth(){return image.loaded?1000:0},
    getBoundingClientRect:()=>({top:image.top-state.y,bottom:image.top+100-state.y})
  }));
  const content={URL:'http://127.0.0.1/designs/fixture/',readyState:ready?'complete':'loading',fonts:{status:'loaded'},images:elements,documentElement:{scrollHeight:3100},body:{scrollHeight:3100},querySelector:selector=>selector==='.load-cover'&&cover?{getBoundingClientRect:()=>({bottom:0})}:selector==='.page.is-ready'?{}:selector==='.hero__copy'?{}:null};
  const contentWindow={innerHeight:500,get scrollY(){return state.y},set scrollY(value){throw Error('Direct iframe scrolling is forbidden')},getComputedStyle:()=>({opacity:String(opacity)})};
  const frame={contentDocument:content,contentWindow,getAttribute:()=>'/designs/fixture/',getBoundingClientRect:()=>({left:40,right:1440,top:90,bottom:590})};
  const document={querySelector:selector=>selector==='#preview-frame'?frame:selector==='.preview-toolbar'?{hidden:false}:null};
  const context=vm.createContext({document,innerWidth:1440,innerHeight:900});
  const evaluate=async expression=>{state.evaluations.push(expression);return vm.runInContext(expression,context)};
  const page=async (method,event)=>{
    assert.equal(method,'Input.dispatchMouseEvent');state.events.push(event);
    if(event.type!=='mouseWheel')return;
    assert.ok(event.x>40&&event.x<1440&&event.y>90&&event.y<590,'Wheel must target the iframe interior');
    state.y=Math.max(0,Math.min(2600,state.y+event.deltaY));
    for(const image of state.images)if(!image.broken&&image.top<state.y+500&&image.top+100>state.y)image.loaded=true;
  };
  const wait=async expression=>{for(let attempt=0;attempt<3;attempt++)if(await evaluate(expression))return;throw Error('Not ready: '+expression)};
  return {state,evaluate,page,wait,sleep:async()=>{}};
}

test('native iframe traversal exposes middle and ending lazy images and restores the opening before the strict gate',async()=>{
  const fixture=previewFixture();
  assert.equal(await fixture.evaluate(frameReady),false,'Below-fold native lazy images initially fail the strict gate');
  const result=await preparePreview(fixture);
  assert.equal(result.pendingLazy,2);assert.ok(result.wheelSteps>1);assert.equal(result.endingScrollY,2600);assert.equal(result.openingScrollY,0);assert.equal(result.restoredScrollY,0);
  assert.ok(fixture.state.images.every(image=>image.loaded));assert.equal(fixture.state.y,0);assert.equal(fixture.state.parentY,0);assert.equal(await fixture.evaluate(frameReady),true);
  const wheels=fixture.state.events.filter(event=>event.type==='mouseWheel');
  assert.ok(wheels.some(event=>event.deltaY>0));assert.ok(wheels.at(-1).deltaY<0,'Restoration also uses native reverse input');
  assert.equal(fixture.state.evaluations.some(expression=>/scrollTo|scrollIntoView|setAttribute|\.loading\s*=(?!=)/.test(expression)),false,'Readiness never forces loading or programmatic scrolling');
});

test('a broken lazy image still fails and the failed traversal returns to the opening',async()=>{
  const fixture=previewFixture({images:[{top:20},{top:1300,lazy:true,broken:true}]});
  await assert.rejects(preparePreview(fixture),/Not ready:/);
  assert.equal(fixture.state.y,0);assert.equal(await fixture.evaluate(frameReady),false);
  assert.ok(fixture.state.events.some(event=>event.type==='mouseWheel'&&event.deltaY<0));
});

test('already loaded previews need no traversal and broken eager images cannot gain a pass',async()=>{
  const loaded=previewFixture({images:[{top:20}]});
  assert.equal(await preparePreview(loaded),undefined);assert.equal(loaded.state.events.length,0);
  const broken=previewFixture({images:[{top:20,broken:true}]});
  await assert.rejects(preparePreview(broken),/Not ready:/);assert.equal(broken.state.events.length,0);
});

test('an incomplete iframe document cannot receive warmup input',async()=>{
  const fixture=previewFixture({ready:false});
  await assert.rejects(preparePreview(fixture),/Not ready:/);assert.equal(fixture.state.events.length,0);
});

test('lazy-image completion does not relax the original entrance opacity gate',async()=>{
  const fixture=previewFixture({cover:true,opacity:.5});
  await assert.rejects(preparePreview(fixture),/Not ready:/);
  assert.ok(fixture.state.images.every(image=>image.loaded));assert.equal(fixture.state.y,0);assert.equal(await fixture.evaluate(frameReady),false);
});
