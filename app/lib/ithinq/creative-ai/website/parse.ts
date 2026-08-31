/**
 * Turning an approved page into factual material.
 *
 * Deliberately not a DOM. The renderer needs the marketing substance of a page
 * — what it says it does, who it says it is for, what it answers — and a full
 * parse would be a browser clone maintained for no gain. This walks the markup
 * for the handful of elements that carry meaning and normalises them.
 *
 * It is a reader, never an executor: script and style content is discarded
 * before anything else happens, so no page content can reach a code path that
 * would run it.
 */
export type BlockKind = 'heading' | 'paragraph' | 'listItem' | 'question' | 'answer' | 'structured';

export interface ContentBlock {
  kind: BlockKind;
  text: string;

  /** Heading depth, for headings only. */
  level?: number;
}

export interface ParsedPage {
  title: string | null;
  description: string | null;
  blocks: ContentBlock[];
}

/** Elements whose content is never factual page copy. */
const DROPPED = ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'nav', 'header', 'footer', 'form'];

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
  '#x27': "'",
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, name: string) => {
    const known = ENTITIES[name.toLowerCase()];

    if (known) {
      return known;
    }

    if (name.startsWith('#x') || name.startsWith('#X')) {
      const code = Number.parseInt(name.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }

    if (name.startsWith('#')) {
      const code = Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }

    return match;
  });
}

export function normaliseText(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove everything that is chrome, code or decoration before reading. */
function stripNoise(html: string): string {
  let out = html.replace(/<!--[\s\S]*?-->/g, ' ');

  for (const tag of DROPPED) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), ' ');
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), ' ');
  }

  return out;
}

function firstMatch(html: string, pattern: RegExp): string | null {
  const match = pattern.exec(html);
  return match?.[1] ? normaliseText(match[1]) || null : null;
}

/**
 * JSON-LD, read only for the few shapes that carry product fact.
 *
 * `FAQPage` is the valuable one: a site that publishes its own questions and
 * answers has already done the work of saying what it is prepared to be held
 * to. Anything else in the graph is ignored rather than guessed at.
 */
function readStructured(html: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(pattern)) {
    let data: unknown;

    try {
      data = JSON.parse(decodeEntities(match[1] ?? ''));
    } catch {
      continue;
    }

    const nodes = Array.isArray(data) ? data : [data];

    for (const node of nodes) {
      if (!node || typeof node !== 'object') {
        continue;
      }

      const record = node as Record<string, unknown>;
      const graph = Array.isArray(record['@graph']) ? (record['@graph'] as unknown[]) : [record];

      for (const entry of graph) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const item = entry as Record<string, unknown>;
        const type = String(item['@type'] ?? '');

        if (/FAQPage/i.test(type) && Array.isArray(item.mainEntity)) {
          for (const qa of item.mainEntity as Array<Record<string, unknown>>) {
            const question = normaliseText(String(qa?.name ?? ''));
            const answerNode = qa?.acceptedAnswer as Record<string, unknown> | undefined;
            const answer = normaliseText(String(answerNode?.text ?? ''));

            if (question && answer) {
              blocks.push({ kind: 'question', text: question });
              blocks.push({ kind: 'answer', text: answer });
            }
          }
        }

        if (/(Product|Service|Organization|SoftwareApplication)/i.test(type)) {
          const description = normaliseText(String(item.description ?? ''));

          if (description) {
            blocks.push({ kind: 'structured', text: description });
          }
        }
      }
    }
  }

  return blocks;
}

/**
 * A question is a heading or list item that asks something.
 *
 * Sites publish FAQs as headings far more often than as structured data, and
 * an objection the company has already chosen to answer in public is the most
 * useful thing on the page for a campaign that has to handle objections.
 */
function looksLikeQuestion(text: string): boolean {
  return text.endsWith('?') && text.length <= 160;
}

export function parseHtml(html: string): ParsedPage {
  const structured = readStructured(html);
  const clean = stripNoise(html);

  const title =
    firstMatch(clean, /<title[^>]*>([\s\S]*?)<\/title>/i) ??
    firstMatch(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);

  const description =
    firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
    firstMatch(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);

  const blocks: ContentBlock[] = [];
  const pattern = /<(h[1-6]|p|li|dt|dd|blockquote|summary)\b[^>]*>([\s\S]*?)<\/\1>/gi;

  for (const match of clean.matchAll(pattern)) {
    const tag = (match[1] ?? '').toLowerCase();
    const text = normaliseText(match[2] ?? '');

    if (!text) {
      continue;
    }

    if (/^h[1-6]$/.test(tag)) {
      blocks.push({
        kind: looksLikeQuestion(text) ? 'question' : 'heading',
        text,
        level: Number(tag.slice(1)),
      });
      continue;
    }

    if (tag === 'summary' || tag === 'dt') {
      blocks.push({ kind: looksLikeQuestion(text) ? 'question' : 'heading', text, level: 4 });
      continue;
    }

    if (tag === 'li') {
      blocks.push({ kind: looksLikeQuestion(text) ? 'question' : 'listItem', text });
      continue;
    }

    blocks.push({ kind: 'paragraph', text });
  }

  /*
   * A paragraph that follows a question is its answer. Pairing them keeps a
   * published objection attached to the company's own response to it.
   */
  for (let index = 1; index < blocks.length; index += 1) {
    if (blocks[index - 1]!.kind === 'question' && blocks[index]!.kind === 'paragraph') {
      blocks[index] = { ...blocks[index]!, kind: 'answer' };
    }
  }

  return { title, description, blocks: [...structured, ...blocks] };
}
