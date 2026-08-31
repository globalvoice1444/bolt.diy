import type { AppLoadContext } from '@remix-run/node';

/**
 * Read the server-side environment, whichever runtime is underneath.
 *
 * A Workers deployment supplies configuration on the request context; a Node
 * one has it in `process.env`. Routes should not have to know which, and they
 * must never reach for a key any other way — this is the only place the two
 * shapes are reconciled.
 *
 * Server-only by construction: it is imported by loaders, never by a component,
 * so nothing here can be bundled into browser code.
 */
export function getRuntimeEnv(context?: AppLoadContext): Record<string, string | undefined> {
  const fromContext = (context as { cloudflare?: { env?: Record<string, string | undefined> } } | undefined)?.cloudflare
    ?.env as Record<string, string | undefined> | undefined;

  if (fromContext && Object.keys(fromContext).length > 0) {
    return fromContext;
  }

  return typeof process === 'undefined' ? {} : (process.env as Record<string, string | undefined>);
}
