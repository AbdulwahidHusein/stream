/**
 * Opaque database-backed sessions (§7.2).
 *
 * Opaque rather than a signed JWT because the session is what a takedown or a
 * stolen-laptop report has to be able to revoke: deleting one row ends access on
 * the next request, whereas a self-contained token stays valid until it expires
 * no matter what we do.
 */

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import type { PlanId } from "@/lib/plans";
import { SESSION_COOKIE, SESSION_TTL_MS } from "./cookies";
import { randomToken, sha256Base64Url } from "./tokens";

/**
 * How much of the TTL has to be gone before a read extends it.
 *
 * The alternative — writing on every request — turns each page view into a D1
 * write for no user-visible gain. At a day's granularity an active user's
 * session never lapses and an idle one still expires ~30 days after last use.
 */
const SLIDE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  plan: PlanId;
  storageBytes: number;
}

async function sessionId(token: string): Promise<string> {
  return sha256Base64Url(token);
}

/**
 * Issues a session row and returns the raw token for the caller to put in a
 * cookie. The cookie is set on the response by the route handler rather than
 * here, because a redirect response and `cookies().set()` are two different
 * places for a `Set-Cookie` to come from and only one of them is obvious.
 */
export async function startSession(db: Db, userId: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();

  await db.insert(sessions).values({
    id: await sessionId(token),
    userId,
    expiresAt: now + SESSION_TTL_MS,
    createdAt: now,
  });

  return token;
}

/**
 * Resolves the signed-in user, or null.
 *
 * The join means one D1 round trip for "who is this and what may they do",
 * which is the question every protected route asks first.
 */
export async function readSessionUser(db: Db): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const id = await sessionId(token);

  const rows = await db
    .select({
      expiresAt: sessions.expiresAt,
      id: users.id,
      email: users.email,
      name: users.name,
      imageUrl: users.imageUrl,
      plan: users.plan,
      storageBytes: users.storageBytes,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const now = Date.now();
  if (row.expiresAt <= now) {
    // Collect it here rather than in a cron: expiry is only ever discovered on a
    // read, and one delete costs less than a table scan later.
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  if (row.expiresAt - now < SESSION_TTL_MS - SLIDE_AFTER_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: now + SESSION_TTL_MS })
      .where(eq(sessions.id, id));
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    imageUrl: row.imageUrl,
    // Anything the database does not recognise is treated as the least
    // privileged plan, so a bad write can never hand out paid limits.
    plan: row.plan === "individual" ? "individual" : "free",
    storageBytes: row.storageBytes,
  };
}

/** Revokes the current session server-side. Clearing the cookie is the caller's job. */
export async function endSession(db: Db): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return;

  await db.delete(sessions).where(eq(sessions.id, await sessionId(token)));
}
