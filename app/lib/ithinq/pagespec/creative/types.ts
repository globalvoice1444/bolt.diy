import type { Emphasis, SectionKind, SectionPurpose } from '@ithinq-pagespec/page-spec';

/**
 * Presentation vocabulary.
 *
 * Nothing in this file describes what a page says. It describes how a page
 * looks. The PageSpec remains the only source of business truth; a plan built
 * from these types carries indices and presentation choices, never copied
 * content. `plan-integrity.spec.ts` enforces that separation.
 */

export const DIRECTION_IDS = ['editorial-luxe', 'conversion-modern', 'service-bold', 'clinical-calm'] as const;

export type DirectionId = (typeof DIRECTION_IDS)[number];

/** How the opening of the page is composed. */
export type HeroVariant =
  | 'editorial-stack'
  | 'split-media'
  | 'full-bleed-media'
  | 'centered-statement'
  | 'offset-panel';

/**
 * How one section is composed. A section kind is semantic intent, not a
 * component name: several layouts are legitimate for the same kind, and the
 * planner picks between them from content shape, emphasis and position.
 */
export type SectionLayout =
  | 'editorial-prose'
  | 'editorial-split'
  | 'pull-quote'
  | 'numbered-flow'
  | 'cards'
  | 'feature-rail'
  | 'comparison-grid'
  | 'accordion'
  | 'qa-two-column'
  | 'media-full-bleed';

/** Background rhythm. Bands create visual chapters without touching content. */
export type Band = 'base' | 'raised' | 'tint' | 'inverted' | 'accent';

export type ContentWidth = 'narrow' | 'wide' | 'full';

export type MediaPlacement = 'none' | 'leading' | 'trailing' | 'full-bleed' | 'inset';

export type MotionLevel = 'none' | 'subtle' | 'expressive';

export type Density = 'compact' | 'comfortable' | 'spacious';

export type CardStyle = 'flat' | 'outlined' | 'elevated' | 'inverted';

export type CtaTreatment = 'inline' | 'banner' | 'split' | 'quiet';

/**
 * One section's presentation decision.
 *
 * `sourceIndex` is a reference into `PageSpec.sections`. Content is read from
 * the spec at render time and never copied here. `kind`, `purpose` and
 * `emphasis` are classifiers the planner branches on, not renderable copy.
 */
export interface SectionPresentation {
  sourceIndex: number;
  kind: SectionKind | (string & {});
  purpose: SectionPurpose;
  emphasis: Emphasis;
  layout: SectionLayout;
  band: Band;
  width: ContentWidth;
  media: MediaPlacement;

  /** Alternating compositions flip on odd occurrences. */
  mirrored: boolean;

  /** Opens a new visual chapter above this section. */
  chapterStart: boolean;

  /** Promoted by `emphasis: 'lead'`; renders at larger scale. */
  promoted: boolean;
}

export interface HeroPresentation {
  variant: HeroVariant;
  media: MediaPlacement;
  band: Band;

  /** Index of the section whose asset the hero borrowed, when it took one. */
  mediaSourceIndex: number | null;
}

export interface ClosingPresentation {
  treatment: CtaTreatment;
  band: Band;
}

/**
 * The complete presentation plan for one page under one direction.
 *
 * Deterministic: the same PageSpec and direction always produce an identical
 * plan. No clock, no randomness, no network, no model.
 */
export interface CreativePresentationPlan {
  planVersion: 1;
  directionId: DirectionId;
  density: Density;
  motion: MotionLevel;
  contentWidth: ContentWidth;
  cardStyle: CardStyle;
  hero: HeroPresentation;
  sections: SectionPresentation[];
  closing: ClosingPresentation;

  /** Presentation-only signal describing how image-led the page became. */
  imageEmphasis: 'none' | 'accent' | 'led';
}
