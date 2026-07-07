import { useEffect, useRef } from "react";
import { Switch, Route, useLocation, useParams, Redirect } from "wouter";
import { AnimatePresence } from "framer-motion";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PlayerProvider, usePlayer } from "@/context/PlayerContext";
import { NavVisibilityProvider } from "@/hooks/useNavVisibility";
import { TopChromeFrostProvider } from "@/hooks/useTopChromeFrost";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import { DownloadEntitlementGuard } from "@/components/DownloadEntitlementGuard";
import { UploadManagerProvider } from "@/context/UploadManagerContext";
import { GlobalUploadIndicator } from "@/components/admin/GlobalUploadIndicator";
import { markBootSucceeded } from "@/lib/bootHeal";
import { initPushNotifications } from "@/lib/pushNotifications";
import { useTrackInAppNavigation } from "@/lib/navHistory";
import { useAuth } from "@/hooks/useAuth";
import { useAuthKind, isStoreHost } from "@/hooks/useAuthKind";
import { STOREFRONT_LAUNCH_ALBUM_ID } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getPreviewPass } from "@/lib/previewPass";
import { canAccessAdminSecurity } from "@/lib/adminAccess";
import { AccessNotAuthorizedDialog } from "@/components/admin/AccessNotAuthorizedDialog";
import { Player } from "@/pages/Player";
import { DesktopNowPlaying } from "@/components/ui/DesktopNowPlaying";
import { useTabletShell } from "@/hooks/useDesktopShell";
import { Login } from "@/pages/Login";
import {
  Home,
  Collection,
  CollectionSongs,
  CollectionArtists,
} from "@/pages/Collection";
import { AlbumDetail } from "@/pages/AlbumDetail";
import { AlbumDetailMobileSkeleton, AlbumNotFound, FanAppLoader } from "@/components/ui/AlbumDetailSkeleton";
import { InstrumentDetail } from "@/pages/InstrumentDetail";
import { Playlists } from "@/pages/Playlists";
import { Account } from "@/pages/Account";
import { EditAccount } from "@/pages/EditAccount";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { FavoriteArtists } from "@/pages/FavoriteArtists";
import { Bookmarks } from "@/pages/Bookmarks";
import { ArtistDetail } from "@/pages/ArtistDetail";
import { ArtistDashboard } from "@/pages/ArtistDashboard";
import { NonProfitDashboard } from "@/pages/NonProfitDashboard";
import { LabelDashboard } from "@/pages/LabelDashboard";
import { ManagerDashboard } from "@/pages/ManagerDashboard";
import { PublisherPortal } from "@/pages/PublisherPortal";
import { FanLabel } from "@/pages/FanLabel";
import { Chat, ChatThreadPage } from "@/pages/Chat";
import { SearchPage } from "@/pages/Search";
import { RecentsPage } from "@/pages/Recents";
import { Admin } from "@/pages/Admin";
import { AdminCustomers } from "@/pages/AdminCustomers";
import { AdminCustomerDetail } from "@/pages/AdminCustomerDetail";
import { AdminPlaylist } from "@/pages/AdminPlaylist";
import { AdminAlbums } from "@/pages/AdminAlbums";
import { AdminAlbum } from "@/pages/AdminAlbum";
import { AdminPeople } from "@/pages/AdminPeople";
import { AdminPerson } from "@/pages/AdminPerson";
import { AdminArtistBuyers } from "@/pages/AdminArtistBuyers";
import { AdminAlbumBuyers } from "@/pages/AdminAlbumBuyers";
import AdminNonProfit from "@/pages/AdminNonProfit";
import { AdminNonProfits } from "@/pages/AdminNonProfits";
import { AdminCustomAddons } from "@/pages/AdminCustomAddons";
import { AdminFanOrders } from "@/pages/AdminFanOrders";
import { AdminInstruments } from "@/pages/AdminInstruments";
import { AdminInstrument } from "@/pages/AdminInstrument";
import { AdminVendors } from "@/pages/AdminVendors";
import { AdminVendor } from "@/pages/AdminVendor";
import { AdminLabels } from "@/pages/AdminLabels";
import AdminTrash from "@/pages/AdminTrash";
import { AdminLabel } from "@/pages/AdminLabel";
import { AdminManagers } from "@/pages/AdminManagers";
import { AdminManager } from "@/pages/AdminManager";
import { AdminManufacturers } from "@/pages/AdminManufacturers";
import { AdminManufacturer } from "@/pages/AdminManufacturer";
import { AdminPressMatch } from "@/pages/AdminPressMatch";
import { AdminFulfillmentPartners } from "@/pages/AdminFulfillmentPartners";
import { AdminFulfillmentPartner } from "@/pages/AdminFulfillmentPartner";
import { Welcome } from "@/pages/Welcome";
import { WelcomeInvitee } from "@/pages/WelcomeInvitee";
// Task #400 — Welcome-back flow for imported gogoods.com fans.
import { WelcomeBack } from "@/pages/WelcomeBack";
// Task #537 — Finish-signup screen for OAuth-minted customer accounts.
import { FinishSetup } from "@/pages/FinishSetup";
import { AccountMerge } from "@/pages/AccountMerge";
// Task #1496 — Public account-deletion page for the Play Store Data safety form.
import DeleteAccount from "@/pages/DeleteAccount";
import { AdminWelcomeBack } from "@/pages/AdminWelcomeBack";
import { Orders } from "@/pages/Orders";
import { AdminOrders } from "@/pages/AdminOrders";
import { AdminPrintQueue } from "@/pages/AdminPrintQueue";
import { AdminQaOrders } from "@/pages/AdminQaOrders";
import { AdminCertNames } from "@/pages/AdminCertNames";
import { AdminFeedback } from "@/pages/AdminFeedback";
import { AdminLegacyImageAudit } from "@/pages/AdminLegacyImageAudit";
import { CertProvenance } from "@/pages/CertProvenance";
import { FindGoodDeed } from "@/pages/FindGoodDeed";
import AdminSecurity from "@/pages/AdminSecurity";
import { AdminInvites } from "@/pages/AdminInvites";
import { AdminPressEarlyCutQueue } from "@/pages/AdminPressEarlyCutQueue";
import { AdminInviteTree } from "@/pages/AdminInviteTree";
import { AdminInviteDirectory } from "@/pages/AdminInviteDirectory";
import { AdminReview } from "@/pages/AdminReview";
import { AdminPressingOrders } from "@/pages/AdminPressingOrders";
import AcceptInvite from "@/pages/AcceptInvite";
import JoinReferralLink from "@/pages/JoinReferralLink";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import { GiftClaim } from "@/pages/GiftClaim";
import { Redeem } from "@/pages/Redeem";
import { AdminShopify } from "@/pages/AdminShopify";
import { AdminAlbumEngagement } from "@/pages/AdminAlbumEngagement";
import { AnalyticsDebugOverlay } from "@/components/admin/AnalyticsDebugOverlay";
import { isAnalyticsDebugOverlayEnabled } from "@/lib/analytics";
import { NewFanWelcomeSheet } from "@/components/NewFanWelcomeSheet";
import { AdminReports } from "@/pages/AdminReports";
import { AdminJobs } from "@/pages/AdminJobs";
import { AdminPlatformPricing } from "@/pages/AdminPlatformPricing";
import { AdminPublishing } from "@/pages/AdminPublishing";
import { AdminGoodDeedPricing } from "@/pages/AdminGoodDeedPricing";
import AdminPayoutsRelease from "@/pages/AdminPayoutsRelease";
import { AdminDashboard } from "@/pages/AdminDashboard";
import { VendorPortal } from "@/pages/VendorPortal";
import ErrorPage from "@/pages/ErrorPage";
import { AdminShellErrorBoundary } from "@/components/admin/AdminShellErrorBoundary";
import { StorefrontSidebar } from "@/components/StorefrontSidebar";
import { DesktopLyricsRail } from "@/components/ui/DesktopLyricsRail";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FanAppLoader />;
  }

  // Preserve the admin/customer distinction on the dev URL — visiting
  // /admin/* unauthenticated should land on the admin-chromed login,
  // not the dark customer one.
  const isAdminPath =
    typeof window !== "undefined" && window.location.pathname.startsWith("/admin");

  if (!user) {
    return <Redirect to={isAdminPath ? "/admin/login" : "/login"} />;
  }

  // Task #424 — Wrap every admin-protected page in a top-level shell
  // error boundary so a throw inside AdminFrame (or any chrome it
  // renders) paints a visible "Admin failed to load" card instead of
  // the blank dark canvas we saw on iPad Safari. AdminFrame's inner
  // `AdminErrorBoundary` only catches the per-page content area; this
  // catches the chrome itself.
  if (isAdminPath) {
    return (
      <AdminShellErrorBoundary>
        <Component />
      </AdminShellErrorBoundary>
    );
  }

  return <Component />;
}

