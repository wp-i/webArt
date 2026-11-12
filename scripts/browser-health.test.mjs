import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBrowserHealth} from './production/browser-health.mjs';
test('a ten-frame blank animation stops before page QA without loosening page performance limits',()=>{
 const bad={visibility:'visible',rafSamples:17,rafP95Ms:101,rafP99Ms:146};assert.throws(()=>validateBrowserHealth(bad),error=>error.code==='browser-environment-unfit');
 const good={visibility:'visible',rafSamples:120,rafP95Ms:10,rafP99Ms:12};assert.equal(validateBrowserHealth(good),good);
 assert.throws(()=>validateBrowserHealth({...good,visibility:'hidden'}));assert.throws(()=>validateBrowserHealth({...good,rafSamples:0}));
});
