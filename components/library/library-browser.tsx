"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  RecordingCard,
  type LibraryItem,
  type LibraryView,
} from "./recording-card";

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="8.5" cy="8.5" r="5.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12.5 12.5 16 16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M4 6h12M4 10h12M4 14h12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="3.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3.5" y="11" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export type LibraryHrefOpts = {
  query: string;
  view: LibraryView;
  page: number;
};

export function buildLibraryHref({ query, view, page }: LibraryHrefOpts): string {
  const params = new URLSearchParams();
  const q = query.trim();
  if (q) params.set("q", q);
  if (view === "grid") params.set("view", "grid");
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/library?${qs}` : "/library";
}

export function LibraryBrowser({
  items,
  initialQuery,
  initialView,
  page,
  pageCount,
  matchedCount,
  pageSize,
}: {
  items: LibraryItem[];
  initialQuery: string;
  initialView: LibraryView;
  page: number;
  pageCount: number;
  matchedCount: number;
  pageSize: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const [syncedQuery, setSyncedQuery] = useState(initialQuery);

  if (initialQuery !== syncedQuery) {
    setSyncedQuery(initialQuery);
    setQuery(initialQuery);
  }

  // Debounced server search — resets to page 1 when the query changes.
  useEffect(() => {
    if (query.trim() === initialQuery.trim()) return;

    const timer = window.setTimeout(() => {
      startTransition(() => {
        router.replace(
          buildLibraryHref({ query, view: initialView, page: 1 }),
          { scroll: false },
        );
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query, initialQuery, initialView, router]);

  function navigate(next: LibraryHrefOpts) {
    startTransition(() => {
      router.replace(buildLibraryHref(next), { scroll: false });
    });
  }

  function selectView(next: LibraryView) {
    if (next === initialView) return;
    navigate({ query, view: next, page });
  }

  function goToPage(next: number) {
    const clamped = Math.min(pageCount, Math.max(1, next));
    if (clamped === page) return;
    navigate({ query, view: initialView, page: clamped });
  }

  const from = matchedCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, matchedCount);

  return (
    <div className="animate-rise-delay flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search recordings</span>
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-faint)]" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title"
            autoComplete="off"
            className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] py-2.5 pl-10 pr-3.5 text-sm text-[var(--ink)] shadow-[var(--shadow-panel)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:outline-none"
          />
        </label>

        <div
          className="flex shrink-0 items-center self-end rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] p-0.5 sm:self-auto"
          role="group"
          aria-label="Library layout"
        >
          <button
            type="button"
            onClick={() => selectView("list")}
            aria-pressed={initialView === "list"}
            title="List view"
            className={`flex size-9 items-center justify-center rounded-[6px] transition-colors ${
              initialView === "list"
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            <ListIcon className="size-4" />
            <span className="sr-only">List view</span>
          </button>
          <button
            type="button"
            onClick={() => selectView("grid")}
            aria-pressed={initialView === "grid"}
            title="Grid view"
            className={`flex size-9 items-center justify-center rounded-[6px] transition-colors ${
              initialView === "grid"
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            <GridIcon className="size-4" />
            <span className="sr-only">Grid view</span>
          </button>
        </div>
      </div>

      {pending && (
        <p className="text-xs text-[var(--ink-faint)]" aria-live="polite">
          Updating…
        </p>
      )}

      {items.length === 0 ? (
        <div className="app-panel px-5 py-10 text-sm text-[var(--ink-muted)] sm:px-6">
          {initialQuery.trim()
            ? `No recordings match “${initialQuery.trim()}”.`
            : "Nothing here yet."}
        </div>
      ) : initialView === "grid" ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {items.map((item) => (
            <RecordingCard key={item.id} item={item} view="grid" />
          ))}
        </ul>
      ) : (
        <ul className="app-panel overflow-hidden">
          {items.map((item) => (
            <RecordingCard key={item.id} item={item} view="list" />
          ))}
        </ul>
      )}

      {matchedCount > 0 && (
        <nav
          className="flex flex-col gap-3 border-t border-[var(--line)] pt-4 sm:flex-row sm:items-center sm:justify-between"
          aria-label="Pagination"
        >
          <p className="text-xs text-[var(--ink-faint)] sm:text-sm">
            Showing {from}–{to} of {matchedCount}
          </p>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1 || pending}
              className="btn-secondary !px-3 !py-2 text-xs disabled:cursor-not-allowed disabled:opacity-45"
            >
              Previous
            </button>
            <span className="min-w-[5.5rem] text-center font-mono text-xs text-[var(--ink-muted)]">
              {page} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= pageCount || pending}
              className="btn-secondary !px-3 !py-2 text-xs disabled:cursor-not-allowed disabled:opacity-45"
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
