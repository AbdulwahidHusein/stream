import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <p className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight md:text-2xl">
          Stream
        </p>
        <nav className="flex items-center gap-6 text-sm text-[var(--ink-muted)]">
          <Link href="/login" className="transition-colors hover:text-[var(--ink)]">
            Sign in
          </Link>
          <Link
            href="/record"
            className="rounded-[var(--radius)] bg-[var(--ink)] px-4 py-2 text-[var(--bg-elevated)] transition-colors hover:bg-[var(--accent)]"
          >
            Record
          </Link>
        </nav>
      </header>

      <section className="relative z-10 flex flex-1 flex-col justify-center px-6 pb-24 pt-10 md:px-10 md:pb-32">
        <div className="max-w-3xl">
          <h1 className="font-[family-name:var(--font-display)] text-5xl font-extrabold leading-[0.95] tracking-tight text-[var(--ink)] md:text-7xl">
            Stream
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--ink-muted)] md:text-xl">
            Async screen recording for Ethiopian freelancers and teams. Instant
            shareable links. Billed in ETB.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/record"
              className="inline-flex items-center gap-3 rounded-[var(--radius)] bg-[var(--accent)] px-6 py-3.5 text-base font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
            >
              <span
                aria-hidden
                className="animate-record-pulse inline-block size-2.5 rounded-full bg-[var(--record)]"
              />
              Start recording
            </Link>
            <Link
              href="/login"
              className="text-sm text-[var(--ink-muted)] underline-offset-4 transition-colors hover:text-[var(--ink)] hover:underline"
            >
              Or sign in to your library
            </Link>
          </div>
        </div>
      </section>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-full max-w-2xl opacity-40 md:opacity-70"
        style={{
          background:
            "linear-gradient(135deg, transparent 20%, rgba(15,110,106,0.12) 45%, rgba(11,18,32,0.18) 100%)",
          maskImage:
            "radial-gradient(ellipse 80% 70% at 70% 40%, black 20%, transparent 75%)",
        }}
      />

      <footer className="relative z-10 px-6 py-5 text-xs text-[var(--ink-muted)] md:px-10">
        <span className="font-mono">stream.et</span>
        <span className="mx-2">·</span>
        Built for Ethiopia
      </footer>
    </main>
  );
}
