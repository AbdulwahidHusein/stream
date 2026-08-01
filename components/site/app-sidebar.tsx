"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import type { PlanId } from "@/lib/plans";

export type AppUser = {
  email: string;
  name: string | null;
  imageUrl: string | null;
  plan: PlanId;
};

function LibraryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M4 4.5h12v11H4v-11Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7 8h6M7 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function RecordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="3" fill="currentColor" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M5 5l10 10M15 5L5 15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function initials(name: string | null, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || email[0]!.toUpperCase();
  }
  return email[0]!.toUpperCase();
}

type AppSidebarProps = {
  user: AppUser;
  creditsLabel: string;
  outOfCredits?: boolean;
  mobileOpen: boolean;
  onClose: () => void;
};

export function AppSidebar({
  user,
  creditsLabel,
  outOfCredits = false,
  mobileOpen,
  onClose,
}: AppSidebarProps) {
  const pathname = usePathname();
  const onRecord = pathname.startsWith("/record");
  const onLibrary = pathname.startsWith("/library");

  return (
    <>
      {/* Mobile backdrop */}
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-[var(--ink)]/35 transition-opacity lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[var(--sidebar-width)] flex-col border-r border-[var(--line)] bg-[var(--panel)] transition-transform duration-200 ease-out lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-5">
          <Link
            href="/"
            onClick={onClose}
            className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight"
          >
            Stream
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--ink-muted)] hover:bg-[var(--panel-muted)] lg:hidden"
            aria-label="Close menu"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        <nav className="mt-4 flex flex-1 flex-col gap-1 px-3">
          <Link
            href="/record"
            onClick={onClose}
            className={`nav-item ${onRecord ? "nav-item-active" : ""}`}
          >
            <RecordIcon className="size-[18px] shrink-0" />
            Record
          </Link>
          <Link
            href="/library"
            onClick={onClose}
            className={`nav-item ${onLibrary ? "nav-item-active" : ""}`}
          >
            <LibraryIcon className="size-[18px] shrink-0" />
            Library
          </Link>
        </nav>

        <div className="mt-auto border-t border-[var(--line)] p-3">
          <div className="mb-3 px-1">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-[var(--ink-faint)]">
              {user.plan}
            </p>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[11px] font-medium tracking-wide ${
                outOfCredits
                  ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                  : "bg-[var(--panel-muted)] text-[var(--ink-muted)]"
              }`}
            >
              {creditsLabel}
            </span>
          </div>

          <div className="flex items-center gap-3 rounded-[var(--radius-sm)] px-1 py-1">
            {user.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Google profile URLs; next/image needs remote config
              <img
                src={user.imageUrl}
                alt=""
                width={36}
                height={36}
                className="size-9 shrink-0 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent)]">
                {initials(user.name, user.email)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {user.name?.trim() || user.email.split("@")[0]}
              </p>
              <p className="truncate text-xs text-[var(--ink-faint)]">{user.email}</p>
            </div>
          </div>

          <div className="mt-2 px-1">
            <SignOutButton />
          </div>
        </div>
      </aside>
    </>
  );
}
