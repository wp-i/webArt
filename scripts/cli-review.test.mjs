import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {CodexCliReviewClient, buildCliArgs, sanitizedCliEnvironment, disabledCliFeatures, parseCliEvents, cliDiagnosticPolicyVersion, cliDiagnosticMessages, cliSkillDiscoveryWarning} from './production/cli-review.mjs';
import {imageInput, hash} from './production/api.mjs';

// Controlled subprocesses exercise the transport. They do not evaluate art or grant admission.
const schema = {type: 'object', additionalProperties: false, required: ['decision'], properties: {decision: {type: 'string', enum: ['reject', 'evidence-needed']}}};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jShoAAAAASUVORK5CYII=', 'base64');
const fixtureSource = `import fs from 'node:fs';
import path from 'node:path';
const [mode, ...args] = process.argv.slice(2);
if(args.includes('--version')) { console.log('codex-cli controlled-transport-fixture'); process.exit(0); }
if(args.includes('features')) { for(const name of ${JSON.stringify(disabledCliFeatures)}) console.log(name+' stable false'); console.log('skip_host_skill_discovery experimental true'); console.log('unified_exec stable true'); process.exit(0); }
const target=args[args.indexOf('--output-last-message')+1];
const packet=args[args.indexOf('--cd')+1];
let prompt='';for await (const bytes of process.stdin) prompt+=bytes;
if(mode==='deadline') { setInterval(()=>{},1000); }
else if(mode==='oversize') { console.log('x'.repeat(20000)); }
else {
 let answer=mode==='invalid-schema'?'{"decision":"admit"}':'{"decision":"reject"}';
 fs.writeFileSync(target, mode==='mismatch'?'{"decision":"evidence-needed"}':answer);
 const events=[{type:'thread.started',thread_id:'controlled-not-model-thread'}, {type:'turn.started'}];
 if(mode.startsWith('known-diagnostics')) {
  events.splice(1,0,{type:'item.completed',item:{id:'item_0',type:'error',message:${JSON.stringify(cliSkillDiscoveryWarning())}}},{type:'item.completed',item:{id:'item_1',type:'error',message:${JSON.stringify(cliDiagnosticMessages.codeModeDisabled)}}});
  events.push({type:'error',message:${JSON.stringify('Reconnecting... 2/5 (' + cliDiagnosticMessages.connectionReset + ')')}},{type:'item.completed',item:{id:'item_2',type:'error',message:${JSON.stringify('Falling back from WebSockets to HTTPS transport. ' + cliDiagnosticMessages.connectionReset)}}});
 }
 if(mode==='diagnostic') events.splice(1,0,{type:'item.completed',item:{id:'notice',type:'error',message:'Controlled startup diagnostic'}});
 if(mode==='tool') events.push({type:'item.started',item:{id:'tool',type:'command_execution',command:'forbidden'}});
 if(mode==='unknown') events.push({type:'unrecognized.future.event'});
 if(mode==='failure') events.push({type:'turn.failed',error:{message:'controlled failure'}});
 if(mode==='known-diagnostics-tool') events.push({type:'item.completed',item:{id:'tool',type:'mcp_tool_call',name:'forbidden'}});
 if(mode==='known-diagnostics-failed') events.push({type:'turn.failed',error:{message:'Authentication failed'}});
 events.push({type:'item.completed',item:{id:'answer',type:'agent_message',text:answer}});
 if(mode==='two-messages') events.push({type:'item.completed',item:{id:'extra',type:'agent_message',text:answer}});
 if(mode!=='incomplete') events.push({type:'turn.completed',usage:{input_tokens:7,output_tokens:3}});
 if(mode==='two-completions') events.push({type:'turn.completed',usage:{input_tokens:7,output_tokens:3}});
 if(mode==='tamper-image') fs.appendFileSync(args[args.indexOf('--image')+1],'changed');
 if(mode==='known-diagnostics-tamper') fs.appendFileSync(args[args.indexOf('--image')+1],'changed');
 if(mode==='tamper-schema') fs.appendFileSync(args[args.indexOf('--output-schema')+1],'changed');
 if(mode==='extra-file') fs.writeFileSync(path.join(packet,'unexpected.txt'),'changed');
 if(mode==='no-final') fs.unlinkSync(target);
 for(const event of events) console.log(JSON.stringify(event));
 if(mode==='invalid-jsonl') console.log('not-json');
 if(mode==='nonzero') process.exitCode=9;
}`;

