import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loader } from '~/routes/ithinq.generated.$id';
import { loader as previewLoader } from '~/routes/ithinq.pagespec-preview';
import { FileSystemAssetStore } from './asset-store';

/*
 * Delivery of generated media, as a browser actually experiences it.
 *
 * THE PRODUCTION FAILURE THIS PINS. The route sent
 * `Cross-Origin-Resource-Policy: same-origin`, so an `<img>` on
 * partners.ithinq.ai completed the request — HTTP 200, `image/png`, bytes on
 * the wire — and the browser then discarded the body, leaving a broken image
 * on the page while the identical URL rendered perfectly in a tab. CORP is
 * enforced against the embedder; a top-level navigation is not an embed, which
 * is why every direct check said the asset was healthy.
 *
 * These assertions are about HEADERS rather than bytes, because the bytes were
 * never the problem and a test that only proved "200 with a PNG body" would
 * have passed throughout the outage.
 */

const VALID_ID = 'a'.repeat(32);

/* An 8-byte PNG signature is enough: nothing here decodes the image. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type LoaderArgs = Parameters<typeof loader>[0];

let directory = '';

function request(id: string): LoaderArgs {
  return {
    params: { id },
    request: new Request(`https://renderer.test/ithinq/generated/${id}`),

    /*
     * The route reads its store from the runtime environment and nowhere else,
     * so pointing that at a temp directory exercises the real resolution path.
     */
    context: { cloudflare: { env: { RENDERER_ASSET_DIR: directory } } },
  } as unknown as LoaderArgs;
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ithinq-generated-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('generated asset delivery', () => {
  it('lets an approved consumer embed the image cross-origin', async () => {
    await new FileSystemAssetStore(directory).put(VALID_ID, 'image/png', PNG);

    const response = await loader(request(VALID_ID));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');

    /*
     * The fix. `same-origin` here is what broke a Partner's campaign: the
     * request succeeds and the browser throws the body away.
     */
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');

    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
  });

  it('keeps every other protection on that response exactly as it was', async () => {
    await new FileSystemAssetStore(directory).put(VALID_ID, 'image/png', PNG);

    const response = await loader(request(VALID_ID));

    // Inert for an <img>, real on direct navigation — see the route's comment.
    expect(response.headers.get('Content-Security-Policy')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  it('still answers a missing asset with a plain 404 and no caching', async () => {
    const response = await loader(request('b'.repeat(32)));

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    // The permissive policy rides on a delivered image, never on a refusal.
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBeNull();
  });

  it('refuses an id that is not an id, rather than letting it reach a path', async () => {
    for (const id of ['../../etc/passwd', '..%2f..%2fsecret', 'a/b', 'A'.repeat(32), 'abc', '']) {
      const response = await loader(request(id));

      expect(response.status).toBe(404);
      expect(response.headers.get('Cross-Origin-Resource-Policy')).toBeNull();
    }
  });

  it('does not weaken CORP anywhere else — the preview document stays same-origin', () => {
    /*
     * The scope check. Only delivered media may be embedded off-origin; a
     * preview DOCUMENT must not be, and it keeps the isolation it had. If a
     * future change relaxes CORP globally instead of on this one route, this
     * fails.
     */
    const preview = previewLoader({
      request: new Request('https://renderer.test/ithinq/pagespec-preview'),
    } as unknown as Parameters<typeof previewLoader>[0]);

    expect(preview.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(preview.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
  });
});
