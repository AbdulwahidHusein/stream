"use client";

import type { RecorderPhase } from "@/lib/recorder/use-recorder";
import {
  CameraIcon,
  CameraOffIcon,
  MicIcon,
  MicOffIcon,
  PauseIcon,
  ResumeIcon,
  StopIcon,
} from "./icons";

function Toggle({
  on,
  label,
  onLabel,
  offLabel,
  onClick,
  OnIcon,
  OffIcon,
}: {
  on: boolean;
  label: string;
  onLabel: string;
  offLabel: string;
  onClick: () => void;
  OnIcon: (props: { className?: string }) => React.ReactElement;
  OffIcon: (props: { className?: string }) => React.ReactElement;
}) {
  const Icon = on ? OnIcon : OffIcon;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!on}
      aria-label={on ? onLabel : offLabel}
      title={on ? onLabel : offLabel}
      className={`flex items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-medium transition-colors ${
        on
          ? "border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[var(--panel-muted)]"
          : "border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]"
      }`}
    >
      <Icon className="size-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export function Controls({
  phase,
  micEnabled,
  cameraEnabled,
  hasMic,
  hasCamera,
  canPause,
  onToggleMic,
  onToggleCamera,
  onStart,
  onPause,
  onResume,
  onStop,
  onCancel,
}: {
  phase: RecorderPhase;
  micEnabled: boolean;
  cameraEnabled: boolean;
  hasMic: boolean;
  hasCamera: boolean;
  canPause: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onCancel: () => void;
}) {
  const isRecording = phase === "recording";
  const isPaused = phase === "paused";
  const isLive = isRecording || isPaused;
  const isFinalizing = phase === "finalizing";
  const isStarting = phase === "starting";

  return (
    <div className="app-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        {hasMic && (
          <Toggle
            on={micEnabled}
            label="Mic"
            onLabel="Mute microphone"
            offLabel="Unmute microphone"
            onClick={onToggleMic}
            OnIcon={MicIcon}
            OffIcon={MicOffIcon}
          />
        )}
        {hasCamera && (
          <Toggle
            on={cameraEnabled}
            label="Camera"
            onLabel="Turn camera off"
            offLabel="Turn camera on"
            onClick={onToggleCamera}
            OnIcon={CameraIcon}
            OffIcon={CameraOffIcon}
          />
        )}
      </div>

      <div className="flex items-center gap-3">
        {!isLive && !isFinalizing && !isStarting && (
          <button type="button" onClick={onCancel} className="btn-ghost">
            Change mode
          </button>
        )}

        {isLive && canPause && (
          <button
            type="button"
            onClick={isPaused ? onResume : onPause}
            className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5 text-sm font-medium text-[var(--ink)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--panel-muted)]"
          >
            {isPaused ? (
              <>
                <ResumeIcon className="size-3.5" />
                Resume
              </>
            ) : (
              <>
                <PauseIcon className="size-3.5" />
                Pause
              </>
            )}
          </button>
        )}

        {isLive || isFinalizing ? (
          <button
            type="button"
            onClick={onStop}
            disabled={isFinalizing}
            className="inline-flex items-center gap-2.5 rounded-[var(--radius-sm)] bg-[var(--record)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <StopIcon className="size-3.5" />
            {isFinalizing ? "Uploading…" : "Stop"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={isStarting}
            className="btn-primary !px-5 !py-2.5 text-sm disabled:hover:bg-[var(--accent)]"
          >
            <span aria-hidden className="inline-block size-2 rounded-full bg-white" />
            {isStarting ? "Starting…" : "Start recording"}
          </button>
        )}
      </div>
    </div>
  );
}
