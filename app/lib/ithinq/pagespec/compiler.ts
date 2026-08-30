import type { Cta, PageSpec, PageSpecSection } from '@ithinq-pagespec/page-spec';
import type { ProjectManifest } from './runtime';
import { requireValidPageSpec, type PageSpecValidationOptions } from './validator';

export const PAGESPEC_COMPILER_VERSION = 'ithinq-pagespec-renderer-poc/0.1.0';
export const PAGESPEC_CONTRACT_SOURCE =
  'globalvoice1444/ithinq-partner-network@51c103ff2492b068095dc356225d5d9ef496b44b';

export interface CompilePageSpecResult {
  manifest: ProjectManifest;
  validation: ReturnType<typeof requireValidPageSpec>['validation'];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }

  return value;
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function renderCta(cta: Cta, variant: 'primary' | 'secondary'): string {
  return `<a class="button button--${variant}" href="${escapeHtml(cta.url)}" target="_blank" rel="noreferrer">${escapeHtml(cta.label)}<span aria-hidden="true">↗</span></a>`;
}

function renderAsset(section: PageSpecSection): string {
  if (!section.asset) {
    return '';
  }

  return `<figure class="asset"><img src="${escapeHtml(section.asset.url)}" alt="${escapeHtml(section.asset.alt)}" loading="lazy"></figure>`;
}

function renderProse(section: PageSpecSection, index: number): string {
  return [
    `<section class="story-section story-section--${escapeHtml(section.kind)} emphasis-${escapeHtml(section.emphasis ?? 'support')}" data-purpose="${escapeHtml(section.purpose)}" data-section-index="${index}">`,
    `<span class="number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>`,
    '<div class="copy">',
    section.eyebrow ? `<p class="eyebrow">${escapeHtml(section.eyebrow)}</p>` : '',
    section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : '',
    section.body ? `<p class="body-copy">${escapeHtml(section.body)}</p>` : '',
    '</div>',
    renderAsset(section),
    '</section>',
  ].join('');
}

function renderFit(section: PageSpecSection, index: number): string {
  const items = (section.items ?? [])
    .map((item) => `<li><span aria-hidden="true">✓</span><span>${escapeHtml(item)}</span></li>`)
    .join('');

  return [
    `<section class="fit-card emphasis-${escapeHtml(section.emphasis ?? 'support')}" data-purpose="${escapeHtml(section.purpose)}" data-section-index="${index}">`,
    `<span class="number">${String(index + 1).padStart(2, '0')}</span>`,
    section.eyebrow ? `<p class="eyebrow">${escapeHtml(section.eyebrow)}</p>` : '',
    section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : '',
    `<ul>${items}</ul>`,
    '</section>',
  ].join('');
}

function renderFaq(section: PageSpecSection, index: number): string {
  const items = (section.qa ?? [])
    .map((item, itemIndex) =>
      [
        `<details${itemIndex === 0 ? ' open' : ''}>`,
        `<summary><span>${escapeHtml(item.question)}</span><span aria-hidden="true">+</span></summary>`,
        `<p>${escapeHtml(item.answer)}</p>`,
        '</details>',
      ].join(''),
    )
    .join('');

  return [
    `<section class="faq emphasis-${escapeHtml(section.emphasis ?? 'support')}" data-purpose="${escapeHtml(section.purpose)}" data-section-index="${index}">`,
    `<div><span class="number">${String(index + 1).padStart(2, '0')}</span>`,
    section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : '',
    '</div>',
    `<div class="faq-list">${items}</div>`,
    '</section>',
  ].join('');
}

function renderSection(section: PageSpecSection, index: number): string {
  if (section.kind === 'vertical_fit') {
    return renderFit(section, index);
  }

  if (section.kind === 'faq') {
    return renderFaq(section, index);
  }

  return renderProse(section, index);
}

function renderDisclosure(spec: PageSpec, placement: 'header' | 'inline' | 'footer'): string {
  if ((spec.disclosure.placement ?? 'footer') !== placement) {
    return '';
  }

  return `<aside class="disclosure disclosure--${placement}" aria-label="Partner disclosure">${escapeHtml(spec.disclosure.text)}</aside>`;
}

