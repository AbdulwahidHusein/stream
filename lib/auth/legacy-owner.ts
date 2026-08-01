/**
 * Adopting the takes made before sign-in existed.
 *
 * Every recording made while `currentUser()` was the fixed stand-in belongs to
 * `usr_local_dev` — a row no session can ever resolve to now that ownership
 * comes from Google. Those recordings are not broken (their `/v/` links still
 * play, since playback is anonymous) but they are unreachable from any library,
 * which makes them impossible to rename, delete, or count against a quota.
 *
 * This moves them to a real account. It is a local/dev convenience: the deployed
 * database never had a stand-in owner, and the route that calls this refuses to
 * run outside development for that reason.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { recordings, users } from "@/lib/db/schema";

/** The stand-in owner from the pre-auth `lib/auth/current-user.ts`. */
export const LEGACY_OWNER_ID = "usr_local_dev";

export interface LegacyStock {
  count: number;
  bytes: number;
}

/**
 * What is sitting under the stand-in owner right now.
 *
 * Tombstoned rows are excluded throughout: their bytes were already released
 * from `storage_bytes` when they were deleted, and moving them would re-add
 * storage the user does not have.
 */
export async function legacyStock(db: Db): Promise<LegacyStock> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)`,
      bytes: sql<number>`coalesce(sum(${recordings.sizeBytes}), 0)`,
    })
    .from(recordings)
    .where(and(eq(recordings.userId, LEGACY_OWNER_ID), isNull(recordings.deletedAt)));

  return { count: Number(row?.count ?? 0), bytes: Number(row?.bytes ?? 0) };
}

/**
 * Re-owns every live stand-in recording to `userId` and moves the storage
 * accounting with them.
 *
 * `storage_bytes` is kept incrementally (§8.1), so re-owning a row without
 * moving its bytes would leave the new owner able to exceed their cap by
 * exactly the amount they just adopted. The three writes therefore go out as one
 * D1 batch — a transaction — because a partial application here is precisely the
 * drift that a running total can never recover from on its own.
 *
 * Re-running it is a no-op: the first run leaves nothing owned by the stand-in.
 */
export async function claimLegacyRecordings(db: Db, userId: string): Promise<LegacyStock> {
  if (userId === LEGACY_OWNER_ID) return { count: 0, bytes: 0 };

  const stock = await legacyStock(db);
  if (stock.count === 0) return stock;

  const now = Date.now();

  await db.batch([
    db
      .update(recordings)
      .set({ userId, updatedAt: now })
      .where(and(eq(recordings.userId, LEGACY_OWNER_ID), isNull(recordings.deletedAt))),

    db
      .update(users)
      .set({ storageBytes: sql`${users.storageBytes} + ${stock.bytes}`, updatedAt: now })
      .where(eq(users.id, userId)),

    db
      .update(users)
      // Clamped like `tombstoneRecording`'s decrement: the stand-in's total was
      // maintained incrementally too, so it may not match what we just moved.
      .set({
        storageBytes: sql`max(0, ${users.storageBytes} - ${stock.bytes})`,
        updatedAt: now,
      })
      .where(eq(users.id, LEGACY_OWNER_ID)),
  ]);

  return stock;
}
