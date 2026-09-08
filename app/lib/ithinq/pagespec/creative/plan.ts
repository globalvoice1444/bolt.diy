import type { Emphasis, PageSpec, PageSpecSection } from '@ithinq-pagespec/page-spec';
import { effectiveSection, sectionCopyAt, type CopyText } from './copy-text';
import { assignBands, bandGround, designSeed, mosaicSpans, synthesiseComposition, synthesiseDesign } from './design';
import { getDirection, type CompositionPolicy, type CreativeDirection } from './directions';
import {
  NEUTRAL_INTENT,
  normaliseCreativeIntent,
  type NormalisedCreativeIntent,
  type PageCreativeIntent,
} from './intent';
import { Rng } from './seed';
import {
  DIRECTION_IDS,
  type Band,
  type DirectionId,
  type HeroVariant,
  type ItemRhythm,
  type MediaAspect,
  type MediaFraming,
  type SectionLayout,
} from './types';
import type {
  ClosingPresentation,
  CreativePresentationPlan,
  HeroPresentation,
  MediaPlacement,
  SectionPresentation,
} from './types';

export interface PlanOptions {
  /**
   * AssetNeed ids that have generated imagery available.
   *
   * Renderer-local creative material. It influences composition — hero
   * treatment, media placement, image emphasis — without entering the
   * PageSpec or becoming a source of business truth.
   */
  generatedAssetNeedIds?: readonly string[];

  /**
   * Creative direction requested by the caller.
   *
   * A named starting point in the design space, not a template id. It is a
   * presentation instruction only: it cannot reach business truth, and an
   * unknown value falls back to the derived direction rather than failing.
   */
  direction?: string;

  /**
   * Creative intent from the caller.
   *
   * Presentation-only and untrusted. Normalised to matched terms, a level and
   * a digest before it reaches anything, so the caller's prose cannot become
   * page text however it was written.
   */
  creative?: PageCreativeIntent;

  /**
   * Renderer-local authored copy, if any.
   *
   * The plan has to see what will actually be on the page. Once the writer can
   * author a list or a Q&A for a beat the document left as bare prose, a
   * planner reading only the PageSpec would rule out `cards` or `accordion`
   * for content that is about to exist, and the section would render its
   * authored items in a fallback layout. It changes which composition fits the
   * content — never what the page is allowed to say.
   */
  copy?: CopyText;
}

export function isDirectionId(value: unknown): value is DirectionId {
  return typeof value === 'string' && (DIRECTION_IDS as readonly string[]).includes(value);
}

const VERTICAL_RULES: ReadonlyArray<{ direction: DirectionId; patterns: readonly string[] }> = [
  {
    direction: 'clinical-calm',
    patterns: ['med-spa', 'medspa', 'medical', 'health', 'dental', 'clinic', 'wellness', 'aesthetic', 'derm'],
  },
  {
    direction: 'service-bold',
    patterns: ['hvac', 'plumb', 'roof', 'contractor', 'home-service', 'landscap', 'electric', 'pest', 'garage'],
  },
  {
    direction: 'editorial-luxe',
    patterns: ['legal', 'law', 'luxury', 'hospitality', 'hotel', 'resort', 'interior', 'architect', 'jewel'],
  },
  {
    direction: 'conversion-modern',
    patterns: ['saas', 'software', 'agency', 'fintech', 'b2b', 'platform', 'technology', 'marketing'],
  },
];

/**
 * Choose where in the design space to start.
 *
 * Deterministic and explainable: an explicit request wins, then the market
 * vertical, then authored strategy. Strategy is used to derive presentation,
 * never to restate business truth. Two documents that land on the same
 * starting point still diverge — the seed decides where they end up.
 */
export function selectDirection(spec: PageSpec, options: PlanOptions = {}): DirectionId {
  if (isDirectionId(options.direction)) {
    return options.direction;
  }

  const vertical = (spec.page.vertical ?? '').toLowerCase();

  if (vertical) {
    for (const rule of VERTICAL_RULES) {
      if (rule.patterns.some((pattern) => vertical.includes(pattern))) {
        return rule.direction;
      }
    }
  }

  if (spec.page.origin !== 'generated') {
    return 'conversion-modern';
  }

  if (spec.page.sophistication >= 3) {
    return 'editorial-luxe';
  }

  if (spec.page.awareness === 'unaware' || spec.page.awareness === 'problem-aware') {
    return 'service-bold';
  }

  return 'conversion-modern';
}

