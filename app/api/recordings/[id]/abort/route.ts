import { eq } from "drizzle-orm";
import { handle } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { recordings } from "@/lib/db/schema";
import { getBucket } from "@/lib/r2/bucket";
import { ownedRecording } from "@/lib/recordings";

/**
 * POST /api/recordings/[id]/abort — §9.2.
 *
 * The client calls this when a take is cancelled. `purge-abandoned` (§6.2) is the
 * backstop for the tab that just closes; this keeps the common case from waiting
 * 24 h to stop being billed for parts nobody will ever complete.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id } = await params;

    const db = await getDb();
    const user = await requireUser(db);
    const recording = await ownedRecording(db, id, user.id);

    if (recording.r2UploadId) {
      const bucket = await getBucket();
      await bucket
        .resumeMultipartUpload(recording.r2Key, recording.r2UploadId)
        .abort()
        // Already aborted or completed — the row still needs closing out.
        .catch((err) => console.error("[api] multipart abort failed", { id, err }));
    }

    const now = Date.now();
    await db
      .update(recordings)
      .set({ status: "failed", r2UploadId: null, deletedAt: now, updatedAt: now })
      .where(eq(recordings.id, id));

    return Response.json({ ok: true });
  });
}
