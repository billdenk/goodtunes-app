import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useAuthKind } from "@/hooks/useAuthKind";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, setAuthToken } from "@/lib/queryClient";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { useScrollHideNav } from "@/hooks/useNavVisibility";
import { clearLocalAnalytics } from "@/lib/analytics";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Pencil } from "lucide-react";
import { useFavoriteArtists } from "@/hooks/useFavorites";
import {
  STREAMING_SERVICES,
  getFavoriteStreamingService,
  setFavoriteStreamingService,
  serviceLabel,
  isStreamingServiceId,
  type StreamingServiceId,
} from "@/lib/streamingService";
import { ServiceGlyphBadge } from "@/components/ui/ServiceGlyph";

// Task #74 — minimal order shape for the "My Orders" card on the
// profile. We only need a few fields to render the count + most-recent
// status line; the full row + detail sheet lives on /orders.
type AccountOrderSummary = {
  id: string;
  status: string;
  fulfillmentStatus?: string | null;
  trackingNumber?: string | null;
  createdAt: string;
  albumTitle: string;
};

// Linked OAuth providers for this account. Reads/writes hit the
// kind-aware /api/auth/identities endpoint — same component works on
// both the customer profile and (eventually) admin account chrome.
// Task #45 — Apple private-relay → real email capture banner. Shows
// when the customer's email is an `@privaterelay.appleid.com`
// forwarder so we can collect a deliverable address for order
// receipts/shipping. Reuses the 6-digit code flow from Task #44.
function PrivateRelayBanner({ relayEmail }: { relayEmail: string }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"enter" | "verify">("enter");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const start = async () => {
    setBusy(true); setErr(null); setDevCode(null);
    try {
      const r = await apiRequest("POST", "/api/customer/real-email/start", { email: newEmail.trim() });
      const j = await r.json();
      if (j?.devCode) setDevCode(String(j.devCode));
      setPhase("verify");
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't send a code — try again");
    } finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true); setErr(null);
    try {
      await apiRequest("POST", "/api/customer/real-email/confirm", { email: newEmail.trim(), code });
      queryClient.invalidateQueries();
      setOpen(false); setPhase("enter"); setCode(""); setNewEmail("");
    } catch (e: any) {
      setErr(e?.message ?? "That code didn't match");
    } finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl overflow-hidden mb-4 px-4 py-3.5" style={{ background: "rgba(255, 84, 112, 0.10)", border: "1px solid rgba(255,84,112,0.25)" }} data-testid="banner-privaterelay">
      <p className="text-white text-sm font-semibold mb-1">Add a real email</p>
      <p className="text-white/70 text-xs leading-snug mb-3">
        You signed in with Apple's <strong>Hide my email</strong>. We can reach you at <span className="font-mono text-white/85">{relayEmail}</span> but deliverability can be flaky — give us a real address for order updates.
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-semibold text-[var(--brand-pink)] active:opacity-70"
          data-testid="button-open-realemail"
        >
          Add real email →
        </button>
      ) : (
        <div className="flex flex-col gap-2 mt-1">
          {phase === "enter" ? (
            <>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false}
                className="w-full border border-white/15 rounded-xl px-3 py-2.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[var(--brand-blue)]"
                style={{ background: "rgba(255,255,255,0.06)" }}
                data-testid="input-realemail"
              />
              {err && <p className="text-xs text-rose-300" data-testid="text-realemail-err">{err}</p>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={start}
                  disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail.trim())}
                  className="px-3 py-1.5 rounded-full bg-[var(--brand-blue)] text-white text-xs font-semibold disabled:opacity-40"
                  data-testid="button-send-realemail-code"
                >
                  {busy ? "Sending…" : "Send code"}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="text-white/55 text-xs" data-testid="button-cancel-realemail">Cancel</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-white/65 text-xs">Code sent to <strong>{newEmail}</strong>.{devCode ? <> Dev code: <code className="font-mono text-white/85">{devCode}</code></> : null}</p>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                className="w-full border border-white/15 rounded-xl px-3 py-2.5 text-white text-center text-lg tracking-widest focus:outline-none focus:border-[var(--brand-blue)]"
                style={{ background: "rgba(255,255,255,0.06)" }}
                data-testid="input-realemail-code"
              />
              {err && <p className="text-xs text-rose-300" data-testid="text-realemail-err">{err}</p>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={confirm}
                  disabled={busy || code.length !== 6}
                  className="px-3 py-1.5 rounded-full bg-[var(--brand-blue)] text-white text-xs font-semibold disabled:opacity-40"
                  data-testid="button-confirm-realemail"
                >
                  {busy ? "Verifying…" : "Confirm"}
                </button>
                <button type="button" onClick={() => { setPhase("enter"); setCode(""); }} className="text-white/55 text-xs" data-testid="button-back-realemail">Back</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function LinkedProvidersPanel() {
  const kind = useAuthKind();
  const { data: identities = [], isLoading } = useQuery<Array<{ id: string; provider: string; email: string | null }>>({
    queryKey: ["/api/auth/identities"],
  });
  const unlink = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/auth/identities/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/identities"] }),
  });
  const linkProvider = (p: "google" | "apple") => {
    window.location.href = `/api/auth/${p}/start?kind=${kind}&link=1`;
  };
  const hasGoogle = identities.some((i) => i.provider === "google");
  const hasApple = identities.some((i) => i.provider === "apple");
  return (
    <>
      <p className="text-white/40 text-xs uppercase tracking-widest font-medium mb-2 mt-4 ml-1">Linked Accounts</p>
      <div className="rounded-2xl overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.05)" }}>
        {isLoading ? (
          <p className="px-4 py-3 text-white/55 text-sm">Loading…</p>
        ) : (
          <>
            {identities.map((id) => (
              <div key={id.id} className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }} data-testid={`row-identity-${id.provider}`}>
                <div>
                  <p className="text-white text-base capitalize">{id.provider}</p>
                  {id.email && <p className="text-white/45 text-xs">{id.email}</p>}
                </div>
                <button type="button" onClick={() => unlink.mutate(id.id)} disabled={unlink.isPending} className="text-red-400 text-sm" data-testid={`button-unlink-${id.provider}`}>Unlink</button>
              </div>
            ))}
            {!hasGoogle && (
              <button type="button" onClick={() => linkProvider("google")} className="w-full py-3.5 text-left px-4 text-white text-base active:bg-white/[0.06] border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }} data-testid="button-link-google">
                Link Google
              </button>
            )}
            {!hasApple && (
              <button type="button" onClick={() => linkProvider("apple")} className="w-full py-3.5 text-left px-4 text-white text-base active:bg-white/[0.06] border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }} data-testid="button-link-apple">
                Link Apple
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}

/** Public privacy-policy URL. Lives on the marketing site, opened in the
 *  system browser (will become SFSafariViewController / Chrome Custom Tabs
 *  in the native port — see in-app browser note in replit.md). */
const PRIVACY_POLICY_URL = "https://goodtunes.music/privacy";

/** Profile photo is stored client-side as a data URL in localStorage (same
 *  pattern as favorites + chat). When the GT backend lands, swap for an
 *  uploaded URL on the user record. */
const profilePhotoKey = (userId: string) => `gt:profile-photo:${userId}`;

export function Account() {
  const { user, logout, updateProfile } = useAuth();
  const [, navigate] = useLocation();
  // Customer OAuth callback redirects to `/account#token=<jwt>` (server
  // sets a session cookie too, but the SPA's Bearer token in
  // localStorage takes precedence in useAuth — if a stale token from a
  // previous account is still there, `/api/me` 401s and the page
  // null-pointers downstream). Parse the hash here the same way
  // Login.tsx does on the login surface, then strip it from the URL
  // and invalidate caches so the new identity loads cleanly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash.startsWith("#token=")) return;
    try {
      const token = decodeURIComponent(window.location.hash.slice("#token=".length));
      if (token) {
        setAuthToken(token);
        window.history.replaceState({}, "", "/account");
        queryClient.invalidateQueries();
      }
    } catch {
      // Malformed hash — just strip it so the user isn't stuck looking
      // at a token in the address bar.
      window.history.replaceState({}, "", "/account");
    }
  }, []);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearedToast, setClearedToast] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  // Task #734 — favorite streaming service. Sourced from the customer
  // profile when signed in, falling back to the localStorage copy that
  // also serves guest fans. Mirrored back to both on change.
  const [favService, setFavService] = useState<StreamingServiceId | null>(
    () => getFavoriteStreamingService(),
  );
  useEffect(() => {
    if (user?.favoriteStreamingService && isStreamingServiceId(user.favoriteStreamingService)) {
      setFavService(user.favoriteStreamingService);
    }
  }, [user?.favoriteStreamingService]);
  const [showStreaming, setShowStreaming] = useState(false);
  const handlePickStreamingService = (id: StreamingServiceId | null) => {
    setFavService(id);
    setFavoriteStreamingService(id);
    if (user?.kind === "customer") {
      updateProfile({ favoriteStreamingService: id }).catch(() => {});
    }
  };

  const handleClearHistory = async () => {
    setClearing(true);
    try { await clearLocalAnalytics(); } catch {}
    setClearing(false);
    setConfirmClear(false);
    setClearedToast(true);
    setTimeout(() => setClearedToast(false), 2200);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollHideNav(scrollRef);

  const initials = user?.displayName
    ? user.displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  // Profile photo comes from the server (auth payload). Actual edit lives on
  // the dedicated /account/edit page.
  const photoUrl = user?.photoUrl ?? null;

  // Counts for the two "Your Collections" rows. Both surfaces below get
  // their own full-page list view (FavoriteArtists / Bookmarks) — Account
  // just shows the count and pushes a child screen, Apple-Settings-style,
  // so this page stays scannable as we add more collection types.
  const favArtists = useFavoriteArtists();
  const favoriteArtistCount = favArtists.ordered.length;

  // Task #74 — "My Orders" card pulls a thin summary off the same
  // /api/orders endpoint the Orders page uses. We surface the count
  // plus a one-line current status (fulfillment first if it's a
  // physical order, otherwise the Stripe-side status) so the fan can
  // tell at a glance whether anything is moving.
  const { data: orderSummaries = [] } = useQuery<AccountOrderSummary[]>({
    queryKey: ["/api/orders"],
    enabled: !!user,
  });
  const orderCount = orderSummaries.length;
  const latestOrder = orderSummaries[0];
  const latestStatusLine = (() => {
    if (!latestOrder) return null;
    const f = latestOrder.fulfillmentStatus;
    if (f === "delivered") return "Latest: Delivered";
    if (f === "shipped") return latestOrder.trackingNumber ? `Latest: Shipped — tracking ${latestOrder.trackingNumber}` : "Latest: Shipped";
    if (f === "in_fulfillment") return "Latest: In fulfillment";
    if (f === "submitted") return "Latest: Submitted to fulfillment";
    if (f === "cancelled") return "Latest: Cancelled";
    if (f === "returned") return "Latest: Returned";
    if (latestOrder.status === "refunded") return "Latest: Refunded";
    if (latestOrder.status === "paid") return "Latest: Paid · digital ready";
    return `Latest: ${latestOrder.status}`;
  })();
  const [bookmarkCount, setBookmarkCount] = useState<number>(0);
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem("gt:bookmarked-instruments");
        const arr = raw ? JSON.parse(raw) : [];
        setBookmarkCount(Array.isArray(arr) ? arr.length : 0);
      } catch { setBookmarkCount(0); }
    };
    load();
    window.addEventListener("focus", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("focus", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  return (
    <main className="relative h-screen w-full flex justify-center overflow-hidden">
      <section className="relative w-full max-w-[390px] md:max-w-[640px] lg:max-w-[760px] lg:mx-auto h-screen text-white flex flex-col">

        <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto scrollbar-hide pb-[170px]">
          {/* Title + profile header now live INSIDE the scroll container so
              the whole page scrolls as one — previously the avatar/name/Edit
              block was fixed above the scroll area and content slid under it. */}
          <header className="flex items-end justify-between px-5 pt-14 pb-3">
            <h1 className="text-white text-[34px] font-bold leading-none tracking-tight" data-testid="text-page-title">Account</h1>
          </header>

          <div className="flex flex-col items-center pt-6 pb-4 px-5">
            {/* Avatar is the edit affordance now — no separate "Edit Profile"
                button below. The brand-blue pencil badge mirrors the
                pencil-on-thumbnail pattern used across the admin
                (AdminPerson photo, AdminVendor logo, AdminAlbum cover) so
                "tap the pencil to edit" reads identically everywhere. */}
            <button
              type="button"
              onClick={() => navigate("/account/edit")}
              aria-label="Edit profile"
              className="relative mb-4 active:scale-[0.97] transition-transform"
              data-testid="button-edit-profile"
            >
              <div
                className="relative w-20 h-20 rounded-full border-2 border-[#319ED8] overflow-hidden flex items-center justify-center text-2xl font-bold text-white"
                style={{ background: photoUrl ? "transparent" : "linear-gradient(135deg, #0D2060, #1a0a5e)" }}
                data-testid="profile-photo"
              >
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <span
                aria-hidden="true"
                className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "#319ED8", boxShadow: "0 0 0 2px #00062B" }}
              >
                <Pencil className="w-3.5 h-3.5 text-white" strokeWidth={2.4} />
              </span>
            </button>
            <p className="text-white text-xl font-bold">{user?.displayName}</p>
            <p className="text-white/50 text-sm mt-1">@{user?.username}</p>
          </div>

          <div className="px-5">
          {/* Your Collections — two rows that push to dedicated list pages.
              Keeps Account a hub instead of a feed; new collection types
              (Followed Labels, Saved Gear, Stations…) slot in here without
              bloating the top-level Account screen. */}
          {/* My Orders — Task #74. Sits above Your Collections because
              an in-flight record purchase ("where's my vinyl?") is the
              most time-sensitive thing the fan can land on; collections
              are evergreen. Hidden entirely when the customer has never
              placed an order so a brand-new profile stays clean. */}
          {orderCount > 0 && (
            <>
              <p className="text-white/40 text-xs uppercase tracking-widest font-medium mb-2 mt-2 ml-1">My Orders</p>
              <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "rgba(255,255,255,0.05)" }}>
                <button
                  type="button"
                  onClick={() => navigate("/orders")}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.06]"
                  data-testid="row-orders"
                >
                  <span className="w-5 flex items-center justify-center flex-shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M16 11V7a4 4 0 0 0-8 0v4" />
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                    </svg>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-white text-base">Orders &amp; tracking</span>
                    {latestStatusLine && (
                      <span className="block text-white/45 text-xs truncate" data-testid="text-orders-latest">{latestStatusLine}</span>
                    )}
                  </span>
                  <span className="text-white/40 text-sm tabular-nums" data-testid="row-orders-count">{orderCount}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.35">
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </>
          )}

          <p className="text-white/40 text-xs uppercase tracking-widest font-medium mb-2 mt-2 ml-1">Your Collections</p>
          <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "rgba(255,255,255,0.05)" }}>
            {([
              {
                label: "Favorite Artists",
                count: favoriteArtistCount,
                onClick: () => navigate("/account/favorite-artists"),
                icon: (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="#319ED8" aria-hidden="true">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ),
                testId: "row-favorite-artists",
              },
              {
                label: "Bookmarks",
                count: bookmarkCount,
                onClick: () => navigate("/account/bookmarks"),
                icon: (
                  <svg width="15" height="17" viewBox="0 0 24 24" fill="#4AFFCA" stroke="#4AFFCA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                ),
                testId: "row-bookmarks",
              },
            ] as const).map(({ label, count, onClick, icon, testId }, i, arr) => (
              <button
                key={label}
                type="button"
                onClick={onClick}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.06] ${i < arr.length - 1 ? "border-b" : ""}`}
                style={i < arr.length - 1 ? { borderColor: "rgba(255,255,255,0.07)" } : undefined}
                data-testid={testId}
              >
                <span className="w-5 flex items-center justify-center flex-shrink-0">{icon}</span>
                <span className="flex-1 text-white text-base">{label}</span>
                <span className="text-white/40 text-sm tabular-nums" data-testid={`${testId}-count`}>{count}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.35">
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>

          {/* Settings rows — moved here from EditAccount so they sit on the
              Account page itself, not inside the Edit Profile flow.
              Listening History used to live as its own top-level group; it
              now lives INSIDE Privacy (Apple-style: tap Privacy → push a
              sub-screen that groups everything privacy-related — listening
              history + the public Privacy Policy link). */}
          <p className="text-white/40 text-xs uppercase tracking-widest font-medium mb-2 mt-2 ml-1">Settings</p>
          <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "rgba(255,255,255,0.05)" }}>
            {/* Task #734 — favorite streaming service. Tapping pushes a
                sub-screen to pick/clear the service GoodTunes hands off to
                when a fan streams a non-hosted track. */}
            <button
              type="button"
              onClick={() => setShowStreaming(true)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left active:bg-white/[0.06] border-b"
              style={{ borderColor: "rgba(255,255,255,0.07)" }}
              data-testid="row-streaming-service"
            >
              <span className="text-white text-base">Streaming Service</span>
              <span className="flex items-center gap-1.5">
                <span className="text-white/45 text-base" data-testid="text-streaming-service-current">
                  {favService ? serviceLabel(favService) : "Not set"}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.35">
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
            {([
              { label: "Notifications", onClick: undefined },
              { label: "Privacy", onClick: () => setShowPrivacy(true) },
              { label: "About GoodTunes®", onClick: undefined },
            ] as const).map(({ label, onClick }, i, arr) => (
              <button
                key={label}
                type="button"
                onClick={onClick}
                className={`w-full flex items-center justify-between px-4 py-3.5 text-left active:bg-white/[0.06] ${i < arr.length - 1 ? "border-b" : ""}`}
                style={i < arr.length - 1 ? { borderColor: "rgba(255,255,255,0.07)" } : undefined}
                data-testid={`row-${label.toLowerCase().replace(/[^a-z]/g, "-")}`}
              >
                <span className="text-white text-base">{label}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.35">
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>

          {user?.email && user.email.endsWith("@privaterelay.appleid.com") && (
            <PrivateRelayBanner relayEmail={user.email} />
          )}

          <LinkedProvidersPanel />

          {/* Task #400 — Fan-initiated account merge. If a fan signed up
              on the new player and *then* discovered their imported
              gogoods.com account exists separately, they can pull all
              that history into the account they're using now. */}
          <AccountMergePanel />

          <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "rgba(255,255,255,0.05)" }}>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full py-3.5 text-center text-red-400 text-base font-normal active:bg-white/[0.06]"
              data-testid="button-sign-out"
            >
              Sign Out
            </button>
          </div>

          {/* Hidden admin shortcut — looks like plain version text, but
              tapping it routes to /admin. IYKYK; lets the team get in
              without burning a visible nav slot. */}
          <p className="text-center text-white/45 text-xs pb-4">
            <a
              href="/admin"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                // Inside the Replit preview iframe (and some sandboxed
                // embeds in Safari), a plain target="_blank" anchor can
                // be silently downgraded to a same-tab navigation. We
                // call window.open synchronously from the user gesture
                // and force a top-level break-out so the new tab lands
                // in the real browser, not the simulator iframe.
                e.preventDefault();
                const url = new URL("/admin", window.location.origin).toString();
                const w = window.open(url, "_blank", "noopener,noreferrer");
                if (!w) {
                  // Popup blocked — fall back to navigating the top
                  // frame so the admin at least opens *somewhere*.
                  try {
                    window.top!.location.href = url;
                  } catch {
                    window.location.href = url;
                  }
                }
              }}
              className="text-inherit no-underline hover:no-underline"
              data-testid="link-hidden-admin"
            >
              Version 1.00
            </a>
          </p>
          </div>
        </div>

        <MiniPlayer />
        <BottomNav />

        {showPrivacy && (
          <PrivacySheet
            onClose={() => setShowPrivacy(false)}
            confirmClear={confirmClear}
            setConfirmClear={setConfirmClear}
            clearing={clearing}
            clearedToast={clearedToast}
            onClearHistory={handleClearHistory}
          />
        )}

        {showStreaming && (
          <StreamingServiceSheet
            current={favService}
            onPick={handlePickStreamingService}
            onClose={() => setShowStreaming(false)}
          />
        )}
      </section>
    </main>
  );
}

/* ─────────────────────────── PrivacySheet ───────────────────────────
 * Apple-Settings-style sub-screen. Pushed in from the right when the
 * user taps Settings › Privacy. Contains everything privacy-related:
 *   • Listening History (record + delete) — moved here from the main
 *     Account page so unrelated content doesn't bloat the top-level
 *     list.
 *   • Privacy Policy — link to the public goodtunes.music/privacy page.
 *     Opens in a new tab on web; will route through the in-app browser
 *     (SFSafariViewController / Chrome Custom Tabs) in the native port.
 * Header mirrors AlbumDetail's pushed sub-views: back chevron on the
 * left, centered title, no right-side chrome.
 * ──────────────────────────────────────────────────────────────────── */
// Task #400 — Fan-initiated account merge. The fan pastes the *other*
// email they used (typically the legacy gogoods.com address); we send
// a 24-hour confirm link to that address. Clicking the link lands on
// /account/merge, which POSTs to /api/me/welcome-back/merge/confirm
// and reparents user_albums + orders + playlists onto the surviving
// account (the one they're signed in as now).
function AccountMergePanel() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/me/welcome-back/merge/start", { otherEmail: email.trim() });
      setSent(true);
      toast({ title: "Check the other inbox", description: "If that account exists, a confirmation link is on its way." });
    } catch (err: any) {
      // Non-enumerating — same toast either way.
      setSent(true);
      toast({ title: "Check the other inbox", description: "If that account exists, a confirmation link is on its way." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "rgba(255,255,255,0.05)" }} data-testid="panel-account-merge">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between px-4 py-3.5 text-left active:bg-white/[0.06]"
          data-testid="button-account-merge-open"
        >
          <div>
            <div className="text-white text-base">These two accounts are me</div>
            <div className="text-white/45 text-xs mt-0.5">Pull a second email's library onto this account.</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.35">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <div className="px-4 py-4">
          {sent ? (
            <div data-testid="merge-start-sent">
              <div className="text-white text-sm font-semibold mb-1">Link sent.</div>
              <p className="text-white/55 text-xs leading-relaxed">
                Open the inbox for that other email and tap the confirmation link to move everything onto this account.
                The link expires in 24 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={start}>
              <p className="text-white/55 text-xs mb-3 leading-relaxed">
                Enter the email on your other GoodTunes account. We'll send a confirmation link there — once you tap it,
                we'll move that account's orders and library onto this one.
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="the.other@example.com"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                className="w-full border border-white/10 bg-white/[0.06] rounded-xl px-3 py-2.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[var(--brand-blue)] mb-3"
                required
                data-testid="input-account-merge-email"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setOpen(false); setEmail(""); }}
                  className="px-3 py-2 rounded-xl text-white/70 text-sm border border-white/10"
                  data-testid="button-account-merge-cancel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !email.trim()}
                  className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #1D5E8F, var(--brand-blue))" }}
                  data-testid="button-account-merge-send"
                >
                  {submitting ? "Sending…" : "Send confirmation link"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function PrivacySheet({
  onClose,
  confirmClear,
  setConfirmClear,
  clearing,
  clearedToast,
  onClearHistory,
}: {
  onClose: () => void;
  confirmClear: boolean;
  setConfirmClear: (v: boolean) => void;
  clearing: boolean;
  clearedToast: boolean;
  onClearHistory: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-[60] flex flex-col"
      style={{ background: "#00062B" }}
      role="dialog"
      aria-modal="true"
      aria-label="Privacy"
      data-testid="sheet-privacy"
    >
      <div className="relative flex items-center justify-center pt-12 pb-3 px-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="absolute left-3 top-11 w-11 h-11 rounded-full flex items-center justify-center active:scale-[0.94] transition-transform"
          style={{ background: "rgba(255,255,255,0.10)" }}
          data-testid="button-privacy-back"
        >
          <ChevronLeft className="w-[22px] h-[22px] text-white" style={{ transform: "translateX(-1px)" }} strokeWidth={2.2} />
        </button>
        <h1 className="text-white text-[17px] font-semibold">Privacy</h1>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-10">
        <p className="text-white/40 text-xs uppercase tracking-widest font-medium mb-2 mt-2 ml-1">Listening History</p>
        <div className="rounded-2xl overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.05)" }}>
          <p className="px-4 pt-3 pb-2 text-white/55 text-xs leading-snug">
            We record what you listen to so artists can see which songs resonate. You can wipe your history any time.
          </p>
          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="w-full py-3.5 text-left px-4 text-white text-base active:bg-white/[0.06] border-t"
              style={{ borderColor: "rgba(255,255,255,0.07)" }}
              data-testid="button-clear-history"
            >
              Delete My Listening History
            </button>
          ) : (
            <div className="px-4 py-3 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              <p className="text-white text-sm mb-3">Permanently delete every play, skip, and favorite event tied to this account?</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="flex-1 py-3 rounded-2xl border border-white/20 text-white/60 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onClearHistory}
                  disabled={clearing}
                  className="flex-1 py-3 rounded-2xl font-semibold text-sm text-white disabled:opacity-50"
                  style={{ background: "#FF5470" }}
                  data-testid="button-confirm-clear-history"
                >
                  {clearing ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          )}
        </div>
        {clearedToast && (
          <div className="mb-3 flex items-center gap-2 text-[var(--brand-mint)] text-sm px-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" />
            </svg>
            Listening history deleted
          </div>
        )}

        <p className="text-white/40 text-xs uppercase tracking-widest font-medium mb-2 mt-4 ml-1">Policy</p>
        <div className="rounded-2xl overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.05)" }}>
          <a
            href={PRIVACY_POLICY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-between px-4 py-3.5 text-left active:bg-white/[0.06]"
            data-testid="link-privacy-policy"
          >
            <span className="text-white text-base">Privacy Policy</span>
            {/* Apple's external-link glyph (top-right arrow out of box) —
                signals this leaves the app, not just a deeper screen. */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.45" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 4h6v6" />
              <path d="M20 4L10 14" />
              <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
            </svg>
          </a>
        </div>
        <p className="text-white/35 text-xs leading-relaxed px-1">
          Opens goodtunes.music/privacy in your browser.
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────── StreamingServiceSheet ──────────────────────
 * Task #734 — Apple-Settings-style sub-screen for picking the streaming
 * service GoodTunes hands off to when a fan plays a track GoodTunes
 * doesn't host. The choice is saved (localStorage + customer profile)
 * so the in-album "Stream this" control skips the picker next time. A
 * checkmark marks the current pick; tapping the active one again clears
 * it (back to first-tap picker behavior).
 * ──────────────────────────────────────────────────────────────────── */
function StreamingServiceSheet({
  current,
  onPick,
  onClose,
}: {
  current: StreamingServiceId | null;
  onPick: (id: StreamingServiceId | null) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-[60] flex flex-col"
      style={{ background: "#00062B" }}
      role="dialog"
      aria-modal="true"
      aria-label="Streaming Service"
      data-testid="sheet-streaming-service"
    >
      <div className="relative flex items-center justify-center pt-12 pb-3 px-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="absolute left-3 top-11 w-11 h-11 rounded-full flex items-center justify-center active:scale-[0.94] transition-transform"
          style={{ background: "rgba(255,255,255,0.10)" }}
          data-testid="button-streaming-back"
        >
          <ChevronLeft className="w-[22px] h-[22px] text-white" style={{ transform: "translateX(-1px)" }} strokeWidth={2.2} />
        </button>
        <h1 className="text-white text-[17px] font-semibold">Streaming Service</h1>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-10">
        <p className="text-white/55 text-xs leading-relaxed mb-4 px-1">
          Some tracks on GoodTunes are credited here but stream on another service. Pick where you'd like to listen — we'll send you straight there.
        </p>
        <div className="rounded-2xl overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.05)" }}>
          {STREAMING_SERVICES.map((svc, i, arr) => {
            const active = current === svc.id;
            return (
              <button
                key={svc.id}
                type="button"
                onClick={() => onPick(active ? null : svc.id)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.06] ${i < arr.length - 1 ? "border-b" : ""}`}
                style={i < arr.length - 1 ? { borderColor: "rgba(255,255,255,0.07)" } : undefined}
                data-testid={`row-streaming-pick-${svc.id}`}
              >
                <ServiceGlyphBadge id={svc.id} />
                <span className="flex-1 text-white text-base">{svc.label}</span>
                {active && (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--brand-mint)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    data-testid={`icon-streaming-active-${svc.id}`}
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-white/35 text-xs leading-relaxed px-1">
          {current
            ? `Tap ${serviceLabel(current)} again to clear it — we'll ask each time instead.`
            : "Until you pick one, we'll ask which service to use the first time you stream."}
        </p>
      </div>
    </div>
  );
}
