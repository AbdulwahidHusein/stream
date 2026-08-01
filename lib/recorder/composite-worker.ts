import {
  DEFAULT_BUBBLE_LAYOUT,
  drawCameraBubble,
  normalizeBubbleLayout,
  type BubbleContext,
  type BubbleLayout,
} from "./bubble";

/**
 * Background-safe screen + camera compositor — TECHNICAL_SPEC.md §10.8.
 *
 * The reason this is a worker and not a `requestAnimationFrame` loop: rAF stops
 * firing the moment the tab is backgrounded, and backgrounding the tab is the
 * entire point of screen recording. A rAF-driven `canvas.captureStream()` freezes
 * on its last painted frame, so the user tabs away to demo something and the
 * shared video shows a still image with their voice over it.
 *
 * Here there is no timer and no rAF at all. Frames arrive from the capture tracks
 * themselves through `MediaStreamTrackProcessor`, are composited on an
 * `OffscreenCanvas`, and are written straight into a track the encoder consumes.
 * The cadence is the cameras' own, which the browser keeps producing while
 * hidden, so the composite keeps running exactly as long as the capture does.
 */

interface InitMessage {
  type: "init";
  screen: ReadableStream<VideoFrame>;
  camera: ReadableStream<VideoFrame>;
  output: WritableStream<VideoFrame>;
  fps: number;
  cameraVisible: boolean;
  layout: BubbleLayout;
}

type InboundMessage =
  | InitMessage
  | { type: "camera"; visible: boolean }
  | { type: "layout"; layout: BubbleLayout }
  | { type: "stop" };

type OutboundMessage =
  | { type: "ready" }
  | { type: "stats"; drawn: number; written: number; backpressure: number }
  | { type: "error"; message: string };

/**
 * Only the worker surface this file touches.
 *
 * Deliberately not `/// <reference lib="webworker" />`: that pulls the worker lib
 * into the whole program, where its globals collide with the DOM lib every other
 * file depends on. Everything else used here (OffscreenCanvas, VideoFrame,
 * streams, performance) exists in both libs anyway.
 */
interface CompositeWorkerScope {
  onmessage: ((event: MessageEvent<InboundMessage>) => void) | null;
  postMessage(message: OutboundMessage): void;
}

const scope = self as unknown as CompositeWorkerScope;

function post(message: OutboundMessage) {
  scope.postMessage(message);
}

let canvas: OffscreenCanvas | null = null;
let ctx: (OffscreenCanvasRenderingContext2D & BubbleContext) | null = null;
let writer: WritableStreamDefaultWriter<VideoFrame> | null = null;

let latestScreen: VideoFrame | null = null;
let latestCamera: VideoFrame | null = null;
let cameraVisible = true;
let layout: BubbleLayout = DEFAULT_BUBBLE_LAYOUT;

let running = false;
let startedAt = 0;
let lastEmitAt = -Infinity;
let minFrameGapMs = 1000 / 30;
/** One write in flight at a time — natural backpressure, and bounded memory. */
let writing = false;
/** Composited on this thread. */
let framesDrawn = 0;
/** Accepted by the track sink. Diverges from `framesDrawn` only if the sink stalls. */
let framesWritten = 0;
/** Frames skipped because the previous write hadn't landed yet. */
let framesBackpressured = 0;

scope.onmessage = (event: MessageEvent<InboundMessage>) => {
  const message = event.data;

  if (message.type === "camera") {
    cameraVisible = message.visible;
    return;
  }

  if (message.type === "layout") {
    layout = normalizeBubbleLayout(message.layout);
    return;
  }

  if (message.type === "stop") {
    shutdown();
    return;
  }

  if (message.type === "init") {
    start(message).catch((err) => {
      post({ type: "error", message: err instanceof Error ? err.message : String(err) });
      shutdown();
    });
  }
};

async function start(init: InitMessage): Promise<void> {
  canvas = new OffscreenCanvas(1280, 720);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("OffscreenCanvas 2D context unavailable");
  ctx = context as OffscreenCanvasRenderingContext2D & BubbleContext;

  writer = init.output.getWriter();
  cameraVisible = init.cameraVisible;
  layout = normalizeBubbleLayout(init.layout ?? DEFAULT_BUBBLE_LAYOUT);
  minFrameGapMs = 1000 / Math.max(1, init.fps);
  startedAt = performance.now();
  running = true;

  post({ type: "ready" });

  // Both sources feed the same emit path. Driving output from the screen alone
  // would stall the bubble whenever the screen is static — screen capture only
  // produces frames on change, while the camera runs at a steady rate.
  await Promise.all([
    pump(init.screen, (frame) => {
      latestScreen?.close();
      latestScreen = frame;
    }),
    pump(init.camera, (frame) => {
      latestCamera?.close();
      latestCamera = frame;
    }),
  ]);

  shutdown();
}

async function pump(
  readable: ReadableStream<VideoFrame>,
  onFrame: (frame: VideoFrame) => void,
): Promise<void> {
  const reader = readable.getReader();

  try {
    while (running) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      if (!running) {
        value.close();
        break;
      }

      onFrame(value);
      emit();
    }
  } finally {
    reader.releaseLock();
    await readable.cancel().catch(() => {});
  }
}

function emit(): void {
  if (!running || !ctx || !canvas || !writer) return;

  // A frame with no screen behind it would be a black rectangle with a face on it.
  const screen = latestScreen;
  if (!screen) return;

  const now = performance.now();
  if (now - lastEmitAt < minFrameGapMs) return;

  // Counted separately from the fps gate so a stalled sink is distinguishable
  // from an idle source when reading the stats.
  if (writing) {
    framesBackpressured += 1;
    return;
  }

  lastEmitAt = now;

  const width = screen.displayWidth;
  const height = screen.displayHeight;
  if (!width || !height) return;

  // The shared surface can change size mid-capture (window resize, display switch).
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.drawImage(screen, 0, 0, width, height);

  if (cameraVisible && latestCamera) {
    drawCameraBubble(
      ctx,
      latestCamera,
      { width: latestCamera.displayWidth, height: latestCamera.displayHeight },
      { width, height },
      layout,
    );
  }

  // Timestamps are our own monotonic clock rather than either source's, so a
  // camera-driven frame can never land before a screen-driven one.
  const output = new VideoFrame(canvas, {
    timestamp: Math.round((now - startedAt) * 1000),
    alpha: "discard",
  });

  framesDrawn += 1;
  writing = true;
  writer
    .write(output)
    .then(() => {
      framesWritten += 1;
      // Liveness signal. Messages posted while the main thread is blocked queue up
      // and flush afterwards, so the counts still attribute correctly to the block.
      if (framesWritten % 15 === 0) {
        post({
          type: "stats",
          drawn: framesDrawn,
          written: framesWritten,
          backpressure: framesBackpressured,
        });
      }
    })
    .catch(() => {
      // The sink owns the frame on success; on failure it is ours to release.
      output.close();
    })
    .finally(() => {
      writing = false;
    });
}

function shutdown(): void {
  if (!running && !writer) return;
  running = false;

  latestScreen?.close();
  latestCamera?.close();
  latestScreen = null;
  latestCamera = null;

  writer?.close().catch(() => {});
  writer = null;
  canvas = null;
  ctx = null;
}
