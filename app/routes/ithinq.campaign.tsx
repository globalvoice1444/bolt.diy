import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { Form, useLoaderData, useNavigation } from '@remix-run/react';
import { runCampaign } from '~/lib/ithinq/creative-ai';
import { DEFAULT_BRIEF, DEMO_BRIEFS } from '~/lib/ithinq/creative-ai/briefs';
import { DEMO_SPECS, demoSpec } from '~/lib/ithinq/creative-ai/demo-specs';

export const meta: MetaFunction = () => [
  { title: 'iThinq campaign studio' },
  { name: 'description', content: 'Approved facts and a plain-language request to a finished campaign page' },
];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const brief = url.searchParams.get('brief') || DEFAULT_BRIEF;
  const demo = demoSpec(url.searchParams.get('spec'));
  const spec = demo.spec;
  const env = (context?.cloudflare?.env ?? {}) as unknown as Record<string, string | undefined>;

  const run = await runCampaign(spec, { userInstruction: brief }, { env, factSet: demo.factSet });

  return json({
    brief,
    specId: demo.id,
    query: `?brief=${encodeURIComponent(brief)}&spec=${encodeURIComponent(demo.id)}`,
    presets: DEMO_BRIEFS,
    documents: DEMO_SPECS.map((entry) => ({ id: entry.id, label: entry.label, synthetic: entry.synthetic })),
    modelInterpreted: run.request.modelInterpreted,
    textModel: run.textModel,
    imageModel: run.imageModel,
    syntheticImages: run.syntheticImages,
    angle: run.request.angle,
    request: run.request,
    strategy: run.strategy,
    factSet: {
      id: run.factSet.id,
      subject: run.factSet.subject,
      authority: run.factSet.authority,
      facts: run.factSet.facts.map((fact) => ({ ref: fact.ref, kind: fact.kind, text: fact.text })),
    },
    coverage: run.coverage,
    copy: {
      generated: run.copy.generated,
      audited: run.copy.audited,
      accepted: run.copy.accepted,
      rejected: run.copy.rejected,
      plan: run.copy.plan,
      overlay: run.copy.overlay,
      findings: run.copy.findings,
    },
    needs: run.needs.map((need) => ({ id: need.id, role: need.role, aspectRatio: need.aspectRatio })),
    assets: run.assets.map((asset) => ({ assetNeedId: asset.assetNeedId, url: asset.url, alt: asset.alt })),
    failures: run.failures.filter((failure) => failure.stage === 'image'),
    document: {
      name: spec.page.name,
      headline: spec.page.headline,
      subheadline: spec.page.subheadline,
      hasProse: spec.sections.some((section) => Boolean(section.heading || section.body || section.items?.length)),
    },
  });
}

function Pill({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'good' | 'warn' }) {
  const colour =
    tone === 'good'
      ? 'border-[#7dd3a0]/40 text-[#7dd3a0]'
      : tone === 'warn'
        ? 'border-amber-400/40 text-amber-300'
        : 'border-white/15';

  return <span className={`rounded-full border px-2.5 py-1 text-[11px] ${colour}`}>{children}</span>;
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-5 mb-2 text-xs uppercase tracking-widest text-white/40">{children}</h3>;
}

