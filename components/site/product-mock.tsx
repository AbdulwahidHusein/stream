/**
 * Dominant product atmosphere for the marketing hero — reads as the live
 * recorder, not a feature collage.
 */
export function ProductMock() {
  return (
    <div
      aria-hidden
      className="relative h-full min-h-[380px] w-full overflow-hidden sm:min-h-[440px] lg:min-h-0"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_80%_at_72%_38%,rgba(15,110,106,0.2),transparent_62%),linear-gradient(155deg,#eef2f5_0%,#e4eaef_48%,#d5dde6_100%)]" />

      {/* Floating app window */}
      <div className="absolute inset-y-[7%] right-[-6%] left-[12%] flex flex-col overflow-hidden rounded-[12px] border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow-float)] sm:left-[22%] md:inset-y-[9%] md:left-[16%] lg:left-[12%]">
        {/* Title bar */}
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
          <div className="flex gap-1.5">
            <span className="size-2 rounded-full bg-[var(--line-strong)]" />
            <span className="size-2 rounded-full bg-[var(--line-strong)]" />
            <span className="size-2 rounded-full bg-[var(--line-strong)]" />
          </div>
          <span className="font-[family-name:var(--font-display)] text-sm font-bold tracking-tight">
            Stream
          </span>
          <span className="ml-auto hidden font-mono text-[10px] uppercase tracking-wide text-[var(--ink-faint)] sm:inline">
            Screen + camera
          </span>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Slim rail */}
          <div className="hidden w-[52px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--panel-muted)]/60 py-3 sm:flex">
            <div className="mx-auto mb-2 flex size-8 items-center justify-center rounded-[8px] bg-[var(--accent-soft)]">
              <span className="size-2 rounded-full bg-[var(--record)]" />
            </div>
            <div className="mx-auto size-8 rounded-[8px]" />
            <div className="mx-auto mt-auto size-7 rounded-full bg-[var(--line)]" />
          </div>

          {/* Stage */}
          <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 sm:p-4">
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-[8px] bg-[#0a0e14] ring-1 ring-black/10">
              {/* Fake screen content */}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,#141a24_0%,#0a0e14_100%)]" />
              <div className="absolute inset-x-8 top-8 bottom-16 rounded-md border border-white/5 bg-white/[0.03]" />
              <div className="absolute left-12 top-14 h-2 w-1/3 rounded-full bg-white/10" />
              <div className="absolute left-12 top-20 h-1.5 w-1/2 rounded-full bg-white/5" />
              <div className="absolute left-12 top-28 right-12 bottom-20 rounded border border-white/[0.04] bg-white/[0.02]" />

              {/* Camera bubble */}
              <div className="absolute bottom-4 right-4 size-16 overflow-hidden rounded-full border-2 border-white/80 shadow-lg sm:size-20">
                <div className="h-full w-full bg-[radial-gradient(circle_at_35%_30%,#6b7c8f,#2a3340_70%)]" />
              </div>

              {/* REC chip */}
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-black/55 px-2.5 py-1.5 backdrop-blur-sm">
                <span className="animate-record-pulse size-1.5 rounded-full bg-[var(--record)]" />
                <span className="font-mono text-[11px] tabular-nums text-white">02:14</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-0.5">
              <div className="flex gap-2">
                <span className="h-8 w-16 rounded-[6px] border border-[var(--line)] bg-[var(--panel)]" />
                <span className="h-8 w-16 rounded-[6px] border border-[var(--line)] bg-[var(--panel)]" />
              </div>
              <span className="h-9 w-28 rounded-[6px] bg-[var(--record)] shadow-sm" />
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-y-0 left-0 w-[28%] bg-gradient-to-r from-[var(--bg)] via-[var(--bg)]/85 to-transparent lg:w-[34%]" />
    </div>
  );
}
