import {verifyFrame}from'../quality-gate.mjs';
export const responsiveViews=[['desktop',1440,900],['wide',2048,912],['tablet',768,1024],['mobile',390,844],['narrow',320,844]];
export function validateResponsiveCapture(root,runtime,sourceSha256){
 if(!/^[a-f0-9]{64}$/.test(sourceSha256||'')||runtime.result!=='passed-observable-checks'||runtime.sourceSha256!==sourceSha256||runtime.responsive?.length!==20)throw Error('Five-width composition evidence incomplete');
 for(const [viewport,width,height]of responsiveViews)for(const state of ['opening','transition','middle','ending']){
  const matches=runtime.responsive.filter(s=>s.viewport===viewport&&s.state===state);
  if(matches.length!==1||matches[0].width!==width||matches[0].height!==height)throw Error('Missing responsive composition: '+viewport+'/'+state);
  verifyFrame(root,[matches[0].evidence],[width,height]);
 }
 return runtime.responsive;
}
export function validateResponsiveReview(root,runtime,review){
 if(review.sourceSha256!==runtime.sourceSha256||runtime.responsive?.length!==20||review.responsiveComposition!=='pass'||review.responsiveChecks?.length!==20)throw Error('Five-width state review incomplete');
 for(const frame of runtime.responsive){
  const matches=review.responsiveChecks.filter(c=>c.viewport===frame.viewport&&c.state===frame.state),c=matches[0];
  if(matches.length!==1||!['subject','composition','actions'].every(k=>c[k]==='preserved')||typeof c.finding!=='string'||c.finding.length<30||!c.evidence?.some(e=>e.path===frame.evidence.path&&e.sha256===frame.evidence.sha256))throw Error('Responsive state not preserved or reviewed: '+frame.viewport+'/'+frame.state);
  verifyFrame(root,c.evidence,[frame.width,frame.height]);
 }
 return true;
}
