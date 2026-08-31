import type { ApprovedFact } from './facts';
import type { CopyFinding } from './copy-guard';
import type { StructuredTextGenerator } from './provider/openai-text';

/**
 * The claim audit.
 *
 * The deterministic guard catches invented figures, money and evidence
 * vocabulary. It cannot catch the failure that actually matters once a model
 * is authoring rather than rephrasing: a fluent, cliché-free, number-free
 * sentence stating a capability the product does not have. "It books the
 * appointment straight into your calendar" trips no lexicon and is a lie if no
 * approved fact says so.
 *
 * So a second pass reads the authored copy back against the fact set and names
 * the assertions nothing supports. It is given the facts and the copy and
 * nothing else — no brief, no strategy, no persuasion to be swayed by — and it
 * is asked to find problems rather than to approve.
 *
 * Deliberately narrow. It judges factual support, not taste, tone, quality or
 * compliance, and it is told in as many words that persuasion, metaphor,
 * rhetorical questions, emotional framing and urgency are not its business.
 */
export interface AuditedField {
  field: string;
  text: string;
}

export interface ClaimAuditResult {
  /** Fields carrying at least one unsupported assertion. */
  rejectedFields: Set<string>;
  findings: CopyFinding[];

  /** False when no model was available, or the audit itself failed. */
  performed: boolean;
}

const AUDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['unsupported'],
  properties: {
    unsupported: {
      type: 'array',
      description: 'One entry per factual assertion that no approved fact supports. Empty when everything is grounded.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'claim', 'reason'],
        properties: {
          field: { type: 'string', description: 'The field id exactly as given.' },
          claim: { type: 'string', description: 'The asserted claim, quoted from the copy.' },
          reason: { type: 'string', description: 'Why the approved facts do not support it.' },
        },
      },
    },
  },
} as const;

const SYSTEM = `You are a fact-checker reading marketing copy against an approved fact set.

You will be given APPROVED FACTS and a list of copy FIELDS. For each field,
decide whether it asserts anything about the product, the company or the
customer's outcome that the approved facts do not support.

Report ONLY unsupported factual assertions. Report nothing else.

These are NOT your concern and must never be reported:
- persuasive language, emotion, urgency, tone, register or style
- metaphor, imagery, rhetorical questions, direct address
- describing an approved capability in different words, or in vivid words
- a reasonable everyday inference from an approved fact (if the assistant
  answers calls the caller could not otherwise reach, a caller not reaching
  anyone today is a fair framing of the problem)
- statements about the reader's own situation, business or day, which the
  copy is entitled to describe
- calls to action, offers to talk, or invitations to book a demo
- quality, taste, repetition or whether the copy is any good

These ARE unsupported and must be reported:
- a capability, integration or behaviour no approved fact states
- a quantity, duration, percentage, price or count no approved fact states
- a result, outcome or performance claim no approved fact states
- proof, evidence, awards, ratings, certifications, guarantees, testimonials
  or claims about other customers, unless an approved fact states them
- contradicting an approved fact, especially one that states a limit

Be strict about invented capability. Be relaxed about everything else. An empty
list is the correct and expected answer for well-grounded copy.`;

/**
 * Audit authored copy against the approved facts.
 *
 * Best-effort by design: without a model, or if the audit call fails, the
 * deterministic guard still stands and `performed` reports honestly that the
 * semantic pass did not run. Killing an entire authored campaign because a
 * second model call timed out would trade a real capability for a theoretical
 * safety gain.
 */
export async function auditClaims(
  facts: readonly ApprovedFact[],
  fields: readonly AuditedField[],
  generator: StructuredTextGenerator | null,
): Promise<ClaimAuditResult> {
  const empty: ClaimAuditResult = { rejectedFields: new Set(), findings: [], performed: false };

  if (!generator || fields.length === 0 || facts.length === 0) {
    return empty;
  }

  let result: { unsupported: Array<{ field: string; claim: string; reason: string }> };

  try {
    result = await generator.generate({
      system: SYSTEM,
      user: [
        'APPROVED FACTS:',
        facts.map((fact) => `- (${fact.kind}) ${fact.text}`).join('\n'),
        '',
        'FIELDS:',
        JSON.stringify(fields, null, 2),
      ].join('\n'),
      schema: AUDIT_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'claim_audit',
      temperature: 0,
    });
  } catch {
    return empty;
  }

  const known = new Set(fields.map((entry) => entry.field));
  const rejectedFields = new Set<string>();
  const findings: CopyFinding[] = [];

  for (const entry of result.unsupported ?? []) {
    if (!known.has(entry.field)) {
      continue;
    }

    rejectedFields.add(entry.field);
    findings.push({
      field: entry.field,
      code: 'unsupported_claim',
      detail: `Asserted "${entry.claim}" — ${entry.reason}`,
    });
  }

  return { rejectedFields, findings, performed: true };
}
