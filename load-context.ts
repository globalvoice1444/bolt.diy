/**
 * The server-side environment, and how a route reaches it.
 *
 * On Workers the platform handed every request an `env` binding through
 * `context.cloudflare.env`, and the whole application reads it that way. Under
 * Node there is no such binding — configuration arrives in `process.env` — so
 * the load context keeps the same shape and fills it from there.
 *
 * Keeping the shape rather than rewriting every call site is deliberate: forty
 * or so upstream routes read `context.cloudflare.env`, and a migration that
 * touched all of them to change where a string comes from would be a large
 * diff with a large blast radius for no behavioural gain.
 */
declare module '@remix-run/node' {
  interface AppLoadContext {
    cloudflare: { env: Env };
  }
}

export {};
