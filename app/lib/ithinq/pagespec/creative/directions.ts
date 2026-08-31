import type {
  Band,
  CardStyle,
  ContentWidth,
  CtaTreatment,
  Density,
  DirectionId,
  HeroVariant,
  MotionLevel,
  SectionLayout,
} from './types';

/**
 * Design tokens for one direction.
 *
 * Emitted as CSS custom properties. The base stylesheet is written against
 * these properties, so a direction changes the page's entire visual system
 * without needing its own copy of the layout rules.
 */
export interface DesignTokens {
  paper: string;
  surface: string;
  surfaceAlt: string;
  ink: string;
  inkMuted: string;
  line: string;
  accent: string;

  /** Accent used as a fill behind `accentInk`. */
  accentInk: string;

  /**
   * Accent for text on a light surface.
   *
   * A fill accent and a text accent cannot be the same value and still clear
   * WCAG AA: the fill only needs 3:1 behind large text, the text itself needs
   * 4.5:1. Kept as separate tokens rather than one accent used for both.
   */
  accentText: string;

  /** Accent for text on an inverted (dark) band, where the fill accent is too dark. */
  accentOnDark: string;
  inverse: string;
  inverseInk: string;
  inverseMuted: string;
  displayFamily: string;
  bodyFamily: string;
  displayWeight: string;
  displayTracking: string;
  displayLeading: string;
  eyebrowTransform: string;
  eyebrowTracking: string;
  radius: string;
  radiusLarge: string;
  border: string;
  measure: string;
  heroMinHeight: string;

  /** Multiplies the vertical rhythm; density widens or tightens it further. */
  rhythm: string;
}

/**
 * How a direction composes a page.
 *
 * Declarative on purpose. The planner reads these preferences and intersects
 * them with what each section actually contains, so one direction still
 * produces different compositions for different documents. There is no
 * `if (direction === x) renderTemplateX` anywhere in the renderer.
 */
export interface CompositionPolicy {
  /** Preference order. The first variant whose media requirement is met wins. */
  heroVariants: readonly HeroVariant[];
  contentWidth: ContentWidth;

  /** Cycles across sections to build background rhythm. */
  bandCycle: readonly Band[];

  /** Start a new visual chapter every N sections. Null disables chapters. */
  chapterEvery: number | null;

  /** Flip split compositions on alternate occurrences. */
  alternate: boolean;

  /** Layout preference per section kind; `default` covers unlisted kinds. */
  layoutPreferences: Readonly<Record<string, readonly SectionLayout[]>>;
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
  tokens: DesignTokens;
  composition: CompositionPolicy;

  /** Structural CSS unique to this direction, layered over the base sheet. */
  signatureCss: string;
}

const SERIF = "ui-serif, Georgia, 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Times New Roman', serif";
const SANS =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const GEOMETRIC = "'Segoe UI', ui-sans-serif, system-ui, -apple-system, Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * PREMIUM EDITORIAL — magazine pacing.
 *
 * Serif display at large scale, warm paper, generous whitespace, alternating
 * asymmetric splits, restrained CTAs. Proof lives in typography, not in boxes.
 */
const editorialLuxe: CreativeDirection = {
  id: 'editorial-luxe',
  label: 'Premium editorial',
  summary: 'Serif display, warm paper, asymmetric editorial pacing and restrained calls to action.',
  tokens: {
    paper: '#faf7f2',
    surface: '#fffdfa',
    surfaceAlt: '#f2ece2',
    ink: '#1b1815',
    inkMuted: '#5f574d',
    line: 'rgba(27, 24, 21, 0.14)',
    accent: '#9a7433',
    accentInk: '#1b1815',
    accentText: '#7a5a24',
    accentOnDark: '#d4ad63',
    inverse: '#1b1815',
    inverseInk: '#faf7f2',
    inverseMuted: 'rgba(250, 247, 242, 0.72)',
    displayFamily: SERIF,
    bodyFamily: SERIF,
    displayWeight: '500',
    displayTracking: '-0.022em',
    displayLeading: '1.04',
    eyebrowTransform: 'uppercase',
    eyebrowTracking: '0.22em',
    radius: '2px',
    radiusLarge: '4px',
    border: '1px',
    measure: '64ch',
    heroMinHeight: '82vh',
    rhythm: '1.25',
  },
  composition: {
    heroVariants: ['split-media', 'editorial-stack'],
    contentWidth: 'narrow',
    bandCycle: ['base', 'base', 'tint'],
    chapterEvery: 3,
    alternate: true,
    layoutPreferences: {
      interrupt: ['pull-quote', 'editorial-prose'],
      scenario: ['editorial-split', 'editorial-prose'],
      pain: ['pull-quote', 'editorial-prose'],
      mechanism: ['editorial-split', 'numbered-flow', 'editorial-prose'],
      vertical_fit: ['feature-rail', 'editorial-prose'],
      faq: ['qa-two-column', 'accordion'],
      risk: ['cards', 'editorial-prose'],
      default: ['editorial-prose'],
    },
    cardStyle: 'flat',
    ctaTreatment: 'quiet',
    motion: 'subtle',
    density: 'spacious',
    promoteLeadSections: true,
  },
  signatureCss: `
[data-direction='editorial-luxe'] h1{font-style:normal}
[data-direction='editorial-luxe'] .eyebrow::after{content:'';display:block;width:36px;height:1px;background:var(--accent);margin-top:12px}
[data-direction='editorial-luxe'] .section-heading{max-width:18ch}
[data-direction='editorial-luxe'] .prose--long > p:first-of-type::first-letter{float:left;font-size:3.1em;line-height:.82;padding:.06em .09em 0 0;color:var(--accent)}
[data-direction='editorial-luxe'] .band-rule{border-top:1px solid var(--line)}
[data-direction='editorial-luxe'] .button--primary{border-radius:2px;border:1px solid var(--ink);background:transparent;color:var(--ink)}
[data-direction='editorial-luxe'] .button--primary:hover{background:var(--ink);color:var(--paper)}
`,
};

