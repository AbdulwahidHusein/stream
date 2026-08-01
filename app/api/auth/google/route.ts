import { NextResponse, type NextRequest } from "next/server";
import { oauthCookie } from "@/lib/auth/cookies";
import { AuthError, authorizeUrl, CALLBACK_PATH, codeChallenge, googleConfig } from "@/lib/auth/google";
import { randomToken } from "@/lib/auth/tokens";
import { absoluteUrl, safeInternalPath } from "@/lib/site";

/**
 * GET /api/auth/google — leg one of the §7 sign-in.
 *
 * Everything the callback will need to trust the response (the `state` it must
 * match, the PKCE verifier, and where the user was headed) goes into one
 * short-lived HttpOnly cookie. The alternative — a `pending_auth` table — would
 * be a D1 write and a cron to clean it up, for state the browser is already
 * carrying back to us.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { clientId } = googleConfig();

    const state = randomToken();
    const verifier = randomToken();
    const next = safeInternalPath(request.nextUrl.searchParams.get("next"));

    const response = NextResponse.redirect(
      authorizeUrl({
        clientId,
        // Not the request origin: this string has to be byte-identical to the
        // one registered in the Google Console, so APP_URL wins where it is set.
        redirectUri: await absoluteUrl(CALLBACK_PATH),
        state,
        challenge: await codeChallenge(verifier),
      }),
    );

    response.cookies.set(oauthCookie(JSON.stringify({ state, verifier, next })));
    return response;
  } catch (err) {
    const code = err instanceof AuthError ? err.code : "start";
    console.error("[auth] sign-in start failed", err);
    return NextResponse.redirect(new URL(`/login?error=${code}`, request.nextUrl));
  }
}
