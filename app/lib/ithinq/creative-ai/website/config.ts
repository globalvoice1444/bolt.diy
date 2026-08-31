/**
 * Fact trust: where product truth may be read from.
 *
 * The renderer already keeps two separate host ceilings, in
 * `pagespec/validator.ts`: navigation trust (where a CTA may send a person)
 * and media trust (where an image may be loaded from), deliberately split
 * because one must never imply the other.
 *
 * This is the third, and the most consequential. Authorising somewhere to
 * *state what the product does* is a different decision again: a page that
 * loads a stray pixel is a privacy problem, and a page that repeats a stray
 * sentence as product truth is a false claim made in the Partner's name.
 *
 * So the ceiling is closed and first-party. Facts come from iThinq's own
 * site. Never a search result, a competitor, a review aggregator, a forum, a
 * cached snippet or any other third party — not because those are unreliable
 * in general, but because none of them are iThinq speaking about iThinq.
 */
export const RENDERER_FACT_HOST_CEILING = ['ithinq.ai', 'www.ithinq.ai'] as const;

export interface FactSourcePage {
  /** Path on an approved origin. Absolute URLs are rejected on purpose. */
  path: string;

  /** What this page is expected to be about. Used for relevance, never as a fact. */
  topics: readonly string[];
}

export interface WebsiteSourceConfig {
  origin: string;
  pages: readonly FactSourcePage[];

  /** Hosts facts may be read from. Closed by default. */
  allowedHosts: readonly string[];
}

/**
 * The approved first-party pages.
 *
 * Configuration, not content: nothing here says what iThinq does, only where
 * to go and ask. When the site changes, the facts change on the next refresh
 * without a code change — which is the whole point of reading the site rather
 * than maintaining a fact sheet by hand.
 *
 * `topics` are retrieval hints the renderer assigns, not claims from the page.
 */
export const DEFAULT_WEBSITE_SOURCE: WebsiteSourceConfig = {
  origin: 'https://ithinq.ai',
  allowedHosts: RENDERER_FACT_HOST_CEILING,
  pages: [
    { path: '/', topics: ['product', 'positioning', 'overview'] },
    { path: '/features', topics: ['capability', 'features'] },
    { path: '/pricing', topics: ['pricing', 'plans'] },
    { path: '/about', topics: ['company', 'positioning'] },
    { path: '/ai-call-answering', topics: ['voice-assistant', 'calls', 'capability'] },
    { path: '/ai-voice-assistant-for-small-business', topics: ['voice-assistant', 'service-business'] },
    { path: '/virtual-assistant-artificial-intelligence', topics: ['product', 'capability'] },
    { path: '/ai-assistant-for-booking-appointments', topics: ['lead-capture', 'booking'] },
    { path: '/solutions/small-business', topics: ['service-business', 'positioning'] },

    /* The vertical pages. These are what make a per-market campaign possible. */
    { path: '/ai-voice-assistant-for-medspas', topics: ['med-spa', 'vertical'] },
    { path: '/ai-receptionist-for-law-firms', topics: ['legal', 'vertical'] },
    { path: '/ai-receptionist-for-real-estate', topics: ['real-estate', 'vertical'] },
    { path: '/ai-assistant-for-insurance-agents', topics: ['insurance', 'vertical'] },
    { path: '/ai-voice-assistant-for-IT-support-specialist', topics: ['it-support', 'vertical'] },
    { path: '/ai-sales-automation', topics: ['sales', 'vertical'] },
  ],
};

/*
 * Deliberately absent: /login, /demo, /blog, /documentation, /privacy-policy
 * and /terms-of-service. Authentication and legal pages carry no product fact,
 * and a blog is a stream of opinion and announcement rather than the settled
 * claims a campaign should rest on. `robots.txt` disallows only /private/,
 * which is not among these.
 */

/**
 * Read the source configuration, allowing a deployment to point elsewhere.
 *
 * `ITHINQ_WEBSITE_ORIGIN` and `ITHINQ_WEBSITE_PATHS` exist so a staging site
 * can be ingested without a code change. The host ceiling is NOT
 * env-overridable: a misconfigured environment variable must not be able to
 * turn an arbitrary host into a source of product truth.
 */
export function resolveWebsiteSource(env: Record<string, string | undefined> = {}): WebsiteSourceConfig {
  const origin = (env.ITHINQ_WEBSITE_ORIGIN || DEFAULT_WEBSITE_SOURCE.origin).trim();
  const rawPaths = (env.ITHINQ_WEBSITE_PATHS || '').trim();

  const pages = rawPaths
    ? rawPaths
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((path) => ({ path: path.startsWith('/') ? path : `/${path}`, topics: [] as string[] }))
    : DEFAULT_WEBSITE_SOURCE.pages;

  return { origin, pages, allowedHosts: RENDERER_FACT_HOST_CEILING };
}

/** True only for an https URL on an approved first-party host. */
export function isApprovedFactUrl(rawUrl: string, config: WebsiteSourceConfig): boolean {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') {
    return false;
  }

  return config.allowedHosts.map((host) => host.toLowerCase()).includes(parsed.hostname.toLowerCase());
}

export function pageUrl(config: WebsiteSourceConfig, page: FactSourcePage): string {
  return new URL(page.path, config.origin).toString();
}
