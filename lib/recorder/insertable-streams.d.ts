/**
 * Mediacapture Transform ("insertable streams" / breakout box).
 *
 * Not in TypeScript's DOM lib because it is Chromium-only, so the shapes we
 * actually use are declared here. `lib/recorder/composite.ts` probes for these at
 * runtime and never assumes they exist.
 *
 * Spec: https://w3c.github.io/mediacapture-transform/
 */

interface MediaStreamTrackProcessor<T = VideoFrame> {
  readonly readable: ReadableStream<T>;
}

declare const MediaStreamTrackProcessor: {
  prototype: MediaStreamTrackProcessor;
  new (init: { track: MediaStreamTrack; maxBufferSize?: number }): MediaStreamTrackProcessor;
};

interface MediaStreamTrackGenerator<T = VideoFrame> extends MediaStreamTrack {
  readonly writable: WritableStream<T>;
}

declare const MediaStreamTrackGenerator: {
  prototype: MediaStreamTrackGenerator;
  new (init: { kind: "video" | "audio" }): MediaStreamTrackGenerator;
};
