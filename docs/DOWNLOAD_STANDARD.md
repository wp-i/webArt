# WebArt download standard

Status: active  
Product policy: one template, one editable source archive.

## Collection admission

`webart.collection.json` is the release inventory. Only an `accepted` template with an approval record, QA record and matching approved source fingerprint may be packaged. The current rejected Design 002 is explicitly frozen. Approval is recorded after visual review, never inferred from a build or an old numeric score.

Archive preparation and isolated build verification occur outside `public/` and `dist/`. A failed or interrupted attempt must not leave a temporary ZIP in a served directory. The public/build ZIP inventory must match accepted registry entries and their verified byte counts and hashes. Generated `public/templates.json` exposes only accepted, verified downloads; internal states and reference evidence stay internal.

`npm run release -- --id 001` processes one accepted template; `npm run release` processes all accepted entries. This supports multiple independent templates without creating framework variants. The accepted Design 001 visual files are unaffected by collection and packaging maintenance.

## Single deliverable

Each published design exposes one download only:

`{slug}-source.zip`

The archive is a complete Vite-based HTML/CSS/JavaScript source project. WebArt does not maintain separate static-build, React, Vue, Tailwind, or framework-specific editions during the initial collection. Version metadata lives inside `package.json`; only the current approved archive is linked from the site.

## Required archive contents

- `index.html`
- `package.json` and lockfile
- editable files under `src/`
- original distributable assets under `public/assets/`
- customer-facing `README.md` with install, run, build, customization, and interaction notes
- `THIRD_PARTY_NOTICES.md`
- the approved template license or a reference to the governing download terms before commercial release

## Forbidden archive contents

- `node_modules/`, `dist/`, caches, logs, or previous archives
- internal `docs/`, QA screenshots, contact sheets, task history, or model prompts
- mother-reference screenshots, downloaded reference assets, or copied source
- unused original assets or alternate rejected compositions
- secrets, local absolute paths, development hostnames, or user-specific data

## Release validation

The packager must use an explicit allowlist, never zip the repository wholesale. Before publishing it must verify:

1. every allowlisted source exists;
2. archive paths are relative and unique;
3. forbidden paths are absent;
4. the archive can be opened and contains the expected entry count;
5. `npm ci` and `npm run build` succeed from the extracted project;
6. the public link returns HTTP 200 and `application/zip`;
7. the archive hash and byte size are recorded in the QA report.

The download control belongs to the marketplace presentation layer. If a template scene contains a demonstrative CTA, its destination must be documented as a customer customization point and must not create a recursive self-archive.
