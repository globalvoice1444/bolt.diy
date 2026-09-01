import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AssetStoreError, FileSystemAssetStore, isAssetId, type AssetStore } from './asset-store';
import { runCampaign } from './campaign';
import { demoSpec } from './demo-specs';
import { PlaceholderImageGenerator } from './provider/placeholder';
import { resolveAssetStore } from './asset-store-resolve';
import { S3AssetStore, amzDate, type S3AssetStoreOptions } from './s3-asset-store';

const CREDENTIALS = {
  endpoint: 'https://account.r2.cloudflarestorage.com',
  bucket: 'ithinq-generated',
  region: 'auto',
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'not-a-real-secret',
};

const FIXED_DATE = new Date('2026-08-31T12:00:00.000Z');
const VALID_ID = 'a'.repeat(32);

function stubFetch(response: Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });

    return response;
  }) as unknown as typeof fetch;

  return { calls, impl };
}

function store(response: Response, overrides: Partial<S3AssetStoreOptions> = {}) {
  const { calls, impl } = stubFetch(response);

  return {
    calls,
    subject: new S3AssetStore({ ...CREDENTIALS, ...overrides, fetchImpl: impl, now: () => FIXED_DATE }),
  };
}

describe('asset id discipline', () => {
  it('accepts a content-addressed digest and nothing else', () => {
    expect(isAssetId(VALID_ID)).toBe(true);
    expect(isAssetId('../../package.json')).toBe(false);
    expect(isAssetId('ZZZZZZZZ')).toBe(false);
    expect(isAssetId(`${VALID_ID}/../../etc/passwd`)).toBe(false);
  });

  it('refuses to write under an id that is not one', async () => {
    const filesystem = new FileSystemAssetStore('/tmp/does-not-need-to-exist');

    await expect(filesystem.put('../escape', 'image/png', new Uint8Array())).rejects.toThrow(AssetStoreError);
  });
});

describe('S3AssetStore', () => {
  it('refuses to sign credentials into a plaintext connection', () => {
    expect(() => new S3AssetStore({ ...CREDENTIALS, endpoint: 'http://insecure.example.com' })).toThrow(
      expect.objectContaining({ code: 'insecure_endpoint' }),
    );
  });

  it('formats the SigV4 timestamp the way the signature requires', () => {
    expect(amzDate(FIXED_DATE)).toBe('20260831T120000Z');
  });

  it('writes to a path-style key and signs the payload it actually sends', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const { calls, subject } = store(new Response(null, { status: 200 }), { prefix: 'campaigns/' });

    await subject.put(VALID_ID, 'image/png', bytes);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`https://account.r2.cloudflarestorage.com/ithinq-generated/campaigns/${VALID_ID}`);

    const headers = calls[0]!.init.headers as Record<string, string>;

    expect(calls[0]!.init.method).toBe('PUT');
    expect(headers['x-amz-content-sha256']).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(headers['x-amz-date']).toBe('20260831T120000Z');
    expect(headers['content-type']).toBe('image/png');
    expect(headers['x-amz-meta-mimetype']).toBe('image/png');

    // Never follow a redirect: it would replay the Authorization header.
    expect(calls[0]!.init.redirect).toBe('manual');
  });

  it('produces a well-formed, deterministic SigV4 authorization', async () => {
    const first = store(new Response(null, { status: 200 }));
    const second = store(new Response(null, { status: 200 }));

    await first.subject.put(VALID_ID, 'image/png', new Uint8Array([9]));
    await second.subject.put(VALID_ID, 'image/png', new Uint8Array([9]));

    const authorization = (first.calls[0]!.init.headers as Record<string, string>).authorization;

    expect(authorization).toBe((second.calls[0]!.init.headers as Record<string, string>).authorization);
    expect(authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/20260831\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-meta-mimetype, Signature=[0-9a-f]{64}$/,
    );

    // The secret is the one thing that must never appear in a request line.
    expect(JSON.stringify(first.calls[0]!)).not.toContain(CREDENTIALS.secretAccessKey);
  });

  it('signs a GET against the empty-payload digest', async () => {
    const { calls, subject } = store(new Response(new Uint8Array([7]), { headers: { 'content-type': 'image/png' } }));

    const asset = await subject.get(VALID_ID);

    expect(asset).toEqual({ id: VALID_ID, mimeType: 'image/png', bytes: new Uint8Array([7]) });
    expect((calls[0]!.init.headers as Record<string, string>)['x-amz-content-sha256']).toBe(
      createHash('sha256').update('').digest('hex'),
    );
  });

  it('treats a missing object as a miss and any other refusal as a fault', async () => {
    await expect(store(new Response(null, { status: 404 })).subject.get(VALID_ID)).resolves.toBeNull();

    await expect(store(new Response(null, { status: 403 })).subject.get(VALID_ID)).rejects.toThrow(
      expect.objectContaining({ code: 'read_rejected' }),
    );
    await expect(
      store(new Response(null, { status: 500 })).subject.put(VALID_ID, 'image/png', new Uint8Array()),
    ).rejects.toThrow(expect.objectContaining({ code: 'write_rejected' }));
  });

  it('never lets a non-digest id reach an object key', async () => {
    const { calls, subject } = store(new Response(null, { status: 200 }));

    await expect(subject.get('../../secrets')).resolves.toBeNull();
    await expect(subject.put('../../secrets', 'image/png', new Uint8Array())).rejects.toThrow(
      expect.objectContaining({ code: 'invalid_id' }),
    );
    expect(calls).toHaveLength(0);
  });

  it('turns a network fault into a store error rather than an opaque throw', async () => {
    const impl = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const subject = new S3AssetStore({ ...CREDENTIALS, fetchImpl: impl });

    await expect(subject.get(VALID_ID)).rejects.toThrow(expect.objectContaining({ code: 'network_error' }));
  });

  it('still serves bytes from the renderer origin, never from the bucket', () => {
    const { subject } = store(new Response(null, { status: 200 }));

    expect(subject.urlFor(VALID_ID)).toBe(`/ithinq/generated/${VALID_ID}`);
  });
});

