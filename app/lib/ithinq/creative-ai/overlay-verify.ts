import { OPENAI_TEXT_MODEL } from './provider/openai-text';
import type { OverlayField, OverlayText } from './overlay';

/**
 * Did the picture actually say what it was told to say?
 *
 * WHY THIS EXISTS AT ALL, given that nothing else in this service second-
 * guesses a generated image. Letting a diffusion model set type is what makes
 * an advertisement look designed rather than composited — it decides the
 * typeface FOR the photograph, runs a line along a counter's edge in the
 * scene's own perspective, lets the light fall across the letterforms. Nothing
 * assembled from a template does that. The price of that quality is that the
 * model can misspell, and a misspelling is not equally serious everywhere:
 *
 *   A garbled headline is embarrassing. A garbled PRICE is a false statement
 *   of fact published under someone's business name.
 *
 * So verification is proportional to consequence and nothing else. The caller
 * names which strings are grounded business truth; only those are read back.
 * A campaign whose creative carries no grounded fact is never verified at all
 * and costs nothing extra, which is most of them.
 *
 * IT IS NOT A TYPOGRAPHY POLICE. It is told in as many words that case,
 * punctuation, spacing, ligatures, line breaks and stylistic treatment are not
 * its business — an ad set in all caps has not corrupted anything. It looks for
 * one thing: whether the words a reader sees still MEAN what the caller
 * approved. Rejecting good advertising over a stylised ampersand would be a
 * worse failure than the one this guards against.
 *
 * DEGRADES OPEN, NOT CLOSED. With no credential it reports itself unavailable
 * and rendering proceeds unverified, because a human approves this creative
 * before anything is published and an unverifiable check must not become an
 * outage. The caller is told what was and was not checked.
 */
export interface OverlayVerification {
  /** Grounded fields that were actually read back. */
  checked: OverlayField[];

  /** Grounded fields whose rendered meaning differs from what was approved. */
  mismatched: OverlayField[];

  /** True when no verifier could run. Never conflated with "passed". */
  skipped: boolean;
}

export interface VerifyRequest {
  imageBase64: string;
  mimeType: string;

  /** Only the grounded subset. The caller decides what is grounded. */
  expected: Partial<Record<OverlayField, string>>;
}

export interface OverlayVerifier {
  readonly available: boolean;
  verify(request: VerifyRequest): Promise<OverlayVerification>;
}

export const UNVERIFIED: OverlayVerification = { checked: [], mismatched: [], skipped: true };

/** The verifier used when no credential exists. Reports, never blocks. */
export const noOverlayVerifier: OverlayVerifier = {
  available: false,
  async verify() {
    return UNVERIFIED;
  },
};

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

const SYSTEM = [
  'You read advertising creative back and report only whether specific approved strings were rendered with their meaning intact.',
  'You are NOT a design critic and NOT a typography checker.',
  'Case, capitalisation, punctuation, spacing, letter-spacing, ligatures, line breaks, stylistic treatment, colour and placement are explicitly NOT your concern and are never mismatches.',
  'A string is a MISMATCH only when what a reader would understand has materially changed: a different number, a different amount, a different percentage, a different date, a misspelling that changes a business name, garbled or unreadable lettering, or the string being absent from the image entirely.',
  'When in doubt, it is not a mismatch. Rejecting good advertising over presentation is a worse error than allowing a stylistic difference.',
].join(' ');

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['fields'],
  properties: {
    fields: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'renderedFaithfully'],
        properties: {
          field: { type: 'string' },
          renderedFaithfully: { type: 'boolean' },
        },
      },
    },
  },
} as const;

interface VerifierOptions {
  apiKey: string;
  model?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class OpenAIOverlayVerifier implements OverlayVerifier {
  readonly available = true;

  private readonly _apiKey: string;
  private readonly _model: string;
  private readonly _endpoint: string;
  private readonly _fetch: typeof fetch;
  private readonly _timeoutMs: number;

  constructor(options: VerifierOptions) {
    this._apiKey = options.apiKey;
    this._model = options.model ?? OPENAI_TEXT_MODEL;
    this._endpoint = options.endpoint ?? ENDPOINT;
    this._fetch = options.fetchImpl ?? fetch;
    this._timeoutMs = options.timeoutMs ?? 45_000;
  }

  async verify(request: VerifyRequest): Promise<OverlayVerification> {
    const fields = Object.keys(request.expected) as OverlayField[];

    if (fields.length === 0) {
      return { checked: [], mismatched: [], skipped: false };
    }

    const wanted = fields.map((field) => `${field}: "${request.expected[field]}"`).join('\n');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);

    try {
      const response = await this._fetch(this._endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this._apiKey}` },
        body: JSON.stringify({
          model: this._model,
          temperature: 0,
          messages: [
            { role: 'system', content: SYSTEM },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `These strings were approved for this advertisement. For each, report whether the image renders it with its meaning intact.\n\n${wanted}`,
                },
                {
                  type: 'image_url',
                  image_url: { url: `data:${request.mimeType};base64,${request.imageBase64}` },
                },
              ],
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'overlay_verification', strict: true, schema: SCHEMA },
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return UNVERIFIED;
      }

      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = body.choices?.[0]?.message?.content;

      if (typeof content !== 'string') {
        return UNVERIFIED;
      }

      const parsed = JSON.parse(content) as { fields?: { field?: string; renderedFaithfully?: boolean }[] };
      const mismatched: OverlayField[] = [];

      for (const entry of parsed.fields ?? []) {
        if (entry.renderedFaithfully === false && fields.includes(entry.field as OverlayField)) {
          mismatched.push(entry.field as OverlayField);
        }
      }

      return { checked: fields, mismatched, skipped: false };
    } catch {
      /*
       * A verifier that cannot answer must not fail a render the Partner has
       * already paid for. Reported as skipped so nothing downstream mistakes
       * silence for a pass.
       */
      return UNVERIFIED;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function resolveOverlayVerifier(env: Record<string, string | undefined> = {}): OverlayVerifier {
  const apiKey = env.OPENAI_API_KEY || process?.env?.OPENAI_API_KEY;

  if (apiKey && apiKey.trim() && !/your_|placeholder|_here$/i.test(apiKey)) {
    return new OpenAIOverlayVerifier({ apiKey: apiKey.trim() });
  }

  return noOverlayVerifier;
}

/** The grounded subset of an overlay, as the verifier wants it. */
export function groundedExpectations(
  overlay: OverlayText,
  grounded: OverlayField[],
): Partial<Record<OverlayField, string>> {
  const expected: Partial<Record<OverlayField, string>> = {};

  for (const field of grounded) {
    const value = overlay[field]?.trim();

    if (value) {
      expected[field] = value;
    }
  }

  return expected;
}
