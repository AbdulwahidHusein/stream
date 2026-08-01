"use client";

import type { Container } from "./capabilities";
import type { RecordMode } from "./types";

/**
 * Progressive multipart upload — TECHNICAL_SPEC.md §10.5.
 *
 * MediaRecorder chunks are cut into fixed-size parts and shipped **while the take
 * is still running**, so memory stays bounded at roughly one part instead of
 * growing to the whole recording, and a dropped connection costs one part rather
 * than the file.
 *
 * The one non-obvious constraint: R2 requires every part except the last to be
 * *exactly* the same size — stricter than S3's "at least 5 MiB". So this cuts on
 * an exact byte boundary rather than flushing whenever the buffer happens to be
 * large enough.
 */

export interface UploadSession {
  id: string;
  publicId: string;
  title: string;
  shareUrl: string;
  mediaUrl: string;
  maxBytes: number;
  partBytes: number;
  partEndpoint: string;
  completeEndpoint: string;
  abortEndpoint: string;
  thumbnailEndpoint: string;
}

export interface UploadProgress {
  /** Bytes confirmed stored in R2. */
  uploadedBytes: number;
  /** Bytes handed to the uploader, including those still queued or in flight. */
  capturedBytes: number;
  /**
   * Bytes sitting in the part buffer, waiting to hit `partBytes` (R2's 5 MiB
   * minimum for every part except the last). Not uploaded yet — by design.
   */
  bufferedBytes: number;
  /** Target size for each non-final part (from the create session). */
  partBytes: number;
  partsUploaded: number;
  /** Parts that exhausted their retries and are waiting for the post-stop sweep. */
  partsDeferred: number;
}

export interface CompletedUpload {
  id: string;
  publicId: string;
  title: string;
  shareUrl: string;
  mediaUrl: string;
  sizeBytes: number;
  durationMs: number | null;
}

export class UploadError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const ATTEMPTS_WHILE_RECORDING = 3;
const ATTEMPTS_AFTER_STOP = 5;
const BACKOFF_BASE_MS = 500;

