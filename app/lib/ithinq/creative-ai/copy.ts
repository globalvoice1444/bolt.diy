import type { PageSpec } from '@ithinq-pagespec/page-spec';
import { guardCopy, guardFactRefs, supportContext, type CopyFinding, type SupportContext } from './copy-guard';
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

/** How many times a rejected line may be sent back for a rewrite. Never a loop. */
const REPAIR_ROUNDS = 2;

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

/** What the authoring model returns, before anything has been checked. */
interface AuthorshipResult {
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

  let result: AuthorshipResult;

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

  /*
   * A website set states what is true; it does not get to set the page's
   * voice. See `supportContext` — ingested marketing hype would otherwise
   * switch off the cliché guard for its own favourite words.
   */
  const support: SupportContext = supportContext(set.facts, documentText(spec), {
    trustFactVoice: set.authority !== 'first-party-website',
  });

  const findings: CopyFinding[] = [];
  const skeleton = buildSkeleton(spec, result, support, findings);
  const slots = allSlots(skeleton);

  guardSlots(slots, support, treatment, findings);

  const documentStatements = documentText(spec);
  let audit = await auditSlots(set, slots, generator, findings, false, documentStatements);

  /*
   * Repair what was rejected, once.
   *
   * Dropping a rejected field and falling back to the document was right while
   * the document was a Growth Engine page with authoritative prose to fall back
   * TO. Against a fact sheet there is nothing behind it, and the first live run
   * showed what that costs: the cliché guard correctly refused five of six
   * bodies, every one fell back to a bare fact restatement, and the page came
   * out as campaign headings sitting on top of the source document's own
   * sentences — the exact "website paragraphs rearranged" outcome this phase
   * exists to avoid.
   *
   * So a rejection now asks for a rewrite before it gives up, and says exactly
   * what was wrong.
   *
   * Two rounds, hard-bounded, never a loop. Two because a line rejected by the
   * guard spends its first round on that and can then be caught by the audit
   * on the rewrite — which is how the mechanism beat, the one that has to
   * explain how the product works, ended up empty in both live campaigns.
   * Whatever still fails falls back as it always did, so the page degrades
   * toward truth rather than toward a claim nothing supports.
   */
  for (let round = 0; round < REPAIR_ROUNDS; round += 1) {
    const repaired = await repairSlots(set, request, strategy, slots, generator, support, treatment, findings);

    if (repaired === 0) {
      break;
    }

    audit = await auditSlots(set, slots, generator, findings, audit.performed, documentStatements);
  }

  const overlay = assemble(skeleton);
  const accepted = countAccepted(overlay);

  return {
    overlay,
    plan: { ...result.campaign, lengthTreatment: treatment },
    findings,
    rejected: slots.filter((slot) => slot.text === null).length,
    accepted,
    generated: true,
    audited: audit.performed,
  };
}

/* ------------------------------------------------------------------ */
/* Slots                                                               */
/* ------------------------------------------------------------------ */

/**
 * One authored string on its way to the page.
 *
 * Held in a flat list so the guard, the audit and the repair pass all operate
 * on the same objects, and the overlay is assembled from whatever survives.
 * Before this, each stage patched a half-built overlay and the repair pass had
 * nowhere to put a corrected line.
 */
interface Slot {
  field: string;
  budget: string;

  /** What the model produced. Kept so a repair can be asked for. */
  raw: string;

  /** The text that will reach the page, or null once something rejected it. */
  text: string | null;
  reasons: string[];
}

interface SectionSkeleton {
  index: number;
  intent?: string;
  factRefs: string[];
  eyebrow: Slot | null;
  heading: Slot | null;
  body: Slot | null;
  items: Slot[];
  qa: Array<{ question: Slot; answer: Slot }>;
}

interface Skeleton {
  headline: Slot | null;
  subheadline: Slot | null;
  audience: Slot | null;
  pageFactRefs: string[];
  sections: SectionSkeleton[];
}

function slot(field: string, budget: string, raw: string | null | undefined): Slot | null {
  const text = typeof raw === 'string' ? raw.trim() : '';

  return text ? { field, budget, raw: text, text, reasons: [] } : null;
}

