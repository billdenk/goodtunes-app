import type { ReactNode } from "react";

/**
 * AdminEmptyState — canonical Apple-canon empty-state treatment for
 * admin/operator surfaces (docs/apple-canon.md): one calm, centered,
 * faint sentence. No illustrations, no banners, nothing shouts.
 *
 * Tokens flip automatically under `.gt-admin-dark`, so this reads
 * correctly in both light and dark mode. Page sweeps should adopt this
 * instead of per-page ad-hoc "No results" markup.
 *
 * Optional `action` slot for a single quiet follow-up (a text button /
 * link per the button weight rule — never a filled pill here).
 */
export function AdminEmptyState({
  children,
  action,
  className = "",
  testId = "empty-state",
}: {
  /** The one calm sentence, e.g. "No albums yet." */
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={`py-12 px-6 text-center ${className}`}
      data-testid={testId}
    >
      <p className="text-[13px] font-medium text-[var(--apple-faint)]">
        {children}
      </p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}
