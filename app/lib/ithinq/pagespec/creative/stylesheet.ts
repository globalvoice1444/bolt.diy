import { mix, resolveScrimAlpha, rgba } from './colour';
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
    /*
     * THE DISPLAY STEP CARRIES THE HERO, and it was set for a page that
     * had to stay polite. A cap of 6.1rem that most directions never
     * reached — clinical-calm resolved to 4.1rem — is a headline that
     * fills its measure without ever dominating the screen, which is
     * what "conservative hero" measures as. The exponent is unchanged,
     * so the RATIOS of the scale are untouched and the relationship
     * between h1, h2 and body is the same typographic system; only the
     * top of it moves.
     */
    '--size-h1': rem(2.35 * scale ** 3, 3.8, 7.0),
    '--size-h1-min': rem(1.5 * scale, 1.9, 2.7),
    '--size-h2': rem(1.55 * scale ** 2, 2.1, 4.1),
    '--size-h2-min': rem(1.15 * scale, 1.45, 2.05),
    '--size-h3': rem(0.86 * scale, 1.02, 1.32),
    '--size-lede': rem(0.98 * scale, 1.2, 1.62),
    '--size-body': rem(0.79 * scale, 1.0, 1.19),
    '--size-eyebrow': rem(0.56 * scale, 0.72, 0.86),
    '--size-statement': rem(1.46 * scale ** 2, 2.0, 4.0),
  };
}

/** Body text over an unknown photograph. AA, measured against white. */
const AA_OVER_IMAGE = 4.6;

