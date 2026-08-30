# PageSpec V1 — consumer handoff

The authoritative contract the iThinq **Growth Engine** emits for an external renderer.

| File | What it is |
| --- | --- |
| `page-spec.schema.json` | **The contract.** JSON Schema, draft 2020-12. Authoritative. |
| `page-spec.example.json` | One complete premium Partner landing page, using current approved AI Voice Assistant content. |
| `page-spec.ts` | TypeScript view of the schema, plus the validation result types. |
| `README.md` | This file. |

Bolt is the first renderer. It is not the only one, and nothing in this contract is designed around it.

## Where a document comes from

The contract is **derived from the producer**, not from the legacy page schema:

```
CreativeBrief → PageSpecComposer → PageSpec
                                     ├→ PageSpecProjector → current internal renderer
                                     └→ PageSpecV1Exporter → this contract
```

`page.origin` tells a consumer which produced the document it is holding:

| `origin` | Meaning |
| --- | --- |
| `generated` | `purpose`, `emphasis`, `situation`, `awareness`, `sophistication` and `provenance` are **authored strategy** from a CreativeBrief. |
| `legacy` | The page was hand-authored before that pipeline existed. `purpose` is a **documented inference** from block type, and the strategy fields are `null` because nothing recorded them. |

**Never treat a legacy inference as authored strategy.** The legacy adapter exists so hand-authored pages remain exportable; it does not define the vocabulary.

---

## The ownership boundary

This is the part to read twice. Everything else follows from it.

**The Growth Engine owns business truth.**

Facts · factual grounding · copy strategy · CreativeBrief · approved capabilities · prohibited claims · campaign state · Partner identity · referral URLs · required disclosures · CTA destinations · market and vertical strategy.

**The renderer owns presentation.**

CSS · breakpoints · pixels · components · typography mechanics · animation · shadows · layout engine.

A renderer never writes, rewrites, summarises, translates, shortens, reorders, infers or omits anything in the first list. If rendering a page appears to require Partner Network business logic, that is a defect in this contract — raise it rather than working around it.

### What the renderer MUST NOT do

- Look up a Partner, derive a Partner ID, or query the Partner Network
- Construct, append to, rewrite, shorten, proxy or re-sign a referral URL
- Infer a slug or build any link from parts
- Generate, replace, summarise, translate or hide a compensation disclosure
- Decide whether a disclosure is necessary
- Invent a CTA destination
- Write, extend or reword a factual claim, capability, metric, testimonial or guarantee
- Reorder, merge or split sections

---

## Consumer flow

1. Receive the PageSpec document.
2. **Validate `specVersion`.** Accept exactly `1.0`; refuse everything else, including `1.1`.
3. **Validate structurally** against `page-spec.schema.json`.
4. **Run the runtime rules** below (URLs, disclosure, unknown kinds). They are not expressible in JSON Schema.
5. Select local presentation components by section `kind`, informed by `purpose` and `emphasis`.
6. Render the supplied content, in the supplied order.
7. Render Partner attribution, referral URLs and the disclosure **exactly as supplied**.

Never render a partially valid page. If validation returns `renderable: false`, render nothing and surface the failure.

---

## Versioning — exact, and fail closed

`specVersion` is `MAJOR.MINOR`. **A consumer supports exactly the version it implements. V1 consumers accept `1.0` and refuse everything else** — `1.1`, `2.0`, malformed strings, anything.

This is deliberate, and it is a correction of an earlier draft that promised forward compatibility this schema does not have:

- `additionalProperties: false` applies throughout, so a field added in `1.1` **fails validation**.
- `sectionPurpose` is a closed enum, so a purpose added in `1.1` fails **before** unknown-kind degradation ever runs.
- The TypeScript knows only today's values.

Accepting an unseen minor against a strict schema is optimism, not compatibility. A `1.1` remains a real minor release — but a renderer adopts it by **updating its copied schema and types**, then changing `SUPPORTED_VERSION`. Deterministic refusal beats hopeful acceptance.

