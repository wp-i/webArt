import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash} from './production/api.mjs';
import {buildCliArgs, disabledCliFeatures} from './production/cli-review.mjs';
import {calibrationSchema, reviewSchema, controlsReviewSchema, styleReviewSchema, dimensions} from './production/schemas.mjs';
import {validateCliReviewTransport, projectCliReviewReport, createCliReviewConsumptionReceipt, validateCliReviewConsumptionReceipt, canonicalCliReportHash} from './production/cli-review-receipt.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const privateBase = fs.mkdtempSync(path.join(root, '.webart', 'cli-receipt-tests-'));
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const write = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n'); };
const reference = file => ({path: relative(file), sha256: hash(fs.readFileSync(file))});
const copy = value => JSON.parse(JSON.stringify(value));
const finding = 'Controlled offline fixture verifies transport and report binding only; it is never a visual admission.';
let counter = 0;

function fixture(role = 'calibration', {alias = false, decision = 'reject'} = {}) {
  const base = path.join(privateBase, String(++counter)), id = '01-' + role + '-controlled', attempt = path.join(base, id);
  fs.mkdirSync(attempt, {recursive: true});
  const frames = [], add = (frameRole, label) => {
    const id = frameRole + '-' + frames.length, file = path.join(base, 'sources', id + '.png');
    // Deliberately not presented as visual evidence. No quality gate is invoked.
    const bytes = Buffer.from('controlled-transport-fixture:' + id);
    write(file, bytes); frames.push({id, role: frameRole, label, path: relative(file), sha256: hash(bytes)}); return id;
  };
  const states = [], order = {schemaVersion: 1, samples: []};
  const stateNames = ['opening', 'transition', 'middle', 'ending'];
  const views = ['desktop', 'mobile'];
  let raw, schema, text, context = {reviewerId: 'controlled-offline-fixture', calibrationRevision: 'controlled-v2', runId: 'controlled-run', calibrationRunId: 'controlled-run', sourceSha256: '1'.repeat(64), benchmarkSha256: '2'.repeat(64)};
  if (role === 'calibration') {
    schema = calibrationSchema; text = 'Controlled calibration transport fixture only';
    for (let i = 0; i < 6; i++) {
      const sample = {label: String.fromCharCode(65 + i), id: String(i + 1).padStart(3, '0'), sourceSha256: String(i + 1).repeat(64), states: []};
      for (const viewport of views) for (const state of stateNames) {
        const id = add('sample', `${sample.label} ${viewport} ${state}`), frame = frames.find(frame => frame.id === id);
        sample.states.push({viewport, state, path: frame.path, sha256: frame.sha256});
      }
      order.samples.push(sample);
    }
    raw = {labels: order.samples.map((sample, i) => ({label: sample.label, verdict: i ? 'below-benchmark' : 'benchmark', finding}))};
    const orderFile = path.join(base, 'calibration-order-private.json'); write(orderFile, order); context.order = reference(orderFile);
  } else if (role === 'reference-review' || role === 'prototype-review') {
    schema = reviewSchema;
    if (role === 'reference-review') context.sourceSha256 = null;
    const benchmark = add('benchmark', 'desktop opening'); add('negative', 'user-rejected 1 desktop opening');
    for (const viewport of views) for (const state of stateNames) add('reference', `${viewport} ${state}`);
    const compareRole = role === 'reference-review' ? 'reference' : 'candidate';
    if (compareRole === 'candidate') for (const viewport of views) for (const state of stateNames) add('candidate', `${viewport} ${state}`);
    const target = frames.filter(frame => frame.role === compareRole);
    for (const frame of target) { const [viewport, state] = frame.label.split(' '); states.push({viewport, state, loaded: true, finalAssets: true, evidence: [{path: frame.path, sha256: frame.sha256}]}); }
    const referenceFrame = frames.find(frame => frame.role === 'reference').id;
    raw = {decision, dimensions: dimensions.map(key => ({key, againstBenchmark: 'peer', finding, benchmarkFrames: [benchmark], candidateFrames: [target[0].id]})), signatureFeatures: [{name: 'Controlled core', core: true, retained: true, sceneLevel: true, visualPurpose: finding, referenceFrames: [referenceFrame], candidateFrames: [target[0].id]}], stateChecks: target.map(frame => { const [viewport, state] = frame.label.split(' '); return {viewport, state, subject: 'preserved', material: 'preserved', composition: 'preserved', role: 'preserved', finding, frames: [frame.id]}; }), continuityChecks: [], motion: ['pointer', 'scroll'].map(input => ({input, normal: true, forward: true, reverse: true, leaveOrStop: true, reduced: true, primaryVisual: true, frames: target.slice(0, 3).map(frame => frame.id)})), nextAction: decision === 'admit' ? 'admit' : 'replace-direction', fixTasks: decision === 'admit' ? [] : ['Controlled fixture remains rejected']};
    text = JSON.stringify({phase: compareRole === 'reference' ? 'reference' : 'prototype', compareRole, frameRoles: Object.fromEntries(['benchmark', 'negative', 'reference', 'candidate'].map(role => [role, frames.filter(frame => frame.role === role).map(frame => frame.id)])), requiredDimensions: dimensions, visualContract: {schemaVersion: 1, states: {}, continuity: []}, expectedSignatures: [{name: 'Controlled core', visualPurpose: finding}]});
    context.states = states;
  } else if (role === 'controls-review') {
    schema = controlsReviewSchema; add('control', 'desktop controlled action after');
    const responsiveFrames = [], responsive = [];
    for (const viewport of ['desktop', 'wide', 'tablet', 'mobile', 'narrow']) for (const state of stateNames) {
      const id = add('responsive-composition', `${viewport} 100 ${state}`), frame = frames.at(-1);
      responsiveFrames.push({viewport, state, frame: id}); responsive.push({viewport, state, width: 100, height: 100, evidence: {path: frame.path, sha256: frame.sha256}});
    }
    raw = {decision: 'reject', responsiveComposition: 'reject', responsiveChecks: responsiveFrames.map(frame => ({viewport: frame.viewport, state: frame.state, subject: 'preserved', composition: 'preserved', actions: 'preserved', finding, frames: [frame.frame]})), renderingFallback: 'not-applicable', findings: [finding]};
    text = JSON.stringify({responsiveFrames, rendering: {mode: 'dom'}});
    const runtimeFile = path.join(base, 'runtime.json'); write(runtimeFile, {sourceSha256: context.sourceSha256, responsive}); context.runtimeEvidence = reference(runtimeFile);
  } else {
    schema = styleReviewSchema;
    for (const viewport of views) for (const state of stateNames) add('candidate', `${viewport} ${state}`);
    const existing = [];
    for (const viewport of views) for (const state of stateNames) { add('existing', `006 ${viewport} ${state}`); const frame = frames.at(-1); existing.push({viewport, state, path: frame.path, sha256: frame.sha256}); }
    context.comparisonCohort = [{id: '006', sourceSha256: '6'.repeat(64), states: existing}];
    raw = {decision: 'reject', nearestId: '006', openingAndAssetBothRepeated: true, comparisons: ['composition', 'typography', 'color-media', 'rhythm'].map(dimension => ({dimension, different: false, finding}))};
    text = JSON.stringify({otherIds: ['006']});
  }
  if (alias) {
    const first = frames.find(frame => frame.role === 'reference'), second = frames.find(frame => frame.role === 'reference' && frame !== first);
    write(path.resolve(root, second.path), fs.readFileSync(path.resolve(root, first.path))); second.sha256 = first.sha256;
    const state = context.states.find(state => state.evidence[0].path === second.path); if (state) state.evidence[0].sha256 = second.sha256;
    context.frames = frames;
  }
  const groups = [];
  for (const frame of frames) {
    let group = alias && groups.find(group => group.role === frame.role && group.sha256 === frame.sha256);
    if (!group) { group = {role: frame.role, sha256: frame.sha256, frames: []}; groups.push(group); }
    group.frames.push(frame);
  }
  const images = [], sourceMap = [];
  for (const [index, group] of groups.entries()) {
    const anonymous = 'images/' + String(index).padStart(3, '0') + '.png', file = path.join(attempt, 'inputs', path.basename(anonymous));
    const bytes = fs.readFileSync(path.resolve(root, group.frames[0].path)); write(file, bytes);
    const label = group.frames.map(frame => frame.id + ' ' + frame.label).join('\n') + (group.frames.length > 1 ? '\nThese frame IDs have identical verified pixels. Each retains its own capture context.' : '');
    images.push({path: anonymous, sha256: group.sha256, label, bytes: bytes.length}); sourceMap.push({path: anonymous, source: group.frames[0].path, sha256: group.sha256});
  }
  const packetDirectory = path.join(os.tmpdir(), 'webart-retired-packet-does-not-exist-' + counter), requestedModel = null;
  const provenance = {mode: 'evidence-only-fresh-codex-cli', kind: 'fresh-codex-cli', independent: false, contextIsolated: false, contextIsolationScope: 'fresh conversation; implementation history not supplied', implementationContextIncluded: false, backendIndependenceEstablished: false, requestedModel, actualModel: null};
  const request = {schemaVersion: 1, id, role, execution: 'fresh-codex-cli-evidence-review', requestedModel, provenance, instructions: finding, text, images, outputSchema: schema, packetDirectory, packetManifest: [...images.map(({path, sha256}) => ({path, sha256})), {path: 'schema.json', sha256: hash(Buffer.from(JSON.stringify(schema, null, 2) + '\n'))}], invocation: {args: buildCliArgs({packetDirectory, imageFiles: images.map(image => path.join(packetDirectory, image.path)), schemaFile: path.join(packetDirectory, 'schema.json'), finalFile: path.join(packetDirectory, 'final.json')}), shell: false, requestedDisabledFeatures: disabledCliFeatures, automaticAdapterRetries: 0, deadlineMs: 300000, maxOutputBytes: 2097152}};
  const effectiveFeatures = Object.fromEntries([...disabledCliFeatures.map(name => [name, false]), ['skip_host_skill_discovery', true], ['unified_exec', true]]);
  write(path.join(attempt, 'request.json'), request); write(path.join(attempt, 'response.json'), raw); write(path.join(attempt, 'private-source-map.json'), sourceMap);
  write(path.join(attempt, 'events.jsonl'), [{type: 'thread.started', thread_id: 'controlled-fresh-thread'}, {type: 'turn.started'}, {type: 'item.completed', item: {id: 'item_0', type: 'agent_message', text: fs.readFileSync(path.join(attempt, 'response.json'), 'utf8')}}, {type: 'turn.completed', usage: {input_tokens: 1, output_tokens: 1}}].map(event => JSON.stringify(event)).join('\n') + '\n');
  write(path.join(attempt, 'stderr.txt'), ''); write(path.join(attempt, 'process.json'), {cliVersion: 'codex-cli controlled-fixture', exitCode: 0, exitSignal: null, failure: null, elapsedMs: 1});
  write(path.join(attempt, 'feature-probe.json'), {exitCode: 0, failure: null, requestedDisabledFeatures: disabledCliFeatures, effectiveFeatures, commandToolsControlledBy: 'features.shell_tool=false'});
  write(path.join(attempt, 'feature-probe.stdout.txt'), Object.entries(effectiveFeatures).map(([name, enabled]) => name + ' stable ' + enabled).join('\n') + '\n'); write(path.join(attempt, 'feature-probe.stderr.txt'), '');
  write(path.join(attempt, 'version.stdout.txt'), 'codex-cli controlled-fixture\n'); write(path.join(attempt, 'version.stderr.txt'), '');
  write(path.join(attempt, 'prompt.txt'), request.instructions + '\n\n' + request.text + '\n\n' + images.map((image, index) => `Attached image ${index + 1}: ${image.label} (${image.path})`).join('\n') + '\n\nReturn only the final JSON matching the supplied schema. Read only these attached images and this evidence text. Use no tools, external sources, files, memories, implementation context or other conversations. If the evidence is insufficient, state the limitation within the permitted result; never invent an observation.\n');
  const contextFile = path.join(base, 'context.json'); write(contextFile, context);
  const input = {root, request: reference(path.join(attempt, 'request.json')), role};
  const transport = () => validateCliReviewTransport(input), project = () => projectCliReviewReport({root, transport: transport(), context});
  const consume = report => createCliReviewConsumptionReceipt({...input, context: reference(contextFile), report, directory: relative(path.join(base, 'consumed'))});
  const mutateRaw = change => { change(raw); write(path.join(attempt, 'response.json'), raw); const events = fs.readFileSync(path.join(attempt, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse); events[2].item.text = fs.readFileSync(path.join(attempt, 'response.json'), 'utf8'); write(path.join(attempt, 'events.jsonl'), events.map(JSON.stringify).join('\n') + '\n'); };
  return {base, attempt, frames, context, contextFile, raw, request, input, transport, project, consume, mutateRaw};
}

for (const role of ['calibration', 'reference-review', 'prototype-review', 'controls-review', 'style-review']) test(role + ' exact projection and receipt replay never grants visual admission', () => {
  const f = fixture(role), report = f.project(), receipt = f.consume(report);
  const verified = validateCliReviewConsumptionReceipt({root, receipt, role, report: {...report, reviewReceipt: receipt}});
  assert.equal(verified.receipt.visualAdmissionGranted, false); assert.equal(verified.receipt.backendRequestCount, null); assert.equal(verified.provenance.independent, false); assert.equal(verified.provenance.actualModel, null);
  assert.equal(verified.receipt.validationReadsExternalPacket, false); assert.equal(fs.existsSync(f.request.packetDirectory), false);
  assert.throws(() => f.consume(report), /already exists/);
});

test('report promotion and all calibration findings are rejected at creation and validation', () => {
  const f = fixture(), report = f.project(), receipt = f.consume(report);
  for (const index of [0, 1, 2, 3, 4, 5]) {
    const forged = copy(report); forged.samples[index].finding += ' forged';
    assert.throws(() => validateCliReviewConsumptionReceipt({root, receipt, role: 'calibration', report: forged}), /promoted or changed/);
  }
  const forged = copy(report); forged.samples[1].verdict = 'benchmark';
  assert.throws(() => createCliReviewConsumptionReceipt({...f.input, context: reference(f.contextFile), report: forged, directory: relative(path.join(f.base, 'forged'))}), /exact raw-result projection/);
});

test('forged receipt role, fingerprint and provenance fail closed', () => {
  const f = fixture(), report = f.project(), receipt = f.consume(report);
  assert.throws(() => validateCliReviewConsumptionReceipt({root, receipt, role: 'style-review', report}), /role or policy/);
  assert.throws(() => validateCliReviewConsumptionReceipt({root, receipt: {...receipt, sha256: '0'.repeat(64)}, role: 'calibration', report}), /changed or empty/);
  const file = path.resolve(root, receipt.path), value = JSON.parse(fs.readFileSync(file)); value.provenance.independent = true; write(file, value);
  assert.throws(() => validateCliReviewConsumptionReceipt({root, receipt: reference(file), role: 'calibration', report}), /execution proof differs/);
});

for (const [name, change] of [
  ['tool use', events => events.splice(2, 0, {type: 'item.completed', item: {id: 'item_9', type: 'command_execution', command: 'forbidden'}})],
  ['unknown runtime error', events => events.splice(2, 0, {type: 'error', message: 'new unrecognized failure'})],
  ['resumed second thread', events => events.splice(1, 0, {type: 'thread.started', thread_id: 'second'})],
  ['completion failure payload', events => events.at(-1).status = 'failed'],
]) test(name + ' cannot become a consumed receipt', () => {
  const f = fixture(), file = path.join(f.attempt, 'events.jsonl'), events = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse); change(events); write(file, events.map(JSON.stringify).join('\n') + '\n'); assert.throws(f.transport);
});

