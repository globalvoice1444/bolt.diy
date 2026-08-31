import { json, type MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import examplePageSpec from '@ithinq-pagespec/page-spec.example.json';
import { compilePageSpecToProjectManifest, listDirections } from '~/lib/ithinq/pagespec';

export const meta: MetaFunction = () => [
  { title: 'iThinq creative direction gallery' },
  { name: 'description', content: 'The same PageSpec rendered under every creative direction' },
];

/**
 * Reviewer-facing proof that the same trusted truth does not imply the same
 * look. Every frame renders the identical PageSpec; only the presentation
 * plan differs.
 */
export function loader() {
  const directions = listDirections().map((direction) => {
    const { plan } = compilePageSpecToProjectManifest(examplePageSpec, { direction: direction.id });

    return {
      id: direction.id,
      label: direction.label,
      summary: direction.summary,
      hero: plan.hero.variant,
      density: plan.density,
      cardStyle: plan.cardStyle,
      layouts: Array.from(new Set(plan.sections.map((section) => section.layout))),
    };
  });

  return json({ directions, reference: examplePageSpec.page.reference });
}

export default function CreativeDirectionGallery() {
  const data = useLoaderData<typeof loader>();

  return (
    <main className="min-h-screen bg-[#0b0f14] text-white p-4 md:p-6 flex flex-col gap-4">
      <header className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
        <p className="m-0 text-[11px] uppercase tracking-[0.18em] text-[#7dd3a0] font-bold">
          Same PageSpec &#183; same truth &#183; different presentation
        </p>
        <h1 className="m-0 mt-1 text-xl md:text-2xl font-semibold tracking-tight">Creative direction gallery</h1>
        <p className="m-0 mt-2 text-sm text-white/60 break-words">
          Every frame below renders <code className="font-mono text-xs">{data.reference}</code>. The headline, body
          copy, CTA destinations and disclosure are byte-identical in all of them.
        </p>
        <a
          className="inline-block mt-3 rounded-full border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10"
          href="/ithinq/pagespec"
        >
          Open workbench &#8599;
        </a>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.directions.map((direction) => (
          <article key={direction.id} className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="m-0 text-sm font-semibold">{direction.label}</h2>
                <p className="m-0 mt-1 text-xs text-white/50">{direction.summary}</p>
              </div>
              <a
                className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-[11px] hover:bg-white/10"
                href={`/ithinq/pagespec?direction=${direction.id}`}
              >
                Inspect
              </a>
            </div>
            <div className="px-4 pb-3 flex flex-wrap gap-1.5 text-[10px] text-white/60">
              <span className="rounded-full border border-white/15 px-2 py-1">hero: {direction.hero}</span>
              <span className="rounded-full border border-white/15 px-2 py-1">{direction.density}</span>
              <span className="rounded-full border border-white/15 px-2 py-1">cards: {direction.cardStyle}</span>
              {direction.layouts.map((layout) => (
                <span key={layout} className="rounded-full border border-white/15 px-2 py-1">
                  {layout}
                </span>
              ))}
            </div>
            <div className="bg-white">
              <iframe
                title={`Preview: ${direction.label}`}
                src={`/ithinq/pagespec-preview?direction=${direction.id}`}
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                className="block w-full h-[720px] border-0"
              />
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
