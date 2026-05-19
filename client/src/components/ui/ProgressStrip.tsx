import { useEffect, useState } from "react";

/**
 * Thin progress rail for long-running admin imports. Two modes:
 *
 * - **Indeterminate** (`progress` null/undefined while we wait for the
 *   first poll back from the server): a brand-blue stripe slides
 *   left-to-right on a slate-200 rail. Honest for the phase where the
 *   server is downloading a Dropbox zip and hasn't yet hit `setProgress`.
 * - **Determinate** (`progress.total > 0`): the fill smoothly transitions
 *   to `processed/total`. Caps at 100% and never goes backwards.
 *
 * Designed to live in a dialog footer or inline status row. Render only
 * while the operation is in flight — the caller controls mount.
 *
 * Sibling label (e.g. "Importing 3/12…") goes outside this component so
 * each consumer can style/position it however the surrounding chrome
 * needs.
 */
export function ProgressStrip({
  progress,
  className,
}: {
  progress?: { processed: number; total: number } | null;
  className?: string;
}) {
  const determinate = !!(progress && progress.total > 0);
  // Latch the highest pct we've seen so a stale poll arriving out of
  // order (rare but possible — pollIntervalMs is 1.5s) can't visibly
  // rewind the bar.
  const [maxPct, setMaxPct] = useState(0);
  useEffect(() => {
    if (!determinate) {
      setMaxPct(0);
      return;
    }
    const next = Math.min(100, Math.round((progress!.processed / progress!.total) * 100));
    setMaxPct((cur) => (next > cur ? next : cur));
  }, [determinate, progress?.processed, progress?.total]);

  return (
    <div
      className={[
        "relative h-1 w-full overflow-hidden rounded-full bg-slate-200",
        className || "",
      ].join(" ")}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? maxPct : undefined}
      aria-label="Import progress"
      data-testid="progress-strip"
    >
      {determinate ? (
        <div
          className="absolute inset-y-0 left-0 bg-[#319ED8] transition-[width] duration-500 ease-out"
          style={{ width: `${maxPct}%` }}
        />
      ) : (
        <div className="absolute inset-y-0 w-1/3 rounded-full bg-[#319ED8] gt-progress-indeterminate" />
      )}
    </div>
  );
}
