import type { PageSpecSection } from '@ithinq-pagespec/page-spec';

/**
 * Renderer-local presentation copy.
 *
 * Structurally unable to address the disclosure, the CTAs, the referral URL or
 * Partner identity: those fields simply do not exist here, so no overlay can
 * reach them however the copy was produced. Absent fields fall back to the
 * PageSpec, which remains untouched.
 */
export interface SectionCopyText {
  index: number;
  eyebrow?: string;
  heading?: string;
  body?: string;
  items?: readonly string[];
  qa?: ReadonlyArray<{ question: string; answer: string }>;
}

export interface CopyText {
  headline?: string;
  subheadline?: string;
  audience?: string;
  sections: readonly SectionCopyText[];
}

export function sectionCopyAt(copy: CopyText | undefined, index: number): SectionCopyText | undefined {
  return copy?.sections.find((entry) => entry.index === index);
}

/**
 * The section as the page will actually present it.
 *
 * Once the writer can author items and Q&A rather than only rewording what the
 * document carried, the planner has to see the same content the composer will
 * render — otherwise a section whose list the model wrote is planned as
 * bodyless prose and its items land in whatever layout happened to be the
 * fallback. Planning and composing read this one view so they cannot disagree.
 */
export function effectiveSection(section: PageSpecSection, copy?: SectionCopyText): PageSpecSection {
  if (!copy) {
    return section;
  }

  return {
    ...section,
    eyebrow: copy.eyebrow ?? section.eyebrow,
    heading: copy.heading ?? section.heading,
    body: copy.body ?? section.body,
    items: copy.items ? [...copy.items] : section.items,
    qa: copy.qa ? copy.qa.map((pair) => ({ ...pair })) : section.qa,
  };
}
