import { AssetGenerationError } from '~/lib/ithinq/creative-ai/provider/types';

/**
 * OpenAI text generation, used for creative interpretation and copywriting.
 *
 * Server-side only, same contract as the image provider: the key is read from
 * the server environment, never reaches browser code, and never appears in a
 * log or an error message. Raw `fetch` against the REST endpoint so the
 * renderer gains no SDK dependency.
 */
export const OPENAI_TEXT_MODEL = 'gpt-4o';

const OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export interface OpenAITextOptions {
  apiKey: string;
  model?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface StructuredRequest {
  system: string;
  user: string;

  /** JSON Schema the model must satisfy. */
  schema: Record<string, unknown>;
  schemaName: string;
  temperature?: number;
}

/** Produces JSON that conforms to a caller-supplied schema. */
export interface StructuredTextGenerator {
  readonly provider: string;
  readonly model: string;
  generate<T>(request: StructuredRequest): Promise<T>;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export class OpenAITextGenerator implements StructuredTextGenerator {
  readonly provider = 'openai';
  readonly model: string;

  private readonly _apiKey: string;
  private readonly _endpoint: string;
  private readonly _fetch: typeof fetch;
  private readonly _timeoutMs: number;

  constructor(options: OpenAITextOptions) {
    if (!options.apiKey) {
      throw new AssetGenerationError('OpenAI API key is not configured.', 'missing_credential', 'text');
    }

    this._apiKey = options.apiKey;
    this.model = options.model ?? OPENAI_TEXT_MODEL;
    this._endpoint = options.endpoint ?? OPENAI_CHAT_ENDPOINT;
    this._fetch = options.fetchImpl ?? fetch;
    this._timeoutMs = options.timeoutMs ?? 90_000;
  }

  async generate<T>(request: StructuredRequest): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);

    let response: Response;

    try {
      response = await this._fetch(this._endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this._apiKey}` },
        body: JSON.stringify({
          model: this.model,
          temperature: request.temperature ?? 0.8,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: request.schemaName, strict: true, schema: request.schema },
          },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new AssetGenerationError(
        `Text request failed: ${error instanceof Error ? error.message : 'network error'}`,
        'network_error',
        'text',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;

      try {
        const body = (await response.json()) as ChatResponse;
        detail = body.error?.message ? `${detail}: ${body.error.message}` : detail;
      } catch {
        // Non-JSON error body; the status alone is the diagnostic.
      }

      throw new AssetGenerationError(`OpenAI rejected the text request (${detail}).`, 'provider_error', 'text');
    }

    const payload = (await response.json()) as ChatResponse;
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new AssetGenerationError('OpenAI returned no message content.', 'invalid_response', 'text');
    }

    try {
      return JSON.parse(content) as T;
    } catch {
      throw new AssetGenerationError('OpenAI returned content that was not valid JSON.', 'invalid_response', 'text');
    }
  }
}

export function resolveTextGenerator(env: Record<string, string | undefined> = {}): StructuredTextGenerator | null {
  const apiKey = env.OPENAI_API_KEY || process?.env?.OPENAI_API_KEY;

  if (apiKey && apiKey.trim() && !/your_|placeholder|_here$/i.test(apiKey)) {
    return new OpenAITextGenerator({ apiKey: apiKey.trim() });
  }

  return null;
}
