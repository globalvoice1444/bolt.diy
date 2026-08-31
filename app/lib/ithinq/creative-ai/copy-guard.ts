import { FACT_REFERENCE_PATTERN } from '@ithinq-pagespec/page-spec';
import type { ApprovedFact } from './facts';

/**
 * The truth guard for authored campaign copy.
 *
 * Phase 3's rule was that generated copy could only rephrase what the PageSpec
 * already said. That was safe and it was also the ceiling: a Partner who has
 * not already written the page has nothing to rephrase, so the system could
 * never author a campaign.
 *
 * Phase 4 moves the boundary from WORDING to CLAIMS. The writer may say
 * anything, in any structure, at any length. What it may not do is assert a
 * business fact that no approved fact supports.
 *
 * So this file checks the things that are genuinely checkable in code —
 * figures, money, evidence vocabulary, fact references, house style — and the
 * claim audit checks what only a reader can: whether a sentence asserts
 * something the fact set does not say. Neither is a compliance engine.
 * Original phrasing, metaphor, rhetorical questions, emotional framing,
 * urgency, narrative and creative CTA language are all deliberately none of
 * this file's business.
 */
export interface CopyFinding {
  field: string;
  code:
    | 'novel_number'
    | 'novel_currency'
    | 'evidence_claim'
    | 'cliche'
    | 'too_long'
    | 'empty'
    | 'unknown_fact_ref'
    | 'unsupported_claim';
  detail: string;
}

/**
 * What a field is allowed to rest on.
 *
 * `supported` is the approved fact set plus the document's own authored text.
 * Both are authoritative: the facts come from the fact authority, and the
 * PageSpec is the Growth Engine's own artifact. Everything else is the
 * writer's to invent, because everything else is language rather than truth.
 */
export interface SupportContext {
  /** Everything a factual claim may rest on. */
  supported: readonly string[];

  /**
   * The voice the page is entitled to borrow, which is a smaller set.
   *
   * The cliché ban has always made an exception for terms the source itself
   * uses, on the reasoning that the fact authority's own voice should not be
   * overridden by a style rule. That reasoning holds for a Growth Engine
   * document, which is authored. It does not hold for marketing copy read off
   * a website: a live ingestion pulled in "streamline", "transform",
   * "elevate", "revolutionize", "unlock", "cutting-edge" and "effortless", and
   * every one of them would have quietly switched the guard off for the exact
   * words it exists to keep out of a campaign.
   *
   * So truth and voice are separated. A website fact can support a claim. It
   * cannot license a cliché.
   */
  voice: readonly string[];
  knownRefs: ReadonlySet<string>;
}

export interface SupportOptions {
  /**
   * Whether these facts carry an authored voice worth deferring to.
   *
   * True for a Growth Engine set or a document transcription; false for
   * anything read off a marketing site.
   */
  trustFactVoice?: boolean;
}

export function supportContext(
  facts: readonly ApprovedFact[],
  documentText: readonly string[],
  options: SupportOptions = {},
): SupportContext {
  const factText = facts.map((fact) => fact.text);
  const trustFactVoice = options.trustFactVoice ?? true;

  return {
    supported: [...factText, ...documentText],
    voice: trustFactVoice ? [...factText, ...documentText] : documentText,
    knownRefs: new Set(facts.map((fact) => fact.ref)),
  };
}

/**
 * Vocabulary that asserts external validation rather than describing a
 * product. These are the shapes fabricated evidence takes: awards, ratings,
 * certifications, guarantees, proof claims and borrowed social proof.
 *
 * Still banned unless an approved fact actually says it. A fact set may
 * legitimately contain a guarantee; a model may not decide there is one.
 */
const EVIDENCE_LEXICON = [
  'guarantee',
  'guaranteed',
  'clinically proven',
  'proven to',
  'scientifically',
  'fda',
  'award',
  'award-winning',
  'rated',
  'five-star',
  '5-star',
  'testimonial',
  'case study',
  'certified',
  'accredited',
  'industry-leading',
  'number one',
  'best-selling',
  'trusted by',
  'customers say',
  'clients say',
  'roi',
  'money-back',
  'risk-free',
  'guaranteed results',
  'no.1',
  'no. 1',
];

