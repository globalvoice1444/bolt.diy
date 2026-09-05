import { assetIdFor, type AssetStore } from './asset-store';
import { resolveAssetStore } from './asset-store-resolve';
import type { AspectRatio, AssetNeed } from './asset-need';
import { buildImagePrompt } from './prompt';
import { resolveGenerator } from './orchestrator';
import type { CreativeStrategy, VisualMood } from './strategy';
import { AssetGenerationError, type CreativeAssetGenerator } from './provider/types';
import { hasOverlayText, OVERLAY_FIELDS, OVERLAY_LIMITS, type OverlayField, type OverlayText } from './overlay';
import {
  groundedExpectations,
  resolveOverlayVerifier,
  type OverlayVerification,
  type OverlayVerifier,
} from './overlay-verify';

/**
 * Imagery for a caller that already owns its own truth.
 *
 * The campaign pipeline exists to turn a PageSpec into a finished page: it
 * authors copy, audits claims and derives imagery from the document. A caller
 * that has ALREADY done its own authorship — its own approved facts, its own
 * disclosure, its own destination — needs none of that and must not be given
 * it, because running it would attach this service's fixture identity to
 * someone else's campaign.
 *
 * So this is a deliberately smaller path: a visual brief in, stored image out.
 * It reuses the frozen prompt builder, the frozen provider and the frozen
 * asset store, and adds no creative reasoning of its own.
 *
 * WHAT THIS PATH MUST NEVER TOUCH — every one of these is the caller's:
 * approved facts, business claims, partner identity, referral destinations,
 * disclosures, campaign copy. It receives descriptive direction for a picture
 * and returns a picture. It cannot reach a PageSpec and cannot author a line.
 */
export interface VisualServiceRequest {
  /** What the image must communicate, in words, from the caller's engine. */
  direction: string;

  /** The caller's own label for what asked. Diagnostics and prompt context. */
  capability?: string;
  aspectRatio?: AspectRatio;
  audience?: string;

  /** Things the picture must not contain, on top of the standing exclusions. */
  mustAvoid?: string[];
  mood?: VisualMood;
  count?: number;

  /**
   * Words the caller has approved and wants rendered ON the creative.
   *
   * Omit it and this endpoint behaves exactly as it always has — a
   * photograph, with lettering suppressed. Its presence is the whole switch
   * into designed advertising; there is no separate mode flag to contradict
   * it.
   */
  overlay?: OverlayText;

  /**
   * Which overlay fields are grounded BUSINESS TRUTH rather than copy.
   *
   * The caller decides this, because the caller owns the truth — this service
   * has no way to know whether "First month free" is a real promotion or a
   * turn of phrase, and acquiring one would make it the authority for facts it
   * must never own. All it does with the answer is read those strings back
   * off the rendered image.
   */
  groundedFields?: OverlayField[];

  /** Short label for the concept. Prompt context and diagnostics. */
  creativeType?: string;

  /** The caller's art direction, in prose. Steers design without caging it. */
  creativeDirection?: string;
}

export interface RenderedVisual {
  id: string;
  url: string;
  mimeType: string;
  width: number;
  height: number;
  alt: string;
  provider: string;
  model: string;

  /** True when a development stand-in produced it rather than a real model. */
  synthetic: boolean;

  /**
   * What was read back, and what did not survive rendering.
   *
   * Present only when the caller marked something grounded. `skipped` means no
   * verifier could run — never that the image passed.
   */
  verification?: OverlayVerification;
}

export interface VisualServiceResult {
  assets: RenderedVisual[];
  provider: string;
  model: string;
  synthetic: boolean;
}

export class VisualRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'VisualRequestError';
  }
}

const ASPECT_RATIOS: readonly AspectRatio[] = ['16:9', '4:5', '3:2', '1:1'];
const MOODS: readonly VisualMood[] = ['editorial', 'clinical', 'energetic', 'refined', 'utilitarian'];

/** Bounds. A caller reaching a paid model may not send unbounded text. */
export const MAX_DIRECTION_LENGTH = 1200;

