/**
 * A deliberate nothing, for modules that must not exist in the browser.
 *
 * `@remix-run/node` re-exports `undici`, Node's HTTP client, and Remix pulls
 * every route module into the client graph before tree-shaking removes the
 * server-only halves. The polyfill plugin resolves `undici`'s `node:util/types`
 * import during load and fails, because the browser `util` shim has no `types`
 * submodule — so the client build dies over code that would never have run in
 * a browser anyway. Aliasing undici here removes it before that can happen.
 *
 * The server build is unaffected: Vite externalises node_modules for SSR, so
 * the real undici is used where it belongs.
 */
export default {};
