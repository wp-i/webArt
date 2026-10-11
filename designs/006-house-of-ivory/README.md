# House of Ivory

An editable interior-studio website: a typographic opening, one full-width salon, a studio introduction, three project studies and a direct contact link. Built with HTML, CSS and a little JavaScript; no backend, video, 3D, or remote font service.

## Run and build

Requires Node.js 20.19+ or 22.12+ with npm.

```sh
npm ci
npm run dev
npm run build
npm run preview
```

Upload the generated `dist/` contents to your static host. For a subfolder, build with `npm run build -- --base /your-folder/`.

## Make it yours

Edit `index.html` to change the brand, descriptions, project titles, contact email and footer. Replace every `studio@example.com` with your real email. The brand heading is ordinary editable text, not a flattened logo. Long names may need a smaller `.wordmark-heavy` font size in `src/styles.css`; check desktop and phone widths after editing.

Replace the four images in `public/assets/` using the same filenames, or update their paths and descriptive alt text in the HTML. The hero is 1536×1024; the three project images are 1024×1536. The hero needs a clear central subject so phone cropping works. Each project appears once; avoid reusing the hero in the gallery or contact area.

The imagery is AI-generated concept imagery for this fictional demonstration studio. It does not document built projects, customers or an existing design practice. Replace it with your own project photography when presenting real work.

| Image | Role |
|---|---|
| `hero-salon.png` | Full-width opening; center-cropped on phones |
| `project-table.png` | Dining study |
| `project-blue.png` | Bedroom study |
| `project-stair.png` | Architectural study |

Colors, spacing and responsive rules live in `src/styles.css`. Four locally bundled Latin font files and their licenses live in `public/assets/`. The bold display font, Dela Gothic One, has broad letters; preserve the space around the italic “of”. For non-Latin content, bundle a suitably licensed font and update the font rules.

## Interaction

Navigation uses native in-page links. Each project opens additional materials and palette notes with native `<details>`; its title and image are visible by default. Multiple projects can stay open. The phone menu closes after navigation, when pressing Escape or tapping outside it. The site remains usable without JavaScript. Motion is limited to small hover/focus transitions and is disabled under reduced-motion preferences. The contact link opens the visitor’s email app; there is no hidden form service or checkout.

Only this editable source project is delivered. Internal review records and reference material are not included. See `LICENSE.md` and `THIRD_PARTY_NOTICES.md` before redistributing the project.