function PlayerOverlay() {
  const { showPlayer } = usePlayer();
  // Tablet+ web shells (md≥768, never native/phone) get the Apple-Music-style
  // full-screen DesktopNowPlaying; the phone shell keeps the mobile Player.
  const tabletPlus = useTabletShell();
  // AnimatePresence keeps the surface mounted while its exit (slide-down)
  // animation plays so closing eases back to the dock/mini-player instead of
  // vanishing. The open animation rides the motion.div's initial/animate.
  return (
    <AnimatePresence>
      {showPlayer &&
        (tabletPlus ? (
          <DesktopNowPlaying key="now-playing-desktop" />
        ) : (
          <Player key="now-playing" />
        ))}
    </AnimatePresence>
  );
}

// Task #936 — the store.goodtunes.music launch storefront. Reuses the existing
// preview-first album surface (hero art, Preview & Purchase CTA, embedded
// Stripe Buy flow) by rendering the launch release directly — no id in the URL.
// Dev DBs can override the prod launch row via VITE_LAUNCH_ALBUM_ID.
function Storefront() {
  const launchAlbumId =
    (import.meta.env.VITE_LAUNCH_ALBUM_ID as string | undefined) ||
    STOREFRONT_LAUNCH_ALBUM_ID;
  return <AlbumDetail albumId={launchAlbumId} />;
}

// Task #1310 — two-part artist/album share link
// (get.goodtunes.music/<artist>/<album>). Resolves via the PUBLIC two-part
// endpoint (no login wall), primes the React Query cache under
// ["/api/albums", id] so AlbumDetail renders without an authed refetch.
// A path that doesn't resolve to a buy-eligible release shows not-found.
// Task #1766 — manual slug-resolver fetches bypass the queryClient auth-header
// injection, so the operator's "See Preview Flow" preview pass would be dropped
// and a prepping release would 404 for a family reviewer. Re-attach it here so
// the by-slug resolvers honor the pass (read-only staging; checkout still 403s
// server-side). Returns undefined when no pass is set so a normal fan request
// is unchanged.
function previewPassHeaders(): HeadersInit | undefined {
  const pass = getPreviewPass();
  return pass ? { "X-Preview-Pass": pass } : undefined;
}

function ShareSlugTwo() {
  const params = useParams<{ artistSlug: string; albumSlug: string }>();
  const artistSlug = params.artistSlug ?? "";
  const albumSlug = params.albumSlug ?? "";
  const cacheKey = `${artistSlug}/${albumSlug}`;
  const { data, isLoading } = useQuery<{ id: string; isPrepping?: boolean } | null>({
    queryKey: ["/api/public/album-by-slug", cacheKey],
    enabled: !!(artistSlug && albumSlug),
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      // cache:"no-store" prevents the browser sending a conditional
      // If-None-Match on revalidation. A 304 is !r.ok, which would throw
      // and collapse the page to AlbumNotFound even though the album is live.
      // TanStack Query (staleTime:Infinity) is the cache layer here; we don't
      // need the browser HTTP cache for this request.
      const r = await fetch(
        `/api/public/album-by-slug/${encodeURIComponent(artistSlug)}/${encodeURIComponent(albumSlug)}`,
        { credentials: "include", cache: "no-store", headers: previewPassHeaders() },
      );
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`Failed to load (${r.status})`);
      const album = (await r.json()) as { id: string; isPrepping?: boolean };
      // Prime the same cache key AlbumDetail reads so it renders without an
      // authed /api/albums/:id refetch (which would 401 when logged out).
      queryClient.setQueryData(["/api/albums", album.id], album);
      return album;
    },
  });

  if (isLoading) return <AlbumDetailMobileSkeleton />;
  // Hidden / trashed / unknown releases still 404 server-side → not found.
  if (!data) return <AlbumNotFound variant="mobile" />;
  // Task #1778 — a PREPPING (pre-launch) release resolves to the full rich
  // page in notify-only "Get Early Access" mode (the primary CTA captures an
  // email into the waitlist instead of opening checkout). Once a release is
  // LIVE (is_prepping=false — sunrise/launch has fired), the bare campaign
  // share link (e.g. nightbirde/hope) opens the "buy" campaign surface: the
  // on-arrival offer modal with the large order boxes, a "Get Details" link
  // beside the Buy CTA, hidden login chrome, and 30s previews — the full launch
  // experience. (A brief plain-album-page variant dropped the offer modal, the
  // Get Details link, and the order boxes, and let the login chrome show.)
  if (data.isPrepping)
    return <AlbumDetail albumId={data.id} notifyOnly />;
  return <AlbumDetail albumId={data.id} publicPreview="buy" />;
}

