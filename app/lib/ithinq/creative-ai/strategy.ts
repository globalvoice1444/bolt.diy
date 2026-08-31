import type { PageSpec } from '@ithinq-pagespec/page-spec';
import { selectDirection, type DirectionId } from '~/lib/ithinq/pagespec/creative';
import type { CreativeRequest, ImagePreference, Tone } from './request';

/**
 * How to communicate — never what is true.
 *
 * The strategy combines the Partner's request with signals the Growth Engine
 * already authored on the PageSpec (vertical, awareness, sophistication,
 * emphasis). It records no facts, no copy and no URLs, so it cannot become a
 * competing source of business truth.
 */
export type VisualMood = 'editorial' | 'clinical' | 'energetic' | 'refined' | 'utilitarian';

export type ImageStrategy = 'none' | 'accent' | 'supporting' | 'led';

export type CtaIntensity = 'quiet' | 'balanced' | 'assertive';

export interface CreativeStrategy {
  strategyVersion: 1;
  objective: string;

  /** Which narrative the page leans on, derived from authored awareness. */
  narrativeAngle: 'situation-first' | 'problem-first' | 'mechanism-first' | 'proof-first';
  visualMood: VisualMood;
  directionId: DirectionId;
  copyStyle: 'editorial' | 'plain' | 'punchy';
  imageStrategy: ImageStrategy;
  pageDensity: 'compact' | 'comfortable' | 'spacious';
  ctaIntensity: CtaIntensity;

  /** Section indices the strategy considers most worth visual investment. */
  emphasisSectionIndices: number[];
  rationale: string[];
}

const MOOD_BY_TONE: Readonly<Record<Tone, VisualMood>> = {
  elegant: 'refined',
  bold: 'energetic',
  minimal: 'editorial',
  energetic: 'energetic',
  professional: 'clinical',
  warm: 'editorial',
};

function imageStrategyFor(preference: ImagePreference, hasVisualSections: boolean): ImageStrategy {
  if (preference === 'typographic') {
    return 'none';
  }

  if (preference === 'image-forward') {
    return 'led';
  }

  return hasVisualSections ? 'supporting' : 'accent';
}

/**
 * Derive the creative strategy.
 *
 * Deterministic. The same request against the same PageSpec always yields the
 * same strategy, which is what makes the whole pipeline reviewable.
 */
export function deriveCreativeStrategy(spec: PageSpec, request: CreativeRequest): CreativeStrategy {
  const rationale: string[] = [];

  const directionId = request.creativeDirection ?? selectDirection(spec, {});
  rationale.push(
    request.creativeDirection
      ? `Direction requested explicitly: ${directionId}.`
      : `Direction derived from the document (vertical ${spec.page.vertical ?? 'unset'}): ${directionId}.`,
  );

  const awareness = spec.page.origin === 'generated' ? spec.page.awareness : null;
  const narrativeAngle =
    awareness === 'unaware'
      ? 'situation-first'
      : awareness === 'problem-aware'
        ? 'problem-first'
        : awareness === 'most-aware'
          ? 'proof-first'
          : 'mechanism-first';
  rationale.push(`Awareness ${awareness ?? 'unknown'} implies a ${narrativeAngle} narrative.`);

  const leadIndices = spec.sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => section.emphasis === 'lead')
    .map(({ index }) => index);
  rationale.push(
    leadIndices.length > 0
      ? `Growth Engine marked sections ${leadIndices.join(', ')} as lead; visual investment follows that hierarchy.`
      : 'No lead section authored; visual investment stays even across the page.',
  );

  const imageStrategy = imageStrategyFor(request.imagePreference, leadIndices.length > 0);
  rationale.push(`Image preference "${request.imagePreference}" resolves to image strategy "${imageStrategy}".`);

  const visualMood = MOOD_BY_TONE[request.tone];
  const sophistication = spec.page.origin === 'generated' ? spec.page.sophistication : 0;

  const ctaIntensity: CtaIntensity =
    request.tone === 'bold' || request.tone === 'energetic' ? 'assertive' : sophistication >= 3 ? 'quiet' : 'balanced';
  rationale.push(`Tone "${request.tone}" and sophistication ${sophistication} give a ${ctaIntensity} CTA.`);

  return {
    strategyVersion: 1,
    objective: request.objective,
    narrativeAngle,
    visualMood,
    directionId,
    copyStyle: request.tone === 'bold' ? 'punchy' : request.tone === 'elegant' ? 'editorial' : 'plain',
    imageStrategy,
    pageDensity: request.tone === 'bold' ? 'compact' : request.tone === 'elegant' ? 'spacious' : 'comfortable',
    ctaIntensity,
    emphasisSectionIndices: leadIndices,
    rationale,
  };
}
