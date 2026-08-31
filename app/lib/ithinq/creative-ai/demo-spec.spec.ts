import { describe, expect, it } from 'vitest';
import { validatePageSpec } from '~/lib/ithinq/pagespec/validator';
import { DEMO_SPECS } from './demo-specs';

/**
 * The synthetic reviewer fixture must satisfy the same contract as a real
 * document. A demo document that could not be validated would prove nothing.
 */
describe('demo documents', () => {
  for (const entry of DEMO_SPECS) {
    it(`${entry.id} validates against PageSpec 1.0`, () => {
      const result = validatePageSpec(entry.spec);

      expect(result.findings.filter((f) => f.severity === 'fatal')).toEqual([]);
      expect(result.renderable).toBe(true);
    });
  }

  it('marks the hand-written fixture as synthetic', () => {
    expect(DEMO_SPECS.find((entry) => entry.id === 'hvac')?.synthetic).toBe(true);
    expect(DEMO_SPECS.find((entry) => entry.id === 'med-spa')?.synthetic).toBe(false);
  });
});
