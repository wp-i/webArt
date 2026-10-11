// Old collection controls no longer affect the complete, ordered gallery.
const current = new URL(location.href);
if (['category', 'q', 'sort'].some(key => current.searchParams.has(key))) {
  for (const key of ['category', 'q', 'sort']) current.searchParams.delete(key);
  history.replaceState(history.state, '', current);
}
for (const link of document.querySelectorAll('[data-open-info]')) {
  link.addEventListener('click', () => { document.querySelector('#download-info').open = true; });
}
for (const link of document.querySelectorAll('[data-preview-target]')) {
  link.href = link.dataset.previewTarget;
  link.addEventListener('click', () => {
    try { sessionStorage.setItem('webart.return', JSON.stringify({ url: location.pathname + location.search, scroll: scrollY, time: Date.now() })); } catch {}
  });
}
try {
  const saved = JSON.parse(sessionStorage.getItem('webart.return'));
  if (saved?.url === location.pathname + location.search && Date.now() - saved.time < 1800000) {
    document.fonts.ready.then(() => requestAnimationFrame(() => scrollTo({ top: saved.scroll, behavior: 'instant' })));
    sessionStorage.removeItem('webart.return');
  }
} catch {}
document.body.dataset.galleryReady = 'true';
