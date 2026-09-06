import { mix, rgba } from './colour';
import { FAMILY_STACKS, type CreativeDirection } from './directions';
import type { CreativePresentationPlan, Density, MotionLevel, PageDesign } from './types';

/**
 * The document's one stylesheet.
 *
 * Exactly one `<style>` element reaches the page, and no element carries a
 * `style` attribute. That is not tidiness: the Partner Network serves this
 * HTML from its own origin under a Content-Security-Policy that whitelists the
 * single inline sheet by SHA-256 digest, so a stray `style="…"` would be
 * blocked by the browser and the design would silently come apart. Everything
 * dynamic — asymmetric splits, mosaic spans, decorative intensity — is emitted
 * here as a custom property scoped by an attribute selector.
 *
 * No `@font-face` and no `@import` either. There is no `font-src` in that
 * policy, so the page is typeset entirely in system stacks.
 */

const DENSITY_SCALE: Readonly<Record<Density, number>> = {
  compact: 0.78,
  comfortable: 1,
  spacious: 1.22,
};

function rem(value: number, min: number, max: number): string {
  return `${Math.min(max, Math.max(min, Number(value.toFixed(2))))}rem`;
}

/**
 * Type sizes from the modular scale.
 *
 * Computed here rather than expressed as nested `calc()` so the emitted sheet
 * stays readable and a reviewer can see the actual sizes a page will use.
 */
function typeScale(design: PageDesign): Record<string, string> {
  const { scale } = design.typography;

  return {
    '--size-h1': rem(2.05 * scale ** 3, 3.3, 6.1),
    '--size-h1-min': rem(1.5 * scale, 1.9, 2.7),
    '--size-h2': rem(1.55 * scale ** 2, 2.1, 4.1),
    '--size-h2-min': rem(1.15 * scale, 1.45, 2.05),
    '--size-h3': rem(0.86 * scale, 1.02, 1.32),
    '--size-lede': rem(0.98 * scale, 1.2, 1.62),
    '--size-body': rem(0.79 * scale, 1.0, 1.19),
    '--size-eyebrow': rem(0.56 * scale, 0.72, 0.86),
    '--size-statement': rem(1.32 * scale ** 2, 1.8, 3.5),
  };
}

function tokenBlock(design: PageDesign, density: Density): string {
  const { palette, typography, spatial, decoration } = design;

  const entries: Record<string, string> = {
    '--paper': palette.paper,
    '--surface': palette.surface,
    '--surface-alt': palette.surfaceAlt,
    '--ink': palette.ink,
    '--ink-muted': palette.inkMuted,
    '--line': palette.line,
    '--accent': palette.accent,
    '--accent-ink': palette.accentInk,
    '--accent-text': palette.accentText,
    '--accent-on-dark': palette.accentOnDark,
    '--accent-soft': palette.accentSoft,
    '--accent-shadow': mix(palette.accent, '#000000', 0.42),
    '--accent-veil': rgba(palette.accent, 0.12),
    '--inverse': palette.inverse,
    '--inverse-ink': palette.inverseInk,
    '--inverse-muted': palette.inverseMuted,
    '--veil': rgba(palette.inverseInk, 0.1),
    '--veil-soft': rgba(palette.inverseInk, 0.06),
    '--veil-line': rgba(palette.inverseInk, 0.2),
    '--display-family': FAMILY_STACKS[typography.displayFamily],
    '--body-family': FAMILY_STACKS[typography.bodyFamily],
    '--display-weight': String(typography.displayWeight),
    '--display-tracking': `${typography.displayTracking}em`,
    '--display-leading': String(typography.displayLeading),
    '--body-leading': String(typography.bodyLeading),
    '--eyebrow-transform': typography.eyebrowUppercase ? 'uppercase' : 'none',
    '--eyebrow-tracking': `${typography.eyebrowTracking}em`,
    '--measure': `${typography.measure}ch`,
    '--rhythm': String(spatial.rhythm),
    '--radius': `${spatial.radius}px`,
    '--radius-large': `${spatial.radiusLarge}px`,
    '--border': `${spatial.border}px`,
    '--container': `${spatial.container}px`,
    '--hero-min-height': `${spatial.heroMinHeight}vh`,
    '--density': String(DENSITY_SCALE[density]),
    '--intensity': String(decoration.intensity),
    ...typeScale(design),
  };

  return Object.entries(entries)
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
}

