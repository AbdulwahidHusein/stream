/**
 * Single source of truth for plan limits (TECHNICAL_SPEC.md §6).
 * Client and server both import from here — never duplicate literals.
 */

export type PlanId = "free" | "individual";

/**
 * Fixed encoder targets (§6.1 / §10.3).
 * 3 Mbps video keeps UI text and UI chrome sharp for client-facing shares;
 * 160 kbps AAC/Opus keeps voice clear. Storage ~24 MB/min — still fine for R2.
 */
export const BITRATE = {
  videoBps: 3_000_000,
  audioBps: 160_000,
} as const;

/** ~24 MB/min at configured bitrates. */
export const BYTES_PER_MINUTE =
  ((BITRATE.videoBps + BITRATE.audioBps) / 8) * 60;

/** Safety factor on size ceiling so brief bitrate spikes don't fail valid recordings. */
const SIZE_SAFETY_FACTOR = 1.15;

export function maxBytesForDuration(maxDurationMs: number): number {
  const minutes = maxDurationMs / 60_000;
  return Math.floor(BYTES_PER_MINUTE * minutes * SIZE_SAFETY_FACTOR);
}

export const PLANS = {
  free: {
    id: "free" as const,
    recordingsPerMonth: 15,
    maxDurationMs: 10 * 60_000,
    linkTtlDays: 7,
    watermark: true,
    maxStorageBytes: null as number | null,
  },
  individual: {
    id: "individual" as const,
    recordingsPerMonth: null as number | null, // unlimited count; storage soft-capped
    maxDurationMs: 25 * 60_000,
    linkTtlDays: null as number | null,
    watermark: false,
    maxStorageBytes: Number(
      process.env.MAX_STORAGE_BYTES_INDIVIDUAL ?? 10 * 1024 * 1024 * 1024,
    ),
  },
} as const;

export const MAX_FREE_POOL_BYTES = Number(
  process.env.MAX_FREE_POOL_BYTES ?? 8 * 1024 * 1024 * 1024,
);

export const BILLING = {
  individualPriceEtb: Number(process.env.INDIVIDUAL_PRICE_ETB ?? 300),
  graceDays: Number(process.env.BILLING_GRACE_DAYS ?? 3),
} as const;

export const CAPTURE = {
  maxWidth: 1920,
  maxHeight: 1080,
  maxFrameRate: 30,
  timesliceMs: 5_000,
  minPartBytes: 5 * 1024 * 1024,
} as const;

export function planLimits(plan: PlanId) {
  const base = PLANS[plan];
  return {
    ...base,
    maxBytesPerRecording: maxBytesForDuration(base.maxDurationMs),
  };
}
