import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { Form, useLoaderData, useNavigation } from '@remix-run/react';
import examplePageSpec from '@ithinq-pagespec/page-spec.example.json';
import type { PageSpec } from '@ithinq-pagespec/page-spec';
import { runCampaign } from '~/lib/ithinq/creative-ai';
import { DEFAULT_BRIEF, DEMO_BRIEFS } from '~/lib/ithinq/creative-ai/briefs';

export const meta: MetaFunction = () => [
  { title: 'iThinq campaign studio' },
  { name: 'description', content: 'Plain-language brief to finished campaign page' },
];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const brief = url.searchParams.get('brief') || DEFAULT_BRIEF;
  const spec = examplePageSpec as unknown as PageSpec;
  const env = (context?.cloudflare?.env ?? {}) as unknown as Record<string, string | undefined>;

  const run = await runCampaign(spec, { userInstruction: brief }, { env });

  return json({
    brief,
    query: `?brief=${encodeURIComponent(brief)}`,
    presets: DEMO_BRIEFS,
    modelInterpreted: run.request.modelInterpreted,
    textModel: run.textModel,
    imageModel: run.imageModel,
    syntheticImages: run.syntheticImages,
    angle: run.request.angle,
    request: run.request,
    strategy: run.strategy,
    copy: {
      generated: run.copy.generated,
      accepted: run.copy.accepted,
      rejected: run.copy.rejected,
      overlay: run.copy.overlay,
      findings: run.copy.findings,
    },
    needs: run.needs.map((need) => ({ id: need.id, role: need.role, aspectRatio: need.aspectRatio })),
    assets: run.assets.map((asset) => ({ assetNeedId: asset.assetNeedId, url: asset.url, alt: asset.alt })),
    failures: run.failures,
    original: {
      headline: spec.page.headline,
      subheadline: spec.page.subheadline,
    },
  });
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/15 px-2.5 py-1 text-[11px]">{children}</span>;
}

export default function CampaignStudio() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';

  return (
    <main className="min-h-screen bg-[#0b0f14] text-white p-4 md:p-6 flex flex-col gap-4">
      <header className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
        <p className="m-0 text-[11px] uppercase tracking-[0.18em] text-[#7dd3a0] font-bold">
          iThinq campaign studio &#183; engineering review surface
        </p>
        <h1 className="m-0 mt-1 text-xl md:text-2xl font-semibold tracking-tight">
          Describe the campaign. The system builds it.
        </h1>

        <Form method="get" className="mt-3 flex flex-col md:flex-row gap-2">
          <input
            type="text"
            name="brief"
            defaultValue={data.brief}
            aria-label="Campaign brief"
            className="flex-1 rounded-xl bg-black/30 border border-white/15 px-4 py-3 text-sm outline-none focus:border-[#7dd3a0]"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-[#7dd3a0] text-[#0b0f14] px-5 py-3 text-sm font-bold disabled:opacity-60"
          >
            {busy ? 'Generating…' : 'Generate campaign'}
          </button>
        </Form>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {data.presets.map((preset) => (
            <a
              key={preset.id}
              className="rounded-full border border-white/15 px-3 py-1.5 hover:bg-white/10"
              href={`/ithinq/campaign?brief=${encodeURIComponent(preset.instruction)}`}
            >
              {preset.label}
            </a>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Pill>{data.modelInterpreted ? `interpreted by ${data.textModel}` : 'deterministic interpretation'}</Pill>
          <Pill>{data.copy.generated ? `copy by ${data.textModel}` : 'contract copy'}</Pill>
          <Pill>
            images: {data.imageModel}
            {data.syntheticImages ? ' (placeholder)' : ''}
          </Pill>
          <Pill>
            copy accepted {data.copy.accepted} · rejected {data.copy.rejected}
          </Pill>
        </div>
      </header>

      <section className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-4 flex-1 min-h-0">
        <aside className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm overflow-auto max-h-[calc(100vh-260px)]">
          {data.angle && (
            <>
              <h2 className="m-0 text-sm font-semibold">Creative angle</h2>
              <p className="mt-1 text-xs text-white/70">{data.angle}</p>
            </>
          )}

          <h3 className="mt-4 mb-2 text-xs uppercase tracking-widest text-white/40">Strategy</h3>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            {(
              [
                ['Direction', data.strategy.directionId],
                ['Tone', data.request.tone],
                ['Narrative', data.strategy.narrativeAngle],
                ['Mood', data.strategy.visualMood],
                ['Images', data.strategy.imageStrategy],
                ['Density', data.strategy.pageDensity],
                ['CTA', data.strategy.ctaIntensity],
                ['Goal', data.request.conversionGoal],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-white/40">{label}</dt>
                <dd className="m-0 mt-0.5">{value}</dd>
              </div>
            ))}
          </dl>

          <h3 className="mt-5 mb-2 text-xs uppercase tracking-widest text-white/40">Copy: contract vs generated</h3>
          <div className="rounded-xl bg-black/25 px-3 py-2 text-xs">
            <div className="text-white/40">contract headline</div>
            <div className="text-white/60 mt-0.5">{data.original.headline}</div>
            <div className="text-white/40 mt-2">generated headline</div>
            <div className="text-[#7dd3a0] mt-0.5">{data.copy.overlay.headline ?? '(kept contract copy)'}</div>
          </div>

          {data.copy.findings.length > 0 && (
            <>
              <h3 className="mt-5 mb-2 text-xs uppercase tracking-widest text-amber-300">
                Truth guard rejections ({data.copy.findings.length})
              </h3>
              {data.copy.findings.map((finding, index) => (
                <p key={`${finding.field}-${index}`} className="m-0 mb-1 text-[11px] text-amber-200">
                  <strong>{finding.field}</strong> ({finding.code}): {finding.detail}
                </p>
              ))}
            </>
          )}

          <h3 className="mt-5 mb-2 text-xs uppercase tracking-widest text-white/40">
            Imagery ({data.assets.length}/{data.needs.length})
          </h3>
          {data.needs.length === 0 && <p className="text-xs text-white/50 m-0">None — typography-first strategy.</p>}
          {data.assets.map((asset) => (
            <img
              key={asset.assetNeedId}
              src={asset.url}
              alt={asset.alt}
              className="mb-2 w-full rounded-lg border border-white/10"
              loading="lazy"
            />
          ))}

          {data.failures.length > 0 && (
            <>
              <h3 className="mt-4 mb-2 text-xs uppercase tracking-widest text-amber-300">Failures</h3>
              {data.failures.map((failure, index) => (
                <p key={`${failure.id}-${index}`} className="m-0 mb-1 text-[11px] text-amber-200">
                  <strong>
                    {failure.stage}/{failure.id}
                  </strong>
                  : {failure.detail}
                </p>
              ))}
            </>
          )}
        </aside>

        <div className="rounded-2xl overflow-hidden bg-white border border-white/10 min-h-[760px]">
          <iframe
            key={data.brief}
            title="Generated campaign page"
            src={`/ithinq/campaign-preview${data.query}`}
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            className="block w-full h-[calc(100vh-260px)] min-h-[760px] border-0"
          />
        </div>
      </section>
    </main>
  );
}
