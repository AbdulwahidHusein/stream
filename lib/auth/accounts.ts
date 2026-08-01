/**
 * Turning a Google identity into a `users` row.
 *
 * Split out from the callback route because "which row is this person" is the
 * part with the interesting failure modes, and it should be readable without
 * the OAuth plumbing around it.
 */

import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import type { GoogleIdentity } from "./google";

export async function upsertGoogleUser(db: Db, identity: GoogleIdentity): Promise<string> {
  const now = Date.now();

  const byGoogleId = await db.query.users.findFirst({
    where: eq(users.googleId, identity.googleId),
  });

  if (byGoogleId) {
    // Google is authoritative for all three: a user who changes their name,
    // photo, or account email there expects to see it change here.
    await db
      .update(users)
      .set({
        email: identity.email,
        name: identity.name,
        imageUrl: identity.imageUrl,
        updatedAt: now,
      })
      .where(eq(users.id, byGoogleId.id));

    return byGoogleId.id;
  }

  // A row can already exist for this address without a `google_id` — seeded, or
  // created by a future magic-link sign-in. Claiming it is only safe because the
  // ID token asserted `email_verified`; without that check this branch would let
  // anyone who can name an address take over its recordings.
  const byEmail = await db.query.users.findFirst({
    where: eq(users.email, identity.email),
  });

  if (byEmail) {
    await db
      .update(users)
      .set({
        googleId: identity.googleId,
        name: byEmail.name ?? identity.name,
        imageUrl: byEmail.imageUrl ?? identity.imageUrl,
        updatedAt: now,
      })
      .where(eq(users.id, byEmail.id));

    return byEmail.id;
  }

  const id = newId();

  // Two tabs finishing sign-in at once would both land here. `email` is unique,
  // so the loser is a no-op rather than a 500, and the re-read below resolves
  // whichever row actually won.
  await db
    .insert(users)
    .values({
      id,
      email: identity.email,
      name: identity.name,
      googleId: identity.googleId,
      imageUrl: identity.imageUrl,
      plan: "free",
      storageBytes: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  const created = await db.query.users.findFirst({
    where: eq(users.email, identity.email),
  });

  if (!created) throw new Error("User row missing immediately after insert.");
  return created.id;
}
