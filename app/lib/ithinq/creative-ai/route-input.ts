import type { CreativeRequestInput } from './request';

/** The Med Spa brief this phase demonstrates end to end. */
export const MED_SPA_DEMO_INSTRUCTION =
  'Create a premium Med Spa landing page for the iThinq AI Voice Assistant. Make it elegant, modern, persuasive, image-forward, and high-converting.';

/**
 * Read a creative request from a URL.
 *
 * Presentation intent only. Nothing here can reach business truth: the
 * PageSpec still supplies every fact, URL and disclosure, and an unusable URL
 * simply falls back to the demo brief rather than failing the page.
 */
export function readCreativeRequest(request: Pick<Request, 'url'> | undefined): CreativeRequestInput {
  try {
    const params = new URL(request?.url ?? '').searchParams;

    return {
      userInstruction: params.get('instruction') ?? MED_SPA_DEMO_INSTRUCTION,
      tone: params.get('tone') ?? undefined,
      imagePreference: params.get('imagePreference') ?? undefined,
      conversionGoal: params.get('conversionGoal') ?? undefined,
      creativeDirection: params.get('direction') ?? undefined,
      vertical: params.get('vertical') ?? undefined,
      audience: params.get('audience') ?? undefined,
      objective: params.get('objective') ?? undefined,
    };
  } catch {
    return { userInstruction: MED_SPA_DEMO_INSTRUCTION };
  }
}
