import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { authorizedTrials, auditPublic } from './collection.mjs';
import { getShowcase, renderCards, renderPage } from './showcase.mjs';
import {showcaseRevision} from './showcase-revision.mjs';
import {loadCollection,ROOT,fingerprint} from './collection.mjs';

test('all authorized works keep original preview/download identities while presentation numbers are continuous and unbadged', () => {
  const items = getShowcase();
  const config = JSON.parse(fs.readFileSync('webart.showcase.json', 'utf8'));
  assert.deepEqual(items.map(item => item.id), config.items.map(item => item.id));
  assert.deepEqual(items.filter(item => item.trial).map(item => item.id), config.authorization.trialIds);
  assert.equal(new Set(items.map(item => item.preview)).size, items.length);
  assert.ok(items.every(item => item.bytes > 0 && /^[a-f0-9]{64}$/.test(item.sha256)));
  const markup = renderCards(items);
  for (const item of items) {
    assert.ok(markup.includes(`href="${item.preview}"`));
    assert.ok(markup.includes(`href="${item.download}" download`));
  }
  assert.deepEqual([...markup.matchAll(/class="work-number">(\d+)</g)].map(match => match[1]), items.map((_, index) => String(index + 1)));
  const expanded = renderCards([...items, { ...items[0], id: 'future-render-fixture' }]);
  assert.deepEqual([...expanded.matchAll(/class="work-number">(\d+)</g)].map(match => match[1]), Array.from({ length: items.length + 1 }, (_, index) => String(index + 1)));
  assert.ok(!markup.includes('trial-label') && !markup.includes('试作'));
  assert.ok(!markup.includes('work-category'), 'Category labels remain removed when the inventory expands');
  const html = renderPage(fs.readFileSync('index.html', 'utf8'));
  assert.ok(!html.includes('<!-- showcase:'));
  assert.equal((html.match(/class="work"/g) || []).length, items.length);
  assert.ok(!html.includes('data-filter') && !html.includes('collection-end') && !html.includes('试作'));
  assert.ok(!html.includes('collection-tools') && !html.includes('id="search"') && !html.includes('id="sort"') && !html.includes('empty-state'));
});

test('qualified revision replaces the sixth presentation only, with exact preview, archive and thumbnails',()=>{
 const collection=loadCollection(),config=JSON.parse(fs.readFileSync('webart.showcase.json','utf8')),item=config.items.find(i=>i.id==='010'),base=collection.templates.find(i=>i.id==='010');
 const revision=showcaseRevision(item,base,ROOT),shown=getShowcase().find(i=>i.id==='010');
 assert.equal(collection.templates.length,6);assert.equal(shown.rendererId,'pace-precision-v2');
 assert.equal(shown.preview,'/designs/010-pace-precision-v2/');
 assert.equal(shown.sha256,item.revision.archiveSha256);assert.equal(fingerprint(base),base.trialApproval.sourceSha256);
 assert.notEqual(fingerprint(base),shown.sourceSha256);assert.equal(revision.release.bytes,shown.bytes);
 for(const mutate of [r=>r.sourceSha256='0'.repeat(64),r=>r.archiveSha256='0'.repeat(64),r=>r.thumbnails[0].sha256='0'.repeat(64),r=>r.rendererId='pace-precision-v1',r=>delete r.authorization]){
  const changed=structuredClone(item);mutate(changed.revision);assert.throws(()=>showcaseRevision(changed,base,ROOT));
 }
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
