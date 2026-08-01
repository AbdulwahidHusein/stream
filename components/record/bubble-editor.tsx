"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUBBLE,
  bubbleBox,
  normalizeBubbleLayout,
  type BubbleLayout,
  type BubbleShape,
  type FrameSize,
} from "@/lib/recorder/bubble";

type ContentRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function contentRectForContain(
  host: DOMRect,
  frame: FrameSize,
): ContentRect | null {
  if (!frame.width || !frame.height || !host.width || !host.height) return null;
  const scale = Math.min(host.width / frame.width, host.height / frame.height);
  const width = frame.width * scale;
  const height = frame.height * scale;
  return {
    left: (host.width - width) / 2,
    top: (host.height - height) / 2,
    width,
    height,
  };
}

const SHAPES: { id: BubbleShape; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "rounded", label: "Rounded corners" },
  { id: "square", label: "Square" },
];

function ShapeGlyph({ shape }: { shape: BubbleShape }) {
  if (shape === "circle") {
    return (
      <span
        aria-hidden
        className="size-3.5 rounded-full border-[1.5px] border-current"
      />
    );
  }
  if (shape === "rounded") {
    return (
      <span
        aria-hidden
        className="size-3.5 rounded-[5px] border-[1.5px] border-current"
      />
    );
  }
  return (
    <span aria-hidden className="size-3.5 rounded-[1px] border-[1.5px] border-current" />
  );
}

type DragMode = "move" | "resize" | null;

/**
 * Interactive chrome over the preview — drag to move, corner to resize,
 * shape pills below. Layout is pushed into the composite / preview compositor
 * so the recorded file matches what you place.
 */
export function BubbleEditor({
  layout,
  onChange,
  frameSize,
  disabled,
}: {
  layout: BubbleLayout;
  onChange: (next: BubbleLayout) => void;
  frameSize: FrameSize | null;
  disabled?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState<ContentRect | null>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    origin: BubbleLayout;
  } | null>(null);

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host || !frameSize) {
      setContent(null);
      return;
    }
    setContent(contentRectForContain(host.getBoundingClientRect(), frameSize));
  }, [frameSize]);

  useEffect(() => {
    measure();
    const host = hostRef.current;
    if (!host) return;

    const observer = new ResizeObserver(() => measure());
    observer.observe(host);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const applyPointer = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      if (!drag || !frameSize || !content) return;

      const dx = clientX - drag.startX;
      const dy = clientY - drag.startY;

      if (drag.mode === "move") {
        const next: BubbleLayout = {
          ...drag.origin,
          x: drag.origin.x + dx / content.width,
          y: drag.origin.y + dy / content.height,
        };
        onChange(normalizeBubbleLayout(next, frameSize));
        return;
      }

      if (drag.mode === "resize") {
        // Grow from centre using the larger axis delta in content space.
        const delta = Math.max(dx, dy) / content.height;
        const next: BubbleLayout = {
          ...drag.origin,
          size: drag.origin.size + delta,
        };
        onChange(normalizeBubbleLayout(next, frameSize));
      }
    },
    [content, frameSize, onChange],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragRef.current) return;
      event.preventDefault();
      applyPointer(event.clientX, event.clientY);
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [applyPointer]);

  const startDrag = (mode: Exclude<DragMode, null>, event: React.PointerEvent) => {
    if (disabled || !frameSize) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: layout,
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const box =
    frameSize && content
      ? (() => {
          const normalized = normalizeBubbleLayout(layout, frameSize);
          const px = bubbleBox(normalized, frameSize);
          const scale = content.width / frameSize.width;
          return {
            left: content.left + px.x * scale,
            top: content.top + px.y * scale,
            side: px.side * scale,
            shape: normalized.shape,
            size: normalized.size,
          };
        })()
      : null;

  const radiusClass =
    box?.shape === "circle"
      ? "rounded-full"
      : box?.shape === "rounded"
        ? "rounded-[22%]"
        : "rounded-[4%]";

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0">
      {box && (
        <div
          className={`pointer-events-auto absolute touch-none ${radiusClass} ${
            disabled ? "cursor-default opacity-40" : "cursor-move"
          }`}
          style={{
            left: box.left,
            top: box.top,
            width: box.side,
            height: box.side,
          }}
          onPointerDown={(event) => startDrag("move", event)}
          role="slider"
          aria-label="Camera position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(layout.x * 100)}
        >
          <div
            className={`absolute inset-0 border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.35)] ${radiusClass}`}
          />
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-mono text-[10px] font-medium tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            Drag
          </div>
          {!disabled && (
            <button
              type="button"
              aria-label="Resize camera"
              className="absolute -bottom-1.5 -right-1.5 size-4 cursor-se-resize rounded-sm border border-white bg-[var(--accent)] shadow"
              onPointerDown={(event) => startDrag("resize", event)}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function BubbleToolbar({
  layout,
  onChange,
  frameSize,
  disabled,
}: {
  layout: BubbleLayout;
  onChange: (next: BubbleLayout) => void;
  frameSize: FrameSize | null;
  disabled?: boolean;
}) {
  const maxSize = frameSize
    ? normalizeBubbleLayout({ ...layout, size: BUBBLE.maxSize }, frameSize).size
    : BUBBLE.maxSize;

  return (
    <div className="app-panel flex flex-wrap items-center gap-3 px-3 py-2.5">
      <span className="text-xs font-medium text-[var(--ink-muted)]">Camera</span>

      <div className="flex items-center gap-1" role="group" aria-label="Camera shape">
        {SHAPES.map((shape) => {
          const active = layout.shape === shape.id;
          return (
            <button
              key={shape.id}
              type="button"
              disabled={disabled}
              title={shape.label}
              aria-label={shape.label}
              aria-pressed={active}
              onClick={() =>
                onChange(
                  normalizeBubbleLayout(
                    { ...layout, shape: shape.id },
                    frameSize ?? undefined,
                  ),
                )
              }
              className={`flex size-8 items-center justify-center rounded-[var(--radius-sm)] transition-colors disabled:opacity-50 ${
                active
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--ink-muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--ink)]"
              }`}
            >
              <ShapeGlyph shape={shape.id} />
            </button>
          );
        })}
      </div>

      <label className="ml-auto flex min-w-[140px] flex-1 items-center gap-2 sm:max-w-[220px]">
        <span className="shrink-0 text-xs text-[var(--ink-faint)]">Size</span>
        <input
          type="range"
          min={BUBBLE.minSize}
          max={maxSize}
          step={0.01}
          value={Math.min(layout.size, maxSize)}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              normalizeBubbleLayout(
                { ...layout, size: Number(event.target.value) },
                frameSize ?? undefined,
              ),
            )
          }
          className="w-full accent-[var(--accent)]"
          aria-label="Camera size"
        />
      </label>
    </div>
  );
}
