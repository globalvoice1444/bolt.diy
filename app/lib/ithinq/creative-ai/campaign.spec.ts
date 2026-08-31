import { describe, expect, it } from 'vitest';
import examplePageSpec from '@ithinq-pagespec/page-spec.example.json';
import type { PageSpec } from '@ithinq-pagespec/page-spec';
import { compilePageSpecToProjectManifest } from '~/lib/ithinq/pagespec/compiler';
import { guardCopy, safeCopy } from './copy-guard';
import { interpretBrief } from './interpret';
import { generateCopy } from './copy';
import { campaignRenderInputs, runCampaign } from './campaign';
import { PlaceholderImageGenerator } from './provider/placeholder';
import type { StructuredTextGenerator } from './provider/openai-text';
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

const MED_SPA = 'Create a premium campaign for Med Spas. Elegant, persuasive, image-forward, high-converting.';

/** runCampaign calls the text model twice: interpretation, then copy. */
const INTERPRETATION = {
  objective: 'Book more consultations.',
  vertical: 'med-spa',
  audience: 'practice managers',
  tone: 'elegant',
  imagePreference: 'image-forward',
  conversionGoal: 'book-demo',
  creativeDirection: null,
  angle: 'Lead with the unanswered phone.',
};

describe('copy truth guard', () => {
  const source = ['Answers inbound calls while the team is with clients.', 'Follow-up depends on who has ten minutes.'];

  it('accepts a faithful rephrasing', () => {
    expect(guardCopy('h', 'Calls answered while your team is with clients.', source)).toEqual([]);
  });

  it('rejects an invented statistic', () => {
    const findings = guardCopy('h', 'Answers 87% of inbound calls automatically.', source);

    expect(findings.some((f) => f.code === 'novel_number')).toBe(true);
  });

  it('rejects invented pricing', () => {
    const findings = guardCopy('h', 'Only $49 per month for every clinic.', source);

    expect(findings.some((f) => f.code === 'novel_currency' || f.code === 'novel_number')).toBe(true);
  });

  it('rejects fabricated evidence vocabulary', () => {
    for (const claim of [
      'Clinically proven to book more consultations.',
      'Award-winning assistant trusted by clinics.',
      'Results guaranteed or your money back.',
      'Rated five-star by practice managers.',
    ]) {
      expect(guardCopy('h', claim, source).some((f) => f.code === 'evidence_claim')).toBe(true);
    }
  });

  it('rejects marketing cliches the brief bans', () => {
    for (const cliche of [
      'Elevate your med spa with an AI assistant.',
      'Effortless integration for a busy front desk.',
      'Transform how your clinic answers the phone.',
      'Seamlessly handle every enquiry.',
    ]) {
      expect(guardCopy('h', cliche, source).some((f) => f.code === 'cliche')).toBe(true);
    }
  });

  it('permits a banned word when the contract itself uses it', () => {
    expect(guardCopy('h', 'A seamless handover to the team.', ['a seamless handover to the team'])).toEqual([]);
  });

  it('allows a number that genuinely appears in the source', () => {
    expect(guardCopy('h', 'Ten minutes is all anyone has spare.', ['who has a spare ten minutes'])).toEqual([]);
  });

  it('safeCopy returns null and records findings rather than passing bad copy through', () => {
    const findings: ReturnType<typeof guardCopy> = [];

    expect(safeCopy('h', 'Trusted by 4,000 clinics.', source, findings)).toBeNull();
    expect(findings.length).toBeGreaterThan(0);
    expect(safeCopy('h', 'Calls answered while you work.', source, findings)).toBe('Calls answered while you work.');
  });
});

