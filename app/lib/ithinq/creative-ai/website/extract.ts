import { createHash } from 'node:crypto';
import { factRef, type ApprovedFact, type FactKind } from '~/lib/ithinq/creative-ai/facts';
import type { ContentBlock, ParsedPage } from './parse';

/**
 * Turning page content into approved facts.
 *
 * Deterministic on purpose. A model reading the site and deciding what is true
 * would put a generative step between the company and its own claims, which is
 * exactly the step this whole architecture exists to keep out. So the rules
 * here are dull and readable: a fact is a sentence the site already published,
 * normalised, classified by shape, and carrying the page it came from.
 *
 * The site supplies truth. The campaign author supplies expression. Nothing in
 * this file writes marketing copy, and nothing downstream is obliged to use
 * these words — only to stay inside what they claim.
 */

/**
 * Borrowed customer voice, which is never an approved product fact.
 *
 * A live run pulled two testimonials off the site — "iThinkAI has completely
 * elevated our customer experience and decreased response times
 * exponentially" — and filed them as capabilities. That is the single worst
 * thing this extractor could do: a customer's reported outcome would become a
 * claim the campaign author is licensed to make, and the evidence guard, which
 * exists to stop exactly that, would then treat it as supported.
 *
 * The distinguishing shape is first-person praise that names the product: the
 * company writing "we're on a mission to…" is its own voice and stays; a
 * customer writing "iThinq has transformed our…" is someone else's and goes.
 */
const PRODUCT_NAME = /\bi\s?think?q?\s?ai\b|\bithinq\b|\bithinqai\b|\bithinkai\b/i;
const FIRST_PERSON = /\b(our|we|we've|we're|us|my|mine)\b/i;
const OUTCOME_PRAISE =
  /\b(flawless|flawlessly|elevated|decreased|increased|improved|boosted|saved|reduced|doubled|tripled|love|amazing|excellent|outstanding|best decision|game[- ]?changer|highly recommend|satisfaction)\b/i;

/**
 * A statement wrapped in quotation marks is somebody being quoted.
 *
 * A live run caught "We have decreased the front desk workload and increased
 * customer happiness." — a testimonial with no product name in it, so the
 * first-person-plus-product test missed it entirely. The quotation marks are
 * the site telling us whose words these are, and that is enough.
 */
