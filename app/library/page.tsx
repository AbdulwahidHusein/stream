import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { LibraryBrowser } from "@/components/library/library-browser";
import {
  type LibraryItem,
  type LibraryView,
} from "@/components/library/recording-card";
import { AppShell } from "@/components/site/app-shell";
import { requirePageUser } from "@/lib/auth/current-user";
import { legacyStock } from "@/lib/auth/legacy-owner";
import { getCreditUsage } from "@/lib/credits";
import { getDb } from "@/lib/db/client";
import { recordings } from "@/lib/db/schema";
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatExpiry,
  formatViews,
} from "@/lib/format";
import { thumbPath } from "@/lib/recordings";
import { siteOrigin } from "@/lib/site";

export const metadata = {
  title: "Library",
};

/** Fits grid (3×4) and keeps list pages short on mobile. */
const PAGE_SIZE = 12;
const MAX_QUERY_LEN = 80;

interface LibraryRow {
  id: string;
  publicId: string;
  title: string;
  durationMs: number | null;
  sizeBytes: number | null;
  viewCount: number;
  expiresAt: number | null;
  createdAt: number;
  thumbnailR2Key: string | null;
}

function toLibraryItems(rows: LibraryRow[], origin: string): LibraryItem[] {
  const now = Date.now();

  return rows.map((row) => ({
    id: row.id,
    publicId: row.publicId,
    title: row.title,
    shareUrl: `${origin}/v/${row.publicId}`,
    thumbUrl: row.thumbnailR2Key ? thumbPath(row.publicId) : null,
    durationLabel: row.durationMs === null ? "—" : formatDuration(row.durationMs),
    sizeLabel: row.sizeBytes === null ? "—" : formatBytes(row.sizeBytes),
    viewsLabel: formatViews(row.viewCount),
    createdLabel: formatDate(row.createdAt),
    expiryLabel: formatExpiry(row.expiresAt, now),
    expired: row.expiresAt !== null && row.expiresAt <= now,
  }));
}

function escapeLike(value: string): string {
  return value.replace(/([\\%_])/g, "\\$1");
}

function parseQuery(raw: string | string[] | undefined): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, MAX_QUERY_LEN);
}

function parseView(raw: string | string[] | undefined): LibraryView {
  return raw === "grid" ? "grid" : "list";
}

function parsePage(raw: string | string[] | undefined, pageCount: number): number {
  const n = typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, Math.max(1, pageCount));
}

const DEVELOPMENT = process.env.NODE_ENV === "development";

interface LibraryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  await connection();

  const db = await getDb();
  const user = await requirePageUser(db, "/library");
  const origin = await siteOrigin();
  const credits = await getCreditUsage(db, user);

  const params = await searchParams;
  const claimed = typeof params.claimed === "string" ? Number(params.claimed) : 0;
  const orphaned = DEVELOPMENT ? await legacyStock(db) : { count: 0, bytes: 0 };
  const query = parseQuery(params.q);
  const view = parseView(params.view);

  const ownedReady = and(
    eq(recordings.userId, user.id),
    eq(recordings.status, "ready"),
    isNull(recordings.deletedAt),
  );

  const filters = query
    ? and(
        ownedReady,
        sql`${recordings.title} LIKE ${`%${escapeLike(query)}%`} ESCAPE '\\'`,
      )
    : ownedReady;

  const [totalRow] = await db
    .select({ value: count() })
    .from(recordings)
    .where(ownedReady);

  const totalCount = totalRow?.value ?? 0;

  const [matchedRow] = query
    ? await db.select({ value: count() }).from(recordings).where(filters)
    : [totalRow];

  const matchedCount = matchedRow?.value ?? 0;
  const pageCount = Math.max(1, Math.ceil(matchedCount / PAGE_SIZE));
  const page = parsePage(params.page, pageCount);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await db
    .select({
      id: recordings.id,
      publicId: recordings.publicId,
      title: recordings.title,
      durationMs: recordings.durationMs,
      sizeBytes: recordings.sizeBytes,
      viewCount: recordings.viewCount,
      expiresAt: recordings.expiresAt,
      createdAt: recordings.createdAt,
      thumbnailR2Key: recordings.thumbnailR2Key,
    })
    .from(recordings)
    .where(filters)
    .orderBy(desc(recordings.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  const items = toLibraryItems(rows, origin);
  const emptyLibrary = totalCount === 0;

  return (
    <AppShell
      user={{
        email: user.email,
        name: user.name,
        imageUrl: user.imageUrl,
        plan: user.plan,
      }}
      creditsLabel={credits.summaryLabel}
      outOfCredits={credits.outOfCredits}
    >
      <div className="flex flex-col gap-6 sm:gap-7">
        <header className="animate-rise flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="page-title">Library</h1>
            <p className="page-sub">
              {emptyLibrary
                ? "Your recordings will live here."
                : query
                  ? `${matchedCount} result${matchedCount === 1 ? "" : "s"} for “${query}”`
                  : totalCount === 1
                    ? "1 recording"
                    : `${totalCount} recordings`}
              {" · "}
              {credits.summaryLabel}
            </p>
          </div>
          {credits.outOfCredits ? (
            <span className="btn-secondary w-full cursor-not-allowed justify-center opacity-55 sm:w-auto sm:shrink-0">
              Out of credits
            </span>
          ) : (
            <Link
              href="/record"
              className="btn-primary w-full justify-center sm:w-auto sm:shrink-0"
            >
              <span
                aria-hidden
                className="inline-block size-2 rounded-full bg-[var(--record)]"
              />
              New recording
            </Link>
          )}
        </header>

        {claimed > 0 && (
          <p
            role="status"
            className="rounded-[var(--radius-sm)] border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-4 py-3 text-sm"
          >
            Moved {claimed === 1 ? "1 recording" : `${claimed} recordings`} into this account.
          </p>
        )}

        {orphaned.count > 0 && (
          <div className="app-panel flex flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <p className="text-[var(--ink-muted)]">
              <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--ink-faint)]">
                dev
              </span>
              {" · "}
              {orphaned.count === 1
                ? "1 recording was made"
                : `${orphaned.count} recordings (${formatBytes(orphaned.bytes)}) were made`}{" "}
              before sign-in and belong to no account.
            </p>
            <form action="/api/dev/claim-recordings" method="post">
              <button type="submit" className="btn-secondary !py-1.5 text-xs">
                Move to {user.email}
              </button>
            </form>
          </div>
        )}

        {emptyLibrary ? (
          <div className="app-panel animate-rise-delay flex flex-col items-start gap-4 px-5 py-10 sm:px-6">
            <p className="max-w-md text-[var(--ink-muted)]">
              Nothing here yet. Record a walkthrough or bug report and the share link will show up
              in this list.
            </p>
            {credits.outOfCredits ? (
              <p className="text-sm text-[var(--danger)]">{credits.detailLabel}</p>
            ) : (
              <Link href="/record" className="btn-primary">
                <span
                  aria-hidden
                  className="inline-block size-2 rounded-full bg-[var(--record)]"
                />
                New recording
              </Link>
            )}
          </div>
        ) : (
          <LibraryBrowser
            items={items}
            initialQuery={query}
            initialView={view}
            page={page}
            pageCount={pageCount}
            matchedCount={matchedCount}
            pageSize={PAGE_SIZE}
          />
        )}
      </div>
    </AppShell>
  );
}