describe('brief interpretation', () => {
  it('uses the model result when available', async () => {
    const generator = textGen([
      {
        objective: 'Book more consultations.',
        vertical: 'med-spa',
        audience: 'practice managers',
        tone: 'elegant',
        imagePreference: 'image-forward',
        conversionGoal: 'book-demo',
        creativeDirection: null,
        angle: 'Lead with the moment the phone goes unanswered.',
      },
    ]);
    const result = await interpretBrief({ userInstruction: MED_SPA }, generator);

    expect(result.modelInterpreted).toBe(true);
    expect(result.tone).toBe('elegant');
    expect(result.angle).toContain('phone');
  });

  it('falls back to deterministic reading when no model is available', async () => {
    const result = await interpretBrief({ userInstruction: MED_SPA }, null);

    expect(result.modelInterpreted).toBe(false);
    expect(result.tone).toBe('elegant');
  });

  it('falls back when the model throws rather than failing the campaign', async () => {
    const failing: StructuredTextGenerator = {
      provider: 'stub',
      model: 'stub/1',
      async generate() {
        throw new Error('model down');
      },
    };
    const result = await interpretBrief({ userInstruction: MED_SPA }, failing);

    expect(result.modelInterpreted).toBe(false);
  });

  it('normalises a hostile direction value instead of trusting it', async () => {
    const generator = textGen([
      {
        objective: 'x',
        vertical: null,
        audience: null,
        tone: 'elegant',
        imagePreference: 'balanced',
        conversionGoal: 'book-demo',
        creativeDirection: '../evil',
        angle: 'y',
      },
    ]);
    const result = await interpretBrief({ userInstruction: MED_SPA }, generator);

    expect(result.creativeDirection).toBeNull();
  });
});

describe('copy generation', () => {
  it('drops fabricated fields and keeps faithful ones', async () => {
    const spec = fixture();
    const generator = textGen([
      {
        headline: 'The front desk cannot be in two places at once',
        subheadline: 'Answers 92% of calls and books them automatically.',
        sections: [{ index: 0, eyebrow: null, heading: 'When the desk is busy', body: null }],
      },
    ]);

    const request = await interpretBrief({ userInstruction: MED_SPA }, null);
    const strategy = { copyStyle: 'editorial', narrativeAngle: 'problem-first' } as never;
    const result = await generateCopy(spec, request, strategy, generator);

    expect(result.overlay.headline).toBe('The front desk cannot be in two places at once');
    expect(result.overlay.subheadline).toBeUndefined();
    expect(result.rejected).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.code === 'novel_number')).toBe(true);
  });

  it('returns an empty overlay when no text model is available', async () => {
    const request = await interpretBrief({ userInstruction: MED_SPA }, null);
    const result = await generateCopy(fixture(), request, { copyStyle: 'plain' } as never, null);

    expect(result.generated).toBe(false);
    expect(result.overlay.sections).toEqual([]);
  });
});

