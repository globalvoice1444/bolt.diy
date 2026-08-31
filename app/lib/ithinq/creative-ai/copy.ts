import type { PageSpec } from '@ithinq-pagespec/page-spec';
import { safeCopy, type CopyFinding } from './copy-guard';
import type { InterpretedRequest } from './interpret';
import type { CreativeStrategy } from './strategy';
import type { StructuredTextGenerator } from './provider/openai-text';

/**
 * Renderer-local presentation copy.
 *
 * Deliberately cannot address the disclosure, the CTAs or the Partner's
 * identity: those are not overridable at the type level, so no amount of model
 * output can reach them. The PageSpec artifact is untouched — this is an
 * overlay the composer prefers when present and falls back from when absent.
 */
export interface SectionCopy {
  index: number;
  eyebrow?: string;
  heading?: string;
  body?: string;
}

export interface CopyOverlay {
  headline?: string;
  subheadline?: string;
  audience?: string;
  sections: SectionCopy[];
}

export interface CopyResult {
  overlay: CopyOverlay;
  findings: CopyFinding[];

  /** Fields the model produced that the guard rejected. */
  rejected: number;

  /** Fields that reached the page. */
  accepted: number;
  generated: boolean;
}

const COPY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'subheadline', 'sections'],
  properties: {
    headline: { type: 'string' },
    subheadline: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'eyebrow', 'heading', 'body'],
        properties: {
          index: { type: 'integer' },
          eyebrow: { type: ['string', 'null'] },
          heading: { type: ['string', 'null'] },
          body: { type: ['string', 'null'] },
        },
      },
    },
  },
} as const;

const SYSTEM = `You are a senior copywriter with a strong editorial voice.

You will be given SOURCE MATERIAL from an approved marketing document, and a
creative brief describing how the page should feel.

Your job is to sharpen the source material in the requested voice. You are
rewriting expression, not authoring facts.

THE QUALITY BAR IS THE SOURCE ITSELF.
The source copy is deliberately specific and situational — it names real
moments, rooms, people and frictions. That specificity is the whole value. Your
rewrite must be at least as concrete. If your version would work for any
company in any industry, it is wrong and you should start again.

Write this way:
- Lead with a concrete moment, object or friction, not an abstract benefit.
- Prefer plain nouns and verbs over business abstractions.
- Vary sentence length. Short sentences carry weight.
- Sentence case, always. Never Title Case A Headline Like This.
- Keep the reader's own vocabulary; do not upgrade it into corporate register.

Never write these, or anything in their family:
"Transform", "Elevate", "Unlock", "Revolutionise", "Empower", "Streamline",
"Seamlessly", "Effortlessly", "Supercharge", "Take X to the next level",
"Discover the power of", "In today's fast-paced world", "Say goodbye to".
Never open a headline with a benefit verb aimed at the reader.
Never simply append the product name to a benefit phrase.

Absolute truth rules:
- Never introduce a number, percentage, price, duration, count or statistic
  that is not already in the source material.
- Never introduce a testimonial, review, award, rating, certification,
  guarantee, or claim of proof.
- Never state a product capability that is not already in the source material.
- Never name a company, person or brand that is not already in the source.
- If the source is vague, stay vague. Do not resolve vagueness by inventing.

Keep each section's meaning intact.`;

function sectionSources(spec: PageSpec, index: number): string[] {
  const section = spec.sections[index];

  if (!section) {
    return [];
  }

  return [
    section.eyebrow ?? '',
    section.heading ?? '',
    section.body ?? '',
    ...(section.items ?? []),
    ...(section.qa ?? []).flatMap((qa) => [qa.question, qa.answer]),
  ].filter(Boolean);
}

/**
 * Generate presentation copy grounded in the contract.
 *
 * Every returned field has passed the truth guard against its own source
 * material. Anything that failed is dropped and the section keeps the Growth
 * Engine's original wording, so the page degrades toward truth.
 */
export async function generateCopy(
  spec: PageSpec,
  request: InterpretedRequest,
  strategy: CreativeStrategy,
  generator: StructuredTextGenerator | null,
): Promise<CopyResult> {
  const empty: CopyResult = {
    overlay: { sections: [] },
    findings: [],
    rejected: 0,
    accepted: 0,
    generated: false,
  };

  if (!generator) {
    return empty;
  }

  const source = {
    headline: spec.page.headline,
    subheadline: spec.page.subheadline,
    audience: spec.page.audience,
    sections: spec.sections.map((section, index) => ({
      index,
      kind: section.kind,
      purpose: section.purpose,
      eyebrow: section.eyebrow ?? null,
      heading: section.heading ?? null,
      body: section.body ?? null,
      items: section.items ?? [],
      qa: section.qa ?? [],
    })),
  };

  let result: { headline: string; subheadline: string; sections: SectionCopy[] };

  try {
    result = await generator.generate({
      system: SYSTEM,
      user: [
        `Creative brief: ${request.userInstruction}`,
        request.angle ? `Creative angle: ${request.angle}` : '',
        `Tone: ${request.tone}. Copy style: ${strategy.copyStyle}. Narrative: ${strategy.narrativeAngle}.`,
        '',
        'SOURCE MATERIAL (the only facts you may use):',
        JSON.stringify(source, null, 2),
        '',
        'Rewrite the headline, subheadline, and each section eyebrow/heading/body.',
        'Return null for any field the source leaves empty.',
      ]
        .filter(Boolean)
        .join('\n'),
      schema: COPY_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'creative_copy',
      temperature: 0.85,
    });
  } catch {
    return empty;
  }

  const findings: CopyFinding[] = [];
  let accepted = 0;
  let rejected = 0;
  const before = () => findings.length;

  const pageSource = [spec.page.headline, spec.page.subheadline, spec.page.audience];
  const overlay: CopyOverlay = { sections: [] };

  const track = (value: string | null, mark: number) => {
    if (value) {
      accepted += 1;
    } else if (findings.length > mark) {
      rejected += 1;
    }

    return value ?? undefined;
  };

  let mark = before();
  overlay.headline = track(safeCopy('page.headline', result.headline, pageSource, findings, 160), mark);

  mark = before();
  overlay.subheadline = track(safeCopy('page.subheadline', result.subheadline, pageSource, findings, 300), mark);

  for (const candidate of result.sections ?? []) {
    const index = candidate.index;

    if (!Number.isInteger(index) || index < 0 || index >= spec.sections.length) {
      continue;
    }

    const src = sectionSources(spec, index);
    const entry: SectionCopy = { index };

    mark = before();
    entry.eyebrow = track(safeCopy(`section.${index}.eyebrow`, candidate.eyebrow, src, findings, 80), mark);

    mark = before();
    entry.heading = track(safeCopy(`section.${index}.heading`, candidate.heading, src, findings, 140), mark);

    mark = before();
    entry.body = track(safeCopy(`section.${index}.body`, candidate.body, src, findings, 900), mark);

    if (entry.eyebrow || entry.heading || entry.body) {
      overlay.sections.push(entry);
    }
  }

  return { overlay, findings, rejected, accepted, generated: true };
}
