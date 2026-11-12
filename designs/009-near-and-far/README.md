# Near & Far

A short, editable photography portfolio. Vite, HTML, CSS and JavaScript; no account, backend or remote media required. All photographs and fonts are local.

## Run

Use Node.js 22.12+ or 24+. Run `npm ci`, then `npm run dev`. The terminal prints the local address. Keep it running while previewing. `npm run build` creates `dist/`; `npm run preview` serves that build. Publishing requires uploading the built directory to your hosting provider.

## Customize

- Edit the brand, short sentence, project titles, labels and contact in `index.html`. Replace the demonstration `hello@nearandfar.example` address before use.
- Replace the three photographs under `public/assets/`; preserve names or update their HTML paths and dimensions. Keep the sea/shore relationship in the opening, the vertical street crop and the horizontal landscape crop distinct.
- Edit colors, proportions and responsive styles in `src/styles.css`. Local Barlow Condensed and Manrope fonts carry OFL license notices.
- Photo titles in the full viewer are defined by `titles` in `src/main.js`; update them with the visible project titles.

## Interaction

Native page scrolling controls a small opening photo movement and the gradual side color field. A mouse shifts image framing gently and reveals the viewing hint. Touch uses visible viewing buttons. Full photographs open in a native modal dialog, with previous/next, arrow keys, Close, Escape and outside-click dismissal. Focus returns to the original photograph. Studio notes use native `details`.

Reduced motion removes the photo movement and changing color field. Without JavaScript, all three photographs, short descriptions, native studio notes and contact remain visible; full-photo controls are added only when supported JavaScript runs. The site remains readable with no hidden reveal content.

## Media and rights

The brand and series titles are fictional demonstration content. The supplied photographs are credited to their actual photographers in `THIRD_PARTY_NOTICES.md`; they are not works commissioned by this fictional studio. Use is governed separately by the media licenses. Do not redistribute the photos as a standalone stock library or image product.

This archive is the one editable source edition. It contains no internal reference screenshots, prompts, review evidence, build outputs or dependencies.
