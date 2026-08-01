/**
 * Sign out.
 *
 * A plain HTML form, not a client component with an onClick: it is a mutation,
 * so it must be a POST (§14), and this way it works before hydration and with
 * JavaScript off — on a bad Addis connection that is the difference between
 * "signed out" and "the button does nothing".
 */
export function SignOutButton() {
  return (
    <form action="/api/auth/logout" method="post">
      <button
        type="submit"
        className="w-full rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs text-[var(--ink-muted)] transition-colors hover:bg-[var(--panel-muted)] hover:text-[var(--ink)]"
      >
        Sign out
      </button>
    </form>
  );
}
