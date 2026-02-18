import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

/** Handle GitHub OAuth callback — exchange code for token, save connection. */
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3099';
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/connect?error=no_code`);
  }

  const session = await getSession();

  // Verify CSRF state
  if (!state || state !== session.oauthState) {
    return NextResponse.redirect(`${baseUrl}/connect?error=invalid_state`);
  }
  session.oauthState = undefined;

  // Exchange code for token
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${baseUrl}/connect?error=not_configured`);
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${baseUrl}/connect?error=token_exchange_failed`);
  }

  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    return NextResponse.redirect(`${baseUrl}/connect?error=${tokenData.error}`);
  }

  const accessToken = tokenData.access_token;

  // Fetch GitHub user info for display name
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userData = userRes.ok ? await userRes.json() : null;
  const displayName = userData?.login || 'GitHub';

  // Remove any existing GitHub connection
  session.connections = session.connections.filter((c) => c.backend !== 'git-github');

  // Add new connection (no repo selected yet — user picks on connect page)
  session.connections.push({
    backend: 'git-github',
    accessToken,
    workspaceName: displayName,
  });

  // Make it active
  session.activeBackend = 'git-github';
  await session.save();

  // Redirect to connect page with setup flag so user can pick a repo
  return NextResponse.redirect(`${baseUrl}/connect?setup=git-github`);
}
