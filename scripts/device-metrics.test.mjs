import test from 'node:test';
import assert from 'node:assert/strict';
import {deviceMetrics,deviceAgent} from './production/device-metrics.mjs';
import {BrowserPage} from './production/browser.mjs';
test('a desktop-to-phone switch changes physical orientation as well as CSS dimensions',async()=>{
 const calls=[],target={send:async()=>({product:'Chrome/155.0.1.2'}),page:async(method,params)=>calls.push({method,params})};
 await BrowserPage.prototype.viewport.call(target,1440,900);await BrowserPage.prototype.viewport.call(target,390,844);
 const dimensions=calls.filter(c=>c.method==='Emulation.setDeviceMetricsOverride').map(c=>c.params);
 assert.deepEqual(dimensions[0].screenOrientation,{type:'landscapePrimary',angle:90});
 assert.deepEqual(dimensions[1],deviceMetrics(390,844));
 assert.equal(dimensions[1].screenWidth,390);assert.equal(dimensions[1].screenHeight,844);assert.equal(dimensions[1].mobile,true);
 assert.equal(calls.filter(c=>c.method==='Emulation.setTouchEmulationEnabled').at(-1).params.enabled,true);
 assert.deepEqual(deviceMetrics(390,844,2).screenOrientation,{type:'portraitPrimary',angle:0});
 assert.throws(()=>deviceMetrics(0,844));assert.throws(()=>deviceMetrics(390,NaN));
 const agents=calls.filter(c=>c.method==='Emulation.setUserAgentOverride').map(c=>c.params);
 assert.equal(agents[0].userAgent,'');assert.equal(agents[1].userAgentMetadata.mobile,true);assert.match(agents[1].userAgent,/Chrome\/155\.0\.1\.2 Mobile/);
 await BrowserPage.prototype.viewport.call(target,1440,900);assert.deepEqual(calls.filter(c=>c.method==='Emulation.setUserAgentOverride').at(-1).params,{userAgent:''});
 assert.throws(()=>deviceAgent({},390),/actual task browser version/);
});
