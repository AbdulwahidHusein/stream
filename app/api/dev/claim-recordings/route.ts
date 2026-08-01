import { NextResponse, type NextRequest } from "next/server";
import { handle } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/current-user";
import { claimLegacyRecordings } from "@/lib/auth/legacy-owner";
import { getDb } from "@/lib/db/client";

/**
 * POST /api/dev/claim-recordings — adopt the pre-auth stand-in owner's takes.
 *
 * Development only, and enforced here rather than by convention: an endpoint
 * that moves recordings between accounts is exactly the shape of thing that
 * must not exist in production, however well-intentioned. Outside `next dev` it
 * 404s — the same response as a route that was never deployed, so its existence
 * is not something a probe can confirm.
 *
 * The deployed database has no stand-in rows to adopt anyway (ownership came
 * from Google there from the first request), so nothing is lost by the guard.
 */

const DEVELOPMENT = process.env.NODE_ENV === "development";

export async function POST(request: NextRequest): Promise<Response> {
  if (!DEVELOPMENT) return new Response(null, { status: 404 });

  return handle(async () => {
    const db = await getDb();
    // Still requires a session: the destination is "whoever is signed in", so an
    // unauthenticated caller has no destination and nothing to authorize.
    const user = await requireUser(db);
    const claimed = await claimLegacyRecordings(db, user.id);

    const destination = new URL("/library", request.nextUrl);
    if (claimed.count > 0) destination.searchParams.set("claimed", String(claimed.count));

    return NextResponse.redirect(destination, 303);
  });
}
