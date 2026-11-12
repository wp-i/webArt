import fs from 'node:fs';
import path from 'node:path';
import {CodexCliReviewClient, cliDiagnosticPolicyVersion, disabledCliFeatures} from './cli-review.mjs';
import {validateCliReviewTransport} from './cli-review-receipt.mjs';
import {calibrationSchema, reviewSchema, controlsReviewSchema, styleReviewSchema} from './schemas.mjs';
import {hash, imageInput, ProductionError} from './api.mjs';
import {safeFile} from '../quality-gate.mjs';

const schemas = {'calibration': calibrationSchema, 'reference-review': reviewSchema, 'prototype-review': reviewSchema, 'controls-review': controlsReviewSchema, 'style-review': styleReviewSchema};
const attemptName = /^(\d{2})-(calibration|reference-review|prototype-review|controls-review|style-review)-[a-f0-9]{10}$/;
const need = (ok, code, message, details) => { if (!ok) throw new ProductionError(code, message, details); };
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const same = (a, b) => canonical(a) === canonical(b);
const read = (root, file) => JSON.parse(fs.readFileSync(safeFile(root, file), 'utf8'));
const ref = (root, file) => ({path: file, sha256: hash(fs.readFileSync(safeFile(root, file)))});
const absoluteHistoricalPathMatches = (historical, relative) => typeof historical === 'string' && (historical === relative || historical.replaceAll('\\', '/').endsWith('/' + relative));

function inspectAncestors(root, relative) {
  let current = root;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) return false;
    need(!fs.lstatSync(current).isSymbolicLink(), 'cli-review-cache-invalid', 'Linked CLI review directories cannot be resumed');
  }
  return true;
}

function suppliedImages(root, images) {
  need(Array.isArray(images), 'cli-review-image', 'Images must be an ordered evidence list');
  const result = []; let label;
  for (const input of images) {
    need(input && typeof input === 'object', 'cli-review-image', 'Only labelled local image evidence is allowed');
    if (input.type === 'input_text') { need(label === undefined && typeof input.text === 'string', 'cli-review-image', 'Each image needs exactly one label'); label = input.text; continue; }
    need(input.type === 'input_image' && input.evidence && label !== undefined, 'cli-review-image', 'Only verified local image evidence is allowed');
    const source = fs.realpathSync(input.evidence.path), relative = path.relative(root, source).replaceAll('\\', '/');
    const bytes = fs.readFileSync(safeFile(root, relative)), sha256 = hash(bytes);
    need(bytes.length > 0 && bytes.length <= 25 * 1024 * 1024 && sha256 === input.evidence.sha256 && imageInput(source, label)[1].image_url === input.image_url, 'cli-review-image', 'Image bytes do not match the supplied evidence');
    result.push({label, sha256, bytes: bytes.length, source: relative}); label = undefined;
  }
  need(label === undefined && result.length > 0 && result.length <= 200 && result.reduce((total, image) => total + image.bytes, 0) <= 200 * 1024 * 1024, 'cli-review-image', 'Missing evidence or image budget exceeded');
  return result;
}

function verifyRawReceipt(root, directory, request, receipt, transport) {
  const parsed = transport.parsed, requestFile = directory + '/request.json';
  need(receipt.schemaVersion === 1 && receipt.execution === 'fresh-codex-cli-evidence-review' && receipt.requestId === request.id && receipt.role === request.role && receipt.requestSha256 === transport.files['request.json'].sha256 && receipt.diagnosticPolicyVersion === cliDiagnosticPolicyVersion, 'cli-review-cache-invalid', 'Completed raw receipt has stale identity or diagnostic policy; start a new run');
  for (const [field, name] of [['request', 'request.json'], ['response', 'response.json'], ['events', 'events.jsonl'], ['stderr', 'stderr.txt']]) {
    need(absoluteHistoricalPathMatches(receipt[field + 'File'], directory + '/' + name) && receipt[field + 'Sha256'] === transport.files[name].sha256, 'cli-review-cache-invalid', 'Raw receipt file identity or fingerprint differs; start a new run');
  }
  need(absoluteHistoricalPathMatches(receipt.featureProbe?.path, directory + '/feature-probe.json') && receipt.featureProbe.sha256 === transport.files['feature-probe.json'].sha256 && absoluteHistoricalPathMatches(request.invocation.effectiveFeatureProbeFile, directory + '/feature-probe.json'), 'cli-review-cache-invalid', 'Raw feature-probe receipt belongs to another directory');
  need(receipt.cliVersion === transport.cliVersion && same(receipt.provenance, transport.provenance) && receipt.threadId === parsed.threadId && same(receipt.usage, parsed.usage) && receipt.eventCount === parsed.eventCount && same(receipt.diagnostics, parsed.diagnostics) && same(receipt.stderrDiagnostics, parsed.stderrDiagnostics), 'cli-review-cache-invalid', 'Raw execution proof differs from the replayed result');
  const isolation = receipt.isolationEvidence;
  need(receipt.backendRequestCount === null && receipt.cliInvocations === 1 && receipt.automaticAdapterRetries === 0 && receipt.visualAdmissionGranted === false && isolation?.freshThread === true && isolation.ephemeral === true && isolation.toolsObserved === 0 && isolation.packetOutsideProject === true && isolation.packetAndSourcesReverified === true && same(isolation.requestedDisabledFeatures, disabledCliFeatures) && same(isolation.effectiveFeatures, transport.effectiveFeatures) && isolation.commandToolsControlledBy === 'features.shell_tool=false' && isolation.externalFilesystemSandboxCertified === false, 'cli-review-cache-invalid', 'Raw receipt overstates execution or lacks no-tool isolation proof');
  need(Number.isFinite(Date.parse(request.startedAt)) && Number.isFinite(Date.parse(receipt.completedAt)) && Date.parse(receipt.completedAt) >= Date.parse(request.startedAt), 'cli-review-cache-invalid', 'Raw receipt has no valid original execution time');
  need(absoluteHistoricalPathMatches(receipt.requestFile, requestFile), 'cli-review-cache-invalid', 'Raw receipt was copied or renamed into another review directory');
}

