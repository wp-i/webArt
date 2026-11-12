import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {hash} from './production/api.mjs';
import {pinCliRuntime, inspectCliRuntime, resolveCalibratedCliRuntime, main} from './production/cli-runtime.mjs';
import {loadQualityPolicy} from './quality-gate.mjs';
import {buildCliArgs, disabledCliFeatures} from './production/cli-review.mjs';
import {calibrationSchema} from './production/schemas.mjs';
import {validateCliReviewTransport, projectCliReviewReport, createCliReviewConsumptionReceipt} from './production/cli-review-receipt.mjs';
import {workflowReviewClient} from './prototype-run.mjs';
import {CachedCodexCliReviewClient} from './production/cached-cli-review.mjs';
import {productionReviewClient,productionReviewSelection} from './production-run.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliVersion = 'codex-cli controlled-runtime';
const write = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n'); };
function workspace(t, parent = os.tmpdir()) {
  const root = fs.mkdtempSync(path.join(parent, 'webart-runtime-test-'));
  t.after(() => { assert.equal(path.dirname(root), parent); assert.match(path.basename(root), /^webart-runtime-test-/); fs.rmSync(root, {recursive: true, force: true}); });
  const executable = path.join(root, 'source', 'codex.exe');
  write(executable, crypto.randomBytes(32));
  const probes = [], versionProbe = file => { probes.push(file); return cliVersion; };
  return {root, executable, probes, versionProbe};
}

