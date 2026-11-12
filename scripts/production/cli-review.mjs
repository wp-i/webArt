import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {hash, imageInput, ProductionError} from './api.mjs';
import {validateStructured} from './session-review.mjs';

const roles = new Set(['calibration', 'reference-review', 'prototype-review', 'style-review', 'controls-review']);
export const disabledCliFeatures = Object.freeze([
  // unified_exec is always enabled in this CLI; shell_tool disables command tools.
  'shell_tool', 'unified_exec_tty', 'shell_snapshot', 'apps', 'plugins', 'hooks',
  'memories', 'multi_agent', 'multi_agent_v2', 'view_image', 'browser_use',
  'browser_use_external', 'browser_use_full_cdp_access', 'computer_use', 'in_app_browser',
  'code_mode', 'code_mode_host', 'workspace_dependencies', 'skill_search',
  'skill_mcp_dependency_install', 'sleep_tool', 'goals', 'tool_suggest',
  'external_agent_memory_import', 'unbounded_connection_retries', 'image_generation',
  'remote_plugin', 'browser_annotation_api', 'in_app_local_automation',
]);
const settings = Object.freeze([
  'project_doc_max_bytes=0', 'history.persistence="none"', 'web_search="disabled"',
  'memories.use_memories=false', 'memories.generate_memories=false',
  'features.skip_host_skill_discovery=true',
  'mcp_servers={}',
]);
const need = (condition, code, message) => { if (!condition) throw new ProductionError(code, message); };
const inside = (root, file) => { const relative = path.relative(root, file); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
const write = (file, value) => fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
const shaFile = file => hash(fs.readFileSync(file));

// V1 admits only the diagnostics observed in the retained CLI calibration.
// It is a message/shape allowlist, never an error severity override.
export const cliDiagnosticPolicyVersion = 'codex-cli-review-diagnostics-v1';
const defaultConfigFile = () => path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml');
export const cliDiagnosticMessages = Object.freeze({
  codeModeDisabled: 'Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.',
  connectionReset: 'stream disconnected before completion: IO error: 远程主机强迫关闭了一个现有的连接。 (os error 10054)',
});
export const cliSkillDiscoveryWarning = (configFile = defaultConfigFile()) => 'Under-development features enabled: skip_host_skill_discovery. Under-development features are incomplete and may behave unpredictably. To suppress this warning, set `suppress_unstable_features_warning = true` in ' + configFile + '.';
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');

function classifyDiagnostic(event, configFile) {
  const itemShape = exactKeys(event, ['type', 'item']) && event.type === 'item.completed' && exactKeys(event.item, ['id', 'type', 'message']) && event.item.type === 'error' && /^item_\d+$/.test(event.item.id);
  if (itemShape && event.item.message === cliSkillDiscoveryWarning(configFile)) return {kind: 'startup-skip-host-skill-discovery', message: event.item.message};
  if (itemShape && event.item.message === cliDiagnosticMessages.codeModeDisabled) return {kind: 'startup-code-mode-disabled', message: event.item.message};
  if (itemShape && event.item.message === 'Falling back from WebSockets to HTTPS transport. ' + cliDiagnosticMessages.connectionReset) return {kind: 'https-fallback', message: event.item.message};
  if (exactKeys(event, ['type', 'message']) && event.type === 'error') {
    for (let attempt = 1; attempt <= 5; attempt++) {
      if (event.message === `Reconnecting... ${attempt}/5 (${cliDiagnosticMessages.connectionReset})`) return {kind: 'recoverable-connection-reset', attempt, message: event.message};
    }
  }
  return null;
}

function parseCliStderr(stderr, diagnostics) {
  let retryLogs = 0, fallbackLogs = 0, turnId = null, bannerModel = null;
  const retryPrefix = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)  WARN codex_core::responses_retry: stream disconnected - retrying sampling request \(([1-5])\/5 in (?:\d+ms|\d+\.\d+s)\)\.\.\. turn_id=([a-f0-9-]{36}) retries=([1-5]) max_retries=5 sampling_error=(.*)$/;
  for (const line of stderr.split(/\r?\n/).filter(line => line.trim())) {
    const retry = line.match(retryPrefix);
    if (retry && retry[2] === retry[4] && Number(retry[2]) === retryLogs + 1 && retry[5] === cliDiagnosticMessages.connectionReset && (!turnId || turnId === retry[3])) {
      need(diagnostics.some(entry => entry.kind === 'recoverable-connection-reset'), 'cli-review-runtime-error', 'Unpaired retry diagnostics in CLI stderr');
      retryLogs++; turnId = retry[3]; continue;
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z  WARN codex_core::client: falling back to HTTP$/.test(line) && fallbackLogs === 0 && diagnostics.some(entry => entry.kind === 'https-fallback')) { fallbackLogs++; continue; }
    const model = line.match(/^model:\s*([a-zA-Z0-9._:-]+)\s*$/);
    if (model && !bannerModel) { bannerModel = model[1]; continue; }
    throw new ProductionError('cli-review-runtime-error', 'CLI stderr contains an unrecognized diagnostic; no review receipt was granted');
  }
  return {retryLogs, fallbackLogs, bannerModel};
}

