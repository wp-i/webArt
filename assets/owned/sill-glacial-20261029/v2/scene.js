import * as THREE from 'three';
import {terrain,vaultPanel,iceBoulder,arcSegment,studyGeometries,sampleVolume} from './geometry.js';
import {createMaterials} from './materials.js';
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n)),smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
export async function mountGlacial(canvas,{assetBase,onReady=()=>{},onFail=()=>{}}={}){
 let renderer;
 try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'default'});}catch(e){onFail(e);return {setProgress(){},setPointer(){},selectShape(){},dispose(){}};}
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor('#b9c6d0');renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.82;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.transmissionResolutionScale=.4;
 const material=await createMaterials(renderer,assetBase),scene=new THREE.Scene();scene.background=new THREE.Color('#b9c6d0');scene.fog=new THREE.Fog('#b9c6d0',18,47);scene.environment=material.environment;
 const camera=new THREE.PerspectiveCamera(38,1,.1,110);scene.add(new THREE.HemisphereLight('#e7f2ff','#62778a',1.2));
 const key=new THREE.DirectionalLight('#fffaf1',3.5);key.position.set(-9,13,9);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:.5,far:42});key.shadow.bias=-.00025;key.shadow.normalBias=.04;scene.add(key,key.target);
 const worlds=[new THREE.Group(),new THREE.Group(),new THREE.Group(),new THREE.Group(),new THREE.Group()];worlds.forEach(g=>scene.add(g));worlds[1].position.z=-18;worlds[2].position.z=-31;worlds[3].position.z=-48;worlds[4].position.z=-72;
 const ground=new THREE.Mesh(terrain(),material.snow);ground.receiveShadow=true;worlds[0].add(ground);
 const panels=[];for(let row=0;row<7;row++)for(let segment=0;segment<3;segment++){const angle=(segment-1)*Math.PI/3,z=(row-3)*.7,mesh=new THREE.Mesh(vaultPanel(angle,z,row*3+segment),material.ice);mesh.castShadow=mesh.receiveShadow=true;mesh.userData={angle,row,index:panels.length};panels.push(mesh);worlds[0].add(mesh);}
 const interior=new THREE.PointLight('#d4f3ff',10,7,2);interior.position.set(0,.85,.4);worlds[0].add(interior);
 const studies=studyGeometries(),studyMeshes=[];
 for(let i=0;i<2;i++){const sculpture=new THREE.Mesh(studies[i],i?material.bronze:material.ceramic);sculpture.rotation.set(i?.7:.1,i?-.4:-.25,i?.18:.28);sculpture.scale.setScalar(.79);sculpture.position.y=1.35;worlds[i+1].add(sculpture);studyMeshes.push(sculpture);const shell=new THREE.Mesh(iceBoulder(i*9+3),material.crystal);shell.position.y=1.35;shell.rotation.set(.08,i?-.35:.22,i?-.14:.12);shell.castShadow=false;worlds[i+1].add(shell);}
 for(let ring=0;ring<3;ring++){const holder=new THREE.Group(),radius=3-ring*.57;holder.position.z=-ring*4.5;holder.rotation.set(.08+ring*.1,-.18+ring*.12,ring*.47);worlds[3].add(holder);
  for(let part=0;part<6;part++){const start=part*Math.PI/3+.035,end=(part+1)*Math.PI/3-.035,mesh=new THREE.Mesh(arcSegment(radius,start,end,ring*13+part),material.ice);mesh.receiveShadow=true;holder.add(mesh);}
  for(let halo=0;halo<3;halo++){const g=new THREE.TorusGeometry(radius-.14+halo*.035,.025+halo*.035,6,112),m=material.glow.clone();m.opacity=.22/(halo+1);const mesh=new THREE.Mesh(g,m);mesh.position.z=.245;holder.add(mesh);}
 }
 const stage=worlds[4];for(let tier=0;tier<3;tier++){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(2.9+tier*.88,3+tier*.88,.13,96),material.ice);mesh.position.y=-1.35-tier*.15;mesh.receiveShadow=true;stage.add(mesh);}
 const halo=new THREE.Mesh(new THREE.TorusGeometry(2.5,.035,8,112),new THREE.MeshBasicMaterial({color:'#e6faff'}));halo.rotation.x=Math.PI/2;halo.position.y=3.15;stage.add(halo);
 const targets=studies.map((g,i)=>sampleVolume(g,48000,77+i*5)),pointsGeometry=new THREE.BufferGeometry();
 pointsGeometry.setAttribute('position',new THREE.BufferAttribute(targets[0].positions.slice(),3));pointsGeometry.setAttribute('normal',new THREE.BufferAttribute(targets[0].normals.slice(),3));pointsGeometry.setAttribute('targetPosition',new THREE.BufferAttribute(targets[0].positions.slice(),3));pointsGeometry.setAttribute('targetNormal',new THREE.BufferAttribute(targets[0].normals.slice(),3));
 const uniforms={morph:{value:1},height:{value:900}};
 const pointMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:['attribute vec3 targetPosition;','attribute vec3 targetNormal;','uniform float morph;','uniform float height;','varying float illumination;','void main(){','vec3 p=mix(position,targetPosition,morph);','vec3 n=normalize(mix(normal,targetNormal,morph));','illumination=.28+.72*max(0.,dot(n,normalize(vec3(-.6,.8,.7))));','vec4 mv=modelViewMatrix*vec4(p,1.);','gl_Position=projectionMatrix*mv;','gl_PointSize=clamp(height*.044/(-mv.z),1.3,12.);','}'].join('\n'),fragmentShader:['varying float illumination;','void main(){','vec2 p=gl_PointCoord*2.-1.;','float d=dot(p,p);if(d>1.)discard;','float sphere=sqrt(1.-d);','vec3 pn=vec3(p.x,-p.y,sphere);','float ball=.32+.68*max(0.,dot(pn,normalize(vec3(-.5,.7,1.))));','float l=(.34+.66*illumination)*ball;','gl_FragDepth=gl_FragCoord.z-.00015*sphere;','gl_FragColor=vec4(vec3(.53,.68,.80)*l,1.);','#include <tonemapping_fragment>','#include <colorspace_fragment>','}'].join('\n')});
 const particles=new THREE.Points(pointsGeometry,pointMaterial);particles.rotation.set(.1,-.25,.28);particles.position.y=.7;stage.add(particles);
 const q=new THREE.Raycaster(),pointer=new THREE.Vector2(4,4),pref=matchMedia('(prefers-reduced-motion: reduce)');
 let reduced=pref.matches,progress=0,targetProgress=0,selected=0,morph=1,width=0,height=0,scheduled=0,lastDraw=-Infinity,lastNow=0,disposed=false,dirty=true,hover=-1;
 const lifts=panels.map(()=>0);
 const poses=[{p:[6.7,3.7,9.2],t:[0,1.0,0]},{p:[0,1.5,-9.4],t:[0,1.3,-18]},{p:[.2,1.6,-22.7],t:[0,1.2,-31]},{p:[0,.1,-37.5],t:[0,0,-49]},{p:[0,10,-65],t:[0,0,-72]},{p:[3.7,2.2,-62.5],t:[0,.7,-72]}],knots=[0,1,1.5,2,2.6,3];
 function pose(){let k=0;while(k<knots.length-2&&progress>knots[k+1])k++;const t=smooth((progress-knots[k])/(knots[k+1]-knots[k]));const at=new THREE.Vector3().fromArray(poses[k].p).lerp(new THREE.Vector3().fromArray(poses[k+1].p),t),look=new THREE.Vector3().fromArray(poses[k].t).lerp(new THREE.Vector3().fromArray(poses[k+1].t),t);camera.position.copy(at);camera.lookAt(look);
  const mobile=width<700;if(mobile){camera.fov=48;camera.position.add(new THREE.Vector3().subVectors(camera.position,look).multiplyScalar(progress<.5?.72:.62));}else camera.fov=38;camera.updateProjectionMatrix();camera.updateMatrixWorld();
  const visible=[progress<.72,progress>.55&&progress<1.48,progress>1.2&&progress<1.92,progress>1.7&&progress<2.8,progress>2.36];worlds.forEach((g,i)=>g.visible=visible[i]);const lightZ=progress<.5?0:look.z;key.position.set(-9,13,lightZ+9);key.target.position.set(0,0,lightZ);key.target.updateMatrixWorld();window.__webartProgress=progress;
 }
 function wake(){dirty=true;if(!disposed&&!document.hidden&&!scheduled)scheduled=requestAnimationFrame(tick);}
 function tick(now){scheduled=0;if(disposed||document.hidden)return;if(now-lastDraw<33.1){scheduled=requestAnimationFrame(tick);return;}const dt=Math.min(.07,(now-lastNow)/1000||.033);lastNow=now;const old=progress;progress=reduced?targetProgress:Math.abs(targetProgress-progress)<.00015?targetProgress:THREE.MathUtils.lerp(progress,targetProgress,Math.min(1,dt*9));pose();
  if(progress<.55){q.setFromCamera(pointer,camera);const hit=q.intersectObjects(panels,false)[0];hover=hit?hit.object.userData.index:-1;}else hover=-1;
  let moving=old!==progress;
  panels.forEach((panel,i)=>{const desired=hover<0?0:Math.max(0,1-Math.abs(i-hover)/3)*.36;const next=reduced?desired:Math.abs(desired-lifts[i])<.0003?desired:THREE.MathUtils.lerp(lifts[i],desired,Math.min(1,dt*8));moving||=next!==lifts[i];lifts[i]=next;panel.position.set(Math.sin(panel.userData.angle)*next,next*.8,0);});
  if(morph<1){morph=reduced?1:Math.min(1,morph+dt/1.05);uniforms.morph.value=smooth(morph);moving||=morph<1;}
  renderer.render(scene,camera);lastDraw=now;dirty=false;window.__webartRendering='ready';window.__webartReady=true;if(moving)wake();
 }
 function resize(){const r=canvas.getBoundingClientRect();if(r.width===width&&r.height===height)return;width=r.width;height=r.height;renderer.setSize(width,height,false);camera.aspect=width/height;uniforms.height.value=height*renderer.getPixelRatio();wake();}
 const observer=new ResizeObserver(resize);observer.observe(canvas);
 const preference=()=>{reduced=pref.matches;wake();};pref.addEventListener('change',preference);
 const visibility=()=>{if(document.hidden){if(scheduled)cancelAnimationFrame(scheduled);scheduled=0;}else if(dirty)wake();};document.addEventListener('visibilitychange',visibility);
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();onFail(new Error('context-lost'));},{once:true});
 resize();wake();onReady();
 return {setProgress(value){targetProgress=clamp(value,0,3);wake();},setPointer(x,y,active=true){pointer.set(active?x:4,active?y:4);wake();},selectShape(index){index=clamp(Math.round(index),0,2);if(index===selected)return;const position=pointsGeometry.attributes.position,normal=pointsGeometry.attributes.normal,target=pointsGeometry.attributes.targetPosition,targetNormal=pointsGeometry.attributes.targetNormal,t=smooth(morph);for(let i=0;i<position.array.length;i++){position.array[i]=THREE.MathUtils.lerp(position.array[i],target.array[i],t);normal.array[i]=THREE.MathUtils.lerp(normal.array[i],targetNormal.array[i],t);}position.needsUpdate=normal.needsUpdate=true;target.array.set(targets[index].positions);targetNormal.array.set(targets[index].normals);target.needsUpdate=targetNormal.needsUpdate=true;selected=index;morph=0;uniforms.morph.value=0;wake();},dispose(){disposed=true;if(scheduled)cancelAnimationFrame(scheduled);observer.disconnect();pref.removeEventListener('change',preference);document.removeEventListener('visibilitychange',visibility);scene.traverse(o=>{o.geometry?.dispose();});pointMaterial.dispose();material.dispose();renderer.dispose();}};
}