function tokenBlock(design: PageDesign, density: Density): string {
  const { palette, typography, spatial, decoration } = design;
  const scrim = resolveScrimAlpha(palette.inverse, palette.inverseInk, AA_OVER_IMAGE);

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

    /*
     * The scrim a poster's copy sits on, resolved rather than chosen.
     *
     * Text over generated imagery is the one place on the page where the
     * background is unknown at build time. `resolveScrimAlpha` walks the veil
     * up until it clears AA against the brightest picture that could arrive —
     * white — so the floor holds for every photograph, and the sheet keeps as
     * much of the image visible as that allows.
     */
    '--scrim-weak': rgba(palette.inverse, scrim),
    '--scrim-strong': rgba(palette.inverse, Math.min(1, Number((scrim + 0.12).toFixed(2)))),
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
/* SECTION RHYTHM IS NOT UNIFORM. Every section used to breathe by
   exactly the same amount, so a page of five beats read as five stacked
   blocks whatever those beats were doing — the metronome that made a
   composed page feel assembled. A strong ground is a chapter and gets
   the air a chapter needs; a promoted beat gets more than a supporting
   one. The multipliers stay modest so this reads as rhythm rather than
   as sections falling apart. */
.section[data-ground='dark'],.section[data-ground='accent']{
  padding-block:calc(clamp(40px,5.4vw,104px) * var(--rhythm) * var(--density) * 1.45)}
.section--promoted{padding-block:calc(clamp(40px,5.4vw,104px) * var(--rhythm) * var(--density) * 1.2)}
.section--promoted[data-ground='dark'],.section--promoted[data-ground='accent']{
  padding-block:calc(clamp(40px,5.4vw,104px) * var(--rhythm) * var(--density) * 1.6)}
/* Two strong grounds meeting is a deliberate crescendo, so the seam
   between them closes up rather than doubling the gap. */
.section[data-ground='dark'] + .section[data-ground='accent'],
.section[data-ground='accent'] + .section[data-ground='dark']{padding-top:calc(
  clamp(40px,5.4vw,104px) * var(--rhythm) * var(--density) * .9)}
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
[data-ground='dark'] .faq summary::after{border-color:var(--veil-line)}
[data-ground='dark'] .faq summary:hover,[data-ground='dark'] .faq details[open] summary{color:var(--accent-on-dark)}
[data-ground='dark'] .faq summary:hover::after{background:var(--veil);border-color:var(--accent-on-dark)}
[data-ground='dark'] .faq details[open] summary::after{background:var(--accent-on-dark);color:var(--inverse);
  border-color:transparent}
[data-ground='dark'] .proof__quote,[data-ground='dark'] .proof__attribution{color:var(--inverse-ink)}
[data-ground='dark'] .proof__source{color:var(--inverse-muted)}
[data-ground='dark'] .proof__stars,[data-ground='dark'] .proof__score{color:var(--accent-on-dark)}
[data-ground='dark'] .proof--stack,[data-ground='dark'] .proof--stack .proof__item,
[data-ground='dark'] .proof--feature .proof__item{border-color:var(--veil-line)}
[data-ground='dark'] .proof--feature .proof__item:first-child{border-left-color:var(--accent-on-dark)}
[data-ground='dark'] .proof--wall .proof__item,[data-ground='dark'] .proof--cards .proof__item{
  background:var(--veil);border-color:var(--veil-line)}
[data-ground='dark'] .proof--cards .proof__item::before{color:var(--accent-on-dark)}

[data-ground='accent']{color:var(--accent-ink)}
[data-ground='accent'] .eyebrow,[data-ground='accent'] .section-body,[data-ground='accent'] .lede,
[data-ground='accent'] .card__marker,[data-ground='accent'] .rail__bullet,[data-ground='accent'] .index-mark,
[data-ground='accent'] .stat__value,[data-ground='accent'] .ledger__index{color:currentColor}
[data-ground='accent'] .card,[data-ground='accent'] .flow__step,[data-ground='accent'] .stat,
[data-ground='accent'] .mosaic__cell{background:transparent;border-color:currentColor;color:currentColor}
[data-ground='accent'] .button--primary{background:var(--accent-ink);color:var(--accent)}
[data-ground='accent'] .pull-quote{border-color:currentColor;color:currentColor}
[data-ground='accent'] .disclosure,
[data-ground='accent'] .faq p,[data-ground='accent'] .faq summary,
[data-ground='accent'] .faq summary:hover,[data-ground='accent'] .faq details[open] summary,
[data-ground='accent'] .faq summary::after,[data-ground='accent'] .qa-item p{color:currentColor}
[data-ground='accent'] .faq,[data-ground='accent'] .faq details,
[data-ground='accent'] .faq summary::after{border-color:currentColor}
[data-ground='accent'] .faq summary:hover::after{background:transparent}
[data-ground='accent'] .faq details[open] summary::after{background:var(--accent-ink);color:var(--accent)}
[data-ground='accent'] .proof__quote,[data-ground='accent'] .proof__attribution,
[data-ground='accent'] .proof__source,[data-ground='accent'] .proof__stars,
[data-ground='accent'] .proof__score,[data-ground='accent'] .proof--cards .proof__item::before{color:currentColor}
[data-ground='accent'] .proof--stack,[data-ground='accent'] .proof--stack .proof__item,
[data-ground='accent'] .proof--feature .proof__item{border-color:currentColor}
[data-ground='accent'] .proof--feature .proof__item:first-child{border-left-color:currentColor}
[data-ground='accent'] .proof--wall .proof__item,[data-ground='accent'] .proof--cards .proof__item{
  background:transparent;border-color:currentColor}

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
.hero[data-hero='full-bleed-media'] .hero__media{position:absolute;inset:0;z-index:0}
.hero[data-hero='full-bleed-media'] .hero__veil{position:absolute;inset:0;z-index:0;pointer-events:none;
  background:linear-gradient(to top,var(--scrim-strong) 0%,var(--scrim-strong) 30%,
    var(--scrim-weak) 74%,var(--scrim-weak) 100%)}
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

/* ---- layout: display-statement -------------------------------------
   Oversized type, no picture required. Most sections a generated
   document carries are a heading and a paragraph, and three prose
   treatments is not a design system. Here the heading is set at display
   scale across the field and the copy hangs off it in a seeded column,
   so a body-only beat reads as a composition rather than as a page of
   text with a bigger heading. */
[data-layout='display-statement'] .section__head{position:relative;margin-bottom:clamp(16px,2.2vw,30px)}
[data-layout='display-statement'] .section-heading{
  font-size:clamp(2rem,1.2rem + 4.2vw,calc(var(--size-h1) * .86));max-width:17ch}
/* Faded rather than cut: a plate that stops mid-heading with a hard edge
   reads as a highlight someone forgot to finish. */
[data-layout='display-statement'] .section__head::after{content:'';position:absolute;z-index:-1;
  inset:-8% 30% -14% -4%;border-radius:var(--radius-large);opacity:calc(var(--intensity) * .85);
  background:linear-gradient(90deg,var(--accent-soft) 0%,var(--accent-soft) 42%,transparent 100%)}
[data-ground='dark'] [data-layout='display-statement'] .section__head::after,
[data-layout='display-statement'][data-ground='dark'] .section__head::after{
  background:linear-gradient(90deg,var(--veil) 0%,var(--veil) 42%,transparent 100%)}
[data-layout='display-statement'][data-ground='accent'] .section__head::after{display:none}
[data-layout='display-statement'] .prose--statement{width:min(100%,var(--split,58%));max-width:none;
  margin-inline-start:auto;border-top:var(--border) solid var(--line);padding-top:clamp(14px,1.8vw,26px)}
[data-ground='dark'] [data-layout='display-statement'] .prose--statement,
[data-layout='display-statement'][data-ground='dark'] .prose--statement{border-color:var(--veil-line)}
[data-layout='display-statement'] .prose--statement .section-body{margin-top:0;max-width:none;
  font-size:clamp(1.08rem,1rem + .7vw,var(--size-lede))}

/* ---- layout: chapter-opener ----------------------------------------
   A break in the page rather than another block on it: a hanging mark
   and rule against copy set in a narrow measure. Costs no picture,
   which is the point. */
[data-layout='chapter-opener'] .chapter{display:grid;gap:clamp(20px,3.2vw,56px);align-items:start;
  grid-template-columns:minmax(0,var(--split,30%)) minmax(0,1fr)}
[data-layout='chapter-opener'] .chapter__mark{border-top:2px solid var(--accent);padding-top:14px}
[data-layout='chapter-opener'] .chapter__numeral{display:block;font-family:var(--display-family);
  font-weight:var(--display-weight);letter-spacing:var(--display-tracking);line-height:.92;
  font-size:clamp(3rem,2rem + 5vw,calc(var(--size-h1) * .72));color:var(--accent-text)}
[data-ground='dark'] .chapter__numeral{color:var(--accent-on-dark)}
[data-ground='dark'] .chapter__mark{border-color:var(--accent-on-dark)}
[data-ground='accent'] .chapter__numeral{color:currentColor}
[data-ground='accent'] .chapter__mark{border-color:currentColor}
[data-layout='chapter-opener'] .section__head{margin-bottom:clamp(12px,1.6vw,22px)}
[data-layout='chapter-opener'] .section-heading{max-width:20ch}

/* ---- layout: column-essay ------------------------------------------
   A long passage set in columns. CSS does the columns, so the body
   stays one contiguous run of text: nothing is split, reordered or
   duplicated to make the shape work. The column count collapses on its
   own once the measure no longer fits twice. */
[data-layout='column-essay'] .prose--columns{max-width:min(100%,calc(var(--measure) * 1.55));
  columns:28ch 2;column-gap:clamp(28px,4vw,64px);column-rule:1px solid var(--line)}
[data-ground='dark'] .prose--columns{column-rule-color:var(--veil-line)}
[data-layout='column-essay'] .prose--columns .section-body{margin-top:0;max-width:none}
[data-layout='column-essay'] .section__head{margin-bottom:clamp(18px,2.4vw,34px)}

/* ---- layout: poster-frame ------------------------------------------
   The picture is the field and a short statement sits low in it. Text
   over a photograph is legible only because of the scrim, so the scrim
   is a real element with a resolved floor alpha rather than a hopeful
   one, and it never reaches full transparency anywhere copy can land.
   It is its own element because the section and the figure have both
   already spent their pseudo-elements on background and image
   treatments. */
[data-layout='poster-frame']{display:grid;align-items:end;min-height:min(68vh,660px);
  background:var(--inverse);padding-block:clamp(44px,6vw,104px)}
[data-layout='poster-frame'] .media-poster{position:absolute;inset:0;z-index:0}
[data-layout='poster-frame'] .media-poster img{width:100%;height:100%;object-fit:cover;border-radius:0}
.poster__veil{position:absolute;inset:0;z-index:0;pointer-events:none;
  background:linear-gradient(to top,var(--scrim-strong) 0%,var(--scrim-strong) 34%,
    var(--scrim-weak) 76%,var(--scrim-weak) 100%)}
/* Everything on the picture is set in one ink.
   The scrim is resolved for exactly one foreground colour, so a muted grey or
   an accent drawn on top of it would be a contrast claim nothing measured. */
[data-layout='poster-frame'] .poster__copy{position:relative;z-index:1;color:var(--inverse-ink)}
[data-layout='poster-frame'] .poster__copy .eyebrow,
[data-layout='poster-frame'] .poster__copy .index-mark,
[data-layout='poster-frame'] .poster__copy .section-body,
.hero[data-hero='full-bleed-media'] .hero__copy,
.hero[data-hero='full-bleed-media'] .eyebrow,
.hero[data-hero='full-bleed-media'] .lede,
.hero[data-hero='full-bleed-media'] .introduction{color:var(--inverse-ink)}
[data-layout='poster-frame'] .section-heading{
  font-size:clamp(2rem,1.2rem + 4vw,calc(var(--size-h1) * .82));max-width:18ch}
[data-layout='poster-frame'] .section-body{font-size:clamp(1.06rem,1rem + .6vw,var(--size-lede))}

/* ---- layout: showcase-panel ----------------------------------------
   A layered composition: the picture runs wide and the copy sits on its
   own plate overlapping it. The plate brings its own ground, so copy is
   never set over the image itself. */
[data-layout='showcase-panel'] .showcase{display:grid;
  grid-template-columns:repeat(12,minmax(0,1fr));align-items:center}
[data-layout='showcase-panel'] .showcase__media{grid-area:1/1/2/10}
[data-layout='showcase-panel'] .showcase__media img{width:100%;aspect-ratio:16/10;object-fit:cover;
  border-radius:var(--radius-large)}
[data-layout='showcase-panel'] .showcase__copy{grid-area:1/7/2/13;z-index:1;background:var(--surface);
  border:var(--border) solid var(--line);border-radius:var(--radius-large);
  padding:clamp(22px,3.2vw,46px);box-shadow:0 30px 70px var(--accent-veil)}
[data-layout='showcase-panel'][data-mirrored='true'] .showcase__media{grid-area:1/4/2/13}
[data-layout='showcase-panel'][data-mirrored='true'] .showcase__copy{grid-area:1/1/2/7}
[data-ground='dark'] .showcase__copy,[data-ground='accent'] .showcase__copy{background:var(--inverse);
  color:var(--inverse-ink);border-color:var(--veil-line)}
[data-layout='showcase-panel'] .showcase__copy .section-body{margin-top:16px}

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

/* ---- layout: faq ----------------------------------------------------
   Native disclosure, designed rather than defaulted.

   The details element stays. The compiled document is served under a policy
   with script-src 'none', so an ARIA accordion built from buttons could not be
   wired up at all — and it would only be reimplementing the button role,
   keyboard operation and focus behaviour the element already has. Everything
   below is styling laid over what the browser does correctly.

   A page can now carry sixteen questions, so length is a design problem: the
   quantity query tightens the row once a list gets long, the answer keeps a
   reading measure instead of running the full container, and the indicator
   is a real target rather than a glyph hanging off the end of a line. */
.faq{margin:clamp(28px,3.4vw,52px) 0 0;border-top:var(--border) solid var(--line)}
.faq details{border-bottom:var(--border) solid var(--line)}
.faq summary{display:flex;justify-content:space-between;align-items:center;gap:clamp(16px,2.2vw,36px);
  cursor:pointer;list-style:none;font-weight:700;border-radius:var(--radius);
  padding-block:var(--faq-row,clamp(18px,1.9vw,27px));padding-inline:2px;
  font-size:clamp(1.02rem,.98rem + .32vw,calc(var(--size-h3) * 1.08));line-height:1.35}
.faq summary::-webkit-details-marker{display:none}
.faq summary:hover{color:var(--accent-text)}
.faq summary:focus-visible{outline:3px solid var(--accent);outline-offset:-3px}
.faq summary::after{content:'+';display:grid;place-items:center;flex:none;width:34px;height:34px;
  font-weight:400;font-size:1.5rem;line-height:1;color:var(--accent-text);
  border:var(--border) solid var(--line);border-radius:999px;
  transition:transform .25s ease,background-color .25s ease,color .25s ease,border-color .25s ease}
.faq summary:hover::after{background:var(--accent-soft);border-color:var(--accent)}
/* A plus rotated through 45 degrees is a close mark, and it is the same glyph
   the whole way — swapping the character to a minus cannot be animated. */
.faq details[open] summary{color:var(--accent-text)}
.faq details[open] summary::after{transform:rotate(45deg);background:var(--accent);
  color:var(--accent-ink);border-color:transparent}
.faq p{margin:0 2px clamp(20px,2.2vw,30px);color:var(--ink-muted);max-width:var(--measure)}
/* Quantity query: nine or more questions and the rhythm tightens, so a long
   list reads as a considered index rather than as a page that would not end. */
.faq details:nth-last-child(n+9),.faq details:nth-last-child(n+9) ~ details{--faq-row:clamp(14px,1.5vw,21px)}
/* Height is not animatable from a keyword, so the smooth open is scoped to
   engines that support both halves of the modern disclosure model. Where they
   are missing the panel simply appears, which is the browser default. */
@supports (interpolate-size:allow-keywords) and selector(::details-content){
  html{interpolate-size:allow-keywords}
  .faq details::details-content{block-size:0;overflow:clip;
    transition:block-size .3s ease,content-visibility .3s allow-discrete}
  .faq details[open]::details-content{block-size:auto}
}
[data-layout='qa-two-column'] .qa-grid{display:grid;gap:clamp(20px,3vw,44px);margin:32px 0 0;
  grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
[data-layout='qa-two-column'] .qa-item{border-top:var(--border) solid var(--line);padding-top:18px}
[data-layout='qa-two-column'] .qa-item h3{font-size:var(--size-h3);margin-bottom:10px}
[data-layout='qa-two-column'] .qa-item p{margin:0;color:var(--ink-muted)}

/* ---- layout: proof --------------------------------------------------
   Approved evidence, in four arrangements.

   The quotes are the Growth Engine's words and the presentation is ours, so
   nothing here truncates, clamps to a line count, hides an overflow or fades
   a tail out: a treatment that visually shortens an endorsement is editing it
   in CSS. A rating is drawn only where the composer produced one, which is
   only where the document gave both a rating and the scale it is on. */
.proof{display:grid;gap:clamp(18px,2.2vw,32px);margin:clamp(28px,3.4vw,52px) 0 0}
.proof__item{margin:0;min-width:0;display:flex;flex-direction:column;gap:12px}
.proof__quote{margin:0;color:var(--ink);overflow-wrap:break-word;
  font-family:var(--display-family);letter-spacing:var(--display-tracking);
  font-size:clamp(1.02rem,.98rem + .45vw,calc(var(--size-h3) * 1.16));line-height:1.44}
.proof__quote p{margin:0}
.proof__cite{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;font-size:.86rem;line-height:1.45}
.proof__attribution{font-weight:700;color:var(--ink);letter-spacing:.01em}
.proof__source{color:var(--ink-muted)}
/* The separator belongs to the pair, not to the source: a quote carrying only
   a source must not open with a dangling bullet. */
.proof__attribution + .proof__source::before{content:'\\00b7\\00a0'}
.proof__rating{margin:0;line-height:1}
.proof__stars{font-size:1.02rem;letter-spacing:.14em;color:var(--accent-text)}
.proof__score{display:inline-block;font-size:.76rem;font-weight:800;letter-spacing:.1em;
  text-transform:uppercase;color:var(--accent-text)}

/* A stacked index. Holds any quantity, which is why it is also the fallback. */
.proof--stack{gap:0;border-top:var(--border) solid var(--line)}
.proof--stack .proof__item{padding-block:clamp(20px,2.6vw,34px);border-bottom:var(--border) solid var(--line)}

/* One endorsement given the weight of the beat, with any others in support. */
.proof--feature{grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));
  gap:clamp(20px,2.6vw,40px);align-items:start}
