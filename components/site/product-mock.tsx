/**
 * Static product atmosphere for the marketing hero — reads as the real app shell
 * without interactive chrome or feature-card clutter.
 */
export function ProductMock() {
  return (
    <div
      aria-hidden
      className="relative h-full min-h-[420px] w-full overflow-hidden md:min-h-0"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_70%_40%,rgba(15,110,106,0.18),transparent_65%),linear-gradient(160deg,#e8eef2_0%,#dfe6ec_45%,#cfd8e2_100%)]" />

      <div className="absolute inset-y-[8%] right-[-8%] left-[18%] flex shadow-[var(--shadow-float)] sm:left-[28%] md:inset-y-[10%] md:left-[22%] lg:left-[18%]">
        {/* Sidebar rail */}
        <div className="flex w-[72px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--panel)] sm:w-[120px] md:w-[150px]">
          <div className="px-3 py-4 font-[family-name:var(--font-display)] text-sm font-bold tracking-tight sm:text-base">
            Stream
          </div>
          <div className="mx-2 mt-2 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] px-2.5 py-2">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[var(--record)]" />
              <span className="hidden text-xs font-medium text-[var(--accent)] sm:inline">
                Record
              </span>
            </div>
          </div>
          <div className="mx-2 mt-1 rounded-[var(--radius-sm)] px-2.5 py-2">
            <span className="hidden text-xs text-[var(--ink-faint)] sm:inline">Library</span>
            <span className="block size-2 rounded-sm bg-[var(--line-strong)] sm:hidden" />
          </div>
          <div className="mt-auto border-t border-[var(--line)] p-3">
            <div className="flex items-center gap-2">
              <span className="size-7 rounded-full bg-[var(--panel-muted)]" />
              <div className="hidden flex-1 sm:block">
                <div className="h-2 w-14 rounded-full bg-[var(--panel-muted)]" />
                <div className="mt-1.5 h-1.5 w-10 rounded-full bg-[var(--line)]" />
              </div>
            </div>
          </div>
        </div>

        {/* Main canvas */}
        <div className="flex min-w-0 flex-1 flex-col bg-[var(--bg)] p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-[var(--accent)] font-mono text-[9px] text-white">
              1
            </span>
            <span className="text-xs font-medium text-[var(--ink)]">Choose what to capture</span>
          </div>
          <div className="mb-3 h-5 w-36 rounded-md bg-[var(--ink)]/10" />
          <div className="mb-5 h-3 w-48 rounded-full bg-[var(--line)]" />

          <div className="grid flex-1 grid-cols-3 gap-2.5">
            {["Screen", "Camera", "Both"].map((label, i) => (
              <div
                key={label}
                className={`flex flex-col gap-2 rounded-[var(--radius)] border bg-[var(--panel)] p-3 shadow-[var(--shadow-panel)] ${
                  i === 0 ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]" : "border-[var(--line)]"
                }`}
              >
                <div
                  className={`size-8 rounded-[var(--radius-sm)] ${
                    i === 0 ? "bg-[var(--accent-soft)]" : "bg-[var(--panel-muted)]"
                  }`}
                />
                <div className="h-2.5 w-12 rounded-full bg-[var(--ink)]/15" />
                <div className="h-2 w-full rounded-full bg-[var(--line)]" />
                <div className="h-2 w-3/4 rounded-full bg-[var(--line)]" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-[var(--bg)] via-[var(--bg)]/80 to-transparent md:w-2/5" />
    </div>
  );
}
