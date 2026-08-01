import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionCookie } from "@/lib/auth/cookies";

/**
 * Optimistic route guard (§7).
 *
 * Cookie presence only — no database. Proxy runs on every request including
 * prefetches, so a D1 round trip here would be paid dozens of times per page
 * for an answer the page is about to compute properly anyway. This exists to
 * bounce signed-out visitors at the edge and to slide the cookie; the real
 * authorization is `requirePageUser` / `requireUser` next to the data.
 */

const PROTECTED = ["/record", "/library"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  const isProtected = PROTECTED.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );

  if (isProtected && !token) {
    const login = new URL("/login", request.nextUrl);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  if (pathname === "/login" && token) {
    return NextResponse.redirect(new URL("/library", request.nextUrl));
  }

  const response = NextResponse.next();

  /**
   * The sliding half of §7.2's 30-day TTL that the database cannot do.
   * `readSessionUser` extends the row, but a Server Component may not write
   * cookies during render — so the cookie's own Max-Age is refreshed here, on
   * navigation, where a response is still being assembled.
   */
  if (token) response.cookies.set(sessionCookie(token));

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except:
     * - api (route handlers authorize themselves and must return JSON, not a
     *   redirect, to the recorder's fetch calls)
     * - _next/static, _next/image, favicon.ico (no session, no redirect)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
