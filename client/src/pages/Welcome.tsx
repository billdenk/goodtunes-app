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
  const [data, setData] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestedUsername, setSuggestedUsername] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);

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

  const finish = async () => {
    // We surface the username suggestion here but persist via the
    // existing profile endpoint (server/routes.ts has PATCH /api/me/profile
    // for customers; if no change requested we just bounce into the
    // player so the fan can start listening immediately).
    setSavingUsername(true);
    try {
      if (usernameInput && user && usernameInput !== user.username) {
        await apiRequest("PUT", "/api/me", { username: usernameInput });
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
