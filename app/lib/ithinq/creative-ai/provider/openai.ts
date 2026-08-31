import { ASPECT_SIZES, AssetGenerationError, type CreativeAssetGenerator, type GenerateImageRequest } from './types';

/**
 * OpenAI image generation.
 *
 * Server-side only. The key is read from the server environment and never
 * reaches browser code, is never logged and is never echoed in a diagnostic.
 * Uses `fetch` against the REST endpoint rather than an SDK so the renderer
 * gains no new dependency for one call.
 */
export const OPENAI_IMAGE_MODEL = 'gpt-image-1';

const OPENAI_IMAGES_ENDPOINT = 'https://api.openai.com/v1/images/generations';

export interface OpenAIImageGeneratorOptions {
  apiKey: string;
  model?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface OpenAIImageResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string; type?: string; code?: string };
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export class OpenAIImageGenerator implements CreativeAssetGenerator {
  readonly provider = 'openai';
  readonly model: string;
  readonly synthetic = false;

  private readonly _apiKey: string;
  private readonly _endpoint: string;
  private readonly _fetch: typeof fetch;
  private readonly _timeoutMs: number;

  constructor(options: OpenAIImageGeneratorOptions) {
    if (!options.apiKey) {
      throw new AssetGenerationError('OpenAI API key is not configured.', 'missing_credential', '');
    }

    this._apiKey = options.apiKey;
    this.model = options.model ?? OPENAI_IMAGE_MODEL;
    this._endpoint = options.endpoint ?? OPENAI_IMAGES_ENDPOINT;
    this._fetch = options.fetchImpl ?? fetch;
    this._timeoutMs = options.timeoutMs ?? 120_000;
  }

  async generate(request: GenerateImageRequest) {
    const size = ASPECT_SIZES[request.need.aspectRatio] ?? ASPECT_SIZES['1:1'];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);

    let response: Response;

    try {
      response = await this._fetch(this._endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this._apiKey}` },
        body: JSON.stringify({
          model: this.model,
          prompt: request.prompt,
          size: size!.openai,
          n: 1,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new AssetGenerationError(
        `Image request failed: ${error instanceof Error ? error.message : 'network error'}`,
        'network_error',
        request.need.id,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;

      try {
        const body = (await response.json()) as OpenAIImageResponse;

        // Provider messages are surfaced for diagnostics; credentials never are.
        detail = body.error?.message ? `${detail}: ${body.error.message}` : detail;
      } catch {
        // Non-JSON error body; the status alone is the diagnostic.
      }

      throw new AssetGenerationError(
        `OpenAI rejected the image request (${detail}).`,
        'provider_error',
        request.need.id,
      );
    }

    const payload = (await response.json()) as OpenAIImageResponse;
    const first = payload.data?.[0];

    if (!first?.b64_json) {
      throw new AssetGenerationError(
        'OpenAI response contained no inline image data.',
        'invalid_response',
        request.need.id,
      );
    }

    return { bytes: decodeBase64(first.b64_json), mimeType: 'image/png', width: size!.width, height: size!.height };
  }
}
