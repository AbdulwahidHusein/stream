/**
 * Capture / encode quality helpers.
 *
 * Bitrate stays capped in `lib/plans.ts` for the cost model. These knobs make
 * the encoder spend that budget on the right things — sharp UI text, clear voice.
 */

/** Prefer sharper screen text over smooth motion when the encoder is starved. */
export function hintScreenTrack(track: MediaStreamTrack): void {
  setContentHint(track, "text");
}

/** Webcam faces tolerate softer frames; preserve motion. */
export function hintCameraTrack(track: MediaStreamTrack): void {
  setContentHint(track, "motion");
}

/** Mic / narration — keep speech intelligible if the stack downmixes. */
export function hintMicTrack(track: MediaStreamTrack): void {
  setContentHint(track, "speech");
}

function setContentHint(track: MediaStreamTrack, hint: string): void {
  if (!("contentHint" in track)) return;
  try {
    track.contentHint = hint;
  } catch {
    // Unsupported hint values throw in some browsers — never block capture.
  }
}

/**
 * After getDisplayMedia, ask again for 1080p/30. Some browsers hand back a
 * lower default unless constraints are applied to the live track.
 */
export async function sharpenScreenTrack(track: MediaStreamTrack): Promise<void> {
  hintScreenTrack(track);
  try {
    await track.applyConstraints({
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
      frameRate: { ideal: 30, max: 30 },
    });
  } catch {
    // Constraints are a preference; capture continues at whatever the OS gave us.
  }
}

export async function sharpenCameraTrack(track: MediaStreamTrack): Promise<void> {
  hintCameraTrack(track);
  try {
    await track.applyConstraints({
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 30 },
    });
  } catch {
    // Same as screen — best-effort.
  }
}
