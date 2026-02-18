import type { BackendAdapter } from './types';
import {
  getSession,
  getActiveConnection,
  isEnvVarMode,
  type Connection,
  type OAuthBackend,
} from '@/lib/session';

export type BackendType = 'notion' | 'git-local' | 'git-github' | 'linear';

const GLOBAL_KEY = '__potion_adapter__' as const;

export function getBackendType(): BackendType {
  return (process.env.BACKEND_TYPE as BackendType) || 'notion';
}

/**
 * Returns the singleton BackendAdapter for the current backend type.
 * Uses globalThis to survive serverless cold starts and HMR in Next.js.
 * Used only in env-var fallback mode (self-hosted/dev).
 */
export function getAdapter(): BackendAdapter {
  const g = globalThis as unknown as Record<string, BackendAdapter | undefined>;

  if (!g[GLOBAL_KEY]) {
    const type = getBackendType();

    switch (type) {
      case 'notion': {
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
      case 'linear': {
        const { LinearAdapter } = require('./linear-adapter');
        g[GLOBAL_KEY] = new LinearAdapter(process.env.LINEAR_API_KEY!);
        break;
      }
      default:
        throw new Error(`Unknown backend type: ${type}`);
    }
  }

  return g[GLOBAL_KEY]!;
}

/** Create an adapter from an OAuth connection's token. */
function createAdapterFromConnection(connection: Connection): BackendAdapter {
  switch (connection.backend) {
    case 'notion': {
      const { NotionAdapter } = require('./notion-adapter');
      return new NotionAdapter(connection.accessToken);
    }
    case 'linear': {
      const { LinearAdapter } = require('./linear-adapter');
      return new LinearAdapter(connection.accessToken);
    }
    case 'git-github': {
      if (!connection.githubRepo) {
        throw new AdapterResolutionError('GitHub connection has no repo selected');
      }
      const { GitHubAdapter } = require('./git-github-adapter');
      const [owner, repo] = connection.githubRepo.split('/');
      return new GitHubAdapter(connection.accessToken, owner, repo);
    }
    default:
      throw new Error(`Unknown OAuth backend: ${(connection as { backend: string }).backend}`);
  }
}

/**
 * Resolve the correct adapter for an API request.
 * 1. If BACKEND_TYPE env var is set → use the global singleton (backward compat)
 * 2. Otherwise → read session, find active connection, create adapter with OAuth token
 * 3. Throws if no adapter can be resolved (caller should return 401)
 */
export async function getAdapterFromRequest(): Promise<BackendAdapter> {
  // Env-var fallback mode
  if (isEnvVarMode()) {
    return getAdapter();
  }

  // OAuth session mode
  const session = await getSession();
  const connection = getActiveConnection(session);

  if (!connection) {
    throw new AdapterResolutionError('No active backend connection');
  }

  // Refresh Linear token if needed
  if (connection.backend === 'linear' && connection.expiresAt && connection.refreshToken) {
    const fiveMinutes = 5 * 60 * 1000;
    if (Date.now() + fiveMinutes >= connection.expiresAt) {
      await refreshLinearToken(connection, session as { connections: Connection[]; save: () => Promise<void> });
    }
  }

  return createAdapterFromConnection(connection);
}

export class AdapterResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdapterResolutionError';
  }
}

/** Refresh an expired Linear OAuth token. */
async function refreshLinearToken(
  connection: Connection,
  session: { connections: Connection[]; save: () => Promise<void> },
): Promise<void> {
  const clientId = process.env.LINEAR_OAUTH_CLIENT_ID;
  const clientSecret = process.env.LINEAR_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret || !connection.refreshToken) return;

  try {
    const res = await fetch('https://api.linear.app/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: connection.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) return;

    const data = await res.json();
    connection.accessToken = data.access_token;
    if (data.refresh_token) connection.refreshToken = data.refresh_token;
    if (data.expires_in) connection.expiresAt = Date.now() + data.expires_in * 1000;

    await session.save();
  } catch {
    // Silently fail — the existing token might still work
  }
}

// Re-export for convenience
export { AdapterError } from './types';
