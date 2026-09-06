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
import { DIRECTION_IDS, type Band, type DirectionId, type HeroVariant, type SectionLayout } from './types';
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

function hasBody(section: PageSpecSection): boolean {
  return Boolean(section.body && section.body.trim());
}

/** Short, scannable items are what a metric treatment is for. Sentences are not. */
function itemsAreTerse(section: PageSpecSection, limit: number): boolean {
  const items = section.items ?? [];

  return items.length > 0 && items.every((item) => item.trim().length <= limit);
}

/**
 * Whether a layout can actually present this section's content.
 *
 * This is what keeps the design space from collapsing into templates: the same
 * preference list resolves differently depending on what the document
 * contains. A layout is never chosen when it would have nothing to arrange,
 * and no layout is ever allowed to drop or pad content to fit — the fallback
 * is always a composition that can hold everything.
 */
export function isLayoutFeasible(layout: SectionLayout, section: PageSpecSection): boolean {
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
    case 'media-full-bleed':
      return Boolean(section.asset);
    case 'editorial-split':
      return Boolean(section.asset) || hasBody(section);
    case 'offset-editorial':
      return hasBody(section) && Boolean(section.heading);
    case 'manifesto':
      /* A statement needs something to state, and room to breathe around it. */
      return hasBody(section) && (section.body ?? '').trim().length <= 340;
    case 'quote-panel':
    case 'pull-quote':
      return hasBody(section);
    case 'editorial-prose':
      return true;
    default:
      return false;
  }
}

function resolveLayout(policy: CompositionPolicy, section: PageSpecSection): SectionLayout {
  const preferences = policy.layoutPreferences[section.kind] ?? policy.layoutPreferences.default ?? [];

  for (const layout of preferences) {
    if (isLayoutFeasible(layout, section)) {
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
function resolveHeroVariant(variants: readonly HeroVariant[], hasMedia: boolean): HeroVariant {
  if (hasMedia) {
    const mediaVariant = variants.find(needsMedia);

    if (mediaVariant) {
      return mediaVariant;
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

const SPLIT_LAYOUTS: readonly SectionLayout[] = ['editorial-split', 'offset-editorial'];

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
  const heroVariant = resolveHeroVariant(policy.heroVariants, heroAssetIndex !== null || heroHasGenerated);
  const heroWantsMedia = needsMedia(heroVariant);
  const heroUsesMedia = heroWantsMedia && (heroAssetIndex !== null || heroHasGenerated);

  /* Rendered sections first: bands are a property of the page, not the array. */
  const rendered = spec.sections
    .map((rawSection, sourceIndex) => ({ rawSection, sourceIndex }))
    .filter(({ sourceIndex }) => !skip.has(sourceIndex))
    .map(({ rawSection, sourceIndex }) => ({
      sourceIndex,
      section: effectiveSection(rawSection, sectionCopyAt(options.copy, sourceIndex)),
    }));

  const bands = assignBands(
    policy.bandPalette,
    rendered.map(({ section }) => ({ purpose: section.purpose, emphasis: emphasisOf(section) })),
    seed,
  );

  const sections: SectionPresentation[] = [];
  let splitOccurrence = 0;
  let sawSectionMedia = false;

  rendered.forEach(({ section, sourceIndex }, position) => {
    const layout = resolveLayout(policy, section);
    const emphasis = emphasisOf(section);
    const promoted = policy.promoteLeadSections && emphasis === 'lead';

    // The hero already presents this asset; the section must not repeat it.
    const ownsAsset = Boolean(section.asset) && !(heroUsesMedia && sourceIndex === heroAssetIndex);
    const isSplit = (SPLIT_LAYOUTS as readonly string[]).includes(layout);

    let media: MediaPlacement = 'none';

    if (ownsAsset) {
      sawSectionMedia = true;

      if (layout === 'media-full-bleed') {
        media = 'full-bleed';
      } else if (isSplit) {
        media = splitOccurrence % 2 === 0 ? 'trailing' : 'leading';
      } else {
        media = 'inset';
      }
    }

    const generatedNeedId = generated.has(`section-${sourceIndex}`) ? `section-${sourceIndex}` : null;

    if (generatedNeedId && media === 'none') {
      sawSectionMedia = true;
      media = isSplit ? (splitOccurrence % 2 === 0 ? 'trailing' : 'leading') : 'inset';
    }

    /*
     * Only a media split may mirror. Flipping a copy-only split would place the
     * body visually before its own heading, which breaks reading order.
     */
    const mirrored =
      policy.alternate && isSplit && (ownsAsset || Boolean(generatedNeedId)) && splitOccurrence % 2 === 1;

    if (isSplit) {
      splitOccurrence += 1;
    }

    const band: Band = bands[position] ?? 'base';
    const chapterStart = policy.chapterEvery !== null && position > 0 && position % policy.chapterEvery === 0;

    sections.push({
      sourceIndex,
      kind: section.kind,
      purpose: section.purpose,
      emphasis,
      layout,
      band,
      ground: bandGround(band),
      width: promoted ? 'wide' : policy.contentWidth,
      media,
      mirrored,
      chapterStart,
      promoted,

      /* Asymmetry is seeded per section: a page of identical splits is a grid. */
      split: layout === 'offset-editorial' ? rng.step(36, 52, 2) : rng.step(40, 62, 2),
      spans: layout === 'bento-mosaic' ? mosaicSpans(itemCount(section), `${seed}|${sourceIndex}`) : null,
      generatedAssetNeedId: generatedNeedId,
    });
  });

  const heroBand: Band = heroVariant === 'offset-panel' ? 'inverted' : heroVariant === 'framed-plate' ? 'tint' : 'base';

  const hero: HeroPresentation = {
    variant: heroVariant,
    media: heroUsesMedia ? (heroVariant === 'full-bleed-media' ? 'full-bleed' : 'trailing') : 'none',
    band: heroBand,
    ground: bandGround(heroBand),
    split: rng.step(44, 60, 2),
    mediaSourceIndex: heroUsesMedia && heroAssetIndex !== null ? heroAssetIndex : null,
    generatedAssetNeedId: heroUsesMedia && heroAssetIndex === null && heroHasGenerated ? 'hero' : null,
  };

  const closingBand: Band =
    policy.ctaTreatment === 'banner' || policy.ctaTreatment === 'split'
      ? 'accent'
      : policy.ctaTreatment === 'plinth'
        ? 'deep'
        : 'tint';

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
