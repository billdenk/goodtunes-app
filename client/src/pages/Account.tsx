import { useState, useRef, useEffect, type ReactNode } from "react";
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
import { ChevronLeft, Pencil, Bell, BellOff } from "lucide-react";
import {
  ordersEnabled,
  streamingHandoffEnabled,
  notificationsEnabled,
  aboutEnabled,
  linkedAccountsEnabled,
  setPasswordEnabled,
  isNativeIOS,
} from "@/lib/platform";
import {
  STREAMING_SERVICES,
  getFavoriteStreamingService,
  setFavoriteStreamingService,
  serviceLabel,
  isStreamingServiceId,
  type StreamingServiceId,
} from "@/lib/streamingService";
import { ServiceGlyphBadge } from "@/components/ui/ServiceGlyph";
import { deriveAccountIdentity } from "@/lib/accountIdentity";
import { useLyricsRailOpen } from "@/components/ui/DesktopLyricsRail";
import { LYRICS_RAIL_CONTENT_OFFSET } from "@/hooks/useDesktopShell";

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
      <p className="text-fan-primary text-sm font-semibold mb-1">Add a real email</p>
      <p className="text-fan-secondary text-xs leading-snug mb-3">
        You signed in with Apple's <strong>Hide my email</strong>. We can reach you at <span className="font-mono text-fan-primary">{relayEmail}</span> but deliverability can be flaky — give us a real address for order updates.
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
                <button type="button" onClick={() => setOpen(false)} className="text-fan-secondary text-xs" data-testid="button-cancel-realemail">Cancel</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-fan-secondary text-xs">Code sent to <strong>{newEmail}</strong>.{devCode ? <> Dev code: <code className="font-mono text-fan-primary">{devCode}</code></> : null}</p>
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
                <button type="button" onClick={() => { setPhase("enter"); setCode(""); }} className="text-fan-secondary text-xs" data-testid="button-back-realemail">Back</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Task #1145 — one-time "add your name" nudge. Some sign-in paths leave
// us with no real name: Apple "Hide My Email" can withhold it, and fans
// created before realName existed never had one stored. Those accounts
// fall back to showing their @handle/display name in the profile header.
// We gently prompt the fan (once, dismissible) to add a full name; saving
// writes realName so the header + avatar initials read with a real name.
// Dismissal is per-user in localStorage so a fan who taps "Not now" isn't
// nagged again — but the nudge naturally disappears for everyone once a
// name is on file, so a future name removal would re-surface it.
const namePromptDismissedKey = (userId: string) => `gt:name-prompt-dismissed:${userId}`;

