import type { Emphasis, SectionPurpose } from '@ithinq-pagespec/page-spec';
import { contrastHex, hslToRgb, mix, resolveForContrast, rgba, toHex } from './colour';
import type { CompositionPolicy, CreativeDirection } from './directions';
import { hasTerm, type NormalisedCreativeIntent } from './intent';
import { digest, Rng } from './seed';
import type {
  BackgroundTreatment,
  Band,
  CardStyle,
  CtaTreatment,
  Density,
  DecorationPlan,
  EdgeTreatment,
  FamilyKey,
  HeroVariant,
  ImageTreatment,
  Motif,
  MotionLevel,
  PageDesign,
  PalettePlan,
  SectionLayout,
  SpatialPlan,
  TypographyPlan,
} from './types';

/**
 * The generative design system.
 *
 * The four directions are starting points in a continuous space, not a menu.
 * Everything below reads an archetype's anchors, the page's own seed and the
 * caller's creative intent, and lands somewhere near the anchor rather than on
 * it — so two Partners in the same vertical, asking for the same direction,
 * still get materially different pages.
 *
 * Two rules hold everywhere in this file:
 *
 *   1. Pure. Same inputs, same output, byte for byte. No clock, no counter,
 *      no `Math.random`, no network, no model.
 *   2. Presentation only. Creative intent reaches this file as matched terms
 *      and a digest, never as prose, so nothing here can put a caller's words
 *      into a document.
 */

/* Text on a normal-size ground. AA is 4.5:1 and it is not negotiable. */
const AA_TEXT = 4.5;

/* Body copy against paper. AAA-ish, because muted grey is where pages fail. */
const AA_BODY = 4.6;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function round(value: number, places = 3): number {
  return Number(value.toFixed(places));
}

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

function accentHue(anchor: CreativeDirection['tokens'], rng: Rng, intent: NormalisedCreativeIntent): number {
  let hue = anchor.hue + rng.range(-anchor.hueSpread / 2, anchor.hueSpread / 2);

  if (hasTerm(intent, 'warm')) {
    hue = hue * 0.4 + 32 * 0.6;
  }

  if (hasTerm(intent, 'cool')) {
    hue = hue * 0.4 + 208 * 0.6;
  }

  return ((hue % 360) + 360) % 360;
}

function accentSaturation(anchor: CreativeDirection['tokens'], rng: Rng, intent: NormalisedCreativeIntent): number {
  let saturation = anchor.accentSaturation + rng.range(-10, 12);

  if (hasTerm(intent, 'monochrome')) {
    saturation *= 0.18;
  }

  if (hasTerm(intent, 'luxury', 'premium', 'restrained', 'elegant', 'refined', 'minimal')) {
    saturation -= 14;
  }

  if (hasTerm(intent, 'vibrant', 'bold', 'loud', 'energetic', 'playful')) {
    saturation += 16;
  }

  return clamp(saturation, 4, 96);
}

/**
 * A tint that copy is drawn on, walked back until the copy clears AA.
 *
 * `accentSoft` is not decoration: the wash band, the quote panel and the
 * display-statement plate all set text over it. A tint chosen by seed alone
 * lands a few hundredths under 4.5 for the darker accents — a contrast
 * failure no reviewer sees, because the colour was generated. The mix is
 * reduced towards paper, never past it, until the muted body ink clears.
 */
function resolveSoftTint(paper: string, accent: string, weight: number, bodyInk: string): string {
  for (let step = Math.round(weight * 100); step >= 0; step -= 1) {
    const candidate = mix(paper, accent, step / 100);

    if (contrastHex(bodyInk, candidate) >= AA_BODY) {
      return candidate;
    }
  }

  return paper;
}

/**
 * Build the palette, then prove it.
 *
 * Every role that carries text is walked to a measured ratio rather than
 * chosen and hoped over. The three-way accent split exists because a fill
 * accent, a text accent on paper and a text accent on an inverted band cannot
 * be one value and all clear AA — so each is resolved against the ground it
 * will actually sit on.
 */
