import type {
  ItemRhythm,
  MediaAspect,
  MediaFraming,
  BackgroundTreatment,
  Band,
  CardStyle,
  ContentWidth,
  CtaTreatment,
  Density,
  DirectionId,
  FamilyKey,
  HeroVariant,
  ImageTreatment,
  Motif,
  MotionLevel,
  SectionLayout,
} from './types';

/**
 * The system font stacks.
 *
 * The compiled document is served under a Content-Security-Policy with no
 * `font-src`, so a webfont would not merely be slow — it would be blocked, and
 * the page would silently fall back to whatever the device happened to have.
 * Premium typography here is bought with scale, weight, tracking, case,
 * measure and a considered serif/sans pairing, not with a font file.
 */
export const FAMILY_STACKS: Readonly<Record<FamilyKey, string>> = {
  serif: "ui-serif, Georgia, 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Times New Roman', serif",
  sans: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  geometric: "'Segoe UI', ui-sans-serif, system-ui, -apple-system, Roboto, 'Helvetica Neue', Arial, sans-serif",
  humanist:
    "'Optima', 'Gill Sans', 'Gill Sans MT', Candara, 'Trebuchet MS', ui-sans-serif, system-ui, Helvetica, sans-serif",
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
};

/**
 * Where generation starts for one archetype.
 *
 * These are anchors, not values. The synthesiser reads them, applies the
 * page's own seed and the caller's creative intent, and lands somewhere near
 * — never exactly on — the anchor. That is the difference between four
 * starting points and four templates.
 */
export interface DesignTokens {
  /** Accent hue anchor, in degrees, and how far the seed may drift it. */
  hue: number;
  hueSpread: number;

  /** Neutral (paper and ink) hue and how much colour the neutrals carry. */
  neutralHue: number;
  neutralChroma: number;

  accentSaturation: number;
  accentLightness: number;

  /** Ink lightness anchor. Lower is a harder, higher-contrast page. */
  inkLightness: number;

  displayFamily: FamilyKey;
  bodyFamily: FamilyKey;
  scale: number;
  displayWeight: number;
  displayTracking: number;
  displayLeading: number;
  eyebrowUppercase: boolean;
  eyebrowTracking: number;
  measure: number;

  rhythm: number;
  radius: number;
  border: number;
  container: number;
  heroMinHeight: number;

  background: BackgroundTreatment;
  motif: Motif;
  image: ImageTreatment;
  intensity: number;
}

/**
 * How an archetype composes a page.
 *
 * Declarative on purpose. The planner reads these preferences, intersects them
 * with what each section actually contains, and reorders them against the
 * seed, so one archetype still produces different compositions for different
 * documents and different seeds. There is no `if (direction === x) renderX`
 * anywhere in the renderer.
 */
export interface CompositionPolicy {
  /** Preference order. The first variant whose media requirement is met wins. */
  heroVariants: readonly HeroVariant[];
  contentWidth: ContentWidth;

  /** Bands this archetype is willing to use. The rhythm generator draws here. */
  bandPalette: readonly Band[];

  /**
   * How much of the page this direction is willing to spend on strong
   * ground, as a fraction of its sections.
   *
   * It was a constant — one strong band per three sections, network
   * wide — so every archetype composed with the same restraint however
   * bold its palette was, and a five-section page got exactly one.
   * Confidence is a property of the direction, so the direction owns it.
   */
  bandAppetite: number;

  /** Start a new visual chapter every N sections. Null disables chapters. */
  chapterEvery: number | null;

  /** Flip split compositions on alternate occurrences. */
  alternate: boolean;

  /** Layout preference per section kind; `default` covers unlisted kinds. */
  layoutPreferences: Readonly<Record<string, readonly SectionLayout[]>>;

  /**
   * Preference order for a section that actually has a picture.
   *
   * Consulted ahead of the kind preferences, and rotated by how many
   * image-led sections came before it, so a page holding several pictures
   * gets several different compositions rather than the same split repeated.
   *
   * Media is media: a contract asset and renderer-local generated imagery
   * both unlock this list. Gating it on the contract field alone is what made
   * a generated section image a small inset inside a prose block, however
   * image-led the brief was.
   */
  mediaLayouts: readonly SectionLayout[];

