import { createHash, randomUUID } from 'node:crypto';

/**
 * A bounded, in-process queue for work too slow to hold a request open.
 *
 * A campaign takes 77-120 seconds: a model reads the brief, a second pass
 * authors copy against approved facts, a third audits the claims, then imagery
 * is generated. That is fine work and terrible HTTP. Holding a connection open
 * for two minutes with zero bytes written puts the whole surface at the mercy
 * of every proxy idle timeout between the reader and the process, and gives the
 * reader no way to tell "still writing" from "hung".
 *
 * So: submit, poll, render. This file is only the mechanics — the runner is
 * injected, so nothing here knows what a campaign is and the queue can be
 * tested without a model. `campaign-jobs.ts` does the wiring.
 *
 * SCOPE, stated plainly: records live in this process. One Render web service
 * is one process, so this is complete for the deployment that exists. It is not
 * complete for two instances, where a poll can land on the instance that did
 * not run the job. That needs a shared record store behind this same submit/get
 * shape — the durable part of a campaign (its imagery) is already shared via
 * `AssetStore`, so a second instance would only need the record.
 */
export type CampaignJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface CampaignJobInput {
  brief: string;
  specId: string;
}

export interface CampaignJobFailure {
  code: string;
  detail: string;
}

export interface CampaignJobRecord<TResult> {
  id: string;
  status: CampaignJobStatus;
  input: CampaignJobInput;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  failure: CampaignJobFailure | null;
  result: TResult | null;
}

/** A submission the queue refuses outright, as opposed to a job that fails. */
export class CampaignJobRejected extends Error {
  constructor(
    message: string,
    readonly code: 'queue_full' | 'invalid_input',
  ) {
    super(message);
    this.name = 'CampaignJobRejected';
  }
}

/**
 * Job ids are content-addressed, exactly like asset ids.
 *
 * Two readers asking the same question of the same document get one job and one
 * model bill rather than two. `fresh` opts out for a reader who deliberately
 * wants the model to take another swing — interpretation runs at temperature
 * 0.4, so a re-run is a genuinely different campaign, not a retry.
 */
export function campaignJobId(input: CampaignJobInput): string {
  return createHash('sha256').update(`${input.specId}\n${input.brief}`).digest('hex').slice(0, 32);
}

export function isCampaignJobId(id: string): boolean {
  return /^[0-9a-f]{32}$/.test(id);
}

/** Longer than any real brief; a model bill should not be reachable by paste. */
export const MAX_BRIEF_LENGTH = 2000;

export function normaliseJobInput(brief: unknown, specId: unknown): CampaignJobInput {
  if (typeof brief !== 'string' || brief.trim().length === 0) {
    throw new CampaignJobRejected('A campaign request must be a non-empty string.', 'invalid_input');
  }

  const trimmed = brief.trim();

  if (trimmed.length > MAX_BRIEF_LENGTH) {
    throw new CampaignJobRejected(`A campaign request may be at most ${MAX_BRIEF_LENGTH} characters.`, 'invalid_input');
  }

  return { brief: trimmed, specId: typeof specId === 'string' && specId ? specId : '' };
}

export interface CampaignJobQueueOptions<TResult> {
  run: (input: CampaignJobInput) => Promise<TResult>;

  /** Concurrent model pipelines. Each one is real spend and real rate limit. */
  concurrency?: number;

  /** Submissions waiting for a slot before the queue starts refusing. */
  maxQueued?: number;
  jobTimeoutMs?: number;

  /** How long a finished record stays pollable and reusable. */
  resultTtlMs?: number;
  maxRecords?: number;
  now?: () => number;
}

export interface QueueStats {
  active: number;
  queued: number;
  records: number;
  concurrency: number;
  maxQueued: number;
}

export class CampaignJobQueue<TResult> {
  private readonly _run: (input: CampaignJobInput) => Promise<TResult>;
  private readonly _concurrency: number;
  private readonly _maxQueued: number;
  private readonly _jobTimeoutMs: number;
  private readonly _resultTtlMs: number;
  private readonly _maxRecords: number;
  private readonly _now: () => number;

  private readonly _records = new Map<string, CampaignJobRecord<TResult>>();
  private readonly _pending: string[] = [];
  private _active = 0;

