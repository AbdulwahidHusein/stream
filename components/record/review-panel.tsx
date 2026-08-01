"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { renameRecording } from "@/app/library/actions";
import { formatBytes, formatDuration } from "@/lib/format";
import { suggestedRecordingTitle } from "@/lib/recorder/title";
import { modeInfo } from "@/lib/recorder/types";
import type { RecordingResult } from "@/lib/recorder/use-recorder";
import { ShareLink } from "./share-link";

type ReviewStep = "name" | "share";

export function ReviewPanel({
  result,
  autoStopped,
  onRestart,
}: {
  result: RecordingResult;
  autoStopped: boolean;
  onRestart: () => void;
}) {
  const [step, setStep] = useState<ReviewStep>("name");
  const [title, setTitle] = useState(() =>
    result.title && result.title !== "Untitled recording"
      ? result.title
      : suggestedRecordingTitle(result.mode),
  );
  const [savedTitle, setSavedTitle] = useState(result.title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "name") {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [step]);

  function submitTitle(event: React.FormEvent) {
    event.preventDefault();
    const next = title.trim();
    if (!next) {
      setError("Give this recording a name to continue.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const renamed = await renameRecording(result.id, next, { revalidate: false });
      if (!renamed.ok) {
        setError(renamed.message);
        return;
      }
      setSavedTitle(next);
      setStep("share");
    });
  }

  return (
    <div className="animate-rise flex flex-col gap-6">
      <WrapUpSteps current={step === "name" ? 1 : 2} />

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

      {autoStopped && (
        <p className="font-mono text-xs text-[var(--ink-muted)]">
          Stopped at the {formatDuration(result.durationMs)} plan limit.
        </p>
      )}

      {step === "name" ? (
        <form onSubmit={submitTitle} className="app-panel flex flex-col gap-4 p-5">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Name this recording</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              This is what viewers and your library will see.
            </p>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--ink-faint)]">
              Title
            </span>
            <input
              ref={inputRef}
              name="title"
              value={title}
              maxLength={120}
              disabled={pending}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Client walkthrough — pricing page"
              className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] px-3.5 py-2.5 text-base tracking-tight focus:border-[var(--accent)] focus:outline-none disabled:opacity-60"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending} className="btn-primary">
              {pending ? "Saving…" : "Continue to share"}
            </button>
            <p className="text-xs text-[var(--ink-faint)]">
              {formatDuration(result.durationMs)} · {formatBytes(result.sizeBytes)}
            </p>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="page-title">{savedTitle}</h2>
            <p className="page-sub">
              Your link is ready. Anyone with it can watch — no account needed.
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-[var(--ink)]">Share link</p>
            <ShareLink url={result.shareUrl} />
          </div>

          <p className="font-mono text-xs text-[var(--ink-faint)]">
            {formatDuration(result.durationMs)} · {formatBytes(result.sizeBytes)} ·{" "}
            {result.container.toUpperCase()}
          </p>

          {modeInfo(result.mode).usesCamera &&
            modeInfo(result.mode).usesScreen &&
            !result.cameraInFile && (
              <p className="border-l-2 border-[var(--line-strong)] py-1 pl-4 text-sm leading-relaxed text-[var(--ink-muted)]">
                This file has your screen and audio. Your browser couldn&apos;t composite the
                camera into the recording, so the bubble was preview only.
              </p>
            )}

          {result.needsDurationFix && (
            <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
              This browser recorded WebM without a duration header. Playback still works; seeking
              is smoother on Chrome and Edge (MP4).
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-5">
            <button type="button" onClick={onRestart} className="btn-primary">
              Record again
            </button>
            <Link href="/library" className="btn-secondary">
              Open library
            </Link>
            <a
              href={result.mediaUrl}
              download={`${savedTitle}.${result.container}`}
              className="btn-ghost"
            >
              Download
            </a>
            <button
              type="button"
              onClick={() => setStep("name")}
              className="btn-ghost ml-auto"
            >
              Edit title
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WrapUpSteps({ current }: { current: 1 | 2 }) {
  const steps = [
    { id: 1 as const, label: "Name" },
    { id: 2 as const, label: "Share" },
  ];

  return (
    <ol className="flex items-center gap-3 text-sm">
      {steps.map((step, index) => {
        const active = step.id === current;
        const done = step.id < current;
        return (
          <li key={step.id} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden className="h-px w-6 bg-[var(--line)]" />}
            <span
              className={`flex size-6 items-center justify-center rounded-full font-mono text-[11px] font-medium ${
                active
                  ? "bg-[var(--accent)] text-white"
                  : done
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "bg-[var(--panel-muted)] text-[var(--ink-faint)]"
              }`}
            >
              {step.id}
            </span>
            <span className={active ? "font-medium text-[var(--ink)]" : "text-[var(--ink-faint)]"}>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