describe('campaign pipeline', () => {
  it('runs brief to assets and exposes renderer inputs', async () => {
    const store = new MemoryStore();
    const run = await runCampaign(
      fixture(),
      { userInstruction: MED_SPA },
      {
        textGenerator: null,
        imageGenerator: new PlaceholderImageGenerator(),
        store,
      },
    );

    expect(run.needs.length).toBeGreaterThan(0);
    expect(run.assets.length).toBe(run.needs.length);

    const inputs = campaignRenderInputs(run);
    expect(inputs.generatedMedia.length).toBe(run.assets.length);
  });

  it('renders generated copy without touching the PageSpec artifact', async () => {
    const spec = fixture();
    const generator = textGen([
      INTERPRETATION,
      {
        headline: 'The front desk cannot be in two places at once',
        subheadline: 'Calls answered while your team is with a client.',
        sections: [],
      },
    ]);

    const run = await runCampaign(
      spec,
      { userInstruction: MED_SPA },
      { textGenerator: generator, imageGenerator: new PlaceholderImageGenerator(), store: new MemoryStore() },
    );
    const { copy, generatedMedia } = campaignRenderInputs(run);
    const { manifest } = compilePageSpecToProjectManifest(spec, {
      direction: run.strategy.directionId,
      generatedMedia,
      copy,
    });

    const html = manifest.files['/index.html'] ?? '';
    const pagespec = manifest.files['/pagespec.json'] ?? '';

    /*
     * Assert on the hero heading specifically. The fixture reuses the headline
     * sentence as section 0's body, so a document-wide "not to contain" would
     * be checking the wrong thing.
     */
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '';
    expect(h1).toContain('The front desk cannot be in two places at once');
    expect(h1).not.toContain(spec.page.headline);

    // The contract artifact is untouched by generated copy.
    expect(JSON.parse(pagespec)).toEqual(JSON.parse(JSON.stringify(fixture())));
    expect(pagespec).toContain(spec.page.headline);
  });

  it('never lets generated copy alter CTA, referral or disclosure', async () => {
    const spec = fixture();
    const generator = textGen([
      INTERPRETATION,
      {
        headline: 'A calmer front desk',
        subheadline: 'Calls answered while your team is with a client.',
        sections: [],
      },
    ]);

    const run = await runCampaign(
      spec,
      { userInstruction: MED_SPA },
      { textGenerator: generator, imageGenerator: new PlaceholderImageGenerator(), store: new MemoryStore() },
    );
    const { copy } = campaignRenderInputs(run);
    const html =
      compilePageSpecToProjectManifest(spec, { direction: run.strategy.directionId, copy }).manifest.files[
        '/index.html'
      ] ?? '';

    expect(html).toContain(spec.ctas.primary.url);
    expect(html).toContain(spec.ctas.secondary!.url);
    expect(html).toContain(spec.ctas.primary.label);
    expect(html).toContain(spec.disclosure.text);
    expect(html).toContain(spec.partner.displayName!);
  });

  it('escapes hostile generated copy', async () => {
    const spec = fixture();

    /*
     * Deliberately digit-free: the truth guard rejects novel numbers, so a
     * payload containing "1" would be dropped before escaping was ever
     * exercised — which would make this test pass for the wrong reason.
     */
    const generator = textGen([
      INTERPRETATION,
      { headline: '<script>alert("x")</script>', subheadline: 'Calls answered.', sections: [] },
    ]);

    const run = await runCampaign(
      spec,
      { userInstruction: MED_SPA },
      { textGenerator: generator, imageGenerator: new PlaceholderImageGenerator(), store: new MemoryStore() },
    );
    const { copy } = campaignRenderInputs(run);
    const html =
      compilePageSpecToProjectManifest(spec, { direction: run.strategy.directionId, copy }).manifest.files[
        '/index.html'
      ] ?? '';

    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('also rejects an injection payload that trips the truth guard', async () => {
    const spec = fixture();
    const generator = textGen([
      INTERPRETATION,
      { headline: '<script>alert(1)</script>', subheadline: 'Calls answered.', sections: [] },
    ]);

    const run = await runCampaign(
      spec,
      { userInstruction: MED_SPA },
      { textGenerator: generator, imageGenerator: new PlaceholderImageGenerator(), store: new MemoryStore() },
    );

    // The digit "1" is a novel number, so the guard drops it before rendering.
    expect(run.copy.overlay.headline).toBeUndefined();
    expect(run.copy.findings.some((f) => f.code === 'novel_number')).toBe(true);
  });

  it('survives a text-model outage and still produces a page', async () => {
    const spec = fixture();
    const failing: StructuredTextGenerator = {
      provider: 'stub',
      model: 'stub/1',
      async generate() {
        throw new Error('down');
      },
    };

    const run = await runCampaign(
      spec,
      { userInstruction: MED_SPA },
      { textGenerator: failing, imageGenerator: new PlaceholderImageGenerator(), store: new MemoryStore() },
    );
    const { copy } = campaignRenderInputs(run);
    const html =
      compilePageSpecToProjectManifest(spec, { direction: run.strategy.directionId, copy }).manifest.files[
        '/index.html'
      ] ?? '';

    expect(copy).toBeUndefined();
    expect(html).toContain(spec.page.headline);
  });

  it('produces different strategies for materially different briefs', async () => {
    const spec = fixture();
    const briefs = [
      MED_SPA,
      'Bold high-urgency direct response for HVAC companies losing jobs. Punchy and scannable.',
      'Minimal typographic page with no images. Understated and restrained.',
    ];

    const runs = await Promise.all(
      briefs.map((brief) =>
        runCampaign(
          spec,
          { userInstruction: brief },
          {
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