/**
 * MODERN CONVERSION — premium SaaS.
 *
 * Crisp neutral surfaces, structured cards, clear hierarchy, a banner CTA and
 * a mechanism presented as an explicit numbered flow.
 */
const conversionModern: CreativeDirection = {
  id: 'conversion-modern',
  label: 'Modern conversion',
  summary: 'Crisp light surfaces, elevated white cards, structured hierarchy and a prominent banner call to action.',
  tokens: {
    paper: '#ffffff',
    surface: '#ffffff',
    surfaceAlt: '#f4f6fb',
    ink: '#0f172a',
    inkMuted: '#51607a',
    line: 'rgba(15, 23, 42, 0.12)',
    accent: '#4f46e5',
    accentInk: '#ffffff',
    accentText: '#3730a3',
    accentOnDark: '#a5b4fc',
    inverse: '#0f172a',
    inverseInk: '#f8fafc',
    inverseMuted: 'rgba(248, 250, 252, 0.74)',
    displayFamily: SANS,
    bodyFamily: SANS,
    displayWeight: '700',
    displayTracking: '-0.035em',
    displayLeading: '1.06',
    eyebrowTransform: 'uppercase',
    eyebrowTracking: '0.14em',
    radius: '12px',
    radiusLarge: '24px',
    border: '1px',
    measure: '68ch',
    heroMinHeight: '76vh',
    rhythm: '1',
  },
  composition: {
    heroVariants: ['split-media', 'offset-panel'],
    contentWidth: 'wide',
    bandCycle: ['base', 'raised'],
    chapterEvery: null,
    alternate: true,
    layoutPreferences: {
      interrupt: ['editorial-split', 'editorial-prose'],
      scenario: ['editorial-split', 'editorial-prose'],
      pain: ['cards', 'editorial-prose'],
      mechanism: ['numbered-flow', 'editorial-split'],
      vertical_fit: ['cards', 'comparison-grid', 'feature-rail'],
      faq: ['accordion', 'qa-two-column'],
      risk: ['cards', 'editorial-prose'],
      default: ['editorial-prose'],
    },
    cardStyle: 'elevated',
    ctaTreatment: 'banner',
    motion: 'subtle',
    density: 'comfortable',
    promoteLeadSections: true,
  },
  signatureCss: `
[data-direction='conversion-modern'] .eyebrow{color:var(--accent-text)}
[data-direction='conversion-modern'] .hero:not(.band-inverted){background:linear-gradient(180deg,var(--surface-alt),var(--paper))}
[data-direction='conversion-modern'] .card{box-shadow:0 1px 2px rgba(15,23,42,.06),0 12px 32px rgba(15,23,42,.07)}
[data-direction='conversion-modern'] .flow-step__index{background:var(--accent);color:var(--accent-ink);border-radius:999px}
[data-direction='conversion-modern'] .section-heading em{font-style:normal;box-shadow:inset 0 -0.32em 0 color-mix(in srgb, var(--accent) 22%, transparent)}
`,
};

/**
 * BOLD SERVICE — high-contrast local service.
 *
 * Inverted hero panel, heavy uppercase display, dense scannable rails and a
 * split CTA that stays reachable on small screens.
 */
