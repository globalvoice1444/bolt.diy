# iThinq creative renderer architecture

Status: phase 1 of creative productization, on `ithinq/creative-renderer-productization`. Not merged, not deployed, not connected to the Partner Network.

This document covers the creative presentation layer only. The transport, contract and security proof it builds on is in [`ITHINQ-PAGESPEC-RENDERER-POC.md`](./ITHINQ-PAGESPEC-RENDERER-POC.md).

## The ownership boundary

```text
PageSpec 1.0            authoritative business truth   (Growth Engine owns)
   |
   v
CreativePresentationPlan   how the page should look    (renderer owns)
   |
   v
creative primitives        HTML + CSS composition      (renderer owns)
   |
   v
rendered document          static, script-free
```

**PageSpec remains the only source of business truth.** The creative layer decides composition, never content.

## The presentation plan is presentation-only

`CreativePresentationPlan` holds section **indices** and presentation classifiers — layout, band, width, media placement, emphasis, chapter breaks. It holds no headline, body, item, question, answer, URL or disclosure text. Content is read from the PageSpec at render time, so there is exactly one source of truth and no second copy to drift.

This is enforced, not merely intended: `creative.spec.ts` serialises the plan for every direction and asserts that no authoritative string from the document appears anywhere inside it.

The plan is emitted as `/presentation.json` in the manifest so a reviewer can read exactly what the renderer decided.

## Creative directions are not templates

Four directions ship in this phase:

| Direction | Character |
| --- | --- |
| `editorial-luxe` | Serif display, warm paper, asymmetric editorial pacing, restrained CTAs |
| `conversion-modern` | Crisp surfaces, elevated cards, explicit mechanism flow, banner CTA |
| `service-bold` | Inverted high-contrast panels, heavy uppercase display, scannable rails, split CTA |
| `clinical-calm` | Soft cool surfaces, centred statement hero, rounded outlined cards, unhurried rhythm |

A direction is a **token system plus a composition policy**, not a page template. There is no `if (direction === x) renderTemplateX` anywhere in the renderer. A direction declares:

- an ordered **layout preference** per section kind,
- a **band cycle** that builds background rhythm,
- hero variant preferences, content width, card style, CTA treatment, density and motion.

The planner intersects those preferences with what each section actually contains. `isLayoutFeasible` rejects a layout that would have nothing to arrange — `cards` needs at least two items, `comparison-grid` at least four, `accordion` needs Q&A, `media-full-bleed` needs an asset. So the same direction composes differently for different documents, and the same document composes differently under different directions.

Because the base stylesheet is written entirely against CSS custom properties, a direction restyles the whole page without shipping its own copy of the layout rules. Each direction adds only a small signature block for the structures unique to it.

## Section kinds are semantic, not visual

All seven canonical kinds remain supported: `interrupt`, `scenario`, `pain`, `mechanism`, `vertical_fit`, `faq`, `risk`.

A kind expresses **why** a section exists, so one kind maps to several legitimate treatments. `pain` may render as editorial prose or as a pull quote or as cards. `mechanism` may render as a numbered flow or a split composition. `faq` may render as an accordion or a two-column grid.

Whatever layout is chosen, **every layout renders all the content the section carries**. Layouts change arrangement, never inclusion: a section never loses its items because a direction preferred a different composition. This is covered by a test that asserts every item, question, answer, heading and body appears in the output under every direction.

## Section order is preserved

The contract states that sections are rendered in array order and must never be reordered, merged or split. The renderer honours that: presentation varies the treatment of each section, never its position. Visual grouping is done with bands and chapter rules, which change the background rhythm without moving content.

Strategy-driven reordering is therefore **not** implemented in this phase. If it is ever wanted it belongs upstream in the Growth Engine, which owns the authored order, not in the renderer.

## Imagery

Imagery follows the contract's trusted asset reference. The renderer:

