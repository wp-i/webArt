import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
export async function createMaterials(renderer,base){
 const loader=new THREE.TextureLoader();
 async function tex(id,kind,repeat){const t=await loader.loadAsync(base+id+'/'+id+'_1K-JPG_'+kind+'.jpg');t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeat,repeat);t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());if(kind==='Color')t.colorSpace=THREE.SRGBColorSpace;return t;}
 const [iceColor,iceNormal,iceRough,snowColor,snowNormal,snowRough]=await Promise.all([tex('Ice004','Color',1.1),tex('Ice004','NormalGL',1.1),tex('Ice004','Roughness',1.1),tex('Snow004','Color',9),tex('Snow004','NormalGL',9),tex('Snow004','Roughness',9)]);
 const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(room,.06).texture;room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});pmrem.dispose();
 const ice=new THREE.MeshPhysicalMaterial({color:'#c4deeb',map:iceColor,normalMap:iceNormal,normalScale:new THREE.Vector2(.19,.19),roughnessMap:iceRough,roughness:.68,metalness:.03,transmission:.18,thickness:.6,ior:1.31,clearcoat:.18,clearcoatRoughness:.38,envMapIntensity:.72});
 const crystal=new THREE.MeshPhysicalMaterial({color:'#d9ecf4',map:iceColor,normalMap:iceNormal,normalScale:new THREE.Vector2(.10,.10),roughnessMap:iceRough,roughness:.26,metalness:0,transmission:.83,thickness:1.25,ior:1.31,attenuationColor:new THREE.Color('#8aafbf'),attenuationDistance:4,envMapIntensity:.75});
 const snow=new THREE.MeshStandardMaterial({color:'#e0e7ec',map:snowColor,normalMap:snowNormal,normalScale:new THREE.Vector2(.35,.35),roughnessMap:snowRough,roughness:1});
 const ceramic=new THREE.MeshPhysicalMaterial({color:'#e1ceb4',roughness:.42,metalness:.04,clearcoat:.2,side:THREE.DoubleSide});
 const bronze=new THREE.MeshStandardMaterial({color:'#817a67',roughness:.28,metalness:.72,side:THREE.DoubleSide});
 const glow=new THREE.MeshBasicMaterial({color:'#dff5ff',transparent:true,opacity:.24,blending:THREE.AdditiveBlending,depthWrite:false});
 return {ice,crystal,snow,ceramic,bronze,glow,environment,dispose(){for(const t of [iceColor,iceNormal,iceRough,snowColor,snowNormal,snowRough,environment])t.dispose();for(const m of [ice,crystal,snow,ceramic,bronze,glow])m.dispose();}};
}