for (const [name, change] of [
  ['nonzero exit', process => process.exitCode = 1], ['signal', process => process.exitSignal = 'SIGTERM'], ['failure', process => process.failure = 'deadline'], ['elapsed bound', process => process.elapsedMs = 400000],
]) test(name + ' is rejected', () => { const f = fixture(), file = path.join(f.attempt, 'process.json'), process = JSON.parse(fs.readFileSync(file)); change(process); write(file, process); assert.throws(f.transport, /finish successfully/); });

test('effective feature claims must match retained probe stdout', () => {
  const f = fixture(), file = path.join(f.attempt, 'feature-probe.json'), probe = JSON.parse(fs.readFileSync(file)); probe.effectiveFeatures.shell_tool = true; write(file, probe); assert.throws(f.transport, /restrictions/);
});

test('unknown and duplicate feature probe lines are rejected', () => {
  for (const line of ['unknown diagnostic error\n', 'shell_tool stable false\n']) { const f = fixture(), file = path.join(f.attempt, 'feature-probe.stdout.txt'); fs.appendFileSync(file, line); assert.throws(f.transport, /probe lines/); }
});

test('absolute, external and traversal input paths are rejected', () => {
  const f = fixture();
  for (const file of [path.join(f.attempt, 'request.json'), '../outside.json', 'C:/temp/request.json', '/tmp/request.json']) assert.throws(() => validateCliReviewTransport({...f.input, request: {path: file, sha256: f.input.request.sha256}}), /unsafe evidence path/);
  const mapFile = path.join(f.attempt, 'private-source-map.json'), sourceMap = JSON.parse(fs.readFileSync(mapFile)); sourceMap[0].source = path.join(os.tmpdir(), 'outside.png'); write(mapFile, sourceMap); assert.throws(f.transport, /unsafe evidence path/);
});

