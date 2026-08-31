import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { demoSpec } from '~/lib/ithinq/creative-ai/demo-specs';
import { compilePageSpecToProjectManifest, inlineDocumentRuntime } from '~/lib/ithinq/pagespec';
import { campaignRenderInputs, runCampaign } from '~/lib/ithinq/creative-ai';
import { DEFAULT_BRIEF } from '~/lib/ithinq/creative-ai/briefs';

/** Renders the page produced by the full plain-language campaign pipeline. */
export async function loader({ request, context }: LoaderFunctionArgs) {
  let instruction = DEFAULT_BRIEF;
  let specId: string | null = null;

  try {
    const params = new URL(request.url).searchParams;
    instruction = params.get('brief') || DEFAULT_BRIEF;
    specId = params.get('spec');
  } catch {
    // Presentation-only input; an unusable URL falls back to the demo brief.
  }

  const spec = demoSpec(specId).spec;
  const env = (context?.cloudflare?.env ?? {}) as unknown as Record<string, string | undefined>;
  const run = await runCampaign(spec, { userInstruction: instruction }, { env });
  const { copy, generatedMedia } = campaignRenderInputs(run);

  const { manifest } = compilePageSpecToProjectManifest(spec, {
    direction: run.strategy.directionId,
    generatedMedia,
    copy,
  });

  const preview = inlineDocumentRuntime.prepare(manifest);

  return new Response(preview.document, {
    headers: {
      'Content-Type': preview.mimeType,
      'Cache-Control': 'no-store',
      ...preview.headers,
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
