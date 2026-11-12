import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {CachedCodexCliReviewClient} from './production/cached-cli-review.mjs';
import {disabledCliFeatures} from './production/cli-review.mjs';
import {calibrationSchema, styleReviewSchema} from './production/schemas.mjs';
import {imageInput, hash} from './production/api.mjs';
import {consumeCliReview} from './production/review-consumption.mjs';

// Every subprocess is this deterministic local fixture. No Codex executable,
// model, browser, visual judgement or admission is exercised by these tests.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jShoAAAAASUVORK5CYII=', 'base64');
const write = (file, value) => fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const fingerprint = file => hash(fs.readFileSync(file));
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const fixtureSource = `import fs from 'node:fs';
const [counter, mode, answer, ...args] = process.argv.slice(2);
if(args.includes('--version')) { console.log('codex-cli controlled-cache-fixture'); process.exit(0); }
if(args.includes('features')) { for(const name of ${JSON.stringify(disabledCliFeatures)}) console.log(name+' stable false'); console.log('skip_host_skill_discovery experimental true'); console.log('unified_exec stable true'); process.exit(0); }
fs.writeFileSync(counter, String(Number(fs.readFileSync(counter, 'utf8'))+1));
for await(const bytes of process.stdin) {}
if(mode==='deadline') { setInterval(()=>{},1000); }
else {
 fs.writeFileSync(args[args.indexOf('--output-last-message')+1], answer);
 const events=[{type:'thread.started',thread_id:'controlled-cache-thread'},{type:'turn.started'}];
 if(mode==='tool') events.push({type:'item.completed',item:{id:'item_8',type:'command_execution',command:'forbidden'}});
 if(mode==='unknown-error') events.push({type:'error',message:'unrecognized controlled runtime error'});
 events.push({type:'item.completed',item:{id:'item_0',type:'agent_message',text:answer}});
 events.push({type:'turn.completed',usage:{input_tokens:7,output_tokens:3},...(mode==='observed-model'?{model:'controlled-observed-model'}:{})});
 for(const event of events) console.log(JSON.stringify(event));
}`;
let sequence = 0;

