import { CAPTURE } from "@/lib/plans";
import { captureFailure, describeMediaError, type RecorderError } from "./errors";
import type { RecordMode } from "./types";

/**
 * Device acquisition for the three capture modes in §5.1, under the 1080p/30fps
 * ceiling from §10.3. Audio and video are kept as separate handles so the mute
 * and camera toggles can act on individual tracks while recording.
 */

const screenVideoConstraints: MediaTrackConstraints = {
  width: { max: CAPTURE.maxWidth },
  height: { max: CAPTURE.maxHeight },
  frameRate: { ideal: CAPTURE.maxFrameRate, max: CAPTURE.maxFrameRate },
};

const cameraVideoConstraints: MediaTrackConstraints = {
  width: { ideal: 1280, max: CAPTURE.maxWidth },
  height: { ideal: 720, max: CAPTURE.maxHeight },
  frameRate: { ideal: CAPTURE.maxFrameRate, max: CAPTURE.maxFrameRate },
  facingMode: "user",
};

const micConstraints: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export interface CaptureSession {
  mode: RecordMode;
  screenStream: MediaStream | null;
  cameraStream: MediaStream | null;
  screenTrack: MediaStreamTrack | null;
  cameraTrack: MediaStreamTrack | null;
  micTrack: MediaStreamTrack | null;
  /** System/tab audio from getDisplayMedia — present only when the OS and browser allow it. */
  systemAudioTrack: MediaStreamTrack | null;
  /** Non-fatal: mic was wanted but blocked or absent, so capture continues without it. */
  micIssue: RecorderError | null;
  /** Mute/unmute mid-recording (§5.1); returns the resulting state. */
  setMicEnabled(enabled: boolean): boolean;
  /** Disable/enable the camera mid-recording (§5.1); returns the resulting state. */
  setCameraEnabled(enabled: boolean): boolean;
  stop(): void;
}

function isPermissionError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "NotAllowedError" || err.name === "SecurityError")
  );
}

async function getScreenStream(): Promise<MediaStream> {
  const devices = navigator.mediaDevices;
  try {
    // Ask for system audio; browsers that can't provide it simply return no audio track.
    return await devices.getDisplayMedia({ video: screenVideoConstraints, audio: true });
  } catch (err) {
    // A denial or a cancelled picker is final — only a capability failure is worth retrying.
    if (isPermissionError(err)) throw captureFailure(err, "screen");
    try {
      return await devices.getDisplayMedia({ video: screenVideoConstraints });
    } catch (retryErr) {
      throw captureFailure(retryErr, "screen");
    }
  }
}

async function getCameraStream(): Promise<{ stream: MediaStream; micIssue: RecorderError | null }> {
  const devices = navigator.mediaDevices;
  try {
    const stream = await devices.getUserMedia({
      video: cameraVideoConstraints,
      audio: micConstraints,
    });
    return { stream, micIssue: null };
  } catch (err) {
    if (isPermissionError(err)) throw captureFailure(err, "camera");
    // A missing or busy mic must not cost the user their camera.
    try {
      const stream = await devices.getUserMedia({ video: cameraVideoConstraints });
      return { stream, micIssue: describeMediaError(err, "mic") };
    } catch (cameraErr) {
      throw captureFailure(cameraErr, "camera");
    }
  }
}

async function getMicStream(): Promise<{ stream: MediaStream | null; micIssue: RecorderError | null }> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints });
    return { stream, micIssue: null };
  } catch (err) {
    // Narration is optional: a screen recording without audio still beats no recording.
    return { stream: null, micIssue: describeMediaError(err, "mic") };
  }
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function acquireCapture(mode: RecordMode): Promise<CaptureSession> {
  let screenStream: MediaStream | null = null;
  let cameraStream: MediaStream | null = null;
  let micStream: MediaStream | null = null;
  let micIssue: RecorderError | null = null;

  try {
    // getDisplayMedia needs the click's transient activation, so it goes first.
    if (mode !== "camera") {
      screenStream = await getScreenStream();
    }

    if (mode !== "screen") {
      const camera = await getCameraStream();
      cameraStream = camera.stream;
      micIssue = camera.micIssue;
    } else {
      const mic = await getMicStream();
      micStream = mic.stream;
      micIssue = mic.micIssue;
    }
  } catch (err) {
    stopStream(screenStream);
    stopStream(cameraStream);
    stopStream(micStream);
    throw err;
  }

  const micTrack =
    micStream?.getAudioTracks()[0] ?? cameraStream?.getAudioTracks()[0] ?? null;
  const cameraTrack = cameraStream?.getVideoTracks()[0] ?? null;

  return {
    mode,
    screenStream,
    cameraStream,
    screenTrack: screenStream?.getVideoTracks()[0] ?? null,
    cameraTrack,
    micTrack,
    systemAudioTrack: screenStream?.getAudioTracks()[0] ?? null,
    micIssue,
    setMicEnabled(enabled: boolean) {
      // A disabled track emits silence, which is also what the WebAudio mix receives.
      if (micTrack) micTrack.enabled = enabled;
      return Boolean(micTrack) && enabled;
    },
    setCameraEnabled(enabled: boolean) {
      if (cameraTrack) cameraTrack.enabled = enabled;
      return Boolean(cameraTrack) && enabled;
    },
    stop() {
      stopStream(screenStream);
      stopStream(cameraStream);
      stopStream(micStream);
    },
  };
}

export interface MixedAudio {
  track: MediaStreamTrack | null;
  dispose(): void;
}

/**
 * MediaRecorder takes a single audio track, so mic and system audio are summed
 * through WebAudio. Muting still works on the source track: a disabled track
 * feeds silence into the graph.
 */
export function mixAudioTracks(tracks: MediaStreamTrack[]): MixedAudio {
  const live = tracks.filter((track) => track.readyState === "live");

  if (live.length === 0) return { track: null, dispose: () => {} };
  if (live.length === 1) return { track: live[0], dispose: () => {} };

  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();

  for (const track of live) {
    context.createMediaStreamSource(new MediaStream([track])).connect(destination);
  }

  return {
    track: destination.stream.getAudioTracks()[0] ?? null,
    dispose: () => void context.close().catch(() => {}),
  };
}
