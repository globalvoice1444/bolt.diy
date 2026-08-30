import { describe, expect, it } from 'vitest';
import { loader } from '~/routes/ithinq.pagespec-preview';

describe('PageSpec preview response', () => {
  it('cascades Bolt cross-origin isolation into the nested preview', async () => {
    const response = loader({} as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(await response.text()).not.toContain('<script');
  });
});
