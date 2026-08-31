# Deploying the Bolt creative engine to Render

Status: **the runtime is migrated and verified locally. Nothing is deployed.**

This records what the application actually needs at runtime, what the blocker is, and what the Render service looks like once the blocker is cleared. It is written from measurements against the merged `main`, not from reading the code and guessing.

## What was wrong, and what was done

The repo targeted Cloudflare Pages and **did not run under its own configured production start command**. `wrangler pages dev` executes the app in workerd, where every route returned 500 — `/api/health` and `/favicon.svg` included:

```
EvalError: Code generation from strings disallowed for this context
    at Ajv2020.compileSchema
```

`pagespec/validator.ts` compiles the PageSpec schema with Ajv at module scope; Ajv generates validator code at runtime and Workers forbid it. Remix bundles every route into one server module, so the throw happened on import and took the whole app down.

The same build could not run under Node either — `entry.server.tsx` imported `renderToReadableStream` from `react-dom/server`, which resolves to the CommonJS Node build that does not export it.

Node was the right target regardless: the engine writes generated imagery and the fact snapshot to disk, and Workers have no filesystem.

### The migration

| | |
|---|---|
| Server entry | `renderToReadableStream` now imported from `react-dom/server.browser`, the Web-streams build Node 18+ can run. Streaming behaviour unchanged |
| Runtime package | 46 files swapped `@remix-run/cloudflare` → `@remix-run/node`. Only `json` and standard types were ever imported, and both packages export them identically |
| Load context | `load-context.ts` keeps the `context.cloudflare.env` shape and fills it from `process.env`, so ~19 upstream call sites did not have to change |
| Env access | `getRuntimeEnv(context)` is the single reconciliation point, used by the iThinq routes |
| Retired | `functions/[[path]].ts`, `wrangler.toml`, `bindings.sh`, `worker-configuration.d.ts` (its `Env` interface moved to `env.d.ts`, which is what it always actually was) |
| Scripts | `start` is `remix-serve ./build/server/index.js`; `deploy` (wrangler) and `typegen` removed |
| Docker | production stage runs `pnpm run start` instead of the Workers emulator |

### Two bugs the migration exposed

Neither was visible before, because nothing had ever run the built server: on Workers everything failed earlier, and the tests and the refresh CLI use the real Node `process`.

**The server bundle was importing a browser `process` shim.** `nodePolyfills` was applied to both builds, so the SSR bundle carried `vite-plugin-node-polyfills/shims/process`, whose `cwd()` is `/` and whose `env` is empty. On a real Node server that is quietly catastrophic: the asset store and fact snapshot resolved their roots somewhere that was not the application directory, so generated images wrote nowhere and read back as 404s, and `process.env` would never have yielded the OpenAI key. The polyfills are now scoped to the client build, where they belong.

**`undici` was being pulled into the client bundle.** `@remix-run/node` re-exports it, and Remix pulls every route module into the client graph before tree-shaking removes the server halves; the polyfill plugin then failed resolving undici's `node:util/types`. Node's HTTP client has no place in a browser bundle, so it is aliased to an empty module for the client build only. The server build is untouched and uses the real one.

**Two upstream routes used `Response.json()` as a static helper.** `remix-serve` calls `installGlobals()`, which replaces Node's native `Response` with undici's, and that one has no static `json`. `api.check-env-key` and `api.export-api-keys` now use Remix's own `json()` helper, as every other route in the codebase already did.

## The Render service## The Render service

One **Web Service**. Nothing here needs a second service: the same process serves the frontend, the loaders and the generated-image route, and splitting them would only add a network hop between a page and its own images.

| | |
|---|---|
| Type | Web Service (Node) |
| Runtime | Node 22 — `engines` says `>=18.18.0`, the Dockerfile builds on `node:22-bookworm-slim` |
| Build | `pnpm install --frozen-lockfile && NODE_OPTIONS=--max-old-space-size=8192 pnpm run build` |
| Start | `pnpm run start` → `remix-serve ./build/server/index.js` |
| Health check | `/api/health` — already exists, returns `{status, timestamp}`, calls nothing and costs nothing |
| Output | `build/client` (static) and `build/server` (SSR bundle) |
| Persistent disk | Not required for smoke deployment. See assets below |
| Port | Render supplies `PORT`; the server must bind it and `0.0.0.0` |

The build needs the larger heap. The default 2GB OOMs on this bundle; that is pre-existing bundle size, not a regression.

## Environment

| Variable | Class | Notes |
|---|---|---|
| `OPENAI_API_KEY` | **Required** for authorship | Server-side only. Without it the engine degrades to the document's own copy and placeholder imagery — it does not crash |
| `PORT` | **Required** | Supplied by Render |
| `NODE_ENV=production` | Required | |
| `ITHINQ_WEBSITE_ORIGIN` | Optional | Defaults to `https://ithinq.ai`. Cannot widen the fact host ceiling, which is closed in code |
| `ITHINQ_WEBSITE_PATHS` | Optional | Overrides the approved page list |
| `NODE_OPTIONS=--max-old-space-size=8192` | Build-time | |

Model names (`gpt-4o`, `gpt-image-1`) are code constants, not environment. The upstream chat app reads many other provider keys; none is needed by the creative engine.

`.env.example` carries the names and placeholders. No secret belongs in source control — they are Render environment variables.

## Website fact source in production

**Snapshot, refreshed on command. Not live crawling per request.**

`websiteFactSource()` reads `.data/ithinq-facts/website-snapshot.json` and never touches the network. Campaign generation therefore cannot be slowed, broken or silently changed by the state of the website at that moment, and a generated page can be explained afterwards: these facts, from these pages, read at this time.