.proof--feature .proof__item:first-child{grid-column:1/-1;
  border-left:3px solid var(--accent);padding-left:clamp(18px,3vw,42px)}
.proof--feature .proof__item:first-child .proof__quote{font-weight:var(--display-weight);
  font-size:clamp(1.34rem,1rem + 2vw,calc(var(--size-statement) * .8));line-height:1.2;max-width:26ch}
.proof--feature .proof__item:not(:first-child){padding-top:clamp(14px,1.6vw,22px);
  border-top:var(--border) solid var(--line)}

/* A wall of reviews: enough tiles that the quantity is itself the argument. */
.proof--wall{grid-template-columns:repeat(auto-fit,minmax(min(100%,268px),1fr));gap:clamp(14px,1.6vw,22px)}
.proof--wall .proof__item{padding:clamp(20px,2.2vw,30px);background:var(--surface);
  border:var(--border) solid var(--line);border-radius:var(--radius-large)}
.proof--wall .proof__quote{font-family:var(--body-family);letter-spacing:normal;
  font-size:clamp(.98rem,.95rem + .22vw,calc(var(--size-body) * 1.02));line-height:1.56}

/* Plates, for a handful of longer testimonials beside a call to action. */
.proof--cards{grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:clamp(14px,1.8vw,26px)}
.proof--cards .proof__item{position:relative;overflow:hidden;padding:clamp(22px,2.6vw,36px);
  background:linear-gradient(165deg,var(--accent-soft),var(--surface) 78%);
  border:var(--border) solid var(--line);border-radius:var(--radius-large)}
