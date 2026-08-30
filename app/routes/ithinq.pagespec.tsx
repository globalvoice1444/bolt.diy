import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import examplePageSpec from '@ithinq-pagespec/page-spec.example.json';
import { compilePageSpecToProjectManifest } from '~/lib/ithinq/pagespec';

export const meta: MetaFunction = () => [
  { title: 'iThinq PageSpec Renderer POC' },
  { name: 'description', content: 'Deterministic PageSpec 1.0 renderer proof of concept' },
];

export function loader(_args: LoaderFunctionArgs) {
  const { manifest, validation } = compilePageSpecToProjectManifest(examplePageSpec);
  const encoder = new TextEncoder();

  return json({
    validation,
    metadata: manifest.metadata,
    files: Object.entries(manifest.files).map(([path, content]) => ({
      path,
      bytes: encoder.encode(content).byteLength,
    })),
  });
}

export default function PageSpecRendererPoc() {
  const data = useLoaderData<typeof loader>();

  return (
    <main className="min-h-screen bg-[#0c1512] text-white p-4 md:p-6 flex flex-col gap-4">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
        <div>
          <p className="m-0 text-[11px] uppercase tracking-[0.18em] text-[#c9ff72] font-bold">iThinq renderer track</p>
          <h1 className="m-0 mt-1 text-xl md:text-2xl font-semibold tracking-tight">
            PageSpec 1.0 → deterministic landing page
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-[#c9ff72] text-[#10211d] px-3 py-1.5 font-bold">Valid contract</span>
          <span className="rounded-full border border-white/15 px-3 py-1.5">No LLM</span>
          <span className="rounded-full border border-white/15 px-3 py-1.5">No WebContainer</span>
          <a
            className="rounded-full border border-white/15 px-3 py-1.5 hover:bg-white/10"
            href="/ithinq/pagespec-preview"
            target="_blank"
            rel="noreferrer"
          >
            Open preview ↗
          </a>
        </div>
      </header>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-4 flex-1 min-h-0">
        <div className="rounded-2xl overflow-hidden bg-white border border-white/10 min-h-[760px]">
          <iframe
            title="Rendered PageSpec landing page"
            src="/ithinq/pagespec-preview"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            className="block w-full h-[calc(100vh-150px)] min-h-[760px] border-0"
          />
        </div>
        <aside className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
          <h2 className="m-0 text-sm font-semibold">Compiled manifest</h2>
          <p className="text-white/55 break-words text-xs">{data.metadata.pageReference}</p>
          <div className="mt-5 space-y-3">
            {data.files.map((file) => (
              <div key={file.path} className="rounded-xl bg-black/20 px-3 py-2">
                <div className="font-mono text-xs text-[#c9ff72]">{file.path}</div>
                <div className="text-white/45 text-xs mt-1">{file.bytes.toLocaleString()} bytes</div>
              </div>
            ))}
          </div>
          <dl className="mt-6 text-xs space-y-3">
            <div>
              <dt className="text-white/40">Compiler</dt>
              <dd className="m-0 mt-1 break-words">{data.metadata.compiler}</dd>
            </div>
            <div>
              <dt className="text-white/40">Contract</dt>
              <dd className="m-0 mt-1">{data.metadata.contract}</dd>
            </div>
            <div>
              <dt className="text-white/40">Findings</dt>
              <dd className="m-0 mt-1">{data.validation.findings.length}</dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  );
}