const FULLY_QUOTED = /^\s*["'\u201c\u2018\u00ab][\s\S]{10,}["'\u201d\u2019\u00bb][.\s]*$/;

function isBorrowedVoice(text: string): boolean {
  if (FULLY_QUOTED.test(text.trim())) {
    return true;
  }

  return FIRST_PERSON.test(text) && PRODUCT_NAME.test(text) && OUTCOME_PRAISE.test(text);
}

/** Copy that is navigation, legal boilerplate or a button, never a product fact. */
const NOISE = [
  /^(home|about|contact|pricing|blog|careers|login|log in|sign up|sign in|menu|search)$/i,
  /^(get started|book a demo|request a demo|learn more|read more|see more|try it free|contact us|talk to us)\b/i,
  /\b(cookie|privacy policy|terms of service|terms and conditions|all rights reserved|©)\b/i,
  /^(follow us|share this|subscribe|newsletter)\b/i,
  /^\s*\d+\s*$/,
];

const CAPABILITY_CUES =
  /\b(answers?|answering|captures?|capture|books?|booking|routes?|handles?|handling|schedules?|qualifies|responds?|transcribes?|records?|integrates?|connects?|follows? up|calls?|texts?|sends?|collects?|asks?|takes?|forwards?|escalates?)\b/i;

/**
 * A boundary is the product declining to do something, not the word "never".
 *
 * A live run classified "it boosts efficiency and never misses a potential
 * client" as a limit, which is the opposite of what it is: an absolute
 * performance claim filed as a safeguard. A cue list for limits has to match
 * the negation of a capability, not any negative word in the sentence.
 */
const BOUNDARY_CUES =
  /\b(does not|doesn't|do not|cannot|can't|is not|isn't|are not|aren't|will not|won't|not intended|not a replacement|no need to|without needing|instead of|rather than|depends on|requires that|only when|only if)\b/i;

const AUDIENCE_CUES =
  /\b(built for|designed for|made for|for (?:small|service|local|home|medical)|businesses|clinics|practices|contractors|agencies|teams|industries|verticals|customers who|companies that)\b/i;

/*
 * "plan" on its own is not a pricing signal. A live run filed "Personalized
 * customer management based on treatment plan and type" as pricing on the
 * strength of one word.
 */
const PRICING_CUES =
  /(\$|£|€)\s?\d|\b(per month|per user|per seat|monthly|annually|\/mo\b|\/month\b|pricing|price|starts at|billed|subscription|free trial|pricing plan|plans start)\b/i;

const PROCESS_CUES =
  /\b(onboard|setup|set up|install|configure|training|support|demo|trial|migrate|deploy|get started)\b/i;

/** Topic cues used only to retrieve facts, never to assert anything. */
const TOPIC_CUES: ReadonlyArray<[string, RegExp]> = [
  /*
   * Stems, with no trailing word boundary. "Med spas", "clinics" and
   * "dermatology" are how a marketing page actually writes these words, and a
   * cue that only matched the singular would quietly file the med-spa page
   * under no vertical at all.
   */
  ['voice-assistant', /\b(voice|calls?|phone|caller|ring|answering|receptionist|inbound)/i],
  [
    'missed-calls',
    /\b(missed call|voicemail|after hours|out of hours|outside (?:opening|business) hours|unanswered|rings out)/i,
  ],
  ['lead-capture', /\b(leads?|enquir|inquir|intake|captur|qualif|book|appointment|consultation)/i],
  ['follow-up', /\b(follow[- ]?up|callbacks?|call back|nurtur|reminder)/i],
  ['integration', /\b(integrat|crm|calendar|api|webhook|connect)/i],
  ['pricing', PRICING_CUES],
  ['med-spa', /\b(med ?spa|medspa|aesthetic|clinic|cosmetic|wellness|dermatolog)/i],
  ['home-services', /\b(hvac|plumb|roof|electric|contractor|home service|field service|trade)/i],
  ['dental', /\b(dental|dentist|orthodont)/i],
  ['legal', /\b(law firm|legal|attorney|solicitor)/i],
  ['real-estate', /\b(real estate|realtor|propert|letting)/i],
  ['service-business', /\b(service business|small business|local business|appointment-based)/i],
  ['support', /\b(support|onboard|set ?up|training|help)/i],
];

export interface ExtractOptions {
  sourceUrl: string;
  retrievedAt: string;

  /** Topics the configuration expects this page to cover. */
  pageTopics: readonly string[];
  minLength?: number;
  maxLength?: number;
}

function isNoise(text: string): boolean {
  return NOISE.some((pattern) => pattern.test(text)) || isBorrowedVoice(text);
}

/**
 * Whether a line carries enough to be a claim.
 *
 * A fragment like "Fast setup" asserts nothing checkable and would widen the
 * boundary of what may be said without adding a fact. A stated sentence does.
 */
function isSubstantive(text: string, min: number, max: number): boolean {
  if (text.length < min || text.length > max) {
    return false;
  }

  return text.split(/\s+/).length >= 4;
}

export { isBorrowedVoice };

export function classify(text: string, block: ContentBlock): FactKind {
  if (PRICING_CUES.test(text)) {
    return 'pricing';
  }

  if (BOUNDARY_CUES.test(text)) {
    return 'boundary';
  }

  if (AUDIENCE_CUES.test(text)) {
    return 'audience';
  }

  if (CAPABILITY_CUES.test(text)) {
    return 'capability';
  }

  if (PROCESS_CUES.test(text)) {
    return 'process';
  }

  return block.kind === 'structured' ? 'product' : 'process';
}

export function topicsFor(text: string, pageTopics: readonly string[]): string[] {
  const found = new Set(pageTopics);

  for (const [topic, pattern] of TOPIC_CUES) {
    if (pattern.test(text)) {
      found.add(topic);
    }
  }

  return [...found].sort();
}

export function sourceHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Extract the facts one page authorises.
 *
 * A published question and its answer are kept as one statement: an objection
 * the company has already chosen to answer in public is the most useful thing
 * on a marketing site for a campaign that has to handle objections, and
 * splitting them would leave a question with nothing behind it.
 */
export function extractFacts(page: ParsedPage, options: ExtractOptions): ApprovedFact[] {
  const min = options.minLength ?? 30;
  const max = options.maxLength ?? 400;
  const facts: ApprovedFact[] = [];
  const seen = new Set<string>();

  const push = (text: string, kind: FactKind) => {
    const trimmed = text.trim();
    const key = trimmed.toLowerCase();

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    facts.push({
      ref: factRef(trimmed),
      text: trimmed,
      kind,
      source: {
        sourceUrl: options.sourceUrl,
        pageTitle: page.title,
        sourceHash: sourceHash(trimmed),
        retrievedAt: options.retrievedAt,
        topics: topicsFor(trimmed, options.pageTopics),
      },
    });
  };

  if (page.description && isSubstantive(page.description, min, max) && !isNoise(page.description)) {
    push(page.description, 'product');
  }

  for (let index = 0; index < page.blocks.length; index += 1) {
    const block = page.blocks[index]!;
    const text = block.text;

    if (block.kind === 'question') {
      const answer = page.blocks[index + 1];

      if (answer && answer.kind === 'answer' && isSubstantive(answer.text, min, max) && !isNoise(answer.text)) {
        const combined = `${text} ${answer.text}`;
        push(combined, classify(answer.text, answer));
        index += 1;
      }

      continue;
    }

    if (block.kind === 'answer' || block.kind === 'heading') {
      /*
       * A heading is a label, not a claim. It steers classification of the
       * copy beneath it and is never promoted to a fact on its own.
       */
      continue;
    }

    if (isNoise(text) || !isSubstantive(text, min, max)) {
      continue;
    }

    push(text, classify(text, block));
  }

  return facts;
}
