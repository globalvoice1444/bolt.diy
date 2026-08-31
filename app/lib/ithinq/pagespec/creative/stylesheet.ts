import type { CreativeDirection, DesignTokens } from './directions';
import type { CreativePresentationPlan, Density, MotionLevel } from './types';

const DENSITY_SCALE: Readonly<Record<Density, string>> = {
  compact: '0.78',
  comfortable: '1',
  spacious: '1.22',
};

function tokenBlock(tokens: DesignTokens, density: Density): string {
  return [
    `--paper:${tokens.paper}`,
    `--surface:${tokens.surface}`,
    `--surface-alt:${tokens.surfaceAlt}`,
    `--ink:${tokens.ink}`,
    `--ink-muted:${tokens.inkMuted}`,
    `--line:${tokens.line}`,
    `--accent:${tokens.accent}`,
    `--accent-ink:${tokens.accentInk}`,
    `--accent-text:${tokens.accentText}`,
    `--accent-on-dark:${tokens.accentOnDark}`,
    `--inverse:${tokens.inverse}`,
    `--inverse-ink:${tokens.inverseInk}`,
    `--inverse-muted:${tokens.inverseMuted}`,
    `--display-family:${tokens.displayFamily}`,
    `--body-family:${tokens.bodyFamily}`,
    `--display-weight:${tokens.displayWeight}`,
    `--display-tracking:${tokens.displayTracking}`,
    `--display-leading:${tokens.displayLeading}`,
    `--eyebrow-transform:${tokens.eyebrowTransform}`,
    `--eyebrow-tracking:${tokens.eyebrowTracking}`,
    `--radius:${tokens.radius}`,
    `--radius-large:${tokens.radiusLarge}`,
    `--border:${tokens.border}`,
    `--measure:${tokens.measure}`,
    `--hero-min-height:${tokens.heroMinHeight}`,
    `--rhythm:${tokens.rhythm}`,
    `--density:${DENSITY_SCALE[density]}`,
  ].join(';');
}

/** Motion is opt-in per direction and always yields to the user's preference. */
function motionBlock(motion: MotionLevel): string {
  if (motion === 'none') {
    return '';
  }

  const lift = motion === 'expressive' ? '-3px' : '-1px';

  return `
.button,.card,.rail__item,summary{transition:transform .2s ease,background-color .2s ease,border-color .2s ease,box-shadow .2s ease}
.button:hover{transform:translateY(${lift})}
.card:hover{transform:translateY(${lift})}
`;
}

/**
 * The base system.
 *
 * Every rule is written against custom properties, so a direction restyles the
 * whole page by changing tokens rather than shipping its own layout sheet.
 * Layout is selected by `data-layout` on each section, which is how one system
 * supports many compositions without branching per direction.
 */
const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--body-family);line-height:1.6;
  font-size:clamp(1rem,.96rem + .2vw,1.09rem);overflow-x:hidden;text-rendering:optimizeLegibility}
img{max-width:100%;height:auto;display:block}
a{color:inherit}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:2px}
.skip{position:fixed;left:12px;top:12px;z-index:50;background:var(--surface);color:var(--ink);
  padding:12px 18px;border-radius:var(--radius);transform:translateY(-220%);text-decoration:none;font-weight:700}
.skip:focus{transform:none}

/* ---- rhythm -------------------------------------------------------- */
.section{padding-block:calc(clamp(44px,7vw,116px) * var(--rhythm) * var(--density));position:relative}
.shell{width:min(100% - clamp(32px,7vw,120px),1240px);margin-inline:auto}
.shell--narrow > *{max-width:980px}
.shell--full{width:100%}
.measure{max-width:var(--measure)}

