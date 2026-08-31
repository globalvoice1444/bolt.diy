import { describe, expect, it } from 'vitest';
import examplePageSpec from '@ithinq-pagespec/page-spec.example.json';
import type { PageSpec } from '@ithinq-pagespec/page-spec';
import { compilePageSpecToProjectManifest } from '~/lib/ithinq/pagespec/compiler';
import type { CopyText } from '~/lib/ithinq/pagespec/creative';
import { authorCampaignCopy } from './copy';
import { guardCopy, guardFactRefs, safeCopy, supportContext } from './copy-guard';
import { auditClaims } from './claim-audit';
import { documentText } from './facts';
import { HVAC_FACTS, MED_SPA_BRIEF_FACTS, MED_SPA_CONTRACT_FACTS } from './fact-sets';
import { DEMO_SPECS, demoSpec } from './demo-specs';
import { campaignRenderInputs, runCampaign } from './campaign';
import { interpretBrief } from './interpret';
import { deriveCreativeStrategy } from './strategy';
import { normaliseCreativeRequest } from './request';
import { PlaceholderImageGenerator } from './provider/placeholder';
import type { StructuredTextGenerator } from './provider/openai-text';
import type { AssetStore, StoredAsset } from './asset-store';

const REQUEST =
  'Create the best converting campaign for Med Spas promoting the iThinq AI Voice Assistant. Premium and persuasive.';

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

/** A model stand-in that returns queued payloads. Never a paid call. */
function textGen(payloads: unknown[]): StructuredTextGenerator {
  const queue = [...payloads];

  return {
    provider: 'stub',
    model: 'stub-text/1',
    async generate<T>() {
      const next = queue.shift();

      if (next === undefined) {
        throw new Error('no payload queued');
      }

      return next as T;
    },
  };
}

const NO_UNSUPPORTED = { unsupported: [] };

const INTERPRETATION = {
  objective: 'Book more consultations.',
  vertical: 'med-spa',
  audience: 'practice managers',
  tone: 'elegant',
  imagePreference: 'image-forward',
  conversionGoal: 'book-demo',
  creativeDirection: null,
  angle: 'Lead with the call nobody was free to answer.',
};

const PLAN = {
  angle: 'The enquiry that rang out.',
  awarenessLevel: 'problem-aware',
  framework: 'Problem, mechanism, honest limits, ask.',
  promise: 'Nobody has to choose between the client in the room and the one on the phone.',
  objections: ['It will sound robotic', 'We are not ready to change anything'],
  lengthTreatment: 'standard',
};

function authorship(overrides: Record<string, unknown> = {}) {
  return {
    campaign: PLAN,
    audience: 'Owners and practice managers',
    headline: 'The call that rang out while you were in a treatment room',
    subheadline: 'Someone answers it, asks what a consultation enquiry needs, and keeps the follow-up moving.',
    pageFactRefs: [MED_SPA_BRIEF_FACTS.facts[4]!.ref],
    sections: [],
    ...overrides,
  };
}

async function author(spec: PageSpec, set = MED_SPA_BRIEF_FACTS, payloads: unknown[] = []) {
  const request = await interpretBrief({ userInstruction: REQUEST }, null);
  const strategy = deriveCreativeStrategy(spec, request);

  return authorCampaignCopy(spec, set, request, strategy, textGen(payloads));
}

const briefDemo = demoSpec('med-spa-brief');
const contractSpec = examplePageSpec as unknown as PageSpec;

