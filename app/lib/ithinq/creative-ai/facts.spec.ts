import { describe, expect, it } from 'vitest';
import examplePageSpec from '@ithinq-pagespec/page-spec.example.json';
import { FACT_REFERENCE_PATTERN, isAssertingPurpose, type PageSpec } from '@ithinq-pagespec/page-spec';
import { DEMO_SPECS } from './demo-specs';
import { DERIVED_FACT_SETS, HVAC_FACTS, MED_SPA_BRIEF_FACTS, MED_SPA_CONTRACT_FACTS } from './fact-sets';
import { factCoverage, factRef, factsForSection, indexFacts, refsAreDerived } from './facts';

const contractExample = examplePageSpec as unknown as PageSpec;

describe('approved fact sets', () => {
  it('gives every fact a well-formed contract reference', () => {
    for (const set of [MED_SPA_CONTRACT_FACTS, MED_SPA_BRIEF_FACTS, HVAC_FACTS]) {
      for (const fact of set.facts) {
        expect(FACT_REFERENCE_PATTERN.test(fact.ref), `${set.id}: ${fact.ref}`).toBe(true);
        expect(fact.text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('never reuses a reference within a set', () => {
    for (const set of [MED_SPA_CONTRACT_FACTS, MED_SPA_BRIEF_FACTS, HVAC_FACTS]) {
      expect(indexFacts(set).size).toBe(set.facts.length);
    }
  });

  /*
   * The tripwire for every set the renderer authored itself. Editing a fact's
   * wording without recomputing its reference would silently detach a claim
   * from the statement that supports it; here it fails instead.
   */
  it('content-addresses every reference in a renderer-authored set', () => {
    for (const set of DERIVED_FACT_SETS) {
      expect(refsAreDerived(set), `${set.id} has a reference that is not the digest of its own text`).toBe(true);
    }
  });

  it('does not claim Growth Engine authority for anything in this phase', () => {
    for (const set of [MED_SPA_CONTRACT_FACTS, MED_SPA_BRIEF_FACTS, HVAC_FACTS]) {
      expect(set.authority).not.toBe('growth-engine');
    }
  });

  it('derives a reference from the fact text, stably', () => {
    expect(factRef('Answers inbound calls.')).toBe(factRef(' Answers inbound calls. '));
    expect(factRef('Answers inbound calls.')).not.toBe(factRef('Answers outbound calls.'));
    expect(FACT_REFERENCE_PATTERN.test(factRef('anything'))).toBe(true);
  });
});

describe('resolving facts from provenance.factRefs', () => {
  it('resolves the contract example against its transcribed set', () => {
    const mechanism = contractExample.sections.findIndex((section) => section.kind === 'mechanism');
    const { facts, unresolved } = factsForSection(contractExample, MED_SPA_CONTRACT_FACTS, mechanism);

    expect(unresolved).toEqual([]);
    expect(facts.length).toBe(contractExample.sections[mechanism]!.provenance.factRefs.length);
    expect(facts.map((fact) => fact.text)).toContain('Answers inbound calls.');
  });

  it('keeps the document’s own order', () => {
    const index = contractExample.sections.findIndex((section) => section.kind === 'mechanism');
    const { facts } = factsForSection(contractExample, MED_SPA_CONTRACT_FACTS, index);

    expect(facts.map((fact) => fact.ref)).toEqual(contractExample.sections[index]!.provenance.factRefs);
  });

  it('reports a reference the set cannot resolve instead of inventing one', () => {
    const spec = JSON.parse(JSON.stringify(contractExample)) as PageSpec;
    spec.sections[2]!.provenance.factRefs = [`f_${'a'.repeat(64)}`];

    const { facts, unresolved } = factsForSection(spec, MED_SPA_CONTRACT_FACTS, 2);

    expect(facts).toEqual([]);
    expect(unresolved).toEqual([`f_${'a'.repeat(64)}`]);
  });

  it('returns nothing for a section that cites nothing', () => {
    expect(factsForSection(contractExample, MED_SPA_CONTRACT_FACTS, 0).facts).toEqual([]);
  });

  it('covers every demo document with its own fact set', () => {
    for (const demo of DEMO_SPECS) {
      const coverage = factCoverage(demo.spec, demo.factSet);

      expect(coverage.unresolvedRefs, `${demo.id} cites unresolvable references`).toEqual([]);
      expect(coverage.malformedRefs, `${demo.id} cites malformed references`).toEqual([]);
      expect(coverage.unsupportedAssertingSections, `${demo.id} asserts without support`).toEqual([]);
    }
  });

  it('flags an asserting section that rests on nothing', () => {
    const spec = JSON.parse(JSON.stringify(contractExample)) as PageSpec;

    for (const section of spec.sections) {
      section.provenance.factRefs = [];
    }

    const coverage = factCoverage(spec, MED_SPA_CONTRACT_FACTS);
    const asserting = spec.sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => isAssertingPurpose(section.purpose))
      .map(({ index }) => index);

    expect(coverage.unsupportedAssertingSections).toEqual(asserting);
  });
});

describe('the approved-facts document', () => {
  const brief = DEMO_SPECS.find((entry) => entry.id === 'med-spa-brief')!;
  const factText = new Set(brief.factSet.facts.map((fact) => fact.text));

  /*
   * PageSpec 1.0 requires every section to carry content — a mechanism needs a
   * heading and a body, a vertical_fit needs items, an faq needs questions.
   * A literally empty document is not a valid document, and that is the
   * contract being right rather than in the way: a document that says nothing
   * is not a document.
   *
   * So this fixture is the honest minimum instead: a FACT SHEET. Every
   * asserting section states its approved facts verbatim and sells none of
   * them. There is no campaign copy anywhere in it to rephrase, which is what
   * makes a campaign built from it necessarily authored.
   */
  it('states its approved facts verbatim and adds nothing to them', () => {
    for (const section of brief.spec.sections) {
      if (section.provenance.factRefs.length === 0) {
        continue;
      }

      const stated = section.provenance.factRefs
        .map((ref) => brief.factSet.facts.find((fact) => fact.ref === ref)?.text ?? '')
        .filter(Boolean);

      if (section.body) {
        expect(section.body, `section ${section.kind} body is not a plain fact restatement`).toBe(stated.join(' '));
      }

      for (const item of section.items ?? []) {
        expect(factText.has(item), `item is not an approved fact: ${item}`).toBe(true);
      }

      for (const pair of section.qa ?? []) {
        expect(factText.has(pair.answer), `answer is not an approved fact: ${pair.answer}`).toBe(true);
        expect(pair.question.endsWith('?')).toBe(true);
        expect(pair.question.length).toBeLessThan(60);
      }
    }
  });

  it('keeps its non-asserting beats to a plain line each', () => {
    for (const section of brief.spec.sections) {
      if (section.provenance.factRefs.length > 0) {
        continue;
      }

      expect(section.body ?? '').not.toBe('');
      expect((section.body ?? '').length).toBeLessThan(80);
      expect(section.items ?? []).toEqual([]);
      expect(section.qa ?? []).toEqual([]);
    }
  });

  it('uses neutral structural labels rather than headlines', () => {
    for (const section of brief.spec.sections) {
      expect((section.heading ?? '').length).toBeLessThan(24);
    }
  });

  it('still carries the structure and the fact references a campaign needs', () => {
    expect(brief.spec.sections.length).toBeGreaterThanOrEqual(5);
    expect(brief.spec.sections.filter((section) => section.provenance.factRefs.length > 0).length).toBeGreaterThan(0);
    expect(brief.factSet.facts.length).toBeGreaterThanOrEqual(10);
  });

  it('gives the writer product, audience, capability and boundary facts', () => {
    const kinds = new Set(brief.factSet.facts.map((fact) => fact.kind));

    expect(kinds.has('product')).toBe(true);
    expect(kinds.has('audience')).toBe(true);
    expect(kinds.has('capability')).toBe(true);
    expect(kinds.has('boundary')).toBe(true);
  });
});

describe('the verticals are genuinely different', () => {
  it('shares no fact wording between med spa and HVAC', () => {
    const medSpa = new Set(MED_SPA_BRIEF_FACTS.facts.map((fact) => fact.text.toLowerCase()));

    for (const fact of HVAC_FACTS.facts) {
      expect(medSpa.has(fact.text.toLowerCase()), `shared wording: ${fact.text}`).toBe(false);
    }
  });

  it('gives each vertical a boundary the other does not have', () => {
    const hvacBoundaries = HVAC_FACTS.facts.filter((fact) => fact.kind === 'boundary').map((fact) => fact.text);
    const medSpaBoundaries = MED_SPA_BRIEF_FACTS.facts.filter((fact) => fact.kind === 'boundary').map((f) => f.text);

    expect(hvacBoundaries.some((text) => text.includes('emergency dispatch'))).toBe(true);
    expect(medSpaBoundaries.some((text) => text.includes('clinical advice'))).toBe(true);
  });
});