/** Exact same-directory reuse of a completed CLI execution. A cache hit is a
 * replay of retained evidence, never a new model assessment or an adapter retry.
 * Original receipts remain untouched; onReuse is separate from onUsage.
 */
export class CachedCodexCliReviewClient extends CodexCliReviewClient {
  constructor(options) {
    super(options);
    const relative = path.relative(this.root, this.directory).replaceAll('\\', '/');
    need(typeof options.directory === 'string' && options.directory === relative && !path.isAbsolute(options.directory) && !options.directory.includes('\\') && relative.split('/').every(segment => segment && segment !== '.' && segment !== '..') && (relative.startsWith('.webart/') || /^docs\/production\/runs\/[a-z0-9-]+\/cli-review$/.test(relative)), 'cli-review-cache-configuration', 'Use a private project-relative CLI review directory or a production run cli-review directory');
    need(options.onReuse === undefined || typeof options.onReuse === 'function', 'cli-review-cache-configuration', 'onReuse must be a callback');
    this.relativeDirectory = relative; this.onReuse = options.onReuse ?? (() => {}); this.reuseCount = 0; this.cacheInFlight = false;
    this.initialReviewerMetadata = Object.freeze({...this.reviewerMetadata});
    this.requests = this.inventory().length;
  }

  inventory() {
    if (!inspectAncestors(this.root, this.relativeDirectory)) return [];
    const entries = fs.readdirSync(safeFile(this.root, this.relativeDirectory), {withFileTypes: true});
    const attempts = [];
    for (const entry of entries) {
      need(!entry.isSymbolicLink(), 'cli-review-cache-invalid', 'Linked entries are not permitted in a CLI review directory');
      need(entry.isDirectory() && attemptName.test(entry.name), 'cli-review-cache-invalid', 'Unknown CLI attempt entry; start a new run');
      attempts.push(this.relativeDirectory + '/' + entry.name);
    }
    const ordinals = attempts.map(directory => Number(path.posix.basename(directory).match(attemptName)[1]));
    need(new Set(ordinals).size === ordinals.length && [...ordinals].sort((a, b) => a - b).every((ordinal, index) => ordinal === index + 1), 'cli-review-cache-invalid', 'CLI attempt sequence is incomplete or renamed; start a new run');
    return attempts.sort();
  }

