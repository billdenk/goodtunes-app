import { isValidElement, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Disc3,
  User,
  Guitar,
  Hammer,
  Store,
  Tag,
  Factory,
  Truck,
  Users,
  ArrowLeft,
  BarChart3,
  Activity,
  ChevronRight,
  DollarSign,
  LayoutDashboard,
  HeartHandshake,
  ShoppingBag,
  PanelRightClose,
  PanelRightOpen,
  Smartphone,
  Tablet,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AdminUserMenu } from "@/components/admin/AdminUserMenu";
import { ViewAsSwitcher } from "@/components/admin/ViewAsSwitcher";
import { AutoSyncAlertBanner } from "@/components/admin/AutoSyncAlertBanner";
import { AdminErrorBoundary } from "@/components/admin/AdminErrorBoundary";
import gtLogo from "@assets/2025_GoodTunes_Logo-dark.1_1778271422870.png";

const PREVIEW_OPEN_KEY = "gt:admin-preview-open";
const PREVIEW_DEVICE_KEY = "gt:admin-preview-device";
// Task #273 — per-admin record of which sidebar sections are expanded.
// Once an admin toggles a section it stays however they left it across
// reloads and navigations; we only fall back to "open the section
// containing the active page" when this key has never been written.
const SIDEBAR_SECTIONS_KEY = "gt:admin-sidebar-sections";

// Task #273 — maps every routable EntityKey to the sidebar section it
// belongs to. Used both for the "auto-expand on first ever load" rule
// and for the active-highlight that sits on a collapsed parent header
// when its child is the current page. Dashboard / none are top-level
// rows and have no parent section.
type SidebarSectionId =
  | "catalog"
  | "supply-chain"
  | "queues"
  | "audience"
  | "system";

const SECTION_FOR_ENTITY: Partial<Record<EntityKey, SidebarSectionId>> = {
  albums: "catalog",
  people: "catalog",
  labels: "catalog",
  nonprofits: "catalog",
  gear: "catalog",
  manufacturers: "supply-chain",
  makers: "supply-chain",
  vendors: "supply-chain",
  fulfillment: "supply-chain",
  "pressing-orders": "queues",
  "fan-orders": "queues",
  jobs: "queues",
  customers: "audience",
  reports: "audience",
  "platform-pricing": "system",
};

export type PreviewDevice = "phone" | "tablet";

/**
 * Multi-device preview content. Pages that only have a phone preview
 * can keep passing a plain ReactNode to `preview` — the frame infers
 * "phone-only" and hides the device toggle. Pages with both variants
 * (today: AdminAlbum) pass `{ phone, tablet }` and get a segmented
 * toggle in the preview pane header.
 */
export interface PreviewDevices {
  phone: ReactNode;
  tablet?: ReactNode;
}

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
  | "dashboard"
  | "albums"
  | "people"
  | "nonprofits"
  | "gear"
  | "makers"
  | "vendors"
  | "labels"
  | "manufacturers"
  | "pressing-orders"
  | "fan-orders"
  | "fulfillment"
  | "customers"
  | "reports"
  | "jobs"
  | "platform-pricing"
  | "none";

