import { handle } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/current-user";
import { getCreditUsage } from "@/lib/credits";
import { getDb } from "@/lib/db/client";
import { planLimits } from "@/lib/plans";

/**
 * GET /api/me — §9.1.
 *
 * Current user + plan + credit / storage usage. No payment fields yet.
 */
export async function GET(): Promise<Response> {
  return handle(async () => {
    const db = await getDb();
    const user = await requireUser(db);
    const now = Date.now();
    const credits = await getCreditUsage(db, user, now);
    const limits = planLimits(user.plan);

    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        imageUrl: user.imageUrl,
        plan: user.plan,
      },
      limits: {
        maxDurationMs: limits.maxDurationMs,
        maxBytesPerRecording: limits.maxBytesPerRecording,
        recordingsPerMonth: limits.recordingsPerMonth,
        maxStorageBytes: limits.maxStorageBytes,
        watermark: limits.watermark,
        linkTtlDays: limits.linkTtlDays,
      },
      credits: {
        periodStart: credits.periodStart,
        periodEnd: credits.periodEnd,
        recordingsLimit: credits.recordingsLimit,
        recordingsUsed: credits.recordingsUsed,
        recordingsRemaining: credits.recordingsRemaining,
        outOfCredits: credits.outOfCredits,
        storageBytes: credits.storageBytes,
        storageLimit: credits.storageLimit,
        summaryLabel: credits.summaryLabel,
        detailLabel: credits.detailLabel,
      },
    });
  });
}
