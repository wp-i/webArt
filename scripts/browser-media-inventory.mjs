// Read visible surface metadata, including accessible nested DOM. Never fetch a source model or shader.
export const browserMediaInventory = `(()=>{
 const roots=[],opaqueFrames=[],seen=new Set();
 function walk(root){if(!root||seen.has(root))return;seen.add(root);roots.push(root);for(const e of root.querySelectorAll('*')){if(e.shadowRoot)walk(e.shadowRoot);if(e.tagName==='IFRAME'){try{if(e.contentDocument)walk(e.contentDocument);else opaqueFrames.push({src:e.src,rect:e.getBoundingClientRect().toJSON()})}catch{opaqueFrames.push({src:e.src,rect:e.getBoundingClientRect().toJSON()})}}}}
 walk(document);const all=roots.flatMap(r=>[...r.querySelectorAll('*')]);
 const geometry=e=>({tag:e.tagName,rect:e.getBoundingClientRect().toJSON()});
 const viewers=all.filter(e=>/^(SPLINE-VIEWER|MODEL-VIEWER)$/.test(e.tagName)).map(e=>({...geometry(e),openShadow:!!e.shadowRoot,canvasCount:e.shadowRoot?.querySelectorAll('canvas').length??null}));
 const videos=all.filter(e=>e.tagName==='VIDEO').map(e=>({...geometry(e),ready:e.readyState,width:e.videoWidth,height:e.videoHeight,paused:e.paused}));
 const canvases=all.filter(e=>e.tagName==='CANVAS').map(e=>({...geometry(e),width:e.width,height:e.height}));
 const images=all.filter(e=>e.tagName==='IMG').length;
 return{images,videos,canvases,viewers,openRoots:roots.length,opaqueFrames,manualRenderReviewRequired:canvases.length>0||viewers.length>0||opaqueFrames.some(e=>e.rect.width>80&&e.rect.height>80)};
})()`;
