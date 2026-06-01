// Task #400 — Welcome-back onboarding for imported gogoods.com fans.
//
// Three Apple-Music-styled screens:
//   1. Handle — pick a username (live uniqueness check)
//   2. Name  — confirm display name + (optional) real name
//   3. Reveal — "look what's already in your account" + tap into player
//
// Gating happens server-side via GET /api/me/welcome-back/state — if
// the fan isn't `legacyGogoodsId`-stamped or has already onboarded,
// we bounce to /account. Reaching this page means a session has
// already been minted (either by the email link redeem endpoint or by
// the fan signing in normally for the first time post-import).

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type WelcomeState = {
  needsOnboarding: boolean;
  isLegacy: boolean;
  customer: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    realName: string | null;
  };
  libraryStats: { albums: number; orders: number } | null;
  recentItems: Array<{
    id: string;
    albumId: string;
    title: string;
    artist: string;
    artwork: string;
    certificateNumber: number | null;
    acquiredAt: string | null;
  }>;
};

// Render the original purchase date on each reclaimed record. Legacy
// gogoods imports carry `acquiredAt` = the date the fan bought it, so
// "Purchased Mar 2021" reassures a returning fan that this really is
// their own history. Bad/empty dates collapse to null (no line).
function formatPurchased(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

// Matches server: 3–30 chars, lowercase a–z, 0–9, dot, underscore, hyphen.
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
const USERNAME_STRIP = /[^a-z0-9._-]/g;

import { WELCOME_BACK_WHATS_NEW as WHATS_NEW } from "@shared/welcomeBack";

function suggestHandleFromEmail(email: string): string {
  return (email.split("@")[0] ?? "")
    .toLowerCase()
    .replace(USERNAME_STRIP, "")
    .slice(0, 30) || "fan";
}

export function WelcomeBack() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [state, setState] = useState<WelcomeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [handle, setHandle] = useState("");
  const [handleStatus, setHandleStatus] = useState<"idle" | "checking" | "ok" | "taken" | "format">("idle");
  const [displayName, setDisplayName] = useState("");
  const [realName, setRealName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiRequest("GET", "/api/me/welcome-back/state");
        const j: WelcomeState = await r.json();
        if (cancelled) return;
        if (!j.needsOnboarding) {
          // Already onboarded (or not an imported fan) — bounce.
          navigate("/account");
          return;
        }
        setState(j);
        setHandle(j.customer.username || suggestHandleFromEmail(j.customer.email));
        setDisplayName(j.customer.displayName || "");
        setRealName(j.customer.realName ?? "");
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Couldn't load");
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  // Live uniqueness check, debounced.
  useEffect(() => {
    if (!handle) { setHandleStatus("idle"); return; }
    if (!USERNAME_RE.test(handle)) { setHandleStatus("format"); return; }
    setHandleStatus("checking");
    const id = setTimeout(async () => {
      try {
        const r = await apiRequest("GET", `/api/me/welcome-back/username-available?u=${encodeURIComponent(handle)}`);
        const j = await r.json();
        setHandleStatus(j.available ? "ok" : (j.reason === "format" ? "format" : "taken"));
      } catch {
        setHandleStatus("idle");
      }
    }, 250);
    return () => clearTimeout(id);
  }, [handle]);

  const finish = async () => {
    setSaving(true);
    try {
      await apiRequest("POST", "/api/me/welcome-back/onboarding", {
        username: handle,
        displayName: displayName.trim(),
        realName: realName.trim() || null,
      });
      queryClient.invalidateQueries();
      toast({ title: "Welcome back to GoodTunes" });
      navigate("/collection");
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--brand-bg)] text-white px-6" data-testid="welcomeback-error">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">Something went sideways</div>
          <div className="text-white/55 text-sm mb-4">{error}</div>
          <button onClick={() => navigate("/account")} className="px-4 py-2 rounded-xl bg-white/10 text-sm" data-testid="button-welcomeback-back">Back to your account</button>
        </div>
      </main>
    );
  }
  if (!state) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--brand-bg)] text-white px-6">
        <div className="text-center" data-testid="welcomeback-loading">
          <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-[var(--brand-blue)] animate-spin mx-auto mb-4" />
          <div className="text-white/70 text-sm">Loading your library…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex justify-center bg-[var(--brand-bg)] text-white px-6 py-12" data-testid="page-welcome-back">
      <div className="w-full max-w-[440px]">
        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`h-1.5 rounded transition-all ${n === step ? "bg-[var(--brand-blue)] w-8" : n < step ? "bg-[var(--brand-mint)] w-4" : "bg-white/15 w-4"}`}
              data-testid={`welcomeback-step-dot-${n}`}
            />
          ))}
        </div>

        {step === 1 && (
          <section data-testid="welcomeback-step-handle">
            <p className="text-[var(--brand-mint)] text-xs uppercase tracking-widest font-semibold mb-2">Welcome back</p>
            <h1 className="text-3xl font-bold leading-tight mb-2">Pick your @handle.</h1>
            <p className="text-white/55 text-sm mb-6 leading-relaxed">
              Your old gogoods.com account moved over. Pick the handle other GoodTunes fans will see when you share a playlist.
            </p>
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 mb-5">
              <label className="block text-white/40 text-xs uppercase tracking-wider font-semibold mb-1.5">Handle</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">@</span>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase().replace(USERNAME_STRIP, "").slice(0, 30))}
                  className="w-full border border-white/10 rounded-2xl pl-7 pr-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[var(--brand-blue)] bg-white/[0.06]"
                  data-testid="input-welcomeback-handle"
                  autoFocus
                />
              </div>
              <p
                className={`text-xs mt-2 ml-1 ${
                  handleStatus === "ok" ? "text-[var(--brand-mint)]" :
                  handleStatus === "taken" ? "text-[var(--brand-pink)]" :
                  handleStatus === "format" ? "text-[var(--brand-pink)]" :
                  "text-white/35"
                }`}
                data-testid="text-welcomeback-handle-status"
              >
                {handleStatus === "checking" && "Checking…"}
                {handleStatus === "ok" && "@" + handle + " is yours."}
                {handleStatus === "taken" && "Someone's already got that handle. Try another."}
                {handleStatus === "format" && "3–30 characters: a–z, 0–9, dot, underscore, hyphen."}
                {handleStatus === "idle" && "3–30 characters: a–z, 0–9, dot, underscore, hyphen."}
              </p>
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={handleStatus !== "ok"}
              className="w-full py-4 rounded-2xl font-semibold text-base text-white disabled:opacity-40 transition-all active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #1D5E8F, var(--brand-blue))" }}
              data-testid="button-welcomeback-next-1"
            >
              Next
            </button>
          </section>
        )}

        {step === 2 && (
          <section data-testid="welcomeback-step-name">
            <p className="text-[var(--brand-mint)] text-xs uppercase tracking-widest font-semibold mb-2">Step 2 of 3</p>
            <h1 className="text-3xl font-bold leading-tight mb-2">How should we say hi?</h1>
            <p className="text-white/55 text-sm mb-6 leading-relaxed">
              Display name shows up on your profile and playlists. Real name stays private — only labels and pressing partners see it on orders.
            </p>
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 mb-3">
              <label className="block text-white/40 text-xs uppercase tracking-wider font-semibold mb-1.5">Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Sam"
                className="w-full border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[var(--brand-blue)] bg-white/[0.06]"
                data-testid="input-welcomeback-display"
              />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 mb-5">
              <label className="block text-white/40 text-xs uppercase tracking-wider font-semibold mb-1.5">Real name (private)</label>
              <input
                type="text"
                value={realName}
                onChange={(e) => setRealName(e.target.value)}
                placeholder="e.g. Sam Johnson"
                className="w-full border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[var(--brand-blue)] bg-white/[0.06]"
                data-testid="input-welcomeback-real"
              />
              <p className="text-white/35 text-xs mt-2 ml-1">Optional — leave blank to keep this off your orders.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="px-5 py-4 rounded-2xl text-white/70 text-sm border border-white/10 active:bg-white/[0.06]"
                data-testid="button-welcomeback-back-2"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!displayName.trim()}
                className="flex-1 py-4 rounded-2xl font-semibold text-base text-white disabled:opacity-40 transition-all active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #1D5E8F, var(--brand-blue))" }}
                data-testid="button-welcomeback-next-2"
              >
                Next
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section data-testid="welcomeback-step-reveal">
            <p className="text-[var(--brand-mint)] text-xs uppercase tracking-widest font-semibold mb-2">Last step</p>
            <h1 className="text-3xl font-bold leading-tight mb-2">Your library moved with you.</h1>
            <p className="text-white/55 text-sm mb-6 leading-relaxed">
              Every album you bought on gogoods.com is already in your account — ready to stream and to download.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 text-center" data-testid="welcomeback-stat-albums">
                <div className="text-[var(--brand-mint)] text-5xl font-bold leading-none">{state.libraryStats?.albums ?? 0}</div>
                <div className="text-white/55 text-xs mt-2 uppercase tracking-wider font-semibold">Albums</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 text-center" data-testid="welcomeback-stat-orders">
                <div className="text-[var(--brand-blue)] text-5xl font-bold leading-none">{state.libraryStats?.orders ?? 0}</div>
                <div className="text-white/55 text-xs mt-2 uppercase tracking-wider font-semibold">Orders</div>
              </div>
            </div>

            {/* Library reveal — actual records carried over, with cover,
                title, and the original GoodDeed certificate number. If
                the fan has nothing owned, fall back to the "what's new
                on GoodTunes" bullets instead of an empty grid. */}
            {state.recentItems.length > 0 ? (
              <div className="mb-6" data-testid="welcomeback-reveal-list">
                <p className="text-white/40 text-xs uppercase tracking-wider font-semibold mb-3">
                  Already in your library
                </p>
                <ul className="space-y-2.5">
                  {state.recentItems.map((it) => (
                    <li
                      key={it.id}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3"
                      data-testid={`welcomeback-record-${it.albumId}`}
                    >
                      <img
                        src={it.artwork}
                        alt=""
                        className="w-12 h-12 rounded-md object-cover flex-shrink-0 bg-white/5"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-white truncate" data-testid={`welcomeback-record-title-${it.albumId}`}>
                          {it.title}
                        </div>
                        <div className="text-xs text-white/55 truncate">{it.artist}</div>
                        {formatPurchased(it.acquiredAt) && (
                          <div
                            className="text-xs text-white/40 mt-0.5"
                            data-testid={`welcomeback-record-date-${it.albumId}`}
                          >
                            Purchased {formatPurchased(it.acquiredAt)}
                          </div>
                        )}
                      </div>
                      {it.certificateNumber != null && (
                        <div
                          className="text-xs font-mono text-[var(--brand-mint)] tabular-nums flex-shrink-0"
                          data-testid={`welcomeback-record-cert-${it.albumId}`}
                        >
                          #{it.certificateNumber}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mb-6" data-testid="welcomeback-whats-new">
                <p className="text-white/40 text-xs uppercase tracking-wider font-semibold mb-3">
                  While you were away
                </p>
                <ul className="space-y-2.5">
                  {WHATS_NEW.map((b) => (
                    <li
                      key={b.title}
                      className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"
                      data-testid={`welcomeback-whatsnew-${b.title.replace(/\W+/g, "-").toLowerCase()}`}
                    >
                      <div className="text-sm font-semibold text-white">{b.title}</div>
                      <div className="text-xs text-white/55 mt-1 leading-relaxed">{b.body}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-white/45 text-xs leading-relaxed mb-4" data-testid="welcomeback-reassurance">
              Is something missing or not quite right? You can fix it or reach
              out anytime from{" "}
              <button
                type="button"
                onClick={() => navigate("/account")}
                className="text-[var(--brand-blue)] underline underline-offset-2 active:opacity-70"
                data-testid="link-welcomeback-account"
              >
                your account
              </button>
              .
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="px-5 py-4 rounded-2xl text-white/70 text-sm border border-white/10 active:bg-white/[0.06]"
                data-testid="button-welcomeback-back-3"
                disabled={saving}
              >
                Back
              </button>
              <button
                onClick={finish}
                disabled={saving}
                className="flex-1 py-4 rounded-2xl font-semibold text-base text-white disabled:opacity-40 transition-all active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, var(--brand-purple), var(--brand-blue))" }}
                data-testid="button-welcomeback-finish"
              >
                {saving ? "Opening your player…" : "Open my library"}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
