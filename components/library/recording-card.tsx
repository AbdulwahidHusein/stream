"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteRecording, renameRecording } from "@/app/library/actions";

/**
 * One row of the library.
 *
 * Every display string arrives pre-formatted from the server. Dates in
 * particular must not be computed here: the same markup is rendered in the
 * Worker and hydrated in the browser, and a clock difference between the two
 * would be a hydration mismatch.
 */
export interface LibraryItem {
  id: string;
  publicId: string;
  title: string;
  shareUrl: string;
  durationLabel: string;
  sizeLabel: string;
  viewsLabel: string;
  createdLabel: string;
  /** Free-tier only — paid recordings never expire (§6). */
  expiryLabel: string | null;
  expired: boolean;
}

export function RecordingCard({ item }: { item: LibraryItem }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const copyTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    };
  }, []);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  function submitRename(formData: FormData) {
    const title = String(formData.get("title") ?? "");
    setError(null);

    startTransition(async () => {
      const result = await renameRecording(item.id, title);
      if (result.ok) setRenaming(false);
      else setError(result.message);
    });
  }

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteRecording(item.id);
      if (!result.ok) {
        setError(result.message);
        setConfirmingDelete(false);
      }
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(item.shareUrl);
      setCopied(true);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Open the link and copy it from the address bar.");
    }
  }

  return (
    <li className="flex flex-col gap-2.5 border-b border-[var(--line)] px-5 py-4 last:border-b-0 hover:bg-[var(--panel-muted)]/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {renaming ? (
          <form action={submitRename} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              name="title"
              defaultValue={item.title}
              maxLength={120}
              disabled={pending}
              aria-label="Recording title"
              className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none"
            />
            <button type="submit" disabled={pending} className="btn-primary !px-3 !py-1.5 text-xs">
              {pending ? "Saving" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(false);
                setError(null);
              }}
              disabled={pending}
              className="btn-ghost text-xs"
            >
              Cancel
            </button>
          </form>
        ) : (
          <Link
            href={`/v/${item.publicId}`}
            className="min-w-0 flex-1 truncate text-[0.975rem] font-medium tracking-tight transition-colors hover:text-[var(--accent)]"
          >
            {item.title}
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-xs text-[var(--ink-faint)]">
        <span>{item.durationLabel}</span>
        <span aria-hidden>·</span>
        <span>{item.viewsLabel}</span>
        <span aria-hidden>·</span>
        <span>{item.sizeLabel}</span>
        <span aria-hidden>·</span>
        <span>{item.createdLabel}</span>
        {item.expiryLabel !== null && (
          <>
            <span aria-hidden>·</span>
            <span className={item.expired ? "text-[var(--danger)]" : undefined}>
              {item.expiryLabel}
            </span>
          </>
        )}
      </div>

      {!renaming && (
        <div className="flex flex-wrap items-center gap-3.5 text-sm">
          <button
            type="button"
            onClick={copyLink}
            disabled={pending}
            className="font-medium text-[var(--accent)] hover:underline disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={() => setRenaming(true)}
            disabled={pending}
            className="text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-50"
          >
            Rename
          </button>
          {confirmingDelete ? (
            <span className="flex items-center gap-3">
              <span className="text-[var(--ink-muted)]">Delete for good?</span>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={pending}
                className="text-[var(--danger)] hover:underline disabled:opacity-50"
              >
                {pending ? "Deleting" : "Yes, delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={pending}
                className="text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-50"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={pending}
              className="text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {copied ? "Link copied to clipboard" : ""}
      </p>

      {error !== null && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </li>
  );
}
