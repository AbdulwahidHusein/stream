"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The share link is the product's payload — the one string the user came here to
 * get. It is selectable text first and a copy button second, so it still works
 * when the clipboard API is blocked (insecure origin, Firefox permissions).
 */
export function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      inputRef.current?.select();
      setCopied(false);
    }
  }, [url]);

  return (
    <div className="app-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <label className="sr-only" htmlFor="share-url">
        Share link
      </label>
      <input
        ref={inputRef}
        id="share-url"
        type="text"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel-muted)] px-3 py-2.5 font-mono text-sm text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none"
      />
      <button type="button" onClick={copy} className="btn-primary shrink-0 !py-2.5 text-sm">
        {copied ? "Copied" : "Copy link"}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Link copied to clipboard" : ""}
      </span>
    </div>
  );
}