function setup(t, mode = 'complete', options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webart-cli-test-'));
  const fixture = path.join(root, 'controlled-fixture.mjs'); fs.writeFileSync(fixture, fixtureSource);
  const image = path.join(root, 'private-original.png'); fs.writeFileSync(image, png);
  const calls = [], packets = new Set();
  t.after(() => {
    for (const packet of packets) { assert.ok(packet.startsWith(path.join(os.tmpdir(), 'webart-cli-evidence-'))); fs.rmSync(packet, {recursive: true, force: true}); }
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'webart-cli-test-'))); fs.rmSync(root, {recursive: true, force: true});
  });
  const spawnImpl = (executable, args, settings) => {
    calls.push({executable, args, settings});
    if (args.includes('--cd')) packets.add(args[args.indexOf('--cd') + 1]);
    if (args.includes('exec') && options.mutate) options.mutate({root, image, settings});
    return spawn(process.execPath, [fixture, mode, ...args], settings);
  };
  const client = new CodexCliReviewClient({root, directory: 'private-artifacts', executable: 'controlled-cli', spawnImpl, deadlineMs: 3000, maxOutputBytes: 16000, ...options, mutate: undefined});
  const input = {role: 'reference-review', instructions: 'Compare only actual attached evidence.', text: 'Controlled fixture; no art approval.', images: imageInput(image, 'reference-0 desktop opening'), schema: structuredClone(schema)};
  return {root, image, input, client, calls};
}

test('CLI arguments disable context and execution capabilities while keeping existing authentication', () => {
  const args = buildCliArgs({packetDirectory: 'C:/anonymous', imageFiles: ['C:/anonymous/000.png'], schemaFile: 'C:/anonymous/schema.json', finalFile: 'C:/anonymous/final.json'});
  assert.deepEqual(args.slice(0, 5), ['--no-daemon', '--ask-for-approval', 'never', 'exec', '--ignore-user-config']);
  assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
  assert.ok(args.includes('--ephemeral')); assert.ok(args.includes('project_doc_max_bytes=0')); assert.ok(args.includes('web_search="disabled"'));
  for (const feature of disabledCliFeatures) assert.ok(args.some((value, index) => value === '--disable' && args[index + 1] === feature));
  assert.deepEqual(args.slice(-2), ['--', '-']); assert.ok(!args.includes('--model'));
  const env = sanitizedCliEnvironment({PATH: 'path', SystemRoot: 'system', USERPROFILE: 'profile', CODEX_HOME: 'auth-root', CODEX_THREAD_ID: 'private-context', CODEX_PARENT_THREAD_ID: 'parent', OPENAI_API_KEY: 'secret', WEBART_OPENAI_API_KEY: 'secret', SERVICE_TOKEN: 'secret', NPM_CONFIG_CACHE: 'private', INIT_CWD: 'repo'});
  assert.deepEqual(env, {PATH: 'path', SystemRoot: 'system', USERPROFILE: 'profile', CODEX_HOME: 'auth-root'});
});

test('completed controlled rejection preserves bytes, schema, usage and honest provenance', async t => {
  const {root, input, client, calls} = setup(t);
  assert.equal(client.reviewerMetadata.contextIsolated, false);
  const result = await client.json(input); assert.deepEqual(result, {decision: 'reject'});
  assert.equal(calls.length, 3); assert.deepEqual(calls[0].args, ['--version']);
  assert.equal(calls[2].settings.shell, false); assert.equal(calls[2].settings.windowsHide, true);
  const request = JSON.parse(fs.readFileSync(client.lastAttempt.requestFile));
  assert.ok(!request.packetDirectory.startsWith(root + path.sep));
  assert.equal(request.images.length, 1); assert.equal(request.images[0].path, 'images/000.png');
  assert.equal(fs.readFileSync(path.join(request.packetDirectory, 'images/000.png')).equals(png), true);
  assert.ok(!fs.readdirSync(request.packetDirectory).some(f => /map|private|request|prompt/.test(f)));
  assert.ok(!fs.readFileSync(path.join(client.lastAttempt.directory, 'prompt.txt'), 'utf8').includes('private-original'));
  const receiptFile = path.join(root, client.lastReviewReceipt.path), receipt = JSON.parse(fs.readFileSync(receiptFile));
  assert.equal(hash(fs.readFileSync(receiptFile)), client.lastReviewReceipt.sha256);
  assert.equal(receipt.provenance.independent, false); assert.equal(receipt.provenance.contextIsolated, true);
  assert.equal(receipt.provenance.actualModel, null); assert.equal(receipt.backendRequestCount, null);
  assert.equal(receipt.isolationEvidence.effectiveFeatures.unified_exec, true); assert.equal(receipt.isolationEvidence.effectiveFeatures.shell_tool, false);
  assert.equal(receipt.visualAdmissionGranted, false); assert.deepEqual(receipt.usage, {input_tokens: 7, output_tokens: 3});
  assert.equal(receipt.diagnosticPolicyVersion, cliDiagnosticPolicyVersion); assert.deepEqual(receipt.diagnostics, []);
  const original = fs.readFileSync(receiptFile);
  await assert.rejects(client.json(input), {code: 'cli-review-budget'});
  assert.equal(calls.length, 3); assert.deepEqual(fs.readFileSync(receiptFile), original);
});

