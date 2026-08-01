import type { Config } from "drizzle-kit";

/**
 * Generates SQL into `drizzle/`, which is also `migrations_dir` in wrangler.jsonc —
 * so `drizzle-kit generate` output is applied directly by `wrangler d1 migrations apply`.
 */
export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  driver: "d1-http",
} satisfies Config;
