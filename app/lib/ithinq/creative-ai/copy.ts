import type { PageSpec } from '@ithinq-pagespec/page-spec';
import { guardFactRefs, safeCopy, supportContext, type CopyFinding, type SupportContext } from './copy-guard';
import { auditClaims, type AuditedField } from './claim-audit';
import { documentText, factsForSection, type ApprovedFact, type ApprovedFactSet } from './facts';
import type { InterpretedRequest } from './interpret';
import type { CreativeStrategy } from './strategy';
import type { StructuredTextGenerator } from './provider/openai-text';

/**
 * Authored campaign copy.
 *
 * Renderer-local, and deliberately unable to address the disclosure, the CTAs,
 * the referral URL or the Partner's identity: those fields do not exist on
 * this type, so no amount of model output can reach them however the copy is
 * produced. The PageSpec artifact is untouched — this is an overlay the
 * composer prefers when present and falls back from when absent.
 */
export interface SectionCopy {
  index: number;
  eyebrow?: string;
  heading?: string;
  body?: string;
  items?: string[];
  qa?: Array<{ question: string; answer: string }>;

  /** Approved facts this section's copy rests on. Traceability, not content. */
  factRefs: string[];

  /** The writer's own note on what this beat is doing. Never rendered. */
  intent?: string;
}

export interface CopyOverlay {
  headline?: string;
  subheadline?: string;
  audience?: string;
  sections: SectionCopy[];
  factRefs?: string[];
}

/** How the writer decided to sell it. Reviewer-facing; never rendered as copy. */
export interface CampaignPlan {
  angle: string;
  awarenessLevel: string;
  framework: string;
  promise: string;
  objections: string[];
  lengthTreatment: LengthTreatment;
}

export type LengthTreatment = 'concise' | 'standard' | 'long-form';

export interface CopyResult {
  overlay: CopyOverlay;
  plan: CampaignPlan | null;
  findings: CopyFinding[];

  /** Fields the writer produced that a guard or the audit rejected. */
  rejected: number;

  /** Fields that reached the page. */
  accepted: number;
  generated: boolean;

  /** False when the semantic claim audit did not run. */
  audited: boolean;
}

const LENGTH_TREATMENTS = ['concise', 'standard', 'long-form'] as const;

/**
 * Length budgets, chosen by the writer rather than fixed by the renderer.
 *
 * A cap is a guard against a runaway generation, not an editorial opinion: a
 * long-form page is a legitimate creative decision and the system should be
 * able to produce one.
 */
const BUDGETS: Readonly<Record<LengthTreatment, Record<string, number>>> = {
  concise: { headline: 110, subheadline: 220, eyebrow: 60, heading: 90, body: 420, item: 140, qa: 460 },
  standard: { headline: 160, subheadline: 300, eyebrow: 80, heading: 120, body: 900, item: 180, qa: 760 },
  'long-form': { headline: 180, subheadline: 360, eyebrow: 80, heading: 150, body: 1600, item: 260, qa: 1200 },
};

