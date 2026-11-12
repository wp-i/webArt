const root=document.documentElement;
const defaults=[[1,1,0,1,1,0,0],[1,0,1,0,1,0,0],[1,1,0,1,0,1,0]];
let records=defaults.map(row=>row.slice());
const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const habits=['Read a little','Move outside','Take a pause'];
const moods=['A heavy week','A little low','Somewhere in between','Pretty good','Feeling light'];
const status=document.querySelector('#record-status');
document.querySelectorAll('button:disabled,input:disabled,textarea:disabled').forEach(e=>e.disabled=false);
root.classList.add('js');
function render(){
 document.querySelectorAll('[data-row]').forEach((row,i)=>{
  row.replaceChildren(...records[i].map((checked,d)=>{
   const b=document.createElement('button');b.type='button';b.className='cell';b.textContent='✓';b.dataset.habit=i;b.dataset.day=d;b.setAttribute('aria-label',`${habits[i]}, ${days[d]}`);b.setAttribute('aria-pressed',!!checked);return b;
  }));row.closest('.habit').querySelector('output').textContent=`${records[i].reduce((a,b)=>a+b,0)} / 7`;
 });
 document.querySelector('.today-habits').replaceChildren(...habits.map((name,i)=>{const b=document.createElement('button');b.type='button';b.className='today-cell';b.dataset.today=i;b.setAttribute('aria-pressed',!!records[i][0]);b.innerHTML=`<span>${name}</span><i aria-hidden="true">✓</i>`;return b}));
 document.querySelector('#total').textContent=records.flat().reduce((a,b)=>a+b,0);
}
function toggle(i,d){records[i][d]=+!records[i][d];render();const b=document.querySelector(`.cell[data-habit="${i}"][data-day="${d}"]`);b.classList.add('pop');status.textContent=`${habits[i]}, ${days[d]} ${records[i][d]?'recorded':'cleared'}`;return b}
document.querySelector('.phone').addEventListener('click',e=>{const b=e.target.closest('.cell,[data-today]');if(!b)return;if(b.dataset.today!==undefined){toggle(+b.dataset.today,0);document.querySelector(`[data-today="${b.dataset.today}"]`).focus({preventScroll:true})}else toggle(+b.dataset.habit,+b.dataset.day).focus({preventScroll:true})});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-view]').forEach(t=>t.setAttribute('aria-pressed',t===b));document.querySelector('#week-panel').hidden=b.dataset.view!=='week';document.querySelector('#today-panel').hidden=b.dataset.view!=='today'}));
document.querySelectorAll('.themes button').forEach(b=>b.addEventListener('click',()=>{root.dataset.theme=b.dataset.theme;document.querySelectorAll('.themes button').forEach(t=>t.setAttribute('aria-pressed',t===b));document.querySelector('meta[name=theme-color]').content=getComputedStyle(root).getPropertyValue('--bg').trim();status.textContent=`${b.textContent.trim()} theme selected`;}));
const mood=document.querySelector('#mood');
function updateMood(){const text=moods[mood.value-1];document.querySelector('#mood-value').textContent=text;mood.setAttribute('aria-valuetext',text);mood.style.setProperty('--mood',`${(mood.value-1)*25}%`)}
mood.addEventListener('input',updateMood);
const form=document.querySelector('#note-form'),noteStatus=document.querySelector('#note-status');
form.addEventListener('input',()=>{form.dataset.saved='false';noteStatus.textContent='NOT SAVED YET'});
form.addEventListener('submit',e=>{e.preventDefault();try{localStorage.setItem('pace-reflection-v1',JSON.stringify({mood:mood.value,good:form.good.value,next:form.next.value}));form.dataset.saved='true';noteStatus.textContent='KEPT IN THIS BROWSER'}catch{form.dataset.saved='false';noteStatus.textContent='STORAGE UNAVAILABLE. YOUR NOTE IS STILL HERE.'}});
try{const saved=JSON.parse(localStorage.getItem('pace-reflection-v1'));if(saved&&typeof saved.good==='string'&&typeof saved.next==='string'){mood.value=Math.max(1,Math.min(5,+saved.mood||4));form.good.value=saved.good.slice(0,140);form.next.value=saved.next.slice(0,140);form.dataset.saved='true';noteStatus.textContent='KEPT IN THIS BROWSER'}}catch{}
document.querySelector('#reset').addEventListener('click',()=>{records=defaults.map(r=>r.slice());render();status.textContent='Example week restored';document.querySelector('#week-message').innerHTML='Your week, fresh again.<br>Try a little something.'});
render();updateMood();
const reduce=matchMedia('(prefers-reduced-motion:reduce)'),fine=matchMedia('(hover:hover) and (pointer:fine)');
const phone=document.querySelector('.phone-wrap');
phone.addEventListener('pointermove',e=>{if(reduce.matches||!fine.matches)return;const r=phone.getBoundingClientRect();root.style.setProperty('--pointer-x',`${((e.clientX-r.left)/r.width-.5)*5}deg`);root.style.setProperty('--pointer-y',`${-((e.clientY-r.top)/r.height-.5)*4}deg`)});
phone.addEventListener('pointerleave',()=>{root.style.setProperty('--pointer-x','0deg');root.style.setProperty('--pointer-y','0deg')});
let queued=false;const sections=[document.querySelector('.hero'),document.querySelector('.reflection'),document.querySelector('.closing')];
function draw(){queued=false;const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);const progress=Math.max(0,Math.min(1,scrollY/max));document.querySelectorAll('.progress i').forEach((e,i)=>e.style.setProperty('--part',Math.max(0,Math.min(1,progress*3-i))));const active=sections.reduce((a,s,i)=>s.getBoundingClientRect().top<innerHeight*.42?i:a,0);document.querySelector('#chapter').textContent=['THE WEEK','REFLECTION','BEGIN AGAIN'][active];const r=phone.getBoundingClientRect();root.style.setProperty('--lift',reduce.matches?'0px':`${Math.max(-12,Math.min(12,(r.top+ r.height/2-innerHeight/2)*-.025))}px`);const note=form.getBoundingClientRect();form.style.setProperty('--reveal',reduce.matches?1:Math.max(0,Math.min(1,(innerHeight-note.top)/(innerHeight*.6))))}
function request(){if(!queued){queued=true;requestAnimationFrame(draw)}}
addEventListener('scroll',request,{passive:true});addEventListener('resize',request);reduce.addEventListener('change',()=>{root.style.setProperty('--pointer-x','0deg');root.style.setProperty('--pointer-y','0deg');draw()});draw();
