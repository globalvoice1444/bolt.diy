# iThinq AI creative intelligence (Phase 3)

Status: on `ithinq/ai-creative-intelligence`. Not merged, not deployed, not connected to the Partner Network.

Phase 2 ([`ITHINQ-AI-CREATIVE-ORCHESTRATION.md`](./ITHINQ-AI-CREATIVE-ORCHESTRATION.md)) proved that generated imagery could travel a real pipeline. Phase 3 makes the system read a plain-language brief and do the creative work.

## Pipeline

```text
Partner brief (plain language)
  -> interpretBrief        model-read creative intent
  -> CreativeStrategy      how to communicate
  -> generateCopy          grounded presentation copy
  -> AssetNeed[]           what imagery the page wants
  -> OpenAI gpt-image-1    generated imagery
  -> CreativePresentationPlan
  -> rendered page
```

Text: `gpt-4o` via `POST /v1/chat/completions` with a strict JSON schema. Images: `gpt-image-1` via `POST /v1/images/generations`. Both server-side only, raw `fetch`, no SDK, key never reaching browser code, logs or error messages.

## What the Partner supplies, and what the system decides

The Partner supplies **one sentence**. Everything below is decided for them: tone, creative angle, creative direction, page density, CTA intensity, narrative order, copy for the headline, subheadline and every section, whether imagery is needed at all, what each image depicts, its aspect ratio, its composition, where it sits, and how the page composes at every breakpoint.

## The truth boundary, enforced rather than requested

Phase 3 lets a model write copy. That is a real widening of what the renderer may do, so it is bounded by code rather than by a polite instruction in a prompt.

**Generated copy may only rephrase what the PageSpec already says.** Every candidate string is checked against its own source material by `copy-guard.ts`, and anything that fails is discarded so the section keeps the Growth Engine's original wording. The page degrades toward truth.

Rejected automatically:

- **Novel numbers** — any figure, percentage or count not in the source.
- **Novel currency** — any amount not in the source.
- **Evidence vocabulary** — guarantees, awards, ratings, certifications, testimonials, proof claims, borrowed social proof.
- **Marketing clichés** — a quality guard in the same place, for the same reason (see below).

Structurally out of reach: `CopyOverlay` has no field for the disclosure, the CTAs or Partner identity, so no model output can address them. The PageSpec artifact is never modified — `/pagespec.json` still carries the contract's own copy, and generated text is a renderer-local overlay the composer prefers when present.

### Why the guard exists in code

Two live runs settled this. The image model produced wall signage reading "MEDICAL AESTHETICS" despite an explicit "no lettering" exclusion, and the text model wrote "Elevate your med spa" and "effortless integration" despite the prompt banning both words by name. A model told not to do something will still occasionally do it. Anything that matters has to be checked, not requested.

A banned term is still allowed when the contract itself uses it: the source's own voice is never overridden by the guard.

## Creative interpretation

`interpretBrief` reads the brief with a model and returns presentation intent only — it is shown the Partner's words and nothing from the PageSpec, so it has no facts available to invent with. Its output is run back through the deterministic normaliser, so an unexpected enum or a stray direction name falls back to a known-good value rather than reaching the renderer.

Without a model, the Phase 2 keyword reader still runs. A model outage degrades the page; it never fails it.

**Imagery is the default.** An early live run read "punchy, blue-collar, scannable" as a request for a typographic page and stripped the photography out. Words describing layout and voice are not a request to remove images, and the interpreter now says so explicitly: `typographic` requires an explicit rejection of imagery such as "no images" or "mostly type".

## Copy quality

The first live copy run made the page *worse*: "Transform Spa Efficiency with iThinq AI Voice Assistant" and "Seamlessly Enhance Client Experiences" replaced the contract's far more specific "In a treatment room while the front desk is checking someone out". The model regressed to generic marketing register.

The copy prompt now states that **the source is the quality bar** — it is deliberately specific and situational, and a rewrite that would work for any company in any industry is wrong. Concrete moments over abstract benefits, sentence case, plain nouns and verbs. With the cliché guard enforcing the ban, the same brief now produces "in the moment you can't take the call".

## A market belongs to the document, not the brief

A brief asking for a law-firm page against a med-spa document correctly still produces med-spa facts: the PageSpec is the truth and a brief cannot change what business the page is about. Only the presentation changes.

To show a genuine vertical contrast, `demo-specs.ts` carries a second document — a **synthetic reviewer fixture** for HVAC, hand-written, schema-valid, and clearly labelled. It is not Growth Engine output and no page built from it should be treated as real. A test asserts both demo documents validate against PageSpec 1.0.

## Reviewer surface

- `/ithinq/campaign` — type a brief, watch the system build the page. Shows the creative angle, the derived strategy, contract copy beside generated copy, every truth-guard rejection with its reason, the asset needs, the generated imagery, and the composed page.
- `/ithinq/campaign-preview?brief=…&spec=…` — the composed page alone.

Engineering and product review only. No Partner authentication, no production UI.

## Current limitations

- Copy is rephrasing, not authoring. The system cannot say anything the PageSpec does not already say, by design. Genuinely new claims need fact-reference plumbing and Growth Engine authorship.
- Two model calls per campaign (interpretation, copy), sequential with image generation. No batching, retry or streaming.
- The cliché list is a fixed lexicon; it will need tending as voices change.
- Section count and order still come from the PageSpec. The system chooses how sections are expressed, not how many exist — that is authored strategy and the contract forbids reordering.
- Production durable asset storage remains deferred; the dev `AssetStore` writes to local disk.
- Only two demo documents, one of them synthetic.
- Copy is generated once per request with no variant exploration or A/B output.

## Not in this phase

Social calendars, email sequences, ad/webinar/VSL generation, campaign workflow automation, Partner authentication or database access, attribution, production deployment, PageSpec V2, new section kinds, a second provider, or a provider-selection UI.
