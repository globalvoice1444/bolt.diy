# Deploying the Bolt creative engine to Render

Status: **deployed and verified live on Render.** `srv-daave6p5efls73936jng` -> https://ithinq-bolt-renderer.onrender.com (oregon, starter, `autoDeploy: no`). `OPENAI_API_KEY` is set and one live production campaign has run end to end through Render on `gpt-4o` + `gpt-image-1` -- see *Live production smoke test* below.

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

## The Render service

One **Web Service**. Nothing here needs a second service: the same process serves the frontend, the loaders and the generated-image route, and splitting them would only add a network hop between a page and its own images.

| | |
|---|---|
| Type | Web Service (Node) |
| Runtime | Node 22 — `engines` says `>=18.18.0`, the Dockerfile builds on `node:22-bookworm-slim` |
| Build | `corepack enable && pnpm install --frozen-lockfile --prod=false && NODE_OPTIONS=--max-old-space-size=8192 pnpm run build` — `--prod=false` is required; see *What the first real deploy exposed* |
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
| `NODE_ENV=production` | Required | Applies to the **build** as well as the runtime on Render, which is why the install must force `--prod=false` |
| `HUSKY=0` | Required | Stops the git-hook installer from failing the build |
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

**The seam is now filled in code.** `AssetStore` is unchanged; what changed is that it has a second implementation and a resolver.

| Backend | When it is chosen | Survives a redeploy | Survives a second instance |
|---|---|---|---|
| `FileSystemAssetStore` at `.data/` | nothing configured | no | no |
| `FileSystemAssetStore` at `RENDERER_ASSET_DIR` | that variable is set | yes, with a Render disk | no |
| `S3AssetStore` | the four `RENDERER_ASSET_S3_*` variables are set | yes | yes |

`resolveAssetStore(env)` picks between them, shaped deliberately like `resolveGenerator(env)` so no caller knows which answered. One difference matters: **partial configuration is a hard error**, not a fallback. An absent image key degrades to a visible placeholder, but an absent asset store would degrade to imagery that silently disappears on the next deploy — so three of the four S3 variables throws `incomplete_configuration` naming the missing variables (names only, never values).

`S3AssetStore` speaks the S3 REST API directly, signing SigV4 with `node:crypto`. No SDK was added, for the same reason `OpenAIImageGenerator` uses plain `fetch`: two verbs do not justify a dependency. It uses path-style addressing, so R2, S3, Backblaze B2 and MinIO all work against the same code. Redirects are deliberately **not** followed — following one would replay the `Authorization` header at whatever host the redirect names — and a plaintext `http://` endpoint is refused outright rather than signed into the clear.

**The media trust boundary is unchanged by any of this.** `urlFor` still returns `/ithinq/generated/<id>`, never a bucket URL and never a presigned one. Generated bytes are always delivered from the renderer's own origin under `nosniff` and `Cross-Origin-Resource-Policy: same-origin`, so making storage durable authorises no new media host and a CTA destination still cannot be confused with an image source. A read fault is a 502 with no body rather than a 404, so a store misconfiguration cannot masquerade as a missing image.

A Render persistent disk mounted at `RENDERER_ASSET_DIR` is the smaller change and needs no new code path, at the cost of pinning the service to one instance. Both options are written out, commented, in `render.yaml`.

**One consequence durability introduces: stored objects accumulate and nothing collects them.** Interpretation runs at temperature 0.4, so the same brief can choose a different creative direction, which changes the image prompt and therefore the content-addressed id. Two live runs of the identical flagship brief during this phase produced two entirely different campaigns — *"Capture Every Call"* and *"Keep the Connection Alive"* — and four PNGs rather than two. While storage was ephemeral this only wasted money; with a durable store it also grows without bound. Pinning `creativeDirection` for any hot path remains the right fix, and a lifecycle rule on the bucket is the cheap backstop. Neither is a blocker, and neither is in this phase.

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

Campaign authoring runs **off the request thread**. A campaign takes 77-120 seconds, which is fine work and terrible HTTP: it holds a connection open with zero bytes written, at the mercy of every proxy idle timeout between the reader and the process, and gives the reader no way to tell "still writing" from "hung".

