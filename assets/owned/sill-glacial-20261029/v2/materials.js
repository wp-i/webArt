import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
export async function createMaterials(renderer,base){
 const loader=new THREE.TextureLoader();
 async function tex(id,kind,repeat){const t=await loader.loadAsync(base+id+'/'+id+'_1K-JPG_'+kind+'.jpg');t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeat,repeat);t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());if(kind==='Color')t.colorSpace=THREE.SRGBColorSpace;return t;}
 const [iceNormal,iceRough,snowColor,snowNormal,snowRough,snowDepth]=await Promise.all([tex('Ice004','NormalGL',.7),tex('Ice004','Roughness',.7),tex('Snow004','Color',9),tex('Snow004','NormalGL',9),tex('Snow004','Roughness',9),tex('Snow004','Displacement',9)]);
 const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(room,.06).texture;room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});pmrem.dispose();
 const ice=new THREE.MeshPhysicalMaterial({color:'#a5bfce',normalMap:iceNormal,normalScale:new THREE.Vector2(.32,.32),roughness:.82,metalness:0,transmission:.12,thickness:.6,ior:1.31,clearcoat:.025,clearcoatRoughness:.7,envMapIntensity:.52});
 const crystal=new THREE.MeshPhysicalMaterial({color:'#d9ecf4',normalMap:iceNormal,normalScale:new THREE.Vector2(.025,.025),roughness:.14,metalness:0,transmission:.95,thickness:.68,ior:1.31,attenuationColor:new THREE.Color('#a6ccd9'),attenuationDistance:6,envMapIntensity:.42});
 crystal.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nfloat frostEdge=pow(1.0-abs(dot(normalize(vNormal),normalize(vViewPosition))),2.8);roughnessFactor=mix(roughnessFactor,.8,frostEdge*.8);');};crystal.customProgramCacheKey=()=>'sill-clear-ice-frost-edge-v2';
 const snow=new THREE.MeshStandardMaterial({color:'#ced9e2',map:snowColor,normalMap:snowNormal,normalScale:new THREE.Vector2(.72,.72),roughnessMap:snowRough,roughness:1,displacementMap:snowDepth,displacementScale:.10,displacementBias:-.025});
 const ceramic=new THREE.MeshPhysicalMaterial({color:'#e1ceb4',roughness:.42,metalness:.04,clearcoat:.2,side:THREE.DoubleSide});
 const bronze=new THREE.MeshStandardMaterial({color:'#817a67',roughness:.28,metalness:.72,side:THREE.DoubleSide});
 const glow=new THREE.MeshBasicMaterial({color:'#dff5ff',transparent:true,opacity:.24,blending:THREE.AdditiveBlending,depthWrite:false});
 return {ice,crystal,snow,ceramic,bronze,glow,environment,dispose(){for(const t of [iceNormal,iceRough,snowColor,snowNormal,snowRough,snowDepth,environment])t.dispose();for(const m of [ice,crystal,snow,ceramic,bronze,glow])m.dispose();}};
}
