# WebArt production pipeline

Status: active  
Purpose: produce a small collection of reference-led single-page templates with repeatable efficiency and no decline from hero to ending.

Product scope and current inventory: `docs/PRODUCT.md`. The execution registry is `webart.collection.json`; Design 001 is accepted and Design 002 is frozen. Historical candidate scores never override current rejection. A screenshot collection, successful build or generated archive does not create a released template.

## Execution discipline — 2026-09-05 recovery

- Work in bounded batches: at most six quick candidates and three detailed inspections. Finish a row for every inspected candidate before opening another batch. Reuse existing evidence first; do not repeatedly inspect a rejected candidate without new evidence.
- Each candidate row records URL (or explicitly unverified), intended template use, evidence paths, continuous source route, technical/asset feasibility, verdict and one reason. Outcomes are `admitted`, `rejected`, or `evidence-needed`; the last outcome does not authorize implementation.
- A candidate's high visual score is only one admission condition. Continuity and a feasible reproduction or adaptation plan are required. A technically expensive behavior may enter a bounded substitution prototype; lack of identical technology is not an automatic failure.
- The four key review states are cover, middle, transition and ending. They are not a mandate to stretch every excerpt into four chapters. Three or four coherent principal moments remain the limit; inspect every actual transition.
- A key-state approval requires a runnable local composition and matching source evidence at the same viewport, with typography, fixed interface and the intended final retained/replacement behavior present. Four beautiful image files alone cannot pass this gate.
- After a valid key-state gate, implement one defined adapted reconstruction scope. Every deviation must be traceable to a source role and an internally approved adaptation. Missing scope or failed substitutions return to the relevant gate; do not enter an unbounded redesign loop.
- Keep the primary art director responsible for visual acceptance and obtain a read-only independent defect review. Scores describe judgment and are never a substitute for testing the user's actual environment, input and reduced-motion preference.
- Approval binds to the exact allowlisted source fingerprint. Any later source change requires review appropriate to the change before the fingerprint is updated. Packaging scripts cannot grant visual approval.
- Measure accepted templates, time spent per stage, rejection reasons and rework rounds. Do not report screenshots captured or self-assigned scores as production output.

For the current Design 002 recovery, use `docs/production/DESIGN2_RESET.md`; the rejected Lusion layout is historical, not a template for the next admission.

## Production thesis

2026-09-06 scope update: every output is a concise 2–5-screen webpage. All content, structures and interactions may be cut or locally adapted to fit this format. The earlier contiguous-excerpt-only/three-or-four-moment restrictions below are superseded where they conflict. Inspect the original route, log whole-section cuts and local reconnections, then evaluate the actual shortened result. These cuts are deliberate adaptations, not missing evidence or permission for filler. Four key review states remain mandatory, even in a two- or three-section page.

WebArt industrializes selecting exceptional sites, decomposing their design, planning limited adaptations, reconstructing the intended final version, evaluating it under the source's same quality criteria, and packaging it. Each template uses one verified 98+ mother as its visual baseline. Preserve composition, proportions, density and coherent sequence; permit documented content and technical adjustments, including 3D-to-static imagery, when the adjusted result meets the quality floor. Do not build expensive technology merely to remove it later, or add unrelated visible design to fill a source gap.

Original imagery, text, identity, code, and distributable assets remain mandatory. Reference screenshots are internal evidence only and never enter the customer archive.

## Required artifacts

Every design has four maintained records before release:

1. `docs/pages/{id}-{slug}.md` — immutable page brief.
2. `docs/references/{id}-{slug}.md` — direct reference inspection and selected moments.
3. `docs/assets/{id}-{slug}.md` — asset provenance and unique role map.
4. `docs/qa/{id}-{slug}.md` — visual, interaction, responsive, build, and package evidence.

Create them from the templates in `docs/templates/`. The documents replace long conversational context and are the visual handoff surface for implementation subtasks. The collection registry and short candidate records track execution status; they cannot override the page's accepted visual contract.

## Seven-stage line

### 1. Reference admission

