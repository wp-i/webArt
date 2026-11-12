import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assertProductionQuality, assertRetainedPreview, loadQualityPolicy, assertCalibratedReviewer } from './quality-gate.mjs';
import { usesWebGL, validateFallbackCapture } from './production/rendering.mjs';
import {assertPerformanceDelivery} from './production/performance.mjs';
import { validateResponsiveCapture,validateResponsiveReview } from './production/responsive.mjs';
import {showcaseRevision} from './showcase-revision.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Existing external test fixtures use the generic packaging engine. The actual
// WebArt workspace, and any fixture that supplies this policy, must use v2.
export const qualityPolicyApplies = root => path.resolve(root) === ROOT || fs.existsSync(path.join(root, 'webart.quality.json'));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export function relativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') || /^[a-z]:/i.test(value) || value.split('/').some(p => !p || p === '.' || p === '..') || /[\0:]/.test(value)) throw new Error(`Unsafe relative path: ${value}`);
  return value;
}
export function child(root, value) {
  relativePath(value);
  const target = path.resolve(root, value);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error(`Path escapes workspace: ${value}`);
  let current = path.resolve(root);
  for (const part of value.split('/')) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`Symbolic links are not package sources: ${value}`);
  }
  return target;
}
export function loadCollection(root = ROOT) {
  if (qualityPolicyApplies(root)) loadQualityPolicy(root);
  const data = JSON.parse(fs.readFileSync(path.join(root, 'webart.collection.json'), 'utf8'));
  if (data.schemaVersion !== 1 || !Array.isArray(data.templates)) throw new Error('Invalid collection registry');
  for (const field of ['id', 'slug', 'manifest']) {
    const values = data.templates.map(t => t[field]);
    if (values.some(v => typeof v !== 'string' || !v) || new Set(values).size !== values.length) throw new Error(`Missing or duplicate template ${field}`);
  }
  return data;
}
export function template(data, id) {
  const entry = data.templates.find(t => t.id === id || t.slug === id);
  if (!entry) throw new Error(`Unknown template: ${id}`);
  return entry;
}
function archivePath(value) {
  relativePath(value);
  if (value.split('/').some(p => /^(?:docs|scripts|distribution|node_modules|dist|\.git|\.cache|cache|caches|coverage|__pycache__)$/i.test(p) || /^\.(?:env(?:\.|$)|npmrc$|netrc$)/i.test(p) || /\.(?:zip|log|pem|key|pfx|p12)$/i.test(p) || /^(?:review-|reference-|contact-sheet|credentials)/i.test(p))) throw new Error(`Forbidden archive path: ${value}`);
  return value;
}
export function manifestFiles(entry, root = ROOT) {
  const config = JSON.parse(fs.readFileSync(child(root, entry.manifest), 'utf8'));
  if (config.slug !== entry.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.slug) || config.output !== `public/${entry.slug}-source.zip`) throw new Error(`Manifest identity/output mismatch: ${entry.manifest}`);
  child(root, config.output);
  if (!Array.isArray(config.files) || !config.files.length) throw new Error('Manifest must have an explicit source allowlist');
  const files = [];
  const names = new Set();
  const visit = (source, destination) => {
    archivePath(destination);
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) throw new Error(`Symbolic link is forbidden: ${source}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(source).sort()) visit(path.join(source, name), `${destination}/${name}`);
    } else if (stat.isFile()) {
      const key = destination.toLowerCase();
      if (names.has(key)) throw new Error(`Duplicate archive path: ${destination}`);
      names.add(key);
      files.push({ source, archive: destination });
    } else throw new Error(`Unsupported source: ${source}`);
  };
  for (const rule of config.files) visit(child(root, rule.source), archivePath(rule.archive));
  for (const required of ['index.html', 'package.json', 'package-lock.json', 'README.md', 'THIRD_PARTY_NOTICES.md']) if (!names.has(required.toLowerCase())) throw new Error(`Missing required file: ${required}`);
  for (const prefix of ['src/', 'public/assets/']) if (!files.some(f => f.archive.startsWith(prefix))) throw new Error(`Missing required directory: ${prefix}`);
  files.sort((a, b) => a.archive < b.archive ? -1 : a.archive > b.archive ? 1 : 0);
  const packageInfo = JSON.parse(fs.readFileSync(files.find(f => f.archive === 'package.json').source, 'utf8'));
  if (config.version !== packageInfo.version) throw new Error('Manifest and source package version differ');
  return { config, files };
}
export function fingerprint(entry, root = ROOT) {
  const { files } = manifestFiles(entry, root);
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    const bytes = fs.readFileSync(file.source);
    hash.update(`${Buffer.byteLength(file.archive)}:${file.archive}:${bytes.length}:`);
    hash.update(bytes);
  }
  return hash.digest('hex');
}
export function check(entry, root = ROOT) {
  if (entry.status !== 'accepted' || entry.stage !== 'accepted') throw new Error(`Template ${entry.id} is ${entry.status}/${entry.stage}; release requires accepted`);
  if (!entry.approval?.date || !entry.approval.record || !/^[a-f0-9]{64}$/.test(entry.approval.sourceSha256 || '')) throw new Error(`Template ${entry.id} has no complete approval record`);
  for (const key of ['brief', 'reference', 'assets', 'qa']) if (!entry.records?.[key] || !fs.statSync(child(root, entry.records[key])).isFile()) throw new Error(`Missing ${key} record for ${entry.id}`);
  if (!fs.statSync(child(root, entry.approval.record)).isFile()) throw new Error(`Missing approval record for ${entry.id}`);
  const digest = fingerprint(entry, root);
  if (digest !== entry.approval.sourceSha256) throw new Error(`Template ${entry.id} source changed since approval; review and approve the new fingerprint before release`);
  if (qualityPolicyApplies(root)) assertProductionQuality(root, entry, digest, 'release');
  return digest;
}
export function checkTrial(entry, root = ROOT) {
  if (entry.status !== 'draft' || entry.stage !== 'trial') throw new Error('Private trial requires draft/trial status');
  for (const key of ['brief', 'reference', 'assets', 'qa']) if (!entry.records?.[key] || !fs.statSync(child(root, entry.records[key])).isFile()) throw new Error(`Missing ${key} trial record`);
  const approval = entry.trialApproval;
  if (!approval?.runtime || !/^[a-f0-9]{64}$/.test(approval.sourceSha256 || '')) throw new Error('Missing trial source/QA approval');
  const qa = JSON.parse(fs.readFileSync(child(root, approval.runtime), 'utf8'));
  if (qa.mode !== 'full' || qa.result !== 'passed-observable-checks' || qa.errors?.length !== 0 || qa.viewports?.length !== 5 || qa.states?.length !== 8 || qa.transitions?.length < 24 || qa.arbitrary?.length !== 8 || !qa.finished || !qa.checks?.desktopWheel || !qa.checks?.mobileWheel || !qa.checks?.reduced || !qa.checks?.noScript || !qa.checks?.touchScroll || qa.viewports.some(v => v.overflow || v.missing || v.clipped?.length || v.scenes?.some(s => !s.visible))) throw new Error('Private trial needs completed full QA');
  const digest = fingerprint(entry, root);
  if (digest !== approval.sourceSha256) throw new Error('Trial source changed since QA approval');
  return digest;
}
// A new private candidate uses the same byte allowlist/QA/v2 gates as a registry
// trial, without mutating the public registry to gain access to the packager.
export function candidateFiles(handoffPath, root = ROOT) {
  relativePath(handoffPath);
  if (!/^\.webart\/prototypes\/[a-z0-9-]+\/delivery\.json$/.test(handoffPath)) throw new Error('Candidate handoff must remain in one private prototype directory');
  const handoff = JSON.parse(fs.readFileSync(child(root, handoffPath), 'utf8'));
  const base = template(loadCollection(root), handoff.id);
  if (handoff.schemaVersion !== 1 || base.id === '001') throw new Error('Invalid candidate or frozen benchmark');
  const directory = handoffPath.slice(0, -'/delivery.json'.length);
  if (handoff.manifest !== directory + '/manifest.json' || handoff.qualityReview !== directory + '/contract.json') throw new Error('Candidate manifest/contract must remain in the same private directory');
  const entry = { ...base, projectDir: directory, manifest: handoff.manifest, qualityReview: handoff.qualityReview, status: 'draft', stage: 'trial', records: handoff.records, trialApproval: handoff.trialApproval };
  return validateTrialDelivery(entry, handoff, root);
}
// Shared qualification checks for private packaging and frozen renderer registration.
// Registration does not grant access to the private packaging entry point above.
export function validateTrialDelivery(entry, handoff, root = ROOT) {
  const directory = entry.projectDir;
  const validated = manifestFiles(entry, root);
  if (validated.files.some(file => !file.source.startsWith(child(root, directory) + path.sep))) throw new Error('Candidate allowlist contains another project');
  const digest = checkTrial(entry, root);
  assertProductionQuality(root, entry, digest, 'package');
  assertPerformanceDelivery(root,handoff,digest,{allowHistorical:true});
  if (!handoff.controls?.capture || !handoff.controls?.review) throw new Error('Candidate needs actual control-state evidence and visual review');
  const captured = JSON.parse(fs.readFileSync(child(root, handoff.controls.capture), 'utf8'));
  const reviewed = JSON.parse(fs.readFileSync(child(root, handoff.controls.review), 'utf8'));
  if (captured.result !== 'captured-not-visually-approved' || captured.sourceSha256 !== digest || captured.viewports?.length !== 3 || new Set(captured.viewports.map(v=>v.viewport)).size !== 3 || captured.viewports.some(v=>!v.controls?.length) || reviewed.sourceSha256 !== digest || reviewed.decision !== 'pass') throw new Error('Candidate control QA incomplete');
  const runtime = JSON.parse(fs.readFileSync(child(root, handoff.trialApproval.runtime), 'utf8'));
  if (runtime.sourceSha256 !== digest) throw new Error('Candidate full QA does not match current source');
  validateResponsiveCapture(root,runtime,digest);
  validateResponsiveReview(root,runtime,reviewed);
  if(reviewed.responsiveComposition!=='pass')throw new Error('Candidate responsive composition not visually approved');
  const sourceUsesWebGL = usesWebGL(validated.files.filter(file=>file.archive.endsWith('.js')).map(file=>({content:fs.readFileSync(file.source,'utf8')})));
  if (!['dom','local-3d'].includes(handoff.rendering?.mode) || sourceUsesWebGL !== (handoff.rendering.mode === 'local-3d')) throw new Error('Candidate rendering plan does not match its source');
  if (sourceUsesWebGL) {
    if (!handoff.rendering.capture || reviewed.renderingFallback !== 'pass') throw new Error('Candidate needs actual rendering-failure evidence and visual review');
    const rendering = JSON.parse(fs.readFileSync(child(root,handoff.rendering.capture),'utf8'));
    for (const evidence of validateFallbackCapture(rendering,digest)) if (sha(fs.readFileSync(child(root,evidence.path))) !== evidence.sha256) throw new Error('Candidate rendering-failure evidence changed');
  } else if (reviewed.renderingFallback !== 'not-applicable') throw new Error('DOM candidate must not claim 3D fallback approval');
  for (const view of captured.viewports) for (const control of view.controls) {
    if (!control.focused || !['default', 'hover', 'focus'].every(state => control.evidence.some(e => e.state === state))) throw new Error('Candidate visible control state missing');
    if (['BUTTON','SUMMARY'].includes(control.tag) && !['activated',view.viewport==='desktop'?'mouse-result':'touch-result'].every(state=>control.evidence.some(e=>e.state===state))) throw new Error('Candidate native action/touch state missing');
    for (const evidence of control.evidence) { const bytes = fs.readFileSync(child(root, evidence.path)); if (sha(bytes) !== evidence.sha256) throw new Error('Candidate control evidence changed'); }
  }
  if (!handoff.styleReview) throw new Error('Candidate style comparison missing');
  const style = JSON.parse(fs.readFileSync(child(root, handoff.styleReview), 'utf8'));
  const contract = entry.qualityReview ? JSON.parse(fs.readFileSync(child(root, entry.qualityReview), 'utf8')) : null;
  const evaluator = contract?.calibrationReview ? JSON.parse(fs.readFileSync(child(root, contract.calibrationReview), 'utf8')) : null;
  if ([evaluator, reviewed, style].some(report => report?.reviewer?.mode === 'evidence-only-fresh-codex-cli')) {
    for (const [report, role] of [[reviewed, 'controls-review'], [style, 'style-review']]) {
      if (evaluator?.reviewer?.mode !== 'evidence-only-fresh-codex-cli' || report.reviewer?.mode !== evaluator.reviewer.mode || report.reviewer.id !== evaluator.reviewer.id || report.reviewer.calibrationRunId !== evaluator.runId) throw new Error('CLI delivery reviews must bind the actual calibrated reviewer and run');
      assertCalibratedReviewer(root, evaluator, report, role);
    }
  }
  if (style.sourceSha256 !== digest || style.decision !== 'distinct' || !loadCollection(root).templates.some(t=>t.id===style.nearestId&&t.id!==entry.id) || style.openingAndAssetBothRepeated || style.comparisons?.length !== 4 || new Set(style.comparisons.map(c=>c.dimension)).size !== 4 || style.comparisons.filter(c=>c.different).length < 3 || style.comparisons.some(c=>typeof c.finding!=='string'||c.finding.length<30)) throw new Error('Candidate is not distinct from existing designs');
  return validated;
}
export function receipt(entry, archive, root = ROOT) {
  const actual = archive || child(root, `public/${entry.slug}-source.zip`);
  const bytes = fs.readFileSync(actual);
  if (!entry.release || entry.release.bytes !== bytes.length || entry.release.sha256 !== sha(bytes)) throw new Error(`Archive receipt mismatch: ${entry.id}`);
  return { bytes: bytes.length, sha256: sha(bytes) };
}
export function authorizedTrials(data, root = ROOT) {
  const configPath = path.join(root, 'webart.showcase.json');
  if (!fs.existsSync(configPath)) return [];
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.authorization?.trialIds?.length) return [];
  if (!config.authorization.date || !config.authorization.record || !fs.statSync(child(root, config.authorization.record)).isFile()) throw new Error('Showcase trial authorization record is missing');
  return config.authorization.trialIds.map(id => {
    const base = template(data, id);
    const item = config.items?.find(item => item.id === id);
    const revision = showcaseRevision(item ?? {}, base, root);
    const entry = revision ?? base;
    checkTrial(entry, root);
    const delivery = revision?.release ?? config.trialDownloads?.find(record => record.id === id);
    if (!delivery || !config.items?.some(item => item.id === id)) throw new Error(`Missing showcase trial receipt/item: ${id}`);
    const authorized = { ...entry, release: delivery };
    receipt(authorized, undefined, root);
    if (!revision && qualityPolicyApplies(root)) assertRetainedPreview(root, entry, fingerprint(entry, root), delivery);
    return authorized;
  });
}
export function auditPublic(data, root = ROOT) {
  const accepted = data.templates.filter(t => t.status === 'accepted' && t.release);
  for (const entry of accepted) { check(entry, root); receipt(entry, undefined, root); }
  const trials = authorizedTrials(data, root);
  const allowed = new Map([...accepted, ...trials].map(t => [`${t.slug}-source.zip`, t]));
  let count = 0;
  const visit = (directory, relative = '') => {
    if (!fs.existsSync(directory)) return;
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = relative + item.name;
      const file = path.join(directory, item.name);
      if (item.isSymbolicLink()) throw new Error(`Public symbolic link is forbidden: ${file}`);
      if (item.isDirectory()) visit(file, name + '/');
      else if (/\.zip$/i.test(name)) {
        if (!allowed.has(name)) throw new Error(`Unapproved public archive: ${file}`);
        receipt(allowed.get(name), file, root); count++;
      }
    }
  };
  visit(path.join(root, 'public'));
  visit(path.join(root, 'dist'));
  if (fs.existsSync(path.join(root, 'dist'))) for (const entry of [...accepted, ...trials]) receipt(entry, path.join(root, 'dist', `${entry.slug}-source.zip`), root);
  return { archivesChecked: count, accepted: accepted.length, ...(trials.length ? { userAuthorizedTrials: trials.length } : {}) };
}
export function writeCatalog(data, root = ROOT) {
  const templates = data.templates.filter(t => t.status === 'accepted' && t.release).map(entry => {
    check(entry, root); receipt(entry, undefined, root);
    return { id: entry.id, slug: entry.slug, title: entry.title, preview: entry.preview || (entry.projectDir === '.' ? '/' : `/${entry.projectDir}/`), download: `/${entry.slug}-source.zip`, version: manifestFiles(entry, root).config.version, bytes: entry.release.bytes, sha256: entry.release.sha256 };
  });
  fs.writeFileSync(path.join(root, 'public', 'templates.json'), JSON.stringify({ schemaVersion: 1, templates }, null, 2) + '\n');
  return { templates: templates.length };
}
export function recordRelease(data, entry, root = ROOT) {
  check(entry, root);
  const bytes = fs.readFileSync(child(root, `public/${entry.slug}-source.zip`));
  entry.release = { bytes: bytes.length, sha256: sha(bytes) };
  fs.writeFileSync(path.join(root, 'webart.collection.json'), JSON.stringify(data, null, 2) + '\n');
  return entry.release;
}
export function main(args = process.argv.slice(2), root = ROOT) {
  const [command = 'status', value] = args;
  const data = loadCollection(root);
  switch (command) {
    case 'status': return data.templates.map(entry => {
      let downloadable = false;
      let issue;
      if (entry.status === 'accepted') {
        try { check(entry, root); receipt(entry, undefined, root); downloadable = true; }
        catch (error) { issue = error.message; }
      }
      return { id: entry.id, title: entry.title, status: entry.status, stage: entry.stage, downloadable, ...(issue ? { issue } : {}) };
    });
    case 'fingerprint': return { id: template(data, value).id, sourceSha256: fingerprint(template(data, value), root) };
    case 'check': {
      const selected = !value || value === 'all' ? data.templates.filter(t => t.status === 'accepted') : [template(data, value)];
      if (!selected.length) throw new Error('No accepted templates to check');
      return selected.map(t => ({ id: t.id, sourceSha256: check(t, root), gate: 'passed' }));
    }
    case 'trial-files-manifest': {
      relativePath(value);
      const entry = data.templates.find(t => t.manifest === value);
      if (!entry) throw new Error(`Unauthorized trial manifest: ${value}`);
      checkTrial(entry, root);
      if (qualityPolicyApplies(root)) assertProductionQuality(root, entry, fingerprint(entry, root), 'package');
      return manifestFiles(entry, root);
    }
    case 'candidate-files-manifest': return candidateFiles(value, root);
    case 'check-manifest':
    case 'files-manifest': {
      relativePath(value);
      const entry = data.templates.find(t => t.manifest === value);
      if (!entry) throw new Error(`Unauthorized manifest: ${value}`);
      check(entry, root);
      return command === 'files-manifest' ? manifestFiles(entry, root) : { id: entry.id, gate: 'passed' };
    }
    case 'audit-public': return auditPublic(data, root);
    case 'catalog': return writeCatalog(data, root);
    case 'verify-release': { const entry = template(data, value); check(entry, root); return receipt(entry, undefined, root); }
    default: throw new Error(`Unknown command: ${command}`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(JSON.stringify(main(), null, 2) + '\n'); }
  catch (error) { process.stderr.write(`Collection: ${error.message}\n`); process.exitCode = 1; }
}