test('raw input and original-source tampering are detected', () => {
  for (const retained of [true, false]) { const f = fixture(); write(retained ? path.join(f.attempt, 'inputs', '000.png') : path.resolve(root, f.frames[0].path), 'tampered'); assert.throws(f.transport, /fingerprint differs/); }
});

test('private calibration order cannot swap identities or contextual states', () => {
  const f = fixture(), file = path.resolve(root, f.context.order.path), order = JSON.parse(fs.readFileSync(file)); [order.samples[0].states[0], order.samples[0].states[1]] = [order.samples[0].states[1], order.samples[0].states[0]]; write(file, order); f.context.order = reference(file); assert.throws(f.project, /order does not match/);
});

test('reference/prototype exact dimensions, states, signatures, motion and fix tasks resist promotion', () => {
  for (const role of ['reference-review', 'prototype-review']) {
    const f = fixture(role), report = f.project(), receipt = f.consume(report);
    for (const change of [r => r.decision = 'admit', r => r.dimensions[0].finding += ' forged', r => r.signatureFeatures[0].retained = false, r => r.stateChecks[0].subject = 'lost', r => r.motion[0].forward = false, r => r.fixTasks.push('forged'), r => r.states[0].evidence[0] = r.states[1].evidence[0]]) {
      const forged = copy(report); change(forged); assert.throws(() => validateCliReviewConsumptionReceipt({root, receipt, role, report: forged}), /promoted or changed/);
    }
  }
});

