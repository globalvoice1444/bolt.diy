import { ASPECT_SIZES, type CreativeAssetGenerator, type GenerateImageRequest } from './types';

/**
 * Development stand-in used when no OpenAI credential is configured.
 *
 * It is NOT an image model and produces no photographic content. It renders a
 * deterministic abstract panel, clearly marked as a placeholder, so the whole
 * pipeline — need planning, storage, delivery, composition, responsive crops —
 * can be exercised and reviewed without a credential.
 *
 * It reports `synthetic: true`, and every surface that shows an asset shows
 * that flag. A placeholder must never be mistaken for generated creative.
 */
export class PlaceholderImageGenerator implements CreativeAssetGenerator {
  readonly provider = 'placeholder';
  readonly model = 'deterministic-svg/1';
  readonly synthetic = true;

  async generate(request: GenerateImageRequest) {
    const size = ASPECT_SIZES[request.need.aspectRatio] ?? ASPECT_SIZES['1:1'];
    const { width, height } = size!;

    let hash = 0;

    for (let index = 0; index < request.prompt.length; index += 1) {
      hash = (hash * 31 + request.prompt.charCodeAt(index)) >>> 0;
    }

    const hue = hash % 360;
    const hue2 = (hue + 42) % 360;
    const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
      '<defs>',
      `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`,
      `<stop offset="0" stop-color="hsl(${hue} 38% 88%)"/>`,
      `<stop offset="1" stop-color="hsl(${hue2} 30% 62%)"/>`,
      '</linearGradient>',
      '</defs>',
      `<rect width="${width}" height="${height}" fill="url(#g)"/>`,
      `<circle cx="${width * 0.72}" cy="${height * 0.38}" r="${Math.min(width, height) * 0.22}" fill="hsl(${hue2} 34% 52%)" opacity="0.5"/>`,
      `<rect x="${width * 0.08}" y="${height * 0.7}" width="${width * 0.36}" height="${Math.max(6, height * 0.012)}" rx="4" fill="hsl(${hue} 30% 30%)" opacity="0.35"/>`,
      `<text x="${width * 0.08}" y="${height * 0.62}" font-family="system-ui,sans-serif" font-size="${Math.round(Math.min(width, height) * 0.045)}" fill="hsl(${hue} 32% 26%)" opacity="0.72">PLACEHOLDER &#183; ${escape(request.need.role)} &#183; not AI generated</text>`,
      '</svg>',
    ].join('');

    return { bytes: new TextEncoder().encode(svg), mimeType: 'image/svg+xml', width, height };
  }
}