- renders `asset.url` and `asset.alt` exactly as supplied,
- never invents, fetches, substitutes or proxies an image,
- validates every asset host against the same renderer ceiling applied to CTAs,
- presents a section asset in the hero only when the contract marks it `role: 'hero'`, and then renders it once rather than duplicating it,
- renders a clean image-less composition when a document carries no assets — no placeholders, no empty frames, no dead figures.

The authoritative example document carries no assets, so the image-less path is the one exercised in the browser. Image-forward composition is covered by tests using contract-valid asset references rather than by inventing URLs.

A future generated or provider-supplied asset arrives through this same `Asset` reference, so nothing in the presentation architecture needs reworking to consume it.

## The creative input seam

`PlanOptions.direction` is the seam a future creative orchestrator writes to. Today it is deterministic and config-driven: an explicit request wins, then the market vertical, then authored strategy (`sophistication`, `awareness`).

The seam is deliberately closed: an unknown value is ignored and the derived direction is used instead. Untrusted input can influence how a page looks, never what it says, and never the validation or URL policy applied to it.

**No AI or model provider is involved, and none is required.** Deterministic rendering must always work without one. When a future orchestrator selects or constructs a plan, it will produce presentation choices only, and everything in this document about the truth boundary continues to apply unchanged.

## What the renderer may and may not do

It may freely control composition, layout, hierarchy, spacing, typography, colour systems, visual rhythm, section grouping, cards, backgrounds, imagery and placement, responsive behaviour, CTA and FAQ treatment, editorial devices and tasteful motion.

It may never fabricate or modify product capabilities, pricing, guarantees, testimonials, statistics, customer counts, legal or compliance claims, Partner identity, referral URLs, CTA destinations, required disclosure language, or any authoritative fact supplied by iThinq — nor manufacture scarcity, urgency or social proof.

**The guardrail is truth, not visual creativity.**

## Accessibility and responsive behaviour

Verified in-browser rather than asserted:

- one `h1` per page, no heading-level skips, `lang` set, `main`/`header`/`footer` landmarks and a skip link in every direction;
- FAQ uses native `details`/`summary`, so it is keyboard accessible without script;
- every rendered image carries the contract's alt text;
- WCAG AA contrast met by every sampled role in every direction, including on inverted and accent bands;
- zero horizontal overflow and zero clipped text from 320px to 1680px;
- CTA hit targets 52px tall, full width below 600px;
- motion is opt-in per direction and fully disabled under `prefers-reduced-motion`.

Contrast is why the palette carries three accent tokens rather than one: `--accent` for fills, `--accent-text` for text on light surfaces, and `--accent-on-dark` for text on inverted bands. A single accent cannot clear AA in all three roles.

## Security posture is unchanged

The creative layer sits entirely inside the compile step and changes none of the boundaries the POC established: exact version enforcement, JSON Schema validation, the renderer-owned link-host ceiling, HTML escaping of every value, the script-free document, the response CSP, the cross-origin header cascade and the iframe sandbox. Selecting a direction cannot weaken any of them, and there are tests asserting exactly that.

## Reviewer surfaces

- `/ithinq/pagespec` — workbench: direction switcher, rendered page, and the presentation plan it produced.
- `/ithinq/pagespec-gallery` — the same PageSpec under every direction, side by side.
- `/ithinq/pagespec-preview?direction=<id>` — one rendered document.

## Current limitations

- Four directions. They are a starting vocabulary, not the final set.
- Direction selection is deterministic config, not creative interpretation of a plain-language request.
- No strategy-driven section reordering, by contract.
- No committed visual-regression suite; browser verification is scripted but not in CI.
- Hero imagery requires the explicit `role: 'hero'` hint; there is no page-level asset in PageSpec 1.0.
- Motion is limited to CSS hover and focus transitions, because the rendered document is script-free by design.
- Long-form versus concise page treatment is expressed through density and layout, not by varying how much content is shown — the renderer never omits content.

## Not in this phase

Email, social, ad, webinar or VSL generation; campaign orchestration; a Partner-facing prompt UI; AI provider integration or model selection; Partner authentication, database access, referral creation or attribution; new PageSpec kinds; PageSpec V2; production deployment.
