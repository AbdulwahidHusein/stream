"use client";

import { UploadMeter } from "./upload-meter";

/**
 * Calm post-stop state — no dead preview chrome, just "we're saving this".
 */
export function FinishingPanel({
  uploadedBytes,
  capturedBytes,
  bufferedBytes,
  partBytes,
  deferredParts,
}: {
  uploadedBytes: number;
  capturedBytes: number;
  bufferedBytes: number;
  partBytes: number;
  deferredParts: number;
}) {
  return (
    <div className="animate-rise app-panel flex flex-col gap-6 px-6 py-10">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)]"
        >
          <span className="size-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Saving your recording</h2>
          <p className="mt-1 max-w-md text-sm leading-relaxed text-[var(--ink-muted)]">
            Finishing the upload and preparing your share link. This usually takes a few
            seconds.
          </p>
        </div>
      </div>

      <UploadMeter
        uploadedBytes={uploadedBytes}
        capturedBytes={capturedBytes}
        bufferedBytes={bufferedBytes}
        partBytes={partBytes}
        deferredParts={deferredParts}
        finalizing
      />
    </div>
  );
}
