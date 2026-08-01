import Link from "next/link";
import { MarketingHeader } from "@/components/site/marketing-header";
import { safeInternalPath } from "@/lib/site";

export const metadata = {
  title: "Sign in",
};

/**
 * Coarse error codes from the auth routes — what to do next, not internals.
 */
const ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled. Nothing has changed.",
  unverified:
    "That Google account has no verified email. Verify it with Google, then try again.",
  config: "Sign-in isn’t configured on this deployment yet. Check back shortly.",
  state: "That sign-in link expired. Start again from this page.",
  network:
    "We couldn’t reach Google to finish signing you in. Check your connection and try again.",
  exchange:
    "That sign-in link already expired. Start again below — don’t reload the page Google sent you back to.",
  identity: "Google’s reply didn’t include a usable account. Try signing in again.",
  google: "Google reported a problem with that sign-in. Try again.",
};

const FALLBACK_ERROR = "Google sign-in did not complete. Please try again.";

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  const rawNext = typeof params.next === "string" ? params.next : null;
  const next = safeInternalPath(rawNext);

  const rawError = typeof params.error === "string" ? params.error : null;
  const error = rawError ? (ERRORS[rawError] ?? FALLBACK_ERROR) : null;

  const signInHref = next
    ? `/api/auth/google?next=${encodeURIComponent(next)}`
    : "/api/auth/google";

  return (
    <main className="flex min-h-full flex-1 flex-col bg-[var(--bg)]">
      <MarketingHeader />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-16">
        <div className="app-panel animate-rise px-6 py-8 sm:px-8">
          <h1 className="page-title">Sign in</h1>
          <p className="page-sub">
            Recording and your library need an account. Watching a shared link never does.
          </p>

          {error && (
            <p
              role="alert"
              className="mt-6 rounded-[var(--radius-sm)] border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-3.5 py-3 text-sm leading-relaxed text-[var(--ink)]"
            >
              {error}
            </p>
          )}

          <a
            href={signInHref}
            className="btn-secondary mt-8 w-full !py-3 text-base"
          >
            <GoogleMark />
            Continue with Google
          </a>

          <p className="mt-5 text-xs leading-relaxed text-[var(--ink-faint)]">
            We only read your name, email, and profile picture — enough to own your recordings.
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="btn-ghost">
            ← Back home
          </Link>
        </div>
      </div>
    </main>
  );
}

/** Google's mark — official colours required by their branding terms. */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="size-[18px]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
