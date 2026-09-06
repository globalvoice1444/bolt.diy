import type { Emphasis, SectionKind, SectionPurpose } from '@ithinq-pagespec/page-spec';

/**
 * Presentation vocabulary.
 *
 * Nothing in this file describes what a page says. It describes how a page
 * looks. The PageSpec remains the only source of business truth; a plan built
 * from these types carries indices, numbers and presentation choices, never
 * copied content. `creative.spec.ts` enforces that separation.
 */

/**
 * The named starting points.
 *
 * These are archetypes, not templates. A direction id selects where in the
 * design space generation begins; the seed decides where it lands. Two pages
 * that name the same direction are related, not identical.
 */
export const DIRECTION_IDS = ['editorial-luxe', 'conversion-modern', 'service-bold', 'clinical-calm'] as const;

export type DirectionId = (typeof DIRECTION_IDS)[number];

/**
 * How the opening of the page is composed.
 *
 * Exactly two variants consume media (`split-media`, `full-bleed-media`), and
 * `needsMedia` in the planner is the single place that fact is written down.
 * Generated hero imagery is expensive and strategy-driven, so a variant list
 * always keeps its media-capable member and the planner always prefers it when
 * an image exists.
 */
export type HeroVariant =
  | 'editorial-stack'
  | 'split-media'
  | 'full-bleed-media'
  | 'centered-statement'
  | 'offset-panel'
  | 'asymmetric-offset'
  | 'framed-plate';

/**
 * How one section is composed.
 *
 * A section kind is semantic intent, not a component name: several layouts are
 * legitimate for the same kind, and the planner picks between them from
 * content shape, emphasis, position and the seeded design. Every layout is
 * feasibility-gated against the content that actually exists, so a composition
 * needing four items is never chosen for a section holding two, and no layout
 * ever drops or pads content to fit.
 *
 * Four of these are image-led — `media-full-bleed`, `poster-frame`,
 * `showcase-panel` and `editorial-split` — and a section reaches them when it
 * has media from *either* channel: a contract asset, or renderer-local
 * generated imagery. The two channels are equally real pictures, so gating an
 * image-led composition on the contract field alone made every generated
 * section image a small inset inside a prose block.
 *
 * The rest earn their range without a picture. Most sections a Partner
 * Network document carries are body-only prose, so `display-statement`,
 * `chapter-opener` and `column-essay` exist to give that prose scale,
 * asymmetry and pacing rather than leaving it to three treatments.
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
  | 'media-full-bleed'
  | 'poster-frame'
  | 'showcase-panel'
  | 'bento-mosaic'
  | 'stat-band'
  | 'offset-editorial'
  | 'display-statement'
  | 'chapter-opener'
  | 'column-essay'
  | 'manifesto'
  | 'ledger'
  | 'quote-panel';

/**
 * Background rhythm. Bands create visual chapters without touching content.
 *
 * `ground` on the rendered section says whether a band is light, dark or
 * accent-filled, which is what the contrast corrections key off. Adding a band
 * therefore never means re-listing every foreground selector.
 */
export type Band = 'base' | 'raised' | 'tint' | 'wash' | 'inverted' | 'deep' | 'accent';

export type BandGround = 'light' | 'dark' | 'accent';

export type ContentWidth = 'narrow' | 'wide' | 'full';

export type MediaPlacement = 'none' | 'leading' | 'trailing' | 'full-bleed' | 'inset';

export type MotionLevel = 'none' | 'subtle' | 'expressive';

export type Density = 'compact' | 'comfortable' | 'spacious';

export type CardStyle = 'flat' | 'outlined' | 'elevated' | 'inverted' | 'plate' | 'edge';

export type CtaTreatment = 'inline' | 'banner' | 'split' | 'quiet' | 'plinth';

/* ------------------------------------------------------------------ */
/* Generative design axes                                              */
/* ------------------------------------------------------------------ */

/** System font stacks only. The compiled page loads no webfont, ever. */
export type FamilyKey = 'serif' | 'sans' | 'geometric' | 'humanist' | 'mono';

export type BackgroundTreatment = 'flat' | 'wash' | 'aurora' | 'ruled' | 'grain';

export type EdgeTreatment = 'none' | 'hairline' | 'taper' | 'notch';

export type Motif = 'none' | 'index' | 'ticks' | 'brackets';

