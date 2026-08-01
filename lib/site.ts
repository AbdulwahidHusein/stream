import { headers } from "next/headers";

/**
 * Absolute origin for a server-rendered page.
 *
 * Open Graph consumers (Telegram, Slack, WhatsApp) do not resolve relative URLs,
 * so anything that ends up in a `<meta>` tag has to be absolute — and it has to be
 * right on whatever host the link was actually opened on, not just the configured
 * one, or previews break on every preview deployment.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");

  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${proto}://${host}`;
}

export async function absoluteUrl(path: string): Promise<string> {
  return `${await siteOrigin()}${path}`;
}

/**
 * Narrows a caller-supplied `?next=` to a path on this site, or nothing.
 *
 * Sign-in is the classic open-redirect vector: a link to our own /login carrying
 * `next=https://evil.example` sends the user somewhere hostile immediately after
 * they typed their password into a real Google screen. `//evil.example` and
 * `/\evil.example` are protocol-relative and browser-normalized forms of the
 * same trick, so a leading-slash test alone is not enough.
 */
export function safeInternalPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}
