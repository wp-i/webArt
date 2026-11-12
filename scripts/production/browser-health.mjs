import fs from 'node:fs';
import path from 'node:path';
import {BrowserPage} from './browser.mjs';
import {hash,ProductionError} from './api.mjs';

export function validateBrowserHealth(sample){
 if(sample.visibility!=='visible'||sample.rafSamples<30||!Number.isFinite(sample.rafP95Ms)||sample.rafP95Ms>34||!Number.isFinite(sample.rafP99Ms)||sample.rafP99Ms>75)throw new ProductionError('browser-environment-unfit','空白动画基线未达到固定桌面帧预算；先修复任务浏览器，不把环境限速记为页面缺陷');
 return sample;
}
export async function checkTaskBrowser({root,endpoint,configuration}){
 const identity=hash(JSON.stringify({endpoint,configuration,probeVersion:'visible-empty-animation-v1'})),directory=path.join(root,'.webart/browser-health');fs.mkdirSync(directory,{recursive:true});
 const file=path.join(directory,identity+'.json');
 if(fs.existsSync(file)){const report=JSON.parse(fs.readFileSync(file,'utf8'));if(Date.now()-Date.parse(report.checkedAt)<900000){validateBrowserHealth(report.sample);return report}}
 const page=await BrowserPage.create(endpoint);let report;
 try{
  const browser=await page.send('Browser.getVersion');await page.page('Page.bringToFront');await page.viewport(1440,900);
  await page.page('Page.navigate',{url:'data:text/html,<title>WebArt browser environment check</title><style>body{margin:0}div{width:24px;height:24px;background:black}</style><div></div>'});
  await new Promise(resolve=>setTimeout(resolve,250));
  const sample=await page.evaluate(`new Promise(resolve=>{const deltas=[];let start=performance.now(),last=start,raf,done=false;function finish(){if(done)return;done=true;cancelAnimationFrame(raf);deltas.sort((a,b)=>a-b);resolve({visibility:document.visibilityState,rafSamples:deltas.length,rafP95Ms:deltas[Math.floor(deltas.length*.95)]??null,rafP99Ms:deltas[Math.floor(deltas.length*.99)]??null,durationMs:performance.now()-start})}function tick(now){deltas.push(now-last);last=now;document.querySelector('div').style.transform='translateX('+Math.floor(now%100)+'px)';if(now-start>=1250)finish();else raf=requestAnimationFrame(tick)}raf=requestAnimationFrame(tick);setTimeout(finish,1600)})`);
  validateBrowserHealth(sample);report={schemaVersion:1,identity,endpoint,browser,configuration,sample,checkedAt:new Date().toISOString(),purpose:'Browser environment baseline only; this cannot approve page quality or performance.'};
  // Expired baseline reports remain separate from a fresh observation.
  const target=fs.existsSync(file)?file.replace('.json','-'+Date.now()+'.json'):file;fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
 }finally{await page.close()}
}