  async json(input) {
    need(!this.cacheInFlight, 'cli-review-concurrent', 'CLI review requests must run sequentially');
    this.cacheInFlight = true;
    this.lastReviewReceipt = undefined;
    this.reviewerMetadata = {...this.initialReviewerMetadata};
    const started = Date.now(), {role, instructions, text, images = [], schema, search = false} = input;
    const checkBudget = () => { need(!this.signal?.aborted, 'cli-review-interrupted', 'Review interrupted before launch or reuse'); need(Date.now() - started < this.deadlineMs, 'cli-review-deadline', 'CLI review replay deadline elapsed; no invocation was started'); };
    try {
      need(!search && Object.hasOwn(schemas, role) && typeof instructions === 'string' && typeof text === 'string' && same(schema, schemas[role]), 'cli-review-role', 'Only fixed evidence review roles and their current schemas are allowed');
      checkBudget();
      const expectedImages = suppliedImages(this.root, images), directories = this.inventory();
      this.requests = directories.length;
      const matches = [];
      for (const directory of directories) {
        checkBudget();
        const requestFile = directory + '/request.json', requestPath = path.join(this.root, ...requestFile.split('/'));
        need(fs.existsSync(requestPath), 'review-pending', 'A partial CLI attempt has no immutable request; start a new run before another invocation', {directory, requiresNewRun: true});
        const request = read(this.root, requestFile), requestRef = ref(this.root, requestFile), name = path.posix.basename(directory);
        need(request.id === name && request.role === name.match(attemptName)[2] && request.schemaVersion === 1 && Array.isArray(request.images), 'cli-review-cache-invalid', 'CLI request directory identity is inconsistent; start a new run');
        const receiptFile = directory + '/receipt.json', failureFile = directory + '/failure.json';
        const hasReceipt = fs.existsSync(path.join(this.root, ...receiptFile.split('/'))), hasFailure = fs.existsSync(path.join(this.root, ...failureFile.split('/')));
        let receipt, failure;
        if (hasReceipt) {
          receipt = read(this.root, receiptFile);
          need(receipt.requestId === request.id && receipt.requestSha256 === requestRef.sha256 && receipt.role === request.role && absoluteHistoricalPathMatches(receipt.requestFile, requestFile), 'cli-review-cache-invalid', 'Completed request was modified or copied from another directory; start a new run');
        }
        if (hasFailure) {
          failure = read(this.root, failureFile);
          need(failure.id === request.id && failure.requestSha256 === requestRef.sha256, 'cli-review-cache-invalid', 'Failed request identity changed; start a new run');
        }
        const exact = request.role === role && request.instructions === instructions && request.text === text && same(request.outputSchema, schema) && request.requestedModel === this.requestedModel && same(request.images.map(({label, sha256, bytes}) => ({label, sha256, bytes})), expectedImages.map(({label, sha256, bytes}) => ({label, sha256, bytes})));
        if (!exact) continue;
        const details = {requestFile, requestSha256: requestRef.sha256, role, requiresNewRun: true};
        need(!hasFailure, 'cli-review-cached-attempt-failed', 'Matching CLI attempt failed or was cancelled; automatic retries are disabled. Start a new run', {...details, originalFailure: failure?.failure ?? null});
        need(hasReceipt, 'review-pending', 'Matching CLI attempt has no completed raw receipt; no new invocation was started. Start a new run', details);
        need(request.invocation?.executable === this.executable && request.invocation.deadlineMs === this.deadlineMs && request.invocation.maxOutputBytes === this.maxOutputBytes, 'cli-review-cache-invalid', 'Matching execution used a different invocation policy; start a new run');
        const transport = validateCliReviewTransport({root: this.root, request: requestRef, role});
        verifyRawReceipt(this.root, directory, request, receipt, transport);
        need(same(transport.sourceMap.map(item => item.source), expectedImages.map(image => image.source)), 'cli-review-cache-invalid', 'Matching pixels were supplied from different original source paths; start a new run');
        matches.push({directory, receipt, receiptRef: ref(this.root, receiptFile), transport});
      }
      checkBudget();
      need(matches.length <= 1, 'cli-review-cache-invalid', 'Duplicate matching CLI executions are ambiguous; start a new run');
      if (matches.length) {
        const {directory, receipt, receiptRef, transport} = matches[0];
        this.lastReviewReceipt = receiptRef; this.reviewerMetadata = transport.provenance;
        this.lastAttempt = {id: transport.request.id, directory: path.join(this.root, ...directory.split('/')), requestFile: path.join(this.root, ...transport.files['request.json'].path.split('/')), requestSha256: transport.files['request.json'].sha256, receiptFile: path.join(this.root, ...receiptRef.path.split('/')), status: 'completed-structured-review', reused: true, originalCompletedAt: receipt.completedAt, visualAdmissionGranted: false, provenance: transport.provenance};
        this.reuseCount++;
        this.onReuse({kind: 'verified-cli-review-reuse', role, requestId: transport.request.id, receipt: receiptRef, originalStartedAt: transport.request.startedAt, originalCompletedAt: receipt.completedAt, reusedAt: new Date().toISOString(), originalCliInvocations: 1, newCliInvocations: 0, newModelCalls: 0, backendRequestCount: null, independent: false, actualModel: transport.provenance.actualModel, toolsObserved: 0, visualAdmissionGranted: false});
        return transport.parsed.result;
      }
      need(this.requests < this.maxRequests, 'cli-review-budget', 'CLI invocation budget is exhausted by retained attempts; start a new run');
      return await super.json(input);
    } catch (error) {
      this.lastReviewReceipt = undefined;
      this.reviewerMetadata = {...this.initialReviewerMetadata};
      if (error instanceof ProductionError) throw error;
      throw new ProductionError('cli-review-cache-invalid', 'CLI review evidence is missing, malformed or unsafe; no result was granted', {cause: error.code ?? error.name, causeMessage: error.message});
    } finally { this.cacheInFlight = false; }
  }
}
