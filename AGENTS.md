# WebArt working agreement

Before changing any visual page in this repository, read:

- `docs/ART_DIRECTION.md`
- `docs/PRODUCTION_PIPELINE.md`
- `docs/DOWNLOAD_STANDARD.md`
- the page-specific brief under `docs/pages/`
- the page-specific reference map under `docs/references/`
- `docs/DECISIONS.md`

These documents are the source of truth. A task may improve implementation, but it must not silently change the accepted art direction.

Non-negotiable rules:

1. Preserve accepted hero compositions and signature interactions unless the user explicitly replaces them.
2. Never add a section merely to make a page feel longer. Every section must introduce a new visual idea, interaction, or useful content function.
3. Do not repeat an image, dominant composition, oversized-heading treatment, or section rhythm on the same page.
4. If the available assets cannot support another high-quality section, stop instead of filling space.
5. Subtasks may audit architecture, accessibility, performance, and finish. The primary art director owns visual coherence and must reject advice that conflicts with the page brief.
6. Record every accepted or rejected direction in `docs/DECISIONS.md` before a large redesign.
7. Do not begin full implementation until the reference map, asset plan, and four key visual states are approved internally.
8. A release requires a completed QA report under `docs/qa/`; anchor-only review is invalid.
9. Each template produces one editable source archive. Do not create framework or static-build variants unless the user changes the product policy.
