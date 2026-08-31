import { describe, expect, it } from 'vitest';
import examplePageSpec from '@ithinq-pagespec/page-spec.example.json';
import type { PageSpec } from '@ithinq-pagespec/page-spec';
import { compilePageSpecToProjectManifest } from '~/lib/ithinq/pagespec/compiler';
import { planPresentation } from '~/lib/ithinq/pagespec/creative';
import { PageSpecValidationError, validatePageSpec } from '~/lib/ithinq/pagespec/validator';

function fixture(): PageSpec {
  return JSON.parse(JSON.stringify(examplePageSpec)) as PageSpec;
}

const GENERATED = [
  { assetNeedId: 'hero', url: '/ithinq/generated/aaaa1111', alt: 'Illustrative photograph of a med-spa consultation' },
  { assetNeedId: 'section-0', url: '/ithinq/generated/bbbb2222', alt: 'Illustrative supporting photograph' },
];

describe('generated assets reach the presentation plan', () => {
  it('lets generated imagery drive the hero composition', () => {
    const spec = fixture();
    const without = planPresentation(spec, [], { direction: 'conversion-modern' });
    const withImages = planPresentation(spec, [], {
      direction: 'conversion-modern',
      generatedAssetNeedIds: ['hero'],
    });

    expect(without.hero.media).toBe('none');
    expect(withImages.hero.media).not.toBe('none');
    expect(withImages.hero.variant).toBe('split-media');
    expect(withImages.hero.generatedAssetNeedId).toBe('hero');
    expect(withImages.imageEmphasis).toBe('led');
  });

  it('never leaves a generated hero image unused, in any direction', () => {
    for (const direction of ['editorial-luxe', 'conversion-modern', 'service-bold', 'clinical-calm'] as const) {
      const plan = planPresentation(fixture(), [], { direction, generatedAssetNeedIds: ['hero'] });

      expect(plan.hero.generatedAssetNeedId, `${direction} dropped its hero image`).toBe('hero');
      expect(plan.hero.media, `${direction} hero has no media placement`).not.toBe('none');
      expect(['split-media', 'full-bleed-media']).toContain(plan.hero.variant);

      const html =
        compilePageSpecToProjectManifest(fixture(), { direction, generatedMedia: [GENERATED[0]!] }).manifest.files[
          '/index.html'
        ] ?? '';

      expect(html, `${direction} did not render the hero image`).toContain(GENERATED[0]!.url);
    }
  });

  it('assigns generated imagery to the section that asked for it', () => {
    const plan = planPresentation(fixture(), [], {
      direction: 'editorial-luxe',
      generatedAssetNeedIds: ['section-0'],
    });
    const section = plan.sections.find((item) => item.sourceIndex === 0);

    expect(section?.generatedAssetNeedId).toBe('section-0');
    expect(section?.media).not.toBe('none');
  });

  it('renders generated media into the document and changes composition', () => {
    const spec = fixture();
    const plain = compilePageSpecToProjectManifest(spec, { direction: 'conversion-modern' });
    const withMedia = compilePageSpecToProjectManifest(spec, {
      direction: 'conversion-modern',
      generatedMedia: GENERATED,
    });

    const plainHtml = plain.manifest.files['/index.html'] ?? '';
    const mediaHtml = withMedia.manifest.files['/index.html'] ?? '';

    expect(plainHtml).not.toContain('<img');
    expect(mediaHtml).toContain(GENERATED[0]!.url);
    expect(mediaHtml).toContain(GENERATED[0]!.alt);
    expect(mediaHtml).toContain('hero__media');
    expect(mediaHtml).not.toBe(plainHtml);
  });

  it('keeps generation metadata out of the PageSpec artifact', () => {
    const { manifest } = compilePageSpecToProjectManifest(fixture(), {
      direction: 'conversion-modern',
      generatedMedia: GENERATED,
    });
    const pagespecJson = manifest.files['/pagespec.json'] ?? '';

    expect(pagespecJson).not.toContain('/ithinq/generated/');
    expect(pagespecJson).not.toContain('promptSha256');
    expect(pagespecJson).not.toContain('gpt-image-1');
    expect(JSON.parse(pagespecJson)).toEqual(JSON.parse(JSON.stringify(fixture())));
  });

  it('preserves every truth invariant when generated imagery is present', () => {
    const spec = fixture();
    const html =
      compilePageSpecToProjectManifest(spec, { direction: 'clinical-calm', generatedMedia: GENERATED }).manifest.files[
        '/index.html'
      ] ?? '';

    expect(html).toContain(spec.ctas.primary.url);
    expect(html).toContain(spec.ctas.secondary!.url);
    expect(html).toContain(spec.disclosure.text);
    expect(html).toContain(spec.page.headline);
    expect(html).not.toContain('<script');
  });

  it('still renders a complete page when optional imagery never arrived', () => {
    const spec = fixture();
    const html = compilePageSpecToProjectManifest(spec, { direction: 'clinical-calm', generatedMedia: [] }).manifest
      .files['/index.html'] as string;

    expect(html).toContain(spec.page.headline);
    expect(html).toContain(spec.disclosure.text);
    expect(html).not.toContain('<img');
  });

  it('escapes a hostile generated alt or url rather than trusting it', () => {
    const html =
      compilePageSpecToProjectManifest(fixture(), {
        direction: 'conversion-modern',
        generatedMedia: [{ assetNeedId: 'hero', url: '/x" onerror="alert(1)', alt: '<script>alert(1)</script>' }],
      }).manifest.files['/index.html'] ?? '';

    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('navigation trust and media trust are separate', () => {
  it('does not let a media-only host become a CTA destination', () => {
    const spec = fixture();
    spec.ctas.primary.url = 'https://cdn.ithinq.ai/go';
    spec.policy.allowedLinkHosts = ['cdn.ithinq.ai'];

    const result = validatePageSpec(spec);

    expect(result.renderable).toBe(false);
    expect(result.findings.some((finding) => finding.code === 'link_policy_outside_ceiling')).toBe(true);
  });

  it('does not let a navigation-only host become a media source', () => {
    const spec = fixture();
    spec.sections[0]!.asset = {
      url: 'https://partners.ithinq.ai/tracker.png',
      kind: 'image',
      alt: 'tracker',
    };

    const result = validatePageSpec(spec);

    expect(result.renderable).toBe(false);
    expect(result.findings.some((finding) => finding.code === 'media_host_not_allowed')).toBe(true);
  });

  it('accepts a media host for imagery and a navigation host for links', () => {
    const spec = fixture();
    spec.sections[0]!.asset = { url: 'https://cdn.ithinq.ai/scene.png', kind: 'image', alt: 'scene' };

    expect(validatePageSpec(spec).renderable).toBe(true);
    expect(spec.ctas.primary.url.startsWith('https://ithinq.ai/')).toBe(true);
  });

  it('still refuses an entirely foreign media host', () => {
    const spec = fixture();
    spec.sections[0]!.asset = { url: 'https://cdn.evil.example/x.png', kind: 'image', alt: 'x' };

    expect(() => compilePageSpecToProjectManifest(spec)).toThrow(PageSpecValidationError);
  });

  it('does not let a document widen the media ceiling through its own policy', () => {
    const spec = fixture();
    spec.policy.allowedLinkHosts = ['ithinq.ai', 'cdn.evil.example'];
    spec.sections[0]!.asset = { url: 'https://cdn.evil.example/x.png', kind: 'image', alt: 'x' };

    const result = validatePageSpec(spec);

    expect(result.renderable).toBe(false);
    expect(result.findings.some((finding) => finding.code === 'media_host_not_allowed')).toBe(true);
  });
});