for (const [mode, code] of [
  ['tool', 'cli-review-tool-or-unknown-event'], ['unknown', 'cli-review-tool-or-unknown-event'],
  ['failure', 'cli-review-runtime-error'], ['diagnostic', 'cli-review-runtime-error'], ['incomplete', 'cli-review-incomplete'],
  ['two-messages', 'cli-review-invalid-events'], ['two-completions', 'cli-review-invalid-events'],
  ['mismatch', 'cli-review-output-mismatch'], ['invalid-schema', 'session-review-invalid'],
  ['tamper-image', 'cli-review-tamper'], ['tamper-schema', 'cli-review-tamper'],
  ['extra-file', 'cli-review-tamper'], ['no-final', 'cli-review-final'],
  ['invalid-jsonl', 'cli-review-invalid-events'], ['nonzero', 'cli-review-exit'],
  ['oversize', 'cli-review-output-limit'],
  ['known-diagnostics-tool', 'cli-review-tool-or-unknown-event'], ['known-diagnostics-failed', 'cli-review-runtime-error'], ['known-diagnostics-tamper', 'cli-review-tamper'],
]) test('controlled ' + mode + ' cannot produce a review receipt', async t => {
  const {client, input, calls} = setup(t, mode);
  await assert.rejects(client.json(input), {code});
  assert.equal(client.lastReviewReceipt, undefined); assert.equal(client.reviewerMetadata.contextIsolated, false);
  assert.equal(client.lastAttempt.status, 'pending');
  const failure = JSON.parse(fs.readFileSync(path.join(client.lastAttempt.directory, 'failure.json')));
  assert.equal(failure.visualAdmissionGranted, false); assert.equal(failure.provenance.contextIsolated, false);
  assert.equal(calls.filter(c => c.args.includes('exec')).length, 1, 'no automatic adapter retry');
});

test('deadline terminates a pending subprocess without granting a result', async t => {
  // Allow the two real fixture startup probes to run under whole-suite load;
  // the model-bearing subprocess still has a short, fixed termination bound.
  const {client, input, calls} = setup(t, 'deadline', {deadlineMs: 2000});
  const started = Date.now(); await assert.rejects(client.json(input), {code: 'cli-review-deadline'});
  assert.ok(Date.now() - started < 10000); assert.equal(client.lastReviewReceipt, undefined);
  assert.equal(calls.filter(call => call.args.includes('exec')).length, 1);
});

test('original evidence and immutable request tampering are caught after execution', async t => {
  for (const target of ['source', 'request', 'preserved-input']) {
    const {client, input} = setup(t, 'complete', {mutate: ({root, image}) => {
      if (target === 'source') fs.appendFileSync(image, 'changed');
      else {
        const directory = fs.readdirSync(path.join(root, 'private-artifacts'))[0];
        fs.appendFileSync(path.join(root, 'private-artifacts', directory, target === 'request' ? 'request.json' : 'inputs/000.png'), ' ');
      }
    }});
    await assert.rejects(client.json(input), {code: 'cli-review-tamper'}); assert.equal(client.lastReviewReceipt, undefined);
  }
});

test('caller schema mutation cannot weaken the immutable output contract', async t => {
  let currentInput;
  const {client, input} = setup(t, 'invalid-schema', {mutate: () => currentInput.schema.properties.decision.enum.push('admit')});
  currentInput = input;
  await assert.rejects(client.json(input), {code: 'session-review-invalid'});
  assert.equal(client.lastReviewReceipt, undefined);
});

