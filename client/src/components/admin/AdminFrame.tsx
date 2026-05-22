import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Disc3,
  User,
  Guitar,
  Store,
  Tag,
  Factory,
  Truck,
  Users,
  ArrowLeft,
  BarChart3,
  DollarSign,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AdminUserMenu } from "@/components/admin/AdminUserMenu";
import gtLogo from "@assets/2025_GoodTunes_Logo-dark.1_1778271422870.png";

const PREVIEW_OPEN_KEY = "gt:admin-preview-open";

/**
 * Shared chrome for the new admin: top bar with GoodTunes wordmark +
 * admin chip + back-to-player link, and left entity sidebar with live
 * counts. Wrap any admin page in this and pass which entity is active.
 *
 * Albums + People + Gear + Vendors + Labels all have new-admin pages
 * now — every sidebar row routes into the new frame. The classic admin
 * is reached only via per-page "Open in classic admin" jump-offs that
 * set their own focus keys.
 */
export type EntityKey =
  | "albums"
  | "people"
  | "gear"
  | "vendors"
  | "labels"
  | "manufacturers"
  | "fulfillment"
  | "customers"
  | "reports"
  | "platform-pricing"
  | "none";

export function AdminFrame({
  active,
  preview,
  children,
}: {
  active: EntityKey;
  /**
   * Optional fan-side preview to render in the collapsible right pane.
   * When omitted (list pages, loading/error states) the pane is hidden
   * entirely so the editor gets the full main column.
   */
  preview?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  // Toggle state for the right preview pane. Persisted so once you tuck
  // it away it stays tucked across navigations / refreshes — matches
  // the macOS Mail / VS Code sidebar pattern.
  const [previewOpen, setPreviewOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = window.localStorage.getItem(PREVIEW_OPEN_KEY);
      return raw === null ? true : raw === "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(PREVIEW_OPEN_KEY, previewOpen ? "1" : "0");
    } catch {}
  }, [previewOpen]);

  // The sidebar count mirrors what the Albums index actually shows —
  // imported streaming catalog (`!isGoodTunesRelease`) is hidden from
  // the admin, so it would be misleading to include it in the total.
  const { data: albums = [] } = useQuery<{ isGoodTunesRelease: boolean }[]>({
    queryKey: ["/api/albums"],
    enabled: !!user?.isAdmin,
  });
  const albumCount = albums.filter((a) => a.isGoodTunesRelease).length;
  const { data: people = [] } = useQuery<unknown[]>({
    queryKey: ["/api/people"],
    enabled: !!user?.isAdmin,
  });
  const { data: instruments = [] } = useQuery<unknown[]>({
    queryKey: ["/api/instruments"],
    enabled: !!user?.isAdmin,
  });
  const { data: vendors = [] } = useQuery<unknown[]>({
    queryKey: ["/api/vendors"],
    enabled: !!user?.isAdmin,
  });
  const { data: labels = [] } = useQuery<unknown[]>({
    queryKey: ["/api/labels"],
    enabled: !!user?.isAdmin,
  });
  // Task #69 — pressing plants + fulfillment warehouses live in the
  // same admin shell, gated to super_admin today + visible to their
  // own role-scope rows when role-gating ships.
  const { data: manufacturers = [] } = useQuery<unknown[]>({
    queryKey: ["/api/manufacturers"],
    enabled: !!user?.isAdmin,
  });
  const { data: fulfillment = [] } = useQuery<unknown[]>({
    queryKey: ["/api/fulfillment-partners"],
    enabled: !!user?.isAdmin,
  });
  // Task #131 — Customers directory. The list payload is { rows, total }
  // so the sidebar count uses `total` (full unfiltered fan count) rather
  // than rows.length (capped to the page).
  const { data: customersResp } = useQuery<{ total: number }>({
    queryKey: ["/api/admin/customers"],
    enabled: !!user?.isAdmin,
  });
  const customerCount = customersResp?.total ?? 0;
  // Task #119 — Platform Pricing is super-admin-only; we hide the
  // sidebar link entirely for other roles so they don't see a tab
  // that 403s when they click it.
  const { data: roleInfo } = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
    enabled: !!user?.isAdmin,
  });
  const isSuperAdmin = roleInfo?.role === "super_admin";

  return (
    <div className="h-screen bg-slate-50 font-sans antialiased flex">
      <aside className="w-[220px] flex-shrink-0 bg-white hidden md:flex md:flex-col">
        {/* Logo sits at the top of the sidebar column so the right
            preview pane + its vertical divider can reach the very top
            of the viewport. The border-b extends the top-of-page
            hairline across this column so the divider runs unbroken
            from sidebar → main → preview pane. */}
        <div className="h-14 flex-shrink-0 flex items-center px-4 border-b border-slate-200">
          <Link
            href="/admin/albums"
            className="flex items-center"
            data-testid="link-admin-home"
          >
            <img src={gtLogo} alt="GoodTunes" className="h-8 w-auto" />
          </Link>
        </div>
        <nav className="flex-1 px-2 pt-2 space-y-0.5 border-r border-slate-200" data-testid="nav-admin-entities">
            <SidebarLink
              icon={Disc3}
              label="Albums"
              count={albumCount}
              active={active === "albums"}
              onClick={() => navigate("/admin/albums")}
              testId="nav-albums"
            />
            <SidebarLink
              icon={User}
              label="People"
              count={people.length}
              active={active === "people"}
              onClick={() => navigate("/admin/people")}
              testId="nav-people"
            />
            <SidebarLink
              icon={Guitar}
              label="Gear"
              count={instruments.length}
              active={active === "gear"}
              onClick={() => navigate("/admin/instruments")}
              testId="nav-gear"
            />
            <SidebarLink
              icon={Store}
              label="Vendors"
              count={vendors.length}
              active={active === "vendors"}
              onClick={() => navigate("/admin/vendors")}
              testId="nav-vendors"
            />
            <SidebarLink
              icon={Tag}
              label="Labels"
              count={labels.length}
              active={active === "labels"}
              onClick={() => navigate("/admin/labels")}
              testId="nav-labels"
            />
            <SidebarLink
              icon={Factory}
              label="Manufacturers"
              count={manufacturers.length}
              active={active === "manufacturers"}
              onClick={() => navigate("/admin/manufacturers")}
              testId="nav-manufacturers"
            />
            <SidebarLink
              icon={Truck}
              label="Fulfillment"
              count={fulfillment.length}
              active={active === "fulfillment"}
              onClick={() => navigate("/admin/fulfillment-partners")}
              testId="nav-fulfillment"
            />
            {/* Task #131 — Customers (fan-account directory). Sits
                between Fulfillment/Orders and Reports so the sales
                side of the sidebar reads as Fulfillment → Customers
                → Reports. */}
            <SidebarLink
              icon={Users}
              label="Customers"
              count={customerCount}
              active={active === "customers"}
              onClick={() => navigate("/admin/customers")}
              testId="nav-customers"
            />
            {/* Task #80 — Reports surface. No count here (it's a tool,
                not a CRUD list) so we pass -1 and special-case below. */}
            <SidebarLink
              icon={BarChart3}
              label="Reports"
              count={-1}
              active={active === "reports"}
              onClick={() => navigate("/admin/reports")}
              testId="nav-reports"
            />
            {isSuperAdmin && (
              <SidebarLink
                icon={DollarSign}
                label="Platform pricing"
                count={-1}
                active={active === "platform-pricing"}
                onClick={() => navigate("/admin/platform-pricing")}
                testId="nav-platform-pricing"
              />
            )}
          </nav>
        </aside>

      <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto relative flex flex-col">
        {/* Top header strip — matches the sidebar logo header height
            (h-14) so the bottom hairline runs unbroken across all
            three columns. The Admin chip lives here on the right;
            pages can use AdminPageHeader inside the body to render
            their own breadcrumb/title beneath this strip. */}
        <div className="h-14 flex-shrink-0 border-b border-slate-200 bg-white flex items-center justify-end px-4 sm:px-6">
          <AdminUserMenu />
        </div>
        <div className="max-w-[1180px] px-6 sm:px-8 pt-6 pb-8">{children}</div>
      </main>

        {/* RIGHT PREVIEW PANE — rendered only when the page passes
            preview content. Toggle persists in localStorage. Collapsed
            state leaves a 44px rail with the toggle so it's always one
            tap to bring the preview back. */}
        {preview && (
          <aside
            className={[
              "border-l border-slate-200 bg-white flex-shrink-0 transition-[width] duration-200 ease-out hidden lg:flex flex-col",
              previewOpen ? "w-[440px]" : "w-11",
            ].join(" ")}
            data-testid="admin-preview-pane"
            data-open={previewOpen ? "true" : "false"}
          >
            <div
              className={[
                "h-14 flex-shrink-0 border-b border-slate-200 flex items-center",
                previewOpen ? "justify-between px-3" : "justify-center px-0",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => setPreviewOpen((v) => !v)}
                className="w-8 h-8 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                title={previewOpen ? "Hide preview" : "Show preview"}
                aria-label={previewOpen ? "Hide preview" : "Show preview"}
                aria-pressed={previewOpen}
                data-testid="button-toggle-preview"
              >
                {previewOpen ? (
                  <PanelRightClose className="w-4 h-4" />
                ) : (
                  <PanelRightOpen className="w-4 h-4" />
                )}
              </button>
              {previewOpen && (
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Preview
                </span>
              )}
            </div>
            {previewOpen && (
              <div
                className="flex-1 overflow-y-auto p-6"
                data-testid="admin-preview-content"
              >
                {preview}
              </div>
            )}
          </aside>
        )}
    </div>
  );
}

function SidebarLink({
  icon: Icon,
  label,
  count,
  active,
  onClick,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={[
        "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors",
        active
          ? "bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]"
          : "text-slate-700 hover:bg-slate-100",
      ].join(" ")}
    >
      <Icon
        className={[
          "w-4 h-4 flex-shrink-0",
          active ? "text-[var(--brand-blue)]" : "text-slate-400",
        ].join(" ")}
      />
      <span className="flex-1 text-left">{label}</span>
      {count >= 0 && (
        <span
          className={[
            "tabular-nums text-[11.5px] font-bold",
            active ? "text-[var(--brand-blue)]" : "text-slate-400",
          ].join(" ")}
        >
          {count}
        </span>
      )}
    </button>
  );
}
