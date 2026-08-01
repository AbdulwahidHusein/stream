"use client";

import { formatBytes } from "@/lib/format";

/**
 * Quiet progress during the take. Internals (part size, buffering) stay out of
 * the UI — users only need to know the recording is being saved.
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
  const uploadRatio =
    capturedBytes > 0 ? Math.min(1, uploadedBytes / capturedBytes) : 0;
  const bufferRatio =
    partBytes > 0 ? Math.min(0.92, bufferedBytes / partBytes) : 0;
  const ratio = uploadedBytes > 0 ? uploadRatio : bufferRatio;
  const percent = Math.round(ratio * 100);

  return (
    <div className="app-panel flex flex-col gap-2.5 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3 text-xs text-[var(--ink-muted)]">
        <span>{finalizing ? "Finishing up" : "Saving as you record"}</span>
        <span className="shrink-0 font-mono tabular-nums">
          {formatBytes(Math.max(uploadedBytes, capturedBytes))}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label="Save progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-muted)]"
      >
        <div
          className={`h-full rounded-full bg-[var(--accent)] transition-[width] duration-300 ease-out ${
            finalizing ? "animate-upload-sweep" : ""
          }`}
          style={{ width: `${Math.max(percent, capturedBytes > 0 ? 4 : 0)}%` }}
        />
      </div>

      {deferredParts > 0 && (
        <p className="text-xs text-[var(--ink-muted)]">
          Connection hiccup — retrying in the background. Keep recording.
        </p>
      )}
    </div>
  );
}
