"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BITRATE, CAPTURE, planLimits, type PlanId } from "@/lib/plans";
import {
  missingCapabilities,
  negotiateMimeType,
  type Container,
  type NegotiatedMime,
} from "./capabilities";
import {
  acquireCapture,
  mixAudioTracks,
  type CaptureSession,
  type MixedAudio,
} from "./capture";
import {
  DEFAULT_BUBBLE_LAYOUT,
  type BubbleLayout,
} from "./bubble";
import {
  createCompositeTrack,
  isCompositeSupported,
  type CompositeTrack,
} from "./composite";
import { createPreviewCompositor, type PreviewCompositor } from "./compositor";
import {
  errorDetail,
  unsupportedBrowser,
  uploadErrorDetail,
  type RecorderError,
} from "./errors";
import { hintCameraTrack, hintScreenTrack } from "./quality";
import { THUMBNAIL, grabPosterFrame } from "./thumbnail";
import type { RecordMode } from "./types";
import {
  ChunkUploader,
  abortUploadSession,
  createUploadSession,
  type UploadProgress,
  type UploadSession,
} from "./uploader";

/**
 * Recorder state machine for §5.1 capture, with the §10.5 progressive upload
 * attached to `ondataavailable`.
 *
 * Nothing is held for the length of the take: each 5 s chunk is handed to the
 * uploader, cut into fixed-size parts, and released once R2 confirms it. That is
 * why there is no local blob to review at the end — the review player streams the
 * uploaded object back through the same share link the recipient will open, which
 * is also the only honest way to prove the link works.
 */

export type RecorderPhase =
  | "idle"
  | "preparing"
  | "ready"
  | "starting"
  | "recording"
  | "paused"
  | "finalizing"
  | "review";

export interface RecordingResult {
  /** Internal id — rename / library mutations. */
  id: string;
  publicId: string;
  title: string;
  /** Carried through so the review screen can restate what actually got encoded. */
  mode: RecordMode;
  /** Whether the camera bubble made it into this file (§10.8 composite path). */
  cameraInFile: boolean;
  /** Absolute `/v/{publicId}` URL — what the user copies and sends. */
  shareUrl: string;
  /** Public media endpoint the `<video>` element loads. */
  mediaUrl: string;
  /** Poster image, when the frame grab succeeded (§10.6 makes it optional). */
  thumbUrl?: string;
  /** Authoritative size, read back from R2 after the upload closed (§5.1.1). */
  sizeBytes: number;
  durationMs: number;
  mimeType: string;
  container: Container;
  /** WebM still needs the §10.4 duration fix before its scrub bar works. */
  needsDurationFix: boolean;
}

const EMPTY_PROGRESS: UploadProgress = {
  uploadedBytes: 0,
  capturedBytes: 0,
  bufferedBytes: 0,
  partBytes: CAPTURE.minPartBytes,
  partsUploaded: 0,
  partsDeferred: 0,
};

