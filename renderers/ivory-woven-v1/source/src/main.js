import './styles.css';

// Native scrolling remains the only timeline. No idle animation loop.
const spaces=document.querySelector('.spaces');
const panorama=document.querySelector('.panorama');
const track=document.querySelector('.panorama-track');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let frame=0,travel=0,span=0,top=0,last=-1;
let touchStart=null,horizontalTouch=false,touchTimer=0;
const nativeHorizontal=()=>innerWidth<=599&&!reduced.matches;
function paint(){
  frame=0;
  if(reduced.matches||document.hidden)return;
  const progress=Math.max(0,Math.min(1,(scrollY-top)/span));
  if(progress===last)return;
  last=progress;
  if(nativeHorizontal()){
    track.style.removeProperty('--pan-x');
    if(!horizontalTouch&&Math.abs(panorama.scrollLeft-progress*travel)>.5)panorama.scrollLeft=progress*travel;
  }else track.style.setProperty('--pan-x',`${-progress*travel}px`);
  spaces.style.setProperty('--progress',progress);
}
function schedule(){if(!frame)frame=requestAnimationFrame(paint)}
function measure(){
  horizontalTouch=false;touchStart=null;clearTimeout(touchTimer);
  spaces.classList.toggle('is-reduced',reduced.matches);
  travel=Math.max(0,track.scrollWidth-innerWidth);
  span=Math.max(1,spaces.offsetHeight-panorama.offsetHeight);
  top=spaces.getBoundingClientRect().top+scrollY;
  last=-1;
  if(reduced.matches){track.style.removeProperty('--pan-x');spaces.style.removeProperty('--progress')}
  else schedule();
}

// A horizontal phone gesture uses the browser's real scrolling surface. Its
// position rejoins the same vertical story instead of creating a second loop.
panorama.addEventListener('touchstart',event=>{
  if(!nativeHorizontal())return;
  clearTimeout(touchTimer);horizontalTouch=false;
  touchStart={x:event.touches[0].clientX,y:event.touches[0].clientY};
},{passive:true});
panorama.addEventListener('touchmove',event=>{
  if(!touchStart||!nativeHorizontal())return;
  const dx=Math.abs(event.touches[0].clientX-touchStart.x),dy=Math.abs(event.touches[0].clientY-touchStart.y);
  if(dx>6&&dx>dy*1.2)horizontalTouch=true;
},{passive:true});
panorama.addEventListener('scroll',()=>{
  if(!horizontalTouch||!nativeHorizontal()||!travel)return;
  const target=top+Math.max(0,Math.min(1,panorama.scrollLeft/travel))*span;
  if(Math.abs(scrollY-target)>.8)scrollTo({top:target,behavior:'instant'});
},{passive:true});
function finishTouch(){touchStart=null;clearTimeout(touchTimer);touchTimer=setTimeout(()=>{horizontalTouch=false;last=-1;schedule()},400)}
panorama.addEventListener('touchend',finishTouch,{passive:true});
panorama.addEventListener('touchcancel',finishTouch,{passive:true});
panorama.addEventListener('keydown',event=>{
  if(reduced.matches||event.target!==panorama||event.altKey||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();
  const progress=Math.max(0,Math.min(1,(scrollY-top)/span+(event.key==='ArrowRight'?.25:-.25)));
  scrollTo({top:top+progress*span,behavior:'instant'});
});

const views=[...document.querySelectorAll('.material-view')];
const buttons=[...document.querySelectorAll('[data-view]')];
let chosen='material-silk';
function select(id){
  views.forEach(view=>{const active=view.id===id;view.classList.toggle('is-selected',active);view.setAttribute('aria-hidden',String(!active))});
  buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===id)));
}
buttons.forEach(button=>{
  button.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')select(button.dataset.view)});
  button.addEventListener('focus',()=>select(button.dataset.view));
  button.addEventListener('click',()=>{chosen=button.dataset.view;select(chosen)});
});
document.querySelector('.index-options').addEventListener('pointerleave',()=>{
  const focused=buttons.find(button=>button===document.activeElement);
  select(focused?.dataset.view??chosen);
});

document.body.classList.add('js');
select(chosen);
addEventListener('scroll',schedule,{passive:true});
addEventListener('resize',measure,{passive:true});
reduced.addEventListener('change',measure);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&frame){cancelAnimationFrame(frame);frame=0}else if(!document.hidden)measure()});
measure();
document.fonts.ready.then(measure);
document.documentElement.dataset.ready='true';