| Change | Version impact |
| --- | --- |
| Documentation, examples, clarifying a description | **None** |
| Adding an optional field | **Minor** — consumers must update to accept it |
| Adding a section kind or a purpose | **Minor** — consumers must update to accept it |
| Removing or renaming any field | **Major** |
| Making an optional field required | **Major** |
| Changing a field's type or the meaning of a value | **Major** |
| Removing a section kind or a purpose | **Major** |
| Changing any FATAL/DEGRADABLE rule | **Major** |

An unsupported version returns **exactly one** finding — `unsupported_spec_version`, fatal — and nothing else is checked: the fields may not mean what this consumer thinks they mean, so further findings would be noise from a document it cannot read.

**The unknown-kind rule still applies within a supported version.** A section whose `kind` this consumer does not recognise is skipped unless it is marked `"required": true`. That is a safety net for a document that validates, not a forward-compatibility promise.

## Sections

`kind` is what a renderer draws. `purpose` is why the section is on the page. **They are separate fields and neither may be inferred from the other** — two sections can share a kind and do entirely different work, which is exactly why the old fixed-template system produced pages that all read the same.

### V1 kinds

The canonical vocabulary is **exactly what `PageSpecComposer` emits** — one kind per strategic purpose it produces a section for. Every kind is exercised against a real producer by a test.

| kind | Required fields | Optional | Emitted by |
| --- | --- | --- | --- |
| `interrupt` | `heading`, `body` | `eyebrow`, `asset` | generated |
| `scenario` | `heading`, `body` | `eyebrow`, `asset` | generated |
| `pain` | `heading`, `body` | `eyebrow`, `asset` | generated, legacy |
| `mechanism` | `heading`, `body` | `eyebrow`, `asset` | generated, legacy |
| `vertical_fit` | `heading`, `items[]` | `eyebrow` | generated, legacy |
| `faq` | `heading`, `qa[]` | `eyebrow` | generated, legacy |
| `risk` | `heading`, `body` | `eyebrow`, `asset` | generated |

Every section additionally requires `kind`, `purpose` and `provenance`.

`emphasis` is **required on a generated document** — the composer computes it — and optional on a legacy one, whose hand-authored source has no equivalent.

`risk` and an objection sheet are close in meaning and different in shape: `risk` is the composer's prose about what the product will **not** do. It maps 1:1 from the `reduce_risk` purpose.

### There is no `hero` and no `cta` section

The composer emits no section for either, so neither is a kind. Synthesising them made the exporter an author of page structure rather than a translator of it.

- The hook is **`page.headline`** and **`page.subheadline`**.
- The ask is **`ctas.primary`** (and optionally `ctas.secondary`).

Both are required at the top level of every document. **Where** you draw them — a hero band, a sticky bar, a closing panel, all three — is presentation, and therefore yours.

### Producer gaps

`benefits` and `proof` are **not** V1 kinds. Benefit cards and approved proof exist as blocks on hand-authored templates, but the composer emits neither, and "legacy-only" is not a licence to sit in a vocabulary derived from the composer. The legacy adapter **drops** those blocks rather than bending them into a kind that means something else; `LegacyPromoPageAdapter::UNREPRESENTABLE` names every dropped type. **The legacy adapter is therefore lossy, by design.** When the composer learns to emit them they arrive as a minor version, with a producer behind them.

### Required, optional and nullable, by origin

Every key below is **structurally present in both origins**. A legacy document says `null`; it never omits, and it may not invent.

**Legacy nulls are enforced, not merely permitted.** A legacy document carrying a campaign, situation, awareness or sophistication value fails validation. A plausible value in one of those fields would be indistinguishable from authored strategy, which is exactly what `origin` exists to let a consumer tell apart. `vertical` is the one exception: it may be a string in either origin, because it is recorded on the template row itself rather than derived from a brief.