export function sanitizedCliEnvironment(environment = process.env) {
  return Object.fromEntries(Object.entries(environment).filter(([key]) => {
    if (/^CODEX_/i.test(key)) return key.toUpperCase() === 'CODEX_HOME';
    if (/^(OPENAI_|WEBART_|NPM_|npm_|PWD$|OLDPWD$|INIT_CWD$)/.test(key)) return false;
    return !/(?:^|_)(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|TOKEN|SECRET|PASSWORD|CREDENTIAL)(?:$|_)/i.test(key);
  }));
}

export function buildCliArgs({packetDirectory, imageFiles, schemaFile, finalFile, model}) {
  const args = ['--no-daemon', '--ask-for-approval', 'never', 'exec', '--ignore-user-config',
    '--strict-config', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
    '--color', 'never', '--json', '--cd', packetDirectory,
    '--output-schema', schemaFile, '--output-last-message', finalFile];
  for (const value of settings) args.push('--config', value);
  for (const name of disabledCliFeatures) args.push('--disable', name);
  if (model) args.push('--model', model);
  for (const file of imageFiles) args.push('--image', file);
  return [...args, '--', '-'];
}

function terminateTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const taskkill = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
    const killer = spawn(taskkill, ['/PID', String(child.pid), '/T', '/F'], {shell: false, windowsHide: true, stdio: 'ignore'});
    killer.on('error', () => { try { child.kill('SIGKILL'); } catch {} });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} }
  }
}

