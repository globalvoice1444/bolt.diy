# iThinq PageSpec renderer POC

Status: local proof of concept on `ithinq/pagespec-renderer-poc`. It is not connected to the Partner Network, deployed, or pushed.

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
| `page-spec.ts` | `f6129d3c96183fbc472b24d50cc55950704b8d3eccb4a0aeda2db4183f6405d0` |
| `README.md` | `2f6f50b1eec7cd972b3cbfe9392f4104ce352540a6da1bc1c7fe5d3afffa6e7b` |

Do not edit these files to satisfy the renderer. Replace the snapshot from a reviewed Growth Engine contract release.

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
- Run the preview in an iframe sandbox that permits same-origin identity for Firefox COEP compatibility and outbound popup navigation, but still forbids scripts and forms. The rendered document's CSP independently blocks scripts.
- Use no LLM, provider, prompt, shell, package installation, `eval`, WebContainer, or runtime fetch in the compile path.

This POC is not yet a production security boundary. Authentication, trusted transport, artifact storage, audit logging, rate limiting, and a reviewed deployment topology remain future work.

## What this proves

- A real producer-emittable PageSpec can render without a free-form prompt.
- The smallest integration seam is a pure compiler that accepts `unknown`, validates, and returns a runtime-neutral project manifest.
- Bolt's existing LLM/provider and WebContainer systems are unnecessary for the deterministic landing-page path.
- A future sandbox or artifact publisher can implement `RuntimePort` without changing contract validation or compilation.

## Explicitly out of scope

- Partner lookup, authentication, referral, compensation, disclosure, or campaign governance logic.
- Copy generation, rewriting, summarisation, translation, or factual inference.
- Changes to CreativeBrief, PageSpecComposer, or the Partner Network repository.
- Production wiring or deployment.
- Closing the producer gaps for benefits, proof, or mid-page CTAs.

## Verification

At implementation time:

- Focused PageSpec tests: 10 passed.
- Full Bolt suite: 62 passed across 4 files.
- TypeScript: passed.
- ESLint: passed.
- Remix/Vite production build: passed with existing upstream warnings.
- HTTP smoke test: workbench and preview returned `200`; preview returned the CSP and contained no script element.

The automated browser package was present but its Chromium binary was not installed in this environment, so screenshot-based visual regression was not claimed as complete.

## Next safe step

Review this local commit. If approved, push only the POC branch to the Bolt fork. After that, add fixture-driven visual regression tests and decide whether the production runtime should publish static artifacts or serve compiled documents dynamically. Neither choice changes the Growth Engine ownership boundary.
