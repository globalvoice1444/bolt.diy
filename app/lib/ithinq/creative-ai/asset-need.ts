import type { PageSpec } from '@ithinq-pagespec/page-spec';
import { getDirection } from '~/lib/ithinq/pagespec/creative';
import type { CreativeStrategy } from './strategy';

/**
 * A description of imagery the page wants, before anything exists.
 *
 * An AssetNeed carries creative intent only — subject, mood, composition,
 * where it will sit. It deliberately holds no business claim: nothing here
 * may assert a capability, a result, a price or a credential, because an
 * image that asserts a fact is evidence, and evidence comes from the Growth
 * Engine rather than from a generator.
 */
export type AssetRole = 'hero' | 'supporting' | 'editorial-break';

export type AspectRatio = '16:9' | '4:5' | '3:2' | '1:1';

export type PlacementIntent = 'split-hero' | 'full-bleed' | 'section-inset' | 'editorial-break';

export interface AssetNeed {
  id: string;
  role: AssetRole;

  /** What should be depicted, as creative direction rather than as a claim. */
  subject: string;

  /** Why the page wants it here. */
  context: string;
  visualStyle: string;
  aspectRatio: AspectRatio;
  placementIntent: PlacementIntent;

  /** Section this need belongs to, or null for a page-level hero. */
  sectionAssociation: number | null;

  /** Intent for alt text; the final alt is written from this, never from a fact. */
  altIntent: string;
  required: boolean;
}

const MOOD_STYLE: Readonly<Record<CreativeStrategy['visualMood'], string>> = {
  editorial: 'editorial photography, natural light, generous negative space, muted contemporary palette',
  clinical: 'clean clinical photography, soft daylight, uncluttered modern interior, calm and precise',
  energetic: 'high-contrast commercial photography, confident lighting, saturated accents, decisive framing',
  refined: 'luxury editorial photography, warm directional light, refined materials, restrained elegant palette',
  utilitarian: 'straightforward documentary photography, honest lighting, practical working environment',
};

/**
 * Scene direction per vertical. Creative framing, never a claim.
 *
 * Each vertical carries several distinct moments rather than one. A page that
 * asks for a hero and two supporting visuals should not receive three images
 * of the same room: repeating one scene reads as stock filler, so the planner
 * hands each role a different moment within the same world.
 */
interface VerticalScenes {
  hero: string;
  supporting: readonly string[];
}

const VERTICAL_SCENE: ReadonlyArray<[readonly string[], VerticalScenes]> = [
  [
    ['med-spa', 'medspa', 'med spa', 'aesthetic', 'derm'],
    {
      hero: 'a modern medical aesthetics practice: calm consultation room, considered architectural interior, a practitioner and client in unhurried conversation',
      supporting: [
        'the reception area of a modern medical aesthetics practice: soft daylight across a clean stone desk, a phone handset resting beside a slim monitor, nobody at the desk',
        'a practitioner in a modern aesthetics clinic pausing between appointments in a quiet corridor, treatment-room doorway softly out of focus behind her',
      ],
    },
  ],
  [
    ['dental', 'clinic', 'medical', 'health'],
    {
      hero: 'a contemporary healthcare practice: bright uncluttered treatment space, reassuring practitioner-and-patient interaction',
      supporting: [
        'the front desk of a contemporary healthcare practice in soft daylight, unattended for a moment',
        'a clinician walking a bright, calm corridor between consultation rooms',
      ],
    },
  ],
  [
    ['hvac', 'plumbing', 'roofing', 'home-service', 'contractor', 'electric'],
    {
      hero: 'a professional home-services business: a uniformed technician taking a call in a clean service vehicle or tidy workshop',
      supporting: [
        'a tidy home-services dispatch desk with a phone and job board, warm practical lighting',
        'a uniformed technician arriving at a suburban front door with a toolbag, late afternoon light',
      ],
    },
  ],
  [
    ['legal', 'law'],
    {
      hero: 'a professional legal practice: composed consultation across a desk in a quiet, well-appointed office',
      supporting: [
        'the reception of a well-appointed legal practice, quiet and unattended, soft window light',
        'a lawyer reviewing papers at a broad desk in a calm office, shallow depth of field',
      ],
    },
  ],
  [
    ['hospitality', 'hotel', 'resort'],
    {
      hero: 'a refined hospitality setting: a welcoming front desk in warm architectural light',
      supporting: [
        'a quiet hotel lobby seating area in warm evening light',
        'a concierge desk with a telephone and a small arrangement of flowers, nobody attending',
      ],
    },
  ],
];