function buildSkeleton(
  spec: PageSpec,
  result: AuthorshipResult,
  support: SupportContext,
  findings: CopyFinding[],
): Skeleton {
  findings.push(...guardFactRefs('page', result.pageFactRefs ?? [], support));

  const sections: SectionSkeleton[] = [];

  for (const candidate of result.sections ?? []) {
    const index = candidate.index;

    if (!Number.isInteger(index) || index < 0 || index >= spec.sections.length) {
      continue;
    }

    findings.push(...guardFactRefs(`section.${index}`, candidate.factRefs ?? [], support));

    sections.push({
      index,
      intent: candidate.intent?.trim() || undefined,
      factRefs: (candidate.factRefs ?? []).filter((ref) => support.knownRefs.has(ref)),
      eyebrow: slot(`section.${index}.eyebrow`, 'eyebrow', candidate.eyebrow),
      heading: slot(`section.${index}.heading`, 'heading', candidate.heading),
      body: slot(`section.${index}.body`, 'body', candidate.body),
      items: (candidate.items ?? [])
        .map((item, position) => slot(`section.${index}.item.${position}`, 'item', item))
        .filter((entry): entry is Slot => entry !== null),
      qa: (candidate.qa ?? [])
        .map((pair, position) => {
          const question = slot(`section.${index}.qa.${position}.question`, 'heading', pair?.question);
          const answer = slot(`section.${index}.qa.${position}.answer`, 'qa', pair?.answer);

          return question && answer ? { question, answer } : null;
        })
        .filter((entry): entry is { question: Slot; answer: Slot } => entry !== null),
    });
  }

  return {
    headline: slot('page.headline', 'headline', result.headline),
    subheadline: slot('page.subheadline', 'subheadline', result.subheadline),
    audience: slot('page.audience', 'eyebrow', result.audience),
    pageFactRefs: (result.pageFactRefs ?? []).filter((ref) => support.knownRefs.has(ref)),
    sections,
  };
}

function allSlots(skeleton: Skeleton): Slot[] {
  const out: Slot[] = [];

  for (const entry of [skeleton.headline, skeleton.subheadline, skeleton.audience]) {
    if (entry) {
      out.push(entry);
    }
  }

  for (const section of skeleton.sections) {
    for (const entry of [section.eyebrow, section.heading, section.body]) {
      if (entry) {
        out.push(entry);
      }
    }

    out.push(...section.items);

    for (const pair of section.qa) {
      out.push(pair.question, pair.answer);
    }
  }

  return out;
}

function guardSlots(slots: Slot[], support: SupportContext, treatment: LengthTreatment, findings: CopyFinding[]): void {
  for (const entry of slots) {
    if (entry.text === null) {
      continue;
    }

    const issues = guardCopy(entry.field, entry.text, support, budget(treatment, entry.budget));

    if (issues.length > 0) {
      findings.push(...issues);
      entry.reasons = issues.map((issue) => issue.detail);
      entry.text = null;
    }
  }
}

async function auditSlots(
  set: ApprovedFactSet,
  slots: Slot[],
  generator: StructuredTextGenerator,
  findings: CopyFinding[],
  performedBefore = false,
  documentStatements: readonly string[] = [],
): Promise<{ performed: boolean }> {
  const audited: AuditedField[] = slots
    .filter((entry): entry is Slot & { text: string } => entry.text !== null)
    .map((entry) => ({ field: entry.field, text: entry.text }));

  const audit = await auditClaims(set.facts, audited, generator, documentStatements);
  findings.push(...audit.findings);

  for (const entry of slots) {
    if (entry.text !== null && audit.rejectedFields.has(entry.field)) {
      entry.reasons = audit.findings.filter((issue) => issue.field === entry.field).map((issue) => issue.detail);
      entry.text = null;
    }
  }

  return { performed: audit.performed || performedBefore };
}

const REPAIR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['repairs'],
  properties: {
    repairs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'text'],
        properties: {
          field: { type: 'string', description: 'The field id exactly as given.' },
          text: { type: 'string', description: 'The rewritten line.' },
        },
      },
    },
  },
} as const;