// Actual transport/projection validators consume this controlled 48-frame
// fixture. Its files are engineering data, never real visual admission evidence.
function calibratedFixture(t, {requestedModel = null, missingExecutable = false, productionResume = false} = {}) {
  const local = workspace(t, path.join(repository, '.webart')), root = repository, {calibration} = loadQualityPolicy(root);
  const relative = file => path.relative(root, file).replaceAll('\\', '/');
  const ref = file => ({path: relative(file), sha256: hash(fs.readFileSync(file))});
  const runId = productionResume ? 'api-runtime-test-' + crypto.randomBytes(6).toString('hex') : 'controlled-runtime-calibration';
  const runDirectory = productionResume ? 'docs/production/runs/' + runId : undefined;
  if (runDirectory) {
    fs.mkdirSync(path.join(root, runDirectory));
    t.after(() => { const directory = path.join(root, runDirectory); assert.equal(path.dirname(directory), path.join(root, 'docs/production/runs')); assert.match(path.basename(directory), /^api-runtime-test-[a-f0-9]{12}$/); fs.rmSync(directory, {recursive: true, force: true}); });
  }
  const id = '01-calibration-0123456789', attempt = path.join(runDirectory ? path.join(root, runDirectory, 'cli-review') : local.root, id), frames = [], sourceMap = [], images = [];
  const samples = [calibration.baseline, ...calibration.negatives], order = {schemaVersion: 1, samples: []};
  for (const [index, sample] of samples.entries()) {
    const label = String.fromCharCode(65 + index), states = [];
    for (const viewport of ['desktop', 'mobile']) for (const state of ['opening', 'transition', 'middle', 'ending']) {
      const frameId = 'sample-' + frames.length, source = path.join(local.root, 'sources', frameId + '.png'), bytes = Buffer.from('Controlled offline runtime fixture ' + frameId);
      write(source, bytes);
      const imagePath = 'images/' + String(frames.length).padStart(3, '0') + '.png', sha256 = hash(bytes), frame = {id: frameId, role: 'sample', label: `${label} ${viewport} ${state}`, path: relative(source), sha256};
      frames.push(frame); states.push({viewport, state, path: frame.path, sha256});
      images.push({path: imagePath, sha256, bytes: bytes.length, label: `${frameId} ${frame.label}`});
      sourceMap.push({path: imagePath, source: frame.path, sha256}); write(path.join(attempt, 'inputs', path.basename(imagePath)), bytes);
    }
    order.samples.push({label, id: sample.id, sourceSha256: sample.sourceSha256, states});
  }
  const finding = 'Controlled offline fixture checks calibration and runtime binding without an actual model call or visual admission.';
  const raw = {labels: samples.map((sample, index) => ({label: String.fromCharCode(65 + index), verdict: sample.class, finding}))};
  const packetDirectory = path.join(os.tmpdir(), path.basename(local.root) + '-absent-packet');
  const provenance = {mode: 'evidence-only-fresh-codex-cli', kind: 'fresh-codex-cli', independent: false, contextIsolated: false, contextIsolationScope: 'fresh conversation; implementation history not supplied', implementationContextIncluded: false, backendIndependenceEstablished: false, requestedModel, actualModel: null};
  const executable = missingExecutable ? path.join(local.root, 'removed-old-version', 'codex.exe') : local.executable;
  const request = {schemaVersion: 1, id, role: 'calibration', execution: 'fresh-codex-cli-evidence-review', requestedModel, provenance, instructions: finding, text: finding, images, outputSchema: calibrationSchema, packetDirectory, packetManifest: [...images.map(({path, sha256}) => ({path, sha256})), {path: 'schema.json', sha256: hash(Buffer.from(JSON.stringify(calibrationSchema, null, 2) + '\n'))}], invocation: {executable, args: buildCliArgs({packetDirectory, imageFiles: images.map(image => path.join(packetDirectory, image.path)), schemaFile: path.join(packetDirectory, 'schema.json'), finalFile: path.join(packetDirectory, 'final.json'), model: requestedModel ?? undefined}), shell: false, requestedDisabledFeatures: disabledCliFeatures, automaticAdapterRetries: 0, deadlineMs: 300000, maxOutputBytes: 2097152}};
  const effectiveFeatures = Object.fromEntries([...disabledCliFeatures.map(name => [name, false]), ['skip_host_skill_discovery', true], ['unified_exec', true]]);
  write(path.join(attempt, 'request.json'), request); write(path.join(attempt, 'response.json'), raw); write(path.join(attempt, 'private-source-map.json'), sourceMap);
  write(path.join(attempt, 'events.jsonl'), [{type: 'thread.started', thread_id: 'controlled-runtime-thread'}, {type: 'turn.started'}, {type: 'item.completed', item: {id: 'item_0', type: 'agent_message', text: fs.readFileSync(path.join(attempt, 'response.json'), 'utf8')}}, {type: 'turn.completed', usage: {input_tokens: 1, output_tokens: 1}}].map(JSON.stringify).join('\n') + '\n');
  write(path.join(attempt, 'stderr.txt'), ''); write(path.join(attempt, 'process.json'), {cliVersion, exitCode: 0, exitSignal: null, failure: null, elapsedMs: 1});
  write(path.join(attempt, 'feature-probe.json'), {exitCode: 0, failure: null, requestedDisabledFeatures: disabledCliFeatures, effectiveFeatures, commandToolsControlledBy: 'features.shell_tool=false'});
  write(path.join(attempt, 'feature-probe.stdout.txt'), Object.entries(effectiveFeatures).map(([name, enabled]) => name + ' stable ' + enabled).join('\n') + '\n'); write(path.join(attempt, 'feature-probe.stderr.txt'), '');
  write(path.join(attempt, 'version.stdout.txt'), cliVersion + '\n'); write(path.join(attempt, 'version.stderr.txt'), '');
  write(path.join(attempt, 'prompt.txt'), request.instructions + '\n\n' + request.text + '\n\n' + images.map((image, index) => `Attached image ${index + 1}: ${image.label} (${image.path})`).join('\n') + '\n\nReturn only the final JSON matching the supplied schema. Read only these attached images and this evidence text. Use no tools, external sources, files, memories, implementation context or other conversations. If the evidence is insufficient, state the limitation within the permitted result; never invent an observation.\n');
  const orderFile = path.join(local.root, 'order.json'); write(orderFile, order);
  const context = {reviewerId: 'controlled-runtime-reviewer', calibrationRevision: calibration.revision, runId, order: ref(orderFile)}, contextFile = path.join(local.root, 'context.json'); write(contextFile, context);
  const input = {root, request: ref(path.join(attempt, 'request.json')), role: 'calibration'}, report = projectCliReviewReport({root, transport: validateCliReviewTransport(input), context});
  const reviewReceipt = createCliReviewConsumptionReceipt({...input, context: ref(contextFile), report, directory: relative(path.join(local.root, 'consumed'))});
  const evaluator = {...report, reviewReceipt}, evaluatorFile = path.join(runDirectory ? path.join(root, runDirectory) : local.root, 'calibration-review.json'); write(evaluatorFile, evaluator);
  const runFile = runDirectory && runDirectory + '/run.json';
  if (runFile) write(path.join(root, runFile), {runId, execution: 'fresh-codex-cli-evidence-review', reviewDirectory: runDirectory + '/cli-review', requestedModel, model: requestedModel ?? 'codex-account-default', status: 'failed', candidates: [], deliveries: [], ids: ['010']});
  return {...local, root, executable, evaluator, evaluatorFile: relative(evaluatorFile), requestFile: path.join(attempt, 'request.json'), runDirectory, runFile};
}

