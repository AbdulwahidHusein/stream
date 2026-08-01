import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { recordings } from "@/lib/db/schema";
import { deleteRecordingObjects, tombstoneRecording } from "@/lib/recordings";

/**
 * The §6.2 sweeps, run from the Worker's `scheduled` handler (see `worker/index.ts`).
 *
 * Both jobs are pure functions of `(db, bucket, now)` rather than reaching for
 * request context, because cron invocations have no request — and because that
 * makes them callable by hand against any environment.
 *
 * Everything here is written to be safely re-runnable. A cron that fires twice,
 * or overlaps its previous run, must not double-count storage or fail: the work
 * is driven off row state, and `tombstoneRecording` no-ops on an already
 * tombstoned row.
 */

/** Bounded so one run stays well inside a cron invocation's time and D1 limits. */
const BATCH_SIZE = 100;

/**
 * How long a `pending_upload` row is allowed to sit before it is considered
 * abandoned. Generous on purpose: §6.2's target users are on connections where
 * a 20-minute upload stall is a bad afternoon, not a dead session.
 */
const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

export interface PurgeReport {
  expired: number;
  abandoned: number;
  bytesReclaimed: number;
}

/**
 * Deletes the objects behind free-tier recordings whose link has expired.
 *
 * Playback already refuses these (`lib/playback.ts`), so this is reclaiming
 * bytes, not revoking access — which is why it is safe to run late, but not
 * safe to skip: `freePoolBytes` stops counting a recording the moment it
 * expires, so until this runs the shared pool is understated.
 */
export async function purgeExpired(
  db: Db,
  bucket: R2Bucket,
  now: number,
): Promise<{ count: number; bytesReclaimed: number }> {
  const due = await db
    .select({
      id: recordings.id,
      userId: recordings.userId,
      r2Key: recordings.r2Key,
      thumbnailR2Key: recordings.thumbnailR2Key,
    })
    .from(recordings)
    .where(
      and(
        eq(recordings.status, "ready"),
        isNotNull(recordings.expiresAt),
        lte(recordings.expiresAt, now),
        isNull(recordings.deletedAt),
      ),
    )
    .limit(BATCH_SIZE);

  let bytesReclaimed = 0;

  for (const row of due) {
    // Storage first: if the tombstone landed first and this run died here, the
    // row would be gone and the object would have nothing left pointing at it.
    await deleteRecordingObjects(bucket, row);
    bytesReclaimed += await tombstoneRecording(db, row, now);
  }

  return { count: due.length, bytesReclaimed };
}

/**
 * Closes out multipart uploads that were started and never completed.
 *
 * R2 bills the parts of an open multipart upload, and nothing else ever aborts
 * them — `/abort` covers the tidy case where the client is still alive to call
 * it, and this covers the browser that was closed mid-take.
 */
export async function purgeAbandoned(
  db: Db,
  bucket: R2Bucket,
  now: number,
): Promise<number> {
  const cutoff = now - ABANDONED_AFTER_MS;

  const stale = await db
    .select({
      id: recordings.id,
      r2Key: recordings.r2Key,
      r2UploadId: recordings.r2UploadId,
    })
    .from(recordings)
    .where(
      and(
        eq(recordings.status, "pending_upload"),
        lte(recordings.createdAt, cutoff),
        isNull(recordings.deletedAt),
      ),
    )
    .limit(BATCH_SIZE);

  for (const row of stale) {
    if (row.r2UploadId) {
      try {
        await bucket.resumeMultipartUpload(row.r2Key, row.r2UploadId).abort();
      } catch (err) {
        // Already aborted or completed out from under us — the row still needs
        // resolving either way, so this must not stop the batch.
        console.error("[purge] multipart abort failed", { id: row.id, err });
      }
    }

    // `failed` rather than a silent delete: this take genuinely never became a
    // recording. `deleted_at` keeps it out of the library and the quota counts,
    // which never counted `pending_upload` rows anyway (§8.3) — so no storage
    // total moves here.
    await db
      .update(recordings)
      .set({ status: "failed", r2UploadId: null, deletedAt: now, updatedAt: now })
      .where(eq(recordings.id, row.id));
  }

  return stale.length;
}

export async function runPurge(
  db: Db,
  bucket: R2Bucket,
  now: number = Date.now(),
): Promise<PurgeReport> {
  const expired = await purgeExpired(db, bucket, now);
  const abandoned = await purgeAbandoned(db, bucket, now);

  return {
    expired: expired.count,
    abandoned,
    bytesReclaimed: expired.bytesReclaimed,
  };
}