export type ImageTreatment = 'plain' | 'duotone' | 'soft-mask' | 'plate' | 'clipped';

/**
 * Colour roles, all resolved to literal values.
 *
 * The three-way accent split is not redundancy. A fill accent needs 3:1 behind
 * large text; a text accent needs 4.5:1 against paper; a dark band inverts the
 * problem entirely. One value cannot satisfy all three, so the palette
 * generator walks each role's lightness until a measured ratio clears, and
 * `generative.spec.ts` recomputes those ratios from the emitted tokens.
 */
export interface PalettePlan {
  paper: string;
  surface: string;
  surfaceAlt: string;
  ink: string;
  inkMuted: string;
  line: string;
  accent: string;
  accentInk: string;
  accentText: string;
  accentOnDark: string;
  accentSoft: string;
  inverse: string;
  inverseInk: string;
  inverseMuted: string;
}

export interface TypographyPlan {
  displayFamily: FamilyKey;
  bodyFamily: FamilyKey;

  /** Modular scale ratio driving display sizes. */
  scale: number;
  displayWeight: number;
  displayTracking: number;
  displayLeading: number;
  bodyLeading: number;
  eyebrowUppercase: boolean;
  eyebrowTracking: number;

  /** Reading measure in `ch`. */
  measure: number;
}

export interface SpatialPlan {
  rhythm: number;
  radius: number;
  radiusLarge: number;
  border: number;

  /** Container width in px. */
  container: number;

  /** Hero minimum height in vh. */
  heroMinHeight: number;
}

export interface DecorationPlan {
  background: BackgroundTreatment;
  edge: EdgeTreatment;
  motif: Motif;
  image: ImageTreatment;

  /** 0–1. Scales every decorative effect, and reaches the sheet as a token. */
  intensity: number;
}

/**
 * The generated design system for one page.
 *
 * `seed` is a digest, never the inputs it was derived from: the seed is built
 * from the page reference, audience and creative intent, and the plan is
 * serialised into the manifest. Recording the digest keeps the look
 * reproducible and explainable without putting a word of the document, or a
 * word of the caller's art direction, into a presentation artifact.
 */
export interface PageDesign {
  designVersion: 1;
  seed: string;
  archetype: DirectionId;
  palette: PalettePlan;
  typography: TypographyPlan;
  spatial: SpatialPlan;
  decoration: DecorationPlan;
}

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
  ground: BandGround;
  width: ContentWidth;
  media: MediaPlacement;

  /** Alternating compositions flip on odd occurrences. */
  mirrored: boolean;

  /** Opens a new visual chapter above this section. */
  chapterStart: boolean;

  /** Promoted by `emphasis: 'lead'`; renders at larger scale. */
  promoted: boolean;

  /**
   * Asymmetric column split, as a percentage of the first column.
   *
   * Emitted as a custom property scoped to this section rather than as an
   * inline style: the compiled document must stay a single hashable
   * stylesheet with no `style` attribute anywhere, because the Partner Network
   * serves it under a CSP that whitelists exactly one inline sheet by digest.
   */
  split: number;

  /** Column spans for a mosaic arrangement, one per item. Null when unused. */
  spans: number[] | null;

  /**
   * Generated imagery assigned to this section, by AssetNeed id.
   *
   * A reference, not a URL: the plan stays free of media locations, and the
   * composer resolves it against the run's generated assets.
   */
  generatedAssetNeedId: string | null;
}

export interface HeroPresentation {
  variant: HeroVariant;
  media: MediaPlacement;
  band: Band;
  ground: BandGround;

  /** Asymmetric hero column split, as a percentage of the first column. */
  split: number;

  /** Index of the section whose asset the hero borrowed, when it took one. */
  mediaSourceIndex: number | null;

  /** Generated hero imagery, by AssetNeed id. */
  generatedAssetNeedId: string | null;
}

export interface ClosingPresentation {
  treatment: CtaTreatment;
  band: Band;
  ground: BandGround;
}

/**
 * The complete presentation plan for one page under one generated design.
 *
 * Deterministic: the same PageSpec, direction and creative intent always
 * produce an identical plan. No clock, no randomness, no network, no model.
 */
export interface CreativePresentationPlan {
  planVersion: 1;
  directionId: DirectionId;
  design: PageDesign;
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
