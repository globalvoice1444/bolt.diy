import type { PageSpec } from '@ithinq-pagespec/page-spec';
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

/** Human-readable scene direction per vertical. Creative framing, never a claim. */
const VERTICAL_SCENE: ReadonlyArray<[readonly string[], string]> = [
  [
    ['med-spa', 'medspa', 'med spa', 'aesthetic', 'derm'],
    'a modern medical aesthetics practice: calm consultation room, considered architectural interior, a practitioner and client in unhurried conversation',
  ],
  [
    ['dental', 'clinic', 'medical', 'health'],
    'a contemporary healthcare practice: bright uncluttered treatment space, reassuring practitioner-and-patient interaction',
  ],
  [
    ['hvac', 'plumbing', 'roofing', 'home-service', 'contractor', 'electric'],
    'a professional home-services business: a uniformed technician taking a call in a clean service vehicle or tidy workshop',
  ],
  [
    ['legal', 'law'],
    'a professional legal practice: composed consultation across a desk in a quiet, well-appointed office',
  ],
  [
    ['hospitality', 'hotel', 'resort'],
    'a refined hospitality setting: a welcoming front desk in warm architectural light',
  ],
];

function sceneFor(vertical: string | null): string {
  const key = (vertical ?? '').toLowerCase();

  for (const [cues, scene] of VERTICAL_SCENE) {
    if (cues.some((cue) => key.includes(cue))) {
      return scene;
    }
  }

  return 'a professional service business: a considered, human working environment with a calm customer interaction';
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

  const scene = sceneFor(spec.page.vertical);
  const style = MOOD_STYLE[strategy.visualMood];
  const needs: AssetNeed[] = [];

  needs.push({
    id: 'hero',
    role: 'hero',
    subject: scene,
    context: `Opening image for a landing page whose objective is: ${strategy.objective}`,
    visualStyle: style,
    aspectRatio: strategy.imageStrategy === 'led' ? '16:9' : '4:5',
    placementIntent: strategy.imageStrategy === 'led' ? 'full-bleed' : 'split-hero',
    sectionAssociation: null,
    altIntent: `Illustrative photograph of ${scene}`,
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

  for (const index of supporting) {
    const section = spec.sections[index];

    if (!section) {
      continue;
    }

    needs.push({
      id: `section-${index}`,
      role: index === supporting[0] ? 'supporting' : 'editorial-break',
      subject: scene,
      context: `Supporting visual for the "${section.kind}" section, which serves the purpose "${section.purpose}"`,
      visualStyle: style,
      aspectRatio: '3:2',
      placementIntent: 'section-inset',
      sectionAssociation: index,
      altIntent: `Illustrative photograph supporting the ${section.kind} section`,
      required: false,
    });
  }

  return needs;
}
