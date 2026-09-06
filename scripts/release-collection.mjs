import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ROOT, loadCollection, template, child, check, receipt, recordRelease, writeCatalog, auditPublic } from './collection.mjs';

function powershell(script, args = [], quiet = false) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts', script), ...args], { cwd: ROOT, encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (!quiet && result.status !== 0) throw new Error(`${script} failed (${result.status})`);
  return result.status === 0;
}
function rejectExtraArchives(data, selected) {
  const selectedIds = new Set(selected.map(t => t.id));
  const allowed = new Set(data.templates.filter(t => t.status === 'accepted' && (t.release || selectedIds.has(t.id))).map(t => `${t.slug}-source.zip`));
  const visit = (directory, prefix = '') => {
    if (!fs.existsSync(directory)) return;
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = prefix + item.name;
      if (item.isSymbolicLink()) throw new Error(`Public symbolic link is forbidden: ${name}`);
      if (item.isDirectory()) visit(path.join(directory, item.name), name + '/');
      else if (/\.zip$/i.test(name) && !allowed.has(name)) throw new Error(`Quarantine unapproved archive before release: ${path.join(directory, item.name)}`);
    }
  };
  visit(path.join(ROOT, 'public'));
  visit(path.join(ROOT, 'dist'));
}
function buildProject(entry) {
  const directory = entry.projectDir === '.' ? ROOT : child(ROOT, entry.projectDir);
  const base = entry.projectDir === '.' ? '/' : `/${entry.projectDir}/`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', '& npm.cmd run build -- --base $env:WEBART_PREVIEW_BASE; exit $LASTEXITCODE'], { cwd: directory, stdio: 'inherit', windowsHide: true, env: { ...process.env, WEBART_PREVIEW_BASE: base } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Production build failed: ${entry.id}`);
}
export async function verifyHttp(data, root = ROOT) {
  const accepted = data.templates.filter(t => t.status === 'accepted' && t.release);
  const { preview } = await import('vite');
  const server = await preview({ root, configFile: false, logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false } });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const checkedAssets = new Set();
  const verifyAsset = async (reference, pageUrl) => {
    if (/^(?:data:|https?:|#)/i.test(reference)) return;
    const url = new URL(reference, pageUrl);
    if (url.origin !== origin || checkedAssets.has(url.href)) return;
    checkedAssets.add(url.href);
    const response = await fetch(url);
    const bytes = Buffer.from(await response.arrayBuffer());
    const localPath = child(path.join(root, 'dist'), decodeURIComponent(url.pathname.slice(1)));
    if (response.status !== 200 || !fs.existsSync(localPath) || digest(bytes) !== digest(fs.readFileSync(localPath))) throw new Error(`Preview asset failed: ${url.pathname}`);
    if (url.pathname.endsWith('.css')) {
      // Consume quoted data URLs whole so SVG filter url(%23id) is not read as a file.
      for (const match of bytes.toString('utf8').matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/g)) await verifyAsset(match[1] ?? match[2] ?? match[3], url);
    }
  };
  try {
    const checks = [];
    for (const entry of accepted) {
      const response = await fetch(`${origin}/${entry.slug}-source.zip`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const archiveDigest = digest(bytes);
      if (response.status !== 200 || response.headers.get('content-type')?.split(';')[0] !== 'application/zip' || bytes.length !== entry.release.bytes || archiveDigest !== entry.release.sha256) throw new Error(`Vite preview ZIP delivery failed: ${entry.id}`);
      const previewPath = entry.projectDir === '.' ? '/' : `/${entry.projectDir}/`;
      const pageUrl = `${origin}${previewPath}`;
      const page = await fetch(pageUrl);
      const html = Buffer.from(await page.arrayBuffer());
      const expectedIndex = entry.projectDir === '.' ? path.join(root, 'dist', 'index.html') : child(path.join(root, 'dist'), `${entry.projectDir}/index.html`);
      if (page.status !== 200 || digest(html) !== digest(fs.readFileSync(expectedIndex))) throw new Error(`Template preview route failed: ${entry.id}`);
      const assetsBefore = checkedAssets.size;
      for (const match of html.toString('utf8').matchAll(/<(?:script|link|img|source)\b[^>]*(?:src|href)=["']([^"']+)["']/g)) await verifyAsset(match[1], pageUrl);
      checks.push({ id: entry.id, status: response.status, contentType: response.headers.get('content-type'), bytes: bytes.length, sha256: archiveDigest, previewPath, previewStatus: page.status, assetsChecked: checkedAssets.size - assetsBefore });
    }
    return checks;
  } finally { server.httpServer.closeIdleConnections?.(); await new Promise(resolve => server.httpServer.close(resolve)); }
}
async function release() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--id')) throw new Error('Usage: node scripts/release-collection.mjs [--id 001]');
  const data = loadCollection();
  const selected = args.length ? [template(data, args[1])] : data.templates.filter(t => t.status === 'accepted');
  if (!selected.length) throw new Error('No accepted templates to release');
  // All gates precede filesystem mutation, including an explicitly requested rejected ID.
  for (const entry of selected) check(entry);
  for (const entry of data.templates.filter(t => t.status === 'accepted' && t.release)) check(entry);
  rejectExtraArchives(data, selected);
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'webart-release-'));
  const results = [];
  try {
    for (const entry of selected) {
      const archive = child(ROOT, `public/${entry.slug}-source.zip`);
      let reusable = false;
      try { receipt(entry); reusable = powershell('verify-package.ps1', ['-ManifestPath', entry.manifest, '-ArchivePath', archive, '-SkipBuild'], true); } catch { reusable = false; }
      if (reusable) {
        powershell('verify-package.ps1', ['-ManifestPath', entry.manifest, '-ArchivePath', archive]);
        results.push({ id: entry.id, mode: 'reused', entry });
      } else {
        const stagedArchive = path.join(staging, `${entry.slug}-source.zip`);
        powershell('package-template.ps1', ['-ManifestPath', entry.manifest, '-StagePath', stagedArchive]);
        results.push({ id: entry.id, mode: 'packaged', entry, stagedArchive });
      }
    }
    for (const entry of selected) check(entry);
    // Only fully verified source archives become public.
    for (const result of results) {
      if (result.stagedArchive) fs.copyFileSync(result.stagedArchive, child(ROOT, `public/${result.entry.slug}-source.zip`));
      recordRelease(data, result.entry);
    }
    writeCatalog(data);
    // The root is the collection host; accepted nested projects get separate preview paths.
    buildProject({ id: 'collection', projectDir: '.' });
    for (const entry of data.templates.filter(t => t.status === 'accepted' && t.release && t.projectDir !== '.')) {
      buildProject(entry);
      const destination = child(path.join(ROOT, 'dist'), entry.projectDir);
      fs.mkdirSync(destination, { recursive: true });
      fs.cpSync(path.join(child(ROOT, entry.projectDir), 'dist'), destination, { recursive: true });
    }
    const publicAudit = auditPublic(data);
    const delivery = await verifyHttp(data);
    const report = { verifiedAt: new Date().toISOString(), templates: results.map(({ id, mode, entry }) => ({ id, mode, ...entry.release, approvedSourceSha256: entry.approval.sourceSha256, cleanInstall: 'passed', cleanBuild: 'passed' })), publicAudit, localHttpDelivery: delivery };
    const reportDirectory = path.join(ROOT, '.webart', 'releases');
    fs.mkdirSync(reportDirectory, { recursive: true });
    fs.writeFileSync(path.join(reportDirectory, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } finally {
    const tempRoot = path.resolve(os.tmpdir()) + path.sep;
    if (!path.resolve(staging).startsWith(tempRoot)) throw new Error('Refusing to remove unverified staging directory');
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  release().catch(error => { process.stderr.write(`Release: ${error.message}\n`); process.exitCode = 1; });
}