function buildPalette(anchor: CreativeDirection['tokens'], rng: Rng, intent: NormalisedCreativeIntent): PalettePlan {
  const neutralHue = (((anchor.neutralHue + rng.range(-18, 18)) % 360) + 360) % 360;
  const chroma = clamp(anchor.neutralChroma * (hasTerm(intent, 'monochrome') ? 0.25 : 1) + rng.range(-5, 6), 0, 30);

  const deepPaper = hasTerm(intent, 'dark', 'brutal', 'industrial');
  const paperLightness = clamp(rng.step(deepPaper ? 93 : 96, deepPaper ? 96 : 99, 0.5), 90, 99.5);

  const paper = toHex(hslToRgb(neutralHue, chroma * 0.78, paperLightness));
  const surface = toHex(hslToRgb(neutralHue, chroma * 0.34, Math.min(100, paperLightness + rng.step(0.5, 2.5, 0.5))));
  const surfaceAlt = toHex(hslToRgb(neutralHue, chroma * 1.05, paperLightness - rng.step(3.5, 7, 0.5)));

  const inkLightness = clamp(anchor.inkLightness + rng.range(-3, 4), 4, 20);
  const ink = resolveForContrast(neutralHue, chroma * 1.5, inkLightness, [paper, surface, surfaceAlt], 13);
  const inkMuted = resolveForContrast(neutralHue, chroma * 1.15, 50, [paper, surface, surfaceAlt], AA_BODY);

  const inverse = resolveForContrast(neutralHue, chroma * 1.35, clamp(inkLightness - 1, 4, 16), ['#ffffff'], 13);
  const inverseInk = toHex(hslToRgb(neutralHue, chroma * 0.22, rng.step(96, 99, 0.5)));

  const hue = accentHue(anchor, rng, intent);
  const saturation = accentSaturation(anchor, rng, intent);
  const lightness = clamp(anchor.accentLightness + rng.range(-8, 8), 22, 66);

  /*
   * The fill accent has to carry `accentInk` at AA. Rather than accept
   * whichever of white or ink happens to be closest, walk the accent itself
   * until one of them clears — an accent that cannot hold legible text is not
   * a usable accent, however good it looks in isolation.
   */
  let accent = toHex(hslToRgb(hue, saturation, lightness));
  let accentInk = '#ffffff';

  for (let offset = 0; offset <= 60; offset += 1) {
    accent = toHex(hslToRgb(hue, saturation, clamp(lightness - offset, 4, 96)));

    if (contrastHex('#ffffff', accent) >= AA_TEXT) {
      accentInk = '#ffffff';
      break;
    }

    if (contrastHex(ink, accent) >= AA_TEXT) {
      accentInk = ink;
      break;
    }
  }

  const accentText = resolveForContrast(hue, saturation, lightness, [paper, surface, surfaceAlt], AA_TEXT);
  const accentOnDark = resolveForContrast(hue, saturation * 0.92, lightness, [inverse], AA_TEXT);

  return {
    paper,
    surface,
    surfaceAlt,
    ink,
    inkMuted,
    line: rgba(ink, round(clamp(0.09 + rng.range(0, 0.08), 0.08, 0.2))),
    accent,
    accentInk,
    accentText,
    accentOnDark,
    accentSoft: resolveSoftTint(paper, accent, round(clamp(0.06 + rng.range(0, 0.08), 0.05, 0.16)), inkMuted),
    inverse,
    inverseInk,
    inverseMuted: rgba(inverseInk, 0.74),
  };
}

/* ------------------------------------------------------------------ */
/* Typography                                                          */
/* ------------------------------------------------------------------ */

