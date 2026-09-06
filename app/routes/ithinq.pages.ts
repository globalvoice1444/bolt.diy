import { createHash } from 'node:crypto';
import { json, type ActionFunctionArgs } from '@remix-run/node';
import { authoriseServiceRequest } from '~/lib/ithinq/creative-ai/service-auth';
import { getRuntimeEnv } from '~/lib/ithinq/runtime-env';
import { compilePageSpecToProjectManifest, PAGESPEC_COMPILER_VERSION } from '~/lib/ithinq/pagespec/compiler';
import { normalisePageRequest, PageRequestError } from '~/lib/ithinq/pagespec/page-request';
import { PageSpecValidationError } from '~/lib/ithinq/pagespec/validator';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** The same ceiling `/ithinq/pagespec-preview` applies. */
const MAX_BODY_BYTES = 512 * 1024;

/**
 * Compile a PageSpec into a finished landing page for another service.
 *
 * The integration seam for pages, and the counterpart to `/ithinq/visuals`.
 * The caller owns the campaign: it holds the PageSpec, the Partner identity,
 * the referral destinations and the disclosure, and it stores whatever comes
 * back. This service owns only presentation.
 *
 * The HTML is returned as a JSON string field rather than as an HTML response
 * on purpose. The consumer stores the document and serves it from its own
 * origin under its own Content-Security-Policy; handing it a `text/html`
 * response would invite proxying this endpoint to a browser, which would put a
 * service credential on the far side of a page load.
 *
 * Machine-to-machine only, and guarded by the same shared-secret bearer token
 * as `/ithinq/visuals`. The demo surfaces at `/ithinq/pagespec*` stay
 * unauthenticated and keep serving only the committed fixture.
 *
 * REQUEST
 *   POST /ithinq/pages
 *   Authorization: Bearer <RENDERER_SERVICE_TOKEN>
 *   Content-Type: application/json
 *   {
 *     "spec":  <PageSpec 1.1 document>,          // required
 *     "direction": "clinical-calm",              // optional; unknown is ignored
 *     "creative": {                              // optional, presentation only
 *       "mood": "luxury, restrained",            //   <= 120 chars
 *       "intensity": "measured",                 //   <= 120 chars
 *       "artDirection": "free prose",            //   <= 600 chars
 *       "imageryLevel": "none" | "light" | "rich",
 *       "seed": "concept-2"                      //   <= 120 chars
 *     },
 *     "generatedMedia": [                        // optional, <= 24 entries
 *       { "assetNeedId": "hero", "url": "...", "alt": "..." }
 *     ]
 *   }
 *
 * RESPONSE 200
 *   {
 *     "html": "<!doctype html>…",
 *     "direction": "clinical-calm",
 *     "designSeed": "…",
 *     "rendererVersion": "ithinq-pagespec-renderer/0.3.0",
 *     "contentHash": "<sha256 hex of html>",
 *     "validation": { "degraded": false, "skippedSections": [] }
 *   }
 *
 * ERRORS
 *   401 unauthorised                 — missing, malformed or wrong credential
 *   405 method_not_allowed           — anything but POST, with `Allow: POST`
 *   413 pagespec_too_large           — body over 512 KB
 *   415 unsupported_media_type       — not application/json
 *   400 invalid_json | invalid_request | missing_spec
 *       | invalid_creative | invalid_generated_media
 *   422 pagespec_not_renderable      — carries the validation findings
 *   503 service_auth_unconfigured    — no token configured on this deployment
 *
 * Every response carries `Cache-Control: no-store`. No response echoes the
 * bearer token, the submitted document, or any caller content.
 */
function jsonError(status: number, code: string, detail: string): Response {
  return json({ error: { code, detail } }, { status, headers: NO_STORE });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json(
      { error: { code: 'method_not_allowed', detail: 'Use POST.' } },
      {
        status: 405,
        headers: { ...NO_STORE, Allow: 'POST' },
      },
    );
  }

  const env = getRuntimeEnv(context);
  const auth = authoriseServiceRequest(request, env);

  if (!auth.ok) {
    return jsonError(auth.status, auth.code, auth.detail);
  }

  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return jsonError(415, 'unsupported_media_type', 'Send the request as application/json.');
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);

  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonError(413, 'pagespec_too_large', `The request exceeds the ${MAX_BODY_BYTES}-byte limit.`);
  }

  const raw = await request.text();

  /* A declared length can lie, so the real one is measured after reading. */
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return jsonError(413, 'pagespec_too_large', `The request exceeds the ${MAX_BODY_BYTES}-byte limit.`);
  }

  let body: unknown;

  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError(400, 'invalid_json', 'The request body is not valid JSON.');
  }

  let input: ReturnType<typeof normalisePageRequest>;

  try {
    input = normalisePageRequest(body);
  } catch (error) {
    if (error instanceof PageRequestError) {
      return jsonError(400, error.code, error.message);
    }

    throw error;
  }

  try {
    const { manifest, validation, plan } = compilePageSpecToProjectManifest(input.spec, {
      direction: input.direction,
      creative: input.creative,
      generatedMedia: input.generatedMedia,
    });

    const html = manifest.files['/index.html'] ?? '';

    return json(
      {
        html,
        direction: plan.directionId,
        designSeed: plan.design.seed,
        rendererVersion: PAGESPEC_COMPILER_VERSION,
        contentHash: createHash('sha256').update(html, 'utf8').digest('hex'),
        validation: {
          degraded: validation.findings.length > 0 || validation.skipSections.length > 0,
          skippedSections: validation.skipSections,
        },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof PageSpecValidationError) {
      /*
       * The findings are the caller's own document described back to it, which
       * is the one kind of detail this endpoint may return: it is what makes a
       * 422 fixable rather than merely a refusal.
       */
      return json(
        {
          error: {
            code: 'pagespec_not_renderable',
            detail: error.message,
            validation: error.validation,
          },
        },
        { status: 422, headers: NO_STORE },
      );
    }

    throw error;
  }
}

/** No loader. There is nothing here to read, and GET must not imply one. */
export async function loader() {
  return json(
    { error: { code: 'method_not_allowed', detail: 'Use POST.' } },
    {
      status: 405,
      headers: { ...NO_STORE, Allow: 'POST' },
    },
  );
}