const AUTHORSHIP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['campaign', 'audience', 'headline', 'subheadline', 'pageFactRefs', 'sections'],
  properties: {
    /*
     * The plan comes first on purpose. Structured output is produced in
     * property order, so committing to an angle, a framework and the
     * objections to face before writing a word is the difference between a
     * campaign and a page of adjectives.
     */
    campaign: {
      type: 'object',
      additionalProperties: false,
      required: ['angle', 'awarenessLevel', 'framework', 'promise', 'objections', 'lengthTreatment'],
      properties: {
        angle: { type: 'string', description: 'The campaign angle in one sentence. What makes this land.' },
        awarenessLevel: {
          type: 'string',
          enum: ['unaware', 'problem-aware', 'solution-aware', 'product-aware', 'most-aware'],
        },
        framework: {
          type: 'string',
          description:
            'The persuasive approach you have chosen and why, in one sentence. Choose whatever suits this offer and reader; there is no house framework.',
        },
        promise: { type: 'string', description: 'The single promise the page makes, in the reader’s terms.' },
        objections: {
          type: 'array',
          description: 'The real objections this reader will raise, in the order the page should meet them.',
          items: { type: 'string' },
        },
        lengthTreatment: { type: 'string', enum: [...LENGTH_TREATMENTS] },
      },
    },
    audience: { type: 'string', description: 'Who this page is speaking to, in a short phrase.' },
    headline: { type: 'string', description: 'The hook. Original. Not a restatement of the product name.' },
    subheadline: { type: 'string' },
    pageFactRefs: {
      type: 'array',
      description: 'Refs of the approved facts the headline and subheadline rest on. Empty if they assert none.',
      items: { type: 'string' },
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'intent', 'eyebrow', 'heading', 'body', 'items', 'qa', 'factRefs'],
        properties: {
          index: { type: 'integer', description: 'The section index you were given. Never invent one.' },
          intent: { type: 'string', description: 'What this beat does in the argument. One short line.' },
          eyebrow: { type: ['string', 'null'] },
          heading: { type: ['string', 'null'] },
          body: { type: ['string', 'null'] },
          items: {
            type: 'array',
            description: 'A list where a list genuinely helps. Empty otherwise. Never a list of adjectives.',
            items: { type: 'string' },
          },
          qa: {
            type: 'array',
            description: 'Questions and answers where the beat calls for them. Empty otherwise.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['question', 'answer'],
              properties: { question: { type: 'string' }, answer: { type: 'string' } },
            },
          },
          factRefs: {
            type: 'array',
            description: 'Refs of the approved facts this section asserts from. Empty if it asserts none.',
            items: { type: 'string' },
          },
        },
      },
    },
  },
} as const;

const SYSTEM = `You are a campaign strategist and copywriter. You are writing the page, not editing one.

You will be given a Partner's request, a creative strategy, an APPROVED FACT
SET, and the page's structure as a list of beats. Decide how to sell this, then
write every word of it.

WHAT IS YOURS
The angle. The promise. The persuasive approach. The order the argument runs in.
The emotional register. The length. Whether a beat is prose, a list or a
question and answer. Every headline, subhead, sentence, item, question, answer
and closing line. Metaphor, rhetorical questions, direct address, urgency,
humour if it fits. Write like a person with a point of view, not a committee.

WHAT IS NOT YOURS
Facts. The approved fact set is the complete list of what may be asserted about
the product, the company, and what a customer gets. You may express any of it
in any words you like, at any length, in any order, and you may leave facts out.
You may not add one.

If the fact set does not say it, you cannot claim it. No capability, no
integration, no timescale, no quantity, no price, no result, no proof, no
award, no rating, no guarantee, no testimonial, no "hundreds of businesses".
If you catch yourself reaching for a number, stop.

THE READER'S WORLD IS YOURS
Describing the reader's day is not a product claim. Their phone ringing during
a treatment, the voicemail nobody returns, the caller who rings the next place
on the list — write all of that as vividly as you can. That is where the page
is won, and it needs no fact behind it.

BOUNDARY FACTS ARE AN ASSET
Some approved facts state a limit — what this does not do, or what depends on
setup. Never contradict one. Better: use them. A page that says plainly what
something will not do is trusted on what it will, and it disarms the objection
before the reader raises it.

HOW TO WRITE
- Open on a concrete moment, not an abstract benefit.
- Plain nouns and verbs. The reader's vocabulary, not corporate register.
- Vary sentence length. Short sentences carry weight.
- Sentence case always. Never Title Case A Heading Like This.
- Specific beats general. If a line would work for any company in any industry,
  it is filler. Delete it and write the real one.
- Vary the shape of the page. Not every beat is three benefit bullets. Some are
  a paragraph, some a single line, some a real question honestly answered.
- Answer FAQ questions properly. An answer that dodges is worse than no FAQ.
- The closing ask should sound like a person offering something, not a banner.

NEVER WRITE
"Transform", "Elevate", "Unlock", "Revolutionise", "Empower", "Streamline",
"Seamless", "Effortless", "Supercharge", "Take X to the next level", "Discover
the power of", "In today's fast-paced world", "Say goodbye to", "Game-changer",
"Cutting-edge". Never open a headline with a benefit verb aimed at the reader.
Never append the product name to a benefit phrase and call it a headline.

CITING FACTS
For each section, list the refs of the approved facts its copy asserts from.
Cite only refs you were given, exactly as written. A beat that asserts nothing
about the product — a scenario, the reader's own problem — cites nothing, and
that is correct.`;

