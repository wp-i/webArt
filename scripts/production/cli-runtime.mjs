import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ProductionError} from './api.mjs';
import {loadQualityPolicy, safeFile, validateCalibration, verifyEvidence} from '../quality-gate.mjs';

const need = (ok, message) => { if (!ok) throw new ProductionError('cli-runtime-invalid', message); };
const runtimeBase = root => path.join(path.resolve(root), '.webart', 'review-runtime');
const inside = (root, file) => { const relative = path.relative(root, file); return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep); };
const versionValid = value => typeof value === 'string' && /^codex-cli [^\r\n]+$/.test(value);

function unlinked(file) {
  const absolute = path.resolve(file), parsed = path.parse(absolute);
  let current = parsed.root;
  need(!fs.lstatSync(current).isSymbolicLink(), 'Linked runtime paths are not permitted');
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    need(!fs.lstatSync(current).isSymbolicLink(), 'Linked runtime paths are not permitted');
  }
  return absolute;
}

function absoluteLocal(file) {
  need(typeof file === 'string' && path.isAbsolute(file) && !/^(?:\\\\|\/\/)/.test(file), 'Use an explicit absolute local CLI executable; PATH lookup is not permitted');
  return path.resolve(file);
}

function fileIdentity(file) {
  const absolute = unlinked(absoluteLocal(file)), fd = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const before = fs.fstatSync(fd);
    need(before.isFile() && before.size > 0, 'CLI runtime must be a nonempty regular file');
    const digest = crypto.createHash('sha256'), buffer = Buffer.alloc(1024 * 1024);
    let count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) digest.update(buffer.subarray(0, count));
    const after = fs.fstatSync(fd);
    need(before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, 'CLI runtime changed while being read');
    return {executable: absolute, sha256: digest.digest('hex'), bytes: after.size};
  } finally { fs.closeSync(fd); }
}

// This fixed, bounded version probe never executes a model request.
export function probeCliVersion(executable) {
  const result = spawnSync(executable, ['--version'], {shell: false, windowsHide: true, timeout: 10000, maxBuffer: 4096, encoding: 'utf8'});
  need(!result.error && result.status === 0 && result.signal === null && result.stderr === '', 'CLI version probe failed');
  const version = result.stdout.trim();
  need(versionValid(version), 'CLI version probe returned an unsupported identity');
  return version;
}

/** Read-only identity check. A pin is bound to its hash-named directory as well
 * as its metadata, so editing metadata cannot bless changed executable bytes. */
export function inspectCliRuntime({root, executable, expectedVersion, expectedSha256, versionProbe = probeCliVersion}) {
  need(expectedVersion === undefined || versionValid(expectedVersion), 'Expected CLI version must be an explicit version identity');
  need(expectedSha256 === undefined || (typeof expectedSha256 === 'string' && /^[a-f0-9]{64}$/.test(expectedSha256)), 'Source CLI fingerprint differs from the requested pin');
  const identity = fileIdentity(executable), base = runtimeBase(root), pinned = inside(base, identity.executable);
  need(expectedSha256 === undefined || identity.sha256 === expectedSha256, 'Source CLI fingerprint differs from the requested pin');
  let metadata;
  if (pinned) {
    const pieces = path.relative(base, identity.executable).split(path.sep);
    need(pieces.length === 2 && /^[a-f0-9]{64}$/.test(pieces[0]) && pieces[1] === 'codex.exe', 'Unsupported pinned runtime path');
    const metadataFile = unlinked(path.join(path.dirname(identity.executable), 'runtime.json'));
    need(fs.statSync(metadataFile).isFile(), 'Runtime metadata must be a regular file');
    metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
    need(metadata.schemaVersion === 1 && metadata.kind === 'webart-local-cli-runtime' && metadata.executable === 'codex.exe' && metadata.sha256 === pieces[0] && metadata.sha256 === identity.sha256 && metadata.bytes === identity.bytes && versionValid(metadata.cliVersion), 'Pinned CLI bytes or metadata changed');
  }
  const cliVersion = versionProbe(identity.executable);
  need(versionValid(cliVersion) && (expectedVersion === undefined || cliVersion === expectedVersion) && (!metadata || cliVersion === metadata.cliVersion), 'CLI version differs from its calibration or pin');
  const after = fileIdentity(identity.executable);
  need(after.sha256 === identity.sha256 && after.bytes === identity.bytes, 'CLI runtime changed during its version probe');
  return {...identity, cliVersion, pinned, ...(pinned ? {metadata: path.join(path.dirname(identity.executable), 'runtime.json')} : {})};
}

