import { NextResponse, type NextRequest } from 'next/server';
import { getSession, type Connection } from '@/lib/session';

/** Handle Linear OAuth callback — exchange code for token. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;

  if (error) {
    return NextResponse.redirect(`${baseUrl}/connect?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/connect?error=missing_code`);
  }

  // Verify CSRF state
  const session = await getSession();
  if (!state || state !== session.oauthState) {
    return NextResponse.redirect(`${baseUrl}/connect?error=invalid_state`);
  }
  session.oauthState = undefined;

  const clientId = process.env.LINEAR_OAUTH_CLIENT_ID!;
  const clientSecret = process.env.LINEAR_OAUTH_CLIENT_SECRET!;
  const redirectUri = `${baseUrl}/api/auth/linear/callback`;

  // Exchange code for token
  const tokenRes = await fetch('https://api.linear.app/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error('Linear token exchange failed:', body);
    return NextResponse.redirect(`${baseUrl}/connect?error=token_exchange_failed`);
  }

  const data = await tokenRes.json();

  // Fetch workspace name from Linear API
  let workspaceName = 'Linear Workspace';
  try {
    const orgRes = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${data.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: '{ organization { name } }' }),
    });
    if (orgRes.ok) {
      const orgData = await orgRes.json();
      workspaceName = orgData.data?.organization?.name ?? workspaceName;
    }
  } catch {
    // Use default name
  }

  // Remove existing Linear connection if any
  session.connections = session.connections.filter((c) => c.backend !== 'linear');

  const connection: Connection = {
    backend: 'linear',
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    workspaceName,
  };

  session.connections.push(connection);

  // Auto-activate if no active backend
  if (!session.activeBackend) {
    session.activeBackend = 'linear';
  }

  await session.save();

  return NextResponse.redirect(`${baseUrl}/`);
}
