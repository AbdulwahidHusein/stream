const STEPS = [
  { id: 1, label: "Choose what to capture" },
  { id: 2, label: "Allow access" },
  { id: 3, label: "Preview & record" },
] as const;

export function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {STEPS.map((step, index) => {
        const active = step.id === current;
        const done = step.id < current;

        return (
          <li key={step.id} className="flex items-center gap-2">
            {index > 0 && (
              <span aria-hidden className="mr-1 hidden h-px w-6 bg-[var(--line)] sm:block" />
            )}
            <span
              className={`flex size-6 items-center justify-center rounded-full font-mono text-[11px] font-medium ${
                active
                  ? "bg-[var(--accent)] text-white"
                  : done
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "bg-[var(--panel-muted)] text-[var(--ink-faint)]"
              }`}
            >
              {step.id}
            </span>
            <span
              className={
                active ? "font-medium text-[var(--ink)]" : "text-[var(--ink-faint)]"
              }
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
