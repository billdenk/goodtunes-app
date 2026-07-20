import { isValidElement, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Disc3,
  User,
  Guitar,
  Gift,
  Hammer,
  Store,
  Tag,
  Factory,
  Truck,
  Radar,
  Users,
  UserPlus,
  ArrowLeft,
  BarChart3,
  Activity,
  ChevronRight,
  DollarSign,
  LayoutDashboard,
  GitBranch,
  Settings as Cog,
  Mail,
  MessageSquare,
  ClipboardList,
  FlaskConical,
  HeartHandshake,
  ShoppingBag,
  PanelRightClose,
  PanelRightOpen,
  Receipt,
  ScrollText,
  Smartphone,
  Tablet,
  Wallet,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AdminUserMenu } from "@/components/admin/AdminUserMenu";
import { AutoSyncAlertBanner } from "@/components/admin/AutoSyncAlertBanner";
import { MuxStatusBanner } from "@/components/admin/MuxStatusBanner";
import { PlacesBanner as PlacesBannerSlot } from "@/components/admin/AddressAutocompleteField";
import { AdminErrorBoundary } from "@/components/admin/AdminErrorBoundary";
import { AdminSearchBar } from "@/components/admin/AdminSearchBar";
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
  | "partners"
  | "queues"
  | "audience"
  | "system";

