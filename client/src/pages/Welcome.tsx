// Welcome — the "you're in" page Stripe returns to after a successful
// embedded checkout (Task #44, step 10). The session id is appended to
// the URL by Stripe (return_url=…?session_id={CHECKOUT_SESSION_ID});
// the server fetches the session + materialized Order so we can show
// the GoodDeed number, suggested username, and a deep-link into the
// player with the album already unlocked.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isPurchaseFunnelHost, PLAYER_HOST } from "@/hooks/useAuthKind";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { track } from "@/lib/analytics";
import { VinylPreview } from "@/components/VinylPreview";
import { CertNameConfirmCard } from "@/components/ui/CertNameConfirmCard";
import { GiftBoxPersonalizer } from "@/components/checkout/GiftBoxPersonalizer";
import { CopyGiftCard, type CopyGift } from "@/components/gift/CopyGiftCard";
import { giftEnabled } from "@/lib/platform";
import { Gift } from "lucide-react";
import {
  DEFAULT_JACKET_UPGRADE,
  resolveVinylColor,
  isVinylFormat,
  type JacketUpgrade,
} from "@shared/pressing";
import type { AlbumFormat } from "@shared/schema";

type OrderItem = {
  id: string;
  kind: string;
  sku: string;
  label: string;
  unitPriceCents: number;
  quantity: number;
  // Task #201 — snapshot of the vinyl pressing picks for this item so
  // the post-checkout receipt shows the same colored disc the fan saw
  // when they bought it. Null on non-vinyl line items.
  vinylColor?: string | null;
  jacketUpgrade?: JacketUpgrade | null;
};
type Order = {
  id: string;
  albumId: string;
  goodDeedNumber: number | null;
  status: string;
  totalCents: number;
  // Task #1629 — shipping + Stripe-computed sales tax broken out so the
  // receipt total reconciles. Null when not applicable / legacy order.
  shippingChargedCents: number | null;
  taxCents: number | null;
  shippingName: string | null;
  createdAt: string;
  // Task #2063 — set when the WHOLE order was gifted via the legacy hub.
  // Per-copy and whole-order gifting must not coexist, so when this is set
  // we keep the legacy hub and skip the per-copy gift section.
  giftId: string | null;
};
type AlbumLite = { artwork: string | null };
// Task #549 — one entitlement per physical copy. Multi-quantity orders
// now have N copies; legacy orders have at most one row (or zero if
// they predate the table).
type OrderCopy = {
  id: string;
  position: number;
  format: string;
  signedCert: boolean;
  formatPriceCents: number;
  addonPriceCents: number;
  goodDeedNumber: number | null;
  vinylColor: string | null;
  jacketUpgrade: JacketUpgrade | null;
  // Task #2063 — per-copy gift attached server-side.
  gift?: CopyGift | null;
};
type SessionResponse = {
  paymentStatus: string;
  status: string;
  order: Order | null;
  items: OrderItem[];
  copies?: OrderCopy[];
  album: AlbumLite | null;
  // Task #2061 — count of "Gift of Hope" boxes on this order so we can
  // auto-open the "Who's the gift for?" stepper when any are un-personalized.
  giftBoxSummary?: { total: number; personalized: number } | null;
};

