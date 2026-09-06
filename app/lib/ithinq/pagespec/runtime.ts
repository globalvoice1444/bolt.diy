export interface ProjectManifest {
  manifestVersion: 1;
  entry: `/${string}`;
  files: Readonly<Record<`/${string}`, string>>;
  metadata: {
    compiler: string;
    contract: 'PageSpec 1.0';
    contractSource: string;
    pageReference: string;

    /** Presentation provenance. Which creative direction composed the document. */
    direction: string;
    directionLabel: string;

    /**
     * Which point in the design space the page came out at.
     *
     * A digest of the seed inputs, never the inputs themselves: enough to
     * reproduce or explain a look, and no document or caller text at all.
     */
    designSeed: string;
  };
}

export interface RuntimePreview {
  document: string;
  mimeType: 'text/html; charset=utf-8';
  sandbox: readonly ['allow-same-origin', 'allow-popups', 'allow-popups-to-escape-sandbox'];
  headers: Readonly<{
    'Cross-Origin-Embedder-Policy': 'require-corp';
    'Cross-Origin-Resource-Policy': 'same-origin';
  }>;
}

export interface RuntimePort {
  prepare(manifest: ProjectManifest): RuntimePreview;
}

/**
 * Static POC runtime. It has no shell, package manager, eval, network fetch,
 * or WebContainer dependency. A future runtime can implement the same port.
 */
export class InlineDocumentRuntime implements RuntimePort {
  prepare(manifest: ProjectManifest): RuntimePreview {
    const document = manifest.files[manifest.entry];

    if (document === undefined) {
      throw new Error(`Project manifest entry ${manifest.entry} does not exist.`);
    }

    return {
      document,
      mimeType: 'text/html; charset=utf-8',
      sandbox: ['allow-same-origin', 'allow-popups', 'allow-popups-to-escape-sandbox'],
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    };
  }
}

export const inlineDocumentRuntime = new InlineDocumentRuntime();