| Field | `generated` | `legacy` |
| --- | --- | --- |
| `page.reference`, `name`, `audience`, `headline`, `subheadline` | required, non-empty | required, non-empty |
| `page.origin` | `"generated"` | `"legacy"` |
| `page.campaign` | **required, non-null** (campaign code) | **must be `null`** |
| `page.situation` | **required, non-null** | **must be `null`** |
| `page.awareness` | **required, non-null** | **must be `null`** |
| `page.sophistication` | **required, non-null**, 1–5 | **must be `null`** |
| `page.vertical` | present, **may be null** — the flagship brief is not market-scoped | present, may be null |
| `page.templateKey` | optional, diagnostic only | optional, diagnostic only |
| `section.kind`, `purpose`, `provenance` | required | required |
| `section.emphasis` | **required** — the composer computes it | optional; the historic source has none |
| `section.heading`, `body`, `items`, `qa` | per kind, see the table above | per kind |
| `partner.displayName` | required, **may be null** | required, may be null |
| `ctas.primary` | required | required |
| `ctas.secondary` | may be `null` | may be `null` |
| `disclosure.text` | required, non-empty | required, non-empty |
| `policy.allowedLinkHosts` | required, non-empty | required, non-empty |

### V1 purposes

`interrupt_pattern` · `create_recognition` · `intensify_problem` · `explain_mechanism` · `establish_fit` · `handle_objection` · `reduce_risk` · `drive_action`

### Ordering

`sections` renders in array order. Do not reorder, merge or split. Order is an argument.

### Unknown kinds

`kind` is an open string in the schema so a minor version can add one.

- Unknown kind, `required` absent or `false` → **DEGRADABLE.** Skip that section, render the rest.
- Unknown kind, `required: true` → **FATAL.** The page is incomplete without it; refuse.

---

## Partner identity

```json
"partner": { "displayName": "Example Partner", "businessName": null, "introduction": null }
```

That is the whole of it. **There is deliberately no identifier.** A renderer that cannot see a Partner ID cannot construct a referral URL, and a renderer that cannot construct one cannot break attribution.

`displayName` may be `null`. That means no name is safe to show: render without a personal introduction, and **never substitute an identifier** in its place.

Never expect, request or store: credentials, session data, internal UUIDs, database identifiers.

---

## Referral URLs

Every URL arrives fully resolved, with Partner attribution already attached by the Growth Engine.

**Render it exactly.** Never append or reforge `ref`. Never construct attribution. Never substitute your own destination. Never strip a query string. A rewritten URL destroys the Partner's commission.

### The trust model

**`policy.allowedLinkHosts` expresses Growth Engine intent. It is not, by itself, a security trust anchor** — the list travels inside the document it authorises, so a tampered or untrusted document could name its own hostname and validate against itself.

A consumer must do **one** of these:

1. **Receive the PageSpec over an authenticated, trusted channel** from the Growth Engine, so document integrity is established before validation begins; or
2. **Intersect `policy.allowedLinkHosts` with a renderer-controlled security ceiling** — a host list compiled into the renderer, not read from the document.

With a ceiling, the effective allowlist is the **intersection**, so a document can only ever *narrow* what the consumer already trusted, never widen it. If the intersection is empty, that is fatal (`link_policy_outside_ceiling`).

The renderer still never creates, repairs or rewrites a URL. It only refuses documents it should not have been given.

### URL validation

A URL is **not** trusted merely because it appeared in a PageSpec. Every URL anywhere in the document must pass all three:

1. Is a string and non-empty
2. Begins `https://`
3. Its host is in the **effective** allowlist (document policy, intersected with your ceiling if you use one)

Any failure on a CTA URL is **FATAL**.

## Disclosure

```json
"disclosure": { "text": "…", "placement": "footer" }
```

The compensation disclosure arrives as resolved, approved text. The renderer **must** render it.

The renderer **must not** rewrite it, summarise it, translate it, hide it, generate a replacement, or decide whether it is necessary.

**Missing or empty `disclosure.text` is FATAL — fail closed.** A page rendered without it is non-compliant, and that is not a judgement a renderer is equipped to make. `placement` defaults to `footer`, which is always acceptable.

---

## CTAs

