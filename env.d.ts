/**
 * The server-side environment, as a type.
 *
 * Formerly `worker-configuration.d.ts`, which was a Cloudflare-generated name
 * for something that never contained a Cloudflare type: it is a plain
 * description of the variables the server expects. Renamed with the Node
 * migration so the filename stops implying a Workers deployment, and kept
 * because a couple of dozen upstream provider modules refer to `Env`.
 */
interface Env {
  RUNNING_IN_DOCKER: Settings;
  DEFAULT_NUM_CTX: Settings;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  GROQ_API_KEY: string;
  HuggingFace_API_KEY: string;
  OPEN_ROUTER_API_KEY: string;
  OLLAMA_API_BASE_URL: string;
  OPENAI_LIKE_API_KEY: string;
  OPENAI_LIKE_API_BASE_URL: string;
  OPENAI_LIKE_API_MODELS: string;
  TOGETHER_API_KEY: string;
  TOGETHER_API_BASE_URL: string;
  DEEPSEEK_API_KEY: string;
  LMSTUDIO_API_BASE_URL: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  MISTRAL_API_KEY: string;
  XAI_API_KEY: string;
  PERPLEXITY_API_KEY: string;
  AWS_BEDROCK_CONFIG: string;
}

/**
 * `react-dom/server.browser` ships no types of its own.
 *
 * It is the Web-streams build of the renderer, which Node 18+ can run because
 * it has global Web Streams. Only the one function this app uses is declared.
 */
declare module 'react-dom/server.browser' {
  export function renderToReadableStream(
    children: import('react').ReactNode,
    options?: {
      signal?: AbortSignal;
      onError?: (error: unknown) => void;
      bootstrapScripts?: string[];
      bootstrapScriptContent?: string;
      identifierPrefix?: string;
      nonce?: string;
    },
  ): Promise<ReadableStream<Uint8Array> & { allReady: Promise<void> }>;
}
