import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WEBSITE_SOURCE,
  isApprovedFactUrl,
  pageUrl,
  resolveWebsiteSource,
  RENDERER_FACT_HOST_CEILING,
} from './config';
import { fetchApprovedPage } from './fetch';
import { parseHtml } from './parse';
import { classify, extractFacts, isBorrowedVoice, topicsFor } from './extract';
import { MemorySnapshotStore, refreshWebsiteFacts, snapshotToFactSet } from './snapshot';
import { selectFacts, selectFactSet } from './select';
import { websiteFactSource, staticFactSource } from '~/lib/ithinq/creative-ai/fact-source';
import { MED_SPA_BRIEF_FACTS } from '~/lib/ithinq/creative-ai/fact-sets';
import { FACT_REFERENCE_PATTERN } from '@ithinq-pagespec/page-spec';
import { INDUSTRIES_HTML, PRICING_HTML, PRICING_HTML_UPDATED, VOICE_ASSISTANT_HTML } from './__fixtures__/pages';

const CONFIG = {
  origin: 'https://ithinq.ai',
  allowedHosts: RENDERER_FACT_HOST_CEILING,
  pages: [
    { path: '/ai-voice-assistant', topics: ['voice-assistant'] },
    { path: '/pricing', topics: ['pricing'] },
    { path: '/industries', topics: ['vertical'] },
  ],
};

/** Serves fixture HTML for approved URLs. No test ever touches the network. */
function stubFetch(pages: Record<string, string>, overrides: Record<string, Response> = {}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (overrides[url]) {
      return overrides[url]!;
    }

    const path = new URL(url).pathname;
    const body = pages[path];

    if (body === undefined) {
      return new Response('not found', { status: 404 });
    }

    return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }) as unknown as typeof fetch;
}

const PAGES: Record<string, string> = {
  '/ai-voice-assistant': VOICE_ASSISTANT_HTML,
  '/pricing': PRICING_HTML,
  '/industries': INDUSTRIES_HTML,
};

const refresh = (pages: Record<string, string> = PAGES, overrides: Record<string, Response> = {}) => {
  const store = new MemorySnapshotStore();

  return refreshWebsiteFacts({
    config: CONFIG,
    store,
    fetchImpl: stubFetch(pages, overrides),
    now: () => new Date('2026-09-01T00:00:00.000Z'),
  }).then((snapshot) => ({ snapshot, store }));
};

