# QA report — Design 002 / Objects in Field

Status: rejected on 2026-08-30; implementation and packaging frozen; every numeric score and release claim is void

## Final rejection notice — 2026-08-30

The user rejected the replacement after reviewing arbitrary desktop states. The cover contains excessive placeholder typography and a wrapped identity; the Cover-to-Approach handoff mixes outgoing media, fixed controls and incoming content; the Primary state contains an unsupported circular arrow and compact `O—F` interface; and multiple intermediate frames remain less authoritative than the final scene.

The deeper failure is reference continuity. Direct reconstruction audit confirmed that Lusion's captured dark context is not adjacent to the selected media field; a substantial Featured Work sequence separates them. Every attempted Media-to-Ending transition was therefore self-authored rather than reconstructed. The 2026-08-30 verification below is retained only as failed-process evidence and does not supersede this rejection.

Release state: rejected. Do not patch, score, package or distribute this candidate. Preserve only the four original image masters while a replacement mother is selected.

## Replacement candidate verification — 2026-08-30

This section supersedes every candidate verification below it. It does not assign a quality score and does not authorize packaging; the user remains the visual acceptance gate.

### Corrected visual system

- The negative-margin Field-to-Ending overlap is gone. All four chapters are ordinary document-flow sections. At desktop sizes the Field media ends 112px before its chapter boundary, leaving one compact pale editorial rail with a `03 → 04` rule; the Ending starts normally after that rail. No two raster scenes overlap.
- The Field action is no longer held at a scroll-linked partial opacity. Once departure begins, the complete title and its small metadata finish a short timed exit on the same blue image; settled arbitrary positions contain either the intact action or no action, never translucent residue over the Ending.
- The fixed header is now a deliberate two-state system. The full two-line identity exists on pale editorial surfaces and has an invisible paper-colored moat against the blue route. Whenever any media intersects the 48–110px header zone, it contracts to a protected `O—F` mark, the chapter orbit replaces the minus sign, and the contact control contracts to a dot. The index remains an inert local surface.
- Approach content exits before it can enter the header lane: the oversized heading leaves first, the blue route leaves second, and the lower copy leaves last. This preserves the chapter's layered entry while eliminating the prior title/control collision during departure.
- A full-width frosted header veil was implemented and rejected during this pass because it flattened the upper third of the imagery. The accepted internal direction uses protected local control surfaces rather than dimming the artwork.

### Arbitrary-position and responsive evidence

- `2880 × 1282`: chapter offsets are 0, 1282, 2564 and 3846. The Field principal frame, its completed title exit, the `03 → 04` rail and the complete Ending were inspected independently. These states reproduce the viewport shape of the user's supplied screenshot.
- `1440 × 900`: chapter offsets are 0, 900, 1800 and 2700. Nine states cover all four anchors plus Approach exit, Field entry/exit, the Field-to-Ending rail and Ending entry.
- `390 × 844`: chapter offsets are 0, 844, 1664 and 2508; document height is 3352px and there is no positive horizontal overflow. Each chapter has a complete mobile composition.
- Final evidence is stored under `docs/evidence/002-objects-in-field/2026-08-30/`: nine `qa-1440-*` frames, four `qa-wide-*` frames and four `qa-mobile-*` frames.

### Interaction and functional verification

- All four media surfaces reported `data-shader-ready="true"` in a fresh browser session. In the user's reduced-motion state, autonomous drift is disabled but direct material manipulation remains active: pointer entry on the Cover set shader hover and target hover to `1`, moved the normalized texture pointer and advanced the render count.
- The custom cursor becomes `is-active is-visible` over media. Moving into the fixed header produces `is-visible is-suppressed`, resets media target hover to `0` and prevents the cursor label from colliding with the control shell.
- Runtime structure contains zero anchors and zero buttons. The header controls, Field action and Ending contact pill are inert presentation spans with no destination or state change.
- The implementation contains no wheel listener, scroll snapping, sticky chapter, scripted navigation or smooth-jump control. Browser scrolling remains native document displacement.

### Build verification

- Fresh desktop, wide and mobile traversals reported no page errors.
- `npm run build` passed on 2026-08-30 with Vite 8.2.2 and 6 transformed modules.
- Production output: 4.51kB HTML (1.51kB gzip), 14.20kB CSS (3.68kB gzip) and 13.84kB JavaScript (4.88kB gzip), excluding image payloads.
- Release state: live user-review candidate only. Numeric score and editable-source archive remain withheld until user acceptance.

