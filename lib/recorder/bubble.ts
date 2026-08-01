/**
 * Camera bubble geometry and drawing — shared by the encoded composite
 * (`composite-worker.ts`) and the fallback rAF preview (`compositor.ts`).
 *
 * One implementation on purpose: when these were separate, the preview drew a
 * bubble the recorded file never contained. Anything that changes how the bubble
 * looks has to change it in both places or in neither.
 */

export type BubbleShape = "circle" | "rounded" | "square";

/**
 * Normalized layout in frame space.
 * `x`/`y` are the bubble centre (0–1). `size` is side/diameter as a fraction of
 * frame height so the overlay stays the same visual weight across resolutions.
 */
export interface BubbleLayout {
  x: number;
  y: number;
  size: number;
  shape: BubbleShape;
}

export const BUBBLE = {
  /** Default diameter / side as a fraction of frame height. */
  defaultSize: 0.26,
  minSize: 0.1,
  /** Near full-frame height — still leaves a thin margin so it stays on-screen. */
  maxSize: 0.92,
  marginRatio: 0.02,
  ringRatio: 0.005,
  ringStyle: "rgba(255,255,255,0.92)",
  /** Corner radius for `rounded`, as a fraction of the side. */
  roundedRadiusRatio: 0.22,
} as const;

/** Bottom-right circle — the historical fixed placement. */
export const DEFAULT_BUBBLE_LAYOUT: BubbleLayout = {
  x: 1 - BUBBLE.marginRatio - BUBBLE.defaultSize / 2,
  y: 1 - BUBBLE.marginRatio - BUBBLE.defaultSize / 2,
  size: BUBBLE.defaultSize,
  shape: "circle",
};

/**
 * The subset of the 2D context both `CanvasRenderingContext2D` and
 * `OffscreenCanvasRenderingContext2D` implement, so the same code runs on the
 * main thread and in the worker.
 */
export type BubbleContext = CanvasDrawImage &
  CanvasPath &
  CanvasState &
  CanvasRect &
  CanvasFillStrokeStyles &
  CanvasPathDrawingStyles &
  CanvasDrawPath & {
    roundRect?(
      x: number,
      y: number,
      w: number,
      h: number,
      radii?: number | DOMPointInit | (number | DOMPointInit)[],
    ): void;
  };

export interface FrameSize {
  width: number;
  height: number;
}

export interface BubbleBox {
  /** Top-left X in frame pixels. */
  x: number;
  /** Top-left Y in frame pixels. */
  y: number;
  side: number;
  cx: number;
  cy: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Clamp size and keep the bubble fully inside the frame. */
export function normalizeBubbleLayout(
  layout: BubbleLayout,
  frame?: FrameSize,
): BubbleLayout {
  const shape: BubbleShape =
    layout.shape === "rounded" || layout.shape === "square" ? layout.shape : "circle";

  if (!frame || !frame.width || !frame.height) {
    return {
      x: clamp(layout.x, 0, 1),
      y: clamp(layout.y, 0, 1),
      size: clamp(layout.size, BUBBLE.minSize, BUBBLE.maxSize),
      shape,
    };
  }

  // Size is relative to height; also cap so the square never exceeds frame width.
  const marginPx = frame.height * BUBBLE.marginRatio;
  const maxSidePx = Math.min(
    frame.height - 2 * marginPx,
    frame.width - 2 * marginPx,
  );
  const frameMaxSize = Math.max(BUBBLE.minSize, maxSidePx / frame.height);
  const size = clamp(layout.size, BUBBLE.minSize, Math.min(BUBBLE.maxSize, frameMaxSize));

  const side = frame.height * size;
  const halfW = side / (2 * frame.width);
  const halfH = side / (2 * frame.height);
  const marginX = marginPx / frame.width;
  const marginY = BUBBLE.marginRatio;

  const minX = Math.min(halfW + marginX, 0.5);
  const maxX = Math.max(1 - halfW - marginX, 0.5);
  const minY = Math.min(halfH + marginY, 0.5);
  const maxY = Math.max(1 - halfH - marginY, 0.5);

  return {
    x: clamp(layout.x, minX, maxX),
    y: clamp(layout.y, minY, maxY),
    size,
    shape,
  };
}

/** Pixel box for the current layout (after clamping into the frame). */
export function bubbleBox(layout: BubbleLayout, frame: FrameSize): BubbleBox {
  const normalized = normalizeBubbleLayout(layout, frame);
  const side = frame.height * normalized.size;
  const cx = normalized.x * frame.width;
  const cy = normalized.y * frame.height;
  return {
    x: cx - side / 2,
    y: cy - side / 2,
    side,
    cx,
    cy,
  };
}

function pathForShape(
  ctx: BubbleContext,
  box: BubbleBox,
  shape: BubbleShape,
): void {
  ctx.beginPath();
  if (shape === "circle") {
    ctx.arc(box.cx, box.cy, box.side / 2, 0, Math.PI * 2);
    return;
  }

  const radius =
    shape === "rounded" ? box.side * BUBBLE.roundedRadiusRatio : Math.max(2, box.side * 0.04);

  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(box.x, box.y, box.side, box.side, radius);
    return;
  }

  // Fallback for environments without roundRect.
  const r = Math.min(radius, box.side / 2);
  ctx.moveTo(box.x + r, box.y);
  ctx.arcTo(box.x + box.side, box.y, box.x + box.side, box.y + box.side, r);
  ctx.arcTo(box.x + box.side, box.y + box.side, box.x, box.y + box.side, r);
  ctx.arcTo(box.x, box.y + box.side, box.x, box.y, r);
  ctx.arcTo(box.x, box.y, box.x + box.side, box.y, r);
  ctx.closePath();
}

/** Draws `source` using the given layout (defaults to bottom-right circle). */
export function drawCameraBubble(
  ctx: BubbleContext,
  source: CanvasImageSource,
  sourceSize: FrameSize,
  frame: FrameSize,
  layout: BubbleLayout = DEFAULT_BUBBLE_LAYOUT,
): void {
  if (!sourceSize.width || !sourceSize.height) return;
  if (!frame.width || !frame.height) return;

  const normalized = normalizeBubbleLayout(layout, frame);
  const box = bubbleBox(normalized, frame);

  // Centre-crop the camera frame to a square so non-circle shapes never distort.
  const crop = Math.min(sourceSize.width, sourceSize.height);
  const sx = (sourceSize.width - crop) / 2;
  const sy = (sourceSize.height - crop) / 2;

  ctx.save();
  pathForShape(ctx, box, normalized.shape);
  ctx.clip();
  ctx.drawImage(source, sx, sy, crop, crop, box.x, box.y, box.side, box.side);
  ctx.restore();

  pathForShape(ctx, box, normalized.shape);
  ctx.lineWidth = Math.max(1, frame.height * BUBBLE.ringRatio);
  ctx.strokeStyle = BUBBLE.ringStyle;
  ctx.stroke();
}
