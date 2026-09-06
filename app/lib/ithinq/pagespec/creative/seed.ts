/**
 * Deterministic variation.
 *
 * Everything generative in this folder draws from here, and nothing here
 * touches a clock, a counter, `Math.random`, a network or a model. The same
 * inputs always produce the same stream, which is what lets the compiler
 * promise byte-identical output while still giving two Partners in the same
 * vertical materially different pages.
 *
 * The hash is a pure-JS FNV-1a rather than `node:crypto`, deliberately: these
 * modules are reachable from route files that also export a React component,
 * and a Node builtin in that import graph would break the browser bundle.
 * Nothing here is a security primitive — it is a variation source — so a
 * non-cryptographic hash is the honest choice as well as the portable one.
 */

const FNV_PRIME = 0x01000193;

function fnv1a(input: string, offset: number): number {
  let hash = offset >>> 0;

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);

    hash = Math.imul(hash ^ (code & 0xff), FNV_PRIME) >>> 0;
    hash = Math.imul(hash ^ (code >>> 8), FNV_PRIME) >>> 0;
  }

  return hash >>> 0;
}

/**
 * A 32-character digest of arbitrary text.
 *
 * Used wherever a seed input must be recorded without recording the input.
 * Creative intent prose, the page reference and the audience all reach the
 * design system only through this function, so the presentation plan can carry
 * provenance for a look without carrying a single word of the document.
 */
export function digest(input: string): string {
  return [
    fnv1a(input, 0x811c9dc5),
    fnv1a(`${input} 1`, 0x9e3779b9),
    fnv1a(`${input} 2`, 0x85ebca6b),
    fnv1a(`${input} 3`, 0xc2b2ae35),
  ]
    .map((lane) => lane.toString(16).padStart(8, '0'))
    .join('');
}

/**
 * xorshift128 over four lanes taken from a digest.
 *
 * Small, dependency-free and completely reproducible. Consumers must draw in a
 * fixed order — the stream is the shared secret between two runs of the same
 * input, so reordering draws changes the page.
 */
export class Rng {
  private _x: number;
  private _y: number;
  private _z: number;
  private _w: number;

  constructor(seed: string) {
    const hex = seed.length >= 32 ? seed : digest(seed);

    this._x = (parseInt(hex.slice(0, 8), 16) || 0x9e3779b9) >>> 0;
    this._y = (parseInt(hex.slice(8, 16), 16) || 0x243f6a88) >>> 0;
    this._z = (parseInt(hex.slice(16, 24), 16) || 0xb7e15162) >>> 0;
    this._w = (parseInt(hex.slice(24, 32), 16) || 0x85ebca6b) >>> 0;

    // Discard a short prefix so closely related seeds diverge immediately.
    for (let index = 0; index < 12; index += 1) {
      this._uint();
    }
  }

  private _uint(): number {
    const t = (this._x ^ (this._x << 11)) >>> 0;

    this._x = this._y;
    this._y = this._z;
    this._z = this._w;
    this._w = (this._w ^ (this._w >>> 19) ^ (t ^ (t >>> 8))) >>> 0;

    return this._w;
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this._uint() / 0x100000000;
  }

  /** Uniform integer in [0, bound). */
  int(bound: number): number {
    return bound <= 1 ? 0 : Math.floor(this.next() * bound) % bound;
  }

  /** Uniform float in [min, max]. */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** A float in [min, max] quantised to `step`, so tokens stay tidy. */
  step(min: number, max: number, step: number): number {
    const steps = Math.max(1, Math.round((max - min) / step));

    return Number((min + this.int(steps + 1) * step).toFixed(4));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)] as T;
  }

  /**
   * A weighted pick.
   *
   * Weights below zero are clamped away rather than throwing: they come from
   * intent scoring, and untrusted creative direction must never be able to
   * make a page fail to render.
   */
  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
    const safe = items.map(([value, weight]) => [value, Math.max(0, weight)] as const);
    const total = safe.reduce((sum, [, weight]) => sum + weight, 0);

    if (total <= 0) {
      return safe[0]![0];
    }

    let cursor = this.next() * total;

    for (const [value, weight] of safe) {
      cursor -= weight;

      if (cursor <= 0) {
        return value;
      }
    }

    return safe[safe.length - 1]![0];
  }

  /** Fisher-Yates against this stream. Never mutates the input. */
  shuffled<T>(items: readonly T[]): T[] {
    const copy = [...items];

    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = this.int(index + 1);
      const held = copy[index] as T;

      copy[index] = copy[swap] as T;
      copy[swap] = held;
    }

    return copy;
  }
}
