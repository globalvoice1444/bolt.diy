/** Demo briefs used by the reviewer surface. */
export const DEMO_BRIEFS = [
  {
    id: 'med-spa-campaign',
    label: 'Med Spa · the flagship request',
    instruction:
      'Create the best converting campaign for Med Spas promoting the iThinq AI Voice Assistant. Make it premium, persuasive, image-forward, and strong enough to use as a real campaign page.',
  },
  {
    id: 'med-spa',
    label: 'Med Spa · premium',
    instruction:
      'Create a premium campaign for Med Spas promoting the iThinq AI Voice Assistant. Make it elegant, persuasive, image-forward, and high-converting.',
  },
  {
    id: 'hvac',
    label: 'HVAC · bold direct response',
    instruction:
      'Create a bold, high-urgency direct-response page for HVAC companies losing jobs because nobody answers the phone. Punchy, blue-collar, scannable, get them to request a quote.',
  },
  {
    id: 'legal',
    label: 'Legal · restrained',
    instruction:
      'Create a restrained, understated page for a law firm. Quiet authority, minimal imagery, mostly typographic. The reader should feel this is a serious practice.',
  },
] as const;

export const DEFAULT_BRIEF: string = DEMO_BRIEFS[0].instruction;
