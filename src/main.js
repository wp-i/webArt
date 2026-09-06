import "./styles.css";

const page = document.querySelector(".page");
const heroSection = document.querySelector(".hero-section");
const heroImage = document.querySelector(".visual__image--base");
const chapters = [...document.querySelectorAll(".chapter")];
const panel = document.querySelector("#index-panel");
const panelTrigger = document.querySelector(".index-trigger");
const panelClose = document.querySelector(".index-close");
const panelBackdrop = document.querySelector(".index-backdrop");
const approach = document.querySelector(".approach");
const identity = document.querySelector(".identity");
const cursor = document.querySelector(".cursor");
const cursorLabel = cursor.querySelector("span");
const currentFolio = document.querySelector(".folio__current");
const activeLabel = document.querySelector("#active-label");
const progressBar = document.querySelector(".page-progress span");
const main = document.querySelector("main");
const header = document.querySelector(".header");
const skipLink = document.querySelector(".skip-link");
const passage = document.querySelector(".passage");
const exposeControl = document.querySelector(".expose-control");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const desktopStage = window.matchMedia("(min-width: 761px)");

async function revealPage() {
  try {
    if (!heroImage.complete) await heroImage.decode();
  } catch {
    // The loading curtain still clears if image decoding is interrupted.
  }
  requestAnimationFrame(() => page.classList.add("is-ready"));
}

revealPage();

/* One pointer language across the complete study. */

const pointer = { x: window.innerWidth * 0.72, y: window.innerHeight * 0.47 };
const target = { ...pointer };
const cursorPosition = { ...pointer };
let cursorFrame = null;

function renderPointer() {
  cursorFrame = null;
  pointer.x += (target.x - pointer.x) * 0.1;
  pointer.y += (target.y - pointer.y) * 0.1;
  cursorPosition.x += (target.x - cursorPosition.x) * 0.23;
  cursorPosition.y += (target.y - cursorPosition.y) * 0.23;

  page.style.setProperty("--mx", `${pointer.x}px`);
  page.style.setProperty("--my", `${pointer.y}px`);
  page.style.setProperty("--nx", (pointer.x / window.innerWidth - 0.5).toFixed(4));
  page.style.setProperty("--ny", (pointer.y / window.innerHeight - 0.5).toFixed(4));
  page.style.setProperty("--shift-x", `${(0.5 - pointer.x / window.innerWidth) * 12}px`);
  page.style.setProperty("--shift-y", `${(0.5 - pointer.y / window.innerHeight) * 8}px`);
  cursor.style.transform = `translate3d(${cursorPosition.x}px, ${cursorPosition.y}px, 0) translate(-50%, -50%)`;

  const unsettled = Math.abs(target.x - pointer.x) > 0.2 || Math.abs(target.y - pointer.y) > 0.2;
  if (unsettled && !document.hidden) cursorFrame = requestAnimationFrame(renderPointer);
}

function requestPointerFrame() {
  if (!cursorFrame && !document.hidden) cursorFrame = requestAnimationFrame(renderPointer);
}

if (finePointer) {
  document.documentElement.classList.add("has-custom-cursor");

  window.addEventListener("pointermove", (event) => {
    target.x = event.clientX;
    target.y = event.clientY;
    if (reduceMotion) {
      pointer.x = target.x;
      pointer.y = target.y;
      cursorPosition.x = target.x;
      cursorPosition.y = target.y;
    }
    cursor.classList.add("is-visible");
    requestPointerFrame();
  }, { passive: true });

  document.addEventListener("pointerleave", () => cursor.classList.remove("is-visible"));
  document.querySelectorAll("[data-cursor], button, a, .passage").forEach((element) => {
    element.addEventListener("pointerenter", () => {
      cursorLabel.textContent = element.dataset.cursor || "Trace";
      cursor.classList.add("is-interactive");
    });
    element.addEventListener("pointerleave", () => {
      cursorLabel.textContent = "Light";
      cursor.classList.remove("is-interactive");
    });
  });
} else {
  cursor.hidden = true;
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) requestPointerFrame();
});

passage.addEventListener("pointermove", (event) => {
  const rect = passage.getBoundingClientRect();
  const x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
  const y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
  passage.style.setProperty("--passage-x", `${x}%`);
  passage.style.setProperty("--passage-y", `${y}%`);
}, { passive: true });

/* Scroll state, section progress, and restrained reveals. */

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("is-revealed");
    revealObserver.unobserve(entry.target);
  });
}, { threshold: 0.14, rootMargin: "0px 0px -5% 0px" });

document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

let scrollFrame = null;
let lockedScrollY = 0;

function elementAtSample(elements, samplePoint) {
  let active = elements[0];
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.top <= samplePoint) active = element;
    if (rect.top <= samplePoint && rect.bottom > samplePoint) return element;
  }
  return active;
}