  constructor(options: CampaignJobQueueOptions<TResult>) {
    this._run = options.run;
    this._concurrency = Math.max(1, options.concurrency ?? 2);
    this._maxQueued = Math.max(1, options.maxQueued ?? 8);
    this._jobTimeoutMs = options.jobTimeoutMs ?? 300_000;
    this._resultTtlMs = options.resultTtlMs ?? 1_800_000;
    this._maxRecords = Math.max(1, options.maxRecords ?? 50);
    this._now = options.now ?? Date.now;
  }

  submit(
    input: CampaignJobInput,
    options: { fresh?: boolean } = {},
  ): {
    record: CampaignJobRecord<TResult>;
    deduplicated: boolean;
  } {
    this.sweep();

    if (!options.fresh) {
      const existing = this._records.get(campaignJobId(input));

      if (existing) {
        return { record: existing, deduplicated: true };
      }
    }

    if (this._pending.length >= this._maxQueued) {
      throw new CampaignJobRejected(
        `The renderer is already holding ${this._maxQueued} queued campaigns. Retry shortly.`,
        'queue_full',
      );
    }

    /*
     * A fresh run must not collide with the cached one it is meant to bypass,
     * so it gets an id no content addressing would ever produce.
     */
    const id = options.fresh
      ? createHash('sha256').update(`${randomUUID()}\n${input.specId}\n${input.brief}`).digest('hex').slice(0, 32)
      : campaignJobId(input);

    const record: CampaignJobRecord<TResult> = {
      id,
      status: 'queued',
      input,
      queuedAt: new Date(this._now()).toISOString(),
      startedAt: null,
      finishedAt: null,
      failure: null,
      result: null,
    };

    this._records.set(id, record);
    this._pending.push(id);
    this._pump();

    return { record, deduplicated: false };
  }

  get(id: string): CampaignJobRecord<TResult> | null {
    return isCampaignJobId(id) ? (this._records.get(id) ?? null) : null;
  }

  stats(): QueueStats {
    return {
      active: this._active,
      queued: this._pending.length,
      records: this._records.size,
      concurrency: this._concurrency,
      maxQueued: this._maxQueued,
    };
  }

  /** Drop finished records past their TTL, then trim the oldest if still over. */
  sweep(): void {
    const now = this._now();

    for (const [id, record] of this._records) {
      const finishedAt = record.finishedAt ? Date.parse(record.finishedAt) : null;

      if (finishedAt !== null && now - finishedAt > this._resultTtlMs) {
        this._records.delete(id);
      }
    }

    if (this._records.size <= this._maxRecords) {
      return;
    }

    const terminal = [...this._records.values()]
      .filter((record) => record.status === 'succeeded' || record.status === 'failed')
      .sort((left, right) => Date.parse(left.finishedAt!) - Date.parse(right.finishedAt!));

    for (const record of terminal) {
      if (this._records.size <= this._maxRecords) {
        break;
      }

      this._records.delete(record.id);
    }
  }

  private _pump(): void {
    while (this._active < this._concurrency && this._pending.length > 0) {
      const id = this._pending.shift()!;
      const record = this._records.get(id);

      if (!record || record.status !== 'queued') {
        continue;
      }

      this._active += 1;
      this._start(record);
    }
  }

  private _start(record: CampaignJobRecord<TResult>): void {
    record.status = 'running';
    record.startedAt = new Date(this._now()).toISOString();

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (status: 'succeeded' | 'failed', result: TResult | null, failure: CampaignJobFailure | null) => {
      if (settled) {
        return;
      }

      settled = true;
      record.status = status;
      record.result = result;
      record.failure = failure;
      record.finishedAt = new Date(this._now()).toISOString();
    };

    // Wrapped so a runner that throws synchronously still becomes a rejection.
    const work = (async () => this._run(record.input))();

    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Campaign job exceeded ${this._jobTimeoutMs}ms.`)), this._jobTimeoutMs);
    });

    Promise.race([work, deadline]).then(
      (result) => finish('succeeded', result, null),
      (error: unknown) =>
        finish('failed', null, {
          code: error instanceof CampaignJobRejected ? error.code : 'job_failed',
          detail: error instanceof Error ? error.message : 'The campaign run failed.',
        }),
    );

    /*
     * The slot is released when the WORK settles, not when the record does. A
     * job that outlives its deadline is already reported as failed, but its
     * pipeline is still holding an OpenAI request; freeing the slot early would
     * let concurrency drift above the cap that bounds spend. The real bound on
     * a hang is the per-call timeout inside each provider — this deadline is a
     * backstop for the sum of them.
     */
    work
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        this._active -= 1;
        this._pump();
      });
  }
}
