import { describe, expect, it } from 'vitest';
import examplePageSpec from '@ithinq-pagespec/page-spec.example.json';
import type { PageSpec } from '@ithinq-pagespec/page-spec';
import { compilePageSpecToProjectManifest } from './compiler';
import { inlineDocumentRuntime } from './runtime';
import { PageSpecValidationError, validatePageSpec } from './validator';

function copyFixture(): PageSpec {
  return JSON.parse(JSON.stringify(examplePageSpec)) as PageSpec;
}

describe('PageSpec V1 renderer POC', () => {
  it('accepts the authoritative producer-generated example', () => {
    expect(validatePageSpec(copyFixture())).toEqual({ renderable: true, findings: [], skipSections: [] });
  });

  it('fails closed on unsupported versions before checking anything else', () => {
    const input: Record<string, unknown> = { ...copyFixture(), specVersion: '1.1' };
    delete input.disclosure;

    const result = validatePageSpec(input);
    expect(result.renderable).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.code).toBe('unsupported_spec_version');
  });

  it('rejects missing disclosure structurally', () => {
    const input: Partial<PageSpec> = { ...copyFixture() };
    delete input.disclosure;

    const result = validatePageSpec(input);
    expect(result.renderable).toBe(false);
    expect(result.findings[0]?.code).toBe('schema_validation_failed');
  });

  it('does not let a document authorize its own hostile CTA host', () => {
    const input = copyFixture();
    input.ctas.primary.url = 'https://evil.example/collect';
    input.policy.allowedLinkHosts = ['evil.example'];

    const result = validatePageSpec(input);
    expect(result.renderable).toBe(false);
    expect(result.findings.some((item) => item.code === 'link_policy_outside_ceiling')).toBe(true);
  });

  it('degrades past an unknown optional section and fails on a required one', () => {
    const input = copyFixture();
    input.sections.push({
      kind: 'future_kind',
      purpose: 'create_recognition',
      provenance: { factRefs: [] },
      emphasis: 'aside',
    });

    const optional = validatePageSpec(input);
    expect(optional.renderable).toBe(true);
    expect(optional.skipSections).toEqual([input.sections.length - 1]);

    input.sections.at(-1)!.required = true;

    const required = validatePageSpec(input);
    expect(required.renderable).toBe(false);
    expect(required.findings.at(-1)?.code).toBe('unknown_required_section_kind');
  });

  it('compiles byte-for-byte deterministically', () => {
    const first = compilePageSpecToProjectManifest(copyFixture());
    const second = compilePageSpecToProjectManifest(copyFixture());
    expect(second.manifest).toEqual(first.manifest);
  });

  it('preserves section order, exact URLs, disclosure, and provenance', () => {
    const input = copyFixture();
    const { manifest } = compilePageSpecToProjectManifest(input);
    const html = manifest.files['/index.html'];
    const canonicalSpec = manifest.files['/pagespec.json'];
    const headings = input.sections
      .map((section) => section.heading)
      .filter((heading): heading is string => Boolean(heading));

    expect(html).toContain(input.ctas.primary.url);
    expect(html).toContain(input.disclosure.text);
    expect(canonicalSpec).toContain(input.sections[2]!.provenance.factRefs[0]);

    for (let index = 1; index < headings.length; index += 1) {
      expect(html.indexOf(headings[index - 1]!)).toBeLessThan(html.indexOf(headings[index]!));
    }
  });

  it('escapes content and emits a script-free static document', () => {
    const input = copyFixture();
    input.page.headline = '<script>alert("owned")</script>';

    const { manifest } = compilePageSpecToProjectManifest(input);
    const html = manifest.files['/index.html'];
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;owned&quot;)&lt;/script&gt;');
  });

  it('keeps the runtime behind a static manifest port', () => {
    const { manifest } = compilePageSpecToProjectManifest(copyFixture());
    const preview = inlineDocumentRuntime.prepare(manifest);
    expect(preview.document).toBe(manifest.files[manifest.entry]);
    expect(preview.sandbox).toEqual(['allow-popups', 'allow-popups-to-escape-sandbox']);
  });

  it('throws a classified error instead of rendering an invalid page', () => {
    const input = copyFixture();
    input.ctas.primary.url = 'http://ithinq.ai/demo';
    expect(() => compilePageSpecToProjectManifest(input)).toThrow(PageSpecValidationError);
  });
});
