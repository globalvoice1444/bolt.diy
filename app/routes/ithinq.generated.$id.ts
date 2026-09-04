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
 * `Cross-Origin-Resource-Policy: cross-origin` is what lets an approved
 * consumer embed the picture at all, and it was `same-origin` until a Partner
 * Network campaign proved why that is wrong. CORP is enforced against the
 * EMBEDDER, whatever the embedder's own policy is: with `same-origin`, an
 * `<img>` on another origin completes the request — 200, `image/png`, real
 * bytes on the wire — and the browser then discards the body, so the page
 * shows a broken image while the same URL opens perfectly in a tab. A
 * top-level navigation is not an embed, which is exactly why direct viewing
 * kept suggesting the asset was fine.
 *
 * This does NOT weaken the cross-origin isolation this route was serving.
 * `require-corp` demands that a subresource carry a CORP header permitting its
 * embedder, and `cross-origin` satisfies that for the same-origin preview
 * exactly as `same-origin` did — it additionally permits other origins, which
 * is the entire point of serving generated media publicly. The isolation on
 * the DOCUMENT responses is untouched: `app/entry.server.tsx` still sends
 * `require-corp`, and the PageSpec preview in `pagespec/runtime.ts` still
 * sends CORP `same-origin`, because a preview document has no business being
 * embedded anywhere else.
 *
 * What is deliberately unchanged: `nosniff` and an explicit content type stop
 * the bytes being reinterpreted as anything else, and the response's own CSP
 * (`default-src 'none'; style-src 'unsafe-inline'; sandbox`) is inert for an
 * `<img>` — a subresource has no execution context — but is real protection on
 * DIRECT NAVIGATION, where the browser does build a document for these bytes.
 * Model-generated media is precisely the content that should stay sandboxed
 * there, so it stays.
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
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',

      /* Content-addressed ids, so a hit is always the same bytes. */
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
