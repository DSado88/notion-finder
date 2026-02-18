import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

/** List the user's GitHub repos for the repo picker. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  const connection = session.connections.find((c) => c.backend === 'git-github');

  if (!connection) {
    return NextResponse.json({ error: 'No GitHub connection' }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get('q') || '';
  const page = Number(request.nextUrl.searchParams.get('page')) || 1;

  let url: string;
  if (query) {
    // Search repos the user has access to
    url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+in:name+fork:true&sort=updated&per_page=20&page=${page}`;
  } else {
    // List user's repos sorted by recent push
    url = `https://api.github.com/user/repos?sort=pushed&per_page=20&page=${page}&affiliation=owner,collaborator,organization_member`;
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch repos' }, { status: res.status });
  }

  const data = await res.json();
  const repos = (query ? data.items : data).map((r: Record<string, unknown>) => ({
    full_name: r.full_name,
    description: r.description,
    private: r.private,
    pushed_at: r.pushed_at,
  }));

  return NextResponse.json({ repos });
}
