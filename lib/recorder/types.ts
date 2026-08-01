export type RecordMode = "screen" | "camera" | "both";

export interface RecordModeInfo {
  id: RecordMode;
  label: string;
  description: string;
  usesScreen: boolean;
  usesCamera: boolean;
  /**
   * Label and copy for browsers that can't run the §10.8 composite pipeline, where
   * the camera really is preview-only. Whether this applies is a runtime capability
   * question (`isCompositeSupported()`), never a static property of the mode — the
   * previous version hard-coded the limitation and told Chrome users the bubble was
   * missing when it wasn't.
   */
  fallbackLabel: string | null;
  fallbackDescription: string | null;
  /** Shown alongside the fallback label, spelling out what is lost. */
  caveat: string | null;
}

/** Capture modes from TECHNICAL_SPEC.md §5.1. */
export const RECORD_MODES: readonly RecordModeInfo[] = [
  {
    id: "screen",
    label: "Screen",
    description: "A screen, window, or tab with your mic over it.",
    usesScreen: true,
    usesCamera: false,
    fallbackLabel: null,
    fallbackDescription: null,
    caveat: null,
  },
  {
    id: "camera",
    label: "Camera",
    description: "Just you — a talking head, no screen share.",
    usesScreen: false,
    usesCamera: true,
    fallbackLabel: null,
    fallbackDescription: null,
    caveat: null,
  },
  {
    id: "both",
    label: "Screen + camera",
    description: "Your screen with your camera in a corner bubble, recorded as one file.",
    usesScreen: true,
    usesCamera: true,
    fallbackLabel: "Screen + camera preview",
    fallbackDescription: "Your screen and mic are recorded. Your camera shows here only.",
    caveat:
      "This browser can't composite the camera into the file. The bubble helps you frame yourself, but the recording will contain your screen and audio only — Chrome and Edge include it.",
  },
];

export function modeInfo(mode: RecordMode): RecordModeInfo {
  return RECORD_MODES.find((m) => m.id === mode) ?? RECORD_MODES[0];
}
