"use client";

import { formatBytes, formatDuration, formatMbPerMinute } from "@/lib/format";
import { modeInfo } from "@/lib/recorder/types";
import type { RecordingResult } from "@/lib/recorder/use-recorder";
import { ShareLink } from "./share-link";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--ink-faint)]">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">{value}</dd>
    </div>
  );
}

export function ReviewPanel({
  result,
  autoStopped,
  onRestart,
}: {
  result: RecordingResult;
  autoStopped: boolean;
  onRestart: () => void;
}) {
  return (
    <div className="animate-rise flex flex-col gap-6">
      <div className="overflow-hidden rounded-[var(--radius)] bg-[#0a0e14] shadow-[var(--shadow-float)] ring-1 ring-black/10">
        <video
          src={result.mediaUrl}
          poster={result.thumbUrl}
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full bg-black"
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-[var(--ink)]">Share link</p>
        <ShareLink url={result.shareUrl} />
      </div>

      {autoStopped && (
        <p className="font-mono text-xs text-[var(--ink-muted)]">
          Stopped automatically at the {formatDuration(result.durationMs)} plan limit.
        </p>
      )}

      <dl className="app-panel grid grid-cols-2 gap-5 px-5 py-4 sm:grid-cols-4">
        <Stat label="Duration" value={formatDuration(result.durationMs)} />
        <Stat label="Size" value={formatBytes(result.sizeBytes)} />
        <Stat label="Rate" value={formatMbPerMinute(result.sizeBytes, result.durationMs)} />
        <Stat label="Container" value={result.container.toUpperCase()} />
      </dl>

      {modeInfo(result.mode).usesCamera &&
        modeInfo(result.mode).usesScreen &&
        !result.cameraInFile && (
          <p className="border-l-2 border-[var(--line-strong)] py-1 pl-4 text-sm leading-relaxed text-[var(--ink-muted)]">
            As shown above, this file has your screen and audio. Your browser couldn&apos;t
            composite the camera into the recording, so the bubble was preview only.
          </p>
        )}

      {result.needsDurationFix && (
        <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
          This browser recorded WebM, which leaves the duration out of the file. The player works
          around it, but seeking is smoother on the MP4 path — Chrome and Edge take it
          automatically.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={onRestart} className="btn-primary">
          Record again
        </button>
        <a
          href={result.mediaUrl}
          download={`${result.title}.${result.container}`}
          className="btn-ghost"
        >
          Download this take
        </a>
      </div>
    </div>
  );
}
