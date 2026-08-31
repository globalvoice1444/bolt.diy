import { describe, expect, it } from 'vitest';
import { interpretBrief } from './interpret';
import type { StructuredTextGenerator } from './provider/openai-text';

/**
 * Reading the Partner's request. The stages downstream of it — authoring copy
 * from approved facts, auditing the claims and rendering the result — are
 * covered in `authorship.spec.ts`.
 */
function textGen(payloads: unknown[]): StructuredTextGenerator {
  const queue = [...payloads];

  return {
    provider: 'stub',
    model: 'stub-text/1',
    async generate<T>() {
      const next = queue.shift();

      if (next === undefined) {
        throw new Error('no payload queued');
      }

      return next as T;
    },
  };
}

const MED_SPA = 'Create a premium campaign for Med Spas. Elegant, persuasive, image-forward, high-converting.';

describe('brief interpretation', () => {
  it('uses the model result when available', async () => {
    const generator = textGen([
      {
        objective: 'Book more consultations.',
        vertical: 'med-spa',
        audience: 'practice managers',
        tone: 'elegant',
        imagePreference: 'image-forward',
        conversionGoal: 'book-demo',
        creativeDirection: null,
        angle: 'Lead with the moment the phone goes unanswered.',
      },
    ]);
    const result = await interpretBrief({ userInstruction: MED_SPA }, generator);

    expect(result.modelInterpreted).toBe(true);
    expect(result.tone).toBe('elegant');
    expect(result.angle).toContain('phone');
  });

  it('falls back to deterministic reading when no model is available', async () => {
    const result = await interpretBrief({ userInstruction: MED_SPA }, null);

    expect(result.modelInterpreted).toBe(false);
    expect(result.tone).toBe('elegant');
  });

  it('falls back when the model throws rather than failing the campaign', async () => {
    const failing: StructuredTextGenerator = {
      provider: 'stub',
      model: 'stub/1',
      async generate() {
        throw new Error('model down');
      },
    };
    const result = await interpretBrief({ userInstruction: MED_SPA }, failing);

    expect(result.modelInterpreted).toBe(false);
  });

  it('normalises a hostile direction value instead of trusting it', async () => {
    const generator = textGen([
      {
        objective: 'x',
        vertical: null,
        audience: null,
        tone: 'elegant',
        imagePreference: 'balanced',
        conversionGoal: 'book-demo',
        creativeDirection: '../evil',
        angle: 'y',
      },
    ]);
    const result = await interpretBrief({ userInstruction: MED_SPA }, generator);

    expect(result.creativeDirection).toBeNull();
  });
});