  /**
   * This direction's own way of framing a picture.
   *
   * Every direction previously carried the SAME four media layouts in a
   * different order, so no direction had an image language of its own —
   * the strongest single reason imagery read as placed rather than
   * art-directed. Framing is where that divergence now lives.
   */
  mediaFramings: readonly MediaFraming[];

  /** The crops this direction reaches for. */
  mediaAspects: readonly MediaAspect[];

  /** How willing this direction is to weight items unequally. */
  itemRhythms: readonly ItemRhythm[];
  cardStyle: CardStyle;
  ctaTreatment: CtaTreatment;
  motion: MotionLevel;
  density: Density;

  /** Give `emphasis: 'lead'` sections a promoted, larger treatment. */
  promoteLeadSections: boolean;
}

export interface CreativeDirection {
  id: DirectionId;
  label: string;
  summary: string;

  /** Generation anchors, not final values. */
  tokens: DesignTokens;
  composition: CompositionPolicy;

  /** Structural CSS unique to this archetype, layered over the base sheet. */
  signatureCss: string;
}

/**
 * PREMIUM EDITORIAL — magazine pacing.
 *
 * Serif display at large scale, warm paper, generous whitespace, asymmetric
 * splits, restrained calls to action. Proof lives in typography, not in boxes.
 */
const editorialLuxe: CreativeDirection = {
  id: 'editorial-luxe',
  label: 'Premium editorial',
  summary: 'Serif display, warm paper, asymmetric editorial pacing and restrained calls to action.',
  tokens: {
    hue: 38,
    hueSpread: 26,
    neutralHue: 36,
    neutralChroma: 16,
    accentSaturation: 50,
    accentLightness: 40,
    inkLightness: 10,
    displayFamily: 'serif',
    bodyFamily: 'serif',
    scale: 1.28,
    displayWeight: 500,
    displayTracking: -0.022,
    displayLeading: 1.04,
    eyebrowUppercase: true,
    eyebrowTracking: 0.22,
    measure: 64,
    rhythm: 1.25,
    radius: 2,
    border: 1,
    container: 1240,
    heroMinHeight: 82,
    background: 'wash',
    motif: 'index',
    image: 'soft-mask',
    intensity: 0.4,
  },
  composition: {
    heroVariants: ['split-media', 'editorial-stack', 'full-bleed-media', 'asymmetric-offset'],
    contentWidth: 'narrow',
    bandPalette: ['base', 'base', 'tint', 'deep', 'wash', 'accent'],
    bandAppetite: 0.4,
    chapterEvery: 3,
    alternate: true,
    layoutPreferences: {
      interrupt: ['manifesto', 'display-statement', 'pull-quote', 'editorial-prose'],
      scenario: ['chapter-opener', 'offset-editorial', 'editorial-split', 'editorial-prose'],
      pain: ['quote-panel', 'column-essay', 'pull-quote', 'editorial-prose'],
      mechanism: ['editorial-split', 'column-essay', 'ledger', 'numbered-flow', 'editorial-prose'],
      vertical_fit: ['ledger', 'feature-rail', 'editorial-prose'],
      proof: ['testimonial-feature', 'quote-stack', 'review-wall'],
      faq: ['qa-two-column', 'accordion'],
      risk: ['stat-band', 'cards', 'editorial-prose'],
      default: ['chapter-opener', 'editorial-prose'],
    },
    mediaLayouts: ['editorial-split', 'poster-frame', 'showcase-panel', 'media-full-bleed'],
    mediaFramings: ['contained', 'bleed-right', 'overlap', 'oversized'],
    mediaAspects: ['portrait', 'landscape', 'native'],
    itemRhythms: ['lead', 'even', 'staggered'],
    cardStyle: 'flat',
    ctaTreatment: 'quiet',
    motion: 'subtle',
    density: 'spacious',
    promoteLeadSections: true,
  },
  signatureCss: `
[data-direction='editorial-luxe'] .eyebrow::after{content:'';display:block;width:36px;height:1px;background:var(--accent);margin-top:12px}
[data-direction='editorial-luxe'] .section-heading{max-width:19ch}
[data-direction='editorial-luxe'] .prose--long > p:first-of-type::first-letter{float:left;font-size:3.1em;line-height:.82;padding:.06em .09em 0 0;color:var(--accent-text)}
[data-direction='editorial-luxe'] .button--primary{background:transparent;color:var(--ink);border-color:var(--ink)}
[data-direction='editorial-luxe'] .button--primary:hover{background:var(--ink);color:var(--paper)}
[data-direction='editorial-luxe'] [data-ground='dark'] .button--primary{color:var(--inverse-ink);border-color:var(--inverse-ink)}
[data-direction='editorial-luxe'] [data-ground='dark'] .button--primary:hover{background:var(--inverse-ink);color:var(--inverse)}
[data-direction='editorial-luxe'] [data-ground='accent'] .button--primary{background:var(--accent-ink);color:var(--accent);border-color:var(--accent-ink)}
`,
};

