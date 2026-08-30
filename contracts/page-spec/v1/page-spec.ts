/**
 * PageSpec V1 — the consumer contract.
 *
 * AUTHORITY: `page-spec.schema.json` in this directory is the contract.
 * This file is the TypeScript view of it, and a test parses both and
 * compares section kinds, purposes, asserting purposes, the version
 * rule and the fact-reference pattern. They cannot drift silently.
 *
 * Hand-authored rather than generated: the repository carries no JSON
 * Schema code generator in either toolchain, and adding a build-time
 * dependency to emit types the test already protects would be the more
 * fragile choice.
 *
 * OWNERSHIP, because it is the only thing here that really matters:
 *
 *   The Growth Engine owns business truth — facts, approved
 *   capabilities, prohibited claims, campaign state, Partner identity,
 *   referral URLs, disclosures, CTA destinations, market strategy.
 *
 *   The renderer owns presentation — CSS, breakpoints, components,
 *   typography, animation, layout.
 *
 * A renderer never writes, rewrites, summarises, translates, infers or
 * omits anything in the first list.
 */

/**
 * Exactly `1.0`.
 *
 * The schema is strict — `additionalProperties: false` throughout and a
 * closed purpose enum — so a document from a later contract version
 * cannot be validated safely by a 1.0 consumer. A 1.1 is a real minor
 * release, and you adopt it by updating this file and the schema, not
 * by optimistically accepting it. Deterministic refusal beats hopeful
 * acceptance.
 */
export type SpecVersion = '1.0';

export const SUPPORTED_VERSION: SpecVersion = '1.0';

/**
 * The canonical V1 vocabulary: exactly the section kinds
 * PageSpecComposer emits, one per strategic purpose that yields a
 * section.
 *
 * `hero` and `cta` are not kinds. The hook is `page.headline` /
 * `page.subheadline`; the ask is `ctas.primary`. Where you draw them is
 * yours to decide.
 */
export const SECTION_KINDS = ['interrupt', 'scenario', 'pain', 'mechanism', 'vertical_fit', 'faq', 'risk'] as const;

export type SectionKind = (typeof SECTION_KINDS)[number];

/**
 * Why the section is on the page, held separately from how it looks.
 * Two sections can share a kind and do different work — never infer
 * strategy from kind.
 */
export const SECTION_PURPOSES = [
  'interrupt_pattern',
  'create_recognition',
  'intensify_problem',
  'explain_mechanism',
  'establish_fit',
  'handle_objection',
  'reduce_risk',
  'drive_action',
] as const;

export type SectionPurpose = (typeof SECTION_PURPOSES)[number];

/**
 * The purposes that assert something about the product.
 *
 * On a `generated` document these require at least one fact reference.
 * The other three describe the reader's own day and assert nothing,
 * which is why they may legitimately carry an empty array.
 */
export const ASSERTING_PURPOSES = [
  'explain_mechanism',
  'establish_fit',
  'handle_objection',
  'reduce_risk',
  'drive_action',
] as const;

export type AssertingPurpose = (typeof ASSERTING_PURPOSES)[number];

export const AWARENESS_LEVELS = ['unaware', 'problem-aware', 'solution-aware', 'product-aware', 'most-aware'] as const;

export type AwarenessLevel = (typeof AWARENESS_LEVELS)[number];

/** Content hierarchy, which the Growth Engine owns. How it is expressed is yours. */
export const EMPHASIS = ['lead', 'support', 'aside'] as const;

export type Emphasis = (typeof EMPHASIS)[number];

/** Every fact reference must match this. Truncated forms are invalid. */
export const FACT_REFERENCE_PATTERN = /^f_[0-9a-f]{64}$/;

export interface Cta {
  label: string;
  /**
   * Fully resolved, attribution already attached. Render exactly.
   * Never append, rewrite, shorten, proxy or re-sign it.
   */
  url: string;
  role: 'primary' | 'secondary';
  /** Stripping or altering this URL destroys the Partner's commission. */
  carriesAttribution?: boolean;
}

/** A reference, never storage. No credentials, no provider metadata, no paths. */
export interface Asset {
  url: string;
  kind: 'image' | 'logo' | 'illustration';
  alt: string;
  role?: string | null;
  /** A required asset that will not load is fatal; an optional one is omitted. */
  required?: boolean;
}

export interface QaItem {
  question: string;
  answer: string;
}

/**
 * Which approved facts a section rests on.
 *
 * Present on every section. The array may be empty where that is
 * legitimate — a non-asserting generated beat, or any legacy section,
 * where nothing recorded it. Use these for diagnostics, traceability
 * and validation, never to rewrite content: provenance says which
 * approved statement a section rests on, not what it may say instead.
 */
export interface Provenance {
  /** `f_` + a full lowercase SHA-256 digest. Never a database id. */
  factRefs: string[];
}

