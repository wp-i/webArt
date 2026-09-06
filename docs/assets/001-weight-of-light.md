# Asset manifest — Design 001 / The Weight of Light

Status: accepted

| File | Unique page role | Source/provenance | Distribution status | Reuse allowed? |
|---|---|---|---|---|
| `public/assets/hero-mineral-membrane.png` | Encounter only | Project-specific OpenAI ImageGen output | Included in source archive | No |
| `public/assets/material-detail.png` | Passage only | Project-specific OpenAI ImageGen output | Included in source archive | No |
| `public/assets/coda-chamber.png` | Coda only | Project-specific OpenAI ImageGen output | Included in source archive | No |

No reference media, logos, source code, 3D assets, or audio are present in the project.

## Font and library notices

| Dependency | Version | License | Included in notices? |
|---|---:|---|---|
| `@fontsource/instrument-serif` | 5.3.0 | OFL-1.1 | Yes |
| `@fontsource-variable/manrope` | 5.3.0 | OFL-1.1 | Yes |
| `vite` | 8.2.2 | MIT | Development dependency notice required before commercial release |

## Asset gate

- Every principal image has one unique role.
- No image is repeated in another scene or preview state.
- Reference evidence lives under internal `docs/evidence/` and is excluded from the customer archive.
- All three raster assets support the 2048 × 912 primary audit without visible texture failure.
- No rejected or unused raster asset enters the source archive.