.proof--cards .proof__item::before{content:'\\201C';position:absolute;top:-.24em;right:.08em;pointer-events:none;
  font-family:var(--display-family);font-size:clamp(4rem,8vw,7rem);line-height:1;color:var(--accent-text);
  opacity:calc(var(--intensity) * .3)}
.proof--cards .proof__quote,.proof--cards .proof__cite{position:relative}

/* ---- lone prose ------------------------------------------------------
   A section whose only content is a paragraph is carrying the whole beat,
   and setting it at supporting-copy size is what makes an airy page read as
   an empty one. The last-child test is the honest one: the prose is last
   only when no list, Q and A block or image followed it. */
.prose:last-child .section-body{font-size:clamp(1.1rem,1rem + .75vw,var(--size-lede))}

/* ---- media --------------------------------------------------------- */
figure{margin:0;position:relative}
.media-full-bleed img{width:100%;max-height:min(64vh,560px);object-fit:cover;border-radius:0}
/* A picture that fills the field is not the section — the copy under it still
   has to carry the beat, so it is set at statement scale rather than at the
   supporting size it would inherit from a prose block. The section also drops
   its leading padding: with it, a full-bleed picture on a banded section
   opened with a thin strip of band above the image, which reads as a
   mistake rather than as a bleed. */