export function runCliProcess({executable, args, cwd, environment, input = '', deadlineMs, maxOutputBytes, signal, spawnImpl = spawn}) {
  return new Promise(resolve => {
    const stdout = [], stderr = []; let size = 0, failure = null, finished = false, child;
    const done = (exitCode = null, exitSignal = null) => {
      if (finished) return; finished = true; clearTimeout(timer); clearTimeout(forceTimer);
      signal?.removeEventListener('abort', abort);
      resolve({stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), exitCode, exitSignal, failure});
    };
    const stop = reason => {
      if (failure || finished) return; failure = reason; terminateTree(child);
      forceTimer = setTimeout(() => { child.stdout?.destroy(); child.stderr?.destroy(); child.stdin?.destroy(); child.unref(); done(); }, 2000);
    };
    const abort = () => stop('interrupted');
    let timer, forceTimer;
    try { child = spawnImpl(executable, args, {cwd, env: environment, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe']}); }
    catch (error) { failure = 'spawn-error'; done(); return; }
    const collect = target => bytes => {
      if (failure) return;
      size += bytes.length;
      if (size > maxOutputBytes) { stop('output-limit'); return; }
      target.push(Buffer.from(bytes));
    };
    child.stdout.on('data', collect(stdout)); child.stderr.on('data', collect(stderr));
    child.once('error', () => { failure = 'spawn-error'; done(); });
    child.once('close', done);
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') stop('stdin-error'); });
    timer = setTimeout(() => stop('deadline'), deadlineMs);
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) abort();
    else child.stdin.end(input, 'utf8');
  });
}

export function parseCliEvents(raw, finalText, schema, {stderr = '', configFile = defaultConfigFile()} = {}) {
  let events;
  try { events = raw.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line)); }
  catch { throw new ProductionError('cli-review-invalid-events', 'CLI output is not complete JSONL'); }
  let thread, started = 0, completed = 0, final, usage = null, actualModel = null;
  const messages = [], diagnostics = [];
  let reconnectAttempt = 0, fallback = false;
  for (const [eventIndex, event] of events.entries()) {
    need(event && typeof event.type === 'string', 'cli-review-invalid-events', 'CLI event has no type');
    if (event.type === 'error' || event.type === 'turn.failed' || event.item?.type === 'error') {
      const diagnostic = classifyDiagnostic(event, configFile);
      need(diagnostic && thread && !completed && messages.length === 0, 'cli-review-runtime-error', 'CLI emitted a failed or unrecognized runtime diagnostic; no review receipt was granted');
      if (diagnostic.kind.startsWith('startup-')) {
        need(started === 0 && !diagnostics.some(entry => entry.kind === diagnostic.kind), 'cli-review-runtime-error', 'Startup diagnostic appeared outside fresh-thread startup or was duplicated');
      } else if (diagnostic.kind === 'recoverable-connection-reset') {
        need(started === 1 && !fallback && diagnostic.attempt > reconnectAttempt, 'cli-review-runtime-error', 'Reconnect diagnostic is out of order'); reconnectAttempt = diagnostic.attempt;
      } else {
        need(started === 1 && reconnectAttempt > 0 && !fallback, 'cli-review-runtime-error', 'HTTPS fallback is missing a preceding recoverable reconnect or is duplicated'); fallback = true;
      }
      diagnostics.push({eventIndex, ...diagnostic}); continue;
    }
    need(!Object.hasOwn(event, 'error') && !Object.hasOwn(event.item ?? {}, 'error'), 'cli-review-runtime-error', 'CLI event carries an error');
    if (event.type === 'thread.started') {
      need(exactKeys(event, ['type', 'thread_id']) && !thread && typeof event.thread_id === 'string' && event.thread_id.length > 0 && !started, 'cli-review-invalid-events', 'Expected one fresh CLI thread'); thread = event.thread_id;
    } else if (event.type === 'turn.started') {
      need(exactKeys(event, ['type']) && thread && ++started === 1 && !completed, 'cli-review-invalid-events', 'Expected one review turn');
    } else if (event.type === 'turn.completed') {
      need(Object.keys(event).every(key => ['type', 'usage', 'model'].includes(key)) && started === 1 && ++completed === 1 && messages.length === 1, 'cli-review-invalid-events', 'Review completion is missing, duplicated or has unsupported fields');
      usage = event.usage ?? null; actualModel = typeof event.model === 'string' ? event.model : null;
    } else if (['item.started', 'item.updated', 'item.completed'].includes(event.type)) {
      need(exactKeys(event, ['type', 'item']) && started === 1 && completed === 0 && ['reasoning', 'agent_message'].includes(event.item?.type) && typeof event.item.id === 'string' && event.item.id.length > 0 && Object.keys(event.item).every(key => ['id', 'type', 'text'].includes(key)) && (!Object.hasOwn(event.item, 'text') || typeof event.item.text === 'string'), 'cli-review-tool-or-unknown-event', 'Only evidence reasoning and a final message are allowed; no tools');
      if (event.item.type === 'agent_message' && event.type === 'item.completed') {
        need(typeof event.item.text === 'string', 'cli-review-invalid-events', 'Final review message must contain text'); messages.push(event.item.text);
      }
    } else throw new ProductionError('cli-review-tool-or-unknown-event', 'CLI failed or emitted an unsupported event: ' + event.type);
  }
  need(thread && started === 1 && completed === 1 && messages.length === 1, 'cli-review-incomplete', 'CLI did not complete exactly one review');
  need(messages[0].trim() === finalText.trim(), 'cli-review-output-mismatch', 'Final file differs from the completed agent message');
  try { final = JSON.parse(finalText); } catch { throw new ProductionError('cli-review-invalid-json', 'Review is not a complete JSON result'); }
  validateStructured(final, schema);
  const stderrDiagnostics = parseCliStderr(stderr, diagnostics);
  return {result: final, threadId: thread, usage, actualModel, eventCount: events.length, toolsObserved: 0, diagnosticPolicyVersion: cliDiagnosticPolicyVersion, diagnostics, stderrDiagnostics};
}

