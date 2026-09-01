import { describe, expect, it } from 'vitest';
import { authoriseServiceRequest } from './service-auth';
import {
  MAX_DIRECTION_LENGTH,
  normaliseVisualRequest,
  renderVisuals,
  visualNeedFor,
  VisualRequestError,
} from './visual-service';
import { PlaceholderImageGenerator } from './provider/placeholder';
import { isAssetId, type AssetStore } from './asset-store';

function memoryStore() {
  const written = new Map<string, { mimeType: string; bytes: Uint8Array }>();
  const store: AssetStore = {
    async put(id, mimeType, bytes) {
      written.set(id, { mimeType, bytes });
    },
    async get(id) {
      const hit = written.get(id);

      return hit ? { id, ...hit } : null;
    },
    urlFor: (id) => `/ithinq/generated/${id}`,
  };

  return { written, store };
}

const headers = (value?: string) => ({ headers: new Headers(value ? { authorization: value } : {}) });

describe('service authentication', () => {
  const env = { RENDERER_SERVICE_TOKEN: 'a-service-token' };

  it('accepts the configured credential', () => {
    expect(authoriseServiceRequest(headers('Bearer a-service-token'), env)).toEqual({ ok: true });
  });

  it('refuses a missing, malformed or wrong credential identically', () => {
    for (const value of [undefined, 'a-service-token', 'Basic a-service-token', 'Bearer wrong', 'Bearer ']) {
      const result = authoriseServiceRequest(headers(value), env);

      expect(result.ok, `accepted ${String(value)}`).toBe(false);

      if (!result.ok) {
        expect(result.status).toBe(401);

        // One message for every rejection: never say which part was wrong.
        expect(result.detail).toBe('A valid service credential is required.');
      }
    }
  });

  it('fails CLOSED when no token is configured, rather than opening a paid endpoint', () => {
    const result = authoriseServiceRequest(headers('Bearer anything'), { RENDERER_SERVICE_TOKEN: '' });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.code).toBe('service_auth_unconfigured');
    }
  });

  it('never puts the expected secret in the response detail', () => {
    const result = authoriseServiceRequest(headers('Bearer wrong'), env);

    expect(JSON.stringify(result)).not.toContain('a-service-token');
  });
});

describe('visual request validation', () => {
  it('requires a direction and bounds everything a caller can send', () => {
    expect(() => normaliseVisualRequest(null)).toThrow(VisualRequestError);
    expect(() => normaliseVisualRequest({})).toThrow(VisualRequestError);
    expect(() => normaliseVisualRequest({ direction: '   ' })).toThrow(VisualRequestError);
    expect(() => normaliseVisualRequest({ direction: 'x'.repeat(MAX_DIRECTION_LENGTH + 1) })).toThrow(
      VisualRequestError,
    );
    expect(() => normaliseVisualRequest({ direction: 'ok', aspectRatio: '21:9' })).toThrow(VisualRequestError);
    expect(() => normaliseVisualRequest({ direction: 'ok', mood: 'chaotic' })).toThrow(VisualRequestError);
    expect(() => normaliseVisualRequest({ direction: 'ok', count: 9 })).toThrow(VisualRequestError);
    expect(() => normaliseVisualRequest({ direction: 'ok', count: 0 })).toThrow(VisualRequestError);
    expect(() => normaliseVisualRequest({ direction: 'ok', mustAvoid: 'text' })).toThrow(VisualRequestError);
  });

  it('accepts a caller brief and defaults the rest', () => {
    expect(normaliseVisualRequest({ direction: 'A calm clinic reception' })).toMatchObject({
      direction: 'A calm clinic reception',
      aspectRatio: '1:1',
      mood: 'refined',
      count: 1,
      mustAvoid: [],
    });
  });

  it('accepts snake_case as well, so a non-JS caller need not translate', () => {
    expect(normaliseVisualRequest({ direction: 'x', aspect_ratio: '4:5', must_avoid: ['logos'] })).toMatchObject({
      aspectRatio: '4:5',
      mustAvoid: ['logos'],
    });
  });
});

describe('the visual path carries the caller brief and nothing of ours', () => {
  it('puts the caller direction into the need verbatim', () => {
    const need = visualNeedFor(
      { direction: 'Two colleagues reviewing a schedule', audience: 'clinic owners', mustAvoid: ['screens'] },
      0,
    );

    expect(need.subject).toContain('Two colleagues reviewing a schedule');
    expect(need.subject).toContain('screens');
    expect(need.context).toContain('clinic owners');
    expect(need.altIntent).toBe('Two colleagues reviewing a schedule');
  });

  it('CANNOT leak fixture identity, disclosure or destination into a caller result', async () => {
    const { store } = memoryStore();
    const result = await renderVisuals(
      { direction: 'A quiet treatment room', count: 1 },
      { generator: new PlaceholderImageGenerator(), store },
    );

    const serialised = JSON.stringify(result);

    // The demo fixtures' identity must never appear on a caller's asset.
    expect(serialised).not.toContain('Example Partner');
    expect(serialised).not.toContain('ithinq.ai/?ref=');
    expect(serialised).not.toContain('Med Spa');

    // And nothing in the result is copy, a claim or a destination.
    expect(Object.keys(result.assets[0]!).sort()).toEqual(
      ['alt', 'height', 'id', 'mimeType', 'model', 'provider', 'synthetic', 'url', 'width'].sort(),
    );
  });

  it('stores each asset and addresses it the way every other asset is addressed', async () => {
    const { written, store } = memoryStore();
    const result = await renderVisuals(
      { direction: 'A calm reception desk', count: 2 },
      { generator: new PlaceholderImageGenerator(), store },
    );

    expect(result.assets).toHaveLength(2);

    for (const asset of result.assets) {
      expect(isAssetId(asset.id)).toBe(true);
      expect(asset.url).toBe(`/ithinq/generated/${asset.id}`);
      expect(written.has(asset.id)).toBe(true);
    }
  });

  it('reuses stored bytes for an identical brief instead of paying twice', async () => {
    const { written, store } = memoryStore();
    let generated = 0;
    const counting = new PlaceholderImageGenerator();
    const wrapped = {
      ...counting,
      provider: counting.provider,
      model: counting.model,
      synthetic: counting.synthetic,
      generate: async (request: Parameters<typeof counting.generate>[0]) => {
        generated += 1;

        return counting.generate(request);
      },
    };

    const brief = { direction: 'A calm reception desk', count: 1 };
    const first = await renderVisuals(brief, { generator: wrapped, store });
    const second = await renderVisuals(brief, { generator: wrapped, store });

    expect(generated).toBe(1);
    expect(second.assets[0]!.id).toBe(first.assets[0]!.id);
    expect(written.size).toBe(1);
  });
});
