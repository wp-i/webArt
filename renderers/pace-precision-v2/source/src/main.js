import './styles.css';
import content from './content.json';
import {mountInstrument} from './locked/instrument-scene.js';
const canvas=document.querySelector('canvas'),root=document.documentElement,stage=document.querySelector('#live-stage'),fallback=document.querySelector('#static-scenes'),release=document.querySelector('#release'),puck=document.querySelector('#puck'),copies=[...document.querySelectorAll('.scene-copy')],count=document.querySelector('#scene-count');
window.__releaseCount=0;stage.hidden=false;let first=true;
const scene=mountInstrument(canvas,{puckViewport:document.querySelector('#puck-viewport'),puck,fallback,onReady:()=>{if(first){first=false;root.classList.add('is-live');schedule()}}});
const kick=()=>{window.__releaseCount++;scene.release()};release.addEventListener('click',kick);puck.addEventListener('click',kick);puck.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')window.__releaseCount++});
canvas.addEventListener('webglcontextlost',()=>{root.classList.remove('is-live');release.hidden=true;schedule()});
window.addEventListener('pointermove',event=>scene.setPointer(event.clientX/innerWidth*2-1,event.clientY/innerHeight*2-1),{passive:true});document.addEventListener('pointerleave',()=>scene.setPointer(0,0));
let scroll=scrollY,pending=0;
function schedule(){if(!pending)pending=requestAnimationFrame(draw)}
window.addEventListener('scroll',()=>{scroll=scrollY;schedule()},{passive:true});window.addEventListener('resize',schedule,{passive:true});
const clamp=value=>Math.min(1,Math.max(0,value)),smooth=value=>{value=clamp(value);return value*value*(3-2*value)};
function draw(){pending=0;const progress=Math.min(3,Math.max(0,scroll/innerHeight)),index=Math.round(progress),paper=smooth((progress-.4)/.5)*(1-smooth((progress-1.22)/.5));scene.setProgress(progress);if(root.classList.contains('is-live')){document.body.style.backgroundColor=`rgb(${Math.round(36+(221-36)*paper)},${Math.round(37+(217-37)*paper)},${Math.round(35+(210-35)*paper)})`;document.body.style.color=paper>.5?'#242523':'#f1f0e9';copies.forEach((copy,i)=>{const active=i===index;copy.classList.toggle('active',active);copy.style.opacity=active?smooth(1-Math.abs(progress-i)*2):0;copy.style.transform=`translateY(${(i-progress)*22}px)`;copy.setAttribute('aria-hidden',String(!active))});release.hidden=progress<2.65}else{document.body.style.backgroundColor='';document.body.style.color='';copies.forEach(copy=>{copy.style.opacity='';copy.style.transform='';copy.removeAttribute('aria-hidden')})}
 root.classList.toggle('is-ending',index===3);const key='count-'+(index+1);if(count.dataset.content!==key){count.dataset.content=key;count.textContent=content[key]}}
schedule();window.__paceScene=scene;
