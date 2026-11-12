import fs from 'node:fs';import path from 'node:path';
import {ROOT,child} from './collection.mjs';
import {BrowserPage} from './production/browser.mjs';
import {browserEndpoint} from './production/process.mjs';
import {measurePaintedImages,assertPaintedImages} from './production/painted-images.mjs';
const base='docs/evidence/publication/api-20261018123549107-2c14d5a7',report={checks:[],result:'running'};
const page=await BrowserPage.create(await browserEndpoint({root:ROOT}));
try{
 for(const [width,height,name] of [[1440,900,'desktop'],[2048,912,'wide'],[768,1024,'tablet'],[390,844,'mobile'],[320,844,'narrow']]){
  await page.viewport(width,height);await page.navigate('http://127.0.0.1:4180/');
  await page.evaluate('Promise.all([...document.images].map(i=>i.decode()))');
  for(const attempt of (name==='tablet'||name==='narrow'?['02','03']:['03'])){
   const file=`${base}/attempt-${attempt}/${name}-full.png`,bytes=fs.readFileSync(child(ROOT,file));
   const images=await page.evaluate(`(${measurePaintedImages.toString()})(${JSON.stringify('data:image/png;base64,'+bytes.toString('base64'))},'.work-preview img')`);
   const expected=attempt==='02'?'missing-image':'all-painted';let actual='all-painted';try{assertPaintedImages(images)}catch{actual='missing-image'}
   if(actual!==expected)throw Error(name+'/'+attempt+': unexpected painting result');
   report.checks.push({file,expected,actual,images});
  }
 }
 report.result='passed-actual-counterexamples-and-complete-captures';
}finally{await page.close();fs.writeFileSync(child(ROOT,base+'/paint-check.json'),JSON.stringify(report,null,2)+'\n')}
console.log(JSON.stringify({result:report.result,checks:report.checks.length}));
