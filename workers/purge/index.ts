import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/lib/db/schema";
import { runPurge } from "@/lib/purge";

/**
 * The §6.2 maintenance Worker.
 *
 * Deliberately a *separate* Worker from the app rather than a `scheduled`
 * handler bolted onto the OpenNext bundle. `.open-next/worker.js` is a generated
 * artifact whose exports (the Durable Object classes it re-exports) shift with
 * the OpenNext config, so wrapping it means a cron change can break the app
 * deploy. This shares only the D1 and R2 bindings, which are the actual contract.
 *
 * Cost of that choice: it is its own `wrangler deploy`. See README.
 */

interface PurgeEnv {
  DB: D1Database;
  VIDEOS: R2Bucket;
}

const handler = {
  async scheduled(_controller: ScheduledController, env: PurgeEnv): Promise<void> {
    const db = drizzle(env.DB, { schema });
    const report = await runPurge(db, env.VIDEOS);

    // Cron runs have no user watching, so the log line is the only signal that
    // the sweep happened at all — keep it structured and unconditional.
    console.log("[purge] swept", report);
  },
};

export default handler;