export function Welcome() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestedUsername, setSuggestedUsername] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  // Task #1938 — post-purchase gift hub. The single "This is a gift"
  // toggle is replaced by a 3-option decision screen: gift now (shows
  // recipient form), keep for myself, or decide later (stamps a 7-day
  // pending reminder on the order). Buyer-initiated revoke lives on the
  // Orders page; the hub here is the happy-path entry point.
  type GiftHubChoice = "gift" | "mine" | "later" | null;
  const [giftHubChoice, setGiftHubChoice] = useState<GiftHubChoice>(null);
  const [pendingSubmitting, setPendingSubmitting] = useState(false);
  const [giftFirst, setGiftFirst] = useState("");
  const [giftLast, setGiftLast] = useState("");
  const [giftContactKind, setGiftContactKind] = useState<"email" | "phone">("email");
  const [giftContact, setGiftContact] = useState("");
  // Task #550 — optional gift-card message + scheduled delivery date.
  // Both are blank-by-default; sending without them keeps the legacy
  // "deliver now, no message" behaviour.
  const [giftMessage, setGiftMessage] = useState("");
  const [giftDeliverOn, setGiftDeliverOn] = useState("");
  const [giftSubmitting, setGiftSubmitting] = useState(false);
  const [giftShareUrl, setGiftShareUrl] = useState<string | null>(null);
  const [giftCopied, setGiftCopied] = useState(false);
  // Task #2061 — post-purchase gift-box personalizer ("Who's the gift for?").
  const [showPersonalizer, setShowPersonalizer] = useState(false);

  useEffect(() => {
    const sessionId = new URL(window.location.href).searchParams.get("session_id");
    if (!sessionId) {
      setError("Missing session id");
      return;
    }
    let cancelled = false;
    // Poll until the order materializes — the webhook is the source of
    // truth and may race the return_url redirect by a beat.
    const poll = async (attempt = 0) => {
      try {
        const r = await apiRequest("GET", `/api/checkout/session/${sessionId}`);
        const j: SessionResponse = await r.json();
        if (cancelled) return;
        setData(j);
        if (!j.order && attempt < 8) {
          setTimeout(() => poll(attempt + 1), 750);
        } else {
          if (j.order) {
            // Fire checkout_completed exactly once when the webhook-materialized
            // order first appears. Subsequent polls short-circuit on `attempt`,
            // and the dedupe-by-sessionId guard below survives StrictMode
            // double-mount in dev.
            const key = `gt:checkout-tracked:${sessionId}`;
            if (!sessionStorage.getItem(key)) {
              sessionStorage.setItem(key, "1");
              track("checkout_completed", {
                albumId: j.order.albumId,
                orderId: j.order.id,
                priceCents: j.order.totalCents,
              });
            }
          }
          queryClient.invalidateQueries();
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Couldn't load your order");
      }
    };
    poll();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Seed the suggested handle from the customer's email local-part.
    // Operators can override on the fly before tapping "Open my player".
    if (!user?.email || suggestedUsername) return;
    const local = user.email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9_]/g, "") ?? "";
    setSuggestedUsername(local);
    setUsernameInput(local);
  }, [user?.email]);

  // Task #2061 — auto-open the gift-box stepper once when a freshly-paid order
  // carries un-personalized boxes. Guarded per-order in sessionStorage so a
  // buyer who closes it isn't re-prompted on every poll / revisit.
  useEffect(() => {
    const s = data?.giftBoxSummary;
    if (!data?.order || !s || s.total <= 0) return;
    const key = `gt:giftbox-autoopen:${data.order.id}`;
    if (sessionStorage.getItem(key)) return;
    if (s.personalized < s.total) {
      sessionStorage.setItem(key, "1");
      setShowPersonalizer(true);
    }
  }, [data?.order?.id, data?.giftBoxSummary?.total, data?.giftBoxSummary?.personalized]);

  // Re-pull the checkout session so the gift-box count on this page reflects
  // any boxes the buyer just personalized in the stepper.
  const refreshSession = async () => {
    const sessionId = new URL(window.location.href).searchParams.get("session_id");
    if (!sessionId) return;
    try {
      const r = await apiRequest("GET", `/api/checkout/session/${sessionId}`);
      setData(await r.json());
    } catch {
      /* best-effort — the stepper already saved server-side */
    }
  };

  const submitGift = async () => {
    if (!data?.order) return;
    if (!giftFirst.trim() || !giftLast.trim()) {
      toast({ title: "Add the recipient's name", variant: "destructive" });
      return;
    }
    if (!giftContact.trim()) {
      toast({ title: `Add the recipient's ${giftContactKind}`, variant: "destructive" });
      return;
    }
    setGiftSubmitting(true);
    try {
      const r = await apiRequest("POST", `/api/orders/${data.order.id}/gift`, {
        firstName: giftFirst.trim(),
        lastName: giftLast.trim(),
        email: giftContactKind === "email" ? giftContact.trim() : "",
        phone: giftContactKind === "phone" ? giftContact.trim() : "",
        message: giftMessage.trim() || null,
        deliverOn: giftDeliverOn || null,
      });
      const j = await r.json();
      setGiftShareUrl(j.shareUrl);
      toast({ title: "Gift link ready", description: "Copy it into a message — or we'll text/email it from server logs in dev." });
    } catch (e: any) {
      toast({ title: "Couldn't create gift", description: e?.message, variant: "destructive" });
    } finally {
      setGiftSubmitting(false);
    }
  };

  const submitPending = async () => {
    if (!data?.order) return;
    setPendingSubmitting(true);
    try {
      await apiRequest("POST", `/api/orders/${data.order.id}/gift/pending`, {});
    } catch {
      // Non-fatal — we still stamp "later" locally so the UI moves forward.
    } finally {
      setPendingSubmitting(false);
      setGiftHubChoice("later");
    }
  };

  const copyShareUrl = async () => {
    if (!giftShareUrl) return;
    try {
      await navigator.clipboard.writeText(giftShareUrl);
      setGiftCopied(true);
      setTimeout(() => setGiftCopied(false), 1800);
    } catch {
      toast({ title: "Couldn't copy", description: "Long-press the link to copy manually.", variant: "destructive" });
    }
  };

  const finish = async () => {
    // We surface the username suggestion here but persist via the
    // existing profile endpoint (server/routes.ts has PATCH /api/me/profile
    // for customers; if no change requested we just bounce into the
    // player so the fan can start listening immediately).
    setSavingUsername(true);
    try {
      if (usernameInput && user && usernameInput !== user.username) {
        await apiRequest("PATCH", "/api/me/profile", { username: usernameInput });
        queryClient.invalidateQueries();
      }
    } catch {
      // Non-fatal — the album is already unlocked. The fan can change
      // their handle later from /account/edit.
    } finally {
      setSavingUsername(false);
      const albumId = data?.order?.albumId;
      if (!albumId) {
        navigate("/account");
        return;
      }
      // Task #1631 — Cross-host purchase handoff. On the prod purchase funnel
      // (get./store.goodtunes.music) the fan must be re-authed on the player
      // host (my.goodtunes.music): both the session cookie and the localStorage
      // bearer token are host-scoped, so we mint a fresh token and carry it in
      // the URL fragment (kept out of the query so it never hits a server log)
      // plus a `gtwelcome` flag that pops the thank-you modal on arrival. In
      // dev / *.replit.app this branch is skipped (single host) and we navigate
      // in-app, still flagging the modal.
      if (isPurchaseFunnelHost()) {
        try {
          const r = await apiRequest("POST", "/api/checkout/player-handoff");
          const { token } = await r.json();
          window.location.replace(
            `https://${PLAYER_HOST}/album/${albumId}#token=${encodeURIComponent(token)}&gtwelcome=1`,
          );
          return;
        } catch {
          // Mint failed — fall back to a same-host navigation. The album is
          // already unlocked for this session, so the fan still lands on it.
        }
      }
      navigate(`/album/${albumId}?gtwelcome=1`);
    }
  };

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#00062B] text-fan-primary px-6">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">Something went sideways</div>
          <div className="text-fan-secondary text-sm mb-4">{error}</div>
          <button
            onClick={() => navigate("/account")}
            className="px-4 py-2 rounded-xl bg-white/10 text-sm"
            data-testid="button-welcome-back"
          >
            Back to your account
          </button>
        </div>
      </main>
    );
  }

  if (!data || !data.order) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#00062B] text-fan-primary px-6">
        <div className="text-center" data-testid="welcome-loading">
          <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-[#319ED8] animate-spin mx-auto mb-4" />
          <div className="text-fan-secondary text-sm">Finishing up your order…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex justify-center bg-[#00062B] text-fan-primary px-6 py-12">
      <div className="w-full max-w-[440px]" data-testid="welcome-page">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#4AFFCA]/15 text-[#4AFFCA] mb-3">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h1 className="text-[26px] font-bold leading-tight">You're in.</h1>
          <p className="text-fan-secondary text-[14px] mt-1">
            Your album is unlocked and your record is on its way.
          </p>
        </div>

        {/* Task #1899 — Every paid copy now receives its own GoodDeed number
            (signed or unsigned). Show all owned numbers:
            • 1 copy → existing hero treatment (big mint number)
            • N copies → multi treatment (row of numbered chips)
            "Refundable up until shipping." removed — that claim was wrong. */}
        {(() => {
          const ownedNumbers = (data.copies ?? [])
            .filter((c) => c.goodDeedNumber != null)
            .map((c) => c.goodDeedNumber!) as number[];
          const showHero = ownedNumbers.length <= 1 && data.order!.goodDeedNumber !== null;
          if (showHero) {
            return (
              <div className="rounded-2xl bg-white/[0.07] p-5 mb-5 text-center" data-testid="welcome-gooddeed">
                <div className="text-fan-faint text-[11px] uppercase tracking-wider font-semibold">Your GoodDeed®</div>
                <div className="text-[40px] font-bold mt-1 text-[#4AFFCA]" data-testid="text-gooddeed-number">
                  #{data.order!.goodDeedNumber}
                </div>
              </div>
            );
          }
          if (ownedNumbers.length >= 2) {
            return (
              <div className="rounded-2xl bg-white/[0.07] p-5 mb-5 text-center" data-testid="welcome-gooddeed-multi">
                <div className="text-fan-faint text-[11px] uppercase tracking-wider font-semibold">Your GoodDeeds®</div>
                <div className="mt-1.5 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[28px] font-bold text-[#4AFFCA]">
                  {ownedNumbers.map((n) => (
                    <span key={n} data-testid={`text-gooddeed-number-${n}`}>#{n}</span>
                  ))}
                </div>
                <div className="text-fan-secondary text-xs mt-2">Each copy is its own entitlement.</div>
              </div>
            );
          }
          return null;
        })()}

        {/* Task #1479 — surface the "name on your certificate" confirm step
            right here at checkout for fresh digital GoodDeed buyers, so a
            wrong synthesized name gets caught before the first download.
            Self-gates to editable (digital-only) orders; physical
            signed-cert copies keep their operator-driven confirm flow. */}
        <CertNameConfirmCard orderId={data.order.id} variant="card" />

        <div className="rounded-2xl bg-white/[0.07] p-5 mb-5">
          <div className="text-fan-faint text-[11px] uppercase tracking-wider font-semibold mb-3">Order</div>
          {/* Task #201 — for each vinyl line item, render the colored
              <VinylPreview> the fan picked at checkout so the receipt
              matches what they'll unbox. Falls back to Black for any
              older SKU whose color was never set. */}
          {data.items
            .filter((it) => it.kind === "format" && isVinylFormat(it.sku as AlbumFormat))
            .map((it) => {
              const color = resolveVinylColor(it.vinylColor);
              return (
                <div
                  key={`preview-${it.id}`}
                  className="mb-4 rounded-2xl bg-white/[0.04] border border-white/10 p-3"
                  data-testid={`welcome-vinyl-preview-${it.sku}`}
                >
                  <VinylPreview
                    artworkUrl={data.album?.artwork ?? null}
                    color={color}
                    jacketUpgrade={it.jacketUpgrade ?? DEFAULT_JACKET_UPGRADE}
                    size="md"
                  />
                  <div className="mt-2 text-[12px] text-fan-secondary leading-snug">
                    {color.name} · {it.label}
                  </div>
                </div>
              );
            })}
          {/* Task #549 — Prefer the per-copy breakdown when the server
              returned copies; falls back to the legacy line-item list
              for older orders that pre-date order_copies. */}
          {data.copies && data.copies.length > 0 ? (
            <div className="space-y-1.5" data-testid="welcome-copies">
              {data.copies.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between text-[14px]"
                  data-testid={`welcome-copy-${c.position}`}
                >
                  <span className="text-fan-primary truncate pr-2">
                    Copy {c.position}
                    {c.goodDeedNumber != null && (
                      <span className="ml-2 text-[11px] text-fan-faint font-medium">
                        #{c.goodDeedNumber}
                      </span>
                    )}
                    {c.signedCert && (
                      <span className="ml-1.5 text-[11px] text-[#FF5470] font-medium">
                        · Signed
                      </span>
                    )}
                  </span>
                  <span className="text-fan-secondary whitespace-nowrap">
                    ${((c.formatPriceCents + c.addonPriceCents) / 100).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            data.items.map((it) => (
              <div key={it.id} className="flex items-center justify-between text-[14px] mb-1" data-testid={`order-item-${it.kind}-${it.sku}`}>
                <span className="text-fan-primary">{it.label}{it.quantity > 1 ? ` × ${it.quantity}` : ""}</span>
                <span className="text-fan-secondary">${((it.unitPriceCents * it.quantity) / 100).toFixed(2)}</span>
              </div>
            ))
          )}
          {/* Task #1629 — shipping + Stripe-computed sales tax. Shipping
              only renders when the fan was charged it (physical order); tax
              renders whenever Stripe reported a value (incl. a real $0). */}
          {data.order.shippingChargedCents != null && data.order.shippingChargedCents > 0 && (
            <div className="mt-3 flex items-center justify-between text-[13px]" data-testid="welcome-shipping">
              <span className="text-fan-secondary">Shipping</span>
              <span className="text-fan-secondary">${(data.order.shippingChargedCents / 100).toFixed(2)}</span>
            </div>
          )}
          {data.order.taxCents != null && (
            <div className="mt-1 flex items-center justify-between text-[13px]" data-testid="welcome-tax">
              <span className="text-fan-secondary">Tax</span>
              <span className="text-fan-secondary">${(data.order.taxCents / 100).toFixed(2)}</span>
            </div>
          )}
          <div className="border-t border-white/10 mt-3 pt-3 flex items-center justify-between">
            <span className="text-fan-secondary text-[13px]">Total</span>
            <span className="font-semibold">${(data.order.totalCents / 100).toFixed(2)}</span>
          </div>
        </div>

        {/* Task #1938 — post-purchase gift hub. Replaces the simple
            "This is a gift" toggle with a 3-option decision screen:
            Gift now | Keep for myself | Decide later.
            Once a share link is minted, the panel flips to the share card.
            Task #2063 — a multi-copy order that isn't already a whole-order
            gift gets the per-copy section instead, so the buyer can gift one
            copy and keep the rest. */}
        {giftEnabled && ((data.copies?.length ?? 0) >= 2 && !data.order.giftId ? (
          <div className="rounded-2xl bg-[color:var(--fan-surface)] p-5 mb-5" data-testid="welcome-copy-gifts">
            <div className="text-fan-faint text-xs uppercase tracking-wider font-semibold mb-3">
              Gift a copy — keep the rest
            </div>
            <p className="text-fan-secondary text-[12px] mb-3 leading-snug">
              You bought {data.copies!.length} copies. Send any one as a gift and keep the others in your collection.
            </p>
            <div className="space-y-2">
              {data.copies!.map((c, i) => (
                <CopyGiftCard
                  key={c.id}
                  orderId={data.order!.id}
                  copy={c}
                  index={i + 1}
                  total={data.copies!.length}
                  wholeOrderGifted={!!data.order!.giftId}
                  onMutated={refreshSession}
                />
              ))}
            </div>
          </div>
        ) : !giftShareUrl ? (
          <div className="rounded-2xl bg-[color:var(--fan-surface)] p-5 mb-5" data-testid="welcome-gift-hub">

            {/* ── Choice tiles ── shown while no gift has been initiated */}
            {giftHubChoice !== "gift" && (
              <>
                <div className="text-fan-faint text-xs uppercase tracking-wider font-semibold mb-3">
                  What would you like to do?
                </div>
                <div className="grid grid-cols-3 gap-2 mb-1">
                  {(
                    [
                      { key: "gift",  emoji: "🎁", label: "Gift this" },
                      { key: "mine",  emoji: "♫",  label: "Keep it" },
                      { key: "later", emoji: "🕐", label: "Decide later" },
                    ] as const
                  ).map(({ key, emoji, label }) => (
                    <button
                      key={key}
                      type="button"
                      disabled={pendingSubmitting}
                      onClick={async () => {
                        if (key === "later") {
                          await submitPending();
                        } else {
                          setGiftHubChoice(key);
                        }
                      }}
                      className={`flex flex-col items-center gap-1.5 rounded-2xl py-3 px-2 text-center text-xs font-medium transition-colors ${
                        giftHubChoice === key
                          ? "bg-[color:var(--brand-blue-soft)] text-[color:var(--brand-blue)]"
                          : "bg-[color:var(--fan-surface-strong)] text-fan-secondary hover:bg-[color:var(--brand-blue-soft)]"
                      }`}
                      data-testid={`button-hub-${key}`}
                    >
                      <span className="text-lg" aria-hidden="true">{emoji}</span>
                      <span>
                        {pendingSubmitting && key === "later" ? "One sec…" : label}
                      </span>
                    </button>
                  ))}
                </div>
                {giftHubChoice === "mine" && (
                  <p className="text-fan-faint text-xs mt-3 text-center">
                    It's yours — enjoy it.
                  </p>
                )}
                {giftHubChoice === "later" && (
                  <p className="text-xs mt-3 text-center font-medium" style={{ color: "var(--brand-mint)" }}>
                    We'll send you a reminder in 7 days. You can also gift from your Orders page any time.
                  </p>
                )}
              </>
            )}

            {/* ── Recipient form ── expanded when "Gift this" is chosen */}
            {giftHubChoice === "gift" && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setGiftHubChoice(null)}
                    className="text-fan-faint text-sm hover:text-fan-secondary"
                    data-testid="button-hub-back"
                  >
                    ← Back
                  </button>
                  <span className="text-sm font-semibold">🎁 Gift this album</span>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={giftFirst}
                      onChange={(e) => setGiftFirst(e.target.value)}
                      placeholder="First name"
                      className="border border-[color:var(--fan-field-border)] rounded-xl px-3 py-2.5 text-white placeholder-white/30 text-sm bg-[color:var(--fan-surface-strong)] focus:outline-none focus:border-[color:var(--brand-blue)]"
                      data-testid="input-gift-first"
                    />
                    <input
                      type="text"
                      value={giftLast}
                      onChange={(e) => setGiftLast(e.target.value)}
                      placeholder="Last name"
                      className="border border-[color:var(--fan-field-border)] rounded-xl px-3 py-2.5 text-white placeholder-white/30 text-sm bg-[color:var(--fan-surface-strong)] focus:outline-none focus:border-[color:var(--brand-blue)]"
                      data-testid="input-gift-last"
                    />
                  </div>
                  <div className="flex p-0.5 rounded-xl bg-[color:var(--fan-surface-strong)] border border-[color:var(--fan-field-border)]">
                    {(["email", "phone"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => { setGiftContactKind(k); setGiftContact(""); }}
                        className={`flex-1 py-1.5 rounded-lg text-[12px] font-medium capitalize ${
                          giftContactKind === k ? "bg-[color:var(--brand-blue-soft)] text-[color:var(--brand-blue)]" : "text-fan-secondary"
                        }`}
                        data-testid={`toggle-gift-${k}`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                  <input
                    type={giftContactKind === "email" ? "email" : "tel"}
                    value={giftContact}
                    onChange={(e) => setGiftContact(e.target.value)}
                    placeholder={giftContactKind === "email" ? "their@email.com" : "+1 555 555 5555"}
                    className="w-full border border-[color:var(--fan-field-border)] rounded-xl px-3 py-2.5 text-white placeholder-white/30 text-sm bg-[color:var(--fan-surface-strong)] focus:outline-none focus:border-[color:var(--brand-blue)]"
                    data-testid="input-gift-contact"
                  />
                  <textarea
                    value={giftMessage}
                    onChange={(e) => setGiftMessage(e.target.value.slice(0, 500))}
                    placeholder="Optional message (500 chars)"
                    rows={2}
                    className="w-full border border-[color:var(--fan-field-border)] rounded-xl px-3 py-2.5 text-white placeholder-white/30 text-sm bg-[color:var(--fan-surface-strong)] focus:outline-none resize-none"
                    data-testid="input-gift-message"
                  />
                  <div>
                    <label className="text-fan-secondary text-xs uppercase tracking-wider font-semibold block mb-1.5">
                      Deliver on (optional)
                    </label>
                    <input
                      type="date"
                      value={giftDeliverOn}
                      onChange={(e) => setGiftDeliverOn(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      className="w-full border border-[color:var(--fan-field-border)] rounded-xl px-3 py-2.5 text-white text-sm bg-[color:var(--fan-surface-strong)] focus:outline-none"
                      data-testid="input-gift-deliver-on"
                    />
                  </div>
                  <p className="text-fan-faint text-[11px] leading-snug">
                    We'll generate a one-time claim link.{" "}
                    {giftDeliverOn ? `It unlocks on ${giftDeliverOn}.` : "You can share it right away."}
                  </p>
                  <button
                    type="button"
                    onClick={submitGift}
                    disabled={giftSubmitting}
                    className="w-full py-2.5 rounded-xl bg-[#7F10A7] text-white text-sm font-semibold disabled:opacity-50"
                    data-testid="button-gift-create"
                  >
                    {giftSubmitting ? "Creating…" : "Create gift link"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-[#7F10A7]/40 bg-[#7F10A7]/10 p-5 mb-5" data-testid="welcome-gift-share">
            <div className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--brand-pink)" }}>
              🎁 Your gift is ready
            </div>
            <div className="text-[13px] text-fan-primary mb-3 leading-snug">
              Send this link to {giftFirst} — when they open it and claim, the album + GoodDeed move to their account.
            </div>
            <div className="flex items-center gap-2 bg-[color:var(--fan-surface-strong)] border border-[color:var(--fan-field-border)] rounded-xl px-3 py-2">
              <code className="text-xs text-fan-primary truncate flex-1 min-w-0" data-testid="text-gift-share-url">
                {giftShareUrl}
              </code>
              <button
                type="button"
                onClick={copyShareUrl}
                className="px-2.5 py-1 rounded-lg bg-white/15 text-[11px] font-semibold"
                data-testid="button-gift-copy"
              >
                {giftCopied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ))}

        {/* Task #2061 — gift-box personalizer entry. The stepper auto-opens
            once after checkout; this card lets the buyer reopen it and shows
            how many of their gift boxes still need a recipient. */}
        {data.giftBoxSummary && data.giftBoxSummary.total > 0 && (
          <button
            type="button"
            onClick={() => setShowPersonalizer(true)}
            className="w-full text-left rounded-2xl border border-[#FF7C06]/40 bg-[#FF7C06]/10 p-4 mb-5 flex items-center gap-3 active:scale-[0.99] transition-transform"
            data-testid="button-open-personalizer"
          >
            <span className="flex-shrink-0 w-11 h-11 rounded-full bg-[#FF7C06]/20 flex items-center justify-center text-[color:var(--brand-orange)]">
              <Gift className="w-5 h-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-white">
                {data.giftBoxSummary.personalized >= data.giftBoxSummary.total ? "Your gifts are set" : "Who are your gifts for?"}
              </span>
              <span className="block text-xs text-fan-secondary" data-testid="text-giftbox-summary">
                {data.giftBoxSummary.personalized} of {data.giftBoxSummary.total} personalized
              </span>
            </span>
            <span className="flex-shrink-0 text-sm font-semibold text-[color:var(--brand-mint)]">
              {data.giftBoxSummary.personalized >= data.giftBoxSummary.total ? "Review" : "Personalize"}
            </span>
          </button>
        )}

        {/* Task #2062 — while the buyer is mid-gift (chose "Gift this" but
            hasn't minted the claim link yet), keep the gift form the single
            primary action. The handle picker + "Open my player" reappear once
            the gift link exists, or the buyer backed out / chose "decide later". */}
        {!(giftHubChoice === "gift" && !giftShareUrl) && (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-5">
              <label className="block text-fan-faint text-[11px] uppercase tracking-wider font-semibold mb-1.5">
                Pick your handle
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fan-faint text-sm pointer-events-none">@</span>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder={suggestedUsername || "username"}
                  className="w-full border border-white/10 rounded-2xl pl-7 pr-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#319ED8] bg-white/[0.06]"
                  data-testid="input-welcome-username"
                />
              </div>
              <p className="text-fan-faint text-[11px] mt-1.5 ml-1">
                We picked this from your email — change it any time.
              </p>
            </div>

            <button
              onClick={finish}
              disabled={savingUsername}
              className="w-full py-4 rounded-2xl font-semibold text-base text-white disabled:opacity-40 transition-all active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
              data-testid="button-welcome-open"
            >
              {savingUsername ? "One second…" : "Open my player"}
            </button>
          </>
        )}
      </div>

      {showPersonalizer && data.order && (
        <GiftBoxPersonalizer
          orderId={data.order.id}
          onClose={() => {
            setShowPersonalizer(false);
            void refreshSession();
          }}
          onAllDone={() => {
            void refreshSession();
            toast({ title: "Thanks — your gifts are on the way" });
          }}
        />
      )}
    </main>
  );
}
