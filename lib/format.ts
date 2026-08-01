/** Exact durations and honest sizes — §2.1 "accurate". No rounding up. */

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Absolute UTC date, formatted on the server and passed down as a string.
 *
 * Deliberately not a relative "3 days ago": that would be computed from a clock
 * that differs between the render and the hydration, and React would flag the
 * mismatch. UTC keeps it stable regardless of where the Worker ran.
 */
export function formatDate(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ms));
}

/**
 * How much life is left on a free-tier link (§6). `null` for paid recordings,
 * which never carry an `expires_at`.
 */
export function formatExpiry(expiresAt: number | null, now: number): string | null {
  if (expiresAt === null) return null;

  const remaining = expiresAt - now;
  if (remaining <= 0) return "Expired";

  const days = Math.floor(remaining / DAY_MS);
  if (days >= 1) return `Expires in ${days} day${days === 1 ? "" : "s"}`;

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  if (hours >= 1) return `Expires in ${hours} hour${hours === 1 ? "" : "s"}`;

  return "Expires within the hour";
}

export function formatViews(count: number): string {
  return `${count} view${count === 1 ? "" : "s"}`;
}

/** MB per minute — the number §6.1's whole cost model rests on. */
export function formatMbPerMinute(bytes: number, durationMs: number): string {
  if (durationMs <= 0) return "—";
  const mb = bytes / (1024 * 1024);
  return `${(mb / (durationMs / 60_000)).toFixed(1)} MB/min`;
}