function itemCount(section: PageSpecSection): number {
  return section.items?.length ?? 0;
}

function qaCount(section: PageSpecSection): number {
  return section.qa?.length ?? 0;
}

function quoteCount(section: PageSpecSection): number {
  return section.quotes?.length ?? 0;
}

/**
 * A `proof` section with nothing approved behind it is not a section.
 *
 * The schema makes this unreachable through the validator — `quotes` is
 * required on the kind and carries `minItems: 1` — but the planner is a public
 * function and a caller can reach it directly. Rendering the heading of a
 * proof section whose quotes never arrived would put an empty promise of
 * evidence on the page, so the beat is dropped before it is ever planned,
 * exactly as an unknown kind is.
 */
export function isEmptyProof(section: PageSpecSection): boolean {
  return section.kind === 'proof' && quoteCount(section) === 0;
}

function hasBody(section: PageSpecSection): boolean {
  return Boolean(section.body && section.body.trim());
}

/** Short, scannable items are what a metric treatment is for. Sentences are not. */
function itemsAreTerse(section: PageSpecSection, limit: number): boolean {
  const items = section.items ?? [];

  return items.length > 0 && items.every((item) => item.trim().length <= limit);
}

function bodyLength(section: PageSpecSection): number {
  return (section.body ?? '').trim().length;
}

/**
 * Whether a layout can actually present this section's content.
 *
 * This is what keeps the design space from collapsing into templates: the same
 * preference list resolves differently depending on what the document
 * contains. A layout is never chosen when it would have nothing to arrange,
 * and no layout is ever allowed to drop or pad content to fit — the fallback
 * is always a composition that can hold everything.
 *
 * `hasMedia` is the second half of the picture, and it is authoritative. A
 * section's imagery can arrive on the contract (`section.asset`) or as
 * renderer-local generated media, and both are equally real pictures. Asking
 * only the contract field — which the Partner Network never populates — is
 * what made every image-led layout unreachable for a generated page. The
 * planner passes the effective answer, which is also how a section whose
 * asset the hero borrowed is correctly treated as having no picture left; the
 * default covers a caller reasoning about the contract alone.
 */
export function isLayoutFeasible(
  layout: SectionLayout,
  section: PageSpecSection,
  hasMedia: boolean = Boolean(section.asset),
): boolean {
  switch (layout) {
    case 'cards':
      return itemCount(section) >= 2;
    case 'comparison-grid':
      return itemCount(section) >= 4;
    case 'bento-mosaic':
      return itemCount(section) >= 4;
    case 'stat-band':
      /* A metric row only reads as one when every cell is genuinely short. */
      return itemCount(section) >= 3 && itemsAreTerse(section, 64);
    case 'ledger':
      return itemCount(section) >= 3;
    case 'feature-rail':
      return itemCount(section) >= 1;
    case 'numbered-flow':
      return itemCount(section) >= 2;
    case 'accordion':
    case 'qa-two-column':
      return qaCount(section) >= 1;

    /*
     * Proof treatments are gated on how much was approved, never on the kind.
     *
     * A feature is one endorsement given the whole beat, so it stops reading
     * as one the moment there are several; a wall needs enough tiles to be a
     * wall. `quote-stack` is the composition that can hold any quantity, which
     * is why it is also what the composer falls back to.
     */
    case 'testimonial-feature':
      return quoteCount(section) >= 1 && quoteCount(section) <= 3;
    case 'review-wall':
      return quoteCount(section) >= 3;
    case 'proof-cards':
      return quoteCount(section) >= 2;
    case 'quote-stack':
      return quoteCount(section) >= 1;
    case 'media-full-bleed':
      return hasMedia;
    case 'poster-frame':
      /*
       * A visual moment: the picture carries the section and a short
       * statement sits on it over a scrim. Long copy, a list or a Q&A on top
       * of a photograph is unreadable however heavy the scrim, so those
       * belong in a composition that gives them their own ground.
       */
      return (
        hasMedia &&
        Boolean(section.heading) &&
        bodyLength(section) <= 260 &&
        itemCount(section) === 0 &&
        qaCount(section) === 0 &&
        quoteCount(section) === 0
      );
    case 'showcase-panel':
      /* A layered picture with the copy on its own plate beside it. */
      return hasMedia && hasBody(section);
    case 'editorial-split':
      return hasMedia || hasBody(section);
    case 'offset-editorial':
      return hasBody(section) && Boolean(section.heading);
    case 'display-statement':
      /*
       * Oversized type is a claim; it needs a heading to make and copy to
       * back it. A single line hung off a display heading reads as a stranded
       * caption rather than as a statement, and a very short beat already has
       * a composition built for it in `manifesto`.
       */
      return Boolean(section.heading) && bodyLength(section) >= 80 && bodyLength(section) <= 440;
    case 'chapter-opener':
      return Boolean(section.heading) && hasBody(section);
    case 'column-essay':
      /*
       * Two columns are a reading aid for a long passage and an affectation
       * for a short one. The body stays a single run of text either way —
       * splitting it would change what the document says.
       */
      return bodyLength(section) >= 420;
    case 'manifesto':
      /* A statement needs something to state, and room to breathe around it. */
      return hasBody(section) && bodyLength(section) <= 340;
    case 'quote-panel':
    case 'pull-quote':
      return hasBody(section);
    case 'editorial-prose':
      return true;
    default:
      return false;
  }
}

