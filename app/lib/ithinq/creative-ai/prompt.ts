import type { AssetNeed } from './asset-need';
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
  return [
    `Premium ${strategy.visualMood} commercial photograph for a marketing landing page.`,
    `Scene: ${need.subject}.`,
    `Purpose: ${need.context}.`,
    `Art direction: ${need.visualStyle}.`,
    `Composition: ${COMPOSITION[need.placementIntent]}.`,
    `Aspect ratio ${need.aspectRatio}.`,
    'Realistic modern commercial photography, authentic and specific rather than generic stock imagery.',
    `Do not include: ${NEGATIVE_DIRECTION}.`,
  ].join(' ');
}
