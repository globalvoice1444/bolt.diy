import { describe, expect, it, vi } from 'vitest';
import examplePageSpec from '@ithinq-pagespec/page-spec.example.json';
import type { PageSpec } from '@ithinq-pagespec/page-spec';
import { normaliseCreativeRequest } from './request';
import { deriveCreativeStrategy } from './strategy';
import { planAssetNeeds } from './asset-need';
import { buildImagePrompt } from './prompt';
import { orchestrateCreative, resolveGenerator } from './orchestrator';
import { OpenAIImageGenerator, OPENAI_IMAGE_MODEL } from './provider/openai';
import { PlaceholderImageGenerator } from './provider/placeholder';
import { AssetGenerationError, type CreativeAssetGenerator } from './provider/types';
import type { AssetStore, StoredAsset } from './asset-store';

function fixture(): PageSpec {
  return JSON.parse(JSON.stringify(examplePageSpec)) as PageSpec;
}

class MemoryStore implements AssetStore {
  readonly items = new Map<string, StoredAsset>();

  async put(id: string, mimeType: string, bytes: Uint8Array) {
    this.items.set(id, { id, mimeType, bytes });
  }

  async get(id: string) {
    return this.items.get(id) ?? null;
  }

  urlFor(id: string) {
    return `/ithinq/generated/${id}`;
  }
}

const MED_SPA = 'Create a premium Med Spa landing page. Make it elegant, modern, image-forward and high-converting.';

describe('creative request', () => {
  it('reads tone, imagery and goal from plain language', () => {
    const request = normaliseCreativeRequest({ userInstruction: MED_SPA });

    expect(request.tone).toBe('elegant');
    expect(request.imagePreference).toBe('image-forward');
    expect(request.vertical).toBe('med-spa');
    expect(request.conversionGoal).toBe('book-demo');
  });

  it('lets explicit fields win over inferred ones', () => {
    const request = normaliseCreativeRequest({
      userInstruction: MED_SPA,
      tone: 'bold',
      imagePreference: 'typographic',
    });

    expect(request.tone).toBe('bold');
    expect(request.imagePreference).toBe('typographic');
  });

  it('falls back to safe defaults and ignores unknown values', () => {
    const request = normaliseCreativeRequest({ tone: 'not-a-tone', creativeDirection: '../evil' });

    expect(request.tone).toBe('professional');
    expect(request.imagePreference).toBe('balanced');
    expect(request.creativeDirection).toBeNull();
  });

  it('is deterministic', () => {
    expect(normaliseCreativeRequest({ userInstruction: MED_SPA })).toEqual(
      normaliseCreativeRequest({ userInstruction: MED_SPA }),
    );
  });
});

describe('creative strategy and asset planning', () => {
  it('turns an image-forward request into a hero-led image strategy', () => {
    const strategy = deriveCreativeStrategy(fixture(), normaliseCreativeRequest({ userInstruction: MED_SPA }));

    expect(strategy.imageStrategy).toBe('led');
    expect(strategy.visualMood).toBe('refined');
    expect(strategy.rationale.length).toBeGreaterThan(2);
  });

  it('requests no imagery at all for a typography-first direction', () => {
    const spec = fixture();
    const strategy = deriveCreativeStrategy(
      spec,
      normaliseCreativeRequest({ userInstruction: 'Minimal typographic page, no images.' }),
    );

    expect(strategy.imageStrategy).toBe('none');
    expect(planAssetNeeds(spec, strategy)).toEqual([]);
  });

  it('plans a hero need plus supporting needs from authored emphasis', () => {
    const spec = fixture();
    const strategy = deriveCreativeStrategy(spec, normaliseCreativeRequest({ userInstruction: MED_SPA }));
    const needs = planAssetNeeds(spec, strategy);

    expect(needs[0]?.role).toBe('hero');
    expect(needs.length).toBeGreaterThan(1);
    expect(needs.every((need) => need.sectionAssociation === null || need.sectionAssociation >= 0)).toBe(true);
  });

  it('builds a context-rich prompt that knows its placement and forbids fabricated evidence', () => {
    const spec = fixture();
    const strategy = deriveCreativeStrategy(spec, normaliseCreativeRequest({ userInstruction: MED_SPA }));
    const prompt = buildImagePrompt(planAssetNeeds(spec, strategy)[0]!, strategy);

    expect(prompt).toContain('medical aesthetics');
    expect(prompt.length).toBeGreaterThan(240);
    expect(prompt).toMatch(/full-bleed|split/);
    expect(prompt).toContain('no logos');
    expect(prompt).toContain('no dashboards');
    expect(prompt).toContain('no before-and-after');
  });
});