/** Rotate a preference list so consecutive uses of it start somewhere else. */
function rotate<T>(items: readonly T[], by: number): T[] {
  if (items.length === 0) {
    return [];
  }

  const offset = ((by % items.length) + items.length) % items.length;

  return [...items.slice(offset), ...items.slice(0, offset)];
}

/**
 * Choose how one section is composed.
 *
 * The picture is an input, not an afterthought. When a section has media —
 * from the contract or from generated imagery, the planner does not care
 * which — the archetype's image-led preferences are consulted first, rotated
 * by how many image-led sections came before, so a page holding five pictures
 * gets five compositions rather than the same split five times.
 *
 * Structured content keeps its own arrangement. A section carrying items or a
 * Q&A already has a composition designed for that shape — a mosaic, a ledger,
 * an accordion — and an image-led layout would flatten it to a plain list to
 * make room for the picture. Those sections keep their kind preferences and
 * the image places as a split or an inset, which is what the media placement
 * below decides.
 *
 * `avoid` is the treatment the previous image-led section took. Rotation
 * alone is not enough: when one section rules a rotated first choice
 * infeasible it falls through to exactly the entry the next section starts
 * on, and the page gets the same full-bleed picture twice running. Demoting
 * the last one used rather than removing it keeps it available when it is the
 * only composition the content can fill.
 */
function resolveLayout(
  policy: CompositionPolicy,
  section: PageSpecSection,
  hasMedia: boolean,
  mediaOccurrence: number,
  avoid: SectionLayout | null,
): SectionLayout {
  const preferences = policy.layoutPreferences[section.kind] ?? policy.layoutPreferences.default ?? [];
  const structured = itemCount(section) > 0 || qaCount(section) > 0 || quoteCount(section) > 0;
  const rotated = rotate(policy.mediaLayouts, mediaOccurrence);
  const spaced = avoid
    ? [...rotated.filter((layout) => layout !== avoid), ...rotated.filter((layout) => layout === avoid)]
    : rotated;
  const ordered = hasMedia && !structured ? [...spaced, ...preferences] : preferences;

  for (const layout of ordered) {
    if (isLayoutFeasible(layout, section, hasMedia)) {
      return layout;
    }
  }

  return 'editorial-prose';
}

/** A hero may present a section asset only when the contract marks it as such. */
function findHeroAssetIndex(spec: PageSpec, skip: ReadonlySet<number>): number | null {
  for (let index = 0; index < spec.sections.length; index += 1) {
    if (skip.has(index)) {
      continue;
    }

    const asset = spec.sections[index]?.asset;

    if (asset && asset.role === 'hero') {
      return index;
    }
  }

  return null;
}

function needsMedia(variant: HeroVariant): boolean {
  return variant === 'split-media' || variant === 'full-bleed-media';
}

/**
 * Choose the hero treatment.
 *
 * When a hero image actually exists, prefer the media-capable variant even if
 * it is not first in the list. A preference order is written for the common
 * image-less case; once imagery has been generated for the hero, ignoring it
 * would leave the strategy's own asset unused and quietly turn an
 * image-forward brief into a typographic page.
 */