/* ---- bands --------------------------------------------------------- */
.band-base{background:var(--paper)}
.band-raised{background:var(--surface);border-block:var(--border) solid var(--line)}
.band-tint{background:var(--surface-alt)}
.band-inverted{background:var(--inverse);color:var(--inverse-ink)}
.band-inverted .eyebrow,.band-inverted .section-body,.band-inverted .rail__item,.band-inverted dd{color:var(--inverse-muted)}
.band-inverted .card__marker,.band-inverted .rail__bullet,.band-accent .card__marker,.band-accent .rail__bullet,.band-inverted .faq summary::after{color:currentColor}
.band-inverted .card{background:color-mix(in srgb,var(--inverse-ink) 8%,transparent);border-color:color-mix(in srgb,var(--inverse-ink) 20%,transparent);color:var(--inverse-ink)}
.band-accent{background:var(--accent);color:var(--accent-ink)}
.band-accent .eyebrow,.band-accent .section-body{color:color-mix(in srgb,var(--accent-ink) 82%,transparent)}

/* ---- type ---------------------------------------------------------- */
h1,h2,h3{font-family:var(--display-family);font-weight:var(--display-weight);
  letter-spacing:var(--display-tracking);line-height:var(--display-leading);margin:0;text-wrap:balance;
  overflow-wrap:break-word}
h1{font-size:clamp(2.35rem,1.2rem + 5.4vw,5.2rem)}
.section-heading{font-size:clamp(1.8rem,1.1rem + 2.9vw,3.4rem)}
.section--promoted .section-heading{font-size:clamp(2.05rem,1.2rem + 3.8vw,4.2rem)}
.eyebrow{font-size:.78rem;font-weight:700;letter-spacing:var(--eyebrow-tracking);
  text-transform:var(--eyebrow-transform);color:var(--ink-muted);margin:0 0 14px}
.section-body{font-size:clamp(1.02rem,.98rem + .3vw,1.2rem);color:var(--ink-muted);margin:20px 0 0;
  max-width:var(--measure);overflow-wrap:break-word}
.lede{font-size:clamp(1.1rem,1rem + .7vw,1.42rem);color:var(--ink-muted);margin:22px 0 0;max-width:var(--measure)}

/* ---- hero ---------------------------------------------------------- */
.hero{padding-block:calc(clamp(56px,9vw,136px) * var(--density));
  min-height:min(var(--hero-min-height),780px);display:flex;align-items:center}
.hero__grid{display:grid;gap:clamp(32px,5vw,72px);align-items:center;width:100%}
.hero[data-hero='split-media'] .hero__grid{grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr)}
.hero[data-hero='offset-panel']{background:var(--inverse);color:var(--inverse-ink)}
.hero[data-hero='offset-panel'] .lede{color:var(--inverse-muted)}
.hero[data-hero='centered-statement'] .hero__grid{justify-items:center;text-align:center}
.hero[data-hero='full-bleed-media']{position:relative;color:var(--inverse-ink);background:var(--inverse)}
.hero[data-hero='full-bleed-media'] .hero__media{position:absolute;inset:0;opacity:.42}
.hero[data-hero='full-bleed-media'] .hero__media img{width:100%;height:100%;object-fit:cover}
.hero[data-hero='full-bleed-media'] .hero__copy{position:relative}
.hero[data-hero='full-bleed-media'] .lede{color:var(--inverse-muted)}
.hero__media img{width:100%;border-radius:var(--radius-large);aspect-ratio:4/5;object-fit:cover}
.audience{margin:0 0 18px}
.identity{display:inline-flex;align-items:center;gap:10px;font-size:.78rem;font-weight:700;
  border:var(--border) solid var(--line);border-radius:999px;padding:8px 14px}
.introduction{margin:22px 0 0;padding-left:16px;border-left:2px solid var(--accent);max-width:var(--measure);
  color:var(--ink-muted)}
.band-inverted .introduction,.hero[data-hero='offset-panel'] .introduction{color:var(--inverse-muted)}

/* ---- actions ------------------------------------------------------- */
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}
.button{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 26px;
  border-radius:var(--radius);font-weight:700;text-decoration:none;border:var(--border) solid transparent;
  font-family:var(--body-family);font-size:1rem;max-width:100%}
.button--primary{background:var(--accent);color:var(--accent-ink)}
.button--secondary{border-color:currentColor;background:transparent;color:inherit}
.band-accent .button--primary{background:var(--accent-ink);color:var(--accent)}

