/**
 * SegmentedPillToggle — the shared Apple-slate pill segmented control
 * used on admin index pages (Dashboard/List page tabs, capability
 * filters). One rounded-full track, rounded-full inner buttons, white
 * active pill with a soft shadow.
 *
 * Task #3014: this was hand-copied across 5+ admin pages and two
 * copies had already drifted to square inner buttons (fixed in task
 * 3013). Keep every pill toggle on this component so it can't drift
 * again. Date-range square (rounded-md) controls in
 * dashboard-controls.tsx / AdminPartnerDashboard.tsx are intentionally
 * a different look and stay hand-rolled.
 */
export type SegmentedPillOption<T extends string> = {
  value: T;
  label: string;
  /** data-testid for this button (existing ids preserved by callers). */
  testId: string;
};

export function SegmentedPillToggle<T extends string>({
  value,
  onChange,
  options,
  testId,
  ariaLabel,
  dense = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<SegmentedPillOption<T>>;
  /** data-testid for the track element. */
  testId: string;
  ariaLabel?: string;
  /** Slightly tighter horizontal padding (px-2.5 vs px-3) for filter rows. */
  dense?: boolean;
}) {
  return (
    <div
      className="inline-flex items-center bg-[var(--apple-track)] rounded-full p-0.5"
      role="tablist"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={[
            "h-8 inline-flex items-center justify-center rounded-full text-xs font-semibold transition-colors",
            dense ? "px-2.5" : "px-3",
            value === opt.value
              ? "bg-white text-[var(--apple-ink)] shadow-sm"
              : "text-[var(--apple-subink)]",
          ].join(" ")}
          data-testid={opt.testId}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