function resolveHeroVariant(variants: readonly HeroVariant[], hasMedia: boolean, rng: Rng): HeroVariant {
  if (hasMedia) {
    /*
     * THE HERO PICTURE HAD ONE TREATMENT PER DIRECTION.
     *
     * This took `variants.find(needsMedia)` — the FIRST media variant —
     * and `varyHeroVariants` deliberately holds media variants in place,
     * so with a picture available (which a three-image budget always
     * makes true) the hero was deterministic: three of the four
     * directions produced `split-media` on every generation, measured at
     * 18 of 24. An image beside text is the most conventional
     * arrangement there is, and it was the page's largest image moment.
     *
     * Choosing among the media variants keeps the direction's own first
     * choice most likely — the draw is square-weighted, as everywhere
     * else here — while letting the same direction open on a full-bleed
     * picture instead. It is variation, not a different formula.
     */
    const mediaVariants = variants.filter(needsMedia);

    if (mediaVariants.length > 0) {
      /*
       * A gentler draw than the square-weighted one used for long
       * preference lists. There are only ever two media heroes, and
       * squaring over two options lands on the first about 85% of the
       * time — which is variation on paper and a fixed hero in practice.
       * Roughly three in five keeps the direction's own choice clearly
       * dominant while making the other a real outcome.
       */
      const index = rng.next() < 0.6 ? 0 : 1 + Math.floor(rng.next() * (mediaVariants.length - 1));

      return mediaVariants[Math.min(index, mediaVariants.length - 1)] as HeroVariant;
    }
  }

  for (const variant of variants) {
    if (!needsMedia(variant) || hasMedia) {
      return variant;
    }
  }

  return 'editorial-stack';
}

function emphasisOf(section: PageSpecSection): Emphasis {
  return section.emphasis ?? 'support';
}

/**
 * The seed inputs.
 *
 * Stable identity, never the moment of rendering: the page reference and
 * market identify the page, the audience and starting direction shape it, and
 * the caller's creative intent digest is the "give me another concept" lever.
 * Content is deliberately absent — re-wording a headline must not repaint the
 * whole page.
 */
function seedFor(spec: PageSpec, directionId: DirectionId, intent: NormalisedCreativeIntent): string {
  return designSeed([
    spec.page.reference,
    spec.page.vertical,
    spec.page.audience,
    spec.page.origin === 'generated' ? spec.page.campaign : 'legacy',
    directionId,
    intent.entropy,
    intent.terms.join('+'),
    intent.intensity,
    intent.imagery,
  ]);
}

/** Compositions that place a picture in one column of a two-column field. */
const SIDE_BY_SIDE_MEDIA: readonly SectionLayout[] = ['editorial-split', 'offset-editorial', 'showcase-panel'];

/** Compositions where the picture is the field the section is drawn on. */
const FIELD_MEDIA: readonly SectionLayout[] = ['media-full-bleed', 'poster-frame'];

/** Every composition built around a picture rather than merely holding one. */
const MEDIA_LED: readonly SectionLayout[] = ['media-full-bleed', 'poster-frame', 'showcase-panel', 'editorial-split'];

function includes(list: readonly SectionLayout[], layout: SectionLayout): boolean {
  return (list as readonly string[]).includes(layout);
}

/**
 * How wide the first column of an asymmetric composition is.
 *
 * One seeded draw either way, so the stream stays in step whichever layout a
 * section resolved to, but the range belongs to the composition: a hanging
 * chapter mark wants a narrow first column, a display statement wants a
 * dominant one, and a copy column that outgrew its own aside reads as a
 * mistake rather than as asymmetry.
 */
function splitRange(layout: SectionLayout): readonly [number, number] {
  switch (layout) {
    case 'chapter-opener':
      return [24, 38];
    case 'offset-editorial':
      return [36, 52];
    case 'display-statement':
      return [52, 68];
    case 'showcase-panel':
      return [46, 64];
    default:
      return [40, 62];
  }
}

/**
 * Build the presentation plan for a validated PageSpec.
 *
 * The returned plan holds indices, presentation classifiers and generated
 * design values. It never holds headline, body, item, question, answer, URL or
 * disclosure text: content is read from the PageSpec at render time, so there
 * is exactly one source of business truth.
 */
