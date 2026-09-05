import type { AssetNeed } from './asset-need';
import { describeOverlay, hasOverlayText } from './overlay';
import type { CreativeStrategy } from './strategy';

/**
 * Composition direction per placement.
 *
 * An image that does not know where it will sit is decoration. A split hero
 * needs negative space on the side the copy occupies; a full-bleed hero needs
 * a low-detail centre so a headline stays legible over it.
 */
const COMPOSITION: Readonly<Record<AssetNeed['placementIntent'], string>> = {
  'split-hero':
    'composed for the right-hand side of a split landing-page hero, subject offset right, clear negative space on the left for a large headline',
  'full-bleed':
    'composed as a wide full-bleed hero banner, calm low-detail central region so overlaid headline text stays legible, visual interest toward the edges',
  'section-inset':
    'composed as a self-contained inset image inside a content section, subject centred, comfortable margin around the subject so it crops safely',
  'editorial-break': 'composed as a wide editorial break between sections, horizontal emphasis, unhurried framing',
};

/**
 * Positive framing of the same constraint.
 *
 * Image models follow a described scene far more reliably than a list of
 * negations — a live run produced wall signage reading "MEDICAL AESTHETICS"
 * despite an explicit "no lettering" exclusion. Describing the surfaces as
 * deliberately blank is what actually keeps text out of the frame, and the
 * negative list below stays as a second line of defence.
 *
 * This matters beyond tidiness: generated lettering is generated *text* on a
 * marketing page, and the same failure that renders a wall sign could render a
 * brand name, an award or a statistic.
 */
const UNBRANDED_DIRECTION =
  'All surfaces are deliberately blank and unbranded: plain walls with no signage, no wall lettering, no printed words, no posters and no visible screen content.';

const NEGATIVE_DIRECTION = [
  'no text',
  'no lettering',
  'no logos',
  'no watermarks',
  'no charts',
  'no dashboards',
  'no user-interface screenshots',
  'no before-and-after comparisons',
  'no medical results',
  'no awards or badges',
].join(', ');

/**
 * Build the image-generation prompt.
 *
 * The prompt carries the vertical, the campaign purpose, the visual direction,
 * the page role and the composition intent, because a generator given only a
 * subject returns stock-looking filler.
 *
 * The closing constraints are a truth control, not a style choice: text,
 * logos, dashboards, charts, awards and before/after imagery are exactly the
 * things a generated picture could turn into fabricated business evidence.
 */
export function buildImagePrompt(need: AssetNeed, strategy: CreativeStrategy): string {
  if (hasOverlayText(need.overlay)) {
    return buildAdvertisementPrompt(need, strategy);
  }

  return [
    `Premium ${strategy.visualMood} commercial photograph for a marketing landing page.`,
    `Scene: ${need.subject}.`,
    `Purpose: ${need.context}.`,
    `Art direction: ${need.visualStyle}.`,
    `Composition: ${COMPOSITION[need.placementIntent]}.`,
    `Aspect ratio ${need.aspectRatio}.`,
    'Realistic modern commercial photography, authentic and specific rather than generic stock imagery.',
    UNBRANDED_DIRECTION,
    `Do not include: ${NEGATIVE_DIRECTION}.`,
  ].join(' ');
}

/**
 * Build the prompt for a DESIGNED ADVERTISEMENT.
 *
 * Reached only when the caller supplied words it has already approved. The
 * photographic path above is untouched and still runs for everything else,
 * which is why adding this could not change a single existing image.
 *
 * WHAT CHANGES, AND WHAT DOES NOT. The blanket suppression of lettering lifts,
 * because the caller's own copy is not an invented claim. Every other truth
 * control stays exactly where it was: no invented logos, no awards, no charts
 * or dashboards, no before-and-after, no medical results — and, the load-
 * bearing one, NO WORDS BEYOND THE SUPPLIED STRINGS. A model free to add "50%
 * OFF" beside an approved headline would be fabricating a promotion, which is
 * the precise failure the original no-text rule was protecting against.
 *
 * WHAT IS DELIBERATELY ABSENT: any instruction about placement, scale,
 * hierarchy, typeface, colour or composition. This function names the words
 * and the intent and then gets out of the way. Two callers sending the same
 * strings with different creative direction should get two advertisements that
 * look nothing alike — if this file starts describing layouts, they will not.
 */
function buildAdvertisementPrompt(need: AssetNeed, strategy: CreativeStrategy): string {
  const direction = need.creativeDirection?.trim();
  const concept = need.creativeType?.trim();

  return [
    'A finished, professionally designed advertisement — the kind a strong creative agency would deliver ready to run on Facebook and Instagram.',
    concept ? `Creative approach: ${concept}.` : '',
    `Scene and subject: ${need.subject}.`,
    `Purpose: ${need.context}.`,
    direction
      ? `Art direction from the campaign's creative director: ${direction}`
      : `Art direction: ${need.visualStyle}.`,
    `Overall register: ${strategy.visualMood}.`,
    `Aspect ratio ${need.aspectRatio}.`,
    '',
    'RENDER EXACTLY THESE WORDS AS DESIGNED TYPOGRAPHY, reproduced character for character:',
    describeOverlay(need.overlay!),
    '',
    'Typography, scale, weight, placement, hierarchy, colour and composition are yours to decide — design this as a real advertisement, not as text pasted over a photograph. The words may be integrated into the scene, set over it, or dominate the frame entirely, whichever makes the strongest ad.',
    `Do not add ANY other text, words, numbers, prices, percentages, dates, phone numbers, web addresses or lettering beyond the strings listed above. Do not include: ${NEGATIVE_DIRECTION.replace('no text, no lettering, ', '')}.`,
  ]
    .filter((line) => line !== '')
    .join(' ');
}
