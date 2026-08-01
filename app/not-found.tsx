import Link from "next/link";
import { MarketingHeader } from "@/components/site/marketing-header";

export default function NotFound() {
  return (
    <main className="flex min-h-full flex-1 flex-col bg-[var(--bg)]">
      <MarketingHeader />

      <div className="animate-rise mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          404
        </p>
        <h1 className="page-title mt-3">Page not found</h1>
        <p className="page-sub">
          That URL doesn’t match anything on Stream. Head home or start a new recording.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link href="/" className="btn-primary">
            Back home
          </Link>
          <Link href="/record" className="btn-ghost">
            Record instead
          </Link>
        </div>
      </div>
    </main>
  );
}
