import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getShowcase } from './showcase.mjs';
import {deviceMetrics,deviceAgent} from './production/device-metrics.mjs';
import {preparePreview} from './production/showcase-readiness.mjs';

const [endpoint, origin = 'http://127.0.0.1:4180', evidenceOutput = 'docs/evidence/000-collection'] = process.argv.slice(2);
if (!endpoint?.startsWith('ws://127.0.0.1:') || !origin.startsWith('http://127.0.0.1:')) throw new Error('Local QA only');
const output = path.resolve(evidenceOutput);
if(!output.startsWith(path.resolve('docs/evidence')+path.sep))throw new Error('Showcase evidence must remain in docs/evidence');
const items = getShowcase(), expectedIds = JSON.stringify(items.map(item => item.id));
const expectedNumbers = JSON.stringify(items.map((_, index) => String(index + 1)));
const lastId = items.at(-1).id;
fs.mkdirSync(output, { recursive: true });
const report = { started: new Date().toISOString(), checks: {}, previews: [], downloads: [], errors: [] };
const browser = new WebSocket(endpoint);
const pending = new Map();
let serial = 0, sessionId, targetId, scriptsDisabled = false;
const send = (method, params = {}, session) => new Promise((resolve, reject) => {
  const id = ++serial;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
  pending.set(id, { resolve, reject, timer });
  browser.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }));
});
browser.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const task = pending.get(message.id);
    if (!task) return;
    clearTimeout(task.timer); pending.delete(message.id);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  } else if (message.sessionId === sessionId && message.method === 'Runtime.exceptionThrown') report.errors.push(message.params.exceptionDetails);
  else if (message.sessionId === sessionId && message.method === 'Network.loadingFailed' && !message.params.canceled && !(scriptsDisabled && message.params.type === 'Script' && message.params.blockedReason === 'csp')) report.errors.push(message.params);
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };
const page = (method, params = {}) => send(method, params, sessionId);
const evaluate = async expression => {
  const result = await page('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
async function wait(expression) { for (let attempt = 0; attempt < 90; attempt++) { if (await evaluate(expression)) return; await sleep(80); } throw new Error(`Not ready: ${expression}`); }
async function navigate(url) { const before = await evaluate('performance.timeOrigin'); await page('Page.navigate', { url }); await wait(`performance.timeOrigin !== ${before} && document.readyState === "complete" && document.fonts.status === "loaded"`); await sleep(60); }
async function reload() { const before = await evaluate('performance.timeOrigin'); await page('Page.reload'); await wait(`performance.timeOrigin !== ${before} && document.readyState === "complete" && document.fonts.status === "loaded" && document.body.dataset.galleryReady === "true"`); }
let deviceBrowserVersion;
async function viewport(width, height, touch = false) { deviceBrowserVersion??=await send('Browser.getVersion');await page('Emulation.setUserAgentOverride',deviceAgent(deviceBrowserVersion,width));await page('Emulation.setDeviceMetricsOverride', deviceMetrics(width,height)); await page('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: 1 }); }
async function position(selector) { return evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(selector, touch = false) {
  const point = await position(selector);
  if (touch) { await page('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, radiusX: 4, radiusY: 4, force: 1 }] }); await page('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
  else { await page('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 }); await page('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 }); }
  await sleep(70);
}
async function key(key, code, vk, modifiers = 0) { await page('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers, ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) }); await page('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers }); }
const visible = () => evaluate('[...document.querySelectorAll(".work:not([hidden])")].map(e=>e.dataset.id)');
async function capture(name) { const shot = await page('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(shot.data, 'base64')); }
async function readyPreview() {
  const warmup = await preparePreview({evaluate,page,wait,sleep});
  if (warmup) (report.checks.previewWarmups??=[]).push({id:await evaluate('new URL(location.href).searchParams.get("id")'),...warmup});
}
const deadline = setTimeout(() => { console.error('Functional QA deadline'); process.exit(2); }, 120000);

try {
  await new Promise((resolve, reject) => { browser.addEventListener('open', resolve, { once: true }); browser.addEventListener('error', reject, { once: true }); });
  ({ targetId } = await send('Target.createTarget', { url: 'about:blank' }));
  ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
  await page('Page.enable'); await page('Runtime.enable'); await page('Network.enable'); await page('Page.bringToFront');
  await viewport(1440, 900); await navigate(origin + '/');
  assert(JSON.stringify(await visible()) === expectedIds, 'Default order');
  assert(await evaluate('!document.querySelector(".collection-tools,#search,#sort,[data-filter],.empty-state,.work-category") && !document.body.innerText.includes("试作")'), 'No removed controls or trial badges');
  assert(JSON.stringify(await evaluate('[...document.querySelectorAll(".work-number")].map(e=>e.textContent)')) === expectedNumbers, 'Continuous presentation numbers');
  await navigate(origin + '/?category=old&q=Sill&sort=newest&campaign=qa#collection');
  assert(await evaluate('location.search === "?campaign=qa" && location.hash === "#collection"'), 'Remove only obsolete parameters');
  assert(JSON.stringify(await visible()) === expectedIds, 'Legacy controls cannot filter or reorder');
  await reload();
  assert((await visible()).length === items.length, 'Complete gallery survives reload');
  report.checks.removedControlsAndLegacyParameters = true;
  await navigate(origin + '/');
  await evaluate('document.querySelector("[data-open-info]").focus()');
  await key('Tab', 'Tab', 9);
  assert(await evaluate('document.activeElement.matches(".work-preview")'), 'Keyboard reaches first preview');
  await capture('preview-link-focus-desktop');
  await key('Enter', 'Enter', 13); await readyPreview();
  assert(await evaluate('new URL(location.href).searchParams.get("id")==="001"'), 'Keyboard opens first original');
  await click('#back'); await wait('document.body.dataset.galleryReady === "true"');
  const hoverPoint = await position('.work-preview');
  await page('Input.dispatchMouseEvent', { type: 'mouseMoved', ...hoverPoint });
  await sleep(250); await capture('preview-link-hover-desktop');
  const before = { url: await evaluate('location.pathname+location.search') };
  const point = await position('.work[data-id="006"] .work-preview');
  before.scroll = await evaluate('scrollY');
  await page('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await page('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  await wait('location.pathname === "/preview.html"'); await readyPreview();
  await click('#back'); await wait('document.body.dataset.galleryReady === "true"');
  await wait('Math.abs(scrollY-' + before.scroll + ')<3');
  assert(await evaluate('location.pathname+location.search') === before.url, 'Return URL restore');
  assert(JSON.stringify(await visible()) === expectedIds, 'Return preserves complete collection order');
  report.checks.returnRestores = before;
  await navigate(origin + '/'); await click('[data-open-info]');
  assert(await evaluate('document.querySelector("#download-info").open'), 'Download instructions navigation');
  await capture('instructions-open-desktop');
  await evaluate('document.querySelector("#download-info summary").focus()');
  await key('Enter', 'Enter', 13);
  assert(await evaluate('!document.querySelector("#download-info").open'), 'Keyboard disclosure');
  report.checks.keyboardAndDisclosure = true;
  report.checks.touchViewports = [];
  for (const width of [390, 320]) {
    await viewport(width, 844, true); await navigate(origin + '/?category=old&q=Sill&sort=newest');
    assert(await evaluate('location.search === ""') && (await visible()).length === items.length, 'Mobile ignores old controls');
    await evaluate('window.__touchEvidence=[];document.addEventListener("pointerdown",e=>window.__touchEvidence.push({trusted:e.isTrusted,type:e.pointerType}))');
    await click('[data-open-info]', true);
    assert(await evaluate('document.querySelector("#download-info").open'), 'Touch opens instructions');
    await capture('instructions-open-' + width);
    await click('#download-info summary', true);
    assert(await evaluate('!document.querySelector("#download-info").open'), 'Touch closes instructions');
    const touchEvidence = await evaluate('window.__touchEvidence');
    assert(touchEvidence.length >= 2 && touchEvidence.every(event => event.trusted && event.type === 'touch'), 'Trusted touch actions');
    assert(await evaluate('innerWidth') === width && !await evaluate('document.documentElement.scrollWidth>innerWidth'), 'Exact mobile viewport without overflow or auto zoom');
    await click('.work[data-id="006"] .work-preview', true); await readyPreview();
    assert(await evaluate('new URL(location.href).searchParams.get("id")==="006"'), 'Touch opens correct original');
    report.checks.touchViewports.push({ width, trustedTouch: true, legacyParametersIgnored: true, preview: '006' });
  }

  for (const item of items) {
    await viewport(1440, 900); await navigate(`${origin}/preview.html?id=${item.id}`); await readyPreview();
    assert(await evaluate('document.querySelector("#preview-title").textContent') === item.title, 'Viewer title');
    assert(await evaluate('!document.body.innerText.includes("试作")'), 'Viewer has no trial badge');
    const measurements = [];
    for (const [device, width] of [['desktop', 1440], ['tablet', 768], ['mobile', 390]]) {
      await click(`[data-device="${device}"]`);
      await wait(`document.querySelector('#preview-frame').contentWindow.innerWidth===${width}`);
      await readyPreview();
      const state = await evaluate(`(()=>{const w=document.querySelector('#preview-frame').contentWindow,d=w.document;return{device:${JSON.stringify(device)},width:w.innerWidth,overflow:d.documentElement.scrollWidth>w.innerWidth,missing:[...d.images].filter(i=>!i.complete||!i.naturalWidth).length,fonts:[...d.fonts].map(f=>({family:f.family,status:f.status})),title:d.title}})()`);
      report.currentPreview = { id: item.id, ...state };
      assert(!state.overflow && !state.missing && state.fonts.some(font => font.status === 'loaded') && state.fonts.every(font => font.status !== 'loading' && font.status !== 'error'), `Preview resources/overflow ${item.id}/${device}`);
      measurements.push(state);
      if (device !== 'tablet') await capture(`preview-${item.id}-${device}`);
    }
    if (item.id === '001') {
      await evaluate('document.querySelector("#back").focus()');
      await key('Tab', 'Tab', 9); await key('Tab', 'Tab', 9); await key('Enter', 'Enter', 13);
      await wait('document.querySelector("#preview-frame").contentWindow.innerWidth===768');
      assert(await evaluate('document.activeElement.dataset.device === "tablet" && document.activeElement.getAttribute("aria-pressed") === "true"'), 'Keyboard preview device choice');
      await capture('preview-device-focus-desktop');
    }
    await viewport(390, 844, true);
    await wait('document.querySelector("#preview-frame").contentWindow.innerWidth===390');
    await readyPreview();
    assert(!await evaluate('document.documentElement.scrollWidth>innerWidth'), 'Mobile toolbar overflow');
    await capture(`preview-${item.id}-touch`);
    report.previews.push({ id: item.id, states: measurements, mobileToolbar: 'passed' });
  }
  await viewport(320, 844, true); await navigate(`${origin}/preview.html?id=001`); await readyPreview();
  assert(!await evaluate('document.documentElement.scrollWidth>innerWidth'), 'Narrow toolbar overflow');
  await capture('preview-narrow');
  await viewport(1440, 900); await navigate(`${origin}/preview.html?id=unknown`);
  assert(await evaluate('!document.querySelector(".preview-fallback").hidden && document.querySelector(".preview-toolbar").hidden'), 'Invalid preview ID');
  await capture('preview-invalid');
  report.checks.invalidPreview = true;
  await page('Emulation.setScriptExecutionDisabled', { value: true }); scriptsDisabled = true;
  await navigate(origin + '/');
  assert(await evaluate('[...document.querySelectorAll(".work-preview")].every(a=>a.getAttribute("href").startsWith("/designs/"))'), 'No-script original links');
  await evaluate('document.querySelector("#download-info summary").focus()'); await key('Enter', 'Enter', 13);
  assert(await evaluate('document.querySelector("#download-info").open'), 'No-script instructions');
  await navigate(`${origin}/preview.html?id=001`);
  assert(await evaluate(`document.querySelectorAll(".preview-fallback li").length===${items.length}`), 'No-script viewer fallback');
  await capture('preview-no-script');
  await page('Emulation.setScriptExecutionDisabled', { value: false }); scriptsDisabled = false;
  report.checks.noScript = true;
  await viewport(390, 844, true); await navigate(origin + '/');
  await evaluate('window.__touchEvidence=[];document.addEventListener("pointerdown",e=>window.__touchEvidence.push({trusted:e.isTrusted,type:e.pointerType}))');
  assert((await visible()).length === items.length, 'Touch catalog shows every work');
  await click(`.work[data-id="${lastId}"] .work-preview`, true); await readyPreview();
  report.checks.trustedTouch = true;

  const downloadsDir = path.resolve('.webart/showcase-download-check');
  fs.mkdirSync(downloadsDir, { recursive: true });
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadsDir });
  await viewport(1440, 900); await navigate(origin + '/');
  for (const item of items) {
    await click(`.work[data-id="${item.id}"] .work-download`);
    const archive = path.join(downloadsDir, `${item.slug}-source.zip`);
    for (let n = 0; n < 100 && !fs.existsSync(archive); n++) await sleep(80);
    assert(fs.existsSync(archive), `Native download missing: ${item.id}`);
    const bytes = fs.readFileSync(archive);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    assert(bytes.length === item.bytes && sha256 === item.sha256, `Native download mismatch: ${item.id}`);
    report.downloads.push({ id: item.id, bytes: bytes.length, sha256, nativeClick: true });
    assert(path.resolve(archive).startsWith(downloadsDir + path.sep), 'Download cleanup path');
    fs.unlinkSync(archive);
  }
  await send('Browser.setDownloadBehavior', { behavior: 'default' });
  assert(!report.errors.length, 'Runtime or network error');
  report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.failure = error.message; process.exitCode = 1;
  if (sessionId) { report.failureState = await evaluate('({url:location.href,text:document.body.innerText.slice(0,900)})').catch(() => null); await capture('functional-failure').catch(() => {}); }
} finally {
  report.finished = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'functional.json'), JSON.stringify(report, null, 2) + '\n');
  fs.appendFileSync(path.join(output, 'functional-attempts.jsonl'), JSON.stringify({ started: report.started, finished: report.finished, result: report.result, failure: report.failure, errors: report.errors.length }) + '\n');
  console.log(JSON.stringify({ result: report.result, failure: report.failure, checks: report.checks, previews: report.previews.length, downloads: report.downloads.length, errors: report.errors }));
  if (targetId) await send('Target.closeTarget', { targetId }).catch(() => {});
  browser.close(); clearTimeout(deadline);
}
