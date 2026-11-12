# Pace

An editable product website with a live habit-tracker demonstration. This is a front-end template, not a shipped mobile application.

Use Node.js 22.12 or newer. Run `npm ci`, then `npm run dev`. `npm run build` creates `dist/`; `npm run preview` previews that build.

Edit text and structure in `index.html`, themes/layout in `src/style.css`, demo habits/data and interactions in `src/main.js`. All visuals are editable HTML/CSS/SVG; the two bundled fonts are locally served. Change the demo brand, labels, product calls to action and copyright before publishing.

Week/Today share the same example data. Check cells to update the weekly total; Reset restores only the example records. The three themes affect the entire website and device. The reflection form stores a short note in this browser under `pace-reflection-v1`; it never sends data to a server. If browser storage is unavailable, the form reports that state and keeps the entered text on screen. Remove that storage key to clear a saved reflection.

The page uses normal scrolling. Pointer tilt is limited to the device; reduced motion disables tilt and section movement. Keyboard and touch support every demo control. Without JavaScript, the product and reflection examples remain visible as read-only content. No external shop, analytics or account connection is included.

One source project is supplied. See LICENSE.md and THIRD_PARTY_NOTICES.md for code and font terms.