const PAIRINGS: ReadonlyArray<readonly [FamilyKey, FamilyKey]> = [
  ['serif', 'serif'],
  ['serif', 'sans'],
  ['serif', 'humanist'],
  ['sans', 'sans'],
  ['sans', 'serif'],
  ['geometric', 'geometric'],
  ['geometric', 'sans'],
  ['humanist', 'sans'],
  ['humanist', 'humanist'],
  ['mono', 'sans'],
];

function pairingWeight(
  pair: readonly [FamilyKey, FamilyKey],
  anchor: CreativeDirection['tokens'],
  intent: NormalisedCreativeIntent,
): number {
  let weight = 1;

  if (pair[0] === anchor.displayFamily) {
    weight += 4;
  }

  if (pair[1] === anchor.bodyFamily) {
    weight += 2;
  }

  if (hasTerm(intent, 'editorial', 'luxury', 'classic', 'elegant', 'refined') && pair[0] === 'serif') {
    weight += 4;
  }

  if (hasTerm(intent, 'technical', 'industrial') && pair[0] === 'mono') {
    weight += 4;
  }

  if (hasTerm(intent, 'corporate', 'trustworthy', 'clinical') && (pair[0] === 'sans' || pair[0] === 'geometric')) {
    weight += 3;
  }

  if (hasTerm(intent, 'organic', 'soft', 'playful') && pair[0] === 'humanist') {
    weight += 3;
  }

  /* A mono display is a strong statement; never reach it by accident. */
  if (pair[0] === 'mono' && !hasTerm(intent, 'technical', 'industrial', 'brutal')) {
    weight -= 0.85;
  }

  return weight;
}

function buildTypography(
  anchor: CreativeDirection['tokens'],
  rng: Rng,
  intent: NormalisedCreativeIntent,
): TypographyPlan {
  const [displayFamily, bodyFamily] = rng.weighted(
    PAIRINGS.map((pair) => [pair, pairingWeight(pair, anchor, intent)] as const),
  );

  const heavier = hasTerm(intent, 'bold', 'loud', 'brutal', 'energetic');
  const lighter = hasTerm(intent, 'restrained', 'minimal', 'elegant', 'refined', 'luxury');
  const weightShift = (heavier ? 100 : 0) - (lighter ? 100 : 0);

  return {
    displayFamily,
    bodyFamily,
    scale: round(clamp(anchor.scale + rng.step(-0.07, 0.09, 0.01), 1.14, 1.44), 3),
    displayWeight: clamp(
      Math.round((anchor.displayWeight + rng.step(-100, 100, 100) + weightShift) / 100) * 100,
      300,
      900,
    ),
    displayTracking: round(clamp(anchor.displayTracking + rng.step(-0.014, 0.012, 0.002), -0.05, 0.02), 4),
    displayLeading: round(clamp(anchor.displayLeading + rng.step(-0.05, 0.08, 0.01), 0.92, 1.24), 3),
    bodyLeading: round(rng.step(1.5, 1.76, 0.02), 3),
    eyebrowUppercase: rng.chance(0.78) ? anchor.eyebrowUppercase : !anchor.eyebrowUppercase,
    eyebrowTracking: round(clamp(anchor.eyebrowTracking + rng.step(-0.06, 0.08, 0.01), 0.02, 0.34), 3),
    measure: Math.round(clamp(anchor.measure + rng.step(-7, 9, 1), 52, 78)),
  };
}

/* ------------------------------------------------------------------ */
/* Spatial                                                             */
/* ------------------------------------------------------------------ */

