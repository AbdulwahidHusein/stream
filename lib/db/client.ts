import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * D1 handle for the current request.
 *
 * Async because `next dev` reaches the binding through the miniflare proxy that
 * `initOpenNextCloudflareForDev()` starts; in the deployed Worker it resolves
 * immediately.
 */
export async function getDb(): Promise<Db> {
  const { env } = await getCloudflareContext({ async: true });
  return drizzle(env.DB, { schema });
}
