import { createHash } from 'node:crypto';
import { FACT_REFERENCE_PATTERN, isAssertingPurpose, type PageSpec } from '@ithinq-pagespec/page-spec';

/**
 * The approved fact set — what a campaign is allowed to assert.
 *
 * Phase 3 bounded generated copy by making it rephrase the PageSpec's own
 * sentences. That is safe and useless for campaign authorship: a Partner who
 * has not already written the page has nothing for the model to rephrase.
 *
 * Phase 4 replaces the source string with a fact set. The writer may say
 * anything it likes, in any structure, as long as every factual assertion
 * about the product rests on one of these statements. Language is free;
 * claims are not.
 *
 * A fact set is an artifact of the fact authority, not of the renderer. The
 * renderer resolves it, shows it to the writer and validates against it, and
 * never adds to it — a renderer that could mint a fact would be the whole
 * truth boundary undone.
 */
/**
 * What kind of statement a fact is.
 *
 * `boundary` earns its place: a fact that states a limit — what the product
 * does not do, or what depends on how it is set up — is the one the writer
 * must never contradict and should reach for when meeting an objection. The
 * prompt says so by name, which it could not do without the classifier.
 */
export type FactKind = 'capability' | 'boundary' | 'audience' | 'product' | 'process';

export interface ApprovedFact {
  /** `f_` + a full lowercase SHA-256 digest, exactly as the contract requires. */
  ref: string;
  text: string;
  kind: FactKind;
}

/**
 * Where a fact set's authority comes from. Never a decoration: a reviewer
 * reading a generated page needs to know whether its claims trace to the
 * Growth Engine or to a fixture written to exercise the pipeline.
 *
 * - `growth-engine` — supplied by the fact authority. Nothing in this phase
 *   carries it; the renderer has no Growth Engine connection yet.
 * - `document-transcription` — the statements are transcribed from an
 *   authoritative PageSpec's own authored content and bound to that
 *   document's own `provenance.factRefs`. The texts are the document's; the
 *   ref-to-text binding is the renderer's reading of it.
 * - `reviewer-fixture` — hand-written to exercise a second vertical. Not
 *   authoritative about anything. No page built on it is real.
 */
export type FactAuthority = 'growth-engine' | 'document-transcription' | 'reviewer-fixture';

export interface ApprovedFactSet {
  id: string;

  /** What these facts are about, in one line. Shown to the writer. */
  subject: string;
  authority: FactAuthority;
  facts: readonly ApprovedFact[];
}

/**
 * The reference for a fact the renderer authored itself.
 *
 * Content-addressed, so a fixture's refs cannot drift from its texts: change
 * a word and the ref changes with it. Only ever used for sets the renderer
 * owns — a Growth Engine fact's ref is whatever the Growth Engine says it is,
 * and is never recomputed here.
 */
export function factRef(text: string): string {
  return `f_${createHash('sha256').update(text.trim()).digest('hex')}`;
}

/** True when every ref in the set is the digest of its own text. */
export function refsAreDerived(set: ApprovedFactSet): boolean {
  return set.facts.every((fact) => fact.ref === factRef(fact.text));
}

export function indexFacts(set: ApprovedFactSet): ReadonlyMap<string, ApprovedFact> {
  return new Map(set.facts.map((fact) => [fact.ref, fact]));
}

export interface SectionFacts {
  /** Facts this section's provenance points at, in the document's own order. */
  facts: ApprovedFact[];

  /** Refs the section claims that the fact set does not contain. */
  unresolved: string[];
}

/**
 * Resolve one section's `provenance.factRefs` against the fact set.
 *
 * The contract is explicit that provenance says which approved statement a
 * section rests on, not what it may say instead. So this drives EMPHASIS —
 * which facts the writer is pointed at for this beat — while the full set
 * stays the boundary of what may be asserted anywhere on the page.
 */
export function factsForSection(spec: PageSpec, set: ApprovedFactSet, index: number): SectionFacts {
  const section = spec.sections[index];

  if (!section) {
    return { facts: [], unresolved: [] };
  }

  const byRef = indexFacts(set);
  const facts: ApprovedFact[] = [];
  const unresolved: string[] = [];

  for (const ref of section.provenance.factRefs) {
    const fact = byRef.get(ref);

    if (fact) {
      facts.push(fact);
    } else {
      unresolved.push(ref);
    }
  }

  return { facts, unresolved };
}

export interface FactCoverage {
  /** Refs the document cites that the fact set cannot resolve. */
  unresolvedRefs: string[];

  /**
   * Indices of sections that assert something about the product but whose
   * provenance resolves to nothing. The page still renders; the writer works
   * from the page-level set for those beats, which is weaker but not unsafe.
   */
  unsupportedAssertingSections: number[];
  malformedRefs: string[];
}

/**
 * How well a fact set covers a document.
 *
 * Diagnostics, deliberately not a gate. A partially covered document still
 * produces a page — every claim is validated against the fact set regardless
 * of whether provenance happened to point at the right entry.
 */
export function factCoverage(spec: PageSpec, set: ApprovedFactSet): FactCoverage {
  const byRef = indexFacts(set);
  const unresolvedRefs = new Set<string>();
  const malformedRefs = new Set<string>();
  const unsupportedAssertingSections: number[] = [];

  spec.sections.forEach((section, index) => {
    let resolved = 0;

    for (const ref of section.provenance.factRefs) {
      if (!FACT_REFERENCE_PATTERN.test(ref)) {
        malformedRefs.add(ref);
        continue;
      }

      if (byRef.has(ref)) {
        resolved += 1;
      } else {
        unresolvedRefs.add(ref);
      }
    }

    if (resolved === 0 && isAssertingPurpose(section.purpose)) {
      unsupportedAssertingSections.push(index);
    }
  });

  return {
    unresolvedRefs: [...unresolvedRefs],
    unsupportedAssertingSections,
    malformedRefs: [...malformedRefs],
  };
}

/** The document's own words: still legitimate material, no longer the limit. */
export function documentText(spec: PageSpec): string[] {
  const parts = [spec.page.headline, spec.page.subheadline, spec.page.audience, spec.page.name];

  for (const section of spec.sections) {
    parts.push(section.eyebrow ?? '', section.heading ?? '', section.body ?? '');
    parts.push(...(section.items ?? []));

    for (const qa of section.qa ?? []) {
      parts.push(qa.question, qa.answer);
    }
  }

  return parts.filter(Boolean);
}

/** Every approved statement, as plain text. The boundary of what may be claimed. */
export function factTexts(set: ApprovedFactSet): string[] {
  return set.facts.map((fact) => fact.text);
}

export const EMPTY_FACT_SET: ApprovedFactSet = {
  id: 'none',
  subject: 'No approved facts were supplied.',
  authority: 'reviewer-fixture',
  facts: [],
};
