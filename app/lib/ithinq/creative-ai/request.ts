import { DIRECTION_IDS, type DirectionId } from '~/lib/ithinq/pagespec/creative';

/**
 * What the Partner asked for.
 *
 * This is creative intent, not business truth. Nothing here is authoritative:
 * facts, capabilities, pricing, Partner identity, referral destinations and
 * disclosures all continue to come from the PageSpec. A request can only
 * influence how a page is expressed.
 */
export const TONES = ['elegant', 'bold', 'minimal', 'energetic', 'professional', 'warm'] as const;

export type Tone = (typeof TONES)[number];

export const IMAGE_PREFERENCES = ['image-forward', 'balanced', 'typographic'] as const;

export type ImagePreference = (typeof IMAGE_PREFERENCES)[number];

export const CONVERSION_GOALS = ['book-demo', 'request-quote', 'learn-more', 'start-trial'] as const;

export type ConversionGoal = (typeof CONVERSION_GOALS)[number];

export interface CreativeRequest {
  /** Free-text intent, exactly as the Partner phrased it. */
  userInstruction: string;
  objective: string;
  vertical: string | null;
  audience: string | null;
  tone: Tone;
  imagePreference: ImagePreference;
  conversionGoal: ConversionGoal;

  /** Explicit direction override; otherwise derived downstream. */
  creativeDirection: DirectionId | null;
}

export interface CreativeRequestInput {
  userInstruction?: string;
  objective?: string;
  vertical?: string | null;
  audience?: string | null;
  tone?: string;
  imagePreference?: string;
  conversionGoal?: string;
  creativeDirection?: string;
}

function pick<T extends string>(values: readonly T[], candidate: unknown, fallback: T): T {
  return typeof candidate === 'string' && (values as readonly string[]).includes(candidate)
    ? (candidate as T)
    : fallback;
}

/**
 * Keyword cues read from a plain-language request.
 *
 * Deliberately a small deterministic lexicon rather than a model call: Phase 2
 * proves the orchestration seam and image generation, and a language model in
 * this position would make the pipeline non-deterministic before the parts
 * downstream of it have been reviewed. The seam is here for one to take over.
 */
const TONE_CUES: ReadonlyArray<[Tone, readonly string[]]> = [
  ['elegant', ['elegant', 'premium', 'luxury', 'sophisticated', 'refined', 'upscale']],
  ['bold', ['bold', 'punchy', 'aggressive', 'high-energy', 'direct-response', 'urgent']],
  ['minimal', ['minimal', 'clean', 'simple', 'understated', 'restrained']],
  ['energetic', ['energetic', 'vibrant', 'lively', 'dynamic']],
  ['professional', ['professional', 'corporate', 'clinical', 'trusted', 'authoritative']],
  ['warm', ['warm', 'friendly', 'approachable', 'welcoming', 'human']],
];

const IMAGE_CUES: ReadonlyArray<[ImagePreference, readonly string[]]> = [
  ['image-forward', ['image-forward', 'image forward', 'visual', 'photographic', 'imagery', 'picture-led']],
  ['typographic', ['typographic', 'text-only', 'no images', 'type-led', 'typography-forward']],
];

const GOAL_CUES: ReadonlyArray<[ConversionGoal, readonly string[]]> = [
  ['book-demo', ['demo', 'book', 'consultation', 'appointment']],
  ['request-quote', ['quote', 'estimate', 'pricing enquiry']],
  ['start-trial', ['trial', 'sign up', 'signup', 'get started']],
  ['learn-more', ['learn more', 'explain', 'educate']],
];

const VERTICAL_CUES: readonly string[] = [
  'med spa',
  'med-spa',
  'medspa',
  'dental',
  'clinic',
  'hvac',
  'plumbing',
  'roofing',
  'landscaping',
  'legal',
  'law firm',
  'hospitality',
  'hotel',
  'saas',
  'agency',
  'home service',
];

function matchCue<T extends string>(text: string, cues: ReadonlyArray<[T, readonly string[]]>): T | null {
  for (const [value, words] of cues) {
    if (words.some((word) => text.includes(word))) {
      return value;
    }
  }

  return null;
}

/**
 * Normalise a request.
 *
 * Explicit fields always win; free text only fills what was not supplied. The
 * result is deterministic, so the same request always produces the same page.
 */
export function normaliseCreativeRequest(input: CreativeRequestInput = {}): CreativeRequest {
  const instruction = (input.userInstruction ?? '').trim();
  const text = instruction.toLowerCase();

  const vertical =
    input.vertical?.trim() || VERTICAL_CUES.find((cue) => text.includes(cue))?.replace(/\s+/g, '-') || null;

  return {
    userInstruction: instruction,
    objective: (input.objective ?? '').trim() || 'Convert qualified visitors into booked conversations.',
    vertical,
    audience: input.audience?.trim() || null,
    tone: pick(TONES, input.tone, matchCue(text, TONE_CUES) ?? 'professional'),
    imagePreference: pick(IMAGE_PREFERENCES, input.imagePreference, matchCue(text, IMAGE_CUES) ?? 'balanced'),
    conversionGoal: pick(CONVERSION_GOALS, input.conversionGoal, matchCue(text, GOAL_CUES) ?? 'book-demo'),
    creativeDirection: (DIRECTION_IDS as readonly string[]).includes(input.creativeDirection ?? '')
      ? (input.creativeDirection as DirectionId)
      : null,
  };
}
