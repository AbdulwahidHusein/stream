/**
 * Token primitives shared by the session cookie and the OAuth handshake.
 *
 * WebCrypto only — the same code runs in `next dev` (Node) and in the deployed
 * Worker, and neither needs `node:crypto` for any of this.
 */

/** 256 bits. The session cookie is a bearer credential, so it must not be guessable. */
const TOKEN_BYTES = 32;

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeBase64Url(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

export function randomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

/**
 * Compares without leaking where the mismatch is via timing.
 *
 * The values compared here (OAuth `state`) are ours and short-lived, so this is
 * belt-and-braces rather than load-bearing — but a `===` on a secret is the kind
 * of thing that gets copied into a place where it does matter.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
