import { apiError, handle } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { getBucket } from "@/lib/r2/bucket";
import { ownedRecording } from "@/lib/recordings";

/**
 * PUT /api/recordings/[id]/parts?partNumber=N — one multipart part, raw body.
 *
 * Ownership is re-checked on every part, not just at create (§14): a part URL is
 * a write into someone's bucket key and must never be usable by anyone else.
 */

/** R2's hard ceiling on parts per multipart upload. */
const MAX_PART_NUMBER = 10_000;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id } = await params;

    const partNumber = Number(new URL(request.url).searchParams.get("partNumber"));
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > MAX_PART_NUMBER) {
      return apiError("bad_request", "partNumber must be an integer between 1 and 10000.");
    }

    const db = await getDb();
    const user = await requireUser(db);
    const recording = await ownedRecording(db, id, user.id);

    if (recording.status !== "pending_upload" || !recording.r2UploadId) {
      return apiError("conflict", "This recording is no longer accepting uploads.");
    }

    // Buffered rather than streamed: a part is bounded at 5 MiB by construction,
    // and R2's uploadPart wants a known length.
    const body = await request.arrayBuffer();
    if (body.byteLength === 0) {
      return apiError("bad_request", "Empty part.");
    }

    const bucket = await getBucket();
    const multipart = bucket.resumeMultipartUpload(recording.r2Key, recording.r2UploadId);

    let uploaded: R2UploadedPart;
    try {
      uploaded = await multipart.uploadPart(partNumber, body);
    } catch (err) {
      console.error("[api] uploadPart failed", { id, partNumber, err });
      // 502, not 500: the client's retry loop (§10.5) should treat this as transient.
      return apiError("upload_failed", "Storage rejected that part. It will be retried.");
    }

    return Response.json({
      partNumber: uploaded.partNumber,
      etag: uploaded.etag,
      bytes: body.byteLength,
    });
  });
}