test('deterministic strengthening matches existing shared-array behavior exactly', () => {
  const f = fixture('reference-review', {decision: 'admit'}); f.mutateRaw(raw => { raw.dimensions[0].againstBenchmark = 'below'; raw.signatureFeatures[0].retained = false; raw.stateChecks[0].subject = 'lost'; });
  const report = f.project(); assert.equal(report.decision, 'reject'); assert.equal(report.nextAction, 'replace-direction'); assert.equal(report.vetoes.length, 3); assert.equal(report.fixTasks.length, 3); f.consume(report);
  const g = fixture('reference-review'); g.mutateRaw(raw => raw.dimensions[0].againstBenchmark = 'below'); const rejected = g.project(); assert.deepEqual(rejected.vetoes, rejected.fixTasks); assert.equal(rejected.vetoes.length, 3); g.consume(rejected);
});

test('wrong-role and wrong-state frame references are rejected before receipt creation', () => {
  const f = fixture('prototype-review'); f.mutateRaw(raw => raw.dimensions[0].candidateFrames = raw.dimensions[0].benchmarkFrames); assert.throws(f.project, /wrong role or state/);
  const g = fixture('reference-review'); g.mutateRaw(raw => raw.stateChecks[1].frames = raw.stateChecks[0].frames); assert.throws(g.project, /different contextual state/);
});

