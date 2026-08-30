import { describe, expect, it } from 'vitest';
import examplePageSpec from '@ithinq-pagespec/page-spec.example.json';
import { SECTION_KINDS, type PageSpec, type PageSpecSection } from '@ithinq-pagespec/page-spec';
import { compilePageSpecToProjectManifest } from '~/lib/ithinq/pagespec/compiler';
import { DIRECTION_IDS, listDirections, planPresentation, selectDirection } from './index';

function fixture(): PageSpec {
  return JSON.parse(JSON.stringify(examplePageSpec)) as PageSpec;
}

/** `f_` plus a full lowercase SHA-256 digest, as the contract requires. */
function factRef(seed: number): string {
  return `f_${String(seed).padStart(2, '0').repeat(32).slice(0, 64)}`;
}

/** A document exercising every canonical kind plus items, Q&A and imagery. */
function fullVocabularyFixture(): PageSpec {
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
      section.items = [`${kind} item alpha`, `${kind} item beta`, `${kind} item gamma`, `${kind} item delta`];
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

const AUTHORITATIVE_STRINGS = (spec: PageSpec): string[] => {
  const values = [
    spec.page.headline,
    spec.page.subheadline,
    spec.page.audience,
    spec.disclosure.text,
    spec.ctas.primary.url,
    spec.ctas.primary.label,
  ];

  for (const section of spec.sections) {
    values.push(section.heading ?? '', section.body ?? '', section.eyebrow ?? '');
    values.push(...(section.items ?? []));

    for (const qa of section.qa ?? []) {
      values.push(qa.question, qa.answer);
    }

    if (section.asset) {
      values.push(section.asset.url, section.asset.alt);
    }
  }

  return values.filter((value) => value.trim().length > 6);
};

describe('creative presentation plan', () => {
  it('never copies authoritative business truth into the plan', () => {
    const spec = fullVocabularyFixture();

    for (const direction of DIRECTION_IDS) {
      const plan = planPresentation(spec, [], { direction });
      const serialised = JSON.stringify(plan);

      for (const value of AUTHORITATIVE_STRINGS(spec)) {
        expect(serialised).not.toContain(value);
      }
    }
  });

  it('references sections by index and preserves authored order', () => {
    const spec = fullVocabularyFixture();

    for (const direction of DIRECTION_IDS) {
      const plan = planPresentation(spec, [], { direction });
      const indices = plan.sections.map((section) => section.sourceIndex);

      expect(indices).toEqual([...indices].sort((left, right) => left - right));
      expect(indices).toEqual(spec.sections.map((_, index) => index));
    }
  });

  it('honours skipped sections from validation', () => {
    const spec = fullVocabularyFixture();
    const plan = planPresentation(spec, [2], { direction: 'conversion-modern' });

    expect(plan.sections.map((section) => section.sourceIndex)).not.toContain(2);
    expect(plan.sections).toHaveLength(spec.sections.length - 1);
  });

  it('is deterministic per direction', () => {
    const spec = fullVocabularyFixture();

    for (const direction of DIRECTION_IDS) {
      expect(planPresentation(spec, [], { direction })).toEqual(planPresentation(spec, [], { direction }));
    }
  });

  it('falls back to a derived direction when the request is unknown', () => {
    const spec = fixture();
    const derived = selectDirection(spec);

    expect(planPresentation(spec, [], { direction: 'not-a-direction' }).directionId).toBe(derived);
  });

  it('derives a direction from the market vertical', () => {
    const spec = fixture();

    spec.page.vertical = 'med-spa';
    expect(selectDirection(spec)).toBe('clinical-calm');

    spec.page.vertical = 'hvac';
    expect(selectDirection(spec)).toBe('service-bold');

    spec.page.vertical = 'saas';
    expect(selectDirection(spec)).toBe('conversion-modern');
  });
});

describe('creative directions', () => {
  it('supports every canonical section kind in every direction', () => {
    const spec = fullVocabularyFixture();

    for (const direction of DIRECTION_IDS) {
      const plan = planPresentation(spec, [], { direction });

      expect(plan.sections).toHaveLength(SECTION_KINDS.length);

      for (const section of plan.sections) {
        expect(section.layout).toBeTruthy();
      }
    }
  });

  it('produces materially different composition, not one template recoloured', () => {
    const spec = fullVocabularyFixture();
    const signatures = new Set<string>();
    const documents = new Set<string>();

    for (const direction of DIRECTION_IDS) {
      const plan = planPresentation(spec, [], { direction });

      signatures.add(
        JSON.stringify([
          plan.hero.variant,
          plan.density,
          plan.cardStyle,
          plan.sections.map((section) => `${section.layout}:${section.band}`),
        ]),
      );

      const { manifest } = compilePageSpecToProjectManifest(spec, { direction });
      documents.add(manifest.files['/index.html'] ?? '');
    }

    expect(signatures.size).toBe(DIRECTION_IDS.length);
    expect(documents.size).toBe(DIRECTION_IDS.length);
  });

  it('differs structurally, not only in tokens', () => {
    const spec = fullVocabularyFixture();
    const layoutSets = DIRECTION_IDS.map((direction) => {
      const plan = planPresentation(spec, [], { direction });

      return [...new Set(plan.sections.map((section) => section.layout))].sort().join('|');
    });

    expect(new Set(layoutSets).size).toBeGreaterThan(1);
  });

  it('exposes a stable, documented direction catalogue', () => {
    expect(
      listDirections()
        .map((direction) => direction.id)
        .sort(),
    ).toEqual([...DIRECTION_IDS].sort());

    for (const direction of listDirections()) {
      expect(direction.label.length).toBeGreaterThan(0);
      expect(direction.summary.length).toBeGreaterThan(0);
    }
  });
});
