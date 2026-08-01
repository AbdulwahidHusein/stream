import Link from "next/link";
import { planLimits } from "@/lib/plans";

export const metadata = {
  title: "Record",
};

export default function RecordPage() {
  const free = planLimits("free");

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col px-6 py-10 md:px-10">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight"
        >
          Stream
        </Link>
        <p className="font-mono text-xs text-[var(--ink-muted)]">
          free · {free.maxDurationMs / 60_000}m · ~
          {Math.round(free.maxBytesPerRecording / (1024 * 1024))} MB max
        </p>
      </header>

      <section className="mt-16 flex flex-1 flex-col items-start">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight md:text-5xl">
          Record
        </h1>
        <p className="mt-4 max-w-lg text-[var(--ink-muted)]">
          Screen, camera, or both — progressive multipart upload to R2. Capture
          UI ships in Phase 1.
        </p>
        <button
          type="button"
          disabled
          className="mt-10 inline-flex items-center gap-3 rounded-[var(--radius)] bg-[var(--ink)] px-6 py-3.5 text-white opacity-50"
        >
          <span className="size-2.5 rounded-full bg-[var(--record)]" />
          Recorder coming next
        </button>
      </section>
    </main>
  );
}
