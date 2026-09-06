import type { GeneratedMedia, PageCreativeIntent } from './creative';
import { isDirectionId } from './creative';

/**
 * The request body of `POST /ithinq/pages`, normalised.
 *
 * Everything except `spec` is presentation material and is bounded here.
 * `spec` is passed through untouched: it belongs to the validator, which is
 * the only thing allowed to decide whether a document may be rendered and
 * where its links may point.
 */
export interface PageRenderRequest {
  spec: unknown;
  direction?: string;
  creative?: PageCreativeIntent;
  generatedMedia: readonly GeneratedMedia[];
}

export class PageRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PageRequestError';
  }
}

/** Enough for a hero plus a section image per beat, with room to spare. */
export const MAX_GENERATED_MEDIA = 24;
export const MAX_ASSET_NEED_ID = 64;
export const MAX_MEDIA_URL = 2048;
export const MAX_MEDIA_ALT = 400;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedField(value: unknown, limit: number, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail('invalid_generated_media', `Every generated media entry needs a ${label}.`);
  }

  if (value.length > limit) {
    return fail('invalid_generated_media', `A generated media ${label} exceeds ${limit} characters.`);
  }

  return value;
}

function fail(code: string, message: string): never {
  throw new PageRequestError(code, message);
}

/**
 * Generated imagery, checked for shape only.
 *
 * Strict rather than lenient: this is one backend calling another, and a
 * silently dropped hero image is a worse failure than a 400 the caller can
 * see. The URL is not resolved, fetched or trusted — it is escaped into an
 * attribute at compose time and never becomes a CSS `url()`.
 */
function readGeneratedMedia(value: unknown): GeneratedMedia[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    fail('invalid_generated_media', 'generatedMedia must be an array.');
  }

  if (value.length > MAX_GENERATED_MEDIA) {
    fail('invalid_generated_media', `generatedMedia holds more than ${MAX_GENERATED_MEDIA} entries.`);
  }

  return value.map((entry) => {
    if (!isRecord(entry)) {
      fail('invalid_generated_media', 'Every generated media entry must be an object.');
    }

    return {
      assetNeedId: boundedField(entry.assetNeedId, MAX_ASSET_NEED_ID, 'assetNeedId'),
      url: boundedField(entry.url, MAX_MEDIA_URL, 'url'),
      alt: typeof entry.alt === 'string' ? entry.alt.slice(0, MAX_MEDIA_ALT) : '',
    };
  });
}

/**
 * Normalise a caller's render request.
 *
 * An unknown `direction` is ignored rather than refused — it is a starting
 * point in the design space, and the response reports which one was actually
 * used, so a caller who sent a typo sees it without losing the page. Creative
 * intent is reduced to matched terms and a digest before it goes any further.
 */
export function normalisePageRequest(body: unknown): PageRenderRequest {
  if (!isRecord(body)) {
    fail('invalid_request', 'The request body must be a JSON object.');
  }

  if (body.spec === undefined || body.spec === null) {
    fail('missing_spec', 'The request body must carry a PageSpec on `spec`.');
  }

  if (body.creative !== undefined && body.creative !== null && !isRecord(body.creative)) {
    fail('invalid_creative', 'creative must be an object.');
  }

  /*
   * Creative intent is passed on as the caller sent it and bounded by
   * `normaliseCreativeIntent` inside the planner. Bounding it twice, in two
   * files, is how the two limits eventually disagree.
   */
  return {
    spec: body.spec,
    creative: isRecord(body.creative) ? (body.creative as PageCreativeIntent) : undefined,
    direction: isDirectionId(body.direction) ? body.direction : undefined,
    generatedMedia: readGeneratedMedia(body.generatedMedia),
  };
}
