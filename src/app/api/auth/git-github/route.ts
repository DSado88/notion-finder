import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import crypto from 'crypto';

/** Initiate GitHub OAuth flow. */
export async function GET() {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'GitHub OAuth not configured' }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3099';
  const state = crypto.randomBytes(16).toString('hex');

  // Store state in session for CSRF protection
  const session = await getSession();
  session.oauthState = state;
  await session.save();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/auth/git-github/callback`,
    scope: 'repo',
    state,
  });

  return NextResponse.redirect(`https://github.com/login/oauth/authorize?${params}`);
}
