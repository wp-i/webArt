import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

// Independently authored curved components. No reference geometry or sampling data.
export function seeded(seed=71){return ()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}
function valueNoise(x,z){const a=Math.floor(x),b=Math.floor(z),u=x-a,v=z-b,s=u*u*(3-2*u),t=v*v*(3-2*v),h=(i,j)=>{const n=Math.sin(i*127.1+j*311.7)*43758.5453123;return n-Math.floor(n);};return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h(a,b),h(a+1,b),s),THREE.MathUtils.lerp(h(a,b+1),h(a+1,b+1),s),t);}
export function relief(x,z){let n=0,a=.48,f=.19;for(let i=0;i<5;i++){n+=(valueNoise(x*f,z*f)-.5)*a;a*=.48;f*=2.13;}return n;}
export function terrain(){
 const g=new THREE.PlaneGeometry(68,54,144,112),a=g.attributes.position;
 for(let i=0;i<a.count;i++){const x=a.getX(i),z=a.getY(i)-5,r=Math.hypot(x,z*.85),land=Math.max(0,r-6);let y=relief(x,z)*2.3*Math.min(1,Math.max(0,r-3)/3);y+=land*.055*(1+Math.sin(x*.17+z*.15));y+=Math.max(0,-z-8)*.17*(.65+valueNoise(x*.22,z*.19));a.setXYZ(i,x,y-.025,z);}
 g.computeVertexNormals();return g;
}
export function vaultPanel(angle,z,seed){
 const arc=Math.PI/3-.025,radius=2.45;
 const g=softBox(arc*radius,.68,.37,32,10,6,.065),a=g.attributes.position;
 for(let i=0;i<a.count;i++){const u=a.getX(i),v=a.getY(i),w=a.getZ(i),t=angle+u/radius,r=radius+w;const detail=.018*Math.sin(u*8.1+seed)*Math.sin(v*13.7+seed*.3);a.setXYZ(i,Math.sin(t)*(r+detail)*1.14,Math.cos(t)*(r+detail),z+v+.07*Math.sin(t*2+seed));}
 g.computeVertexNormals();return g;
}
export function iceBoulder(seed=3){
 const raw=new THREE.IcosahedronGeometry(1,15);raw.deleteAttribute('uv');const g=mergeVertices(raw,1e-5),p=g.attributes.position;raw.dispose();
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const a=.12*Math.sin(x*3.7+y*2.9+seed)+.07*Math.sin(y*7-z*4+seed)+.035*Math.sin(x*17+z*13);const r=1+a;const chip=.10*Math.max(0,Math.sin(y*5+seed)*Math.cos(x*4));p.setXYZ(i,x*r*1.62+y*.13,y*r*2.25,z*r*.9+chip);}
 const uv=[];for(let i=0;i<p.count;i++)uv.push((p.getX(i)+1.8)/3.6,(p.getY(i)+2.6)/5.2);g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