/* ---- section scaffold ---------------------------------------------- */
.section__head{margin-bottom:clamp(24px,3vw,44px)}
.chapter-rule{border:0;border-top:var(--border) solid var(--line);margin:0}
.index-mark{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.72rem;
  letter-spacing:.1em;color:var(--ink-muted);display:block;margin-bottom:12px}
.band-inverted .index-mark,.band-accent .index-mark{color:currentColor;opacity:.7}

/* ---- layout: editorial-split --------------------------------------- */
[data-layout='editorial-split'] .layout{display:grid;gap:clamp(28px,4vw,72px);align-items:start;
  grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
[data-split='media'] .layout{align-items:center}
[data-split='prose'] .layout{grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr)}
[data-layout='editorial-split'][data-mirrored='true'] .layout{direction:rtl}
[data-layout='editorial-split'][data-mirrored='true'] .layout > *{direction:ltr}
[data-layout='editorial-split'] .layout__media img{width:100%;border-radius:var(--radius-large);
  aspect-ratio:5/4;object-fit:cover}

/* ---- layout: pull-quote -------------------------------------------- */
[data-layout='pull-quote'] .pull-quote{font-family:var(--display-family);font-weight:var(--display-weight);
  font-size:clamp(1.5rem,1rem + 2.4vw,2.9rem);line-height:1.18;letter-spacing:var(--display-tracking);
  margin:0;max-width:24ch;color:var(--ink);border-left:3px solid var(--accent);padding-left:clamp(18px,3vw,38px)}
.band-inverted [data-layout='pull-quote'] .pull-quote,.band-inverted .pull-quote{color:var(--inverse-ink)}

/* ---- layout: numbered-flow ----------------------------------------- */
.flow{display:grid;gap:14px;margin:32px 0 0;padding:0;list-style:none;counter-reset:flow}
.flow__step{display:grid;grid-template-columns:auto minmax(0,1fr);gap:16px;align-items:start;
  padding:18px 20px;border:var(--border) solid var(--line);border-radius:var(--radius-large);background:var(--surface)}
.band-inverted .flow__step{background:color-mix(in srgb,var(--inverse-ink) 8%,transparent);
  border-color:color-mix(in srgb,var(--inverse-ink) 20%,transparent)}
.flow-step__index{display:grid;place-items:center;width:34px;height:34px;font-weight:800;font-size:.86rem;
  border:var(--border) solid var(--line);border-radius:var(--radius)}
.flow__text{min-width:0;overflow-wrap:break-word}

/* ---- layout: cards / comparison-grid ------------------------------- */
.card-grid{display:grid;gap:clamp(14px,1.6vw,22px);margin:32px 0 0;padding:0;list-style:none;
  grid-template-columns:repeat(auto-fit,minmax(min(100%,248px),1fr))}
.card{padding:clamp(20px,2.4vw,30px);border-radius:var(--radius-large);min-width:0;overflow-wrap:break-word;
  border:var(--border) solid var(--line);background:var(--surface)}
[data-card='flat'] .card{border:0;border-top:2px solid var(--accent);border-radius:0;background:transparent;padding-inline:0}
[data-card='elevated'] .card{border-color:transparent}
[data-card='inverted'] .card{background:var(--inverse);color:var(--inverse-ink);border-color:transparent}
[data-card='inverted'] .band-inverted .card{background:color-mix(in srgb,var(--inverse-ink) 10%,transparent)}
.card__marker{display:block;font-weight:800;color:var(--accent-text);margin-bottom:10px;font-size:.8rem;
  letter-spacing:var(--eyebrow-tracking);text-transform:var(--eyebrow-transform)}
