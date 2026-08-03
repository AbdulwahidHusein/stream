import { getBucket } from "@/lib/r2/bucket";
import { playableRecording } from "@/lib/playback";

/**
 * GET /api/v/[publicId]/media — public, unauthenticated video bytes.
 *
 * §11.3 recommends signed GETs on a bucket custom domain. This proxies through
 * the Worker instead so the share link works with nothing but the R2 binding —
 * no account keys, no bucket CORS, and identical behaviour against local
 * miniflare. What matters either way is `Range`: without byte-range replies the
 * scrub bar in §5.2 does not seek, which is a Definition-of-Done item (§19).
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
): Promise<Response> {
  return serve(request, await params, "GET");
}

export async function HEAD(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
): Promise<Response> {
  return serve(request, await params, "HEAD");
}

async function serve(
  request: Request,
  { publicId }: { publicId: string },
  method: "GET" | "HEAD",
): Promise<Response> {
  const recording = await playableRecording(publicId);
  if (!recording.ok) return recording.response;

  const bucket = await getBucket();
  const requested = parseRange(request.headers.get("range"));

  if (requested === "invalid") {
    return new Response(null, { status: 416, headers: { "Accept-Ranges": "bytes" } });
  }

  const object = await bucket.get(recording.row.r2Key, {
    range: requested ?? undefined,
  });

  if (!object) {
    // Row says ready but the object is gone — a purge/DB drift bug, not a 404 for the user.
    console.error("[media] object missing for ready recording", {
      publicId,
      key: recording.row.r2Key,
    });
    return new Response("Recording unavailable", { status: 404 });
  }

  const headers = new Headers();
  // Read `httpMetadata` rather than calling `object.writeHttpMetadata(headers)`:
  // the latter takes a Headers instance, which cannot cross the RPC boundary the
  // local dev proxy puts in front of R2. The plain object crosses fine.
  const contentType =
    object.httpMetadata?.contentType ?? recording.row.mimeType?.split(";")[0] ?? "video/mp4";

  headers.set("Content-Type", contentType);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  // The share link is the access control, so the response must not be shared-cached
  // by intermediaries beyond what the unguessable public id already implies.
  headers.set("Cache-Control", "private, max-age=3600");

  const wantsDownload =
    new URL(request.url).searchParams.get("download") === "1";
  if (wantsDownload && requested === null) {
    // Full-object download only — Range + attachment confuses many browsers.
    const ext = extensionFor(contentType);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${safeFilename(recording.row.title, ext)}"`,
    );
  }

  const resolved = resolveRange(object.range, object.size);
  const partial = requested !== null;

  headers.set("Content-Length", String(resolved.length));
  if (partial) {
    const last = resolved.offset + resolved.length - 1;
    headers.set("Content-Range", `bytes ${resolved.offset}-${last}/${object.size}`);
  }

  if (method === "HEAD") {
    return new Response(null, { status: partial ? 206 : 200, headers });
  }

  return new Response(object.body, { status: partial ? 206 : 200, headers });
}

function extensionFor(contentType: string): string {
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("mp4")) return "mp4";
  return "mp4";
}

/** ASCII filename safe for Content-Disposition (no path separators / quotes). */
function safeFilename(title: string, ext: string): string {
  const base = title
    .trim()
    .replace(/[^\w\s.-]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${base || "recording"}.${ext}`;
}

/**
 * Returns `null` for "no Range header", `"invalid"` for one we must 416, or the
 * R2Range to pass through. Only single ranges are supported — every browser
 * media element sends single ranges.
 */
function parseRange(header: string | null): R2Range | null | "invalid" {
  if (!header) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";

  const [, rawStart, rawEnd] = match;

  if (rawStart === "" && rawEnd === "") return "invalid";

  // `bytes=-N` — the last N bytes.
  if (rawStart === "") return { suffix: Number(rawEnd) };

  const offset = Number(rawStart);
  if (rawEnd === "") return { offset };

  const end = Number(rawEnd);
  if (end < offset) return "invalid";
  return { offset, length: end - offset + 1 };
}

/** R2Range is a three-way union on the way out; collapse it to absolute bytes. */
function resolveRange(range: R2Range | undefined, size: number) {
  if (!range) return { offset: 0, length: size };

  if ("suffix" in range && range.suffix !== undefined) {
    const length = Math.min(range.suffix, size);
    return { offset: size - length, length };
  }

  const offset = "offset" in range && range.offset !== undefined ? range.offset : 0;
  const length =
    "length" in range && range.length !== undefined
      ? Math.min(range.length, size - offset)
      : size - offset;

  return { offset, length };
}
