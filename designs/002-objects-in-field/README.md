# Objects in Field

An editable, concise homepage template for a spatial-design or creative studio. Three unique original images form an opening object stage, a process-led introduction and a blue media finale. Desktop and mobile layouts remain within 2–5 screens at the documented review sizes.

## Start

Use Node.js 22.12 or newer, then:

```bash
npm ci
npm run dev
```

Open the local address printed by Vite.

## Build and preview

```bash
npm run build
npm run preview
```

Deploy the generated `dist/` directory with any static website host. For a subdirectory deployment, pass its public path to Vite, for example `npm run build -- --base=/studio/`.

## Customize

- Change the identity, introduction, statement, captions and contact wording in `index.html`.
- Edit palette, typography, gutters and responsive rules in `src/style.css`.
- Replace `field-assembly.png`, `process-prototype.png` and `blue-motion-field.png` under `public/assets/`. Keep each image in its unique role and check its desktop and portrait crops.
- Adjust or remove the optional pointer framing in `src/main.js`. The whole page remains readable without JavaScript.
- CONTACT, MENU, OUR PRACTICE and the closing labels are deliberately decorative in this design edition. They do not open anything and are not keyboard controls. Replace the relevant spans with real links/buttons and your own destinations when adapting this template for a live business.

Scrolling is native. The template has no audio, autoplay video, 3D engine, custom cursor, scroll interception, loading screen or external asset requests. Pointer framing uses input events only and turns off on touch and when reduced motion is requested. The local Manrope font license is included in `public/assets/manrope-LICENSE.txt`.

Use is described in `LICENSE.md`; dependency attribution is in `THIRD_PARTY_NOTICES.md`.
