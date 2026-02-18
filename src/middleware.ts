import { NextResponse, type NextRequest } from 'next/server';

/**
 * Redirect unauthenticated users to /connect when no env-var fallback is configured.
 * If BACKEND_TYPE is set (self-hosted/dev mode), skip auth checks entirely.
 */
export function middleware(request: NextRequest) {
  // Env-var mode — no session needed, everything passes through
  if (process.env.BACKEND_TYPE) {
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
