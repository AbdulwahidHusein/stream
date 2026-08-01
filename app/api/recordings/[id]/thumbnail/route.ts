import { eq } from "drizzle-orm";
import { apiError, handle } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { recordings } from "@/lib/db/schema";
import { getBucket, thumbnailKey } from "@/lib/r2/bucket";
import { ownedRecording } from "@/lib/recordings";

/**
 * PUT /api/recordings/[id]/thumbnail — §9.2.
 *
 * Accepts a poster while the recording is still `pending_upload`, because the
 * client sends it before `/complete` so the share link unfurls correctly from the
 * first paste.
 */

/** A 640px JPEG at q0.7 lands well under this; anything larger isn't our poster. */
const MAX_THUMBNAIL_BYTES = 512 * 1024;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id } = await params;

    const db = await getDb();
    const user = await requireUser(db);
    const recording = await ownedRecording(db, id, user.id);

    if (recording.status !== "pending_upload" && recording.status !== "ready") {
      return apiError("conflict", "This recording can no longer take a thumbnail.");
    }

    const body = await request.arrayBuffer();
    if (body.byteLength === 0) return apiError("bad_request", "Empty thumbnail.");
    if (body.byteLength > MAX_THUMBNAIL_BYTES) {
      return apiError("too_large", "That thumbnail is larger than we accept.");
    }

    const key = thumbnailKey(user.id, recording.id);
    const bucket = await getBucket();

    await bucket.put(key, body, {
      httpMetadata: {
        contentType: "image/jpeg",
        cacheControl: "public, max-age=31536000, immutable",
      },
    });

    await db
      .update(recordings)
      .set({ thumbnailR2Key: key, updatedAt: Date.now() })
      .where(eq(recordings.id, id));

    return Response.json({ ok: true });
  });
}