function budget(treatment: LengthTreatment, key: string): number {
  return BUDGETS[treatment][key] ?? BUDGETS.standard[key] ?? 320;
}

function factLine(fact: ApprovedFact): string {
  return `${fact.ref} (${fact.kind}): ${fact.text}`;
}

/**
 * What the writer is shown for one beat.
 *
 * The document's existing copy, when it has any, is offered as context and
 * explicitly not as something to rewrite — a Phase 4 page is authored, and a
 * document with no prose at all is the case this whole phase exists for.
 */
function sectionFrame(spec: PageSpec, set: ApprovedFactSet, index: number) {
  const section = spec.sections[index]!;
  const { facts } = factsForSection(spec, set, index);
  const existing = [section.heading, section.body, ...(section.items ?? [])].filter(Boolean);

  return {
    index,
    kind: section.kind,
    purpose: section.purpose,
    emphasis: section.emphasis ?? 'support',
    factsForThisBeat: facts.map(factLine),
    documentAlreadySays: existing.length > 0 ? existing : null,
  };
}

/**
 * Author the campaign.
 *
 * Every returned field has passed the deterministic guard and, when a model
 * was reachable, the semantic claim audit. Anything rejected is dropped and
 * the page falls back to whatever the document itself carried, so a bad
 * generation degrades toward truth rather than toward a lie.
 */