const serviceBold: CreativeDirection = {
  id: 'service-bold',
  label: 'Bold service',
  summary: 'Inverted high-contrast panels, heavy uppercase display, scannable rails and an assertive split CTA.',
  tokens: {
    paper: '#f4f5f7',
    surface: '#ffffff',
    surfaceAlt: '#e7e9ee',
    ink: '#0b0f14',
    inkMuted: '#4b5563',
    line: 'rgba(11, 15, 20, 0.16)',
    accent: '#f4511e',
    accentInk: '#0b0f14',
    accentText: '#a83512',
    accentOnDark: '#ff8a5c',
    inverse: '#0b0f14',
    inverseInk: '#ffffff',
    inverseMuted: 'rgba(255, 255, 255, 0.72)',
    displayFamily: GEOMETRIC,
    bodyFamily: GEOMETRIC,
    displayWeight: '800',
    displayTracking: '-0.028em',
    displayLeading: '0.98',
    eyebrowTransform: 'uppercase',
    eyebrowTracking: '0.16em',
    radius: '6px',
    radiusLarge: '10px',
    border: '2px',
    measure: '60ch',
    heroMinHeight: '70vh',
    rhythm: '0.85',
  },
  composition: {
    heroVariants: ['offset-panel', 'centered-statement'],
    contentWidth: 'wide',
    bandCycle: ['inverted', 'base', 'accent', 'base'],
    chapterEvery: null,
    alternate: false,
    layoutPreferences: {
      interrupt: ['pull-quote', 'editorial-prose'],
      scenario: ['editorial-split', 'editorial-prose'],
      pain: ['pull-quote', 'feature-rail'],
      mechanism: ['numbered-flow', 'editorial-split'],
      vertical_fit: ['cards', 'feature-rail'],
      faq: ['accordion'],
      risk: ['feature-rail', 'editorial-prose'],
      default: ['editorial-prose'],
    },
    cardStyle: 'inverted',
    ctaTreatment: 'split',
    motion: 'expressive',
    density: 'compact',
    promoteLeadSections: false,
  },
  signatureCss: `
[data-direction='service-bold'] h1,[data-direction='service-bold'] .section-heading{text-transform:uppercase}
[data-direction='service-bold'] .button{text-transform:uppercase;letter-spacing:.04em;border-radius:6px}
[data-direction='service-bold'] .button--primary{box-shadow:0 4px 0 color-mix(in srgb, var(--accent) 62%, #000)}
[data-direction='service-bold'] .button--primary:active{transform:translateY(2px);box-shadow:0 2px 0 color-mix(in srgb, var(--accent) 62%, #000)}
[data-direction='service-bold'] .eyebrow{color:var(--accent-text)}
[data-direction='service-bold'] .rail__item{border-left:4px solid var(--accent)}
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
    paper: '#f6f9fa',
    surface: '#ffffff',
    surfaceAlt: '#e8f1f2',
    ink: '#12283a',
    inkMuted: '#537083',
    line: 'rgba(18, 40, 58, 0.12)',
    accent: '#1f6f6a',
    accentInk: '#ffffff',
    accentText: '#175450',
    accentOnDark: '#7fd3cb',
    inverse: '#12283a',
    inverseInk: '#f6f9fa',
    inverseMuted: 'rgba(246, 249, 250, 0.76)',
    displayFamily: SANS,
    bodyFamily: SANS,
    displayWeight: '600',
    displayTracking: '-0.024em',
    displayLeading: '1.1',
    eyebrowTransform: 'uppercase',
    eyebrowTracking: '0.18em',
    radius: '18px',
    radiusLarge: '32px',
    border: '1px',
    measure: '66ch',
    heroMinHeight: '72vh',
    rhythm: '1.15',
  },
  composition: {
    heroVariants: ['centered-statement', 'split-media'],
    contentWidth: 'narrow',
    bandCycle: ['base', 'tint', 'base', 'raised'],
    chapterEvery: 4,
    alternate: true,
    layoutPreferences: {
      interrupt: ['editorial-prose'],
      scenario: ['editorial-prose', 'editorial-split'],
      pain: ['editorial-prose', 'pull-quote'],
      mechanism: ['numbered-flow', 'editorial-split'],
      vertical_fit: ['feature-rail', 'cards'],
      faq: ['qa-two-column', 'accordion'],
      risk: ['editorial-prose'],
      default: ['editorial-prose'],
    },
    cardStyle: 'outlined',
    ctaTreatment: 'inline',
    motion: 'subtle',
    density: 'spacious',
    promoteLeadSections: true,
  },
  signatureCss: `
[data-direction='clinical-calm'] .hero{text-align:center}
[data-direction='clinical-calm'] .hero .actions{justify-content:center}
[data-direction='clinical-calm'] .hero .measure{margin-inline:auto}
[data-direction='clinical-calm'] .card{border-radius:var(--radius-large)}
[data-direction='clinical-calm'] .eyebrow{color:var(--accent-text)}
[data-direction='clinical-calm'] .rail__item{border-radius:var(--radius-large);background:var(--surface);border-top:0;padding:18px 22px}
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
