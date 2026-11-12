// Drive the browser's native wheel path, including sites that clamp each wheel
// event. Never substitute scrollTo, style changes or application-state writes.
export async function nativeWheelTo(surface,target,{timeoutMs=30000,intervalMs=32,maxEvents=600}={}){
 if(!Number.isFinite(target)||target<0)throw Error('Native scroll target must be a non-negative finite number');
 const until=Date.now()+timeoutMs;let events=0,stalled=0,settled=0,previous=await surface.evaluate('scrollY');
 while(Date.now()<until&&events<maxEvents){
  const current=await surface.evaluate('scrollY');
  if(Math.abs(current-target)<3){if(++settled>=3)return {events,y:current};await new Promise(resolve=>setTimeout(resolve,intervalMs));continue}settled=0;
  stalled=Math.abs(current-previous)<.1?stalled+1:0;
  if(stalled>8)throw Error('Native document scroll is stationary; configure the source custom stage explicitly');
  const delta=Math.max(-900,Math.min(900,target-current));
  await surface.page('Input.dispatchMouseEvent',{type:'mouseWheel',x:8,y:400,deltaX:0,deltaY:delta});events++;previous=current;
  // The CDP acknowledgement precedes the compositor's native smooth wheel.
  // Sending another delta from stale scrollY queues overshoot/oscillation.
  // Wait for actual movement and rest, rather than rewriting page state or
  // disabling native input. Clamped source handlers still receive real events.
  const wheelUntil=Math.min(until,Date.now()+1200);let moved=false,rest=0,last=current;
  while(Date.now()<wheelUntil){
   await new Promise(resolve=>setTimeout(resolve,intervalMs));
   const at=await surface.evaluate('scrollY');moved ||= Math.abs(at-current)>.1;
   rest=Math.abs(at-last)<.1?rest+1:0;last=at;
   if(moved&&rest>=3)break;
  }
 }
 throw Error('Native scroll did not reach '+Math.round(target)+'; actual '+Math.round(await surface.evaluate('scrollY'))+' after '+events+' events');
}

// Resolve against the current layout. A lazy-loaded image can move both an
// anchor and the document end after the wheel has already reached its target.
export async function nativePositionTarget(surface,position){
 const ratio=typeof position==='number'&&Number.isFinite(position)&&position>=0&&position<=1;
 const anchor=position&&typeof position==='object'&&typeof position.selector==='string'&&position.selector.trim()&&(position.offset===undefined||Number.isFinite(position.offset)&&position.offset>=0&&position.offset<=1)&&Object.keys(position).every(k=>['selector','offset'].includes(k));
 const absolute=position&&typeof position==='object'&&Number.isFinite(position.y)&&position.y>=0&&Object.keys(position).length===1;
 if(!ratio&&!anchor&&!absolute)throw Error('Native position must be a configured fraction, anchor or absolute source position');
 return surface.evaluate(`(()=>{const position=${JSON.stringify(position)},max=Math.max(0,document.documentElement.scrollHeight-innerHeight);if(typeof position==='number')return max*position;if('y'in position)return Math.min(max,position.y);const element=document.querySelector(position.selector);if(!element)throw Error('Configured scroll anchor is missing');return Math.max(0,Math.min(max,scrollY+element.getBoundingClientRect().top-(position.offset??0)*innerHeight))})()`);
}
export async function nativePositionTo(surface,position,{ready=async()=>{},settleMs=120,maxPasses=5,...wheelOptions}={}){
 let events=0;
 for(let pass=0;pass<maxPasses;pass++){
  const target=await nativePositionTarget(surface,position),reached=await nativeWheelTo(surface,target,wheelOptions);events+=reached.events;
  await ready();if(settleMs)await new Promise(resolve=>setTimeout(resolve,settleMs));
  const currentTarget=await nativePositionTarget(surface,position),y=await surface.evaluate('scrollY');
  if(Math.abs(target-currentTarget)<3&&Math.abs(y-currentTarget)<3)return {events,y,target:currentTarget,layoutPasses:pass+1};
 }
 throw Error('Native scroll position changed after media/layout readiness; state capture must stop');
}

// Explicit trusted touch events, rather than a desktop wheel on a narrow
// viewport. Pause before lifting the finger to avoid momentum overshoot.
export async function nativeTouchTo(surface,target,{timeoutMs=25000,intervalMs=20,maxGestures=40,tolerance=18}={}){
 if(!Number.isFinite(target)||target<0)throw Error('Native touch target must be a non-negative finite number');
 const until=Date.now()+timeoutMs,{width,height}=await surface.evaluate('({width:innerWidth,height:innerHeight})');
 let gestures=0,stalled=0;
 while(Date.now()<until&&gestures<maxGestures){
  const before=await surface.evaluate('scrollY'),difference=target-before;
  if(Math.abs(difference)<=tolerance)return {gestures,y:before};
  const distance=Math.sign(difference)*Math.min(height*.54,Math.abs(difference)+10),x=width*.93,y=distance>0?height*.8:height*.2;
  await surface.page('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  try{
   const steps=Math.max(4,Math.ceil(Math.abs(distance)/45));
   for(let step=1;step<=steps;step++){await surface.page('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-distance*step/steps}]});await new Promise(r=>setTimeout(r,intervalMs))}
   await new Promise(r=>setTimeout(r,100));
  }finally{await surface.page('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
  gestures++;await new Promise(r=>setTimeout(r,70));
  const after=await surface.evaluate('scrollY');stalled=Math.abs(after-before)<1?stalled+1:0;
  if(stalled>=3)throw Error('Trusted touch did not move the native document');
 }
 throw Error('Native touch did not reach '+Math.round(target)+'; actual '+Math.round(await surface.evaluate('scrollY')));
}
