/**
 * Text a caller has already approved and wants ON the creative.
 *
 * THIS FILE IS THE WHOLE DIFFERENCE between a generated photograph and a
 * finished advertisement. Until it existed the prompt builder suppressed
 * lettering twice over — positively ("all surfaces deliberately blank") and
 * negatively ("no text, no lettering, no logos") — because generated lettering
 * is generated *evidence*, and a wall sign reading MEDICAL AESTHETICS is a
 * business claim nobody approved.
 *
 * That reasoning was right about invented text and wrong about all text. The
 * distinction it was missing is AUTHORSHIP, not presence: a word the model
 * chose is a fabricated claim, and a word the caller supplies is the caller's
 * own approved copy rendered as design. So the suppression stays exactly as it
 * was for everything the model might invent, and lifts only for strings that
 * arrived in this object.
 *
 * NOTHING HERE IS A LAYOUT. There is no template, no slot, no preset and no
 * position — deliberately. A schema that said where a headline goes would make
 * every caller's advertising share a skeleton, which is the failure mode this
 * contract exists to avoid. These are the WORDS; the design is the renderer's
 * to invent, steered by prose.
 */

/** Every field optional: an ad with only a headline is a complete ad. */
export interface OverlayText {
  headline?: string;
  supporting?: string;
  offer?: string;
  cta?: string;
  brand?: string;
}

export type OverlayField = keyof OverlayText;

export const OVERLAY_FIELDS: readonly OverlayField[] = ['headline', 'supporting', 'offer', 'cta', 'brand'];

/**
 * Per-field bounds.
 *
 * Generous, and about legibility rather than taste. A 200-character "headline"
 * is not a headline any renderer can set; a caller who wants long copy has a
 * caption for it. Nothing here caps how AGGRESSIVE, punchy or unconventional
 * the words may be.
 */
export const OVERLAY_LIMITS: Readonly<Record<OverlayField, number>> = {
  headline: 160,
  supporting: 240,
  offer: 120,
  cta: 60,
  brand: 80,
};

/** True when the caller asked for a designed ad rather than a photograph. */
export function hasOverlayText(overlay: OverlayText | undefined): overlay is OverlayText {
  return overlay !== undefined && OVERLAY_FIELDS.some((field) => (overlay[field] ?? '').trim().length > 0);
}

/** The fields actually carrying words, in a stable order. */
export function presentOverlayFields(overlay: OverlayText): OverlayField[] {
  return OVERLAY_FIELDS.filter((field) => (overlay[field] ?? '').trim().length > 0);
}

/**
 * The overlay as instructions a renderer can follow.
 *
 * Each string is quoted and marked verbatim. The renderer is told WHAT must
 * appear and explicitly not told where — placement, weight, scale, typeface
 * and hierarchy are the creative decision this contract refuses to make.
 */
export function describeOverlay(overlay: OverlayText): string {
  const lines = presentOverlayFields(overlay).map((field) => `${LABEL[field]}: "${overlay[field]!.trim()}"`);

  return lines.join('\n');
}

const LABEL: Readonly<Record<OverlayField, string>> = {
  headline: 'Headline',
  supporting: 'Supporting line',
  offer: 'Offer',
  cta: 'Call to action',
  brand: 'Business name',
};
