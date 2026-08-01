import type { MissingCapability } from "./capabilities";

/**
 * §10.3 asks for precise, actionable copy per failure mode — denied vs. no
 * device vs. unsupported browser — rather than one generic failure.
 */
export type RecorderErrorCode =
  | "unsupported-browser"
  | "permission-denied"
  | "device-missing"
  | "device-busy"
  | "capture-failed"
  | "recorder-failed"
  | "upload-failed";

export type CaptureSource = "screen" | "camera" | "mic";

export interface RecorderError {
  code: RecorderErrorCode;
  title: string;
  message: string;
}

export class RecorderFailure extends Error {
  readonly detail: RecorderError;

  constructor(detail: RecorderError) {
    super(detail.message);
    this.name = "RecorderFailure";
    this.detail = detail;
  }
}

const SOURCE_LABEL: Record<CaptureSource, string> = {
  screen: "Screen sharing",
  camera: "Camera",
  mic: "Microphone",
};

export function describeMediaError(err: unknown, source: CaptureSource): RecorderError {
  const name = err instanceof DOMException ? err.name : "";
  const label = SOURCE_LABEL[source];

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        code: "permission-denied",
        title: `${label} was blocked`,
        message:
          source === "screen"
            ? "You cancelled the picker or the browser blocked screen capture. Choose a screen, window, or tab to continue."
            : `Allow ${source} access in your browser's address bar, then try again.`,
      };

    case "NotFoundError":
    case "OverconstrainedError":
      return {
        code: "device-missing",
        title: `No ${source} found`,
        message:
          source === "screen"
            ? "This browser reported no capturable screen. Try desktop Chrome or Edge."
            : `Connect a ${source} and reload the page.`,
      };

    case "NotReadableError":
      return {
        code: "device-busy",
        title: `${label} is in use`,
        message: `Another app or tab is holding your ${source}. Close it and try again.`,
      };

    case "AbortError":
      return {
        code: "capture-failed",
        title: `${label} stopped unexpectedly`,
        message: "The capture was interrupted before it started. Try again.",
      };

    case "NotSupportedError":
    case "TypeError":
      return {
        code: "unsupported-browser",
        title: `${label} is not supported here`,
        message:
          "This browser can't capture that source. Stream records best on desktop Chrome or Edge (§10.7).",
      };

    default:
      return {
        code: "capture-failed",
        title: `${label} failed to start`,
        message:
          err instanceof Error && err.message
            ? err.message
            : "Something went wrong while starting capture. Try again.",
      };
  }
}

export function captureFailure(err: unknown, source: CaptureSource): RecorderFailure {
  if (err instanceof RecorderFailure) return err;
  return new RecorderFailure(describeMediaError(err, source));
}

const CAPABILITY_COPY: Record<MissingCapability, string> = {
  "media-devices":
    "This browser doesn't expose camera or microphone capture. Use desktop Chrome, Edge, or Firefox.",
  "display-capture":
    "This browser can't capture a screen. Screen recording needs desktop Chrome, Edge, or Firefox — mobile browsers aren't supported.",
  "media-recorder":
    "This browser has no MediaRecorder support, so it can't encode video. Use desktop Chrome, Edge, or Firefox.",
  codec:
    "This browser offers no MP4 or WebM encoder Stream can use. Use desktop Chrome, Edge, or Firefox.",
};

export function unsupportedBrowser(missing: MissingCapability[]): RecorderError {
  return {
    code: "unsupported-browser",
    title: "This browser can't record",
    message: CAPABILITY_COPY[missing[0]] ?? CAPABILITY_COPY["media-recorder"],
  };
}

const UPLOAD_TITLE: Record<string, string> = {
  too_large: "That take is over your plan limit",
  quota_exceeded: "You've hit your plan's limit",
  capacity: "Free storage is full",
  empty: "Nothing was captured",
  aborted: "Upload cancelled",
  part_failed: "The upload couldn't finish",
};

/**
 * Upload failures get their own copy: the recording itself worked, so telling the
 * user their camera failed would send them to fix the wrong thing.
 */
export function uploadErrorDetail(err: unknown): RecorderError {
  const code = err instanceof Error ? (err as Error & { code?: string }).code : undefined;
  return {
    code: "upload-failed",
    title: (code && UPLOAD_TITLE[code]) || "Upload failed",
    message:
      err instanceof Error && err.message
        ? err.message
        : "The recording couldn't be uploaded. Check your connection and record again.",
  };
}

export function errorDetail(err: unknown): RecorderError {
  if (err instanceof RecorderFailure) return err.detail;
  return {
    code: "capture-failed",
    title: "Recording failed",
    message:
      err instanceof Error && err.message ? err.message : "An unexpected error stopped the recorder.",
  };
}
