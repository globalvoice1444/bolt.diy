import examplePageSpec from '@ithinq-pagespec/page-spec.example.json';
import type { PageSpec } from '@ithinq-pagespec/page-spec';
import hvacDemo from './demo-hvac.json';
import medSpaBrief from './demo-medspa-brief.json';
import { HVAC_FACTS, MED_SPA_BRIEF_FACTS, MED_SPA_CONTRACT_FACTS } from './fact-sets';
import type { ApprovedFactSet } from './facts';

/**
 * Documents available to the reviewer surface, each with the fact set that
 * authorises what a campaign built from it may assert.
 *
 * `med-spa-brief` is the one that matters for campaign authorship: it carries
 * no headings, no bodies, no items and no questions — only structure, purposes
 * and fact references. A Partner with that and a sentence gets a finished
 * campaign page, which is the entire point of the phase. Nothing on it can be
 * a reworded source sentence, because there are no source sentences.
 *
 * `med-spa` is the authoritative producer-generated example that ships with
 * the contract, kept because authorship has to hold up against a real document
 * and not only against a fixture built for it.
 *
 * `hvac` is a SYNTHETIC REVIEWER FIXTURE for a second vertical. A market is a
 * property of the document, not of the brief: a Partner asking for an HVAC
 * page against a med-spa document correctly still gets med-spa facts.
 *
 * Neither fixture is Growth Engine output, and no page built from one should
 * be treated as real.
 */
export interface DemoSpec {
  id: string;
  label: string;
  synthetic: boolean;
  spec: PageSpec;
  factSet: ApprovedFactSet;
}

export const DEMO_SPECS: readonly DemoSpec[] = [
  {
    id: 'med-spa-brief',
    label: 'Med Spa · facts only, no supplied copy',
    synthetic: true,
    spec: medSpaBrief as unknown as PageSpec,
    factSet: MED_SPA_BRIEF_FACTS,
  },
  {
    id: 'med-spa',
    label: 'Med Spa (contract example)',
    synthetic: false,
    spec: examplePageSpec as unknown as PageSpec,
    factSet: MED_SPA_CONTRACT_FACTS,
  },
  {
    id: 'hvac',
    label: 'HVAC (synthetic reviewer fixture)',
    synthetic: true,
    spec: hvacDemo as unknown as PageSpec,
    factSet: HVAC_FACTS,
  },
];

export function demoSpec(id: string | null | undefined): DemoSpec {
  return DEMO_SPECS.find((entry) => entry.id === id) ?? DEMO_SPECS[0]!;
}
