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
    <main className="relative flex min-h-full flex-1 flex-col bg-[var(--bg)]">
      <MarketingHeader signedIn={signedIn} />

      <section className="relative grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="relative z-10 flex flex-col justify-center px-6 py-14 md:px-10 lg:py-20 xl:pl-16">
          <p className="animate-fade font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
            stream.et
          </p>
          <h1 className="animate-rise mt-3 font-[family-name:var(--font-display)] text-5xl font-extrabold leading-[0.95] tracking-tight text-[var(--ink)] md:text-6xl lg:text-7xl">
            Stream
          </h1>
          <p className="animate-rise-delay mt-5 max-w-md text-base leading-relaxed text-[var(--ink-muted)] md:text-lg">
            Async screen recording for Ethiopian freelancers and teams. Instant shareable
            links. Billed in ETB.
          </p>
          <div className="animate-rise-delay-2 mt-8 flex flex-wrap items-center gap-4">
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
              {signedIn ? "Open your library" : "Sign in to your library"}
            </Link>
          </div>
        </div>

        <div className="relative min-h-[360px] border-t border-[var(--line)] lg:min-h-0 lg:border-l lg:border-t-0">
          <ProductMock />
        </div>
      </section>

      <footer className="relative z-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--line)] bg-[var(--panel)] px-6 py-4 text-xs text-[var(--ink-faint)] md:px-10">
        <span className="font-mono">stream.et</span>
        <span aria-hidden>·</span>
        <span>Built for Ethiopia</span>
        <span aria-hidden className="hidden sm:inline">
          ·
        </span>
        <span className="hidden sm:inline">No app install to watch a link</span>
      </footer>
    </main>
  );
}