describe('the guard checks claims, not wording', () => {
  const support = supportContext(MED_SPA_BRIEF_FACTS.facts, []);

  /*
   * The Phase 4 test that Phase 3 could not have passed. None of this wording
   * exists in any approved fact; every assertion in it does.
   */
  it('accepts wholly original copy that no source string contains', () => {
    const original =
      'The phone rings while you are mid-treatment. Nobody is free. By the time anyone calls back, they have booked elsewhere. An assistant answers instead, asks what the enquiry needs, and keeps it moving.';

    expect(guardCopy('body', original, support, 900)).toEqual([]);
  });

  it('accepts metaphor, a rhetorical question and direct address', () => {
    for (const line of [
      'What does a missed call actually cost you?',
      'Your front desk is a bottleneck with a smile on it.',
      'You cannot be in two rooms at once. It can.',
    ]) {
      expect(guardCopy('h', line, support)).toEqual([]);
    }
  });

  it('still rejects an invented statistic', () => {
    expect(guardCopy('h', 'Answers 87% of inbound calls.', support).some((f) => f.code === 'novel_number')).toBe(true);
  });

  it('still rejects invented pricing', () => {
    const findings = guardCopy('h', 'Only $49 per month for every clinic.', support);

    expect(findings.some((f) => f.code === 'novel_currency' || f.code === 'novel_number')).toBe(true);
  });

  it('still rejects fabricated evidence, testimonials and proof', () => {
    for (const claim of [
      'Clinically proven to book more consultations.',
      'Award-winning assistant trusted by clinics.',
      'Results guaranteed or your money back.',
      'Rated five-star by practice managers.',
      'Read the testimonial from a clinic in Leeds.',
    ]) {
      expect(
        guardCopy('h', claim, support).some((f) => f.code === 'evidence_claim'),
        claim,
      ).toBe(true);
    }
  });

  it('still rejects the banned marketing clichés', () => {
    for (const cliche of [
      'Elevate your med spa with an AI assistant.',
      'Effortless integration for a busy front desk.',
      'Transform how your clinic answers the phone.',
    ]) {
      expect(
        guardCopy('h', cliche, support).some((f) => f.code === 'cliche'),
        cliche,
      ).toBe(true);
    }
  });

  it('permits a banned term when an approved fact uses it', () => {
    const permissive = supportContext([{ ref: 'f_x', kind: 'capability', text: 'A seamless handover.' }], []);

    expect(guardCopy('h', 'A seamless handover to the team.', permissive)).toEqual([]);
  });

  it('permits a figure an approved fact states', () => {
    const withNumber = supportContext([{ ref: 'f_x', kind: 'capability', text: 'Answers within 3 rings.' }], []);

    expect(guardCopy('h', 'Picked up inside 3 rings.', withNumber)).toEqual([]);
    expect(guardCopy('h', 'Picked up inside 2 rings.', withNumber).some((f) => f.code === 'novel_number')).toBe(true);
  });

  it('rejects a fact reference the approved set does not contain', () => {
    const findings = guardFactRefs('section.0', [`f_${'b'.repeat(64)}`, 'not-a-ref'], support);

    expect(findings.length).toBe(2);
    expect(findings.every((f) => f.code === 'unknown_fact_ref')).toBe(true);
    expect(guardFactRefs('section.0', [MED_SPA_BRIEF_FACTS.facts[0]!.ref], support)).toEqual([]);
  });

  it('safeCopy records the finding rather than passing bad copy through', () => {
    const findings: ReturnType<typeof guardCopy> = [];

    expect(safeCopy('h', 'Trusted by 4,000 clinics.', support, findings)).toBeNull();
    expect(findings.length).toBeGreaterThan(0);
    expect(safeCopy('h', 'Calls answered while you work.', support, findings)).toBe('Calls answered while you work.');
  });
});