/**
 * MODERN CONVERSION — premium SaaS.
 *
 * Crisp neutral surfaces, structured cards and mosaics, clear hierarchy, a
 * prominent call to action and a mechanism presented as an explicit flow.
 */
const conversionModern: CreativeDirection = {
  id: 'conversion-modern',
  label: 'Modern conversion',
  summary: 'Crisp light surfaces, structured cards and mosaics, decisive hierarchy and a prominent call to action.',
  tokens: {
    hue: 248,
    hueSpread: 44,
    neutralHue: 224,
    neutralChroma: 14,
    accentSaturation: 72,
    accentLightness: 58,
    inkLightness: 12,
    displayFamily: 'sans',
    bodyFamily: 'sans',
    scale: 1.32,
    displayWeight: 700,
    displayTracking: -0.035,
    displayLeading: 1.06,
    eyebrowUppercase: true,
    eyebrowTracking: 0.14,
    measure: 68,
    rhythm: 1,
    radius: 12,
    border: 1,
    container: 1240,
    heroMinHeight: 82,
    background: 'aurora',
    motif: 'none',
    image: 'plate',
    intensity: 0.55,
  },
  composition: {
    heroVariants: ['split-media', 'full-bleed-media', 'offset-panel', 'framed-plate'],
    contentWidth: 'wide',
    bandPalette: ['base', 'raised', 'deep', 'wash', 'accent', 'tint', 'inverted'],
    bandAppetite: 0.5,
    chapterEvery: null,
    alternate: true,
    layoutPreferences: {
      interrupt: ['display-statement', 'manifesto', 'editorial-split', 'editorial-prose'],
      scenario: ['offset-editorial', 'chapter-opener', 'editorial-split', 'editorial-prose'],
      pain: ['stat-band', 'cards', 'display-statement', 'editorial-prose'],
      mechanism: ['numbered-flow', 'ledger', 'editorial-split'],
      vertical_fit: ['bento-mosaic', 'cards', 'comparison-grid', 'feature-rail'],
      proof: ['review-wall', 'proof-cards', 'testimonial-feature', 'quote-stack'],
      faq: ['accordion', 'qa-two-column'],
      risk: ['cards', 'stat-band', 'editorial-prose'],
      default: ['display-statement', 'editorial-prose'],
    },
    mediaLayouts: ['showcase-panel', 'media-full-bleed', 'editorial-split', 'poster-frame'],
    mediaFramings: ['oversized', 'bleed-left', 'contained', 'overlap'],
    mediaAspects: ['landscape', 'panorama', 'square'],
    itemRhythms: ['lead', 'staggered', 'even'],
    cardStyle: 'elevated',
    ctaTreatment: 'banner',
    motion: 'subtle',
    density: 'comfortable',
    promoteLeadSections: true,
  },
  signatureCss: `
[data-direction='conversion-modern'] .eyebrow{color:var(--accent-text)}
[data-direction='conversion-modern'] [data-ground='dark'] .eyebrow{color:var(--accent-on-dark)}
[data-direction='conversion-modern'] .flow-step__index{background:var(--accent);color:var(--accent-ink);border-color:transparent;border-radius:999px}
[data-direction='conversion-modern'] .stat__value{color:var(--accent-text)}
[data-direction='conversion-modern'] [data-ground='dark'] .stat__value{color:var(--accent-on-dark)}
`,
};