[data-layout='media-full-bleed']{padding-block-start:0}
[data-layout='media-full-bleed'] .section__head{margin-top:clamp(26px,3vw,48px)}
[data-layout='media-full-bleed'] .section-heading{
  font-size:clamp(1.9rem,1.2rem + 3.4vw,calc(var(--size-h1) * .72));max-width:19ch}
[data-layout='media-full-bleed'] .section-body{font-size:clamp(1.08rem,1rem + .7vw,var(--size-lede))}
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
/* No site-header rules: the page begins at the hero, and the band that
   used to carry the spec's internal name is not emitted. */
/* The closing edge. The footer CONTINUES the closing band rather than
   following it, so the page resolves on one field instead of ending in a
   pale strip bolted under the call to action. No top border by default:
   the seam was what made it read as a separate block. A hairline returns
   only when the close is on the page's own ground, where some separation
   is what stops the fine print from touching the copy above it. */
.site-footer{padding-block:clamp(28px,3.5vw,52px)}
.site-footer .shell{display:grid;gap:14px}
.site-footer[data-ground='light'] .shell{border-top:var(--border) solid var(--line);
  padding-top:clamp(20px,2.5vw,32px)}
/* Legibility is not negotiable here: this is the compensation
   disclosure, and it has to be readable to do its job. It is set one
   step down from body copy, never smaller, and it keeps a measure so it
   does not run the full width of a wide page as a single thin line. */
