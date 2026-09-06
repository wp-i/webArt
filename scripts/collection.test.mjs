import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { check, fingerprint, manifestFiles, auditPublic, main, writeCatalog } from './collection.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webart-gate-test-'));
  t.after(() => {
    assert.ok(root.startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const write = (file, contents) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), contents); };
  const files = { 'index.html': '<main>Approved</main>', 'package.json': '{"version":"1.0.0"}', 'package-lock.json': '{}', 'src/main.js': 'export const approved = true;', 'public/assets/image.svg': '<svg/>', 'README.md': 'Install and customize.', 'THIRD_PARTY_NOTICES.md': 'Notices.' };
  for (const [name, content] of Object.entries(files)) write(name, content);
  write('docs/record.md', 'Accepted evidence');
  const manifest = { slug: 'example', version: '1.0.0', output: 'public/example-source.zip', files: Object.keys(files).map(source => ({ source, archive: source })) };
  const saveManifest = () => write('webart.package.json', JSON.stringify(manifest));
  saveManifest();
  const entry = { id: '001', slug: 'example', title: 'Example', projectDir: '.', manifest: 'webart.package.json', status: 'accepted', stage: 'accepted', records: { brief: 'docs/record.md', reference: 'docs/record.md', assets: 'docs/record.md', qa: 'docs/record.md' }, approval: { date: '2026-09-05', record: 'docs/record.md' }, release: null };
  entry.approval.sourceSha256 = fingerprint(entry, root);
  write('public/example-source.zip', 'verified-fixture-archive');
  const bytes = fs.readFileSync(path.join(root, 'public/example-source.zip'));
  entry.release = { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  const data = { schemaVersion: 1, templates: [entry] };
  const saveRegistry = () => write('webart.collection.json', JSON.stringify(data));
  saveRegistry();
  return { root, write, manifest, saveManifest, entry, data, saveRegistry };
}

test('accepted unchanged source passes; dirty source fails and cannot be catalogued', t => {
  const f = fixture(t);
  assert.equal(check(f.entry, f.root), f.entry.approval.sourceSha256);
  f.write('src/main.js', 'export const approved = false;');
  assert.throws(() => check(f.entry, f.root), /source changed/);
  assert.throws(() => writeCatalog(f.data, f.root), /source changed/);
  assert.equal(main(['status'], f.root)[0].downloadable, false);
});
test('frozen and unknown manifests cannot be packaged', t => {
  const f = fixture(t);
  f.entry.status = 'frozen'; f.entry.stage = 'reference_selection'; f.saveRegistry();
  assert.throws(() => main(['check', '001'], f.root), /requires accepted/);
  assert.throws(() => main(['files-manifest', 'webart.package.json'], f.root), /requires accepted/);
  assert.throws(() => main(['check-manifest', 'unregistered.json'], f.root), /Unauthorized/);
});
test('source and archive traversal, absolute names, duplicate entries and nested ZIPs fail', t => {
  const f = fixture(t);
  const original = structuredClone(f.manifest.files);
  for (const archive of ['../escape.html', '/index.html', 'C:/index.html', 'src/../index.html', 'src/cache/item.txt', 'src/.env', 'public/assets/previous.zip']) {
    f.manifest.files = [...original, { source: 'index.html', archive }]; f.saveManifest();
    assert.throws(() => manifestFiles(f.entry, f.root), /Unsafe|Forbidden/);
  }
  f.manifest.files = [...original, { source: '../outside.html', archive: 'outside.html' }]; f.saveManifest();
  assert.throws(() => manifestFiles(f.entry, f.root), /Unsafe/);
  f.manifest.files = [...original, { source: 'index.html', archive: 'INDEX.HTML' }]; f.saveManifest();
  assert.throws(() => manifestFiles(f.entry, f.root), /Duplicate/);
});
test('fingerprints ignore allowlist ordering and detect renamed distribution entries', t => {
  const f = fixture(t);
  const before = fingerprint(f.entry, f.root);
  f.manifest.files.reverse(); f.saveManifest();
  assert.equal(fingerprint(f.entry, f.root), before);
  f.manifest.files.find(file => file.archive === 'src/main.js').archive = 'src/renamed.js'; f.saveManifest();
  assert.notEqual(fingerprint(f.entry, f.root), before);
});
test('missing evidence and forged output names fail the gate', t => {
  const f = fixture(t);
  f.entry.records.qa = 'docs/missing.md';
  assert.throws(() => check(f.entry, f.root));
  f.entry.records.qa = 'docs/record.md';
  f.manifest.output = 'public/another.zip'; f.saveManifest();
  assert.throws(() => check(f.entry, f.root), /output mismatch/);
});
test('public audits reject stale, temporary, nested and tampered downloads', t => {
  const f = fixture(t);
  assert.equal(auditPublic(f.data, f.root).accepted, 1);
  for (const file of ['public/rejected-source.zip', 'public/.example.tmp.zip', 'dist/nested/old.zip']) {
    f.write(file, 'stale');
    assert.throws(() => auditPublic(f.data, f.root), /Unapproved public archive/);
    fs.unlinkSync(path.join(f.root, file));
  }
  f.write('dist/example-source.zip', 'verified-fixture-archive');
  assert.equal(auditPublic(f.data, f.root).archivesChecked, 2);
  f.write('dist/example-source.zip', 'tampered');
  assert.throws(() => auditPublic(f.data, f.root), /receipt mismatch/);
});
test('catalog excludes frozen candidates and requires a verified receipt', t => {
  const f = fixture(t);
  f.data.templates.push({ id: '002', slug: 'rejected', status: 'frozen' });
  f.data.templates.push({ id: '003', slug: 'pending', status: 'accepted', release: null });
  assert.equal(writeCatalog(f.data, f.root).templates, 1);
  const catalog = JSON.parse(fs.readFileSync(path.join(f.root, 'public/templates.json')));
  assert.equal(catalog.templates[0].preview, '/');
  assert.equal(catalog.templates[0].download, '/example-source.zip');
  f.entry.release.sha256 = '0'.repeat(64);
  assert.throws(() => writeCatalog(f.data, f.root), /receipt mismatch/);
});
test('an accepted but unreleased template does not block existing downloads or leak into the catalog', t => {
  const f = fixture(t);
  f.data.templates.push({ id: '002', slug: 'pending', title: 'Pending', status: 'accepted', stage: 'accepted', release: null });
  assert.equal(writeCatalog(f.data, f.root).templates, 1);
  assert.equal(auditPublic(f.data, f.root).accepted, 1);
  f.write('public/pending-source.zip', 'not-verified');
  assert.throws(() => auditPublic(f.data, f.root), /Unapproved public archive/);
});
