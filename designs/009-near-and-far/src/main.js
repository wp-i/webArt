const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const hero = document.querySelector('.hero');
const series = document.querySelector('.series');
let frame = 0;
const clamp = value => Math.max(0, Math.min(1, value));
const photos = [];
const titles = ['Coast', 'Passing shadows', 'Lines of silence'];
let viewer, viewerImage, viewerTitle, viewerCount, returnFocus, savedOverflow, photoIndex = 0;

function showPhoto(index) {
  photoIndex = (index + photos.length) % photos.length;
  const image = photos[photoIndex].querySelector('img');
  viewerImage.src = image.currentSrc || image.src;
  viewerImage.alt = image.alt;
  viewerTitle.textContent = titles[photoIndex];
  viewerCount.textContent = `${photoIndex + 1} / ${photos.length}`;
}
function createViewer() {
  viewer = document.createElement('dialog');
  viewer.className = 'photo-dialog';
  viewer.setAttribute('aria-labelledby', 'photo-title');
  viewer.innerHTML = '<header class="photo-heading"><h2 id="photo-title"></h2><button class="photo-close" type="button" autofocus aria-label="Close full photograph">Close ×</button></header><div class="photo-canvas"><img alt=""></div><div class="photo-toolbar"><button class="photo-previous" type="button" aria-label="Previous photograph">← Previous</button><span class="photo-count" aria-live="polite"></span><button class="photo-next" type="button" aria-label="Next photograph">Next →</button></div>';
  viewerImage = viewer.querySelector('img');
  viewerTitle = viewer.querySelector('h2');
  viewerCount = viewer.querySelector('.photo-count');
  viewer.querySelector('.photo-close').addEventListener('click', () => viewer.close());
  viewer.querySelector('.photo-previous').addEventListener('click', () => showPhoto(photoIndex - 1));
  viewer.querySelector('.photo-next').addEventListener('click', () => showPhoto(photoIndex + 1));
  viewer.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showPhoto(photoIndex + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  viewer.addEventListener('click', event => {
    if (event.target !== viewer) return;
    const bounds = viewer.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) viewer.close();
  });
  viewer.addEventListener('close', () => {
    document.body.style.overflow = savedOverflow;
    viewer.remove();
    viewer = null;
    returnFocus?.focus({ preventScroll: true });
  });
  document.body.append(viewer);
}
if (typeof HTMLDialogElement !== 'undefined' && 'showModal' in HTMLDialogElement.prototype) {
  document.querySelectorAll('div.picture-link[data-photo]').forEach((container, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = container.className;
    button.dataset.photo = container.dataset.photo;
    button.setAttribute('aria-label', container.getAttribute('aria-label'));
    button.setAttribute('aria-haspopup', 'dialog');
    button.append(...container.childNodes);
    container.replaceWith(button);
    photos.push(button);
    button.addEventListener('click', () => {
      returnFocus = button;
      savedOverflow = document.body.style.overflow;
      createViewer();
      showPhoto(index);
      document.body.style.overflow = 'hidden';
      viewer.showModal();
    });
  });
}
function render() {
  frame = 0;
  const heroProgress = clamp(scrollY / Math.max(1, hero.offsetHeight));
  const seriesProgress = clamp((innerHeight - series.getBoundingClientRect().top) / (innerHeight + series.offsetHeight));
  hero.style.setProperty('--shift', reduced.matches ? '0px' : `${heroProgress * 24}px`);
  hero.style.setProperty('--wash', reduced.matches ? 0 : heroProgress * .42);
  series.style.setProperty('--side', reduced.matches ? .6 : .45 + seriesProgress * .5);
}
function schedule() { if (!frame) frame = requestAnimationFrame(render); }
addEventListener('scroll', schedule, { passive: true });
addEventListener('resize', schedule);
reduced.addEventListener('change', schedule);
document.querySelectorAll('.picture-link').forEach(link => {
  link.addEventListener('pointermove', event => {
    if (!finePointer.matches || reduced.matches || event.pointerType !== 'mouse') return;
    const bounds = link.getBoundingClientRect();
    link.style.setProperty('--mx', `${((event.clientX - bounds.left) / bounds.width - .5) * 10}px`);
    link.style.setProperty('--my', `${((event.clientY - bounds.top) / bounds.height - .5) * 8}px`);
  });
  link.addEventListener('pointerleave', () => {
    link.style.setProperty('--mx', '0px');
    link.style.setProperty('--my', '0px');
  });
});
schedule();