export function useRecorder(plan: PlanId) {
  const limits = planLimits(plan);

  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [mode, setMode] = useState<RecordMode | null>(null);
  const [error, setError] = useState<RecorderError | null>(null);
  const [notice, setNotice] = useState<RecorderError | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [hasMic, setHasMic] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [autoStopped, setAutoStopped] = useState(false);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(null);
  const [result, setResult] = useState<RecordingResult | null>(null);
  /** True when the camera bubble is genuinely being encoded, not just previewed. */
  const [compositeActive, setCompositeActive] = useState(false);
  const [bubbleLayout, setBubbleLayoutState] = useState<BubbleLayout>(DEFAULT_BUBBLE_LAYOUT);
  const [upload, setUpload] = useState<UploadProgress>(EMPTY_PROGRESS);
  const bubbleLayoutRef = useRef<BubbleLayout>(DEFAULT_BUBBLE_LAYOUT);

  const phaseRef = useRef<RecorderPhase>("idle");
  const sessionRef = useRef<CaptureSession | null>(null);
  const compositorRef = useRef<PreviewCompositor | null>(null);
  const compositeRef = useRef<CompositeTrack | null>(null);
  const mixedAudioRef = useRef<MixedAudio | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const uploaderRef = useRef<ChunkUploader | null>(null);
  const posterRef = useRef<Blob | null>(null);
  const posterTimerRef = useRef<number | null>(null);
  /** Wall clock when the current recording segment started (start or resume). */
  const segmentStartedAtRef = useRef(0);
  /** Active recording time accumulated across previous pause/resume segments. */
  const accumulatedMsRef = useRef(0);
  const stoppedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  // Filled after `stop` is defined so auto-stop can call it without a cycle.
  const stopRef = useRef<(() => void) | null>(null);

  const activeElapsedMs = useCallback(() => {
    if (phaseRef.current === "paused") return accumulatedMsRef.current;
    if (
      phaseRef.current === "recording" ||
      phaseRef.current === "finalizing"
    ) {
      return (
        accumulatedMsRef.current + (Date.now() - segmentStartedAtRef.current)
      );
    }
    return accumulatedMsRef.current;
  }, []);

  const armAutoStop = useCallback(() => {
    if (autoStopRef.current !== null) window.clearTimeout(autoStopRef.current);
    const remaining = Math.max(0, limits.maxDurationMs - activeElapsedMs());
    autoStopRef.current = window.setTimeout(() => {
      setAutoStopped(true);
      stopRef.current?.();
    }, remaining);
  }, [activeElapsedMs, limits.maxDurationMs]);

  const toPhase = useCallback((next: RecorderPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (tickRef.current !== null) window.clearInterval(tickRef.current);
    if (autoStopRef.current !== null) window.clearTimeout(autoStopRef.current);
    if (posterTimerRef.current !== null) window.clearTimeout(posterTimerRef.current);
    tickRef.current = null;
    autoStopRef.current = null;
    posterTimerRef.current = null;
  }, []);

  const releaseCapture = useCallback(() => {
    compositeRef.current?.stop();
    compositeRef.current = null;
    setCompositeActive(false);
    compositorRef.current?.stop();
    compositorRef.current = null;
    mixedAudioRef.current?.dispose();
    mixedAudioRef.current = null;
    sessionRef.current?.stop();
    sessionRef.current = null;
    setPreviewStream(null);
    setPreviewCanvas(null);
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    // Fold the open segment into the total before we leave "recording".
    if (phaseRef.current === "recording") {
      accumulatedMsRef.current += Date.now() - segmentStartedAtRef.current;
    }
    stoppedAtRef.current = Date.now();
    clearTimers();
    toPhase("finalizing");
    // Resume first if paused — some browsers won't flush a final chunk from paused.
    if (recorder.state === "paused") {
      try {
        recorder.resume();
      } catch {
        // Best-effort; stop below still ends the take.
      }
    }
    recorder.stop(); // flushes a final dataavailable, then onstop
  }, [clearTimers, toPhase]);

  stopRef.current = stop;

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || phaseRef.current !== "recording") return;
    if (typeof recorder.pause !== "function" || recorder.state !== "recording") return;

    accumulatedMsRef.current += Date.now() - segmentStartedAtRef.current;
    setElapsedMs(accumulatedMsRef.current);
    recorder.pause();
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (autoStopRef.current !== null) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    toPhase("paused");
  }, [toPhase]);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || phaseRef.current !== "paused") return;
    if (typeof recorder.resume !== "function" || recorder.state !== "paused") return;

    recorder.resume();
    segmentStartedAtRef.current = Date.now();
    toPhase("recording");

    tickRef.current = window.setInterval(() => {
      setElapsedMs(activeElapsedMs());
    }, 200);
    armAutoStop();
  }, [activeElapsedMs, armAutoStop, toPhase]);

  const finalize = useCallback(
    async (
      negotiated: NegotiatedMime,
      uploader: ChunkUploader,
      recordedMode: RecordMode,
      cameraInFile: boolean,
    ) => {
      // Active recording time only — paused gaps do not count against the plan.
      const durationMs = Math.max(0, Math.round(accumulatedMsRef.current));

      recorderRef.current = null;
      // Devices go back to the user the moment encoding stops — the remaining work
      // is network, and holding the camera light on through it is inexcusable.
      releaseCapture();

      try {
        // Before /complete, so the share link unfurls with a picture the first
        // time it's pasted. Non-fatal by contract (§10.6).
        const poster = posterRef.current;
        posterRef.current = null;
        const hasPoster = poster ? await uploader.uploadThumbnail(poster) : false;

        const completed = await uploader.finish(durationMs);

        setResult({
          id: completed.id,
          publicId: completed.publicId,
          title: completed.title,
          mode: recordedMode,
          cameraInFile,
          shareUrl: completed.shareUrl,
          mediaUrl: completed.mediaUrl,
          thumbUrl: hasPoster ? `/api/v/${completed.publicId}/thumb` : undefined,
          sizeBytes: completed.sizeBytes,
          durationMs: completed.durationMs ?? durationMs,
          mimeType: negotiated.mimeType,
          container: negotiated.container,
          needsDurationFix: negotiated.needsDurationFix,
        });
        setElapsedMs(durationMs);
        toPhase("review");
      } catch (err) {
        await uploader.abort();
        setError(uploadErrorDetail(err));
        setMode(null);
        toPhase("idle");
      } finally {
        uploaderRef.current = null;
      }
    },
    [releaseCapture, toPhase],
  );

  /**
   * Screen + camera setup, best path first.
   *
   * 1. Encoded composite (`composite.ts`) — the bubble is in the file, and the
   *    preview *is* the composited track, so what you see is literally what gets
   *    encoded. No divergence is possible.
   * 2. rAF preview canvas — the bubble is preview-only, and the UI says so.
   *
   * The fallback is never silent: `compositeActive` drives the caveat copy.
   */
  const setUpCombined = useCallback(
    async (session: CaptureSession) => {
      const screenTrack = session.screenTrack;
      const cameraTrack = session.cameraTrack;

      if (isCompositeSupported() && screenTrack && cameraTrack) {
        try {
          const composite = await createCompositeTrack({
            screen: screenTrack,
            camera: cameraTrack,
            fps: CAPTURE.maxFrameRate,
            cameraVisible: true,
            layout: bubbleLayoutRef.current,
            onError: (message) => {
              // Mid-recording death of the pipeline kills the video track, so it
              // has to surface rather than produce a truncated file.
              setError({
                code: "recorder-failed",
                title: "The camera overlay stopped",
                message: `${message} Start a new take — this one can't continue.`,
              });
              stop();
            },
          });

          compositeRef.current = composite;
          setCompositeActive(true);
          setPreviewStream(new MediaStream([composite.track]));
          return;
        } catch (err) {
          // Falling back is fine; falling back quietly is not.
          console.warn("[recorder] composite unavailable, previewing only", err);
        }
      }

      const compositor = await createPreviewCompositor({
        screen: session.screenStream!,
        camera: session.cameraStream!,
        fps: CAPTURE.maxFrameRate,
        layout: bubbleLayoutRef.current,
      });
      compositorRef.current = compositor;
      setCompositeActive(false);
      setPreviewCanvas(compositor.canvas);
    },
    [stop],
  );

  const setBubbleLayout = useCallback((next: BubbleLayout) => {
    bubbleLayoutRef.current = next;
    setBubbleLayoutState(next);
    compositeRef.current?.setBubbleLayout(next);
    compositorRef.current?.setBubbleLayout(next);
  }, []);

  const handleScreenEnded = useCallback(() => {
    // The browser's own "Stop sharing" bar is a legitimate way to end a take.
    if (
      phaseRef.current === "recording" ||
      phaseRef.current === "paused" ||
      phaseRef.current === "finalizing"
    ) {
      stop();
      return;
    }
    releaseCapture();
    toPhase("idle");
    setMode(null);
    setNotice({
      code: "capture-failed",
      title: "Screen sharing ended",
      message: "You stopped sharing before recording started. Pick a mode to set up again.",
    });
  }, [releaseCapture, stop, toPhase]);

  const chooseMode = useCallback(
    async (next: RecordMode) => {
      if (
        phaseRef.current === "preparing" ||
        phaseRef.current === "recording" ||
        phaseRef.current === "paused"
      ) {
        return;
      }

      setError(null);
      setNotice(null);

      const missing = missingCapabilities(next);
      if (missing.length > 0) {
        setError(unsupportedBrowser(missing));
        return;
      }

      setMode(next);
      toPhase("preparing");

      try {
        const session = await acquireCapture(next);
        sessionRef.current = session;
        setNotice(session.micIssue);
        setHasMic(Boolean(session.micTrack));
        setHasCamera(Boolean(session.cameraTrack));
        setMicEnabled(Boolean(session.micTrack));
        setCameraEnabled(Boolean(session.cameraTrack));

        if (next === "both" && session.screenStream && session.cameraStream) {
          await setUpCombined(session);
        } else {
          setPreviewStream(next === "camera" ? session.cameraStream : session.screenStream);
        }

        session.screenTrack?.addEventListener("ended", handleScreenEnded);
        toPhase("ready");
      } catch (err) {
        releaseCapture();
        setError(errorDetail(err));
        setMode(null);
        toPhase("idle");
      }
    },
    [handleScreenEnded, releaseCapture, setUpCombined, toPhase],
  );

  const start = useCallback(async () => {
    if (!sessionRef.current || phaseRef.current !== "ready") return;

    const negotiated = negotiateMimeType();
    if (!negotiated) {
      setError(unsupportedBrowser(["codec"]));
      return;
    }

    setError(null);
    setUpload(EMPTY_PROGRESS);
    toPhase("starting");

    // The multipart upload is opened *before* the first frame, so the very first
    // 5 s timeslice has somewhere to go (§4.2 step 2).
    let uploadSession: UploadSession;
    try {
      uploadSession = await createUploadSession({
        mode: sessionRef.current.mode,
        container: negotiated.container,
        mimeType: negotiated.mimeType,
      });
    } catch (err) {
      setError(uploadErrorDetail(err));
      toPhase("ready");
      return;
    }

    const session = sessionRef.current;
    // The user can cancel during that round trip; don't strand the upload.
    // The assertion re-widens the phase TypeScript narrowed at the guard above:
    // `toPhase` writes the ref through a callback it can't follow across the await.
    if (!session || (phaseRef.current as RecorderPhase) !== "starting") {
      void abortUploadSession(uploadSession);
      return;
    }

    try {
      // The composited track when we have one — it carries the camera bubble and
      // is fed by the worker pipeline, which keeps running while the tab is
      // hidden. Otherwise the raw device track: never the rAF preview canvas,
      // whose capture stream freezes the moment the user switches tabs.
      const videoTrack =
        compositeRef.current?.track ??
        (session.mode === "camera" ? session.cameraTrack : session.screenTrack);

      if (!videoTrack) throw new Error("No video track available to record.");

      // Tell the encoder what kind of pixels these are so it spends the bitrate
      // budget on text (screen) vs motion (camera) instead of guessing.
      if (session.mode === "camera") hintCameraTrack(videoTrack);
      else hintScreenTrack(videoTrack);

      const mixed = mixAudioTracks(
        [session.micTrack, session.systemAudioTrack].filter(
          (track): track is MediaStreamTrack => Boolean(track),
        ),
      );
      mixedAudioRef.current = mixed;

      const stream = new MediaStream(
        mixed.track ? [videoTrack, mixed.track] : [videoTrack],
      );

      const recorder = new MediaRecorder(stream, {
        mimeType: negotiated.mimeType,
        // Fixed, never left to the browser — the §6.1 cost model depends on it.
        videoBitsPerSecond: BITRATE.videoBps,
        audioBitsPerSecond: BITRATE.audioBps,
      });

      const uploader = new ChunkUploader(uploadSession, setUpload);
      uploaderRef.current = uploader;
      setAutoStopped(false);

      recorder.ondataavailable = (event: BlobEvent) => {
        // §10.5: hand the chunk over and let go of it. Memory stays at one part.
        if (event.data.size > 0) uploader.push(event.data);

        if (uploader.fatalError) {
          stop();
          return;
        }

        // §9.5: the server would reject this at /complete anyway, so stop now
        // rather than spend the user's bandwidth on a doomed take.
        if (uploader.overBudget) {
          setAutoStopped(true);
          stop();
          return;
        }

        // Backstop for the duration cap. Recording continues while the tab is
        // hidden, so the setTimeout below can be throttled by minutes — this
        // fires off the media pipeline, on the timeslice, throttling or not.
        if (activeElapsedMs() >= limits.maxDurationMs) {
          setAutoStopped(true);
          stop();
        }
      };

      recorder.onerror = () => {
        clearTimers();
        releaseCapture();
        recorderRef.current = null;
        void uploader.abort();
        uploaderRef.current = null;
        setError({
          code: "recorder-failed",
          title: "Recording stopped unexpectedly",
          message: "The encoder failed mid-recording. Start a new take.",
        });
        toPhase("idle");
        setMode(null);
      };

      const cameraInFile = compositeRef.current !== null;
      recorder.onstop = () =>
        void finalize(negotiated, uploader, session.mode, cameraInFile);

      recorderRef.current = recorder;
      accumulatedMsRef.current = 0;
      segmentStartedAtRef.current = Date.now();
      stoppedAtRef.current = Date.now();
      setElapsedMs(0);
      setResult(null);

      recorder.start(CAPTURE.timesliceMs);
      toPhase("recording");

      // §10.6: one frame from the encoded track, a second in. Held as a ~30 KB
      // JPEG until stop — the only thing this hook keeps for the length of a take.
      posterRef.current = null;
      posterTimerRef.current = window.setTimeout(() => {
        void grabPosterFrame(videoTrack).then((blob) => {
          posterRef.current = blob;
        });
      }, THUMBNAIL.atMs);

      tickRef.current = window.setInterval(() => {
        setElapsedMs(activeElapsedMs());
      }, 200);

      // Client-side auto-stop for the plan cap; the server's real ceiling is size (§5.1.1).
      armAutoStop();
    } catch (err) {
      void abortUploadSession(uploadSession);
      uploaderRef.current = null;
      setError(errorDetail(err));
      toPhase("ready");
    }
  }, [
    activeElapsedMs,
    armAutoStop,
    clearTimers,
    finalize,
    limits.maxDurationMs,
    releaseCapture,
    stop,
    toPhase,
  ]);

  const toggleMic = useCallback(() => {
    const session = sessionRef.current;
    if (!session?.micTrack) return;
    setMicEnabled(session.setMicEnabled(!session.micTrack.enabled));
  }, []);

  const toggleCamera = useCallback(() => {
    const session = sessionRef.current;
    if (!session?.cameraTrack) return;
    const next = session.setCameraEnabled(!session.cameraTrack.enabled);
    // A disabled video track still emits frames, just black ones — so the bubble
    // has to be dropped explicitly rather than encode a black circle.
    compositeRef.current?.setCameraVisible(next);
    compositorRef.current?.setCameraVisible(next);
    setCameraEnabled(next);
  }, []);

  const reset = useCallback(() => {
    clearTimers();

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      // Detach first: this take is being thrown away, not finalized.
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      recorder.stop();
    }
    recorderRef.current = null;

    // Release the multipart upload now instead of waiting 24 h for purge-abandoned.
    void uploaderRef.current?.abort();
    uploaderRef.current = null;
    posterRef.current = null;

    releaseCapture();
    setUpload(EMPTY_PROGRESS);
    setResult(null);
    setElapsedMs(0);
    setError(null);
    setNotice(null);
    setMode(null);
    setHasMic(false);
    setHasCamera(false);
    setAutoStopped(false);
    accumulatedMsRef.current = 0;
    segmentStartedAtRef.current = 0;
    bubbleLayoutRef.current = DEFAULT_BUBBLE_LAYOUT;
    setBubbleLayoutState(DEFAULT_BUBBLE_LAYOUT);
    toPhase("idle");
  }, [clearTimers, releaseCapture, toPhase]);

  // Release devices if the page unmounts mid-session.
  useEffect(() => {
    return () => {
      clearTimers();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      releaseCapture();
    };
  }, [clearTimers, releaseCapture]);

  // Parts already in R2 survive a closed tab, but the un-uploaded tail and the
  // /complete call do not — so the take would still be lost.
  useEffect(() => {
    if (
      phase !== "recording" &&
      phase !== "paused" &&
      phase !== "finalizing"
    ) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const remainingMs = Math.max(0, limits.maxDurationMs - elapsedMs);
  const canPause =
    typeof MediaRecorder !== "undefined" &&
    typeof MediaRecorder.prototype.pause === "function";

  return {
    phase,
    mode,
    error,
    notice,
    result,
    elapsedMs,
    remainingMs,
    maxDurationMs: limits.maxDurationMs,
    /** 80% of the cap — the warning threshold in §10.3. */
    nearLimit:
      (phase === "recording" || phase === "paused") &&
      elapsedMs >= limits.maxDurationMs * 0.8,
    autoStopped,
    micEnabled,
    cameraEnabled,
    hasMic,
    hasCamera,
    previewStream,
    previewCanvas,
    /** Camera bubble is in the encoded file, not just the preview. */
    compositeActive,
    bubbleLayout,
    setBubbleLayout,
    upload,
    /** Share of captured bytes confirmed stored, 0–1. Honest, not animated (§2.1). */
    uploadRatio:
      upload.capturedBytes > 0
        ? Math.min(1, upload.uploadedBytes / upload.capturedBytes)
        : 0,
    /** False on rare engines without MediaRecorder.pause — UI hides the control. */
    canPause,
    chooseMode,
    start,
    stop,
    pause,
    resume,
    toggleMic,
    toggleCamera,
    reset,
  };
}
