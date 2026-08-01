"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteRecording, renameRecording } from "@/app/library/actions";

/**
 * One row / tile of the library.
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
  /** Public thumb URL when a poster was captured; null otherwise. */
  thumbUrl: string | null;
  durationLabel: string;
  sizeLabel: string;
  viewsLabel: string;
  createdLabel: string;
  /** Free-tier only — paid recordings never expire (§6). */
  expiryLabel: string | null;
  expired: boolean;
}

export type LibraryView = "list" | "grid";

function Thumb({
  href,
  title,
  thumbUrl,
  durationLabel,
  className,
}: {
  href: string;
  title: string;
  thumbUrl: string | null;
  durationLabel: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(thumbUrl) && !failed;

  return (
    <Link
      href={href}
      className={`relative block aspect-video overflow-hidden rounded-[var(--radius-sm)] bg-[#121820] ${className ?? ""}`}
      aria-label={`Open ${title}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- dynamic /api thumb URLs
        <img
          src={thumbUrl!}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white/80"
          >
            <svg viewBox="0 0 20 20" className="size-3.5 translate-x-px" fill="currentColor">
              <path d="M6.5 4.5v11l9-5.5-9-5.5Z" />
            </svg>
          </span>
        </span>
      )}
      {durationLabel !== "—" && (
        <span className="absolute bottom-1.5 right-1.5 rounded-[3px] bg-black/70 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white">
          {durationLabel}
        </span>
      )}
    </Link>
  );
}

export function RecordingCard({
  item,
  view,
}: {
  item: LibraryItem;
  view: LibraryView;
}) {
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

  const meta = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--ink-faint)]">
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
  );

  const titleBlock = renaming ? (
    <form action={submitRename} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <input
        ref={inputRef}
        name="title"
        defaultValue={item.title}
        maxLength={120}
        disabled={pending}
        aria-label="Recording title"
        className="min-w-0 w-full flex-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none"
      />
      <div className="flex items-center gap-2">
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
      </div>
    </form>
  ) : (
    <Link
      href={`/v/${item.publicId}`}
      className="min-w-0 truncate text-[0.975rem] font-medium tracking-tight transition-colors hover:text-[var(--accent)]"
    >
      {item.title}
    </Link>
  );

  const actions = !renaming ? (
    <div className="flex flex-wrap items-center gap-3 text-sm">
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
        <span className="flex flex-wrap items-center gap-3">
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
  ) : null;

  if (view === "grid") {
    return (
      <li className="app-panel flex flex-col overflow-hidden">
        <Thumb
          href={`/v/${item.publicId}`}
          title={item.title}
          thumbUrl={item.thumbUrl}
          durationLabel={item.durationLabel}
          className="rounded-none rounded-t-[var(--radius)]"
        />
        <div className="flex flex-1 flex-col gap-2.5 p-3.5 sm:p-4">
          {titleBlock}
          {meta}
          {actions}
          <p aria-live="polite" className="sr-only">
            {copied ? "Link copied to clipboard" : ""}
          </p>
          {error !== null && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
        </div>
      </li>
    );
  }

  return (
    <li className="border-b border-[var(--line)] px-3 py-3.5 last:border-b-0 hover:bg-[var(--panel-muted)]/50 sm:px-5 sm:py-4">
      <div className="flex gap-3 sm:gap-4">
        <Thumb
          href={`/v/${item.publicId}`}
          title={item.title}
          thumbUrl={item.thumbUrl}
          durationLabel={item.durationLabel}
          className="w-[6.5rem] shrink-0 sm:w-36"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {titleBlock}
          {meta}
          {actions}
          <p aria-live="polite" className="sr-only">
            {copied ? "Link copied to clipboard" : ""}
          </p>
          {error !== null && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
