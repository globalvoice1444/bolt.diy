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
import { buildImagePrompt } from './prompt';
import { noOverlayVerifier } from './overlay-verify';
import type { CreativeStrategy } from './strategy';
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

const STRATEGY: CreativeStrategy = {
  strategyVersion: 1,
  objective: 'test',
  narrativeAngle: 'situation-first',
  visualMood: 'refined',
  directionId: 'editorial-luxe',
  copyStyle: 'editorial',
  imageStrategy: 'supporting',
  pageDensity: 'comfortable',
  ctaIntensity: 'balanced',
  emphasisSectionIndices: [],
  rationale: [],
};

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

/*
 * Designed advertising (ad-creative contract).
 *
 * The property under test throughout: supplying approved words switches this
 * service from photographic discipline to designed advertising, and supplying
 * none leaves the previous behaviour untouched to the character.
 */
describe('the ad-creative contract', () => {
  const overlay = {
    headline: 'Your next patient just hung up',
    offer: 'First month free',
    brand: 'Bright Smile Dental',
  };

  it('leaves the photographic path byte-identical when no words are supplied', () => {
    const need = visualNeedFor(normaliseVisualRequest({ direction: 'an empty reception desk at 12:40' }), 0);
    const prompt = buildImagePrompt(need, STRATEGY);

    // The truth control that predates this feature, still intact.
    expect(prompt).toContain('commercial photograph');
    expect(prompt).toContain('deliberately blank and unbranded');
    expect(prompt).toContain('no text');
    expect(prompt).toContain('no lettering');
    expect(need.overlay).toBeUndefined();
  });

  it('renders approved words and forbids every other word', () => {
    const need = visualNeedFor(
      normaliseVisualRequest({
        direction: 'an empty reception desk at 12:40',
        overlay,
        creativeType: 'offer_led',
        creativeDirection: 'Bold poster energy. The offer dominates. Photography reduced to texture behind the type.',
      }),
      0,
    );
    const prompt = buildImagePrompt(need, STRATEGY);

    // Each approved string reaches the renderer verbatim.
    expect(prompt).toContain('Your next patient just hung up');
    expect(prompt).toContain('First month free');
    expect(prompt).toContain('Bright Smile Dental');

    // The blanket suppression lifts...
    expect(prompt).not.toContain('deliberately blank and unbranded');
    expect(prompt).toContain('designed advertisement');

    // ...but inventing words, prices or percentages does not become allowed.
    expect(prompt).toContain('Do not add ANY other text');
    expect(prompt).toContain('prices');
    expect(prompt).toContain('percentages');

    // The caller's prose steers the design; no layout is prescribed.
    expect(prompt).toContain('Bold poster energy');
    expect(prompt).toContain('yours to decide');
  });

  it('bounds each overlay field without policing its tone', () => {
    // Aggressive, shouty, punctuation-heavy copy is entirely acceptable.
    expect(() =>
      normaliseVisualRequest({
        direction: 'd',
        overlay: { headline: 'YOUR NEXT $5,000 PATIENT JUST HUNG UP!!!' },
      }),
    ).not.toThrow();

    expect(() => normaliseVisualRequest({ direction: 'd', overlay: { cta: 'x'.repeat(61) } })).toThrow(
      VisualRequestError,
    );

    expect(() => normaliseVisualRequest({ direction: 'd', overlay: 'nope' })).toThrow(VisualRequestError);
  });

  it('treats an overlay of only empty strings as no overlay at all', () => {
    const request = normaliseVisualRequest({ direction: 'd', overlay: { headline: '   ' } });

    expect(request.overlay).toBeUndefined();
    expect(request.groundedFields).toEqual([]);
  });

  it('accepts snake_case for the new fields too', () => {
    const request = normaliseVisualRequest({
      direction: 'd',
      overlay,
      grounded_fields: ['offer'],
      creative_type: 'premium',
      creative_direction: 'Luxury editorial.',
    });

    expect(request.groundedFields).toEqual(['offer']);
    expect(request.creativeType).toBe('premium');
    expect(request.creativeDirection).toBe('Luxury editorial.');
  });

  it('refuses a grounded field that is not an overlay field', () => {
    expect(() => normaliseVisualRequest({ direction: 'd', overlay, groundedFields: ['referral_url'] })).toThrow(
      VisualRequestError,
    );
  });

  it('drops a grounded field the overlay does not carry, rather than refusing', () => {
    const request = normaliseVisualRequest({
      direction: 'd',
      overlay: { headline: 'Only a headline' },
      groundedFields: ['offer'],
    });

    expect(request.groundedFields).toEqual([]);
  });

  it('never verifies when nothing is marked grounded', async () => {
    const { store } = memoryStore();
    let calls = 0;
    const verifier = {
      available: true,
      async verify() {
        calls += 1;

        return { checked: [], mismatched: [], skipped: false };
      },
    };

    const result = await renderVisuals(normaliseVisualRequest({ direction: 'a desk', overlay }), {
      generator: new PlaceholderImageGenerator(),
      store,
      verifier,
    });

    // No grounded fact, no vision call, no cost.
    expect(calls).toBe(0);
    expect(result.assets[0].verification).toBeUndefined();
  });

  it('reads a grounded string back and reports it when it survives', async () => {
    const { store } = memoryStore();
    const verifier = {
      available: true,
      async verify() {
        return { checked: ['offer' as const], mismatched: [], skipped: false };
      },
    };

    const result = await renderVisuals(
      normaliseVisualRequest({ direction: 'a desk', overlay, groundedFields: ['offer'] }),
      { generator: new PlaceholderImageGenerator(), store, verifier },
    );

    expect(result.assets[0].verification).toEqual({ checked: ['offer'], mismatched: [], skipped: false });
  });

  it('makes one corrective attempt when a grounded string is corrupted, and reports the outcome', async () => {
    const { store } = memoryStore();
    let attempt = 0;
    const verifier = {
      available: true,
      async verify() {
        attempt += 1;

        return attempt === 1
          ? { checked: ['offer' as const], mismatched: ['offer' as const], skipped: false }
          : { checked: ['offer' as const], mismatched: [], skipped: false };
      },
    };

    const result = await renderVisuals(
      normaliseVisualRequest({ direction: 'a desk', overlay, groundedFields: ['offer'] }),
      { generator: new PlaceholderImageGenerator(), store, verifier },
    );

    expect(attempt).toBe(2);
    expect(result.assets[0].verification?.mismatched).toEqual([]);
  });

  it('returns the creative with an honest warning rather than silently altering it', async () => {
    const { store } = memoryStore();
    let attempt = 0;
    const verifier = {
      available: true,
      async verify() {
        attempt += 1;

        return { checked: ['offer' as const], mismatched: ['offer' as const], skipped: false };
      },
    };

    const result = await renderVisuals(
      normaliseVisualRequest({ direction: 'a desk', overlay, groundedFields: ['offer'] }),
      { generator: new PlaceholderImageGenerator(), store, verifier },
    );

    // Two attempts, then the truth: an asset, and what is still wrong with it.
    expect(attempt).toBe(2);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].verification?.mismatched).toEqual(['offer']);
  });

  it('never lets an unavailable verifier fail a render the caller has paid for', async () => {
    const { store } = memoryStore();

    const result = await renderVisuals(
      normaliseVisualRequest({ direction: 'a desk', overlay, groundedFields: ['offer'] }),
      { generator: new PlaceholderImageGenerator(), store, verifier: noOverlayVerifier },
    );

    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].verification?.skipped).toBe(true);
  });
});
