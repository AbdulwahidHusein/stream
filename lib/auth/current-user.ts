import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/respond";
import type { Db } from "@/lib/db/client";
import { readSessionUser, type SessionUser } from "./session";

/**
 * The one place the rest of the app asks "who is this?".
 *
 * Three entry points instead of one because the answer to "and what if nobody is
 * signed in?" differs by caller, and getting it wrong is either a JSON error
 * rendered as a page or an HTML redirect returned to `fetch()`:
 *
 * - `currentUser` — may legitimately be nobody (public pages, optional UI).
 * - `requireUser` — API routes and Server Functions; throws the §9 401 envelope.
 * - `requirePageUser` — Server Components; redirects to /login and comes back.
 *
 * Proxy already turns unauthenticated visitors away from /record and /library,
 * but that check is optimistic (cookie presence, no database) and a matcher
 * change would silently remove it. These are the checks that actually hold.
 */

export type CurrentUser = SessionUser;

export async function currentUser(db: Db): Promise<CurrentUser | null> {
  return readSessionUser(db);
}

export async function requireUser(db: Db): Promise<CurrentUser> {
  const user = await currentUser(db);
  if (!user) throw new ApiError("unauthorized", "Sign in to continue.");
  return user;
}

export async function requirePageUser(db: Db, returnTo: string): Promise<CurrentUser> {
  const user = await currentUser(db);
  // `next` survives the round trip so an expired session drops the user back
  // where they were rather than on a generic landing page.
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}
