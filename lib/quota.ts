import { and, count, eq, gt, gte, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { recordings } from "@/lib/db/schema";
import { MAX_FREE_POOL_BYTES, planLimits, type PlanId } from "@/lib/plans";

/**
 * Cost controls from §6 and §11.5, checked at create time.
 *
 * Two different jobs, deliberately kept apart:
 *  - the monthly count is a *per-user plan limit* (a conversion boundary), and
 *  - `MAX_FREE_POOL_BYTES` is a *global kill switch* protecting the R2 free tier
 *    (§6.1), which exists so an overage shows up as a refused upload rather than
 *    as a bill.
 */

export type QuotaDenial =
  | { reason: "monthly_count"; used: number; limit: number }
  | { reason: "free_pool"; usedBytes: number; limitBytes: number }
  | { reason: "storage_cap"; usedBytes: number; limitBytes: number };

export type QuotaCheck = { ok: true } | { ok: false; denial: QuotaDenial };

/** UTC month boundary. Calendar months, matching how the limit is described to users. */
export function startOfMonth(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

/**
 * §8.3: the monthly quota counts `ready` rows only. Counting `pending_upload`
 * would let an abandoned or failed upload burn a free user's allowance — and
 * those are exactly the users on the connections where uploads fail.
 */
/** Ready (non-deleted) recordings created since the UTC month started. */
export async function readyThisMonth(
  db: Db,
  userId: string,
  now: number,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(recordings)
    .where(
      and(
        eq(recordings.userId, userId),
        eq(recordings.status, "ready"),
        // `denialMessage` tells the user to "delete one" to get a slot back, so a
        // deleted recording must stop counting or that advice is a dead end.
        isNull(recordings.deletedAt),
        gte(recordings.createdAt, startOfMonth(now)),
      ),
    );

  return row?.value ?? 0;
}

/**
 * Bytes held under free-tier terms across all users.
 *
 * `expires_at IS NOT NULL` is the free-tier marker: it is set at completion from
 * the plan's link TTL and paid recordings never get one. Using it rather than
 * joining `users.plan` keeps the figure attached to the terms the object was
 * stored under, so a user upgrading mid-month doesn't silently move historical
 * bytes out of the pool being measured.
 *
 * Expired and deleted rows are excluded: both are bytes nobody can reach any
 * more (§6.2's purge reclaims them shortly after). Counting them would let the
 * pool ratchet up and never come down, so one week of free uploads would wedge
 * the kill switch shut forever. The trade-off is that this figure leads R2's
 * real usage by however long purge lags — see `runPurge` in `lib/purge.ts`.
 */
async function freePoolBytes(db: Db, now: number): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`coalesce(sum(${recordings.sizeBytes}), 0)` })
    .from(recordings)
    .where(
      and(
        eq(recordings.status, "ready"),
        isNotNull(recordings.expiresAt),
        gt(recordings.expiresAt, now),
        isNull(recordings.deletedAt),
      ),
    );

  return Number(row?.value ?? 0);
}

export async function checkCreateQuota(
  db: Db,
  user: { id: string; plan: PlanId; storageBytes: number },
  now: number,
): Promise<QuotaCheck> {
  const limits = planLimits(user.plan);

  if (limits.recordingsPerMonth !== null) {
    const used = await readyThisMonth(db, user.id, now);
    if (used >= limits.recordingsPerMonth) {
      return {
        ok: false,
        denial: { reason: "monthly_count", used, limit: limits.recordingsPerMonth },
      };
    }
  }

  if (limits.maxStorageBytes !== null && user.storageBytes >= limits.maxStorageBytes) {
    return {
      ok: false,
      denial: {
        reason: "storage_cap",
        usedBytes: user.storageBytes,
        limitBytes: limits.maxStorageBytes,
      },
    };
  }

  // Global kill switch — only free recordings consume the shared pool.
  if (user.plan === "free") {
    const usedBytes = await freePoolBytes(db, now);
    if (usedBytes >= MAX_FREE_POOL_BYTES) {
      return {
        ok: false,
        denial: { reason: "free_pool", usedBytes, limitBytes: MAX_FREE_POOL_BYTES },
      };
    }
  }

  return { ok: true };
}

const GB = 1024 * 1024 * 1024;

/** User-facing copy. Honest about which wall was hit — §2.1 asks for honest limits. */
export function denialMessage(denial: QuotaDenial): string {
  switch (denial.reason) {
    case "monthly_count":
      return `You've used all ${denial.limit} free credits this month. Delete a recording from this month, wait until next month, or upgrade to Individual.`;
    case "storage_cap":
      return `You're at your ${(denial.limitBytes / GB).toFixed(0)} GB storage cap. Delete a recording to make room.`;
    case "free_pool":
      return "Free storage is full right now, so we can't accept new free recordings. Try again later or upgrade to Individual.";
  }
}