const DEFAULT_SCENES: VerticalScenes = {
  hero: 'a professional service business: a considered, human working environment with a calm customer interaction',
  supporting: [
    'the reception desk of a professional service business, unattended for a moment in soft daylight',
    'a professional stepping away from a busy workspace to take a call',
  ],
};

function scenesFor(vertical: string | null): VerticalScenes {
  const key = (vertical ?? '').toLowerCase();

  for (const [cues, scenes] of VERTICAL_SCENE) {
    if (cues.some((cue) => key.includes(cue))) {
      return scenes;
    }
  }

  return DEFAULT_SCENES;
}

/**
 * Plan the imagery a page wants.
 *
 * Returns nothing at all for a typography-first strategy — the correct answer
 * is often no image, and a system that always generates one is decoration
 * rather than design.
 */
export function planAssetNeeds(spec: PageSpec, strategy: CreativeStrategy): AssetNeed[] {
  if (strategy.imageStrategy === 'none') {
    return [];
  }

  const scenes = scenesFor(spec.page.vertical);
  const style = MOOD_STYLE[strategy.visualMood];
  const needs: AssetNeed[] = [];
  const objective = strategy.objective.replace(/\.\s*$/, '');

  /*
   * Ask for the shape the hero will actually be rendered at.
   *
   * The direction decides its hero treatment, so requesting a wide full-bleed
   * frame for a direction that composes a split hero produces an image whose
   * carefully placed negative space is then cropped away. The need follows the
   * placement rather than guessing at it.
   */
  const heroVariant = getDirection(strategy.directionId).composition.heroVariants.find(
    (variant) => variant === 'split-media' || variant === 'full-bleed-media',
  );
  const heroIsFullBleed = heroVariant === 'full-bleed-media';

  needs.push({
    id: 'hero',
    role: 'hero',
    subject: scenes.hero,
    context: `Opening image for a landing page whose objective is: ${objective}`,
    visualStyle: style,
    aspectRatio: heroIsFullBleed ? '16:9' : '4:5',
    placementIntent: heroIsFullBleed ? 'full-bleed' : 'split-hero',
    sectionAssociation: null,
    altIntent: `Illustrative photograph of ${scenes.hero}`,
    required: false,
  });

  if (strategy.imageStrategy === 'accent') {
    return needs;
  }

  /*
   * Supporting imagery follows the Growth Engine's own emphasis rather than a
   * fixed slot count, so a page with one lead section gets one supporting
   * visual and a flatter page gets none.
   */
  const supporting = strategy.emphasisSectionIndices.slice(0, strategy.imageStrategy === 'led' ? 2 : 1);

  supporting.forEach((index, position) => {
    const section = spec.sections[index];

    if (!section) {
      return;
    }

    const subject = scenes.supporting[position % scenes.supporting.length] ?? scenes.hero;

    needs.push({
      id: `section-${index}`,
      role: position === 0 ? 'supporting' : 'editorial-break',
      subject,
      context: `Supporting visual for the "${section.kind}" section, which serves the purpose "${section.purpose}"`,
      visualStyle: style,
      aspectRatio: '3:2',
      placementIntent: 'section-inset',
      sectionAssociation: index,
      altIntent: `Illustrative photograph supporting the ${section.kind} section`,
      required: false,
    });
  });

  return needs;
}
