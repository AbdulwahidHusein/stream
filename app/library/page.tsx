import Link from "next/link";

export const metadata = {
  title: "Library",
};

export default function LibraryPage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-4xl flex-1 flex-col px-6 py-10 md:px-10">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight"
        >
          Stream
        </Link>
        <Link href="/record" className="text-sm text-[var(--accent)] hover:underline">
          New recording
        </Link>
      </header>
      <h1 className="mt-16 font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight">
        Library
      </h1>
      <p className="mt-4 text-[var(--ink-muted)]">
        Your recordings will list here after auth and upload land.
      </p>
    </main>
  );
}
