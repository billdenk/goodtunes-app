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
//
// Task #2081 — `layout` prop. The standalone partner portals (label,
// manager, non_profit, publisher) opt into `layout="leftnav"` so their
// whole experience rides the same LEFT-nav chrome as the rest of the
// admin (matching AdminFrame's 220px white rail) instead of a tab-only
// header that flips to a left-nav layout the moment they click a shared
// tool. The default stays `"tabs"` so the artist/press/vendor/printer
// shells that already use OperatorShell are byte-for-byte unchanged.

import * as React from "react";
import { Link } from "wouter";
import { Circle, type LucideIcon } from "lucide-react";
import { DashboardTabs, type TabDef } from "@/components/partner/dashboard-controls";
import { AdminUserMenu } from "@/components/admin/AdminUserMenu";
import { cn } from "@/lib/utils";
import gtLogo from "@assets/2025_GoodTunes_Logo-dark.1_1778271422870.png";

/** Extra left-nav destinations that aren't in-page tabs — e.g. label /
 * manager "Reports" jumping to the shared scoped /admin/reports page.
 * Only rendered in `layout="leftnav"`. */
export type OperatorNavExtra = {
  id: string;
  label: string;
  href: string;
  icon?: LucideIcon;
};

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
  /**
   * Chrome layout. `"tabs"` (default) keeps the legacy header + sticky
   * horizontal tab bar used by the artist/press/vendor/printer shells.
   * `"leftnav"` renders a 220px white left rail (GoodTunes logo, the
   * same tabs as vertical nav items, optional `navExtras`, account menu
   * at the foot) with the identity header + content in the main column —
   * the unified scoped left-nav for the standalone partner portals.
   */
  layout?: "tabs" | "leftnav";
  /** Per-tab icons for the left rail (`layout="leftnav"`). Tabs without
   * an icon fall back to a small dot so the rail stays aligned. */
  navIcons?: Partial<Record<TabId, LucideIcon>>;
  /** Extra non-tab left-nav links (`layout="leftnav"`), rendered below
   * the tabs with a divider. */
  navExtras?: ReadonlyArray<OperatorNavExtra>;
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
  layout = "tabs",
  navIcons,
  navExtras,
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

  // Shared identity block (logo + role eyebrow + name + subtitle), used by
  // both layouts so the two chromes stay visually identical above the fold.
  const identity = (
    <>
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
    </>
  );

  if (layout === "leftnav") {
    return (
      // h-screen + overflow-hidden on the outer shell means only the main
      // content column scrolls; the left rail stays fixed in place — matching
      // AdminFrame's h-screen layout so the nav never scrolls away.
      <div
        className="h-screen overflow-hidden flex bg-slate-50 text-slate-900"
        data-testid={testId ?? "operator-shell"}
      >
        {/* Left rail — 220px white column. Partner logo + name in the top
            header band (replacing the GoodTunes logo). Vertical nav in the
            middle. "Powered by GoodTunes" pinned to the foot.
            Hidden on phones, which fall back to the horizontal tab bar. */}
        <aside className="w-[220px] flex-shrink-0 bg-white border-r border-slate-200 hidden md:flex md:flex-col">
          {/* Partner logo + name — top-left rail header, mirrors AdminFrame's
              h-14 logo band. Small square/circle avatar + truncated name. */}
          <div className="h-14 flex-shrink-0 flex items-center gap-2.5 px-3 border-b border-slate-200 overflow-hidden">
            <div
              className={cn(
                "w-7 h-7 flex-shrink-0 overflow-hidden flex items-center justify-center bg-slate-100 ring-1 ring-slate-200",
                radius,
              )}
              data-testid="operator-shell-rail-logo"
            >
              {logoUrl ? (
                <img src={logoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <FallbackIcon className="w-3.5 h-3.5 text-slate-400" />
              )}
            </div>
            <span className="text-sm font-semibold text-slate-800 truncate" data-testid="text-operator-rail-name">
              {name}
            </span>
          </div>

          {/* Task #2085 — nav items mirror AdminFrame's SidebarLink class
              treatment (px-3 py-2, text-sm, brand-blue active, slate-700
              hover:bg-slate-100) so a partner sees the same nav styling
              whether they're in this portal or in a shared admin tool
              (Reports, album detail) reached through AdminFrame's trimmed
              rail. SidebarLink uses a grandfathered ~13.5px size; this new
              code uses the text-sm scale token (the sub-pixel difference is
              imperceptible). Keep these in lock-step with SidebarLink. */}
          <nav
            className="flex-1 px-2 pt-2 pb-3 space-y-0.5 overflow-y-auto"
            data-testid="operator-shell-nav"
          >
            {tabs.map((t) => {
              const Icon = navIcons?.[t.id] ?? Circle;
              const isActive = t.id === activeTab;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTabChange(t.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                    isActive ? "font-bold" : "font-medium",
                    isActive
                      ? "bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]"
                      : "text-slate-700 hover:bg-slate-100",
                  )}
                  data-testid={`nav-${t.id}`}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4 flex-shrink-0",
                      isActive ? "text-[var(--brand-blue)]" : "text-slate-400",
                    )}
                  />
                  <span className="flex-1 text-left truncate">{t.label}</span>
                </button>
              );
            })}

            {navExtras && navExtras.length > 0 && (
              <>
                <div className="my-2 border-t border-slate-100" />
                {navExtras.map((x) => {
                  const Icon = x.icon ?? Circle;
                  return (
                    <Link key={x.id} href={x.href} data-testid={`nav-${x.id}`} className="gt-nav w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors">
                      <Icon className="w-4 h-4 flex-shrink-0 text-slate-400" />
                      <span className="flex-1 text-left truncate">{x.label}</span>
                    </Link>
                  );
                })}
              </>
            )}
          </nav>

          {/* "Powered by GoodTunes" — bottom of rail. GoodTunes logo moves
              here so the partner's own logo claims the top-left position. */}
          <div className="flex-shrink-0 border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1.5">
              Powered by
            </p>
            <img src={gtLogo} alt="GoodTunes" className="h-5 w-auto opacity-50" />
          </div>
        </aside>

        {/* Main column — flex-col + overflow-hidden so only the inner
            content div scrolls (the sticky top strip stays visible). */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Top header strip — h-14, matches AdminFrame's sticky top bar.
              Profile menu pinned top-right (desktop + mobile). */}
          <div
            className="h-14 flex-shrink-0 border-b border-slate-200 bg-white flex items-center px-4 sm:px-6"
            data-testid="operator-shell-topbar"
          >
            {/* Mobile: show the entity name since the rail is hidden. */}
            <span className="md:hidden text-sm font-semibold text-slate-800 truncate flex-1 mr-3" aria-hidden="true">
              {name}
            </span>
            <div className="ml-auto flex items-center gap-3" data-testid="operator-shell-account">
              <AdminUserMenu />
            </div>
          </div>

          {/* Phone fallback navigation — the rail is hidden < md. */}
          <div className="md:hidden">
            <DashboardTabs tabs={tabs} value={activeTab} onChange={onTabChange} />
          </div>

          {/* Page header — regular-admin-style: title + optional subtitle,
              no oversized logo/eyebrow identity block (that now lives in
              the rail). Consistent with how admin pages render their headings. */}
          <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-5">
            <div className={cn(maxW, "mx-auto")}>
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold" data-testid="text-operator-role">
                    {roleLabel}
                  </p>
                  <h1 className="text-xl font-bold text-slate-900 truncate" data-testid="text-operator-name">
                    {name}
                  </h1>
                  {subtitle && (
                    <div className="text-slate-500 text-sm mt-0.5" data-testid="text-operator-subtitle">
                      {subtitle}
                    </div>
                  )}
                </div>
              </div>
              {headerExtras && <div className="mt-4">{headerExtras}</div>}
              {headerActions && (
                <div className="flex flex-wrap items-center gap-2 mt-4">{headerActions}</div>
              )}
            </div>
          </div>

          {/* Scrollable content area. */}
          <div className="flex-1 overflow-y-auto">
            <div className={cn(maxW, "mx-auto w-full px-4 sm:px-6 mt-6 pb-20", spaceContent && "space-y-6")}>
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main
      className="min-h-screen bg-slate-50 text-slate-900 pb-20"
      data-testid={testId ?? "operator-shell"}
    >
      <header className="border-b border-slate-200 bg-white">
        <div className={cn(maxW, "mx-auto px-4 sm:px-6 py-6")}>
          <div className={cn("flex items-center gap-4", (headerExtras || headerActions) && "mb-6")}>
            {identity}
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
