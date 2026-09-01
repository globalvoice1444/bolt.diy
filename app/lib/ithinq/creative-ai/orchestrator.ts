import { createHash } from 'node:crypto';
import type { PageSpec } from '@ithinq-pagespec/page-spec';
import { assetIdFor, type AssetStore } from './asset-store';
import { resolveAssetStore } from './asset-store-resolve';
import { planAssetNeeds, type AssetNeed } from './asset-need';
import { buildImagePrompt } from './prompt';
import { normaliseCreativeRequest, type CreativeRequest, type CreativeRequestInput } from './request';
import { deriveCreativeStrategy, type CreativeStrategy } from './strategy';
import { OpenAIImageGenerator } from './provider/openai';
import { PlaceholderImageGenerator } from './provider/placeholder';
import { AssetGenerationError, type CreativeAssetGenerator, type GeneratedAsset } from './provider/types';

export interface AssetFailure {
  needId: string;
  code: string;
  detail: string;
  required: boolean;
}

export interface CreativeRun {
  request: CreativeRequest;
  strategy: CreativeStrategy;
  needs: AssetNeed[];
  assets: GeneratedAsset[];
  failures: AssetFailure[];
  provider: string;
  model: string;

  /** True when a development stand-in produced the imagery. */
  synthetic: boolean;
}

export interface OrchestrateOptions {
  generator?: CreativeAssetGenerator;
  store?: AssetStore;

  /** Server environment. Never pass browser-visible values here. */
  env?: Record<string, string | undefined>;

  /** Skip generation entirely and return the plan only. */
  planOnly?: boolean;
}

/**
 * Choose the generator.
 *
 * OpenAI whenever a server-side key exists; otherwise the clearly-marked
 * development stand-in, so the pipeline stays reviewable without a credential
 * rather than failing closed and leaving the architecture unexercised.
 */
export function resolveGenerator(env: Record<string, string | undefined> = {}): CreativeAssetGenerator {
  const apiKey = env.OPENAI_API_KEY || process?.env?.OPENAI_API_KEY;

  if (apiKey && apiKey.trim() && !/your_|placeholder|_here$/i.test(apiKey)) {
    return new OpenAIImageGenerator({ apiKey: apiKey.trim() });
  }

  return new PlaceholderImageGenerator();
}

/**
 * Run the creative pipeline.
 *
 * request -> strategy -> needs -> generate -> store -> assets.
 *
 * An optional asset that fails is recorded and skipped; the page still
 * renders. A required asset that fails is recorded as required so the caller
 * can refuse rather than ship a page missing something the design depends on.
 */
export async function orchestrateCreative(
  spec: PageSpec,
  input: CreativeRequestInput,
  options: OrchestrateOptions = {},
): Promise<CreativeRun> {
  const request = normaliseCreativeRequest(input);
  const strategy = deriveCreativeStrategy(spec, request);
  const needs = planAssetNeeds(spec, strategy);

  const generator = options.generator ?? resolveGenerator(options.env);
  const store = options.store ?? resolveAssetStore(options.env);
  const assets: GeneratedAsset[] = [];
  const failures: AssetFailure[] = [];

  if (options.planOnly) {
    return {
      request,
      strategy,
      needs,
      assets,
      failures,
      provider: generator.provider,
      model: generator.model,
      synthetic: generator.synthetic,
    };
  }

  for (const need of needs) {
    const prompt = buildImagePrompt(need, strategy);
    const id = assetIdFor(prompt, need.id);

    try {
      const existing = await store.get(id);
      const produced = existing
        ? { bytes: existing.bytes, mimeType: existing.mimeType, width: 0, height: 0 }
        : await generator.generate({ need, prompt, alt: need.altIntent });

      if (!existing) {
        await store.put(id, produced.mimeType, produced.bytes);
      }

      assets.push({
        id,
        assetNeedId: need.id,
        provider: generator.provider,
        model: generator.model,
        url: store.urlFor(id),
        width: produced.width,
        height: produced.height,
        mimeType: produced.mimeType,
        alt: need.altIntent,
        generation: {
          promptSha256: createHash('sha256').update(prompt).digest('hex'),
          createdAt: new Date(0).toISOString(),
          synthetic: generator.synthetic,
        },
      });
    } catch (error) {
      const code = error instanceof AssetGenerationError ? error.code : 'unknown_error';
      failures.push({
        needId: need.id,
        code,
        detail: error instanceof Error ? error.message : 'Image generation failed.',
        required: need.required,
      });
    }
  }

  return {
    request,
    strategy,
    needs,
    assets,
    failures,
    provider: generator.provider,
    model: generator.model,
    synthetic: generator.synthetic,
  };
}

/** True when a required asset could not be produced and the page must refuse. */
export function hasBlockingFailure(run: CreativeRun): boolean {
  return run.failures.some((failure) => failure.required);
}
