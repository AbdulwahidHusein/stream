import { cache } from "react";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { recordings } from "@/lib/db/schema";
import type { RecordingRow } from "@/lib/recordings";

/**
 * Public playback lookup — no session, no ownership check. The unguessable
 * `public_id` is the only credential (§11.3), so this is the one query in the
 * app that deliberately serves anyone who has the link.
 */

export type PlaybackReason = "not_found" | "not_ready" | "expired";

export type PlaybackLookup =
  | { ok: true; row: RecordingRow }
  | { ok: false; reason: PlaybackReason };

/** `cache()`d so `generateMetadata` and the page body share one D1 round trip. */
export const findPlayable = cache(async (publicId: string): Promise<PlaybackLookup> => {
  const db = await getDb();

  const row = await db.query.recordings.findFirst({
    where: and(eq(recordings.publicId, publicId), isNull(recordings.deletedAt)),
  });

  if (!row) return { ok: false, reason: "not_found" };

  // Free links have a hard TTL (§6). The purge job reclaims the bytes on its own
  // schedule; playback must stop at the deadline regardless of whether it has run.
  if (row.expiresAt !== null && row.expiresAt <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  if (row.status !== "ready") return { ok: false, reason: "not_ready" };

  return { ok: true, row };
});

const MEDIA_STATUS: Record<PlaybackReason, number> = {
  not_found: 404,
  not_ready: 409,
  expired: 410,
};

const MEDIA_MESSAGE: Record<PlaybackReason, string> = {
  not_found: "No such recording",
  not_ready: "This recording is still uploading",
  expired: "This link has expired",
};

/** Route-handler flavour of {@link findPlayable}: a row, or the response to return. */
export async function playableRecording(
  publicId: string,
): Promise<{ ok: true; row: RecordingRow } | { ok: false; response: Response }> {
  const lookup = await findPlayable(publicId);
  if (lookup.ok) return lookup;

  return {
    ok: false,
    response: new Response(MEDIA_MESSAGE[lookup.reason], {
      status: MEDIA_STATUS[lookup.reason],
    }),
  };
}
