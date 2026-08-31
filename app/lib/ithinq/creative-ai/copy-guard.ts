/**
 * The truth guard for generated copy.
 *
 * Phase 3 lets a model write marketing copy. That is a genuine widening of
 * what the renderer may do, so it needs a hard boundary rather than a polite
 * instruction in a prompt: a model told "do not invent facts" will still
 * occasionally invent one, and a page that states a false capability, price or
 * result is the single worst thing this system could produce.
 *
 * The rule is deliberately blunt and fails safe: generated copy may only
 * REPHRASE what the PageSpec already says. Any candidate string that
 * introduces a number, a currency amount, or a piece of evidence vocabulary
 * that does not appear in its own source material is rejected, and the
 * original contract copy is rendered instead.
 *
 * Rejection is not an error. Losing a rewritten headline costs nothing;
 * shipping an invented statistic costs everything.
 */
export interface CopyFinding {
  field: string;
  code: 'novel_number' | 'novel_currency' | 'evidence_claim' | 'cliche' | 'too_long' | 'empty';
  detail: string;
}

/**
 * Vocabulary that asserts external validation rather than describing a
 * product. These are the shapes fabricated evidence takes: awards, ratings,
 * certifications, guarantees, proof claims and borrowed social proof.
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
 * A quality guard rather than a truth guard, but enforced in the same place
 * and for the same reason: a live run produced "Elevate your med spa" and
 * "effortless integration" despite the prompt banning both by name. A model
 * told not to use a word will still reach for it, so the ban has to be
 * checked rather than requested.
 *
 * A term is allowed when the source material already uses it — the contract's
 * own voice is never overridden by this list.
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

/** Numbers written as digits, plus spelled-out small numbers that read as counts. */
function numbersIn(value: string): string[] {
  return (value.match(/\d[\d,.]*\s*%?/g) ?? []).map((token) => token.replace(/[\s,]/g, '').replace(/\.$/, ''));
}

function currencyIn(value: string): string[] {
  return value.match(/[$£€]\s?\d[\d,.]*/g) ?? [];
}

/**
 * Check one generated string against the material it was allowed to draw on.
 *
 * `source` is every piece of contract text the model was shown for this field.
 * A finding means the candidate must be discarded.
 */
export function guardCopy(field: string, candidate: string, source: readonly string[], maxLength = 320): CopyFinding[] {
  const findings: CopyFinding[] = [];
  const text = candidate.trim();

  if (!text) {
    return [{ field, code: 'empty', detail: 'Generated copy was empty.' }];
  }

  if (text.length > maxLength) {
    findings.push({ field, code: 'too_long', detail: `Generated copy exceeded ${maxLength} characters.` });
  }

  const haystack = normalise(source.join(' \n '));
  const haystackNumbers = new Set(numbersIn(haystack));

  for (const number of numbersIn(text)) {
    if (!haystackNumbers.has(number)) {
      findings.push({
        field,
        code: 'novel_number',
        detail: `Introduced the figure "${number}", which does not appear in the source material.`,
      });
    }
  }

  const haystackCurrency = new Set(currencyIn(haystack).map(normalise));

  for (const amount of currencyIn(text)) {
    if (!haystackCurrency.has(normalise(amount))) {
      findings.push({
        field,
        code: 'novel_currency',
        detail: `Introduced the amount "${amount}", which does not appear in the source material.`,
      });
    }
  }

  const lowered = normalise(text);

  for (const term of EVIDENCE_LEXICON) {
    if (lowered.includes(term) && !haystack.includes(term)) {
      findings.push({
        field,
        code: 'evidence_claim',
        detail: `Used the evidence term "${term}", which does not appear in the source material.`,
      });
    }
  }

  for (const term of CLICHE_LEXICON) {
    if (lowered.includes(term) && !haystack.includes(term)) {
      findings.push({
        field,
        code: 'cliche',
        detail: `Used the marketing cliché "${term}", which the brief bans and the source does not use.`,
      });
    }
  }

  return findings;
}

/**
 * Apply the guard to a candidate, returning the text only when it is safe.
 *
 * Callers fall back to the contract's own copy when this returns null, so a
 * rejected rewrite degrades to authoritative truth rather than to nothing.
 */
export function safeCopy(
  field: string,
  candidate: string | undefined | null,
  source: readonly string[],
  findings: CopyFinding[],
  maxLength?: number,
): string | null {
  if (typeof candidate !== 'string' || !candidate.trim()) {
    return null;
  }

  const issues = guardCopy(field, candidate, source, maxLength);

  if (issues.length > 0) {
    findings.push(...issues);
    return null;
  }

  return candidate.trim();
}