export async function authorCampaignCopy(
  spec: PageSpec,
  set: ApprovedFactSet,
  request: InterpretedRequest,
  strategy: CreativeStrategy,
  generator: StructuredTextGenerator | null,
): Promise<CopyResult> {
  const empty: CopyResult = {
    overlay: { sections: [] },
    plan: null,
    findings: [],
    rejected: 0,
    accepted: 0,
    generated: false,
    audited: false,
  };

  if (!generator) {
    return empty;
  }

  const frames = spec.sections.map((_, index) => sectionFrame(spec, set, index));

  let result: {
    campaign: CampaignPlan;
    audience: string;
    headline: string;
    subheadline: string;
    pageFactRefs: string[];
    sections: Array<{
      index: number;
      intent: string;
      eyebrow: string | null;
      heading: string | null;
      body: string | null;
      items: string[];
      qa: Array<{ question: string; answer: string }>;
      factRefs: string[];
    }>;
  };

  try {
    result = await generator.generate({
      system: SYSTEM,
      user: [
        `PARTNER REQUEST:\n${request.userInstruction || request.objective}`,
        request.angle ? `\nCREATIVE ANGLE ALREADY CHOSEN:\n${request.angle}` : '',
        `\nSTRATEGY:\ntone ${request.tone}; copy style ${strategy.copyStyle}; narrative ${strategy.narrativeAngle}; ` +
          `CTA intensity ${strategy.ctaIntensity}; conversion goal ${request.conversionGoal}.`,
        `\nWHAT THE PAGE IS ABOUT:\n${set.subject}`,
        `\nAPPROVED FACT SET — the complete list of what you may assert:\n${set.facts.map(factLine).join('\n')}`,
        `\nTHE PAGE'S BEATS — write every one, keep the indices, keep the order:\n${JSON.stringify(frames, null, 2)}`,
        '\nWrite the campaign.',
      ]
        .filter(Boolean)
        .join('\n'),
      schema: AUTHORSHIP_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'campaign_authorship',
      temperature: 0.9,
    });
  } catch {
    return empty;
  }

  const treatment: LengthTreatment = (LENGTH_TREATMENTS as readonly string[]).includes(result.campaign?.lengthTreatment)
    ? result.campaign.lengthTreatment
    : 'standard';

  const support: SupportContext = supportContext(set.facts, documentText(spec));
  const findings: CopyFinding[] = [];

  /*
   * Held aside rather than assembled directly: the semantic audit runs over
   * everything that survived the deterministic guard, and a field it rejects
   * must not reach the page even though the guard passed it.
   */
  const kept = new Map<string, string>();

  const take = (field: string, candidate: string | null | undefined, key: string): string | undefined => {
    const value = safeCopy(field, candidate, support, findings, budget(treatment, key));

    if (value) {
      kept.set(field, value);
      return value;
    }

    return undefined;
  };

  const overlay: CopyOverlay = { sections: [] };
  const audited: AuditedField[] = [];

  findings.push(...guardFactRefs('page', result.pageFactRefs ?? [], support));
  overlay.factRefs = (result.pageFactRefs ?? []).filter((ref) => support.knownRefs.has(ref));

  overlay.headline = take('page.headline', result.headline, 'headline');
  overlay.subheadline = take('page.subheadline', result.subheadline, 'subheadline');
  overlay.audience = take('page.audience', result.audience, 'eyebrow');

  for (const candidate of result.sections ?? []) {
    const index = candidate.index;

    if (!Number.isInteger(index) || index < 0 || index >= spec.sections.length) {
      continue;
    }

    findings.push(...guardFactRefs(`section.${index}`, candidate.factRefs ?? [], support));

    const entry: SectionCopy = {
      index,
      factRefs: (candidate.factRefs ?? []).filter((ref) => support.knownRefs.has(ref)),
      intent: candidate.intent?.trim() || undefined,
    };

    entry.eyebrow = take(`section.${index}.eyebrow`, candidate.eyebrow, 'eyebrow');
    entry.heading = take(`section.${index}.heading`, candidate.heading, 'heading');
    entry.body = take(`section.${index}.body`, candidate.body, 'body');

    const items = (candidate.items ?? [])
      .map((item, position) => take(`section.${index}.item.${position}`, item, 'item'))
      .filter((item): item is string => Boolean(item));

    if (items.length > 0) {
      entry.items = items;
    }

    const qa: Array<{ question: string; answer: string }> = [];

    (candidate.qa ?? []).forEach((pair, position) => {
      const field = `section.${index}.qa.${position}`;
      const before = findings.length;
      const question = safeCopy(field, pair?.question, support, findings, budget(treatment, 'heading'));
      const answer = safeCopy(field, pair?.answer, support, findings, budget(treatment, 'qa'));

      /* A question without its answer is worse than no question at all. */
      if (question && answer && findings.length === before) {
        qa.push({ question, answer });
        kept.set(field, `${question} ${answer}`);
      }
    });

    if (qa.length > 0) {
      entry.qa = qa;
    }

    if (entry.eyebrow || entry.heading || entry.body || entry.items || entry.qa) {
      overlay.sections.push(entry);
    }
  }

  for (const [field, text] of kept) {
    audited.push({ field, text });
  }

  const audit = await auditClaims(set.facts, audited, generator);
  findings.push(...audit.findings);

  const strip = (field: string, value?: string) => (value && audit.rejectedFields.has(field) ? undefined : value);

  overlay.headline = strip('page.headline', overlay.headline);
  overlay.subheadline = strip('page.subheadline', overlay.subheadline);
  overlay.audience = strip('page.audience', overlay.audience);

  overlay.sections = overlay.sections
    .map((entry) => {
      const next: SectionCopy = { ...entry };
      next.eyebrow = strip(`section.${entry.index}.eyebrow`, entry.eyebrow);
      next.heading = strip(`section.${entry.index}.heading`, entry.heading);
      next.body = strip(`section.${entry.index}.body`, entry.body);

      const items = (entry.items ?? []).filter(
        (_, position) => !audit.rejectedFields.has(`section.${entry.index}.item.${position}`),
      );
      next.items = items.length > 0 ? items : undefined;

      const qa = (entry.qa ?? []).filter(
        (_, position) => !audit.rejectedFields.has(`section.${entry.index}.qa.${position}`),
      );
      next.qa = qa.length > 0 ? qa : undefined;

      return next;
    })
    .filter((entry) => entry.eyebrow || entry.heading || entry.body || entry.items || entry.qa);

  const accepted = countAccepted(overlay);

  return {
    overlay,
    plan: { ...result.campaign, lengthTreatment: treatment },
    findings,
    rejected: kept.size - accepted + countRefFindings(findings),
    accepted,
    generated: true,
    audited: audit.performed,
  };
}

function countAccepted(overlay: CopyOverlay): number {
  let total = [overlay.headline, overlay.subheadline, overlay.audience].filter(Boolean).length;

  for (const section of overlay.sections) {
    total += [section.eyebrow, section.heading, section.body].filter(Boolean).length;
    total += section.items?.length ?? 0;
    total += section.qa?.length ?? 0;
  }

  return total;
}

function countRefFindings(findings: readonly CopyFinding[]): number {
  return findings.filter((finding) => finding.code === 'unknown_fact_ref').length;
}
