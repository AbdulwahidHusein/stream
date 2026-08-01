import Link from "next/link";

type MarketingHeaderProps = {
  signedIn?: boolean;
};

/**
 * Compact top bar for public / marketing surfaces — no product sidebar.
 */
export function MarketingHeader({ signedIn = false }: MarketingHeaderProps) {
  return (
    <header className="relative z-20 flex items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--panel)]/85 px-5 py-3.5 backdrop-blur-md md:px-8">
      <Link
        href="/"
        className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight transition-opacity hover:opacity-80 md:text-xl"
      >
        Stream
      </Link>

      <nav className="flex items-center gap-2 sm:gap-3">
        {signedIn ? (
          <>
            <Link href="/library" className="btn-ghost hidden sm:inline">
              Library
            </Link>
            <Link href="/record" className="btn-primary !px-3.5 !py-2 text-sm">
              Open app
            </Link>
          </>
        ) : (
          <>
            <Link href="/login" className="btn-ghost">
              Sign in
            </Link>
            <Link
              href="/login?next=/record"
              className="btn-primary !px-3.5 !py-2 text-sm"
            >
              Start recording
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