function softBox(width,height,depth,nx,ny,nz,radius){
 const g=new THREE.BoxGeometry(width,height,depth,nx,ny,nz),p=g.attributes.position,half=new THREE.Vector3(width/2-radius,height/2-radius,depth/2-radius),v=new THREE.Vector3(),q=new THREE.Vector3();
 for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);q.copy(v).clamp(half.clone().negate(),half);v.sub(q).normalize().multiplyScalar(radius).add(q);p.setXYZ(i,v.x,v.y,v.z);}return g;
}
export function arcSegment(radius,start,end,seed){
 const span=end-start,g=softBox(radius*span,.45,.35,32,8,6,.065),p=g.attributes.position;
 for(let i=0;i<p.count;i++){const u=p.getX(i),v=p.getY(i),w=p.getZ(i),t=(start+end)/2+u/radius;const r=radius+w+.025*Math.sin(t*17+seed)*Math.cos(v*9);p.setXYZ(i,Math.cos(t)*r,Math.sin(t)*r,v+.028*Math.sin(t*9+seed));}
 g.computeVertexNormals();return g;
}
function solidSurface(nu,nv,fn,thickness=.07){
 const positions=[],uv=[],indices=[],count=(nu+1)*(nv+1);
 for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){const p=fn(i/nu,j/nv);positions.push(p.x,p.y,p.z);uv.push(i/nu,j/nv);}
 for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){const a=i*(nv+1)+j,b=a+nv+1;indices.push(a,b,a+1,b,b+1,a+1);}
 const base=new THREE.BufferGeometry();base.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));base.setIndex(indices);base.computeVertexNormals();
 const normal=base.attributes.normal,source=positions.slice();
 for(let side=0;side<2;side++)for(let i=0;i<count;i++){const k=side?count*3+i*3:i*3,s=side?-1:1;positions[k]=source[i*3]+normal.getX(i)*thickness*s;positions[k+1]=source[i*3+1]+normal.getY(i)*thickness*s;positions[k+2]=source[i*3+2]+normal.getZ(i)*thickness*s;if(side)uv.push(uv[i*2],uv[i*2+1]);}
 const original=indices.slice();for(let i=0;i<original.length;i+=3)indices.push(original[i]+count,original[i+2]+count,original[i+1]+count);
 function edge(a,b){indices.push(a,a+count,b,b,a+count,b+count);}
 for(let i=0;i<nu;i++){edge(i*(nv+1),(i+1)*(nv+1));edge((i+1)*(nv+1)+nv,i*(nv+1)+nv);}
 for(let j=0;j<nv;j++){edge(j+1,j);edge(nu*(nv+1)+j,nu*(nv+1)+j+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();base.dispose();
 g.computeBoundingBox();const center=g.boundingBox.getCenter(new THREE.Vector3()),size=g.boundingBox.getSize(new THREE.Vector3());g.translate(-center.x,-center.y,-center.z);g.scale(3.2/Math.max(size.x,size.y,size.z),3.2/Math.max(size.x,size.y,size.z),3.2/Math.max(size.x,size.y,size.z));return g;
}
export function studyGeometries(){
 const tide=solidSurface(112,32,(u,v)=>{const a=.24+u*Math.PI*3.2,R=.16*Math.exp(a*.195),t=.065+.11*Math.exp(a*.172),b=v*Math.PI*2,flute=1+.028*Math.cos(a*22)*Math.cos(b);return new THREE.Vector3((R+t*Math.cos(b)*flute)*Math.cos(a),(R+t*Math.cos(b)*flute)*Math.sin(a),a*.045+t*Math.sin(b)*flute);},.045);
 const fold=solidSurface(108,26,(u,v)=>{const a=u*Math.PI*2,w=(v-.5)*1.18,rad=1.25+w*Math.cos(a/2);return new THREE.Vector3(rad*Math.cos(a),w*Math.sin(a/2)*1.3,rad*Math.sin(a));},.075);
 const saddle=solidSurface(72,72,(s,t)=>{const u=(s-.5)*2.1,v=(t-.5)*2.1;return new THREE.Vector3(u-u*u*u/3+u*v*v,v-v*v*v/3+v*u*u,(u*u-v*v)*.72);},.07);
 return [tide,fold,saddle];
}
export function sampleVolume(geometry,count=26000,seed=67){
 const random=seeded(seed),p=geometry.attributes.position,n=geometry.attributes.normal,ix=geometry.index.array,areas=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();let sum=0;
 for(let i=0;i<ix.length;i+=3){a.fromBufferAttribute(p,ix[i]);b.fromBufferAttribute(p,ix[i+1]);c.fromBufferAttribute(p,ix[i+2]);sum+=ab.subVectors(b,a).cross(ac.subVectors(c,a)).length()*.5;areas.push(sum);}
 const result=new Float32Array(count*3),normals=new Float32Array(count*3);
 for(let i=0;i<count;i++){const target=random()*sum;let l=0,h=areas.length-1;while(l<h){const mid=(l+h)>>1;areas[mid]<target?l=mid+1:h=mid;}const t=l*3,one=Math.sqrt(random()),two=random(),weights=[1-one,one*(1-two),one*two],normal=new THREE.Vector3(),at=new THREE.Vector3();for(let k=0;k<3;k++){at.addScaledVector(a.fromBufferAttribute(p,ix[t+k]),weights[k]);normal.addScaledVector(b.fromBufferAttribute(n,ix[t+k]),weights[k]);}normal.normalize();at.addScaledVector(normal,-random()*.065);result.set(at.toArray(),i*3);normals.set(normal.toArray(),i*3);}
 return {positions:result,normals};
}
