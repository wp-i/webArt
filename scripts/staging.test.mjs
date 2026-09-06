import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { ROOT, auditPublic, loadCollection, receipt, template } from './collection.mjs';

test('private ZIP creation verifies a clean build and leaves the approved public archive unchanged', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'webart-staging-check-'));
  t.after(() => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const data = loadCollection();
  const entry = template(data, '001');
  const before = receipt(entry);
  const archive = path.join(directory, 'verified-source.zip');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts/package-template.ps1'), '-ManifestPath', entry.manifest, '-StagePath', archive], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.ok(fs.statSync(archive).size > 0);
  assert.deepEqual(receipt(entry), before);
  assert.equal(auditPublic(data).accepted, 1);
});
