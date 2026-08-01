/**
 * D1 schema — TECHNICAL_SPEC.md §8.
 * Wire Drizzle client + migrations when Cloudflare bindings are created.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  plan: text("plan").notNull().default("free"),
  planExpiresAt: integer("plan_expires_at"),
  storageBytes: integer("storage_bytes").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const recordings = sqliteTable("recordings", {
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
});

export const views = sqliteTable("views", {
  id: text("id").primaryKey(),
  recordingId: text("recording_id")
    .notNull()
    .references(() => recordings.id),
  viewerKey: text("viewer_key").notNull(),
  watchedAt: integer("watched_at").notNull(),
  completed: integer("completed").notNull().default(0),
});

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
