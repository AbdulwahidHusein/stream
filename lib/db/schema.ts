/**
 * D1 schema — TECHNICAL_SPEC.md §8.
 * Wire Drizzle client + migrations when Cloudflare bindings are created.
 */

import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  /**
   * Google's `sub` claim — stable for the life of the account, unlike `email`,
   * which a user can change in their Google account. Nullable so a row created
   * by any future non-Google path (§7.1 magic links) is still representable.
   */
  googleId: text("google_id").unique(),
  imageUrl: text("image_url"),
  plan: text("plan").notNull().default("free"),
  planExpiresAt: integer("plan_expires_at"),
  storageBytes: integer("storage_bytes").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  /**
   * SHA-256 of the opaque token in the `stream_session` cookie, never the token
   * itself: a leaked database dump then contains no usable credential. Lookup is
   * still a primary-key hit because the hash is deterministic.
   */
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const recordings = sqliteTable(
  "recordings",
  {
    id: text("id").primaryKey(),
    publicId: text("public_id").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull().default("Untitled recording"),
    status: text("status").notNull().default("pending_upload"),
    mode: text("mode").notNull(),
    durationMs: integer("duration_ms"),
    sizeBytes: integer("size_bytes"),
    mimeType: text("mime_type"),
    r2Key: text("r2_key").notNull(),
    r2UploadId: text("r2_upload_id"),
    thumbnailR2Key: text("thumbnail_r2_key"),
    hasWatermark: integer("has_watermark").notNull().default(1),
    expiresAt: integer("expires_at"),
    viewCount: integer("view_count").notNull().default(0),
    deletedAt: integer("deleted_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    // Monthly quota count (§6) — read on every create, so it must not scan.
    index("recordings_user_status_created_idx").on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    // Free-pool total (§6.1) and the purge-expired job (§6.2) share this one.
    index("recordings_status_expires_idx").on(table.status, table.expiresAt),
  ],
);

export const views = sqliteTable(
  "views",
  {
    id: text("id").primaryKey(),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id),
    viewerKey: text("viewer_key").notNull(),
    /** UTC midnight of the view day — the dedupe bucket from §8.4. */
    dayBucket: integer("day_bucket").notNull(),
    watchedAt: integer("watched_at").notNull(),
    completed: integer("completed").notNull().default(0),
  },
  (table) => [
    // Makes the §8.4 "one view per viewer per day" rule the database's job rather
    // than a read-then-write race between two concurrent viewers.
    uniqueIndex("views_recording_viewer_day_idx").on(
      table.recordingId,
      table.viewerKey,
      table.dayBucket,
    ),
  ],
);

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  provider: text("provider").notNull(),
  providerRef: text("provider_ref"),
  amountEtb: integer("amount_etb").notNull(),
  status: text("status").notNull().default("pending"),
  periodStart: integer("period_start"),
  periodEnd: integer("period_end"),
  rawPayload: text("raw_payload"),
  createdAt: integer("created_at").notNull(),
});

export const magicLinks = sqliteTable("magic_links", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  consumedAt: integer("consumed_at"),
});