export interface PageSpecSection {
  kind: SectionKind | (string & {});
  purpose: SectionPurpose;
  provenance: Provenance;
  /** When true, an unrecognised `kind` is fatal instead of skippable. */
  required?: boolean;
  /** Required on a generated document. */
  emphasis?: Emphasis;
  eyebrow?: string | null;
  heading?: string | null;
  body?: string | null;
  items?: string[];
  qa?: QaItem[];
  asset?: Asset;
}

/**
 * Which producer made the document.
 *
 * `generated` — purpose, emphasis, situation, awareness, sophistication
 * and provenance are AUTHORED strategy from a CreativeBrief.
 * `legacy` — the page was hand-authored, `purpose` is a documented
 * inference, strategy values are null and provenance is an honest empty
 * array. Never treat a legacy inference as authored strategy.
 */
export type PageOrigin = 'generated' | 'legacy';

interface PageSpecPageBase {
  /** Identifies the page, not the Partner. Never a database id. */
  reference: string;
  origin: PageOrigin;
  /** Diagnostic only. Do not branch on it. */
  templateKey?: string | null;
  name: string;
  audience: string;
  /** The hook. There is no hero section; this is where it lives. */
  headline: string;
  subheadline: string;
  /** Null is legitimate even when generated: the flagship brief is not market-scoped. */
  vertical: string | null;
}

export interface GeneratedPage extends PageSpecPageBase {
  origin: 'generated';
  campaign: string;
  situation: string;
  awareness: AwarenessLevel;
  sophistication: number;
}

/**
 * Null, literally — not merely nullable.
 *
 * A hand-authored page has no CreativeBrief behind it, so there is no
 * campaign, situation, awareness or sophistication to report. A
 * plausible value in one of these fields would be indistinguishable
 * from authored strategy, which is the whole thing `origin` exists to
 * let a consumer tell apart. The schema rejects a legacy document that
 * carries one.
 *
 * `vertical` is the exception and is inherited from the base: it may be
 * a string in either origin, because it is recorded on the template row
 * itself rather than derived from a brief.
 */
export interface LegacyPage extends PageSpecPageBase {
  origin: 'legacy';
  campaign: null;
  situation: null;
  awareness: null;
  sophistication: null;
}

export type PageSpecPage = GeneratedPage | LegacyPage;

/**
 * Display-safe Partner identity, already resolved.
 *
 * There is deliberately no identifier here. A renderer that cannot see
 * a Partner id cannot construct a referral URL, which is the point.
 */
export interface PageSpecPartner {
  /**
   * Null means no name is safe to show. Render without a personal
   * introduction — never substitute an identifier.
   */
  displayName: string | null;
  businessName?: string | null;
  introduction?: string | null;
}

export interface PageSpecDisclosure {
  text: string;
  placement?: 'footer' | 'header' | 'inline';
}

/**
 * Growth Engine INTENT, not a security trust anchor.
 *
 * The list travels inside the document it authorises, so a tampered
 * document could name its own hostname. Receive the document over an
 * authenticated, trusted channel, or intersect this with a
 * renderer-controlled ceiling. See README, URL trust model.
 */
export interface PageSpecPolicy {
  allowedLinkHosts: string[];
}

export interface PageSpec {
  specVersion: SpecVersion;
  page: PageSpecPage;
  partner: PageSpecPartner;
  ctas: { primary: Cta; secondary?: Cta | null };
  disclosure: PageSpecDisclosure;
  policy: PageSpecPolicy;
  /** Rendered in array order. Never reorder, merge or split. */
  sections: PageSpecSection[];
}

/* ------------------------------------------------------------------ */
/* Validation outcomes                                                 */
/* ------------------------------------------------------------------ */

export type FailureSeverity = 'fatal' | 'degradable';

export interface ValidationFinding {
  severity: FailureSeverity;
  code: string;
  detail: string;
  /** Index into `sections` when the finding belongs to one. */
  sectionIndex?: number;
}

export interface ValidationResult {
  /** False means refuse to render. Never render a partially valid page. */
  renderable: boolean;
  findings: ValidationFinding[];
  /** Section indices to skip. Present only when `renderable` is true. */
  skipSections: number[];
}

/**
 * True only for the exact version this consumer implements.
 *
 * Deliberately not a major-version check. Accepting an unseen minor
 * against a strict schema is optimism, not compatibility.
 */
export function supportsVersion(specVersion: string): boolean {
  return specVersion === SUPPORTED_VERSION;
}

export function isKnownKind(kind: string): kind is SectionKind {
  return (SECTION_KINDS as readonly string[]).includes(kind);
}

export function isAssertingPurpose(purpose: string): purpose is AssertingPurpose {
  return (ASSERTING_PURPOSES as readonly string[]).includes(purpose);
}