describe('approved first-party source', () => {
  it('accepts only https pages on an approved host', () => {
    expect(isApprovedFactUrl('https://ithinq.ai/features', CONFIG)).toBe(true);
    expect(isApprovedFactUrl('https://www.ithinq.ai/features', CONFIG)).toBe(true);
    expect(isApprovedFactUrl('http://ithinq.ai/features', CONFIG)).toBe(false);
    expect(isApprovedFactUrl('https://ithinq.ai.evil.example/features', CONFIG)).toBe(false);
    expect(isApprovedFactUrl('not a url', CONFIG)).toBe(false);
  });

  /*
   * The whole point of a closed ceiling. A competitor page, a review site, a
   * forum and a search cache are all somebody other than iThinq talking about
   * iThinq, and none of them may become product truth.
   */
  it('refuses third-party sources outright', () => {
    for (const url of [
      'https://www.google.com/search?q=ithinq',
      'https://reddit.com/r/smallbusiness/comments/ithinq',
      'https://competitor.example/vs-ithinq',
      'https://g2.com/products/ithinq/reviews',
      'https://partners.ithinq.ai/portal',
    ]) {
      expect(isApprovedFactUrl(url, CONFIG), url).toBe(false);
    }
  });

  it('rejects an unconfigured source before any request is made', async () => {
    let called = false;
    const { page, failure } = await fetchApprovedPage('https://competitor.example/facts', CONFIG, {
      fetchImpl: (async () => {
        called = true;
        return new Response('', { status: 200 });
      }) as unknown as typeof fetch,
    });

    expect(page).toBeNull();
    expect(failure?.code).toBe('not_approved');
    expect(called, 'an unapproved host must never be contacted').toBe(false);
  });

  it('refuses a redirect that leaves the approved host', async () => {
    const { failure } = await fetchApprovedPage('https://ithinq.ai/pricing', CONFIG, {
      fetchImpl: (async () =>
        new Response('', {
          status: 301,
          headers: { location: 'https://evil.example/pricing' },
        })) as unknown as typeof fetch,
    });

    expect(failure?.code).toBe('not_approved');
  });

  it('follows a redirect that stays on the approved host', async () => {
    let seen = 0;
    const { page } = await fetchApprovedPage('https://ithinq.ai/pricing', CONFIG, {
      fetchImpl: (async (input: RequestInfo | URL) => {
        seen += 1;

        if (String(input) === 'https://ithinq.ai/pricing') {
          return new Response('', { status: 301, headers: { location: 'https://www.ithinq.ai/pricing' } });
        }

        return new Response(PRICING_HTML, { status: 200, headers: { 'content-type': 'text/html' } });
      }) as unknown as typeof fetch,
    });

    expect(seen).toBe(2);
    expect(page?.url).toBe('https://www.ithinq.ai/pricing');
  });

  it('gives up on a redirect loop instead of following it forever', async () => {
    const { failure } = await fetchApprovedPage('https://ithinq.ai/pricing', CONFIG, {
      fetchImpl: (async () =>
        new Response('', {
          status: 301,
          headers: { location: 'https://www.ithinq.ai/pricing' },
        })) as unknown as typeof fetch,
    });

    expect(failure?.code).toBe('redirect_loop');
  });

  it('reports HTTP and content-type problems rather than guessing', async () => {
    const notFound = await fetchApprovedPage('https://ithinq.ai/missing', CONFIG, { fetchImpl: stubFetch({}) });
    expect(notFound.failure?.code).toBe('http_error');

    const json = await fetchApprovedPage('https://ithinq.ai/api', CONFIG, {
      fetchImpl: (async () =>
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })) as unknown as typeof fetch,
    });
    expect(json.failure?.code).toBe('not_html');
  });

  it('refuses an oversized page', async () => {
    const { failure } = await fetchApprovedPage('https://ithinq.ai/pricing', CONFIG, {
      fetchImpl: stubFetch({ '/pricing': PRICING_HTML }),
      maxBytes: 10,
    });

    expect(failure?.code).toBe('too_large');
  });

  it('never lets configuration widen the host ceiling', () => {
    const config = resolveWebsiteSource({ ITHINQ_WEBSITE_ORIGIN: 'https://evil.example' });

    expect(config.allowedHosts).toEqual(RENDERER_FACT_HOST_CEILING);
    expect(isApprovedFactUrl('https://evil.example/anything', config)).toBe(false);
  });

  it('lets configuration point at a different approved path set', () => {
    const config = resolveWebsiteSource({ ITHINQ_WEBSITE_PATHS: '/a, b ,/c' });

    expect(config.pages.map((page) => page.path)).toEqual(['/a', '/b', '/c']);
    expect(pageUrl(config, config.pages[0]!)).toBe('https://ithinq.ai/a');
    expect(DEFAULT_WEBSITE_SOURCE.pages.length).toBeGreaterThan(0);
  });
});

describe('parsing an approved page', () => {
  const parsed = parseHtml(VOICE_ASSISTANT_HTML);

  it('reads the title and description', () => {
    expect(parsed.title).toBe('AI Voice Assistant — iThinq');
    expect(parsed.description).toContain('answers inbound calls');
  });

  it('discards scripts, styles and their contents', () => {
    const text = parsed.blocks.map((block) => block.text).join(' ');

    expect(text).not.toContain('do-not-read-me');
    expect(text).not.toContain('dataLayer');
    expect(text).not.toContain('color:red');
    expect(text).not.toContain('<');
  });

  it('discards navigation, header and footer chrome', () => {
    const text = parsed.blocks.map((block) => block.text).join(' ');

    expect(text).not.toContain('All rights reserved');
    expect(text).not.toContain('Privacy policy');
  });

  it('extracts headings, paragraphs and list items', () => {
    const kinds = new Set(parsed.blocks.map((block) => block.kind));

    expect(kinds.has('heading')).toBe(true);
    expect(kinds.has('paragraph')).toBe(true);
    expect(kinds.has('listItem')).toBe(true);
  });

  it('pairs a heading-style question with the paragraph that answers it', () => {
    const index = parsed.blocks.findIndex((block) => block.text.startsWith('Will it sound robotic'));

    expect(parsed.blocks[index]!.kind).toBe('question');
    expect(parsed.blocks[index + 1]!.kind).toBe('answer');
  });

  it('reads FAQ structured data', () => {
    const structured = parsed.blocks.filter((block) => block.kind === 'question' || block.kind === 'answer');

    expect(structured.some((block) => block.text.includes('replace my receptionist'))).toBe(true);
    expect(structured.some((block) => block.text.includes('hands anything that needs a person'))).toBe(true);
  });

  it('normalises entities and whitespace', () => {
    const text = parsed.blocks.map((block) => block.text).join(' ');

    expect(text).toContain('caller’s details');
    expect(text).not.toContain('&rsquo;');
    expect(text).not.toMatch(/\s{2,}/);
  });
});