function mkdirUnlinked(directory) {
  const absolute = path.resolve(directory), parsed = path.parse(absolute);
  let current = parsed.root;
  unlinked(current);
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { fs.mkdirSync(current); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    need(!fs.lstatSync(current).isSymbolicLink() && fs.statSync(current).isDirectory(), 'Runtime directory must be an unlinked directory');
  }
}

/** Explicit opt-in local copy only. Never downloads, overwrites or deletes. */
export function pinCliRuntime({root, executable, expectedVersion, expectedSha256, versionProbe = probeCliVersion}) {
  const source = inspectCliRuntime({root, executable, expectedVersion, expectedSha256, versionProbe});
  const directory = path.join(runtimeBase(root), source.sha256), target = path.join(directory, 'codex.exe');
  if (fs.existsSync(directory)) return inspectCliRuntime({root, executable: target, expectedVersion: source.cliVersion, versionProbe});
  mkdirUnlinked(runtimeBase(root));
  fs.mkdirSync(directory);
  unlinked(directory);
  fs.copyFileSync(source.executable, target, fs.constants.COPYFILE_EXCL);
  const copied = fileIdentity(target), sourceAfter = fileIdentity(source.executable);
  need(copied.sha256 === source.sha256 && copied.bytes === source.bytes && sourceAfter.sha256 === source.sha256, 'Source CLI changed while being pinned');
  need(versionProbe(target) === source.cliVersion, 'Copied CLI version differs from its source');
  const metadata = {schemaVersion: 1, kind: 'webart-local-cli-runtime', executable: 'codex.exe', sha256: source.sha256, bytes: source.bytes, cliVersion: source.cliVersion, sourcePath: source.executable, pinnedAt: new Date().toISOString()};
  fs.writeFileSync(path.join(directory, 'runtime.json'), JSON.stringify(metadata, null, 2) + '\n', {flag: 'wx'});
  return inspectCliRuntime({root, executable: target, expectedVersion: source.cliVersion, versionProbe});
}

/** Select only the executable named by an actually validated calibration.
 * Missing historical binaries stay blocked; the current PATH is never tried. */
export function resolveCalibratedCliRuntime({root, calibration, versionProbe = probeCliVersion}) {
  const evaluator = typeof calibration === 'string' ? JSON.parse(fs.readFileSync(safeFile(root, calibration), 'utf8')) : calibration;
  need(evaluator?.reviewer?.mode === 'evidence-only-fresh-codex-cli', 'An actual CLI calibration is required to resolve its runtime');
  validateCalibration(root, evaluator, loadQualityPolicy(root).calibration);
  verifyEvidence(root, [evaluator.reviewReceipt]);
  const receipt = JSON.parse(fs.readFileSync(safeFile(root, evaluator.reviewReceipt.path), 'utf8'));
  verifyEvidence(root, [receipt.request]);
  const request = JSON.parse(fs.readFileSync(safeFile(root, receipt.request.path), 'utf8'));
  need(request.role === 'calibration' && request.id === receipt.requestId && versionValid(receipt.cliVersion), 'Calibration execution identity is missing');
  const runtime = inspectCliRuntime({root, executable: request.invocation?.executable, expectedVersion: receipt.cliVersion, versionProbe});
  return {...runtime, calibrationRunId: evaluator.runId, request: receipt.request};
}

export function main(args = process.argv.slice(2), {root = process.cwd()} = {}) {
  need(args.length === 2 && ['pin', 'resolve', 'inspect'].includes(args[0]), 'Usage: node scripts/production/cli-runtime.mjs pin <absolute-codex.exe> | resolve <calibration-review.json> | inspect <absolute-codex.exe>');
  return args[0] === 'pin' ? pinCliRuntime({root, executable: args[1]}) : args[0] === 'inspect' ? inspectCliRuntime({root, executable: args[1]}) : resolveCalibratedCliRuntime({root, calibration: args[1]});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(main(), null, 2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