function setup(t, options = {}) {
  const base = path.join(root, '.webart', `cached-cli-test-${process.pid}-${++sequence}`);
  fs.mkdirSync(base, {recursive: true});
  const fixture = path.join(base, 'fixture.mjs'), counter = path.join(base, 'calls.txt');
  write(fixture, fixtureSource); write(counter, '0');
  const calls = [], packets = new Set(), usage = [], reuse = [];
  const role = options.role ?? 'calibration';
  const raw = role === 'style-review'
    ? {decision: 'reject', nearestId: '006', openingAndAssetBothRepeated: true, comparisons: ['composition', 'typography', 'color-media', 'rhythm'].map(dimension => ({dimension, different: false, finding: 'Controlled fixture; no visual admission.'}))}
    : {labels: [{label: 'A', verdict: 'below-benchmark', finding: 'Controlled transport fixture; no art judgement.'}]};
  const imageFiles = [], images = [], frames = [], states = [];
  const definitions = role === 'style-review'
    ? ['candidate', 'existing'].flatMap(frameRole => ['desktop', 'mobile'].flatMap(viewport => ['opening', 'transition', 'middle', 'ending'].map(state => ({frameRole, viewport, state}))))
    : [{frameRole: 'sample', viewport: 'desktop', state: 'opening'}, {frameRole: 'sample', viewport: 'mobile', state: 'ending'}];
  for (const [index, item] of definitions.entries()) {
    const image = path.join(base, `source-${index}.png`), id = item.frameRole + '-' + index;
    write(image, Buffer.concat([png, Buffer.from('controlled frame ' + index)])); imageFiles.push(image);
    const label = `${item.frameRole === 'existing' ? '006 ' : ''}${item.viewport} ${item.state}`;
    images.push(...imageInput(image, id + ' ' + label));
    frames.push({id, role: item.frameRole, label, path: relative(image), sha256: fingerprint(image)});
    if (item.frameRole === 'existing') states.push({viewport: item.viewport, state: item.state, path: relative(image), sha256: fingerprint(image)});
  }
  const input = {role, instructions: 'Read only attached evidence.', text: role === 'style-review' ? JSON.stringify({otherIds: ['006']}) : 'Controlled fixture; no art approval.', images, schema: structuredClone(role === 'style-review' ? styleReviewSchema : calibrationSchema)};
  const mode = {value: options.mode ?? 'complete'};
  const spawnImpl = (executable, args, settings) => {
    calls.push({executable, args, settings});
    if (args.includes('--cd')) packets.add(args[args.indexOf('--cd') + 1]);
    return spawn(process.execPath, [fixture, counter, mode.value, JSON.stringify(raw), ...args], settings);
  };
  const common = {root, directory: relative(path.join(base, 'cli-review')), executable: 'controlled-cli', spawnImpl, deadlineMs: 5000, maxOutputBytes: 64000, maxRequests: 1, onUsage: value => usage.push(value), onReuse: value => reuse.push(value), ...options};
  const makeClient = overrides => new CachedCodexCliReviewClient({...common, ...overrides});
  const client = makeClient();
  const context = {reviewerId: 'controlled-cache-fixture', calibrationRunId: 'controlled-calibration', sourceSha256: 'a'.repeat(64), frames, comparisonCohort: [{id: '006', sourceSha256: '6'.repeat(64), states}]};
  t.after(() => {
    for (const packet of packets) {
      const resolved = path.resolve(packet), tempPrefix = path.join(fs.realpathSync(os.tmpdir()), 'webart-cli-evidence-');
      assert.ok(resolved.startsWith(tempPrefix)); fs.rmSync(resolved, {recursive: true, force: true});
    }
    const resolved = path.resolve(base), prefix = path.join(root, '.webart', 'cached-cli-test-');
    assert.ok(resolved.startsWith(prefix)); fs.rmSync(resolved, {recursive: true, force: true});
  });
  return {base, input, client, makeClient, imageFiles, calls, usage, reuse, raw, mode, context, count: () => Number(fs.readFileSync(counter, 'utf8'))};
}

function rawFiles(client) {
  const directory = client.lastAttempt.directory;
  return {directory, request: path.join(directory, 'request.json'), receipt: path.join(directory, 'receipt.json'), response: path.join(directory, 'response.json'), events: path.join(directory, 'events.jsonl')};
}
function changeJson(file, change) { const value = read(file); change(value); write(file, value); }
function rehashRequest(files) { changeJson(files.receipt, receipt => receipt.requestSha256 = fingerprint(files.request)); }
function editEvents(files, change) { const events = fs.readFileSync(files.events, 'utf8').trim().split('\n').map(JSON.parse); change(events); write(files.events, events.map(JSON.stringify).join('\n') + '\n'); }
async function rejectedWithoutCalls(f, client = f.makeClient(), input = f.input, code) {
  const before = f.calls.length, count = f.count();
  await assert.rejects(client.json(input), code ? {code} : undefined);
  assert.equal(f.calls.length, before); assert.equal(f.count(), count);
  assert.equal(client.lastReviewReceipt, undefined); assert.equal(client.reviewerMetadata.contextIsolated, false); assert.equal(client.reviewerMetadata.actualModel, null);
}