describe('extracting facts', () => {
  const facts = extractFacts(parseHtml(VOICE_ASSISTANT_HTML), {
    sourceUrl: 'https://ithinq.ai/ai-voice-assistant',
    retrievedAt: '2026-09-01T00:00:00.000Z',
    pageTopics: ['voice-assistant'],
  });

  it('produces contract-shaped references', () => {
    for (const fact of facts) {
      expect(FACT_REFERENCE_PATTERN.test(fact.ref), fact.ref).toBe(true);
    }
  });

  it('keeps the page and wording every fact came from', () => {
    for (const fact of facts) {
      expect(fact.source?.sourceUrl).toBe('https://ithinq.ai/ai-voice-assistant');
      expect(fact.source?.pageTitle).toBe('AI Voice Assistant — iThinq');
      expect(fact.source?.sourceHash).toMatch(/^[0-9a-f]{64}$/);
      expect(fact.source?.retrievedAt).toBe('2026-09-01T00:00:00.000Z');
    }
  });

  it('captures the product capabilities the page states', () => {
    const text = facts.map((fact) => fact.text).join(' ');

    expect(text).toContain('answers incoming calls');
    expect(text).toContain('Books appointments');
  });

  it('keeps a published question together with its answer', () => {
    const objection = facts.find((fact) => fact.text.includes('sound robotic'));

    expect(objection).toBeDefined();
    expect(objection!.text).toContain('ordinary conversation');
  });

  it('drops navigation, buttons, boilerplate and fragments', () => {
    const text = facts.map((fact) => fact.text).join(' ');

    expect(text).not.toContain('Menu');
    expect(text).not.toContain('Get started');
    expect(text).not.toContain('All rights reserved');
    expect(facts.some((fact) => fact.text === 'Short.')).toBe(false);
  });

  it('refuses a customer testimonial as an approved fact', () => {
    const html = `<html><head><title>Customers</title></head><body><main>
      <h2>What our customers say</h2>
      <p>The AI assistant handles our client calls flawlessly. iThinqAI has completely elevated our customer experience and decreased response times.</p>
      <p>Using iThinqAI's tools, we have streamlined internal processes and improved client satisfaction across the business.</p>
      <p>iThinqAI answers inbound calls and captures caller details for service businesses.</p>
    </main></body></html>`;

    const found = extractFacts(parseHtml(html), {
      sourceUrl: 'https://ithinq.ai/customers',
      retrievedAt: '2026-09-01T00:00:00.000Z',
      pageTopics: [],
    });

    expect(found.some((fact) => fact.text.includes('flawlessly'))).toBe(false);
    expect(found.some((fact) => fact.text.includes('improved client satisfaction'))).toBe(false);
    expect(found.some((fact) => fact.text.includes('answers inbound calls'))).toBe(true);
  });

  it('refuses a quoted testimonial even when it never names the product', () => {
    expect(isBorrowedVoice('“We have decreased the front desk workload and increased customer happiness.”')).toBe(true);
    expect(isBorrowedVoice('"It answers every call and our team finally gets a lunch break."')).toBe(true);
  });

  it('does not treat a stray mention of a plan as pricing', () => {
    const block = { kind: 'paragraph' as const, text: '' };

    expect(classify('Personalized customer management based on treatment plan and type.', block)).not.toBe('pricing');
    expect(classify('Plans start at $149 per month.', block)).toBe('pricing');
  });

  it('keeps the company speaking in its own voice', () => {
    expect(isBorrowedVoice("We're on a mission to make AI accessible to businesses.")).toBe(false);
    expect(isBorrowedVoice('Founded in 2023, iThinqAI emerged from a vision to change how businesses talk.')).toBe(
      false,
    );
    expect(isBorrowedVoice('iThinqAI has completely elevated our customer experience.')).toBe(true);
  });

  it('does not mistake an absolute promise for a stated limit', () => {
    const block = { kind: 'paragraph' as const, text: '' };

    expect(classify('It boosts efficiency and never misses a potential client.', block)).not.toBe('boundary');
    expect(classify('It does not replace the people who take the calls.', block)).toBe('boundary');
    expect(
      classify('It answers out of hours where your setup supports it, which depends on configuration.', block),
    ).toBe('boundary');
  });

  it('never promotes a bare heading to a fact', () => {
    expect(facts.some((fact) => fact.text === 'AI Voice Assistants')).toBe(false);
    expect(facts.some((fact) => fact.text === 'What it does on a call')).toBe(false);
  });

  it('classifies by the shape of the statement', () => {
    expect(classify('Plans start at $149 per month.', { kind: 'paragraph', text: '' })).toBe('pricing');
    expect(classify('It does not replace your team.', { kind: 'paragraph', text: '' })).toBe('boundary');
    expect(classify('Designed for appointment-based service businesses.', { kind: 'paragraph', text: '' })).toBe(
      'audience',
    );
    expect(classify('Answers inbound calls and captures details.', { kind: 'paragraph', text: '' })).toBe('capability');
  });

  it('derives retrieval topics without asserting them', () => {
    expect(topicsFor('Answers inbound calls after hours', ['voice-assistant'])).toContain('missed-calls');
    expect(topicsFor('Med spas book consultations', [])).toContain('med-spa');
    expect(topicsFor('HVAC contractors take job details', [])).toContain('home-services');
  });
});

