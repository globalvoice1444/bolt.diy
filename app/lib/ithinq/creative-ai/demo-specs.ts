import examplePageSpec from '@ithinq-pagespec/page-spec.example.json';
import type { PageSpec } from '@ithinq-pagespec/page-spec';
import hvacDemo from './demo-hvac.json';

/**
 * Documents available to the reviewer surface.
 *
 * `med-spa` is the authoritative producer-generated example that ships with the
 * contract. `hvac` is a SYNTHETIC REVIEWER FIXTURE written by hand to exercise
 * a second vertical: a market is a property of the document, not of the brief,
 * so a Partner asking for an HVAC page against a med-spa document correctly
 * still gets med-spa facts. It is schema-valid and clearly labelled, and it is
 * not Growth Engine output — no page built from it should be treated as real.
 */
export interface DemoSpec {
  id: string;
  label: string;
  synthetic: boolean;
  spec: PageSpec;
}

export const DEMO_SPECS: readonly DemoSpec[] = [
  {
    id: 'med-spa',
    label: 'Med Spa (contract example)',
    synthetic: false,
    spec: examplePageSpec as unknown as PageSpec,
  },
  { id: 'hvac', label: 'HVAC (synthetic reviewer fixture)', synthetic: true, spec: hvacDemo as unknown as PageSpec },
];

export function demoSpec(id: string | null | undefined): DemoSpec {
  return DEMO_SPECS.find((entry) => entry.id === id) ?? DEMO_SPECS[0]!;
}
