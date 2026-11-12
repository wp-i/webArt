import fs from 'node:fs';
import path from 'node:path';
import {BrowserPage} from './browser.mjs';
import {nativePositionTo} from './native-scroll.mjs';
import {child} from '../collection.mjs';
import {ProductionError} from './api.mjs';

const wait=ms=>new Promise(r=>setTimeout(r,ms));
const need=(ok,message)=>{if(!ok)throw new ProductionError('native-gallery-failed',message)};
export async function inspectNativeGalleries({root,endpoint,url,galleries,output,sourceSha256}){
 const report={schemaVersion:1,sourceSha256,checks:[],result:'running',started:new Date().toISOString()};
 try{
  for(const gallery of galleries){
   need(gallery.selector&&gallery.scene&&gallery.itemSelector&&Number.isInteger(gallery.items)&&gallery.items>=2&&gallery.items<=6,'Gallery requires a static scene, selector and item count');
   for(const mode of ['normal','reduced','no-script'])for(const [width,height] of [[1440,900],[390,844]]){
    const page=await BrowserPage.create(endpoint);
    try{
     await page.viewport(width,height);await page.page('Page.bringToFront');
     if(mode==='reduced')await page.page('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
     if(mode==='no-script')await page.page('Emulation.setScriptExecutionDisabled',{value:true});
     await page.navigate(url);
     need(await page.evaluate(`document.querySelectorAll(${JSON.stringify(gallery.itemSelector)}).length===${gallery.items}`),'Gallery content count changed');
     const position=()=>nativePositionTo(page,{selector:gallery.scene,offset:0},{settleMs:450});
     await position();
     let reached=false;
     for(let i=0;i<28;i++){
      await page.page('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await page.page('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      if(await page.evaluate(`document.activeElement===document.querySelector(${JSON.stringify(gallery.selector)})`)){reached=true;break}
     }
     need(reached,'Native gallery cannot be reached by keyboard');await position();
     const location=()=>page.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(gallery.itemSelector)}).getBoundingClientRect();return{x:r.left,y:scrollY,left:document.querySelector(${JSON.stringify(gallery.selector)}).scrollLeft}})()`);
     const evidence=[],label=mode+'-'+width+'-'+report.checks.length;
     const shot=async state=>evidence.push({state,...await page.shot(root,output+'/'+label+'-'+state+'.jpg')});
     const key=async value=>{await page.page('Input.dispatchKeyEvent',{type:'keyDown',key:value,code:value,windowsVirtualKeyCode:value==='ArrowRight'?39:37});await page.page('Input.dispatchKeyEvent',{type:'keyUp',key:value,code:value,windowsVirtualKeyCode:value==='ArrowRight'?39:37});await wait(700)};
     const start=await location();await shot('focused');await key('ArrowRight');const forward=await location();await shot('keyboard-forward');await key('ArrowLeft');const reverse=await location();await shot('keyboard-reverse');
     need(start.x-forward.x>30&&Math.abs(reverse.x-start.x)<8,'Keyboard gallery input did not change and restore the actual photograph position');
     let touch=null;
     if(width<700){
      const swipe=async reverse=>{const y=height*.5,a=width*(reverse?.2:.8),b=width*(reverse?.8:.2);await page.page('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a,y}]});for(let n=1;n<=12;n++){await page.page('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a+(b-a)*n/12,y}]});await wait(22)}await page.page('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(850)};
      const before=await location();await swipe(false);const forward=await location();await shot('touch-forward');await swipe(true);const reverse=await location();await shot('touch-reverse');
      need(before.x-forward.x>60&&Math.abs(reverse.x-before.x)<12,'Real horizontal touch did not change and restore the actual photograph');touch={before,forward,reverse};
     }
     report.checks.push({mode,width,height,selector:gallery.selector,keyboard:{reached,start,forward,reverse},touch,evidence});
    }finally{await page.close()}
   }
  }
  report.result='passed-native-gallery-input-not-visually-approved';return report;
 }catch(error){report.result='failed-native-gallery';report.failure=error.message;throw error}
 finally{report.finished=new Date().toISOString();const file=child(root,output+'/galleries.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n')}
}
