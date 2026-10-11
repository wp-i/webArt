const fallback = document.querySelector('.preview-fallback');
const toolbar = document.querySelector('.preview-toolbar');
const workspace = document.querySelector('.preview-workspace');
const frame = document.querySelector('#preview-frame');
const loading = document.querySelector('#preview-loading');
const controls = [...document.querySelectorAll('[data-device]')];
const query = new URLSearchParams(location.search);

function setDevice(device) {
  const widths = { desktop: '100%', tablet: '768px', mobile: '390px' };
  if (!widths[device]) device = 'desktop';
  workspace.style.setProperty('--preview-width', widths[device]);
  for (const button of controls) button.setAttribute('aria-pressed', String(button.dataset.device === device));
  const url = new URL(location.href);
  if (device === 'desktop') url.searchParams.delete('device');
  else url.searchParams.set('device', device);
  history.replaceState(null, '', url);
}

try {
  const response = await fetch('/showcase.json');
  if (!response.ok) throw new Error('Catalog unavailable');
  const catalog = await response.json();
  const item = catalog.templates.find(item => item.id === (query.get('id') || catalog.templates[0]?.id));
  if (!item) throw new Error('Unknown design');
  document.title = `${item.title} — 完整预览 · WebArt`;
  document.querySelector('#preview-title').textContent = item.title;
  const download = document.querySelector('#preview-download');
  download.href = item.download;
  download.setAttribute('aria-label', `下载 ${item.title} 源码`);
  download.title = `下载源码 · ${(item.bytes / 1048576).toFixed(1)} MB`;
  document.querySelector('#open-original').href = item.preview;
  frame.title = `${item.title} 完整网页预览`;
  try {
    const saved = JSON.parse(sessionStorage.getItem('webart.return'));
    if (saved && new URL(saved.url, location.origin).origin === location.origin && new URL(saved.url, location.origin).pathname === '/') document.querySelector('#back').href = saved.url;
  } catch {}
  const timer = setTimeout(() => { loading.textContent = '仍在载入，可使用右上角在新窗口打开。'; }, 12000);
  frame.addEventListener('load', () => { clearTimeout(timer); loading.hidden = true; }, { once: true });
  frame.src = item.preview;
  fallback.hidden = true;
  toolbar.hidden = false;
  workspace.hidden = false;
  setDevice(query.get('device') || 'desktop');
  for (const button of controls) button.addEventListener('click', () => setDevice(button.dataset.device));
} catch (error) {
  document.querySelector('#fallback-title').textContent = query.has('id') ? '这份设计暂未收录。' : '暂时无法载入预览。';
  document.querySelector('#fallback-message').textContent = '你仍可以从下方直接打开现有作品，或返回作品集。';
}
