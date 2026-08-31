import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import examplePageSpec from '@ithinq-pagespec/page-spec.example.json';
import {
  compilePageSpecToProjectManifest,
  inlineDocumentRuntime,
  isDirectionId,
  PageSpecValidationError,
} from '~/lib/ithinq/pagespec';

const MAX_PAGESPEC_BYTES = 512 * 1024;

/**
 * Read the requested creative direction from the URL.
 *
 * Presentation-only, and closed: anything outside the known direction set is
 * ignored so the renderer falls back to the direction derived from the
 * document. Untrusted input can influence how the page looks, never what it
 * says, and never the validation or URL policy applied to it.
 */
function requestedDirection(request: Pick<Request, 'url'> | undefined): string | undefined {
  try {
    const value = new URL(request?.url ?? '').searchParams.get('direction');

    return isDirectionId(value) ? value : undefined;
  } catch {
    // Presentation-only input. An unusable URL must never stop the page rendering.
    return undefined;
  }
}

function renderPageSpec(input: unknown, direction?: string): Response {
  const { manifest } = compilePageSpecToProjectManifest(input, { direction });
  const preview = inlineDocumentRuntime.prepare(manifest);

  return new Response(preview.document, {
    headers: {
      'Content-Type': preview.mimeType,
      'Cache-Control': 'no-store',
      ...preview.headers,
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function jsonError(status: number, code: string, detail: string): Response {
  return Response.json({ error: { code, detail } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function loader({ request }: LoaderFunctionArgs) {
  return renderPageSpec(examplePageSpec, requestedDirection(request));
}

export async function action({ request }: ActionFunctionArgs) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return jsonError(415, 'unsupported_media_type', 'Send a PageSpec document as application/json.');
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);

  if (Number.isFinite(contentLength) && contentLength > MAX_PAGESPEC_BYTES) {
    return jsonError(413, 'pagespec_too_large', `PageSpec exceeds the ${MAX_PAGESPEC_BYTES}-byte POC limit.`);
  }

  const body = await request.text();

  if (new TextEncoder().encode(body).byteLength > MAX_PAGESPEC_BYTES) {
    return jsonError(413, 'pagespec_too_large', `PageSpec exceeds the ${MAX_PAGESPEC_BYTES}-byte POC limit.`);
  }

  let input: unknown;

  try {
    input = JSON.parse(body);
  } catch {
    return jsonError(400, 'invalid_json', 'The request body is not valid JSON.');
  }

  try {
    return renderPageSpec(input, requestedDirection(request));
  } catch (error) {
    if (error instanceof PageSpecValidationError) {
      return Response.json(
        { error: { code: 'pagespec_not_renderable', detail: error.message, validation: error.validation } },
        { status: 422, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    throw error;
  }
}