/**
 * BOLD SERVICE — high-contrast local service.
 *
 * Inverted panels, heavy display type, dense scannable rails and a split call
 * to action that stays reachable on small screens.
 */
const serviceBold: CreativeDirection = {
  id: 'service-bold',
  label: 'Bold service',
  summary: 'Inverted high-contrast panels, heavy display type, scannable rails and an assertive split call to action.',
  tokens: {
    hue: 18,
    hueSpread: 30,
    neutralHue: 214,
    neutralChroma: 8,
    accentSaturation: 88,
    accentLightness: 52,
    inkLightness: 6,
    displayFamily: 'geometric',
    bodyFamily: 'geometric',
    scale: 1.34,
    displayWeight: 800,
    displayTracking: -0.028,
    displayLeading: 0.98,
    eyebrowUppercase: true,
    eyebrowTracking: 0.16,
    measure: 60,
    rhythm: 0.85,
    radius: 6,
    border: 2,
    container: 1280,
    heroMinHeight: 70,
    background: 'ruled',
    motif: 'ticks',
    image: 'duotone',
    intensity: 0.8,
  },
  composition: {
    heroVariants: ['offset-panel', 'centered-statement', 'full-bleed-media', 'split-media', 'asymmetric-offset'],
    contentWidth: 'wide',
    bandPalette: ['inverted', 'base', 'accent', 'base', 'deep'],
    bandAppetite: 0.6,
    chapterEvery: null,
    alternate: false,
    layoutPreferences: {
      interrupt: ['display-statement', 'manifesto', 'quote-panel', 'editorial-prose'],
      scenario: ['chapter-opener', 'offset-editorial', 'editorial-split', 'editorial-prose'],
      pain: ['stat-band', 'quote-panel', 'feature-rail'],
      mechanism: ['numbered-flow', 'ledger', 'editorial-split'],
      vertical_fit: ['bento-mosaic', 'cards', 'feature-rail'],
      proof: ['proof-cards', 'review-wall', 'testimonial-feature', 'quote-stack'],
      faq: ['accordion'],
      risk: ['feature-rail', 'stat-band', 'editorial-prose'],
      default: ['display-statement', 'editorial-prose'],
    },
    mediaLayouts: ['media-full-bleed', 'poster-frame', 'editorial-split', 'showcase-panel'],
    mediaFramings: ['bleed-left', 'oversized', 'bleed-right', 'overlap'],
    mediaAspects: ['panorama', 'landscape', 'square'],
    itemRhythms: ['staggered', 'lead', 'even'],
    cardStyle: 'inverted',
    ctaTreatment: 'split',
    motion: 'expressive',
    density: 'compact',
    promoteLeadSections: false,
  },
  signatureCss: `
[data-direction='service-bold'] h1,[data-direction='service-bold'] .section-heading{text-transform:uppercase}
[data-direction='service-bold'] .button{text-transform:uppercase;letter-spacing:.04em}
[data-direction='service-bold'] .button--primary{box-shadow:0 4px 0 var(--accent-shadow)}
[data-direction='service-bold'] .button--primary:active{transform:translateY(2px);box-shadow:0 2px 0 var(--accent-shadow)}
[data-direction='service-bold'] .rail__item{border-left:4px solid var(--accent)}
[data-direction='service-bold'] .stat{border-top-width:4px}
`,
};