```json
{ "label": "Book a demo", "url": "https://…?ref=…", "role": "primary", "carriesAttribution": true }
```

`ctas.primary` is required; `ctas.secondary` may be `null`.

**There is no `cta` section.** The ask lives here, at the top level, and *where* a renderer draws it — a closing panel, a sticky bar, repeated down the page — is presentation, and therefore yours. Renderers choose how a CTA looks and never what it points at.

Missing `ctas.primary` is **FATAL**.

---

## Assets

```json
"asset": { "url": "https://…", "kind": "image", "alt": "…", "role": null, "required": false }
```

A reference, never storage. The contract carries no credentials, no provider metadata and no filesystem paths, and it never will — that is a deliberate boundary, not an omission.

- `required: true` and the asset is unusable → **FATAL**
- `required` absent or `false` and the asset is unusable → **DEGRADABLE**, omit the asset and render the section

`alt` is required on every asset.

---

## Provenance

```json
"provenance": { "factRefs": ["f_96306cd5…"] }
```

**One stable shape. Present on every section, in both origins.** The array may be empty where that is legitimate, so a consumer never has to distinguish "nothing recorded" from "the key was omitted".

| Case | `factRefs` |
| --- | --- |
| Generated, purpose asserts about the product | **At least one reference. Empty is FATAL.** |
| Generated, purpose describes the reader's own day | May be empty |
| Legacy, any section | Empty — nothing recorded it |

The asserting purposes are `explain_mechanism`, `establish_fit`, `handle_objection`, `reduce_risk`, `drive_action`. The other three — `interrupt_pattern`, `create_recognition`, `intensify_problem` — describe the reader's situation and assert nothing about the product, which is why they need nothing behind them. That set is in the schema as `$defs.assertingPurposes` and in the types as `ASSERTING_PURPOSES`, so a consumer enforces the rule without importing producer code.

On a generated document the producer already refuses to *build* an asserting section without an approved fact. An empty array there therefore means provenance was **lost between the producer and the document** — the evidence that the claim was approved is gone — and it is fatal at both ends: the exporter refuses to emit it, and the consumer refuses to render it.

### Format

`^f_[0-9a-f]{64}$` — the prefix `f_` followed by a **full lowercase SHA-256 digest**. Truncated references and the superseded `fact_` prefix are invalid and rejected by the schema and at runtime.

The digest is taken over a **versioned namespace** (`page-spec/v1/fact:`), so a later contract version can change the derivation without a reference from one version ever colliding with one from another.

Normalisation before hashing: whitespace is trimmed and internal runs collapse to a single space, so a reflowed paragraph keeps its identity. **Case is preserved**, because case carries meaning in this content and folding it would merge facts an Admin wrote differently.

The reference is stable wherever that fact exists, meaningless as a key, reveals nothing a prospect cannot already read on the page, and changes when the fact changes — a changed fact is a different fact. **Never a database id.**

A renderer may use provenance for **diagnostics, traceability, validation and future Admin inspection**. It may **never** use it to rewrite content. Provenance says which approved statement a section rests on — not what the section is allowed to say instead.

---

## Design-intent boundary

`emphasis` (`lead` | `support` | `aside`) is the **only** presentation-adjacent field in V1, and it is here because it has a real producer: `PageSpecComposer` computes it — a front-loaded objection block, a disqualifier that leads for a market that has seen everything. It is **carried through the exporter unchanged, never recomputed downstream**, and a test asserts that composer emphasis survives the trip section by section. It expresses **content hierarchy**, which the Growth Engine owns. *How* prominence is expressed — size, order on screen, colour, weight — is entirely yours.

`visualIntent`, `layoutHint`, density, theme tokens and anything resembling CSS are **deliberately absent**. No renderer consumes them today, and shipping a field nothing reads is how a contract accumulates dead weight. They arrive when a consumer needs them, in a minor version, with a producer behind them.

---

## Validation summary

Emit these exact `code` values, so a failure reported by one implementation is recognisable to the other.

