import { DIRECTION_IDS } from '~/lib/ithinq/pagespec/creative';
import { normaliseCreativeRequest, type CreativeRequest, type CreativeRequestInput } from './request';
import type { StructuredTextGenerator } from './provider/openai-text';

/**
 * Model-driven reading of a plain-language brief.
 *
 * Phase 2 read the brief with a keyword lexicon, which could not tell
 * "elegant but not stuffy" from "elegant". A model reads intent; the
 * deterministic reader stays as the fallback so the pipeline never depends on
 * a model being reachable.
 *
 * This stage produces presentation intent only. It is shown the Partner's
 * words and nothing from the PageSpec, so it has no facts available to invent
 * with even if it tried.
 */
const INTERPRETATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'objective',
    'vertical',
    'audience',
    'tone',
    'imagePreference',
    'conversionGoal',
    'creativeDirection',
    'angle',
  ],
  properties: {
    objective: { type: 'string', description: 'One sentence describing what the page must achieve.' },
    vertical: { type: ['string', 'null'], description: 'Market vertical, lowercase kebab-case, or null.' },
    audience: { type: ['string', 'null'], description: 'Who the page speaks to, or null.' },
    tone: { type: 'string', enum: ['elegant', 'bold', 'minimal', 'energetic', 'professional', 'warm'] },
    imagePreference: {
      type: 'string',
      enum: ['image-forward', 'balanced', 'typographic'],
      description:
        'Choose "typographic" ONLY when the brief explicitly rejects imagery (for example "no images", "text-only", "minimal imagery"). Words like scannable, punchy, clean or simple describe layout, not an absence of photography.',
    },
    conversionGoal: { type: 'string', enum: ['book-demo', 'request-quote', 'learn-more', 'start-trial'] },
    creativeDirection: {
      type: ['string', 'null'],
      enum: [...DIRECTION_IDS, null],
      description: 'Only when the brief clearly implies one; otherwise null.',
    },
    angle: { type: 'string', description: 'The creative angle in one sentence: how this page should persuade.' },
  },
} as const;

const SYSTEM = `You are a creative director reading a marketing brief.

Read the brief and decide how the page should FEEL and be EXPRESSED.

You are choosing presentation only. You are not writing the page, and you know
nothing about the product's facts, pricing or capabilities. Do not invent any.

Pick the tone the brief actually implies rather than defaulting to the middle
option.

Imagery is the default. Most marketing pages are stronger with photography, and
this system can generate it, so choose "image-forward" when the brief asks for
it and "balanced" for almost everything else. Choose "typographic" ONLY when the
brief explicitly rejects imagery — "no images", "text-only", "minimal imagery",
"mostly type". Words like scannable, punchy, clean, simple, bold or minimal
describe layout and voice, not an absence of photography; they are not a reason
to strip the images out of a page.

Choose a creative direction only when the brief clearly implies one, otherwise
return null and let the document's own market decide.`;

export interface InterpretedRequest extends CreativeRequest {
  /** One-sentence creative angle, from the model when available. */
  angle: string | null;

  /** True when a model produced this rather than the deterministic reader. */
  modelInterpreted: boolean;
}

export async function interpretBrief(
  input: CreativeRequestInput,
  generator: StructuredTextGenerator | null,
): Promise<InterpretedRequest> {
  const deterministic = normaliseCreativeRequest(input);
  const instruction = deterministic.userInstruction;

  if (!generator || !instruction) {
    return { ...deterministic, angle: null, modelInterpreted: false };
  }

  try {
    const result = await generator.generate<{
      objective: string;
      vertical: string | null;
      audience: string | null;
      tone: string;
      imagePreference: string;
      conversionGoal: string;
      creativeDirection: string | null;
      angle: string;
    }>({
      system: SYSTEM,
      user: `Brief:\n${instruction}`,
      schema: INTERPRETATION_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'creative_interpretation',
      temperature: 0.4,
    });

    /*
     * The model's output is run back through the deterministic normaliser
     * rather than trusted directly, so an unexpected enum value or a stray
     * direction name falls back to a known-good value instead of reaching the
     * renderer.
     */
    const merged = normaliseCreativeRequest({
      ...input,
      userInstruction: instruction,
      objective: input.objective ?? result.objective,
      vertical: input.vertical ?? result.vertical,
      audience: input.audience ?? result.audience,
      tone: input.tone ?? result.tone,
      imagePreference: input.imagePreference ?? result.imagePreference,
      conversionGoal: input.conversionGoal ?? result.conversionGoal,
      creativeDirection: input.creativeDirection ?? result.creativeDirection ?? undefined,
    });

    return { ...merged, angle: result.angle?.trim() || null, modelInterpreted: true };
  } catch {
    // A model outage must never stop a page being produced.
    return { ...deterministic, angle: null, modelInterpreted: false };
  }
}
