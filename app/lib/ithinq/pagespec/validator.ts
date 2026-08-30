import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import pageSpecSchema from '@ithinq-pagespec/page-spec.schema.json';
import {
  SECTION_KINDS,
  type PageSpec,
  type ValidationFinding,
  type ValidationResult,
} from '@ithinq-pagespec/page-spec';

export const POC_RENDERER_LINK_HOST_CEILING = ['ithinq.ai', 'partners.ithinq.ai'] as const;

export interface PageSpecValidationOptions {
  /** The file-import POC applies a local ceiling unless transport is trusted. */
  trustedTransport?: boolean;
  rendererAllowedLinkHosts?: readonly string[];
}

export interface ValidatedPageSpec {
  spec: PageSpec;
  validation: ValidationResult;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validateSchema = ajv.compile(pageSpecSchema);
const knownKinds = new Set<string>(SECTION_KINDS);

function finding(
  severity: ValidationFinding['severity'],
  code: string,
  detail: string,
  sectionIndex?: number,
): ValidationFinding {
  return { severity, code, detail, sectionIndex };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeHosts(hosts: readonly string[]): Set<string> {
  return new Set(hosts.map((host) => host.trim().toLowerCase()).filter(Boolean));
}

function validateUrl(
  rawUrl: string,
  documentHosts: Set<string>,
  effectiveHosts: Set<string>,
  label: string,
): ValidationFinding[] {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return [finding('fatal', 'missing_url', `${label} is not a valid URL.`)];
  }

  if (parsed.protocol !== 'https:') {
    return [finding('fatal', 'insecure_url', `${label} must use HTTPS.`)];
  }

  const host = parsed.hostname.toLowerCase();

  if (!documentHosts.has(host) || !effectiveHosts.has(host)) {
    return [finding('fatal', 'url_host_not_allowed', `${label} host ${host} is outside the effective allowlist.`)];
  }

  return [];
}

export function validatePageSpec(value: unknown, options: PageSpecValidationOptions = {}): ValidationResult {
  const version = isRecord(value) ? value.specVersion : undefined;

  if (version !== '1.0') {
    return {
      renderable: false,
      findings: [
        finding('fatal', 'unsupported_spec_version', `Expected PageSpec 1.0; received ${JSON.stringify(version)}.`),
      ],
      skipSections: [],
    };
  }

  if (!validateSchema(value)) {
    const detail = (validateSchema.errors ?? [])
      .map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`)
      .join('; ');

    return {
      renderable: false,
      findings: [finding('fatal', 'schema_validation_failed', detail || 'PageSpec failed structural validation.')],
      skipSections: [],
    };
  }

  const spec = value as unknown as PageSpec;
  const findings: ValidationFinding[] = [];
  const skipSections: number[] = [];
  const documentHosts = normalizeHosts(spec.policy.allowedLinkHosts);
  const rendererHosts = normalizeHosts(options.rendererAllowedLinkHosts ?? POC_RENDERER_LINK_HOST_CEILING);
  const effectiveHosts = options.trustedTransport
    ? documentHosts
    : new Set([...documentHosts].filter((host) => rendererHosts.has(host)));

  if (effectiveHosts.size === 0) {
    findings.push(
      finding('fatal', 'link_policy_outside_ceiling', 'No document host is allowed by the renderer security ceiling.'),
    );
  }

  findings.push(...validateUrl(spec.ctas.primary.url, documentHosts, effectiveHosts, 'Primary CTA'));

  if (spec.ctas.secondary) {
    findings.push(...validateUrl(spec.ctas.secondary.url, documentHosts, effectiveHosts, 'Secondary CTA'));
  }

  spec.sections.forEach((section, index) => {
    if (!knownKinds.has(section.kind)) {
      if (section.required) {
        findings.push(
          finding(
            'fatal',
            'unknown_required_section_kind',
            `Required section kind ${section.kind} is unsupported.`,
            index,
          ),
        );
      } else {
        findings.push(
          finding('degradable', 'unknown_section_kind', `Skipping unsupported section kind ${section.kind}.`, index),
        );
        skipSections.push(index);
      }
    }

    if (section.asset) {
      findings.push(...validateUrl(section.asset.url, documentHosts, effectiveHosts, `Section ${index} asset`));
    }
  });

  const renderable = findings.every((item) => item.severity !== 'fatal');

  return { renderable, findings, skipSections: renderable ? skipSections : [] };
}

export function requireValidPageSpec(value: unknown, options?: PageSpecValidationOptions): ValidatedPageSpec {
  const validation = validatePageSpec(value, options);

  if (!validation.renderable) {
    const detail = validation.findings.map((item) => `${item.code}: ${item.detail}`).join('\n');
    throw new PageSpecValidationError(detail, validation);
  }

  return { spec: value as PageSpec, validation };
}

export class PageSpecValidationError extends Error {
  constructor(
    message: string,
    readonly validation: ValidationResult,
  ) {
    super(message);
    this.name = 'PageSpecValidationError';
  }
}