describe('OpenAI provider', () => {
  const need = { id: 'hero', aspectRatio: '16:9' } as never;

  it('posts the expected model, size and prompt', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: btoa('png-bytes') }] }), { status: 200 }));
    const generator = new OpenAIImageGenerator({ apiKey: 'test-key', fetchImpl: fetchImpl as never });

    const result = await generator.generate({ need, prompt: 'a prompt', alt: 'alt' });

    expect(generator.model).toBe(OPENAI_IMAGE_MODEL);
    expect(result.mimeType).toBe('image/png');
    expect(result.width).toBe(1536);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/images/generations');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ model: OPENAI_IMAGE_MODEL, prompt: 'a prompt', size: '1536x1024', n: 1 });
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test-key' });
  });

  it('refuses to construct without a credential', () => {
    expect(() => new OpenAIImageGenerator({ apiKey: '' })).toThrow(AssetGenerationError);
  });

  it('classifies a provider error without leaking the credential', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 }));
    const generator = new OpenAIImageGenerator({ apiKey: 'secret-key', fetchImpl: fetchImpl as never });

    await expect(generator.generate({ need, prompt: 'p', alt: 'a' })).rejects.toMatchObject({
      code: 'provider_error',
    });

    await expect(generator.generate({ need, prompt: 'p', alt: 'a' })).rejects.not.toMatchObject({
      message: expect.stringContaining('secret-key'),
    });
  });

  it('rejects a response with no image payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{}] }), { status: 200 }));
    const generator = new OpenAIImageGenerator({ apiKey: 'k', fetchImpl: fetchImpl as never });

    await expect(generator.generate({ need, prompt: 'p', alt: 'a' })).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('selects OpenAI only when a real key is present', () => {
    /*
     * `resolveGenerator` deliberately falls back to the ambient process
     * environment, so this must be hermetic: without stubbing, the assertion
     * would pass or fail depending on whether the developer's machine happens
     * to have a key configured.
     */
    vi.stubEnv('OPENAI_API_KEY', '');

    try {
      expect(resolveGenerator({ OPENAI_API_KEY: 'sk-real-value' })).toBeInstanceOf(OpenAIImageGenerator);
      expect(resolveGenerator({ OPENAI_API_KEY: 'your_openai_api_key_here' })).toBeInstanceOf(
        PlaceholderImageGenerator,
      );
      expect(resolveGenerator({})).toBeInstanceOf(PlaceholderImageGenerator);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('falls back to the ambient server environment when no env is passed', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-ambient-value');

    try {
      expect(resolveGenerator()).toBeInstanceOf(OpenAIImageGenerator);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('orchestration', () => {
  const stubGenerator: CreativeAssetGenerator = {
    provider: 'stub',
    model: 'stub/1',
    synthetic: true,
    async generate() {
      return { bytes: new TextEncoder().encode('bytes'), mimeType: 'image/png', width: 1536, height: 1024 };
    },
  };

  it('runs request to stored assets end to end', async () => {
    const store = new MemoryStore();
    const run = await orchestrateCreative(fixture(), { userInstruction: MED_SPA }, { generator: stubGenerator, store });

    expect(run.needs.length).toBeGreaterThan(0);
    expect(run.assets.length).toBe(run.needs.length);
    expect(run.failures).toEqual([]);
    expect(store.items.size).toBe(run.assets.length);
    expect(run.assets[0]?.url).toMatch(/^\/ithinq\/generated\/[0-9a-f]+$/);
  });

  it('keeps an optional failure from destroying the page', async () => {
    const failing: CreativeAssetGenerator = {
      ...stubGenerator,
      async generate() {
        throw new AssetGenerationError('boom', 'provider_error', 'hero');
      },
    };
    const run = await orchestrateCreative(
      fixture(),
      { userInstruction: MED_SPA },
      { generator: failing, store: new MemoryStore() },
    );

    expect(run.assets).toEqual([]);
    expect(run.failures.length).toBeGreaterThan(0);
    expect(run.failures.every((failure) => failure.required === false)).toBe(true);
  });

  it('is content-addressed, so an identical run reuses stored bytes', async () => {
    const store = new MemoryStore();
    const first = await orchestrateCreative(
      fixture(),
      { userInstruction: MED_SPA },
      { generator: stubGenerator, store },
    );
    const size = store.items.size;
    const second = await orchestrateCreative(
      fixture(),
      { userInstruction: MED_SPA },
      { generator: stubGenerator, store },
    );

    expect(store.items.size).toBe(size);
    expect(second.assets.map((a) => a.id)).toEqual(first.assets.map((a) => a.id));
  });

  it('produces a usable development placeholder without a credential', async () => {
    const store = new MemoryStore();
    const run = await orchestrateCreative(
      fixture(),
      { userInstruction: MED_SPA },
      { generator: new PlaceholderImageGenerator(), store },
    );

    expect(run.synthetic).toBe(true);
    expect(run.assets.every((asset) => asset.generation.synthetic)).toBe(true);

    const stored = await store.get(run.assets[0]!.id);
    expect(new TextDecoder().decode(stored!.bytes)).toContain('not AI generated');
  });
});
