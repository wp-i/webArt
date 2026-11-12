import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
// A reusable authored studio rig; no HDR download or reference-site texture.
export function createStudioEnvironment(renderer){
 const studio=new RoomEnvironment();
 const pmrem=new THREE.PMREMGenerator(renderer),texture=pmrem.fromScene(studio,.025).texture;
 studio.traverse(e=>{e.geometry?.dispose();e.material?.dispose()});pmrem.dispose();return texture;
}