export class CodexCliReviewClient {
  constructor({root, directory, executable = 'codex', model, signal, maxRequests = 1, deadlineMs = 300000,
    maxOutputBytes = 2 * 1024 * 1024, environment = process.env, spawnImpl = spawn, onUsage = () => {}, onPending = () => {}}) {
    this.root = fs.realpathSync(root); this.directory = path.resolve(this.root, directory);
    need(inside(this.root, this.directory) && this.directory !== this.root, 'cli-review-configuration', 'Use a private review artifact directory');
    need(Number.isInteger(maxRequests) && maxRequests > 0 && maxRequests <= 64 && Number.isInteger(deadlineMs) && deadlineMs >= 10 && deadlineMs <= 300000 && Number.isInteger(maxOutputBytes) && maxOutputBytes >= 1024 && maxOutputBytes <= 8 * 1024 * 1024, 'cli-review-configuration', 'Invalid fixed CLI review budgets');
    need(model === undefined || typeof model === 'string' && /^[a-zA-Z0-9._:-]{1,100}$/.test(model), 'cli-review-configuration', 'Invalid model identifier');
    Object.assign(this, {executable, requestedModel: model ?? null, signal, maxRequests, deadlineMs, maxOutputBytes, spawnImpl, onUsage, onPending});
    this.environment = sanitizedCliEnvironment(environment); this.requests = 0; this.execution = 'fresh-codex-cli-evidence-review';
    this.model = model ?? 'codex-account-default';
    this.reviewerMetadata = {mode: 'evidence-only-fresh-codex-cli', kind: 'fresh-codex-cli', independent: false, contextIsolated: false, contextIsolationScope: 'fresh conversation; implementation history not supplied', implementationContextIncluded: false, backendIndependenceEstablished: false, requestedModel: this.requestedModel, actualModel: null};
  }

