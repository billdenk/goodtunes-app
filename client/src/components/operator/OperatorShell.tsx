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
// admin (a white left rail like AdminFrame's, a touch wider at 256px to
// fit long partner names on one line) instead of a tab-only
// header that flips to a left-nav layout the moment they click a shared
// tool. The default stays `"tabs"` so the artist/press/vendor/printer
// shells that already use OperatorShell are byte-for-byte unchanged.

import * as React from "react";
import { Link } from "wouter";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Circle, Eye, type LucideIcon } from "lucide-react";
import { DashboardTabs, type TabDef } from "@/components/partner/dashboard-controls";
import { SECTION_LABELS, type OperatorSectionId } from "@/components/operator/registry";
import { AdminUserMenu } from "@/components/admin/AdminUserMenu";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { FeedbackLauncher } from "@/components/operator/FeedbackLauncher";
import { ViewAsBanner } from "@/components/admin/ViewAsBanner";
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
  /** Task #2191 — full-size/wide primary nav logo for the press portal
   * whitelabel header. When provided (press-only opt-in), the h-14 rail
   * header renders this image constrained to the existing band height
   * instead of the small square icon + name text. Null = default layout. */
  navLogoUrl?: string | null;
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
  /** When set (leftnav layout), the content page header renders this as a
   * section title in the super-admin AdminPageHeader treatment — a single
   * bold H1 with `headerActions` inline on the right and a bottom hairline —
   * instead of the role eyebrow + entity name. Used by the artist shell so
   * the header always names the CURRENT section (Dashboard / Overview / …)
   * and agrees with the highlighted nav item; the entity identity stays in
   * the rail + mobile top strip so it isn't redundantly repeated as the H1.
   * `subtitle` (if passed) sits under the title. */
  pageTitle?: React.ReactNode;
  /** Press portal opt-in (leftnav only). The press already shows its wordmark
   * in the rail header (top-left, replacing the GoodTunes logo), so repeating
   * the role eyebrow + name in the content page header is redundant. When true,
   * the content page-header identity (eyebrow + name + subtitle) is hidden; the
   * band still renders if headerExtras/headerActions are present. */
  hideHeaderIdentity?: boolean;
  /** When true, an operator is viewing this partner's portal in super-admin
   * mode (not the partner themselves). Renders an elegant "Super-admin view"
   * badge in the top nav instead of repeating "(super-admin view)" in the
   * role eyebrow / content header. */
  superAdminView?: boolean;
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
   * `"leftnav"` renders a 256px white left rail (GoodTunes logo, the
   * same tabs as vertical nav items, optional `navExtras`, account menu
   * at the foot) with the identity header + content in the main column —
   * the unified scoped left-nav for the standalone partner portals.
   */
  layout?: "tabs" | "leftnav";
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
  navLogoUrl,
  fallbackIcon: FallbackIcon,
  logoShape = "square",
  subtitle,
  headerExtras,
  headerActions,
  pageTitle,
  hideHeaderIdentity = false,
  superAdminView = false,
  tabs,
  activeTab,
  onTabChange,
  maxWidth = "6xl",
  spaceContent = false,
  layout = "tabs",
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

  // Task #2566 — collapsible rail sections, mirroring AdminFrame's
  // Stripe-style accordion (at most one section open at a time, choice
  // persisted to localStorage). The section holding the active tab is
  // expanded on first load with no stored value; after that the stored
  // value wins so navigating never re-expands a section the partner
  // collapsed. Keyed separately from the admin so the two don't clobber.
  const SIDEBAR_SECTIONS_KEY = "gt:operator-sidebar-sections";
  const reduceMotion = useReducedMotion();
  const activeSection: OperatorSectionId | null =
    (tabs.find((t) => t.id === activeTab)?.section as OperatorSectionId | undefined) ?? null;
  const [openSection, setOpenSection] = React.useState<OperatorSectionId | null>(() => {
    if (typeof window === "undefined") return activeSection;
    try {
      const raw = window.localStorage.getItem(SIDEBAR_SECTIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "string" || parsed === null) {
          return parsed as OperatorSectionId | null;
        }
      }
    } catch {}
    return activeSection;
  });
  React.useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(openSection));
    } catch {}
  }, [openSection]);
  const toggleSection = (id: OperatorSectionId) =>
    setOpenSection((prev) => (prev === id ? null : id));

  // Elegant top-nav badge that signals an operator is viewing this portal in
  // super-admin mode. Uses the soft brand-blue token (inline style — Tailwind
  // can't alpha a CSS var) to match the active-nav treatment.
  const superAdminBadge = superAdminView ? (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: "var(--brand-blue-soft)", color: "var(--brand-blue)" }}
      data-testid="badge-super-admin-view"
    >
      <Eye className="h-3.5 w-3.5" />
      Super-admin view
    </span>
  ) : null;

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
      // The view-as banner sits ABOVE the h-screen shell so it doesn't
      // disturb the fixed-height layout (the shell shrinks to fill the rest).
      <div className="flex flex-col" style={{ height: "100dvh" }} data-testid={testId ?? "operator-shell"}>
        <ViewAsBanner />
        <div
          className="flex-1 min-h-0 overflow-hidden flex bg-slate-50 text-slate-900"
        >
        {/* Left rail — 256px white column. Partner logo + name in the top
            header band (replacing the GoodTunes logo). Vertical nav in the
            middle. "Powered by GoodTunes" pinned to the foot.
            Hidden on phones, which fall back to the horizontal tab bar. */}
        <aside className="w-64 flex-shrink-0 bg-white hidden md:flex md:flex-col">
          {/* Partner logo + name — top-left rail header (h-14 band). When a
              full-size navLogoUrl is set (press whitelabel), render it
              height-constrained so the band never grows; otherwise fall back to
              the small square avatar + the partner name on a single line. The
              partner rail is widened (w-64, vs AdminFrame's 220px) so a long
              press name like "Memphis Record Pressing" fits on one line;
              truncate is only a safety net for unusually long names. */}
          <div className="h-14 flex-shrink-0 flex items-center gap-2.5 px-3 border-b border-slate-200 overflow-hidden">
            {navLogoUrl ? (
              <img
                src={navLogoUrl}
                alt={name}
                className="max-h-8 w-auto object-contain"
                data-testid="operator-shell-rail-nav-logo"
              />
            ) : (
              <>
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
                <span className="text-sm font-semibold text-slate-800 truncate min-w-0" data-testid="text-operator-rail-name">
                  {name}
                </span>
              </>
            )}
          </div>

          {/* Task #2085 + #2566 — nav items mirror AdminFrame's SidebarLink
              treatment (px-3 py-2, 13.5px, brand-blue active, slate-700
              hover:bg-slate-100) so a partner sees the same nav styling
              whether they're in this portal or in a shared admin tool
              (Reports, album detail) reached through AdminFrame's trimmed
              rail. Icons + section grouping come from the SINGLE registry
              source (registry.ts), never per-page maps that can drift.
              Keep these in lock-step with SidebarLink / Section. */}
          <nav
            className="flex-1 px-2 pt-2 pb-3 space-y-0.5 overflow-y-auto border-r border-slate-200"
            data-testid="operator-shell-nav"
          >
            {(() => {
              // Render each tab in registry order. The first tab of a
              // section emits a collapsible Section wrapping every member of
              // that section (registry order); later members are skipped
              // (already drawn). Flat tabs render inline. Because the
              // registry places section members contiguously right under the
              // section's anchor row, the group lands in the intended spot.
              const drawnSections = new Set<OperatorSectionId>();
              return tabs.map((t) => {
                if (t.section) {
                  if (drawnSections.has(t.section)) return null;
                  drawnSections.add(t.section);
                  const sectionId = t.section;
                  const members = tabs.filter((x) => x.section === sectionId);
                  const containsActive = members.some((m) => m.id === activeTab);
                  const expanded = openSection === sectionId;
                  return (
                    <NavSection
                      key={`section-${sectionId}`}
                      label={SECTION_LABELS[sectionId]}
                      expanded={expanded}
                      containsActive={containsActive}
                      reduceMotion={!!reduceMotion}
                      onToggle={() => toggleSection(sectionId)}
                      testId={`nav-section-${sectionId}`}
                    >
                      {members.map((m) => (
                        <NavButton
                          key={m.id}
                          label={m.label}
                          icon={m.icon}
                          active={m.id === activeTab}
                          onClick={() => onTabChange(m.id)}
                          testId={`nav-${m.id}`}
                        />
                      ))}
                    </NavSection>
                  );
                }
                return (
                  <NavButton
                    key={t.id}
                    label={t.label}
                    icon={t.icon}
                    active={t.id === activeTab}
                    onClick={() => onTabChange(t.id)}
                    testId={`nav-${t.id}`}
                  />
                );
              });
            })()}

            {navExtras && navExtras.length > 0 && (
              <>
                <div className="my-2 border-t border-slate-100" />
                {navExtras.map((x) => {
                  const Icon = x.icon ?? Circle;
                  return (
                    <Link key={x.id} href={x.href} data-testid={`nav-${x.id}`} className="gt-nav w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium text-slate-700 hover:bg-slate-100 transition-colors">
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
          <div className="flex-shrink-0 border-t border-r border-slate-200 px-4 py-3">
            <p className="text-[7px] text-slate-400 font-medium uppercase tracking-wider mb-1.5">
              Powered by
            </p>
            <img src={gtLogo} alt="GoodTunes" className="h-[27px] w-auto" />
          </div>
        </aside>

        {/* Main column — flex-col + overflow-hidden so only the inner
            content div scrolls (the sticky top strip stays visible). */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Top header strip — h-14, matches AdminFrame's sticky top bar.
              Profile menu pinned top-right (desktop + mobile). */}
          <div
            className="h-14 flex-shrink-0 border-b border-slate-200 bg-white flex items-center gap-3 px-4 sm:px-6"
            data-testid="operator-shell-topbar"
          >
            {/* Mobile: show the entity name since the rail is hidden. */}
            <span className="md:hidden text-sm font-semibold text-slate-800 truncate min-w-0" aria-hidden="true">
              {name}
            </span>
            {superAdminBadge}
            <div className="ml-auto flex items-center gap-3" data-testid="operator-shell-account">
              <FeedbackLauncher />
              <AdminUserMenu />
            </div>
          </div>

          {/* Phone fallback navigation — the rail is hidden < md. */}
          <div className="md:hidden">
            <DashboardTabs tabs={tabs} value={activeTab} onChange={onTabChange} />
          </div>

          {/* Page header — regular-admin-style: title + optional subtitle,
              no oversized logo/eyebrow identity block (that now lives in
              the rail). Consistent with how admin pages render their headings.
              The press portal sets `hideHeaderIdentity` because its wordmark
              already sits in the rail header, so the eyebrow + name here would
              just repeat it; the whole band collapses when there are no header
              extras/actions to show. */}
          {pageTitle ? (
            /* Section-title header (artist shell): the canonical super-admin
               AdminPageHeader treatment — a single bold H1 naming the current
               section, `headerActions` (range picker + compare) inline on the
               right, and a bottom hairline. Reusing AdminPageHeader keeps this
               byte-identical to the main dashboard header. The entity identity
               lives in the rail + mobile top strip, so it isn't repeated here. */
            <div className="flex-shrink-0 bg-white px-4 sm:px-6 pt-6">
              <div className={cn(maxW, "mx-auto")}>
                <AdminPageHeader
                  title={pageTitle}
                  subtitle={subtitle}
                  actions={headerActions}
                  testId="text-operator-page-title"
                />
                {headerExtras && <div className="mt-4">{headerExtras}</div>}
              </div>
            </div>
          ) : (!hideHeaderIdentity || headerExtras || headerActions) ? (
            <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-5">
              <div className={cn(maxW, "mx-auto")}>
                {!hideHeaderIdentity && (
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
                )}
                {headerExtras && <div className={cn(!hideHeaderIdentity && "mt-4")}>{headerExtras}</div>}
                {headerActions && (
                  <div className={cn("flex flex-wrap items-center gap-2", !hideHeaderIdentity && "mt-4")}>{headerActions}</div>
                )}
              </div>
            </div>
          ) : null}

          {/* Scrollable content area. */}
          <div className="flex-1 overflow-y-auto">
            <div className={cn(maxW, "mx-auto w-full px-4 sm:px-6 mt-6 pb-20", spaceContent && "space-y-6")}>
              {children}
            </div>
          </div>
        </div>
      </div>
      </div>
    );
  }

  return (
    <>
      <ViewAsBanner />
      <main
        className="min-h-screen bg-slate-50 text-slate-900 pb-20"
        data-testid={testId ?? "operator-shell"}
      >
      <header className="border-b border-slate-200 bg-white">
        <div className={cn(maxW, "mx-auto px-4 sm:px-6 py-6")}>
          <div className={cn("flex items-center gap-4", (headerExtras || headerActions) && "mb-6")}>
            {identity}
            {superAdminBadge}
            <div className="ml-auto shrink-0 self-start flex items-center gap-3" data-testid="operator-shell-account">
              <FeedbackLauncher />
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
    </>
  );
}

/** A single left-rail nav row (`layout="leftnav"`). Mirrors AdminFrame's
 * SidebarLink: px-3 py-2, 13.5px, brand-blue active, slate hover. The icon
 * comes from the registry; a small dot is the safety fallback. */
function NavButton({
  label,
  icon: Icon,
  active,
  onClick,
  testId,
}: {
  label: string;
  icon?: LucideIcon;
  active: boolean;
  onClick: () => void;
  testId?: string;
}) {
  const Glyph = Icon ?? Circle;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      data-testid={testId}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] transition-colors",
        active ? "font-bold" : "font-medium",
        active
          ? "bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]"
          : "text-slate-700 hover:bg-slate-100",
      )}
    >
      <Glyph
        className={cn(
          "w-4 h-4 flex-shrink-0",
          active ? "text-[var(--brand-blue)]" : "text-slate-400",
        )}
      />
      <span className="flex-1 text-left truncate">{label}</span>
    </button>
  );
}

