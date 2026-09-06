import { initializeMediaShaders } from './media-shader.js';

const progressLine = document.querySelector('.page-progress i');
const cursor = document.querySelector('.cursor');
const header = document.querySelector('.site-header');
const orbitChapter = document.querySelector('.header-orbit__chapter');
const chapters = [...document.querySelectorAll('.chapter')];
const approach = document.querySelector('.approach');
const field = document.querySelector('.field');
const ending = document.querySelector('.ending');
const darkSurfaces = [...document.querySelectorAll('.hero-stage, .approach__image, .field-stage, .ending')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;

let scrollFrame = 0;
let darkBands = [];
let metrics = {};

const clamp = (value) => Math.min(1, Math.max(0, value));

function entryProgress(top, lead = .8, duration = .56) {
  return clamp((scrollY - (top - innerHeight * lead)) / (innerHeight * duration));
}

function measureLayout() {
  darkBands = darkSurfaces.map((surface) => {
    const rect = surface.getBoundingClientRect();
    return [rect.top + scrollY, rect.bottom + scrollY];
  });
  metrics = {
    approachTop: approach.offsetTop,
    fieldTop: field.offsetTop,
    fieldEnd: field.offsetTop + field.offsetHeight,
    fieldStageEnd: field.offsetTop + field.querySelector('.field-stage').offsetHeight,
    endingTop: ending.offsetTop,
  };
}

function paintProgress() {
  scrollFrame = 0;
  const range = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  progressLine.style.transform = `scaleX(${Math.min(1, Math.max(0, scrollY / range))})`;

  const approachReveal = entryProgress(metrics.approachTop, .82, .55);
  const headingReveal = clamp((approachReveal - .08) / .46);
  const imageReveal = clamp((approachReveal - .3) / .48);
  const copyReveal = clamp((approachReveal - .48) / .38);
  approach.style.setProperty('--route-offset', (2900 * (1 - approachReveal)).toFixed(1));
  approach.style.setProperty('--approach-heading-clip', `${((1 - headingReveal) * 100).toFixed(1)}%`);
  approach.style.setProperty('--approach-heading-y', `${((1 - headingReveal) * 42).toFixed(1)}px`);
  approach.style.setProperty('--approach-image-clip', `${((1 - imageReveal) * 100).toFixed(1)}%`);
  approach.style.setProperty('--approach-image-y', `${((1 - imageReveal) * 36).toFixed(1)}px`);
  approach.style.setProperty('--approach-copy-clip', `${((1 - copyReveal) * 100).toFixed(1)}%`);
  approach.style.setProperty('--approach-copy-y', `${((1 - copyReveal) * 30).toFixed(1)}px`);
  approach.classList.toggle('is-heading-gone', scrollY - metrics.approachTop > innerHeight * .09);
  approach.classList.toggle('is-route-gone', scrollY - metrics.approachTop > innerHeight * .22);
  approach.classList.toggle('is-leaving', scrollY - metrics.approachTop > innerHeight * .34);

  let fieldBridge = 0;
  if (innerWidth > 900) {
    const fieldEntry = entryProgress(metrics.fieldTop, .74, .54);
    fieldBridge = clamp((scrollY - metrics.fieldTop - innerHeight * .2) / (innerHeight * .28));
    const enterShift = (1 - fieldEntry) * 18;
    const orbScale = .72 + fieldEntry * .28;
    const orbTurn = -28 + fieldEntry * 28;
    field.style.setProperty('--field-left-shift', `${(-enterShift).toFixed(2)}vw`);
    field.style.setProperty('--field-right-shift', `${enterShift.toFixed(2)}vw`);
    field.style.setProperty('--field-orb-scale', orbScale.toFixed(3));
    field.style.setProperty('--field-orb-turn', `${orbTurn.toFixed(1)}deg`);
    field.style.setProperty('--field-bridge', fieldBridge.toFixed(3));
    field.style.setProperty('--field-bridge-clip', `${((1 - fieldBridge) * 100).toFixed(1)}%`);
    field.classList.toggle('is-past-opening', scrollY - metrics.fieldTop > 32);
  } else {
    field.style.setProperty('--field-left-shift', '0vw');
    field.style.setProperty('--field-right-shift', '0vw');
    field.style.setProperty('--field-orb-scale', '1');
    field.style.setProperty('--field-orb-turn', '0deg');
    field.style.setProperty('--field-bridge', '1');
    field.style.setProperty('--field-bridge-clip', '0%');
    field.classList.remove('is-past-opening');
  }

  const endingEntry = clamp((innerHeight - (metrics.endingTop - scrollY)) / (innerHeight * .82));
  const endingCopy = clamp((endingEntry - .82) / .16);
  ending.style.setProperty('--ending-copy-clip', `${((1 - endingCopy) * 100).toFixed(1)}%`);
  ending.style.setProperty('--ending-copy-y', `${((1 - endingCopy) * 42).toFixed(1)}px`);
  ending.style.setProperty('--ending-media-scale', (1.055 - endingEntry * .055).toFixed(4));

  const headerZoneTop = scrollY + 48;
  const headerZoneBottom = scrollY + 110;
  const headerOnDarkBridge = headerZoneBottom >= metrics.fieldStageEnd && headerZoneTop <= metrics.fieldEnd;
  const headerOnMedia = headerOnDarkBridge || darkBands.some(([top, bottom]) => headerZoneBottom >= top && headerZoneTop <= bottom);
  header.classList.toggle('is-on-media', headerOnMedia);

  const chapterSample = scrollY + innerHeight * .42;
  let activeChapter = chapters[0];
  chapters.forEach((chapter) => {
    if (chapter.offsetTop <= chapterSample) activeChapter = chapter;
  });
  orbitChapter.textContent = String(activeChapter.dataset.chapter).padStart(2, '0');
}

function requestProgress() {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(paintProgress);
}

addEventListener('scroll', requestProgress, { passive: true });
addEventListener('resize', () => {
  measureLayout();
  requestProgress();
}, { passive: true });
measureLayout();
paintProgress();

const mediaShaders = initializeMediaShaders({ reducedMotion });
window.__objectsInField = { mediaShaders, reducedMotion, finePointer };

if (finePointer) {
  let pointerX = -40;
  let pointerY = -40;
  let pointerFrame = 0;

  function paintPointer() {
    pointerFrame = 0;
    cursor.style.transform = `translate3d(${pointerX}px, ${pointerY}px, 0) translate(-50%, -50%)`;

  }

  function requestPointer() {
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(paintPointer);
  }

  addEventListener('pointermove', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    cursor.classList.add('is-visible');
    cursor.classList.toggle('is-suppressed', event.clientY <= 120);
    if (event.clientY <= 120) cursor.classList.remove('is-active');
    requestPointer();
  }, { passive: true });

  document.addEventListener('mouseleave', () => cursor.classList.remove('is-visible'));

  document.querySelectorAll('[data-shader]').forEach((stage) => {
    stage.addEventListener('pointerenter', () => {
      cursor.querySelector('span').textContent = stage.dataset.cursor || 'VIEW';
      cursor.classList.add('is-active');
    });

    stage.addEventListener('pointerleave', () => {
      cursor.classList.remove('is-active');
    });
  });
}
