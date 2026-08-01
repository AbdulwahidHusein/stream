import Link from "next/link";

export const metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Link
        href="/"
        className="mb-10 font-[family-name:var(--font-display)] text-xl font-bold tracking-tight"
      >
        Stream
      </Link>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
        Sign in
      </h1>
      <p className="mt-3 text-[var(--ink-muted)]">
        Magic-link auth lands here in Phase 1. For now this is a route placeholder.
      </p>
      <div className="mt-8 border-t border-[var(--line)] pt-8 text-sm text-[var(--ink-muted)]">
        <Link href="/" className="hover:text-[var(--ink)] hover:underline">
          ← Back home
        </Link>
      </div>
    </main>
  );
}
