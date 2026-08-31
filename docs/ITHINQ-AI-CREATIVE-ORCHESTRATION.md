# iThinq AI creative orchestration (Phase 2)

Status: on `ithinq/ai-creative-orchestration`. Not merged, not deployed, not connected to the Partner Network.

Phase 1 ([`ITHINQ-CREATIVE-RENDERER.md`](./ITHINQ-CREATIVE-RENDERER.md)) proved that one PageSpec could compose into materially different premium pages. Phase 2 adds the layer that decides *what the page should be* and generates the imagery it needs.

## Pipeline

```text
Partner plain-language request
   -> CreativeRequest        normalised creative intent
   -> CreativeStrategy       how to communicate
   -> AssetNeed[]            what imagery the page wants, and where
   -> CreativeAssetGenerator OpenAI gpt-image-1
   -> GeneratedAsset[]       stored, renderer-served media
   -> CreativePresentationPlan
   -> rendered page
```

Every stage is deterministic: the same request against the same PageSpec produces the same strategy, the same needs, the same prompts and — because assets are content-addressed — the same images.

## The truth boundary is unchanged

The PageSpec remains the only source of business truth. The orchestration layer decides **how to communicate**; it never decides what is factually true. Facts, capabilities, pricing, Partner identity, referral URLs, CTA destinations and disclosure text all still come from the contract and are rendered exactly as supplied.

`CreativeRequest` and `CreativeStrategy` hold no copy, no URLs and no claims. `AssetNeed` describes creative intent — subject, mood, composition, placement — and deliberately carries no business assertion.

### Generated creative vs fabricated evidence

Generating creative imagery is expected: conceptual visuals, vertical-specific scenes, lifestyle and editorial compositions, campaign art.

Generating *evidence* is not. Every image prompt ends with an explicit exclusion list — no text, lettering, logos, watermarks, charts, dashboards, UI screenshots, before-and-after comparisons, medical results, awards or badges. Those are precisely the things a generated picture could turn into a fabricated testimonial, a fake dashboard or an invented clinical result. The constraint is a truth control, not a style preference.

## Provider boundary

```text
CreativeAssetGenerator (interface)
   |- OpenAIImageGenerator      gpt-image-1, POST https://api.openai.com/v1/images/generations
   `- PlaceholderImageGenerator development stand-in
