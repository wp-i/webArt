import * as THREE from 'three';
import {createInstrument,makeLinework} from './model.js';
import {createStudioEnvironment} from './studio.js';

// Authored scene and input model. Layout code only calls this module's interface.
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
const mix=(a,b,t)=>a+(b-a)*t;
export function mountInstrument(canvas,{puckViewport,puck,fallback,onReady=()=>{}}={}){
 let renderer;
 const fail=()=>{canvas.hidden=true;fallback.hidden=false;if(puckViewport)puckViewport.style.visibility='hidden';window.__webartRendering='fallback';window.__webartReady=true};
 try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'default'})}catch{fail();return {setProgress(){},setPointer(){},release(){},dispose(){}}}
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.setClearColor('#242523',0);
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-5,5,3,-3,.1,70);camera.position.set(0,0,16);scene.environment=createStudioEnvironment(renderer);
 const key=new THREE.DirectionalLight('#fff1db',1.15);key.position.set(-4,6,7);scene.add(key);const fill=new THREE.DirectionalLight('#c4d4d6',.45);fill.position.set(5,-1,3);scene.add(fill);
 const pivot=new THREE.Group(),instrument=createInstrument();scene.add(pivot);pivot.add(instrument.root);
 const originals=new Map();instrument.root.traverse(e=>{if(e.isMesh){if(e.material.isMeshStandardMaterial)e.material.envMap=scene.environment;originals.set(e,e.material)}});
 const lineGroup=new THREE.Group();pivot.add(lineGroup);
 const lineParts=instrument.parts.map(part=>{const lines=makeLinework(part);lines.traverse(e=>{if(e.isLineSegments){e.renderOrder=3;e.material.depthWrite=false}});lineGroup.add(lines);return lines});
 const shaded=new Set();instrument.root.traverse(e=>{if(e.isMesh&&!e.userData.displaySurface&&!e.parent?.userData.displaySurface)shaded.add(e.material)});
 const paperMix={value:0},paperColor={value:new THREE.Color('#ddd9d2')};
 // Blend the existing surface into the paper color in the same fragment pass.
 // This replaces the old full duplicate solid model without reducing geometry.
 shaded.forEach(material=>{material.polygonOffset=true;material.polygonOffsetFactor=1;material.polygonOffsetUnits=1;material.onBeforeCompile=shader=>{shader.uniforms.p04PaperMix=paperMix;shader.uniforms.p04PaperColor=paperColor;shader.fragmentShader='uniform float p04PaperMix;\nuniform vec3 p04PaperColor;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>','gl_FragColor.rgb = mix(gl_FragColor.rgb, p04PaperColor, p04PaperMix);\n#include <tonemapping_fragment>')};material.customProgramCacheKey=()=>'p04-paper-mix-v1'});
 const materialStates=[...new Set(originals.values())].map(material=>({material,opacity:material.opacity}));
 const display=document.createElement('canvas');display.width=display.height=512;const ctx=display.getContext('2d'),texture=new THREE.CanvasTexture(display);ctx.scale(.5,.5);texture.colorSpace=THREE.SRGBColorSpace;instrument.screen.material.map=texture;instrument.screen.material.color.set('#ffffff');
 const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
 let progress=0,targetProgress=0,look={x:0,y:0},mouse={x:0,y:0},wireOpacity=0,width=0,height=0,reduced=motionPreference.matches,stopped=false,frame=0,last=0,scheduled=0,poseDirty=true,lastRender=-Infinity,lastDisplay=-Infinity,displayMode=-1,ready=false;
 const updatePreference=()=>{reduced=motionPreference.matches;poseDirty=true;displayMode=-1;wake()};motionPreference.addEventListener('change',updatePreference);
 const spring={x:0,y:0,vx:0,vy:0,drag:false,lastX:0,lastY:0,lastT:0,radius:1};
 function drawDisplay(time,mode){
  ctx.fillStyle='#1c201e';ctx.fillRect(0,0,1024,1024);
  if(mode<.5){
   const phase=reduced?0:time*.28;
   for(let row=-54;row<=54;row++){const y=row/54,width=Math.sqrt(Math.max(0,1-y*y))*(.48+.38*Math.cos(y*7+phase));ctx.strokeStyle=`rgba(231,105,87,${.26+.65*(1-Math.abs(y))})`;ctx.lineWidth=3.3;ctx.beginPath();ctx.moveTo(512-width*446,512+y*452);ctx.lineTo(512+width*446,512+y*452);ctx.stroke()}
   ctx.fillStyle='#e96d5c';for(let i=0;i<32;i++){const x=100+i*25,y=512+Math.sin(i*.15+phase)*130;if((x-512)**2+(y-512)**2>425**2)continue;ctx.beginPath();ctx.arc(x,y,3+i/32*3,0,Math.PI*2);ctx.fill()}
  }else if(mode<1.5){
   const phase=reduced?0:time*2.0;
   for(let y=-7;y<=7;y++)for(let x=-7;x<=7;x++){const radius=Math.hypot(x,y);if(radius>7.1)continue;const wave=.5+.5*Math.sin(radius*.88-phase),r=2.3+10.5*wave**4;ctx.fillStyle=`rgba(94,156,238,${.22+.75*wave})`;ctx.beginPath();ctx.arc(512+x*58,512+y*58,r,0,Math.PI*2);ctx.fill()}
  }
  const sheen=ctx.createLinearGradient(150,100,870,950);sheen.addColorStop(0,'rgba(245,243,225,.055)');sheen.addColorStop(.3,'rgba(245,243,225,0)');sheen.addColorStop(.8,'rgba(245,243,225,0)');sheen.addColorStop(1,'rgba(245,243,225,.035)');ctx.fillStyle=sheen;ctx.fillRect(0,0,1024,1024);texture.needsUpdate=true;
 }
 function resize(){const r=canvas.getBoundingClientRect();if(width===r.width&&height===r.height)return;width=r.width;height=r.height;renderer.setSize(width,height,false);const hh=width<1100?2.12*.95/(width/height*(width<700?.9:.82)):3.0;camera.left=-hh*width/height;camera.right=hh*width/height;camera.top=hh;camera.bottom=-hh;camera.updateProjectionMatrix();poseDirty=true;wake()}
 function project(vector){const v=vector.clone().applyMatrix4(instrument.parts[0].matrixWorld).project(camera);return {x:(v.x*.5+.5)*width,y:(-.5*v.y+.5)*height}}
 function layoutObject(){
  if(!puckViewport||!puck)return;const center=project(new THREE.Vector3(0,0,.25)),edge=project(new THREE.Vector3(1.70,0,.25)),radius=Math.abs(edge.x-center.x),active=progress>2.65;
  spring.radius=radius;puckViewport.style.cssText=`position:absolute;left:${center.x-radius}px;top:${center.y-radius}px;width:${radius*2}px;height:${radius*2}px;border-radius:50%;overflow:hidden;pointer-events:none;visibility:${active?'visible':'hidden'};opacity:${smooth((progress-2.65)/.22)}`;
  puck.style.transform=`translate(calc(-50% + ${spring.x*radius}px),calc(-50% + ${spring.y*radius}px))`;puck.style.width=puck.style.height=radius*1.18+'px';
 }
 function updatePose(){
  const enter=smooth(progress/.8),leave=smooth((progress-1.15)/.7),mechanism=enter*(1-leave),wire=smooth((progress-.48)/.36)*(1-smooth((progress-1.25)/.42));wireOpacity=.72*wire;
  instrument.parts.forEach(p=>p.position.z=p.userData.baseZ-p.userData.explode*mechanism*.72);instrument.root.position.z=mechanism*2.1;
  // Internal layers are fully occluded behind the assembled face. Restore them
  // before any separation begins; preserve all detail during the mechanism view.
  instrument.parts.forEach((part,i)=>part.visible=i===0||mechanism>.001);
  pivot.rotation.set(mix(0,width<1100?-1.0:-.8,mechanism)+look.y*.035*(1-mechanism),mix(0,width<1100?.35:.75,mechanism)+look.x*.045*(1-mechanism),-.16*mechanism);
  pivot.scale.setScalar(mix(width<1100?.95:1.08,width<1100?.78:.98,mechanism));pivot.position.set(width<1100?0:.58*(1-mechanism),width<700?-.28*(1-mechanism):width<1100?-.72*(1-mechanism):-.10,0);
  paperMix.value=wire;materialStates.forEach(({material,opacity})=>{material.opacity=shaded.has(material)?opacity:opacity*(1-wire)});
  instrument.root.traverse(e=>{if(e.userData.displaySurface)e.visible=wire<.98});lineGroup.visible=wire>.001;lineGroup.position.copy(instrument.root.position);
  instrument.parts.forEach((part,i)=>lineParts[i].position.copy(part.position));
  lineGroup.traverse(e=>{if(e.isLineSegments)e.material.opacity=wireOpacity});
  instrument.root.updateMatrixWorld(true);pivot.updateMatrixWorld(true);
  if(mechanism>.001){const box=new THREE.Box3().setFromObject(instrument.root),size=box.getSize(new THREE.Vector3()),fit=Math.min(1,(camera.right-camera.left)*.88/size.x,(camera.top-camera.bottom)*(width>=700&&width<1100?.60:.80)/size.y);pivot.scale.multiplyScalar(mix(1,fit,mechanism));pivot.updateMatrixWorld(true);const center=new THREE.Box3().setFromObject(instrument.root).getCenter(new THREE.Vector3());pivot.position.x-=center.x*mechanism;pivot.position.y-=center.y*mechanism;if(width>=700&&width<1100)pivot.position.y-=.55*mechanism;pivot.updateMatrixWorld(true)}
  layoutObject();window.__webartProgress=progress;window.__webartRendering='ready';
 }
 function wake(){if(!stopped&&!document.hidden&&!scheduled)scheduled=requestAnimationFrame(tick)}
 function approach(value,target,amount){return Math.abs(target-value)<.0001?target:mix(value,target,amount)}
 function tick(now){
  scheduled=0;if(stopped||document.hidden)return;
  const dt=Math.min(.033,(now-last)/1000||.016);last=now;
  const nextProgress=reduced?targetProgress:approach(progress,targetProgress,1-Math.exp(-dt*13)),nextX=reduced?0:approach(look.x,mouse.x,1-Math.exp(-dt*16)),nextY=reduced?0:approach(look.y,mouse.y,1-Math.exp(-dt*16));
  poseDirty ||= nextProgress!==progress||nextX!==look.x||nextY!==look.y;
  progress=nextProgress;look.x=nextX;look.y=nextY;
  const movingSpring=!spring.drag&&Math.max(Math.abs(spring.x),Math.abs(spring.y),Math.abs(spring.vx),Math.abs(spring.vy))>.001;
  if(!spring.drag){if(reduced||!movingSpring){spring.x=spring.y=spring.vx=spring.vy=0}else{spring.vx+=(-spring.x*95-spring.vx*12)*dt;spring.vy+=(-spring.y*95-spring.vy*12)*dt;spring.x+=spring.vx*dt;spring.y+=spring.vy*dt}}
  const mode=progress>2.65?2:progress>1.65?1:0;
  const animateDisplay=!reduced&&mode<2&&wireOpacity<.999*.72;
  // The 2D spring stays at native input cadence. It never needs a WebGL redraw.
  if(progress>2.65&&puck)puck.style.transform=`translate(calc(-50% + ${spring.x*spring.radius}px),calc(-50% + ${spring.y*spring.radius}px))`;
  if(now-lastRender>=1000/30-.5){
   const changedPose=poseDirty;
   if(changedPose){updatePose();poseDirty=false}
   const changedDisplay=mode!==displayMode||(animateDisplay&&now-lastDisplay>=1000/30-.5);
   if(changedDisplay){drawDisplay(now/1000,mode);displayMode=mode;lastDisplay=now}
   if(changedPose||changedDisplay||!ready){renderer.render(scene,camera);frame++;lastRender=now;window.__webartFrames=frame;if(!ready){ready=true;window.__webartReady=true;fallback.hidden=true;onReady()}}
  }
  if(poseDirty||progress!==targetProgress||(!reduced&&(look.x!==mouse.x||look.y!==mouse.y))||animateDisplay||movingSpring)wake();
 }
 const dragStart=e=>{if(progress<2.65)return;spring.drag=true;spring.lastX=e.clientX;spring.lastY=e.clientY;spring.lastT=performance.now();puck.setPointerCapture(e.pointerId);puck.dataset.dragging='true';e.preventDefault();wake()};
 const dragMove=e=>{if(!spring.drag)return;const now=performance.now(),dt=Math.max(.008,(now-spring.lastT)/1000),dx=(e.clientX-spring.lastX)/spring.radius,dy=(e.clientY-spring.lastY)/spring.radius;spring.x=clamp(spring.x+dx,-.7,.7);spring.y=clamp(spring.y+dy,-.7,.7);spring.vx=dx/dt;spring.vy=dy/dt;spring.lastX=e.clientX;spring.lastY=e.clientY;spring.lastT=now;wake()};
 const release=()=>{spring.drag=false;if(puck)puck.dataset.dragging='false';wake()};
 puck?.addEventListener('pointerdown',dragStart);puck?.addEventListener('pointermove',dragMove);puck?.addEventListener('pointerup',release);puck?.addEventListener('pointercancel',release);
 puck?.addEventListener('keydown',e=>{const moves={ArrowLeft:[-.28,0],ArrowRight:[.28,0],ArrowUp:[0,-.28],ArrowDown:[0,.28]};if(moves[e.key]){e.preventDefault();spring.x+=moves[e.key][0];spring.y+=moves[e.key][1];spring.x=clamp(spring.x,-.7,.7);spring.y=clamp(spring.y,-.7,.7);spring.vx=spring.vy=0;spring.drag=true;wake()}else if(['Enter',' ','Escape'].includes(e.key)){e.preventDefault();if(e.key!=='Escape'){spring.x=.4;spring.vx=0}release()}});
 const visibility=()=>{if(document.hidden){cancelAnimationFrame(scheduled);scheduled=0}else{last=0;wake()}};
 document.addEventListener('visibilitychange',visibility);
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();stopped=true;cancelAnimationFrame(scheduled);fail()});const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);resize();wake();
 return {setProgress(value){const next=clamp(value,0,3);if(next!==targetProgress){targetProgress=next;wake()}},setPointer(x,y){if(reduced||progress>2.65)return;const nextX=clamp(x,-1,1),nextY=clamp(y,-1,1);if(mouse.x!==nextX||mouse.y!==nextY){mouse.x=nextX;mouse.y=nextY;wake()}},release(){spring.x=.43;spring.vx=0;release()},inspect(){return {progress,frame,reduced,scheduled:Boolean(scheduled),spring:{...spring},triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,textureSize:display.width,pixelRatio:renderer.getPixelRatio(),parts:instrument.parts.map(p=>p.name)}},dispose(){stopped=true;cancelAnimationFrame(scheduled);motionPreference.removeEventListener('change',updatePreference);document.removeEventListener('visibilitychange',visibility);resizeObserver.disconnect();renderer.dispose();scene.environment.dispose()}};
}
