import type { Cta, PageSpec, PageSpecSection } from '@ithinq-pagespec/page-spec';
import type { CreativeDirection } from './directions';
import { buildStylesheet } from './stylesheet';
import type { CreativePresentationPlan, SectionPresentation } from './types';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function attr(name: string, value: string): string {
  return `${name}="${escapeHtml(value)}"`;
}

function ordinal(index: number): string {
  return String(index + 1).padStart(2, '0');
}

/**
 * Render a CTA exactly as supplied.
 *
 * The URL is emitted verbatim, escaped for HTML context only. It is never
 * appended to, shortened, proxied or re-signed: on an attribution-carrying
 * link that would destroy the Partner's commission.
 */
function renderCta(cta: Cta, variant: 'primary' | 'secondary'): string {
  return [
    `<a class="button button--${variant}" ${attr('href', cta.url)} target="_blank" rel="noreferrer noopener">`,
    escapeHtml(cta.label),
    '<span aria-hidden="true">&#8599;</span>',
    '</a>',
  ].join('');
}

function renderActions(spec: PageSpec): string {
  const primary = renderCta(spec.ctas.primary, 'primary');
  const secondary = spec.ctas.secondary ? renderCta(spec.ctas.secondary, 'secondary') : '';

  return `<div class="actions">${primary}${secondary}</div>`;
}

/**
 * Renderer-local generated imagery, resolved by AssetNeed id.
 *
 * Structurally like a contract `Asset` but deliberately a separate channel:
 * generated creative never enters the PageSpec, and its media origin is
 * governed by media trust rather than by navigation trust.
 */
/**
 * Renderer-local presentation copy.
 *
 * Structurally unable to address the disclosure, the CTAs or Partner
 * identity: those fields simply do not exist here, so no overlay can reach
 * them. Absent fields fall back to the PageSpec, which remains untouched.
 */
export interface CopyText {
  headline?: string;
  subheadline?: string;
  audience?: string;
  sections: ReadonlyArray<{ index: number; eyebrow?: string; heading?: string; body?: string }>;
}

export interface GeneratedMedia {
  assetNeedId: string;
  url: string;
  alt: string;
}

/** Assets are references. The URL and alt text are rendered exactly as given. */
function renderAssetImage(asset: { url: string; alt: string }, className: string): string {
  const loading = className === 'hero__media' ? '' : ' loading="lazy" decoding="async"';

  return `<figure class="${className}"><img ${attr('src', asset.url)} ${attr('alt', asset.alt)}${loading}></figure>`;
}

function renderHead(
  section: PageSpecSection,
  presentation: SectionPresentation,
  showIndex: boolean,
  copy?: { eyebrow?: string; heading?: string },
): string {
  const parts: string[] = [];

  if (showIndex) {
    parts.push(`<span class="index-mark" aria-hidden="true">${ordinal(presentation.sourceIndex)}</span>`);
  }

  const eyebrow = copy?.eyebrow ?? section.eyebrow;
  const heading = copy?.heading ?? section.heading;

  if (eyebrow) {
    parts.push(`<p class="eyebrow">${escapeHtml(eyebrow)}</p>`);
  }

  if (heading) {
    parts.push(`<h2 class="section-heading">${escapeHtml(heading)}</h2>`);
  }

  return parts.length > 0 ? `<div class="section__head">${parts.join('')}</div>` : '';
}

function renderBody(section: PageSpecSection, presentation: SectionPresentation, override?: string): string {
  const body = override ?? section.body;

  if (!body) {
    return '';
  }

  if (presentation.layout === 'pull-quote') {
    return `<blockquote class="pull-quote">${escapeHtml(body)}</blockquote>`;
  }

  /* A drop cap needs a paragraph to sit in; short copy is marked so it is skipped. */
  const long = body.length >= 180 ? ' prose--long' : '';

  return `<div class="prose${long}"><p class="section-body">${escapeHtml(body)}</p></div>`;
}

/**
 * Items always render.
 *
 * The layout decides the arrangement — cards, a numbered flow, a rail — but a
 * section never loses its items because a direction preferred a different
 * composition.
 */
function renderItems(section: PageSpecSection, presentation: SectionPresentation): string {
  const items = section.items ?? [];

  if (items.length === 0) {
    return '';
  }

  const { layout } = presentation;

  if (layout === 'cards' || layout === 'comparison-grid') {
    const cards = items
      .map(
        (item, index) =>
          `<li class="card"><span class="card__marker" aria-hidden="true">${ordinal(index)}</span>` +
          `<p>${escapeHtml(item)}</p></li>`,
      )
      .join('');

    return `<ul class="card-grid">${cards}</ul>`;
  }

  if (layout === 'numbered-flow') {
    const steps = items
      .map(
        (item, index) =>
          `<li class="flow__step"><span class="flow-step__index" aria-hidden="true">${index + 1}</span>` +
          `<span class="flow__text">${escapeHtml(item)}</span></li>`,
      )
      .join('');

    return `<ol class="flow">${steps}</ol>`;
  }

  const rows = items
    .map(
      (item) =>
        `<li class="rail__item"><span class="rail__bullet" aria-hidden="true">&#8212;</span>` +
        `<span>${escapeHtml(item)}</span></li>`,
    )
    .join('');

  return `<ul class="rail">${rows}</ul>`;
}