/** Motion is opt-in per design and always yields to the user's preference. */
function motionBlock(motion: MotionLevel): string {
  if (motion === 'none') {
    return '';
  }

  const lift = motion === 'expressive' ? '-3px' : '-1px';

  return `
.button,.card,.rail__item,.stat,.ledger__row,summary{transition:transform .2s ease,background-color .2s ease,border-color .2s ease,box-shadow .2s ease,color .2s ease}
.button:hover{transform:translateY(${lift})}
.card:hover,.stat:hover{transform:translateY(${lift})}
`;
}

/**
 * Per-section custom properties.
 *
 * The only place in the pipeline where a value computed from one section's
 * content reaches the document. Scoped by `data-section-index` so the sheet
 * stays one hashable block, and restricted to numbers the renderer generated
 * itself — never a caller URL, which is why imagery stays in escaped `<img>`
 * elements rather than becoming a CSS `url()`.
 */
function sectionVariables(plan: CreativePresentationPlan): string {
  const rules: string[] = [`[data-section-index='hero']{--split:${plan.hero.split}%}`];

  for (const section of plan.sections) {
    const scope = `[data-section-index='${section.sourceIndex}']`;

    rules.push(`${scope}{--split:${section.split}%}`);

    if (section.spans) {
      section.spans.forEach((span, index) => {
        rules.push(`${scope} .mosaic__cell:nth-child(${index + 1}){--span:${span}}`);
      });
    }
  }

  return rules.join('\n');
}

/**
 * The base system.
 *
 * Every rule is written against custom properties, so a generated design
 * restyles the whole page by changing tokens rather than shipping its own
 * layout sheet. Composition is selected by `data-layout` on each section and
 * `data-ground` decides the foreground corrections, which is how one system
 * supports many compositions and many palettes without branching per design.
 */
const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--body-family);
  line-height:var(--body-leading);font-size:clamp(1rem,.95rem + .2vw,var(--size-body));
  overflow-x:hidden;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
img{max-width:100%;height:auto;display:block}
a{color:inherit}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:2px}
.skip{position:fixed;left:12px;top:12px;z-index:50;background:var(--surface);color:var(--ink);
  padding:12px 18px;border-radius:var(--radius);transform:translateY(-220%);text-decoration:none;font-weight:700}
.skip:focus{transform:none}

/* ---- rhythm -------------------------------------------------------- */
.section{padding-block:calc(clamp(40px,5.4vw,104px) * var(--rhythm) * var(--density));position:relative;isolation:isolate}
.shell{width:min(100% - clamp(32px,7vw,120px),var(--container));margin-inline:auto;position:relative;z-index:1}
.shell--narrow > *{max-width:min(100%,980px)}
.shell--full{width:100%}
.measure{max-width:var(--measure)}

