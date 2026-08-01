/**
 * Screen + camera preview overlay — the second option in §10.8, chosen over the
 * canvas-composited single file.
 *
 * The composite cannot be the recorded surface: the draw loop runs on
 * requestAnimationFrame, which browsers stop firing once the tab is backgrounded,
 * so `canvas.captureStream` freezes on its last painted frame. Since the whole
 * point of screen capture is that the user navigates away from this tab, the
 * recorder encodes the raw getDisplayMedia track instead (see `use-recorder.ts`)
 * and this canvas drives preview only. Freezing a hidden preview costs nothing.
 *
 * The consequence is that the camera bubble is not burned into the recording —
 * the UI says so rather than implying otherwise. Restoring a true composite
 * needs a timing source that survives backgrounding (a worker tick, or
 * MediaStreamTrackProcessor in a worker), not a different rAF loop.
 */

import {
  DEFAULT_BUBBLE_LAYOUT,
  drawCameraBubble,
  normalizeBubbleLayout,
  type BubbleLayout,
} from "./bubble";
import { RecorderFailure, type CaptureSource } from "./errors";

export interface PreviewCompositor {
  canvas: HTMLCanvasElement;
  setCameraVisible(visible: boolean): void;
  setBubbleLayout(layout: BubbleLayout): void;
  stop(): void;
}

function createHiddenVideo(stream: MediaStream): HTMLVideoElement {
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  return video;
}

const FIRST_FRAME_TIMEOUT_MS = 10_000;

async function waitForFrames(video: HTMLVideoElement, source: CaptureSource): Promise<void> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    // A source that never delivers a frame must fail loudly rather than hang setup.
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () =>
          reject(
            new RecorderFailure({
              code: "capture-failed",
              title: "Capture never started",
              message: `Your ${source} produced no video. Close anything else using it and try again.`,
            }),
          ),
        FIRST_FRAME_TIMEOUT_MS,
      );

      video.addEventListener(
        "loadeddata",
        () => {
          window.clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  await video.play().catch(() => {
    // A detached, muted element is allowed to play; a rejection here is benign.
  });
}

export async function createPreviewCompositor(options: {
  screen: MediaStream;
  camera: MediaStream;
  fps: number;
  layout?: BubbleLayout;
}): Promise<PreviewCompositor> {
  const screenVideo = createHiddenVideo(options.screen);
  const cameraVideo = createHiddenVideo(options.camera);

  try {
    await Promise.all([
      waitForFrames(screenVideo, "screen"),
      waitForFrames(cameraVideo, "camera"),
    ]);
  } catch (err) {
    screenVideo.srcObject = null;
    cameraVideo.srcObject = null;
    throw err;
  }

  const canvas = document.createElement("canvas");
  canvas.width = screenVideo.videoWidth || 1280;
  canvas.height = screenVideo.videoHeight || 720;
  // The compositor owns this element end to end, presentation included, so the
  // preview can mount it without reaching in to restyle it.
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.objectFit = "contain";

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  let cameraVisible = true;
  let layout = normalizeBubbleLayout(options.layout ?? DEFAULT_BUBBLE_LAYOUT);
  let frame = 0;
  let lastDrawnAt = 0;
  const frameInterval = 1000 / options.fps;

  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    if (now - lastDrawnAt < frameInterval) return;
    lastDrawnAt = now;

    // The shared surface can change size mid-capture (window resize, display switch).
    if (screenVideo.videoWidth && screenVideo.videoWidth !== canvas.width) {
      canvas.width = screenVideo.videoWidth;
      canvas.height = screenVideo.videoHeight;
    }

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);

    if (!cameraVisible || !cameraVideo.videoWidth) return;

    ctx.imageSmoothingEnabled = true;
    drawCameraBubble(
      ctx,
      cameraVideo,
      { width: cameraVideo.videoWidth, height: cameraVideo.videoHeight },
      { width: canvas.width, height: canvas.height },
      layout,
    );
  };

  frame = requestAnimationFrame(draw);

  return {
    canvas,
    setCameraVisible(visible: boolean) {
      cameraVisible = visible;
    },
    setBubbleLayout(next: BubbleLayout) {
      layout = normalizeBubbleLayout(next, {
        width: canvas.width,
        height: canvas.height,
      });
    },
    stop() {
      cancelAnimationFrame(frame);
      // The tracks belong to the capture session, which stops them itself.
      screenVideo.srcObject = null;
      cameraVideo.srcObject = null;
    },
  };
}