/** A collapsible left-rail section header with nested children
 * (`layout="leftnav"`). Mirrors AdminFrame's `Section`: chevron rotates on
 * expand, Stripe-style spring, active-parent highlight when collapsed while
 * it holds the current tab, children indented `pl-4`. */
function NavSection({
  label,
  expanded,
  containsActive,
  reduceMotion,
  onToggle,
  testId,
  children,
}: {
  label: string;
  expanded: boolean;
  containsActive: boolean;
  reduceMotion: boolean;
  onToggle: () => void;
  testId?: string;
  children: React.ReactNode;
}) {
  const highlightParent = containsActive && !expanded;
  const openTransition = reduceMotion
    ? { duration: 0 }
    : {
        height: { type: "spring" as const, stiffness: 520, damping: 28, mass: 0.9 },
        opacity: { duration: 0.18, ease: "easeOut" as const },
      };
  const closeTransition = reduceMotion
    ? { duration: 0 }
    : {
        height: { duration: 0.18, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
        opacity: { duration: 0.12, ease: "easeIn" as const },
      };
  return (
    <div className="pt-2 first:pt-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        data-testid={testId}
        data-active={highlightParent ? "true" : "false"}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] transition-colors",
          highlightParent ? "font-bold" : "font-medium",
          highlightParent
            ? "bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]"
            : "text-slate-700 hover:bg-slate-100",
        )}
      >
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 520, damping: 28, mass: 0.9 }
          }
          className="flex-shrink-0"
        >
          <ChevronRight
            className={cn(
              "w-4 h-4",
              highlightParent ? "text-[var(--brand-blue)]" : "text-slate-400",
            )}
          />
        </motion.span>
        <span className="flex-1 text-left">{label}</span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={expanded ? openTransition : closeTransition}
            style={{ overflow: "hidden" }}
          >
            <div className="pl-4 mt-0.5 space-y-0.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