test('pin is explicit, local, hash-named, byte exact and reusable without overwrite', t => {
  const f = workspace(t);
  assert.equal(fs.existsSync(path.join(f.root, '.webart')), false);
  const inspected = inspectCliRuntime(f); assert.equal(inspected.pinned, false);
  assert.equal(fs.existsSync(path.join(f.root, '.webart')), false);
  const pinned = pinCliRuntime({...f, expectedVersion: cliVersion, expectedSha256: inspected.sha256});
  assert.equal(pinned.pinned, true); assert.equal(path.basename(path.dirname(pinned.executable)), inspected.sha256);
  assert.deepEqual(fs.readFileSync(pinned.executable), fs.readFileSync(f.executable));
  const metadata = fs.readFileSync(pinned.metadata), again = pinCliRuntime(f);
  assert.equal(again.executable, pinned.executable); assert.deepEqual(fs.readFileSync(pinned.metadata), metadata);
  assert.ok(f.probes.length > 0);
});

test('pinned runtime survives source removal and detects byte or metadata tampering', t => {
  const f = workspace(t), pinned = pinCliRuntime(f), bytes = fs.readFileSync(pinned.executable), metadata = JSON.parse(fs.readFileSync(pinned.metadata, 'utf8'));
  fs.unlinkSync(f.executable);
  assert.equal(inspectCliRuntime({...f, executable: pinned.executable}).sha256, pinned.sha256);
  fs.writeFileSync(pinned.executable, Buffer.alloc(bytes.length, 8));
  assert.throws(() => inspectCliRuntime({...f, executable: pinned.executable}), /bytes or metadata changed/);
  write(pinned.metadata, {...metadata, sha256: hash(fs.readFileSync(pinned.executable))});
  assert.throws(() => inspectCliRuntime({...f, executable: pinned.executable}), /bytes or metadata changed/);
  fs.writeFileSync(pinned.executable, bytes); write(pinned.metadata, {...metadata, cliVersion: 'codex-cli forged-version'});
  assert.throws(() => inspectCliRuntime({...f, executable: pinned.executable}), /version differs/);
});

test('different version, requested SHA and changes during probing all stop', t => {
  const f = workspace(t);
  assert.throws(() => pinCliRuntime({...f, expectedVersion: 'codex-cli old-version'}), /version differs/);
  const beforeMismatch = f.probes.length;
  assert.throws(() => pinCliRuntime({...f, expectedSha256: '0'.repeat(64)}), /fingerprint differs/);
  assert.throws(() => pinCliRuntime({...f, expectedVersion: ''}), /explicit version/);
  assert.throws(() => pinCliRuntime({...f, expectedSha256: ''}), /fingerprint differs/);
  assert.equal(f.probes.length, beforeMismatch);
  assert.throws(() => inspectCliRuntime({...f, versionProbe: file => { fs.appendFileSync(file, 'tampered'); return cliVersion; }}), /changed during/);
  assert.equal(fs.existsSync(path.join(f.root, '.webart')), false);
});

