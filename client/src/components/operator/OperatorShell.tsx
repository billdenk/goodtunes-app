// Task #544 — One shared shell for every partner-role dashboard.
//
// Wraps the light admin-style partner chrome (white header, logo + role
// pill + entity name, optional sticky tab bar, max-width content area)
// that NPO, Label, Artist, Vendor, Press, and Fulfillment previously
// hand-rolled. The shell takes the role's module list from `registry.ts`
// so adding a new tab to an existing role is a one-line registry change
// rather than a chrome edit.
//
// Every invited-partner portal is a LIGHT admin surface (matching the
// operator admin look), so this shell adds the `gt-admin` body class
// while mounted — the same mechanism AdminFrame uses — so shadcn
// primitives (Dialog/Input/Select/Button) render with the light tokens,
// and it uses the slate text scale throughout. See docs/design-system.md
// → Partner portals are light admin surfaces.

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { DashboardTabs, type TabDef } from "@/components/partner/dashboard-controls";
import { AdminUserMenu } from "@/components/admin/AdminUserMenu";
import { cn } from "@/lib/utils";

export type OperatorShellProps<TabId extends string> = {
  /** Small uppercase eyebrow over the entity name. "Label dashboard", "Press portal", etc. */
  roleLabel: string;
  /** Big H1 — entity name. Falls back to "Your dashboard" while loading. */
  name: string;
  logoUrl?: string | null;
  /** Fallback glyph when there's no logo yet. */
  fallbackIcon: LucideIcon;
  /** People get circles; orgs/vendors get rounded squares. */
  logoShape?: "square" | "circle";
  /** Smaller line under the name — "12 artists · 47 albums" etc. */
  subtitle?: React.ReactNode;
  /** Slot under the title row but above the tabs — used for the
   * "Invited by {Press}" rosette on Artist/Label and similar one-off
   * banners. */
  headerExtras?: React.ReactNode;
  /** Slot for the RangePicker + CompareToggle row on analytics-heavy
   * shells (Artist + Label). Rendered as a flex row under the title. */
  headerActions?: React.ReactNode;
  tabs: ReadonlyArray<TabDef<TabId>>;
  activeTab: TabId;
  onTabChange: (id: TabId) => void;
  /** Most partner shells use 6xl; NPO historically used 5xl. */
  maxWidth?: "5xl" | "6xl";
  /** When true, the content area gets `space-y-6` like the Artist /
   * Label shells (multiple stacked sections). Defaults off. */
  spaceContent?: boolean;
  children: React.ReactNode;
  testId?: string;
};

export function OperatorShell<TabId extends string>({
  roleLabel,
  name,
  logoUrl,
  fallbackIcon: FallbackIcon,
  logoShape = "square",
  subtitle,
  headerExtras,
  headerActions,
  tabs,
  activeTab,
  onTabChange,
  maxWidth = "6xl",
  spaceContent = false,
  children,
  testId,
}: OperatorShellProps<TabId>) {
  // Partner portals are light admin surfaces. Add the admin light-theme body
  // class while this shell is mounted so shadcn primitives (Dialog/Input/
  // Select/Button) pick up the light tokens — same mechanism AdminFrame uses.
  // Restore the prior state on unmount: if `gt-admin` was already present
  // (admin host boot / AdminFrame nav) leave it; if THIS shell introduced it
  // (a partner on a customer host), drop it so fan pages get their dark theme
  // back when the user navigates away within the SPA.
  React.useEffect(() => {
    const body = document.body;
    const had = body.classList.contains("gt-admin");
    body.classList.add("gt-admin");
    return () => {
      if (!had) body.classList.remove("gt-admin");
    };
  }, []);

  const maxW = maxWidth === "5xl" ? "max-w-5xl" : "max-w-6xl";
  const radius = logoShape === "circle" ? "rounded-full" : "rounded-2xl";
  return (
    <main
      className="min-h-screen bg-slate-50 text-slate-900 pb-20"
      data-testid={testId ?? "operator-shell"}
    >
      <header className="border-b border-slate-200 bg-white">
        <div className={cn(maxW, "mx-auto px-4 sm:px-6 py-6")}>
          <div className={cn("flex items-center gap-4", (headerExtras || headerActions) && "mb-6")}>
            <div
              className={cn(
                "w-14 h-14 overflow-hidden flex items-center justify-center bg-slate-100 ring-1 ring-slate-200",
                radius,
              )}
              data-testid="operator-shell-logo"
            >
              {logoUrl ? (
                <img src={logoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <FallbackIcon className="w-5 h-5 text-slate-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold" data-testid="text-operator-role">
                {roleLabel}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold truncate" data-testid="text-operator-name">
                {name}
              </h1>
              {subtitle && (
                <div className="text-slate-500 text-xs mt-0.5" data-testid="text-operator-subtitle">
                  {subtitle}
                </div>
              )}
            </div>
            <div className="shrink-0 self-start" data-testid="operator-shell-account">
              <AdminUserMenu />
            </div>
          </div>

          {headerExtras}

          {headerActions && (
            <div className="flex flex-wrap items-center gap-2">{headerActions}</div>
          )}
        </div>
      </header>

      <DashboardTabs tabs={tabs} value={activeTab} onChange={onTabChange} />

      <div className={cn(maxW, "mx-auto px-4 sm:px-6 mt-6", spaceContent && "space-y-6")}>
        {children}
      </div>
    </main>
  );
}
