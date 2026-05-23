import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PlayerProvider, usePlayer } from "@/context/PlayerContext";
import { NavVisibilityProvider } from "@/hooks/useNavVisibility";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import { useAuth } from "@/hooks/useAuth";
import { useAuthKind } from "@/hooks/useAuthKind";
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
import { Chat, ChatThreadPage } from "@/pages/Chat";
import { Admin } from "@/pages/Admin";
import { AdminCustomers } from "@/pages/AdminCustomers";
import { AdminCustomerDetail } from "@/pages/AdminCustomerDetail";
import { AdminAlbums } from "@/pages/AdminAlbums";
import { AdminAlbum } from "@/pages/AdminAlbum";
import { AdminPeople } from "@/pages/AdminPeople";
import { AdminPerson } from "@/pages/AdminPerson";
import AdminNonProfit from "@/pages/AdminNonProfit";
import { AdminNonProfits } from "@/pages/AdminNonProfits";
import { AdminFanOrders } from "@/pages/AdminFanOrders";
import { AdminInstruments } from "@/pages/AdminInstruments";
import { AdminInstrument } from "@/pages/AdminInstrument";
import { AdminVendors } from "@/pages/AdminVendors";
import { AdminVendor } from "@/pages/AdminVendor";
import { AdminLabels } from "@/pages/AdminLabels";
import { AdminLabel } from "@/pages/AdminLabel";
import { AdminManufacturers } from "@/pages/AdminManufacturers";
import { AdminManufacturer } from "@/pages/AdminManufacturer";
import { AdminFulfillmentPartners } from "@/pages/AdminFulfillmentPartners";
import { AdminFulfillmentPartner } from "@/pages/AdminFulfillmentPartner";
import { Welcome } from "@/pages/Welcome";
import { Orders } from "@/pages/Orders";
import { AdminOrders } from "@/pages/AdminOrders";
import { AdminPrintQueue } from "@/pages/AdminPrintQueue";
import { CertProvenance } from "@/pages/CertProvenance";
import AdminSecurity from "@/pages/AdminSecurity";
import { AdminInvites } from "@/pages/AdminInvites";
import { AdminReview } from "@/pages/AdminReview";
import { AdminPressingOrders } from "@/pages/AdminPressingOrders";
import AcceptInvite from "@/pages/AcceptInvite";
import { GiftClaim } from "@/pages/GiftClaim";
import { Redeem } from "@/pages/Redeem";
import { AdminShopify } from "@/pages/AdminShopify";
import { AdminAlbumEngagement } from "@/pages/AdminAlbumEngagement";
import { AnalyticsDebugOverlay } from "@/components/admin/AnalyticsDebugOverlay";
import { ScreenTag } from "@/components/admin/ScreenTag";
import { isAnalyticsDebugOverlayEnabled } from "@/lib/analytics";
import { AdminReports } from "@/pages/AdminReports";
import { AdminJobs } from "@/pages/AdminJobs";
import { AdminPlatformPricing } from "@/pages/AdminPlatformPricing";
import { AdminDashboard } from "@/pages/AdminDashboard";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#00062B] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="/figmaAssets/--.svg" alt="GoodTunes" className="w-8 h-10 opacity-60" />
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  if (!user) {
    // Preserve the admin/customer distinction on the dev URL — visiting
    // /admin/* unauthenticated should land on the admin-chromed login,
    // not the dark customer one.
    const isAdminPath = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
    return <Redirect to={isAdminPath ? "/admin/login" : "/login"} />;
  }

  return <Component />;
}

function PlayerOverlay() {
  const { showPlayer } = usePlayer();
  if (!showPlayer) return null;
  return <Player />;
}

function Router() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  const kind = useAuthKind();

  // Host-based gating: customer host blocks /admin* paths (redirect into
  // /account). Admin host blocks the customer player surfaces (redirect
  // into /admin). The *.replit.app preview is treated as dev and lets
  // both render so we can develop without juggling hosts. Production
  // 301s from the platform layer also enforce this at the network edge.
  const isProdHost = typeof window !== "undefined" && /goodtunes\.music$/.test(window.location.host);
  if (isProdHost) {
    if (kind === "customer" && location.startsWith("/admin")) {
      return <Redirect to="/account" />;
    }
    if (kind === "admin" && (
      location.startsWith("/collection") || location.startsWith("/account") ||
      location.startsWith("/playlists") || location.startsWith("/chat") ||
      location.startsWith("/album") || location.startsWith("/artist") ||
      location.startsWith("/instrument")
    )) {
      return <Redirect to="/admin" />;
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#00062B] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="/figmaAssets/--.svg" alt="GoodTunes" className="w-8 h-10 opacity-60" />
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Login} />
        {/* Mirror routes under /admin so the dev URL can preview the
            admin-chromed login (detectAuthKind falls back to pathname
            on *.replit.app). On the admin.goodtunes.music host the
            chrome is host-derived and these are simply aliases. */}
        <Route path="/admin/login" component={Login} />
        <Route path="/admin/register" component={Login} />
        {/* Task #44 — post-checkout landing. Public so the Stripe
            return URL works even before the auth cookie has settled
            (Welcome polls /api/checkout/session/:id to confirm the
            order, then bounces into the unlocked album). */}
        <Route path="/welcome" component={Welcome} />
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
        {/* Task #128 — Printable GoodDeed certificate print queue. */}
        <Route path="/admin/print-queue">
          <ProtectedRoute component={AdminPrintQueue} />
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
        <Route path="/artist/:slug">
          <ProtectedRoute component={ArtistDetail} />
        </Route>
        {/* Task #76 — Label rollup reporting dashboard. Customer hosts
            never see /label* (no host-rewrite); admin/dev hosts can. */}
        <Route path="/label">
          <ProtectedRoute component={LabelDashboard} />
        </Route>
        <Route path="/playlists">
          <ProtectedRoute component={Playlists} />
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
