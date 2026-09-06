import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  return digest;
}
export function receipt(entry, archive, root = ROOT) {
  const actual = archive || child(root, `public/${entry.slug}-source.zip`);
  const bytes = fs.readFileSync(actual);
  if (!entry.release || entry.release.bytes !== bytes.length || entry.release.sha256 !== sha(bytes)) throw new Error(`Archive receipt mismatch: ${entry.id}`);
  return { bytes: bytes.length, sha256: sha(bytes) };
}
export function auditPublic(data, root = ROOT) {
  const accepted = data.templates.filter(t => t.status === 'accepted' && t.release);
  for (const entry of accepted) { check(entry, root); receipt(entry, undefined, root); }
  const allowed = new Map(accepted.map(t => [`${t.slug}-source.zip`, t]));
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
  if (fs.existsSync(path.join(root, 'dist'))) for (const entry of accepted) receipt(entry, path.join(root, 'dist', `${entry.slug}-source.zip`), root);
  return { archivesChecked: count, accepted: accepted.length };
}
export function writeCatalog(data, root = ROOT) {
  const templates = data.templates.filter(t => t.status === 'accepted' && t.release).map(entry => {
    check(entry, root); receipt(entry, undefined, root);
    return { id: entry.id, slug: entry.slug, title: entry.title, preview: entry.projectDir === '.' ? '/' : `/${entry.projectDir}/`, download: `/${entry.slug}-source.zip`, version: manifestFiles(entry, root).config.version, bytes: entry.release.bytes, sha256: entry.release.sha256 };
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
