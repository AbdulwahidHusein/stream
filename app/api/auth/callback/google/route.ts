import { NextResponse, type NextRequest } from "next/server";
import { upsertGoogleUser } from "@/lib/auth/accounts";
import { clearedOauthCookie, OAUTH_COOKIE, sessionCookie } from "@/lib/auth/cookies";
import { AuthError, CALLBACK_PATH, exchangeCode } from "@/lib/auth/google";
import { startSession } from "@/lib/auth/session";
import { constantTimeEqual } from "@/lib/auth/tokens";
import { getDb } from "@/lib/db/client";
import { absoluteUrl, safeInternalPath } from "@/lib/site";

/**
 * GET /api/auth/callback/google — leg two.
 *
 * Every exit from this handler is a redirect to a page, never a JSON body: the
 * user arrives here by having their browser navigated, so an error envelope
 * would render as raw text in the address bar they are staring at.
 */

interface PendingAuth {
  state: string;
  verifier: string;
  next: string | null;
}

export async function GET(request: NextRequest): Promise<Response> {
  const url = request.nextUrl;

  const failure = (code: string): Response => {
    const response = NextResponse.redirect(new URL(`/login?error=${code}`, url));
    response.cookies.set(clearedOauthCookie());
    return response;
  };

  // Google reports consent-screen outcomes here, not as an HTTP error.
  const googleError = url.searchParams.get("error");
  if (googleError) {
    return failure(googleError === "access_denied" ? "cancelled" : "google");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const pending = readPending(request.cookies.get(OAUTH_COOKIE)?.value);

  // A callback with no matching cookie is either CSRF or a link replayed hours
  // later. Neither is worth distinguishing to the user.
  if (!code || !state || !pending || !constantTimeEqual(pending.state, state)) {
    return failure("state");
  }

  try {
    const identity = await exchangeCode({
      code,
      redirectUri: await absoluteUrl(CALLBACK_PATH),
      verifier: pending.verifier,
    });

    const db = await getDb();
    const userId = await upsertGoogleUser(db, identity);
    const token = await startSession(db, userId);

    const destination = safeInternalPath(pending.next) ?? "/library";
    const response = NextResponse.redirect(new URL(destination, url));
    response.cookies.set(sessionCookie(token));
    response.cookies.set(clearedOauthCookie());
    return response;
  } catch (err) {
    // The authorization code is single-use and now spent, so there is nothing to
    // retry with — the user has to start the flow again either way.
    console.error("[auth] callback failed", err);
    return failure(err instanceof AuthError ? err.code : "exchange");
  }
}

function readPending(raw: string | undefined): PendingAuth | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const { state, verifier, next } = parsed as Record<string, unknown>;
    if (typeof state !== "string" || typeof verifier !== "string") return null;

    return { state, verifier, next: typeof next === "string" ? next : null };
  } catch {
    return null;
  }
}