- Inspect the live reference directly at the target desktop viewport.
- Score the source using Webpage Quality v2 below; only a 98+ reference may become a mother. Record external award scores separately and never equate them with an internal score.
- Use one mother reference per template. Secondary references may clarify a technical detail but may not contribute visible composition.
- Record the exact URL, inspection date, viewport, page states, and why the site qualifies.
- Confirm that all selected states are adjacent or connected by directly observed source transitions.
- Identify the reference's principal source of visual authority, the retained elements and any content/technical substitutions to test. Record the expected quality risk and expected implementation savings.

Reject an excerpt without a coherent observed beginning, middle and ending. A technically complex source may proceed to the bounded adaptation prototype; reject it if neither direct reconstruction nor a feasible simplified result can meet the floor. The next gate uses the intended final technique, not the unreproduced original effect as a promise.

### 2. Reference map

Extract one contiguous sequence of three or four moments. For each moment, record:

- dominant composition and negative-space geometry;
- image-to-text ratio and information density;
- type scale, alignment, and fixed interface behavior;
- transition into and out of the moment;
- pointer, scroll, hold, drag, or ambient interaction category;
- elements intentionally omitted from the excerpt.
- a counterpart ledger for every visible element planned in the reconstruction.

For each handoff, capture or record the source at 25%, 50% and 75%. A verbal guess about how two attractive screenshots might connect is not transition evidence.

Complete the source map and proposed adaptation ledger before production assets or page implementation. A bounded substitution prototype may then resolve its documented risks. Every visible element and transition must have a source counterpart or an approved local adaptation tied to one. Unrecorded scope changes fail the gate.

### 3. Original substitution plan

Define substitutions for distribution, efficiency and template usability: identity, concise copy, original/licensed assets and selected technical simplifications. For every adjustment record the source role, intended replacement, saved implementation work, visual/functional loss risk, affected neighboring states and pass criteria. Examples include realtime 3D to an original static rendering, or an expensive material animation to a tested lightweight response. Preserve the source's visible hierarchy and coherent route. Each asset receives one dominant role; do not force old assets into unsuitable roles.

Prototype the highest-risk adjustment first in its intended layout with incoming/outgoing transitions. Judge the actual replacement, including responsive crop and any lost interaction. Allow one bounded alternative if the first substitution fails, then reject or re-scope the candidate rather than repeatedly rescuing it. No complete 3D implementation is required when the approved deliverable uses a static image.

Do not copy logos, text, source code, proprietary media, identifiable illustrations, 3D models, or a reference's exact branded interface. Record all third-party fonts and libraries for distribution notices.

### 4. Key-state gate

Reconstruct the complete intended final states before building the full experience: cover, one middle material state, one transition state, and ending. Include the actual approved content/technical substitutions. Review them beside the corresponding reference frames at the same viewport using the shared quality criteria. These may be isolated HTML/CSS states; they do not need full navigation yet.

All four states must independently meet the accepted hero floor. If the ending is weaker, stop here. Do not spend implementation tokens attempting to rescue an unqualified visual plan.

### 5. Focused implementation

- Reuse invisible infrastructure: project shell, local fonts, accessibility primitives, pointer plumbing, progress utilities, build scripts, and packaging checks.
- Do not reuse visible composition, dominant typography, signature motion, or section rhythm across templates.
- The primary art director enforces the reference map and approved adaptations for all visible CSS and scene timing. Build the intended adapted result directly; there is no requirement to first build an expensive exact technical clone.
- Bounded implementation agents may handle responsive mechanics, accessibility, performance, and deterministic engineering only after the key states are locked.
- Work in patches against the brief; do not rewrite an accepted scene to simplify implementation.
- When implementation exposes an unplanned change, return to the relevant map/adaptation gate and test that bounded change before continuing. A missing coherent source route returns to admission.

### 6. Full-state audit

Anchor screenshots alone are invalid. The primary audit viewport is 2048 × 912, supplemented by 1440 × 900 and 390 × 844. Inspect:

- every principal state;
- every transition at 25%, 50%, and 75%;
- at least four arbitrary desktop progress positions;
- the first and final mobile screens plus one mid-page state;
- pointer, keyboard, reduced-motion, navigation, CTA, and signature interaction behavior;
- console errors, build result, asset loading, and layout overflow.

