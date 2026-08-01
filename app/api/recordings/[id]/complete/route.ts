import { eq, sql } from "drizzle-orm";
import { apiError, handle } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { recordings, users } from "@/lib/db/schema";
import { planLimits } from "@/lib/plans";
import { getBucket } from "@/lib/r2/bucket";
import { expiryFor, mediaPath, ownedRecording, shareUrl } from "@/lib/recordings";

/**
 * POST /api/recordings/[id]/complete — §9.2.
 *
 * `durationMs` is client-reported and therefore display-only. The authoritative
 * limit is `size_bytes` read back from R2 after the multipart upload closes (§5.1.1).
 */

interface CompleteBody {
  parts?: { partNumber?: unknown; etag?: unknown }[];
  durationMs?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id } = await params;

    let body: CompleteBody;
    try {
      body = (await request.json()) as CompleteBody;
    } catch {
      return apiError("bad_request", "Expected a JSON body.");
    }

    const parts = normalizeParts(body.parts);
    if (!parts) {
      return apiError("bad_request", "parts must be a contiguous list starting at part 1.");
    }

    const durationMs =
      typeof body.durationMs === "number" && Number.isFinite(body.durationMs)
        ? Math.max(0, Math.round(body.durationMs))
        : null;

    const db = await getDb();
    const user = await requireUser(db);
    const recording = await ownedRecording(db, id, user.id);

    // Idempotent: a retried complete after a dropped response returns the same link.
    if (recording.status === "ready") {
      return Response.json(readyPayload(request, recording.publicId, recording));
    }

    if (recording.status !== "pending_upload" || !recording.r2UploadId) {
      return apiError("conflict", "This recording can no longer be completed.");
    }

    const bucket = await getBucket();
    const multipart = bucket.resumeMultipartUpload(recording.r2Key, recording.r2UploadId);

    let object: R2Object;
    try {
      object = await multipart.complete(parts);
    } catch (err) {
      console.error("[api] multipart complete failed", { id, err });
      await markFailed(db, id);
      return apiError(
        "upload_failed",
        "Storage could not assemble the upload. The take was not saved.",
      );
    }

    const limits = planLimits(user.plan);

    // §5.1.1: the only limit the server can actually enforce.
    if (object.size > limits.maxBytesPerRecording) {
      await bucket.delete(recording.r2Key).catch(() => {});
      await markFailed(db, id);
      return apiError(
        "too_large",
        `That recording is larger than your plan allows (${Math.round(
          limits.maxBytesPerRecording / (1024 * 1024),
        )} MB).`,
      );
    }

    const now = Date.now();

    await db
      .update(recordings)
      .set({
        status: "ready",
        sizeBytes: object.size,
        durationMs,
        r2UploadId: null,
        expiresAt: expiryFor(limits.linkTtlDays, now),
        updatedAt: now,
      })
      .where(eq(recordings.id, id));

    // Kept incrementally rather than SUM()-ed per quota check (§8.1).
    await db
      .update(users)
      .set({
        storageBytes: sql`${users.storageBytes} + ${object.size}`,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));

    return Response.json(
      readyPayload(request, recording.publicId, {
        ...recording,
        status: "ready",
        sizeBytes: object.size,
        durationMs,
        expiresAt: expiryFor(limits.linkTtlDays, now),
      }),
    );
  });
}

function readyPayload(
  request: Request,
  publicId: string,
  recording: {
    id: string;
    title: string;
    status: string;
    sizeBytes: number | null;
    durationMs: number | null;
    expiresAt: number | null;
  },
) {
  return {
    recording: {
      id: recording.id,
      publicId,
      title: recording.title,
      status: recording.status,
      sizeBytes: recording.sizeBytes,
      durationMs: recording.durationMs,
      expiresAt: recording.expiresAt,
      shareUrl: shareUrl(request, publicId),
      mediaUrl: mediaPath(publicId),
    },
  };
}

async function markFailed(db: Awaited<ReturnType<typeof getDb>>, id: string) {
  await db
    .update(recordings)
    .set({ status: "failed", r2UploadId: null, updatedAt: Date.now() })
    .where(eq(recordings.id, id));
}

/**
 * R2 concatenates parts in `partNumber` order, so a gap or duplicate silently
 * yields a truncated video rather than an error — validate before completing.
 */
function normalizeParts(raw: CompleteBody["parts"]): R2UploadedPart[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const parts: R2UploadedPart[] = [];
  for (const entry of raw) {
    const partNumber = entry?.partNumber;
    const etag = entry?.etag;
    if (typeof partNumber !== "number" || !Number.isInteger(partNumber)) return null;
    if (typeof etag !== "string" || etag.length === 0) return null;
    parts.push({ partNumber, etag });
  }

  parts.sort((a, b) => a.partNumber - b.partNumber);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].partNumber !== i + 1) return null;
  }

  return parts;
}