// Task #1766 — single-segment share link (get.goodtunes.music/<slug>, e.g.
// /hope). Companion to ShareSlugTwo: resolves through the single-segment
// album-by-slug endpoint (which honors staging + the preview pass for prepping
// releases), and falls back to the same branded "Coming <date>" placeholder
// when the release isn't buy-eligible yet. MUST stay below every literal
// single-segment route (all reserved — see shared/shareSlug.ts), so those win.
function ShareSlugOne() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const { data, isLoading } = useQuery<{ id: string; isPrepping?: boolean } | null>({
    queryKey: ["/api/public/album-by-slug", slug],
    enabled: !!slug,
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      // cache:"no-store" — see ShareSlugTwo for rationale (304 is !r.ok).
      const r = await fetch(
        `/api/public/album-by-slug/${encodeURIComponent(slug)}`,
        { credentials: "include", cache: "no-store", headers: previewPassHeaders() },
      );
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`Failed to load (${r.status})`);
      const album = (await r.json()) as { id: string; isPrepping?: boolean };
      queryClient.setQueryData(["/api/albums", album.id], album);
      return album;
    },
  });

  if (isLoading) return <AlbumDetailMobileSkeleton />;
  // Hidden / trashed / unknown releases still 404 server-side → not found.
  if (!data) return <AlbumNotFound variant="mobile" />;
  // Task #1778 — a PREPPING (pre-launch) release resolves to the full rich page
  // in notify-only "Get Early Access" mode instead of a dead-end teaser.
  // Task #1784 — that prepping fan link is the "notify" public-preview surface
  // (auto-opening mint offer modal, clean chrome). Once LIVE, the single-segment
  // share opens the "buy" campaign surface (on-arrival offer modal + large order
  // boxes, "Get Details" link beside Buy, hidden login chrome, 30s previews) so
  // every campaign entry point reads the same as the two-part share link.
  return (
    <AlbumDetail
      albumId={data.id}
      publicPreview={data.isPrepping ? "notify" : "buy"}
    />
  );
}

// Task #1755 — family-review link for a campaign release
// (/staging/:artist/:release and the /:artist/:release/staging suffix Bill
// shares with family). Renders the SAME locked Preview & Purchase surface as
// the fan link, but with full Buy → Stripe checkout enabled (no notify-only
// gate). Resolves through the same public album-by-slug endpoint, which also
// honors staging access (admin / full-access email) for hidden pre-launch
// releases; the campaign `?k=` token still rides through to playback for
// early-access previews.
function ShareSlugStaging() {
  const params = useParams<{ artist: string; release: string }>();
  const artistSlug = params.artist ?? "";
  const albumSlug = params.release ?? "";
  const cacheKey = `${artistSlug}/${albumSlug}`;
  const { data, isLoading, isError } = useQuery<{ id: string; isPrepping?: boolean } | null>({
    queryKey: ["/api/public/album-by-slug", cacheKey],
    enabled: !!(artistSlug && albumSlug),
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      // cache:"no-store" — see ShareSlugTwo for rationale (304 is !r.ok).
      const r = await fetch(
        `/api/public/album-by-slug/${encodeURIComponent(artistSlug)}/${encodeURIComponent(albumSlug)}`,
        { credentials: "include", cache: "no-store", headers: previewPassHeaders() },
      );
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`Failed to load (${r.status})`);
      const album = (await r.json()) as { id: string; isPrepping?: boolean };
      queryClient.setQueryData(["/api/albums", album.id], album);
      return album;
    },
  });

  if (isLoading) return <AlbumDetailMobileSkeleton />;
  if (isError || !data) return <AlbumNotFound variant="mobile" />;
  // Task #1784 — the family review link is the "buy" public-preview surface:
  // the primary CTA reads "Buy $X" and walks the existing purchase screens to
  // the Stripe card input (the staging reviewer's preview pass unlocks checkout
  // server-side; the charge is finished in Bill's separate purchase task).
  // Gate on isPrepping so a LIVE release stays a normal album page.
  return (
    <AlbumDetail
      albumId={data.id}
      publicPreview={data.isPrepping ? "buy" : undefined}
    />
  );
}

// Task #1766 — private /testing entry. Renders the FULL buyer page for the
// staged "Hope" release (nightbirde/hope) with real checkout enabled, so the
// operator can dry-run the whole purchase flow before the release is live.
// Resolves through the same public album-by-slug endpoint, which grants staging
// access via the full-access session (admin / full-access email) — no preview
// pass, so checkout is NOT blocked. "testing" is reserved (shared/shareSlug.ts)
// so no release can ever claim this slug.
const TESTING_ARTIST_SLUG = "nightbirde";
const TESTING_ALBUM_SLUG = "hope";
function Testing() {
  const cacheKey = `${TESTING_ARTIST_SLUG}/${TESTING_ALBUM_SLUG}`;
  const { data, isLoading, isError } = useQuery<{ id: string } | null>({
    queryKey: ["/api/public/album-by-slug", cacheKey],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      // cache:"no-store" — see ShareSlugTwo for rationale (304 is !r.ok).
      const r = await fetch(
        `/api/public/album-by-slug/${TESTING_ARTIST_SLUG}/${TESTING_ALBUM_SLUG}`,
        { credentials: "include", cache: "no-store", headers: previewPassHeaders() },
      );
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`Failed to load (${r.status})`);
      const album = (await r.json()) as { id: string };
      queryClient.setQueryData(["/api/albums", album.id], album);
      return album;
    },
  });

  if (isLoading) return <AlbumDetailMobileSkeleton />;
  if (isError || !data) return <AlbumNotFound variant="mobile" />;
  return <AlbumDetail albumId={data.id} />;
}

