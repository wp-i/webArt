# Design 001 — The Weight of Light

Status: accepted as WebArt template 001  
Internal read-only review: 96/100, later invalidated by user review  
Accepted baseline: original single-screen hero, approximately 95/100  
Rejected expansion: seven-chapter long-form version, approximately 70/100

## Identity

A severe museum study about light behaving as material. Deep mineral black, aged bone, soot grey, restrained amber. Instrument Serif carries the expressive voice; Manrope carries measurements and controls.

## Immutable baseline

- Preserve the original hero composition and its title hierarchy.
- Preserve the warm layer revealed by pointer movement over the cold base image.
- Preserve the custom `Light` cursor and background response.
- Keep the experience silent.
- The page must feel like an official project/studio page, not a gallery image alone.
- The accepted hero was made with an original ImageGen asset and original implementation. Recovered history does not show that it was copied from one recorded reference.
- Its closest benchmark is now confirmed as `The Symphony of Vines`: cinematic backlight, dark-warm grading, grain, displaced display serif, persistent corner UI, and circular interaction cues.

## Approved assets and unique roles

- `hero-mineral-membrane.png`: hero only.
- `material-detail.png`: material/detail section only.
- `coda-chamber.png`: coda only.

No asset may be repeated elsewhere on the page.

## Confirmed reference

