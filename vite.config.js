import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import { ROOT, loadCollection } from './scripts/collection.mjs';
import { renderPage, getShowcase, escapeHtml, arrow, down } from './scripts/showcase.mjs';

const collection = loadCollection();
const nested = collection.templates.filter(entry => entry.projectDir !== '.');
const relative = filename => path.relative(ROOT, filename.split('?')[0]).replaceAll('\\', '/');
const entryFor = filename => nested.find(entry => relative(filename).startsWith(entry.projectDir + '/'));

export default defineConfig({
  plugins: [{
    name: 'webart-independent-previews',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const file = relative(context.filename);
        if (file === 'index.html') return renderPage(html);
        if (file === 'preview.html') {
          const items = getShowcase();
          return html.replace('<!-- showcase:fallback -->', items.map(item => `<li><a href="${item.preview}">${escapeHtml(item.title)} ${arrow}</a><a href="${item.download}" download aria-label="下载 ${escapeHtml(item.title)} 源码">${down}</a></li>`).join(''));
        }
        const entry = entryFor(context.filename);
        if (!entry) return html;
        // Keep approved template sources byte-identical; scope their root asset paths only when serving the collection.
        return html.replace(/((?:src|href)=["'])\/assets\//g, `$1/${entry.projectDir}/public/assets/`).replace(/((?:src|href)=["'])\/src\//g, `$1/${entry.projectDir}/src/`);
      }
    },
    transform(code, id) {
      if (!/\.css(?:\?|$)/.test(id)) return;
      const entry = entryFor(id);
      if (entry) return { code: code.replaceAll('/assets/', `/${entry.projectDir}/public/assets/`), map: null };
    },
    configureServer(server) {
      // A missing file must be a real 404 rather than the gallery HTML fallback.
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (/^\/(?:assets|collection|designs\/[^/]+\/public\/assets)\//.test(pathname)) {
          const file = pathname.startsWith('/assets/') || pathname.startsWith('/collection/') ? path.join(ROOT, 'public', pathname) : path.join(ROOT, pathname);
          if (!fs.existsSync(file)) { response.statusCode = 404; response.end('Asset not found'); return; }
        }
        next();
      });
    }
  }],
  build: {
    rolldownOptions: {
      input: { collection: path.join(ROOT, 'index.html'), preview: path.join(ROOT, 'preview.html'), ...Object.fromEntries(collection.templates.map(entry => [entry.slug, path.join(ROOT, entry.projectDir === '.' ? 'designs/001-weight-of-light/index.html' : `${entry.projectDir}/index.html`)])) }
    }
  }
});
