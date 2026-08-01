import type { RecordMode } from "./types";

/**
 * Container/codec probe — TECHNICAL_SPEC.md §10.2.
 *
 * The recipient's browser matters more than the recorder's: MP4/H.264+AAC is
 * chosen first so share links play on iOS and macOS Safari with no server-side
 * transcoding (§11.4). Firefox falls through to WebM, which then owes the
 * duration fix-up in §10.4 before its scrub bar works.
 */
export const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
] as const;

export type Container = "mp4" | "webm";

export interface NegotiatedMime {
  /** Full type passed to MediaRecorder, codecs included. */
  mimeType: string;
  container: Container;
  /** Base type without codec parameters — what a <video> element wants. */
  playbackType: string;
  /** WebM from MediaRecorder omits Duration/Cues, so seeking breaks (§10.4). */
  needsDurationFix: boolean;
}

export function negotiateMimeType(): NegotiatedMime | null {
  if (typeof MediaRecorder === "undefined") return null;

  for (const mimeType of MIME_CANDIDATES) {
    if (!MediaRecorder.isTypeSupported(mimeType)) continue;
    const container: Container = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
    return {
      mimeType,
      container,
      playbackType: mimeType.split(";")[0],
      needsDurationFix: container === "webm",
    };
  }

  return null;
}

export type MissingCapability =
  | "media-devices"
  | "display-capture"
  | "media-recorder"
  | "codec";

/** Everything the browser is missing for `mode`, empty when it can record. */
export function missingCapabilities(mode: RecordMode): MissingCapability[] {
  const missing: MissingCapability[] = [];
  const devices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;

  if (!devices?.getUserMedia) missing.push("media-devices");
  if (mode !== "camera" && !devices?.getDisplayMedia) missing.push("display-capture");
  if (typeof MediaRecorder === "undefined") missing.push("media-recorder");
  else if (!negotiateMimeType()) missing.push("codec");

  return missing;
}
