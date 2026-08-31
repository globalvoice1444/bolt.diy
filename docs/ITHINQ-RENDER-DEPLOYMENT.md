# Deploying the Bolt creative engine to Render

Status: **preparation only. Nothing is deployed, and the app cannot be deployed to Render as it stands.**

This records what the application actually needs at runtime, what the blocker is, and what the Render service looks like once the blocker is cleared. It is written from measurements against the merged `main`, not from reading the code and guessing.

## The blocker, first

**The application does not run under its own configured production start command.** `pnpm start` runs `wrangler pages dev ./build/client`, which executes the app in workerd, Cloudflare's Workers runtime. Every route returns 500 there — including `/api/health` and even `/favicon.svg`:

```
EvalError: Code generation from strings disallowed for this context
    at Ajv2020.compileSchema (ajv/lib/compile/index.ts:171)
```

`pagespec/validator.ts` compiles the PageSpec JSON Schema with Ajv at **module scope**. Ajv builds validators by generating code at runtime, which Workers forbid. Remix bundles every route into one server module, so the throw happens on import and takes the whole app down rather than just the pages that validate a PageSpec.

**And the same build cannot run under Node either.** Importing `build/server/index.js` in Node fails before any request:

```
SyntaxError: Named export 'renderToReadableStream' not found.
The requested module 'react-dom/server' is a CommonJS module
```

`entry.server.tsx` uses the Web-streams renderer that Workers provide and Node's default `react-dom/server` export does not.

So the app currently targets Cloudflare Workers, and the iThinq engine needs Node. The two are mutually exclusive today, and neither actually works: Workers because of Ajv, Node because of the server entry.

## Why Node is the right target

Even with the Ajv problem solved, the engine cannot run on Workers. It writes to the filesystem in two places that Workers do not have:

- `FileSystemAssetStore` → `.data/ithinq-generated/` (generated imagery)
- `FileSystemSnapshotStore` → `.data/ithinq-facts/website-snapshot.json` (the approved fact corpus)

Under Node both work, and Ajv compiles normally. Render runs Node. The target is not in doubt; the adapter is missing.

## What clearing the blocker involves

`@remix-run/node` and `@remix-run/serve` are **already dependencies**, so nothing new is installed. What changes is the runtime the app is built and served against:

| | Work |
|---|---|
| Server entry | `entry.server.tsx` — Node streaming renderer instead of `renderToReadableStream` |
| Runtime imports | **49 files** import `@remix-run/cloudflare`; 8 are the iThinq routes, 41 are upstream bolt.diy |
| Load context | **19 files** read `context.cloudflare.env`; on Node this becomes `process.env` or an equivalent load context |
| Build config | `vite.config.ts` drops `remixCloudflareDevProxy`; `functions/[[path]].ts` and `wrangler.toml` are replaced by a Node server entry |
| Scripts | `start` becomes a Node server rather than `wrangler pages dev` |

This is a runtime migration across the whole application, most of it upstream chat code rather than the creative engine. It is a deliberate architectural decision — Cloudflare or Node — and it belongs to whoever owns that call, not to a deployment-prep pass.

## The Render service, once Node serving exists

One **Web Service**. Nothing here needs a second service: the same process serves the frontend, the loaders and the generated-image route, and splitting them would only add a network hop between a page and its own images.

| | |
|---|---|
| Type | Web Service (Node) |
| Runtime | Node 22 — `engines` says `>=18.18.0`, the Dockerfile builds on `node:22-bookworm-slim` |
| Build | `pnpm install --frozen-lockfile && NODE_OPTIONS=--max-old-space-size=8192 pnpm run build` |
| Start | *(the Node server entry that does not exist yet)* |
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

## Readiness

**Blocked**, on one concrete item: there is no working production server. The configured start command 500s on every route under Workers, and the build will not import under Node.

Everything else is ready. The build succeeds, the health endpoint exists, the environment is three variables, the fact snapshot is reproducible, ephemeral assets are fine for smoke testing, and the secret boundary holds in the built client bundle.
