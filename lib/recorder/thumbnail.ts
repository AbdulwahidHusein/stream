"use client";

/**
 * Poster frame capture — TECHNICAL_SPEC.md §10.6.
 *
 * The spec draws this from the finished recording. That is no longer possible:
 * §10.5 releases each chunk once R2 confirms it, so there is no local blob to
 * seek. Instead the frame is grabbed from the live track a second into the take,
 * which gets the same picture, costs one small JPEG of memory instead of the
 * whole file, and has the thumbnail ready before the upload even finishes.
 *
 * It is grabbed from the *encoded* track specifically — in screen+camera mode the
 * camera bubble is preview only, so sourcing the poster from the preview canvas
 * would put a face in the thumbnail that isn't in the video.
 */

export const THUMBNAIL = {
  maxWidth: 640,
  quality: 0.7,
  /** Far enough in to skip the black first frame, early enough to be representative. */
  atMs: 1_000,
  /** A frame that never arrives must not hold up the recording. */
  timeoutMs: 4_000,
} as const;

export async function grabPosterFrame(track: MediaStreamTrack): Promise<Blob | null> {
  if (track.readyState !== "live") return null;

  const video = document.createElement("video");
  video.srcObject = new MediaStream([track]);
  video.muted = true;
  video.playsInline = true;

  try {
    await withTimeout(firstFrame(video), THUMBNAIL.timeoutMs);

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;

    const scale = Math.min(1, THUMBNAIL.maxWidth / width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", THUMBNAIL.quality),
    );
  } catch {
    // §10.6: failure is non-fatal — the library falls back to a placeholder tile.
    return null;
  } finally {
    video.srcObject = null;
  }
}

async function firstFrame(video: HTMLVideoElement): Promise<void> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await new Promise<void>((resolve) =>
      video.addEventListener("loadeddata", () => resolve(), { once: true }),
    );
  }
  await video.play().catch(() => {});
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("poster frame timed out")), ms),
    ),
  ]);
}