.site-footer .disclosure{font-size:.86rem;max-width:62ch}

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
  [data-layout='chapter-opener'] .chapter{grid-template-columns:minmax(0,1fr)}
  [data-layout='display-statement'] .prose--statement{width:100%}
  [data-layout='showcase-panel'] .showcase{grid-template-columns:minmax(0,1fr)}
  [data-layout='showcase-panel'] .showcase__media,
  [data-layout='showcase-panel'] .showcase__copy,
  [data-layout='showcase-panel'][data-mirrored='true'] .showcase__media,
  [data-layout='showcase-panel'][data-mirrored='true'] .showcase__copy{grid-area:auto}
  [data-layout='showcase-panel'] .showcase__copy{margin-inline:clamp(0px,3vw,32px);margin-top:-32px}
}
@media (max-width:600px){
  .hero{min-height:auto}
  .button{width:100%}
  .actions{gap:10px}
  .flow__step{padding:16px}
  .rail__item{padding:14px 0}
  .card,.mosaic__cell{padding:20px}
  [data-card='flat'] .card,[data-card='edge'] .card{padding-inline:0}
  [data-card='plate'] .card::after{inset:6px -6px -6px 6px}
  .closing--plinth .closing__panel{padding:24px}
  [data-layout='poster-frame']{min-height:min(88vh,680px)}
  [data-layout='showcase-panel'] .showcase__copy{margin-inline:0;margin-top:-20px}
  .faq summary{gap:14px;font-size:1.02rem}
  .faq summary::after{width:30px;height:30px;font-size:1.32rem}
  .proof--wall .proof__item,.proof--cards .proof__item{padding:20px}
  .proof--feature .proof__item:first-child{padding-left:16px}
}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  *,*::before,*::after{transition:none!important;animation:none!important}
  /* A pseudo-element the universal selector cannot reach. */
  .faq details::details-content{transition:none!important}
  .button:hover,.card:hover,.stat:hover{transform:none}
  .faq details[open] summary::after{transform:rotate(45deg)}
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
