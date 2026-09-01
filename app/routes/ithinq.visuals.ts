import { json, type ActionFunctionArgs } from '@remix-run/node';
import { authoriseServiceRequest } from '~/lib/ithinq/creative-ai/service-auth';
import { normaliseVisualRequest, renderVisuals, VisualRequestError } from '~/lib/ithinq/creative-ai/visual-service';
import { AssetGenerationError } from '~/lib/ithinq/creative-ai/provider/types';
import { AssetStoreError } from '~/lib/ithinq/creative-ai/asset-store';
import { getRuntimeEnv } from '~/lib/ithinq/runtime-env';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Generate imagery for another service that owns its own campaign.
 *
 * The integration seam, and deliberately the narrowest one that works. It does
 * not author copy, does not read a PageSpec, and cannot reach the fixture
 * documents the reviewer surfaces use — so a caller's campaign can never come
 * back wearing this service's demo identity, referral destination or
 * disclosure. Those belong to the caller and are never sent here.
 *
 * Machine-to-machine only. Unlike every other route in this application it
 * spends money on a caller's behalf, so it is the one surface that requires a
 * credential.
 */
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, { status: 405, headers: { ...NO_STORE, Allow: 'POST' } });
  }

  const env = getRuntimeEnv(context);
  const auth = authoriseServiceRequest(request, env);

  if (!auth.ok) {
    return json({ error: auth.code, detail: auth.detail }, { status: auth.status, headers: NO_STORE });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_request', detail: 'Body must be JSON.' }, { status: 400, headers: NO_STORE });
  }

  try {
    const result = await renderVisuals(normaliseVisualRequest(body), { env });

    return json(result, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof VisualRequestError) {
      return json({ error: error.code, detail: error.message }, { status: 400, headers: NO_STORE });
    }

    if (error instanceof AssetGenerationError) {
      /*
       * 502: the fault is upstream of this service, and the caller should
       * retry rather than change its request. The provider's own message is
       * deliberately not forwarded — it can name models and quotas.
       */
      return json(
        { error: 'generation_failed', detail: 'Image generation failed.' },
        { status: 502, headers: NO_STORE },
      );
    }

    if (error instanceof AssetStoreError) {
      return json(
        { error: 'storage_unavailable', detail: 'Generated media could not be stored.' },
        { status: 502, headers: NO_STORE },
      );
    }

    throw error;
  }
}

/** No loader. There is nothing here to read, and GET must not imply one. */
export async function loader() {
  return json({ error: 'method_not_allowed' }, { status: 405, headers: { ...NO_STORE, Allow: 'POST' } });
}
