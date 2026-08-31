import type { PageSpec } from '@ithinq-pagespec/page-spec';
import type { CopyText } from '~/lib/ithinq/pagespec/creative';
import { assetIdFor, devAssetStore, type AssetStore } from './asset-store';
import { planAssetNeeds, type AssetNeed } from './asset-need';
import { authorCampaignCopy, type CopyResult } from './copy';
import { factCoverage, EMPTY_FACT_SET, type ApprovedFactSet, type FactCoverage } from './facts';
import { interpretBrief, type InterpretedRequest } from './interpret';
import { buildImagePrompt } from './prompt';
import type { CreativeRequestInput } from './request';
import { deriveCreativeStrategy, type CreativeStrategy } from './strategy';
import { resolveGenerator } from './orchestrator';
import { resolveTextGenerator, type StructuredTextGenerator } from './provider/openai-text';
import { createHash } from 'node:crypto';
import { AssetGenerationError, type CreativeAssetGenerator, type GeneratedAsset } from './provider/types';

export interface CampaignFailure {
  stage: 'copy' | 'image';
  id: string;
  code: string;
  detail: string;
}

export interface CampaignRun {
  request: InterpretedRequest;
  strategy: CreativeStrategy;

  /** The facts this campaign was allowed to assert. */
  factSet: ApprovedFactSet;

  /** How well the fact set covers the document. Diagnostics, never a gate. */
  coverage: FactCoverage;
  copy: CopyResult;
  needs: AssetNeed[];
  assets: GeneratedAsset[];
  failures: CampaignFailure[];
  imageProvider: string;
  imageModel: string;
  textModel: string | null;
  syntheticImages: boolean;
}

export interface CampaignOptions {
  env?: Record<string, string | undefined>;

  /**
   * The approved fact set for this document.
   *
   * Without one the writer has nothing to assert from, so the page keeps the
   * document's own copy. That is the correct degradation: a campaign with no
   * fact authority behind it should not be written at all.
   */
  factSet?: ApprovedFactSet;
  imageGenerator?: CreativeAssetGenerator;
  textGenerator?: StructuredTextGenerator | null;
  store?: AssetStore;

  /** Skip image generation; useful for inspecting a plan cheaply. */
  skipImages?: boolean;
}

/**
 * The whole campaign flow.
 *
 * brief -> interpretation -> strategy -> approved facts -> authored copy
 *       -> claim audit -> asset needs -> images.
 *
 * Each stage degrades independently: without a text model the deterministic
 * reader still produces a strategy and the document's own copy still renders;
 * without an image model the page renders typographically; without a fact set
 * nothing is authored. A campaign never fails as a whole because one model was
 * unavailable.
 */
export async function runCampaign(
  spec: PageSpec,
  input: CreativeRequestInput,
  options: CampaignOptions = {},
): Promise<CampaignRun> {
  const env = options.env ?? {};
  const textGenerator = options.textGenerator === undefined ? resolveTextGenerator(env) : options.textGenerator;
  const imageGenerator = options.imageGenerator ?? resolveGenerator(env);
  const store = options.store ?? devAssetStore;
  const factSet = options.factSet ?? EMPTY_FACT_SET;
  const failures: CampaignFailure[] = [];

  const request = await interpretBrief(input, textGenerator);
  const strategy = deriveCreativeStrategy(spec, request);
  const coverage = factCoverage(spec, factSet);
  const copy =
    factSet.facts.length > 0
      ? await authorCampaignCopy(spec, factSet, request, strategy, textGenerator)
      : {
          overlay: { sections: [] },
          plan: null,
          findings: [],
          rejected: 0,
          accepted: 0,
          generated: false,
          audited: false,
        };

  for (const finding of copy.findings) {
    failures.push({
      stage: 'copy',
      id: finding.field,
      code: finding.code,
      detail: finding.detail,
    });
  }

  const needs = planAssetNeeds(spec, strategy);
  const assets: GeneratedAsset[] = [];

  if (!options.skipImages) {
    for (const need of needs) {
      const prompt = buildImagePrompt(need, strategy);
      const id = assetIdFor(prompt, need.id);

      try {
        const existing = await store.get(id);
        const produced = existing
          ? { bytes: existing.bytes, mimeType: existing.mimeType, width: 0, height: 0 }
          : await imageGenerator.generate({ need, prompt, alt: need.altIntent });

        if (!existing) {
          await store.put(id, produced.mimeType, produced.bytes);
        }

        assets.push({
          id,
          assetNeedId: need.id,
          provider: imageGenerator.provider,
          model: imageGenerator.model,
          url: store.urlFor(id),
          width: produced.width,
          height: produced.height,
          mimeType: produced.mimeType,
          alt: need.altIntent,
          generation: {
            promptSha256: createHash('sha256').update(prompt).digest('hex'),
            createdAt: new Date(0).toISOString(),
            synthetic: imageGenerator.synthetic,
          },
        });
      } catch (error) {
        failures.push({
          stage: 'image',
          id: need.id,
          code: error instanceof AssetGenerationError ? error.code : 'unknown_error',
          detail: error instanceof Error ? error.message : 'Image generation failed.',
        });
      }
    }
  }

  return {
    request,
    strategy,
    factSet,
    coverage,
    copy,
    needs,
    assets,
    failures,
    imageProvider: imageGenerator.provider,
    imageModel: imageGenerator.model,
    textModel: textGenerator?.model ?? null,
    syntheticImages: imageGenerator.synthetic,
  };
}

/** The renderer-facing view of a run: presentation copy plus generated media. */
export function campaignRenderInputs(run: CampaignRun): {
  copy: CopyText | undefined;
  generatedMedia: Array<{ assetNeedId: string; url: string; alt: string }>;
} {
  const hasCopy =
    Boolean(run.copy.overlay.headline || run.copy.overlay.subheadline || run.copy.overlay.audience) ||
    run.copy.overlay.sections.length > 0;

  return {
    copy: hasCopy ? run.copy.overlay : undefined,
    generatedMedia: run.assets.map((asset) => ({
      assetNeedId: asset.assetNeedId,
      url: asset.url,
      alt: asset.alt,
    })),
  };
}
