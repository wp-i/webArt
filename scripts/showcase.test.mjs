import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { authorizedTrials, auditPublic } from './collection.mjs';
import { getShowcase, renderCards, renderPage } from './showcase.mjs';

test('all authorized works keep original preview/download identities while presentation numbers are continuous and unbadged', () => {
  const items = getShowcase();
  assert.deepEqual(items.map(item => item.id), ['001', '006', '007', '008']);
  assert.equal(items.filter(item => item.trial).length, 2);
  assert.equal(new Set(items.map(item => item.preview)).size, 4);
  assert.ok(items.every(item => item.bytes > 0 && /^[a-f0-9]{64}$/.test(item.sha256)));
  const markup = renderCards(items);
  for (const item of items) {
    assert.ok(markup.includes(`href="${item.preview}"`));
    assert.ok(markup.includes(`href="${item.download}" download`));
  }
  assert.deepEqual([...markup.matchAll(/class="work-number">(\d+)</g)].map(match => match[1]), ['1', '2', '3', '4']);
  const expanded = renderCards([...items, { ...items[0], id: '009' }]);
  assert.deepEqual([...expanded.matchAll(/class="work-number">(\d+)</g)].map(match => match[1]), ['1', '2', '3', '4', '5']);
  assert.ok(!markup.includes('trial-label') && !markup.includes('试作'));
  const html = renderPage(fs.readFileSync('index.html', 'utf8'));
  assert.ok(!html.includes('<!-- showcase:'));
  assert.equal((html.match(/class="work"/g) || []).length, 4);
  assert.ok(!html.includes('data-filter') && !html.includes('collection-end') && !html.includes('试作'));
  assert.ok(!html.includes('collection-tools') && !html.includes('id="search"') && !html.includes('id="sort"') && !html.includes('empty-state'));
});

test('trial showcase permission cannot bypass its original source fingerprint, full QA or exact download bytes', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webart-showcase-test-'));
  t.after(() => {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const write = (name, value) => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), value); };
  write('docs/authorization.md', 'User explicitly authorized displaying and downloading trial 007.');
  const data = { templates: [{ id: '007', slug: 'trial', status: 'draft', stage: 'trial', records: { brief: 'docs/authorization.md', reference: 'docs/authorization.md', assets: 'docs/authorization.md', qa: 'docs/authorization.md' } }] };
  write('webart.showcase.json', JSON.stringify({ authorization: { date: '2026-10-10', record: 'docs/authorization.md', trialIds: ['007'] }, items: [{ id: '007' }], trialDownloads: [{ id: '007', bytes: 10, sha256: '0'.repeat(64) }] }));
  assert.throws(() => authorizedTrials(data, root), /trial source\/QA approval/);
  data.templates[0].trialApproval = { runtime: 'docs/runtime.json', sourceSha256: '0'.repeat(64) };
  write('docs/runtime.json', JSON.stringify({ mode: 'gate', result: 'passed-observable-checks' }));
  assert.throws(() => authorizedTrials(data, root), /completed full QA/);
  write('webart.showcase.json', JSON.stringify({ authorization: { trialIds: [] } }));
  write('public/trial-source.zip', 'not approved');
  assert.throws(() => auditPublic(data, root), /Unapproved public archive/);
});