const MAX_AUDIENCE_LENGTH = 200;
const MAX_AVOID_ITEMS = 12;
const MAX_AVOID_LENGTH = 80;
const MAX_COUNT = 3;

function text(value: unknown, limit: number, field: string, required: boolean): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new VisualRequestError(`${field} is required.`, 'invalid_request');
    }

    return undefined;
  }

  if (typeof value !== 'string') {
    throw new VisualRequestError(`${field} must be a string.`, 'invalid_request');
  }

  const trimmed = value.trim();

  if (required && trimmed.length === 0) {
    throw new VisualRequestError(`${field} is required.`, 'invalid_request');
  }

  if (trimmed.length > limit) {
    throw new VisualRequestError(`${field} may be at most ${limit} characters.`, 'invalid_request');
  }

  return trimmed;
}

/**
 * The overlay, bounded per field and otherwise untouched.
 *
 * NOTE WHAT IS NOT VALIDATED: tone, aggression, punctuation, capitalisation,
 * whether a headline is a question, whether an offer sounds pushy. Those are
 * the caller's creative decisions and this service has no opinion about them.
 * Only length is bounded, and only because a 400-character "headline" is not
 * something any renderer can set.
 */
function normaliseOverlay(raw: unknown): OverlayText | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new VisualRequestError('overlay must be an object.', 'invalid_request');
  }

  const source = raw as Record<string, unknown>;
  const overlay: OverlayText = {};

  for (const field of OVERLAY_FIELDS) {
    const value = text(source[field], OVERLAY_LIMITS[field], `overlay.${field}`, false);

    if (value !== undefined) {
      overlay[field] = value;
    }
  }

  return hasOverlayText(overlay) ? overlay : undefined;
}

/**
 * Which of those strings are business truth.
 *
 * A field named here that carries no text is dropped rather than rejected: a
 * caller consistently marking `offer` grounded should not get a 400 on the one
 * campaign that has no offer.
 */
function normaliseGrounded(raw: unknown, overlay: OverlayText | undefined): OverlayField[] {
  if (raw === undefined || raw === null) {
    return [];
  }

  if (!Array.isArray(raw)) {
    throw new VisualRequestError('groundedFields must be an array of overlay field names.', 'invalid_request');
  }

  const grounded: OverlayField[] = [];

  for (const entry of raw) {
    if (typeof entry !== 'string' || !OVERLAY_FIELDS.includes(entry as OverlayField)) {
      throw new VisualRequestError(`groundedFields may only name ${OVERLAY_FIELDS.join(', ')}.`, 'invalid_request');
    }

    const field = entry as OverlayField;

    if (overlay?.[field] && !grounded.includes(field)) {
      grounded.push(field);
    }
  }

  return grounded;
}

export function normaliseVisualRequest(
  body: unknown,
): Required<Pick<VisualServiceRequest, 'direction'>> & VisualServiceRequest {
  if (typeof body !== 'object' || body === null) {
    throw new VisualRequestError('Body must be a JSON object.', 'invalid_request');
  }

  const raw = body as Record<string, unknown>;
  const direction = text(raw.direction, MAX_DIRECTION_LENGTH, 'direction', true)!;
  const aspect = raw.aspectRatio ?? raw.aspect_ratio;

  if (aspect !== undefined && !ASPECT_RATIOS.includes(aspect as AspectRatio)) {
    throw new VisualRequestError(`aspectRatio must be one of ${ASPECT_RATIOS.join(', ')}.`, 'invalid_request');
  }

  if (raw.mood !== undefined && !MOODS.includes(raw.mood as VisualMood)) {
    throw new VisualRequestError(`mood must be one of ${MOODS.join(', ')}.`, 'invalid_request');
  }

  const avoidRaw = raw.mustAvoid ?? raw.must_avoid ?? [];

  if (!Array.isArray(avoidRaw)) {
    throw new VisualRequestError('mustAvoid must be an array of strings.', 'invalid_request');
  }

  if (avoidRaw.length > MAX_AVOID_ITEMS) {
    throw new VisualRequestError(`mustAvoid may hold at most ${MAX_AVOID_ITEMS} entries.`, 'invalid_request');
  }

  const mustAvoid = avoidRaw.map((entry, index) => text(entry, MAX_AVOID_LENGTH, `mustAvoid[${index}]`, true)!);
  const count = raw.count === undefined ? 1 : Number(raw.count);

  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    throw new VisualRequestError(`count must be an integer between 1 and ${MAX_COUNT}.`, 'invalid_request');
  }

  const overlay = normaliseOverlay(raw.overlay);
  const grounded = normaliseGrounded(raw.groundedFields ?? raw.grounded_fields, overlay);

  return {
    direction,
    overlay,
    groundedFields: grounded,
    creativeType: text(raw.creativeType ?? raw.creative_type, 40, 'creativeType', false),
    creativeDirection: text(
      raw.creativeDirection ?? raw.creative_direction,
      MAX_DIRECTION_LENGTH,
      'creativeDirection',
      false,
    ),
    capability: text(raw.capability, 80, 'capability', false),
    aspectRatio: (aspect as AspectRatio) ?? '1:1',
    audience: text(raw.audience, MAX_AUDIENCE_LENGTH, 'audience', false),
    mustAvoid,
    mood: (raw.mood as VisualMood) ?? 'refined',
    count,
  };
}

