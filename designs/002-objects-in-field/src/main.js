import './style.css';

// Native scrolling and the static page work without this optional enhancement.
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const media = [...document.querySelectorAll('.media[data-depth]')];

function reset(frame) {
  frame.style.removeProperty('--media-x');
  frame.style.removeProperty('--media-y');
}

media.forEach((frame) => {
  frame.addEventListener('pointermove', (event) => {
    if (!finePointer.matches || reducedMotion.matches || event.pointerType === 'touch') return;
    const bounds = frame.getBoundingClientRect();
    const depth = Number(frame.dataset.depth);
    frame.style.setProperty('--media-x', `${((event.clientX - bounds.left) / bounds.width - 0.5) * depth}px`);
    frame.style.setProperty('--media-y', `${((event.clientY - bounds.top) / bounds.height - 0.5) * depth}px`);
  }, { passive: true });
  frame.addEventListener('pointerleave', () => reset(frame));
  frame.addEventListener('pointercancel', () => reset(frame));
});

const resetAll = () => media.forEach(reset);
finePointer.addEventListener('change', resetAll);
reducedMotion.addEventListener('change', resetAll);
window.addEventListener('blur', resetAll);
