import type { BackendAdapter } from './types';

export type BackendType = 'notion' | 'git-local' | 'git-github';

const GLOBAL_KEY = '__potion_adapter__' as const;

export function getBackendType(): BackendType {
  return (process.env.BACKEND_TYPE as BackendType) || 'notion';
}

/**
 * Returns the singleton BackendAdapter for the current backend type.
 * Uses globalThis to survive serverless cold starts and HMR in Next.js.
 */
export function getAdapter(): BackendAdapter {
  const g = globalThis as unknown as Record<string, BackendAdapter | undefined>;

  if (!g[GLOBAL_KEY]) {
    const type = getBackendType();

    switch (type) {
      case 'notion': {
        // Lazy require to avoid circular deps and keep adapters tree-shakeable
        const { NotionAdapter } = require('./notion-adapter');
        g[GLOBAL_KEY] = new NotionAdapter();
        break;
      }
      case 'git-local': {
        const { GitLocalAdapter } = require('./git-local-adapter');
        g[GLOBAL_KEY] = new GitLocalAdapter(process.env.GIT_LOCAL_PATH!);
        break;
      }
      case 'git-github': {
        const { GitHubAdapter } = require('./git-github-adapter');
        const [owner, repo] = process.env.GITHUB_REPO!.split('/');
        g[GLOBAL_KEY] = new GitHubAdapter(process.env.GITHUB_TOKEN!, owner, repo);
        break;
      }
      default:
        throw new Error(`Unknown backend type: ${type}`);
    }
  }

  return g[GLOBAL_KEY]!;
}