Of the four options — build time, startup, manual command, per request — the architecture already answers **manual command** (`pnpm ithinq:refresh-facts`), and that is the right answer. Per-request crawling would be slow, non-reproducible and rude to the site; startup refresh would make a deploy depend on a third party being up.

**One operational constraint worth knowing before the first deploy:** ithinq.ai is a client-rendered SPA, so the refresh command renders each page with headless Chromium (`scripts/lib/rendered-fetch.mjs`). A container that runs the refresh needs a browser present. Serving campaigns does not — only refreshing does.

### Durability

The snapshot is a single JSON file on local disk, so a Render restart or redeploy loses it. That is **acceptable**, because it is fully reproducible from the approved first-party pages by re-running the refresh, and because a missing snapshot degrades honestly: `websiteFactSource().load()` returns null, no facts reach the writer, and the page renders the document's own copy rather than a fabricated campaign.

No database or storage vendor is needed for this.

## Generated imagery — the one thing to decide before real Partner use

**Today:** `gpt-image-1` returns bytes, `FileSystemAssetStore` writes them to `.data/ithinq-generated/<sha256>.png`, and the page references `/ithinq/generated/<id>`, served by a route that reads them back. Ids are content-addressed, so the same prompt reuses the same file instead of paying to regenerate it.

**On restart or redeploy the directory is empty.** Any campaign page that outlives the process references images that now 404, and the next generation pays OpenAI again for bytes that already existed.

Classification:

- **Acceptable for first production smoke testing.** Nothing breaks, images regenerate, and the cost is a few cents.
- **Durable storage is required before real Partner usage.** A Partner-facing page whose imagery disappears on the next deploy is not shippable.

The seam for that already exists and is documented in `asset-store.ts`: `AssetStore` is an interface with one development implementation, and a deployment swaps in an object store behind it. Nothing above that file knows where bytes are kept. Choosing the store is a deployment decision and is deliberately not made here.

A Render persistent disk mounted at `.data/` would also work and is the smaller change, at the cost of pinning the service to one instance.

## Security, verified against the production build

- The literal API key does **not** appear anywhere in `build/client`.
- No `sk-` prefixed value appears in `build/client`.
- The engine's own code — `authorCampaignCopy`, `refreshWebsiteFacts`, `OpenAITextGenerator` — is **absent from the client bundle** entirely. It is server-only.
- The string `OPENAI_API_KEY` does appear twice in client chunks: once as a UI hint telling a reviewer to set it server-side, once in upstream bolt.diy's own provider registry, which names the variable for its browser-supplied-key chat feature. Both are the variable *name*, never a value. The chat feature's key handling is upstream behaviour and separate from the creative engine.
- Three host ceilings remain in place and separate: navigation (`POC_RENDERER_LINK_HOST_CEILING`), media (`POC_RENDERER_MEDIA_HOST_CEILING`) and fact (`RENDERER_FACT_HOST_CEILING`).
- `refreshWebsiteFacts` is reachable only from the CLI. No HTTP route lets a caller name a URL to fetch.
- The generated-asset route cannot be used for path traversal: `AssetStore.get` rejects any id that is not `^[0-9a-f]{8,64}$` before touching the filesystem, and serves with `nosniff`, an explicit content type and `Cross-Origin-Resource-Policy: same-origin`.
- The engine emits no logs at all, so it cannot leak a key, a header or a corpus dump. The flip side is that a production failure gives no diagnostic beyond the HTTP response; structured logging for fact-refresh, provider and render failures is worth adding, and is not a deployment blocker.

## Campaign generation entry points

There is **no JSON API for campaign generation**. What exists is the reviewer surface:

| Route | Purpose |
|---|---|
| `GET /ithinq/campaign?brief=…&spec=…` | Studio UI: plan, facts, copy, guard findings, imagery, live preview |
| `GET /ithinq/campaign-preview?brief=…&spec=…` | The composed page alone, HTML |
| `GET /ithinq/generated/:id` | Generated image bytes |
| `GET /api/health` | Liveness |

The flow behind them is: request → `interpretBrief` → `CreativeStrategy` → `FactSource` → relevance selection → `authorCampaignCopy` → guard → claim audit → repair → `planAssetNeeds` → `gpt-image-1` → `CreativePresentationPlan` → `composeDocument`.

`/ithinq/campaign-preview` is already a thin server-rendered seam and is enough to exercise the whole engine over HTTP in a hosted environment. A Partner-facing API belongs to the integration phase, not to deployment prep.

## Verified locally, on the exact Render path

`pnpm run build` then `pnpm run start`, `NODE_ENV=production`, bound to `0.0.0.0`:

| Route | Result |
|---|---|
| `/` | 200 |
| `/api/health` | 200 `{"status":"healthy"}` |
| `/ithinq/pagespec` | 200 |
| `/ithinq/campaign-preview` | 200, full campaign rendered |
| `/favicon.svg` | 200 |
| `/api/check-env-key?provider=OpenAI` | 200 `{"isSet":true}` — `process.env` reaches server loaders |
| `/ithinq/generated/:id` | 200, correct content type |
| `/ithinq/generated/not-hex` | 404, filesystem never touched |
| `/ithinq/generated/../../package.json` | 404, no traversal |

With `OPENAI_API_KEY` set, one controlled request through the production server ran the whole pipeline live: `gpt-4o` authored the copy, `gpt-image-1` returned two images, the store wrote them to disk as 1536×1024 and 1024×1536 PNGs, and the page served them back. The headline it produced — *"Enhance Every Call with Grace and Accuracy"* — is authored, not the document's own copy, and the Partner disclosure is intact.

No 500s, no Cloudflare context, no Ajv restriction, no missing render API, no Wrangler.

## Readiness

Ready for a smoke deployment. Durable storage for generated imagery remains the one thing to solve before Partner-facing use.
