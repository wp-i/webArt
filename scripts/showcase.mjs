import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, loadCollection, check, checkTrial, receipt, manifestFiles, child, qualityPolicyApplies, fingerprint } from './collection.mjs';
import { assertRetainedPreview } from './quality-gate.mjs';
import {showcaseRevision} from './showcase-revision.mjs';

export const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>';
export const down = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5"/></svg>';

export function getShowcase(root = ROOT) {
  const source = JSON.parse(fs.readFileSync(path.join(root, 'webart.showcase.json'), 'utf8'));
  const collection = loadCollection(root);
  if (source.schemaVersion !== 1 || !Array.isArray(source.items) || new Set(source.items.map(item => item.id)).size !== source.items.length) throw new Error('Invalid showcase inventory');
  return source.items.map(item => {
    const base = collection.templates.find(template => template.id === item.id);
    if (!base) throw new Error(`Unregistered showcase item: ${item.id}`);
    const revision = showcaseRevision(item, base, root);
    const entry = revision ?? base;
    const trial = entry.status === 'draft' && entry.stage === 'trial';
    let delivery;
    if (trial) {
      if (!source.authorization?.date || !source.authorization?.trialIds?.includes(entry.id) || !fs.statSync(child(root, source.authorization.record)).isFile()) throw new Error(`Showcase needs explicit trial authorization: ${entry.id}`);
      checkTrial(entry, root);
      delivery = revision?.release ?? source.trialDownloads?.find(record => record.id === entry.id);
      if (!delivery) throw new Error(`Missing trial download receipt: ${entry.id}`);
      const archive = fs.existsSync(path.join(root, `public/${entry.slug}-source.zip`)) ? path.join(root, `public/${entry.slug}-source.zip`) : path.join(root, `.webart/trials/${entry.id}/${entry.slug}-source.zip`);
      receipt({ ...entry, release: delivery }, archive, root);
      if (!revision && qualityPolicyApplies(root)) assertRetainedPreview(root, entry, fingerprint(entry, root), delivery);
    } else {
      check(entry, root);
      delivery = receipt(entry, undefined, root);
    }
    const {revision: internalRevision, ...presentation} = item;
    return { id: entry.id, slug: entry.slug, title: entry.title, ...presentation, trial, ...(revision ? {rendererId: revision.rendererId, sourceSha256: fingerprint(entry, root)} : {}), preview: entry.preview || (entry.projectDir === '.' ? '/designs/001-weight-of-light/' : `/${entry.projectDir}/`), download: `/${entry.slug}-source.zip`, thumbnail: `/collection/${entry.id}.webp`, thumbnailSmall: `/collection/${entry.id}-small.webp`, version: manifestFiles(entry, root).config.version, bytes: delivery.bytes, sha256: delivery.sha256 };
  });
}

export function renderCards(items) {
  return items.map((item, index) => `<article class="work" data-id="${item.id}">
  <a class="work-preview" href="${item.preview}" data-preview-target="/preview.html?id=${item.id}" aria-label="完整预览 ${escapeHtml(item.title)}" style="--work-bg:${item.background}">
    <img src="${item.thumbnail}" srcset="${item.thumbnailSmall} 600w, ${item.thumbnail} 1200w" sizes="(min-width:1700px) 31vw, (min-width:700px) 47vw, 94vw" width="1200" height="750" alt="${escapeHtml(item.title)} 的网页首屏预览" ${index < 2 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
    <span class="preview-action">完整预览 ${arrow}</span>
  </a>
  <div class="work-info"><div><div class="work-heading"><span class="work-number">${index + 1}</span><h2><a href="${item.preview}" data-preview-target="/preview.html?id=${item.id}">${escapeHtml(item.title)}</a></h2></div><p class="work-description">${escapeHtml(item.description)}</p></div><a class="work-download" href="${item.download}" download aria-label="下载 ${escapeHtml(item.title)} 源码" title="下载源码 · ${(item.bytes / 1048576).toFixed(1)} MB">${down}</a></div>
</article>`).join('\n');
}

export function renderPage(html, root = ROOT) {
  const items = getShowcase(root);
  return html.replaceAll('<!-- showcase:count -->', String(items.length))
    .replace('<!-- showcase:cards -->', renderCards(items))
    .replace('<!-- showcase:script -->', '<script type="module" src="/gallery/main.js"></script>');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode === 'gate') {
    const output = path.join(ROOT, '.webart/home-gate');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'index.html'), renderPage(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), ROOT));
    console.log('Four-state directory prototype ready.');
  } else if (mode === 'catalog') {
    const items = getShowcase();
    fs.writeFileSync(path.join(ROOT, 'public/showcase.json'), JSON.stringify({ schemaVersion: 1, templates: items }, null, 2) + '\n');
    console.log(`Verified ${items.length} showcase entries.`);
  } else throw new Error('Usage: node scripts/showcase.mjs gate|catalog');
}
