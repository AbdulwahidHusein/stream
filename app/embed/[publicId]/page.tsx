import { findPlayable } from "@/lib/playback";
import { mediaPath, thumbPath } from "@/lib/recordings";

type Props = {
  params: Promise<{ publicId: string }>;
};

/**
 * Minimal iframe surface — no site chrome, just the video.
 */
export default async function EmbedPage({ params }: Props) {
  const { publicId } = await params;
  const lookup = await findPlayable(publicId);

  if (!lookup.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--ink)] px-6 text-center text-white">
        <p className="font-mono text-sm text-white/70">
          {lookup.reason === "expired"
            ? "This recording has expired."
            : lookup.reason === "not_ready"
              ? "Still uploading…"
              : "Recording unavailable."}
        </p>
      </main>
    );
  }

  const poster = lookup.row.thumbnailR2Key ? thumbPath(publicId) : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-black">
      <video
        src={mediaPath(publicId)}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        className="max-h-screen w-full"
      />
    </main>
  );
}
