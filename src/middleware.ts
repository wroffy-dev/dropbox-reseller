import { NextResponse, type NextRequest } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { LOGIN_PATH } from '@/lib/auth/routes';
import { decideAttribution, parseTouch, touchFromVisit, UTM_KEYS } from '@/lib/analytics/touch';

const { auth } = NextAuth(authConfig);

const FIRST_TOUCH_COOKIE = 'attr_first';
const LAST_TOUCH_COOKIE = 'attr_last';
const ONE_YEAR = 60 * 60 * 24 * 365;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * Middleware responsibilities:
 *  1. Send a signed-in visitor who lands on the sign-in screen onward.
 *  2. Capture UTM/referrer attribution into first-touch and last-touch cookies.
 *
 * What it deliberately no longer does is turn an anonymous /admin request
 * away. It used to redirect one to the sign-in screen, which put that screen's
 * path in a Location header — so anything that probed /admin was handed the
 * address moving the screen off /login was meant to keep quiet. The request is
 * let through instead, and `requireUser()` in src/lib/auth/guards.ts answers
 * it with the site's own 404, exactly as a URL that does not exist is
 * answered. /preview and the two-step screens go the same way, through the
 * same guards, because a redirect from any of them leaked the same address.
 *
 * Nothing is lost by dropping the check here, because this was never the
 * boundary. The guard runs on every admin page, Server Action and API route,
 * and unlike middleware it can read the database — which is the only place the
 * answer to "has this session cleared two-factor authentication?" lives, and a
 * check that can only be made in one of the two places must not be the one
 * users rely on.
 *
 * Database-backed redirects are handled in the catch-all route (Node runtime),
 * so they never add a query to every request.
 */
function handle(request: NextRequest & { auth?: { user?: unknown } | null }): NextResponse {
  const { nextUrl } = request;
  const isLoggedIn = Boolean(request.auth?.user);

  // A signed-in visitor at the sign-in screen goes to /admin, which redirects
  // onward to whichever step they still owe.
  if (nextUrl.pathname === LOGIN_PATH && isLoggedIn) {
    return NextResponse.redirect(new URL('/admin', nextUrl.origin));
  }

  // Server Components have no access to the request path; forward it so the
  // public layout can honour each page's header/footer flags.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', nextUrl.pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  captureAttribution(request, response);
  return response;
}

/**
 * Auth.js is wrapped around this only once there is a secret to sign with.
 *
 * On a copy that has not been set up there is no `AUTH_SECRET` — the setup
 * wizard is what generates it — and Auth.js throws `MissingSecret` the moment
 * it is asked for a session. Since this middleware runs on very nearly every
 * request, that turned every page into a 500, including the wizard itself: the
 * one screen able to create the secret could not render without it.
 *
 * Skipping the wrapper is not a weakening. With no secret there are no sessions
 * to read, `request.auth` would be empty anyway, and the only thing the wrapper
 * contributes here is the signed-in redirect away from the sign-in screen —
 * which cannot apply when nobody can be signed in. Authorisation was never done
 * here in any case; `requireUser()` does it on every page and Server Action, and
 * unlike middleware it can read the database.
 *
 * Read once at module scope rather than per request: by the time this module is
 * evaluated the configuration has already been hydrated into the environment by
 * `docker/load-config.cjs`, and a process that has just been installed is
 * restarted by the platform.
 */
const authConfigured = Boolean(process.env.AUTH_SECRET?.trim());

export default authConfigured
  ? auth(handle as Parameters<typeof auth>[0])
  : (handle as unknown as Parameters<typeof auth>[0]);

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