const REPAIR_SYSTEM = `You are the copywriter, fixing your own lines.

Each line below was rejected, and you are told exactly why. Rewrite each one so
it says the same thing without the problem. Keep the voice, the specificity and
the persuasive intent — this is a rewrite, not a retreat into something bland.

If a line was rejected for a banned word, find a better way to say it. The ban
exists because those words make copy sound like every other page on the
internet, so reaching for a synonym of the same cliché is not a fix.

If a line was rejected for an unsupported claim, say less rather than softening
it into vagueness. Drop the unsupported part and keep what the facts do carry.

Never introduce a number, price, statistic, guarantee, award, rating, review or
customer result that no approved fact states.

Sentence case. Plain nouns and verbs. Concrete over abstract.

Return only the fields you were given.`;

/**
 * Ask the writer to fix its own rejected lines. One round, never a loop.
 *
 * Returns how many lines came back and survived, so the caller knows whether a
 * second audit pass is worth making.
 */
async function repairSlots(
  set: ApprovedFactSet,
  request: InterpretedRequest,
  strategy: CreativeStrategy,
  slots: Slot[],
  generator: StructuredTextGenerator,
  support: SupportContext,
  treatment: LengthTreatment,
  findings: CopyFinding[],
): Promise<number> {
  const broken = slots.filter((entry) => entry.text === null && entry.reasons.length > 0);

  if (broken.length === 0) {
    return 0;
  }

  let result: { repairs: Array<{ field: string; text: string }> };

  try {
    result = await generator.generate({
      system: REPAIR_SYSTEM,
      user: [
        `CAMPAIGN: ${request.userInstruction || request.objective}`,
        `Tone ${request.tone}; copy style ${strategy.copyStyle}; narrative ${strategy.narrativeAngle}.`,
        '',
        'APPROVED FACTS — still the only things you may assert:',
        set.facts.map((fact) => `${fact.ref} (${fact.kind}): ${fact.text}`).join('\n'),
        '',
        'REJECTED LINES:',
        JSON.stringify(
          broken.map((entry) => ({ field: entry.field, text: entry.raw, problems: entry.reasons })),
          null,
          2,
        ),
      ].join('\n'),
      schema: REPAIR_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'copy_repair',
      temperature: 0.8,
    });
  } catch {
    /* A failed repair leaves the page exactly as it would have been. */
    return 0;
  }

  const byField = new Map(broken.map((entry) => [entry.field, entry]));
  let recovered = 0;

  for (const repair of result.repairs ?? []) {
    const entry = byField.get(repair.field);
    const text = repair.text?.trim();

    if (!entry || !text) {
      continue;
    }

    const issues = guardCopy(entry.field, text, support, budget(treatment, entry.budget));

    if (issues.length > 0) {
      findings.push(...issues);
      continue;
    }

    entry.text = text;
    entry.reasons = [];
    recovered += 1;
  }

  return recovered;
}

function assemble(skeleton: Skeleton): CopyOverlay {
  const overlay: CopyOverlay = { sections: [], factRefs: skeleton.pageFactRefs };
  const value = (entry: Slot | null) => entry?.text ?? undefined;

  overlay.headline = value(skeleton.headline);
  overlay.subheadline = value(skeleton.subheadline);
  overlay.audience = value(skeleton.audience);

  for (const section of skeleton.sections) {
    const items = section.items.map((entry) => entry.text).filter((text): text is string => Boolean(text));

    /* A question without its answer is worse than no question at all. */
    const qa = section.qa
      .filter((pair) => pair.question.text && pair.answer.text)
      .map((pair) => ({ question: pair.question.text!, answer: pair.answer.text! }));

    const entry: SectionCopy = {
      index: section.index,
      factRefs: section.factRefs,
      intent: section.intent,
      eyebrow: value(section.eyebrow),
      heading: value(section.heading),
      body: value(section.body),
      items: items.length > 0 ? items : undefined,
      qa: qa.length > 0 ? qa : undefined,
    };

    if (entry.eyebrow || entry.heading || entry.body || entry.items || entry.qa) {
      overlay.sections.push(entry);
    }
  }

  return overlay;
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
