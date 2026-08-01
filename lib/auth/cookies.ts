/**
 * Cookie names and shapes for §7.2.
 *
 * Deliberately dependency-free: `middleware.ts` imports this, and middleware
 * runs ahead of the app on every request, so anything it pulls in —
 * `next/headers`, Drizzle, the D1 client — would be paid for on requests that
 * never touch a session.
 */

export const SESSION_COOKIE = "stream_session";

/** Carries the OAuth `state` and PKCE verifier between the two callback legs. */
export const OAUTH_COOKIE = "stream_oauth";

/** §7.2: 30 days, slid forward on use rather than fixed from sign-in. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Long enough for a slow consent screen, short enough that a stale one is dead. */
const OAUTH_TTL_MS = 10 * 60 * 1000;

/**
 * Browsers treat `localhost` as a secure context, but Safari has historically
 * refused `Secure` cookies over plain http — which would silently break sign-in
 * in local dev only, the worst place to debug it.
 */
const SECURE = process.env.NODE_ENV === "production";

export interface CookieSpec {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  /** `lax`, not `strict`: the OAuth callback is a cross-site top-level GET back
   * to us, and `strict` would withhold the cookie on exactly that request. */
  sameSite: "lax";
  path: string;
  maxAge: number;
}

function cookie(name: string, value: string, maxAgeMs: number): CookieSpec {
  return {
    name,
    value,
    httpOnly: true,
    secure: SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

export function sessionCookie(token: string): CookieSpec {
  return cookie(SESSION_COOKIE, token, SESSION_TTL_MS);
}

export function clearedSessionCookie(): CookieSpec {
  return cookie(SESSION_COOKIE, "", 0);
}

export function oauthCookie(value: string): CookieSpec {
  return cookie(OAUTH_COOKIE, value, OAUTH_TTL_MS);
}

export function clearedOauthCookie(): CookieSpec {
  return cookie(OAUTH_COOKIE, "", 0);
}