test('exact duplicate and a resumed client replay original result with one retained invocation', async t => {
  const f = setup(t), first = await f.client.json(f.input), files = rawFiles(f.client);
  const receiptBytes = fs.readFileSync(files.receipt), requestBytes = fs.readFileSync(files.request), actualReceipt = {...f.client.lastReviewReceipt};
  assert.deepEqual(first, f.raw); assert.equal(f.count(), 1); assert.equal(f.calls.length, 3);
  first.labels[0].verdict = 'benchmark';
  assert.deepEqual(await f.client.json(f.input), f.raw);
  const resumed = f.makeClient(); assert.equal(resumed.requests, 1);
  assert.deepEqual(await resumed.json(f.input), f.raw); assert.equal(resumed.lastAttempt.reused, true); assert.equal(resumed.requests, 1);
  assert.deepEqual(resumed.lastReviewReceipt, actualReceipt); assert.equal(f.calls.length, 3); assert.equal(f.count(), 1);
  assert.equal(f.usage.length, 1); assert.deepEqual(f.usage[0].usage, {input_tokens: 7, output_tokens: 3}); assert.equal(f.reuse.length, 2);
  for (const item of f.reuse) {
    assert.equal(item.newCliInvocations, 0); assert.equal(item.newModelCalls, 0); assert.equal(item.originalCliInvocations, 1); assert.equal(item.backendRequestCount, null);
    assert.equal(item.independent, false); assert.equal(item.actualModel, null); assert.equal(item.toolsObserved, 0); assert.equal(item.visualAdmissionGranted, false);
    assert.equal(item.originalCompletedAt, read(files.receipt).completedAt);
  }
  assert.deepEqual(fs.readFileSync(files.receipt), receiptBytes); assert.deepEqual(fs.readFileSync(files.request), requestBytes);
});

test('raw receipt is restored after consumption, and duplicate consumption retains one canonical receipt', async t => {
  const f = setup(t, {role: 'style-review'});
  await f.client.json(f.input); const rawReceipt = {...f.client.lastReviewReceipt};
  const report = consumeCliReview({root, client: f.client, role: f.input.role, context: f.context, report: {decision: 'distinct'}});
  assert.equal(report.decision, 'reject'); assert.notDeepEqual(f.client.lastReviewReceipt, rawReceipt);
  const consumedReceipt = {...f.client.lastReviewReceipt}, bytes = fs.readFileSync(path.resolve(root, consumedReceipt.path));
  await f.client.json(f.input); assert.deepEqual(f.client.lastReviewReceipt, rawReceipt);
  const replayed = consumeCliReview({root, client: f.client, role: f.input.role, context: f.context, report: {...report, decision: 'distinct'}});
  assert.equal(replayed.decision, 'reject'); assert.deepEqual(replayed.reviewReceipt, consumedReceipt);
  assert.deepEqual(fs.readFileSync(path.resolve(root, consumedReceipt.path)), bytes); assert.equal(f.count(), 1); assert.equal(f.usage.length, 1); assert.equal(f.reuse.length, 1);
});

test('pending matching attempt stops before any subprocess, including after resume', async t => {
  const f = setup(t, {onPending: () => { throw new Error('Controlled interruption before subprocess launch'); }});
  await assert.rejects(f.client.json(f.input)); const files = rawFiles(f.client);
  fs.unlinkSync(path.join(files.directory, 'failure.json'));
  assert.equal(f.count(), 0); assert.equal(f.calls.length, 0);
  await rejectedWithoutCalls(f, f.makeClient(), f.input, 'review-pending');
});

for (const mode of ['unknown-error', 'tool']) test('failed ' + mode + ' matching attempt is never retried', async t => {
  const f = setup(t, {mode}); await assert.rejects(f.client.json(f.input));
  assert.equal(f.count(), 1); assert.equal(f.usage.length, 0);
  await rejectedWithoutCalls(f, f.makeClient(), f.input, 'cli-review-cached-attempt-failed');
});

test('cancelled matching attempt and unfinished directories cannot create another invocation', async t => {
  const f = setup(t, {onPending: () => { throw new Error('Controlled cancellation'); }});
  await assert.rejects(f.client.json(f.input)); const files = rawFiles(f.client);
  changeJson(path.join(files.directory, 'failure.json'), failure => failure.failure = {code: 'cli-review-interrupted', message: 'Controlled cancellation'});
  await rejectedWithoutCalls(f, f.makeClient(), f.input, 'cli-review-cached-attempt-failed');
  fs.unlinkSync(path.join(files.directory, 'failure.json')); fs.unlinkSync(files.request);
  await rejectedWithoutCalls(f, f.makeClient(), {...f.input, text: 'Genuinely changed prompt'}, 'review-pending'); assert.equal(f.count(), 0);
});

