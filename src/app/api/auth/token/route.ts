import { NextResponse, type NextRequest } from 'next/server';
import { getSession, type OAuthBackend, type Connection } from '@/lib/session';

/**
 * POST /api/auth/token — Save a manually-pasted API token.
 * Body: { backend, token, repo? }
 *
 * Validates the token against the backend's API, then saves it
 * as a connection in the session (same as OAuth would).
 */
export async function POST(request: NextRequest) {
  const { backend, token, repo } = await request.json() as {
    backend: OAuthBackend;
    token: string;
    repo?: string; // GitHub only: "owner/repo"
  };

  if (!backend || !token) {
    return NextResponse.json({ error: 'Missing backend or token' }, { status: 400 });
  }

  // Validate the token by making a lightweight API call
  let workspaceName: string;
  let githubRepo: string | undefined;

  try {
    switch (backend) {
      case 'notion': {
        const res = await fetch('https://api.notion.com/v1/users/me', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
          },
        });
        if (!res.ok) {
          return NextResponse.json({ error: 'Invalid Notion token' }, { status: 401 });
        }
        const data = await res.json();
        // For integration tokens, the bot user has a workspace name via /v1/users/me
        // but we can get a better name from the workspace search
        workspaceName = data.name || 'Notion';
        break;
      }

      case 'linear': {
        const res = await fetch('https://api.linear.app/graphql', {
          method: 'POST',
          headers: {
            Authorization: token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: '{ viewer { id name } organization { name } }' }),
        });
        if (!res.ok) {
          return NextResponse.json({ error: 'Invalid Linear API key' }, { status: 401 });
        }
        const data = await res.json();
        if (data.errors) {
          return NextResponse.json({ error: 'Invalid Linear API key' }, { status: 401 });
        }
        workspaceName = data.data?.organization?.name || 'Linear';
        break;
      }

      case 'git-github': {
        if (!repo) {
          return NextResponse.json({ error: 'GitHub requires a repo (owner/repo)' }, { status: 400 });
        }
        // Validate token
        const userRes = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!userRes.ok) {
          return NextResponse.json({ error: 'Invalid GitHub token' }, { status: 401 });
        }
        // Validate repo access
        const repoRes = await fetch(`https://api.github.com/repos/${repo}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!repoRes.ok) {
          return NextResponse.json({ error: `Cannot access repo ${repo}` }, { status: 401 });
        }
        workspaceName = repo;
        githubRepo = repo;
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown backend: ${backend}` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Failed to validate token' }, { status: 500 });
  }

  // Save to session
  const session = await getSession();

  // Remove existing connection for this backend if any
  session.connections = session.connections.filter((c) => c.backend !== backend);

  const connection: Connection = {
    backend,
    accessToken: token,
    workspaceName,
    githubRepo,
  };

  session.connections.push(connection);
  session.activeBackend = backend;
  await session.save();

  return NextResponse.json({
    ok: true,
    workspaceName,
    githubRepo,
  });
}
