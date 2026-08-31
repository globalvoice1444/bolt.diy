import type { PageSpec } from '@ithinq-pagespec/page-spec';
import {
  composeDocument,
  getDirection,
  planPresentation,
  type CreativePresentationPlan,
  type CopyText,
  type GeneratedMedia,
  type PlanOptions,
} from './creative';
import type { ProjectManifest } from './runtime';
import { requireValidPageSpec, type PageSpecValidationOptions } from './validator';

export const PAGESPEC_COMPILER_VERSION = 'ithinq-pagespec-renderer/0.2.0';
export const PAGESPEC_CONTRACT_SOURCE =
  'globalvoice1444/ithinq-partner-network@51c103ff2492b068095dc356225d5d9ef496b44b';

export interface CompilePageSpecOptions extends PageSpecValidationOptions, PlanOptions {
  /**
   * Renderer-local generated imagery.
   *
   * Kept out of the PageSpec entirely: the contract carries business truth,
   * and generated creative is the renderer's own material.
   */
  generatedMedia?: readonly GeneratedMedia[];

  /**
   * Renderer-local presentation copy.
   *
   * Overlays how the page reads; never enters `/pagespec.json`, and cannot
   * address the disclosure, the CTAs or Partner identity.
   */
  copy?: CopyText;
}

export interface CompilePageSpecResult {
  manifest: ProjectManifest;
  validation: ReturnType<typeof requireValidPageSpec>['validation'];
  plan: CreativePresentationPlan;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }

  return value;
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

/**
 * Compile a PageSpec into a deterministic project manifest.
 *
 * The pipeline is: validate -> plan presentation -> compose document. The plan
 * decides how the page looks; the PageSpec remains the only source of what it
 * says. No LLM, provider, prompt, shell, eval, WebContainer or network read is
 * involved, and the same input always produces byte-identical output.
 */
export function compilePageSpecToProjectManifest(
  input: unknown,
  options?: CompilePageSpecOptions,
): CompilePageSpecResult {
  const { spec, validation } = requireValidPageSpec(input, options);
  const generatedMedia = options?.generatedMedia ?? [];
  const plan = planPresentation(spec as PageSpec, validation.skipSections, {
    ...options,
    generatedAssetNeedIds: options?.generatedAssetNeedIds ?? generatedMedia.map((item) => item.assetNeedId),
  });
  const direction = getDirection(plan.directionId);

  const metadata = {
    compiler: PAGESPEC_COMPILER_VERSION,
    contract: 'PageSpec 1.0' as const,
    contractSource: PAGESPEC_CONTRACT_SOURCE,
    pageReference: spec.page.reference,
    direction: direction.id,
    directionLabel: direction.label,
  };

  const manifest: ProjectManifest = {
    manifestVersion: 1,
    entry: '/index.html',
    files: {
      '/index.html': composeDocument(spec, plan, direction, generatedMedia, options?.copy),
      '/pagespec.json': canonicalJson(spec),
      '/presentation.json': canonicalJson(plan),
      '/renderer.json': canonicalJson(metadata),
    },
    metadata,
  };

  return { manifest, validation, plan };
}
