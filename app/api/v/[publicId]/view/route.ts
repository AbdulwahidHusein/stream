import { handle } from "@/lib/api/respond";
import { getDb } from "@/lib/db/client";
import { findPlayable } from "@/lib/playback";
import { registerView, dayBucket, viewerKey } from "@/lib/views";

/**
 * POST /api/v/[publicId]/view — §9.3. Public and unauthenticated.
 *
 * Fired by the player once playback actually starts, not on page load: a link
 * preview crawler fetching the page is not a view, and counting it would make the
 * one number the product reports meaningless.
 *
 * Rate limiting is structural rather than a counter — the unique index in §8.4
 * means a flood from one viewer produces one row and one increment per day. A
 * distributed flood still costs D1 reads; that needs a KV or Durable Object
 * limiter, which is worth adding alongside the other §14 rate limits.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
): Promise<Response> {
  return handle(async () => {
    const { publicId } = await params;

    const lookup = await findPlayable(publicId);
    // Silently succeed on anything unplayable: this endpoint is fire-and-forget
    // from the player and must never surface an error over the video.
    if (!lookup.ok) return Response.json({ counted: false });

    const now = Date.now();
    const key = await viewerKey(request, publicId, dayBucket(now));

    const db = await getDb();
    const result = await registerView(db, lookup.row, key, now);

    return Response.json(result);
  });
}
