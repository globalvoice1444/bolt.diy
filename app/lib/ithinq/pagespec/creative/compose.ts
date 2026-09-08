import type { Cta, PageSpec, PageSpecSection, ProofQuote } from '@ithinq-pagespec/page-spec';
import { effectiveSection, sectionCopyAt, type CopyText } from './copy-text';
import type { CreativeDirection } from './directions';
import { isEmptyProof } from './plan';
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

export type { CopyText, SectionCopyText } from './copy-text';

/**
 * Renderer-local generated imagery, resolved by AssetNeed id.
 *
 * Structurally like a contract `Asset` but deliberately a separate channel:
 * generated creative never enters the PageSpec, and its media origin is
 * governed by media trust rather than by navigation trust.
 */
export interface GeneratedMedia {
  assetNeedId: string;
  url: string;
  alt: string;
}

/**
 * Assets are references. The URL and alt text are rendered exactly as given.
 *
 * Always an `<img>`, never a CSS `background-image`. Generated media arrives
 * from the caller and is escaped for an attribute context here; putting an
 * untrusted URL inside a `url()` in the shared stylesheet would need a second,
 * different escaping discipline in the one place the document has no
 * per-element boundary left to contain a mistake.
 */
function renderAssetImage(asset: { url: string; alt: string }, className: string): string {
  const loading = className === 'hero__media' ? '' : ' loading="lazy" decoding="async"';

  return `<figure class="frame ${className}"><img ${attr('src', asset.url)} ${attr('alt', asset.alt)}${loading}></figure>`;
}

function renderHead(section: PageSpecSection, presentation: SectionPresentation, showIndex: boolean): string {
  const parts: string[] = [];

  if (showIndex) {
    parts.push(`<span class="index-mark" aria-hidden="true">${ordinal(presentation.sourceIndex)}</span>`);
  }

  const { eyebrow, heading } = section;

  if (eyebrow) {
    parts.push(`<p class="eyebrow">${escapeHtml(eyebrow)}</p>`);
  }

  if (heading) {
    parts.push(`<h2 class="section-heading">${escapeHtml(heading)}</h2>`);
  }

  return parts.length > 0 ? `<div class="section__head">${parts.join('')}</div>` : '';
}

function renderBody(section: PageSpecSection, presentation: SectionPresentation): string {
  const { body } = section;

  if (!body) {
    return '';
  }

  const text = escapeHtml(body);

  if (presentation.layout === 'pull-quote') {
    return `<blockquote class="pull-quote">${text}</blockquote>`;
  }

  if (presentation.layout === 'quote-panel') {
    return `<blockquote class="quote-panel"><p>${text}</p></blockquote>`;
  }

  if (presentation.layout === 'manifesto') {
    return `<p class="manifesto">${text}</p>`;
  }

  /*
   * Prose flavours, not prose surgery.
   *
   * Every treatment below keeps the body as one contiguous run of escaped
   * text. A pull-out that lifted the opening sentence into its own element
   * would read well and quietly change what the document says, so range here
   * is bought with scale, measure, columns and position instead.
   */
  const flavour =
    presentation.layout === 'column-essay'
      ? ' prose--columns'
      : presentation.layout === 'display-statement'
        ? ' prose--statement'
        : '';

  /*
   * A drop cap needs a paragraph to sit in, so short copy is marked to skip
   * it. Column-set copy skips it too: a floated capital is counted by the
   * column balancer, which leaves one column two lines shorter than the other
   * for no reason a reader can see.
   */
  const plain = presentation.layout === 'display-statement' || presentation.layout === 'column-essay';
  const long = body.length >= 180 && !plain ? ' prose--long' : '';

  return `<div class="prose${long}${flavour}"><p class="section-body">${text}</p></div>`;
}

