# QA report — Design {ID} / {Title}

Status: incomplete

## Build identity

- Commit/build identifier:
- Package version:
- Mother reference record:
- Reviewer:
- Review date:
- Approved allowlisted source SHA-256:
- Primary visual reviewer / read-only defect reviewer:
- Actual browser and observed reduced-motion / pointer settings before emulation:
- Runnable four-state approval and source-frame comparisons:
- Shared webpage rubric version and source baseline evidence (do not inherit historical scores from another version):

## Visual state matrix

| Viewport | State/progress | Screenshot | Score / 100 | Defects |
|---|---|---|---:|---|
| 2048 × 912 | Cover |  |  |  |
| 2048 × 912 | Transition 01 / 25% |  |  |  |
| 2048 × 912 | Transition 01 / 50% |  |  |  |
| 2048 × 912 | Transition 01 / 75% |  |  |  |
| 2048 × 912 | Middle state |  |  |  |
| 2048 × 912 | Ending |  |  |  |
| 1440 × 900 | Cover / middle / ending |  |  |  |
| 390 × 844 | Cover / middle / ending |  |  |  |

Add rows for every remaining transition and at least four arbitrary desktop progress positions.

## Source and adapted-page scores — Webpage Quality v2

| Dimension | Weight | Source score | Adapted score | Adapted weighted result / evidence |
|---|---:|---:|---:|---|
| Composition and design language | 30 | | | |
| Visual authority | 25 | | | |
| Whole-page consistency | 20 | | | |
| Motion and interaction | 10 | | | |
| Responsive and arbitrary states | 10 | | | |
| Webpage usability | 5 | | | |

- Total:
- Weakest principal state:
- Hero-to-ending difference:
- Critical failures:

## Adaptation verification (separate from technology similarity)

| Adjustment | Source role | Final replacement | Visible/functional consequences | Adjacent transitions and mobile | Verdict / evidence |
|---|---|---|---|---|---|
| | | | | | |

Evaluate the actual result with the shared weights, including any loss of meaningful interaction. Do not award automatic points for 3D or automatically deduct points for static imagery. Source traceability, distributable materials and package validation remain separate binary gates; the mother site need not supply a downloadable ZIP.

## Functional checks

- Pointer and signature interaction:
- Keyboard and focus behavior:
- Reduced motion:
- Real wheel/trackpad traversal, reverse traversal and settled arbitrary frames:
- Pointer interaction in the user's actual reduced-motion state (do not force it off to obtain a pass):
- Index/navigation:
- CTA destination:
- Console errors:
- Overflow and asset loading:

## Package checks

- Build command/result:
- Archive filename:
- Archive bytes:
- SHA-256:
- Entry allowlist verified:
- Extracted clean build verified:
- HTTP status/content type:
- Public and production-build byte/hash equality:
- Verification scope: local or exact hosted URL (do not conflate them):
- Collection entry, preview route and single download verified:
- Public inventory excludes rejected, unverified and temporary archives:

## Decision

Release only when total is at least 97, every principal state is at least 95, the ending is within two points of the hero, and critical failures equal zero.

- Accepted / rejected:
- Required cuts or corrections:
- Art-director signature/date:

Current decision takes precedence over historical scoring. An unresolved visible defect means rejection even when screenshots exist or the arithmetic passes. Record any later rejection at the top, freeze the collection entry, and remove its download from served directories; do not retain a published candidate on the strength of an old score.
