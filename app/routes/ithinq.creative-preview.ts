import type { LoaderFunctionArgs } from '@remix-run/node';
import examplePageSpec from '@ithinq-pagespec/page-spec.example.json';
import type { PageSpec } from '@ithinq-pagespec/page-spec';
import { compilePageSpecToProjectManifest, inlineDocumentRuntime } from '~/lib/ithinq/pagespec';
import { hasBlockingFailure, orchestrateCreative } from '~/lib/ithinq/creative-ai';
import { readCreativeRequest } from '~/lib/ithinq/creative-ai/route-input';
import { getRuntimeEnv } from '~/lib/ithinq/runtime-env';

/**
 * Render a page produced by the full creative pipeline.
 *
 * request -> strategy -> asset needs -> generation -> plan -> document.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const input = readCreativeRequest(request);
  const spec = examplePageSpec as unknown as PageSpec;
  const env = getRuntimeEnv(context);

  const run = await orchestrateCreative(spec, input, { env });

  if (hasBlockingFailure(run)) {
    return Response.json(
      { error: { code: 'required_asset_unavailable', failures: run.failures } },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { manifest } = compilePageSpecToProjectManifest(spec, {
    direction: run.strategy.directionId,
    generatedMedia: run.assets.map((asset) => ({
      assetNeedId: asset.assetNeedId,
      url: asset.url,
      alt: asset.alt,
    })),
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