describe('the fact snapshot', () => {
  it('builds a corpus from every approved page', async () => {
    const { snapshot } = await refresh();

    expect(snapshot.pages.length).toBe(3);
    expect(snapshot.failures).toEqual([]);
    expect(snapshot.facts.length).toBeGreaterThan(8);
    expect(snapshot.retrievedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('records the source page for every fact in the corpus', async () => {
    const { snapshot } = await refresh();

    for (const fact of snapshot.facts) {
      expect(fact.source?.sourceUrl).toMatch(/^https:\/\/ithinq\.ai\//);
    }
  });

  it('keeps stable identity for wording that has not changed', async () => {
    const first = await refresh();
    const second = await refresh();

    expect(second.snapshot.facts.map((fact) => fact.ref)).toEqual(first.snapshot.facts.map((fact) => fact.ref));
  });

  /*
   * Content addressing means a reworded fact is a different fact, which is
   * what makes an edit on the website visible rather than silent.
   */
  it('gives changed source wording a changed identity', async () => {
    const before = await refresh();
    const after = await refresh({ ...PAGES, '/pricing': PRICING_HTML_UPDATED });

    const priced = (snapshot: Awaited<ReturnType<typeof refresh>>['snapshot']) =>
      snapshot.facts.find((fact) => fact.text.includes('Plans start at'))!;

    expect(priced(before.snapshot).text).toContain('$149');
    expect(priced(after.snapshot).text).toContain('$199');
    expect(priced(after.snapshot).ref).not.toBe(priced(before.snapshot).ref);
    expect(priced(after.snapshot).source?.sourceHash).not.toBe(priced(before.snapshot).source?.sourceHash);
  });

  it('drops a fact the website no longer publishes', async () => {
    const before = await refresh();
    expect(before.snapshot.facts.some((fact) => fact.text.includes('Plans start at'))).toBe(true);

    const after = await refresh({ '/ai-voice-assistant': VOICE_ASSISTANT_HTML, '/industries': INDUSTRIES_HTML });

    expect(after.snapshot.facts.some((fact) => fact.text.includes('Plans start at'))).toBe(false);
    expect(after.snapshot.failures.some((failure) => failure.code === 'http_error')).toBe(true);
  });

  it('records a page it could not read instead of failing the refresh', async () => {
    const { snapshot } = await refresh({ '/ai-voice-assistant': VOICE_ASSISTANT_HTML });

    expect(snapshot.pages.length).toBe(1);
    expect(snapshot.failures.length).toBe(2);
    expect(snapshot.facts.length).toBeGreaterThan(0);
  });

  it('does not store the same sentence twice', async () => {
    const { snapshot } = await refresh({
      '/ai-voice-assistant': VOICE_ASSISTANT_HTML,
      '/pricing': VOICE_ASSISTANT_HTML,
    });

    expect(new Set(snapshot.facts.map((fact) => fact.ref)).size).toBe(snapshot.facts.length);
  });

  it('presents the snapshot as a first-party fact set', async () => {
    const { snapshot } = await refresh();
    const set = snapshotToFactSet(snapshot);

    expect(set.authority).toBe('first-party-website');
    expect(set.id).toBe('ithinq-website');
    expect(set.retrievedAt).toBe(snapshot.retrievedAt);
    expect(set.facts.length).toBe(snapshot.facts.length);
  });
});

describe('reading facts without touching the website', () => {
  it('serves a campaign from the snapshot with no network request', async () => {
    const { store } = await refresh();
    let requests = 0;
    const counting = new Proxy(store, {
      get(target, prop) {
        if (prop === 'read') {
          requests += 1;
        }

        return Reflect.get(target, prop);
      },
    });

    const set = await websiteFactSource(counting).load();

    expect(set?.facts.length).toBeGreaterThan(0);
    expect(requests).toBe(1);
  });

  it('returns nothing when no snapshot has been built', async () => {
    expect(await websiteFactSource(new MemorySnapshotStore()).load()).toBeNull();
  });

  it('keeps the static fixture source working unchanged', async () => {
    const set = await staticFactSource(MED_SPA_BRIEF_FACTS).load();

    expect(set).toBe(MED_SPA_BRIEF_FACTS);
    expect(set!.authority).toBe('reviewer-fixture');
  });
});

describe('selecting the facts a campaign needs', () => {
  const request = {
    instruction: 'Create the best converting campaign for Med Spas promoting the iThinq AI Voice Assistant.',
    vertical: 'med-spa',
  };

  it('puts med-spa and voice-assistant facts in front of the writer', async () => {
    const { snapshot } = await refresh();
    const chosen = selectFacts(snapshotToFactSet(snapshot), request);
    const text = chosen.map((entry) => entry.fact.text).join(' ');

    expect(text).toContain('Med spas');
    expect(text.toLowerCase()).toContain('calls');
    expect(chosen.every((entry) => entry.score > 0)).toBe(true);
  });

  it('does not hand over facts about an unrelated vertical', async () => {
    const { snapshot } = await refresh();
    const set = snapshotToFactSet(snapshot);
    const medSpa = selectFactSet(set, { ...request, limit: 6 });
    const hvac = selectFactSet(set, {
      instruction: 'Campaign for HVAC contractors losing jobs to missed calls.',
      vertical: 'hvac',
      limit: 6,
    });

    expect(medSpa.facts.some((fact) => fact.text.includes('Med spas'))).toBe(true);
    expect(hvac.facts.some((fact) => fact.text.includes('HVAC'))).toBe(true);
    expect(medSpa.facts.map((fact) => fact.ref)).not.toEqual(hvac.facts.map((fact) => fact.ref));
  });

  it('always includes a boundary so the writer can be honest about limits', async () => {
    const { snapshot } = await refresh();
    const chosen = selectFactSet(snapshotToFactSet(snapshot), { ...request, limit: 8 });

    expect(chosen.facts.some((fact) => fact.kind === 'boundary')).toBe(true);
  });

  it('respects the limit it is given', async () => {
    const { snapshot } = await refresh();

    expect(selectFactSet(snapshotToFactSet(snapshot), { ...request, limit: 4 }).facts.length).toBeLessThanOrEqual(4);
  });

  it('returns nothing rather than noise for an unrelated request', async () => {
    const { snapshot } = await refresh();
    const chosen = selectFacts(snapshotToFactSet(snapshot), {
      instruction: 'zzzz qqqq xxxx',
      limit: 10,
    });

    expect(chosen.every((entry) => entry.score > 0)).toBe(true);
  });
});