export function planPresentation(
  spec: PageSpec,
  skipSections: readonly number[] = [],
  options: PlanOptions = {},
): CreativePresentationPlan {
  const directionId = selectDirection(spec, options);
  const archetype: CreativeDirection = getDirection(directionId);
  const intent = options.creative ? normaliseCreativeIntent(options.creative) : NEUTRAL_INTENT;
  const seed = seedFor(spec, directionId, intent);
  const design = synthesiseDesign(archetype, seed, intent);
  const policy = synthesiseComposition(archetype, seed, intent);
  const rng = new Rng(`${seed}|layout`);
  const skip = new Set(skipSections);

  const generated = new Set(options.generatedAssetNeedIds ?? []);
  const heroAssetIndex = findHeroAssetIndex(spec, skip);
  const heroHasGenerated = generated.has('hero');
  const heroVariant = resolveHeroVariant(policy.heroVariants, heroAssetIndex !== null || heroHasGenerated, rng);
  const heroWantsMedia = needsMedia(heroVariant);
  const heroUsesMedia = heroWantsMedia && (heroAssetIndex !== null || heroHasGenerated);

  /* Rendered sections first: bands are a property of the page, not the array. */
  const rendered = spec.sections
    .map((rawSection, sourceIndex) => ({ rawSection, sourceIndex }))
    .filter(({ sourceIndex }) => !skip.has(sourceIndex))
    .map(({ rawSection, sourceIndex }) => ({
      sourceIndex,
      section: effectiveSection(rawSection, sectionCopyAt(options.copy, sourceIndex)),
    }))
    .filter(({ section }) => !isEmptyProof(section));

  /*
   * The hero's own band, resolved BEFORE the sections so the first
   * section knows what it is opening against.
   *
   * These were computed independently, so a dark hero could run
   * straight into a dark first section and the two read as one
   * interrupted field — the same defect the section run guards against
   * internally, escaping through the one seam that run could not see.
   * A test caught this rather than a review.
   */
  const heroBand: Band =
    heroVariant === 'offset-panel' || heroVariant === 'full-bleed-media'
      ? 'inverted'
      : heroVariant === 'framed-plate'
        ? 'tint'
        : 'base';

  const closingBand: Band =
    policy.ctaTreatment === 'banner' || policy.ctaTreatment === 'split'
      ? 'accent'
      : policy.ctaTreatment === 'plinth'
        ? 'deep'
        : 'tint';

  const bands = assignBands(
    policy.bandPalette,
    rendered.map(({ section }) => ({ purpose: section.purpose, emphasis: emphasisOf(section) })),
    seed,
    policy.bandAppetite,
    heroBand,
    closingBand,
  );

  const sections: SectionPresentation[] = [];
  let splitOccurrence = 0;
  let mediaOccurrence = 0;
  let lastMediaLayout: SectionLayout | null = null;
  let sawSectionMedia = false;

  rendered.forEach(({ section, sourceIndex }, position) => {
    /*
     * What this section actually has to show, decided before the layout is.
     * A contract asset and generated imagery are the same fact to a
     * composition; an asset the hero borrowed is no longer this section's to
     * present, so it is not one.
     */
    const ownsAsset = Boolean(section.asset) && !(heroUsesMedia && sourceIndex === heroAssetIndex);
    const generatedNeedId = generated.has(`section-${sourceIndex}`) ? `section-${sourceIndex}` : null;
    const hasMedia = ownsAsset || Boolean(generatedNeedId);

    const layout = resolveLayout(policy, section, hasMedia, mediaOccurrence, lastMediaLayout);
    const emphasis = emphasisOf(section);
    const promoted = policy.promoteLeadSections && emphasis === 'lead';

    const sideBySide = includes(SIDE_BY_SIDE_MEDIA, layout);

    let media: MediaPlacement = 'none';

    if (hasMedia) {
      sawSectionMedia = true;
      mediaOccurrence += 1;
      lastMediaLayout = includes(MEDIA_LED, layout) ? layout : lastMediaLayout;

      if (includes(FIELD_MEDIA, layout)) {
        media = 'full-bleed';
      } else if (sideBySide) {
        media = splitOccurrence % 2 === 0 ? 'trailing' : 'leading';
      } else {
        media = 'inset';
      }
    }

    /*
     * Only a media split may mirror. Flipping a copy-only split would place the
     * body visually before its own heading, which breaks reading order.
     */
    const mirrored = policy.alternate && sideBySide && hasMedia && splitOccurrence % 2 === 1;

    if (sideBySide) {
      splitOccurrence += 1;
    }

    /*
     * A poster is drawn on its own picture, not on the page's band. Saying so
     * through `ground` rather than through a poster-specific colour rule is
     * what keeps one set of tested foreground corrections in charge of every
     * dark field on the page.
     */
    const band: Band = layout === 'poster-frame' ? 'inverted' : (bands[position] ?? 'base');
    const chapterStart = policy.chapterEvery !== null && position > 0 && position % policy.chapterEvery === 0;

    /*
     * FRAMING, CROP AND ITEM RHYTHM.
     *
     * These are the three axes that turn a placed rectangle into an
     * art-directed picture, and an orderly card row into a composition
     * with a point of view. They multiply the layouts rather than adding
     * more of them: four media layouts times five framings times five
     * crops is a far wider space than nine layouts would be, and none of
     * it is a new template somebody has to fill.
     */
    const framing: MediaFraming =
      media === 'none' || media === 'full-bleed'
        ? 'contained'
        : (policy.mediaFramings[(position + splitOccurrence) % policy.mediaFramings.length] ?? 'contained');

    const aspect: MediaAspect =
      media === 'none'
        ? 'native'
        : media === 'full-bleed'
          ? 'panorama'
          : (policy.mediaAspects[position % policy.mediaAspects.length] ?? 'native');

    /*
     * Hierarchy is earned, not spread evenly. A promoted beat is one the
     * strategy already said carries weight, so it gets a rhythm that says
     * which of its items leads; a supporting beat with a long flat list
     * stays even, because inventing a hierarchy the content does not have
     * is just decoration.
     */
    const rhythm: ItemRhythm =
      itemCount(section) < 3
        ? 'even'
        : promoted || emphasis === 'lead'
          ? (policy.itemRhythms[0] ?? 'lead')
          : (policy.itemRhythms[(position + 1) % policy.itemRhythms.length] ?? 'even');

    sections.push({
      sourceIndex,
      kind: section.kind,
      purpose: section.purpose,
      emphasis,
      layout,
      band,
      ground: bandGround(band),
      framing,
      aspect,
      rhythm,
      width: promoted ? 'wide' : policy.contentWidth,
      media,
      mirrored,
      chapterStart,
      promoted,

      /* Asymmetry is seeded per section: a page of identical splits is a grid. */
      split: rng.step(splitRange(layout)[0], splitRange(layout)[1], 2),
      spans: layout === 'bento-mosaic' ? mosaicSpans(itemCount(section), `${seed}|${sourceIndex}`) : null,
      generatedAssetNeedId: generatedNeedId,
    });
  });

  /*
   * A hero drawn on its own picture is a dark ground and has to say so.
   * Saying nothing left the lede and the introduction painted in `--ink-muted`
   * — dark grey — over a dark full-bleed hero, which is a contrast failure the
   * page had no way to report.
   */
  const hero: HeroPresentation = {
    variant: heroVariant,
    media: heroUsesMedia ? (heroVariant === 'full-bleed-media' ? 'full-bleed' : 'trailing') : 'none',
    band: heroBand,
    ground: bandGround(heroBand),
    split: rng.step(44, 60, 2),
    mediaSourceIndex: heroUsesMedia && heroAssetIndex !== null ? heroAssetIndex : null,
    generatedAssetNeedId: heroUsesMedia && heroAssetIndex === null && heroHasGenerated ? 'hero' : null,
  };

  const closing: ClosingPresentation = {
    treatment: policy.ctaTreatment,
    band: closingBand,
    ground: bandGround(closingBand),
  };

  return {
    planVersion: 1,
    directionId,
    design,
    density: policy.density,
    motion: policy.motion,
    contentWidth: policy.contentWidth,
    cardStyle: policy.cardStyle,
    hero,
    sections,
    closing,
    imageEmphasis: heroUsesMedia ? 'led' : sawSectionMedia ? 'accent' : 'none',
  };
}