function updateScrollState() {
  scrollFrame = null;
  const scrollTop = window.scrollY;
  const scrollRange = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollRange > 0 ? Math.min(1, Math.max(0, scrollTop / scrollRange)) : 0;
  let activeChapter;

  if (desktopStage.matches) {
    const phase = progress * (chapters.length - 1);
    const activeIndex = Math.min(chapters.length - 1, Math.max(0, Math.round(phase)));
    activeChapter = chapters[activeIndex];

    chapters.forEach((chapter, index) => {
      const distance = Math.abs(phase - index);
      const fadePosition = Math.min(1, Math.max(0, (distance - 0.16) / 0.33));
      const opacity = 1 - fadePosition * fadePosition * (3 - 2 * fadePosition);
      const scale = 1 + Math.min(1, distance) * 0.018;
      const localProgress = Math.min(1, Math.max(0, phase - index + 0.5));

      chapter.style.setProperty("--chapter-opacity", opacity.toFixed(4));
      chapter.style.setProperty("--chapter-scale", scale.toFixed(4));
      chapter.style.setProperty("--section-progress", localProgress.toFixed(4));
      chapter.classList.toggle("is-current", index === activeIndex);
      chapter.inert = index !== activeIndex;
      chapter.setAttribute("aria-hidden", String(index !== activeIndex));
    });
  } else {
    const samplePoint = window.innerHeight * 0.42;
    activeChapter = elementAtSample(chapters, samplePoint);

    chapters.forEach((chapter) => {
      const rect = chapter.getBoundingClientRect();
      const chapterProgress = Math.min(1, Math.max(0, (window.innerHeight - rect.top) / (window.innerHeight + rect.height)));
      chapter.style.removeProperty("--chapter-opacity");
      chapter.style.removeProperty("--chapter-scale");
      chapter.style.setProperty("--section-progress", chapterProgress.toFixed(4));
      chapter.classList.toggle("is-current", chapter === activeChapter);
      chapter.inert = false;
      chapter.removeAttribute("aria-hidden");
    });
  }

  progressBar.style.transform = `scaleX(${progress})`;
  page.classList.toggle("is-scrolled", desktopStage.matches ? progress > 0.055 : scrollTop > window.innerHeight * 0.45);
  page.classList.toggle("theme-light", activeChapter.dataset.theme === "light");
  currentFolio.textContent = activeChapter.dataset.chapter;
  activeLabel.innerHTML = activeChapter.dataset.label.replace(" / ", "<br />");

  document.querySelectorAll(".index-nav a").forEach((link) => {
    const isCurrent = link.getAttribute("href") === `#${activeChapter.id}`;
    if (isCurrent) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

window.addEventListener("scroll", () => {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollState);
}, { passive: true });
window.addEventListener("resize", updateScrollState, { passive: true });
updateScrollState();

/* Chapter links keep native, continuous scroll instead of forcing a viewport jump. */

function scrollToChapter(targetIndex) {
  const nextIndex = Math.min(chapters.length - 1, Math.max(0, targetIndex));
  const nextChapter = chapters[nextIndex];
  if (!nextChapter) return;

  if (!desktopStage.matches) {
    nextChapter.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    return;
  }

  const scrollRange = document.documentElement.scrollHeight - window.innerHeight;
  const targetTop = (nextIndex / (chapters.length - 1)) * scrollRange;
  window.scrollTo({ top: targetTop, behavior: reduceMotion ? "auto" : "smooth" });
}

/* A single deliberate pressure state in the material passage. */

let exposeTimer = null;

function setExposed(exposed) {
  window.clearTimeout(exposeTimer);
  passage.classList.toggle("is-exposed", exposed);
  exposeControl.setAttribute("aria-pressed", String(exposed));
}

exposeControl.addEventListener("pointerdown", () => setExposed(true));
window.addEventListener("pointerup", () => setExposed(false));
exposeControl.addEventListener("pointercancel", () => setExposed(false));
exposeControl.addEventListener("click", () => {
  setExposed(true);
  exposeTimer = window.setTimeout(() => setExposed(false), reduceMotion ? 0 : 900);
});
exposeControl.addEventListener("keydown", (event) => {
  if (event.key !== " " && event.key !== "Enter") return;
  setExposed(true);
});
exposeControl.addEventListener("keyup", (event) => {
  if (event.key !== " " && event.key !== "Enter") return;
  setExposed(false);
});

/* Accessible fixed index. */

let lastFocused = null;

function setPanel(open, restoreFocus = true) {
  if (open === panel.classList.contains("is-open")) return;
  if (open) lastFocused = document.activeElement;

  panel.classList.toggle("is-open", open);
  panelBackdrop.classList.toggle("is-open", open);
  panel.setAttribute("aria-hidden", String(!open));
  panel.inert = !open;
  panelTrigger.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("panel-open", open);

  if (open) {
    lockedScrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.style.width = "100%";
  } else {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    window.scrollTo(0, lockedScrollY);
  }

  main.inert = open;
  header.inert = open;
  skipLink.inert = open;

  if (open) window.setTimeout(() => panelClose.focus(), 60);
  else if (restoreFocus) (lastFocused || panelTrigger).focus();
}

panelTrigger.addEventListener("click", () => setPanel(true));
panelClose.addEventListener("click", () => setPanel(false));
panelBackdrop.addEventListener("click", () => setPanel(false));
document.querySelectorAll("[data-panel-link]").forEach((link) => {
  link.addEventListener("click", (event) => {
    if (!desktopStage.matches) {
      setPanel(false, false);
      return;
    }

    event.preventDefault();
    const targetIndex = chapters.findIndex((chapter) => `#${chapter.id}` === link.getAttribute("href"));
    setPanel(false, false);
    window.setTimeout(() => scrollToChapter(targetIndex), 40);
  });
});

identity.addEventListener("click", (event) => {
  if (!desktopStage.matches) return;
  event.preventDefault();
  scrollToChapter(0);
});

window.addEventListener("keydown", (event) => {
  if (!panel.classList.contains("is-open")) return;
  if (event.key === "Escape") {
    setPanel(false);
    return;
  }

  if (event.key !== "Tab") return;
  const focusable = [...panel.querySelectorAll("a[href], button:not([disabled])")];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

approach.addEventListener("click", () => {
  heroSection.classList.remove("is-approached");
  requestAnimationFrame(() => heroSection.classList.add("is-approached"));
  window.setTimeout(() => {
    heroSection.classList.remove("is-approached");
    scrollToChapter(1);
  }, reduceMotion ? 0 : 420);
});
