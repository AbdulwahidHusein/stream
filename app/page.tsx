import Link from "next/link";
import { MarketingHeader } from "@/components/site/marketing-header";
import { ProductMock } from "@/components/site/product-mock";
import { currentUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";

export default async function HomePage() {
  let signedIn = false;
  try {
    const user = await currentUser(await getDb());
    signedIn = Boolean(user);
  } catch {
    signedIn = false;
  }

  return (
    <main className="relative flex min-h-full flex-1 flex-col overflow-hidden bg-[var(--bg)]">
      <MarketingHeader signedIn={signedIn} />

      <section className="relative grid flex-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)]">
        <div className="relative z-10 flex flex-col justify-center px-6 py-16 md:px-10 lg:py-24 xl:pl-16">
          <p className="animate-fade font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-faint)]">
            stream.et
          </p>

          <h1 className="animate-rise mt-4 font-[family-name:var(--font-display)] text-6xl font-extrabold leading-[0.9] tracking-tight text-[var(--ink)] md:text-7xl lg:text-8xl">
            Stream
          </h1>

          <p className="animate-rise-delay mt-6 max-w-[22rem] text-base leading-relaxed text-[var(--ink-muted)] md:max-w-md md:text-lg">
            Record your screen in the browser. Share a link instantly — no install to
            watch.
          </p>

          <div className="animate-rise-delay-2 mt-10 flex flex-wrap items-center gap-4">
            <Link
              href={signedIn ? "/record" : "/login?next=/record"}
              className="btn-primary"
            >
              <span
                aria-hidden
                className="animate-record-pulse inline-block size-2 rounded-full bg-[var(--record)]"
              />
              Start recording
            </Link>
            <Link href={signedIn ? "/library" : "/login"} className="btn-ghost">
              {signedIn ? "Open library" : "Sign in"}
            </Link>
          </div>
        </div>

        <div className="relative min-h-[380px] border-t border-[var(--line)] lg:min-h-0 lg:border-l lg:border-t-0">
          <ProductMock />
        </div>
      </section>

      <footer className="relative z-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--line)] bg-[var(--panel)]/80 px-6 py-4 text-xs text-[var(--ink-faint)] backdrop-blur-sm md:px-10">
        <span className="font-mono">stream.et</span>
        <span aria-hidden>·</span>
        <span>Browser recording</span>
        <span aria-hidden className="hidden sm:inline">
          ·
        </span>
        <span className="hidden sm:inline">Instant shareable links</span>
      </footer>
    </main>
  );
}