test('forged input bytes, missing labels, non-evidence roles and cancellation never launch a model subprocess', async t => {
  for (const mode of ['forged', 'missing-label', 'role', 'cancelled']) {
    const abort = new AbortController(); if (mode === 'cancelled') abort.abort();
    const {client, input, calls} = setup(t, 'complete', {signal: abort.signal});
    if (mode === 'forged') input.images[1].image_url = input.images[1].image_url + 'forged';
    if (mode === 'missing-label') input.images = input.images.slice(1);
    if (mode === 'role') input.role = 'generate-page';
    await assert.rejects(client.json(input)); assert.equal(calls.length, 0);
  }
});

const diagnosticItem = (message, id = 'item_0') => ({type: 'item.completed', item: {id, type: 'error', message}});
const reconnect = attempt => ({type: 'error', message: `Reconnecting... ${attempt}/5 (${cliDiagnosticMessages.connectionReset})`});
const fallbackItem = () => diagnosticItem('Falling back from WebSockets to HTTPS transport. ' + cliDiagnosticMessages.connectionReset, 'item_2');
const answerText = '{"decision":"reject"}';
const transcript = () => [{type: 'thread.started', thread_id: 'fresh-controlled-thread'}, diagnosticItem(cliSkillDiscoveryWarning()), diagnosticItem(cliDiagnosticMessages.codeModeDisabled, 'item_1'), {type: 'turn.started'}, reconnect(2), reconnect(3), reconnect(4), reconnect(5), fallbackItem(), {type: 'item.completed', item: {id: 'item_3', type: 'agent_message', text: answerText}}, {type: 'turn.completed', usage: {input_tokens: 1, output_tokens: 1}}];
const parse = (events, options) => parseCliEvents(events.map(event => JSON.stringify(event)).join('\n'), answerText, schema, options);
const retryLog = attempt => `2026-10-25T14:54:46.075880Z  WARN codex_core::responses_retry: stream disconnected - retrying sampling request (${attempt}/5 in 206ms)... turn_id=01a1738e-80ff-7fb2-9d04-fd10d8ccc384 retries=${attempt} max_retries=5 sampling_error=${cliDiagnosticMessages.connectionReset}`;
const fallbackLog = '2026-10-25T14:55:10.792869Z  WARN codex_core::client: falling back to HTTP';

test('known startup and recovered transport diagnostics require a complete no-tool transcript', () => {
  const parsed = parse(transcript(), {stderr: [1, 2, 3, 4, 5].map(retryLog).concat(fallbackLog).join('\n')});
  assert.equal(parsed.diagnosticPolicyVersion, cliDiagnosticPolicyVersion);
  assert.equal(parsed.diagnostics.length, 7); assert.equal(parsed.toolsObserved, 0);
  assert.deepEqual(parsed.stderrDiagnostics, {retryLogs: 5, fallbackLogs: 1, bannerModel: null});
  assert.equal(parsed.actualModel, null); assert.deepEqual(parsed.result, {decision: 'reject'});
  for (const kind of ['startup-skip-host-skill-discovery', 'startup-code-mode-disabled', 'recoverable-connection-reset']) {
    const retained = transcript().filter(event => event.type !== 'error' && event.item?.type !== 'error');
    const event = kind === 'startup-skip-host-skill-discovery' ? diagnosticItem(cliSkillDiscoveryWarning()) : kind === 'startup-code-mode-disabled' ? diagnosticItem(cliDiagnosticMessages.codeModeDisabled) : reconnect(1);
    retained.splice(kind.startsWith('startup') ? 1 : 2, 0, event);
    assert.equal(parse(retained).diagnostics.length, 1);
  }
});

test('known diagnostic receipt records classifier, raw bytes and honest execution counts', async t => {
  const {root, input, client, calls} = setup(t, 'known-diagnostics');
  assert.deepEqual(await client.json(input), {decision: 'reject'});
  const receipt = JSON.parse(fs.readFileSync(path.join(root, client.lastReviewReceipt.path)));
  assert.equal(receipt.diagnosticPolicyVersion, cliDiagnosticPolicyVersion); assert.equal(receipt.diagnostics.length, 4);
  assert.equal(receipt.stderrSha256, hash(fs.readFileSync(receipt.stderrFile)));
  assert.equal(receipt.isolationEvidence.toolsObserved, 0); assert.equal(receipt.cliInvocations, 1);
  assert.equal(receipt.automaticAdapterRetries, 0); assert.equal(receipt.backendRequestCount, null);
  assert.equal(receipt.provenance.independent, false); assert.equal(receipt.provenance.actualModel, null);
  assert.equal(receipt.visualAdmissionGranted, false); assert.equal(calls.filter(call => call.args.includes('exec')).length, 1);
});

