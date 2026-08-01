import type { RecordMode } from "./types";

/**
 * Suggested title shown when a take finishes — dated and mode-aware so the
 * library doesn't fill with identical "Untitled recording" rows.
 */
export function suggestedRecordingTitle(mode: RecordMode, at: Date = new Date()): string {
  const kind =
    mode === "camera" ? "Camera" : mode === "both" ? "Screen & camera" : "Screen";

  const when = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);

  return `${kind} · ${when}`;
}
