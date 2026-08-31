import { isApprovedFactUrl, type WebsiteSourceConfig } from './config';

/**
 * Fetching approved first-party pages.
 *
 * Server-side, and deliberately narrow. This is not a crawler: it visits a
 * configured list and follows nothing. There is no link discovery, no sitemap
 * walk and no redirect off the approved host, because the moment a fetcher can
 * decide for itself what to read, the fact ceiling stops meaning anything.
 */
export interface FetchedPage {
  url: string;
  status: number;
  html: string;
}

export interface FetchFailure {
  url: string;
  code: 'not_approved' | 'http_error' | 'network_error' | 'not_html' | 'too_large' | 'empty' | 'redirect_loop';
  detail: string;
}

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;

  /** Refuse a page larger than this. A fact source has no use for a huge payload. */
  maxBytes?: number;

  /**
   * How many same-host redirects to follow.
   *
   * A hop that stays on the approved host is legitimate — a trailing slash, a
   * www canonicalisation — but a site can also redirect in a loop, and a
   * fetcher that follows one forever takes the whole refresh down with it.
   * Bounded, so a misconfigured page costs one skipped page and nothing else.
   */
  maxRedirects?: number;
}

const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_MAX_REDIRECTS = 3;

export async function fetchApprovedPage(
  url: string,
  config: WebsiteSourceConfig,
  options: FetchOptions = {},
  redirectsFollowed = 0,
): Promise<{ page: FetchedPage | null; failure: FetchFailure | null }> {
  if (!isApprovedFactUrl(url, config)) {
    return {
      page: null,
      failure: {
        url,
        code: 'not_approved',
        detail: 'URL is not an https page on an approved first-party host.',
      },
    };
  }

  const impl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);

  let response: Response;

  try {
    response = await impl(url, {
      /*
       * `redirect: 'manual'` keeps the ceiling honest. A 301 to another host
       * would otherwise smuggle an unapproved origin past the check above.
       */
      redirect: 'manual',
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'iThinq-renderer-fact-source/1.0' },
      signal: controller.signal,
    });
  } catch (error) {
    return {
      page: null,
      failure: {
        url,
        code: 'network_error',
        detail: error instanceof Error ? error.message : 'Network error.',
      },
    };
  } finally {
    clearTimeout(timer);
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location') ?? '';
    const target = location ? new URL(location, url).toString() : '';

    if (target && isApprovedFactUrl(target, config)) {
      if (redirectsFollowed >= (options.maxRedirects ?? DEFAULT_MAX_REDIRECTS)) {
        return {
          page: null,
          failure: { url, code: 'redirect_loop', detail: 'Too many redirects on the approved host.' },
        };
      }

      return fetchApprovedPage(target, config, options, redirectsFollowed + 1);
    }

    return {
      page: null,
      failure: { url, code: 'not_approved', detail: `Redirected off the approved host (${response.status}).` },
    };
  }

  if (!response.ok) {
    return { page: null, failure: { url, code: 'http_error', detail: `HTTP ${response.status}` } };
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType && !/html/i.test(contentType)) {
    return { page: null, failure: { url, code: 'not_html', detail: `Content-Type ${contentType}` } };
  }

  const html = await response.text();

  if (html.length > (options.maxBytes ?? DEFAULT_MAX_BYTES)) {
    return { page: null, failure: { url, code: 'too_large', detail: `${html.length} bytes` } };
  }

  if (!html.trim()) {
    return { page: null, failure: { url, code: 'empty', detail: 'Empty response body.' } };
  }

  return { page: { url, status: response.status, html }, failure: null };
}
