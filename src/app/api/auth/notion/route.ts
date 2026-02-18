import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { randomBytes } from 'crypto';

/** Initiate Notion OAuth flow. */
export async function GET() {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  if (!clientId || !baseUrl) {
    return NextResponse.json(
      { error: 'Notion OAuth is not configured (missing NOTION_OAUTH_CLIENT_ID or NEXT_PUBLIC_BASE_URL)' },
      { status: 500 },
    );
  }

  // Generate CSRF state token
  const state = randomBytes(16).toString('hex');
  const session = await getSession();
  session.oauthState = state;
  await session.save();

  const redirectUri = `${baseUrl}/api/auth/notion/callback`;
  const url = new URL('https://api.notion.com/v1/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('owner', 'user');
  url.searchParams.set('state', state);

  return NextResponse.redirect(url.toString());
}
