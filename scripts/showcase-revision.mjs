import fs from 'node:fs';
import {child} from './collection.mjs';
import {loadRenderer} from './production/renderers.mjs';
import {assertPerformanceDelivery} from './production/performance.mjs';
import {verifyEvidence} from './quality-gate.mjs';

// A presentation revision never overwrites the frozen comparison inventory.
export function showcaseRevision(item, base, root) {
  if (!item.revision) return null;
  const revision = item.revision;
  if (!revision.authorization?.date || !revision.authorization?.record) throw Error('Revision needs explicit showcase authorization');
  fs.readFileSync(child(root, revision.authorization.record));
  const renderer = loadRenderer(root, revision.rendererId);
  if (renderer.definition.templateId !== base.id || revision.sourceSha256 !== renderer.definition.sourceSha256) throw Error('Showcase revision source/identity mismatch');
  const handoff = JSON.parse(fs.readFileSync(child(root, renderer.definition.qualification.path), 'utf8'));
  assertPerformanceDelivery(root, handoff, revision.sourceSha256);
  if (revision.archiveSha256 !== renderer.archive.sha256) throw Error('Showcase revision archive mismatch');
  const expected = [`public/collection/${base.id}.webp`, `public/collection/${base.id}-small.webp`];
  if (revision.thumbnails?.length !== 2 || !expected.every(p => revision.thumbnails.some(e => e.path === p))) throw Error('Revision must bind both actual thumbnails');
  verifyEvidence(root, revision.thumbnails);
  return { ...renderer.entry, preview: `/designs/${base.id}-${renderer.definition.id}/`, release: renderer.archive, rendererId: renderer.definition.id };
}
