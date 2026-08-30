# iThinq Bolt Renderer — Phase 01 Discovery

## Boundary

This fork is a renderer/tooling track only. It does not define or own the
CreativeBrief or PageSpec contract, Partner identity, referral URLs,
disclosures, campaign state, factual claims, compensation, authentication, or
business rules. Those values must arrive from the iThinq Growth Engine through
a versioned external PageSpec contract.

No Partner Network repository was read or modified during this phase.

## Provenance

| Item | Value |
|---|---|
| Fork | https://github.com/globalvoice1444/bolt.diy |
| Working upstream | https://github.com/stackblitz-labs/bolt.diy |
| Original parent | https://github.com/stackblitz/bolt.new |
| Upstream/fork SHA | `2e254ac19a696394030601bc602f54945b12bfc4` |
| Local workspace path | `/workspace/scratch/372ec0ea6deb/bolt.diy` |
| License | MIT |
| Required notice | `Copyright (c) 2024 StackBlitz, Inc. and bolt.diy contributors` |

The upstream MIT `LICENSE` file is intact. The notice and permission text must
remain in every substantial distribution of the derived software.

## Baseline validation

- Installed with the repository-pinned `pnpm@9.14.4` and the existing lockfile.
- Tests: 52 passed, 0 failed.
- Production build: passed with `NODE_OPTIONS=--max-old-space-size=4096`.
- TypeScript: passed after the production build generated `build/server`.
- Development server: reached Vite ready state at `http://localhost:5173/`.
- No API key was added and no paid provider was invoked.

The build reports large client chunks and several upstream bundling/icon
warnings. The largest reported client chunk is approximately 3.52 MB before
gzip. These are baseline findings, not changes made by iThinq.

## Current architecture

### Generation flow

1. `app/components/chat/Chat.client.tsx` uses the Vercel AI SDK `useChat` hook
   and submits messages, the current file map, settings, and optional service
   context to `/api/chat`.
2. `app/routes/api.chat.ts` reads provider configuration, processes MCP tool
   invocations, optionally summarizes/selects code context, and starts the LLM
   stream.
3. `app/lib/.server/llm/stream-text.ts` selects the provider/model, builds the
   Bolt system prompt, and streams a response through the Vercel AI SDK.
4. The model emits Bolt's custom `<boltArtifact>` and `<boltAction>` markup.
5. `app/lib/hooks/useMessageParser.ts` and the streaming parsers convert that
   markup into artifact and action events.
6. `app/lib/stores/workbench.ts` creates an `ActionRunner`, queues the actions,
   and updates the editor/workbench state.
7. `app/lib/runtime/action-runner.ts` writes files or runs commands in the
   selected runtime.

### LLM/provider layer

`app/lib/modules/llm/manager.ts` registers provider implementations exported
by `app/lib/modules/llm/registry.ts`. Provider adapters cover OpenAI,
Anthropic, Google, OpenRouter, Bedrock, local endpoints, and numerous other
services. The provider layer is useful for Bolt's general-purpose chat product
but is not needed in the deterministic PageSpec rendering path.

### Preview and runtime

- `app/lib/webcontainer/index.ts` boots one browser-side WebContainer.
- `app/lib/runtime/action-runner.ts` writes project files and spawns commands.
- `app/lib/stores/previews.ts` listens for server/port events.
- `app/components/workbench/Preview.tsx` renders the running site in an iframe.
- CodeMirror provides the editor and xterm provides the terminal.
- `app/entry.server.tsx` supplies the COOP/COEP isolation headers required by
  SharedArrayBuffer/WebContainer.

### Rendering/component system

Bolt has a substantial component system for its own chat, editor, preview, and
settings interface. It does **not** have a deterministic landing-page component
registry. Generated pages are arbitrary application source files invented by
the selected LLM. A premium iThinq renderer therefore needs a small, fixed
landing-page component kit whose content is populated exclusively from the
external PageSpec.

### File/project generation

The LLM currently generates complete files as `file` actions and commands as
`shell`, `start`, or `build` actions. `ActionRunner` writes files into the
WebContainer filesystem and starts the generated project. This action boundary
is reusable, but free-form model output must not sit in front of it for the
iThinq PageSpec path.

## Smallest safe integration seam

Insert a deterministic PageSpec consumer immediately before the action/runtime
boundary:

```text
external PageSpec
  -> contract-version check and validation
  -> deterministic PageSpec compiler
  -> ProjectManifest (fixed files + pagespec.json)
  -> RuntimePort
  -> existing editor / preview / file tooling
```

The PageSpec path must bypass `/api/chat`, `stream-text.ts`, the provider
registry, prompt library, and streaming artifact parser. The compiler should
produce a fixed renderer application plus a data file, not ask an LLM to write
page source. This makes the output reproducible and prevents Bolt from becoming
a second copy/fact/governance authority.

