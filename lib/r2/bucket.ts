import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Container } from "@/lib/recorder/capabilities";

/**
 * R2 access goes through the Worker binding rather than presigned S3 URLs.
 *
 * §10.5 describes browser → presigned R2 multipart. The binding is used instead
 * because it needs no account credentials in the browser's reach, no bucket CORS
 * rules, and no SigV4 signer — and because it works against local miniflare R2,
 * which presigning cannot. The part sizing and retry semantics are identical, so
 * swapping in presigned URLs later only touches this module and the uploader's
 * transport; the state machine around it does not move.
 */
export async function getBucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  return env.VIDEOS;
}

/** §11.1 key layout. */
export function sourceKey(userId: string, recordingId: string, container: Container): string {
  return `recordings/${userId}/${recordingId}/source.${container}`;
}

export function thumbnailKey(userId: string, recordingId: string): string {
  return `recordings/${userId}/${recordingId}/thumb.jpg`;
}

/** Base type a `<video>` element wants — codec parameters stripped. */
export function playbackContentType(container: Container): string {
  return container === "mp4" ? "video/mp4" : "video/webm";
}