/** Starts the server-side multipart upload. Must resolve before recording begins. */
export async function createUploadSession(input: {
  mode: RecordMode;
  container: Container;
  mimeType: string;
  title?: string;
}): Promise<UploadSession> {
  const response = await fetch("/api/recordings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = await readJson(response);
  if (!response.ok) throw errorFrom(response, body);

  const { recording, upload } = body as {
    recording: {
      id: string;
      publicId: string;
      title: string;
      shareUrl: string;
      mediaUrl: string;
      maxBytes: number;
    };
    upload: {
      partBytes: number;
      partEndpoint: string;
      completeEndpoint: string;
      abortEndpoint: string;
      thumbnailEndpoint: string;
    };
  };

  return {
    id: recording.id,
    publicId: recording.publicId,
    title: recording.title,
    shareUrl: recording.shareUrl,
    mediaUrl: recording.mediaUrl,
    maxBytes: recording.maxBytes,
    partBytes: upload.partBytes,
    partEndpoint: upload.partEndpoint,
    completeEndpoint: upload.completeEndpoint,
    abortEndpoint: upload.abortEndpoint,
    thumbnailEndpoint: upload.thumbnailEndpoint,
  };
}

/** Releases a multipart upload that was opened but never recorded into. */
export async function abortUploadSession(session: UploadSession): Promise<void> {
  try {
    await fetch(session.abortEndpoint, { method: "POST", keepalive: true });
  } catch {
    // §6.2's purge-abandoned job is the backstop; never surface this.
  }
}

interface QueuedPart {
  partNumber: number;
  body: Blob;
}

export class ChunkUploader {
  private pending: Blob;
  private nextPartNumber = 1;
  private chain: Promise<void> = Promise.resolve();
  private readonly completed = new Map<number, string>();
  private readonly deferred: QueuedPart[] = [];
  private uploadedBytes = 0;
  private capturedBytes = 0;
  private aborted = false;
  /** A non-retryable failure. Recorded rather than thrown so the background
   *  upload chain never rejects without a handler attached; `finish()` raises it. */
  private fatal: UploadError | null = null;

  constructor(
    private readonly session: UploadSession,
    private readonly onProgress?: (progress: UploadProgress) => void,
  ) {
    this.pending = new Blob([]);
  }

  /** Feed one `dataavailable` chunk. Returns immediately; uploads happen in the background. */
  push(chunk: Blob): void {
    if (this.aborted || this.fatal) return;

    this.capturedBytes += chunk.size;
    this.pending = new Blob([this.pending, chunk]);

    while (this.pending.size >= this.session.partBytes) {
      const body = this.pending.slice(0, this.session.partBytes);
      this.pending = this.pending.slice(this.session.partBytes);
      this.enqueue(body, ATTEMPTS_WHILE_RECORDING);
    }

    this.report();
  }

  /** True once the take is provably over the plan's byte ceiling — fail fast (§9.5). */
  get overBudget(): boolean {
    return this.capturedBytes > this.session.maxBytes;
  }

  /** Set when the upload has already failed unrecoverably; stop the take. */
  get fatalError(): UploadError | null {
    return this.fatal;
  }

  get progress(): UploadProgress {
    return {
      uploadedBytes: this.uploadedBytes,
      capturedBytes: this.capturedBytes,
      bufferedBytes: this.pending.size,
      partBytes: this.session.partBytes,
      partsUploaded: this.completed.size,
      partsDeferred: this.deferred.length,
    };
  }

  /**
   * Flushes the tail, drains parts that failed mid-recording, and closes the
   * multipart upload. Resolves with the share link.
   */
  async finish(durationMs: number | null): Promise<CompletedUpload> {
    if (this.aborted) throw new UploadError("aborted", "This upload was cancelled.");
    if (this.fatal) throw this.fatal;

    // Any leftover under one part size is the final part, which is exempt from
    // the uniform-size rule.
    while (this.pending.size > this.session.partBytes) {
      const body = this.pending.slice(0, this.session.partBytes);
      this.pending = this.pending.slice(this.session.partBytes);
      this.enqueue(body, ATTEMPTS_AFTER_STOP);
    }
    if (this.pending.size > 0) {
      this.enqueue(this.pending, ATTEMPTS_AFTER_STOP);
      this.pending = new Blob([]);
    }

    await this.chain;
    if (this.fatal) throw this.fatal;

    // §10.5 step 4: parts that ran out of retries during the take get one more
    // sweep now that we're no longer competing with the encoder for bandwidth.
    while (this.deferred.length > 0) {
      const part = this.deferred.shift()!;
      await this.attempt(part, ATTEMPTS_AFTER_STOP);
      if (this.fatal) throw this.fatal;
      if (!this.completed.has(part.partNumber)) {
        throw new UploadError(
          "part_failed",
          "Part of this recording could not be uploaded. Check your connection and try again.",
        );
      }
    }

    if (this.completed.size === 0) {
      throw new UploadError("empty", "Nothing was captured, so there is nothing to share.");
    }

    const parts = [...this.completed.entries()]
      .map(([partNumber, etag]) => ({ partNumber, etag }))
      .sort((a, b) => a.partNumber - b.partNumber);

    const response = await fetch(this.session.completeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parts, durationMs }),
    });

    const body = await readJson(response);
    if (!response.ok) throw errorFrom(response, body);

    const { recording } = body as {
      recording: {
        id?: string;
        publicId: string;
        title: string;
        shareUrl: string;
        mediaUrl: string;
        sizeBytes: number;
        durationMs: number | null;
      };
    };

    return {
      id: recording.id ?? this.session.id,
      publicId: recording.publicId,
      title: recording.title,
      shareUrl: recording.shareUrl,
      mediaUrl: recording.mediaUrl,
      sizeBytes: recording.sizeBytes,
      durationMs: recording.durationMs,
    };
  }

  /**
   * Uploads the poster frame. Never throws: §10.6 makes a missing thumbnail a
   * placeholder tile, not a failed recording.
   *
   * Called before `finish()` so the object exists by the time the share link is
   * handed over — a link that unfurls without a thumbnail on first paste looks
   * broken, and chat clients cache that first result.
   */
  async uploadThumbnail(poster: Blob): Promise<boolean> {
    if (this.aborted || this.fatal) return false;

    try {
      const response = await fetch(this.session.thumbnailEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: poster,
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /** Cancels the take. Best-effort — the §6.2 purge job is the real backstop. */
  async abort(): Promise<void> {
    if (this.aborted) return;
    this.aborted = true;
    this.pending = new Blob([]);
    this.deferred.length = 0;

    try {
      await fetch(this.session.abortEndpoint, { method: "POST", keepalive: true });
    } catch {
      // A cancelled recording must not surface a network error to the user.
    }
  }

  private enqueue(body: Blob, attempts: number): void {
    const part: QueuedPart = { partNumber: this.nextPartNumber++, body };
    // Serial by design: parts go out in capture order, and one part in flight is
    // what keeps memory bounded while the encoder keeps producing.
    this.chain = this.chain.then(() => this.attempt(part, attempts));
  }

  private async attempt(part: QueuedPart, attempts: number): Promise<void> {
    if (this.aborted || this.fatal) return;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const url = `${this.session.partEndpoint}?partNumber=${part.partNumber}`;
        const response = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: part.body,
        });

        if (response.ok) {
          const { etag } = (await response.json()) as { etag: string };
          this.completed.set(part.partNumber, etag);
          this.uploadedBytes += part.body.size;
          this.report();
          return;
        }

        // 4xx other than 429 is a decision, not a hiccup — retrying cannot help.
        if (response.status < 500 && response.status !== 429) {
          this.fatal = errorFrom(response, await readJson(response));
          this.report();
          return;
        }
      } catch {
        // Network failure — fall through to the backoff below.
      }

      if (this.aborted || this.fatal) return;
      if (attempt < attempts) {
        await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
      }
    }

    // Out of retries. Hold the bytes and try again after stop rather than killing
    // a recording that is still going (§10.5).
    this.deferred.push(part);
    this.report();
  }

  private report(): void {
    this.onProgress?.(this.progress);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorFrom(response: Response, body: unknown): UploadError {
  const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
  return new UploadError(
    error?.code ?? `http_${response.status}`,
    error?.message ?? "The upload failed. Try recording again.",
  );
}
