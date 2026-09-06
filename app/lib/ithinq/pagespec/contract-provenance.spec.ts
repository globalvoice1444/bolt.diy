import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The vendored PageSpec snapshot must stay byte-identical to its source.
 *
 * `contracts/page-spec/v1/` is copied verbatim from ithinq-partner-network at
 * the commit named below. It is an opaque artifact, not renderer source: it is
 * excluded from Prettier and ESLint precisely so no tool can quietly reformat
 * it. These digests are the tripwire — a reformat, a "helpful" fix or an edit
 * to satisfy the renderer all fail here rather than silently invalidating the
 * provenance the renderer reports in /renderer.json.
 *
 * Replacing the snapshot is a deliberate act: take a reviewed contract release,
 * copy the bytes, and update both the commit and these digests together.
 */
const PINNED_CONTRACT_COMMIT = '68e39981235c95c48513dd29b2b8cfe35ba8931b';

const EXPECTED_SHA256: Readonly<Record<string, string>> = {
  'page-spec.schema.json': 'b1c6e8cfcaa9c3920dc2ca6951c4d9dbcd5ae1f56f9ee8d8b50f0ce45f63f9ef',
  'page-spec.example.json': 'dcc82f8a49996459072c685dc7a5abc2f0c2d683350596b92095ad3861c00aa2',
  'page-spec.ts': '8f117d9a02e7f187e963f5c89f0c3092d4f187d3ccfea8e36c24c8fba56546c3',
  'README.md': '09f60f31727ca7edaf9e6b15ab3f63410480e8618819f662a4bb6350d6154fc9',
};

const contractDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../contracts/page-spec/v1');

describe('vendored PageSpec contract provenance', () => {
  it('records the pinned source commit', () => {
    expect(PINNED_CONTRACT_COMMIT).toMatch(/^[0-9a-f]{40}$/);
  });

  for (const [file, expected] of Object.entries(EXPECTED_SHA256)) {
    it(`${file} is byte-identical to the pinned snapshot`, () => {
      const bytes = readFileSync(join(contractDir, file));

      expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected);
    });
  }

  it('has not been reformatted into the renderer house style', () => {
    const source = readFileSync(join(contractDir, 'page-spec.ts'), 'utf8');

    /*
     * The authoritative contract is written without statement semicolons. If
     * this line ever appears with one, a formatter has rewritten the vendored
     * file and provenance no longer holds.
     */
    expect(source).toContain("export type SpecVersion = '1.1'\n");
    expect(source).not.toContain("export type SpecVersion = '1.1';");
  });
});
