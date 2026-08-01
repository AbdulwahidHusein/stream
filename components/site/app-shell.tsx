"use client";

import { useState } from "react";
import { AppSidebar, type AppUser } from "./app-sidebar";

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M3.5 6h13M3.5 10h13M3.5 14h13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

type AppShellProps = {
  user: AppUser;
  /** Credit / plan chip under the nav (e.g. "12 / 15 credits"). */
  creditsLabel: string;
  /** Emphasize the chip when the user cannot start another recording. */
  outOfCredits?: boolean;
  children: React.ReactNode;
};

/**
 * Signed-in product chrome: sticky left rail + main column.
 */
export function AppShell({
  user,
  creditsLabel,
  outOfCredits = false,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-full flex-1 bg-[var(--bg)]">
      <AppSidebar
        user={user}
        creditsLabel={creditsLabel}
        outOfCredits={outOfCredits}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="flex min-h-full min-w-0 flex-1 flex-col lg:pl-[var(--sidebar-width)]">
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)]/95 px-4 py-3 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-[var(--radius-sm)] p-2 text-[var(--ink)] hover:bg-[var(--panel-muted)]"
            aria-label="Open navigation"
          >
            <MenuIcon className="size-5" />
          </button>
          <span className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">
            Stream
          </span>
        </div>

        <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8 md:px-8 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
