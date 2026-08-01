"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Public player.
 *
 * The only non-obvious part is the WebM duration repair (§10.4). MediaRecorder
 * writes WebM without a Duration element, so `video.duration` reads `Infinity`
 * and the scrub bar refuses to seek — on Firefox, every recording. Seeking far
 * past the end forces the browser to scan to the real end and report it; once it
 * does, we rewind and behave normally. MP4 never enters this path.
 */
export function Player({
  src,
  poster,
  publicId,
  needsDurationFix,
  watermark,
}: {
  src: string;
  poster?: string;
  publicId: string;
  needsDurationFix: boolean;
  watermark: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const repairingRef = useRef(false);
  const viewSentRef = useRef(false);
  const [failed, setFailed] = useState(false);

  // A view is playback actually starting — not a page load, which would count
  // every link-preview crawler and every accidental click.
  const onPlay = useCallback(() => {
    if (viewSentRef.current || repairingRef.current) return;
    viewSentRef.current = true;

    // Fire and forget: a failed count must never interrupt watching.
    void fetch(`/api/v/${publicId}/view`, { method: "POST", keepalive: true }).catch(
      () => {},
    );
  }, [publicId]);

  const onLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video || !needsDurationFix) return;
    if (Number.isFinite(video.duration) || repairingRef.current) return;

    repairingRef.current = true;
    // Any absurd offset works; the browser clamps to the true end while scanning.
    video.currentTime = 1e101;
  }, [needsDurationFix]);

  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !repairingRef.current) return;
    if (!Number.isFinite(video.duration)) return;

    repairingRef.current = false;
    video.currentTime = 0;
  }, []);

  if (failed) {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-black px-8 text-center">
        <p className="text-sm leading-relaxed text-white/70">
          This browser can&apos;t play this recording.{" "}
          <a href={src} download className="underline underline-offset-4">
            Download it instead
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onError={() => setFailed(true)}
        className="aspect-video w-full bg-black"
      />

      {watermark && (
        // §11.4: a conversion nudge for ordinary viewers, not an enforcement
        // mechanism. Removable in devtools, and absent if the media URL is opened
        // directly — deliberately, because burning it in would need transcoding.
        <span className="pointer-events-none absolute right-3 top-3 rounded-[var(--radius)] bg-black/55 px-2.5 py-1.5 font-mono text-xs tracking-wide text-white/85 backdrop-blur-sm">
          stream.et
        </span>
      )}
    </div>
  );
}