## Rejection notice — 2026-08-29

The current candidate was scored approximately 70/100. The user-provided Primary-to-Ending frame exposes two competing image fields, translucent action-title residue, an unstructured overlap seam, and fixed-header collisions—especially the two-line identity. The prior transition contact sheet did contain this failure; classifying it as composed was an art-direction error, not missing evidence. The candidate must not be released or packaged.

## Rejected candidate verification — 2026-08-29 (historical)

This section describes the candidate later rejected in the notice above. It remains only as failed-process evidence and does not supersede the 2026-08-30 replacement verification.

### Visual review

- Desktop 2048 × 912: Cover, Approach, Field and Ending were inspected as four independent principal frames. The page now uses four unique assets, four distinct compositions and a compact ending with one short line of display copy.
- Desktop transition coverage: Cover → Approach, Approach → Field and Field → Ending were each inspected at 25%, 50% and 75%. The final transition is a local 180px bottom dissolve with the Ending already present underneath; it contains no whole-frame whitening, black separator, hard seam, sticky pause or snap.
- Secondary desktop 1440 × 900: offsets are 0, 900, 1800 and 2434; document width equals content width and all four principal compositions remain complete.
- Mobile 390 × 844: chapter offsets are 0, 844, 1664 and 2508; content width is 375px and scroll width is 375px. The four compositions reflow without horizontal overflow, desktop overlap or cropped Ending copy.
- Current principal evidence: `qa-20260829-cover.png`, `qa-20260829-approach.png`, `qa-20260829-field.png` and `qa-20260829-ending.png`.
- Current transition evidence: `qa-20260829-transitions.png`; its nine cells are ordered by transition and then 25%, 50%, 75% progress. The nine full-resolution source frames use the matching `qa-20260829-transition-01.png` through `-09.png` names.

All screenshot paths above are relative to `docs/evidence/002-objects-in-field/`.

### Interaction and scroll review

- Real wheel input, not scripted chapter navigation, produced exact scroll positions 520, 1040, 1560 and 2080 from the document top. Computed document scroll behavior is `auto`.
- Runtime structure contains zero links, zero buttons or button roles, zero sticky chapters and no wheel listener. Button-shaped header and Ending elements are inert presentation spans.
- Every image surface uses the GPU texture-deformation interaction. With normal motion, only surfaces intersecting the viewport render. With reduced motion, the autonomous loop stops but direct pointer input remains active.
- Reduced-motion idle counts remained `[3,2,2,2]` across a 700ms interval. Pointer entry on the Field still produced shader hover `1`, a changed normalized pointer position, the visible active custom cursor and the `DRIFT` label.
- A pixel comparison of the reduced-motion Field before and after pointer input, excluding a 120px cursor radius, found 15,143 of 68,615 sampled pixels changed by more than six RGB levels (22.07%). This confirms the media itself deforms and the result is not merely a cursor overlay.

### Performance and build review

- The corrected real-wheel trace contains 32,590 events and 224 main-renderer tasks. It has zero tasks over 16ms; the maximum task is 4.62ms. The earlier 255.68ms scroll stall was traced to deferred WebGL texture/context setup and removed by eager, low-priority asset initialization.
- Fresh 2048 × 912, 1440 × 900 and 390 × 844 sessions report no JavaScript page errors after load and traversal.
- `npm run build` passed on 2026-08-29 with Vite 8.2.2; 6 modules transformed. Output: 4.21kB HTML, 9.22kB CSS and 11.66kB JavaScript before asset payloads.
- Packaging is intentionally withheld until the user accepts this candidate. The only eventual deliverable remains one editable source archive, as required by product policy.

### Current decision

- Release state: user-review candidate only.
- Numeric score: withheld; the user is the next visual gate.
- Critical failures later found by the user: translucent Field-title residue, competing raster scenes, an unstructured overlap seam and fixed-header collisions.

## Rejection notice — 2026-08-28

The recorded 97.25/100 score below is retained only as failed-process evidence. It is not a valid product score and must not be used to release or package Design 002. Browser inspection after user review found four desktop chapters simultaneously locked with `position: sticky`, eight live links, and three live buttons. The implementation failed continuous-scroll UX and violated the product requirement that button-shaped elements be decorative only.