function buildSpatial(anchor: CreativeDirection['tokens'], rng: Rng, intent: NormalisedCreativeIntent): SpatialPlan {
  const airy = hasTerm(intent, 'spacious', 'luxury', 'minimal', 'elegant') ? 1.12 : 1;
  const tight = hasTerm(intent, 'dense', 'industrial') ? 0.86 : 1;
  const hardEdged = hasTerm(intent, 'brutal', 'industrial', 'technical');
  const radius = hardEdged ? rng.step(0, 3, 1) : Math.round(clamp(anchor.radius * rng.step(0.5, 1.6, 0.1), 0, 30));

  return {
    rhythm: round(clamp(anchor.rhythm * rng.step(0.86, 1.2, 0.02) * airy * tight, 0.7, 1.7), 3),
    radius,
    radiusLarge: Math.round(clamp(radius === 0 ? 0 : radius * rng.step(1.4, 2.4, 0.2), 0, 44)),
    border: clamp(anchor.border + rng.step(-1, 1, 1), 1, 3),
    container: Math.round(rng.step(1120, 1400, 20)),
    heroMinHeight: Math.round(clamp(anchor.heroMinHeight + rng.step(-10, 10, 2), 58, 92)),
  };
}

/* ------------------------------------------------------------------ */
/* Decoration                                                          */
/* ------------------------------------------------------------------ */

const BACKGROUNDS: readonly BackgroundTreatment[] = ['flat', 'wash', 'aurora', 'ruled', 'grain'];
const EDGES: readonly EdgeTreatment[] = ['none', 'hairline', 'taper', 'notch'];
const MOTIFS: readonly Motif[] = ['none', 'index', 'ticks', 'brackets'];
const IMAGE_TREATMENTS: readonly ImageTreatment[] = ['plain', 'duotone', 'soft-mask', 'plate', 'clipped'];

function buildDecoration(
  anchor: CreativeDirection['tokens'],
  rng: Rng,
  intent: NormalisedCreativeIntent,
): DecorationPlan {
  const quiet = hasTerm(intent, 'minimal', 'restrained', 'clinical', 'elegant');
  const loud = hasTerm(intent, 'bold', 'loud', 'vibrant', 'energetic', 'playful');

  const background = rng.weighted(
    BACKGROUNDS.map(
      (option) =>
        [
          option,
          1 +
            (option === anchor.background ? 3.5 : 0) +
            (quiet && (option === 'flat' || option === 'wash') ? 2.5 : 0) +
            (loud && option === 'aurora' ? 2.5 : 0) +
            (quiet && option === 'aurora' ? -0.7 : 0),
        ] as const,
    ),
  );

  const motif = rng.weighted(
    MOTIFS.map(
      (option) => [option, 1 + (option === anchor.motif ? 3 : 0) + (quiet && option === 'none' ? 2 : 0)] as const,
    ),
  );

  const image =
    intent.imagery === 'none'
      ? 'plain'
      : rng.weighted(
          IMAGE_TREATMENTS.map(
            (option) =>
              [
                option,
                1 +
                  (option === anchor.image ? 3 : 0) +
                  (quiet && option === 'plain' ? 1.5 : 0) +
                  (loud && option === 'duotone' ? 2 : 0),
              ] as const,
          ),
        );

  const intensityShift =
    (loud ? 0.2 : 0) -
    (quiet ? 0.2 : 0) +
    (intent.intensity === 'assertive' ? 0.14 : intent.intensity === 'restrained' ? -0.16 : 0) +
    (intent.imagery === 'rich' ? 0.08 : intent.imagery === 'none' ? -0.06 : 0);

  return {
    background,
    edge: rng.weighted(EDGES.map((option) => [option, option === 'none' ? 1.6 : 1] as const)),
    motif,
    image,
    intensity: round(clamp(anchor.intensity + rng.range(-0.15, 0.15) + intensityShift, 0.12, 1), 3),
  };
}

/* ------------------------------------------------------------------ */
/* The design                                                          */
/* ------------------------------------------------------------------ */

/**
 * Reduce seed inputs to a digest.
 *
 * Stable by construction: the page reference, market, audience, requested
 * direction and creative intent all identify the *page*, not the moment. Two
 * runs a month apart produce the same page; two different Partners do not.
 *
 * The digest is what every generator downstream receives, and it is the only
 * form recorded on the plan. A presentation artifact that quoted the audience
 * or the caller's art direction back would put document text into a file whose
 * entire purpose is to hold none.
 */
