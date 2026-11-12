// Runs inside the task browser. This rejects an undrawn image surface; it does
// not grade composition, image choice or visual quality.
export async function measurePaintedImages(screenshot,selector){
 const shot=new Image();shot.src=screenshot;await shot.decode();
 const variance=canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let sum=0,squares=0,count=0;for(let i=0;i<pixels.length;i+=4){const value=(pixels[i]+pixels[i+1]+pixels[i+2])/3;sum+=value;squares+=value*value;count++}return Math.sqrt(Math.max(0,squares/count-(sum/count)**2))};
 const crop=(image,x,y,w,h)=>{const c=document.createElement('canvas');c.width=64;c.height=40;c.getContext('2d').drawImage(image,x+w*.1,y+h*.1,w*.8,h*.8,0,0,64,40);return variance(c)};
 const results=[];
 for(const image of document.querySelectorAll(selector)){
  await image.decode();const r=image.getBoundingClientRect(),expected=crop(image,0,0,image.naturalWidth,image.naturalHeight),actual=crop(shot,r.x,r.y+scrollY,r.width,r.height);
  results.push({src:new URL(image.currentSrc).pathname,expectedVariance:expected,actualVariance:actual,missing:expected>8&&actual<2});
 }
 return results;
}
export function assertPaintedImages(results){
 if(!results.length||results.some(r=>!Number.isFinite(r.expectedVariance)||!Number.isFinite(r.actualVariance)||r.missing))throw Error('Actual screenshot has an undrawn image surface');
 return true;
}