test('changed prompt makes one genuinely new bounded invocation and old attempts consume the resumed budget', async t => {
  const f = setup(t, {maxRequests: 2}); await f.client.json(f.input);
  const resumed = f.makeClient(), changed = {...f.input, text: f.input.text + ' New evidence question.'};
  assert.equal(resumed.requests, 1); await resumed.json(changed);
  assert.equal(f.count(), 2); assert.equal(f.usage.length, 2); assert.equal(resumed.requests, 2); assert.match(resumed.lastAttempt.id, /^02-/);
  assert.deepEqual(await resumed.json(changed), f.raw); assert.equal(f.count(), 2);
  await rejectedWithoutCalls(f, f.makeClient(), {...changed, text: 'Third new question'}, 'cli-review-budget');
  assert.equal(f.usage.length, 2); assert.equal(f.reuse.length, 1);
});

test('only the configured directory is searched for reuse', async t => {
  const f = setup(t); await f.client.json(f.input);
  const other = f.makeClient({directory: relative(path.join(f.base, 'another-cli-review'))});
  assert.equal(other.requests, 0); await other.json(f.input);
  assert.equal(f.count(), 2); assert.equal(f.usage.length, 2); assert.equal(f.reuse.length, 0);
  await other.json(f.input); assert.equal(f.count(), 2); assert.equal(f.reuse.length, 1);
});

test('two matching retained attempts are ambiguous and cannot replay or launch', async t => {
  const f = setup(t, {maxRequests: 3}); await f.client.json(f.input); const first = rawFiles(f.client);
  await f.client.json({...f.input, text: 'Second controlled question'}); const second = rawFiles(f.client);
  changeJson(second.request, request => request.text = f.input.text);
  write(path.join(second.directory, 'prompt.txt'), fs.readFileSync(path.join(first.directory, 'prompt.txt'))); rehashRequest(second);
  await rejectedWithoutCalls(f, f.makeClient(), f.input, 'cli-review-cache-invalid'); assert.equal(f.count(), 2);
});

test('reuse respects the call deadline before returning an old result', async t => {
  const f = setup(t); await f.client.json(f.input); const resumed = f.makeClient();
  let checks = 0; const clock = t.mock.method(Date, 'now', () => ++checks === 1 ? 1000 : 7000);
  try { await rejectedWithoutCalls(f, resumed, f.input, 'cli-review-deadline'); }
  finally { clock.mock.restore(); }
});

for (const field of ['instructions', 'text', 'requestedModel', 'ordered labels', 'ordered images', 'image bytes']) test('exact identity binds ' + field, async t => {
  const f = setup(t); await f.client.json(f.input);
  const changed = {...f.input, images: [...f.input.images]}; let client = f.makeClient();
  if (field === 'instructions') changed.instructions += ' changed';
  if (field === 'text') changed.text += ' changed';
  if (field === 'requestedModel') client = f.makeClient({model: 'controlled-other-model'});
  if (field === 'ordered labels') changed.images[0] = {type: 'input_text', text: 'changed ordered label'};
  if (field === 'ordered images') changed.images = [...changed.images.slice(2), ...changed.images.slice(0, 2)];
  if (field === 'image bytes') { const other = path.join(f.base, 'changed.png'); write(other, Buffer.concat([png, Buffer.from('new bytes')])); changed.images = [...imageInput(other, changed.images[0].text), ...changed.images.slice(2)]; }
  await rejectedWithoutCalls(f, client, changed, 'cli-review-budget'); assert.equal(f.reuse.length, 0);
});

for (const policy of ['executable', 'deadlineMs', 'maxOutputBytes']) test('matching attempt with changed ' + policy + ' policy is not reused or relaunched', async t => {
  const f = setup(t, {maxRequests: 2}); await f.client.json(f.input);
  const override = policy === 'executable' ? 'controlled-different-cli' : policy === 'deadlineMs' ? 6000 : 65000;
  await rejectedWithoutCalls(f, f.makeClient({[policy]: override}), f.input, 'cli-review-cache-invalid');
});

