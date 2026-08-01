import { NextResponse, type NextRequest } from "next/server";
import { clearedSessionCookie } from "@/lib/auth/cookies";
import { endSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";

/**
 * POST /api/auth/logout — §9.1.
 *
 * POST, so a prefetched or crawled link can never sign anyone out. The session
 * cookie is `SameSite=Lax`, which means a cross-site POST arrives without it and
 * a forged one logs out nobody — that is the whole CSRF story for this route.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    await endSession(await getDb());
  } catch (err) {
    // The cookie still gets cleared below: a user who clicked "sign out" must
    // end up signed out of this browser even if D1 was unreachable.
    console.error("[auth] session delete failed", err);
  }

  // 303, not the default 307: a preserved method would re-POST to the homepage.
  const response = NextResponse.redirect(new URL("/", request.nextUrl), 303);
  response.cookies.set(clearedSessionCookie());
  return response;
}
