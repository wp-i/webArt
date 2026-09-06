# Objects in Field

A one-page Vite template for a spatial-design or creative-technology studio. It uses original imagery, ordinary native document scrolling, event-driven optical lenses, pointer-responsive media and a custom cursor. Button-shaped labels are intentionally decorative in the supplied art-demo and the page contains no audio.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Customize

- Edit copy and visual labels in `index.html`.
- Replace the four unique images in `public/assets/` while keeping their aspect ratios and semantic roles.
- Adjust color, type scale and composition tokens at the top of `src/style.css`.
- Edit the event-driven pointer lenses, entry reveal and compositor progress behavior in `src/main.js`.
- If the project needs live navigation later, replace the decorative control spans with application-specific links or buttons and add destinations deliberately. The distributed version has no chapter jumps, overlay, mail link or click state.

Each image has one dominant page role. Reusing an image in a second section will weaken the intended progression.
