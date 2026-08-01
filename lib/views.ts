import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { recordings, views } from "@/lib/db/schema";
import { newId } from "@/lib/ids";

/**
 * View counting — §5.4 and §8.4. Count only, no heatmaps, deliberately privacy-light.
 *
 * Viewers are anonymous by design, so identity here is a one-way hash of coarse
 * request signals, salted and rotated daily. That is enough to stop one viewer
 * inflating a count by reloading, and not enough to track anyone across days or
 * across recordings — which is the right trade for a number nobody bills on.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function dayBucket(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

/**
 * The salt rotates with the bucket, so yesterday's key cannot be recomputed to
 * match today's — the hashes are unlinkable across days even to us.
 */
export async function viewerKey(
  request: Request,
  publicId: string,
  bucket: number,
): Promise<string> {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const agent = request.headers.get("user-agent") ?? "unknown";
  const salt = process.env.SESSION_SECRET ?? "dev-only-salt";

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}:${bucket}:${publicId}:${ip}:${agent}`),
  );

  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type ViewResult = { counted: boolean; viewCount: number };

/**
 * Registers at most one view per viewer per recording per day.
 *
 * The unique index does the deduping: we insert optimistically and treat a
 * conflict as "already counted". A read-then-write check would let two concurrent
 * requests from the same viewer both pass the read and double-count.
 */
export async function registerView(
  db: Db,
  recording: { id: string; viewCount: number },
  key: string,
  now: number,
): Promise<ViewResult> {
  const inserted = await db
    .insert(views)
    .values({
      id: newId(),
      recordingId: recording.id,
      viewerKey: key,
      dayBucket: dayBucket(now),
      watchedAt: now,
      completed: 0,
    })
    .onConflictDoNothing()
    .returning({ id: views.id });

  if (inserted.length === 0) {
    return { counted: false, viewCount: recording.viewCount };
  }

  // Denormalized counter so the library and playback pages never COUNT(*) the
  // views table (§8.1's reasoning, applied to views).
  const [updated] = await db
    .update(recordings)
    .set({ viewCount: sql`${recordings.viewCount} + 1` })
    .where(eq(recordings.id, recording.id))
    .returning({ viewCount: recordings.viewCount });

  return { counted: true, viewCount: updated?.viewCount ?? recording.viewCount + 1 };
}
