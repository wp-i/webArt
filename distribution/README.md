# The Weight of Light

An editable single-page WebArt template built with Vite, HTML, CSS, and browser-native JavaScript. Three original image assets and four full-screen movements form a concise art-directed project website.

## Start

```bash
npm install
npm run dev
```

Open the local address printed by Vite.

## Production build

```bash
npm run build
```

The deployable output is written to `dist/`.

## Customize

- Edit visible copy and navigation labels in `index.html`.
- Adjust the core palette, type scale, and motion values in `src/styles.css`.
- Replace files under `public/assets/` while preserving their filenames, aspect ratios, and unique scene roles.
- Edit interaction behavior in `src/main.js` only after checking all scene centers and transition states.
- Replace the demonstration `Download source` destination in `index.html` with the action appropriate to your project.

Each of the three supplied images has one intentional role. Repeating an image in another scene will weaken the composition. The desktop experience uses native scroll progress to control fixed visual layers; it does not use scroll snapping. Mobile uses a natural stacked document flow.

## Requirements

- A current Node.js LTS release
- A modern browser with CSS custom properties, ES modules, and Pointer Events

The project is silent and includes reduced-motion behavior. Instrument Serif and Manrope are installed locally through Fontsource; third-party details are listed in `THIRD_PARTY_NOTICES.md`.

Use and redistribution are governed by the terms presented by WebArt when this archive is downloaded. This source archive is not a public-domain asset bundle.
