/**
 * Colour maths, and the contrast discipline the palette is built on.
 *
 * A generated palette cannot be eyeballed. Every role that carries text is
 * therefore darkened or lightened in a loop until it clears a measured WCAG
 * ratio against the ground it will actually sit on, rather than being chosen
 * and hoped over. `generative.spec.ts` recomputes those ratios from the
 * emitted tokens, so a regression here fails a test instead of shipping an
 * unreadable page.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Hue in degrees, saturation and lightness in percent. */
export function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(saturation, 0, 100) / 100;
  const l = clamp(lightness, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;

  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

export function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const s = delta / (1 - Math.abs(2 * l - 1));
  const h =
    max === red
      ? 60 * (((green - blue) / delta + 6) % 6)
      : max === green
        ? 60 * ((blue - red) / delta + 2)
        : 60 * ((red - green) / delta + 4);

  return { h, s: s * 100, l: l * 100 };
}

function channelLuminance(channel: number): number {
  const value = channel / 255;

  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * channelLuminance(rgb.r) + 0.7152 * channelLuminance(rgb.g) + 0.0722 * channelLuminance(rgb.b);
}

/** WCAG 2.x contrast ratio, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);

  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function contrastHex(a: string, b: string): number {
  return contrastRatio(hexToRgb(a), hexToRgb(b));
}

/**
 * Walk a colour's lightness until it clears `target` against every ground it
 * will be drawn on.
 *
 * Direction is chosen from the grounds themselves rather than passed in: a
 * text accent on light paper has to travel down, the same accent on an
 * inverted band has to travel up, and asking the caller to remember which is
 * how one of the two ends up failing.
 */
export function resolveForContrast(
  hue: number,
  saturation: number,
  lightness: number,
  grounds: readonly string[],
  target: number,
): string {
  const groundRgb = grounds.map(hexToRgb);
  const groundLuminance = groundRgb.map(relativeLuminance);
  const towardsDark = Math.max(...groundLuminance) > 0.32;
  const clears = (candidate: Rgb) => groundRgb.every((ground) => contrastRatio(candidate, ground) >= target);

  for (let offset = 0; offset <= 100; offset += 1) {
    const level = towardsDark ? lightness - offset : lightness + offset;

    if (level < 0 || level > 100) {
      break;
    }

    /*
     * Desaturate slightly as the colour approaches an extreme. A fully
     * saturated hue at 8% lightness reads as black anyway, and holding the
     * saturation there produces a muddy, printed-wrong look.
     */
    const drift = saturation * (1 - Math.min(offset / 140, 0.42));
    const candidate = hslToRgb(hue, drift, level);

    if (clears(candidate)) {
      return toHex(candidate);
    }
  }

  return towardsDark ? '#000000' : '#ffffff';
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);

  return `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(3))})`;
}

/** Mix two hex colours in sRGB. Used for tints that must stay literal values. */
export function mix(a: string, b: string, weight: number): string {
  const left = hexToRgb(a);
  const right = hexToRgb(b);
  const w = clamp(weight, 0, 1);

  return toHex({
    r: left.r * (1 - w) + right.r * w,
    g: left.g * (1 - w) + right.g * w,
    b: left.b * (1 - w) + right.b * w,
  });
}

/**
 * Flatten a translucent overlay against a backdrop.
 *
 * Contrast maths needs an opaque colour. A scrim over a photograph has none,
 * so the worst case is computed instead: the brightest backdrop the picture
 * could supply.
 */
export function composite(overlay: string, alpha: number, backdrop: string): string {
  return mix(backdrop, overlay, clamp(alpha, 0, 1));
}

/**
 * The lightest scrim that still carries text over an unknown picture.
 *
 * Generated imagery is never seen before it is served, so a scrim alpha
 * cannot be eyeballed and must not be guessed. White is the brightest pixel
 * any image can contain, so a veil that clears the target composited over
 * white clears it over every possible photograph. The walk stops at the first
 * alpha that clears, which keeps as much of the picture visible as legibility
 * allows rather than drowning it in a safe, arbitrary 90%.
 */
export function resolveScrimAlpha(overlay: string, ink: string, target: number): number {
  for (let alpha = 0.5; alpha <= 1; alpha += 0.02) {
    const rounded = Number(alpha.toFixed(2));

    if (contrastHex(ink, composite(overlay, rounded, '#ffffff')) >= target) {
      return rounded;
    }
  }

  return 1;
}
