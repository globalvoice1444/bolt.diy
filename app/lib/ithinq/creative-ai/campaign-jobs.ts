import { runCampaign, type CampaignRun } from './campaign';
import { demoSpec } from './demo-specs';
import {
  CampaignJobQueue,
  normaliseJobInput,
  type CampaignJobInput,
  type CampaignJobRecord,
  type QueueStats,
} from './jobs';

/**
 * The campaign pipeline behind the job queue.
 *
 * Everything the engine does is unchanged — this only moves the call off the
 * request thread. `runCampaign` still resolves its own generators and its own
 * asset store from the environment, so a job writes to durable storage for
 * exactly the same reason a synchronous run would.
 */
export type CampaignJobResult = CampaignRun;

function readNumber(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const raw = (env[key] ?? (typeof process === 'undefined' ? undefined : process.env?.[key]))?.trim();
  const parsed = raw ? Number(raw) : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

let queue: CampaignJobQueue<CampaignJobResult> | null = null;

/**
 * The process-wide queue.
 *
 * Built on first use from the environment of the first request, which is safe
 * because server configuration does not vary between requests within a process
 * — the same assumption `resolveGenerator` already makes at every call.
 */
export function campaignJobs(env: Record<string, string | undefined> = {}): CampaignJobQueue<CampaignJobResult> {
  if (!queue) {
    queue = new CampaignJobQueue<CampaignJobResult>({
      run: async (input) => {
        const demo = demoSpec(input.specId);

        return runCampaign(demo.spec, { userInstruction: input.brief }, { env, factSet: demo.factSet });
      },

      /*
       * Two at a time. Each job is one gpt-4o interpretation, one authoring
       * pass, one claim audit and up to two gpt-image-1 renders, so the cap is
       * a spend and rate-limit boundary before it is a CPU one.
       */
      concurrency: readNumber(env, 'RENDERER_CAMPAIGN_CONCURRENCY', 2),
      maxQueued: readNumber(env, 'RENDERER_CAMPAIGN_QUEUE_LIMIT', 8),
      jobTimeoutMs: readNumber(env, 'RENDERER_CAMPAIGN_TIMEOUT_MS', 300_000),
      resultTtlMs: readNumber(env, 'RENDERER_CAMPAIGN_RESULT_TTL_MS', 1_800_000),
    });
  }

  return queue;
}

/** Test seam. Never called by a route. */
export function resetCampaignJobs(): void {
  queue = null;
}

/**
 * Submit, resolving the document first.
 *
 * The canonical demo id — not whatever the caller typed — is what gets content
 * addressed, so `?spec=` absent and `?spec=med-spa-brief` are one job rather
 * than two identical model bills.
 */
export function submitCampaignJob(
  env: Record<string, string | undefined>,
  brief: unknown,
  specId: unknown,
  options: { fresh?: boolean } = {},
): { record: CampaignJobRecord<CampaignJobResult>; deduplicated: boolean } {
  const input = normaliseJobInput(brief, specId);

  return campaignJobs(env).submit({ brief: input.brief, specId: demoSpec(input.specId).id }, options);
}

export function campaignQueueStats(env: Record<string, string | undefined>): QueueStats {
  return campaignJobs(env).stats();
}

/**
 * What a finished run looks like to the reviewer surface.
 *
 * The same fields the studio loader used to compute synchronously. A
 * `CampaignRun` holds megabytes of fact text and provider detail; this is the
 * part a reviewer reads, and keeping the mapping here means the polling route
 * has no opinion about it.
 */
export function campaignRunSummary(run: CampaignRun) {
  return {
    modelInterpreted: run.request.modelInterpreted,
    textModel: run.textModel,
    imageModel: run.imageModel,
    syntheticImages: run.syntheticImages,
    angle: run.request.angle,
    strategy: run.strategy,
    factSet: {
      id: run.factSet.id,
      subject: run.factSet.subject,
      authority: run.factSet.authority,
      facts: run.factSet.facts.map((fact) => ({ ref: fact.ref, kind: fact.kind, text: fact.text })),
    },
    factsAvailable: run.factsAvailable,
    factsSelected: run.factsSelected,
    coverage: run.coverage,
    copy: {
      generated: run.copy.generated,
      audited: run.copy.audited,
      accepted: run.copy.accepted,
      rejected: run.copy.rejected,
      plan: run.copy.plan,
      overlay: run.copy.overlay,
      findings: run.copy.findings,
    },
    needs: run.needs.map((need) => ({ id: need.id, role: need.role, aspectRatio: need.aspectRatio })),
    assets: run.assets.map((asset) => ({ assetNeedId: asset.assetNeedId, url: asset.url, alt: asset.alt })),
    failures: run.failures.filter((failure) => failure.stage === 'image'),
  };
}

export type CampaignRunSummary = ReturnType<typeof campaignRunSummary>;

export interface CampaignJobView {
  id: string;
  status: CampaignJobRecord<CampaignJobResult>['status'];
  input: CampaignJobInput;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  failure: { code: string; detail: string } | null;
  statusUrl: string;
  previewUrl: string | null;
  result: CampaignRunSummary | null;
}

/** The wire shape. A record is mutable process state; a view is a snapshot. */
export function campaignJobView(record: CampaignJobRecord<CampaignJobResult>): CampaignJobView {
  const succeeded = record.status === 'succeeded' && record.result !== null;

  return {
    id: record.id,
    status: record.status,
    input: record.input,
    queuedAt: record.queuedAt,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    failure: record.failure,
    statusUrl: `/ithinq/campaign-jobs/${record.id}`,
    previewUrl: succeeded ? `/ithinq/campaign-preview?job=${record.id}` : null,
    result: succeeded ? campaignRunSummary(record.result!) : null,
  };
}
