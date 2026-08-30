import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import examplePageSpec from '@ithinq-pagespec/page-spec.example.json';
import { compilePageSpecToProjectManifest, isDirectionId, listDirections } from '~/lib/ithinq/pagespec';

export const meta: MetaFunction = () => [
  { title: 'iThinq creative renderer workbench' },
  { name: 'description', content: 'PageSpec 1.0 rendered under interchangeable creative directions' },
];

export function loader({ request }: LoaderFunctionArgs) {
  const requested = new URL(request.url).searchParams.get('direction');
  const direction = isDirectionId(requested) ? requested : undefined;
  const { manifest, validation, plan } = compilePageSpecToProjectManifest(examplePageSpec, { direction });
  const encoder = new TextEncoder();

  return json({
    validation,
    metadata: manifest.metadata,
    plan,
    directions: listDirections().map((item) => ({ id: item.id, label: item.label, summary: item.summary })),
    files: Object.entries(manifest.files).map(([path, content]) => ({
      path,
      bytes: encoder.encode(content).byteLength,
    })),
  });
}

export default function CreativeRendererWorkbench() {
  const data = useLoaderData<typeof loader>();
  const active = data.plan.directionId;
  const layouts = Array.from(new Set(data.plan.sections.map((section) => section.layout)));

  return (
    <main className="min-h-screen bg-[#0b0f14] text-white p-4 md:p-6 flex flex-col gap-4">
      <header className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <p className="m-0 text-[11px] uppercase tracking-[0.18em] text-[#7dd3a0] font-bold">
              iThinq creative renderer
            </p>
            <h1 className="m-0 mt-1 text-xl md:text-2xl font-semibold tracking-tight">
              One PageSpec, interchangeable creative directions
            </h1>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-[#7dd3a0] text-[#0b0f14] px-3 py-1.5 font-bold">Valid contract</span>
            <span className="rounded-full border border-white/15 px-3 py-1.5">No LLM</span>
            <span className="rounded-full border border-white/15 px-3 py-1.5">Deterministic</span>
            <a
              className="rounded-full border border-white/15 px-3 py-1.5 hover:bg-white/10"
              href="/ithinq/pagespec-gallery"
            >
              Compare all &#8599;
            </a>
          </div>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Creative direction">
          {data.directions.map((item) => (
            <a
              key={item.id}
              href={`/ithinq/pagespec?direction=${item.id}`}
              aria-current={item.id === active ? 'page' : undefined}
              title={item.summary}
              className={
                item.id === active
                  ? 'rounded-xl bg-white text-[#0b0f14] px-4 py-2 text-sm font-bold'
                  : 'rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10'
              }
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_290px] gap-4 flex-1 min-h-0">
        <div className="rounded-2xl overflow-hidden bg-white border border-white/10 min-h-[760px]">
          <iframe
            key={active}
            title={`Rendered PageSpec landing page: ${active}`}
            src={`/ithinq/pagespec-preview?direction=${active}`}
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            className="block w-full h-[calc(100vh-190px)] min-h-[760px] border-0"
          />
        </div>
        <aside className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm overflow-auto">
          <h2 className="m-0 text-sm font-semibold">Presentation plan</h2>
          <p className="text-white/55 break-words text-xs mt-1">{data.metadata.pageReference}</p>

          <dl className="mt-4 text-xs grid grid-cols-2 gap-3">
            <div>
              <dt className="text-white/40">Direction</dt>
              <dd className="m-0 mt-1 font-semibold">{data.metadata.directionLabel}</dd>
            </div>
            <div>
              <dt className="text-white/40">Hero</dt>
              <dd className="m-0 mt-1">{data.plan.hero.variant}</dd>
            </div>
            <div>
              <dt className="text-white/40">Density</dt>
              <dd className="m-0 mt-1">{data.plan.density}</dd>
            </div>
            <div>
              <dt className="text-white/40">Motion</dt>
              <dd className="m-0 mt-1">{data.plan.motion}</dd>
            </div>
            <div>
              <dt className="text-white/40">Cards</dt>
              <dd className="m-0 mt-1">{data.plan.cardStyle}</dd>
            </div>
            <div>
              <dt className="text-white/40">Imagery</dt>
              <dd className="m-0 mt-1">{data.plan.imageEmphasis}</dd>
            </div>
          </dl>

          <h3 className="mt-5 mb-2 text-xs uppercase tracking-widest text-white/40">Section composition</h3>
          <ol className="list-none p-0 m-0 space-y-2">
            {data.plan.sections.map((section) => (
              <li key={section.sourceIndex} className="rounded-xl bg-black/25 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-[#7dd3a0]">{section.kind}</span>
                  <span className="text-[10px] text-white/40">{section.band}</span>
                </div>
                <div className="text-white/70 text-xs mt-1">{section.layout}</div>
              </li>
            ))}
          </ol>

          <h3 className="mt-5 mb-2 text-xs uppercase tracking-widest text-white/40">Layouts in use</h3>
          <p className="text-xs text-white/70 m-0">{layouts.join(', ')}</p>

          <h3 className="mt-5 mb-2 text-xs uppercase tracking-widest text-white/40">Manifest</h3>
          {data.files.map((file) => (
            <div key={file.path} className="rounded-xl bg-black/25 px-3 py-2 mb-2">
              <div className="font-mono text-[11px] text-[#7dd3a0]">{file.path}</div>
              <div className="text-white/45 text-[11px] mt-0.5">{file.bytes.toLocaleString()} bytes</div>
            </div>
          ))}

          <p className="text-[11px] text-white/40 mt-4 mb-0">Validation findings: {data.validation.findings.length}</p>
        </aside>
      </section>
    </main>
  );
}