for (const name of ['request.json', 'receipt.json', 'response.json', 'events.jsonl', 'stderr.txt', 'process.json', 'feature-probe.json', 'feature-probe.stdout.txt', 'feature-probe.stderr.txt', 'version.stdout.txt', 'version.stderr.txt', 'prompt.txt', 'private-source-map.json', 'inputs/000.png']) test('missing ' + name + ' fails closed with zero new calls', async t => {
  const f = setup(t); await f.client.json(f.input); const files = rawFiles(f.client);
  fs.unlinkSync(path.join(files.directory, name)); await rejectedWithoutCalls(f);
});

for (const name of ['request.json', 'receipt.json', 'response.json', 'private-source-map.json']) test('malformed ' + name + ' fails closed with zero new calls', async t => {
  const f = setup(t); await f.client.json(f.input); write(path.join(rawFiles(f.client).directory, name), '{malformed'); await rejectedWithoutCalls(f);
});

const tampering = [
  ['changed request without rehash', files => changeJson(files.request, request => request.text += ' forged')],
  ['unknown execution after request rehash', files => { changeJson(files.request, request => request.execution = 'unknown-review-mode'); rehashRequest(files); }],
  ['unknown provenance after request rehash', files => { changeJson(files.request, request => request.provenance.mode = 'unknown-review-mode'); rehashRequest(files); }],
  ['independent provenance after request rehash', files => { changeJson(files.request, request => request.provenance.independent = true); rehashRequest(files); }],
  ['weakened command restrictions after request rehash', files => { changeJson(files.request, request => request.invocation.args.push('--enable', 'shell_tool')); rehashRequest(files); }],
  ['stale diagnostic policy', files => changeJson(files.receipt, receipt => receipt.diagnosticPolicyVersion = 'unknown-policy')],
  ['promoted raw result with response rehash', files => { changeJson(files.response, result => result.labels[0].verdict = 'benchmark'); changeJson(files.receipt, receipt => receipt.responseSha256 = fingerprint(files.response)); }],
  ['unknown runtime error with event rehash', files => { editEvents(files, events => events.splice(2, 0, {type: 'error', message: 'unrecognized transport error'})); changeJson(files.receipt, receipt => receipt.eventsSha256 = fingerprint(files.events)); }],
  ['observed tool with event rehash', files => { editEvents(files, events => events.splice(2, 0, {type: 'item.completed', item: {id: 'item_7', type: 'mcp_tool_call', name: 'forbidden'}})); changeJson(files.receipt, receipt => receipt.eventsSha256 = fingerprint(files.events)); }],
  ['effective feature claim with probe rehash', files => { const probe = path.join(files.directory, 'feature-probe.json'); changeJson(probe, value => value.effectiveFeatures.shell_tool = true); changeJson(files.receipt, receipt => receipt.featureProbe.sha256 = fingerprint(probe)); }],
  ['feature stdout unknown diagnostic', files => fs.appendFileSync(path.join(files.directory, 'feature-probe.stdout.txt'), 'unknown error\n')],
  ['forged actual model', files => changeJson(files.receipt, receipt => receipt.provenance.actualModel = 'invented-model')],
  ['forged original usage', files => changeJson(files.receipt, receipt => receipt.usage.input_tokens = 0)],
  ['forged invocation count', files => changeJson(files.receipt, receipt => receipt.cliInvocations = 0)],
  ['forged visual admission', files => changeJson(files.receipt, receipt => receipt.visualAdmissionGranted = true)],
  ['copied receipt path', files => changeJson(files.receipt, receipt => receipt.requestFile = receipt.requestFile.replace('/cli-review/', '/another-review/').replace('\\cli-review\\', '\\another-review\\'))],
  ['impossible completion time', files => changeJson(files.receipt, receipt => receipt.completedAt = '2000-01-01T00:00:00.000Z')],
];
for (const [name, mutate] of tampering) test(name + ' cannot become a replayed result', async t => {
  const f = setup(t); await f.client.json(f.input); mutate(rawFiles(f.client)); await rejectedWithoutCalls(f);
});

