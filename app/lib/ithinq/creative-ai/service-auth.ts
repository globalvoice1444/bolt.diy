import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Machine-to-machine authentication for the integration surface.
 *
 * The reviewer surfaces (`/ithinq/campaign*`, `/ithinq/pagespec*`) stay exactly
 * as they were: this guards ONLY the routes another service calls, because
 * those are the ones that spend money on someone else's behalf.
 *
 * One shared secret, presented as a bearer token, compared in constant time.
 * Deliberately not OAuth, not JWT, not SSO: this is one backend calling
 * another with a credential an operator sets on both sides, and anything more
 * elaborate would be a second identity system to keep correct.
 *
 * The token never reaches a browser. It is read from the server environment,
 * never echoed in a response, and never logged.
 */
export type ServiceAuthResult = { ok: true } | { ok: false; status: 401 | 503; code: string; detail: string };

/**
 * Hash both sides before comparing.
 *
 * `timingSafeEqual` throws when the two buffers differ in length, and that
 * throw is itself an oracle for the secret's length. Comparing fixed-width
 * digests removes both the throw and the leak.
 */
function secretsMatch(presented: string, expected: string): boolean {
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();

  return timingSafeEqual(a, b);
}

export function authoriseServiceRequest(
  request: Pick<Request, 'headers'>,
  env: Record<string, string | undefined>,
): ServiceAuthResult {
  const expected = (env.RENDERER_SERVICE_TOKEN ?? process?.env?.RENDERER_SERVICE_TOKEN)?.trim();

  if (!expected) {
    /*
     * Fail CLOSED. An unconfigured token must never mean "let everyone in" —
     * that is how a paid endpoint silently becomes public. 503 rather than 401
     * because the fault is this service's configuration, not the caller's
     * credential.
     */
    return {
      ok: false,
      status: 503,
      code: 'service_auth_unconfigured',
      detail: 'This endpoint is not accepting service requests.',
    };
  }

  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());

  if (!match || !secretsMatch(match[1]!.trim(), expected)) {
    // One message for missing, malformed and wrong. Never say which.
    return { ok: false, status: 401, code: 'unauthorised', detail: 'A valid service credential is required.' };
  }

  return { ok: true };
}
