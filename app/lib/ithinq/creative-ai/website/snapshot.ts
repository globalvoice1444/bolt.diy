import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ApprovedFact, ApprovedFactSet } from '~/lib/ithinq/creative-ai/facts';
import { resolveWebsiteSource, pageUrl, type WebsiteSourceConfig } from './config';
import { fetchApprovedPage, type FetchFailure, type FetchOptions } from './fetch';
import { extractFacts } from './extract';
import { parseHtml } from './parse';

/**
 * The fact snapshot.
 *
 * Generating a campaign must not depend on the website being reachable. A
 * snapshot makes generation fast, reproducible and testable, keeps load off
 * the site, and — the part that matters most — means a page can be explained
 * later: these were the facts, from these pages, read at this time.
 *
 * The store is an interface with one development implementation writing to
 * `.data/`, matching `AssetStore`. PRODUCTION SEAM: a deployment swaps in a
 * shared store behind this interface. No storage vendor is chosen here.
 */
export interface SnapshotPageRecord {
  url: string;
  title: string | null;
  factCount: number;
  blockCount: number;
}

export interface FactSnapshot {
  snapshotVersion: 1;
  origin: string;
  retrievedAt: string;
  pages: SnapshotPageRecord[];
  failures: FetchFailure[];
  facts: ApprovedFact[];
}

export interface SnapshotStore {
  read(): Promise<FactSnapshot | null>;
  write(snapshot: FactSnapshot): Promise<void>;
}

export class FileSystemSnapshotStore implements SnapshotStore {
  constructor(private readonly _path: string = resolve(process.cwd(), '.data/ithinq-facts/website-snapshot.json')) {}

  async read(): Promise<FactSnapshot | null> {
    try {
      return JSON.parse(await readFile(this._path, 'utf8')) as FactSnapshot;
    } catch {
      return null;
    }
  }

  async write(snapshot: FactSnapshot): Promise<void> {
    await mkdir(dirname(this._path), { recursive: true });
    await writeFile(this._path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  }
}

/** In-memory store, for tests and for a caller that does not want to touch disk. */
export class MemorySnapshotStore implements SnapshotStore {
  private _snapshot: FactSnapshot | null = null;

  async read() {
    return this._snapshot;
  }

  async write(snapshot: FactSnapshot) {
    this._snapshot = snapshot;
  }
}

export const devSnapshotStore = new FileSystemSnapshotStore();

export interface RefreshOptions extends FetchOptions {
  config?: WebsiteSourceConfig;
  env?: Record<string, string | undefined>;
  store?: SnapshotStore;
  now?: () => Date;
}

/**
 * Rebuild the snapshot from the approved pages.
 *
 * A full rebuild rather than a merge, deliberately. A fact that has been taken
 * off the website is no longer something iThinq says, and carrying it forward
 * because it was true last month is how a system starts making claims its own
 * company has retired. Facts are content-addressed, so anything still on the
 * site keeps its identity across a refresh and anything reworded gets a new
 * one — the change is visible instead of silent.
 *
 * A page that fails to load is recorded and skipped. One unreachable page
 * narrows what may be claimed; it does not stop the others being read.
 */
export async function refreshWebsiteFacts(options: RefreshOptions = {}): Promise<FactSnapshot> {
  const config = options.config ?? resolveWebsiteSource(options.env ?? {});
  const store = options.store ?? devSnapshotStore;
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();

  const pages: SnapshotPageRecord[] = [];
  const failures: FetchFailure[] = [];
  const facts: ApprovedFact[] = [];
  const seenRefs = new Set<string>();

  for (const entry of config.pages) {
    const url = pageUrl(config, entry);
    const { page, failure } = await fetchApprovedPage(url, config, options);

    if (!page) {
      if (failure) {
        failures.push(failure);
      }

      continue;
    }

    const parsed = parseHtml(page.html);
    const extracted = extractFacts(parsed, { sourceUrl: page.url, retrievedAt, pageTopics: entry.topics });

    let kept = 0;

    for (const fact of extracted) {
      /* The same sentence on two pages is one fact; the first page keeps it. */
      if (seenRefs.has(fact.ref)) {
        continue;
      }

      seenRefs.add(fact.ref);
      facts.push(fact);
      kept += 1;
    }

    pages.push({ url: page.url, title: parsed.title, factCount: kept, blockCount: parsed.blocks.length });
  }

  const snapshot: FactSnapshot = {
    snapshotVersion: 1,
    origin: config.origin,
    retrievedAt,
    pages,
    failures,
    facts,
  };

  await store.write(snapshot);

  return snapshot;
}

export function snapshotToFactSet(snapshot: FactSnapshot): ApprovedFactSet {
  return {
    id: 'ithinq-website',
    subject: `The iThinq product, as stated on ${snapshot.origin}`,
    authority: 'first-party-website',
    retrievedAt: snapshot.retrievedAt,
    facts: snapshot.facts,
  };
}
