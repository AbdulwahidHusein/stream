"use client";

import { formatBytes } from "@/lib/format";

/**
 * Upload progress during the take (§2.1 "accurate").
 *
 * R2 rejects non-final multipart parts under 5 MiB, so nothing hits the network
 * until that buffer fills (~25 s at our bitrate). Showing "0 B uploaded" without
 * explaining that looks broken — this meter surfaces the buffer fill separately.
 */
export function UploadMeter({
  uploadedBytes,
  capturedBytes,
  bufferedBytes,
  partBytes,
  deferredParts,
  finalizing,
}: {
  uploadedBytes: number;
  capturedBytes: number;
  bufferedBytes: number;
  partBytes: number;
  deferredParts: number;
  finalizing: boolean;
}) {
  const hasUploaded = uploadedBytes > 0;
  const bufferRatio =
    partBytes > 0 ? Math.min(1, bufferedBytes / partBytes) : 0;
  const uploadRatio =
    capturedBytes > 0 ? Math.min(1, uploadedBytes / capturedBytes) : 0;
  const percent = Math.round((hasUploaded ? uploadRatio : bufferRatio) * 100);

  const label = finalizing
    ? "Finishing upload"
    : hasUploaded
      ? "Uploading while you record"
      : "Buffering first upload part";

  const detail = finalizing
    ? `${formatBytes(uploadedBytes)} / ${formatBytes(capturedBytes)}`
    : hasUploaded
      ? `${formatBytes(uploadedBytes)} uploaded · ${formatBytes(capturedBytes)} recorded`
      : `${formatBytes(bufferedBytes)} / ${formatBytes(partBytes)} until first upload`;

  return (
    <div className="app-panel flex flex-col gap-2.5 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3 font-mono text-xs text-[var(--ink-muted)]">
        <span>{label}</span>
        <span className="shrink-0 tabular-nums">{detail}</span>
      </div>

      <div
        role="progressbar"
        aria-label={hasUploaded ? "Upload progress" : "Buffer toward first upload part"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-muted)]"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-out ${
            finalizing
              ? "animate-upload-sweep"
              : hasUploaded
                ? "bg-[var(--accent)]"
                : "bg-[var(--ink-faint)]"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {!finalizing && !hasUploaded && (
        <p className="text-xs leading-relaxed text-[var(--ink-faint)]">
          Storage needs a full {formatBytes(partBytes)} chunk before anything can leave
          the browser. Your take is recording — the first upload starts when that
          buffer fills.
        </p>
      )}

      {deferredParts > 0 && (
        <p className="font-mono text-xs text-[var(--ink-muted)]">
          {deferredParts} part{deferredParts === 1 ? "" : "s"} waiting to retry — the take
          keeps recording.
        </p>
      )}
    </div>
  );
}
