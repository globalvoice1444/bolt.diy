import type { LoaderFunctionArgs } from '@remix-run/node';
import { resolveAssetStore } from '~/lib/ithinq/creative-ai/asset-store-resolve';
import { getRuntimeEnv } from '~/lib/ithinq/runtime-env';

/**
 * Deliver generated media from the renderer's own origin.
 *
 * This is the media trust path, deliberately separate from navigation trust.
 * Serving generated creative from the renderer origin means no third-party
 * media host has to be authorised at all, and it can never be confused with a
 * CTA destination. That holds whether the bytes came off local disk or out of
 * an object store: the store is resolved here, and the URL a page embeds never
 * names it.
 *
 * `Cross-Origin-Resource-Policy: same-origin` keeps it embeddable inside the
 * cross-origin-isolated preview; `nosniff` and an explicit content type stop
 * the bytes being reinterpreted as anything else.
 */
export async function loader({ params, context }: LoaderFunctionArgs) {
  const id = params.id ?? '';

  let asset = null;

  try {
    asset = await resolveAssetStore(getRuntimeEnv(context)).get(id);
  } catch {
    /*
     * A store fault is not a missing asset, but it is not the reader's problem
     * either, and the detail could name infrastructure. 502 without a body.
     */
    return new Response('Asset store unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }

  if (!asset) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  return new Response(asset.bytes, {
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',

      /* Content-addressed ids, so a hit is always the same bytes. */
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
