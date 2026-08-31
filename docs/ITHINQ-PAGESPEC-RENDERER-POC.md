# iThinq PageSpec renderer POC

Status: proof of concept on `ithinq/pagespec-renderer-poc`, pushed to the Bolt fork and open for review as PR #1. It is not merged, not deployed, and not connected to the Partner Network.

## Outcome

The POC proves the narrow renderer seam:

```text
external PageSpec 1.0 JSON
  -> strict schema and runtime validation
  -> deterministic project manifest
  -> static premium landing-page document
  -> isolated iframe preview
```

The Growth Engine remains the authority for every business value in the document. The renderer selects presentation components and emits markup; it does not compose or repair content.

## Contract snapshot

The files in `contracts/page-spec/v1/` are copied verbatim from `globalvoice1444/ithinq-partner-network` at merge commit:

`51c103ff2492b068095dc356225d5d9ef496b44b`

Snapshot hashes:

| File | SHA-256 |
| --- | --- |
| `page-spec.schema.json` | `3a88079cc7cfc9ec62805439d6616b0560da43148de41501f38d76949a1eddb3` |
| `page-spec.example.json` | `d4a8ca6f1370b8a4c38ea6ec05d92e641a64d39f41cef36be5f4bc1c95ec6874` |
| `page-spec.ts` | `5a928aac315b5799dc4eb3da3aa14b6d9a9619a96b0cf92b3094fa2ec78df9f5` |
| `README.md` | `2f6f50b1eec7cd972b3cbfe9392f4104ce352540a6da1bc1c7fe5d3afffa6e7b` |

All four files are **byte-identical** to that commit, verified by `contract-provenance.spec.ts`, which hashes them on every test run.

The snapshot is an **opaque vendored artifact**, not renderer source. `contracts/` is excluded from Prettier and ESLint so no tool can quietly reformat it — an earlier copy of `page-spec.ts` had been rewritten into the renderer's house style (semicolons, collapsed arrays, dropped trailing commas), which changed no semantics but broke byte-level provenance. The exact bytes have been restored and the digests above recomputed from the pinned source.

Do not edit these files to satisfy the renderer. Replacing the snapshot is a deliberate act: take a reviewed Growth Engine contract release, copy the bytes, and update the pinned commit and the digests together.

## Local routes

Run Bolt normally, then open:

- `/ithinq/pagespec` — POC workbench with the rendered page and manifest metadata.
- `/ithinq/pagespec-preview` — standalone static preview of the producer-generated example.
- `POST /ithinq/pagespec-preview` — accepts one external PageSpec as `application/json`, validates it, and returns the rendered static HTML.

The POST route returns:

- `200` for a valid, renderable PageSpec.
- `400` for malformed JSON.
- `413` above the 512 KiB POC limit.
- `415` for a non-JSON content type.
- `422` for a structurally or semantically unrenderable PageSpec.

## Components

| Component | Responsibility |
| --- | --- |
| `validator.ts` | Exact version check, JSON Schema validation, URL policy, and unknown-kind rules. |
| `compiler.ts` | Pure PageSpec-to-manifest transformation and static landing-page presentation. |
| `runtime.ts` | Minimal runtime port and the static inline implementation. |
| `ithinq.pagespec-preview.ts` | Bounded external JSON transport and hardened HTML response. |
| `ithinq.pagespec.tsx` | Local inspection workbench. |

The manifest contains exactly three deterministic files:

| Path | Purpose |
| --- | --- |
| `/index.html` | Script-free rendered landing page. |
| `/pagespec.json` | Canonical, sorted copy of the accepted input. |
| `/renderer.json` | Compiler and contract provenance. |

## Validation and security posture

- Accept exactly PageSpec `1.0`; all other versions fail closed.
- Validate with the authoritative draft 2020-12 JSON Schema.
- Apply a renderer-owned hostname ceiling in addition to the document allowlist. A document cannot authorize its own hostile host.
- Preserve supplied CTA and asset URLs; never append, sign, shorten, proxy, or reconstruct them.
- Escape every content value before placing it in HTML.
- Preserve section order. Unsupported optional kinds may be skipped only when the contract runtime rule permits it; unsupported required kinds are fatal.
- Keep provenance in `/pagespec.json` for diagnostics. It is never used to rewrite content.
- Return static HTML with no scripts and a restrictive Content Security Policy.
- Serve the preview with the same `Cross-Origin-Embedder-Policy: require-corp` asserted by Bolt's parent document, plus `Cross-Origin-Resource-Policy: same-origin`.
- Preserve the preview's same-origin identity for Firefox COEP compatibility and allow outbound popup navigation. Scripts and forms remain forbidden by the iframe sandbox, and the rendered document's CSP independently blocks scripts. Never combine this setup with `allow-scripts`.
- Use no LLM, provider, prompt, shell, package installation, `eval`, WebContainer, or runtime fetch in the compile path.

This POC is not yet a production security boundary. Authentication, trusted transport, artifact storage, audit logging, rate limiting, and a reviewed deployment topology remain future work.

### The unwired `trustedTransport` option

