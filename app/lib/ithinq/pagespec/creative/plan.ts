import type { Emphasis, PageSpec, PageSpecSection } from '@ithinq-pagespec/page-spec';
import { getDirection, type CompositionPolicy, type CreativeDirection } from './directions';
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
   * This is the seam a future creative orchestrator writes to. It is a
   * presentation instruction only: it cannot reach business truth, and an
   * unknown value falls back to the derived direction rather than failing.
   */
  direction?: string;
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
 * Choose a direction for a document.
 *
 * Deterministic and explainable: an explicit request wins, then the market
 * vertical, then authored strategy. Strategy is used to derive presentation,
 * never to restate business truth.
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

/**
 * Whether a layout can actually present this section's content.
 *
 * This is what keeps a direction from becoming a template: the same preference
 * list resolves differently depending on what the document contains. A layout
 * is never chosen when it would have nothing to arrange.
 */
export function isLayoutFeasible(layout: SectionLayout, section: PageSpecSection): boolean {
  switch (layout) {
    case 'cards':
      return itemCount(section) >= 2;
    case 'comparison-grid':
      return itemCount(section) >= 4;
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
 * When a hero image actually exists, prefer the direction's media-capable
 * variant even if it is not first in the list. A direction orders its
 * preferences for the common image-less case; once imagery has been generated
 * for the hero, ignoring it would leave the strategy's own asset unused and
 * quietly turn an image-forward brief into a typographic page.
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
 * Build the presentation plan for a validated PageSpec.
 *
 * The returned plan holds indices and presentation classifiers. It never holds
 * headline, body, item, question, answer, URL or disclosure text: content is
 * read from the PageSpec at render time, so there is exactly one source of
 * business truth.
 */
export function planPresentation(
  spec: PageSpec,
  skipSections: readonly number[] = [],
  options: PlanOptions = {},
): CreativePresentationPlan {
  const directionId = selectDirection(spec, options);
  const direction: CreativeDirection = getDirection(directionId);
  const policy = direction.composition;
  const skip = new Set(skipSections);

  const generated = new Set(options.generatedAssetNeedIds ?? []);
  const heroAssetIndex = findHeroAssetIndex(spec, skip);
  const heroHasGenerated = generated.has('hero');
  const heroVariant = resolveHeroVariant(policy.heroVariants, heroAssetIndex !== null || heroHasGenerated);
  const heroWantsMedia = heroVariant === 'split-media' || heroVariant === 'full-bleed-media';
  const heroUsesMedia = heroWantsMedia && (heroAssetIndex !== null || heroHasGenerated);

  const sections: SectionPresentation[] = [];
  let rendered = 0;
  let splitOccurrence = 0;
  let sawSectionMedia = false;

  spec.sections.forEach((section, sourceIndex) => {
    if (skip.has(sourceIndex)) {
      return;
    }

    const layout = resolveLayout(policy, section);
    const emphasis = emphasisOf(section);
    const promoted = policy.promoteLeadSections && emphasis === 'lead';

    // The hero already presents this asset; the section must not repeat it.
    const ownsAsset = Boolean(section.asset) && !(heroUsesMedia && sourceIndex === heroAssetIndex);

    let media: MediaPlacement = 'none';

    if (ownsAsset) {
      sawSectionMedia = true;

      if (layout === 'media-full-bleed') {
        media = 'full-bleed';
      } else if (layout === 'editorial-split') {
        media = splitOccurrence % 2 === 0 ? 'trailing' : 'leading';
      } else {
        media = 'inset';
      }
    }

    /*
     * Only a media split may mirror. Flipping a copy-only split would place the
     * body visually before its own heading, which breaks reading order.
     */
    const generatedNeedId = generated.has(`section-${sourceIndex}`) ? `section-${sourceIndex}` : null;

    if (generatedNeedId && media === 'none') {
      sawSectionMedia = true;
      media = layout === 'editorial-split' ? (splitOccurrence % 2 === 0 ? 'trailing' : 'leading') : 'inset';
    }

    const mirrored =
      policy.alternate &&
      layout === 'editorial-split' &&
      (ownsAsset || Boolean(generatedNeedId)) &&
      splitOccurrence % 2 === 1;

    if (layout === 'editorial-split') {
      splitOccurrence += 1;
    }

    const band: Band = policy.bandCycle[rendered % policy.bandCycle.length] ?? 'base';
    const chapterStart = policy.chapterEvery !== null && rendered > 0 && rendered % policy.chapterEvery === 0;

    sections.push({
      sourceIndex,
      kind: section.kind,
      purpose: section.purpose,
      emphasis,
      layout,
      band,
      width: promoted ? 'wide' : policy.contentWidth,
      media,
      mirrored,
      chapterStart,
      promoted,
      generatedAssetNeedId: generatedNeedId,
    });

    rendered += 1;
  });

  const hero: HeroPresentation = {
    variant: heroVariant,
    media: heroUsesMedia ? (heroVariant === 'full-bleed-media' ? 'full-bleed' : 'trailing') : 'none',
    band: heroVariant === 'offset-panel' ? 'inverted' : 'base',
    mediaSourceIndex: heroUsesMedia && heroAssetIndex !== null ? heroAssetIndex : null,
    generatedAssetNeedId: heroUsesMedia && heroAssetIndex === null && heroHasGenerated ? 'hero' : null,
  };

  const closing: ClosingPresentation = {
    treatment: policy.ctaTreatment,
    band: policy.ctaTreatment === 'banner' || policy.ctaTreatment === 'split' ? 'accent' : 'tint',
  };

  return {
    planVersion: 1,
    directionId,
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
