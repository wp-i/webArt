import * as THREE from 'three';

// Independently authored P–04 mechanical asset. No reference-site geometry.
// Each profile is a radial/axial section; dimensions stay editable here.
const TAU=Math.PI*2;
const profiles={
 bezel:[[1.77,-.16],[1.99,-.16],[2.035,-.13],[2.065,-.07],[2.065,.07],[2.045,.13],[2.005,.16],[1.81,.16],[1.77,.12],[1.77,-.16]],
 innerTrim:[[1.755,.11],[1.775,.11],[1.79,.13],[1.79,.155],[1.775,.17],[1.755,.155],[1.755,.11]],
 housing:[[1.30,-.20],[1.70,-.20],[1.78,-.16],[1.79,-.08],[1.76,-.03],[1.32,-.03],[1.28,-.08],[1.28,-.16],[1.30,-.20]],
 bearing:[[.43,-.12],[.86,-.12],[.91,-.08],[.91,.08],[.86,.12],[.43,.12],[.40,.08],[.40,-.08],[.43,-.12]],
 rotorHub:[[.32,-.29],[.63,-.29],[.68,-.24],[.68,.16],[.62,.22],[.32,.22],[.32,-.29]],
 shaft:[[0,-1.05],[.22,-1.05],[.28,-1.01],[.28,-.84],[.30,-.81],[.30,-.71],[.27,-.68],[.27,-.55],[.35,-.51],[.35,.03],[.30,.08],[.30,.24],[.24,.29],[0,.29]],
 backCollar:[[.35,-.12],[1.26,-.12],[1.32,-.06],[1.32,.06],[1.26,.12],[.35,.12],[.35,-.12]]
};
function lathe(profile,segments=192){
 const points=[];
 profile.forEach((p,i)=>{const value=new THREE.Vector2(...p);points.push(value);if(i>0&&i<profile.length-1){const before=new THREE.Vector2(p[0]-profile[i-1][0],p[1]-profile[i-1][1]).normalize(),after=new THREE.Vector2(profile[i+1][0]-p[0],profile[i+1][1]-p[1]).normalize();if(before.dot(after)<.80)points.push(value.clone())}});
 const g=new THREE.LatheGeometry(points,segments);g.rotateX(Math.PI/2);return g;
}
function add(parent,name,geometry,material,position=[0,0,0]){const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(...position);parent.add(mesh);return mesh}
function annularShape(outer,inner,arc=TAU,start=0){
 const shape=new THREE.Shape();shape.absarc(0,0,outer,start,start+arc,false);
 if(arc<TAU-.001){shape.lineTo(Math.cos(start+arc)*inner,Math.sin(start+arc)*inner);shape.absarc(0,0,inner,start+arc,start,true);shape.closePath()}
 else if(inner>0){const hole=new THREE.Path();hole.absarc(0,0,inner,0,TAU,true);shape.holes.push(hole)}
 return shape;
}
function extrude(shape,depth,bevel=.012){const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,steps:1,curveSegments:64});g.translate(0,0,-depth/2);return g}
function ring(outer,inner,depth){return extrude(annularShape(outer,inner),depth,.008)}
function hole(shape,x,y,r,n=40){const h=new THREE.Path();for(let i=0;i<=n;i++){const t=-i/n*TAU;i?h.lineTo(x+Math.cos(t)*r,y+Math.sin(t)*r):h.moveTo(x+Math.cos(t)*r,y+Math.sin(t)*r)}shape.holes.push(h)}
function gearShape(root,tip,teeth,bore=0){
 const s=new THREE.Shape();
 for(let i=0;i<teeth;i++)for(const [f,r] of [[0,root],[.16,root],[.30,tip],[.67,tip],[.82,root]]){const a=(i+f)/teeth*TAU;i||f?s.lineTo(Math.cos(a)*r,Math.sin(a)*r):s.moveTo(Math.cos(a)*r,Math.sin(a)*r)}
 s.closePath();if(bore)hole(s,0,0,bore,80);return s;
}
function instance(parent,name,geometry,material,poses){
 const mesh=new THREE.InstancedMesh(geometry,material,poses.length),pose=new THREE.Object3D();mesh.name=name;
 poses.forEach((p,i)=>{pose.position.set(...(p.position??[0,0,0]));pose.rotation.set(...(p.rotation??[0,0,0]));pose.scale.set(...(p.scale??[1,1,1]));pose.updateMatrix();mesh.setMatrixAt(i,pose.matrix)});parent.add(mesh);return mesh;
}
function polar(count,radius,z,rotationOffset=0){return Array.from({length:count},(_,i)=>{const a=i/count*TAU+rotationOffset;return{position:[Math.cos(a)*radius,Math.sin(a)*radius,z],rotation:[0,0,a]}})}
function arcTube(radius,z,start,length,tube=.012){const pts=Array.from({length:97},(_,i)=>new THREE.Vector3(Math.cos(start+length*i/96)*radius,Math.sin(start+length*i/96)*radius,z));return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),96,tube,6,false)}
function socketGeometry(){const s=annularShape(.085,0);const h=new THREE.Path();for(let i=0;i<=6;i++){const a=-i/6*TAU;i?h.lineTo(Math.cos(a)*.041,Math.sin(a)*.041):h.moveTo(Math.cos(a)*.041,Math.sin(a)*.041)}s.holes.push(h);return extrude(s,.055,.004)}
function grainTexture(){
 const c=document.createElement('canvas');c.width=128;c.height=256;const context=c.getContext('2d'),im=context.createImageData(c.width,c.height);let state=13421;
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){state=(Math.imul(state,1664525)+1013904223)>>>0;const v=186+Math.floor((state/4294967296-.5)*20)+Math.round(Math.sin(x*1.3)*5),i=(y*c.width+x)*4;im.data.set([v,v,v,255],i)}context.putImageData(im,0,0);
 const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(6,1);return tex;
}
export function createInstrument(){
 const root=new THREE.Group();root.name='P04-Precision-Instrument';root.userData.author='WebArt';root.userData.originalAsset=true;
 const grain=grainTexture(),materials={
  graphite:new THREE.MeshStandardMaterial({color:'#222725',metalness:.62,roughness:.48,roughnessMap:grain,envMapIntensity:.45}),
  steel:new THREE.MeshStandardMaterial({color:'#767e77',metalness:.88,roughness:.40,roughnessMap:grain,envMapIntensity:.65}),
  satin:new THREE.MeshStandardMaterial({color:'#484e49',metalness:.78,roughness:.50,envMapIntensity:.6}),
  dark:new THREE.MeshStandardMaterial({color:'#151a19',metalness:.65,roughness:.39,envMapIntensity:.65}),
  copper:new THREE.MeshStandardMaterial({color:'#ae6741',metalness:.94,roughness:.3,envMapIntensity:.8}),
  bearing:new THREE.MeshStandardMaterial({color:'#81877d',metalness:.96,roughness:.32,envMapIntensity:.55}),
  screen:new THREE.MeshBasicMaterial({color:'#1c201e',toneMapped:false})
 };
 const parts=[];
 function part(key,z,explode){const group=new THREE.Group();group.name=key;group.position.z=z;group.userData={part:key,baseZ:z,explode};root.add(group);parts.push(group);return group}
 const bezel=part('01-bezel-and-display',1.1,0);
 const coated=new THREE.MeshStandardMaterial({color:'#131b16',metalness:.35,roughness:.66,roughnessMap:grain,envMapIntensity:.055});
 add(bezel,'machined-bezel',lathe(profiles.bezel),coated);
 add(bezel,'narrow-inner-steel-bevel',lathe(profiles.innerTrim),materials.satin);
 add(bezel,'bezel-base-ring',ring(2.01,1.79,.025),materials.dark,[0,0,-.19]);
 const screen=add(bezel,'display-surface',new THREE.CircleGeometry(1.748,192),materials.screen,[0,0,.118]);screen.userData.displaySurface=true;
 const ticks=instance(bezel,'precision-ticks',new THREE.BoxGeometry(.009,.065,.012),new THREE.MeshBasicMaterial({color:'#6e786a',toneMapped:false}),polar(120,1.89,.19,Math.PI/2).map((p,i)=>({...p,rotation:[0,0,i/120*TAU],scale:[1,i%5===0?1.8:1,1]})));
 ticks.userData.ticks=true;
 instance(bezel,'outer-knurl',new THREE.BoxGeometry(.027,.048,.17),materials.graphite,polar(192,2.048,-.045).map(p=>({...p,rotation:[0,0,p.rotation[2]-Math.PI/2]})));
 const lights=new THREE.Group();lights.name='segmented-light-band';lights.userData.displaySurface=true;bezel.add(lights);
 const colors=['#ff655c','#ffb94b','#b5eb49','#28d6a1','#36bce9','#6585f0'];
 for(let i=0;i<6;i++){
  const start=Math.PI/2-i*TAU/6+.015,length=TAU/6-.035,mat=new THREE.MeshBasicMaterial({color:colors[i],toneMapped:false});
  const strip=add(lights,'light-'+i,arcTube(2.083,.13,start,length,.018),mat);strip.userData.light=true;
  add(lights,'light-soft-'+i,arcTube(2.083,.13,start,length,.043),new THREE.MeshBasicMaterial({color:colors[i],toneMapped:false,transparent:true,opacity:.16,depthWrite:false,blending:THREE.AdditiveBlending}));
  add(lights,'light-halo-'+i,arcTube(2.083,.13,start,length,.075),new THREE.MeshBasicMaterial({color:colors[i],toneMapped:false,transparent:true,opacity:.04,depthWrite:false,blending:THREE.AdditiveBlending}));
 }
 const glassGeometry=new THREE.SphereGeometry(1.755,128,32,0,TAU,0,Math.PI/2);glassGeometry.rotateX(Math.PI/2);glassGeometry.scale(1,1,.043);
 const glass=add(bezel,'shallow-optical-glass',glassGeometry,new THREE.MeshPhysicalMaterial({color:'#151b17',metalness:0,roughness:.1,transparent:true,opacity:.045,clearcoat:1,clearcoatRoughness:.07,ior:1.52,specularIntensity:.35,envMapIntensity:.30,depthWrite:false}),[0,0,.16]);glass.userData.displaySurface=true;

 const housing=part('02-vented-housing',.55,.45);
 add(housing,'stepped-housing-profile',lathe(profiles.housing),materials.graphite);
 add(housing,'front-shoulder',ring(1.84,1.30,.09),materials.satin,[0,0,-.04]);
 add(housing,'rear-shoulder',ring(1.78,1.28,.07),materials.steel,[0,0,-.74]);
 for(let i=0;i<12;i++){
  const a=i/12*TAU,shape=annularShape(1.78,1.49,.33,a);
  add(housing,'vent-wall-'+i,extrude(shape,.43,.025),i%3===0?materials.satin:materials.graphite,[0,0,-.36]);
 }
 for(const z of [-.14,-.58,-.66])add(housing,'turned-groove-'+z,ring(1.795,1.76,.018),materials.dark,[0,0,z]);
 instance(housing,'housing-fasteners',socketGeometry(),materials.dark,polar(8,1.57,.02,Math.PI/8));

 const stator=part('03-laminated-stator-and-copper-windings',-.42,.92);
 add(stator,'stator-toothed-lamination',extrude(gearShape(1.06,1.35,18,.64),.54,.012),materials.satin);
 add(stator,'stator-front-retainer',ring(1.49,1.27,.065),materials.dark,[0,0,.32]);
 add(stator,'stator-rear-retainer',ring(1.49,1.27,.065),materials.dark,[0,0,-.32]);
 class Winding extends THREE.Curve{constructor(angle){super();this.angle=angle}getPoint(t,target=new THREE.Vector3()){const a=t*TAU*8,cos=Math.cos(a),sin=Math.sin(a),radial=1.28+Math.sign(cos)*Math.sqrt(Math.abs(cos))*.155,z=Math.sign(sin)*Math.sqrt(Math.abs(sin))*.285,tangent=(t-.5)*.25;return target.set(Math.cos(this.angle)*radial-Math.sin(this.angle)*tangent,Math.sin(this.angle)*radial+Math.cos(this.angle)*tangent,z)}}
 for(let i=0;i<18;i++)add(stator,'winding-'+i,new THREE.TubeGeometry(new Winding(i/18*TAU),256,.014,5,false),materials.copper);
 instance(stator,'retainer-bolts',socketGeometry(),materials.steel,polar(6,1.38,.37));

 const rotor=part('04-fluted-rotor',-1.10,1.38);
 const rotorShape=annularShape(1.18,.34);for(let i=0;i<6;i++){const a=i/6*TAU;hole(rotorShape,Math.cos(a)*.82,Math.sin(a)*.82,.17)}
 add(rotor,'rotor-web-with-lightening-bores',extrude(rotorShape,.26,.02),materials.steel);
 add(rotor,'stepped-shaft-bearing',lathe(profiles.rotorHub),materials.bearing);
 for(let i=0;i<12;i++)add(rotor,'rotor-magnet-'+i,extrude(annularShape(1.20,1.07,.43,i/12*TAU),.42,.008),i%2?materials.dark:materials.graphite,[0,0,-.22]);
 add(rotor,'rotor-bearing-seal',ring(.62,.35,.018),materials.dark,[0,0,.25]);

 const train=part('05-planetary-gear-carrier',-1.72,1.86);
 const ringGear=annularShape(1.46,0),inner=new THREE.Path();for(let i=0;i<=360;i++){const a=-i/360*TAU,r=i%5<2?1.155:1.095;i?inner.lineTo(Math.cos(a)*r,Math.sin(a)*r):inner.moveTo(Math.cos(a)*r,Math.sin(a)*r)}ringGear.holes.push(inner);
 add(train,'internal-ring-gear',extrude(ringGear,.22,.008),materials.graphite);
 add(train,'sun-gear',extrude(gearShape(.39,.45,24,.29),.25,.008),materials.bearing,[0,0,.03]);
 const planet=extrude(gearShape(.285,.345,18,.091),.23,.007);
 instance(train,'six-planet-gears',planet,materials.steel,polar(6,.78,.025,Math.PI/6));
 const carrier=annularShape(1.34,.36);for(let i=0;i<6;i++){const a=i/6*TAU;hole(carrier,Math.cos(a)*.82,Math.sin(a)*.82,.235)}
 add(train,'drilled-carrier-plate',extrude(carrier,.085,.012),materials.satin,[0,0,-.20]);
 instance(train,'planet-axle-heads',socketGeometry(),materials.dark,polar(6,.78,.18,Math.PI/6));

 const shaft=part('06-splined-drive-shaft',-2.12,2.28);
 add(shaft,'stepped-drive-shaft',lathe(profiles.shaft,96),materials.steel);
 add(shaft,'sixteen-drive-splines',extrude(gearShape(.32,.38,16),.56,.006),materials.bearing,[0,0,-.20]);
 add(shaft,'bearing-race',lathe(profiles.bearing),materials.bearing,[0,0,.02]);
 add(shaft,'bearing-dust-seal',ring(.82,.46,.022),materials.dark,[0,0,.15]);
 instance(shaft,'bearing-balls',new THREE.SphereGeometry(.092,12,8),materials.bearing,polar(12,.665,.158));
 add(shaft,'bearing-retainer',ring(.77,.56,.018),materials.copper,[0,0,.175]);

 const mount=part('07-counterbored-mounting-flange',-2.78,2.8);
 const mounting=annularShape(1.49,.33);for(let i=0;i<6;i++){const a=i/6*TAU;hole(mounting,Math.cos(a)*1.18,Math.sin(a)*1.18,.115)}
 add(mount,'mount-flange',extrude(mounting,.16,.025),materials.satin);
 add(mount,'mount-collar',lathe(profiles.backCollar),materials.graphite,[0,0,-.20]);
 instance(mount,'mount-washers',ring(.14,.09,.016),materials.steel,polar(6,1.18,.10));
 instance(mount,'mount-socket-bolts',socketGeometry(),materials.dark,polar(6,1.18,.13));
 for(let i=0;i<6;i++){const a=i/6*TAU;add(mount,'bayonet-lug-'+i,extrude(annularShape(1.53,1.27,.31,a),.10,.012),materials.graphite,[0,0,-.26])}
 return {root,parts,screen,lights,materials,profiles};
}

