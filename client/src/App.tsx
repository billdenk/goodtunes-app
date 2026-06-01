import { Switch, Route, useLocation, Redirect } from "wouter";
import { AnimatePresence } from "framer-motion";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PlayerProvider, usePlayer } from "@/context/PlayerContext";
import { NavVisibilityProvider } from "@/hooks/useNavVisibility";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import { useAuth } from "@/hooks/useAuth";
import { useAuthKind } from "@/hooks/useAuthKind";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AccessNotAuthorizedDialog } from "@/components/AccessNotAuthorizedDialog";
import { Player } from "@/pages/Player";
import { Login } from "@/pages/Login";
import { Collection } from "@/pages/Collection";
import { AlbumDetail } from "@/pages/AlbumDetail";
import { InstrumentDetail } from "@/pages/InstrumentDetail";
import { Playlists } from "@/pages/Playlists";
import { Account } from "@/pages/Account";
import { EditAccount } from "@/pages/EditAccount";
import { FavoriteArtists } from "@/pages/FavoriteArtists";
import { Bookmarks } from "@/pages/Bookmarks";
import { ArtistDetail } from "@/pages/ArtistDetail";
import { ArtistDashboard } from "@/pages/ArtistDashboard";
import { NonProfitDashboard } from "@/pages/NonProfitDashboard";
import { LabelDashboard } from "@/pages/LabelDashboard";
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
import { AdminManufacturers } from "@/pages/AdminManufacturers";
import { AdminManufacturer } from "@/pages/AdminManufacturer";
import { AdminFulfillmentPartners } from "@/pages/AdminFulfillmentPartners";
import { AdminFulfillmentPartner } from "@/pages/AdminFulfillmentPartner";
import { Welcome } from "@/pages/Welcome";
import { WelcomeInvitee } from "@/pages/WelcomeInvitee";
// Task #400 — Welcome-back flow for imported gogoods.com fans.
import { WelcomeBack } from "@/pages/WelcomeBack";
// Task #537 — Finish-signup screen for OAuth-minted customer accounts.
import { FinishSetup } from "@/pages/FinishSetup";
import { AccountMerge } from "@/pages/AccountMerge";
import { AdminWelcomeBack } from "@/pages/AdminWelcomeBack";
import { Orders } from "@/pages/Orders";
import { AdminOrders } from "@/pages/AdminOrders";
import { AdminPrintQueue } from "@/pages/AdminPrintQueue";
import { AdminLegacyImageAudit } from "@/pages/AdminLegacyImageAudit";
import { CertProvenance } from "@/pages/CertProvenance";
import AdminSecurity from "@/pages/AdminSecurity";
import { AdminInvites } from "@/pages/AdminInvites";
import { AdminEarmarkedArtists } from "@/pages/AdminEarmarkedArtists";
import { AdminPressEarlyCutQueue } from "@/pages/AdminPressEarlyCutQueue";
import { AdminInviteTree } from "@/pages/AdminInviteTree";
import { AdminReview } from "@/pages/AdminReview";
import { AdminPressingOrders } from "@/pages/AdminPressingOrders";
import AcceptInvite from "@/pages/AcceptInvite";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import { GiftClaim } from "@/pages/GiftClaim";
import { Redeem } from "@/pages/Redeem";
import { AdminShopify } from "@/pages/AdminShopify";
import { AdminAlbumEngagement } from "@/pages/AdminAlbumEngagement";
import { AnalyticsDebugOverlay } from "@/components/admin/AnalyticsDebugOverlay";
// Task #536 — "What's New" welcome-back sheet for returning fans.
import { WhatsNewSheet } from "@/components/WhatsNewSheet";
import { ScreenTag } from "@/components/admin/ScreenTag";
import { isAnalyticsDebugOverlayEnabled } from "@/lib/analytics";
import { AdminReports } from "@/pages/AdminReports";
import { AdminJobs } from "@/pages/AdminJobs";
import { AdminPlatformPricing } from "@/pages/AdminPlatformPricing";
import { AdminGoodDeedPricing } from "@/pages/AdminGoodDeedPricing";
import AdminPayoutsRelease from "@/pages/AdminPayoutsRelease";
import { AdminDashboard } from "@/pages/AdminDashboard";
import { VendorPortal } from "@/pages/VendorPortal";
import ErrorPage from "@/pages/ErrorPage";
import { AdminShellErrorBoundary } from "@/components/admin/AdminShellErrorBoundary";
import { StorefrontSidebar } from "@/components/StorefrontSidebar";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#00062B] flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <img src="/goodtunes-logo-white-sm.png" alt="GoodTunes" className="w-40 max-w-[45vw] h-auto opacity-50" />
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    );
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
  // AnimatePresence keeps <Player> mounted while its exit (slide-down)
  // animation plays so closing eases back to the mini-player instead of
  // vanishing. The open animation rides the motion.div's initial/animate.
  return (
    <AnimatePresence>
      {showPlayer && <Player key="now-playing" />}
    </AnimatePresence>
  );
}