function AddNameBanner({ userId }: { userId: string }) {
  const { updateProfile, isUpdatePending, updateError } = useAuth();
  const [name, setName] = useState("");
  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await updateProfile({ realName: trimmed });
      // On success the /api/me cache updates and this banner unmounts
      // (the parent stops rendering it once realName is present).
    } catch {
      // updateError surfaces the message inline; keep the form open.
    }
  };
  const dismiss = () => {
    try { localStorage.setItem(namePromptDismissedKey(userId), "1"); } catch {}
    // Re-render the parent so it re-reads the dismissal flag.
    window.dispatchEvent(new Event("gt:name-prompt-dismissed"));
  };
  return (
    <div className="rounded-2xl overflow-hidden mb-6 px-4 py-3.5" style={{ background: "rgba(49, 158, 216, 0.10)", border: "1px solid rgba(49,158,216,0.25)" }} data-testid="banner-add-name">
      <p className="text-fan-primary text-sm font-semibold mb-1">Add your name</p>
      <p className="text-fan-secondary text-xs leading-snug mb-3">
        We don't have your name on file, so your profile shows your handle. Add it and your profile reads with your real name.
      </p>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 120))}
          placeholder="Your name"
          autoComplete="name"
          className="w-full border border-white/15 rounded-xl px-3 py-2.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[var(--brand-blue)]"
          style={{ background: "rgba(255,255,255,0.06)" }}
          data-testid="input-add-name"
        />
        {updateError && <p className="text-xs text-rose-300" data-testid="text-add-name-err">{updateError}</p>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={isUpdatePending || !name.trim()}
            className="px-3 py-1.5 rounded-full bg-[var(--brand-blue)] text-white text-xs font-semibold disabled:opacity-40"
            data-testid="button-save-add-name"
          >
            {isUpdatePending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={dismiss} className="text-fan-secondary text-xs" data-testid="button-dismiss-add-name">Not now</button>
        </div>
      </div>
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
      <p className="text-fan-faint text-xs uppercase tracking-widest font-medium mb-2 mt-4 ml-1">Linked Accounts</p>
      <div className="rounded-2xl overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.05)" }}>
        {isLoading ? (
          <p className="px-4 py-3 text-fan-secondary text-sm">Loading…</p>
        ) : (
          <>
            {identities.map((id) => (
              <div key={id.id} className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }} data-testid={`row-identity-${id.provider}`}>
                <div>
                  <p className="text-fan-primary text-base capitalize">{id.provider}</p>
                  {id.email && <p className="text-fan-secondary text-xs">{id.email}</p>}
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
    try {
      await logout();
    } finally {
      navigate("/login");
    }
  };

  // In-app account deletion (App Store 5.1.1(v) + Google Play). Calls the
  // anonymize-and-revoke endpoint, then clears the local bearer token and
  // any cached query data before sending the fan back to the login screen.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(false);
    try {
      await apiRequest("DELETE", "/api/customer/me");
    } catch {
      setDeleting(false);
      setDeleteError(true);
      return;
    }
    setAuthToken(null);
    queryClient.clear();
    setDeleting(false);
    navigate("/login");
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollHideNav(scrollRef);

  // source so a "Bill Denk" account shows "BD", not a single "B". Logic
  // lives in deriveAccountIdentity so it can be unit-tested standalone.
  const { fullName, handle, initials } = deriveAccountIdentity(user);

  // Task #1145 — one-time "add your name" nudge. Show it only for a
  // signed-in customer who has no real name on file AND hasn't dismissed
  // the prompt before. The dismissal flag lives in localStorage keyed by
  // user id; we mirror it into state and listen for the custom event the
  // banner fires on "Not now" so the page re-renders without a refresh.
  const hasRealName = Boolean((user?.realName || "").trim());
  const [namePromptDismissed, setNamePromptDismissed] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    const read = () => {
      try { setNamePromptDismissed(localStorage.getItem(`gt:name-prompt-dismissed:${user.id}`) === "1"); }
      catch { setNamePromptDismissed(false); }
    };
    read();
    window.addEventListener("gt:name-prompt-dismissed", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("gt:name-prompt-dismissed", read);
      window.removeEventListener("storage", read);
    };
  }, [user?.id]);
  const showAddNamePrompt =
    user?.kind === "customer" && !hasRealName && !namePromptDismissed && Boolean(user?.id);

  // Profile photo comes from the server (auth payload). Actual edit lives on
  // the dedicated /account/edit page.
  const photoUrl = user?.photoUrl ?? null;

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

  // Task #2011 — "Notify me when new music drops" opt-in. The current
  // preference rides the shared new-fan-welcome state endpoint (it carries
  // `notifyOptIn`), and the standalone PATCH writes it back without
  // re-surfacing the welcome sheet. Hidden on iOS native — push there is
  // handled separately through Capacitor — so we don't even fetch the
  // state on that surface. Toggling flips the cache optimistically so the
  // switch responds instantly, then invalidates to confirm with the server.
  const isCustomer = user?.kind === "customer";
  const showNotifyToggle = isCustomer && !isNativeIOS;
  const { data: notifyState } = useQuery<{ shouldShow: boolean; notifyOptIn?: boolean | null }>({
    queryKey: ["/api/me/new-fan-welcome/state"],
    enabled: showNotifyToggle,
  });
  const notifyOptIn = notifyState?.notifyOptIn ?? false;
  const notifyMutation = useMutation({
    mutationFn: async (next: boolean) => {
      await apiRequest("PATCH", "/api/me/notify-opt-in", { notifyOptIn: next });
      return next;
    },
    onMutate: async (next: boolean) => {
      await queryClient.cancelQueries({ queryKey: ["/api/me/new-fan-welcome/state"] });
      const prev = queryClient.getQueryData<{ shouldShow: boolean; notifyOptIn?: boolean | null }>([
        "/api/me/new-fan-welcome/state",
      ]);
      queryClient.setQueryData<{ shouldShow: boolean; notifyOptIn?: boolean | null }>(
        ["/api/me/new-fan-welcome/state"],
        (old) => (old ? { ...old, notifyOptIn: next } : { shouldShow: false, notifyOptIn: next }),
      );
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData(["/api/me/new-fan-welcome/state"], ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/new-fan-welcome/state"] });
    },
  });

  const railOpen = useLyricsRailOpen();
  return (
    <main
      className="relative h-screen w-full flex justify-center overflow-hidden lg:pl-[284px]"
      style={railOpen ? { paddingRight: LYRICS_RAIL_CONTENT_OFFSET } : undefined}
    >
      <section className="relative w-full max-w-[390px] md:max-w-[640px] lg:max-w-[820px] lg:mx-auto h-screen text-fan-primary flex flex-col">

        <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto scrollbar-hide pb-[170px]">
          {/* Title + profile header now live INSIDE the scroll container so
              the whole page scrolls as one — previously the avatar/name/Edit
              block was fixed above the scroll area and content slid under it. */}
          <header className="flex items-end justify-between px-5 pt-14 pb-3">
            <h1 className="text-fan-primary text-[34px] font-bold leading-none tracking-tight" data-testid="text-page-title">Account</h1>
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
                <Pencil className="w-3.5 h-3.5 text-fan-primary" strokeWidth={2.4} />
              </span>
            </button>
            <p className="text-fan-primary text-xl font-bold" data-testid="text-profile-name">
              {fullName || (handle ? `@${handle}` : "Your account")}
            </p>
            {fullName && handle && (
              <p className="text-fan-secondary text-sm mt-1" data-testid="text-profile-handle">@{handle}</p>
            )}
          </div>

          <div className="px-5">
          {/* Task #1145 — "add your name" nudge sits at the very top of the
              content so a fan with no name on file sees it first, then
              naturally disappears once a name is saved or dismissed. */}
          {showAddNamePrompt && <AddNameBanner userId={user!.id} />}

          {/* My Orders — Task #74. An in-flight record purchase ("where's
              my vinyl?") is the most time-sensitive thing the fan can land
              on. Hidden when the customer has never placed an order so a
              brand-new profile stays clean, and (Task #1406) web-only for
              now — the first native build has no Orders surface yet, so the
              row is gated behind `ordersEnabled`. Favorite Artists +
              Bookmarks moved OFF Account to the Collection landing. */}
          {ordersEnabled && orderCount > 0 && (
            <>
              <p className="text-fan-faint text-xs uppercase tracking-widest font-medium mb-2 mt-2 ml-1">My Orders</p>
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
                    <span className="block text-fan-primary text-base">Orders &amp; tracking</span>
                    {latestStatusLine && (
                      <span className="block text-fan-secondary text-xs truncate" data-testid="text-orders-latest">{latestStatusLine}</span>
                    )}
                  </span>
                  <span className="text-fan-faint text-sm tabular-nums" data-testid="row-orders-count">{orderCount}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.35">
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </>
          )}

          {/* Settings — Task #1406 gates several rows for the Apple build:
              Streaming Service (public streaming handoff is off this build),
              Notifications and About GoodTunes® (no destinations yet).
              Privacy always stays. Rows are composed from a filtered list so
              the rounded card's dividers/spacing stay correct for ANY flag
              combination — flip the flags in lib/platform.ts to bring a row
              back. Listening History lives INSIDE Privacy (tap Privacy → a
              sub-screen grouping listening history + the Privacy Policy
              link). */}
          <p className="text-fan-faint text-xs uppercase tracking-widest font-medium mb-2 mt-2 ml-1">Settings</p>
          <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "rgba(255,255,255,0.05)" }}>
            {(
              [
                streamingHandoffEnabled && {
                  label: "Streaming Service",
                  onClick: () => setShowStreaming(true),
                  testId: "row-streaming-service",
                  right: (
                    <span className="text-fan-secondary text-base" data-testid="text-streaming-service-current">
                      {favService ? serviceLabel(favService) : "Not set"}
                    </span>
                  ),
                },
                notificationsEnabled && {
                  label: "Notifications",
                  onClick: undefined,
                  testId: "row-notifications",
                },
                {
                  label: "Privacy",
                  onClick: () => setShowPrivacy(true),
                  testId: "row-privacy",
                },
                aboutEnabled && {
                  label: "About GoodTunes®",
                  onClick: undefined,
                  testId: "row-about-goodtunes-",
                },
              ].filter(Boolean) as Array<{
                label: string;
                onClick?: () => void;
                testId: string;
                right?: ReactNode;
              }>
            ).map((row, i, arr) => (
              <button
                key={row.testId}
                type="button"
                onClick={row.onClick}
                className={`w-full flex items-center justify-between px-4 py-3.5 text-left active:bg-white/[0.06] ${i < arr.length - 1 ? "border-b" : ""}`}
                style={i < arr.length - 1 ? { borderColor: "rgba(255,255,255,0.07)" } : undefined}
                data-testid={row.testId}
              >
                <span className="text-fan-primary text-base">{row.label}</span>
                <span className="flex items-center gap-1.5">
                  {row.right}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.35">
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
            ))}
          </div>

          {/* Task #2011 — New-music opt-in. A fan can turn on release
              notifications here; the choice mirrors the new-fan welcome
              sheet (same `notifyNewMusicOptIn` flag) and persists via PATCH
              with an optimistic switch flip. Hidden on iOS native — push
              there is handled separately through Capacitor. */}
          {showNotifyToggle && (
            <>
              <p className="text-fan-faint text-xs uppercase tracking-widest font-medium mb-2 mt-2 ml-1">Notifications</p>
              <div className="rounded-2xl overflow-hidden mb-2" style={{ background: "rgba(255,255,255,0.05)" }}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifyOptIn}
                  disabled={notifyMutation.isPending}
                  onClick={() => notifyMutation.mutate(!notifyOptIn)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-white/[0.06] disabled:opacity-60"
                  data-testid="switch-notify-new-music"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: notifyOptIn ? "rgba(49,158,216,0.18)" : "rgba(255,255,255,0.06)" }}
                    >
                      {notifyOptIn ? (
                        <Bell className="w-[18px] h-[18px] text-[var(--brand-blue)]" />
                      ) : (
                        <BellOff className="w-[18px] h-[18px] text-fan-faint" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-fan-primary text-base">Notify me when new music drops</span>
                      <span className="block text-fan-secondary text-xs leading-snug mt-0.5">
                        Be first to know when a new album lands on GoodTunes.
                      </span>
                    </span>
                  </span>
                  {/* Visual switch — the parent button owns the toggle role */}
                  <span
                    aria-hidden="true"
                    className={`relative flex-shrink-0 w-12 h-7 rounded-full transition-colors duration-200 ${notifyOptIn ? "bg-[var(--brand-blue)]" : "bg-white/15"}`}
                  >
                    <span
                      className={`absolute top-1 bg-white shadow transition-all duration-200 ${notifyOptIn ? "left-6" : "left-1"}`}
                      style={{ width: 20, height: 20, borderRadius: "50%" }}
                    />
                  </span>
                </button>
              </div>
              <p className="text-fan-faint text-xs leading-relaxed px-1 mb-6" data-testid="text-notify-new-music-help">
                Only GoodTunes release notifications — no spam. Change it any time.
              </p>
            </>
          )}

          {user?.email && user.email.endsWith("@privaterelay.appleid.com") && (
            <PrivateRelayBanner relayEmail={user.email} />
          )}

          {/* Task #1406 — Linked Accounts hidden for the Apple build
              (linkedAccountsEnabled) until Apple Sign-In ships. */}
          {linkedAccountsEnabled && <LinkedProvidersPanel />}

          {/* Task #400 — Fan-initiated account merge. If a fan signed up
              on the new player and *then* discovered their imported
              gogoods.com account exists separately, they can pull all
              that history into the account they're using now.

              Task #1461 — "These two accounts are me" entry point is
              intentionally hidden for now (per Bill — adds noise, not
              needed yet). The merge flow, its routes, and server logic
              all stay intact; only this entry is hidden. To re-enable,
              render <AccountMergePanel /> again — ideally gated so it only
              shows when there's actually a second account to merge. */}
          {/* <AccountMergePanel /> */}

          {/* Task #873 — Passwordless is the default (email magic links).
              A fan who'd rather have a password can opt in here; we reuse
              the reset-password flow and email a secure link.
              Task #1406 — hidden for the Apple build (setPasswordEnabled). */}
          {setPasswordEnabled && <PasswordPanel />}

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
          <p className="text-center text-fan-secondary text-xs pb-4">
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
              Version 3.0.3
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
            confirmDelete={confirmDelete}
            setConfirmDelete={setConfirmDelete}
            deleting={deleting}
            deleteError={deleteError}
            onDeleteAccount={handleDeleteAccount}
            isCustomer={user?.kind === "customer"}
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
            <div className="text-fan-primary text-base">These two accounts are me</div>
            <div className="text-fan-secondary text-xs mt-0.5">Pull a second email's library onto this account.</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.35">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <div className="px-4 py-4">
          {sent ? (
            <div data-testid="merge-start-sent">
              <div className="text-fan-primary text-sm font-semibold mb-1">Link sent.</div>
              <p className="text-fan-secondary text-xs leading-relaxed">
                Open the inbox for that other email and tap the confirmation link to move everything onto this account.
                The link expires in 24 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={start}>
              <p className="text-fan-secondary text-xs mb-3 leading-relaxed">
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
                  className="px-3 py-2 rounded-xl text-fan-secondary text-sm border border-white/10"
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

// Task #873 — Opt-in password for a passwordless fan. GoodTunes signs
// fans in with email magic links; this panel lets a fan who'd prefer a
// password add one without disturbing the magic-link default. It reuses
// the reset-password flow: tapping "Send me a link" mints a single-use
// reset token server-side and emails the /reset-password link. Mirrors
// AccountMergePanel's initiate-in-account, complete-via-email pattern.
function PasswordPanel() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

  const { data: status } = useQuery<{ hasPassword: boolean }>({
    queryKey: ["/api/auth/password/customer-status"],
  });
  const hasPassword = !!status?.hasPassword;

  const sendLink = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/password/set-link");
      return res.json();
    },
    onSuccess: () => {
      setSent(true);
      toast({ title: "Check your inbox", description: "We've emailed you a secure link to set your password." });
    },
    onError: () => {
      toast({ title: "Couldn't send the link", description: "Please try again in a moment.", variant: "destructive" });
    },
  });

  return (
    <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "rgba(255,255,255,0.05)" }} data-testid="panel-password">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between px-4 py-3.5 text-left active:bg-white/[0.06]"
          data-testid="button-password-open"
        >
          <div>
            <div className="text-fan-primary text-base">{hasPassword ? "Change your password" : "Set a password"}</div>
            <div className="text-fan-secondary text-xs mt-0.5">
              {hasPassword
                ? "Prefer a password? We'll email you a secure link to change it."
                : "You sign in with an email link. Prefer a password? You can add one."}
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.35">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <div className="px-4 py-4">
          {sent ? (
            <div data-testid="password-link-sent">
              <div className="text-fan-primary text-sm font-semibold mb-1">Link sent.</div>
              <p className="text-fan-secondary text-xs leading-relaxed">
                Open your inbox and tap the link to {hasPassword ? "choose a new password" : "set your password"}.
                The link expires in 30 minutes. Email sign-in still works either way.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-fan-secondary text-xs mb-3 leading-relaxed">
                Magic-link sign-in is staying on — this just adds a password as another way in.
                We'll email you a secure link to {hasPassword ? "change it" : "choose one"}.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-2 rounded-xl text-fan-secondary text-sm border border-white/10"
                  data-testid="button-password-cancel"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => sendLink.mutate()}
                  disabled={sendLink.isPending}
                  className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #1D5E8F, var(--brand-blue))" }}
                  data-testid="button-password-send"
                >
                  {sendLink.isPending ? "Sending…" : "Send me a link"}
                </button>
              </div>
            </div>
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
  confirmDelete,
  setConfirmDelete,
  deleting,
  deleteError,
  onDeleteAccount,
  isCustomer,
}: {
  onClose: () => void;
  confirmClear: boolean;
  setConfirmClear: (v: boolean) => void;
  clearing: boolean;
  clearedToast: boolean;
  onClearHistory: () => void;
  confirmDelete: boolean;
  setConfirmDelete: (v: boolean) => void;
  deleting: boolean;
  deleteError: boolean;
  onDeleteAccount: () => void;
  isCustomer: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center md:p-6 md:bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Privacy"
      data-testid="sheet-privacy"
    >
      {/* Task #1406 — Privacy stays in this build. On phones it's the
          existing full-screen push; on tablet/desktop it presents as a
          centered, rounded Apple-style modal over a dim backdrop (tap the
          backdrop to dismiss). */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="hidden md:block md:absolute md:inset-0"
      />
      <div
        className="relative flex flex-col flex-1 w-full md:flex-none md:max-w-[440px] md:max-h-[78vh] md:rounded-3xl md:overflow-hidden md:shadow-2xl"
        style={{ background: "#00062B" }}
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
          <ChevronLeft className="w-[22px] h-[22px] text-fan-primary" style={{ transform: "translateX(-1px)" }} strokeWidth={2.2} />
        </button>
        <h1 className="text-fan-primary text-[17px] font-semibold">Privacy</h1>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-10">
        <p className="text-fan-faint text-xs uppercase tracking-widest font-medium mb-2 mt-2 ml-1">Listening History</p>
        <div className="rounded-2xl overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.05)" }}>
          <p className="px-4 pt-3 pb-2 text-fan-secondary text-xs leading-snug">
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
              <p className="text-fan-primary text-sm mb-3">Permanently delete every play, skip, and favorite event tied to this account?</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="flex-1 py-3 rounded-2xl border border-white/20 text-fan-secondary text-sm font-medium"
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

        <p className="text-fan-faint text-xs uppercase tracking-widest font-medium mb-2 mt-4 ml-1">Policy</p>
        <div className="rounded-2xl overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.05)" }}>
          <a
            href={PRIVACY_POLICY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-between px-4 py-3.5 text-left active:bg-white/[0.06]"
            data-testid="link-privacy-policy"
          >
            <span className="text-fan-primary text-base">Privacy Policy</span>
            {/* Apple's external-link glyph (top-right arrow out of box) —
                signals this leaves the app, not just a deeper screen. */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.45" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 4h6v6" />
              <path d="M20 4L10 14" />
              <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
            </svg>
          </a>
        </div>
        <p className="text-fan-faint text-xs leading-relaxed px-1">
          Opens goodtunes.music/privacy in your browser.
        </p>

        {isCustomer && (
          <>
            <p className="text-fan-faint text-xs uppercase tracking-widest font-medium mb-2 mt-6 ml-1">Account</p>
            <div className="rounded-2xl overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.05)" }}>
              <p className="px-4 pt-3 pb-2 text-fan-secondary text-xs leading-snug">
                Permanently delete your GoodTunes account and personal data. This removes your profile, favorites, playlists, and library. Past orders are kept for legal and accounting records. This can't be undone.
              </p>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="w-full py-3.5 text-left px-4 text-base active:bg-white/[0.06] border-t"
                  style={{ borderColor: "rgba(255,255,255,0.07)", color: "var(--brand-heart)" }}
                  data-testid="button-delete-account"
                >
                  Delete My Account
                </button>
              ) : (
                <div className="px-4 py-3 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                  <p className="text-fan-primary text-sm mb-3">Permanently delete your account? You'll be signed out and won't be able to sign back in.</p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="flex-1 py-3 rounded-2xl border border-white/20 text-fan-secondary text-sm font-medium disabled:opacity-50"
                      data-testid="button-cancel-delete-account"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={onDeleteAccount}
                      disabled={deleting}
                      className="flex-1 py-3 rounded-2xl font-semibold text-sm text-white disabled:opacity-50"
                      style={{ background: "#FF5470" }}
                      data-testid="button-confirm-delete-account"
                    >
                      {deleting ? "Deleting..." : "Delete Account"}
                    </button>
                  </div>
                  {deleteError && (
                    <p className="text-[var(--brand-heart)] text-xs mt-3" data-testid="text-delete-account-error">
                      Something went wrong. Please try again.
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
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
      className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center md:p-6 md:bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Streaming Service"
      data-testid="sheet-streaming-service"
    >
      {/* Task #1406 backdrop pattern — on phones this is the existing
          full-screen push; on tablet/desktop it presents as a centered,
          rounded Apple-style modal over a dim backdrop (tap the backdrop to
          dismiss), in lock-step with PrivacySheet. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="hidden md:block md:absolute md:inset-0"
      />
      <div
        className="relative flex flex-col flex-1 w-full md:flex-none md:max-w-[440px] md:max-h-[78vh] md:rounded-3xl md:overflow-hidden md:shadow-2xl"
        style={{ background: "#00062B" }}
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
          <ChevronLeft className="w-[22px] h-[22px] text-fan-primary" style={{ transform: "translateX(-1px)" }} strokeWidth={2.2} />
        </button>
        <h1 className="text-fan-primary text-[17px] font-semibold">Streaming Service</h1>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-10">
        <p className="text-fan-secondary text-xs leading-relaxed mb-4 px-1">
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
                <span className="flex-1 text-fan-primary text-base">{svc.label}</span>
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
        <p className="text-fan-faint text-xs leading-relaxed px-1">
          {current
            ? `Tap ${serviceLabel(current)} again to clear it — we'll ask each time instead.`
            : "Until you pick one, we'll ask which service to use the first time you stream."}
        </p>
      </div>
      </div>
    </div>
  );
}