/**
 * Items always render.
 *
 * The layout decides the arrangement — cards, a mosaic, a metric row, a
 * ledger, a numbered flow, a rail — but a section never loses an item because
 * a composition preferred a different shape, and no arrangement ever pads the
 * list to fill itself. Every branch below consumes the whole array.
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

  if (layout === 'bento-mosaic') {
    const cells = items
      .map(
        (item, index) =>
          `<li class="mosaic__cell"><span class="mosaic__index" aria-hidden="true">${ordinal(index)}</span>` +
          `<p>${escapeHtml(item)}</p></li>`,
      )
      .join('');

    return `<ul class="mosaic">${cells}</ul>`;
  }

  if (layout === 'stat-band') {
    const stats = items
      .map(
        (item, index) =>
          `<li class="stat"><span class="stat__index" aria-hidden="true">${ordinal(index)}</span>` +
          `<p class="stat__value">${escapeHtml(item)}</p></li>`,
      )
      .join('');

    return `<ul class="stats">${stats}</ul>`;
  }

  if (layout === 'ledger') {
    const rows = items
      .map(
        (item, index) =>
          `<li class="ledger__row"><span class="ledger__index" aria-hidden="true">${ordinal(index)}</span>` +
          `<span class="ledger__text">${escapeHtml(item)}</span></li>`,
      )
      .join('');

    return `<ol class="ledger">${rows}</ol>`;
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

  /*
   * Native disclosure. The compiled document carries no JavaScript at all —
   * `<details>` is what makes an accordion possible without any.
   */
  const rows = qa
    .map(
      (item, index) =>
        `<details${index === 0 ? ' open' : ''}><summary>${escapeHtml(item.question)}</summary>` +
        `<p>${escapeHtml(item.answer)}</p></details>`,
    )
    .join('');

  return `<div class="faq">${rows}</div>`;
}

/** A rating, written the way it was given. Never localised, never rounded. */
function formatScore(value: number): string {
  return String(value);
}

/**
 * A rating renders only when the document gave one AND said what scale it is
 * on.
 *
 * This is a truth rule, not a style rule. `rating` is null far more often than
 * not, and null means no rating was approved — it is never zero and never a
 * default. Assuming a scale of five would be inventing the denominator of
 * somebody else's evidence, so a rating without `ratingScale` renders nothing
 * at all rather than something plausible.
 *
 * Star glyphs are drawn only where they can be honest: whole numbers on a
 * whole scale small enough to draw. A 4.5 out of 5 gets the numerals, because
 * five characters cannot say "four and a half" and rounding it up would be a
 * lie told in a font. A rating of zero takes the numerals too — a row of empty
 * outlines reads as a broken widget rather than as a score.
 */
function renderRating(quote: ProofQuote): string {
  const { rating, ratingScale } = quote;

  if (typeof rating !== 'number' || !Number.isFinite(rating)) {
    return '';
  }

  if (typeof ratingScale !== 'number' || !Number.isFinite(ratingScale)) {
    return '';
  }

  if (ratingScale < 1 || rating < 0 || rating > ratingScale) {
    return '';
  }

  const label = `Rated ${formatScore(rating)} out of ${formatScore(ratingScale)}`;
  const drawable = rating > 0 && Number.isInteger(rating) && Number.isInteger(ratingScale) && ratingScale <= 10;

  if (!drawable) {
    return `<p class="proof__rating"><span class="proof__score">${escapeHtml(label)}</span></p>`;
  }

  const glyphs = '&#9733;'.repeat(rating) + '&#9734;'.repeat(ratingScale - rating);

  return `<p class="proof__rating"><span class="proof__stars" role="img" ${attr('aria-label', label)}>${glyphs}</span></p>`;
}

/**
 * One approved quote, verbatim.
 *
 * Every word belongs to the Growth Engine: nothing here reworders, shortens,
 * truncates, merges or re-attributes. Attribution and source render when the
 * approval carried them and are absent from the document when it did not,
 * which is why each is tested for presence rather than defaulted to a
 * placeholder.
 */
function renderQuote(quote: ProofQuote): string {
  const cite: string[] = [];

  if (quote.attribution) {
    cite.push(`<span class="proof__attribution">${escapeHtml(quote.attribution)}</span>`);
  }

  if (quote.source) {
    cite.push(`<span class="proof__source">${escapeHtml(quote.source)}</span>`);
  }

  const caption = cite.length > 0 ? `<figcaption class="proof__cite">${cite.join('')}</figcaption>` : '';

  return (
    '<figure class="proof__item">' +
    renderRating(quote) +
    `<blockquote class="proof__quote"><p>${escapeHtml(quote.text)}</p></blockquote>` +
    caption +
    '</figure>'
  );
}

/**
 * Which arrangement the quotes are presented in.
 *
 * The planner has already chosen from the archetype's preferences, gated on
 * how many quotes were approved; this maps that decision onto an arrangement.
 * `stack` is the fallback because it holds any quantity — a proof section can
 * reach a layout the planner picked for a picture or for prose, and losing a
 * testimonial to a composition that preferred a different shape is exactly the
 * failure `renderItems` already refuses to make.
 */
