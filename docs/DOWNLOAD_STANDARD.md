# WebArt download standard

Scope: this document distinguishes accepted inventory (`public/templates.json`) from explicitly authorized presentation (`public/showcase.json`). Dated counts, display numbers and past approval states are historical snapshots; verify the current object, revision and authorization against the corresponding registry and receipts. Later authorization applies only to its stated scope and does not rewrite old qualification or evidence.

2026-10-19: A qualified registered revision can replace an explicitly authorized showcase item's presentation without overwriting its frozen comparison source. `showcase-sync.mjs` validates the complete v2 qualification and current performance gate, binds both thumbnails to the reviewed opening, and copies the identical verified archive to the item's sole public download. `production-publish.mjs` rejects fixtures, incomplete deliveries and source/archive mismatches; it synchronizes only static publication metadata, then runs gallery QA and HTTP verification. Failed verification restores the preceding catalog, images and archive. Accepted-only inventory remains separate from this user-authorized presentation.

Status: active
Product policy: one template, one editable source archive.

## Collection admission

Current quality override2026-10-12: the user calibrates001 at95 and the other five near80. Earlier006–010 internal95 approvals are superseded. Accepted-only inventory is now001;006 has been demoted totrial. Existing006–010 previews/downloads remain individually authorized comparison snapshots, bound to exact old source/ZIP receipts. This retention does not authorize new packaging or quality admission. New trials require both v2 reference/prototype gates in addition to full engineering QA; the packager checks this before writing a temporary archive. See docs/production/QUALITY_PROTOCOL.md.

`webart.collection.json` is the qualification inventory. Admission to accepted-only `public/templates.json` requires an `accepted` template with visual approval, QA and matching source fingerprint. Separately authorized presentation follows the showcase rules below and does not grant accepted status. A `draft/trial` with full engineering QA and a locked fingerprint may be packaged privately through `-Trial` and a system-temp StagePath; it cannot enter accepted-only `public/templates.json`; public presentation or download requires the separate, revision-specific showcase authorization and verification described below. The user withdrew all old second/third drafts on 2026-10-07, including Design 002 version 0.2.0. They are excluded from the active inventory, previews and downloads. Approval is recorded after visual review, never inferred from a build or an old numeric score.

The user rejected Design 004 on 2026-10-08. Its former internal approval is revoked; its source archive and built preview are withdrawn. Successful technical delivery checks do not override a failed visual review.

Design 005 received a user visual score of 85/100, below the required showcase minimum of 95. Its source, private archives and redundant records have been removed under the subsequent cleanup request; only the rejection reason remains. Visual acceptance must record visual quality and first-screen impact separately from functional delivery checks; permission to display a comparison draft does not imply that acceptance. Internal scores are not user acceptance.

Archive preparation and isolated build verification occur outside `public/` and `dist/`. A failed or interrupted attempt must not leave a temporary ZIP in a served directory. The public/build ZIP inventory must match the union of qualified accepted entries and specifically authorized showcase revisions, with each archive bound to its own verified byte count, hash and receipts; neither category grants permission to the other. Generated `public/templates.json` exposes only accepted, verified downloads; internal states and reference evidence stay internal.

`npm run release -- --id 001` processes one accepted template; `npm run release` processes all accepted entries. This supports multiple independent templates without creating framework variants. The accepted Design 001 visual files are unaffected by collection and packaging maintenance.

### Explicit collection showcase authorization — 2026-10-10

Current update2026-10-12: display numbers remain1–6 mapped to001/006/007/008/009/010. After the user's quality calibration, accepted-only admission is001.006–010 remain precisely authorized existing comparison snapshots with full QA/source fingerprints and exact ZIP receipts. Category text and trial labels stay removed; neither display authorization nor engineering QA implies visual acceptance.

Historical 2026-10-10 snapshot (the counts and display mapping in this paragraph are superseded by later records): the user explicitly requested previews and downloads of all drafts retained at that time. `webart.showcase.json` records authorization for trials 007/008 and their existing exact archive receipts; they remain draft/trial internally and do not enter accepted-only `public/templates.json`. The user subsequently requested removing trial labels from the gallery and viewer; this presentation change does not alter admission status. Gallery display numbers are continuous 1–4 and independent of original template IDs. The presentation catalog `public/showcase.json` includes the two accepted entries and these two explicitly authorized trials. `auditPublic` verifies full trial QA, original source fingerprints, the authorization record and exact ZIP receipts before permitting their archives. No future trial is admitted automatically.

The existing single private ZIPs for 007/008 were moved to public download paths without repackaging; no alternate edition was created. Their historical private-delivery QA records describe the earlier state. Root `/` now hosts the directory; the original Design001 HTML lives at `/designs/001-weight-of-light/`, and its package allowlist maps that file to the same archive `index.html`, preserving the approved source fingerprint and ZIP bytes.

## Single deliverable

Each published design exposes one download only:

`{slug}-source.zip`

The archive is a complete Vite-based HTML/CSS/JavaScript source project. WebArt does not maintain separate static-build, React, Vue, Tailwind, or framework-specific editions during the initial collection. Version metadata lives inside `package.json`; only the current approved archive is linked from the site.

## Required archive contents

Asset selection defaults to existing licensed media, not regeneration. Each third-party asset records its source page, creator, exact license and verification date, plus whether editable-template redistribution is covered. Permission for a commercial website is not automatically treated as permission for every source-archive distribution model. Use verified CC0/public-domain assets or an appropriate explicit license where terms are unclear. Record original media rights separately from WebArt code rights and fulfill asset attribution requirements. See [sourcing standard](assets/SOURCING_STANDARD.md).

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
