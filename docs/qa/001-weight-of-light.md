# QA report — Design 001 / The Weight of Light

Status: accepted production baseline

## Build identity

- Package version: 0.1.0
- Mother reference record: `docs/references/001-weight-of-light.md`
- Reviewer: primary WebArt art director and user
- Review date: 2026-08-28
- Contact sheet: `docs/evidence/001-weight-of-light/contact-sheet.html`

## Visual state matrix

| Viewport | State/progress | Evidence | Score / 100 | Defects |
|---|---|---|---:|---|
| 2048 × 912 | Encounter | `local-01-encounter.png` | 98 | None |
| 2048 × 912 | Transition 01 / 50% | `local-t1-midpoint.png` | Pass | Composed dark handoff |
| 2048 × 912 | Threshold | `local-02-threshold.png` | 95 | None |
| 2048 × 912 | Transition 02 / 50% | `local-t2-midpoint.png` | Pass | Composed dark handoff |
| 2048 × 912 | Passage | `local-03-passage.png` | 97 | None |
| 2048 × 912 | Transition 03 / 50% | `local-t3-midpoint.png` | Pass | Composed dark handoff |
| 2048 × 912 | Coda | `local-04-coda.png` | 97 | None |
| 2048 × 912 | Regression position `scrollY 2077` | Prior seventh-candidate audit | Pass | Only incoming Coda layer visible |
| 1440 × 900 | Cover / middle / ending | Browser audit | 97 | None |
| 390 × 844 | Natural stacked mobile flow | Browser audit | 96 | None |

## Release score

| Dimension | Weight | Score | Weighted result |
|---|---:|---:|---:|
| Reference fidelity | 30 | 97 | 29.10 |
| Visual authority | 25 | 97 | 24.25 |
| Whole-page consistency | 20 | 98 | 19.60 |
| Motion and interaction | 10 | 98 | 9.80 |
| Responsive and arbitrary states | 10 | 96 | 9.60 |
| Usability and package | 5 | 95 | 4.75 |

- Total: 97.10/100
- Weakest principal state: 95/100
- Hero-to-ending difference: 1 point
- Critical failures: 0

## Functional checks

- Pointer and signature interaction: custom pointer, hero light field, ambient response, and Passage exposure pass.
- Keyboard and focus behavior: index focus trap and Escape path pass; native page scrolling is not intercepted.
- Reduced motion: supported by media query and immediate exposure reset.
- Index/navigation: index reaches all scene centers; hero approach reaches Threshold; identity returns to Encounter.
- CTA destination: public source archive link responds; customer customization point remains documented.
- Console errors: none in the final desktop and mobile browser audits.
- Overflow and asset loading: no critical overflow; all local assets loaded.

## Package checks

- Build and package command: `npm run release` — passed.
- Archive filename: `weight-of-light-source.zip`.
- Archive bytes: 5,810,208.
- SHA-256: `ed7a7ffea0eea250620970e071e4ab878c2bc894b12f3966acd7f67048046ec0`.
- Allowlisted entries: 10; internal docs, evidence, scripts, review files, `dist`, and `node_modules` absent.
- Customer archive includes one editable Vite source project, customer README, and third-party notices; no alternate framework or static package exists.
- Clean extraction, `npm ci`, and `npm run build`: passed in an isolated system-temp directory.
- Public and production-build archive hashes: identical.
- HTTP check: 200 OK, `Content-Type: application/zip`.

## Decision

User accepted the seventh continuous-stage implementation as WebArt template 001. It passes the new production score at 97.10, every principal state meets the 95 floor, the ending remains within one point of the hero, and no critical defect remains. The visible page is frozen; only packaging and maintenance work are permitted without a new user direction.