export function designSeed(parts: readonly (string | null | undefined)[]): string {
  return digest(parts.map((part) => (part ?? '').trim().toLowerCase()).join(''));
}

/**
 * Compose one page's design from the axes.
 *
 * Four independent streams, one per axis. Adding a draw to typography must not
 * shift the palette of every page ever generated, and salted streams are what
 * buys that.
 */
export function synthesiseDesign(
  archetype: CreativeDirection,
  seed: string,
  intent: NormalisedCreativeIntent,
): PageDesign {
  return {
    designVersion: 1,
    seed,
    archetype: archetype.id,
    palette: buildPalette(archetype.tokens, new Rng(`${seed}|palette`), intent),
    typography: buildTypography(archetype.tokens, new Rng(`${seed}|type`), intent),
    spatial: buildSpatial(archetype.tokens, new Rng(`${seed}|space`), intent),
    decoration: buildDecoration(archetype.tokens, new Rng(`${seed}|decor`), intent),
  };
}

/* ------------------------------------------------------------------ */
/* Composition                                                         */
/* ------------------------------------------------------------------ */

const CARD_STYLES: readonly CardStyle[] = ['flat', 'outlined', 'elevated', 'inverted', 'plate', 'edge'];
const CTA_TREATMENTS: readonly CtaTreatment[] = ['inline', 'banner', 'split', 'quiet', 'plinth'];
const DENSITIES: readonly Density[] = ['compact', 'comfortable', 'spacious'];
const MOTIONS: readonly MotionLevel[] = ['none', 'subtle', 'expressive'];

function isMediaVariant(variant: HeroVariant): boolean {
  return variant === 'split-media' || variant === 'full-bleed-media';
}

/**
 * Reorder the hero preferences without ever losing the media-capable one.
 *
 * Media variants keep their exact slots and only the typographic variants are
 * shuffled around them. Generated hero imagery is expensive and asked for by
 * strategy; a shuffle that dropped or demoted the one variant able to present
 * it would quietly turn an image-led brief into a typographic page.
 */
/**
 * Reorder a preference list against the seed, keeping the direction
 * recognisable.
 *
 * The same square-weighted draw `varyPreferences` uses: the archetype's
 * first choice usually stays first, so a direction still reads as
 * itself, but anything it listed can come forward. Framing, crop and
 * item rhythm all want exactly this — divergence without losing the
 * house.
 */
function varyOrder<T>(list: readonly T[], rng: Rng): T[] {
  if (list.length <= 1) {
    return [...list];
  }

  const pool = [...list];
  const result: T[] = [];

  while (pool.length > 0) {
    const span = Math.min(pool.length, 3);
    const pick = Math.min(span - 1, Math.floor(rng.next() * rng.next() * span));

    result.push(...pool.splice(pick, 1));
  }

  return result;
}

function varyHeroVariants(variants: readonly HeroVariant[], rng: Rng): HeroVariant[] {
  const typographic = rng.shuffled(variants.filter((variant) => !isMediaVariant(variant)));
  const result: HeroVariant[] = [];
  let cursor = 0;

  for (const variant of variants) {
    result.push(isMediaVariant(variant) ? variant : (typographic[cursor++] as HeroVariant));
  }

  return result;
}

/**
 * Reorder a layout preference list against the seed.
 *
 * A square-weighted draw: the archetype's first choice usually stays first, so
 * every direction remains recognisable, but any preference it listed can come
 * forward. That is what stops two documents in the same vertical from
 * resolving to the same compositions section after section.
 *
 * A trailing `editorial-prose` is held back rather than shuffled. It is the
 * universal fallback — the one layout feasible for every section — so letting
 * it drift forward would quietly make it the answer for content that has a
 * genuinely better shape available.
 */