export function AdminFrame({
  active,
  preview,
  contentWidth = "wide",
  children,
}: {
  active: EntityKey;
  /**
   * Optional fan-side preview to render in the collapsible right pane.
   * When omitted (list pages, loading/error states) the pane is hidden
   * entirely so the editor gets the full main column.
   */
  preview?: ReactNode | PreviewDevices;
  /**
   * Inner content cap. List/grid pages (Albums, People, Gear, Vendors,
   * Reports, Jobs) want the full 1440px main-column from Task #169 so
   * 4K monitors can fit more rows/cards per row — that's `"wide"` and
   * the default. Single-record edit/detail forms (Album edit, Person
   * detail, Vendor edit, etc.) opt in to `"narrow"` (~960px) so a row
   * of label + input stays comfortable to scan instead of stretching
   * the eye across 1440px. Opt-in per page (not a shell-wide flip) so
   * a new list page doesn't accidentally inherit the narrow cap.
   */
  contentWidth?: "wide" | "narrow";
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  // Opt every admin route that uses this frame into the light theme by
  // tagging <body>. The matching `body.gt-admin` rule in index.css
  // overrides the global dark body bg AND retunes the shadcn semantic
  // tokens (--background, --primary, --border, --input, --ring, etc.)
  // to the Stripe-leaning light palette so every <Button>, <Input>,
  // <Select>, <Tabs> primitive auto-picks up the admin look. Without
  // this, pages like Reports/Jobs that don't add the class themselves
  // fall back to the fan-player dark tokens and render with a black
  // active tab pill, dark date inputs, and a dark "Try again" button.
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

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

  // Selected device for the preview pane. Persisted alongside the
  // open/closed state so reopening (or navigating between admin pages)
  // restores the last-chosen device. Only meaningful when the page
  // supplies a tablet variant — phone-only pages ignore this state.
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>(() => {
    if (typeof window === "undefined") return "phone";
    try {
      const raw = window.localStorage.getItem(PREVIEW_DEVICE_KEY);
      return raw === "tablet" ? "tablet" : "phone";
    } catch {
      return "phone";
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(PREVIEW_DEVICE_KEY, previewDevice);
    } catch {}
  }, [previewDevice]);

  // Normalize the `preview` prop. Legacy callers pass a single ReactNode
  // (treated as the phone variant); new callers can pass
  // `{ phone, tablet }` to opt into the device toggle.
  const isDevicesPreview =
    !!preview &&
    typeof preview === "object" &&
    !isValidElement(preview) &&
    "phone" in (preview as object);
  const devicesPreview: PreviewDevices | null = isDevicesPreview
    ? (preview as PreviewDevices)
    : preview
      ? { phone: preview as ReactNode }
      : null;
  const hasTabletVariant = !!devicesPreview?.tablet;

  // Task #299 — Viewport-aware preview sizing. The preview pane is
  // shown at `lg` and up (≥1024px), but the user's chosen device
  // (phone 440 / tablet 760) can easily push sidebar+main+preview past
  // the viewport on a 1280–1440px laptop and force a page-level
  // horizontal scrollbar that hides the left nav when the operator
  // scrolls right to see the clipped preview. Cap the user's
  // preference by what actually fits: tablet needs room for
  // sidebar(220) + a sensible main minimum + tablet(760); phone needs
  // the same with phone(440); below that we collapse the pane to its
  // 44px rail so the toggle stays reachable. The user's manual choice
  // (previewDevice / previewOpen) is preserved in localStorage and
  // re-applied as the viewport grows.
  const SIDEBAR_W = 220;
  const MAIN_MIN = 520;
  const TABLET_W = 760;
  const PHONE_W = 440;
  const RAIL_W = 44;
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const canFitTablet =
    viewportWidth >= SIDEBAR_W + MAIN_MIN + TABLET_W;
  const canFitPhone = viewportWidth >= SIDEBAR_W + MAIN_MIN + PHONE_W;
  const effectiveDevice: PreviewDevice =
    hasTabletVariant && previewDevice === "tablet" && canFitTablet
      ? "tablet"
      : "phone";
  // When the user wants the pane open but even the phone width won't
  // fit, render the rail (functionally collapsed) without flipping the
  // stored preference — as soon as the window widens, the pane pops
  // back open at the chosen device.
  const previewDisplayOpen = previewOpen && canFitPhone;
  const previewWidthPx = !previewDisplayOpen
    ? RAIL_W
    : effectiveDevice === "tablet"
      ? TABLET_W
      : PHONE_W;
  const previewNode = devicesPreview
    ? effectiveDevice === "tablet"
      ? devicesPreview.tablet
      : devicesPreview.phone
    : null;

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
  // Task #174 — Vendors split into Makers + Resellers. Both feed off the
  // same `/api/vendors` table; the sidebar uses the `?role=` query so
  // each row counts only its half of the world. A vendor with both
  // flags (e.g. Gibson) counts on both sides — that's the point.
  const { data: vendors = [] } = useQuery<Array<{ isMaker?: boolean; isReseller?: boolean }>>({
    queryKey: ["/api/vendors"],
    enabled: !!user?.isAdmin,
  });
  const makerCount = vendors.filter((v) => v.isMaker).length;
  const resellerCount = vendors.filter((v) => v.isReseller).length;
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
  // Task #234 — Fan-orders sidebar badge mirrors the "Active" tab on
  // /admin/fan-orders: orders currently in flight (paid or shipped,
  // not refunded, not returned). Same /api/admin/orders payload the
  // page itself uses so the badge stays in lockstep without a second
  // endpoint.
  const { data: fanOrders = [] } = useQuery<
    Array<{ status: string; fulfillmentStatus?: string | null; returnedAt?: string | null }>
  >({
    queryKey: ["/api/admin/orders"],
    enabled: !!user?.isAdmin,
  });
  const fanOrdersActiveCount = fanOrders.filter(
    (o) =>
      (o.status === "paid" || o.status === "shipped") &&
      !o.returnedAt &&
      o.fulfillmentStatus !== "returned",
  ).length;
  // Task #230 — NPO directory count drives the badge on the new NPOs
  // sidebar entry. Reuses the same /api/non-profits payload the rest
  // of the admin already hits.
  const { data: nonProfits = [] } = useQuery<unknown[]>({
    queryKey: ["/api/non-profits"],
    enabled: !!user?.isAdmin,
  });
  // Task #119 — Platform Pricing is super-admin-only; we hide the
  // sidebar link entirely for other roles so they don't see a tab
  // that 403s when they click it.
  const { data: roleInfo } = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
    enabled: !!user?.isAdmin,
  });
  const isSuperAdmin = roleInfo?.role === "super_admin";

  // Task #273 + #309 — Collapsible sidebar sections (Stripe-style),
  // accordion: at most one section open at a time. State persists to
  // localStorage so the admin's choice survives reloads and route
  // changes. On first load with no stored value we expand the section
  // containing the current page; after that the stored value wins and
  // we never auto-expand on navigation.
  const activeSection = SECTION_FOR_ENTITY[active] ?? null;
  // The stored shape used to be a `{ id: boolean }` map (Task #273);
  // tolerate that on first read so we don't reset admins who upgraded.
  const [openSection, setOpenSection] = useState<SidebarSectionId | null>(
    () => {
      if (typeof window === "undefined") {
        return activeSection;
      }
      try {
        const raw = window.localStorage.getItem(SIDEBAR_SECTIONS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed === "string" || parsed === null) {
            return parsed as SidebarSectionId | null;
          }
          if (parsed && typeof parsed === "object") {
            const firstOpen = Object.keys(parsed).find(
              (k) => (parsed as Record<string, unknown>)[k],
            );
            if (firstOpen) return firstOpen as SidebarSectionId;
            return activeSection;
          }
        }
      } catch {}
      return activeSection;
    },
  );
  useEffect(() => {
    try {
      window.localStorage.setItem(
        SIDEBAR_SECTIONS_KEY,
        JSON.stringify(openSection),
      );
    } catch {}
  }, [openSection]);
  const toggleSection = (id: SidebarSectionId) =>
    setOpenSection((prev) => (prev === id ? null : id));
  const isSectionOpen = (id: SidebarSectionId) => openSection === id;

  return (
    <div className="h-screen w-screen overflow-x-hidden bg-slate-50 font-sans antialiased flex">
      <aside className="w-[220px] flex-shrink-0 bg-white hidden md:flex md:flex-col">
        {/* Logo sits at the top of the sidebar column so the right
            preview pane + its vertical divider can reach the very top
            of the viewport. The border-b extends the top-of-page
            hairline across this column so the divider runs unbroken
            from sidebar → main → preview pane. */}
        <div className="h-14 flex-shrink-0 flex items-center px-4 border-b border-slate-200">
          <Link
            href="/admin/dashboard"
            className="flex items-center"
            data-testid="link-admin-home"
          >
            <img src={gtLogo} alt="GoodTunes" className="h-8 w-auto" />
          </Link>
        </div>
        <nav className="flex-1 px-2 pt-2 pb-3 space-y-0.5 border-r border-slate-200 overflow-y-auto" data-testid="nav-admin-entities">
            {/* Task #140 — Dashboard sits above the labelled sections as
                the admin's at-a-glance home. No section header; it's a
                solo entry. */}
            <SidebarLink
              icon={LayoutDashboard}
              label="Dashboard"
              count={-1}
              active={active === "dashboard"}
              onClick={() => navigate("/admin/dashboard")}
              testId="nav-dashboard"
            />

            {/* Task #230 — Sidebar is grouped into labelled sections so
                the relationship between catalog nouns, supply-chain
                vendors, and action queues is obvious.
                Task #273 — Section headers are now clickable rows that
                expand/collapse their children (Stripe-style). The blue
                "active" highlight rides on the collapsed parent when
                the current page lives inside it, so admins can tell
                which section they're in without auto-opening it. */}
            <Section
              id="catalog"
              label="Catalog"
              containsActive={activeSection === "catalog"}
              expanded={isSectionOpen("catalog")}
              onToggle={() => toggleSection("catalog")}
            >
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
                icon={Tag}
                label="Labels"
                count={labels.length}
                active={active === "labels"}
                onClick={() => navigate("/admin/labels")}
                testId="nav-labels"
              />
              {/* Task #230 — NPO partner directory (page existed before
                  but was never linked from the sidebar). */}
              <SidebarLink
                icon={HeartHandshake}
                label="NPOs"
                count={nonProfits.length}
                active={active === "nonprofits"}
                onClick={() => navigate("/admin/non-profits")}
                testId="nav-nonprofits"
              />
              <SidebarLink
                icon={Guitar}
                label="Gear"
                count={instruments.length}
                active={active === "gear"}
                onClick={() => navigate("/admin/instruments")}
                testId="nav-gear"
              />
            </Section>

            <Section
              id="supply-chain"
              label="Supply chain"
              containsActive={activeSection === "supply-chain"}
              expanded={isSectionOpen("supply-chain")}
              onToggle={() => toggleSection("supply-chain")}
            >
              {/* Task #174 — vinyl pressing plants are now labelled
                  "Presses" so the noun doesn't clash with "Maker" (gear
                  builder). URL stays /admin/manufacturers. */}
              <SidebarLink
                icon={Factory}
                label="Presses"
                count={manufacturers.length}
                active={active === "manufacturers"}
                onClick={() => navigate("/admin/manufacturers")}
                testId="nav-manufacturers"
              />
              {/* Task #174 — Makers and Resellers are two sides of the
                  same vendor table. A single row can carry both flags
                  (Gibson sits in both counts). */}
              <SidebarLink
                icon={Hammer}
                label="Makers"
                count={makerCount}
                active={active === "makers"}
                onClick={() => navigate("/admin/makers")}
                testId="nav-makers"
              />
              <SidebarLink
                icon={Store}
                label="Resellers"
                count={resellerCount}
                active={active === "vendors"}
                onClick={() => navigate("/admin/vendors")}
                testId="nav-vendors"
              />
              <SidebarLink
                icon={Truck}
                label="Fulfillment"
                count={fulfillment.length}
                active={active === "fulfillment"}
                onClick={() => navigate("/admin/fulfillment-partners")}
                testId="nav-fulfillment"
              />
            </Section>

            <Section
              id="queues"
              label="Queues"
              containsActive={activeSection === "queues"}
              expanded={isSectionOpen("queues")}
              onToggle={() => toggleSection("queues")}
            >
              {/* Task #225 — Pressing-order review inbox. Tool, not a CRUD
                  list, so we pass -1 to suppress the count. */}
              <SidebarLink
                icon={Factory}
                label="Pressing orders"
                count={-1}
                active={active === "pressing-orders"}
                onClick={() => navigate("/admin/pressing-orders")}
                testId="nav-pressing-orders"
              />
              {/* Task #234 — Fan orders queue. Badge reflects the in-flight
                  ("Active" tab) count so operators see their daily work
                  volume at a glance; the page itself splits All/Active/
                  Returns/Refunded with the same data. */}
              <SidebarLink
                icon={ShoppingBag}
                label="Fan orders"
                count={fanOrdersActiveCount}
                active={active === "fan-orders"}
                onClick={() => navigate("/admin/fan-orders")}
                testId="nav-fan-orders"
              />
              {/* Task #136 — Auto-sync-lyrics job history. Tool, not a CRUD
                  list, so we pass -1 to suppress the count. */}
              <SidebarLink
                icon={Activity}
                label="Jobs"
                count={-1}
                active={active === "jobs"}
                onClick={() => navigate("/admin/jobs")}
                testId="nav-jobs"
              />
            </Section>

            <Section
              id="audience"
              label="Audience"
              containsActive={activeSection === "audience"}
              expanded={isSectionOpen("audience")}
              onToggle={() => toggleSection("audience")}
            >
              {/* Task #131 — Customers (fan-account directory). */}
              <SidebarLink
                icon={Users}
                label="Customers"
                count={customerCount}
                active={active === "customers"}
                onClick={() => navigate("/admin/customers")}
                testId="nav-customers"
              />
              {/* Task #80 — Reports surface. No count (it's a tool, not
                  a CRUD list). */}
              <SidebarLink
                icon={BarChart3}
                label="Reports"
                count={-1}
                active={active === "reports"}
                onClick={() => navigate("/admin/reports")}
                testId="nav-reports"
              />
            </Section>

            {isSuperAdmin && (
              <Section
                id="system"
                label="System"
                containsActive={activeSection === "system"}
                expanded={isSectionOpen("system")}
                onToggle={() => toggleSection("system")}
              >
                <SidebarLink
                  icon={DollarSign}
                  label="Platform pricing"
                  count={-1}
                  active={active === "platform-pricing"}
                  onClick={() => navigate("/admin/platform-pricing")}
                  testId="nav-platform-pricing"
                />
              </Section>
            )}
          </nav>
        </aside>

      <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto relative flex flex-col">
        {/* Top header strip — matches the sidebar logo header height
            (h-14) so the bottom hairline runs unbroken across all
            three columns. The Admin chip lives here on the right;
            pages can use AdminPageHeader inside the body to render
            their own breadcrumb/title beneath this strip. */}
        <div className="h-14 flex-shrink-0 border-b border-slate-200 bg-white flex items-center justify-between gap-3 px-4 sm:px-6">
          <ViewAsSwitcher />
          <AdminUserMenu />
        </div>
        {/* Task #138 — Passive STT-creep alert banner. Lives outside
            the page-content max-width wrapper so it spans uniformly
            across every admin page without each page having to opt in. */}
        <AutoSyncAlertBanner />
        <div
          className={[
            "mx-auto w-full px-6 sm:px-8 pt-6 pb-8",
            contentWidth === "narrow" ? "max-w-[960px]" : "max-w-[1440px]",
          ].join(" ")}
        >
          <AdminErrorBoundary>{children}</AdminErrorBoundary>
        </div>
      </main>

        {/* RIGHT PREVIEW PANE — rendered only when the page passes
            preview content. Toggle persists in localStorage. Collapsed
            state leaves a 44px rail with the toggle so it's always one
            tap to bring the preview back. */}
        {devicesPreview && (
          <aside
            className="border-l border-slate-200 bg-white flex-shrink-0 transition-[width] duration-200 ease-out hidden lg:flex flex-col"
            style={{ width: previewWidthPx }}
            data-testid="admin-preview-pane"
            data-open={previewDisplayOpen ? "true" : "false"}
            data-device={effectiveDevice}
          >
            <div
              className={[
                "h-14 flex-shrink-0 border-b border-slate-200 flex items-center",
                previewDisplayOpen ? "justify-between px-3" : "justify-center px-0",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => setPreviewOpen((v) => !v)}
                className="w-8 h-8 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                title={previewDisplayOpen ? "Hide preview" : "Show preview"}
                aria-label={previewDisplayOpen ? "Hide preview" : "Show preview"}
                aria-pressed={previewDisplayOpen}
                data-testid="button-toggle-preview"
              >
                {previewDisplayOpen ? (
                  <PanelRightClose className="w-4 h-4" />
                ) : (
                  <PanelRightOpen className="w-4 h-4" />
                )}
              </button>
              {previewDisplayOpen && (
                <div className="flex items-center gap-2">
                  {hasTabletVariant && (
                    <div
                      className="flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5"
                      role="group"
                      aria-label="Preview device"
                      data-testid="preview-device-toggle"
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewDevice("phone")}
                        className={[
                          "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
                          effectiveDevice === "phone"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-900",
                        ].join(" ")}
                        title="Phone preview"
                        aria-label="Phone preview"
                        aria-pressed={effectiveDevice === "phone"}
                        data-testid="button-preview-device-phone"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewDevice("tablet")}
                        className={[
                          "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
                          effectiveDevice === "tablet"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-900",
                        ].join(" ")}
                        title="Tablet preview"
                        aria-label="Tablet preview"
                        aria-pressed={effectiveDevice === "tablet"}
                        data-testid="button-preview-device-tablet"
                      >
                        <Tablet className="w-4 h-4 rotate-90" />
                      </button>
                    </div>
                  )}
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Preview
                  </span>
                </div>
              )}
            </div>
            {previewDisplayOpen && (
              <div
                className="flex-1 overflow-y-auto p-6"
                data-testid="admin-preview-content"
              >
                {previewNode}
              </div>
            )}
          </aside>
        )}
    </div>
  );
}

