import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash, ProductionError} from './api.mjs';
import {safeFile, verifyEvidence} from '../quality-gate.mjs';
import {buildCliArgs, cliDiagnosticPolicyVersion, cliSkillDiscoveryWarning, disabledCliFeatures, parseCliEvents} from './cli-review.mjs';
import {calibrationSchema, reviewSchema, controlsReviewSchema, styleReviewSchema, dimensions} from './schemas.mjs';
import {visualContractHash} from './visual-contract.mjs';

// This bridge consumes retained execution evidence. It does not grant a visual,
// packaging, publication or user-acceptance decision, and does not call a model.
export const cliReceiptPolicyVersion = 'portable-cli-review-consumption-v1';
const schemas = {'calibration': calibrationSchema, 'reference-review': reviewSchema, 'prototype-review': reviewSchema, 'controls-review': controlsReviewSchema, 'style-review': styleReviewSchema};
const need = (ok, message) => { if (!ok) throw new ProductionError('cli-review-receipt-invalid', message); };
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const canonical = value => JSON.stringify(value, (_, entry) => plain(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
const same = (a, b) => canonical(a) === canonical(b);
const sha = value => hash(Buffer.from(canonical(value)));
const keys = (value, expected) => need(plain(value) && same(Object.keys(value).sort(), [...expected].sort()), 'Unsupported or missing fields');
const read = (root, file) => JSON.parse(fs.readFileSync(safeFile(root, file), 'utf8'));
const ref = (root, file) => ({path: file, sha256: hash(fs.readFileSync(safeFile(root, file)))});
const bind = (root, evidence) => { verifyEvidence(root, [evidence]); return read(root, evidence.path); };
const sibling = (file, name) => path.posix.dirname(file) + '/' + name;
const inside = (root, file) => { const relative = path.relative(root, file); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
const reportBody = report => { const copy = clone(report); delete copy.reviewReceipt; return copy; };
export const canonicalCliReportHash = report => sha(reportBody(report));
const provenanceFor = (request, parsed) => ({...request.provenance, mode: 'evidence-only-fresh-codex-cli', kind: 'fresh-codex-cli', independent: false, contextIsolated: true, implementationContextIncluded: false, backendIndependenceEstablished: false, actualModel: parsed.actualModel ?? parsed.stderrDiagnostics.bannerModel, modelIdentitySource: parsed.actualModel ? 'turn.completed.model' : parsed.stderrDiagnostics.bannerModel ? 'cli.stderr.banner' : null});

function retainedDiagnosticConfig(raw) {
  // A historical diagnostic path is data only. Never open it, or depend on the
  // current machine's home directory when replaying a portable receipt.
  const prefix = cliSkillDiscoveryWarning('').slice(0, -1);
  const messages = raw.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)).map(event => event.item?.message).filter(message => typeof message === 'string' && message.startsWith(prefix));
  need(messages.length <= 1, 'Duplicated diagnostic config path');
  if (!messages.length) return undefined;
  const configFile = messages[0].slice(prefix.length, -1);
  need(messages[0].endsWith('.') && /(?:^\/|^[a-z]:[\\/]).*config\.toml$/i.test(configFile), 'Invalid retained diagnostic path');
  return configFile;
}

/** Replay one raw attempt using only project-relative, fingerprinted files.
 * request.packetDirectory and absolute invocation arguments are historical
 * strings, checked against the fixed argument builder; they are never opened.
 */
export function validateCliReviewTransport({root, request: requestRef, role}) {
  need(Object.hasOwn(schemas, role), 'Unknown review role');
  const request = bind(root, requestRef);
  need(request.schemaVersion === 1 && request.role === role && typeof request.id === 'string' && request.id === path.posix.basename(path.posix.dirname(requestRef.path)), 'Wrong request identity or role');
  need(request.execution === 'fresh-codex-cli-evidence-review' && same(request.outputSchema, schemas[role]), 'Execution or role schema changed');
  const p = request.provenance;
  need(p?.mode === 'evidence-only-fresh-codex-cli' && p.kind === 'fresh-codex-cli' && p.independent === false && p.contextIsolated === false && p.implementationContextIncluded === false && p.backendIndependenceEstablished === false && p.actualModel === null && p.requestedModel === request.requestedModel, 'Incorrect original provenance');
  need(typeof request.packetDirectory === 'string' && path.isAbsolute(request.packetDirectory) && !inside(path.resolve(root), path.resolve(request.packetDirectory)), 'Historical packet must be outside the project');
  const invocation = request.invocation;
  need(invocation?.shell === false && invocation.automaticAdapterRetries === 0 && Number.isInteger(invocation.deadlineMs) && invocation.deadlineMs >= 10 && invocation.deadlineMs <= 300000 && Number.isInteger(invocation.maxOutputBytes) && invocation.maxOutputBytes >= 1024 && invocation.maxOutputBytes <= 8 * 1024 * 1024 && same(invocation.requestedDisabledFeatures, disabledCliFeatures), 'Unrestricted or unsupported invocation');
  need(same(invocation.args, buildCliArgs({packetDirectory: request.packetDirectory, imageFiles: request.images.map(image => path.join(request.packetDirectory, image.path)), schemaFile: path.join(request.packetDirectory, 'schema.json'), finalFile: path.join(request.packetDirectory, 'final.json'), model: request.requestedModel ?? undefined})), 'Invocation differs from the fixed evidence-only policy');
  const names = ['request.json', 'response.json', 'events.jsonl', 'stderr.txt', 'process.json', 'feature-probe.json', 'feature-probe.stdout.txt', 'feature-probe.stderr.txt', 'version.stdout.txt', 'version.stderr.txt', 'prompt.txt', 'private-source-map.json'];
  const files = Object.fromEntries(names.map(name => [name, ref(root, sibling(requestRef.path, name))]));
  need(files['request.json'].sha256 === requestRef.sha256, 'Request fingerprint changed');
  const process = read(root, files['process.json'].path), probe = read(root, files['feature-probe.json'].path);
  const contents = name => fs.readFileSync(safeFile(root, files[name].path), 'utf8');
  const version = contents('version.stdout.txt').trim();
  need(/^codex-cli [^\r\n]+$/.test(version) && process.cliVersion === version && contents('version.stderr.txt') === '', 'Version evidence differs');
  need(process.exitCode === 0 && process.exitSignal === null && process.failure === null && Number.isFinite(process.elapsedMs) && process.elapsedMs >= 0 && process.elapsedMs <= invocation.deadlineMs + 2000, 'CLI process did not finish successfully within its bound');
  const featureLines = contents('feature-probe.stdout.txt').split(/\r?\n/).filter(line => line.trim());
  const featureMatches = featureLines.map(line => line.match(/^(\S+)\s+.+\s+(true|false)\s*$/));
  need(featureMatches.every(Boolean) && new Set(featureMatches.map(match => match[1])).size === featureMatches.length, 'Unrecognized or duplicate feature probe lines');
  const effectiveFeatures = Object.fromEntries(featureMatches.map(match => [match[1], match[2] === 'true']));
  need(probe.exitCode === 0 && probe.failure === null && contents('feature-probe.stderr.txt') === '' && same(probe.requestedDisabledFeatures, disabledCliFeatures) && same(effectiveFeatures, probe.effectiveFeatures) && disabledCliFeatures.every(name => effectiveFeatures[name] === false) && effectiveFeatures.skip_host_skill_discovery === true && probe.commandToolsControlledBy === 'features.shell_tool=false', 'Effective restrictions were not proven');
  const raw = contents('events.jsonl'), finalText = contents('response.json'), stderr = contents('stderr.txt');
  need(Buffer.byteLength(raw) + Buffer.byteLength(stderr) <= invocation.maxOutputBytes && Buffer.byteLength(finalText) <= invocation.maxOutputBytes, 'Retained output exceeds invocation budget');
  const parsed = parseCliEvents(raw, finalText, schemas[role], {stderr, configFile: retainedDiagnosticConfig(raw)});
  need(parsed.toolsObserved === 0 && parsed.diagnosticPolicyVersion === cliDiagnosticPolicyVersion, 'No-tool parser proof is missing');
  const sourceMap = read(root, files['private-source-map.json'].path);
  need(Array.isArray(request.images) && request.images.length > 0 && request.images.length <= 200 && sourceMap.length === request.images.length && new Set(request.images.map(image => image.path)).size === request.images.length, 'Missing or duplicated retained inputs');
  const inputs = request.images.map((image, index) => {
    need(/^images\/\d{3}\.(png|jpg|webp)$/.test(image.path) && image.path.slice(7, 10) === String(index).padStart(3, '0') && typeof image.label === 'string', 'Malformed anonymous input');
    const source = sourceMap[index];
    keys(source, ['path', 'source', 'sha256']);
    need(source.path === image.path && source.sha256 === image.sha256, 'Private source map differs from the request');
    const retained = ref(root, sibling(requestRef.path, 'inputs/' + path.posix.basename(image.path))), original = ref(root, source.source);
    need(retained.sha256 === image.sha256 && original.sha256 === image.sha256 && fs.statSync(safeFile(root, retained.path)).size === image.bytes && fs.statSync(safeFile(root, original.path)).size === image.bytes && image.bytes > 0 && image.bytes <= 25 * 1024 * 1024, 'Input or original evidence fingerprint differs');
    return {label: image.label, sha256: image.sha256, bytes: image.bytes, retained, original};
  });
  need(inputs.reduce((total, image) => total + image.bytes, 0) <= 200 * 1024 * 1024, 'Input byte budget exceeded');
  const manifest = [...request.images.map(({path, sha256}) => ({path, sha256})), {path: 'schema.json', sha256: hash(Buffer.from(JSON.stringify(request.outputSchema, null, 2) + '\n'))}];
  need(same(request.packetManifest, manifest), 'Historical packet manifest differs from retained bytes/schema');
  const prompt = request.instructions + '\n\n' + request.text + '\n\n' + request.images.map((image, index) => `Attached image ${index + 1}: ${image.label} (${image.path})`).join('\n') + '\n\nReturn only the final JSON matching the supplied schema. Read only these attached images and this evidence text. Use no tools, external sources, files, memories, implementation context or other conversations. If the evidence is insufficient, state the limitation within the permitted result; never invent an observation.\n';
  need(contents('prompt.txt') === prompt, 'Prompt differs from the immutable request');
  return {request, parsed, sourceMap, files, inputs, cliVersion: version, provenance: provenanceFor(request, parsed), effectiveFeatures};
}

function frameMap(root, transport, supplied) {
  const frames = new Map();
  for (const [index, image] of transport.request.images.entries()) {
    const lines = image.label.split('\n');
    if (lines.at(-1) === 'These frame IDs have identical verified pixels. Each retains its own capture context.') lines.pop();
    need(lines.length === 1 || supplied, 'Deduplicated frame aliases require the original complete FrameSet');
    let role;
    for (const [lineIndex, line] of lines.entries()) {
      const match = line.match(/^([a-z][a-z0-9-]*-\d+) (.+)$/);
      need(match && !frames.has(match[1]), 'Unknown or duplicated contextual frame ID');
      const id = match[1], currentRole = id.replace(/-\d+$/, ''), label = match[2];
      need(!role || role === currentRole, 'Aliases cannot cross frame roles'); role = currentRole;
      const provided = supplied?.find(frame => frame.id === id);
      if (supplied) { keys(provided, ['id', 'role', 'label', 'path', 'sha256']); need(provided.role === role && provided.label === label && provided.sha256 === image.sha256, 'Supplied contextual frame differs from its attached label'); }
      const evidence = provided ?? {id, role, label, path: transport.sourceMap[index].source, sha256: image.sha256};
      if (lineIndex === 0) need(evidence.path === transport.sourceMap[index].source, 'First contextual frame differs from private source map');
      verifyEvidence(root, [evidence]); frames.set(id, evidence);
    }
  }
  need(!supplied || supplied.length === frames.size, 'Contextual FrameSet has extra or missing frames');
  need(new Set([...frames.keys()].map(id => Number(id.match(/\d+$/)[0]))).size === frames.size && [...frames.keys()].map(id => Number(id.match(/\d+$/)[0])).sort((a, b) => a - b).every((number, index) => number === index), 'FrameSet global IDs are incomplete or aliased');
  return frames;
}

function resolve(frames, ids, role, label) {
  need(Array.isArray(ids) && ids.length > 0 && new Set(ids).size === ids.length, 'Missing or repeated result frame IDs');
  return ids.map(id => { const frame = frames.get(id); need(frame?.role === role && (!label || frame.label === label || frame.label.startsWith(label + ' ')), 'Result references the wrong role or state'); return {path: frame.path, sha256: frame.sha256}; });
}

function reviewer(context, transport, extra = {}) {
  need(typeof context.reviewerId === 'string' && context.reviewerId.length > 0, 'Reviewer identity is required');
  return {id: context.reviewerId, ...transport.provenance, ...extra};
}

/** Exact projection mirrors evidence.mjs/runner.mjs. Context contains envelope
 * facts, never substitute verdicts or findings. The caller must retain and bind
 * it; this function is also rerun at receipt validation, not merely at creation.
 */
export function projectCliReviewReport({root, transport, context}) {
  const {request} = transport, raw = clone(transport.parsed.result), role = request.role;
  if (context.bindings) { need(Array.isArray(context.bindings) && new Set(context.bindings.map(item => item.path)).size === context.bindings.length, 'Invalid context bindings'); for (const evidence of context.bindings) verifyEvidence(root, [evidence]); }
  const frames = frameMap(root, transport, context.frames);
  if (role === 'calibration') {
    need(typeof context.calibrationRevision === 'string' && context.calibrationRevision && typeof context.runId === 'string' && context.runId, 'Calibration revision and execution run identity are required');
    const order = bind(root, context.order);
    need(order.schemaVersion === 1 && order.samples?.length === 6 && (!order.runId || order.runId === context.runId) && new Set(order.samples.map(sample => sample.id)).size === 6 && raw.labels.length === 6 && new Set(raw.labels.map(item => item.label)).size === 6, 'Calibration must bind all six private labels');
    const samples = raw.labels.map(item => {
      const sample = order.samples.find(sample => sample.label === item.label), index = order.samples.indexOf(sample);
      need(sample && sample.label === String.fromCharCode(65 + index) && sample.states?.length === 8 && new Set(sample.states.map(state => state.viewport + ' ' + state.state)).size === 8 && /^[a-f0-9]{64}$/.test(sample.sourceSha256), 'Invalid private calibration order');
      for (const [stateIndex, state] of sample.states.entries()) {
        const frame = frames.get('sample-' + (index * 8 + stateIndex));
        need(frame?.label === `${sample.label} ${state.viewport} ${state.state}` && frame.path === state.path && frame.sha256 === state.sha256, 'Calibration source/order does not match attached FrameSet');
      }
      return {id: sample.id, sourceSha256: sample.sourceSha256, verdict: item.verdict, finding: item.finding, evidence: sample.states.map(({viewport, path, sha256}) => ({viewport, path, sha256}))};
    });
    need(frames.size === 48, 'Calibration requires exactly 48 contextual frames');
    return {schemaVersion: 2, purpose: 'reviewer-calibration', calibrationRevision: context.calibrationRevision, runId: context.runId, reviewer: reviewer(context, transport), samples};
  }
  need(typeof context.calibrationRunId === 'string' && context.calibrationRunId, 'The calibrated execution identity is required');
  need(role === 'reference-review' ? context.sourceSha256 === null : /^[a-f0-9]{64}$/.test(context.sourceSha256 ?? ''), 'Incorrect reviewed source identity');
  let text; try { text = JSON.parse(request.text); } catch { need(false, 'Role request text must be structured'); }
  if (role === 'style-review') {
    need(Array.isArray(context.comparisonCohort) && same(context.comparisonCohort.map(item => item.id), text.otherIds), 'Style cohort differs from the reviewed identities');
    const expected = context.comparisonCohort.flatMap(item => item.states.map(state => ({label: `${item.id} ${state.viewport} ${state.state}`, path: state.path, sha256: state.sha256})));
    const existing = [...frames.values()].filter(frame => frame.role === 'existing');
    need(expected.length === existing.length && expected.every(frame => existing.some(item => item.label === frame.label && item.path === frame.path && item.sha256 === frame.sha256)), 'Style cohort frames differ');
    return {...raw, sourceSha256: context.sourceSha256, comparisonCohort: context.comparisonCohort, reviewer: reviewer(context, transport, {calibrationRunId: context.calibrationRunId})};
  }
  if (role === 'controls-review') {
    need(text.responsiveFrames?.length === 20 && raw.responsiveChecks.length === 20 && new Set(raw.responsiveChecks.map(check => check.viewport + ':' + check.state)).size === 20, 'Controls require all twenty responsive state checks');
    const responsiveChecks = raw.responsiveChecks.map(({frames: ids, ...check}) => {
      const expected = text.responsiveFrames.filter(frame => frame.viewport === check.viewport && frame.state === check.state);
      need(expected.length === 1 && ids.includes(expected[0].frame), 'Responsive check omitted its actual contextual state');
      return {...check, evidence: resolve(frames, ids, 'responsive-composition')};
    });
    const runtime = bind(root, context.runtimeEvidence);
    need(runtime.sourceSha256 === context.sourceSha256 && runtime.responsive?.length === 20 && runtime.responsive.every(state => responsiveChecks.some(check => check.viewport === state.viewport && check.state === state.state && check.evidence.some(e => e.path === state.evidence.path && e.sha256 === state.evidence.sha256))), 'Controls runtime differs from reviewed responsive frames');
    return {...raw, responsiveChecks, sourceSha256: context.sourceSha256, phase: 'full-qa', reviewer: reviewer(context, transport, {calibrationRunId: context.calibrationRunId}), runtimeEvidence: context.runtimeEvidence, ...(raw.decision === 'reject' ? {vetoes: raw.findings} : {})};
  }
  const phase = role === 'reference-review' ? 'reference' : 'prototype', compareRole = phase === 'reference' ? 'reference' : 'candidate';
  need(typeof context.calibrationRevision === 'string' && context.calibrationRevision && /^[a-f0-9]{64}$/.test(context.benchmarkSha256 ?? ''), 'Comparison policy and benchmark identities are required');
  need(text.phase === phase && text.compareRole === compareRole && same(text.requiredDimensions, dimensions), 'Wrong pair-review phase/dimensions');
  for (const [frameRole, ids] of Object.entries(text.frameRoles ?? {})) need(same([...frames.values()].filter(frame => frame.role === frameRole).map(frame => frame.id).sort((a, b) => Number(a.match(/\d+$/)[0]) - Number(b.match(/\d+$/)[0])), ids), 'Pair-review role FrameSet differs');
  need(raw.dimensions.length === 7 && new Set(raw.dimensions.map(d => d.key)).size === 7 && (raw.decision !== 'admit' || raw.nextAction === 'admit'), 'Incomplete or conflicting review result');
  need(context.states?.length === 8 && raw.stateChecks.length === 8 && new Set(raw.stateChecks.map(check => check.viewport + ':' + check.state)).size === 8, 'Pair review requires eight contextual state checks');
  for (const state of context.states) {
    need(state.evidence?.length > 0, 'State evidence is missing');
    for (const evidence of state.evidence) need([...frames.values()].some(frame => frame.role === compareRole && frame.label === `${state.viewport} ${state.state}` && frame.path === evidence.path && frame.sha256 === evidence.sha256), 'State evidence aliases a different context');
  }
  // Preserve the existing implementation's shared vetoes/fixTasks array when
  // raw.decision is not admit, including its deterministic appended messages.
  const fixTasks = raw.fixTasks, vetoes = raw.decision === 'admit' ? [] : fixTasks;
  const report = {schemaVersion: 2, phase, calibrationRevision: context.calibrationRevision, benchmarkSha256: context.benchmarkSha256, sourceSha256: context.sourceSha256, reviewer: reviewer(context, transport, {inputScope: phase === 'reference' ? 'benchmark+negative+reference' : 'benchmark+negative+reference+candidate', calibrationRunId: context.calibrationRunId}), decision: raw.decision, vetoes, states: context.states, dimensions: raw.dimensions.map(d => ({...d, benchmarkEvidence: resolve(frames, d.benchmarkFrames, 'benchmark'), candidateEvidence: resolve(frames, d.candidateFrames, compareRole)})), signatureFeatures: raw.signatureFeatures.map(feature => ({...feature, role: 'signature', referenceEvidence: resolve(frames, feature.referenceFrames, 'reference'), ...(phase === 'prototype' ? {candidateEvidence: resolve(frames, feature.candidateFrames, 'candidate')} : {})})), motion: raw.motion.map(motion => ({...motion, evidence: resolve(frames, motion.frames, compareRole)})), nextAction: raw.nextAction, fixTasks};
  const strengthen = (veto, task) => { report.decision = 'reject'; report.nextAction = 'replace-direction'; vetoes.push(veto); fixTasks.push(task); };
  if (raw.signatureFeatures.some(feature => !feature.core || !feature.retained || !feature.sceneLevel)) strengthen('核心视觉特征丢失，不能用总评通过抵消', '核心失败退回静态计划，不进行局部收尾');
  if (raw.dimensions.some(d => d.againstBenchmark === 'below')) strengthen('存在低于基准的品质维度', '修改静态计划和试片后重新比较，不允许平均补偿');
  if ((text.expectedSignatures ?? []).some(feature => !raw.signatureFeatures.some(actual => actual.name === feature.name))) strengthen('试片审查遗漏了母版核心特征', '重新选择能保留全部核心特征的方向');
  report.visualContract = text.visualContract; report.visualContractSha256 = visualContractHash(text.visualContract);
  report.stateChecks = raw.stateChecks.map(({frames: ids, ...check}) => {
    const state = context.states.find(state => state.viewport === check.viewport && state.state === check.state);
    const evidence = resolve(frames, ids, compareRole);
    need(state && evidence.some(frame => state.evidence.some(actual => actual.path === frame.path && actual.sha256 === frame.sha256)), 'State check references a different contextual state');
    return {...check, evidence};
  });
  report.continuityChecks = raw.continuityChecks.map(({frames: ids, ...check}) => ({...check, evidence: resolve(frames, ids, compareRole)}));
  const preservation = [...report.stateChecks.flatMap(check => ['subject', 'material', 'composition', 'role'].map(key => check[key])), ...report.continuityChecks.map(check => check.status)];
  if (preservation.some(status => status !== 'preserved')) {
    const lost = preservation.includes('lost') || report.decision === 'reject'; report.decision = lost ? 'reject' : 'evidence-needed'; report.nextAction = lost ? 'replace-direction' : 'recapture';
    vetoes.push('四状态主体、材质、构图、作用或身份关系未完整保留'); fixTasks.push('修订已锁定的视觉合同或补齐实际状态证据，不能用局部润色抵消核心失败');
  }
  if (report.decision === 'reject' && !vetoes.length) { vetoes.push('独立视觉审查拒绝此版本，不能继续打包'); fixTasks.push('按成对画面中的明确差距修订静态计划'); }
  return report;
}

const implementationFiles = () => ['cli-review-receipt.mjs', 'cli-review.mjs', 'schemas.mjs', 'session-review.mjs', 'visual-contract.mjs', 'api.mjs'].map(name => path.join(path.dirname(fileURLToPath(import.meta.url)), name));
function implementations(root) {
  return implementationFiles().map(file => { const relative = path.relative(path.resolve(root), file).replaceAll('\\', '/'); return ref(root, relative); });
}

/** Create in a NEW directory, never rewrite historical pending/raw receipts.
 * report must exactly equal the role projection. Its hash additionally binds
 * the whole canonical envelope; a report hash alone is not semantic proof.
 */
export function createCliReviewConsumptionReceipt({root, request, role, context: contextRef, report, directory}) {
  const transport = validateCliReviewTransport({root, request, role}), context = bind(root, contextRef);
  const expected = projectCliReviewReport({root, transport, context});
  need(same(reportBody(report), expected), 'Canonical report differs from the exact raw-result projection');
  const permittedDirectory = typeof directory === 'string' && (directory.startsWith('.webart/') || /^docs\/production\/runs\/[a-z0-9-]+\/cli-review\/[a-z0-9-]+\/consumed(?:\/[a-z0-9-]+)*$/.test(directory));
  need(permittedDirectory && !directory.includes('\\') && directory.split('/').every(part => part && part !== '.' && part !== '..'), 'Use a new private or durable production-run project-relative receipt directory');
  const parent = path.posix.dirname(directory); safeFile(root, parent);
  const destination = path.join(path.resolve(root), ...directory.split('/'));
  need(!fs.existsSync(destination), 'Consumption receipt directory already exists');
  fs.mkdirSync(destination);
  const reportFile = directory + '/canonical-report.json';
  fs.writeFileSync(path.join(destination, 'canonical-report.json'), JSON.stringify(expected, null, 2) + '\n', {flag: 'wx'});
  const receipt = {schemaVersion: 1, kind: 'portable-cli-review-consumption', policyVersion: cliReceiptPolicyVersion, diagnosticPolicyVersion: cliDiagnosticPolicyVersion, requestId: transport.request.id, role, request, context: contextRef, rawFiles: transport.files, inputs: transport.inputs, implementations: implementations(root), canonicalReport: ref(root, reportFile), canonicalReportSha256: canonicalCliReportHash(expected), resultProjection: 'exact-role-projection-recomputed-at-validation', cliVersion: transport.cliVersion, provenance: transport.provenance, threadId: transport.parsed.threadId, eventCount: transport.parsed.eventCount, usage: transport.parsed.usage, diagnostics: transport.parsed.diagnostics, stderrDiagnostics: transport.parsed.stderrDiagnostics, cliInvocations: 1, automaticAdapterRetries: 0, backendRequestCount: null, toolsObserved: 0, effectiveFeatures: transport.effectiveFeatures, externalFilesystemSandboxCertified: false, historicalPacketFilesystemReverified: false, validationReadsExternalPacket: false, visualAdmissionGranted: false, createdAt: new Date().toISOString()};
  const receiptFile = directory + '/receipt.json';
  fs.writeFileSync(path.join(destination, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
  const evidence = ref(root, receiptFile);
  validateCliReviewConsumptionReceipt({root, receipt: evidence, role, report});
  return evidence;
}

export function validateCliReviewConsumptionReceipt({root, receipt: receiptRef, role, report}) {
  const receipt = bind(root, receiptRef);
  need(receipt.schemaVersion === 1 && receipt.kind === 'portable-cli-review-consumption' && receipt.policyVersion === cliReceiptPolicyVersion && receipt.diagnosticPolicyVersion === cliDiagnosticPolicyVersion && receipt.role === role, 'Wrong consumption receipt role or policy');
  const transport = validateCliReviewTransport({root, request: receipt.request, role});
  const context = bind(root, receipt.context), expected = projectCliReviewReport({root, transport, context});
  const canonicalReport = bind(root, receipt.canonicalReport);
  need(same(receipt.rawFiles, transport.files) && same(receipt.inputs, transport.inputs) && same(receipt.implementations, implementations(root)), 'Consumed files, sources or implementation changed');
  need(receipt.requestId === transport.request.id && same(receipt.provenance, transport.provenance) && receipt.cliVersion === transport.cliVersion && receipt.threadId === transport.parsed.threadId && receipt.eventCount === transport.parsed.eventCount && same(receipt.usage, transport.parsed.usage) && same(receipt.diagnostics, transport.parsed.diagnostics) && same(receipt.stderrDiagnostics, transport.parsed.stderrDiagnostics) && same(receipt.effectiveFeatures, transport.effectiveFeatures), 'Consumed execution proof differs');
  need(receipt.resultProjection === 'exact-role-projection-recomputed-at-validation' && receipt.cliInvocations === 1 && receipt.automaticAdapterRetries === 0 && receipt.backendRequestCount === null && receipt.toolsObserved === 0 && receipt.externalFilesystemSandboxCertified === false && receipt.historicalPacketFilesystemReverified === false && receipt.validationReadsExternalPacket === false && receipt.visualAdmissionGranted === false, 'Receipt overstates isolation, execution or admission');
  need(same(canonicalReport, expected) && same(reportBody(report), expected) && receipt.canonicalReportSha256 === canonicalCliReportHash(expected), 'Report was promoted or changed from the exact raw-result projection');
  if (report.reviewReceipt) need(same(report.reviewReceipt, receiptRef), 'Report references another consumption receipt');
  return {receipt, report: expected, result: transport.parsed.result, provenance: transport.provenance};
}