/**
 * CLINICAL CALM — modern healthcare and med-spa.
 *
 * Soft cool surfaces, centred statement hero, wide measure, rounded outlined
 * cards and a two-column FAQ. Calm rather than urgent.
 */
const clinicalCalm: CreativeDirection = {
  id: 'clinical-calm',
  label: 'Clinical calm',
  summary: 'Soft cool surfaces, centred statement hero, rounded outlined cards and an unhurried reading rhythm.',
  tokens: {
    hue: 176,
    hueSpread: 46,
    neutralHue: 198,
    neutralChroma: 12,
    accentSaturation: 56,
    accentLightness: 40,
    inkLightness: 14,
    displayFamily: 'sans',
    bodyFamily: 'sans',
    scale: 1.26,
    displayWeight: 600,
    displayTracking: -0.024,
    displayLeading: 1.1,
    eyebrowUppercase: true,
    eyebrowTracking: 0.18,
    measure: 66,
    rhythm: 1.15,
    radius: 18,
    border: 1,
    container: 1200,
    heroMinHeight: 80,
    background: 'aurora',
    motif: 'none',
    image: 'soft-mask',
    intensity: 0.35,
  },
  composition: {
    heroVariants: ['centered-statement', 'split-media', 'full-bleed-media', 'framed-plate'],
    contentWidth: 'narrow',
    bandPalette: ['base', 'tint', 'deep', 'wash', 'raised', 'accent'],
    bandAppetite: 0.34,
    chapterEvery: 4,
    alternate: true,
    layoutPreferences: {
      interrupt: ['manifesto', 'display-statement', 'editorial-prose'],
      scenario: ['chapter-opener', 'offset-editorial', 'editorial-split', 'editorial-prose'],
      pain: ['column-essay', 'quote-panel', 'pull-quote', 'editorial-prose'],
      mechanism: ['numbered-flow', 'ledger', 'editorial-split'],
      vertical_fit: ['feature-rail', 'bento-mosaic', 'cards'],
      proof: ['quote-stack', 'review-wall', 'testimonial-feature'],
      faq: ['qa-two-column', 'accordion'],
      risk: ['stat-band', 'column-essay', 'editorial-prose'],
      default: ['chapter-opener', 'editorial-prose'],
    },
    mediaLayouts: ['editorial-split', 'showcase-panel', 'poster-frame', 'media-full-bleed'],
    mediaFramings: ['contained', 'overlap', 'bleed-right', 'oversized'],
    mediaAspects: ['square', 'portrait', 'native'],
    itemRhythms: ['even', 'lead', 'staggered'],
    cardStyle: 'outlined',
    ctaTreatment: 'inline',
    motion: 'subtle',
    density: 'spacious',
    promoteLeadSections: true,
  },
  signatureCss: `
[data-direction='clinical-calm'] .hero[data-hero='centered-statement']{text-align:center}
[data-direction='clinical-calm'] .hero[data-hero='centered-statement'] .actions{justify-content:center}
[data-direction='clinical-calm'] .hero[data-hero='centered-statement'] .measure{margin-inline:auto}
[data-direction='clinical-calm'] .card{border-radius:var(--radius-large)}
[data-direction='clinical-calm'] .eyebrow{color:var(--accent-text)}
[data-direction='clinical-calm'] [data-ground='dark'] .eyebrow{color:var(--accent-on-dark)}
[data-direction='clinical-calm'] .rail__item{border-radius:var(--radius-large);background:var(--surface);border-top:0;padding:18px 22px}
[data-direction='clinical-calm'] [data-ground='dark'] .rail__item{background:var(--veil-soft)}
`,
};

const DIRECTIONS: Readonly<Record<DirectionId, CreativeDirection>> = {
  'editorial-luxe': editorialLuxe,
  'conversion-modern': conversionModern,
  'service-bold': serviceBold,
  'clinical-calm': clinicalCalm,
};

export function getDirection(id: DirectionId): CreativeDirection {
  return DIRECTIONS[id];
}

export function listDirections(): CreativeDirection[] {
  return Object.values(DIRECTIONS);
}
