export { composeDocument, escapeHtml } from './compose';
export type { GeneratedMedia } from './compose';
export { effectiveSection, sectionCopyAt } from './copy-text';
export type { CopyText, SectionCopyText } from './copy-text';
export { contrastHex, contrastRatio, hexToRgb, relativeLuminance } from './colour';
export { assignBands, bandGround, designSeed, mosaicSpans, synthesiseComposition, synthesiseDesign } from './design';
export { FAMILY_STACKS, getDirection, listDirections } from './directions';
export { hasTerm, NEUTRAL_INTENT, normaliseCreativeIntent } from './intent';
export type { NormalisedCreativeIntent, PageCreativeIntent } from './intent';
export { isDirectionId, isLayoutFeasible, planPresentation, selectDirection } from './plan';
export { digest, Rng } from './seed';
export { buildStylesheet } from './stylesheet';
export { DIRECTION_IDS } from './types';
export type { CompositionPolicy, CreativeDirection, DesignTokens } from './directions';
export type { PlanOptions } from './plan';
export type {
  BackgroundTreatment,
  Band,
  BandGround,
  CardStyle,
  ContentWidth,
  CreativePresentationPlan,
  Density,
  DecorationPlan,
  DirectionId,
  EdgeTreatment,
  FamilyKey,
  HeroVariant,
  ImageTreatment,
  MediaPlacement,
  Motif,
  MotionLevel,
  PageDesign,
  PalettePlan,
  SectionLayout,
  SectionPresentation,
  SpatialPlan,
  TypographyPlan,
} from './types';
