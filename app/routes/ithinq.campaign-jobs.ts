import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { campaignJobView, campaignQueueStats, submitCampaignJob } from '~/lib/ithinq/creative-ai/campaign-jobs';
import { CampaignJobRejected } from '~/lib/ithinq/creative-ai/jobs';
import { getRuntimeEnv } from '~/lib/ithinq/runtime-env';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Submit a campaign for authoring.
 *
 * Returns immediately with a job to poll rather than holding the connection for
 * the two minutes the pipeline actually takes. 202 for work that was accepted,
 * 200 when an identical request was already in flight or recently finished —
 * the caller polls the same URL either way, and the distinction is only there
 * so a reviewer can see that no second model bill was incurred.
 */
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, { status: 405, headers: { ...NO_STORE, Allow: 'POST' } });
  }

  let brief: unknown;
  let specId: unknown;
  let fresh = false;

  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      const body = (await request.json()) as Record<string, unknown>;
      brief = body.brief;
      specId = body.spec;
      fresh = body.fresh === true;
    } else {
      const form = await request.formData();
      brief = form.get('brief');
      specId = form.get('spec');
      fresh = form.get('fresh') === 'true';
    }
  } catch {
    return json(
      { error: 'invalid_body', detail: 'Body must be JSON or form data.' },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const { record, deduplicated } = submitCampaignJob(getRuntimeEnv(context), brief, specId, { fresh });

    return json({ ...campaignJobView(record), deduplicated }, { status: deduplicated ? 200 : 202, headers: NO_STORE });
  } catch (error) {
    if (error instanceof CampaignJobRejected) {
      // A full queue is back pressure, not a client mistake in the 400 sense.
      const status = error.code === 'queue_full' ? 429 : 400;

      return json({ error: error.code, detail: error.message }, { status, headers: NO_STORE });
    }

    throw error;
  }
}

/** Queue depth. Cheap, and the only way to see back pressure before hitting it. */
export async function loader({ context }: LoaderFunctionArgs) {
  return json(campaignQueueStats(getRuntimeEnv(context)), { headers: NO_STORE });
}
