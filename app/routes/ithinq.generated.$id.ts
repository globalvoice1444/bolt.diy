import type { LoaderFunctionArgs } from '@remix-run/node';
import { devAssetStore } from '~/lib/ithinq/creative-ai';

/**
 * Deliver generated media from the renderer's own origin.
 *
 * This is the media trust path, deliberately separate from navigation trust.
 * Serving generated creative from the renderer origin means no third-party
 * media host has to be authorised at all, and it can never be confused with a
 * CTA destination.
 *
 * `Cross-Origin-Resource-Policy: same-origin` keeps it embeddable inside the
 * cross-origin-isolated preview; `nosniff` and an explicit content type stop
 * the bytes being reinterpreted as anything else.
 */
export async function loader({ params }: LoaderFunctionArgs) {
  const id = params.id ?? '';
  const asset = await devAssetStore.get(id);

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
