import { type ReactNode } from "react";

/**
 * AdminPageHeader — canonical admin index-page header.
 *
 * Codifies the Albums-page treatment (which the team picked as the
 * reference): generous 26px title, 12.5px subtitle, action cluster on
 * the right, hairline divider below. Every admin index page (Albums,
 * People, Gear, Vendors, Labels) must use this primitive so the chrome
 * stays identical — no per-page font-size or spacing drift.
 *
 * Layout contract (matches admin style rules in replit.md):
 *   - Title:    text-[26px] font-bold tracking-tight slate-900
 *   - Subtitle: text-[12.5px] slate-500
 *   - Bottom:   `border-b border-slate-200` hairline (same line that the
 *               Albums tab row provides — pages without tabs still get
 *               it so spacing reads the same)
 *   - Parent:   wrap the page body in `space-y-5` so the header → grid
 *               gap matches Albums (40px-ish breathing room).
 *
 * Action area: pass the right-side cluster (search, view-mode toggle,
 * filter, "+", advanced menu) as `actions`. If the page also has tabs
 * directly under the header (Albums), pass them as `belowHeader` and
 * the divider will move down to live under the tab row instead — so the
 * tab row itself provides the hairline, no double border.
 */
export function AdminPageHeader({
  title,
  subtitle,
  actions,
  belowHeader,
  testId = "text-page-title",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  belowHeader?: ReactNode;
  testId?: string;
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-3 pb-1">
        <div className="min-w-0">
          <h1
            className="text-slate-900 text-[26px] font-bold tracking-tight"
            data-testid={testId}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-slate-500 text-[12.5px]">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
      {belowHeader ? (
        belowHeader
      ) : (
        <div className="border-b border-slate-200 mt-4" aria-hidden="true" />
      )}
    </div>
  );
}