/**
 * Placement follows the shape, because composition is what the shape is for.
 *
 * A wide image is composed as a banner and a tall one as an inset; the frozen
 * prompt builder already knows what each placement needs.
 */
function placementFor(aspectRatio: AspectRatio): AssetNeed['placementIntent'] {
  switch (aspectRatio) {
    case '16:9':
    case '3:2':
      return 'full-bleed';
    case '4:5':
      return 'section-inset';
    default:
      return 'section-inset';
  }
}

/**
 * The caller's brief, expressed as the need the frozen prompt builder reads.
 *
 * `subject` carries the caller's direction verbatim. Nothing here interprets
 * it, rewrites it or adds a claim to it.
 */
export function visualNeedFor(request: VisualServiceRequest, index: number): AssetNeed {
  const aspectRatio = request.aspectRatio ?? '1:1';
  const audience = request.audience ? ` Intended for ${request.audience}.` : '';
  const avoid = (request.mustAvoid ?? []).length > 0 ? ` Must not contain: ${request.mustAvoid!.join(', ')}.` : '';

  return {
    id: `visual-${index}`,
    role: index === 0 ? 'hero' : 'supporting',
    subject: `${request.direction}${avoid}`,
    context: `${request.capability ?? 'marketing visual'} requested by the calling service.${audience}`,
    visualStyle: 'contemporary commercial photography, natural light, restrained palette',
    aspectRatio,
    placementIntent: placementFor(aspectRatio),
    sectionAssociation: null,
    altIntent: request.direction,
    required: false,
    overlay: request.overlay,
    creativeType: request.creativeType,
    creativeDirection: request.creativeDirection,
  };
}

/** Only `visualMood` is read by `buildImagePrompt`; the rest is inert scaffolding. */
function strategyFor(mood: VisualMood): CreativeStrategy {
  return {
    strategyVersion: 1,
    objective: 'external-visual-request',
    narrativeAngle: 'situation-first',
    visualMood: mood,
    directionId: 'editorial-luxe',
    copyStyle: 'editorial',
    imageStrategy: 'supporting',
    pageDensity: 'comfortable',
    ctaIntensity: 'balanced',
    emphasisSectionIndices: [],
    rationale: [],
  };
}

export interface RenderVisualsOptions {
  env?: Record<string, string | undefined>;
  generator?: CreativeAssetGenerator;
  store?: AssetStore;
  verifier?: OverlayVerifier;
}

/**
 * What a second attempt is told, when a grounded string came out wrong.
 *
 * ONE corrective attempt, and it corrects the RENDERING rather than the
 * concept. It repeats the strings and asks for them plainly; it does not
 * change the creative direction, drop the offer, or quietly redesign the ad
 * into something safer. Silently altering what the caller asked for would be a
 * worse failure than reporting an imperfect render, because the caller can see
 * the result and decide, and cannot see a substitution.
 *
 * There is no third attempt. Past this point the honest answer is the image
 * plus a report of what did not survive, which is what the caller gets.
 */
