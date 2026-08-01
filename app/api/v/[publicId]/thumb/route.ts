import { getBucket } from "@/lib/r2/bucket";
import { playableRecording } from "@/lib/playback";

/**
 * GET /api/v/[publicId]/thumb — public poster image.
 *
 * Unlike the media route this is safe to cache publicly and at the edge: it is
 * one small immutable object, and it is the thing link unfurlers fetch, often
 * several times per share from different datacentres.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
): Promise<Response> {
  const { publicId } = await params;

  const recording = await playableRecording(publicId);
  if (!recording.ok) return recording.response;

  const key = recording.row.thumbnailR2Key;
  if (!key) return new Response("No thumbnail", { status: 404 });

  const bucket = await getBucket();
  const object = await bucket.get(key);
  if (!object) return new Response("No thumbnail", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
      "Content-Length": String(object.size),
      ETag: object.httpEtag,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
