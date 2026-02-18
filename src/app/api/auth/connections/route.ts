import { NextResponse } from 'next/server';
import { getSession, getConfiguredEnvBackends, toConnectionInfo, isEnvVarMode } from '@/lib/session';
import type { OAuthBackend } from '@/lib/session';

const ENV_NAMES: Record<OAuthBackend, string> = {
  notion: 'Notion',
  linear: 'Linear',
  'git-github': process.env.GITHUB_REPO || 'GitHub',
};

/** Which backends have OAuth credentials configured? */
function getOAuthAvailable(): Record<OAuthBackend, boolean> {
  return {
    notion: !!(process.env.NOTION_OAUTH_CLIENT_ID && process.env.NOTION_OAUTH_CLIENT_SECRET),
    linear: !!(process.env.LINEAR_OAUTH_CLIENT_ID && process.env.LINEAR_OAUTH_CLIENT_SECRET),
    'git-github': !!(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET),
  };
}

/** Return all connected backends (without tokens). */
export async function GET() {
  const oauthAvailable = getOAuthAvailable();

  if (isEnvVarMode()) {
    const envBackends = getConfiguredEnvBackends();
    const session = await getSession();
    const active = session.activeBackend && envBackends.includes(session.activeBackend)
      ? session.activeBackend
      : envBackends[0];

    return NextResponse.json({
      mode: 'env',
      oauthAvailable,
      connections: envBackends.map((b) => ({
        backend: b,
        workspaceName: ENV_NAMES[b] || b,
        isActive: b === active,
        githubRepo: b === 'git-github' ? process.env.GITHUB_REPO : undefined,
      })),
    });
  }

  const session = await getSession();

  return NextResponse.json({
    mode: 'oauth',
    oauthAvailable,
    connections: toConnectionInfo(session.connections, session.activeBackend),
  });
}