[data-card='inverted'] .card__marker{color:color-mix(in srgb,var(--accent) 88%,#fff)}

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
.band-inverted .faq p{color:var(--inverse-muted)}
[data-layout='qa-two-column'] .qa-grid{display:grid;gap:clamp(20px,3vw,44px);margin:32px 0 0;
  grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
[data-layout='qa-two-column'] .qa-item h3{font-size:1.12rem;margin-bottom:10px}
[data-layout='qa-two-column'] .qa-item p{margin:0;color:var(--ink-muted)}

/* ---- media --------------------------------------------------------- */
.media-full-bleed img{width:100%;max-height:min(72vh,640px);object-fit:cover;border-radius:0}
.media-inset{margin:32px 0 0}
.media-inset img{width:100%;border-radius:var(--radius-large);aspect-ratio:16/9;object-fit:cover}
figure{margin:0}
figcaption{font-size:.82rem;color:var(--ink-muted);margin-top:10px}

/* ---- closing / disclosure / footer --------------------------------- */
.closing{text-align:center}
.closing .measure{margin-inline:auto}
.closing .actions{justify-content:center}
.closing--split{text-align:left}
.closing--split .closing__grid{display:grid;gap:clamp(24px,4vw,56px);align-items:center;
  grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr)}
.closing--split .actions{justify-content:flex-start;margin-top:0}
.closing--quiet{text-align:left}
.closing--quiet .measure{margin-inline:0}
.closing--quiet .actions{justify-content:flex-start}
.disclosure{font-size:.82rem;line-height:1.6;color:var(--ink-muted);overflow-wrap:break-word}
.disclosure--header{background:var(--surface-alt);padding:12px 20px;text-align:center;color:var(--ink-muted)}
.disclosure--inline{border:var(--border) solid var(--line);border-radius:var(--radius);padding:18px;
  margin-block:clamp(28px,4vw,56px)}
.site-footer{padding-block:clamp(32px,4vw,60px);border-top:var(--border) solid var(--line);
  display:grid;gap:14px}
.site-footer strong{font-size:.9rem}
.site-header{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding-block:20px;
  border-bottom:var(--border) solid var(--line)}
.site-header__name{font-weight:700;font-size:.86rem;letter-spacing:.04em}
.site-header .identity{margin-left:auto}

/* ---- responsive ---------------------------------------------------- */
@media (max-width:900px){
  .hero[data-hero='split-media'] .hero__grid,
  [data-layout='editorial-split'] .layout,
  .closing--split .closing__grid{grid-template-columns:minmax(0,1fr)}
  [data-layout='editorial-split'][data-mirrored='true'] .layout{direction:ltr}
  .hero__media img{aspect-ratio:16/10}
}
@media (max-width:600px){
  .hero{min-height:auto}
  .site-header .identity{margin-left:0}
  .button{width:100%}
  .actions{gap:10px}
  .flow__step{padding:16px}
  .rail__item{padding:14px 0}
  .card{padding:20px}
  [data-card='flat'] .card{padding-inline:0}
}
@media (min-width:1600px){
  .shell{width:min(100% - 160px,1360px)}
}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  *,*::before,*::after{transition:none!important;animation:none!important}
  .button:hover,.card:hover{transform:none}
}
@media print{
  .skip{display:none}
  body{background:#fff}
}
`;

/**
 * Applied last, after each direction's signature rules.
 *
 * `--accent-text` is tuned for a light surface, so on an inverted or accent
 * band it would be the low-contrast choice. These corrections restore the
 * bright accent (or the band's own foreground) wherever the ground is dark.
 */
const BAND_CORRECTIONS = `
.band-inverted .eyebrow,.hero[data-hero='offset-panel'] .eyebrow,.hero[data-hero='full-bleed-media'] .eyebrow{color:var(--accent-on-dark)}
.band-accent .eyebrow,.band-accent .card__marker,.band-accent .rail__bullet{color:currentColor}
.band-inverted .card__marker,.band-inverted .rail__bullet,.band-inverted .faq summary::after{color:var(--accent-on-dark)}
`;

export function buildStylesheet(direction: CreativeDirection, plan: CreativePresentationPlan): string {
  return [
    `:root{${tokenBlock(direction.tokens, plan.density)}}`,
    BASE_CSS,
    motionBlock(plan.motion),
    direction.signatureCss,
    BAND_CORRECTIONS,
  ]
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
