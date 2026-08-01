/**
 * Recording credits — the product framing of §6 plan limits.
 *
 * Free plan: each ready recording this UTC month spends one credit (15/month).
 * Individual: unlimited recording credits; storage soft-cap still applies.
 *
 * No payment here. Checkout only activates `users.plan` later; this module only
 * reads plan state and reports what the user can still spend.
 */

import type { Db } from "@/lib/db/client";
import { formatBytes } from "@/lib/format";
import { planLimits, type PlanId } from "@/lib/plans";
import { readyThisMonth, startOfMonth } from "@/lib/quota";

export type CreditUsage = {
  plan: PlanId;
  /** UTC month the count applies to. */
  periodStart: number;
  /** Exclusive end = start of next UTC month. */
  periodEnd: number;
  /** Null = unlimited (Individual). */
  recordingsLimit: number | null;
  recordingsUsed: number;
  /** Null when unlimited. */
  recordingsRemaining: number | null;
  /** True when the user cannot start another free recording this month. */
  outOfCredits: boolean;
  storageBytes: number;
  storageLimit: number | null;
  /** Short label for chrome (sidebar chip). */
  summaryLabel: string;
  /** One-line explanation under the record header. */
  detailLabel: string;
};

function nextMonthStart(periodStart: number): number {
  const date = new Date(periodStart);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

export async function getCreditUsage(
  db: Db,
  user: { id: string; plan: PlanId; storageBytes: number },
  now: number = Date.now(),
): Promise<CreditUsage> {
  const limits = planLimits(user.plan);
  const periodStart = startOfMonth(now);
  const periodEnd = nextMonthStart(periodStart);
  const recordingsUsed = await readyThisMonth(db, user.id, now);
  const recordingsLimit = limits.recordingsPerMonth;
  const recordingsRemaining =
    recordingsLimit === null ? null : Math.max(0, recordingsLimit - recordingsUsed);

  const storageLimit = limits.maxStorageBytes;
  const storageFull =
    storageLimit !== null && user.storageBytes >= storageLimit;

  const outOfCredits =
    (recordingsRemaining !== null && recordingsRemaining <= 0) || storageFull;

  let summaryLabel: string;
  let detailLabel: string;

  if (recordingsLimit === null) {
    summaryLabel =
      storageLimit === null
        ? "Unlimited"
        : `${formatBytes(user.storageBytes)} / ${formatBytes(storageLimit)}`;
    detailLabel =
      storageLimit === null
        ? "Unlimited recordings on Individual."
        : storageFull
          ? `Storage full (${formatBytes(storageLimit)}). Delete a recording to continue.`
          : `Unlimited recordings · ${formatBytes(user.storageBytes)} of ${formatBytes(storageLimit)} used.`;
  } else if (recordingsRemaining === 0) {
    summaryLabel = `0 / ${recordingsLimit} credits`;
    detailLabel = `No free credits left this month. Resets ${formatPeriodReset(periodEnd)}.`;
  } else {
    summaryLabel = `${recordingsRemaining} / ${recordingsLimit} credits`;
    detailLabel =
      recordingsRemaining === 1
        ? `1 free credit left this month · up to ${Math.round(limits.maxDurationMs / 60_000)} min each.`
        : `${recordingsRemaining} free credits left this month · up to ${Math.round(limits.maxDurationMs / 60_000)} min each.`;
  }

  return {
    plan: user.plan,
    periodStart,
    periodEnd,
    recordingsLimit,
    recordingsUsed,
    recordingsRemaining,
    outOfCredits,
    storageBytes: user.storageBytes,
    storageLimit,
    summaryLabel,
    detailLabel,
  };
}

function formatPeriodReset(periodEnd: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(periodEnd));
}
