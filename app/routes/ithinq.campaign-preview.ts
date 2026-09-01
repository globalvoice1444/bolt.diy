import type { LoaderFunctionArgs } from '@remix-run/node';
import { demoSpec } from '~/lib/ithinq/creative-ai/demo-specs';
import { compilePageSpecToProjectManifest, inlineDocumentRuntime } from '~/lib/ithinq/pagespec';
import { campaignRenderInputs, runCampaign } from '~/lib/ithinq/creative-ai';
import type { CampaignRun } from '~/lib/ithinq/creative-ai';
import { campaignJobs } from '~/lib/ithinq/creative-ai/campaign-jobs';
import { DEFAULT_BRIEF } from '~/lib/ithinq/creative-ai/briefs';
import { getRuntimeEnv } from '~/lib/ithinq/runtime-env';

const PREVIEW_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function plain(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * Renders the page produced by the full plain-language campaign pipeline.
 *
 * Two ways in. `?job=<id>` renders a run the queue already finished, which is
 * the production path and costs nothing but a compile. Without it the pipeline
 * runs inline, which is a two-minute request and is kept only because it is the
 * one way to exercise the whole path in a single call — useful from a script,
 * wrong for a reader.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  let instruction = DEFAULT_BRIEF;
  let specId: string | null = null;
  let jobId: string | null = null;

  try {
    const params = new URL(request.url).searchParams;
    instruction = params.get('brief') || DEFAULT_BRIEF;
    specId = params.get('spec');
    jobId = params.get('job');
  } catch {
    // Presentation-only input; an unusable URL falls back to the demo brief.
  }

  const env = getRuntimeEnv(context);
  let run: CampaignRun;

  if (jobId) {
    const record = campaignJobs(env).get(jobId);

    if (!record) {
      return plain('No such campaign job.', 404);
    }

    if (record.status === 'failed') {
      return plain(`This campaign failed: ${record.failure?.detail ?? 'unknown error'}`, 409);
    }

    if (record.status !== 'succeeded' || !record.result) {
      // 409, not 404: the job exists and the answer is "not yet".
      return plain(`This campaign is ${record.status}. Poll /ithinq/campaign-jobs/${record.id}.`, 409);
    }

    run = record.result;
    specId = record.input.specId;
  } else {
    const demo = demoSpec(specId);
    run = await runCampaign(demo.spec, { userInstruction: instruction }, { env, factSet: demo.factSet });
  }

  // The document the run was authored against, never whatever the URL now says.
  const spec = demoSpec(specId).spec;
  const { copy, generatedMedia } = campaignRenderInputs(run);

  const { manifest } = compilePageSpecToProjectManifest(spec, {
    direction: run.strategy.directionId,
    generatedMedia,
    copy,
  });

  const preview = inlineDocumentRuntime.prepare(manifest);

  return new Response(preview.document, {
    headers: { 'Content-Type': preview.mimeType, ...preview.headers, ...PREVIEW_HEADERS },
  });
}