export function makeLinework(root){
 const lines=new THREE.Group();lines.name='precision-linework';
 root.updateMatrixWorld(true);
 const rootInverse=new THREE.Matrix4().copy(root.matrixWorld).invert();
 root.traverse(mesh=>{
  if(!mesh.isMesh||mesh.userData.displaySurface||mesh.parent?.userData.displaySurface||mesh.name.startsWith('light-')||mesh.name==='display-surface'||mesh.name==='shallow-optical-glass')return;
  const edges=new THREE.EdgesGeometry(mesh.geometry,28),source=edges.getAttribute('position'),positions=[];
  const count=mesh.isInstancedMesh?mesh.count:1,instanceMatrix=new THREE.Matrix4(),world=new THREE.Matrix4(),v=new THREE.Vector3();
  for(let i=0;i<count;i++){
   world.multiplyMatrices(rootInverse,mesh.matrixWorld);if(mesh.isInstancedMesh){mesh.getMatrixAt(i,instanceMatrix);world.multiply(instanceMatrix)}
   for(let n=0;n<source.count;n++){v.fromBufferAttribute(source,n).applyMatrix4(world);positions.push(v.x,v.y,v.z)}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#656761',transparent:true,opacity:.72}));line.name=mesh.name;lines.add(line);edges.dispose();
 });lines.position.copy(root.position);lines.quaternion.copy(root.quaternion);lines.scale.copy(root.scale);return lines;
}