function biasedShuffle(items: readonly SectionLayout[], rng: Rng): SectionLayout[] {
  const pool = [...items];
  const ordered: SectionLayout[] = [];

  while (pool.length > 0) {
    const index = rng.weighted(pool.map((_, position) => [position, (pool.length - position) ** 2] as const));

    ordered.push(pool[index] as SectionLayout);
    pool.splice(index, 1);
  }

  return ordered;
}

function varyPreferences(
  preferences: CompositionPolicy['layoutPreferences'],
  rng: Rng,
): Record<string, readonly SectionLayout[]> {
  const varied: Record<string, readonly SectionLayout[]> = {};

  for (const key of Object.keys(preferences).sort()) {
    const list = preferences[key] ?? [];

    if (list.length < 2) {
      varied[key] = list;
      continue;
    }

    const holdsFallback = list[list.length - 1] === 'editorial-prose';
    const head = holdsFallback ? list.slice(0, -1) : [...list];

    varied[key] = holdsFallback ? [...biasedShuffle(head, rng), 'editorial-prose'] : biasedShuffle(head, rng);
  }

  return varied;
}

export function synthesiseComposition(
  archetype: CreativeDirection,
  seed: string,
  intent: NormalisedCreativeIntent,
): CompositionPolicy {
  const rng = new Rng(`${seed}|compose`);
  const policy = archetype.composition;

  const density = rng.weighted(
    DENSITIES.map(
      (option) =>
        [
          option,
          1 +
            (option === policy.density ? 3 : 0) +
            (hasTerm(intent, 'spacious', 'luxury', 'minimal') && option === 'spacious' ? 3 : 0) +
            (hasTerm(intent, 'dense') && option === 'compact' ? 3 : 0),
        ] as const,
    ),
  );

  const motion =
    intent.intensity === 'restrained'
      ? rng.weighted([
          ['none', 1],
          ['subtle', 3],
        ] as const)
      : rng.weighted(
          MOTIONS.map(
            (option) =>
              [
                option,
                1 +
                  (option === policy.motion ? 3 : 0) +
                  (intent.intensity === 'assertive' && option === 'expressive' ? 2 : 0),
              ] as const,
          ),
        );

  return {
    heroVariants: varyHeroVariants(policy.heroVariants, rng),
    contentWidth: rng.chance(0.75) ? policy.contentWidth : policy.contentWidth === 'narrow' ? 'wide' : 'narrow',
    bandPalette: policy.bandPalette,

    /*
     * Framing, crop and item rhythm are varied like every other
     * preference list, so two generations in one direction reach for
     * different pictures of the same page rather than the same one.
     */
    mediaFramings: varyOrder(policy.mediaFramings, rng),
    mediaAspects: varyOrder(policy.mediaAspects, rng),
    itemRhythms: varyOrder(policy.itemRhythms, rng),

    /*
     * Appetite varies per generation like everything else here, so two
     * pages in the same direction still diverge — one composes a little
     * harder than the other. The floor keeps even the calmest page from
     * falling back to the single-strong-band composition this replaced.
     */
    bandAppetite: Math.max(0.3, policy.bandAppetite + rng.pick([-0.08, 0, 0, 0.08, 0.12])),
    chapterEvery:
      policy.chapterEvery === null ? (rng.chance(0.3) ? 3 : null) : rng.chance(0.8) ? policy.chapterEvery : null,
    alternate: rng.chance(0.82) ? policy.alternate : !policy.alternate,
    layoutPreferences: varyPreferences(policy.layoutPreferences, rng),

    /*
     * The image-led list is reordered like any other preference list, but
     * never trimmed: every entry has to survive so a page holding several
     * pictures still has several compositions to rotate through.
     */
    mediaLayouts: policy.mediaLayouts.length > 1 ? biasedShuffle(policy.mediaLayouts, rng) : policy.mediaLayouts,
    cardStyle: rng.weighted(
      CARD_STYLES.map(
        (option) =>
          [
            option,
            1 +
              (option === policy.cardStyle ? 3.5 : 0) +
              (hasTerm(intent, 'minimal', 'restrained', 'editorial') && option === 'flat' ? 2 : 0) +
              (hasTerm(intent, 'bold', 'loud') && option === 'inverted' ? 2 : 0),
          ] as const,
      ),
    ),
    ctaTreatment: rng.weighted(
      CTA_TREATMENTS.map(
        (option) =>
          [
            option,
            1 +
              (option === policy.ctaTreatment ? 3.5 : 0) +
              (hasTerm(intent, 'restrained', 'minimal', 'elegant') && option === 'quiet' ? 2 : 0) +
              (intent.intensity === 'assertive' && (option === 'banner' || option === 'split') ? 2 : 0),
          ] as const,
      ),
    ),
    motion,
    density,
    promoteLeadSections: rng.chance(0.85) ? policy.promoteLeadSections : !policy.promoteLeadSections,
  };
}