test('PATH aliases, missing files and directory links cannot select or create a runtime', t => {
  const f = workspace(t);
  for (const executable of ['codex', './codex.exe', path.join(f.root, 'missing.exe')]) assert.throws(() => pinCliRuntime({...f, executable}));
  const linked = path.join(f.root, 'linked-source'); fs.symlinkSync(path.dirname(f.executable), linked, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => pinCliRuntime({...f, executable: path.join(linked, 'codex.exe')}), /Linked runtime/);
  fs.mkdirSync(path.join(f.root, '.webart')); fs.symlinkSync(path.dirname(f.executable), path.join(f.root, '.webart', 'review-runtime'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => pinCliRuntime(f), /unlinked directory/);
  assert.equal(f.probes.includes(path.join(linked, 'codex.exe')), false);
});

test('calibration resolution follows the fully validated original request and preserves its exact version', t => {
  const f = calibratedFixture(t), runtime = resolveCalibratedCliRuntime({...f, calibration: f.evaluatorFile});
  assert.equal(runtime.executable, f.executable); assert.equal(runtime.cliVersion, cliVersion); assert.equal(runtime.calibrationRunId, f.evaluator.runId);
  assert.equal(f.probes.length, 1);
  const client = workflowReviewClient({root: f.root, runDirectory: 'docs/production/runs/runtime-default-fixture', evaluator: f.evaluator, runtimeVersionProbe: f.versionProbe});
  assert.equal(client.executable, f.executable); assert.equal(client.requestedModel, null); assert.equal(client.model, 'codex-account-default'); assert.equal(client.requests, 0);
  assert.throws(() => resolveCalibratedCliRuntime({...f, calibration: f.evaluator, versionProbe: () => 'codex-cli replacement-version'}), /version differs/);
  write(f.requestFile, {...JSON.parse(fs.readFileSync(f.requestFile, 'utf8')), invocation: {executable: 'codex'}});
  const before = f.probes.length; assert.throws(() => resolveCalibratedCliRuntime({...f, calibration: f.evaluator}), /fingerprint|changed/i); assert.equal(f.probes.length, before);
});

test('a deleted calibrated version stays blocked without PATH fallback or directory creation', t => {
  const f = calibratedFixture(t, {missingExecutable: true}), directory = 'docs/production/runs/runtime-missing-fixture';
  assert.throws(() => resolveCalibratedCliRuntime({...f, calibration: f.evaluator}), /ENOENT/);
  assert.throws(() => workflowReviewClient({root: f.root, runDirectory: directory, evaluator: f.evaluator, runtimeVersionProbe: f.versionProbe}), /ENOENT/);
  assert.equal(f.probes.length, 0); assert.equal(fs.existsSync(path.join(f.root, directory)), false);
});

test('automatic prototype and qualification clients use the calibrated executable and requested model', t => {
  const f = calibratedFixture(t, {requestedModel: 'controlled-explicit-model'}), runDirectory = 'docs/production/runs/runtime-auto-fixture';
  const progress = [], usage = [], reuses = [];
  const options = {root: f.root, runDirectory, evaluator: f.evaluator, runtimeVersionProbe: f.versionProbe, onProgress: event => progress.push(event), onUsage: event => usage.push(event), onReuse: event => reuses.push(event)};
  const first = workflowReviewClient(options), next = workflowReviewClient(options);
  assert.ok(first instanceof CachedCodexCliReviewClient); assert.equal(first.executable, f.executable); assert.equal(next.executable, first.executable);
  assert.equal(first.relativeDirectory, runDirectory + '/cli-review'); assert.equal(first.requestedModel, 'controlled-explicit-model'); assert.equal(first.requests, 0); assert.equal(f.probes.length, 2);
  const forbiddenProbe = () => { throw Error('Explicit client must not probe or resolve a runtime'); };
  assert.equal(workflowReviewClient({...options, client: first, runtimeVersionProbe: forbiddenProbe}), first);
  const event = {kind: 'verified-cli-review-reuse', originalCliInvocations: 1, newCliInvocations: 0, newModelCalls: 0, backendRequestCount: null};
  first.onReuse(event); assert.deepEqual(reuses, [event]); assert.deepEqual(usage, []); assert.deepEqual(progress, [{stage: 'cli-review-reused', ...event}]);
});

test('automatic CLI selection blocks incomplete calibration before any invocation', t => {
  const f = workspace(t), evaluator = {runId: 'incomplete', reviewer: {mode: 'evidence-only-fresh-codex-cli', requestedModel: null}};
  assert.throws(() => workflowReviewClient({root: f.root, runDirectory: 'docs/production/runs/incomplete-runtime', evaluator, runtimeVersionProbe: f.versionProbe}));
  assert.equal(f.probes.length, 0); assert.equal(fs.existsSync(path.join(f.root, 'docs')), false);
  assert.throws(() => resolveCalibratedCliRuntime({...f, calibration: {reviewer: {mode: 'evidence-only-current-conversation'}}}), /actual CLI calibration/);
  assert.throws(() => main(['pin'])); assert.throws(() => main(['download', f.executable]));
});

test('fresh production accepts an explicit verified local runtime without copying or prior calibration', t => {
  const f = workspace(t), pinned = pinCliRuntime(f), metadata = fs.readFileSync(pinned.metadata);
  const selection = productionReviewSelection(['cfg.json', '--cli', '--cli-executable', pinned.executable], {root: f.root, now: 123});
  const usage = [], reuses = [], client = productionReviewClient({root: f.root, selection, maxRequests: 8, runtimeVersionProbe: f.versionProbe, onUsage: event => usage.push(event), onReuse: event => reuses.push(event)});
  assert.ok(client instanceof CachedCodexCliReviewClient); assert.equal(client.executable, pinned.executable); assert.equal(client.requests, 0);
  assert.deepEqual(fs.readFileSync(pinned.metadata), metadata); assert.equal(fs.existsSync(path.join(f.root, selection.directory)), false);
  const event = {kind: 'verified-cli-review-reuse', originalCliInvocations: 1, newCliInvocations: 0, newModelCalls: 0};
  client.onReuse(event); assert.deepEqual(reuses, [event]); assert.deepEqual(usage, []);
  fs.writeFileSync(pinned.executable, 'changed'); const before = f.probes.length;
  assert.throws(() => productionReviewClient({root: f.root, selection, maxRequests: 8, runtimeVersionProbe: f.versionProbe}), /bytes or metadata changed/);
  assert.equal(f.probes.length, before);
  for (const executable of ['codex', './codex.exe', path.join(f.root, 'missing.exe')]) assert.throws(() => productionReviewClient({root: f.root, selection: {...selection, cliExecutable: executable}, maxRequests: 8, runtimeVersionProbe: f.versionProbe}));
  assert.equal(fs.existsSync(path.join(f.root, selection.directory)), false);
});

test('fresh production uses a validated prior calibration only to select its runtime', t => {
  const f = calibratedFixture(t), selection = productionReviewSelection(['cfg.json', '--cli', '--runtime-calibration', f.evaluatorFile, '--model', 'new-campaign-model'], {root: f.root, now: 123});
  const before = fs.readFileSync(path.join(f.root, f.evaluatorFile)), client = productionReviewClient({root: f.root, selection, maxRequests: 8, runtimeVersionProbe: f.versionProbe});
  assert.equal(client.executable, f.executable); assert.equal(client.requestedModel, 'new-campaign-model'); assert.equal(client.requests, 0);
  assert.deepEqual(fs.readFileSync(path.join(f.root, f.evaluatorFile)), before); assert.equal(fs.existsSync(path.join(f.root, selection.directory)), false);
  fs.unlinkSync(f.executable); const probes = f.probes.length;
  assert.throws(() => productionReviewClient({root: f.root, selection, maxRequests: 8, runtimeVersionProbe: f.versionProbe}), /ENOENT/);
  assert.equal(f.probes.length, probes);
});

test('production resume derives its runtime from the original validated calibration and queue', t => {
  const f = calibratedFixture(t, {productionResume: true, requestedModel: 'controlled-resume-model'});
  const selection = productionReviewSelection(['cfg.json', '--cli', '--model', 'controlled-resume-model', '--resume', f.runFile], {root: f.root});
  const client = productionReviewClient({root: f.root, selection, maxRequests: 8, runtimeVersionProbe: f.versionProbe});
  assert.equal(client.executable, f.executable); assert.equal(client.requestedModel, 'controlled-resume-model'); assert.equal(client.relativeDirectory, f.runDirectory + '/cli-review'); assert.equal(client.requests, 1);
  const before = f.probes.length;
  assert.throws(() => productionReviewClient({root: f.root, selection: {...selection, requestedModel: 'replacement-model'}, maxRequests: 8, runtimeVersionProbe: f.versionProbe}), /identity or requested model differs/);
  assert.equal(f.probes.length, before);
  assert.throws(() => productionReviewClient({root: f.root, selection: {...selection, directory: 'docs/production/runs/different/cli-review'}, maxRequests: 8, runtimeVersionProbe: f.versionProbe}), /another review directory/);
  assert.equal(f.probes.length, before);
  fs.unlinkSync(f.executable); const after = f.probes.length;
  assert.throws(() => productionReviewClient({root: f.root, selection, maxRequests: 8, runtimeVersionProbe: f.versionProbe}), /ENOENT/); assert.equal(f.probes.length, after);
});

test('production resume cannot turn a missing or incomplete calibration into a new CLI invocation', t => {
  const f = calibratedFixture(t, {productionResume: true}), selection = productionReviewSelection(['cfg.json', '--cli', '--resume', f.runFile], {root: f.root});
  const file = path.join(f.root, f.evaluatorFile), bytes = fs.readFileSync(file); fs.unlinkSync(file);
  assert.throws(() => productionReviewClient({root: f.root, selection, maxRequests: 8, runtimeVersionProbe: f.versionProbe}), /no completed original calibration/); assert.equal(f.probes.length, 0);
  write(file, {runId: f.evaluator.runId, reviewer: f.evaluator.reviewer});
  assert.throws(() => productionReviewClient({root: f.root, selection, maxRequests: 8, runtimeVersionProbe: f.versionProbe})); assert.equal(f.probes.length, 0);
  fs.writeFileSync(file, bytes); write(file, {...f.evaluator, runId: 'api-unrelated'});
  assert.throws(() => productionReviewClient({root: f.root, selection, maxRequests: 8, runtimeVersionProbe: f.versionProbe}), /identity or requested model differs/); assert.equal(f.probes.length, 0);
});
