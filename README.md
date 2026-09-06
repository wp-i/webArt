# WebArt

WebArt produces a collection of exceptional, editable single-page website templates. Each accepted design has an independent preview and one source ZIP. Product scope and production recovery are documented in [`docs/PRODUCT.md`](docs/PRODUCT.md).

Current inventory: **two accepted templates with verified editable source archives.** Design 001 preserves its prior user acceptance. Design 002 version 0.2.0 passed the newly authorized internal review and clean package verification; this does not claim user acceptance of its new appearance. Its rejected 0.1.0 remains historical. See [`Design 002 QA`](docs/qa/002-short-studio.md). The root page remains the accepted Design 001 preview. `webart.collection.json` tracks release eligibility; `public/templates.json` provides verified collection data, not a completed marketplace UI.

| Template | Editable source |
|---|---|
| 001 — The Weight of Light | [Download ZIP](public/weight-of-light-source.zip) |
| 002 — Objects in Field | [Download ZIP](public/objects-in-field-source.zip) |

## Repository layout

- Root `index.html`, `src/`, `public/assets/`: accepted Design 001.
- `designs/002-objects-in-field/`: accepted Design 002 version 0.2.0 source.
- `docs/`: production rules, briefs, reference maps, asset provenance and review evidence.
- `scripts/`, `webart.collection.json`, `webart.package*.json`: approval, packaging and release checks.
- `distribution/`: customer documentation for Design 001.

The repository is the production workspace. Customer downloads are built from explicit allowlists and contain one editable project, without internal evidence, dependencies or rejected alternatives. Dependencies, builds, full-resolution review screenshots and quarantined ZIPs stay local. Compact review overviews and all QA/decision records are tracked; see [`evidence policy`](docs/evidence/README.md).

## Collection operations

```bash
npm run collection:status
npm run collection:check
npm run release -- --id 001
```

Releasing without `--id` handles all accepted entries. `--id` selects which source archive to release; the shared collection build revalidates and rebuilds all published previews. Accepted entries without a verified package are excluded until released. Release checks approval against the exact source, verifies the source ZIP in an isolated clean build, and verifies previews, assets and downloads through the actual local Vite preview server. Frozen templates and unexpected public ZIPs fail validation. This does not deploy to an external host.

## Accepted template 001 — The Weight of Light

The first WebArt design study, built with Vite. The piece treats light as a material: pointer movement exposes warmer layers of an imagined mineral-paper sculpture while four full-screen movements form a concise project website.

All three photographic assets were created specifically for this project with OpenAI ImageGen. The four-movement pacing is informed by the reference documented in the project art-direction record; no reference-site assets, copy, branding, audio, or source code are included.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Single-source release

```bash
npm run release
```

The release command uses `webart.collection.json` and each template's package manifest. An unchanged approved archive is preserved; a new archive is prepared and verified privately before exposure. Customer-facing README and third-party notices for template 001 live under `distribution/`; internal art-direction and reference evidence are excluded by the package allowlist.

The project uses OFL-licensed Instrument Serif and Manrope fonts distributed through Fontsource. The page contains no audio and respects reduced-motion preferences. Interaction and responsive behavior use browser-native JavaScript and CSS.

The maintained visual contract lives in [`docs/ART_DIRECTION.md`](docs/ART_DIRECTION.md). The repeatable line and quality gate are in [`docs/PRODUCTION_PIPELINE.md`](docs/PRODUCTION_PIPELINE.md), while [`docs/DOWNLOAD_STANDARD.md`](docs/DOWNLOAD_STANDARD.md) defines the single-download policy. Page-specific constraints are in [`docs/pages/001-weight-of-light.md`](docs/pages/001-weight-of-light.md), with accepted and rejected directions recorded in [`docs/DECISIONS.md`](docs/DECISIONS.md).
