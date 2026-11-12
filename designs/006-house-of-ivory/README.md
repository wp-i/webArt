# House of Ivory

An editable HTML/CSS/JavaScript presentation site with four local photographs and local licensed fonts. One editable source edition, no backend or remote asset service.

## Run and build

Requires Node.js 20.19+ or 22.12+ with npm.

```sh
npm ci
npm run dev
npm run build
npm run preview
```

Upload the generated dist contents to your static host. For a subfolder: `npm run build -- --base /your-folder/`.

## Customize

Change the brand, short copy, study titles, descriptions and contact links in index.html. Replace every example.com email with your real address before publication. Mail actions open the visitor’s email application. They do not submit a form or send a message automatically.

Colors, typography, photo crops and responsive rules live in src/styles.css; local interaction behavior is in src/main.js. After changing a brand name or typeface, check 1440, 768, 390 and 320px widths.

Replace the four WebP photographs in public/assets, or change their paths, width/height and descriptive alt text in the HTML. Keep each photograph in one visual role. Check both wide and phone cropping; use object-position to preserve the main subject.

- hero-salon.webp: 2400 × 1600.
- project-classic.webp: 1600 × 2397.
- project-colour.webp: 1600 × 2400.
- project-shadow.webp: 1600 × 2397.

The photographs are licensed stock photography of real scenes. The brand and study names are fictional examples, not a claim that the demonstration studio designed these buildings or hosted these experiences. Use your actual work when presenting a real business. Photography sources and rights are recorded in THIRD_PARTY_NOTICES.md.

## Interaction

The salon has a small scroll and pointer crop shift. The short studio line changes colour through the transition. Project images reveal as they enter; hovering a photograph shows a bounded Explore prompt and small crop shift. Native project disclosures, anchor navigation, a phone menu, Escape and outside-tap dismissal remain available.

All main content is visible by default. Reduced-motion preferences disable crop/reveal/hover animation. Touch does not require hover. The site retains ordinary scrolling; no scroll hijacking, audio, analytics, ticket checkout or signup service.

Retain LICENSE.md, THIRD_PARTY_NOTICES.md and bundled font licenses when delivering the edited source to a client. Reference screenshots and internal review evidence are excluded.
