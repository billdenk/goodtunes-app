// Welcome — the "you're in" page Stripe returns to after a successful
// embedded checkout (Task #44, step 10). The session id is appended to
// the URL by Stripe (return_url=…?session_id={CHECKOUT_SESSION_ID});
// the server fetches the session + materialized Order so we can show
// the GoodDeed number, suggested username, and a deep-link into the
// player with the album already unlocked.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { track } from "@/lib/analytics";

type OrderItem = { id: string; kind: string; sku: string; label: string; unitPriceCents: number; quantity: number };
type Order = {
  id: string;
  albumId: string;
  goodDeedNumber: number | null;
  status: string;
  totalCents: number;
  shippingName: string | null;
  createdAt: string;
};
type SessionResponse = {
  paymentStatus: string;
  status: string;
  order: Order | null;
  items: OrderItem[];
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
  // Task #46 — gift flow on the post-checkout screen. The buyer can flip
  // a single toggle to convert this order into a gift, fill out the
  // recipient, and walk away with a shareable link. We deliberately keep
  // this on the same page (no extra step) so the moment of purchase
  // becomes the moment of gifting.
  const [giftMode, setGiftMode] = useState(false);
  const [giftFirst, setGiftFirst] = useState("");
  const [giftLast, setGiftLast] = useState("");
  const [giftContactKind, setGiftContactKind] = useState<"email" | "phone">("email");
  const [giftContact, setGiftContact] = useState("");
  const [giftSubmitting, setGiftSubmitting] = useState(false);
  const [giftShareUrl, setGiftShareUrl] = useState<string | null>(null);
  const [giftCopied, setGiftCopied] = useState(false);

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
      navigate(data?.order ? `/album/${data.order.albumId}` : "/account");
    }
  };

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#00062B] text-white px-6">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">Something went sideways</div>
          <div className="text-white/55 text-sm mb-4">{error}</div>
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
      <main className="min-h-screen flex items-center justify-center bg-[#00062B] text-white px-6">
        <div className="text-center" data-testid="welcome-loading">
          <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-[#319ED8] animate-spin mx-auto mb-4" />
          <div className="text-white/70 text-sm">Finishing up your order…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex justify-center bg-[#00062B] text-white px-6 py-12">
      <div className="w-full max-w-[440px]" data-testid="welcome-page">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#4AFFCA]/15 text-[#4AFFCA] mb-3">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h1 className="text-[26px] font-bold leading-tight">You're in.</h1>
          <p className="text-white/55 text-[14px] mt-1">
            Your album is unlocked and your record is on its way.
          </p>
        </div>

        {data.order.goodDeedNumber !== null && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-5 text-center" data-testid="welcome-gooddeed">
            <div className="text-white/40 text-[11px] uppercase tracking-wider font-semibold">Your GoodDeed®</div>
            <div className="text-[40px] font-bold mt-1 text-[#4AFFCA]" data-testid="text-gooddeed-number">
              #{data.order.goodDeedNumber}
            </div>
            <div className="text-white/55 text-[12px] mt-1">Numbered for life. Refundable up until shipping.</div>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-5">
          <div className="text-white/40 text-[11px] uppercase tracking-wider font-semibold mb-3">Order</div>
          {data.items.map((it) => (
            <div key={it.id} className="flex items-center justify-between text-[14px] mb-1" data-testid={`order-item-${it.kind}-${it.sku}`}>
              <span className="text-white/85">{it.label}</span>
              <span className="text-white/55">${(it.unitPriceCents / 100).toFixed(2)}</span>
            </div>
          ))}
          <div className="border-t border-white/10 mt-3 pt-3 flex items-center justify-between">
            <span className="text-white/55 text-[13px]">Total</span>
            <span className="font-semibold">${(data.order.totalCents / 100).toFixed(2)}</span>
          </div>
        </div>

        {/* Task #46 — Gift toggle. Show only before a share link has
            been minted; once we have the link, swap to the share panel. */}
        {!giftShareUrl ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-5" data-testid="welcome-gift-toggle">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="flex items-center gap-2">
                <span aria-hidden="true">🎁</span>
                <span className="text-[14px] font-medium">This is a gift</span>
              </span>
              <input
                type="checkbox"
                checked={giftMode}
                onChange={(e) => setGiftMode(e.target.checked)}
                className="w-5 h-5 accent-[#319ED8]"
                data-testid="checkbox-gift-mode"
              />
            </label>
            {giftMode && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={giftFirst}
                    onChange={(e) => setGiftFirst(e.target.value)}
                    placeholder="First name"
                    className="border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-white/30 text-sm bg-white/[0.06] focus:outline-none focus:border-[#319ED8]"
                    data-testid="input-gift-first"
                  />
                  <input
                    type="text"
                    value={giftLast}
                    onChange={(e) => setGiftLast(e.target.value)}
                    placeholder="Last name"
                    className="border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-white/30 text-sm bg-white/[0.06] focus:outline-none focus:border-[#319ED8]"
                    data-testid="input-gift-last"
                  />
                </div>
                <div className="flex p-0.5 rounded-xl bg-white/[0.06] border border-white/10">
                  {(["email", "phone"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => { setGiftContactKind(k); setGiftContact(""); }}
                      className={`flex-1 py-1.5 rounded-lg text-[12px] font-medium capitalize ${
                        giftContactKind === k ? "bg-white/15 text-white" : "text-white/50"
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
                  className="w-full border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-white/30 text-sm bg-white/[0.06] focus:outline-none focus:border-[#319ED8]"
                  data-testid="input-gift-contact"
                />
                <p className="text-white/40 text-[11px] leading-snug">
                  We'll generate a one-time claim link. You can share it directly or we'll send it on your behalf.
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
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-[#7F10A7]/40 bg-[#7F10A7]/10 p-5 mb-5" data-testid="welcome-gift-share">
            <div className="text-[#FF5470] text-[11px] uppercase tracking-wider font-semibold mb-2">🎁 Your gift is ready</div>
            <div className="text-[13px] text-white/80 mb-3 leading-snug">
              Send this link to {giftFirst} — when they open it and claim, the album + GoodDeed move to their account.
            </div>
            <div className="flex items-center gap-2 bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2">
              <code className="text-[11px] text-white/80 truncate flex-1" data-testid="text-gift-share-url">{giftShareUrl}</code>
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
        )}

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-5">
          <label className="block text-white/40 text-[11px] uppercase tracking-wider font-semibold mb-1.5">
            Pick your handle
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">@</span>
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder={suggestedUsername || "username"}
              className="w-full border border-white/10 rounded-2xl pl-7 pr-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#319ED8] bg-white/[0.06]"
              data-testid="input-welcome-username"
            />
          </div>
          <p className="text-white/35 text-[11px] mt-1.5 ml-1">
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
      </div>
    </main>
  );
}
