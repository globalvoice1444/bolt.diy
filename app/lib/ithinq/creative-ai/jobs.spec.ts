import { describe, expect, it, vi } from 'vitest';
import {
  CampaignJobQueue,
  CampaignJobRejected,
  campaignJobId,
  isCampaignJobId,
  MAX_BRIEF_LENGTH,
  normaliseJobInput,
  type CampaignJobInput,
} from './jobs';

/** A runner whose settlement the test controls. */
function controllable() {
  const calls: CampaignJobInput[] = [];
  const gates: Array<{ resolve: (value: string) => void; reject: (error: Error) => void }> = [];

  const run = (input: CampaignJobInput) => {
    calls.push(input);

    return new Promise<string>((resolve, reject) => {
      gates.push({ resolve, reject });
    });
  };

  return { calls, gates, run };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('campaign job identity', () => {
  it('addresses a job by its content, so the same request is one job', () => {
    const id = campaignJobId({ brief: 'sell to med spas', specId: 'med-spa' });

    expect(id).toBe(campaignJobId({ brief: 'sell to med spas', specId: 'med-spa' }));
    expect(id).not.toBe(campaignJobId({ brief: 'sell to med spas', specId: 'hvac' }));
    expect(isCampaignJobId(id)).toBe(true);
  });

  it('rejects an id shape that is not a digest', () => {
    expect(isCampaignJobId('../../package.json')).toBe(false);
    expect(isCampaignJobId('not-hex')).toBe(false);
    expect(isCampaignJobId('')).toBe(false);
  });

  it('refuses input that would reach a paid model for nothing', () => {
    expect(() => normaliseJobInput('', 'med-spa')).toThrow(CampaignJobRejected);
    expect(() => normaliseJobInput('   ', 'med-spa')).toThrow(CampaignJobRejected);
    expect(() => normaliseJobInput(null, 'med-spa')).toThrow(CampaignJobRejected);
    expect(() => normaliseJobInput('x'.repeat(MAX_BRIEF_LENGTH + 1), 'med-spa')).toThrow(CampaignJobRejected);
    expect(normaliseJobInput('  a brief  ', 'med-spa')).toEqual({ brief: 'a brief', specId: 'med-spa' });
  });
});

describe('campaign job queue', () => {
  it('runs a job off the request thread and reports the result', async () => {
    const { gates, run } = controllable();
    const queue = new CampaignJobQueue<string>({ run });

    const { record, deduplicated } = queue.submit({ brief: 'a', specId: 'med-spa' });

    expect(deduplicated).toBe(false);
    expect(record.status).toBe('running');

    gates[0]!.resolve('a campaign');
    await settle();

    expect(record.status).toBe('succeeded');
    expect(record.result).toBe('a campaign');
    expect(record.finishedAt).not.toBeNull();
  });

  it('reuses an identical in-flight request rather than paying the model twice', async () => {
    const { calls, gates, run } = controllable();
    const queue = new CampaignJobQueue<string>({ run });

    const first = queue.submit({ brief: 'a', specId: 'med-spa' });
    const second = queue.submit({ brief: 'a', specId: 'med-spa' });

    expect(second.deduplicated).toBe(true);
    expect(second.record.id).toBe(first.record.id);
    expect(calls).toHaveLength(1);

    gates[0]!.resolve('once');
    await settle();

    // And a repeat after completion still reuses the finished run.
    expect(queue.submit({ brief: 'a', specId: 'med-spa' }).deduplicated).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('lets a caller deliberately ask the model for another pass', async () => {
    const { calls, run } = controllable();
    const queue = new CampaignJobQueue<string>({ run });

    const first = queue.submit({ brief: 'a', specId: 'med-spa' });
    const again = queue.submit({ brief: 'a', specId: 'med-spa' }, { fresh: true });

    expect(again.deduplicated).toBe(false);
    expect(again.record.id).not.toBe(first.record.id);
    expect(calls).toHaveLength(2);
  });

  it('never runs more pipelines at once than the spend cap allows', async () => {
    const { calls, gates, run } = controllable();
    const queue = new CampaignJobQueue<string>({ run, concurrency: 1 });

    queue.submit({ brief: 'a', specId: 'med-spa' });

    const waiting = queue.submit({ brief: 'b', specId: 'med-spa' });

    expect(calls).toHaveLength(1);
    expect(waiting.record.status).toBe('queued');
    expect(queue.stats()).toMatchObject({ active: 1, queued: 1 });

    gates[0]!.resolve('first');
    await settle();

    expect(calls).toHaveLength(2);
    expect(waiting.record.status).toBe('running');
  });

  it('applies back pressure instead of queueing without limit', () => {
    const { run } = controllable();
    const queue = new CampaignJobQueue<string>({ run, concurrency: 1, maxQueued: 1 });

    queue.submit({ brief: 'a', specId: 'med-spa' });
    queue.submit({ brief: 'b', specId: 'med-spa' });

    expect(() => queue.submit({ brief: 'c', specId: 'med-spa' })).toThrow(
      expect.objectContaining({ code: 'queue_full' }),
    );
  });

  it('records a failed run without taking the queue down with it', async () => {
    const { gates, run } = controllable();
    const queue = new CampaignJobQueue<string>({ run, concurrency: 1 });

    const failing = queue.submit({ brief: 'a', specId: 'med-spa' });
    const next = queue.submit({ brief: 'b', specId: 'med-spa' });

    gates[0]!.reject(new Error('the model refused'));
    await settle();

    expect(failing.record.status).toBe('failed');
    expect(failing.record.failure).toEqual({ code: 'job_failed', detail: 'the model refused' });

    // The slot was released, so the queue kept moving.
    expect(next.record.status).toBe('running');
  });

  it('a runner that throws synchronously is a failed job, not a crash', async () => {
    const queue = new CampaignJobQueue<string>({
      run: () => {
        throw new Error('bad wiring');
      },
    });

    const { record } = queue.submit({ brief: 'a', specId: 'med-spa' });
    await settle();

    expect(record.status).toBe('failed');
    expect(record.failure?.detail).toBe('bad wiring');
  });

  it('reports a job that outran its deadline but keeps its slot until it settles', async () => {
    vi.useFakeTimers();

    try {
      const { gates, run } = controllable();
      const queue = new CampaignJobQueue<string>({ run, concurrency: 1, jobTimeoutMs: 1000 });

      const timing = queue.submit({ brief: 'a', specId: 'med-spa' });
      const behind = queue.submit({ brief: 'b', specId: 'med-spa' });

      await vi.advanceTimersByTimeAsync(1001);

      expect(timing.record.status).toBe('failed');
      expect(timing.record.failure?.detail).toMatch(/exceeded 1000ms/);

      /*
       * The point of the design: the pipeline is still holding an OpenAI
       * request, so the slot is NOT handed to the next job yet.
       */
      expect(behind.record.status).toBe('queued');

      gates[0]!.resolve('late');
      await vi.advanceTimersByTimeAsync(0);

      expect(behind.record.status).toBe('running');

      // A late result does not overwrite the reported failure.
      expect(timing.record.status).toBe('failed');
      expect(timing.record.result).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('forgets finished runs so a long-lived process does not grow without bound', async () => {
    let now = 1_000_000;
    const { gates, run } = controllable();
    const queue = new CampaignJobQueue<string>({ run, resultTtlMs: 5000, now: () => now });

    const { record } = queue.submit({ brief: 'a', specId: 'med-spa' });
    gates[0]!.resolve('done');
    await settle();

    expect(queue.get(record.id)).not.toBeNull();

    now += 6000;
    queue.sweep();

    expect(queue.get(record.id)).toBeNull();
    expect(queue.stats().records).toBe(0);
  });

  it('trims the oldest finished runs when the record cap is exceeded', async () => {
    let now = 1_000_000;
    const { gates, run } = controllable();
    const queue = new CampaignJobQueue<string>({ run, concurrency: 4, maxRecords: 2, now: () => now });

    const records = ['a', 'b', 'c'].map((brief) => queue.submit({ brief, specId: 'med-spa' }).record);

    for (const gate of gates) {
      gate.resolve('done');
      await settle();
      now += 1000;
    }

    queue.sweep();

    expect(queue.stats().records).toBe(2);
    expect(queue.get(records[0]!.id)).toBeNull();
    expect(queue.get(records[2]!.id)).not.toBeNull();
  });

  it('does not lose a job whose id was never a digest', () => {
    const { run } = controllable();
    const queue = new CampaignJobQueue<string>({ run });

    expect(queue.get('../../etc/passwd')).toBeNull();
  });
});