describe('the claim audit', () => {
  it('rejects a field the auditor says nothing supports', async () => {
    const generator = textGen([
      {
        unsupported: [
          { field: 'page.headline', claim: 'books straight into your calendar', reason: 'No approved fact says so.' },
        ],
      },
    ]);
    const result = await auditClaims(
      MED_SPA_BRIEF_FACTS.facts,
      [{ field: 'page.headline', text: 'It books straight into your calendar' }],
      generator,
    );

    expect(result.performed).toBe(true);
    expect(result.rejectedFields.has('page.headline')).toBe(true);
    expect(result.findings[0]!.code).toBe('unsupported_claim');
  });

  it('reports honestly that it did not run when there is no model', async () => {
    const result = await auditClaims(MED_SPA_BRIEF_FACTS.facts, [{ field: 'a', text: 'b' }], null);

    expect(result.performed).toBe(false);
    expect(result.rejectedFields.size).toBe(0);
  });

  it('does not fail the campaign when the audit call itself fails', async () => {
    const failing: StructuredTextGenerator = {
      provider: 'stub',
      model: 'stub/1',
      async generate() {
        throw new Error('audit down');
      },
    };
    const result = await auditClaims(MED_SPA_BRIEF_FACTS.facts, [{ field: 'a', text: 'b' }], failing);

    expect(result.performed).toBe(false);
  });

  it('ignores a verdict about a field it was never given', async () => {
    const generator = textGen([{ unsupported: [{ field: 'made.up', claim: 'x', reason: 'y' }] }]);
    const result = await auditClaims(MED_SPA_BRIEF_FACTS.facts, [{ field: 'a', text: 'b' }], generator);

    expect(result.rejectedFields.size).toBe(0);
  });
});

