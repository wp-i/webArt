import test from'node:test';import assert from'node:assert/strict';import vm from'node:vm';import{nativeWheelTo,nativePositionTo,nativePositionTarget}from'./production/native-scroll.mjs';
import{nativeTouchTo}from'./production/native-scroll.mjs';
test('phone process uses trusted finger events in both directions and fails when the document cannot move',async()=>{
 let y=0,last=null;const events=[];
 const surface={evaluate:async expression=>expression==='scrollY'?y:{width:390,height:844},page:async(method,p)=>{assert.equal(method,'Input.dispatchTouchEvent');events.push(p.type);const point=p.touchPoints[0];if(p.type==='touchStart')last=point.y;if(p.type==='touchMove'){y=Math.max(0,Math.min(1800,y+last-point.y));last=point.y}}};
 await nativeTouchTo(surface,1200,{intervalMs:0});assert.ok(Math.abs(y-1200)<=18);await nativeTouchTo(surface,0,{intervalMs:0});assert.ok(y<=18);
 assert.equal(events.filter(e=>e==='touchStart').length,events.filter(e=>e==='touchEnd').length);assert.ok(events.includes('touchMove'));
 await assert.rejects(()=>nativeTouchTo({...surface,page:async()=>{}},900,{intervalMs:0}),/did not move/);
 await assert.rejects(()=>nativeTouchTo(surface,-1),/finite/);
});
test('native scrolling reaches a distant state when a source clamps individual wheel events',async()=>{
 let y=0;const inputs=[],surface={evaluate:async()=>y,page:async(method,p)=>{assert.equal(method,'Input.dispatchMouseEvent');assert.equal(p.type,'mouseWheel');inputs.push(p.deltaY);y+=Math.sign(p.deltaY)*Math.min(200,Math.abs(p.deltaY))}};
 const result=await nativeWheelTo(surface,3750,{intervalMs:0});assert.equal(result.y,3750);assert.ok(inputs.length>18);await nativeWheelTo(surface,0,{intervalMs:0});assert.equal(y,0);assert.ok(inputs.some(d=>d<0));
});
test('a stationary document is not reported as an ending or a complete custom stage',async()=>{
 let calls=0;const surface={evaluate:async()=>0,page:async()=>{calls++}};await assert.rejects(()=>nativeWheelTo(surface,900,{intervalMs:0}),/custom stage explicitly/);assert.ok(calls<60);
});
test('already reached and invalid targets do not inject wheel events',async()=>{
 const surface={evaluate:async()=>0,page:async()=>assert.fail('Unexpected input')};assert.equal((await nativeWheelTo(surface,0)).events,0);await assert.rejects(()=>nativeWheelTo(surface,NaN),/finite/);
});
test('queued inertia must settle before a state is reported as reached',async()=>{
 let y=0,queued=false,reads=0;const inputs=[],surface={evaluate:async()=>{if(queued&&++reads===2){y+=24;queued=false}return y},page:async(_,p)=>{inputs.push(p.deltaY);y+=p.deltaY;if(inputs.length===1)queued=true}};
 const result=await nativeWheelTo(surface,900,{intervalMs:0});assert.equal(result.y,900);assert.ok(inputs.some(delta=>delta<0));
});

test('delayed compositor wheel acknowledgement cannot accumulate stale-position input',async()=>{
 let y=0,pending=0,maximum=0;
 const surface={evaluate:async()=>y,page:async(_,p)=>{pending++;maximum=Math.max(maximum,pending);setTimeout(()=>{y+=p.deltaY;pending--},50)}};
 const result=await nativeWheelTo(surface,1300,{intervalMs:1,timeoutMs:2000});
 assert.equal(result.y,1300);assert.equal(maximum,1);assert.equal(pending,0);
});
function layoutFixture(){
 const model={y:0,max:1000,anchor:600,inputs:[]};
 const surface={evaluate:async expression=>vm.runInNewContext(expression,{scrollY:model.y,innerHeight:900,document:{documentElement:{scrollHeight:model.max+900},querySelector:selector=>selector==='#scene'?{getBoundingClientRect:()=>({top:model.anchor-model.y})}:null}}),page:async(method,input)=>{assert.equal(method,'Input.dispatchMouseEvent');assert.equal(input.type,'mouseWheel');model.inputs.push(input.deltaY);model.y=Math.max(0,Math.min(model.max,model.y+input.deltaY))}};
 return {surface,model};
}
test('a late-loaded image must move the captured ending to the new document end',async()=>{
 const{surface,model}=layoutFixture();let calls=0;
 const result=await nativePositionTo(surface,1,{intervalMs:0,settleMs:0,ready:async()=>{if(++calls===1)model.max=1800}});
 assert.equal(result.y,1800);assert.equal(result.layoutPasses,2);assert.ok(model.inputs.length>=2);
});
test('anchors are remeasured after media readiness and an unstable layout cannot be called captured',async()=>{
 const{surface,model}=layoutFixture();let calls=0;
 const result=await nativePositionTo(surface,{selector:'#scene',offset:.2},{intervalMs:0,settleMs:0,ready:async()=>{if(++calls===1)model.anchor=850}});assert.equal(result.y,670);assert.equal(result.layoutPasses,2);
 await assert.rejects(()=>nativePositionTo(surface,1,{intervalMs:0,settleMs:0,maxPasses:3,ready:async()=>{model.max+=100}}),/changed after media/);
 await assert.rejects(()=>nativePositionTarget(surface,{selector:'#scene',y:1}),/configured fraction/);
 await assert.rejects(()=>nativePositionTarget(surface,{selector:'#missing'}),/anchor is missing/);
});