Required correction: restore ordinary document flow, remove all destinations/stateful controls/overlays, and re-run QA with real wheel progression plus arbitrary intermediate positions before assigning any replacement score.

## Corrected interaction verification — 2026-08-28

- Desktop 2048 × 912: four successive physical wheel inputs of 520px produced exact positions 520, 1040, 1560 and 2080. Chapter top coordinates advanced linearly; no snap, lock, easing, interception or scripted jump occurred.
- Runtime structure: all four chapters compute to `position: relative`; live link count, button count, click-role count and sticky-chapter count are all zero.
- Fixed-header contrast: identity and chapter counter now derive tone from the actual media surface beneath each element, remaining legible during arbitrary mixed-section positions.
- Mobile 390 × 844: all four chapters remain in ordinary flow at offsets 0, 844, 1704 and 2548; document width equals viewport content width and no horizontal overflow is present.
- Production build passed with no browser runtime errors. A replacement visual score is deliberately withheld until user review; the void score below remains historical evidence only.
- Corrected source archive: `objects-in-field-source.zip`, 7,024,095 bytes, 12 allowlisted entries, SHA-256 `99c0b6dfd3e924cf143c8ed55e7bc06700b3e7b599fe48bc119aec5d4624b418`; isolated install and production build passed.

## Reconstructed candidate verification — 2026-08-28

- The user rejection above supersedes the ordinary-flow correction. The reconstruction preserves the four original assets but replaces its presentation and interaction layer.
- Copy density: visible body text reduced from 392 to 203 characters; header now contains only identity and one inert index pill, while every scene carries one short phrase or label.
- Performance: the rejected build's wheel trace contained 19,703 events, one renderer task over 16ms, a 36.57ms maximum renderer task and 245 main-animation frames. The reconstructed wheel trace has no renderer task over 16ms and a 6.5ms maximum. A settled 1.4-second idle trace has zero main-animation frames and a 4.3ms maximum renderer task.
- Interaction: all four principal media surfaces expose an event-driven pointer lens/crosshair and restrained direct image displacement. The effect begins on pointer entry, updates only while the pointer moves, and resets on exit; reduced-motion and coarse-pointer environments receive complete still compositions.
- Arbitrary composition: the transition heading now begins at 27vw and below the fixed-header line; supporting copy enters at 60vh. Desktop checks at scrollY 520, 1040, 1560 and 2080 retain one dominant asset and no text collision. The 1440 × 900 Method state has measured non-overlapping heading, image and copy rectangles.
- Responsive: 390 × 844 offsets are 0, 844, 1664 and 2508 with zero horizontal overflow. The mobile Method heading was reduced to a maximum 64px so `RESPONDS.` remains complete.
- Runtime/build: zero links, buttons, click roles, sticky chapters, scripted jumps or wheel handlers; production build and clean extracted build passed.
- Reconstructed source archive: `objects-in-field-source.zip`, 7,023,605 bytes, 12 allowlisted entries, SHA-256 `96fd72d31a495b4098bb5d2659b278aa1212dda101af24ac95aaf215c227a9ed`.
- Release status: user-review candidate only. No replacement visual score is assigned before user evaluation.

## Build identity

- Commit/build identifier: local candidate `0.1.0` / Vite production build 2026-08-28.
- Package version: 0.1.0.
- Mother reference record: `docs/references/002-objects-in-field.md`.
- Reviewer: primary art director.
- Review date: 2026-08-28.
- Desktop contact sheet: `docs/evidence/002-objects-in-field/contact-sheet.png`.

## Visual state matrix