/**
 * Marketing filler the brief explicitly asks the writer to avoid.
 *
 * A quality guard rather than a truth guard, kept because a live Phase 3 run
 * produced "Elevate your med spa" and "effortless integration" despite the
 * prompt banning both by name. A model told not to use a word will still reach
 * for it, so the ban is checked rather than requested.
 *
 * Allowed when the material whose VOICE we trust already uses the term — an
 * authored document's own register is not overridden by this list. Marketing
 * copy read off a website supports claims but does not lend its voice, so
 * hype on the site cannot license hype on the page.
 */
const CLICHE_LEXICON = [
  'transform',
  'elevate',
  'unlock',
  'revolutionise',
  'revolutionize',
  'empower',
  'streamline',
  'seamless',
  'effortless',
  'supercharge',
  'next level',
  'discover the power',
  'fast-paced world',
  'say goodbye',
  'game-changer',
  'game changer',
  'cutting-edge',
  'harness the',
  'take your',
];

function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ');
}

function numbersIn(value: string): string[] {
  return (value.match(/\d[\d,.]*\s*%?/g) ?? []).map((token) => token.replace(/[\s,]/g, '').replace(/\.$/, ''));
}

function currencyIn(value: string): string[] {
  return value.match(/[$£€]\s?\d[\d,.]*/g) ?? [];
}

/**
 * Check one authored string against what supports it.
 *
 * A finding means the candidate must be discarded. Note what is NOT checked:
 * whether the wording appears in the source. It deliberately does not have to.
 */
export function guardCopy(field: string, candidate: string, support: SupportContext, maxLength = 320): CopyFinding[] {
  const findings: CopyFinding[] = [];
  const text = candidate.trim();

  if (!text) {
    return [{ field, code: 'empty', detail: 'Authored copy was empty.' }];
  }

  if (text.length > maxLength) {
    findings.push({ field, code: 'too_long', detail: `Authored copy exceeded ${maxLength} characters.` });
  }

  const haystack = normalise(support.supported.join(' \n '));
  const voice = normalise((support.voice ?? support.supported).join(' \n '));
  const haystackNumbers = new Set(numbersIn(haystack));

  for (const number of numbersIn(text)) {
    if (!haystackNumbers.has(number)) {
      findings.push({
        field,
        code: 'novel_number',
        detail: `Introduced the figure "${number}", which no approved fact supports.`,
      });
    }
  }

  const haystackCurrency = new Set(currencyIn(haystack).map(normalise));

  for (const amount of currencyIn(text)) {
    if (!haystackCurrency.has(normalise(amount))) {
      findings.push({
        field,
        code: 'novel_currency',
        detail: `Introduced the amount "${amount}", which no approved fact supports.`,
      });
    }
  }

  const lowered = normalise(text);

  for (const term of EVIDENCE_LEXICON) {
    if (lowered.includes(term) && !haystack.includes(term)) {
      findings.push({
        field,
        code: 'evidence_claim',
        detail: `Used the evidence term "${term}", which no approved fact supports.`,
      });
    }
  }

  for (const term of CLICHE_LEXICON) {
    if (lowered.includes(term) && !voice.includes(term)) {
      findings.push({
        field,
        code: 'cliche',
        detail: `Used the marketing cliché "${term}", which the brief bans and no approved fact uses.`,
      });
    }
  }

  return findings;
}

/**
 * Check the fact references a section declared.
 *
 * Structural, not semantic: it proves the writer pointed at facts that exist.
 * Whether the copy actually follows from them is the audit's job.
 */
export function guardFactRefs(field: string, refs: readonly string[], support: SupportContext): CopyFinding[] {
  const findings: CopyFinding[] = [];

  for (const ref of refs) {
    if (!FACT_REFERENCE_PATTERN.test(ref) || !support.knownRefs.has(ref)) {
      findings.push({
        field,
        code: 'unknown_fact_ref',
        detail: `Cited "${ref}", which is not a reference in the approved fact set.`,
      });
    }
  }

  return findings;
}

/**
 * Apply the guard to a candidate, returning the text only when it is safe.
 *
 * Callers fall back to whatever the document already had when this returns
 * null, so a rejected line degrades toward authoritative truth rather than
 * toward nothing.
 */
export function safeCopy(
  field: string,
  candidate: string | undefined | null,
  support: SupportContext,
  findings: CopyFinding[],
  maxLength?: number,
): string | null {
  if (typeof candidate !== 'string' || !candidate.trim()) {
    return null;
  }

  const issues = guardCopy(field, candidate, support, maxLength);

  if (issues.length > 0) {
    findings.push(...issues);
    return null;
  }

  return candidate.trim();
}