```

One interface, one real implementation. The renderer depends on the interface and never on a provider SDK, so composition code cannot acquire a transitive dependency on OpenAI. This is deliberately not a plugin marketplace.

The OpenAI call uses `fetch` against the REST endpoint rather than an SDK, so the repo gains no new dependency. **The key is read from the server environment only** — never bundled, never sent to browser code, never logged, and never included in an error message.

`resolveGenerator` picks OpenAI whenever a real `OPENAI_API_KEY` is present and the placeholder otherwise, so the pipeline stays reviewable without a credential instead of failing closed and leaving the architecture unexercised.

**The placeholder is not an image model.** It renders a deterministic abstract panel stamped `PLACEHOLDER · not AI generated`, reports `synthetic: true`, and every surface that shows an asset shows that flag. A placeholder must never be mistaken for generated creative.

## Asset needs and prompts

`planAssetNeeds` returns **nothing at all** for a typography-first strategy. The correct answer is often no image, and a system that always generates one is decoration rather than design.

Otherwise it plans a hero need, then supporting needs that follow the Growth Engine's own `emphasis` rather than a fixed slot count — a page with one lead section gets one supporting visual.

Prompts are context-rich by construction. Each carries the vertical scene, the campaign purpose, the art direction, the aspect ratio and — importantly — **where the image will sit**: a split hero asks for negative space on the headline side, a full-bleed hero asks for a calm low-detail centre so overlaid type stays legible, an inset asks for margin around the subject so it crops safely. An image that does not know its placement is filler.

## Navigation trust and media trust are separate

Phase 1 validated asset URLs against the *link* ceiling. That conflated two different decisions, and Phase 2 splits them.

| Ceiling | Hosts | Governs |
| --- | --- | --- |
| `POC_RENDERER_LINK_HOST_CEILING` | `ithinq.ai`, `partners.ithinq.ai` | where a CTA or referral may send a person |
| `POC_RENDERER_MEDIA_HOST_CEILING` | `ithinq.ai`, `cdn.ithinq.ai`, `media.ithinq.ai` | where an image may be loaded from |

`partners.ithinq.ai` is navigation-only; `cdn.`/`media.` are media-only. Neither trust implies the other, and a document cannot widen the media ceiling through its own `policy.allowedLinkHosts` — that field is a statement about links and has no authority over media. Tests assert both directions of the separation.

Generated imagery sidesteps the question entirely: it is served from the renderer's own origin at `/ithinq/generated/:id`, so no third-party media host has to be authorised at all.

## Asset delivery and storage

Generated bytes are content-addressed by `sha256(needId + prompt)`, so identical creative is stored once and a repeated run reuses it.

`AssetStore` is an interface with one development implementation, `FileSystemAssetStore`, writing to `.data/ithinq-generated` (gitignored). Disk rather than memory on purpose: generated media must survive a process restart to be reviewable, and an in-memory map would make the delivery route dead architecture the moment the server reloaded.

Delivery sets `Content-Type`, `Cross-Origin-Resource-Policy: same-origin` so the media embeds inside the cross-origin-isolated preview, `X-Content-Type-Options: nosniff`, a restrictive CSP, and an immutable cache policy (safe because ids are content-addressed).

**PRODUCTION SEAM:** a deployment replaces `FileSystemAssetStore` with an object store (R2, S3 or equivalent) behind the same interface. Nothing above that file knows where bytes live. Choosing that store is a deployment decision and is deliberately not made here.

## Failure handling

An optional asset that fails is recorded in `run.failures` and skipped; the page still renders, because losing a supporting image should never lose the page. A required asset that fails is recorded as required, and `hasBlockingFailure` lets the route refuse with a `502` rather than ship a page missing something the design depends on. Provider errors are classified (`missing_credential`, `network_error`, `provider_error`, `invalid_response`) and never carry the credential.

## Copy generation

This phase establishes the seam and stops there. `CreativeStrategy` already carries `copyStyle` and `narrativeAngle`, which is where generated headlines, hooks, prose and section framing would attach.

It is not implemented because generated copy asserts things, so it needs the fact-reference plumbing (`provenance.factRefs`) wired through before anything writes a sentence about the product — otherwise the renderer would be authoring claims, which is exactly what the contract forbids. Imagery was the safer first end-to-end proof: a photograph of a consultation room asserts nothing. **No PageSpec change is required for either.**

## Review surface

- `/ithinq/creative-lab` — the request, the derived strategy and its rationale, the asset needs with their full prompts, the generated images, any failures, and the composed page.
- `/ithinq/creative-preview` — the composed page alone.
- `/ithinq/generated/:id` — generated media.

Engineering and product review only. Not a Partner dashboard, and there is no Partner authentication.

## Current limitations

- **No live OpenAI verification was possible**: no credential is configured in this environment, so the demo imagery is the clearly-marked development placeholder. The OpenAI path is fully implemented and unit-tested against a mocked transport, but has not been exercised against the live API.
- Request interpretation is a deterministic keyword lexicon, not a language model. That is intentional for a first reviewable pipeline; the seam is where a model takes over.
- Copy generation is a documented seam, not an implementation.
- Production asset persistence is future work; the dev backend writes to local disk.
- Asset generation is sequential, which is fine for two or three images and would want batching at higher volume.
- No retry or backoff: a failed optional asset is simply skipped.
- The generated image is not yet fed back into direction selection — imagery follows the strategy rather than influencing which direction is chosen.

## Not in this phase

Social calendars, email sequences, ad or webinar or VSL generation, campaign workflow automation, Partner authentication or database access, attribution, production deployment, PageSpec V2, new section kinds, a second image provider, or a provider-selection UI.
