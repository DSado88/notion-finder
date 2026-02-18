import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { randomBytes } from 'crypto';

/** Initiate Linear OAuth flow. */
export async function GET() {
  const clientId = process.env.LINEAR_OAUTH_CLIENT_ID;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  if (!clientId || !baseUrl) {
    return NextResponse.json(
      { error: 'Linear OAuth is not configured (missing LINEAR_OAUTH_CLIENT_ID or NEXT_PUBLIC_BASE_URL)' },
      { status: 500 },
    );
  }

  // Generate CSRF state token
  const state = randomBytes(16).toString('hex');
  const session = await getSession();
  session.oauthState = state;
  await session.save();

  const redirectUri = `${baseUrl}/api/auth/linear/callback`;
  const url = new URL('https://linear.app/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'read,write');
  url.searchParams.set('state', state);

  return NextResponse.redirect(url.toString());
}