function proofArrangement(presentation: SectionPresentation): string {
  switch (presentation.layout) {
    case 'testimonial-feature':
      return 'proof--feature';
    case 'review-wall':
      return 'proof--wall';
    case 'proof-cards':
      return 'proof--cards';
    default:
      return 'proof--stack';
  }
}

/**
 * Approved proof.
 *
 * Every quote renders, under every arrangement. An empty or absent array
 * renders nothing at all — the planner drops such a section before it reaches
 * here, and this is the second half of the same rule: a heading promising
 * evidence with no evidence under it is worse than no section.
 */
function renderProof(section: PageSpecSection, presentation: SectionPresentation): string {
  const quotes = section.quotes ?? [];

  if (quotes.length === 0) {
    return '';
  }

  return `<div class="proof ${proofArrangement(presentation)}">${quotes.map(renderQuote).join('')}</div>`;
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

const SPLIT_LAYOUTS = new Set(['editorial-split', 'offset-editorial']);

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

  const sectionCopy = sectionCopyAt(copy, presentation.sourceIndex);

  /*
   * Authored copy may add items or Q&A to a beat the document left as prose,
   * so everything below reads the merged view rather than the raw section.
   * The planner built this presentation from the same view.
   */
  const rendered = effectiveSection(section, sectionCopy);

  /*
   * The other half of the planner's rule, for a plan built elsewhere.
   *
   * A `proof` beat whose quotes never arrived has nothing to show, and its
   * heading would promise evidence the page cannot produce. The planner drops
   * it before a presentation exists; this refuses it again at the point of
   * composition rather than trusting that it did.
   */
  if (isEmptyProof(rendered)) {
    return '';
  }

  const generated = presentation.generatedAssetNeedId ? media.get(presentation.generatedAssetNeedId) : undefined;

  let splitFlavour = 'none';

  /* A chapter opener draws its own numeral; two would be a mistake, not a motif. */
  const head = renderHead(rendered, presentation, showIndex && presentation.layout !== 'chapter-opener');
  const body = renderBody(rendered, presentation);
  const items = renderItems(rendered, presentation);
  const qa = renderQa(rendered, presentation);
  const proof = renderProof(rendered, presentation);
  const image = section.asset ?? generated;
  const hasAsset = Boolean(image) && presentation.media !== 'none';

  /*
   * The picture as the field the section is drawn on.
   *
   * Either channel supplies it. A poster additionally carries its own scrim
   * element: the section and the figure have both already spent their
   * pseudo-elements on background and image treatments, and two rules
   * fighting over one `::after` is a defect that only shows up on the page.
   */
  const fieldImage =
    hasAsset && image && presentation.media === 'full-bleed'
      ? presentation.layout === 'poster-frame'
        ? `${renderAssetImage(image, 'media-poster')}<div class="poster__veil" aria-hidden="true"></div>`
        : renderAssetImage(image, 'media-full-bleed')
      : '';

  let inner: string;

  if (presentation.layout === 'poster-frame' && fieldImage) {
    /* Copy sits on the scrim, low in the frame, where the veil is heaviest. */
    inner = `<div class="poster__copy measure">${head}${body}${qa}${proof}</div>`;
  } else if (presentation.layout === 'showcase-panel' && hasAsset && image) {
    /*
     * A layered composition: the picture runs wide and the copy sits on its
     * own plate overlapping it. Anything else the section carries follows
     * below, in the arrangement its own content earned.
     */
    const plate = `<div class="showcase__copy"><div class="measure">${head}${body}</div></div>`;

    splitFlavour = 'media';
    inner =
      `<div class="showcase">${renderAssetImage(image, 'showcase__media')}${plate}</div>` + `${items}${qa}${proof}`;
  } else if (presentation.layout === 'chapter-opener') {
    const inset = hasAsset && image ? renderAssetImage(image, 'media-inset') : '';
    const mark = `<span class="chapter__numeral" aria-hidden="true">${ordinal(presentation.sourceIndex)}</span>`;

    inner =
      `<div class="chapter"><div class="chapter__mark">${mark}</div>` +
      `<div class="chapter__copy">${head}${body}</div></div>${items}${qa}${proof}${inset}`;
  } else if (SPLIT_LAYOUTS.has(presentation.layout)) {
    const mediaFigure = hasAsset && image ? renderAssetImage(image, 'layout__media') : '';
    const aside = items || qa || proof;

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
      trailing = `${items}${qa}${proof}`;
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
  } else if (presentation.layout === 'media-full-bleed' && fieldImage) {
    inner = `${head}${body}${items}${qa}${proof}`;
  } else {
    const inset = hasAsset && image ? renderAssetImage(image, 'media-inset') : '';
    inner = `${head}${body}${items}${qa}${proof}${inset}`;
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
    attr('data-ground', presentation.ground),
    attr('data-mirrored', String(presentation.mirrored)),

    /*
     * The art-direction axes reach the sheet as attributes, exactly like
     * layout and band, so a framing costs no extra markup and can be
     * restyled per direction without the composer knowing about it.
     */
    attr('data-framing', presentation.framing),
    attr('data-aspect', presentation.aspect),
    attr('data-rhythm', presentation.rhythm),
    attr('data-split', splitFlavour),
    attr('data-section-index', String(presentation.sourceIndex)),
  ].join(' ');

  const chapter = presentation.chapterStart ? '<hr class="chapter-rule">' : '';

  return `${chapter}<section ${attrs}>${fieldImage}<div class="${shellClass(presentation)}">${inner}</div></section>`;
}

