import type { ApprovedFact, ApprovedFactSet } from '~/lib/ithinq/creative-ai/facts';

/**
 * Choosing which approved facts a campaign sees.
 *
 * The whole corpus in every prompt would be wasteful and, worse, misleading:
 * a med-spa page shown every fact about every product invites the writer to
 * reach for one that does not belong there. Selection is a relevance problem,
 * not a truth problem — nothing here decides what is true, only what is worth
 * putting in front of the writer for this request.
 *
 * Deliberately lexical rather than a vector index. The corpus is tens to low
 * hundreds of short statements from one company's own site; an embedding
 * store would be a platform built to solve a problem this size does not have.
 * The seam is here if the corpus ever outgrows it.
 */
export interface SelectionRequest {
  /** The Partner's own words. */
  instruction: string;
  vertical?: string | null;
  audience?: string | null;
  objective?: string | null;

  /** How many facts to hand the writer. */
  limit?: number;
}

export interface ScoredFact {
  fact: ApprovedFact;
  score: number;
  matched: string[];
}

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'your',
  'you',
  'our',
  'their',
  'its',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'is',
  'are',
  'be',
  'it',
  'as',
  'we',
  'they',
  'them',
  'best',
  'make',
  'create',
  'campaign',
  'page',
  'make it',
  'promoting',
  'promote',
  'strong',
  'enough',
  'real',
  'use',
  'using',
  'good',
  'great',
  'more',
  'most',
  'very',
  'can',
  'will',
]);

function terms(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * A campaign needs a spine, not only the most on-topic sentences.
 *
 * Without this, a tightly-matched query returns eight ways of saying the same
 * capability and nothing that says what the product is, who it is for or where
 * its limits are — and the writer, given no boundary facts, has nothing honest
 * to meet the objection with. Each kind gets a floor.
 */
const KIND_FLOOR: Readonly<Record<string, number>> = {
  product: 2,
  audience: 2,
  capability: 6,
  boundary: 3,
  process: 2,
  pricing: 2,
};

export function scoreFact(fact: ApprovedFact, queryTerms: readonly string[]): ScoredFact {
  const haystack = fact.text.toLowerCase();
  const topics = (fact.source?.topics ?? []).map((topic) => topic.toLowerCase());
  const matched: string[] = [];
  let score = 0;

  for (const term of queryTerms) {
    if (topics.some((topic) => topic.includes(term) || term.includes(topic))) {
      score += 3;
      matched.push(term);
      continue;
    }

    if (haystack.includes(term)) {
      score += 2;
      matched.push(term);
    }
  }

  /*
   * A boundary is worth showing even when it matches nothing. It is the fact
   * that stops the writer overclaiming, and it is never the one a query for a
   * vertical happens to hit.
   */
  if (fact.kind === 'boundary') {
    score += 1;
  }

  if (fact.kind === 'product' || fact.kind === 'audience') {
    score += 0.5;
  }

  return { fact, score, matched: [...new Set(matched)] };
}

export function selectFacts(set: ApprovedFactSet, request: SelectionRequest): ScoredFact[] {
  const queryTerms = [
    ...new Set([
      ...terms(request.instruction),
      ...terms(request.vertical ?? ''),
      ...terms(request.audience ?? ''),
      ...terms(request.objective ?? ''),
    ]),
  ];

  const scored = set.facts
    .map((fact) => scoreFact(fact, queryTerms))
    .sort((left, right) => right.score - left.score || left.fact.text.localeCompare(right.fact.text));

  const limit = request.limit ?? 28;
  const chosen: ScoredFact[] = [];
  const taken = new Set<string>();
  const perKind: Record<string, number> = {};
  const kinds = Object.keys(KIND_FLOOR);

  /*
   * Fill the floors a round at a time rather than a kind at a time.
   *
   * Filling kind by kind and truncating to the limit afterwards silently drops
   * whichever kinds sort last — which, with the floors summing above a small
   * limit, is exactly the boundary facts this exists to guarantee. One pass
   * per round gives every kind its first pick before any kind gets its second.
   */
  const deepest = Math.max(...Object.values(KIND_FLOOR));

  for (let round = 0; round < deepest && chosen.length < limit; round += 1) {
    for (const kind of kinds) {
      if (chosen.length >= limit) {
        break;
      }

      if ((perKind[kind] ?? 0) > round || KIND_FLOOR[kind]! <= round) {
        continue;
      }

      /* A floor is a guarantee of breadth, not a licence to include noise. */
      const entry = scored.find((item) => item.fact.kind === kind && item.score > 0 && !taken.has(item.fact.ref));

      if (!entry) {
        continue;
      }

      chosen.push(entry);
      taken.add(entry.fact.ref);
      perKind[kind] = (perKind[kind] ?? 0) + 1;
    }
  }

  for (const entry of scored) {
    if (chosen.length >= limit) {
      break;
    }

    if (taken.has(entry.fact.ref) || entry.score <= 0) {
      continue;
    }

    chosen.push(entry);
    taken.add(entry.fact.ref);
  }

  return chosen.slice(0, limit);
}

/** The selected facts as a fact set the existing authoring pipeline accepts. */
export function selectFactSet(set: ApprovedFactSet, request: SelectionRequest): ApprovedFactSet {
  return { ...set, facts: selectFacts(set, request).map((entry) => entry.fact) };
}