| Condition | `code` | Severity |
| --- | --- | --- |
| `specVersion` is anything but `1.0` | `unsupported_spec_version` | **FATAL** |
| `disclosure.text` missing or empty | `missing_disclosure` | **FATAL** |
| `policy.allowedLinkHosts` missing or empty | `missing_link_policy` | **FATAL** |
| `ctas.primary` missing | `missing_primary_cta` | **FATAL** |
| A URL is absent where one is needed | `missing_url` | **FATAL** |
| A URL is not `https://` | `insecure_url` | **FATAL** |
| A URL's host is not in the effective allowlist | `url_host_not_allowed` | **FATAL** |
| No document host survives the consumer's ceiling | `link_policy_outside_ceiling` | **FATAL** |
| A section has no `provenance.factRefs` array | `missing_provenance` | **FATAL** |
| A fact reference is not a full namespaced digest | `malformed_fact_reference` | **FATAL** |
| A generated asserting section names no approved fact | `missing_generated_provenance` | **FATAL** |
| A section is not an object | `malformed_section` | **FATAL** |
| Unknown section kind with `required: true` | `unknown_required_section_kind` | **FATAL** |
| Required asset unusable | `required_asset_unusable` | **FATAL** |
| Schema validation fails (structural) | — (schema, not runtime) | **FATAL** |
| Unknown section kind, not required | `unknown_section_kind` | **DEGRADABLE** — skip the section |
| Optional asset unusable | `optional_asset_omitted` | **DEGRADABLE** — omit the asset |
| Optional field absent | — | Fine — render without it |

On an unsupported version the validator returns **exactly one** finding and checks nothing else: the fields no longer mean what the consumer thinks they mean, so further findings would be noise from a document it cannot read.

The reference implementation is `PageSpecContractValidator` in the Partner Network repository (`backend/app/Domain/GrowthToolkit/Contract/`). Port it rather than reinventing it; the two implementations should be comparable line for line.

---

## Consuming this package

1. Copy `page-spec.schema.json` and `page-spec.ts` into your repository, under a path that records the version (`contracts/page-spec/v1/`).
2. Validate every incoming document against the schema with a draft-2020-12 validator (`ajv` with `ajv-formats`).
3. Port the runtime rules above. Return the `ValidationResult` shape from `page-spec.ts` so failures are classified rather than thrown away.
4. Map `kind` to a local component. Use `purpose` and `emphasis` to inform treatment, never to change wording.
5. Render `partner`, both CTAs and `disclosure` verbatim.
6. Re-copy this directory when the minor version changes. Never edit your copy — this directory is upstream.

`page-spec.example.json` is **generated by the producer, not authored**: the med spa / overloaded-front-desk brief, composed and exported, with only the Partner id normalised to a sample value. A test asserts it is byte-identical to a live export, so it cannot go stale.

It carries a hook (`page.headline`), recognition, the problem intensified, the mechanism, market fit both ways, FAQ handling, the ask (`ctas.primary`), Partner attribution, referral-aware links, the disclosure, and provenance on every section.

It does **not** contain benefit cards or proof — the composer emits neither, and they are not V1 kinds.

**On `policy.allowedLinkHosts` in the example:** it lists `ithinq.ai` and `partners.ithinq.ai`, while the example's own URLs use only `ithinq.ai`. That is deliberate and correct. The list is **configured Growth Engine policy — every host the engine composes links on — not a set derived from the document's contents.** Deriving it from the URLs present would be circular: a document would then authorise exactly what it happened to contain, which authorises nothing. A policy naming a host this particular document does not use is the expected shape, and narrowing what a consumer will honour is the job of the ceiling in the trust model above, not of the document.

---

## Known limitation

Purposes on a **hand-authored** page are inferred from block type by a documented default map in `PageSpecContractV1`. Pages composed by the Growth Engine's `PageSpecComposer` carry authored purposes. The inference is a stated default rather than a guess dressed as data — but a consumer should treat `purpose` on a hand-authored page as a reasonable hint and on a generated page as authoritative. `page.templateKey` is diagnostic only; do not branch on it.