Sole structural and pacing model: [The Symphony of Vines](https://symphonyofvines.unseen.co/).

This is a four-screen excerpt, not a reconstruction of the complete reference experience. The selected arc is: cinematic cover, chapter threshold, immersive material passage, and image-led finale. Original images, text, brand identity, and source implementation remain mandatory.

## Target structure

The page should occupy approximately four desktop viewports including the hero. Do not add secondary chapters merely because the reference site contains them.

1. Encounter — preserve the accepted immersive hero and pointer-controlled light reveal. This already performs the role of the reference cover.
2. Threshold — a dark, restrained chapter transition that keeps the same cinematic field and leads directly into the next visual event. No light editorial page, explanatory essay, or unrelated grid.
3. Material passage — a full-bleed, tactile image-led scene with sparse narrative copy and one direct pointer interaction. Avoid a conventional split-layout product console.
4. Coda — a unique warm backlit visual with a compact centered title, short body, and one useful action. The page must end inside a composed image, not empty black space or a utility footer.

The four screens form one continuous experience and follow the reference's density curve: expressive cover, quiet threshold, immersive evidence, resolved visual ending.

## Fourth reconstruction candidate

Implemented on 2026-08-28 as exactly four desktop viewports:

1. The accepted Encounter hero remains intact.
2. Threshold replaces the rejected light editorial premise with a dark chapter gate and restrained generated line field.
3. Passage replaces the split console with a full-bleed material image, pointer-positioned warm reveal, and one hold-to-expose state.
4. Coda uses the dedicated `coda-chamber.png` asset for an image-led conclusion with two compact actions inside the visual field.

Verified at 1440 × 1000, 1365 × 768, and 390 × 844. The index, hold interaction, custom pointer, responsive composition, and production build work without console errors. This is a candidate, not an accepted direction, until user review.

### Refinement constraint

User review preserves both image-led scenes but rejects the amount of supporting copy, particularly in the coda. The next revision must be shorter and more visual: the threshold may be less than a full viewport, the passage must not carry an oversized editorial heading, and the coda keeps one title and one download action only. Existing imagery and signature pointer/light behavior are immutable during this refinement.

### Fifth concise candidate

Implemented on 2026-08-28. The threshold is reduced to 74% of a desktop viewport, creating a direct visual handoff into the material image. The passage now contains only its compact chapter marker, one brief line, and the expose control. The coda is a clean full viewport with one title and one working source-download action; its explanatory paragraph, second action, and footer are removed. The scrolled header is reduced to identity, study number, and index.

Verified at 1440 × 1000 and 390 × 844. Both image compositions, the custom pointer, pointer-following light fields, hold-to-expose interaction, index, downloadable source archive, and production build remain intact. Status remains awaiting user review.

User review rejected this delivery because anchor-only QA missed a stable Passage/Coda split view at 2048 × 912. Copy reduction remains valid, but the continuous-scroll implementation is invalid. No future candidate may allow two principal image scenes and their controls to share a settled viewport.

### Sixth transition-corrected candidate

Implemented on 2026-08-28. Desktop chapters are again four complete viewports. Mandatory snap and `scroll-snap-stop` remove all stable partial-section resting positions, while wheel, trackpad, keyboard, hero-entry, identity, and index navigation resolve through a short black veil before the target chapter appears. Mobile retains its intentionally shorter threshold and native scrolling.

The exact rejected state was reproduced at 2048 × 912 (`scrollY 2077`). After correction, the same requested position settles to the complete Passage at `scrollY 1824`. All three inter-chapter moves were tested downward and upward at 2048 × 912, resolving only to 0, 912, 1824, and 2736; arbitrary midpoint requests also resolved to those anchors. Additional checks passed at 1365 × 768 and 390 × 844 with no console errors. Status remains awaiting user review.

User review rejected the mandatory-snap interaction as unpleasant and unlike the reference. This candidate is invalid despite eliminating split-screen resting states. The next implementation must use continuous user-controlled progress across a single fixed visual stage; it may not intercept wheel or keyboard input.

### Seventh continuous-stage candidate

Implemented on 2026-08-28. Desktop now has one fixed full-viewport visual stage backed by a 360vh native document scroll track. Scroll progress continuously controls the opacity and scale of the four original scene layers. Adjacent scenes fade fully through darkness, so no arbitrary position can expose two competing image compositions or control systems. There is no scroll snapping and wheel or keyboard scrolling is not intercepted. Index and chapter controls only request native smooth scrolling to a scene center.

The implementation follows the reference's interaction category without copying its implementation: direct inspection found the reference uses a one-viewport document with fixed UI and a single canvas whose internal scene state advances continuously. Our version uses original DOM, CSS, imagery, identity, and text, and maps native page progress onto fixed scene layers.

QA at 2048 × 912 inspected every scene center, all three transition midpoints, and the previously catastrophic `scrollY 2077` state. Transition midpoints resolve to composed dark frames; `scrollY 2077` contains only the incoming Coda layer, with no Passage image, title, or controls. Native scroll deltas remain exact in both directions. Index navigation reaches Coda at the end of the scroll track, the hero approach reaches Threshold, the hold-to-expose interaction still toggles and resets correctly, mobile retains its natural stacked flow at 390 × 844, the source archive returns HTTP 200 as `application/zip`, and the production build completes without console errors.

User review accepted this continuous-stage result as the first WebArt website template. It is now the production baseline for visual density, transition quality, interaction restraint, and end-to-end consistency. Future implementation work may package or maintain it but must not silently redesign it.

## Rejected second candidate

The four-movement reconstruction was rejected by the user despite an internal 96/100 review. Quality declined with every scroll movement. The Observation-to-Closing transition produced an arbitrary crop, competing coordinate systems, empty black space, and an isolated CTA. This proved the internal review gate was not strict enough.

Decision: remove Observation and the full-screen Closing entirely. Do not recreate them without a genuinely new asset and a composition that independently meets the hero quality floor.

## Rejected third candidate

The page ended inside the interactive Material section, but the user found no meaningful qualitative improvement. Shortening removed the worst tail without correcting the central problem: the hero followed a high-quality reference while the later sections were independently invented.

Decision: do not continue editing this hybrid structure. `The Symphony of Vines` is the sole structural and interaction model for the four-screen reconstruction. Replace its identity, copy, imagery, and source implementation with original material, and omit any reference chapter that does not strengthen the four-screen arc.

## Interaction contract

- Custom cursor remains active across the complete desktop page.
- A subtle fixed light field follows the pointer outside the hero.
- The hero retains its cold/warm pointer reveal.
- The material section has one purposeful interactive state change; it must not create repeated preview cards.
- Respect reduced motion and coarse pointers.

## Anti-goals

- No seven-chapter essay.
- No related-project carousel without unique project assets.
- No repeated artwork crops masquerading as new studies.
- No repeated oversized editorial quote sections.
- No long sticky sequence whose only content is three abstract words.
- No interaction removed in exchange for conventional navigation.
- No full-screen closing statement without a unique visual event.
- No synthetic chart or oversized footer used merely to extend the page.
- No reference-led hero followed by self-authored filler.
- No mixing several reference sites within one design page.
- No more than four principal screens for this case unless the user explicitly expands it.
- No split-layout console, light editorial interlude, or standalone utility footer in the replacement structure.
