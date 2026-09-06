import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { build } from 'vite';
import { verifyHttp } from './release-collection.mjs';

test('two actual Vite builds serve independent previews; data SVG fragments are not files and broken assets fail', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webart-preview-test-'));
  t.after(() => {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const write = (file, contents) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };
  // Isolated engineering fixtures only; never added to the product registry.
  const entries = [{ id: 'root-fixture', slug: 'root-fixture', projectDir: '.' }, { id: 'nested-fixture', slug: 'nested-fixture', projectDir: 'designs/second' }];
  for (const entry of entries) {
    const prefix = entry.projectDir === '.' ? '' : `${entry.projectDir}/`;
    write(`${prefix}index.html`, `<html><head><link rel="stylesheet" href="./src/style.css"></head><body><h1>${entry.id}</h1><img src="/assets/${entry.slug}.svg"></body></html>`);
    write(`${prefix}src/style.css`, `body{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Crect filter='url(%23n)'/%3E%3C/svg%3E")}h1{background-image:url('/assets/${entry.slug}.svg')}`);
    write(`${prefix}public/assets/${entry.slug}.svg`, `<svg xmlns="http://www.w3.org/2000/svg"><title>${entry.id}</title></svg>`);
    await build({ root: path.join(root, prefix), configFile: false, logLevel: 'silent', base: entry.projectDir === '.' ? '/' : `/${entry.projectDir}/`, build: { emptyOutDir: true } });
    entry.status = 'accepted';
    const archiveBytes = Buffer.from(`HTTP fixture ${entry.id}`);
    entry.release = { bytes: archiveBytes.length, sha256: crypto.createHash('sha256').update(archiveBytes).digest('hex') };
    write(`dist/${entry.slug}-source.zip`, archiveBytes);
  }
  fs.mkdirSync(path.join(root, 'dist/designs/second'), { recursive: true });
  fs.cpSync(path.join(root, 'designs/second/dist'), path.join(root, 'dist/designs/second'), { recursive: true });
  const result = await verifyHttp({ templates: entries }, root);
  assert.deepEqual(result.map(item => item.previewPath), ['/', '/designs/second/']);
  assert.ok(result.every(item => item.status === 200 && item.previewStatus === 200 && item.assetsChecked >= 2));

  // Vite's HTML fallback must not disguise a missing nested image as HTTP success.
  fs.unlinkSync(path.join(root, 'dist/designs/second/assets/nested-fixture.svg'));
  await assert.rejects(verifyHttp({ templates: entries }, root), /Preview asset failed/);
});