describe('resolveAssetStore', () => {
  it('defaults to the ephemeral development store when nothing is configured', () => {
    expect(resolveAssetStore({})).toBeInstanceOf(FileSystemAssetStore);
  });

  it('uses a mounted directory when one is named, which is the persistent-disk answer', () => {
    const resolved = resolveAssetStore({ RENDERER_ASSET_DIR: '/opt/render/project/src/.data/generated' });

    expect(resolved).toBeInstanceOf(FileSystemAssetStore);
    expect(resolved.urlFor(VALID_ID)).toBe(`/ithinq/generated/${VALID_ID}`);
  });

  it('uses the object store when it is fully configured', () => {
    expect(
      resolveAssetStore({
        RENDERER_ASSET_S3_ENDPOINT: CREDENTIALS.endpoint,
        RENDERER_ASSET_S3_BUCKET: CREDENTIALS.bucket,
        RENDERER_ASSET_S3_ACCESS_KEY_ID: CREDENTIALS.accessKeyId,
        RENDERER_ASSET_S3_SECRET_ACCESS_KEY: CREDENTIALS.secretAccessKey,
      }),
    ).toBeInstanceOf(S3AssetStore);
  });

  it('refuses half a configuration instead of silently losing every asset', () => {
    let thrown: unknown;

    try {
      resolveAssetStore({
        RENDERER_ASSET_S3_ENDPOINT: CREDENTIALS.endpoint,
        RENDERER_ASSET_S3_SECRET_ACCESS_KEY: CREDENTIALS.secretAccessKey,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AssetStoreError);
    expect((thrown as AssetStoreError).code).toBe('incomplete_configuration');
    expect((thrown as Error).message).toContain('RENDERER_ASSET_S3_BUCKET');

    // Names only. A diagnostic must never carry the value it is missing.
    expect((thrown as Error).message).not.toContain(CREDENTIALS.secretAccessKey);
  });
});

describe('the campaign pipeline stores through the seam', () => {
  it('writes generated bytes to the injected store and links them by renderer path', async () => {
    const written = new Map<string, { mimeType: string; bytes: Uint8Array }>();
    const backend: AssetStore = {
      async put(id, mimeType, bytes) {
        written.set(id, { mimeType, bytes });
      },
      async get(id) {
        const hit = written.get(id);

        return hit ? { id, ...hit } : null;
      },
      urlFor: (id) => `/ithinq/generated/${id}`,
    };

    const demo = demoSpec('med-spa');
    const run = await runCampaign(
      demo.spec,
      { userInstruction: 'a premium campaign for med spas' },
      {
        factSet: demo.factSet,

        // No model is contacted: this is about where the bytes go.
        textGenerator: null,
        imageGenerator: new PlaceholderImageGenerator(),
        store: backend,
      },
    );

    expect(run.assets.length).toBeGreaterThan(0);

    for (const asset of run.assets) {
      expect(isAssetId(asset.id)).toBe(true);
      expect(written.has(asset.id)).toBe(true);
      expect(asset.url).toBe(`/ithinq/generated/${asset.id}`);
    }

    // Content addressing means a second run reuses the bytes rather than paying again.
    const writesAfterFirst = written.size;
    await runCampaign(
      demo.spec,
      { userInstruction: 'a premium campaign for med spas' },
      { factSet: demo.factSet, textGenerator: null, imageGenerator: new PlaceholderImageGenerator(), store: backend },
    );

    expect(written.size).toBe(writesAfterFirst);
  });
});