| Route | Purpose |
|---|---|
| `POST /ithinq/campaign-jobs` | Submit a brief. Returns a job immediately: 202 accepted, 200 when reused |
| `GET /ithinq/campaign-jobs` | Queue depth, so back pressure is visible before it is hit |
| `GET /ithinq/campaign-jobs/:id` | Poll one job: status, timings, and the full result once it succeeds |
| `GET /ithinq/campaign-preview?job=<id>` | The finished page, compiled from a completed job. Fast |
| `GET /ithinq/campaign?brief=…&spec=…` | Studio UI: submits a job and polls it |
| `GET /ithinq/campaign-preview?brief=…&spec=…` | Synchronous fallback: runs the pipeline inline. Two minutes. Script-only |
| `GET /ithinq/generated/:id` | Generated image bytes |
| `GET /api/health` | Liveness |

Properties of the queue that are load-bearing rather than incidental:

- **Job ids are content-addressed**, exactly like asset ids. Two readers asking the same question of the same document get one job and one model bill. `{"fresh": true}` opts out for a reader who deliberately wants another pass — interpretation runs at temperature 0.4, so a re-run is a genuinely different campaign rather than a retry.
- **Concurrency is capped** (default 2). Each job is a `gpt-4o` interpretation, an authoring pass, a claim audit and up to two `gpt-image-1` renders, so the cap is a spend and rate-limit boundary before it is a CPU one.
- **The queue applies back pressure**, returning 429 rather than growing without limit.
- **Records expire** (default 30 minutes) and are capped, so a long-lived process does not grow without bound.
- **A job that outruns its deadline is reported as failed but keeps its slot** until the underlying pipeline actually settles. Releasing the slot early would let concurrency drift above the cap that bounds spend. The real bound on a hang is the per-call timeout inside each provider; the deadline is a backstop for the sum of them.
- **The studio no longer blocks.** Its loader used to call `runCampaign` inline, so every visit was a two-minute navigation with a blank screen. It now returns immediately and the browser submits and polls.

**Scope, stated plainly:** job records live in the process. One Render web service is one process, so this is complete for the deployment that exists. It is not complete for two instances, where a poll could land on the instance that did not run the job — that needs a shared record store behind the same submit/get shape. The durable half (imagery) is already shared once an object store is configured.

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

## What the first real deploy exposed

Two defects that only a real Render build could surface. Both were in the merged blueprint, and neither could have been caught locally: they are artifacts of *where* Render puts the environment, not of the code.

**Render applies service environment variables to the build, not just the runtime.** `NODE_ENV=production` therefore reached `pnpm install`, which skipped `devDependencies`. The first build died 20 seconds in:

```
devDependencies: skipped because NODE_ENV is set to production
> husky
sh: 1: husky: not found
 ELIFECYCLE  Command failed.
```

The husky `prepare` script was only the first thing to break. `vite`, `@remix-run/dev` (which *runs* the build) and `@remix-run/serve` (which *runs* the start command) are all `devDependencies` too, so the build and the start command could not have succeeded either. `pnpm install --frozen-lockfile --prod=false` is now load-bearing and commented as such in `render.yaml`.

**A git-hook installer could fail a deploy.** `HUSKY=0` is now set. Hooks have no purpose on a build machine, and nothing that irrelevant should be able to gate a release.

The 8GB build heap was *not* the problem, contrary to the risk flagged before the first attempt. The corrected build reached `live` in ~220s.

**This was also the first Linux production build to pass in its real target environment.** The repo is developed on Windows, and its `node_modules` there carries win32-only rollup/esbuild binaries. Render built it on Linux from a clean clone with `pnpm install --frozen-lockfile --prod=false`: the Linux native binaries resolved, the bundle built, and the production Node server (`remix-serve`) came up and bound Render's `PORT` on all interfaces. `remix-serve` reads `PORT` (`cli.js:65`) and calls `app.listen(port, onListen)` with no host (`cli.js:142`), which binds every interface -- so no `HOST` variable is needed and none is set.

## Live verification, against the deployed service (before the key was set)

Measured against https://ithinq-bolt-renderer.onrender.com after the first successful deploy reached `live`, while `OPENAI_API_KEY` was still unset. Kept because it is the record of how the engine behaves *without* a key -- which is a supported mode, not just a stepping stone. The post-key run is in the next section; all guard results below were re-verified there and still hold.