/* ------------------------------------------------------------------ */
/* Band rhythm                                                         */
/* ------------------------------------------------------------------ */

const DARK_BANDS: readonly Band[] = ['inverted', 'deep'];

export function bandGround(band: Band): 'light' | 'dark' | 'accent' {
  if (band === 'accent') {
    return 'accent';
  }

  return (DARK_BANDS as readonly string[]).includes(band) ? 'dark' : 'light';
}

/**
 * How much visual weight a section has earned.
 *
 * Band assignment used to be `index % cycleLength`, which is content-blind:
 * whether a beat landed on the page's one dark chapter came down to how many
 * sections happened to precede it. Emphasis and strategic purpose decide it
 * here instead, so the interruption and the ask carry the weight and the
 * objection handling stays calm.
 */
function weightOf(purpose: SectionPurpose, emphasis: Emphasis): number {
  const byPurpose: Partial<Record<SectionPurpose, number>> = {
    interrupt_pattern: 2,
    intensify_problem: 2,
    drive_action: 2,
    create_recognition: 1,
    explain_mechanism: 0,
    establish_fit: 0,
    handle_objection: -2,
    reduce_risk: -1,
  };

  return (byPurpose[purpose] ?? 0) + (emphasis === 'lead' ? 2 : emphasis === 'aside' ? -1 : 0);
}

export interface BandInput {
  purpose: SectionPurpose;
  emphasis: Emphasis;
}

/**
 * Assign a background band to every rendered section.
 *
 * Two dark chapters never touch, the page never opens on its heaviest band
 * unless the archetype leads with one, and the count of strong bands is capped
 * relative to the document's length — a page that is dark everywhere has no
 * chapters at all.
 */
