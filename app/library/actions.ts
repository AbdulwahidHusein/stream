"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { ApiError } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { recordings } from "@/lib/db/schema";
import { getBucket } from "@/lib/r2/bucket";
import {
  deleteRecordingObjects,
  ownedRecording,
  sanitizeTitle,
  tombstoneRecording,
} from "@/lib/recordings";

/**
 * Library mutations.
 *
 * Server Functions are reachable by direct POST, not just through the UI, so
 * every one of these re-resolves the session and goes through `ownedRecording`
 * rather than trusting the id it was handed (§14). Proxy does not cover this:
 * a Server Function is a POST to the page it was defined on, so a matcher that
 * skipped that path would skip the action too — `requireUser` is the real gate.
 */

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function renameRecording(
  id: string,
  rawTitle: string,
  options?: { revalidate?: boolean },
): Promise<ActionResult> {
  const title = sanitizeTitle(rawTitle);

  try {
    const db = await getDb();
    const user = await requireUser(db);
    const recording = await ownedRecording(db, id, user.id);

    await db
      .update(recordings)
      .set({ title, updatedAt: Date.now() })
      .where(eq(recordings.id, recording.id));
  } catch (err) {
    return failure(err, "rename");
  }

  // Skip on the post-record wrap-up screen — refreshing the page would wipe the
  // in-memory review state before the user copies their link.
  if (options?.revalidate !== false) refresh();
  return { ok: true };
}

export async function deleteRecording(id: string): Promise<ActionResult> {
  try {
    const db = await getDb();
    const user = await requireUser(db);
    const recording = await ownedRecording(db, id, user.id);
    const bucket = await getBucket();

    // Same order as the purge job: objects first, then the row. A tombstoned row
    // whose object survived is an orphan; the reverse is a link that 404s the
    // video while still listing in the library.
    await deleteRecordingObjects(bucket, recording);
    await tombstoneRecording(db, recording, Date.now());
  } catch (err) {
    return failure(err, "delete");
  }

  refresh();
  return { ok: true };
}

function failure(err: unknown, verb: string): ActionResult {
  if (err instanceof ApiError) return { ok: false, message: err.message };
  console.error(`[library] ${verb} failed`, err);
  return { ok: false, message: `Could not ${verb} that recording. Try again.` };
}