function renderQa(section: PageSpecSection, presentation: SectionPresentation): string {
  const qa = section.qa ?? [];

  if (qa.length === 0) {
    return '';
  }

  if (presentation.layout === 'qa-two-column') {
    const cells = qa
      .map(
        (item) => `<div class="qa-item"><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p></div>`,
      )
      .join('');

    return `<div class="qa-grid">${cells}</div>`;
  }

  const rows = qa
    .map(
      (item, index) =>
        `<details${index === 0 ? ' open' : ''}><summary>${escapeHtml(item.question)}</summary>` +
        `<p>${escapeHtml(item.answer)}</p></details>`,
    )
    .join('');

  return `<div class="faq">${rows}</div>`;
}

function shellClass(presentation: SectionPresentation): string {
  if (presentation.width === 'narrow') {
    return 'shell shell--narrow';
  }

  if (presentation.width === 'full') {
    return 'shell shell--full';
  }

  return 'shell';
}

function renderSection(
  spec: PageSpec,
  presentation: SectionPresentation,
  showIndex: boolean,
  media: ReadonlyMap<string, GeneratedMedia>,
  copy?: CopyText,
): string {
  const section = spec.sections[presentation.sourceIndex];

  if (!section) {
    return '';
  }

  const sectionCopy = copy?.sections.find((item) => item.index === presentation.sourceIndex);

  const generated = presentation.generatedAssetNeedId ? media.get(presentation.generatedAssetNeedId) : undefined;

  let splitFlavour = 'none';
  const head = renderHead(section, presentation, showIndex, sectionCopy);
  const body = renderBody(section, presentation, sectionCopy?.body);
  const items = renderItems(section, presentation);
  const qa = renderQa(section, presentation);
  const image = section.asset ?? generated;
  const hasAsset = Boolean(image) && presentation.media !== 'none';

  let inner: string;

  if (presentation.layout === 'editorial-split') {
    const mediaFigure = hasAsset && image ? renderAssetImage(image, 'layout__media') : '';
    const aside = items || qa;

    /*
     * A split composition must fill both columns. With an asset it is copy
     * beside media; with items or Q&A it is copy beside those; with neither it
     * becomes a genuine editorial split of heading against body. It never
     * renders an empty column.
     */
    let left: string;
    let right: string;
    let trailing = '';
    splitFlavour = mediaFigure ? 'media' : aside ? 'aside' : 'prose';

    if (mediaFigure) {
      left = `<div class="layout__copy measure">${head}${body}</div>`;
      right = mediaFigure;
      trailing = `${items}${qa}`;
    } else if (aside) {
      left = `<div class="layout__copy measure">${head}${body}</div>`;
      right = `<div class="layout__aside">${aside}</div>`;
    } else {
      left = `<div class="layout__copy">${head}</div>`;
      right = `<div class="layout__aside measure">${body}</div>`;
    }

    inner =
      presentation.media === 'leading'
        ? `<div class="layout">${right}${left}</div>${trailing}`
        : `<div class="layout">${left}${right}</div>${trailing}`;
  } else if (presentation.layout === 'media-full-bleed' && image) {
    inner = `${head}${body}${items}${qa}`;
  } else {
    const inset = hasAsset && image ? renderAssetImage(image, 'media-inset') : '';
    inner = `${head}${body}${items}${qa}${inset}`;
  }

  const attrs = [
    'class="section section--' +
      escapeHtml(String(presentation.kind)) +
      (presentation.promoted ? ' section--promoted' : '') +
      ' band-' +
      presentation.band +
      '"',
    attr('id', `section-${presentation.sourceIndex}`),
    attr('data-layout', presentation.layout),
    attr('data-kind', String(presentation.kind)),
    attr('data-purpose', section.purpose),
    attr('data-emphasis', presentation.emphasis),
    attr('data-band', presentation.band),
    attr('data-mirrored', String(presentation.mirrored)),
    attr('data-split', splitFlavour),
    attr('data-section-index', String(presentation.sourceIndex)),
  ].join(' ');

  const chapter = presentation.chapterStart ? '<hr class="chapter-rule">' : '';
  const fullBleed =
    presentation.media === 'full-bleed' && section.asset ? renderAssetImage(section.asset, 'media-full-bleed') : '';

  return `${chapter}<section ${attrs}>${fullBleed}<div class="${shellClass(presentation)}">${inner}</div></section>`;
}

