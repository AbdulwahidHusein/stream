"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import type { BubbleLayout, FrameSize } from "@/lib/recorder/bubble";
import type { RecorderPhase } from "@/lib/recorder/use-recorder";
import { modeInfo, type RecordMode } from "@/lib/recorder/types";
import { BubbleEditor, BubbleToolbar } from "./bubble-editor";
import { CameraOffIcon, MicOffIcon } from "./icons";

export function PreviewStage({
  mode,
  phase,
  previewStream,
  previewCanvas,
  elapsedMs,
  maxDurationMs,
  nearLimit,
  micEnabled,
  cameraEnabled,
  hasCamera,
  hasMic,
  compositeActive,
  bubbleLayout,
  onBubbleLayoutChange,
}: {
  mode: RecordMode;
  phase: RecorderPhase;
  previewStream: MediaStream | null;
  previewCanvas: HTMLCanvasElement | null;
  elapsedMs: number;
  maxDurationMs: number;
  nearLimit: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  hasCamera: boolean;
  hasMic: boolean;
  compositeActive: boolean;
  bubbleLayout: BubbleLayout;
  onBubbleLayoutChange: (next: BubbleLayout) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState<FrameSize | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !previewStream) return;
    video.srcObject = previewStream;

    const syncSize = () => {
      if (video.videoWidth && video.videoHeight) {
        setFrameSize({ width: video.videoWidth, height: video.videoHeight });
      }
    };
    video.addEventListener("loadedmetadata", syncSize);
    video.addEventListener("resize", syncSize);
    syncSize();

    return () => {
      video.removeEventListener("loadedmetadata", syncSize);
      video.removeEventListener("resize", syncSize);
      video.srcObject = null;
    };
  }, [previewStream]);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount || !previewCanvas) return;
    mount.replaceChildren(previewCanvas);
    setFrameSize({ width: previewCanvas.width, height: previewCanvas.height });

    const observer = new ResizeObserver(() => {
      if (previewCanvas.width && previewCanvas.height) {
        setFrameSize({ width: previewCanvas.width, height: previewCanvas.height });
      }
    });
    observer.observe(previewCanvas);

    return () => {
      observer.disconnect();
      mount.replaceChildren();
    };
  }, [previewCanvas]);

  const isRecording = phase === "recording";
  const isPaused = phase === "paused";
  const cameraOnly = mode === "camera";
  const info = modeInfo(mode);
  const bubbleIsPreviewOnly = info.usesCamera && info.usesScreen && !compositeActive;
  const showBubbleCaveat = bubbleIsPreviewOnly && hasCamera && cameraEnabled;
  const showBubbleEditor =
    info.usesCamera &&
    info.usesScreen &&
    hasCamera &&
    cameraEnabled &&
    phase !== "finalizing" &&
    phase !== "paused";

  return (
    <>
      <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius)] bg-[#0a0e14] shadow-[var(--shadow-float)] ring-1 ring-black/10">
        {previewCanvas ? (
          <div
            ref={canvasMountRef}
            className="h-full w-full [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-contain"
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`h-full w-full object-contain ${cameraOnly ? "-scale-x-100" : ""}`}
          />
        )}

        {showBubbleEditor && (
          <BubbleEditor
            layout={bubbleLayout}
            onChange={onBubbleLayoutChange}
            frameSize={frameSize}
            disabled={phase === "starting"}
          />
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3.5">
          <div className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-black/60 px-3 py-1.5 backdrop-blur-sm">
            <span
              className={`inline-block size-2 rounded-full ${
                isRecording
                  ? "animate-record-pulse bg-[var(--record)]"
                  : isPaused
                    ? "bg-amber-400"
                    : "bg-white/40"
              }`}
            />
            <span className="font-mono text-sm tabular-nums text-white">
              {formatDuration(elapsedMs)}
            </span>
            <span className="font-mono text-xs text-white/50">
              / {formatDuration(maxDurationMs)}
            </span>
            {isPaused && (
              <span className="font-mono text-[10px] uppercase tracking-wide text-amber-300">
                Paused
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasMic && !micEnabled && (
              <span className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-black/60 px-2.5 py-1.5 font-mono text-xs text-white/85 backdrop-blur-sm">
                <MicOffIcon className="size-3.5" /> Muted
              </span>
            )}
            {hasCamera && !cameraEnabled && (
              <span className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-black/60 px-2.5 py-1.5 font-mono text-xs text-white/85 backdrop-blur-sm">
                <CameraOffIcon className="size-3.5" /> Camera off
              </span>
            )}
          </div>
        </div>

        {showBubbleCaveat && (
          <span
            className={`pointer-events-none absolute right-3.5 z-10 rounded-[var(--radius-sm)] bg-black/70 px-2.5 py-1.5 font-mono text-xs text-white/90 backdrop-blur-sm ${
              nearLimit ? "bottom-12" : "bottom-3.5"
            }`}
          >
            Preview only — not in the file
          </span>
        )}

        {nearLimit && (
          <p className="absolute inset-x-0 bottom-0 z-10 bg-[var(--record)] px-4 py-2 text-center font-mono text-xs text-white">
            {formatDuration(Math.max(0, maxDurationMs - elapsedMs))} left — stops at plan limit
          </p>
        )}
      </div>

      {showBubbleEditor && (
        <BubbleToolbar
          layout={bubbleLayout}
          onChange={onBubbleLayoutChange}
          frameSize={frameSize}
          disabled={phase === "starting"}
        />
      )}

      {info.usesScreen && info.usesCamera && (
        <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
          {bubbleIsPreviewOnly
            ? `${info.caveat} Your screen is captured at full resolution and keeps recording when you switch tabs.`
            : "Drag the camera, resize the corner handle, or change shape below — the recorded file matches this layout."}
        </p>
      )}
    </>
  );
}