The runtime should be accessed through a new `RuntimePort` interface rather
than importing WebContainer directly in the PageSpec compiler. That isolates
the production licensing decision.

## Keep, remove, and isolate

### Keep

- Workbench shell, responsive preview, file tree, and CodeMirror editor.
- Project file state, import/export, diff, and action status/error reporting.
- Preview refresh and console/error feedback.
- MIT license and attribution notices.

### Remove from the PageSpec product path

- Free-form chat-to-application generation.
- LLM provider/model selection and prompt enhancement.
- Bolt prompt libraries, context summarization, and MCP tool invocation.
- Automatic shell-command interpretation from model prose.
- Supabase, Netlify, Vercel, GitHub, GitLab, and Electron integrations unless a
  later, separately approved requirement proves they are necessary.

Removal initially means route/build isolation, not a destructive deletion of
upstream code. Physical deletion can happen after the POC establishes the
required surface.

### Isolate

- WebContainer behind `RuntimePort`.
- External PageSpec validation behind a generated consumer adapter.
- Asset retrieval/proxying and URL allowlists.
- Any future publishing/deployment adapter.
- Credentials, network access, and generated-code execution.

## Risks and gates

### Production license gate

The Bolt source and `@webcontainer/api` package are MIT, but the WebContainer
service/runtime has separate commercial terms. StackBlitz states that a paid
license is required for production commercial use serving customers,
prospective customers, or employees; prototypes and POCs are exempt.

No production architecture should depend on WebContainer until iThinq chooses
one of these paths:

1. Purchase/approve the commercial WebContainer license.
2. Replace it with an approved isolated browser/server runtime through
   `RuntimePort`.

Official reference: https://webcontainers.io/enterprise

### Security gate

A baseline production dependency audit reports 123 known vulnerabilities:
4 critical, 45 high, 53 moderate, and 21 low. Critical findings include the
pinned Remix/React Router stack, jsPDF, and a transitive XML parser. The fork
must not be deployed before dependency reduction/upgrades and a fresh audit.

Additional security concerns:

- Bolt can execute LLM-generated shell commands and install arbitrary packages.
- Provider and deployment tokens may be stored in client-readable cookies or
  exposed through `VITE_*` variables.
- The original application is a single-user developer tool, not a hardened
  multi-tenant production service with iThinq authorization boundaries.
- A PageSpec that permits raw HTML, scripts, arbitrary CSS, or arbitrary URLs
  would create injection, tracking, and data-exfiltration paths.
- External preview origins and cross-origin isolation complicate CSP, asset
  loading, browser compatibility, and embedding.

### Runtime/maintenance gate

- The current upstream SHA dates to February 2026.
- The lockfile contains 1,628 packages and requires the pinned pnpm version.
- The build needs more than the default 2 GB Node heap in this environment.
- WebContainer depends on SharedArrayBuffer and COOP/COEP headers. Chromium has
  the strongest support; Firefox and Safari have documented limitations.
- Native Node add-ons are not supported in WebContainer.

## Minimal PageSpec POC

### Scope

Render exactly one externally supplied PageSpec into one premium responsive
landing page. No LLM, provider key, publishing, production integration, Partner
business logic, or contract authoring is included.

### Implementation shape

1. Create an `ithinq/pagespec-renderer-poc` branch from the verified baseline.
2. Add a generated consumer type/validator from the Growth Engine's canonical
   PageSpec schema. Until that schema is available, use one clearly labeled
   external fixture and do not check in a hand-authored canonical schema.
3. Add a fixed renderer project containing an allowlisted section-component
   registry and design tokens.
4. Compile the validated PageSpec into a deterministic `ProjectManifest`:
   fixed application files plus an exact `pagespec.json` data file.
5. Pass the manifest through `RuntimePort`; use WebContainer only as the POC
   adapter under the documented prototype exemption.
6. Show the result in the existing Bolt workbench preview and editor.

### POC acceptance criteria

- Zero calls to `/api/chat` or any LLM/provider.
- Identical input produces byte-identical project files.
- Copy, facts, Partner identity, referral URLs, and disclosures are unchanged
  from the PageSpec.
- Unknown contract version or section kind fails closed with a useful error.
- No raw HTML, scripts, arbitrary shell actions, or unapproved remote assets.
- The page works at 320, 390, 834, 1440, and 1920 pixel widths.
- Semantic headings, keyboard navigation, visible focus, and reduced-motion
  behavior are verified.
- Referral CTA and disclosures remain visible and exact.
- Tests prove validation, deterministic compilation, and required-field
  preservation.

## Decision required after the POC

Do not wire production after POC approval. First choose the production runtime:
commercial WebContainer or a replacement runtime. That decision changes cost,
browser support, security posture, and deployment architecture, so it must be
explicit.