test('same-pixel aliases preserve every contextual original and cannot silently share a path', () => {
  const f = fixture('reference-review', {alias: true}), report = f.project(); f.consume(report);
  assert.notEqual(report.stateChecks[0].evidence[0].path, report.stateChecks[1].evidence[0].path); assert.equal(report.stateChecks[0].evidence[0].sha256, report.stateChecks[1].evidence[0].sha256);
  delete f.context.frames; assert.throws(f.project, /aliases require/);
  const g = fixture('reference-review', {alias: true}); g.context.frames[3].label = 'desktop opening'; assert.throws(g.project, /contextual frame differs/);
});

test('all twenty controls checks and style comparisons are bound', () => {
  const f = fixture('controls-review'), report = f.project(), receipt = f.consume(report);
  for (const index of [0, 19]) { const forged = copy(report); forged.responsiveChecks[index].actions = 'lost'; assert.throws(() => validateCliReviewConsumptionReceipt({root, receipt, role: 'controls-review', report: forged}), /promoted or changed/); }
  const g = fixture('controls-review'); g.mutateRaw(raw => raw.responsiveChecks.pop()); assert.throws(g.project, /twenty/);
  const h = fixture('style-review'), style = h.project(), styleReceipt = h.consume(style), forged = copy(style); forged.comparisons[3].different = true;
  assert.throws(() => validateCliReviewConsumptionReceipt({root, receipt: styleReceipt, role: 'style-review', report: forged}), /promoted or changed/);
});

test('canonical report hash ignores only its receipt pointer and binds other fields', () => {
  const f = fixture(), report = f.project(); assert.equal(canonicalCliReportHash(report), canonicalCliReportHash({...report, reviewReceipt: {path: 'any', sha256: '0'.repeat(64)}})); assert.notEqual(canonicalCliReportHash(report), canonicalCliReportHash({...report, purpose: 'forged'}));
});

test('rehashing a forged canonical report cannot substitute for semantic matching', () => {
  const f = fixture('prototype-review'), report = f.project(), receipt = f.consume(report), receiptFile = path.resolve(root, receipt.path), value = JSON.parse(fs.readFileSync(receiptFile));
  const forged = copy(report); forged.decision = 'admit'; forged.nextAction = 'admit'; forged.vetoes = []; forged.fixTasks = [];
  const reportFile = path.resolve(root, value.canonicalReport.path); write(reportFile, forged); value.canonicalReport = reference(reportFile); value.canonicalReportSha256 = canonicalCliReportHash(forged); write(receiptFile, value);
  assert.throws(() => validateCliReviewConsumptionReceipt({root, receipt: reference(receiptFile), role: 'prototype-review', report: forged}), /promoted or changed/);
});