/* ---- bands --------------------------------------------------------- */
.band-base{background:var(--paper)}
.band-raised{background:var(--surface);border-block:var(--border) solid var(--line)}
.band-tint{background:var(--surface-alt)}
.band-wash{background:linear-gradient(180deg,var(--paper) 0%,var(--accent-soft) 55%,var(--surface-alt) 100%)}
.band-inverted{background:var(--inverse)}
.band-deep{background:
  radial-gradient(120% 90% at 85% -10%,var(--accent-veil) 0%,transparent 62%),
  linear-gradient(170deg,var(--inverse) 0%,#000 220%)}
.band-accent{background:var(--accent)}

/* ---- ground corrections -------------------------------------------- */
[data-ground='dark']{color:var(--inverse-ink)}
[data-ground='dark'] .lede,[data-ground='dark'] .section-body,[data-ground='dark'] .introduction,
[data-ground='dark'] .rail__item,[data-ground='dark'] .faq p,[data-ground='dark'] .qa-item p,
[data-ground='dark'] .ledger__row,[data-ground='dark'] .disclosure{color:var(--inverse-muted)}
[data-ground='dark'] .eyebrow,[data-ground='dark'] .card__marker,[data-ground='dark'] .rail__bullet,
[data-ground='dark'] .stat__value,[data-ground='dark'] .faq summary::after,
[data-ground='dark'] .ledger__index,[data-ground='dark'] .quote-panel::before{color:var(--accent-on-dark)}
[data-ground='dark'] .card,[data-ground='dark'] .flow__step,[data-ground='dark'] .stat,
[data-ground='dark'] .mosaic__cell{background:var(--veil);border-color:var(--veil-line);color:var(--inverse-ink)}
[data-ground='dark'] .index-mark{color:var(--inverse-muted)}
[data-ground='dark'] .faq,[data-ground='dark'] .faq details,[data-ground='dark'] .rail__item,
[data-ground='dark'] .ledger__row{border-color:var(--veil-line)}
[data-ground='dark'] .chapter-rule{border-color:var(--veil-line)}
[data-ground='dark'] .pull-quote{border-color:var(--accent-on-dark);color:var(--inverse-ink)}
[data-ground='dark'] .button--primary{background:var(--accent-on-dark);color:var(--inverse)}

[data-ground='accent']{color:var(--accent-ink)}
[data-ground='accent'] .eyebrow,[data-ground='accent'] .section-body,[data-ground='accent'] .lede,
[data-ground='accent'] .card__marker,[data-ground='accent'] .rail__bullet,[data-ground='accent'] .index-mark,
[data-ground='accent'] .stat__value,[data-ground='accent'] .ledger__index{color:currentColor}
[data-ground='accent'] .card,[data-ground='accent'] .flow__step,[data-ground='accent'] .stat,
[data-ground='accent'] .mosaic__cell{background:transparent;border-color:currentColor;color:currentColor}
[data-ground='accent'] .button--primary{background:var(--accent-ink);color:var(--accent)}
[data-ground='accent'] .pull-quote{border-color:currentColor;color:currentColor}

/* ---- background treatments ----------------------------------------- */
.section::before,.hero::before{content:'';position:absolute;inset:0;pointer-events:none;z-index:0}
[data-bg='flat'] .section::before,[data-bg='flat'] .hero::before{opacity:0}
[data-bg='wash'] [data-ground='light']::before{
  background:radial-gradient(90% 62% at 12% 0%,var(--accent-veil) 0%,transparent 70%);
  opacity:calc(var(--intensity) * .9)}
[data-bg='aurora'] [data-ground='light']::before{
  background:
    radial-gradient(58% 44% at 82% 8%,var(--accent-veil) 0%,transparent 68%),
    radial-gradient(52% 48% at 6% 92%,var(--accent-soft) 0%,transparent 72%);
  opacity:calc(var(--intensity) * .95)}
[data-bg='aurora'] [data-ground='dark']::before{
  background:conic-gradient(from 210deg at 78% 12%,var(--accent-veil),transparent 38%,var(--veil) 70%,transparent);
  opacity:calc(var(--intensity) * .8)}
[data-bg='ruled'] [data-ground='light']::before{
  background:repeating-linear-gradient(90deg,var(--line) 0 1px,transparent 1px 84px);
  opacity:calc(var(--intensity) * .5)}
[data-bg='ruled'] [data-ground='dark']::before{
  background:repeating-linear-gradient(90deg,var(--veil-line) 0 1px,transparent 1px 84px);
  opacity:calc(var(--intensity) * .45)}
[data-bg='grain'] [data-ground='light']::before{
  background:
    radial-gradient(circle at 1px 1px,var(--line) 0 1px,transparent 1.4px) 0 0/7px 7px,
    linear-gradient(180deg,transparent 0%,var(--accent-veil) 130%);
  opacity:calc(var(--intensity) * .65)}
[data-bg='grain'] [data-ground='dark']::before{
  background:radial-gradient(circle at 1px 1px,var(--veil-line) 0 1px,transparent 1.4px) 0 0/7px 7px;
  opacity:calc(var(--intensity) * .5)}

/* ---- edge treatments ----------------------------------------------- */
[data-edge='hairline'] .section + .section{border-top:1px solid var(--line)}
[data-edge='hairline'] [data-ground='dark'] + .section{border-top-color:transparent}
[data-edge='taper'] .section::after{content:'';position:absolute;left:0;right:0;bottom:0;height:1px;
  background:linear-gradient(90deg,transparent,var(--line) 22%,var(--line) 78%,transparent);pointer-events:none}
[data-edge='notch'] [data-ground='dark']{clip-path:polygon(0 0,100% 0,100% calc(100% - 26px),calc(100% - 26px) 100%,0 100%)}

/* ---- type ---------------------------------------------------------- */
h1,h2,h3{font-family:var(--display-family);font-weight:var(--display-weight);
  letter-spacing:var(--display-tracking);line-height:var(--display-leading);margin:0;text-wrap:balance;
  overflow-wrap:break-word}
h1{font-size:clamp(var(--size-h1-min),1.2rem + 5.4vw,var(--size-h1))}
.section-heading{font-size:clamp(var(--size-h2-min),1.1rem + 2.9vw,var(--size-h2))}
.section--promoted .section-heading{font-size:clamp(var(--size-h2-min),1.2rem + 3.7vw,calc(var(--size-h2) * 1.16))}
.eyebrow{font-size:var(--size-eyebrow);font-weight:700;letter-spacing:var(--eyebrow-tracking);
  text-transform:var(--eyebrow-transform);color:var(--ink-muted);margin:0 0 14px}
.section-body{font-size:clamp(1rem,.97rem + .3vw,var(--size-body));color:var(--ink-muted);margin:20px 0 0;
  max-width:var(--measure);overflow-wrap:break-word}
.lede{font-size:clamp(1.08rem,1rem + .7vw,var(--size-lede));color:var(--ink-muted);margin:22px 0 0;
  max-width:var(--measure)}

/* ---- hero ---------------------------------------------------------- */
.hero{padding-block:calc(clamp(56px,9vw,136px) * var(--density));position:relative;isolation:isolate;
  min-height:min(var(--hero-min-height),820px);display:flex;align-items:center}
.hero__grid{display:grid;gap:clamp(32px,5vw,72px);align-items:center;width:100%}
.hero[data-hero='split-media'] .hero__grid{grid-template-columns:minmax(0,var(--split,52%)) minmax(0,1fr)}
.hero[data-hero='offset-panel'] .hero__copy{padding-inline-start:clamp(0px,4vw,64px);
  border-inline-start:3px solid var(--accent-on-dark)}
.hero[data-hero='centered-statement'] .hero__grid{justify-items:center;text-align:center}
.hero[data-hero='centered-statement'] .measure,.hero[data-hero='centered-statement'] .lede{margin-inline:auto}
.hero[data-hero='centered-statement'] .actions{justify-content:center}
.hero[data-hero='asymmetric-offset'] .hero__grid{grid-template-columns:minmax(0,var(--split,54%)) minmax(0,1fr)}
.hero[data-hero='asymmetric-offset'] .hero__copy{grid-column:1;transform:translateY(calc(var(--intensity) * -14px))}
.hero[data-hero='asymmetric-offset']::after{content:'';position:absolute;inset-block:12%;right:-6%;width:34%;
  background:linear-gradient(160deg,var(--accent-soft),transparent 78%);
  border-inline-start:var(--border) solid var(--line);z-index:0;pointer-events:none}
.hero[data-hero='framed-plate'] .hero__copy{background:var(--surface);border:var(--border) solid var(--line);
  border-radius:var(--radius-large);padding:clamp(26px,4vw,58px);box-shadow:0 24px 60px var(--accent-veil)}
.hero[data-hero='full-bleed-media']{color:var(--inverse-ink);background:var(--inverse)}
.hero[data-hero='full-bleed-media'] .hero__media{position:absolute;inset:0;opacity:.4;z-index:0}
.hero[data-hero='full-bleed-media'] .hero__media img{width:100%;height:100%;object-fit:cover;border-radius:0}
.hero[data-hero='full-bleed-media'] .hero__copy{position:relative;z-index:1}
.hero__media img{width:100%;border-radius:var(--radius-large);aspect-ratio:4/5;object-fit:cover}
.audience{margin:0 0 18px}
.identity{display:inline-flex;align-items:center;gap:10px;font-size:.78rem;font-weight:700;
  border:var(--border) solid var(--line);border-radius:999px;padding:8px 14px}
.introduction{margin:22px 0 0;padding-left:16px;border-left:2px solid var(--accent);max-width:var(--measure);
  color:var(--ink-muted)}

/* ---- actions ------------------------------------------------------- */
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}
.button{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 26px;
  border-radius:var(--radius);font-weight:700;text-decoration:none;border:var(--border) solid transparent;
  font-family:var(--body-family);font-size:1rem;max-width:100%}
.button--primary{background:var(--accent);color:var(--accent-ink)}
.button--secondary{border-color:currentColor;background:transparent;color:inherit}

/* ---- section scaffold ---------------------------------------------- */
.section__head{margin-bottom:clamp(24px,3vw,44px)}
.chapter-rule{border:0;border-top:var(--border) solid var(--line);margin:0}
.index-mark{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.72rem;
  letter-spacing:.1em;color:var(--ink-muted);display:block;margin-bottom:12px}
[data-motif='ticks'] .section__head{padding-top:18px;background:
  repeating-linear-gradient(90deg,currentColor 0 8px,transparent 8px 16px) top left/100% 2px no-repeat}
[data-motif='brackets'] .section__head{position:relative;padding-left:18px}
[data-motif='brackets'] .section__head::before{content:'';position:absolute;left:0;top:2px;bottom:2px;width:10px;
  border:2px solid var(--accent);border-right:0}
.prose{max-width:var(--measure)}

/* ---- layout: editorial-split --------------------------------------- */
[data-layout='editorial-split'] .layout{display:grid;gap:clamp(28px,4vw,72px);align-items:start;
  grid-template-columns:minmax(0,var(--split,50%)) minmax(0,1fr)}
[data-split='media'] .layout{align-items:center}
[data-layout='editorial-split'][data-mirrored='true'] .layout{direction:rtl}
[data-layout='editorial-split'][data-mirrored='true'] .layout > *{direction:ltr}
.layout__media img{width:100%;border-radius:var(--radius-large);aspect-ratio:5/4;object-fit:cover}

/* ---- layout: offset-editorial -------------------------------------- */
[data-layout='offset-editorial'] .layout{display:grid;gap:clamp(24px,4vw,64px);align-items:start;
  grid-template-columns:minmax(0,var(--split,44%)) minmax(0,1fr)}
[data-layout='offset-editorial'] .layout__copy{position:sticky;top:clamp(20px,5vh,64px)}
[data-layout='offset-editorial'] .layout__aside{transform:translateY(calc(var(--intensity) * 26px));
  padding-top:clamp(10px,1.4vw,20px);border-top:var(--border) solid var(--line)}
[data-layout='offset-editorial'] .layout__aside .section-body{margin-top:0;
  font-size:clamp(1.08rem,1rem + .7vw,var(--size-lede));max-width:var(--measure)}
[data-ground='dark'] [data-layout='offset-editorial'] .layout__aside,
[data-layout='offset-editorial'][data-ground='dark'] .layout__aside{border-color:var(--veil-line)}
[data-layout='offset-editorial'][data-mirrored='true'] .layout{direction:rtl}
[data-layout='offset-editorial'][data-mirrored='true'] .layout > *{direction:ltr}
[data-layout='offset-editorial'] .section-heading{max-width:14ch}

/* ---- layout: manifesto --------------------------------------------- */
[data-layout='manifesto'] .shell{text-align:center}
[data-layout='manifesto'] .section__head{margin-bottom:clamp(18px,2vw,30px)}
[data-layout='manifesto'] .measure,[data-layout='manifesto'] .prose{margin-inline:auto}
.manifesto{font-family:var(--display-family);font-weight:var(--display-weight);
  letter-spacing:var(--display-tracking);line-height:calc(var(--display-leading) + .12);
  font-size:clamp(1.5rem,1rem + 2.6vw,var(--size-statement));margin:0 auto;max-width:26ch;text-wrap:balance}
[data-layout='manifesto'] .actions,[data-layout='manifesto'] .card-grid,[data-layout='manifesto'] .rail{
  justify-content:center;text-align:left}
/* On the statement itself, not the section: an edge treatment already owns
   the section's ::after, and the two would fight over the same pseudo-element. */
.manifesto::after{content:'';display:block;width:clamp(40px,6vw,88px);height:2px;background:var(--accent);
  margin:clamp(22px,3vw,46px) auto 0;opacity:var(--intensity)}
[data-ground='dark'] .manifesto::after{background:var(--accent-on-dark)}

/* ---- layout: pull-quote / quote-panel ------------------------------ */
.pull-quote{font-family:var(--display-family);font-weight:var(--display-weight);
  font-size:clamp(1.5rem,1rem + 2.4vw,var(--size-statement));line-height:1.18;
  letter-spacing:var(--display-tracking);margin:0;max-width:24ch;color:var(--ink);
  border-left:3px solid var(--accent);padding-left:clamp(18px,3vw,38px)}
[data-layout='quote-panel'] .quote-panel{position:relative;margin:0;padding:clamp(30px,5vw,72px);
  border-radius:var(--radius-large);border:var(--border) solid var(--line);
  background:linear-gradient(155deg,var(--accent-soft),transparent 82%);max-width:none}
[data-layout='quote-panel'] .quote-panel::before{content:'\\201C';position:absolute;top:-.1em;left:.24em;
  font-family:var(--display-family);font-size:clamp(4rem,10vw,9rem);line-height:1;color:var(--accent-text);
  opacity:calc(var(--intensity) * .55)}
[data-layout='quote-panel'] .quote-panel p{position:relative;margin:0;max-width:30ch;
  font-family:var(--display-family);font-weight:var(--display-weight);letter-spacing:var(--display-tracking);
  font-size:clamp(1.35rem,1rem + 1.9vw,calc(var(--size-statement) * .82));line-height:1.24}
[data-ground='dark'] .quote-panel{background:linear-gradient(155deg,var(--veil),transparent 84%);
  border-color:var(--veil-line)}

/* ---- layout: numbered-flow ----------------------------------------- */
.flow{display:grid;gap:14px;margin:32px 0 0;padding:0;list-style:none}
.flow__step{display:grid;grid-template-columns:auto minmax(0,1fr);gap:16px;align-items:start;
  padding:18px 20px;border:var(--border) solid var(--line);border-radius:var(--radius-large);background:var(--surface)}
.flow-step__index{display:grid;place-items:center;width:34px;height:34px;font-weight:800;font-size:.86rem;
  border:var(--border) solid var(--line);border-radius:var(--radius)}
.flow__text{min-width:0;overflow-wrap:break-word}

/* ---- layout: ledger ------------------------------------------------ */
.ledger{margin:32px 0 0;padding:0;list-style:none;display:grid;gap:0;
  border-top:var(--border) solid var(--line)}
.ledger__row{display:grid;grid-template-columns:auto minmax(0,1fr);gap:clamp(14px,3vw,40px);
  align-items:baseline;padding:clamp(16px,2vw,26px) 0;border-bottom:var(--border) solid var(--line);
  min-width:0;overflow-wrap:break-word;color:var(--ink-muted)}
.ledger__index{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.74rem;
  letter-spacing:.12em;color:var(--accent-text)}
.ledger__text{font-size:clamp(1.02rem,.98rem + .35vw,calc(var(--size-body) * 1.1));color:var(--ink)}
[data-ground='dark'] .ledger__text{color:var(--inverse-ink)}

/* ---- layout: cards / comparison-grid ------------------------------- */
.card-grid{display:grid;gap:clamp(14px,1.6vw,22px);margin:32px 0 0;padding:0;list-style:none;
  grid-template-columns:repeat(auto-fit,minmax(min(100%,248px),1fr))}
.card{padding:clamp(20px,2.4vw,30px);border-radius:var(--radius-large);min-width:0;overflow-wrap:break-word;
  border:var(--border) solid var(--line);background:var(--surface)}
.card p{margin:0}
[data-card='flat'] .card{border:0;border-top:2px solid var(--accent);border-radius:0;background:transparent;padding-inline:0}
[data-card='elevated'] .card{border-color:transparent;box-shadow:0 1px 2px var(--line),0 14px 34px var(--accent-veil)}
[data-card='inverted'] .card{background:var(--inverse);color:var(--inverse-ink);border-color:transparent}
[data-card='inverted'] .card .card__marker{color:var(--accent-on-dark)}
[data-card='plate'] .card{position:relative;background:var(--surface);border-color:var(--line)}
[data-card='plate'] .card::after{content:'';position:absolute;inset:8px -8px -8px 8px;z-index:-1;
  border-radius:var(--radius-large);background:var(--accent-soft)}
[data-card='edge'] .card{border-radius:0;border:0;border-left:4px solid var(--accent);
  background:transparent;padding-block:6px}
.card__marker{display:block;font-weight:800;color:var(--accent-text);margin-bottom:10px;font-size:.8rem;
  letter-spacing:var(--eyebrow-tracking);text-transform:var(--eyebrow-transform)}

/* ---- layout: bento-mosaic ------------------------------------------ */
.mosaic{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:clamp(12px,1.4vw,20px);
  margin:32px 0 0;padding:0;list-style:none}
.mosaic__cell{grid-column:span var(--span,3);min-width:0;overflow-wrap:break-word;
  padding:clamp(20px,2.4vw,32px);border:var(--border) solid var(--line);border-radius:var(--radius-large);
  background:var(--surface);display:flex;flex-direction:column;gap:12px;justify-content:space-between}
.mosaic__cell:nth-child(3n+1){background:linear-gradient(170deg,var(--accent-soft),var(--surface) 72%)}
.mosaic__index{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.72rem;
  letter-spacing:.12em;color:var(--accent-text)}
.mosaic__cell p{margin:0;font-size:clamp(1rem,.96rem + .4vw,calc(var(--size-body) * 1.12))}

/* ---- layout: stat-band --------------------------------------------- */
.stats{display:grid;gap:clamp(14px,1.8vw,26px);margin:32px 0 0;padding:0;list-style:none;
  grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr))}
