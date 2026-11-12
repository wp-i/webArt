import './styles.css';

const root=document.documentElement;
root.classList.add('js');
const world=document.querySelector('.world');
const photographs=[...document.querySelectorAll('.photograph')];
const tools=document.querySelector('.view-tools');
const range=document.querySelector('#distance');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
document.querySelector('.skip').setAttribute('href','#scene-middle');
document.querySelector('.identity nav a').setAttribute('href','#scene-middle');
const journeyLink=document.querySelector('.world-note a');journeyLink.setAttribute('href','#scene-transition');journeyLink.textContent='Take a closer look ↓';
const works={thread:{title:'Red thread',credit:'Ericka Sánchez',number:'01 / 03'},tulle:{title:'Through the red',credit:'Israyosoy S.',number:'02 / 03'},velvet:{title:'Out of the blue',credit:'kwnos Iv',number:'03 / 03'}};
let selected='velvet',progress=0,detail=0,queued=false,wasViewing=false;
const clamp=n=>Math.min(1,Math.max(0,n));
const mix=(a,b,t)=>a+(b-a)*t;
const ease=n=>n*n*(3-2*n);
const reset=()=>{range.value='1';document.querySelector('#distance-value').value='1.0×';photographs.forEach(p=>{p.style.setProperty('--zoom','1');p.style.setProperty('--ox','50%');p.style.setProperty('--oy','50%')})};
function draw(){
  queued=false;
  const small=innerWidth<700,h=innerHeight,w=innerWidth;
  progress=clamp(-world.getBoundingClientRect().top/(world.offsetHeight-h));
  const travel=ease(clamp(progress/.57));
  detail=ease(clamp((progress-.57)/.4));
  if(reduced.matches)detail=detail>.5?1:0;
  root.style.setProperty('--p',String(progress));root.style.setProperty('--detail',String(detail));
  const opening=small?[[.07,.22,.30,.31],[.43,.15,.51,.47],[.10,.64,.31,.29]]:[[.07,.20,.18,.54],[.39,.13,.30,.74],[.80,.50,.16,.46]];
  const journey=small?[[-.16,-.32,.32,.34],[.09,-.16,.61,.56],[.43,.32,.51,.47]]:[[-.13,-.43,.20,.60],[.15,-.24,.31,.76],[.49,.10,.42,.83]];
  const others=photographs.filter(p=>p.dataset.photo!==selected);
  photographs.forEach((p,i)=>{
    const active=p.dataset.photo===selected,slot=others.indexOf(p);
    const viewing=small?(active?[.29,.27,.65,.50]:[.065,.30+slot*.22,.15,.15]):(active?[.32,.10,.36,.80]:[.10,.18+slot*.31,.10,.25]);
    const a=opening[i],b=journey[i],v=a.map((n,j)=>mix(mix(n,b[j],travel),viewing[j],detail));
    p.style.left=v[0]*w+'px';p.style.top=v[1]*h+'px';p.style.width=v[2]*w+'px';p.style.height=v[3]*h+'px';
    p.dataset.selected=String(active);p.dataset.viewing=String(detail>.8);p.style.zIndex=String(detail>.5?(active?4:3):i===1?3:2);
  });
  const visible=detail>.8;if(wasViewing&&!visible)reset();wasViewing=visible;tools.hidden=!visible;tools.dataset.visible=String(visible);
  photographs.forEach(p=>p.setAttribute('aria-current',visible&&p.dataset.photo===selected?'true':'false'));
}
function requestDraw(){if(!queued){queued=true;requestAnimationFrame(draw)}}
photographs.forEach(p=>{
  p.setAttribute('href','#scene-middle');
  p.addEventListener('click',()=>{selected=p.dataset.photo;const work=works[selected];document.querySelector('#photo-title').textContent=work.title;document.querySelector('#photo-credit').textContent='Photograph by '+work.credit;document.querySelector('#photo-number').textContent=work.number;reset();draw()});
  p.addEventListener('pointermove',e=>{if(detail<.8||p.dataset.photo!==selected||Number(range.value)<=1)return;const r=p.getBoundingClientRect();p.style.setProperty('--ox',clamp((e.clientX-r.left)/r.width)*100+'%');p.style.setProperty('--oy',clamp((e.clientY-r.top)/r.height)*100+'%')});
});
range.addEventListener('input',()=>{const zoom=Number(range.value);document.querySelector('#distance-value').value=zoom.toFixed(1)+'×';photographs.find(p=>p.dataset.photo===selected).style.setProperty('--zoom',String(zoom))});
document.querySelector('#reset-view').addEventListener('click',reset);
document.querySelectorAll('a[href="#scene-opening"]').forEach(a=>a.addEventListener('click',reset));
addEventListener('scroll',requestDraw,{passive:true});addEventListener('resize',requestDraw);reduced.addEventListener('change',()=>{reset();draw()});
draw();
Promise.all([document.fonts.ready,...[...world.querySelectorAll('img')].map(img=>img.decode().catch(()=>{}))]).then(()=>{draw();root.dataset.ready='true'});
