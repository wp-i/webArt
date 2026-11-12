// Isolated engineering fixture: real WebGL failures, never a produced design.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {ROOT} from './collection.mjs';
import {hash} from './production/api.mjs';
import {serveDirectory} from './production/project.mjs';
import {browserEndpoint} from './production/process.mjs';
import {inspectRenderingFallback} from './production/browser.mjs';
import {validateFallbackCapture} from './production/rendering.mjs';

const directory=fs.mkdtempSync(path.join(os.tmpdir(),'webart-rendering-fixture-'));
const output='docs/evidence/redo-v2/static-pipeline/rendering-fixture';
const html=`<!doctype html><meta name="viewport" content="width=device-width"><title>WebGL failure engineering fixture</title><style>*{box-sizing:border-box}body{margin:0;font:16px Arial;color:#222;background:#eee}[hidden]{display:none!important}canvas{position:fixed;inset:0;width:100%;height:100%}section{height:100vh;padding:40px 24px}section:nth-child(2){background:#ddd}section:nth-child(3){background:#ccc}section:nth-child(4){background:#bbb}h1,h2{font-size:32px;max-width:100%;overflow-wrap:anywhere}</style><canvas data-renderer width="32" height="32"></canvas><main data-render-fallback hidden><section><h1>Engineering fallback</h1><p>Content remains available without WebGL.</p></section><section><h2>Transition</h2><p>Native vertical content.</p></section><section><h2>Middle</h2><p>No empty rendering area.</p></section><section><h2>Ending</h2><p>End of the engineering test.</p></section></main><script src="fixture.js"></script>`;
const js=`const canvas=document.querySelector('canvas'),fallback=document.querySelector('[data-render-fallback]');function showFallback(){canvas.hidden=true;fallback.hidden=false;window.__webartRendering='fallback'}let gl;try{gl=canvas.getContext('webgl2')}catch{}if(!gl)showFallback();else{gl.clearColor(.12,.16,.18,1);gl.clear(gl.COLOR_BUFFER_BIT);window.__webartReady=true;if(!new URLSearchParams(location.search).has('without-loss-handler'))canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();showFallback()})}`;
const sourceSha256=hash(Buffer.from(html+js));
const plan={rendering:{mode:'local-3d',canvasSelector:'canvas[data-renderer]',fallback:{selector:'[data-render-fallback]',ready:"window.__webartRendering==='fallback'"}},prototypeCapture:{ready:'window.__webartReady===true',states:{opening:0,transition:.33,middle:.66,ending:1}}};
let host;
try{
 fs.writeFileSync(path.join(directory,'index.html'),html);fs.writeFileSync(path.join(directory,'fixture.js'),js);
 host=await serveDirectory(directory);const endpoint=await browserEndpoint({root:ROOT});
 const result=await inspectRenderingFallback({root:ROOT,endpoint,url:host.url,output,plan});result.sourceSha256=sourceSha256;validateFallbackCapture(result,sourceSha256);
 result.engineeringFixtureOnly=true;result.visualAdmission=false;fs.writeFileSync(path.join(ROOT,output,'rendering.json'),JSON.stringify(result,null,2));
 await assert.rejects(inspectRenderingFallback({root:ROOT,endpoint,url:host.url+'?without-loss-handler=1',output:output+'/negative-missing-handler',plan}),error=>error.code==='rendering-failed');
 const negative=JSON.parse(fs.readFileSync(path.join(ROOT,output,'negative-missing-handler/rendering.json'),'utf8'));assert.equal(negative.result,'failed-rendering-fallback');assert.equal(negative.checks.length,3);
 const receipt={observedAt:new Date().toISOString(),result:'passed-engineering-only',realFailureCases:result.checks.map(c=>({mode:c.mode,width:c.width,triggered:c.trigger.observed,states:c.states.length})),missingLossHandler:'correctly-blocked',realModelCalls:0,visualAdmission:false};
 fs.writeFileSync(path.join(ROOT,output,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{
 if(host)await new Promise(resolve=>host.server.close(resolve));
 const absolute=path.resolve(directory);if(!absolute.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(absolute).startsWith('webart-rendering-fixture-'))throw Error('Unsafe fixture cleanup target');fs.rmSync(absolute,{recursive:true,force:true});
}