function renderHero(
  spec: PageSpec,
  plan: CreativePresentationPlan,
  generatedMedia: ReadonlyMap<string, GeneratedMedia>,
  copyText?: CopyText,
): string {
  const heroAsset =
    plan.hero.mediaSourceIndex !== null
      ? spec.sections[plan.hero.mediaSourceIndex]?.asset
      : plan.hero.generatedAssetNeedId
        ? generatedMedia.get(plan.hero.generatedAssetNeedId)
        : undefined;
  const media = heroAsset ? renderAssetImage(heroAsset, 'hero__media') : '';

  /*
   * A field hero is the picture, so the picture is a child of the section
   * rather than of the shell. Inside the shell it was positioned against the
   * centred container and stopped at the page gutters — a "full bleed" that
   * bled to nothing, which only became visible once the image stopped being
   * painted at 40% opacity. The scrim travels with it.
   */
  const field = media && plan.hero.media === 'full-bleed';
  const fieldMedia = field ? `${media}<div class="hero__veil" aria-hidden="true"></div>` : '';

  const copy = [
    '<div class="hero__copy">',
    `<p class="eyebrow audience">${escapeHtml(copyText?.audience ?? spec.page.audience)}</p>`,
    `<h1>${escapeHtml(copyText?.headline ?? spec.page.headline)}</h1>`,
    `<p class="lede">${escapeHtml(copyText?.subheadline ?? spec.page.subheadline)}</p>`,
    spec.partner.introduction ? `<p class="introduction">${escapeHtml(spec.partner.introduction)}</p>` : '',
    renderActions(spec),
    '</div>',
  ].join('');

  const grid = field
    ? `<div class="hero__grid">${copy}</div>`
    : plan.hero.media === 'trailing' && media
      ? `<div class="hero__grid">${copy}${media}</div>`
      : `<div class="hero__grid">${media}${copy}</div>`;

  return [
    `<section class="hero band-${plan.hero.band}" ${attr('data-hero', plan.hero.variant)} ` +
      `${attr('data-ground', plan.hero.ground)} ${attr('data-section-index', 'hero')} aria-labelledby="page-headline">`,
    fieldMedia,
    `<div class="shell">${grid}</div>`,
    '</section>',
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
      : treatment === 'plinth'
        ? `<div class="closing__panel"><div class="measure">${copy}</div>${renderActions(spec)}</div>`
        : `<div class="measure">${copy}</div>${renderActions(spec)}`;

  return [
    `<section class="section closing closing--${treatment} band-${plan.closing.band}" ` +
      `${attr('data-cta', treatment)} ${attr('data-ground', plan.closing.ground)}>`,
    `<div class="shell">${inner}</div>`,
    '</section>',
  ].join('');
}

/**
 * The page's closing edge.
 *
 * ONLY WHAT THE CONTRACT REQUIRES. The Partner's name used to be
 * printed here as a credit line, so a page finished with a bare
 * "jonas janvier" hanging under the designed call to action. Partner
 * identity is not chrome: the README says `displayName` may be null and
 * that a page then renders "without a personal introduction", so
 * drawing it was always a presentation choice rather than an obligation,
 * and it is one this renderer no longer makes. NOTHING about attribution
 * changes — the referral URL is built by the Partner Network and
 * travels in `ctas`, and this renderer has never been able to see a
 * Partner id at all.
 *
 * The footer element itself is emitted only when it has something to
 * hold, so removing its contents leaves a clean edge rather than an
 * empty bordered band under the closing section.
 */
function renderSiteFooter(spec: PageSpec, plan: CreativePresentationPlan): string {
  const disclosure = renderDisclosure(spec, 'footer');

  if (disclosure === '') {
    return '';
  }

  /*
   * THE FOOTER CONTINUES THE CLOSING BAND, it does not follow it.
   *
   * The disclosure used to sit in its own bordered strip beneath the
   * designed call to action, on the page's default ground whatever the
   * close was doing. On a dark or accent close that produced a visible
   * seam and a pale orphan block hanging off the bottom, which is what
   * Owner acceptance saw and called a compensation block.
   *
   * Carrying the closing section's ground means the page ends on ONE
   * field: the close and its fine print are the same composition, and
   * the seam disappears without anything being hidden.
   *
   * IT IS RESTYLED, NEVER SUPPRESSED. This text is the compensation
   * disclosure — the contract requires it, refuses a document without
   * it, and forbids this renderer deciding whether it is needed. It
   * stays legible, selectable, in the document order a reader reaches
   * last, and it is never shrunk or faded to the point of being fine
   * print nobody can read. Designed is not the same as quiet.
   */
  return (
    `<footer class="site-footer" ${attr('data-ground', plan.closing.ground)}>` +
    `<div class="shell">${disclosure}</div>` +
    '</footer>'
  );
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
 *
 * The output is a static page: no `<script>`, no event handler attribute, no
 * `style` attribute, and exactly one `<style>` element. The Partner Network
 * serves it under a policy that hashes that one sheet, and `generative.spec.ts`
 * asserts every part of that shape.
 */
export function composeDocument(
  spec: PageSpec,
  plan: CreativePresentationPlan,
  direction: CreativeDirection,
  generatedMedia: readonly GeneratedMedia[] = [],
  copy?: CopyText,
): string {
  const mediaByNeed = new Map(generatedMedia.map((item) => [item.assetNeedId, item]));
  const { motif } = plan.design.decoration;
  const showIndex = motif === 'index';
  const sections = plan.sections
    .map((presentation) => renderSection(spec, presentation, showIndex, mediaByNeed, copy))
    .join('');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(spec.page.headline)}</title>`,
    `<style>${buildStylesheet(plan, direction)}</style>`,
    '</head>',
    `<body ${attr('data-direction', plan.directionId)} ${attr('data-card', plan.cardStyle)} ` +
      `${attr('data-density', plan.density)} ${attr('data-motion', plan.motion)} ` +
      `${attr('data-bg', plan.design.decoration.background)} ${attr('data-edge', plan.design.decoration.edge)} ` +
      `${attr('data-motif', motif)} ${attr('data-image', plan.design.decoration.image)}>`,
    '<a class="skip" href="#content">Skip to content</a>',
    renderDisclosure(spec, 'header'),

    /*
     * NO SITE HEADER. The page begins at the hero.
     *
     * This band used to carry `page.name` — "General — Enquiries
     * arriving when nobody can answer" — above the fold. That string is
     * the SPEC's internal identifier, market and situation joined for
     * somebody reading a list of generated pages, and the contract
     * never asked for it to be drawn. Nothing in the PageSpec README
     * requires `page.name`, `page.campaign`, `page.vertical`,
     * `page.situation`, `page.audience` or `page.reference` to appear:
     * they are provenance and routing metadata that a renderer reads to
     * make decisions, not copy a customer is meant to see.
     *
     * A premium page opening with an internal campaign label reads like
     * a CMS preview, and it cost the first impression of every page this
     * renderer has produced.
     */
    '<main id="content">',
    renderHero(spec, plan, mediaByNeed, copy).replace('<h1>', '<h1 id="page-headline">'),
    sections,
    renderDisclosure(spec, 'inline'),
    renderClosing(spec, plan, copy),
    '</main>',
    renderSiteFooter(spec, plan),
    '</body>',
    '</html>',
  ].join('');
}