| Route | Result |
|---|---|
| `/api/health` | 200 `{"status":"healthy","timestamp":...}` |
| `/` | 200 |
| `/ithinq/pagespec` | 200 |
| `/favicon.svg` | 200 |
| `/ithinq/campaign-preview` | 200, 22,048 bytes, full campaign rendered |
| `/ithinq/generated/:id` | 200 `image/svg+xml` |
| `/ithinq/generated/not-hex` | 404 |
| `/ithinq/generated/../../package.json` | 404, sent with `curl --path-as-is` so the traversal reached the server literally rather than being collapsed by the client |
| `/ithinq/generated/ZZZZZZZZ` | 404 |
| `/api/check-env-key?provider=OpenAI` | 200 `{"isSet":false}` |

The traversal guard is `/^[0-9a-f]{8,64}$/` in `asset-store.ts:67`, checked before the filesystem is touched.

**At this point the engine was running in its degraded mode, and degrading exactly as designed.** With no `OPENAI_API_KEY` on the service, `check-env-key` reported `isSet:false`, the headline is the document's own copy (*"iThinq AI Voice Assistant for med spas"*) rather than authored copy, and imagery is served as placeholder SVG rather than `gpt-image-1` PNGs. Nothing 404s and nothing crashes -- the placeholder assets are content-addressed and served back correctly. That `isSet:false` also proves `process.env` reaches the server loaders, which is the thing the Cloudflare-to-Node migration was for.

`OPENAI_API_KEY` has since been set on the service (it is `sync: false` in the blueprint, so Render prompts for it and stores it in the service environment) and a live campaign has been run -- see below.

## Live production smoke test

One controlled request through the deployed service on 2026-08-31, after `OPENAI_API_KEY` was set and the service redeployed to pick it up.

**Setting the variable is not enough — the running process must be restarted.** With the key saved on the service but no new deploy, `/api/check-env-key?provider=OpenAI` still reported `{"isSet":false}`: the live process had been started before the variable existed. A deploy from `main` fixed it, and the same endpoint then reported `{"isSet":true}`.

| | |
|---|---|
| Request | `GET /ithinq/campaign-preview` (no params, so `DEFAULT_BRIEF` -- the flagship med-spa campaign) |
| Result | **200**, 23,704 bytes, `text/html; charset=utf-8` |
| Wall time | **120.1s**, not cut off |
| Headline | *"Elegant communication for your med spa"* -- authored. The no-key run produced *"iThinq AI Voice Assistant for med spas"*, the document's own copy |
| Imagery | 2 × `gpt-image-1` PNG, `1536×1024` and `1024×1536`, ~2.2MB each |
| Image serving | Both 200 `image/png`, valid PNG magic, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin` |
| Rendered content | Inspected visually: a med-spa reception desk and a practitioner with a client. Coherent, on-brief, not artefacts |
| Partner disclosure | Intact -- *"This page is shared by an independent iThinq AI Partner, who may be compensated if you become a customer."* |

Authored copy sampled across the page: *"Call handling with confidence"*, *"Designed with med spas in mind"*, *"Assurance with every call"*, *"Your questions, answered"*, *"Will it replace my staff?"*.

The whole pipeline therefore ran in production: brief → strategy → website facts → selection → `gpt-4o` authorship → guard → claim audit → asset planning → `gpt-image-1` → composition → served page and served bytes.

## Readiness

Deployed, and smoke-tested end to end against the real models. `OPENAI_API_KEY` is set on the service and a live `gpt-4o` + `gpt-image-1` campaign has been served. The two items that stood between this and Partner-facing use have both been addressed **in code**:

- **Durable storage for generated imagery** — was the one hard blocker. `S3AssetStore` and `resolveAssetStore` now exist, and a Render disk works through `RENDERER_ASSET_DIR` with no code path of its own. What remains is a *configuration* decision, not an engineering one: pick Option A or Option B in `render.yaml`, supply the values, and redeploy. **Until that is done the deployed service is still writing to ephemeral `.data/`** and imagery still does not survive a redeploy.
- **The two-minute synchronous route** — was a robustness concern rather than a known breakage, since the live run returned 200 in 120.1s and the feared ~100s proxy cut did not occur. Authoring now runs behind a job queue, so no reader-facing request holds a connection for the duration.

`autoDeploy` is `no`: deploys are triggered deliberately, never by a push to `main`. Nothing in this phase has been deployed; the live service continues to run the previous build.

`autoDeploy` is `no`: deploys are triggered deliberately, never by a push to `main`.
