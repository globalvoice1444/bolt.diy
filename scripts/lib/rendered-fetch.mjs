/**
 * A `fetch`-shaped reader for a client-rendered site.
 *
 * ithinq.ai is a Vite/React SPA: the served HTML is a shell with one module
 * script and no content elements, so a plain HTTP read returns a page that
 * says nothing. Rendering it is the only way to see what the company actually
 * publishes.
 *
 * This lives in the tooling layer on purpose. The fact library keeps a plain
 * `fetch` and stays unit-testable against HTML fixtures with no browser
 * anywhere near it; refreshing the snapshot is a developer command and is the
 * only thing that ever needs a renderer. Campaign generation reads the
 * snapshot and never touches either.
 *
 * The host ceiling is not bypassed. When rendering settles on a different URL
 * than the one requested, this returns a 301 pointing at it rather than the
 * content, so the library's own approval check decides whether to follow.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findBrowser() {
  const configured = process.env.ITHINQ_RENDER_BROWSER;

  if (configured && existsSync(configured)) {
    return configured;
  }

  return CANDIDATES.find((path) => existsSync(path)) ?? null;
}

export async function createRenderedFetch({ port = 9422, settleMs = 2500 } = {}) {
  const exe = findBrowser();

  if (!exe) {
    throw new Error('No Chromium-family browser found. Set ITHINQ_RENDER_BROWSER to one.');
  }

  const profile = mkdtempSync(join(tmpdir(), 'ithinq-render-'));
  const child = spawn(
    exe,
    [
      '--headless=new',
      '--disable-gpu',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let target = null;

  for (let attempt = 0; attempt < 60 && !target; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await response.json();
      target = list.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl) ?? null;
    } catch {
      /* The browser is still starting. */
    }

    if (!target) {
      await sleep(500);
    }
  }

  if (!target) {
    child.kill();
    rmSync(profile, { recursive: true, force: true });
    throw new Error('Headless browser did not expose a debugging target.');
  }

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  let messageId = 0;

  const pending = new Map();

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
    }
  };

  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      messageId += 1;
      pending.set(messageId, { resolve, reject });
      socket.send(JSON.stringify({ id: messageId, method, params }));
    });

  await call('Page.enable');
  await call('Runtime.enable');

  const renderedFetch = async (input) => {
    const requested = String(input);

    try {
      await call('Page.navigate', { url: requested });
      await sleep(settleMs);

      const settled = await call('Runtime.evaluate', {
        expression: 'JSON.stringify({ url: location.href, html: document.documentElement.outerHTML })',
        returnByValue: true,
      });

      const { url, html } = JSON.parse(settled.result.value);

      /* Let the library's ceiling decide about a URL we did not ask for. */
      if (url !== requested) {
        return new Response('', { status: 301, headers: { location: url } });
      }

      return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    } catch (error) {
      return new Response(String(error), { status: 599 });
    }
  };

  const close = async () => {
    try {
      socket.close();
    } catch {
      /* Already gone. */
    }

    child.kill();
    await sleep(400);
    rmSync(profile, { recursive: true, force: true });
  };

  return { fetch: renderedFetch, close };
}