describe('authoring a campaign from facts alone', () => {
  it('writes a whole page for a document that carries no prose', async () => {
    const result = await author(briefDemo.spec, briefDemo.factSet, [
      authorship({
        sections: briefDemo.spec.sections.map((_, index) => ({
          index,
          intent: 'a beat',
          eyebrow: null,
          heading: `Heading written for the ${'abcdefgh'[index]} beat`,
          body: 'Nobody was free when the phone rang. Someone answers it now, and asks what the enquiry needs.',
          items: [],
          qa: [],
          factRefs: [],
        })),
      }),
      NO_UNSUPPORTED,
    ]);

    expect(result.generated).toBe(true);
    expect(result.audited).toBe(true);
    expect(result.overlay.headline).toContain('rang out');
    expect(result.overlay.sections.length).toBe(briefDemo.spec.sections.length);
    expect(result.accepted).toBeGreaterThan(10);
  });

  it('records the campaign plan the writer committed to', async () => {
    const result = await author(briefDemo.spec, briefDemo.factSet, [authorship(), NO_UNSUPPORTED]);

    expect(result.plan?.angle).toBe(PLAN.angle);
    expect(result.plan?.objections.length).toBe(2);
    expect(result.plan?.lengthTreatment).toBe('standard');
  });

  it('keeps the fact references each beat rests on', async () => {
    const refs = [MED_SPA_BRIEF_FACTS.facts[4]!.ref, MED_SPA_BRIEF_FACTS.facts[6]!.ref];
    const result = await author(briefDemo.spec, briefDemo.factSet, [
      authorship({
        sections: [
          {
            index: 2,
            intent: 'mechanism',
            eyebrow: null,
            heading: 'How the call actually goes',
            body: 'It answers, asks what the enquiry needs, and hands it back to you.',
            items: [],
            qa: [],
            factRefs: refs,
          },
        ],
      }),
      NO_UNSUPPORTED,
    ]);

    expect(result.overlay.sections[0]!.factRefs).toEqual(refs);
    expect(result.overlay.factRefs).toEqual([MED_SPA_BRIEF_FACTS.facts[4]!.ref]);
  });

  it('drops a cited reference that is not in the approved set', async () => {
    const bogus = `f_${'c'.repeat(64)}`;
    const result = await author(briefDemo.spec, briefDemo.factSet, [
      authorship({
        sections: [
          {
            index: 2,
            intent: 'x',
            eyebrow: null,
            heading: 'A heading',
            body: null,
            items: [],
            qa: [],
            factRefs: [bogus],
          },
        ],
      }),
      NO_UNSUPPORTED,
    ]);

    expect(result.overlay.sections[0]!.factRefs).toEqual([]);
    expect(result.findings.some((f) => f.code === 'unknown_fact_ref')).toBe(true);
  });

  it('authors items and questions for a beat the document left empty', async () => {
    const result = await author(briefDemo.spec, briefDemo.factSet, [
      authorship({
        sections: [
          {
            index: 3,
            intent: 'fit',
            eyebrow: 'Fit',
            heading: 'This is for you if',
            body: null,
            items: ['Enquiries arrive while you are with a client', 'Callbacks depend on who is free'],
            qa: [],
            factRefs: [],
          },
          {
            index: 5,
            intent: 'objections',
            eyebrow: null,
            heading: 'Before you ask',
            body: null,
            items: [],
            qa: [
              {
                question: 'Will it sound like a robot?',
                answer:
                  'Judge that yourself on the demo. It asks the questions your team would ask, in the same order.',
              },
            ],
            factRefs: [],
          },
        ],
      }),
      NO_UNSUPPORTED,
    ]);

    expect(result.overlay.sections[0]!.items).toHaveLength(2);
    expect(result.overlay.sections[1]!.qa).toHaveLength(1);
  });

  it('drops a Q&A pair whose answer fails the guard rather than half of it', async () => {
    const result = await author(briefDemo.spec, briefDemo.factSet, [
      authorship({
        sections: [
          {
            index: 5,
            intent: 'objections',
            eyebrow: null,
            heading: 'Before you ask',
            body: null,
            items: [],
            qa: [{ question: 'Does it work?', answer: 'It is clinically proven to book 40% more consultations.' }],
            factRefs: [],
          },
        ],
      }),
      NO_UNSUPPORTED,
    ]);

    expect(result.overlay.sections.find((section) => section.index === 5)?.qa).toBeUndefined();
    expect(result.findings.some((f) => f.code === 'evidence_claim' || f.code === 'novel_number')).toBe(true);
  });

  it('removes a field the audit rejects even though the guard passed it', async () => {
    const result = await author(briefDemo.spec, briefDemo.factSet, [
      authorship({
        headline: 'It books the appointment straight into your calendar',
      }),
      {
        unsupported: [
          { field: 'page.headline', claim: 'books the appointment', reason: 'No approved fact states booking.' },
        ],
      },
    ]);

    expect(result.overlay.headline).toBeUndefined();
    expect(result.findings.some((f) => f.code === 'unsupported_claim')).toBe(true);
  });

  it('produces nothing at all without a model', async () => {
    const request = await interpretBrief({ userInstruction: REQUEST }, null);
    const strategy = deriveCreativeStrategy(briefDemo.spec, request);
    const result = await authorCampaignCopy(briefDemo.spec, briefDemo.factSet, request, strategy, null);

    expect(result.generated).toBe(false);
    expect(result.overlay.sections).toEqual([]);
  });

  it('survives an authorship outage without failing the campaign', async () => {
    const failing: StructuredTextGenerator = {
      provider: 'stub',
      model: 'stub/1',
      async generate() {
        throw new Error('down');
      },
    };
    const request = await interpretBrief({ userInstruction: REQUEST }, null);
    const strategy = deriveCreativeStrategy(briefDemo.spec, request);
    const result = await authorCampaignCopy(briefDemo.spec, briefDemo.factSet, request, strategy, failing);

    expect(result.generated).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it('ignores a section index the document does not have', async () => {
    const result = await author(briefDemo.spec, briefDemo.factSet, [
      authorship({
        sections: [
          { index: 99, intent: 'x', eyebrow: null, heading: 'Injected', body: null, items: [], qa: [], factRefs: [] },
        ],
      }),
      NO_UNSUPPORTED,
    ]);

    expect(result.overlay.sections).toEqual([]);
  });
});

describe('what authored copy still cannot touch', () => {
  /**
   * The structural protection, tested at the boundary the renderer actually
   * has. A hostile overlay carrying disclosure, CTA, referral and Partner
   * fields is handed to the compiler; none of them exist on `CopyText`, so
   * none of them can reach the page.
   */
  const hostile = {
    headline: 'A calmer front desk',
    subheadline: 'Someone answers while you are with a client.',
    disclosure: 'No disclosure applies to this offer.',
    partner: 'Totally Different Partner Ltd',
    ctas: { primary: { label: 'Go here instead', url: 'https://evil.example/steal' } },
    referralUrl: 'https://evil.example/steal',
    sections: [],
  } as unknown as CopyText;

  const html = () =>
    compilePageSpecToProjectManifest(contractSpec, { direction: 'clinical-calm', copy: hostile }).manifest.files[
      '/index.html'
    ] ?? '';

  it('cannot alter the disclosure', () => {
    expect(html()).toContain(contractSpec.disclosure.text);
    expect(html()).not.toContain('No disclosure applies');
  });

  it('cannot alter the referral or CTA destination', () => {
    expect(html()).toContain(contractSpec.ctas.primary.url);
    expect(html()).toContain(contractSpec.ctas.secondary!.url);
    expect(html()).not.toContain('evil.example');
    expect(html()).not.toContain('Go here instead');
  });

  it('cannot alter Partner identity', () => {
    expect(html()).toContain(contractSpec.partner.displayName!);
    expect(html()).not.toContain('Totally Different Partner');
  });

  it('leaves the PageSpec artifact byte-identical to the contract document', () => {
    const manifest = compilePageSpecToProjectManifest(contractSpec, {
      direction: 'clinical-calm',
      copy: hostile,
    }).manifest;

    expect(JSON.parse(manifest.files['/pagespec.json'] ?? '{}')).toEqual(JSON.parse(JSON.stringify(examplePageSpec)));
  });

  it('escapes hostile authored copy', async () => {
    const run = await runCampaign(
      briefDemo.spec,
      { userInstruction: REQUEST },
      {
        factSet: briefDemo.factSet,
        textGenerator: textGen([
          INTERPRETATION,
          authorship({ headline: '<script>alert("x")</script>' }),
          NO_UNSUPPORTED,
        ]),
        imageGenerator: new PlaceholderImageGenerator(),
        store: new MemoryStore(),
        skipImages: true,
      },
    );
    const { copy } = campaignRenderInputs(run);
    const rendered =
      compilePageSpecToProjectManifest(briefDemo.spec, { direction: run.strategy.directionId, copy }).manifest.files[
        '/index.html'
      ] ?? '';

    expect(rendered).not.toContain('<script>alert("x")</script>');
    expect(rendered).toContain('&lt;script&gt;');
  });
});

describe('the campaign pipeline end to end', () => {
  it('renders authored copy for a document that supplied none', async () => {
    const spec = briefDemo.spec;
    const authored = {
      ...authorship(),
      sections: spec.sections.map((_, index) => ({
        index,
        intent: 'x',
        eyebrow: null,
        heading: `Authored heading ${'abcdefgh'[index]}`,
        body: 'Nobody was free when it rang. Someone answers now and asks what the enquiry needs.',
        items: [],
        qa: [],
        factRefs: [],
      })),
    };

    const run = await runCampaign(
      spec,
      { userInstruction: REQUEST },
      {
        factSet: briefDemo.factSet,
        textGenerator: textGen([INTERPRETATION, authored, NO_UNSUPPORTED]),
        imageGenerator: new PlaceholderImageGenerator(),
        store: new MemoryStore(),
      },
    );

    const { copy, generatedMedia } = campaignRenderInputs(run);
    const rendered =
      compilePageSpecToProjectManifest(spec, {
        direction: run.strategy.directionId,
        generatedMedia,
        copy,
      }).manifest.files['/index.html'] ?? '';

    expect(rendered).toContain('Authored heading a');
    expect(rendered).toContain('The call that rang out');
    expect(run.assets.length).toBe(run.needs.length);

    /*
     * The reader sees the authored campaign, not the fact sheet. Every beat's
     * heading differs from the neutral label the document carried, and the
     * hook is not the document's own plain product line.
     */
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(rendered)?.[1] ?? '';
    expect(h1).not.toContain(spec.page.headline);

    for (const section of spec.sections) {
      expect(rendered).not.toContain(`>${section.heading}</h2>`);
    }
  });

  it('keeps the document’s own copy when no fact set authorises a campaign', async () => {
    const run = await runCampaign(
      contractSpec,
      { userInstruction: REQUEST },
      {
        textGenerator: textGen([INTERPRETATION]),
        imageGenerator: new PlaceholderImageGenerator(),
        store: new MemoryStore(),
        skipImages: true,
      },
    );

    expect(run.copy.generated).toBe(false);
    expect(campaignRenderInputs(run).copy).toBeUndefined();
  });

  it('reports fact coverage for the document it ran against', async () => {
    const run = await runCampaign(
      contractSpec,
      { userInstruction: REQUEST },
      {
        factSet: MED_SPA_CONTRACT_FACTS,
        textGenerator: null,
        imageGenerator: new PlaceholderImageGenerator(),
        store: new MemoryStore(),
        skipImages: true,
      },
    );

    expect(run.coverage.unresolvedRefs).toEqual([]);
    expect(run.factSet.id).toBe('med-spa-contract');
  });

  it('lets a beat’s authored list choose the layout the document could not', async () => {
    const spec = briefDemo.spec;
    const authored = {
      ...authorship(),
      sections: [
        {
          index: 3,
          intent: 'fit',
          eyebrow: 'Fit',
          heading: 'This is for you if',
          body: null,
          items: ['Enquiries arrive mid-treatment', 'Callbacks depend on who is free', 'The desk is the bottleneck'],
          qa: [],
          factRefs: [],
        },
      ],
    };

    const run = await runCampaign(
      spec,
      { userInstruction: REQUEST },
      {
        factSet: briefDemo.factSet,
        textGenerator: textGen([INTERPRETATION, authored, NO_UNSUPPORTED]),
        imageGenerator: new PlaceholderImageGenerator(),
        store: new MemoryStore(),
        skipImages: true,
      },
    );

    const { copy } = campaignRenderInputs(run);
    const result = compilePageSpecToProjectManifest(spec, { direction: run.strategy.directionId, copy });
    const presentation = result.plan.sections.find((section) => section.sourceIndex === 3)!;

    expect(presentation.layout).not.toBe('editorial-prose');
    expect(result.manifest.files['/index.html']).toContain('Enquiries arrive mid-treatment');
  });
});

describe('two verticals, two campaigns', () => {
  /**
   * The writer is stubbed so the test measures plumbing rather than a model:
   * it echoes the facts it was actually shown. If both verticals reached the
   * writer with the same material, the pages would come out the same — and
   * they do not.
   */
  function factEchoWriter(): StructuredTextGenerator {
    let call = 0;

    return {
      provider: 'stub',
      model: 'stub-text/1',
      async generate<T>(request: { user: string }) {
        call += 1;

        if (call === 1) {
          return INTERPRETATION as T;
        }

        if (call === 3) {
          return NO_UNSUPPORTED as T;
        }

        /* Read the fact set out of the prompt the authoring stage built. */
        const facts = request.user
          .split('\n')
          .filter((line) => line.startsWith('f_'))
          .map((line) => line.slice(line.indexOf(': ') + 2));

        return {
          campaign: { ...PLAN, angle: facts[0] ?? 'none' },
          audience: facts.find((fact) => fact.includes('target market')) ?? 'someone',
          headline: facts[0] ?? 'none',
          subheadline: facts[1] ?? 'none',
          pageFactRefs: [],
          sections: [
            {
              index: 2,
              intent: 'mechanism',
              eyebrow: null,
              heading: facts[2] ?? 'none',
              body: facts.slice(0, 4).join(' '),
              items: [],
              qa: [],
              factRefs: [],
            },
          ],
        } as T;
      },
    };
  }

  async function campaign(id: string) {
    const demo = demoSpec(id);
    const run = await runCampaign(
      demo.spec,
      { userInstruction: 'Write the best campaign you can for this offer.' },
      {
        factSet: demo.factSet,
        textGenerator: factEchoWriter(),
        imageGenerator: new PlaceholderImageGenerator(),
        store: new MemoryStore(),
        skipImages: true,
      },
    );

    return { demo, run };
  }

  it('reaches the writer with a different fact set per vertical', async () => {
    const medSpa = await campaign('med-spa-brief');
    const hvac = await campaign('hvac');

    expect(medSpa.run.copy.overlay.headline).not.toBe(hvac.run.copy.overlay.headline);
    expect(medSpa.run.copy.overlay.sections[0]!.body).not.toBe(hvac.run.copy.overlay.sections[0]!.body);
    expect(hvac.run.copy.overlay.sections[0]!.body).toContain('quote');
  });

  it('gives the two verticals materially different pages', async () => {
    const medSpa = await campaign('med-spa-brief');
    const hvac = await campaign('hvac');

    expect(medSpa.run.strategy.directionId).not.toBe(hvac.run.strategy.directionId);

    const render = ({ demo, run }: Awaited<ReturnType<typeof campaign>>) =>
      compilePageSpecToProjectManifest(demo.spec, {
        direction: run.strategy.directionId,
        copy: campaignRenderInputs(run).copy,
      }).manifest.files['/index.html'] ?? '';

    const medSpaHtml = render(medSpa);
    const hvacHtml = render(hvac);

    expect(medSpaHtml).not.toBe(hvacHtml);
    expect(medSpaHtml).toContain('consultation');
    expect(hvacHtml).toContain('quote');
    expect(medSpaHtml).not.toContain('emergency dispatch decisions');
  });

  it('still produces different presentation strategies for different briefs', async () => {
    const briefs = [
      REQUEST,
      'Bold high-urgency direct response for HVAC companies losing jobs. Punchy and scannable.',
      'Minimal typographic page with no images. Understated and restrained.',
    ];

    const runs = await Promise.all(
      briefs.map((brief) =>
        runCampaign(
          briefDemo.spec,
          { userInstruction: brief },
          {
            factSet: briefDemo.factSet,
            textGenerator: null,
            imageGenerator: new PlaceholderImageGenerator(),
            store: new MemoryStore(),
            skipImages: true,
          },
        ),
      ),
    );

    const signatures = runs.map((run) =>
      [run.strategy.imageStrategy, run.request.tone, run.strategy.ctaIntensity, run.needs.length].join('|'),
    );

    expect(new Set(signatures).size).toBe(3);
    expect(runs[2]!.needs).toEqual([]);
  });
});

describe('document text remains available as support', () => {
  it('collects every authored string the document carries', () => {
    const text = documentText(contractSpec);

    expect(text).toContain(contractSpec.page.headline);
    expect(text.some((entry) => entry.includes('spare ten minutes'))).toBe(true);
  });

  it('sees the fact sheet as plain statements, not as campaign copy', () => {
    const text = documentText(briefDemo.spec);
    const factText = new Set(briefDemo.factSet.facts.map((fact) => fact.text));

    /* Everything the document asserts is an approved fact restated verbatim. */
    const asserted = briefDemo.spec.sections
      .filter((section) => section.provenance.factRefs.length > 0)
      .flatMap((section) => [...(section.items ?? []), ...(section.qa ?? []).map((pair) => pair.answer)]);

    expect(asserted.length).toBeGreaterThan(0);
    expect(asserted.every((entry) => factText.has(entry))).toBe(true);
    expect(text).toContain(briefDemo.spec.page.headline);
  });

  it('lets a rewrite of the contract document keep its own vocabulary', async () => {
    const request = normaliseCreativeRequest({ userInstruction: REQUEST });
    const support = supportContext(MED_SPA_CONTRACT_FACTS.facts, documentText(contractSpec));

    expect(request.vertical).toBe('med-spa');
    expect(guardCopy('h', 'Ten minutes is all anyone has spare.', support)).toEqual([]);
  });
});

describe('every demo document has a fact set behind it', () => {
  for (const demo of DEMO_SPECS) {
    it(`${demo.id} carries approved facts`, () => {
      expect(demo.factSet.facts.length).toBeGreaterThan(0);
      expect(demo.factSet.authority).not.toBe('growth-engine');
    });
  }

  it('pairs each document with the fact set for its own market', () => {
    expect(demoSpec('hvac').factSet).toBe(HVAC_FACTS);
    expect(demoSpec('med-spa').factSet).toBe(MED_SPA_CONTRACT_FACTS);
    expect(demoSpec('med-spa-brief').factSet).toBe(MED_SPA_BRIEF_FACTS);
  });
});
