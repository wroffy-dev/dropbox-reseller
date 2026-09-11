import { NextResponse, type NextRequest } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { decideAttribution, parseTouch, touchFromVisit, UTM_KEYS } from '@/lib/analytics/touch';

const { auth } = NextAuth(authConfig);

const FIRST_TOUCH_COOKIE = 'attr_first';
const LAST_TOUCH_COOKIE = 'attr_last';
const ONE_YEAR = 60 * 60 * 24 * 365;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * Middleware responsibilities:
 *  1. Gate /admin, /preview and the two-step screens behind a token.
 *  2. Capture UTM/referrer attribution into first-touch and last-touch cookies.
 *
 * Note what this does NOT do: it does not decide whether a session has cleared
 * two-factor authentication. That state lives in a database row, middleware
 * runs on the edge without database access, and a check that can only be made
 * in one of the two places must not be the one users rely on. The
 * authoritative enforcement is in src/lib/auth/guards.ts, which every admin
 * page, Server Action and API route already goes through; this is only a cheap
 * first pass so an anonymous visitor never reaches a server component at all.
 *
 * Database-backed redirects are handled in the catch-all route (Node runtime),
 * so they never add a query to every request.
 */
export default auth((request) => {
  const { nextUrl } = request;
  // /preview renders unpublished pages for the admin preview iframe, so it is
  // gated exactly like /admin. The route itself still checks pages.view.
  const isAdmin = nextUrl.pathname.startsWith('/admin') || nextUrl.pathname.startsWith('/preview');
  // The enrolment and verification screens need the identity behind a
  // half-finished sign-in, so they require a token but not a full session.
  const isTwoStep = nextUrl.pathname.startsWith('/auth/');
  const isLoggedIn = Boolean(request.auth?.user);

  if ((isAdmin || isTwoStep) && !isLoggedIn) {
    const url = new URL('/login', nextUrl.origin);
    if (isAdmin) url.searchParams.set('callbackUrl', nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(url);
  }

  // A signed-in visitor at /login goes to /admin, which redirects onward to
  // whichever step they still owe.
  if (nextUrl.pathname === '/login' && isLoggedIn) {
    return NextResponse.redirect(new URL('/admin', nextUrl.origin));
  }

  // Server Components have no access to the request path; forward it so the
  // public layout can honour each page's header/footer flags.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', nextUrl.pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  captureAttribution(request, response);
  return response;
});

function captureAttribution(request: NextRequest, response: NextResponse) {
  const { nextUrl } = request;
  if (
    nextUrl.pathname.startsWith('/admin') ||
    nextUrl.pathname.startsWith('/preview') ||
    nextUrl.pathname.startsWith('/auth') ||
    nextUrl.pathname.startsWith('/api')
  ) {
    return;
  }

  const referrer = request.headers.get('referer');
  const externalReferrer = referrer && !referrer.includes(nextUrl.host) ? referrer : null;

  const visit = touchFromVisit({
    params: Object.fromEntries(UTM_KEYS.map((key) => [key, nextUrl.searchParams.get(key)])),
    externalReferrer,
    path: nextUrl.pathname,
  });

  const decision = decideAttribution({
    visit,
    storedFirst: parseTouch(request.cookies.get(FIRST_TOUCH_COOKIE)?.value),
    storedLast: parseTouch(request.cookies.get(LAST_TOUCH_COOKIE)?.value),
  });

  const options = {
    httpOnly: false, // read by the client attribution helper before form submit
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  };

  if (decision.writeFirst) {
    response.cookies.set(
      FIRST_TOUCH_COOKIE,
      encodeURIComponent(JSON.stringify(decision.writeFirst)),
      {
        ...options,
        maxAge: ONE_YEAR,
      },
    );
  }
  if (decision.writeLast) {
    response.cookies.set(
      LAST_TOUCH_COOKIE,
      encodeURIComponent(JSON.stringify(decision.writeLast)),
      {
        ...options,
        maxAge: THIRTY_DAYS,
      },
    );
  }
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, static assets and the auth endpoints.
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|uploads|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|woff|woff2|ttf)$).*)',
  ],
};