function Router() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  const kind = useAuthKind();
  // Task #859 — an `artist` partner is scoped to a quote sandbox. We read
  // their role so the deep-link guard below can bounce any /admin/* URL
  // that isn't their releases list or an album detail. The server is the
  // real enforcement (403/404); this just mirrors it client-side.
  const adminRole = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
    enabled: !!user && kind === "admin",
  });
  const isArtistPartner = adminRole.data?.role === "artist";

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
  const showAccessGuard = onAdminShell && !isLoading && !user;
  const accessRequest = useQuery<{ displayName: string; email: string } | null>({
    queryKey: ["/api/admin/access-request"],
    queryFn: async () => {
      try {
        const r = await apiRequest("POST", "/api/admin/access-request");
        return (await r.json()) as { displayName: string; email: string };
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
    return <Redirect to="/finish-setup" />;
  }

  if (isProdHost) {
    if (kind === "customer" && location.startsWith("/admin")) {
      return <Redirect to="/account" />;
    }
    if (kind === "admin" && (
      location.startsWith("/collection") || location.startsWith("/account") ||
      location.startsWith("/playlists") || location.startsWith("/chat") ||
      location.startsWith("/album") || location.startsWith("/artist") ||
      location.startsWith("/instrument") || location.startsWith("/search") ||
      location.startsWith("/recents")
    )) {
      return <Redirect to="/admin" />;
    }
  }

  // Task #859 — artist quote sandbox deep-link guard. An `artist` partner
  // may reach only their releases list and an album detail page; every
  // other /admin/* surface (dashboard, people, vendors, presses, the
  // per-album engagement analytics, etc.) bounces back to the list. Auth
  // paths stay open so a locked-out artist can still sign in/out.
  if (isArtistPartner && location.startsWith("/admin")) {
    const isAlbumList =
      location === "/admin/albums" || location.startsWith("/admin/albums?");
    const isAlbumDetail = /^\/admin\/albums\/[^/?]+(\?.*)?$/.test(location);
    const isAuthPath =
      location.startsWith("/admin/login") ||
      location.startsWith("/admin/logout") ||
      location.startsWith("/admin/register") ||
      location.startsWith("/admin/forgot-password") ||
      location.startsWith("/admin/reset-password");
    if (!isAlbumList && !isAlbumDetail && !isAuthPath) {
      return <Redirect to="/admin/albums" />;
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#00062B] flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <img src="/goodtunes-logo-white-sm.png" alt="GoodTunes" className="w-40 max-w-[45vw] h-auto opacity-50" />
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <>
      <Switch>
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
        {/* Task #434 — Audit imported rows still on tinifycdn.com */}
        <Route path="/admin/legacy-image-audit">
          <ProtectedRoute component={AdminLegacyImageAudit} />
        </Route>
        {/* Task #128 — Public per-deed provenance page (QR target).
            No auth — the short id is the secret. */}
        <Route path="/g/:shortId" component={CertProvenance} />
        <Route path="/admin/security">
          <ProtectedRoute component={AdminSecurity} />
        </Route>
        <Route path="/admin/invites">
          <ProtectedRoute component={AdminInvites} />
        </Route>
        {/* Task #546 — Pre-seeded "earmarked folks" list super-admin
            curates; artists see these as one-tap invite chips. */}
        <Route path="/admin/earmarked-artists">
          <ProtectedRoute component={AdminEarmarkedArtists} />
        </Route>
        {/* Task #533 — Pool-funded early masters cut review queue. */}
        <Route path="/admin/early-cut">
          <ProtectedRoute component={AdminPressEarlyCutQueue} />
        </Route>
        {/* Task #350 — Invite tree (multi-level referral visualiser). */}
        <Route path="/admin/invite-tree">
          <ProtectedRoute component={AdminInviteTree} />
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
        <Route path="/collection">
          <ProtectedRoute component={Collection} />
        </Route>
        <Route path="/album/:id" component={AlbumDetail} />
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
        <Route path="/artist/:slug">
          <ProtectedRoute component={ArtistDetail} />
        </Route>
        {/* Task #76 — Label rollup reporting dashboard. Customer hosts
            never see /label* (no host-rewrite); admin/dev hosts can. */}
        <Route path="/label">
          <ProtectedRoute component={LabelDashboard} />
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
        <Route path="/admin/albums/:id">
          <ProtectedRoute component={AdminAlbum} />
        </Route>
        <Route path="/admin/shopify">
          <ProtectedRoute component={AdminShopify} />
        </Route>
        <Route path="/admin/albums">
          <ProtectedRoute component={AdminAlbums} />
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
        <Route path="/admin/manufacturers/:id">
          <ProtectedRoute component={AdminManufacturer} />
        </Route>
        <Route path="/admin/manufacturers">
          <ProtectedRoute component={AdminManufacturers} />
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
        <Route path="/">
          {user ? <Redirect to="/admin" /> : <Redirect to="/login" />}
        </Route>
        <Route>
          {user ? <Redirect to="/admin" /> : <Redirect to="/login" />}
        </Route>
      </Switch>
      <PlayerOverlay />
      {/* Task #536 — gates itself on /api/me/whats-new (recognized
          customer + version behind current) so it's safe to mount
          globally. Won't render on admin/auth/welcome/checkout routes. */}
      <WhatsNewSheet />
      {/* Task #547 — desktop (≥1024px web) storefront sidebar.
          Self-gates on route (storefront paths only) + viewport +
          !native. Mobile/tablet keep the floating BottomNav. */}
      <StorefrontSidebar />
      {user?.kind === "admin" && isAnalyticsDebugOverlayEnabled() && <AnalyticsDebugOverlay />}
      {/* Super-admin-only screen-code chip. Shown on every page so Nick
          can include the code in a screenshot/comment and we know
          exactly which route → file → component to touch. Self-gates on
          super_admin via /api/me/role. */}
      <ScreenTag />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <GlobalErrorBoundary>
          <PlayerProvider>
            <NavVisibilityProvider>
              <Toaster />
              <Router />
            </NavVisibilityProvider>
          </PlayerProvider>
        </GlobalErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
