#!/usr/bin/env node
/**
 * Rebuild the approved-fact snapshot from the iThinq website.
 *
 *   pnpm ithinq:refresh-facts
 *
 * Reads the configured first-party pages, extracts the facts they authorise
 * and writes `.data/ithinq-facts/website-snapshot.json`. Campaign generation
 * reads that file, so the site changing and the system knowing about it are
 * two separate, deliberate events.
 *
 * Prints a summary — pages, counts, categories — never page content, and never
 * configuration values that could carry a secret.
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createRenderedFetch } from './lib/rendered-fetch.mjs';

async function loadModule() {
  /*
   * The library is TypeScript with path aliases, so it is loaded through the
   * project's own Vite pipeline rather than reimplemented here in JavaScript.
   */
  const { createServer } = await import('vite');
  const server = await createServer({
    configFile: false,
    logLevel: 'error',
    server: { middlewareMode: true },
    plugins: [(await import('vite-tsconfig-paths')).default()],
  });

  try {
    return {
      module: await server.ssrLoadModule(
        pathToFileURL(resolve('app/lib/ithinq/creative-ai/website/index.ts')).pathname,
      ),
      close: () => server.close(),
    };
  } catch (error) {
    await server.close();
    throw error;
  }
}

const { module, close } = await loadModule();

/*
 * ithinq.ai is a client-rendered SPA, so a plain HTTP read returns a shell
 * with no content. Rendering is the default; `--no-render` reads the raw HTML
 * for a server-rendered origin, which is faster and needs no browser.
 */
const useRenderer = !process.argv.includes('--no-render');
let renderer = null;

try {
  const config = module.resolveWebsiteSource(process.env);
  console.log(`Reading approved first-party pages from ${config.origin} (${config.pages.length} configured).`);
  console.log(useRenderer ? 'Rendering each page before reading it.' : 'Reading raw HTML without rendering.');

  if (useRenderer) {
    renderer = await createRenderedFetch();
  }

  const snapshot = await module.refreshWebsiteFacts({
    env: process.env,
    fetchImpl: renderer?.fetch,
    timeoutMs: 60_000,
  });
  const byKind = {};
  const topics = {};

  for (const fact of snapshot.facts) {
    byKind[fact.kind] = (byKind[fact.kind] ?? 0) + 1;

    for (const topic of fact.source?.topics ?? []) {
      topics[topic] = (topics[topic] ?? 0) + 1;
    }
  }

  console.log(`\nPages read: ${snapshot.pages.length}`);

  for (const page of snapshot.pages) {
    console.log(`  ${page.url} — ${page.factCount} fact(s) from ${page.blockCount} block(s)`);
  }

  if (snapshot.failures.length > 0) {
    console.log(`\nPages skipped: ${snapshot.failures.length}`);

    for (const failure of snapshot.failures) {
      console.log(`  ${failure.url} — ${failure.code}: ${failure.detail}`);
    }
  }

  console.log(`\nFacts: ${snapshot.facts.length}`);
  console.log(`  by kind: ${JSON.stringify(byKind)}`);
  console.log(
    `  top topics: ${Object.entries(topics)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([topic, count]) => `${topic}(${count})`)
      .join(', ')}`,
  );
  console.log(`\nSnapshot written, retrieved at ${snapshot.retrievedAt}.`);
} finally {
  await renderer?.close();
  await close();
}

process.exit(0);
