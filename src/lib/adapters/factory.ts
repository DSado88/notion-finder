import type { BackendAdapter } from './types';
import {
  getSession,
  getActiveConnection,
  getConfiguredEnvBackends,
  isEnvVarMode,
  type Connection,
  type OAuthBackend,
} from '@/lib/session';

export type BackendType = 'notion' | 'git-local' | 'git-github' | 'linear';

const ADAPTERS_KEY = '__potion_adapters__' as const;

export function getBackendType(): BackendType {
  return (process.env.BACKEND_TYPE as BackendType) || 'notion';
}

/** Per-backend adapter cache (survives HMR). */
function getAdapterCache(): Map<string, BackendAdapter> {
  const g = globalThis as unknown as Record<string, Map<string, BackendAdapter> | undefined>;
  if (!g[ADAPTERS_KEY]) g[ADAPTERS_KEY] = new Map();
  return g[ADAPTERS_KEY]!;
}

/** Get or create a cached adapter for an env-var-configured backend. */
function getEnvAdapter(backend: OAuthBackend): BackendAdapter {
  const cache = getAdapterCache();
  if (cache.has(backend)) return cache.get(backend)!;

  let adapter: BackendAdapter;
  switch (backend) {
    case 'notion': {
      const { NotionAdapter } = require('./notion-adapter');
      adapter = new NotionAdapter();
      break;
    }
    case 'linear': {
      const { LinearAdapter } = require('./linear-adapter');
      adapter = new LinearAdapter(process.env.LINEAR_API_KEY!);
      break;
    }
    case 'git-github': {
      const { GitHubAdapter } = require('./git-github-adapter');
      const [owner, repo] = process.env.GITHUB_REPO!.split('/');
      adapter = new GitHubAdapter(process.env.GITHUB_TOKEN!, owner, repo);
      break;
    }
    default:
      throw new Error(`Unknown env backend: ${backend}`);
  }

  cache.set(backend, adapter);
  return adapter;
}

/** Create an adapter from an OAuth connection's token (not cached — token per session). */
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
 * 1. If env tokens are configured → use session's activeBackend to pick which one
 * 2. Otherwise → read session for OAuth connections
 * 3. Throws if no adapter can be resolved (caller should return 401)
 */
export async function getAdapterFromRequest(): Promise<BackendAdapter> {
  const envBackends = getConfiguredEnvBackends();

  if (envBackends.length > 0) {
    // Multi-env mode: read active selection from session, default to first
    const session = await getSession();
    const active = session.activeBackend && envBackends.includes(session.activeBackend)
      ? session.activeBackend
      : envBackends[0];
    return getEnvAdapter(active);
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
