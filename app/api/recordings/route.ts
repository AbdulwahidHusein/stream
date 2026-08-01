import { apiError, handle } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { recordings } from "@/lib/db/schema";
import { newId, newPublicId } from "@/lib/ids";
import { CAPTURE, planLimits } from "@/lib/plans";
import { checkCreateQuota, denialMessage } from "@/lib/quota";
import { getBucket, playbackContentType, sourceKey } from "@/lib/r2/bucket";
import { mediaPath, sanitizeTitle, shareUrl } from "@/lib/recordings";
import type { Container } from "@/lib/recorder/capabilities";
import type { RecordMode } from "@/lib/recorder/types";

/**
 * POST /api/recordings — §9.2.
 *
 * Called *before* MediaRecorder starts so the multipart upload already exists
 * when the first 5 s timeslice fires, and parts can go out during the take (§10.5).
 */

const MODES: RecordMode[] = ["screen", "camera", "both"];
const CONTAINERS: Container[] = ["mp4", "webm"];

interface CreateBody {
  mode?: string;
  container?: string;
  mimeType?: string;
  title?: string;
}

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    let body: CreateBody;
    try {
      body = (await request.json()) as CreateBody;
    } catch {
      return apiError("bad_request", "Expected a JSON body.");
    }

    const mode = MODES.find((m) => m === body.mode);
    if (!mode) return apiError("bad_request", "Unknown capture mode.");

    const container = CONTAINERS.find((c) => c === body.container);
    if (!container) return apiError("bad_request", "Unsupported container.");

    const mimeType = typeof body.mimeType === "string" ? body.mimeType.slice(0, 120) : null;
    const title = sanitizeTitle(body.title);

    const db = await getDb();
    const user = await requireUser(db);
    const limits = planLimits(user.plan);
    const now = Date.now();

    // Checked before the multipart upload is opened, so a refused recording never
    // creates R2 state we'd have to clean up (§11.5).
    const quota = await checkCreateQuota(db, user, now);
    if (!quota.ok) {
      return apiError(
        quota.denial.reason === "free_pool" ? "capacity" : "quota_exceeded",
        denialMessage(quota.denial),
      );
    }

    const id = newId();
    const publicId = newPublicId();
    const key = sourceKey(user.id, id, container);

    const bucket = await getBucket();
    const multipart = await bucket.createMultipartUpload(key, {
      httpMetadata: {
        contentType: playbackContentType(container),
        // The key contains the recording id and is written exactly once.
        cacheControl: "public, max-age=31536000, immutable",
      },
    });

    try {
      await db.insert(recordings).values({
        id,
        publicId,
        userId: user.id,
        title,
        status: "pending_upload",
        mode,
        mimeType,
        r2Key: key,
        r2UploadId: multipart.uploadId,
        // Denormalized at create so a plan change mid-take can't retroactively strip
        // the watermark from something recorded under the free plan.
        hasWatermark: limits.watermark ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      // Never leave an orphan multipart upload accruing storage we'd be billed for.
      await multipart.abort().catch(() => {});
      throw err;
    }

    return Response.json({
      recording: {
        id,
        publicId,
        status: "pending_upload",
        title,
        shareUrl: shareUrl(request, publicId),
        mediaUrl: mediaPath(publicId),
        maxDurationMs: limits.maxDurationMs,
        maxBytes: limits.maxBytesPerRecording,
      },
      upload: {
        strategy: "multipart",
        uploadId: multipart.uploadId,
        partEndpoint: `/api/recordings/${id}/parts`,
        completeEndpoint: `/api/recordings/${id}/complete`,
        abortEndpoint: `/api/recordings/${id}/abort`,
        thumbnailEndpoint: `/api/recordings/${id}/thumbnail`,
        /**
         * R2 requires every part except the last to be *exactly* this size — a
         * stricter rule than S3's ">= 5 MiB". The client cuts on this number.
         */
        partBytes: CAPTURE.minPartBytes,
      },
    });
  });
}
