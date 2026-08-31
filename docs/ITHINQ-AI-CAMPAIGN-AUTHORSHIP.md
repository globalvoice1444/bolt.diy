# iThinq AI campaign authorship (Phase 4)

Status: merged to `main` (PR #5, merge commit `e2ae2d5`, 2026-08-31). Not deployed, not connected to the Partner Network.
Live authorship was verified on 2026-08-31 once OpenAI credits were funded; the findings are recorded below.

Phase 3 ([`ITHINQ-AI-CREATIVE-INTELLIGENCE.md`](./ITHINQ-AI-CREATIVE-INTELLIGENCE.md)) could read a plain-language brief and decide how a page should look, sound and be composed. What it could not do was write one. Its truth guard held generated copy to rephrasing sentences the PageSpec already contained, which is safe and is also a ceiling: a Partner who has not already written the page has nothing to rephrase.

Phase 4 moves the boundary from **wording** to **claims**.

## Pipeline

```text
Partner request (plain language)
  -> interpretBrief          model-read creative intent
  -> CreativeStrategy        how to communicate
  -> FactSource              the approved iThinq website, via a refreshed snapshot
  -> ApprovedFactSet         what may be asserted
  -> relevance selection     the facts this campaign needs
  -> authorCampaignCopy      original campaign copy, with per-beat fact references
  -> copy-guard              figures, money, evidence, references, house style
  -> claim audit             a second model reads the copy back against the facts
  -> AssetNeed[]             what imagery the page wants
  -> OpenAI gpt-image-1      generated imagery
  -> CreativePresentationPlan
  -> rendered campaign page
```

Three model calls per campaign, all `gpt-4o` through the Phase 3 provider seam: interpretation, authorship, audit. No new provider, no SDK, server-side only, the key never reaching browser code, a log or an error message.

## Where the facts come from

The primary source is **iThinq's own website**. A Partner should not have to hand-build a fact sheet before they can have a campaign, and the company already publishes what it does, who it is for and what it costs.

```text
approved first-party pages
  -> WebsiteFactSource      fetch, parse, extract
  -> FactSnapshot           .data/, refreshed on command
  -> ApprovedFactSet        the existing type, unchanged
  -> relevance selection    the facts this campaign needs
  -> the Phase 4 authoring pipeline, untouched
```

Nothing below this line changed to accommodate it. The website populates the same `ApprovedFactSet` the fixtures do, so `copy-guard.ts`, the claim audit, `CopyOverlay`, the presentation plan and the renderer are all exactly as they were.

**Fact trust is its own ceiling.** `validator.ts` already keeps navigation trust and media trust separate, on the reasoning that authorising somewhere to send a person and authorising somewhere to load pixels from must never imply each other. `RENDERER_FACT_HOST_CEILING` is the third and the most consequential: a page that loads a stray pixel is a privacy problem, and a page that repeats a stray sentence as product truth is a false claim made in the Partner's name. The list is closed to `ithinq.ai`, and **environment configuration cannot widen it** — the origin and the paths are overridable, the ceiling is not.

Never a search result, a competitor, a review site or a forum. Not because those are unreliable in general, but because none of them are iThinq speaking about iThinq.

### Reading a client-rendered site

ithinq.ai is a Vite/React SPA: the served HTML is a shell with one module script and no content elements, so a plain HTTP read returns a page that says nothing. Rendering is therefore how a page gets read.

The renderer lives in the **tooling layer** (`scripts/lib/rendered-fetch.mjs`), injected through the `fetchImpl` seam the library already had. The fact library keeps a plain `fetch` and stays unit-testable against HTML fixtures with no browser near it; only the refresh command ever needs a renderer, and campaign generation needs neither. Rendering never bypasses the ceiling: when a page settles on a different URL, the renderer returns a redirect rather than the content, so the library's own approval check decides whether to follow.

### Extraction is deterministic

A model reading the site and deciding what is true would put a generative step between the company and its own claims — the exact step this architecture exists to keep out. So extraction is dull and readable: headings, paragraphs, list items, published Q&A and JSON-LD `FAQPage` entries, normalised, classified by the shape of the statement, each carrying the page and the wording it came from.

Three things the first live ingestion taught, all now enforced in code:

- **Testimonials are not facts.** The run pulled two customer quotes off the site and filed them as capabilities. A customer's reported outcome becoming an approved fact is the worst thing this extractor could do: the campaign author would be licensed to claim customer results, and the evidence guard that exists to stop that would treat them as supported. Borrowed voice — first-person praise naming the product, or anything wrapped in quotation marks — is now refused.
- **Website hype must not license hype.** The corpus contained "streamline", "transform", "elevate", "revolutionize", "unlock", "cutting-edge" and "effortless". The cliché guard has always exempted terms the source itself uses, which is right for an authored document and wrong for scraped marketing copy — every one of those words would have quietly switched the guard off for itself. `SupportContext` now separates `supported` from `voice`: a website fact can support a claim, and cannot lend its register.
- **A boundary is a limit, not the word "never".** "It boosts efficiency and never misses a potential client" was classified as a limit — an absolute performance claim filed as a safeguard. The cues now match the negation of a capability rather than any negative word.

### Refreshing

`pnpm ithinq:refresh-facts` rebuilds the snapshot; `--no-render` reads raw HTML for a server-rendered origin. It is a full rebuild rather than a merge: a fact taken off the website is no longer something iThinq says, and carrying it forward because it was true last month is how a system starts making claims its own company has retired.

Facts are content-addressed, so anything still on the site keeps its identity across a refresh and anything reworded gets a new one — the change is visible instead of silent. A page that fails to load is recorded and skipped; one unreachable page narrows what may be claimed and does not stop the others being read.

### Selecting

The whole corpus in every prompt would be wasteful and misleading — a med-spa page shown every fact about every vertical invites the writer to reach for one that does not belong there. Selection is lexical, scoring fact text and derived topics against the request, with a floor per fact kind so the writer always gets a spine: what the product is, who it is for, what it does, and where its limits are. Filling those floors a round at a time rather than a kind at a time matters; filling kind by kind and truncating drops whichever kinds sort last, which is exactly the boundary facts the floor exists to guarantee.

Deliberately not a vector index. The corpus is hundreds of short statements from one company's own site, and an embedding store would be a platform built for a problem this size does not have.

## The approved fact set

The missing capability was never a model. It was a trusted list of things that are true.

```ts
interface ApprovedFact {
  ref: string;   // f_ + a full SHA-256 digest, exactly as the contract requires
  text: string;  // the approved statement, in the fact authority's own words
  kind: 'capability' | 'boundary' | 'audience' | 'product' | 'process';
}

interface ApprovedFactSet {
  id: string;
  subject: string;
  authority: 'growth-engine' | 'document-transcription' | 'reviewer-fixture';
  facts: readonly ApprovedFact[];
}
```

`kind` is not decoration. A **boundary** fact — what the product does not do, or what depends on how it is set up — is the one the writer must never contradict and should reach for when meeting an objection, and the prompt says so by name. It could not without the classifier.

`authority` is not decoration either. A reviewer looking at a generated page needs to know whether its claims trace to the Growth Engine or to a fixture written to exercise the pipeline. **Nothing in this phase claims `growth-engine`**, because the renderer has no Growth Engine connection yet, and a fact set that lied about that would undo the point of having the field.

A fact set is an artifact of the fact authority. The renderer resolves it, shows it to the writer and validates against it. It never adds to it: a renderer that could mint a fact would be the whole truth boundary undone.

### References are content-addressed where the renderer owns them

For any set the renderer authored itself, `ref` is `f_` + the SHA-256 of the fact's own text, and `refsAreDerived()` holds — a test asserts it. Change a word without recomputing the digest and the build fails rather than silently detaching a claim from the statement supporting it. A Growth Engine fact's reference is whatever the Growth Engine says it is and is never recomputed here.

## How facts reach the writer

`provenance.factRefs` was already on every section of the contract. Nothing new was needed.

- **`factsForSection()`** resolves one section's references to fact text, in the document's own order. This drives **emphasis** — the facts this particular beat rests on.
- **The full set is the boundary.** What may be asserted *anywhere* on the page. The contract is explicit that provenance says which approved statement a section rests on, "never to rewrite content", so it steers the writer rather than fencing each paragraph.
- **`factCoverage()`** reports references a set cannot resolve and asserting sections that rest on nothing. Diagnostics, deliberately not a gate: a partially covered document still produces a page, because every claim is validated against the fact set regardless of where provenance happened to point.

The document's own authored text stays legitimate support alongside the facts. The PageSpec is the Growth Engine's artifact; a page is not obliged to forget what it already says.

## The guard: support, not censorship

`copy-guard.ts` remains the single enforcement point. The rule changed:

| | Phase 3 | Phase 4 |
|---|---|---|
| The test | does this wording appear in the source? | does an approved fact support this claim? |
| Original phrasing | rejected in practice | expected |
| A figure | must appear in the source | must appear in an approved fact |
| Evidence vocabulary | rejected unless in source | rejected unless an approved fact states it |
| Fact references | n/a | must exist in the approved set |
| Length | fixed | chosen by the writer, capped per treatment |

What the guard deliberately does **not** touch: original phrasing, persuasive structure, metaphor, rhetorical questions, emotional framing, narrative flow, urgency that invents no deadline, benefit framing of supported capabilities, creative CTA language, section transitions, tone. None of that is a factual claim, so none of it is the guard's business.

The cliché lexicon stays, because it is a quality guard that a live Phase 3 run proved is needed: the model wrote "Elevate your med spa" and "effortless integration" with both words banned by name in the prompt. A model told not to use a word will still reach for it.

## The claim audit

The deterministic guard cannot catch the failure that matters most once a model is authoring rather than rephrasing: a fluent, cliché-free, number-free sentence stating a capability the product does not have. *"It books the appointment straight into your calendar"* trips no lexicon and is a lie if no approved fact says so.

So a second pass reads the authored copy back against the fact set and names the assertions nothing supports. It sees the facts and the copy and nothing else — no brief, no strategy, no persuasion to be swayed by — and it is asked to find problems rather than to approve. It is told in as many words that persuasion, metaphor, rhetorical questions, emotional framing and urgency are **not** its concern, and that a reasonable everyday inference from an approved fact is fine. An empty list is the expected answer for well-grounded copy.

A field it flags is dropped even though the guard passed it.

It is **best-effort by design**. Without a model, or if the audit call fails, the deterministic guard still stands and `audited` reports honestly that the semantic pass did not run. Killing an entire authored campaign because a second model call timed out would trade a real capability for a theoretical safety gain.

## What authored copy still cannot touch

Unchanged from Phase 3, and now load-bearing for much more:

`CopyOverlay` has no field for the disclosure, the CTAs, the referral URL, Partner identity or the policy. Those fields **do not exist on the type**, so no model output can reach them however the copy was produced. The PageSpec artifact is never modified — `/pagespec.json` still carries the contract's own bytes, and authored text is a renderer-local overlay the composer prefers when present.

Tests hand the compiler a hostile overlay carrying `disclosure`, `partner`, `ctas` and `referralUrl` keys and assert the page is unchanged.

## The renderer had to learn one thing

The writer can now author a list or a Q&A for a beat the document left as bare prose. A planner reading only the PageSpec would rule out `cards` or `accordion` for content that is about to exist, and the section would render its authored items in whatever layout happened to be the fallback.

So `effectiveSection()` merges document and overlay, and **both** `planPresentation` and `composeDocument` read that one view. It changes which composition fits the content — never what the page is allowed to say.

## Demo documents

### Fact sources

| source | authority | used for |
|---|---|---|
| `websiteFactSource()` | `first-party-website` | production; reads the snapshot, never the network |
| `staticFactSource(set)` | `reviewer-fixture` / `document-transcription` | tests, fixtures and the offline demos below |

Both satisfy the same `FactSource` interface and both produce an `ApprovedFactSet`, so choosing between them is configuration. A supplied `factSet` still wins over a `factSource`, so a fixture stays a fixture.

| id | document | fact set | what it proves |
|---|---|---|---|
| `med-spa-brief` | plain fact sheet | reviewer fixture, 13 facts | the flagship: a Partner with facts and one sentence gets a campaign |
| `med-spa` | the contract's own example | transcribed from that document, 8 facts | authorship holds up against a real document, not only a fixture |
| `hvac` | synthetic reviewer fixture | reviewer fixture, 11 facts | a second vertical produces a materially different campaign |

### PageSpec requires a document to say something

The flagship fixture started as an empty shell — structure and fact references, no prose at all. **PageSpec 1.0 rejects that**, and correctly: an `allOf` rule requires a mechanism to carry a heading and body, a `vertical_fit` to carry items, an `faq` to carry questions. A document that says nothing is not a document.

No contract change was needed or made. The fixture is the honest minimum instead: **a fact sheet**. Every asserting section states its approved facts *verbatim* and sells none of them; the two non-asserting beats carry one plain line each; every heading is a neutral structural label ("What it does", "Limits", "Questions"). A test asserts all of that, so there is no campaign copy anywhere in it to rephrase — which is what makes a campaign built from it necessarily authored.

## Reviewer surface

`/ithinq/campaign` — type a request, pick a document, watch the system write it. Shows the campaign plan the model committed to (angle, promise, framework, reader awareness, length, the objections it chose to meet), the approved facts with their authority, the document's copy beside the authored copy, every beat with the facts it rests on and the writer's own note on what the beat is doing, every guard and audit rejection with its reason, the imagery, and the composed page.

`/ithinq/campaign-preview?brief=…&spec=…` — the composed page alone.

Engineering and product review only. No Partner authentication, no production UI.

## What live authorship changed

Running the pipeline against real `gpt-4o` and `gpt-image-1` exposed four defects that no stub could have shown. All are fixed and covered by tests.

**A rejected line had nowhere to fall back to.** Dropping a rejection and keeping the document's copy was right while the document was a Growth Engine page with authoritative prose behind it. Against a fact sheet there is nothing behind it, and the first live run showed the cost: the cliché guard correctly refused five of six bodies, every one fell back to a bare fact restatement, and the page came out as campaign headings sitting on the source document's own sentences — the exact "website paragraphs rearranged" outcome this phase exists to avoid. A rejection now asks for a rewrite before it gives up, and says exactly what was wrong. Two rounds, hard-bounded, never a loop.

**The guard and the audit disagreed about what support means.** `copy-guard` counted the PageSpec's own text as supporting material and the claim audit did not, so a line resting on the document rather than on the fact set passed one layer and was killed by the other. A live med-spa run lost both its mechanism and its limits paragraph that way. The audit is now shown the document's statements too.

**Regulatory claims were freely inventable.** A live law-firm run produced "all data is encrypted during transit and at rest, compliant with GDPR and privacy laws". That particular claim turned out to be supported — iThinq publishes it on its own law-firms page — but nothing in the system required that, and the semantic audit had let the neighbouring invented CRM integration through. GDPR, HIPAA, SOC 2, PCI, encryption and compliance vocabulary now need an approved fact, exactly as awards and guarantees do.

**Two verticals collapsed onto one promise.** A med-spa campaign and a law-firm campaign both headlined "never miss a call" — the same promise with different photography. It is the source website's dominant framing and it would work for any company in any industry, which is this brief's own definition of filler. It is now in the cliché lexicon, and the repair pass writes something specific instead.

**Imagery followed the document while facts followed the request.** Once facts are selected from the website by request, a law-firm campaign built on a med-spa document was getting law-firm copy over med-spa consultation-room photography. Scene choice is presentation — a photograph asserts nothing — so it follows the campaign's market and falls back to the document's.

## Current limitations

- **The website corpus is the company's marketing prose, not a curated fact sheet.** Statements arrive as the site writes them, including its own superlatives. Extraction refuses borrowed voice and will not lend the site's register to the page, but it does not second-guess iThinq's claims about iThinq — those are the company's to make.
- **Classification is heuristic.** `process` is the fallback and catches a fair share of what are really capability statements. It affects which facts the selector guarantees a slot to, never what may be asserted.
- **Refresh needs a headless browser** while ithinq.ai is client-rendered. Campaign generation does not, and neither does any test.
- **The mechanism beat is the one that most often falls back.** It cites the most facts and invites the most ambition, and across live runs it was the beat most likely to exhaust both repair rounds and keep the document's own wording. Everything else on the page is authored.
- Title Case headings appear despite the prompt asking for sentence case. It is a style preference rather than a truth or safety rule, so it is not enforced in code.
- **The claim audit is a model, not a proof.** It is a second opinion that catches what a lexicon cannot, and it can miss. The deterministic guard is the floor, the audit is the ceiling, and neither is a guarantee.
- **Boundary facts are protected by prompt and audit, not by a deterministic rule.** "Do not contradict a stated limit" is not something a lexicon can check. The audit is told to treat contradiction of a limit as unsupported.
- **The med-spa contract fact set is a transcription, not Growth Engine data.** The texts are the contract example's own statements; binding them to that document's references is the renderer's reading of the document's ordering. Labelled `document-transcription` for exactly that reason.
- **Interpretation remains non-deterministic** (temperature 0.4), and authorship is generated at temperature 0.9. The same request can produce a different, still appropriate campaign between runs. Everything downstream of the model calls is deterministic.
- **Authored items replace the document's own items when present.** A writer that drops a boundary the document listed is caught by the audit rather than by a structural rule.
- Section count and order still come from the PageSpec, and the contract forbids reordering. The system chooses how many words each beat gets and what shape it takes, not how many beats exist.
- Three sequential model calls per campaign. No batching, retry, streaming or caching.
- The cliché list is a fixed lexicon; it will need tending as voices change.
- Production durable asset storage remains deferred; the dev `AssetStore` writes to local disk.
- One generation per request. No variant exploration, no A/B output.

## Not in this phase

Production object storage, another image or text provider, email sequences, social calendars, ads, webinars, VSLs, campaign workflow automation, Partner authentication or database access, attribution, production deployment, PageSpec V2, or new section kinds.
