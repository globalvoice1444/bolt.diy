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
const PINNED_CONTRACT_COMMIT = '51c103ff2492b068095dc356225d5d9ef496b44b';

const EXPECTED_SHA256: Readonly<Record<string, string>> = {
  'page-spec.schema.json': '3a88079cc7cfc9ec62805439d6616b0560da43148de41501f38d76949a1eddb3',
  'page-spec.example.json': 'd4a8ca6f1370b8a4c38ea6ec05d92e641a64d39f41cef36be5f4bc1c95ec6874',
  'page-spec.ts': '5a928aac315b5799dc4eb3da3aa14b6d9a9619a96b0cf92b3094fa2ec78df9f5',
  'README.md': '2f6f50b1eec7cd972b3cbfe9392f4104ce352540a6da1bc1c7fe5d3afffa6e7b',
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
    expect(source).toContain("export type SpecVersion = '1.0'\n");
    expect(source).not.toContain("export type SpecVersion = '1.0';");
  });
});
