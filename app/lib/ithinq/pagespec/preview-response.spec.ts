import { describe, expect, it } from 'vitest';
import { loader } from '~/routes/ithinq.pagespec-preview';

function previewRequest(url = 'https://renderer.test/ithinq/pagespec-preview'): LoaderArgs {
  return { request: new Request(url) } as LoaderArgs;
}

type LoaderArgs = Parameters<typeof loader>[0];

describe('PageSpec preview response', () => {
  it('cascades Bolt cross-origin isolation into the nested preview', async () => {
    const response = loader(previewRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(await response.text()).not.toContain('<script');
  });

  it('renders the requested creative direction without weakening any header', async () => {
    const response = loader(previewRequest('https://renderer.test/ithinq/pagespec-preview?direction=service-bold'));
    const body = await response.text();

    expect(body).toContain('data-direction="service-bold"');
    expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(body).not.toContain('<script');
  });

  it('ignores an unknown direction instead of failing or trusting it', async () => {
    const response = loader(previewRequest('https://renderer.test/ithinq/pagespec-preview?direction=../evil'));

    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('evil');
  });
});
