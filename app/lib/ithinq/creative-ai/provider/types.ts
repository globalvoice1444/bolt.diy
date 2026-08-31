import type { AssetNeed } from '~/lib/ithinq/creative-ai/asset-need';

/**
 * A generated image, normalised away from any provider's response shape.
 *
 * Generation metadata lives here and never enters PageSpec 1.0. The contract
 * describes business truth; how a picture was produced is renderer diagnostics.
 */
export interface GeneratedAsset {
  id: string;
  assetNeedId: string;
  provider: string;
  model: string;

  /** Renderer-served URL for the stored bytes. */
  url: string;
  width: number;
  height: number;
  mimeType: string;
  alt: string;

  /** Diagnostics only. Never rendered as a claim. */
  generation: {
    promptSha256: string;
    createdAt: string;

    /** True when produced by a real model rather than a development stand-in. */
    synthetic: boolean;
  };
}

export interface GenerateImageRequest {
  need: AssetNeed;
  prompt: string;
  alt: string;
}

export class AssetGenerationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly needId: string,
  ) {
    super(message);
    this.name = 'AssetGenerationError';
  }
}

/**
 * One interface, one real implementation.
 *
 * The renderer depends on this, never on a provider SDK, so the composition
 * layer cannot acquire a transitive dependency on OpenAI.
 */
export interface CreativeAssetGenerator {
  readonly provider: string;
  readonly model: string;

  /** False when the generator is a development stand-in rather than a model. */
  readonly synthetic: boolean;
  generate(
    request: GenerateImageRequest,
  ): Promise<{ bytes: Uint8Array; mimeType: string; width: number; height: number }>;
}

export const ASPECT_SIZES: Readonly<Record<string, { width: number; height: number; openai: string }>> = {
  '16:9': { width: 1536, height: 1024, openai: '1536x1024' },
  '4:5': { width: 1024, height: 1536, openai: '1024x1536' },
  '3:2': { width: 1536, height: 1024, openai: '1536x1024' },
  '1:1': { width: 1024, height: 1024, openai: '1024x1024' },
};
