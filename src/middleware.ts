import { NextResponse, type NextRequest } from 'next/server';

/** Check if any backend tokens are configured via env vars. */
function hasEnvTokens(): boolean {
  return !!(
    process.env.BACKEND_TYPE ||
    process.env.NOTION_API_TOKEN ||
    process.env.LINEAR_API_KEY ||
    (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO)
  );
}

/**
 * Redirect unauthenticated users to /connect when no backends are configured.
 * If env tokens are present, skip auth checks entirely.
 */
export function middleware(request: NextRequest) {
  // Env tokens configured — no session needed, everything passes through
  if (hasEnvTokens()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Allow /connect page, auth routes, static assets, and Next.js internals
  if (
    pathname === '/connect' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // Check for session cookie — iron-session encrypts it, so just check existence
  const sessionCookie = request.cookies.get('potion_session');
  if (!sessionCookie?.value) {
    return NextResponse.redirect(new URL('/connect', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