  async json({role, instructions, text, images = [], schema, search = false}) {
    this.lastReviewReceipt = undefined;
    this.reviewerMetadata = {...this.reviewerMetadata, contextIsolated: false, actualModel: null};
    need(!search && roles.has(role) && typeof instructions === 'string' && typeof text === 'string', 'cli-review-role', 'Only fixed evidence review roles are allowed');
    need(!this.signal?.aborted, 'cli-review-interrupted', 'Review interrupted before launch');
    need(++this.requests <= this.maxRequests, 'cli-review-budget', 'CLI invocation budget exceeded; no retry was started');
    const id = String(this.requests).padStart(2, '0') + '-' + role + '-' + crypto.randomBytes(5).toString('hex');
    const directory = path.join(this.directory, id); fs.mkdirSync(directory, {recursive: true});
    const packetDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'webart-cli-evidence-'));
    need(!inside(this.root, fs.realpathSync(packetDirectory)), 'cli-review-isolation', 'Review packet must be outside the project');
    fs.mkdirSync(path.join(packetDirectory, 'images')); fs.mkdirSync(path.join(directory, 'inputs'));
    const startedAt = new Date().toISOString(), startedMs = Date.now(), evidence = [], sourceMap = [], manifest = [];
    let requestFile, requestSha256;
    this.lastAttempt = {id, directory, packetDirectory, status: 'preparing', visualAdmissionGranted: false};
    try {
      let label;
      for (const input of images) {
        if (input.type === 'input_text') { need(label === undefined && typeof input.text === 'string', 'cli-review-image', 'Each image needs exactly one label'); label = input.text; continue; }
        need(input.type === 'input_image' && input.evidence && label !== undefined, 'cli-review-image', 'Only verified local image evidence is allowed');
        const source = fs.realpathSync(input.evidence.path);
        need(inside(this.root, source) && fs.statSync(source).isFile(), 'cli-review-image', 'Image source is outside the project');
        const bytes = fs.readFileSync(source), sha256 = hash(bytes);
        need(bytes.length > 0 && bytes.length <= 25 * 1024 * 1024 && sha256 === input.evidence.sha256 && imageInput(source, label)[1].image_url === input.image_url, 'cli-review-image', 'Image bytes do not match the supplied evidence');
        const extension = input.image_url.startsWith('data:image/png;') ? '.png' : input.image_url.startsWith('data:image/jpeg;') ? '.jpg' : '.webp';
        const anonymous = 'images/' + String(evidence.length).padStart(3, '0') + extension;
        const target = path.join(packetDirectory, anonymous); write(target, bytes); write(path.join(directory, 'inputs', path.basename(target)), bytes);
        evidence.push({path: anonymous, sha256, label, bytes: bytes.length}); sourceMap.push({path: anonymous, source: path.relative(this.root, source).replaceAll('\\', '/'), sha256}); manifest.push({path: anonymous, sha256}); label = undefined;
      }
      need(label === undefined && evidence.length > 0 && evidence.length <= 200 && evidence.reduce((sum, e) => sum + e.bytes, 0) <= 200 * 1024 * 1024, 'cli-review-image', 'Missing evidence or image budget exceeded');
      const schemaBytes = JSON.stringify(schema, null, 2) + '\n', lockedSchema = JSON.parse(schemaBytes), schemaFile = path.join(packetDirectory, 'schema.json'), finalFile = path.join(packetDirectory, 'final.json');
      write(schemaFile, schemaBytes); manifest.push({path: 'schema.json', sha256: hash(Buffer.from(schemaBytes))});
      const args = buildCliArgs({packetDirectory, imageFiles: evidence.map(e => path.join(packetDirectory, e.path)), schemaFile, finalFile, model: this.requestedModel});
      const prompt = instructions + '\n\n' + text + '\n\n' + evidence.map((e, i) => `Attached image ${i + 1}: ${e.label} (${e.path})`).join('\n') + '\n\nReturn only the final JSON matching the supplied schema. Read only these attached images and this evidence text. Use no tools, external sources, files, memories, implementation context or other conversations. If the evidence is insufficient, state the limitation within the permitted result; never invent an observation.\n';
      write(path.join(directory, 'private-source-map.json'), sourceMap); write(path.join(directory, 'prompt.txt'), prompt);
      const request = {schemaVersion: 1, id, role, startedAt, execution: this.execution, requestedModel: this.requestedModel, provenance: {...this.reviewerMetadata}, instructions, text, images: evidence, outputSchema: schema, packetDirectory, packetManifest: manifest, invocation: {executable: this.executable, args, shell: false, environmentPolicy: 'CODEX context and credential variables removed; existing CODEX_HOME authentication retained', requestedDisabledFeatures: disabledCliFeatures, effectiveFeatureProbeFile: path.join(directory, 'feature-probe.json'), deadlineMs: this.deadlineMs, maxOutputBytes: this.maxOutputBytes, automaticAdapterRetries: 0}};
      requestFile = path.join(directory, 'request.json'); write(requestFile, request); requestSha256 = shaFile(requestFile);
      this.lastAttempt = {...this.lastAttempt, status: 'running', requestFile, requestSha256}; this.onPending({...this.lastAttempt});
      const version = await runCliProcess({executable: this.executable, args: ['--version'], cwd: packetDirectory, environment: this.environment, deadlineMs: Math.min(10000, this.deadlineMs), maxOutputBytes: 4096, signal: this.signal, spawnImpl: this.spawnImpl});
      write(path.join(directory, 'version.stdout.txt'), version.stdout); write(path.join(directory, 'version.stderr.txt'), version.stderr);
      need(version.exitCode === 0 && !version.failure && /^codex-cli [^\r\n]+\s*$/.test(version.stdout.toString('utf8')), 'cli-review-version', 'CLI version probe did not complete');
      const cliVersion = version.stdout.toString('utf8').trim();
      const featureArgs = disabledCliFeatures.flatMap(name => ['--disable', name]);
      featureArgs.push('--config', 'features.skip_host_skill_discovery=true', 'features', 'list');
      const featureProbe = await runCliProcess({executable: this.executable, args: featureArgs, cwd: packetDirectory, environment: this.environment, deadlineMs: Math.max(1, Math.min(10000, this.deadlineMs - (Date.now() - startedMs))), maxOutputBytes: 32768, signal: this.signal, spawnImpl: this.spawnImpl});
      write(path.join(directory, 'feature-probe.stdout.txt'), featureProbe.stdout); write(path.join(directory, 'feature-probe.stderr.txt'), featureProbe.stderr);
      const effectiveFeatures = Object.fromEntries(featureProbe.stdout.toString('utf8').split(/\r?\n/).map(line => line.match(/^(\S+)\s+.+\s+(true|false)\s*$/)).filter(Boolean).map(match => [match[1], match[2] === 'true']));
      const featureProbeFile = path.join(directory, 'feature-probe.json');
      write(featureProbeFile, {requestedDisabledFeatures: disabledCliFeatures, effectiveFeatures, exitCode: featureProbe.exitCode, failure: featureProbe.failure, resolverScope: 'local feature resolver with explicit per-call overrides; exec separately ignores user config', commandToolsControlledBy: 'features.shell_tool=false', unifiedExecOptOutSupported: effectiveFeatures.unified_exec === false});
      need(featureProbe.exitCode === 0 && !featureProbe.failure && disabledCliFeatures.every(name => effectiveFeatures[name] === false) && effectiveFeatures.skip_host_skill_discovery === true, 'cli-review-features', 'CLI capability restrictions were not validated; no review was launched');
      const remaining = this.deadlineMs - (Date.now() - startedMs);
      need(remaining > 0, 'cli-review-timeout', 'Review deadline elapsed before model launch');
      const run = await runCliProcess({executable: this.executable, args, cwd: packetDirectory, environment: this.environment, input: prompt, deadlineMs: remaining, maxOutputBytes: this.maxOutputBytes, signal: this.signal, spawnImpl: this.spawnImpl});
      write(path.join(directory, 'events.jsonl'), run.stdout); write(path.join(directory, 'stderr.txt'), run.stderr);
      write(path.join(directory, 'process.json'), {cliVersion, exitCode: run.exitCode, exitSignal: run.exitSignal, failure: run.failure, elapsedMs: Date.now() - startedMs});
      need(!run.failure, 'cli-review-' + (run.failure ?? 'failed'), 'CLI review did not complete: ' + run.failure);
      need(run.exitCode === 0, 'cli-review-exit', 'CLI exited unsuccessfully; evidence review remains pending');
      need(fs.existsSync(finalFile) && fs.lstatSync(finalFile).isFile() && !fs.lstatSync(finalFile).isSymbolicLink() && fs.statSync(finalFile).size <= this.maxOutputBytes, 'cli-review-final', 'CLI final result is missing or too large');
      const finalBytes = fs.readFileSync(finalFile); write(path.join(directory, 'response.json'), finalBytes);
      const parsed = parseCliEvents(run.stdout.toString('utf8'), finalBytes.toString('utf8'), lockedSchema, {stderr: run.stderr.toString('utf8'), configFile: path.join(this.environment.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml')});
      need(shaFile(requestFile) === requestSha256, 'cli-review-tamper', 'Immutable review request changed');
      for (const item of manifest) need(shaFile(path.join(packetDirectory, item.path)) === item.sha256, 'cli-review-tamper', 'Review packet changed during execution');
      for (const item of evidence) need(shaFile(path.join(directory, 'inputs', path.basename(item.path))) === item.sha256, 'cli-review-tamper', 'Preserved input evidence changed during execution');
      for (const item of sourceMap) need(shaFile(path.join(this.root, item.source)) === item.sha256, 'cli-review-tamper', 'Original evidence changed during review');
      const actualFiles = fs.readdirSync(packetDirectory, {recursive: true}).filter(f => fs.statSync(path.join(packetDirectory, f)).isFile()).map(f => f.replaceAll('\\', '/')).sort();
      need(JSON.stringify(actualFiles) === JSON.stringify([...manifest.map(e => e.path), 'final.json'].sort()), 'cli-review-tamper', 'Unexpected files appeared in the evidence packet');
      const bannerModel = parsed.stderrDiagnostics.bannerModel;
      const provenance = {...this.reviewerMetadata, contextIsolated: true, actualModel: parsed.actualModel ?? bannerModel, modelIdentitySource: parsed.actualModel ? 'turn.completed.model' : bannerModel ? 'cli.stderr.banner' : null};
      const responseFile = path.join(directory, 'response.json'), eventsFile = path.join(directory, 'events.jsonl');
      const receipt = {schemaVersion: 1, requestId: id, role, execution: this.execution, requestFile, requestSha256, responseFile, responseSha256: shaFile(responseFile), eventsFile, eventsSha256: shaFile(eventsFile), stderrFile: path.join(directory, 'stderr.txt'), stderrSha256: shaFile(path.join(directory, 'stderr.txt')), featureProbe: {path: featureProbeFile, sha256: shaFile(featureProbeFile)}, cliVersion, provenance, threadId: parsed.threadId, usage: parsed.usage, backendRequestCount: null, cliInvocations: 1, automaticAdapterRetries: 0, eventCount: parsed.eventCount, diagnosticPolicyVersion: parsed.diagnosticPolicyVersion, diagnostics: parsed.diagnostics, stderrDiagnostics: parsed.stderrDiagnostics, completedAt: new Date().toISOString(), isolationEvidence: {freshThread: true, ephemeral: true, toolsObserved: parsed.toolsObserved, packetOutsideProject: true, packetAndSourcesReverified: true, requestedDisabledFeatures: disabledCliFeatures, effectiveFeatures, commandToolsControlledBy: 'features.shell_tool=false', externalFilesystemSandboxCertified: false}, visualAdmissionGranted: false};
      const receiptFile = path.join(directory, 'receipt.json'); write(receiptFile, receipt);
      this.reviewerMetadata = provenance; this.lastReviewReceipt = {path: path.relative(this.root, receiptFile).replaceAll('\\', '/'), sha256: shaFile(receiptFile)};
      this.lastAttempt = {...this.lastAttempt, status: 'completed-structured-review', receiptFile, cliVersion, provenance};
      this.onUsage({role, cliVersion, requestedModel: this.requestedModel, actualModel: provenance.actualModel, usage: parsed.usage, cliInvocations: 1, backendRequestCount: null});
      return parsed.result;
    } catch (error) {
      this.lastAttempt = {...this.lastAttempt, status: 'pending', failure: {code: error.code ?? 'cli-review-error', message: error.message}, elapsedMs: Date.now() - startedMs};
      write(path.join(directory, 'failure.json'), {...this.lastAttempt, provenance: {...this.reviewerMetadata, contextIsolated: false}, visualAdmissionGranted: false});
      throw error;
    }
  }
}