for (const [name, mutate, code = 'cli-review-runtime-error'] of [
  ['authentication error', events => events.splice(4, 0, {type: 'error', message: 'Authentication failed: 401'})],
  ['quota error', events => events.splice(4, 0, {type: 'error', message: '429 quota exceeded'})],
  ['model error', events => events.splice(4, 0, diagnosticItem('model not found'))],
  ['unknown runtime error', events => events.splice(4, 0, diagnosticItem('unknown diagnostic'))],
  ['turn failed before completion', events => events.splice(4, 0, {type: 'turn.failed', error: {message: 'stream failed'}})],
  ['turn failed after completion', events => events.push({type: 'turn.failed', error: {message: 'late failure'}})],
  ['known message with unknown suffix', events => events[1].item.message += ' quota exceeded'],
  ['known message with forged tool payload', events => events[1].item.command = 'forbidden'],
  ['known message with forged top-level error', events => events[1].error = {message: '401'}],
  ['known message in unsupported item lifecycle', events => events[1].type = 'item.updated'],
  ['known message as an ordinary runtime error', events => events[1] = {type: 'error', message: cliSkillDiscoveryWarning()}],
  ['another experimental feature', events => events[1].item.message = cliSkillDiscoveryWarning().replace('skip_host_skill_discovery', 'multi_agent')],
  ['different config path', events => events[1].item.message = cliSkillDiscoveryWarning('different/config.toml')],
  ['duplicate startup diagnostic', events => events.splice(2, 0, structuredClone(events[1]))],
  ['startup before thread', events => [events[0], events[1]] = [events[1], events[0]]],
  ['startup during turn', events => events.splice(4, 0, events.splice(1, 1)[0])],
  ['duplicate reconnect attempt', events => events[5] = reconnect(2)],
  ['reconnect in reverse order', events => events[5] = reconnect(1)],
  ['unknown reconnect reason', events => events[4].message = events[4].message.replace('10054', '401')],
  ['reconnect after fallback', events => events.splice(9, 0, reconnect(5))],
  ['fallback without reconnect', events => events.splice(4, 4)],
  ['duplicate fallback', events => events.splice(9, 0, fallbackItem())],
  ['diagnostic after final answer', events => events.splice(10, 0, reconnect(5))],
  ['diagnostic after completion', events => events.push(reconnect(5))],
  ['tool after recoverable diagnostics', events => events.splice(9, 0, {type: 'item.started', item: {id: 'item_9', type: 'command_execution', command: 'forbidden'}}), 'cli-review-tool-or-unknown-event'],
  ['tool payload disguised as final message', events => events[9].item.command = 'forbidden', 'cli-review-tool-or-unknown-event'],
  ['tool payload disguised as reasoning', events => events.splice(9, 0, {type: 'item.completed', item: {id: 'item_9', type: 'reasoning', text: '', tool: 'forbidden'}}), 'cli-review-tool-or-unknown-event'],
  ['unknown event after recovery', events => events.splice(9, 0, {type: 'future.event'}), 'cli-review-tool-or-unknown-event'],
  ['failed status hidden in completion', events => events.at(-1).status = 'failed', 'cli-review-invalid-events'],
  ['error hidden in completion', events => events.at(-1).error = {message: '429'}],
  ['incomplete after recovery', events => events.pop(), 'cli-review-incomplete'],
]) test('diagnostic classifier rejects ' + name, () => {
  const events = transcript(); mutate(events);
  assert.throws(() => parse(events), {code});
});

for (const [name, stderr, change] of [
  ['unknown stderr', 'unknown warning'], ['authentication stderr', 'ERROR Authentication failed'],
  ['quota stderr', '429 quota exceeded'], ['model stderr', 'model not found'],
  ['known log with appended error', retryLog(1) + ' authentication failed'],
  ['duplicate retry log', retryLog(1) + '\n' + retryLog(1)],
  ['out-of-order retry log', retryLog(2)],
  ['unpaired retry log', retryLog(1), events => events.splice(4, 5)],
  ['unpaired fallback log', fallbackLog, events => events.splice(8, 1)],
  ['duplicate fallback log', fallbackLog + '\n' + fallbackLog],
]) test('diagnostic classifier rejects ' + name, () => {
  const events = transcript(); change?.(events);
  assert.throws(() => parse(events, {stderr}), {code: 'cli-review-runtime-error'});
});
