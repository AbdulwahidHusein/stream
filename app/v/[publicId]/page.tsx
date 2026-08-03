import type { Metadata } from "next";
import Link from "next/link";
import { DownloadButton } from "@/components/playback/download-button";
import { Player } from "@/components/playback/player";
import { MarketingHeader } from "@/components/site/marketing-header";
import { currentUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { formatDuration } from "@/lib/format";
import { findPlayable, type PlaybackReason } from "@/lib/playback";
import { mediaPath, thumbPath } from "@/lib/recordings";
import { siteOrigin } from "@/lib/site";

type Props = {
  params: Promise<{ publicId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { publicId } = await params;
  const lookup = await findPlayable(publicId);

  if (!lookup.ok) {
    return { title: "Recording unavailable", robots: { index: false } };
  }

  const { title, durationMs, mimeType, thumbnailR2Key } = lookup.row;
  const origin = await siteOrigin();
  const description =
    durationMs !== null
      ? `A ${formatDuration(durationMs)} screen recording on Stream.`
      : "A screen recording on Stream.";

  return {
    title,
    description,
    robots: { index: false },
    openGraph: {
      title,
      description,
      type: "video.other",
      url: `${origin}/v/${publicId}`,
      images: thumbnailR2Key
        ? [{ url: `${origin}${thumbPath(publicId)}`, width: 640, alt: title }]
        : [],
      videos: [
        {
          url: `${origin}${mediaPath(publicId)}`,
          type: mimeType?.split(";")[0] ?? "video/mp4",
        },
      ],
    },
    twitter: {
      card: "player",
      title,
      description,
      images: thumbnailR2Key ? [`${origin}${thumbPath(publicId)}`] : [],
    },
  };
}

const UNAVAILABLE: Record<PlaybackReason, { heading: string; body: string }> = {
  not_found: {
    heading: "No such recording",
    body: "This link doesn’t point at anything. Check that you copied all of it.",
  },
  expired: {
    heading: "This link has expired",
    body: "Free recordings are kept for 7 days. Ask whoever sent it to record a new one.",
  },
  not_ready: {
    heading: "Still uploading",
    body: "This recording hasn’t finished uploading yet. Refresh in a moment.",
  },
};

export default async function PlaybackPage({ params }: Props) {
  const { publicId } = await params;
  const lookup = await findPlayable(publicId);

  let signedIn = false;
  try {
    signedIn = Boolean(await currentUser(await getDb()));
  } catch {
    signedIn = false;
  }

  return (
    <main className="flex min-h-full flex-1 flex-col bg-[var(--bg)]">
      <MarketingHeader signedIn={signedIn} />

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-8 md:px-8 md:py-10">
        {lookup.ok ? (
          <div className="animate-rise">
            <div className="overflow-hidden rounded-[var(--radius)] bg-[#0a0e14] shadow-[var(--shadow-float)] ring-1 ring-black/10">
              <Player
                src={mediaPath(publicId)}
                poster={lookup.row.thumbnailR2Key ? thumbPath(publicId) : undefined}
                publicId={publicId}
                needsDurationFix={lookup.row.mimeType?.startsWith("video/webm") ?? false}
                watermark={lookup.row.hasWatermark === 1}
              />
            </div>

            <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="page-title">{lookup.row.title}</h1>
                <p className="mt-2 font-mono text-sm text-[var(--ink-faint)]">
                  {lookup.row.durationMs !== null && (
                    <>{formatDuration(lookup.row.durationMs)} · </>
                  )}
                  {publicId}
                </p>
              </div>
              <DownloadButton href={`${mediaPath(publicId)}?download=1`} />
            </div>

            {lookup.row.expiresAt !== null && (
              <p className="mt-5 text-sm text-[var(--ink-muted)]">
                This link expires on{" "}
                {new Date(lookup.row.expiresAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                .
              </p>
            )}
          </div>
        ) : (
          <div className="animate-rise mt-10 max-w-md">
            <h1 className="page-title">{UNAVAILABLE[lookup.reason].heading}</h1>
            <p className="page-sub">{UNAVAILABLE[lookup.reason].body}</p>
            <Link
              href={signedIn ? "/record" : "/login?next=/record"}
              className="btn-primary mt-8"
            >
              <span
                aria-hidden
                className="inline-block size-2 rounded-full bg-[var(--record)]"
              />
              Record your own
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
