/**
 * Google OAuth 2.0 / OpenID Connect — authorization code flow with PKCE.
 *
 * §7.1 named magic links as the MVP method and Google as the "optional later";
 * we shipped the later one first, because it removes the transactional-email
 * dependency (deliverability into Ethiopian inboxes was the risk) and the whole
 * `magic_links` table with it. That table stays in the schema unused rather than
 * being dropped, so the second method can be added without a migration.
 *
 * No auth library: the confidential-client code flow is one redirect and one
 * POST, and a dependency here would be more surface than the ~100 lines below.
 */

import { decodeBase64Url, sha256Base64Url } from "./tokens";

const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Google is inconsistent about the scheme in `iss`; both spellings are legitimate. */
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/** Path Google redirects back to. Must match the Console's authorized redirect URI exactly. */
export const CALLBACK_PATH = "/api/auth/callback/google";

/** Thrown for anything that should land the user back on /login with a message. */
export class AuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Retry budget for the token exchange.
 *
 * Sized for the users in §1, not for a datacentre: on a congested mobile link a
 * first request that dies at 6 s often succeeds on the second try, and the whole
 * budget still fits inside the ~20 s a person will wait on a spinner before
 * reloading — which they must not do, because reloading spends their one-use
 * authorization code and turns a recoverable blip into a real failure.
 */
const ATTEMPT_TIMEOUT_MS = 6_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [400, 1_200];

/** Google's documented transient set. Everything else 4xx is a decision, not a hiccup. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POSTs to Google's token endpoint, retrying only what is worth retrying.
 *
 * The distinction this function exists to preserve: a timeout or a 503 means we
 * never learned anything and should ask again, while a 400 `invalid_grant` is
 * Google's final answer about this code — retrying it burns the remaining budget
 * to arrive at the same error more slowly. The two also need different words on
 * the login screen, so they leave here as different `AuthError` codes.
 */
async function postToTokenEndpoint(body: URLSearchParams): Promise<Response> {
  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await delay(BACKOFF_MS[attempt - 1] ?? 1_200);

    try {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        // Per attempt, not for the whole loop: a stalled connection has to be
        // abandoned early enough that a retry still fits in the budget.
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });

      if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS - 1) {
        console.warn("[auth] token endpoint transient status", {
          status: response.status,
          attempt: attempt + 1,
        });
        continue;
      }

      return response;
    } catch (err) {
      // Timeout, DNS, TLS, connection reset — all indistinguishable here and all
      // worth one more try. Held rather than thrown so the last one can explain.
      lastNetworkError = err;
      console.warn("[auth] token endpoint unreachable", { attempt: attempt + 1, err });
    }
  }

  throw new AuthError(
    "network",
    `Token endpoint unreachable after ${MAX_ATTEMPTS} attempts: ${String(lastNetworkError)}`,
  );
}

interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

export function googleConfig(): GoogleConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new AuthError(
      "config",
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set.",
    );
  }

  return { clientId, clientSecret };
}

/** Who Google says the person is — the only thing the rest of the app consumes. */
export interface GoogleIdentity {
  googleId: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
}

export async function codeChallenge(verifier: string): Promise<string> {
  return sha256Base64Url(verifier);
}

export function authorizeUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", options.state);
  url.searchParams.set("code_challenge", options.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Freelancers routinely have a personal and a client Google account signed in
  // at once; without this Google silently picks the first and they end up in the
  // wrong library with no way to tell why.
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeCode(options: {
  code: string;
  redirectUri: string;
  verifier: string;
}): Promise<GoogleIdentity> {
  const { clientId, clientSecret } = googleConfig();

  const response = await postToTokenEndpoint(
    new URLSearchParams({
      code: options.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: options.redirectUri,
      grant_type: "authorization_code",
      code_verifier: options.verifier,
    }),
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");

    // A 5xx that outlived the retries is still an outage on their side, not a
    // problem with this sign-in — telling the user to "try again" is right, and
    // telling them their link was invalid would be a lie.
    const code = isRetryableStatus(response.status) ? "network" : "exchange";
    throw new AuthError(code, `Token exchange failed (${response.status}): ${detail}`);
  }

  const payload = (await response.json()) as { id_token?: unknown };
  if (typeof payload.id_token !== "string") {
    throw new AuthError("exchange", "Token response contained no id_token.");
  }

  return identityFromIdToken(payload.id_token, clientId);
}

interface IdTokenClaims {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  picture?: unknown;
}

/**
 * Reads the ID token's claims without verifying its signature.
 *
 * That is the OIDC-sanctioned shortcut for this exact case (§3.1.3.7): the token
 * came straight back from Google's token endpoint over TLS, in a response only a
 * holder of our client secret could have obtained, so a signature check would be
 * verifying the channel we already trust. It would *not* be safe on a token that
 * arrived any other way — via the browser, an implicit flow, or a client-side
 * `credential` — and that distinction is why this function is not exported.
 */
function identityFromIdToken(idToken: string, clientId: string): GoogleIdentity {
  const segments = idToken.split(".");
  if (segments.length !== 3) throw new AuthError("identity", "Malformed id_token.");

  let claims: IdTokenClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(segments[1])));
  } catch {
    throw new AuthError("identity", "Unreadable id_token payload.");
  }

  if (typeof claims.iss !== "string" || !ISSUERS.includes(claims.iss)) {
    throw new AuthError("identity", `Unexpected id_token issuer: ${String(claims.iss)}`);
  }

  if (claims.aud !== clientId) {
    throw new AuthError("identity", "id_token was issued for a different client.");
  }

  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) {
    throw new AuthError("identity", "id_token is expired.");
  }

  if (typeof claims.sub !== "string" || typeof claims.email !== "string") {
    throw new AuthError("identity", "id_token is missing sub or email.");
  }

  // An unverified address can belong to someone else, and email is how we link a
  // Google login to an existing row — accepting it would be an account takeover.
  if (claims.email_verified !== true) {
    throw new AuthError("unverified", "That Google account has no verified email address.");
  }

  return {
    googleId: claims.sub,
    email: claims.email.toLowerCase(),
    name: typeof claims.name === "string" ? claims.name : null,
    imageUrl: typeof claims.picture === "string" ? claims.picture : null,
  };
}