function renderHero(
  spec: PageSpec,
  plan: CreativePresentationPlan,
  generatedMedia: ReadonlyMap<string, GeneratedMedia>,
  copyText?: CopyText,
): string {
  const identity = [spec.partner.displayName, spec.partner.businessName].filter(Boolean).join(' · ');
  const heroAsset =
    plan.hero.mediaSourceIndex !== null
      ? spec.sections[plan.hero.mediaSourceIndex]?.asset
      : plan.hero.generatedAssetNeedId
        ? generatedMedia.get(plan.hero.generatedAssetNeedId)
        : undefined;
  const media = heroAsset ? renderAssetImage(heroAsset, 'hero__media') : '';

  const copy = [
    '<div class="hero__copy">',
    `<p class="eyebrow audience">${escapeHtml(copyText?.audience ?? spec.page.audience)}</p>`,
    `<h1>${escapeHtml(copyText?.headline ?? spec.page.headline)}</h1>`,
    `<p class="lede">${escapeHtml(copyText?.subheadline ?? spec.page.subheadline)}</p>`,
    spec.partner.introduction ? `<p class="introduction">${escapeHtml(spec.partner.introduction)}</p>` : '',
    renderActions(spec),
    '</div>',
  ].join('');

  const grid =
    plan.hero.media === 'trailing' && media
      ? `<div class="hero__grid">${copy}${media}</div>`
      : `<div class="hero__grid">${media}${copy}</div>`;

  return [
    `<section class="hero band-${plan.hero.band}" ${attr('data-hero', plan.hero.variant)} aria-labelledby="page-headline">`,
    `<div class="shell">${grid}</div>`,
    '</section>',
    identity ? '' : '',
  ].join('');
}

function renderClosing(spec: PageSpec, plan: CreativePresentationPlan, copyText?: CopyText): string {
  const { treatment } = plan.closing;
  const copy = [
    `<p class="eyebrow">${escapeHtml(copyText?.audience ?? spec.page.audience)}</p>`,
    `<h2 class="section-heading">${escapeHtml(copyText?.headline ?? spec.page.headline)}</h2>`,
    `<p class="section-body">${escapeHtml(copyText?.subheadline ?? spec.page.subheadline)}</p>`,
  ].join('');

  const inner =
    treatment === 'split'
      ? `<div class="closing__grid"><div class="measure">${copy}</div>${renderActions(spec)}</div>`
      : `<div class="measure">${copy}</div>${renderActions(spec)}`;

  return [
    `<section class="section closing closing--${treatment} band-${plan.closing.band}" ${attr('data-cta', treatment)}>`,
    `<div class="shell">${inner}</div>`,
    '</section>',
  ].join('');
}

function renderDisclosure(spec: PageSpec, placement: 'header' | 'inline' | 'footer'): string {
  if ((spec.disclosure.placement ?? 'footer') !== placement) {
    return '';
  }

  return (
    `<aside class="disclosure disclosure--${placement}" aria-label="Partner disclosure">` +
    `${escapeHtml(spec.disclosure.text)}</aside>`
  );
}

/**
 * Compose the complete document.
 *
 * Sections are emitted in PageSpec array order. The contract states that order
 * is authored and must not be reordered, merged or split, so presentation
 * varies the treatment of each section, never its position.
 */
export function composeDocument(
  spec: PageSpec,
  plan: CreativePresentationPlan,
  direction: CreativeDirection,
  generatedMedia: readonly GeneratedMedia[] = [],
  copy?: CopyText,
): string {
  const mediaByNeed = new Map(generatedMedia.map((item) => [item.assetNeedId, item]));
  const identity = [spec.partner.displayName, spec.partner.businessName].filter(Boolean).join(' · ');
  const showIndex = direction.id === 'editorial-luxe' || direction.id === 'service-bold';
  const sections = plan.sections
    .map((presentation) => renderSection(spec, presentation, showIndex, mediaByNeed, copy))
    .join('');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(spec.page.name)}</title>`,
    `<style>${buildStylesheet(direction, plan)}</style>`,
    '</head>',
    `<body ${attr('data-direction', plan.directionId)} ${attr('data-card', plan.cardStyle)} ` +
      `${attr('data-density', plan.density)} ${attr('data-motion', plan.motion)}>`,
    '<a class="skip" href="#content">Skip to content</a>',
    renderDisclosure(spec, 'header'),
    '<header class="site-header"><div class="shell" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">',
    `<span class="site-header__name">${escapeHtml(spec.page.name)}</span>`,
    identity ? `<span class="identity">${escapeHtml(identity)}</span>` : '',
    '</div></header>',
    '<main id="content">',
    renderHero(spec, plan, mediaByNeed, copy).replace('<h1>', '<h1 id="page-headline">'),
    sections,
    renderDisclosure(spec, 'inline'),
    renderClosing(spec, plan, copy),
    '</main>',
    '<footer class="site-footer"><div class="shell">',
    identity ? `<strong>${escapeHtml(identity)}</strong>` : '',
    renderDisclosure(spec, 'footer'),
    '</div></footer>',
    '</body>',
    '</html>',
  ].join('');
}