.stat{border-top:2px solid var(--accent);padding:18px 0 0;min-width:0;overflow-wrap:break-word;
  display:flex;flex-direction:column;gap:10px}
.stat__index{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.7rem;
  letter-spacing:.14em;color:var(--ink-muted)}
.stat__value{margin:0;font-family:var(--display-family);font-weight:var(--display-weight);
  letter-spacing:var(--display-tracking);line-height:1.16;color:var(--accent-text);
  font-size:clamp(1.1rem,1rem + .8vw,calc(var(--size-h3) * 1.35))}

/* ---- layout: feature-rail ------------------------------------------ */
.rail{display:grid;gap:12px;margin:32px 0 0;padding:0;list-style:none}
.rail__item{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;align-items:baseline;
  padding:16px 18px;border-top:var(--border) solid var(--line);min-width:0;overflow-wrap:break-word}
.rail__bullet{color:var(--accent-text);font-weight:800}

/* ---- layout: faq --------------------------------------------------- */
.faq{margin:32px 0 0;border-top:var(--border) solid var(--line)}
.faq details{border-bottom:var(--border) solid var(--line)}
.faq summary{display:flex;justify-content:space-between;align-items:center;gap:18px;cursor:pointer;
  padding:20px 0;font-weight:700;list-style:none;font-size:1.05rem}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:'+';font-weight:700;font-size:1.3rem;line-height:1;color:var(--accent-text)}
