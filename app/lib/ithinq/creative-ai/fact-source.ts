import type { ApprovedFactSet } from './facts';
import { snapshotToFactSet, devSnapshotStore, type SnapshotStore } from './website/snapshot';

/**
 * Where a campaign's approved facts come from.
 *
 * An interface with two implementations rather than one, because they are
 * genuinely different kinds of thing and both are needed. A static set is a
 * fixture: fixed, offline, exactly reproducible, and the only sane basis for a
 * test. A website set is current: it changes when the company changes what it
 * says, which is the point of reading the site at all.
 *
 * The authoring pipeline sees neither. It takes an `ApprovedFactSet`, so
 * swapping the source is a configuration decision and not an engine change.
 */
export interface FactSource {
  readonly id: string;

  /** Null when the source has nothing to offer; the caller keeps the document's copy. */
  load(): Promise<ApprovedFactSet | null>;
}

export function staticFactSource(set: ApprovedFactSet): FactSource {
  return {
    id: set.id,
    async load() {
      return set;
    },
  };
}

/**
 * Facts read from the approved first-party website.
 *
 * Reads the snapshot, never the network. Refreshing is a separate, deliberate
 * act (`refreshWebsiteFacts`), so generating a campaign cannot be slowed,
 * broken or silently changed by the state of the website at that moment.
 */
export function websiteFactSource(store: SnapshotStore = devSnapshotStore): FactSource {
  return {
    id: 'ithinq-website',
    async load() {
      const snapshot = await store.read();

      if (!snapshot || snapshot.facts.length === 0) {
        return null;
      }

      return snapshotToFactSet(snapshot);
    },
  };
}
