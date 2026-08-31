import { vitePlugin as remixVitePlugin } from '@remix-run/dev';
import UnoCSS from 'unocss/vite';
import { defineConfig, type PluginOption, type UserConfig, type ViteDevServer } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { optimizeCssModules } from 'vite-plugin-optimize-css-modules';
import tsconfigPaths from 'vite-tsconfig-paths';
import * as dotenv from 'dotenv';

// Load environment variables from multiple files
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
dotenv.config();

export default defineConfig((config) => {
  return {
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    },
    build: {
      target: 'esnext',
    },
    plugins: [
      clientOnly(
        nodePolyfills({
          include: ['buffer', 'process', 'util', 'stream'],
          globals: {
            Buffer: true,
            process: true,
            global: true,
          },
          protocolImports: true,
          exclude: ['child_process', 'fs', 'path'],
        }),
      ),
      {
        name: 'buffer-polyfill',
        transform(code, id) {
          if (id.includes('env.mjs')) {
            return {
              code: `import { Buffer } from 'buffer';\n${code}`,
              map: null,
            };
          }

          return null;
        },
      },
      remixVitePlugin({
        future: {
          v3_fetcherPersist: true,
          v3_relativeSplatPath: true,
          v3_throwAbortReason: true,
          v3_lazyRouteDiscovery: true,
        },
      }),
      UnoCSS(),
      tsconfigPaths(),
      chrome129IssuePlugin(),
      config.mode === 'production' && optimizeCssModules({ apply: 'build' }),
    ],
    resolve: {
      alias: {
        /* Node's HTTP client has no place in a browser bundle. See empty-module.ts. */
        undici: '/app/lib/empty-module.ts',
      },
    },
    envPrefix: [
      'VITE_',
      'OPENAI_LIKE_API_BASE_URL',
      'OPENAI_LIKE_API_MODELS',
      'OLLAMA_API_BASE_URL',
      'LMSTUDIO_API_BASE_URL',
      'TOGETHER_API_BASE_URL',
    ],
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
    },
    test: {
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/cypress/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
        '**/tests/preview/**', // Exclude preview tests that require Playwright
      ],
    },
  };
});

/**
 * Keep a browser polyfill out of the server build.
 *
 * `nodePolyfills` was applied to both builds, so the SSR bundle imported
 * `vite-plugin-node-polyfills/shims/process` — a browser stub whose `cwd()` is
 * `/` and whose `env` is empty. On a real Node server that is quietly
 * catastrophic: the asset store and fact snapshot resolve their roots from
 * `process.cwd()` and land somewhere that is not the application directory, so
 * generated images write nowhere and read back as 404s, and `process.env` never
 * yields the OpenAI key.
 *
 * It stayed invisible for as long as it did because nothing ever ran the built
 * server: on Workers every route failed earlier, and the tests and the refresh
 * CLI use the real Node `process`.
 *
 * The browser genuinely needs these shims. The server never does.
 */
function clientOnly(plugin: PluginOption): PluginOption {
  const plugins = Array.isArray(plugin) ? plugin : [plugin];

  return plugins.map((entry) =>
    entry && typeof entry === 'object' && 'name' in entry
      ? { ...entry, apply: (config: UserConfig) => !config.build?.ssr }
      : entry,
  ) as PluginOption;
}

function chrome129IssuePlugin() {
  return {
    name: 'chrome129IssuePlugin',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const raw = req.headers['user-agent']?.match(/Chrom(e|ium)\/([0-9]+)\./);

        if (raw) {
          const version = parseInt(raw[2], 10);

          if (version === 129) {
            res.setHeader('content-type', 'text/html');
            res.end(
              '<body><h1>Please use Chrome Canary for testing.</h1><p>Chrome 129 has an issue with JavaScript modules & Vite local development, see <a href="https://github.com/stackblitz/bolt.new/issues/86#issuecomment-2395519258">for more information.</a></p><p><b>Note:</b> This only impacts <u>local development</u>. `pnpm run build` and `pnpm run start` will work fine in this browser.</p></body>',
            );

            return;
          }
        }

        next();
      });
    },
  };
}