.faq details[open] summary::after{content:'\\2212'}
.faq p{margin:0 0 22px;color:var(--ink-muted);max-width:var(--measure)}
[data-layout='qa-two-column'] .qa-grid{display:grid;gap:clamp(20px,3vw,44px);margin:32px 0 0;
  grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
[data-layout='qa-two-column'] .qa-item{border-top:var(--border) solid var(--line);padding-top:18px}
[data-layout='qa-two-column'] .qa-item h3{font-size:var(--size-h3);margin-bottom:10px}
[data-layout='qa-two-column'] .qa-item p{margin:0;color:var(--ink-muted)}

/* ---- lone prose ------------------------------------------------------
   A section whose only content is a paragraph is carrying the whole beat,
   and setting it at supporting-copy size is what makes an airy page read as
   an empty one. The last-child test is the honest one: the prose is last
   only when no list, Q and A block or image followed it. */
.prose:last-child .section-body{font-size:clamp(1.1rem,1rem + .75vw,var(--size-lede))}

/* ---- media --------------------------------------------------------- */
figure{margin:0;position:relative}
.media-full-bleed img{width:100%;max-height:min(72vh,640px);object-fit:cover;border-radius:0}
.media-inset{margin:32px 0 0}
.media-inset img{width:100%;border-radius:var(--radius-large);aspect-ratio:16/9;object-fit:cover}
[data-image='duotone'] .frame img{filter:grayscale(1) contrast(1.06) brightness(1.02)}
[data-image='duotone'] .frame::after{content:'';position:absolute;inset:0;border-radius:inherit;
  background:linear-gradient(150deg,var(--accent) 0%,var(--inverse) 100%);
  mix-blend-mode:color;opacity:calc(.45 + var(--intensity) * .35);pointer-events:none}
[data-image='duotone'] .frame img{border-radius:var(--radius-large)}
[data-image='soft-mask'] .frame img{-webkit-mask-image:linear-gradient(180deg,#000 68%,transparent 100%);
  mask-image:linear-gradient(180deg,#000 68%,transparent 100%)}
[data-image='plate'] .frame::before{content:'';position:absolute;inset:14px -14px -14px 14px;z-index:-1;
  border-radius:var(--radius-large);background:var(--accent-soft)}
[data-image='clipped'] .frame img{clip-path:polygon(0 0,100% 0,100% 88%,88% 100%,0 100%)}
[data-image='clipped'] .hero__media img{clip-path:polygon(0 6%,100% 0,100% 94%,0 100%)}

/* ---- closing / disclosure / footer --------------------------------- */
.closing{text-align:center}
.closing .measure{margin-inline:auto}
.closing .actions{justify-content:center}
.closing--split,.closing--quiet,.closing--plinth{text-align:left}
.closing--split .closing__grid{display:grid;gap:clamp(24px,4vw,56px);align-items:center;
  grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr)}
.closing--split .actions,.closing--quiet .actions,.closing--plinth .actions{justify-content:flex-start;margin-top:24px}
.closing--quiet .measure,.closing--plinth .measure{margin-inline:0}
.closing--plinth .closing__panel{background:var(--veil);border:var(--border) solid var(--veil-line);
  border-radius:var(--radius-large);padding:clamp(28px,5vw,68px);
  box-shadow:0 40px 90px rgba(0,0,0,.28)}
.disclosure{font-size:.82rem;line-height:1.6;color:var(--ink-muted);overflow-wrap:break-word}
.disclosure--header{background:var(--surface-alt);padding:12px 20px;text-align:center}
.disclosure--inline{border:var(--border) solid var(--line);border-radius:var(--radius);padding:18px;
  margin-block:clamp(28px,4vw,56px)}
.site-header{padding-block:20px;border-bottom:var(--border) solid var(--line)}
.site-header .shell{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.site-header__name{font-weight:700;font-size:.86rem;letter-spacing:.04em}
.site-header .identity{margin-left:auto}
.site-footer{padding-block:clamp(32px,4vw,60px);border-top:var(--border) solid var(--line)}
.site-footer .shell{display:grid;gap:14px}
.site-footer strong{font-size:.9rem}

/* ---- responsive ---------------------------------------------------- */
@media (max-width:1000px){
  .mosaic__cell{grid-column:span 3}
  [data-layout='offset-editorial'] .layout__copy{position:static}
}
@media (max-width:900px){
  .hero[data-hero='split-media'] .hero__grid,
  .hero[data-hero='asymmetric-offset'] .hero__grid,
  [data-layout='editorial-split'] .layout,
  [data-layout='offset-editorial'] .layout,
  .closing--split .closing__grid{grid-template-columns:minmax(0,1fr)}
  [data-layout='editorial-split'][data-mirrored='true'] .layout,
  [data-layout='offset-editorial'][data-mirrored='true'] .layout{direction:ltr}
  [data-layout='offset-editorial'] .layout__aside{transform:none}
  .hero[data-hero='asymmetric-offset'] .hero__copy{transform:none}
  .hero[data-hero='asymmetric-offset']::after{display:none}
  .hero__media img{aspect-ratio:16/10}
  .mosaic__cell{grid-column:span 6}
  [data-edge='notch'] [data-ground='dark']{clip-path:none}
}
@media (max-width:600px){
  .hero{min-height:auto}
  .site-header .identity{margin-left:0}
  .button{width:100%}
  .actions{gap:10px}
  .flow__step{padding:16px}
  .rail__item{padding:14px 0}
  .card,.mosaic__cell{padding:20px}
  [data-card='flat'] .card,[data-card='edge'] .card{padding-inline:0}
  [data-card='plate'] .card::after{inset:6px -6px -6px 6px}
  .closing--plinth .closing__panel{padding:24px}
}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  *,*::before,*::after{transition:none!important;animation:none!important}
  .button:hover,.card:hover,.stat:hover{transform:none}
}
@media print{
  .skip{display:none}
  body{background:#fff}
  .section::before,.hero::before,.section::after{display:none}
}
`;

export function buildStylesheet(plan: CreativePresentationPlan, direction: CreativeDirection): string {
  return [
    `:root{${tokenBlock(plan.design, plan.density)}}`,
    BASE_CSS,
    motionBlock(plan.motion),
    direction.signatureCss,
    sectionVariables(plan),
  ]
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