test('original source and retained image SHA mismatches block reuse', async t => {
  for (const original of [true, false]) {
    const f = setup(t); await f.client.json(f.input); const files = rawFiles(f.client);
    fs.appendFileSync(original ? f.imageFiles[0] : path.join(files.directory, 'inputs/000.png'), 'changed');
    const input = original ? {...f.input, images: [...imageInput(f.imageFiles[0], f.input.images[0].text), ...f.input.images.slice(2)]} : f.input;
    await rejectedWithoutCalls(f, f.makeClient(), input);
  }
});

test('identical pixels at another original source path cannot drift into the old receipt', async t => {
  const f = setup(t, {maxRequests: 2}); await f.client.json(f.input);
  const copy = path.join(f.base, 'same-pixels.png'); write(copy, fs.readFileSync(f.imageFiles[0]));
  await rejectedWithoutCalls(f, f.makeClient(), {...f.input, images: [...imageInput(copy, f.input.images[0].text), ...f.input.images.slice(2)]}, 'cli-review-cache-invalid');
});

test('new call after an observed model starts with clean provenance', async t => {
  const f = setup(t, {maxRequests: 2, mode: 'observed-model'}); await f.client.json(f.input);
  assert.equal(f.client.reviewerMetadata.actualModel, 'controlled-observed-model'); f.mode.value = 'complete';
  await f.client.json({...f.input, text: 'New controlled question'});
  const request = read(rawFiles(f.client).request);
  assert.equal(request.provenance.contextIsolated, false); assert.equal(request.provenance.actualModel, null); assert.equal(request.provenance.modelIdentitySource, undefined);
  assert.equal(f.client.reviewerMetadata.actualModel, null); assert.equal(f.client.reviewerMetadata.modelIdentitySource, null);
});

test('cancelled reuse and malformed or weakened inputs launch no subprocess', async t => {
  const f = setup(t); await f.client.json(f.input); const controller = new AbortController(); controller.abort();
  await rejectedWithoutCalls(f, f.makeClient({signal: controller.signal}), f.input, 'cli-review-interrupted');
  for (const input of [
    {...f.input, schema: {type: 'object'}}, {...f.input, search: true}, {...f.input, role: 'unknown'},
    {...f.input, images: []}, {...f.input, images: [null]}, {...f.input, images: f.input.images.slice(1)},
  ]) await rejectedWithoutCalls(f, f.makeClient(), input);
});

test('unknown entries, missing ordinals and renamed attempts cannot free invocation budget', async t => {
  for (const mode of ['file', 'unknown-directory', 'renamed']) {
    const f = setup(t); await f.client.json(f.input); const files = rawFiles(f.client), parent = path.dirname(files.directory);
    if (mode === 'file') { fs.rmSync(files.directory, {recursive: true}); write(files.directory, 'replacement'); }
    if (mode === 'unknown-directory') fs.mkdirSync(path.join(parent, 'unknown'));
    if (mode === 'renamed') fs.renameSync(files.directory, path.join(parent, path.basename(files.directory).replace(/^01-/, '02-')));
    assert.throws(() => f.makeClient(), {code: 'cli-review-cache-invalid'}); assert.equal(f.count(), 1);
  }
});

test('cache directory configuration is exact, project relative and private', t => {
  const f = setup(t);
  for (const directory of ['private-artifacts', '.webart/a/../b', '.webart/a//b', '.webart/a/', path.join(f.base, 'absolute')]) assert.throws(() => f.makeClient({directory}), {code: 'cli-review-cache-configuration'});
  assert.throws(() => f.makeClient({onReuse: true}), {code: 'cli-review-cache-configuration'}); assert.equal(f.calls.length, 0);
});
