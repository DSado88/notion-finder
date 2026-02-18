import { NextResponse, type NextRequest } from 'next/server';
import { getSession, type Connection } from '@/lib/session';

/** Handle Notion OAuth callback — exchange code for token. */
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

  const clientId = process.env.NOTION_OAUTH_CLIENT_ID!;
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET!;
  const redirectUri = `${baseUrl}/api/auth/notion/callback`;

  // Exchange code for token
  const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error('Notion token exchange failed:', body);
    return NextResponse.redirect(`${baseUrl}/connect?error=token_exchange_failed`);
  }

  const data = await tokenRes.json();

  // Remove existing Notion connection if any
  session.connections = session.connections.filter((c) => c.backend !== 'notion');

  const connection: Connection = {
    backend: 'notion',
    accessToken: data.access_token,
    workspaceName: data.workspace_name || 'Notion Workspace',
    workspaceIcon: data.workspace_icon || undefined,
  };

  session.connections.push(connection);

  // Auto-activate if no active backend
  if (!session.activeBackend) {
    session.activeBackend = 'notion';
  }

  await session.save();

  return NextResponse.redirect(`${baseUrl}/`);
}