// Task #273 — Sidebar section: clickable header row that expands/
// collapses its children (Stripe-style). The header matches the
// SidebarLink visual rhythm (same height, padding, type weight, hover
// treatment) and uses a rotating chevron in the icon slot to advertise
// the toggle. Children indent one step so the hierarchy reads from
// indentation, not from a separate header style. When the section is
// collapsed AND the current page lives inside it, the header itself
// carries the brand-blue "active" highlight so admins can tell where
// they are without auto-opening the section.
function Section({
  id,
  label,
  containsActive,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  containsActive: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const highlightParent = containsActive && !expanded;
  return (
    <div className="pt-2 first:pt-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        data-testid={`nav-section-${id}`}
        data-active={highlightParent ? "true" : "false"}
        className={[
          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors",
          highlightParent
            ? "bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]"
            : "text-slate-700 hover:bg-slate-100",
        ].join(" ")}
      >
        <ChevronRight
          className={[
            "w-4 h-4 flex-shrink-0 transition-transform",
            expanded ? "rotate-90" : "",
            highlightParent ? "text-[var(--brand-blue)]" : "text-slate-400",
          ].join(" ")}
        />
        <span className="flex-1 text-left">{label}</span>
      </button>
      {expanded && (
        <div className="pl-4 mt-0.5 space-y-0.5">{children}</div>
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