`PageSpecValidationOptions` exposes `trustedTransport` and `rendererAllowedLinkHosts`. **No current caller passes either.** Both POC routes call the compiler with no options, so every PageSpec is validated against the built-in `POC_RENDERER_LINK_HOST_CEILING` (`ithinq.ai`, `partners.ithinq.ai`). Neither option is exercised by a test.

They are retained deliberately, and this should not be read as wiring left half-finished:

- The host ceiling is a **compensating control for untrusted transport**. The POC ingests a PageSpec from a local file or an unauthenticated `POST`, so it cannot take the document's own `allowedLinkHosts` at face value — that is what stops a hostile document from authorizing its own CTA host.
- `trustedTransport` is the point at which that control is released, and it is only correct once the PageSpec arrives over an authenticated channel from the Growth Engine. Until then it must stay unset.
- `rendererAllowedLinkHosts` lets a future deployment front different hosts without editing the validator.

Keeping the seam visible is the point: it documents where the trust boundary moves when transport becomes authenticated. It is not a promise that the next commit wires it.

## What this proves

- A real producer-emittable PageSpec can render without a free-form prompt.
- The smallest integration seam is a pure compiler that accepts `unknown`, validates, and returns a runtime-neutral project manifest.
- Bolt's existing LLM/provider and WebContainer systems are unnecessary for the deterministic landing-page path.
- A future sandbox or artifact publisher can implement `RuntimePort` without changing contract validation or compilation.

## Architectural note: this mapping is not the final product design model

**The deterministic section mapping in this POC is not the final product design model.**

What the POC proves is the *seam*, not the aesthetic:

- PageSpec transport
- contract validation
- trust and security boundaries
- deterministic, safe rendering
- browser compatibility

A one-kind-to-one-component mapping was the cheapest way to prove those five things without a model in the loop. It must **not** be read as establishing a permanent rule that:

- one PageSpec kind maps to one fixed visual component
- pages use one template
- pages use one color system
- section order and layout are permanently rigid
- the renderer cannot create richer visual compositions

### Future product direction

iThinq Partner Network users should be able to describe, in plain language, what they want to promote.

iThinq and the Growth Engine supply the trusted inputs: product facts, Partner context, campaign constraints, referral URLs, disclosures, and other authoritative business information.

The Bolt-derived creative renderer may then have broad creative freedom over **presentation**, including page composition, responsive layout, visual hierarchy, typography, color systems and themes, imagery and image placement, section presentation, cards, galleries, comparison treatments, FAQ presentation, CTA presentation, animation and motion where appropriate, long-form versus concise page treatment, industry-specific aesthetics, and landing-page, funnel, or site-style presentation.

**The guardrail is truth, not visual creativity.**

The renderer may never fabricate:

- product capabilities
- customer reviews or testimonials
- statistics
- pricing
- guarantees
- legal or compliance claims
- Partner identity
- referral destinations
- required disclosures

The renderer should eventually be capable of producing pages that look materially different from one another, rather than merely filling a fixed template. The ownership boundary is what stays fixed: the Growth Engine owns business truth, the renderer owns presentation. Widening presentational freedom does not widen the renderer's authority over truth.

Phase 1 of that direction is now implemented on `ithinq/creative-renderer-productization`: a presentation plan and four interchangeable creative directions built on this same seam. See [`ITHINQ-CREATIVE-RENDERER.md`](./ITHINQ-CREATIVE-RENDERER.md). The truth boundary described above is unchanged by it.

## Explicitly out of scope

- Partner lookup, authentication, referral, compensation, disclosure, or campaign governance logic.
- Copy generation, rewriting, summarisation, translation, or factual inference.
- Changes to CreativeBrief, PageSpecComposer, or the Partner Network repository.
- Production wiring or deployment.
- Closing the producer gaps for benefits, proof, or mid-page CTAs.

## Verification

Re-verified at review time on the pushed branch:

- Focused PageSpec tests: 11 passed (10 in `compiler.spec.ts`, 1 in `preview-response.spec.ts`).
- Full Bolt suite: 63 passed across 5 files.
- TypeScript: passed, clean.
- ESLint: passed, clean.
- Remix/Vite production build: passed with existing upstream warnings. In a memory-constrained environment it needs a raised Node heap (`--max-old-space-size`); this is a pre-existing characteristic of the Bolt bundle, not something this branch introduces.
- HTTP smoke test: workbench and preview returned `200`; preview returned the CSP and cross-origin headers and contained no script element.

Browser verification:

| Browser | Result |
| --- | --- |
| Firefox 154.0.1 | Pass |
| Edge (Chromium) | Pass |

Firefox was driven through Marionette so the assertion runs after hydration rather than at the load event. Inside the nested preview iframe it observed the rendered `h1`, six `data-section-index` sections, both CTA hosts, and zero `script` elements, with no cross-origin access error. Edge rendered the same page and manifest sidebar with zero findings.

There is still no committed fixture-driven visual regression suite; browser verification is scripted but not automated in CI.

## Next safe step

Review PR #1. After review, add fixture-driven visual regression tests and decide whether the production runtime should publish static artifacts or serve compiled documents dynamically. Neither choice changes the Growth Engine ownership boundary.
