"use client";

import { useSyncExternalStore } from "react";
import { isCompositeSupported } from "@/lib/recorder/composite";
import { RECORD_MODES, type RecordMode } from "@/lib/recorder/types";
import { CameraIcon, ScreenCameraIcon, ScreenIcon } from "./icons";

/**
 * Browser capability read as an external store rather than an effect: it differs
 * between server and client by nature, and `useSyncExternalStore` is the one hook
 * that expresses that without a hydration mismatch or a cascading re-render.
 * A capability never changes at runtime, so the subscription is a no-op.
 */
const subscribeToNothing = () => () => {};
const readCompositeSupport = (): boolean | null => isCompositeSupported();
/** `null` on the server: unknown, so neither claim is made for that first paint. */
const readOnServer = (): boolean | null => null;

const ICONS = {
  screen: ScreenIcon,
  camera: CameraIcon,
  both: ScreenCameraIcon,
} as const;

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? ""}`} viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M17 10a7 7 0 0 0-7-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ModeSelect({
  onSelect,
  disabled,
  pending,
}: {
  onSelect: (mode: RecordMode) => void;
  disabled?: boolean;
  pending?: RecordMode | null;
}) {
  const canComposite = useSyncExternalStore(
    subscribeToNothing,
    readCompositeSupport,
    readOnServer,
  );

  const degraded = canComposite === false;
  const waiting = pending != null;

  return (
    <div className="animate-rise-delay flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {RECORD_MODES.map((mode) => {
          const Icon = ICONS[mode.id];
          const isPending = pending === mode.id;
          const isRecommended = mode.id === "screen";
          const dimOthers = waiting && !isPending;

          return (
            <button
              key={mode.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(mode.id)}
              className={`app-panel group relative flex flex-col items-start gap-3 p-5 text-left transition-[border-color,box-shadow,opacity,transform] duration-150 hover:border-[var(--line-strong)] hover:shadow-[var(--shadow-float)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed active:translate-y-px ${
                isPending
                  ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]"
                  : ""
              } ${dimOthers ? "opacity-45" : ""} ${disabled && !isPending ? "opacity-55" : ""}`}
            >
              {isRecommended && !waiting && (
                <span className="absolute right-3 top-3 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-[var(--accent)]">
                  Recommended
                </span>
              )}

              <span className="flex size-11 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--panel-muted)] text-[var(--ink-muted)] transition-colors group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)]">
                <Icon className="size-5" />
              </span>

              <span className="pr-16 text-[0.975rem] font-semibold tracking-tight">
                {(degraded && mode.fallbackLabel) || mode.label}
              </span>

              <span className="text-sm leading-relaxed text-[var(--ink-muted)]">
                {(degraded && mode.fallbackDescription) || mode.description}
              </span>

              {degraded && mode.caveat && (
                <span className="border-l-2 border-[var(--line-strong)] pl-3 text-xs leading-relaxed text-[var(--ink-faint)]">
                  {mode.caveat}
                </span>
              )}

              <span className="mt-auto flex items-center gap-2 pt-1 text-sm font-medium text-[var(--accent)]">
                {isPending ? (
                  <>
                    <Spinner className="size-3.5" />
                    Waiting for permission…
                  </>
                ) : (
                  "Continue"
                )}
              </span>
            </button>
          );
        })}
      </div>

      {waiting && (
        <p
          role="status"
          className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink-muted)]"
        >
          Your browser will ask for screen or camera access. Approve the prompt to continue to
          preview.
        </p>
      )}
    </div>
  );
}