Create a contact sheet for one-glance comparison. The final scene may not score more than two points below the hero. Any mixed principal scenes, accidental crop, blank filler, broken control, repeated dominant layout, or unsupported mobile composition is a critical failure.

The audit also checks source counterparts and approved adaptations, including the actual losses caused by each substitution and both adjacent transitions. An uncited element or unapproved transition is a critical failure. A documented technical difference alone is not a defect; its actual visual, interaction and usability consequences determine its quality score.

### 7. Release and packaging

Complete the visual QA report and record acceptance of the current source in the collection registry. Prepare the single editable source archive defined in `docs/DOWNLOAD_STANDARD.md` outside publicly served directories. Inspect its entries and verify isolated extraction, installation and build before exposing a new ZIP. Rebuild the selected template, verify the produced ZIP through local HTTP (200, ZIP content type and matching bytes/hash), and generate the collection data from accepted verified artifacts only. Local verification is not evidence of a remote deployment; any actual hosted release also needs a check at its hosted URL.

## Shared webpage score — Webpage Quality v2 (2026-09-06)

Evaluate the source and adapted webpage independently using this same table, weights and scoring scale, at matching viewports and comparable input states. Record source/result scores and evidence side by side, plus the effect of each adaptation. Reviewers score the observable result: the presence of 3D/WebGL earns no automatic points, and its absence carries no automatic penalty. Lost spatial hierarchy or meaningful interaction lowers the relevant dimension; a still rendering that preserves the intended result may qualify.

Historical scores from a different rubric remain historical and cannot establish a same-standard score difference. Source-counterpart fidelity and package completeness are separate pass/fail gates below, because neither can be scored symmetrically on a mother site and a downloadable template.

| Dimension | Weight | Minimum expectation |
|---|---:|---|
| Composition and design language | 30 | Proportion, hierarchy, typography, negative space and composition work together with clear visual intent. |
| Visual authority | 25 | Imagery, typography, color, material, and detail feel authored and premium in every principal state. |
| Whole-page consistency | 20 | No hero-to-tail decline, filler, repetition, or improvised ending. |
| Motion and interaction | 10 | Motion belongs to the design and remains pleasant under real input. |
| Responsive and arbitrary states | 10 | Desktop, mobile, and intermediate positions remain composed. |
| Webpage usability | 5 | Information is legible and useful, navigation and intended actions are clear, keyboard/accessibility behavior is appropriate. No source-archive requirement applies to the mother. |

Release requires all of the following:

- weighted total of at least 97/100;
- every principal state at least 95/100;
- ending no more than two points below the hero;
- zero critical failures;
- every required evidence row completed;
- primary art-director approval before user delivery.

Separate binary gates: all retained elements and adaptations trace to the map; original/licensed distributable materials; required functionality and accessibility; isolated source install/build; one archive with verified entries, bytes/hash and HTTP delivery. The existing registry/packager enforces recorded approval and artifact integrity, not visual scoring. This rubric change alone approves no new page or revised source fingerprint.

Scores document judgment; they never overrule a visible defect. When a frame looks wrong, it fails regardless of arithmetic.

## Efficiency and model allocation

Use the strongest visual model for mother-reference selection, decomposition, key-state composition, visible implementation, and final review. Faster models may perform build checks, archive inspection, responsive diagnostics, accessibility checks, and screenshot collection. They may not add or redesign visible sections.

Keep each template in a fresh task with only its brief, reference map, asset record, QA template, and relevant source files. Do not replay the full collection history. Automate deterministic checks and spend high-capability tokens only at the three visual gates: reference admission, key states, and final contact-sheet review.

Expected production behavior is selective, not exhaustive. Start more reference candidates than the collection needs and reject weak candidates early. A rejected brief is inexpensive; a polished low-quality page is not.

The efficient path is one evidence-backed reconstruction pass, not iterative art direction. Most candidates should be rejected during reference admission; implementation begins only when no visible decision remains for the implementation stage to invent.
