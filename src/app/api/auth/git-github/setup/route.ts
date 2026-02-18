import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

/** Save the selected repo to the GitHub connection. */
export async function POST(request: NextRequest) {
  const { repo } = await request.json() as { repo: string };

  if (!repo || !repo.includes('/')) {
    return NextResponse.json({ error: 'Invalid repo format. Expected owner/repo.' }, { status: 400 });
  }

  const session = await getSession();
  const connection = session.connections.find((c) => c.backend === 'git-github');

  if (!connection) {
    return NextResponse.json({ error: 'No GitHub connection' }, { status: 401 });
  }

  // Verify the user has access to this repo
  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Repository not found or no access' }, { status: 404 });
  }

  const repoData = await res.json();

  connection.githubRepo = repo;
  connection.workspaceName = repoData.full_name;
  session.activeBackend = 'git-github';
  await session.save();

  return NextResponse.json({ ok: true });
}