export function assignBands(
  palette: readonly Band[],
  sections: readonly BandInput[],
  seed: string,
  appetite = 0.34,

  /*
   * What the run opens against and what it closes into. The hero and the
   * closing panel carry their own bands, decided elsewhere, and without
   * them this run could place a dark first section under a dark hero —
   * two fields meeting with no seam, which is precisely the adjacency
   * the run forbids internally.
   */
  leadIn?: Band,
  tailOut?: Band,
): Band[] {
  const rng = new Rng(`${seed}|bands`);
  const strong = palette.filter((band) => bandGround(band) !== 'light');
  const light = palette.filter((band) => bandGround(band) === 'light');
  const lightPool = light.length > 0 ? light : (['base'] as const);

  /*
   * HOW MANY STRONG BANDS THIS PAGE MAY SPEND.
   *
   * This was `floor(sections.length / 3)`, a network-wide constant, so a
   * five-section page got exactly ONE strong band no matter which
   * direction was designing it — and three of the four archetypes
   * carried only one strong band in their palette anyway, so that one
   * was always the same treatment. The measured result was a page whose
   * body was uniformly light except for a single dark chapter, which is
   * what "competent generated SaaS" looks like: orderly, and with
   * nothing on it that took a position.
   *
   * Appetite belongs to the direction because confidence is a property
   * of the art direction, not of how many beats the argument happened
   * to need. A calm clinical page still composes calmly; a bold one now
   * actually gets to be bold.
   */
  const cap = Math.max(1, Math.round(sections.length * appetite));

  const bands: Band[] = [];
  let used = 0;
  let repeat = 0;

  sections.forEach((section, index) => {
    const previous = index === 0 ? leadIn : bands[index - 1];
    const isLast = index === sections.length - 1;
    const weight = weightOf(section.purpose, section.emphasis);

    /*
     * ADJACENCY IS ALLOWED WHEN THE GROUND ACTUALLY CHANGES.
     *
     * The old rule refused any strong band after a strong band, which
     * enforced strict alternation and made the page read as a metronome:
     * light, dark, light, light. A dark chapter running into an accent
     * statement is a crescendo and one of the few moves that reads as
     * composed rather than assembled. What stays forbidden is the thing
     * that actually looked broken — the SAME field twice, which reads as
     * one interrupted band rather than two beats.
     */
    const previousGround = previous === undefined ? undefined : bandGround(previous);
    const canGoStrong = strong.length > 0 && used < cap;

    if (canGoStrong && weight >= 2 && (index > 0 || bandGround(palette[0] ?? 'base') !== 'light')) {
      /*
       * Prefer a strong band this page has not used yet. Two identical
       * full-bleed chapters are not two chapters — they read as one
       * interrupted field, which is the opposite of what the emphasis
       * earned.
       */
      const unused = strong.filter((band) => !bands.includes(band));
      const pool = unused.length > 0 ? unused : strong;

      /*
       * NEVER THE SAME GROUND TWICE RUNNING, and the fallback matters as
       * much as the rule. `deep` and `inverted` are different bands but
       * both are dark, so filtering on the BAND let two dark chapters sit
       * together and read as one interrupted field — the exact thing the
       * old strict-alternation rule existed to prevent. Filtering on the
       * GROUND is the correct test.
       *
       * When no strong band of a different ground exists, this places a
       * light band instead of spending the crescendo badly. A page that
       * only owns dark strong bands gets one dark chapter, which is
       * honest, rather than two stacked.
       */
      const tailGround = tailOut === undefined ? undefined : bandGround(tailOut);
      const distinct = pool.filter(
        (band) => bandGround(band) !== previousGround && !(isLast && bandGround(band) === tailGround),
      );

      if (distinct.length > 0) {
        bands.push(rng.pick(distinct));
        used += 1;
        repeat = 0;

        return;
      }
    }

    let choice = rng.pick(lightPool);

    if (choice === previous) {
      repeat += 1;

      if (repeat >= 2) {
        choice = lightPool.find((band) => band !== previous) ?? choice;
        repeat = 0;
      }
    } else {
      repeat = 0;
    }

    bands.push(choice);
  });

  return bands;
}

/* ------------------------------------------------------------------ */
/* Mosaic                                                              */
/* ------------------------------------------------------------------ */

/**
 * Column spans for a bento arrangement over a six-column grid.
 *
 * Every row sums to six, so the mosaic never leaves a ragged gap, and the
 * count of cells always equals the count of items: a layout may rearrange
 * content, never pad or drop it.
 */
export function mosaicSpans(count: number, seed: string): number[] {
  const rng = new Rng(`${seed}|mosaic`);
  const spans: number[] = [];

  while (spans.length < count) {
    const left = count - spans.length;

    if (left === 1) {
      spans.push(6);
      continue;
    }

    if (left === 2 || (left >= 2 && !rng.chance(0.55))) {
      const first = rng.pick([2, 3, 4]);

      spans.push(first, 6 - first);
      continue;
    }

    spans.push(2, 2, 2);
  }

  return spans.slice(0, count);
}
