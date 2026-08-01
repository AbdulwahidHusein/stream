import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { RecordingCard, type LibraryItem } from "@/components/library/recording-card";
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
import { siteOrigin } from "@/lib/site";

export const metadata = {
  title: "Library",
};

const PAGE_SIZE = 100;

interface LibraryRow {
  id: string;
  publicId: string;
  title: string;
  durationMs: number | null;
  sizeBytes: number | null;
  viewCount: number;
  expiresAt: number | null;
  createdAt: number;
}

function toLibraryItems(rows: LibraryRow[], origin: string): LibraryItem[] {
  const now = Date.now();

  return rows.map((row) => ({
    id: row.id,
    publicId: row.publicId,
    title: row.title,
    shareUrl: `${origin}/v/${row.publicId}`,
    durationLabel: row.durationMs === null ? "—" : formatDuration(row.durationMs),
    sizeLabel: row.sizeBytes === null ? "—" : formatBytes(row.sizeBytes),
    viewsLabel: formatViews(row.viewCount),
    createdLabel: formatDate(row.createdAt),
    expiryLabel: formatExpiry(row.expiresAt, now),
    expired: row.expiresAt !== null && row.expiresAt <= now,
  }));
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
    })
    .from(recordings)
    .where(
      and(
        eq(recordings.userId, user.id),
        eq(recordings.status, "ready"),
        isNull(recordings.deletedAt),
      ),
    )
    .orderBy(desc(recordings.createdAt))
    .limit(PAGE_SIZE);

  const items = toLibraryItems(rows, origin);

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
      <div className="flex flex-col gap-7">
        <header className="animate-rise flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title">Library</h1>
            <p className="page-sub">
              {items.length === 0
                ? "Your recordings will live here."
                : items.length === 1
                  ? "1 recording"
                  : `${items.length} recordings`}
              {" · "}
              {credits.summaryLabel}
            </p>
          </div>
          {credits.outOfCredits ? (
            <span className="btn-secondary shrink-0 cursor-not-allowed opacity-55">
              Out of credits
            </span>
          ) : (
            <Link href="/record" className="btn-primary shrink-0">
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
          <div className="app-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
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

        {items.length === 0 ? (
          <div className="app-panel animate-rise-delay flex flex-col items-start gap-4 px-6 py-10">
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
          <ul className="app-panel animate-rise-delay overflow-hidden">
            {items.map((item) => (
              <RecordingCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
