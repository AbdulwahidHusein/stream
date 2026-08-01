"use client";

/**
 * Screen + camera composite, encoded into the file — TECHNICAL_SPEC.md §10.8's
 * "single composited stream" recommendation, finally honoured.
 *
 * The pipeline runs entirely off the main thread:
 *
 *   screen track ─┐
 *                 ├─► MediaStreamTrackProcessor ─► worker ─► MediaStreamTrackGenerator ─► MediaRecorder
 *   camera track ─┘        (VideoFrame streams)   (OffscreenCanvas)      (a real track)
 *
 * so nothing in it depends on the tab being visible. See `composite-worker.ts`
 * for why that property is the whole point.
 *
 * Support is Chromium-only today. `isCompositeSupported()` is the gate, and the
 * caller falls back to recording the raw screen track — with the UI saying so,
 * because a camera bubble that silently isn't in the file is the bug this
 * replaces.
 */

import type { BubbleLayout } from "./bubble";
import { DEFAULT_BUBBLE_LAYOUT } from "./bubble";

export interface CompositeStats {
  /** Frames composited in the worker. */
  drawn: number;
  /** Frames the track sink accepted. Lags `drawn` only when the sink stalls. */
  written: number;
  /** Frames skipped because the previous write was still in flight. */
  backpressure: number;
}

export interface CompositeTrack {
  /** The composited video track: what previews *and* what gets encoded. */
  track: MediaStreamTrack;
  setCameraVisible(visible: boolean): void;
  /** Live-update bubble position / size / shape while previewing or recording. */
  setBubbleLayout(layout: BubbleLayout): void;
  /**
   * Worker-reported progress. Read after a main-thread stall to tell whether the
   * pipeline kept running — the property this whole design exists for.
   */
  readonly stats: CompositeStats;
  /** Resolves when the worker has produced its first composited frame. */
  ready: Promise<void>;
  stop(): void;
}

export function isCompositeSupported(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof VideoFrame !== "undefined" &&
    typeof MediaStreamTrackProcessor !== "undefined" &&
    typeof MediaStreamTrackGenerator !== "undefined"
  );
}

export interface CompositeOptions {
  screen: MediaStreamTrack;
  camera: MediaStreamTrack;
  fps: number;
  cameraVisible: boolean;
  layout?: BubbleLayout;
  /** Called if the pipeline dies mid-recording, which loses the video track. */
  onError?: (message: string) => void;
}

export async function createCompositeTrack(
  options: CompositeOptions,
): Promise<CompositeTrack> {
  if (!isCompositeSupported()) {
    throw new Error("This browser has no insertable-streams support.");
  }

  const screenProcessor = new MediaStreamTrackProcessor({ track: options.screen });
  const cameraProcessor = new MediaStreamTrackProcessor({ track: options.camera });
  const generator = new MediaStreamTrackGenerator({ kind: "video" });

  const worker = new Worker(new URL("./composite-worker.ts", import.meta.url), {
    type: "module",
    name: "stream-composite",
  });

  let settled = false;
  let resolveReady!: () => void;
  let rejectReady!: (err: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const stats: CompositeStats = { drawn: 0, written: 0, backpressure: 0 };

  worker.onmessage = (
    event: MessageEvent<{
      type: string;
      message?: string;
      drawn?: number;
      written?: number;
      backpressure?: number;
    }>,
  ) => {
    const message = event.data;

    if (message.type === "ready" && !settled) {
      settled = true;
      resolveReady();
      return;
    }

    if (message.type === "stats") {
      stats.drawn = message.drawn ?? stats.drawn;
      stats.written = message.written ?? stats.written;
      stats.backpressure = message.backpressure ?? stats.backpressure;
      return;
    }

    if (message.type === "error") {
      const error = new Error(message.message ?? "The composite pipeline failed.");
      if (!settled) {
        settled = true;
        rejectReady(error);
      } else {
        options.onError?.(error.message);
      }
    }
  };

  worker.onerror = (event) => {
    const error = new Error(event.message || "The composite worker crashed.");
    if (!settled) {
      settled = true;
      rejectReady(error);
    } else {
      options.onError?.(error.message);
    }
  };

  // The streams are transferable, so frames never cross threads by copy.
  worker.postMessage(
    {
      type: "init",
      screen: screenProcessor.readable,
      camera: cameraProcessor.readable,
      output: generator.writable,
      fps: options.fps,
      cameraVisible: options.cameraVisible,
      layout: options.layout ?? DEFAULT_BUBBLE_LAYOUT,
    },
    [screenProcessor.readable, cameraProcessor.readable, generator.writable],
  );

  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    worker.postMessage({ type: "stop" });
    // Give the worker a beat to close its in-flight frames before it dies.
    setTimeout(() => worker.terminate(), 100);
    generator.stop();
  };

  try {
    await withTimeout(ready, READY_TIMEOUT_MS);
  } catch (err) {
    stop();
    throw err;
  }

  return {
    track: generator,
    setCameraVisible(visible: boolean) {
      if (!stopped) worker.postMessage({ type: "camera", visible });
    },
    setBubbleLayout(next: BubbleLayout) {
      if (!stopped) worker.postMessage({ type: "layout", layout: next });
    },
    stats,
    ready,
    stop,
  };
}

const READY_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("The composite pipeline did not start.")), ms),
    ),
  ]);
}
