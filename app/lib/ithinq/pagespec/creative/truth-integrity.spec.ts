import { describe, expect, it } from 'vitest';
import examplePageSpec from '@ithinq-pagespec/page-spec.example.json';
import { SECTION_KINDS, type PageSpec, type PageSpecSection } from '@ithinq-pagespec/page-spec';
import { compilePageSpecToProjectManifest } from '~/lib/ithinq/pagespec/compiler';
import { PageSpecValidationError, validatePageSpec } from '~/lib/ithinq/pagespec/validator';
import { DIRECTION_IDS } from './index';

function factRef(seed: number): string {
  return `f_${String(seed).padStart(2, '0').repeat(32).slice(0, 64)}`;
}

function fixture(): PageSpec {
  return JSON.parse(JSON.stringify(examplePageSpec)) as PageSpec;
}

function richFixture(): PageSpec {
  const spec = fixture();

  spec.sections = SECTION_KINDS.map((kind, index): PageSpecSection => {
    const section: PageSpecSection = {
      kind,
      purpose: 'explain_mechanism',
      provenance: { factRefs: [factRef(index)] },
      emphasis: index % 3 === 0 ? 'lead' : 'support',
      eyebrow: `Eyebrow ${kind}`,
      heading: `Heading for ${kind}`,
      body: `Body copy belonging to the ${kind} section.`,
    };

    if (kind === 'vertical_fit' || kind === 'pain' || kind === 'risk') {
      section.items = [`${kind} alpha`, `${kind} beta`, `${kind} gamma`, `${kind} delta`];
    }

    if (kind === 'faq') {
      section.qa = [
        { question: `Question about ${kind}?`, answer: `Answer about ${kind}.` },
        { question: 'Second question?', answer: 'Second answer.' },
      ];
    }

    if (kind === 'mechanism') {
      section.asset = { url: 'https://ithinq.ai/media/mechanism.png', kind: 'image', alt: 'Mechanism diagram' };
    }

    return section;
  });

  return spec;
}

function render(spec: PageSpec, direction: string): string {
  return compilePageSpecToProjectManifest(spec, { direction }).manifest.files['/index.html'] ?? '';
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('truth boundary under every creative direction', () => {
  it('renders CTA and referral URLs byte-identically', () => {
    const spec = richFixture();

    for (const direction of DIRECTION_IDS) {
      const html = render(spec, direction);

      expect(html).toContain(spec.ctas.primary.url);
      expect(html).toContain(spec.ctas.secondary?.url ?? spec.ctas.primary.url);
      expect(html).not.toContain(`${spec.ctas.primary.url}&`);
      expect(html).not.toContain(`${spec.ctas.primary.url}?`);
    }
  });

  it('always renders the disclosure exactly as supplied', () => {
    const spec = richFixture();

    for (const direction of DIRECTION_IDS) {
      expect(render(spec, direction)).toContain(spec.disclosure.text);
    }
  });

  it('renders asset URLs and alt text unchanged', () => {
    const spec = richFixture();
    const asset = spec.sections.find((section) => section.asset)?.asset;

    expect(asset).toBeDefined();

    for (const direction of DIRECTION_IDS) {
      const html = render(spec, direction);

      expect(html).toContain(asset?.url ?? '');
      expect(html).toContain(asset?.alt ?? '');
    }
  });

  it('loses no items or questions whichever layout a direction chooses', () => {
    const spec = richFixture();

    for (const direction of DIRECTION_IDS) {
      const html = render(spec, direction);

      for (const section of spec.sections) {
        for (const item of section.items ?? []) {
          expect(html).toContain(item);
        }

        for (const qa of section.qa ?? []) {
          expect(html).toContain(qa.question);
          expect(html).toContain(qa.answer);
        }

        if (section.heading) {
          expect(html).toContain(section.heading);
        }

        if (section.body) {
          expect(html).toContain(section.body);
        }
      }
    }
  });

  it('preserves authored section order in the document', () => {
    const spec = richFixture();

    for (const direction of DIRECTION_IDS) {
      const html = render(spec, direction);
      const positions = spec.sections
        .map((section) => section.heading)
        .filter((heading): heading is string => Boolean(heading))
        .map((heading) => html.indexOf(heading));

      expect(positions).toEqual([...positions].sort((left, right) => left - right));
    }
  });

  it('emits no script in any direction', () => {
    const spec = richFixture();

    for (const direction of DIRECTION_IDS) {
      const html = render(spec, direction);

      expect(html).not.toContain('<script');
      expect(html).not.toContain('javascript:');
      expect(html).not.toContain(' onload=');
      expect(html).not.toContain(' onerror=');
    }
  });

  it('escapes hostile content in every direction', () => {
    const spec = richFixture();
    spec.page.headline = '<script>alert("owned")</script>';
    spec.sections[0]!.items = ['<img src=x onerror=alert(1)>'];

    for (const direction of DIRECTION_IDS) {
      const html = render(spec, direction);

      /*
       * The payload may appear as inert escaped text; what must never appear
       * is live markup. Assert on the escaping, not on the substring.
       */
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    }
  });

  it('presents a hero asset once when the contract marks it as the hero', () => {
    const spec = richFixture();
    const mechanism = spec.sections.find((section) => section.kind === 'mechanism');
    mechanism!.asset!.role = 'hero';

    const html = render(spec, 'conversion-modern');

    expect(occurrences(html, mechanism!.asset!.url)).toBe(1);
    expect(html).toContain('hero__media');
  });

  it('renders a clean image-less page when the document carries no assets', () => {
    const spec = fixture();

    expect(spec.sections.every((section) => !section.asset)).toBe(true);

    for (const direction of DIRECTION_IDS) {
      const html = render(spec, direction);

      expect(html).not.toContain('<img');
      expect(html).not.toContain('placeholder');
      expect(html).toContain(spec.page.headline);
    }
  });
});

describe('validation is unaffected by presentation', () => {
  it('leaves validation results identical across directions', () => {
    const spec = richFixture();
    const baseline = validatePageSpec(spec);

    for (const direction of DIRECTION_IDS) {
      expect(compilePageSpecToProjectManifest(spec, { direction }).validation).toEqual(baseline);
    }
  });

  it('still enforces the exact contract version', () => {
    const spec = { ...richFixture(), specVersion: '1.1' };

    for (const direction of DIRECTION_IDS) {
      expect(() => compilePageSpecToProjectManifest(spec, { direction })).toThrow(PageSpecValidationError);
    }
  });

  it('still refuses a document that authorises its own hostile CTA host', () => {
    const spec = richFixture();
    spec.ctas.primary.url = 'https://evil.example/collect';
    spec.policy.allowedLinkHosts = ['evil.example'];

    for (const direction of DIRECTION_IDS) {
      expect(() => compilePageSpecToProjectManifest(spec, { direction })).toThrow(PageSpecValidationError);
    }
  });

  it('still refuses an asset hosted outside the renderer ceiling', () => {
    const spec = richFixture();
    const mechanism = spec.sections.find((section) => section.kind === 'mechanism');
    mechanism!.asset!.url = 'https://cdn.evil.example/tracker.png';

    for (const direction of DIRECTION_IDS) {
      expect(() => compilePageSpecToProjectManifest(spec, { direction })).toThrow(PageSpecValidationError);
    }
  });
});