| Viewport | State/progress | Screenshot | Score / 100 | Defects |
|---|---|---|---:|---|
| 2048 × 912 | Cover | `qa-cover.png` | 98 | None blocking. |
| 2048 × 912 | Cover → Method / 25% | `qa-y0640.png` | 97 | Deliberate heading crop; dominant hero image already yielding. |
| 2048 × 912 | Cover → Method / 75% | `qa-y0820.png` | 97 | None blocking. |
| 2048 × 912 | Method entry | `qa-y1040.png` | 96 | Lowest principal state; extreme type crop is intentional and reference-led. |
| 2048 × 912 | Method → Field / arbitrary | `qa-y1420.png` | 96 | Coverage handoff leaves one brief paper band; no competing process/field images. |
| 2048 × 912 | Field entry | `qa-y1760.png` | 97 | None blocking. |
| 2048 × 912 | Field principal | `qa-field.png` | 97 | None blocking. |
| 2048 × 912 | Field interaction active | `qa-field-entered.png` | 97 | None blocking. |
| 2048 × 912 | Field → Frame / 50% | `qa-y2320.png` | 96 | Deliberate image wipe; ending copy remains hidden until fully supportable. |
| 2048 × 912 | Frame image handoff / arbitrary | `qa-y2520.png` | 97 | No cropped ending copy or blank black frame. |
| 2048 × 912 | Frame entry / 75% | `qa-y2680.png` | 96 | Ending copy begins only after it fits; split-color identity remains legible. |
| 2048 × 912 | Ending | `qa-ending.png` | 97 | None blocking. |
| 1440 × 900 | Cover | `qa-1440-cover.png` | 97 | None blocking. |
| 1440 × 900 | Method | `qa-1440-method.png` | 96 | Intentional display-type crop; no overflow. |
| 1440 × 900 | Field | `qa-1440-field.png` | 97 | None blocking. |
| 1440 × 900 | Ending | `qa-1440-ending.png` | 97 | None blocking. |
| 390 × 844 | Cover | `qa-mobile-cover.png` | 96 | Intentional portrait crop preserves central aperture and blue material. |
| 390 × 844 | Method | `qa-mobile-method.png` | 96 | Heading recomposed to retain all letters. |
| 390 × 844 | Field | `qa-mobile-field.png` | 97 | Pointer action remains usable by tap. |
| 390 × 844 | Ending | `qa-mobile-ending.png` | 97 | Complete composition and CTA visible. |

All screenshot paths above are relative to `docs/evidence/002-objects-in-field/`.

## Release score

| Dimension | Weight | Score | Weighted result |
|---|---:|---:|---:|
| Reference fidelity | 30 | 98 | 29.40 |
| Visual authority | 25 | 97 | 24.25 |
| Whole-page consistency | 20 | 97 | 19.40 |
| Motion and interaction | 10 | 96 | 9.60 |
| Responsive and arbitrary states | 10 | 97 | 9.70 |
| Usability and package | 5 | 98 | 4.90 |

- Total: 97.25 / 100 (void; rejected candidate).
- Weakest principal state: Method, 96 / 100.
- Hero-to-ending difference: 1 point.
- Critical failures discovered in user review: catastrophic coverage-stack scroll behavior and active navigation/state controls.

## Functional checks

- Pointer and signature interaction: pointer parallax, local light fields, custom cursor label, hero drift and field exposure toggle verified. Field button changes `aria-pressed` and the visible material state.
- Keyboard and focus behavior: index opens by button, closes with Escape, visible focus styles are present, skip link is included, and chapter links remain keyboard reachable.
- Reduced motion: browser emulation reports `prefers-reduced-motion: reduce`; document scroll behavior becomes `auto` and visual transforms resolve to complete static compositions.
- Index/navigation: index panel, close control, chapter navigation and direct cover/contact controls verified. Index navigation to Field resolves to `scrollY = 1824` at 2048 × 912.
- CTA destination: demonstrative `mailto:studio@example.com`, documented as a customer customization point.
- Console errors: none; only Vite development connection and hot-update debug messages observed.
- Overflow and asset loading: no horizontal overflow at 2048 × 912, 1440 × 900 or 390 × 844; all four unique PNG assets load.

## Package checks

- Build command/result: `npm run build` passed; 5 modules transformed; `dist/index.html` produced.
- Archive filename: `objects-in-field-source.zip`.
- Archive bytes: 7,025,758.
- SHA-256: `262d9a972b080f7bf1a5629b804b986bba1fac77fc61dd763fe8b44897a36a83`.
- Entry allowlist verified: 12 relative, unique entries; no docs, internal evidence, `node_modules`, `dist`, reference media or rejected assets.
- Extracted clean build verified: `npm ci --ignore-scripts --no-audit --no-fund` and `npm run build` passed from a new system-temp directory.
- HTTP status/content type: 200 / `application/zip` at `/objects-in-field-source.zip`; `Content-Length: 7025758`.

## Decision

Release only when total is at least 97, every principal state is at least 95, the ending is within two points of the hero, and critical failures equal zero.

- Accepted / rejected: rejected by the user; not a product baseline or release candidate.
- Required cuts or corrections: none before user review. If the user rejects the editorial type crop, revise only the locked Method state and do not add content.
- Art-director signature/date: primary / 2026-08-28.
