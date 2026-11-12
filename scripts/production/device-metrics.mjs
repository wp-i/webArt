// CSS viewport, physical screen and orientation describe the same device.
export function deviceMetrics(width,height,deviceScaleFactor=1){
 if(![width,height,deviceScaleFactor].every(n=>Number.isFinite(n)&&n>0))throw Error('Invalid emulated device dimensions');
 return {width,height,screenWidth:width,screenHeight:height,deviceScaleFactor,mobile:width<700,screenOrientation:width>height?{type:'landscapePrimary',angle:90}:{type:'portraitPrimary',angle:0}};
}
export function deviceAgent(browser,width){
 if(width>=700)return {userAgent:''};
 const version=browser.product?.split('/')[1];
 if(!/^\d+(?:\.\d+){1,3}$/.test(version??''))throw Error('Missing actual task browser version');
 return {userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/'+version+' Mobile Safari/537.36',platform:'Linux armv8l',userAgentMetadata:{brands:[{brand:'Chromium',version:version.split('.')[0]}],fullVersionList:[{brand:'Chromium',version}],platform:'Android',platformVersion:'14.0.0',architecture:'arm',model:'Pixel 7a',mobile:true,bitness:'64'}};
}
