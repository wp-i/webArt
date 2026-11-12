export const frameDocumentReady = `(()=>{const frame=document.querySelector('#preview-frame'),d=frame?.contentDocument;if(!d||document.querySelector('.preview-toolbar').hidden||!frame.getAttribute('src')||d.URL==='about:blank'||d.readyState!=='complete'||d.fonts.status!=='loaded')return false;return true})()`;

// Keep the final resource/entrance gate strict, including below-fold images.
export const frameReady = `(()=>{const frame=document.querySelector('#preview-frame'),d=frame?.contentDocument,w=frame?.contentWindow;if(!d||document.querySelector('.preview-toolbar').hidden||!frame.getAttribute('src')||d.URL==='about:blank'||d.readyState!=='complete'||d.fonts.status!=='loaded'||![...d.images].every(i=>i.complete&&i.naturalWidth))return false;const cover=d.querySelector('.load-cover');return !cover||(!!d.querySelector('.page.is-ready')&&cover.getBoundingClientRect().bottom<=1&&Number(w.getComputedStyle(d.querySelector('.hero__copy')).opacity)>.98)})()`;

const frameState = `(()=>{const frame=document.querySelector('#preview-frame'),d=frame.contentDocument,w=frame.contentWindow,r=frame.getBoundingClientRect(),left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);return{x:(left+right)/2,y:(top+bottom)/2,visible:right>left&&bottom>top,scrollY:w.scrollY,height:w.innerHeight,scrollHeight:Math.max(d.documentElement.scrollHeight,d.body?.scrollHeight??0),pendingLazy:[...d.images].filter(i=>i.loading==='lazy'&&(!i.complete||!i.naturalWidth)).length}})()`;
const visibleImagesReady = `(()=>{const frame=document.querySelector('#preview-frame'),d=frame.contentDocument,w=frame.contentWindow;return [...d.images].every(i=>{const r=i.getBoundingClientRect();return r.bottom<=0||r.top>=w.innerHeight||(i.complete&&i.naturalWidth)})})()`;
const frameY = `document.querySelector('#preview-frame').contentWindow.scrollY`;

export async function preparePreview({evaluate,page,wait,sleep}) {
  await wait(frameDocumentReady);
  const opening = await evaluate(frameState);
  let warmup;
  if (opening.pendingLazy) {
    if (!opening.visible) throw new Error('Preview iframe is not visible for native lazy-image traversal');
    warmup = {pendingLazy:opening.pendingLazy,wheelSteps:0,openingScrollY:opening.scrollY};
    const wheel = async (state,deltaY) => {
      await page('Input.dispatchMouseEvent',{type:'mouseMoved',x:state.x,y:state.y});
      await page('Input.dispatchMouseEvent',{type:'mouseWheel',x:state.x,y:state.y,deltaX:0,deltaY});
    };
    try {
      await wait(visibleImagesReady);
      let state = opening;
      // Native wheel steps expose every viewport to the browser's lazy loader.
      // Reading geometry never changes loading attributes or scroll position.
      for (let step=0;state.scrollY+state.height<state.scrollHeight-1;step++) {
        if (step>=100) throw new Error('Preview native lazy-image traversal did not reach the end');
        await wheel(state,Math.max(1,Math.round(state.height*.7)));
        warmup.wheelSteps++;
        await wait(`${frameY}>${state.scrollY+.5}`);
        await sleep(120);
        await wait(visibleImagesReady);
        state = await evaluate(frameState);
      }
      warmup.endingScrollY = state.scrollY;
    } finally {
      const state = await evaluate(frameState);
      if (state.scrollY>0) {
        await wheel(state,-Math.max(state.scrollHeight,state.height));
        await wait(`${frameY}<1`);
      }
      if (opening.scrollY>0) {
        await wheel(await evaluate(frameState),opening.scrollY);
        await wait(`Math.abs(${frameY}-${opening.scrollY})<2`);
      }
      await page('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});
      warmup.restoredScrollY = await evaluate(frameY);
    }
  }
  await wait(frameReady);
  return warmup;
}