const SECTION_FOR_ENTITY: Partial<Record<EntityKey, SidebarSectionId>> = {
  albums: "catalog",
  people: "catalog",
  gear: "catalog",
  "custom-addons": "catalog",
  labels: "partners",
  managers: "partners",
  shopify: "partners",
  nonprofits: "partners",
  manufacturers: "partners",
  "press-match": "partners",
  makers: "partners",
  vendors: "partners",
  fulfillment: "partners",
  "pressing-orders": "queues",
  "fan-orders": "queues",
  "cert-names": "queues",
  feedback: "queues",
  jobs: "queues",
  "qa-orders": "queues",
  customers: "audience",
  "platform-pricing": "system",
  "payouts-release": "system",
  invites: "system",
  "invite-directory": "system",
  trash: "system",
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
  | "custom-addons"
  | "makers"
  | "vendors"
  | "payouts-release"
  | "labels"
  | "managers"
  | "shopify"
  | "manufacturers"
  | "press-match"
  | "pressing-orders"
  | "fan-orders"
  | "cert-names"
  | "feedback"
  | "qa-orders"
  | "early-cut"
  | "fulfillment"
  | "customers"
  | "reports"
  | "jobs"
  | "platform-pricing"
  | "gooddeed-pricing"
  | "publishing"
  | "invites"
  | "invite-tree"
  | "invite-directory"
  | "trash"
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
  const [location, navigate] = useLocation();

  // Opt every admin route that uses this frame into the light theme by
  // tagging <body>. The matching `body.gt-admin` rule in index.css
  // overrides the global dark body bg AND retunes the shadcn semantic
  // tokens (--background, --primary, --border, --input, --ring, etc.)
  // to the Stripe-leaning light palette so every <Button>, <Input>,
  // <Select>, <Tabs> primitive auto-picks up the admin look. Without
  // this, pages like Reports/Jobs that don't add the class themselves
  // fall back to the fan-player dark tokens and render with a black
  // active tab pill, dark date inputs, and a dark "Try again" button.
  //
  // Task #425 — Re-apply on every location change and NEVER remove on
  // unmount. The synchronous bootstrap in main.tsx handles the very
  // first paint, but a wouter transition that briefly unmounts
  // AdminFrame between two admin pages (or an HMR refresh) would
  // otherwise run a cleanup that strips the class and re-introduces
  // the dark fan-player gradient flash. The pre-React handoff in
  // main.tsx + this idempotent re-apply guarantee `body.gt-admin`
  // stays attached for the entire time the URL is on an admin route;
  // it's harmless to leave attached afterwards because the customer
  // shell on a hard navigation reloads the page and resets <body>.
  useEffect(() => {
    document.body.classList.add("gt-admin");
  }, [location]);

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
  // Task #1425 — managers are a label-style partner roster; count feeds
  // the Partners-section nav badge next to Labels.
  const { data: managers = [] } = useQuery<unknown[]>({
    queryKey: ["/api/managers"],
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
  // Feedback badge counts all unresolved reports (everything except terminal
  // statuses). Terminal = operator explicitly closed the item.
  const FEEDBACK_TERMINAL_STATUSES = new Set(["closed"]);
  const { data: feedbackRows = [] } = useQuery<Array<{ status: string }>>({
    queryKey: ["/api/admin/feedback"],
    enabled: !!user?.isAdmin,
  });
  const feedbackNewCount = feedbackRows.filter((f) => !FEEDBACK_TERMINAL_STATUSES.has(f.status)).length;
  // Task #2279 — QA Orders cleanup nav entry is only meaningful when
  // Stripe is in test mode (pk_test_ key), i.e. dev / non-production.
  // Reuse the public publishable-key endpoint the BuySheet already hits
  // so we don't need a new route just to learn the mode.
  const { data: checkoutCfg } = useQuery<{ isTestMode?: boolean }>({
    queryKey: ["/api/checkout/publishable-key"],
    enabled: !!user?.isAdmin,
  });
  const isStripeTestMode = !!checkoutCfg?.isTestMode;
  // Only fetch the QA-order count when we're actually in test mode and
  // the link will render — keeps prod from polling an endpoint whose
  // nav entry never shows.
  const { data: qaOrders = [] } = useQuery<unknown[]>({
    queryKey: ["/api/admin/qa-orders"],
    enabled: !!user?.isAdmin && isStripeTestMode,
  });
  const qaOrderCount = qaOrders.length;
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
  const { data: roleInfo } = useQuery<{
    role: string;
    roleScopeId: string | null;
    canInvite?: boolean;
    devImpersonating?: boolean;
    devPersonaLabel?: string | null;
  }>({
    queryKey: ["/api/me/role"],
    enabled: !!user?.isAdmin,
  });
  const isSuperAdmin = roleInfo?.role === "super_admin";
  // Task #1791 — hide the Invites nav entry entirely when the backend
  // says this caller can't send invites (matches the AdminInvites gate +
  // POST /api/admin/invites). Default permissive until role resolves so
  // super-admins never see a flash of a missing item.
  const canInvite = roleInfo === undefined || roleInfo.canInvite !== false;
  // Artist partners now get a full sectioned nav (not just "My releases").
  // Global search (which spans every entity) is still hidden for artists.
  const isArtist = roleInfo?.role === "artist";
  // Task #933 — press (manufacturer) & non-profit partners are trimmed:
  // their real home is their dark partner portal; inside the admin shell
  // they can only read Reports + GoodDeed pricing.
  const isPress = roleInfo?.role === "manufacturer";
  const isNonProfit = roleInfo?.role === "non_profit";
  // Task #2081 — label & manager partners live in their own scoped
  // left-nav portal (/label, /manager). Inside the shared admin shell
  // (reached only via the scoped Reports link) they are trimmed to
  // Dashboard (back to their portal) + Reports — never the global
  // catalog/people/labels nav or global search.
  const isLabel = roleInfo?.role === "label";
  const isManager = roleInfo?.role === "manager";
  // isTrimmedPartner gates the global search bar (artists are included
  // since global search spans all entities, not just theirs).
  const isTrimmedPartner = isArtist || isPress || isNonProfit || isLabel || isManager;
  const partnerHome = isPress
    ? "/vendor"
    : isNonProfit
      ? "/non-profit"
      : isLabel
        ? "/label"
        : isManager
          ? "/manager"
          : "/admin/dashboard";

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
            // Task #580 — migrate the retired "supply-chain" section id
            // to its replacement "partners" so admins who had it open
            // don't see a stuck-collapsed orphan.
            if (parsed === "supply-chain") return "partners";
            return parsed as SidebarSectionId | null;
          }
          if (parsed && typeof parsed === "object") {
            const firstOpen = Object.keys(parsed).find(
              (k) => (parsed as Record<string, unknown>)[k],
            );
            if (firstOpen) {
              if (firstOpen === "supply-chain") return "partners";
              return firstOpen as SidebarSectionId;
            }
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
    <div className="h-screen w-full overflow-x-hidden bg-slate-50 font-sans antialiased flex">
      <aside className="w-[220px] flex-shrink-0 bg-white hidden md:flex md:flex-col">
        {/* Logo sits at the top of the sidebar column so the right
            preview pane + its vertical divider can reach the very top
            of the viewport. The border-b extends the top-of-page
            hairline across this column so the divider runs unbroken
            from sidebar → main → preview pane. */}
        <div className="h-14 flex-shrink-0 flex items-center px-4 border-b border-slate-200">
          <Link
            href={isArtist ? "/admin/dashboard" : isTrimmedPartner ? partnerHome : "/admin/dashboard"}
            className="flex items-center"
            data-testid="link-admin-home"
          >
            <img src={gtLogo} alt="GoodTunes" className="h-8 w-auto" />
          </Link>
        </div>
        {/* Task #336 — Global admin search. Sits above Dashboard so it
            anchors the top of the sidebar; ⌘K opens/focuses from
            anywhere in the admin shell. */}
        {!isTrimmedPartner && (
          <div className="px-2 pt-2 border-r border-slate-200">
            <AdminSearchBar />
          </div>
        )}
        <nav className="flex-1 px-2 pt-2 pb-3 space-y-0.5 border-r border-slate-200 overflow-y-auto" data-testid="nav-admin-entities">
            {isArtist ? (
              <>
                {/* Dashboard — artist's at-a-glance home. */}
                <SidebarLink
                  icon={LayoutDashboard}
                  label="Dashboard"
                  count={-1}
                  active={active === "dashboard"}
                  onClick={() => navigate("/admin/dashboard")}
                  testId="nav-dashboard"
                />

                <Section
                  id="catalog"
                  label="Catalog"
                  containsActive={activeSection === "catalog"}
                  expanded={isSectionOpen("catalog")}
                  onToggle={() => toggleSection("catalog")}
                >
                  <SidebarLink
                    icon={User}
                    label="People"
                    count={people.length}
                    active={active === "people"}
                    onClick={() => navigate("/admin/people")}
                    testId="nav-people"
                  />
                  <SidebarLink
                    icon={Disc3}
                    label="Albums"
                    count={albumCount}
                    active={active === "albums"}
                    onClick={() => navigate("/admin/albums")}
                    testId="nav-albums"
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
                    icon={Gift}
                    label="Custom add-ons"
                    active={active === "custom-addons"}
                    onClick={() => navigate("/admin/custom-addons")}
                    testId="nav-custom-addons"
                  />
                </Section>

                {/* Partners — NPOs the artist works with. */}
                <Section
                  id="partners"
                  label="Partners"
                  containsActive={activeSection === "partners"}
                  expanded={isSectionOpen("partners")}
                  onToggle={() => toggleSection("partners")}
                >
                  <SidebarLink
                    icon={HeartHandshake}
                    label="NPOs"
                    count={nonProfits.length}
                    active={active === "nonprofits"}
                    onClick={() => navigate("/admin/non-profits")}
                    testId="nav-nonprofits"
                  />
                </Section>

                {/* Queues — fan orders for the artist's albums. */}
                <Section
                  id="queues"
                  label="Queues"
                  containsActive={activeSection === "queues"}
                  expanded={isSectionOpen("queues")}
                  onToggle={() => toggleSection("queues")}
                >
                  <SidebarLink
                    icon={ShoppingBag}
                    label="Fan orders"
                    count={fanOrdersActiveCount}
                    active={active === "fan-orders"}
                    onClick={() => navigate("/admin/fan-orders")}
                    testId="nav-fan-orders"
                  />
                </Section>

                {/* Audience — fans who have bought from this artist. */}
                <Section
                  id="audience"
                  label="Audience"
                  containsActive={activeSection === "audience"}
                  expanded={isSectionOpen("audience")}
                  onToggle={() => toggleSection("audience")}
                >
                  <SidebarLink
                    icon={Users}
                    label="Customers"
                    count={customerCount}
                    active={active === "customers"}
                    onClick={() => navigate("/admin/customers")}
                    testId="nav-customers"
                  />
                </Section>

                {/* Reports — artist-scoped analytics. */}
                <SidebarLink
                  icon={BarChart3}
                  label="Reports"
                  count={-1}
                  active={active === "reports"}
                  onClick={() => navigate("/admin/reports")}
                  testId="nav-reports"
                />

                {/* System — invite management. Task #1791 — hidden when
                    this artist's team can't invite (no invite_subusers),
                    matching the AdminInvites gate so they never click into
                    a surface they can't use. */}
                {canInvite && (
                  <Section
                    id="system"
                    label="System"
                    containsActive={activeSection === "system"}
                    expanded={isSectionOpen("system")}
                    onToggle={() => toggleSection("system")}
                  >
                    <SidebarLink
                      icon={UserPlus}
                      label="Invites"
                      count={-1}
                      active={active === "invite-directory"}
                      onClick={() => navigate("/admin/invite-directory")}
                      testId="nav-invites"
                    />
                  </Section>
                )}
              </>
            ) : isLabel || isManager ? (
              // Task #2081 — label/manager scoped admin nav. Reached only
              // via the portal's "Reports" link; mirrors the press/NPO
              // trim minus GoodDeed pricing (label/manager don't print).
              <>
                <SidebarLink
                  icon={LayoutDashboard}
                  label="Dashboard"
                  count={-1}
                  active={false}
                  onClick={() => navigate(partnerHome)}
                  testId="nav-partner-home"
                />
                <SidebarLink
                  icon={BarChart3}
                  label="Reports"
                  count={-1}
                  active={active === "reports"}
                  onClick={() => navigate("/admin/reports")}
                  testId="nav-reports"
                />
              </>
            ) : isPress ? (
              // Task #2075 — a press only ever reaches an /admin/* page on
              // its own catalog editor (/admin/manufacturers/:ownId). Its
              // Reports now live INLINE in the scoped press portal, so this
              // rail links back to /vendor?tab=… instead of the operator
              // /admin/reports page (which the App.tsx press guard bounces).
              // Keeps the catalog page's sidebar consistent with the portal's
              // own left nav. Task #2222 — the standalone "GoodDeed pricing"
              // link was dropped here too: presses edit it inside Catalog →
              // format dropdown → GoodDeeds, so the redundant rail link is
              // hidden (this rail only ever shows to actual press logins).
              <>
                <SidebarLink
                  icon={LayoutDashboard}
                  label="Dashboard"
                  count={-1}
                  active={false}
                  onClick={() => navigate("/vendor")}
                  testId="nav-partner-home"
                />
                <SidebarLink
                  icon={Users}
                  label="Customers"
                  count={-1}
                  active={false}
                  onClick={() => navigate("/vendor?tab=customers")}
                  testId="nav-press-customers"
                />
                <SidebarLink
                  icon={GitBranch}
                  label="Pipeline"
                  count={-1}
                  active={false}
                  onClick={() => navigate("/vendor?tab=pipeline")}
                  testId="nav-press-pipeline"
                />
                <SidebarLink
                  icon={BarChart3}
                  label="Reports"
                  count={-1}
                  active={false}
                  onClick={() => navigate("/vendor?tab=reports")}
                  testId="nav-reports"
                />
                <SidebarLink
                  icon={Cog}
                  label="Settings"
                  count={-1}
                  active={false}
                  onClick={() => navigate("/vendor?tab=settings")}
                  testId="nav-press-settings"
                />
              </>
            ) : isNonProfit ? (
              <>
                <SidebarLink
                  icon={LayoutDashboard}
                  label="Dashboard"
                  count={-1}
                  active={false}
                  onClick={() => navigate(partnerHome)}
                  testId="nav-partner-home"
                />
                <SidebarLink
                  icon={BarChart3}
                  label="Reports"
                  count={-1}
                  active={active === "reports"}
                  onClick={() => navigate("/admin/reports")}
                  testId="nav-reports"
                />
                <SidebarLink
                  icon={Receipt}
                  label="GoodDeed pricing"
                  count={-1}
                  active={active === "gooddeed-pricing"}
                  onClick={() => navigate("/admin/gooddeed-pricing")}
                  testId="nav-gooddeed-pricing"
                />
              </>
            ) : (
            <>
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
                icon={User}
                label="People"
                count={people.length}
                active={active === "people"}
                onClick={() => navigate("/admin/people")}
                testId="nav-people"
              />
              <SidebarLink
                icon={Disc3}
                label="Albums"
                count={albumCount}
                active={active === "albums"}
                onClick={() => navigate("/admin/albums")}
                testId="nav-albums"
              />
              <SidebarLink
                icon={Guitar}
                label="Gear"
                count={instruments.length}
                active={active === "gear"}
                onClick={() => navigate("/admin/instruments")}
                testId="nav-gear"
              />
              {/* Task #844 — operator-built custom ("Gift of Hope") add-ons. */}
              <SidebarLink
                icon={Gift}
                label="Custom add-ons"
                active={active === "custom-addons"}
                onClick={() => navigate("/admin/custom-addons")}
                testId="nav-custom-addons"
              />
            </Section>

            {/* Task #580 — Partners section gathers every org type the
                catalog is attached to (Labels, NPOs, Presses, Makers,
                Resellers, Fulfillment). Replaces the old "Supply chain"
                section; localStorage state migrates over so admins who
                had it expanded stay expanded. */}
            <Section
              id="partners"
              label="Partners"
              containsActive={activeSection === "partners"}
              expanded={isSectionOpen("partners")}
              onToggle={() => toggleSection("partners")}
            >
              <SidebarLink
                icon={Tag}
                label="Labels"
                count={labels.length}
                active={active === "labels"}
                onClick={() => navigate("/admin/labels")}
                testId="nav-labels"
              />
              {/* Task #1425 — managers manage multiple acts; same Partners
                  section as Labels, roster auto-fills from tagged people. */}
              <SidebarLink
                icon={Users}
                label="Managers"
                count={managers.length}
                active={active === "managers"}
                onClick={() => navigate("/admin/managers")}
                testId="nav-managers"
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
              {/* Task #1013 — Find-a-press tool. Spec in → ranked presses
                  out; tool, not a CRUD list, so pass -1 to drop the count. */}
              <SidebarLink
                icon={Radar}
                label="Find a press"
                count={-1}
                active={active === "press-match"}
                onClick={() => navigate("/admin/press-match")}
                testId="nav-press-match"
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
                label="Press Orders"
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
              {/* Task #1609 — Digital GoodDeed cert name review. Tool, not
                  a CRUD list, so -1 suppresses the count. */}
              <SidebarLink
                icon={ScrollText}
                label="Cert names"
                count={-1}
                active={active === "cert-names"}
                onClick={() => navigate("/admin/cert-names")}
                testId="nav-cert-names"
              />
              {/* Task #533 — pool-funded early masters cut review inbox.
                  Tool, not a CRUD list, so -1 suppresses the count. */}
              <SidebarLink
                icon={Zap}
                label="Early cut review"
                count={-1}
                active={active === "early-cut"}
                onClick={() => navigate("/admin/early-cut")}
                testId="nav-early-cut"
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
              {/* Partner feedback / bug-report triage inbox.
                  Badge reflects all unresolved reports (excludes closed + wont_do). */}
              <SidebarLink
                icon={MessageSquare}
                label="Feedback"
                count={feedbackNewCount}
                active={active === "feedback"}
                onClick={() => navigate("/admin/feedback")}
                testId="nav-feedback"
              />
              {/* Task #2279 — QA test-order cleanup. Only shown when Stripe
                  is in test mode (dev / non-production) so testers can find
                  the page without knowing the URL; hidden entirely in prod
                  where there are no qa:test orders. Badge shows the count
                  only when > 0 (-1 suppresses it). */}
              {isStripeTestMode && (
                <SidebarLink
                  icon={FlaskConical}
                  label="QA Orders"
                  count={qaOrderCount > 0 ? qaOrderCount : -1}
                  active={active === "qa-orders"}
                  onClick={() => navigate("/admin/qa-orders")}
                  testId="nav-qa-orders"
                />
              )}
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
              {/* Task #400 — wave-1 welcome-back campaign for imported
                  gogoods.com fans. Tool surface (not a CRUD list). */}
              <SidebarLink
                icon={Mail}
                label="Welcome back"
                count={-1}
                active={active === "welcome-back"}
                onClick={() => navigate("/admin/welcome-back")}
                testId="nav-welcome-back"
              />
            </Section>

            {/* Task #580 — Reports is a cross-cutting analytics tool
                (sales / plays / payouts / GoodDeed / LCID dashboards),
                not an audience-only surface. Promoted to its own top-
                level row above System; no count because it's a tool. */}
            <SidebarLink
              icon={BarChart3}
              label="Reports"
              count={-1}
              active={active === "reports"}
              onClick={() => navigate("/admin/reports")}
              testId="nav-reports"
            />

            {/* Task #737 — read-only GoodDeed pricing summary. Lives
                ABOVE the super-admin-only System section so every admin
                role can read it; the edit cards stay on Platform pricing
                inside System. No count because it's a reference tool. */}
            <SidebarLink
              icon={Receipt}
              label="GoodDeed pricing"
              count={-1}
              active={active === "gooddeed-pricing"}
              onClick={() => navigate("/admin/gooddeed-pricing")}
              testId="nav-gooddeed-pricing"
            />

            {/* Publishing — mechanical-settlement section. Readable by
                every admin role (the transparency surface for publishers
                + the operator's per-song data-quality check). No count. */}
            <SidebarLink
              icon={ScrollText}
              label="Publishing"
              count={-1}
              active={active === "publishing"}
              onClick={() => navigate("/admin/publishing")}
              testId="nav-publishing"
            />

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
                {/* Task #543 — Bill-only payout-release queue. Visible
                    to every super_admin (read-only for non-Bill); the
                    page itself disables action buttons when the
                    viewer isn't Bill. */}
                <SidebarLink
                  icon={Wallet}
                  label="Payouts to release"
                  count={-1}
                  active={active === "payouts-release"}
                  onClick={() => navigate("/admin/payouts-release")}
                  testId="nav-payouts-release"
                />
                {/* Admin team invites — send admin / super-admin (and
                    partner) invite links. Super-admin-only surface, so it
                    lives in System next to the referral Invite tree. */}
                <SidebarLink
                  icon={UserPlus}
                  label="Invites"
                  count={-1}
                  active={active === "invites"}
                  onClick={() => navigate("/admin/invites")}
                  testId="nav-invites"
                />
                {/* Task #350 — Invite tree (multi-level referrals). */}
                <SidebarLink
                  icon={Users}
                  label="Invite tree"
                  count={-1}
                  active={active === "invite-tree"}
                  onClick={() => navigate("/admin/invite-tree")}
                  testId="nav-invite-tree"
                />
                {/* Task #1198 — Invite directory: read-only list of every
                    invite ever sent (pending + joined + revoked + expired). */}
                <SidebarLink
                  icon={ClipboardList}
                  label="Invite directory"
                  count={-1}
                  active={active === "invite-directory"}
                  onClick={() => navigate("/admin/invite-directory")}
                  testId="nav-invite-directory"
                />
              </Section>
            )}
            </>
            )}
          </nav>
        </aside>

      <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto relative flex flex-col">
        {/* Top header strip — matches the sidebar logo header height
            (h-14) so the bottom hairline runs unbroken across all
            three columns. The Admin chip lives here on the right;
            pages can use AdminPageHeader inside the body to render
            their own breadcrumb/title beneath this strip. */}
        <div className="sticky top-0 z-30 h-14 flex-shrink-0 border-b border-slate-200 bg-white flex items-center gap-3 px-4 sm:px-6">
          {/* Task #336 — On mobile the sidebar (and its search bar) is
              hidden, so render a second copy of the search input in the
              top strip so admins on phones still have a way in. */}
          <div className="flex-1 max-w-xs md:hidden">
            {/* registerShortcut=false — only the desktop sidebar copy
                owns the ⌘K window listener so the two mounted instances
                don't race for focus/open state. */}
            <AdminSearchBar registerShortcut={false} />
          </div>
          {/* Task #1794 — Hard-pin the avatar group to the right with
              ml-auto. justify-between collapsed a lone avatar to the left
              whenever its left-side siblings rendered nothing (mobile
              search is md:hidden), so the right group must own its anchor. */}
          <div className="ml-auto flex items-center gap-3">
            <AdminUserMenu />
          </div>
        </div>
        {/* Task #138 — Passive STT-creep alert banner. Lives outside
            the page-content max-width wrapper so it spans uniformly
            across every admin page without each page having to opt in. */}
        {/* Dev-only: amber banner whenever a synthetic impersonation hat is
            active. Makes it obvious the operator is in preview mode and
            provides a one-click exit back to god-view. */}
        {roleInfo?.devImpersonating && (
          <div className="flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-[12.5px]">
            <div className="flex items-center gap-2 text-amber-700">
              <span className="text-amber-500">🔬</span>
              <span className="font-semibold">Dev Preview</span>
              <span className="text-amber-600">·</span>
              <span>{roleInfo.devPersonaLabel ?? "Partner"}</span>
              <span className="text-amber-500 text-[11px]">— restricted shell is live; real partner sees this</span>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  const { apiRequest: api } = await import("@/lib/queryClient");
                  await api("DELETE", "/api/dev/impersonate-hat");
                } catch {}
                window.location.href = "/admin/dashboard";
              }}
              className="text-amber-700 hover:text-amber-900 font-medium underline text-[12px] flex-shrink-0"
              data-testid="button-exit-dev-preview-banner"
            >
              Exit Preview
            </button>
          </div>
        )}
        <AutoSyncAlertBanner />
        {/* Task #364 — Mux pipeline health (missing secrets, errored
            ingests, large not-ingested backlog). Same passive +
            per-set-dismissible pattern as AutoSyncAlertBanner. */}
        <MuxStatusBanner />
        <PlacesBannerSlot />
        <div
          className={[
            "mx-auto w-full px-6 sm:px-8 pt-6 pb-[120px]",
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
  const reduceMotion = useReducedMotion();
  // Stripe-style spring: short, slight overshoot on open; quick settle
  // on close. Reduced-motion users get an instant toggle (duration 0).
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
        data-testid={`nav-section-${id}`}
        data-active={highlightParent ? "true" : "false"}
        className={[
          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] transition-colors",
          highlightParent ? "font-bold" : "font-medium",
          highlightParent
            ? "bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]"
            : "text-slate-700 hover:bg-slate-100",
        ].join(" ")}
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
            className={[
              "w-4 h-4",
              highlightParent ? "text-[var(--brand-blue)]" : "text-slate-400",
            ].join(" ")}
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
  count?: number;
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
        "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] transition-colors",
        active ? "font-bold" : "font-medium",
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
      {count != null && count >= 0 && (
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