export default function CampaignStudio() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const plan = data.copy.plan;

  return (
    <main className="min-h-screen bg-[#0b0f14] text-white p-4 md:p-6 flex flex-col gap-4">
      <header className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
        <p className="m-0 text-[11px] uppercase tracking-[0.18em] text-[#7dd3a0] font-bold">
          iThinq campaign studio &#183; engineering review surface
        </p>
        <h1 className="m-0 mt-1 text-xl md:text-2xl font-semibold tracking-tight">
          Approved facts in. Finished campaign out.
        </h1>

        <Form method="get" className="mt-3 flex flex-col md:flex-row gap-2">
          <input
            type="text"
            name="brief"
            defaultValue={data.brief}
            aria-label="Campaign request"
            className="flex-1 rounded-xl bg-black/30 border border-white/15 px-4 py-3 text-sm outline-none focus:border-[#7dd3a0]"
          />
          <select
            name="spec"
            defaultValue={data.specId}
            aria-label="Source document"
            className="rounded-xl bg-black/30 border border-white/15 px-3 py-3 text-sm outline-none focus:border-[#7dd3a0]"
          >
            {data.documents.map((document) => (
              <option key={document.id} value={document.id}>
                {document.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-[#7dd3a0] text-[#0b0f14] px-5 py-3 text-sm font-bold disabled:opacity-60"
          >
            {busy ? 'Writing…' : 'Write the campaign'}
          </button>
        </Form>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {data.presets.map((preset) => (
            <a
              key={preset.id}
              className="rounded-full border border-white/15 px-3 py-1.5 hover:bg-white/10"
              href={`/ithinq/campaign?brief=${encodeURIComponent(preset.instruction)}&spec=${encodeURIComponent(data.specId)}`}
            >
              {preset.label}
            </a>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Pill>{data.modelInterpreted ? `interpreted by ${data.textModel}` : 'deterministic interpretation'}</Pill>
          <Pill tone={data.copy.generated ? 'good' : 'warn'}>
            {data.copy.generated ? `authored by ${data.textModel}` : 'document copy (no model)'}
          </Pill>
          <Pill tone={data.copy.audited ? 'good' : 'warn'}>
            {data.copy.audited ? 'claim audit ran' : 'claim audit did not run'}
          </Pill>
          <Pill>
            images: {data.imageModel}
            {data.syntheticImages ? ' (placeholder)' : ''}
          </Pill>
          <Pill>
            fields accepted {data.copy.accepted} · rejected {data.copy.rejected}
          </Pill>
          <Pill tone={data.document.hasProse ? 'plain' : 'good'}>
            {data.document.hasProse ? 'document carries prose' : 'document carries no prose'}
          </Pill>
        </div>
      </header>

      <section className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-4 flex-1 min-h-0">
        <aside className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm overflow-auto max-h-[calc(100vh-280px)]">
          {plan && (
            <>
              <h2 className="m-0 text-sm font-semibold">Campaign the model decided on</h2>
              <dl className="mt-2 text-xs space-y-2">
                {(
                  [
                    ['Angle', plan.angle],
                    ['Promise', plan.promise],
                    ['Framework', plan.framework],
                    ['Reader awareness', plan.awarenessLevel],
                    ['Length', plan.lengthTreatment],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-white/40">{label}</dt>
                    <dd className="m-0 mt-0.5 text-white/80">{value}</dd>
                  </div>
                ))}
              </dl>
              {plan.objections.length > 0 && (
                <>
                  <dt className="text-white/40 text-xs mt-2">Objections it chose to meet</dt>
                  <ul className="mt-1 mb-0 pl-4 text-xs text-white/70">
                    {plan.objections.map((objection) => (
                      <li key={objection}>{objection}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          <Heading>
            Approved facts &#183; {data.factSet.facts.length} &#183; {data.factSet.authority}
          </Heading>
          <p className="m-0 mb-2 text-[11px] text-white/50">{data.factSet.subject}</p>
          {data.factSet.facts.map((fact) => (
            <p key={fact.ref} className="m-0 mb-1.5 text-[11px] text-white/70">
              <span className="text-white/35">{fact.kind}</span> · {fact.text}
            </p>
          ))}
          {data.coverage.unresolvedRefs.length > 0 && (
            <p className="m-0 mt-2 text-[11px] text-amber-300">
              {data.coverage.unresolvedRefs.length} reference(s) in the document resolve to no approved fact.
            </p>
          )}

          <Heading>Document vs authored</Heading>
          <div className="rounded-xl bg-black/25 px-3 py-2 text-xs">
            <div className="text-white/40">document headline</div>
            <div className="text-white/60 mt-0.5">{data.document.headline}</div>
            <div className="text-white/40 mt-2">authored headline</div>
            <div className="text-[#7dd3a0] mt-0.5">{data.copy.overlay.headline ?? '(kept document copy)'}</div>
            <div className="text-white/40 mt-2">authored subheadline</div>
            <div className="text-[#7dd3a0] mt-0.5">{data.copy.overlay.subheadline ?? '(kept document copy)'}</div>
          </div>

          <Heading>Beats, and what each rests on</Heading>
          {data.copy.overlay.sections.map((section) => (
            <div key={section.index} className="mb-2 rounded-xl bg-black/25 px-3 py-2 text-[11px]">
              <div className="text-white/40">
                #{section.index} · {section.factRefs.length} fact(s)
              </div>
              {section.intent && <div className="text-white/50 mt-0.5 italic">{section.intent}</div>}
              {section.heading && <div className="text-white/80 mt-1">{section.heading}</div>}
              {section.body && <div className="text-white/60 mt-0.5">{section.body}</div>}
              {(section.items ?? []).map((item) => (
                <div key={item} className="text-white/60 mt-0.5">
                  — {item}
                </div>
              ))}
              {(section.qa ?? []).map((pair) => (
                <div key={pair.question} className="text-white/60 mt-1">
                  <strong className="text-white/75">{pair.question}</strong> {pair.answer}
                </div>
              ))}
            </div>
          ))}

          {data.copy.findings.length > 0 && (
            <>
              <h3 className="mt-5 mb-2 text-xs uppercase tracking-widest text-amber-300">
                Guard and audit rejections ({data.copy.findings.length})
              </h3>
              {data.copy.findings.map((finding, index) => (
                <p key={`${finding.field}-${index}`} className="m-0 mb-1 text-[11px] text-amber-200">
                  <strong>{finding.field}</strong> ({finding.code}): {finding.detail}
                </p>
              ))}
            </>
          )}

          <Heading>
            Imagery ({data.assets.length}/{data.needs.length})
          </Heading>
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
              <h3 className="mt-4 mb-2 text-xs uppercase tracking-widest text-amber-300">Image failures</h3>
              {data.failures.map((failure, index) => (
                <p key={`${failure.id}-${index}`} className="m-0 mb-1 text-[11px] text-amber-200">
                  <strong>{failure.id}</strong>: {failure.detail}
                </p>
              ))}
            </>
          )}
        </aside>

        <div className="rounded-2xl overflow-hidden bg-white border border-white/10 min-h-[760px]">
          <iframe
            key={data.query}
            title="Generated campaign page"
            src={`/ithinq/campaign-preview${data.query}`}
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            className="block w-full h-[calc(100vh-280px)] min-h-[760px] border-0"
          />
        </div>
      </section>
    </main>
  );
}
