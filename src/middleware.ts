import { NextResponse, type NextRequest } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/config';

const { auth } = NextAuth(authConfig);

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
const FIRST_TOUCH_COOKIE = 'attr_first';
const LAST_TOUCH_COOKIE = 'attr_last';
const ONE_YEAR = 60 * 60 * 24 * 365;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * Middleware responsibilities:
 *  1. Gate /admin behind an authenticated session.
 *  2. Capture UTM/referrer attribution into first-touch and last-touch cookies.
 *
 * Database-backed redirects are handled in the catch-all route (Node runtime),
 * so they never add a query to every request.
 */
export default auth((request) => {
  const { nextUrl } = request;
  const isAdmin = nextUrl.pathname.startsWith('/admin');
  const isLoggedIn = Boolean(request.auth?.user);

  if (isAdmin && !isLoggedIn) {
    const url = new URL('/login', nextUrl.origin);
    url.searchParams.set('callbackUrl', nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(url);
  }

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
  if (nextUrl.pathname.startsWith('/admin') || nextUrl.pathname.startsWith('/api')) return;

  const params = nextUrl.searchParams;
  const hasUtm = UTM_KEYS.some((key) => params.get(key));
  const referrer = request.headers.get('referer');
  const isExternalReferrer =
    referrer && !referrer.includes(nextUrl.host) ? referrer.slice(0, 500) : null;

  if (!hasUtm && !isExternalReferrer) return;

  const touch: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) touch[key] = value.slice(0, 200);
  }
  if (isExternalReferrer) touch.referrer = isExternalReferrer;
  touch.landing = nextUrl.pathname.slice(0, 300);
  touch.at = new Date().toISOString();

  const encoded = encodeURIComponent(JSON.stringify(touch));
  const options = {
    httpOnly: false, // read by the client attribution helper before form submit
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  };

  if (!request.cookies.get(FIRST_TOUCH_COOKIE)) {
    response.cookies.set(FIRST_TOUCH_COOKIE, encoded, { ...options, maxAge: ONE_YEAR });
  }
  response.cookies.set(LAST_TOUCH_COOKIE, encoded, { ...options, maxAge: THIRTY_DAYS });
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, static assets and the auth endpoints.
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|uploads|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|woff|woff2|ttf)$).*)',
  ],
};
