import {ProductionError} from './api.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const need=(ok,message)=>{if(!ok)throw new ProductionError('controls-failed',message)};
export async function inspectNativeRange({browser,selector,declaration,viewport,width,root,output,evidence}){
 need(typeof declaration?.rangeCheck==='string'&&declaration.rangeCheck.length>=20,'Range input requires a fixed observable content coupling check');
 const q=JSON.stringify(selector),read=()=>browser.evaluate(`(()=>{const e=document.querySelector(${q});return{value:Number(e.value),min:Number(e.min||0),max:Number(e.max||100),step:Number(e.step||1)}})()`),initial=await read();
 need(Object.values(initial).every(Number.isFinite)&&initial.max>initial.min&&initial.step>0,'Range constraints must be finite and bounded');
 const key=async name=>{const code={Home:36,End:35,ArrowRight:39}[name];await browser.page('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:code});await browser.page('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name,windowsVirtualKeyCode:code});await wait(100)};
 async function record(state,expected){const current=await read();need(current.value>=current.min&&current.value<=current.max,'Native range escaped its bounds');if(expected!==undefined)need(Math.abs(current.value-expected)<initial.step*.51,'Native range keyboard result differs from its declared bounds');need(await browser.evaluate(declaration.rangeCheck),'Native range changed without the declared visible content result');evidence.push({state,value:current.value,...await browser.shot(root,output+'/'+viewport+'-'+state+'.jpg')});return current.value}
 await key('Home');await record('range-minimum',initial.min);
 await key('ArrowRight');await record('range-keyboard-step',Math.min(initial.max,initial.min+initial.step));
 await key('End');await record('range-maximum',initial.max);
 await key('Home');await record('range-keyboard-return',initial.min);
 const b=await browser.evaluate(`(()=>{const r=document.querySelector(${q}).getBoundingClientRect();return{x:r.x,y:r.y+r.height/2,width:r.width}})()`);
 async function point(fraction){const at={x:b.x+b.width*fraction,y:b.y};if(width<700){await browser.page('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[at]});await browser.page('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}else{await browser.page('Input.dispatchMouseEvent',{type:'mouseMoved',...at});await browser.page('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...at});await browser.page('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...at})}await wait(100)}
 await point(.8);const forward=await record(width<700?'range-touch-forward':'range-mouse-forward');need(forward>initial.min,'Physical range action did not move forward');
 await point(.25);const reverse=await record(width<700?'range-touch-reverse':'range-mouse-reverse');need(reverse<forward,'Physical range action did not reverse');
 await key('Home');await record('range-physical-return',initial.min);
}
