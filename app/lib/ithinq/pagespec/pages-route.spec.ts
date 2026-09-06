import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import examplePageSpec from '@ithinq-pagespec/page-spec.example.json';
import type { PageSpec } from '@ithinq-pagespec/page-spec';
import { action, loader } from '~/routes/ithinq.pages';
import { PAGESPEC_COMPILER_VERSION } from './compiler';

/*
 * The authenticated page endpoint.
 *
 * This is the one page surface that another service calls, so the assertions
 * that matter most are the ones about REFUSAL: an unconfigured deployment must
 * not become a public page compiler, and a wrong credential must not be
 * distinguishable from a missing one. The demo routes at `/ithinq/pagespec*`
 * are deliberately untouched by any of this and keep serving the committed
 * fixture without a credential.
 */

const TOKEN = 'a-service-token';

type ActionArgs = Parameters<typeof action>[0];

interface PageResponse {
  html: string;
  direction: string;
  designSeed: string;
  rendererVersion: string;
  contentHash: string;
  validation: { degraded: boolean; skippedSections: number[] };
}

interface ErrorResponse {
  error: {
    code: string;
    detail: string;
    validation?: { renderable: boolean; findings: Array<{ code: string }> };
  };
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function fixture(): PageSpec {
  return JSON.parse(JSON.stringify(examplePageSpec)) as PageSpec;
}

function call(
  body: unknown,
  options: {
    token?: string | null;
    method?: string;
    contentType?: string | null;
    env?: Record<string, string | undefined>;
    contentLength?: string;
    raw?: string;
  } = {},
): Promise<Response> {
  const headers = new Headers();

  if (options.token !== null) {
    headers.set('authorization', `Bearer ${options.token ?? TOKEN}`);
  }

  if (options.contentType !== null) {
    headers.set('content-type', options.contentType ?? 'application/json');
  }

  if (options.contentLength) {
    headers.set('content-length', options.contentLength);
  }

  const method = options.method ?? 'POST';
  const request = new Request('https://renderer.test/ithinq/pages', {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : (options.raw ?? JSON.stringify(body)),
  });

  return action({
    request,
    context: { cloudflare: { env: options.env ?? { RENDERER_SERVICE_TOKEN: TOKEN } } },
    params: {},
  } as unknown as ActionArgs) as Promise<Response>;
}

/*
 * `authoriseServiceRequest` falls back to `process.env` when the runtime
 * context carries no value. A developer machine with the real token exported
 * would otherwise turn the unauthenticated cases green for the wrong reason.
 */
let savedToken: string | undefined;

beforeEach(() => {
  savedToken = process.env.RENDERER_SERVICE_TOKEN;
  delete process.env.RENDERER_SERVICE_TOKEN;
});

afterEach(() => {
  if (savedToken === undefined) {
    delete process.env.RENDERER_SERVICE_TOKEN;
  } else {
    process.env.RENDERER_SERVICE_TOKEN = savedToken;
  }
});

describe('POST /ithinq/pages authorisation', () => {
  it('refuses a request with no credential', async () => {
    const response = await call({ spec: fixture() }, { token: null });

    expect(response.status).toBe(401);
    expect((await readJson<ErrorResponse>(response)).error.code).toBe('unauthorised');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('refuses a wrong credential with the same answer as a missing one', async () => {
    const wrong = await call({ spec: fixture() }, { token: 'not-the-token' });
    const missing = await call({ spec: fixture() }, { token: null });

    expect(wrong.status).toBe(401);
    expect(await readJson<ErrorResponse>(wrong)).toEqual(await readJson<ErrorResponse>(missing));
  });

  it('fails closed when no token is configured, rather than opening the endpoint', async () => {
    const response = await call({ spec: fixture() }, { env: { RENDERER_SERVICE_TOKEN: '' } });

    expect(response.status).toBe(503);
    expect((await readJson<ErrorResponse>(response)).error.code).toBe('service_auth_unconfigured');
  });

  it('never echoes the credential back', async () => {
    for (const token of [TOKEN, 'not-the-token']) {
      const response = await call({ spec: fixture() }, { token });

      expect(await response.text()).not.toContain(token);
    }
  });

  it('checks the method before the credential, and names the one it accepts', async () => {
    const response = await call({ spec: fixture() }, { method: 'GET', token: null });

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });

  it('has no loader, so GET cannot imply a readable resource', async () => {
    const response = (await loader()) as Response;

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('POST /ithinq/pages request handling', () => {
  it('requires JSON', async () => {
    const response = await call({ spec: fixture() }, { contentType: 'text/plain' });

    expect(response.status).toBe(415);
    expect((await readJson<ErrorResponse>(response)).error.code).toBe('unsupported_media_type');
  });

  it('refuses an oversized body on the declared length', async () => {
    const response = await call({ spec: fixture() }, { contentLength: String(600 * 1024) });

    expect(response.status).toBe(413);
    expect((await readJson<ErrorResponse>(response)).error.code).toBe('pagespec_too_large');
  });

  it('refuses an oversized body that under-declared its length', async () => {
    const spec = fixture();
    spec.page.name = 'x'.repeat(600 * 1024);

    const response = await call({ spec });

    expect(response.status).toBe(413);
  });

  it('refuses malformed JSON', async () => {
    const response = await call(undefined, { raw: '{"spec":' });

    expect(response.status).toBe(400);
    expect((await readJson<ErrorResponse>(response)).error.code).toBe('invalid_json');
  });

  it('refuses a body with no spec', async () => {
    const response = await call({ creative: { mood: 'luxury' } });

    expect(response.status).toBe(400);
    expect((await readJson<ErrorResponse>(response)).error.code).toBe('missing_spec');
  });

  it('refuses malformed creative intent and malformed media', async () => {
    expect((await call({ spec: fixture(), creative: 'luxury' })).status).toBe(400);
    expect((await call({ spec: fixture(), generatedMedia: {} })).status).toBe(400);
    expect((await call({ spec: fixture(), generatedMedia: [{ url: 'x' }] })).status).toBe(400);
    expect(
      (
        await call({
          spec: fixture(),
          generatedMedia: Array.from({ length: 25 }, () => ({ assetNeedId: 'hero', url: 'u', alt: 'a' })),
        })
      ).status,
    ).toBe(400);
  });

  it('reports an unrenderable document with its validation findings', async () => {
    const spec = fixture();
    spec.ctas.primary.url = 'https://evil.example/collect';
    spec.policy.allowedLinkHosts = ['evil.example'];

    const response = await call({ spec });
    const body = await readJson<ErrorResponse>(response);

    expect(response.status).toBe(422);
    expect(body.error.code).toBe('pagespec_not_renderable');
    expect(body.error.validation?.renderable).toBe(false);
    expect(body.error.validation?.findings.some((item) => item.code === 'link_policy_outside_ceiling')).toBe(true);
  });
});

describe('POST /ithinq/pages success', () => {
  it('returns the document as JSON with a hash the caller can compare', async () => {
    const spec = fixture();
    const response = await call({ spec });
    const body = await readJson<PageResponse>(response);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');

    expect(body.html.startsWith('<!doctype html>')).toBe(true);
    expect(body.html).toContain(spec.page.headline);
    expect(body.html).toContain(spec.ctas.primary.url);
    expect(body.html).toContain(spec.disclosure.text);
    expect(body.html).not.toContain('<script');

    expect(body.rendererVersion).toBe(PAGESPEC_COMPILER_VERSION);
    expect(body.direction).toBe('clinical-calm');
    expect(body.designSeed).toMatch(/^[0-9a-f]{32}$/);
    expect(body.contentHash).toBe(createHash('sha256').update(body.html, 'utf8').digest('hex'));
    expect(body.validation).toEqual({ degraded: false, skippedSections: [] });
  });

  it('reports a degraded render rather than silently dropping a section', async () => {
    const spec = fixture();
    spec.sections.push({
      kind: 'future_kind',
      purpose: 'create_recognition',
      provenance: { factRefs: [] },
      emphasis: 'aside',
    });

    const body = await readJson<PageResponse>(await call({ spec }));

    expect(body.validation.degraded).toBe(true);
    expect(body.validation.skippedSections).toEqual([spec.sections.length - 1]);
  });

  it('honours a requested starting point and ignores an unknown one', async () => {
    expect((await readJson<PageResponse>(await call({ spec: fixture(), direction: 'service-bold' }))).direction).toBe(
      'service-bold',
    );
    expect((await readJson<PageResponse>(await call({ spec: fixture(), direction: '../evil' }))).direction).toBe(
      'clinical-calm',
    );
  });

  it('lets a caller ask for a different concept without changing a word', async () => {
    const spec = fixture();
    const first = await readJson<PageResponse>(await call({ spec, creative: { seed: 'concept-a', mood: 'luxury' } }));
    const second = await readJson<PageResponse>(await call({ spec, creative: { seed: 'concept-b', mood: 'luxury' } }));

    expect(second.html).not.toBe(first.html);
    expect(second.contentHash).not.toBe(first.contentHash);
    expect(first.html).toContain(spec.page.headline);
    expect(second.html).toContain(spec.page.headline);
  });

  it('renders supplied media and never leaks art direction into the page', async () => {
    const body = await readJson<PageResponse>(
      await call({
        spec: fixture(),
        creative: { artDirection: 'SENTINELPHRASEQQQ make it feel expensive' },
        generatedMedia: [{ assetNeedId: 'hero', url: '/ithinq/generated/aaaa1111', alt: 'A calm clinic reception' }],
      }),
    );

    expect(body.html).toContain('/ithinq/generated/aaaa1111');
    expect(body.html).toContain('A calm clinic reception');
    expect(body.html.toUpperCase()).not.toContain('SENTINELPHRASEQQQ');
  });

  it('is deterministic across calls', async () => {
    const spec = fixture();
    const first = await readJson<PageResponse>(await call({ spec, creative: { seed: 'stable' } }));
    const second = await readJson<PageResponse>(await call({ spec, creative: { seed: 'stable' } }));

    expect(second.contentHash).toBe(first.contentHash);
    expect(second.html).toBe(first.html);
  });
});