function renderPage(spec: PageSpec, skipped: Set<number>): string {
  const sections = spec.sections
    .map((section, index) => (skipped.has(index) ? '' : renderSection(section, index)))
    .join('');
  const primary = renderCta(spec.ctas.primary, 'primary');
  const secondary = spec.ctas.secondary ? renderCta(spec.ctas.secondary, 'secondary') : '';
  const identity = [spec.partner.displayName, spec.partner.businessName].filter(Boolean).join(' · ');

  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(spec.page.name)}</title><style>${LANDING_PAGE_CSS}</style></head><body>`,
    '<a class="skip" href="#content">Skip to content</a>',
    renderDisclosure(spec, 'header'),
    '<header class="site-header"><span class="mark" aria-hidden="true"><i></i><i></i><i></i></span>',
    `<strong>${escapeHtml(spec.page.name)}</strong>`,
    identity ? `<span class="partner">${escapeHtml(identity)}</span>` : '',
    '</header><main id="content">',
    '<section class="hero"><div class="hero-copy">',
    `<p class="audience">${escapeHtml(spec.page.audience)}</p>`,
    `<h1>${escapeHtml(spec.page.headline)}</h1>`,
    `<p class="subheadline">${escapeHtml(spec.page.subheadline)}</p>`,
    spec.partner.introduction ? `<p class="introduction">${escapeHtml(spec.partner.introduction)}</p>` : '',
    `<div class="actions">${primary}${secondary}</div></div>`,
    '<div class="visual" aria-hidden="true"><div class="ring ring-a"></div><div class="ring ring-b"></div>',
    '<div class="call-card"><b></b><i></i><i></i><i></i></div></div></section>',
    `<div class="story">${sections}</div>`,
    renderDisclosure(spec, 'inline'),
    '<section class="closing">',
    `<p class="audience">${escapeHtml(spec.page.audience)}</p>`,
    `<h2>${escapeHtml(spec.page.headline)}</h2>`,
    `<p>${escapeHtml(spec.page.subheadline)}</p><div class="actions">${primary}${secondary}</div>`,
    '</section></main><footer>',
    identity ? `<strong>${escapeHtml(identity)}</strong>` : '',
    renderDisclosure(spec, 'footer'),
    '</footer></body></html>',
  ].join('');
}

export function compilePageSpecToProjectManifest(
  input: unknown,
  options?: PageSpecValidationOptions,
): CompilePageSpecResult {
  const { spec, validation } = requireValidPageSpec(input, options);
  const metadata = {
    compiler: PAGESPEC_COMPILER_VERSION,
    contract: 'PageSpec 1.0' as const,
    contractSource: PAGESPEC_CONTRACT_SOURCE,
    pageReference: spec.page.reference,
  };
  const manifest: ProjectManifest = {
    manifestVersion: 1,
    entry: '/index.html',
    files: {
      '/index.html': renderPage(spec, new Set(validation.skipSections)),
      '/pagespec.json': canonicalJson(spec),
      '/renderer.json': canonicalJson(metadata),
    },
    metadata,
  };

  return { manifest, validation };
}

const LANDING_PAGE_CSS = `
:root{--ink:#10211d;--forest:#153c32;--mint:#c9ff72;--paper:#f4f0e7;--card:#fffdf8;--line:rgba(16,33,29,.14);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--paper)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);line-height:1.55}.skip{position:fixed;left:1rem;top:1rem;z-index:20;padding:.7rem 1rem;background:white;transform:translateY(-200%)}.skip:focus{transform:none}
.site-header{height:76px;padding:0 clamp(20px,5vw,76px);display:flex;align-items:center;gap:14px;border-bottom:1px solid var(--line);background:rgba(244,240,231,.92)}.site-header strong{font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.partner{margin-left:auto;border:1px solid var(--line);border-radius:999px;padding:8px 12px;font-size:.75rem;font-weight:700}.mark{display:flex;align-items:end;gap:3px;width:24px;height:24px}.mark i{width:6px;height:10px;background:var(--forest);border-radius:4px}.mark i:nth-child(2){height:18px}.mark i:nth-child(3){height:24px;background:#78b83e}
.hero{min-height:720px;padding:clamp(72px,9vw,140px) clamp(20px,7vw,110px);display:grid;grid-template-columns:minmax(0,1.1fr) minmax(300px,.9fr);gap:clamp(44px,7vw,120px);align-items:center;background:radial-gradient(circle at 78% 35%,rgba(201,255,114,.22),transparent 27%),linear-gradient(135deg,#0d2721,#194638);color:white;overflow:hidden}.hero-copy{max-width:800px}.audience,.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:.72rem;font-weight:800}.audience{color:var(--mint);margin:0 0 22px}.hero h1{font-size:clamp(3rem,6.3vw,6.7rem);line-height:.96;letter-spacing:-.065em;margin:0;text-wrap:balance}.subheadline{font-size:clamp(1.08rem,1.7vw,1.4rem);max-width:720px;color:rgba(255,255,255,.73);margin:28px 0 0}.introduction{max-width:620px;border-left:2px solid var(--mint);padding-left:18px;color:rgba(255,255,255,.86)}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:36px}.button{min-height:52px;padding:0 20px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;gap:12px;text-decoration:none;font-weight:800;transition:transform .18s}.button:hover{transform:translateY(-2px)}.button:focus-visible{outline:3px solid white;outline-offset:3px}.button--primary{background:var(--mint);color:var(--ink)}.button--secondary{border:1px solid rgba(255,255,255,.32);color:white;background:rgba(255,255,255,.06)}
.visual{height:500px;position:relative;display:grid;place-items:center}.ring{position:absolute;border:1px solid rgba(201,255,114,.23);border-radius:50%}.ring-a{width:430px;height:430px}.ring-b{width:310px;height:310px}.call-card{width:min(320px,82%);aspect-ratio:4/5;border-radius:36px;background:linear-gradient(160deg,#fff,#e8f7e5);box-shadow:0 42px 100px rgba(0,0,0,.35);transform:rotate(5deg);padding:46px 36px;display:flex;flex-direction:column;gap:22px}.call-card b{width:66px;height:66px;border-radius:50%;background:var(--mint);box-shadow:0 0 0 14px rgba(201,255,114,.24)}.call-card i{height:12px;border-radius:99px;width:76%;background:rgba(21,60,50,.15)}.call-card i:nth-of-type(1){margin-top:36px;width:100%;height:18px;background:var(--forest)}.call-card i:last-child{width:52%}
.story{max-width:1260px;margin:auto;padding:clamp(72px,9vw,140px) clamp(20px,4vw,54px)}.story-section{display:grid;grid-template-columns:70px minmax(0,1fr) minmax(0,.6fr);gap:clamp(22px,5vw,72px);padding:clamp(56px,7vw,96px) 0;border-bottom:1px solid var(--line)}.number{font:800 .75rem/1 ui-monospace,monospace;color:#7d8d87}.copy{max-width:760px}.eyebrow{color:#547065;margin:0 0 16px}h2{font-size:clamp(2rem,4vw,4.4rem);line-height:1.02;letter-spacing:-.055em;margin:0;text-wrap:balance}.body-copy{font-size:clamp(1.03rem,1.5vw,1.22rem);color:#40534d;margin:24px 0 0;max-width:72ch}.asset img{width:100%;height:auto;border-radius:24px}.story-section--mechanism{background:var(--card);margin-inline:clamp(-22px,-3vw,-48px);padding-inline:clamp(22px,3vw,48px);border:1px solid var(--line);border-radius:32px;box-shadow:0 28px 80px rgba(13,38,31,.14)}.story-section--risk{background:#fff6d9;border:1px solid #d7b66d;border-radius:28px;padding-inline:clamp(22px,3vw,48px)}
.fit-card{background:var(--forest);color:white;border-radius:32px;padding:clamp(30px,5vw,64px);margin:28px 0;box-shadow:0 28px 80px rgba(13,38,31,.14)}.fit-card h2{margin-top:26px;max-width:17ch}.fit-card ul{list-style:none;padding:0;margin:38px 0 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.fit-card li{display:flex;gap:12px;padding:16px;border-top:1px solid rgba(255,255,255,.16);color:rgba(255,255,255,.82)}.fit-card li>span:first-child{color:var(--mint)}
.faq{padding:clamp(70px,9vw,130px) 0;display:grid;grid-template-columns:minmax(240px,.7fr) minmax(0,1.3fr);gap:clamp(36px,7vw,100px)}.faq .number{display:block;margin-bottom:22px}.faq-list{border-top:1px solid var(--line)}details{border-bottom:1px solid var(--line);padding:22px 0}summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:20px;font-weight:800}summary::-webkit-details-marker{display:none}details p{color:#60716c;max-width:68ch;margin:18px 44px 0 0}
.closing{margin:0 clamp(16px,3vw,44px) clamp(16px,3vw,44px);padding:clamp(60px,9vw,130px) clamp(24px,7vw,100px);background:var(--mint);border-radius:36px;text-align:center}.closing .audience{color:#38552f}.closing h2{max-width:1000px;margin:auto}.closing>p:not(.audience){max-width:700px;margin:26px auto;color:#3b5138}.closing .actions{justify-content:center}.closing .button--primary{background:var(--forest);color:white}.closing .button--secondary{border-color:rgba(16,33,29,.28);color:var(--ink)}footer{padding:40px clamp(20px,7vw,110px) 54px;display:grid;gap:16px;color:#60716c;font-size:.8rem}.disclosure{font-size:.76rem}.disclosure--header{padding:10px 20px;background:#fff6d9;text-align:center}.disclosure--inline{max-width:1150px;margin:0 auto 50px;padding:18px;border:1px solid var(--line);border-radius:14px}
@media(max-width:860px){.hero{grid-template-columns:1fr;min-height:auto}.visual{height:330px}.ring-a{width:300px;height:300px}.ring-b{width:220px;height:220px}.call-card{width:210px;padding:32px 26px}.story-section{grid-template-columns:50px 1fr}.asset{grid-column:2}.faq{grid-template-columns:1fr}.fit-card ul{grid-template-columns:1fr}}
@media(max-width:560px){.site-header{height:64px}.site-header strong{max-width:54vw}.partner{display:none}.hero{padding-block:72px}.hero h1{font-size:clamp(2.7rem,14vw,4.2rem)}.visual{display:none}.story{padding-top:62px}.story-section{grid-template-columns:1fr;gap:18px}.asset{grid-column:auto}.story-section--mechanism{margin-inline:0}.fit-card,.closing{border-radius:24px}.button{width:100%}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.button{transition:none}}
`;