function Router() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  const kind = useAuthKind();
  // Task #1557 — the shared profile editor (/account/edit) presents as a
  // centered card floating over the screen the user came from on
  // tablet/desktop. We keep that origin screen mounted behind the scrim by
  // overriding the Switch's location to the previous (non-edit) path while
  // EditAccount renders as a sibling overlay on top. Phone keeps the editor
  // as a normal full-screen route (no override, no overlay).
  const editAsCard = useMediaQuery("(min-width: 768px)");
  const editOverlayActive = editAsCard && location === "/account/edit";
  // Remember the last real (non-edit) location so we can render it behind the
  // card. Updated during render (idempotent). On a cold load straight to
  // /account/edit there's no prior page, so fall back to the kind's home hub.
  const editFallbackBg = kind === "admin" ? "/admin/dashboard" : "/account";
  const prevLocationRef = useRef<string>(editFallbackBg);
  if (location !== "/account/edit") {
    prevLocationRef.current = location;
  }
  // Guard against background paths that only redirect (bare /admin, "/") —
  // rendering one of those behind the card would bounce the URL off
  // /account/edit and tear the overlay down.
  const prevBg = prevLocationRef.current;
  const editBackground =
    prevBg && prevBg !== "/account/edit" && prevBg !== "/admin" && prevBg !== "/"
      ? prevBg
      : editFallbackBg;
  // Track in-app navigation so back-aware surfaces (e.g. the album back
  // pill) can return the fan to the exact page they came from.
  useTrackInAppNavigation();
  // Task #859 — an `artist` partner is scoped to a quote sandbox. We read
  // their role so the deep-link guard below can bounce any /admin/* URL
  // that isn't their releases list or an album detail. The server is the
  // real enforcement (403/404); this just mirrors it client-side.
  const adminRole = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
    enabled: !!user && kind === "admin",
  });
  const isArtistPartner = adminRole.data?.role === "artist";
  // Task #2081 — a publisher/writer partner has a single dedicated portal
  // (/publisher — a read-only mechanical statement). It has NO operator
  // surface: requireAdmin 403s it on every /api/admin/* route and its
  // catalog/report reads are now fully scoped server-side. Mirror that
  // client-side so a /admin/* deep link bounces back to the portal.
  const isPublisherPartner = adminRole.data?.role === "publisher";
  // Task #2081 — label / manager / non_profit partners each have their own
  // scoped left-nav portal (/label, /manager, /non-profit). They keep
  // access to the shared, server-scoped Reports page (and NPO's GoodDeed
  // pricing) but every other operator-only /admin/* surface bounces back
  // to their portal — UI hiding that agrees with the server-side scope.
  const isLabelPartner = adminRole.data?.role === "label";
  const isManagerPartner = adminRole.data?.role === "manager";
  const isNonProfitPartner = adminRole.data?.role === "non_profit";
  // Task #2082 — operational partners with a scoped left-nav portal at
  // /vendor: a plain vendor, a quickprinter (role "vendor" + is_quickprinter,
  // routed to PrinterPortal), and a fulfillment partner. Like the publisher
  // they have NO operator surface — requireAdmin gives them no /api/admin/*
  // data and their reports/catalog reads are fail-closed server-side — so
  // every operator-only /admin/* deep link bounces back to /vendor. (A
  // manufacturer/reseller also lives at /vendor, but role "manufacturer" is
  // shared with presses whose portal deep-links into /admin/manufacturers/:id,
  // so it is intentionally NOT guarded here — that is Task #2075's surface.)
  const isVendorFamilyPartner =
    adminRole.data?.role === "vendor" || adminRole.data?.role === "fulfillment";

  // Host-based gating: customer host blocks /admin* paths (redirect into
  // /account). Admin host blocks the customer player surfaces (redirect
  // into /admin). The *.replit.app preview is treated as dev and lets
  // both render so we can develop without juggling hosts. Production
  // 301s from the platform layer also enforce this at the network edge.
  const isProdHost = typeof window !== "undefined" && /goodtunes\.music$/.test(window.location.host);
  // Task #256 — On the admin shell, a non-admin (signed-in customer
  // OR a user the host says is admin-kind but who has no users row)
  // gets the branded "access not authorized" dialog instead of a
  // silent redirect. The probe also records the visit server-side so
  // super_admins are notified (24h dedupe).
  const onAdminShell =
    kind === "admin" ||
    (typeof window !== "undefined" && window.location.pathname.startsWith("/admin"));
  // Task #2142 — never let the access-denied dialog cover the admin auth
  // screens. A signed-in fan on the admin host still resolves user=null
  // (host/kind mismatch), so without this exemption the dialog's own
  // "Sign in to GoodTunes Admin" CTA (→ /admin/login) would just re-show
  // the dialog. Keep sign-in / reset reachable.
  const onAdminAuthPath =
    location.startsWith("/admin/login") ||
    location.startsWith("/admin/logout") ||
    location.startsWith("/admin/register") ||
    location.startsWith("/admin/forgot-password") ||
    location.startsWith("/admin/reset-password");
  const showAccessGuard = onAdminShell && !onAdminAuthPath && !isLoading && !user;
  const accessRequest = useQuery<{ displayName: string; email: string; linkedAdmin?: boolean } | null>({
    queryKey: ["/api/admin/access-request"],
    queryFn: async () => {
      try {
        const r = await apiRequest("POST", "/api/admin/access-request");
        return (await r.json()) as { displayName: string; email: string; linkedAdmin?: boolean };
      } catch {
        return null;
      }
    },
    enabled: showAccessGuard,
    retry: false,
    staleTime: 60_000,
  });
  if (showAccessGuard && accessRequest.data) {
    return <AccessNotAuthorizedDialog customer={accessRequest.data} />;
  }
  // Task #537 — Force first-time OAuth-minted fans through the
  // /finish-setup screen before they can hit any real player surface.
  // `signupCompletedAt === null` is the trigger; password-signups
  // pre-stamp it on /api/register and legacy rows were backfilled at
  // migration time, so this only ever fires for OAuth signups.
  // Allow-list every path the picker page itself can need (logout,
  // login bounce, the error landing) so a fan who hits "log out"
  // from the finish-setup screen isn't trapped in a loop.
  const needsFinishSignup =
    !isLoading && user?.kind === "customer" && !user.signupCompletedAt;
  const finishSignupAllow = ["/finish-setup", "/login", "/logout", "/error"];
  if (needsFinishSignup && !finishSignupAllow.some((p) => location.startsWith(p))) {
    // Carry the current location as ?next= so a fan who was mid-purchase
    // (e.g. /album/123?buy=1) lands back on their cart after completing
    // "One last thing" — not on /account with nothing to do.
    const finishSetupDest =
      location && location !== "/" && location !== "/home"
        ? `/finish-setup?next=${encodeURIComponent(location)}`
        : "/finish-setup";
    return <Redirect to={finishSetupDest} />;
  }

  if (isProdHost) {
    if (kind === "customer" && location.startsWith("/admin")) {
      return <Redirect to="/home" />;
    }
    if (kind === "admin" && (
      location.startsWith("/home") ||
      location.startsWith("/collection") ||
      // Admins reach the shared profile editor from their account menu;
      // /account/edit is intentionally exempt from the customer-surface block.
      (location.startsWith("/account") && !location.startsWith("/account/edit")) ||
      location.startsWith("/playlists") || location.startsWith("/chat") ||
      location.startsWith("/album") ||
      // Bare `/artist` is the invited-artist PARTNER PORTAL (a light admin
      // surface, same tier as /label, /vendor, /manager, /non-profit — none
      // of which are blocked here). `/artist/albums/:id` (Task #2524) is that
      // SAME portal with one album opened embedded, so it's exempt too — else
      // clicking a Catalog album bounces the admin to a blank `/admin`. Only
      // the dark fan page `/artist/<slug>` should bounce admins on a prod
      // admin host. `location` here is a wouter pathname (no query/hash), so
      // `/artist#viewas=...` still resolves to the exact `/artist` we want to
      // exempt. Mirrors the bare-path check in main.tsx's light-portal detector.
      (location.startsWith("/artist") &&
        location !== "/artist" &&
        !location.startsWith("/artist/albums/")) ||
      location.startsWith("/instrument") || location.startsWith("/search") ||
      location.startsWith("/recents")
    )) {
      return <Redirect to="/admin" />;
    }
  }

  // Artist partner route guard. Artists now have a full sectioned nav;
  // god-view surfaces (presses, labels, makers, jobs, platform pricing,
  // payouts, invite tree, etc.) remain blocked. Auth paths stay open so
  // a locked-out artist can still sign in / reset their password.
  if (isArtistPartner && location.startsWith("/admin")) {
    const isAuthPath =
      location.startsWith("/admin/login") ||
      location.startsWith("/admin/logout") ||
      location.startsWith("/admin/register") ||
      location.startsWith("/admin/forgot-password") ||
      location.startsWith("/admin/reset-password");
    const allowedPrefixes = [
      "/admin/dashboard",
      "/admin/albums",
      "/admin/people",
      "/admin/instruments",
      "/admin/custom-addons",
      "/admin/non-profits",
      "/admin/fan-orders",
      "/admin/customers",
      "/admin/reports",
      "/admin/invite-directory",
      "/admin/invites",
      "/admin/trash",
    ];
    // /admin/security is gated by the shared canAccessAdminSecurity()
    // predicate (also drives the account-menu Security item) so the two
    // can never drift; it's intentionally absent from allowedPrefixes.
    const isSecurityPath =
      location === "/admin/security" ||
      location.startsWith("/admin/security?") ||
      location.startsWith("/admin/security/");
    const isAllowed =
      isAuthPath ||
      (isSecurityPath
        ? canAccessAdminSecurity(adminRole.data?.role)
        : allowedPrefixes.some(
            (p) =>
              location === p ||
              location.startsWith(p + "?") ||
              location.startsWith(p + "/"),
          ));
    if (!isAllowed) {
      return <Redirect to="/admin/dashboard" />;
    }
  }

  // Publisher partner route guard. Unlike artists (who have a sectioned nav),
  // a publisher has no operator surface at all — bounce every /admin/* deep
  // link back to /publisher. Auth paths stay open so a locked-out publisher
  // can still sign in / reset their password.
  if (isPublisherPartner && location.startsWith("/admin")) {
    const isAuthPath =
      location.startsWith("/admin/login") ||
      location.startsWith("/admin/logout") ||
      location.startsWith("/admin/register") ||
      location.startsWith("/admin/forgot-password") ||
      location.startsWith("/admin/reset-password");
    if (!isAuthPath) {
      return <Redirect to="/publisher" />;
    }
  }

  // Task #2075 / #2091 — a real press (is_maker manufacturer,
  // role="manufacturer") lives entirely inside its scoped portal at /vendor.
  // Bounce it off every operator /admin/* surface (mirrors the artist guard
  // above). The own-catalog editor used to be whitelisted as an exception
  // (it rendered in operator chrome), but as of Task #2091 the catalog is
  // editable INLINE in the portal's Settings → Catalog sub-view, so we
  // redirect any lingering deep link to /admin/manufacturers/:ownId straight
  // there instead of leaking the operator page. Auth paths stay open so a
  // locked-out press can still sign in / reset a password. The server 403s
  // these too — this is just the UX half so a press never lands on a
  // god-view page it can't read.
  const isPressPartner = adminRole.data?.role === "manufacturer";
  if (isPressPartner && location.startsWith("/admin")) {
    const isAuthPath =
      location.startsWith("/admin/login") ||
      location.startsWith("/admin/logout") ||
      location.startsWith("/admin/register") ||
      location.startsWith("/admin/forgot-password") ||
      location.startsWith("/admin/reset-password");
    const ownCatalogPath = adminRole.data?.roleScopeId
      ? `/admin/manufacturers/${adminRole.data.roleScopeId}`
      : null;
    const isOwnCatalog =
      !!ownCatalogPath &&
      (location === ownCatalogPath ||
        location.startsWith(ownCatalogPath + "?") ||
        location.startsWith(ownCatalogPath + "/"));
    if (isOwnCatalog) {
      return <Redirect to="/vendor?tab=settings&settings=catalog" />;
    }
    if (!isAuthPath) {
      return <Redirect to="/vendor" />;
    }
  }

  // Task #2082 — vendor / quickprinter / fulfillment partner route guard.
  // These operational partners have a scoped left-nav portal at /vendor and
  // NO operator surface (reports + catalog are fail-closed server-side, and
  // requireAdmin hands them no /api/admin/* data). Bounce every operator-only
  // /admin/* deep link back to /vendor. Auth paths stay open (sign-in/reset)
  // and the shared /admin/security 2FA page is allowed via the same
  // canAccessAdminSecurity predicate the account menu uses, so it can't drift.
  if (isVendorFamilyPartner && location.startsWith("/admin")) {
    const isAuthPath =
      location.startsWith("/admin/login") ||
      location.startsWith("/admin/logout") ||
      location.startsWith("/admin/register") ||
      location.startsWith("/admin/forgot-password") ||
      location.startsWith("/admin/reset-password");
    const isSecurityPath =
      location === "/admin/security" ||
      location.startsWith("/admin/security?") ||
      location.startsWith("/admin/security/");
    const isAllowed =
      isAuthPath ||
      (isSecurityPath && canAccessAdminSecurity(adminRole.data?.role));
    if (!isAllowed) {
      return <Redirect to="/vendor" />;
    }
  }

  // Label / manager / non_profit partner route guard. Each has a scoped
  // left-nav portal; inside /admin they keep only the shared, server-scoped
  // Reports page (plus NPO's GoodDeed pricing and the security/2FA page).
  // Every other operator-only /admin/* deep link bounces back to the
  // partner's own portal home — matching the server-side scope so a typed
  // URL can never render a global operator page.
  if (
    (isLabelPartner || isManagerPartner || isNonProfitPartner) &&
    location.startsWith("/admin")
  ) {
    const isAuthPath =
      location.startsWith("/admin/login") ||
      location.startsWith("/admin/logout") ||
      location.startsWith("/admin/register") ||
      location.startsWith("/admin/forgot-password") ||
      location.startsWith("/admin/reset-password");
    // Shared scoped surfaces these partners legitimately reach via their
    // portal nav. NPO additionally keeps GoodDeed pricing (its existing
    // trimmed admin nav). /admin/security is gated separately below.
    const allowedPrefixes = isNonProfitPartner
      ? ["/admin/reports", "/admin/gooddeed-pricing"]
      : ["/admin/reports"];
    const isSecurityPath =
      location === "/admin/security" ||
      location.startsWith("/admin/security?") ||
      location.startsWith("/admin/security/");
    const isAllowed =
      isAuthPath ||
      (isSecurityPath
        ? canAccessAdminSecurity(adminRole.data?.role)
        : allowedPrefixes.some(
            (p) =>
              location === p ||
              location.startsWith(p + "?") ||
              location.startsWith(p + "/"),
          ));
    if (!isAllowed) {
      const home = isLabelPartner ? "/label" : isManagerPartner ? "/manager" : "/non-profit";
      return <Redirect to={home} />;
    }
  }

  if (isLoading) {
    return <FanAppLoader />;
  }

  return (
    <>
      <Switch location={editOverlayActive ? editBackground : location}>
        {/* Task #284 — Friendly error landing for OAuth callback failures
            and any future surface that wants to bounce to a full-page
            error card. Public route. */}
        <Route path="/error" component={ErrorPage} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Login} />
        {/* Mirror routes under /admin so the dev URL can preview the
            admin-chromed login (detectAuthKind falls back to pathname
            on *.replit.app). On the admin.goodtunes.music host the
            chrome is host-derived and these are simply aliases. */}
        <Route path="/admin/login" component={Login} />
        <Route path="/admin/register" component={Login} />
        {/* Task #269 — Admin "Forgot password?" flow. Both routes are
            public — they're how a locked-out admin gets back in. The
            reset page validates the token before rendering the form. */}
        <Route path="/admin/forgot-password" component={ForgotPassword} />
        <Route path="/admin/reset-password/:token" component={ResetPassword} />
        {/* Task #271 — Customer "Forgot password?" flow. Same kind-aware
            page renders in the dark player chrome on these paths and
            hits the customer endpoints. */}
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password/:token" component={ResetPassword} />
        {/* Task #44 — post-checkout landing. Public so the Stripe
            return URL works even before the auth cookie has settled
            (Welcome polls /api/checkout/session/:id to confirm the
            order, then bounces into the unlocked album). */}
        <Route path="/welcome" component={Welcome} />
        {/* Task #400 — Welcome-back onboarding for imported gogoods.com
            fans. Gated server-side via /api/me/welcome-back/state, which
            bounces non-imported or already-onboarded fans to /account. */}
        <Route path="/welcome-back">
          <ProtectedRoute component={WelcomeBack} />
        </Route>
        {/* Task #537 — Finish-signup for OAuth-minted customer
            accounts. Pick a unique handle + confirm display name +
            (when Apple's private relay is the only email we have)
            provide a deliverable contact. Gated server-side via
            GET /api/auth/complete-signup/state — already-completed
            fans bounce themselves out. The Router-level guard below
            additionally redirects every other path here until the
            row is stamped. */}
        <Route path="/finish-setup">
          <ProtectedRoute component={FinishSetup} />
        </Route>
        {/* Public landing for the merge-confirmation link emailed to
            the *other* address. Page itself handles the not-signed-in
            case (asks the fan to sign in as the surviving account). */}
        <Route path="/account/merge" component={AccountMerge} />
        {/* Task #1496 — Public account-deletion explainer linked from the
            Google Play Data safety form. No auth gate; host-agnostic so it
            resolves at goodtunes.music/delete-account. */}
        <Route path="/delete-account" component={DeleteAccount} />
        {/* Campaign "Get Hope. Give Hope." family-review preview only.
            Task #1735 retired the public artist-first "Coming today" teaser;
            Task #1755 retired the "Get Hope. Give Hope." CampaignFlow chrome.
            Every campaign link now renders the SAME locked Preview & Purchase
            AlbumDetail surface — the bare /:artist/:release fan route
            (ShareSlugTwo → AlbumDetail) is notify-only for campaign releases,
            while /staging/:artist/:release and the /:artist/:release/staging
            suffix Bill shares with family (ShareSlugStaging) keep the full Buy
            flow. The campaign registry (isCampaignRelease + notify-only copy)
            lives in client/src/pages/Hope.tsx. */}
        <Route path="/staging/:artist/:release" component={ShareSlugStaging} />
        {/* Suffix form Bill shares with family: /:artist/:release/staging
            (e.g. /nightbirde/hope/staging) — family tier, buy flow on. */}
        <Route path="/:artist/:release/staging" component={ShareSlugStaging} />
        {/* Task #1766 — private /testing dry-run of the staged Hope buyer
            page with real checkout (full-access session). "testing" is a
            reserved slug so no release can claim it. */}
        <Route path="/testing" component={Testing} />
        {/* Admin tool for the wave-1 welcome-back campaign. */}
        <Route path="/admin/welcome-back">
          <ProtectedRoute component={AdminWelcomeBack} />
        </Route>
        {/* Task #351 — Landing for Team/Manager invitees with nothing
            waiting (no pre-flighted album). Short "here's what you
            can do" page so the first sign-in doesn't drop them into
            an empty dashboard. */}
        <Route path="/welcome-invitee">
          <ProtectedRoute component={WelcomeInvitee} />
        </Route>
        {/* Task #46 — Public gift claim page. The recipient hits this
            without an account; the page itself routes them through
            sign-in/up before letting them call POST claim. */}
        <Route path="/gift/:token" component={GiftClaim} />
        {/* Task #49 — Shopify redemption landing. Public; the page itself
            routes the fan through sign-in/up before calling claim. */}
        <Route path="/redeem/:code" component={Redeem} />
        <Route path="/orders">
          <ProtectedRoute component={Orders} />
        </Route>
        <Route path="/admin/orders">
          <ProtectedRoute component={AdminOrders} />
        </Route>
        {/* Task #131 — Admin Customers directory. Detail route is
            registered before the index so the `:id` param doesn't
            shadow the index page. */}
        <Route path="/admin/customers/:id">
          <ProtectedRoute component={AdminCustomerDetail} />
        </Route>
        <Route path="/admin/customers">
          <ProtectedRoute component={AdminCustomers} />
        </Route>
        {/* Task #338 — Admin playlist detail (deep-linked from global
            admin search). Read-only view of any customer playlist. */}
        <Route path="/admin/playlists/:id">
          <ProtectedRoute component={AdminPlaylist} />
        </Route>
        {/* Task #128 — Printable GoodDeed certificate print queue. */}
        <Route path="/admin/print-queue">
          <ProtectedRoute component={AdminPrintQueue} />
        </Route>
        {/* Task #1609 — Review + act on flagged digital cert names. */}
        <Route path="/admin/cert-names">
          <ProtectedRoute component={AdminCertNames} />
        </Route>
        <Route path="/admin/feedback">
          <ProtectedRoute component={AdminFeedback} />
        </Route>
        {/* Task #434 — Audit imported rows still on tinifycdn.com */}
        <Route path="/admin/legacy-image-audit">
          <ProtectedRoute component={AdminLegacyImageAudit} />
        </Route>
        {/* Task #128 — Public per-deed provenance page (QR target).
            No auth — the short id is the secret. */}
        <Route path="/g/:shortId" component={CertProvenance} />
        {/* Task #1514 — friendly fallback for the legacy gogoods.com QR
            bridge. The server resolver (/legacy/g/:code) redirects here on
            any miss; never a dead 404. */}
        <Route path="/find-gooddeed" component={FindGoodDeed} />
        <Route path="/admin/security">
          <ProtectedRoute component={AdminSecurity} />
        </Route>
        <Route path="/admin/invites">
          <ProtectedRoute component={AdminInvites} />
        </Route>
        {/* Task #533 — Pool-funded early masters cut review queue. */}
        <Route path="/admin/early-cut">
          <ProtectedRoute component={AdminPressEarlyCutQueue} />
        </Route>
        {/* Task #350 — Invite tree (multi-level referral visualiser). */}
        <Route path="/admin/invite-tree">
          <ProtectedRoute component={AdminInviteTree} />
        </Route>
        {/* Task #1198 — Invite directory (read-only list of every invite). */}
        <Route path="/admin/invite-directory">
          <ProtectedRoute component={AdminInviteDirectory} />
        </Route>
        {/* Task #79 — Super-admin queue of partner-submitted metadata
            edits awaiting review. */}
        <Route path="/admin/review">
          <ProtectedRoute component={AdminReview} />
        </Route>
        {/* Task #225 — GoodTunes-admin queue of artist "Go to Press!"
            submissions awaiting Approve/Reject. */}
        <Route path="/admin/pressing-orders">
          <ProtectedRoute component={AdminPressingOrders} />
        </Route>
        {/* Public invite-accept page — recipient sets username + password
            using a token-bound email + role. No auth required. */}
        <Route path="/invite/:token" component={AcceptInvite} />
        {/* Task #2399 — Public branded landing page for reusable referral
            links. Anyone can open /join/:code to submit an artist
            application; no auth required. */}
        <Route path="/join/:code" component={JoinReferralLink} />
        <Route path="/home">
          <ProtectedRoute component={Home} />
        </Route>
        {/* Task #1376 — Collection landing (Apple-Library list) + its
            dedicated Songs / Artists detail views. */}
        <Route path="/collection/songs">
          <ProtectedRoute component={CollectionSongs} />
        </Route>
        <Route path="/collection/artists">
          <ProtectedRoute component={CollectionArtists} />
        </Route>
        <Route path="/collection">
          <ProtectedRoute component={Collection} />
        </Route>
        <Route path="/album/:id">
          <AlbumDetail />
        </Route>
        {/* Task #936 — the launch storefront. Reachable directly at /store on
            any host (dev testing + deep links) and served at the bare root on
            store.goodtunes.music (see the "/" route below). */}
        <Route path="/store" component={Storefront} />
        <Route path="/instrument/:id">
          <ProtectedRoute component={InstrumentDetail} />
        </Route>
        {/* Task #75 — Artist reporting dashboard. Must be listed BEFORE
            /artist/:slug so the no-slug `/artist` matches first.
            ProtectedRoute gates sign-in; the page itself surfaces a
            friendly message if the caller's role isn't artist/super_admin. */}
        <Route path="/artist">
          <ProtectedRoute component={ArtistDashboard} />
        </Route>
        {/* Task #78 — Non-profit partner shell. Referrers earn $1/unit. */}
        <Route path="/non-profit">
          <ProtectedRoute component={NonProfitDashboard} />
        </Route>
        {/* Task #245 — Vendor portal. A printer / holographer / press
            partner with role=vendor lands here to quote per-leg
            GoodDeed pricing for their own vendor row. */}
        <Route path="/vendor">
          <ProtectedRoute component={VendorPortal} />
        </Route>
        {/* A press opening one of its albums stays inside the portal shell
            (PressPortal renders AdminAlbum embedded on the Physical tab)
            instead of the operator /admin/albums/:id chrome, which the
            press-partner route guard bounces back to the portal dashboard. */}
        <Route path="/vendor/albums/:id">
          <ProtectedRoute component={VendorPortal} />
        </Route>
        {/* Task #2524 — an artist opening one of their albums stays inside the
            portal shell (ArtistDashboard renders AdminAlbum embedded). Listed
            BEFORE /artist/:slug; the two-segment path can't collide with the
            single-segment slug route, but keep it ahead for clarity. */}
        <Route path="/artist/albums/:id">
          <ProtectedRoute component={ArtistDashboard} />
        </Route>
        <Route path="/artist/:slug">
          <ProtectedRoute component={ArtistDetail} />
        </Route>
        {/* Task #76 — Label rollup reporting dashboard. Customer hosts
            never see /label* (no host-rewrite); admin/dev hosts can. */}
        <Route path="/label">
          <ProtectedRoute component={LabelDashboard} />
        </Route>
        {/* Task #1425 — Manager rollup dashboard (label-style roster).
            Admin/dev hosts only, same as /label. */}
        <Route path="/manager">
          <ProtectedRoute component={ManagerDashboard} />
        </Route>
        {/* Task #1953 — Publisher portal. Read-only mechanical-royalty
            statement for invited publisher/writer accounts. */}
        <Route path="/publisher">
          <ProtectedRoute component={PublisherPortal} />
        </Route>
        {/* Task #661 — Fan-facing label page. Order matters: the
            literal `/label` route above must stay first so the
            label-partner dashboard isn't shadowed by `:id`. */}
        <Route path="/label/:id">
          <ProtectedRoute component={FanLabel} />
        </Route>
        <Route path="/playlists">
          <ProtectedRoute component={Playlists} />
        </Route>
        {/* Task #530 — Unified search + server-backed recents. */}
        <Route path="/search">
          <ProtectedRoute component={SearchPage} />
        </Route>
        <Route path="/recents">
          <ProtectedRoute component={RecentsPage} />
        </Route>
        <Route path="/chat">
          <ProtectedRoute component={Chat} />
        </Route>
        <Route path="/chat/:id">
          <ProtectedRoute component={ChatThreadPage} />
        </Route>
        <Route path="/account/edit">
          <ProtectedRoute component={EditAccount} />
        </Route>
        <Route path="/account/favorite-artists">
          <ProtectedRoute component={FavoriteArtists} />
        </Route>
        <Route path="/account/bookmarks">
          <ProtectedRoute component={Bookmarks} />
        </Route>
        <Route path="/account">
          <ProtectedRoute component={Account} />
        </Route>
        {/* New per-album admin shell (Phase 1 — order matters: list these before
            the classic /admin route so wouter's Switch picks the more specific
            match first). The classic /admin route remains the source of truth
            for all editing until each tab is migrated. */}
        <Route path="/admin/albums/:id/engagement">
          <ProtectedRoute component={AdminAlbumEngagement} />
        </Route>
        <Route path="/admin/albums/:id/buyers">
          <ProtectedRoute component={AdminAlbumBuyers} />
        </Route>
        <Route path="/admin/albums/:id">
          <ProtectedRoute component={AdminAlbum} />
        </Route>
        <Route path="/admin/shopify">
          <ProtectedRoute component={AdminShopify} />
        </Route>
        <Route path="/admin/albums">
          <ProtectedRoute component={AdminAlbums} />
        </Route>
        <Route path="/admin/people/:id/buyers">
          <ProtectedRoute component={AdminArtistBuyers} />
        </Route>
        <Route path="/admin/people/:id">
          <ProtectedRoute component={AdminPerson} />
        </Route>
        {/* Task #78 — Super-admin detail page for a non-profit partner. */}
        <Route path="/admin/non-profits/:id">
          <ProtectedRoute component={AdminNonProfit} />
        </Route>
        {/* Task #230 — NPO directory index, linked from the new
            CATALOG section of the admin sidebar. */}
        <Route path="/admin/non-profits">
          <ProtectedRoute component={AdminNonProfits} />
        </Route>
        {/* Task #844 — operator-built custom ("Gift of Hope") add-ons. */}
        <Route path="/admin/custom-addons">
          <ProtectedRoute component={AdminCustomAddons} />
        </Route>
        {/* Task #230 — Fan orders queue (design stub for now). */}
        <Route path="/admin/fan-orders">
          <ProtectedRoute component={AdminFanOrders} />
        </Route>
        <Route path="/admin/people">
          <ProtectedRoute component={AdminPeople} />
        </Route>
        <Route path="/admin/instruments/:id">
          <ProtectedRoute component={AdminInstrument} />
        </Route>
        <Route path="/admin/instruments">
          <ProtectedRoute component={AdminInstruments} />
        </Route>
        <Route path="/admin/vendors/:id">
          <ProtectedRoute component={AdminVendor} />
        </Route>
        <Route path="/admin/vendors">
          <ProtectedRoute component={AdminVendors} />
        </Route>
        {/* Task #174 — Makers (gear builders) share the vendor table
            and the AdminVendor / AdminVendors components; mode is
            detected by useRoute inside those pages. URL is /admin/makers
            so the sidebar + breadcrumbs read as "Makers" while the
            underlying row identity (id) stays a vendor. */}
        <Route path="/admin/makers/:id">
          <ProtectedRoute component={AdminVendor} />
        </Route>
        <Route path="/admin/makers">
          <ProtectedRoute component={AdminVendors} />
        </Route>
        <Route path="/admin/labels/:id">
          <ProtectedRoute component={AdminLabel} />
        </Route>
        <Route path="/admin/labels">
          <ProtectedRoute component={AdminLabels} />
        </Route>
        <Route path="/admin/managers/:id">
          <ProtectedRoute component={AdminManager} />
        </Route>
        <Route path="/admin/managers">
          <ProtectedRoute component={AdminManagers} />
        </Route>
        <Route path="/admin/manufacturers/:id">
          <ProtectedRoute component={AdminManufacturer} />
        </Route>
        <Route path="/admin/manufacturers">
          <ProtectedRoute component={AdminManufacturers} />
        </Route>
        <Route path="/admin/press-match">
          <ProtectedRoute component={AdminPressMatch} />
        </Route>
        <Route path="/admin/fulfillment-partners/:id">
          <ProtectedRoute component={AdminFulfillmentPartner} />
        </Route>
        <Route path="/admin/fulfillment-partners">
          <ProtectedRoute component={AdminFulfillmentPartners} />
        </Route>
        {/* Task #80 — Partner reporting v1. */}
        <Route path="/admin/reports">
          <ProtectedRoute component={AdminReports} />
        </Route>
        {/* Task #136 — Auto-sync-lyrics job history. */}
        <Route path="/admin/jobs">
          <ProtectedRoute component={AdminJobs} />
        </Route>
        {/* Task #119 — super-admin platform pricing. Page itself
            short-circuits with a "Super admin only" message when the
            caller's role isn't super_admin. */}
        <Route path="/admin/platform-pricing">
          <ProtectedRoute component={AdminPlatformPricing} />
        </Route>
        {/* Publishing — mechanical-settlement section (list + per-album
            breakdown + per-payee statement). Readable by any admin role;
            the transparency surface for publishers + the operator's
            data-quality check. */}
        <Route path="/admin/publishing/payee">
          <ProtectedRoute component={AdminPublishing} />
        </Route>
        <Route path="/admin/publishing/albums/:albumId">
          <ProtectedRoute component={AdminPublishing} />
        </Route>
        <Route path="/admin/publishing">
          <ProtectedRoute component={AdminPublishing} />
        </Route>
        {/* Task #737 — read-only GoodDeed pricing summary, readable by
            any admin role (Platform pricing above stays super-admin). */}
        <Route path="/admin/gooddeed-pricing">
          <ProtectedRoute component={AdminGoodDeedPricing} />
        </Route>
        {/* Task #543 — Bill-only payout-release queue. */}
        <Route path="/admin/payouts-release">
          <ProtectedRoute component={AdminPayoutsRelease} />
        </Route>
        {/* Task #475 — Soft-delete trash. Page self-gates on super_admin
            via /api/admin/trash returning 403 for everyone else. */}
        <Route path="/admin/trash">
          <ProtectedRoute component={AdminTrash} />
        </Route>
        {/* Task #2270 — QA test-purchase order cleanup (non-production only). */}
        <Route path="/admin/qa-orders">
          <ProtectedRoute component={AdminQaOrders} />
        </Route>
        {/* Bare /admin used to render the legacy 3-column monolith. We now
            redirect straight into the new Albums index so anyone who lands
            on /admin sees the updated chrome. The legacy page is still
            reachable at /admin/classic for the few editing flows that
            haven't been ported yet. */}
        <Route path="/admin/classic">
          <ProtectedRoute component={Admin} />
        </Route>
        {/* Task #140 — Stripe-style admin dashboard is the new /admin
            landing. Albums stays one click away in the sidebar. */}
        <Route path="/admin/dashboard">
          <ProtectedRoute component={AdminDashboard} />
        </Route>
        <Route path="/admin">
          <Redirect to="/admin/dashboard" />
        </Route>
        {/* Task #1310 — two-part artist/album share link. MUST stay below
            every literal two-segment route above (e.g. /album/:id,
            /artist/:slug, /instrument/:id) so those win; falls through to
            the public two-part resolver otherwise. Both segments are
            validated as non-reserved by the server before the album
            resolves. */}
        <Route path="/:artistSlug/:albumSlug" component={ShareSlugTwo} />
        {/* Task #1766 — single-segment share link (get.goodtunes.music/<slug>,
            e.g. /hope). MUST stay below every literal single-segment route
            above (all reserved — see shared/shareSlug.ts) so those win; only
            unmatched single segments fall through to the public single-slug
            resolver. Disjoint from the two-part route above (segment count). */}
        <Route path="/:slug" component={ShareSlugOne} />
        <Route path="/">
          {isStoreHost() ? (
            <Redirect to="/store" />
          ) : user ? (
            <Redirect to="/admin" />
          ) : (
            <Redirect to="/login" />
          )}
        </Route>
        <Route>
          {user ? <Redirect to="/admin" /> : <Redirect to="/login" />}
        </Route>
      </Switch>
      {/* Task #1557 — tablet/desktop renders the profile editor as a card
          overlay above the preserved origin screen (the Switch above is
          pinned to that origin while this is active). Phone keeps it as the
          /account/edit route inside the Switch. */}
      {editOverlayActive && <EditAccount />}
      <PlayerOverlay />
      {/* Task #547 — desktop (≥1024px web) storefront sidebar.
          Self-gates on route (storefront paths only) + viewport +
          !native. Mobile/tablet keep the floating BottomNav. */}
      <StorefrontSidebar />
      {/* Task #1523 — persistent desktop lyrics rail. Self-gates on the same
          storefront routes + viewport, mirrors the left rail's full height,
          and stays open across navigation (global PlayerContext.showLyrics).
          The album page renders its OWN in-flow lyrics panel. */}
      <DesktopLyricsRail />
      {/* Task #53 — one-time new-fan welcome sheet for free signups.
          Self-gates: only renders for customer sessions with no library,
          no legacy import, and newFanWelcomeSeenAt IS NULL. Never shows on
          admin/auth/checkout paths. iOS-safe: zero Buy/price copy. */}
      <NewFanWelcomeSheet />
      {user?.kind === "admin" && isAnalyticsDebugOverlayEnabled() && <AnalyticsDebugOverlay />}
    </>
  );
}

// Registers the native push-notification device token once a fan is
// signed in. No-op on web and until auth resolves a customer; the actual
// register/delivery is gated server-side (server/push.ts).
function PushRegistrar() {
  const { user } = useAuth();
  useEffect(() => {
    if (user?.kind === "customer") {
      void initPushNotifications();
    }
  }, [user?.kind]);
  return null;
}

function App() {
  // Task #921 — Tell the boot self-heal the shell actually mounted, which
  // clears the one-reload guard so future redeploys can recover again and
  // ordinary navigation/runtime errors are never mistaken for a failed
  // boot. See client/src/main.tsx + @/lib/bootHeal.
  useEffect(() => {
    markBootSucceeded();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <GlobalErrorBoundary>
          <PlayerProvider>
            <NavVisibilityProvider>
              <TopChromeFrostProvider>
                <UploadManagerProvider>
                  <Toaster />
                  <PushRegistrar />
                  <DownloadEntitlementGuard />
                  <Router />
                  <GlobalUploadIndicator />
                </UploadManagerProvider>
              </TopChromeFrostProvider>
            </NavVisibilityProvider>
          </PlayerProvider>
        </GlobalErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