function correctionFor(prompt: string, expected: Partial<Record<OverlayField, string>>): string {
  const strings = Object.values(expected)
    .map((value) => `"${value}"`)
    .join(', ');

  return `${prompt} CRITICAL: the previous attempt rendered one of the required strings incorrectly. Reproduce ${strings} character for character, exactly as written, clearly legible and not obscured. Change nothing else about the design.`;
}

/**
 * Render and store the requested visuals.
 *
 * Content addressing is inherited unchanged: an identical brief resolves to an
 * identical id, so a caller that repeats a request — or retries one — reuses
 * stored bytes instead of paying to generate them again.
 */
export async function renderVisuals(
  request: VisualServiceRequest,
  options: RenderVisualsOptions = {},
): Promise<VisualServiceResult> {
  const env = options.env ?? {};
  const generator = options.generator ?? resolveGenerator(env);
  const store = options.store ?? resolveAssetStore(env);
  const strategy = strategyFor(request.mood ?? 'refined');
  const assets: RenderedVisual[] = [];

  const expected =
    request.overlay && (request.groundedFields ?? []).length > 0
      ? groundedExpectations(request.overlay, request.groundedFields!)
      : {};

  /*
   * NOTHING GROUNDED, NOTHING READ BACK — and the gate is the presence of a
   * grounded fact, never the presence of a verifier. An injected verifier must
   * not be able to introduce a vision call on a campaign that has no business
   * truth on its creative, because that call is a real cost on the majority of
   * ads, which carry none.
   */
  const verifier = Object.keys(expected).length === 0 ? undefined : (options.verifier ?? resolveOverlayVerifier(env));

  for (let index = 0; index < (request.count ?? 1); index += 1) {
    const need = visualNeedFor(request, index);
    const prompt = buildImagePrompt(need, strategy);
    let id = assetIdFor(prompt, need.id);
    const existing = await store.get(id);
    let produced = existing
      ? { bytes: existing.bytes, mimeType: existing.mimeType, width: 0, height: 0 }
      : await generator.generate({ need, prompt, alt: need.altIntent });

    if (!existing) {
      await store.put(id, produced.mimeType, produced.bytes);
    }

    /*
     * Read back only what is worth reading back, and only when we actually
     * generated. A cache hit was verified the first time it was made, and
     * paying a vision call on every repeat of an identical brief would tax
     * the content addressing that makes repeats free.
     */
    let verification: OverlayVerification | undefined;

    if (verifier && !existing) {
      verification = await verifier.verify({
        imageBase64: toBase64(produced.bytes),
        mimeType: produced.mimeType,
        expected,
      });

      if (verification.mismatched.length > 0) {
        const retryPrompt = correctionFor(prompt, expected);
        const retryId = assetIdFor(retryPrompt, need.id);
        const retry = await generator.generate({ need, prompt: retryPrompt, alt: need.altIntent });

        await store.put(retryId, retry.mimeType, retry.bytes);

        const second = await verifier.verify({
          imageBase64: toBase64(retry.bytes),
          mimeType: retry.mimeType,
          expected,
        });

        /*
         * Keep the better of the two, and say which strings are still wrong.
         * The caller reviews this creative before anything is published, so an
         * honest warning beats a silently degraded ad.
         */
        if (second.mismatched.length <= verification.mismatched.length) {
          id = retryId;
          produced = { bytes: retry.bytes, mimeType: retry.mimeType, width: retry.width, height: retry.height };
          verification = second;
        }
      }
    }

    assets.push({
      id,
      url: store.urlFor(id),
      mimeType: produced.mimeType,
      width: produced.width,
      height: produced.height,
      alt: need.altIntent,
      provider: generator.provider,
      model: generator.model,
      synthetic: generator.synthetic,
      ...(verification ? { verification } : {}),
    });
  }

  return { assets, provider: generator.provider, model: generator.model, synthetic: generator.synthetic };
}

export { AssetGenerationError };

/** Bytes as base64, whatever shape the store or provider handed back. */
function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
