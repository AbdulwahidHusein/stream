import { and, eq, isNull, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api/respond";
import type { Db } from "@/lib/db/client";
import { recordings, users } from "@/lib/db/schema";

export type RecordingRow = typeof recordings.$inferSelect;

/** Absolute origin for share links: explicit config wins, request origin is the fallback. */
export function appOrigin(request: Request): string {
  const configured = process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}

export function shareUrl(request: Request, publicId: string): string {
  return `${appOrigin(request)}/v/${publicId}`;
}

/** Public, unauthenticated media URL — what the `<video>` element actually loads. */
export function mediaPath(publicId: string): string {
  return `/api/v/${publicId}/media`;
}

/** Public poster image — the `<video poster>` and the `og:image` unfurl target. */
export function thumbPath(publicId: string): string {
  return `/api/v/${publicId}/thumb`;
}

/** Loads a recording the caller owns, or throws the right §9 error. */
export async function ownedRecording(
  db: Db,
  id: string,
  userId: string,
): Promise<RecordingRow> {
  const row = await db.query.recordings.findFirst({
    where: and(eq(recordings.id, id), isNull(recordings.deletedAt)),
  });

  if (!row || row.userId !== userId) {
    // Same response either way: ownership must not be probeable by id.
    throw new ApiError("not_found", "That recording does not exist.");
  }

  return row;
}

const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

/** §14: titles reach OG tags, so bound length and strip control characters at the door. */
export function sanitizeTitle(raw: unknown): string {
  if (typeof raw !== "string") return "Untitled recording";
  const cleaned = raw.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned.length > 0 ? cleaned : "Untitled recording";
}

/** Free-tier links expire (§6); paid links live until deleted. */
export function expiryFor(linkTtlDays: number | null, now: number): number | null {
  return linkTtlDays === null ? null : now + linkTtlDays * 24 * 60 * 60 * 1000;
}

/**
 * Drops the stored objects for a recording.
 *
 * Best-effort by design: the row is tombstoned either way, because a delete the
 * user asked for must not appear to fail over a storage hiccup. An object left
 * behind here is orphaned rather than leaked — it no longer has a row pointing
 * at it, and §6.2's purge is what eventually sweeps storage.
 */
export async function deleteRecordingObjects(
  bucket: R2Bucket,
  row: Pick<RecordingRow, "r2Key" | "thumbnailR2Key">,
): Promise<void> {
  const keys = [row.r2Key, row.thumbnailR2Key].filter(
    (key): key is string => typeof key === "string" && key.length > 0,
  );

  await Promise.all(
    keys.map((key) =>
      bucket.delete(key).catch((err) => {
        console.error("[recordings] object delete failed", { key, err });
      }),
    ),
  );
}

/**
 * Soft-deletes a recording and releases its bytes back to the owner's total.
 * Returns the bytes released, or 0 if the row was already tombstoned.
 *
 * The `deleted_at IS NULL` guard is what makes this safe to call twice — a retry
 * or a race between the user's delete and the purge job must not decrement
 * `storage_bytes` twice for the same object.
 */
export async function tombstoneRecording(
  db: Db,
  row: Pick<RecordingRow, "id" | "userId">,
  now: number,
): Promise<number> {
  const [tombstoned] = await db
    .update(recordings)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(recordings.id, row.id), isNull(recordings.deletedAt)))
    .returning({ sizeBytes: recordings.sizeBytes });

  if (!tombstoned) return 0;

  const released = tombstoned.sizeBytes ?? 0;
  if (released > 0) {
    await db
      .update(users)
      // Clamped: `storage_bytes` is kept incrementally (§8.1), so a historical
      // drift must not be able to push the running total negative.
      .set({
        storageBytes: sql`max(0, ${users.storageBytes} - ${released})`,
        updatedAt: now,
      })
      .where(eq(users.id, row.userId));
  }

  return released;
}
