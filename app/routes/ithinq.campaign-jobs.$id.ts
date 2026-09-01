import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { campaignJobs, campaignJobView } from '~/lib/ithinq/creative-ai/campaign-jobs';
import { getRuntimeEnv } from '~/lib/ithinq/runtime-env';

/**
 * Poll one campaign job.
 *
 * `no-store` matters more than it looks: a running job's representation changes
 * under the same URL, and a cached `queued` would strand the reader on a page
 * that never finishes.
 */
export async function loader({ params, context }: LoaderFunctionArgs) {
  const record = campaignJobs(getRuntimeEnv(context)).get(params.id ?? '');

  if (!record) {
    /*
     * Indistinguishable from a job that finished long enough ago to be swept.
     * That is intended: the queue keeps results for a while, not forever, and a
     * caller holding a stale id should resubmit rather than wait.
     */
    return json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  return json(campaignJobView(record), { headers: { 'Cache-Control': 'no-store' } });
}
