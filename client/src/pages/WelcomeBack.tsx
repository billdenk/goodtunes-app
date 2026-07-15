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
//
// Task #1282 — visual redesign to Apple-Music / ElevenLabs polish.
// Steps, copy, data, and backend are unchanged; only the surfaces,
// type hierarchy, hero stat numbers, inputs, and buttons were elevated:
// harsh `border-white/10` boxes became soft translucent gradient cards,
// the Albums/Orders numerals became gradient-filled hero numbers, and
// the controls got a consistent pill + soft-glow treatment.

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
    grantNumber: number | null;
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

// ─── shared surface + control styling (Apple-Music / ElevenLabs) ───
// Soft, layered translucent surfaces instead of harsh hairline boxes:
// a top-lit gradient fill, a near-invisible border, a deep soft shadow,
// and a light backdrop blur so the navy gradient reads through.
const CARD =
  "rounded-3xl border border-white/[0.08] bg-gradient-to-b from-white/[0.07] to-white/[0.02] shadow-[0_18px_50px_-24px_rgba(0,0,0,0.85)] backdrop-blur-xl";
const FIELD_LABEL =
  "block text-fan-faint text-xs uppercase tracking-[0.16em] font-semibold mb-2.5";
const FIELD_INPUT =
  "w-full rounded-2xl border border-white/[0.1] bg-black/25 px-4 py-3.5 text-base text-white placeholder-white/30 transition-all focus:outline-none focus:border-[var(--brand-blue)] focus:bg-black/30 focus:shadow-[0_0_0_4px_var(--brand-blue-soft)]";
const BTN_PRIMARY =
  "w-full py-4 rounded-full font-semibold text-base text-white disabled:opacity-40 disabled:shadow-none transition-all active:scale-[0.98]";
const BTN_SECONDARY =
  "px-6 py-4 rounded-full text-fan-secondary text-sm font-medium border border-white/[0.12] bg-white/[0.04] transition-all active:scale-[0.98] active:bg-white/[0.08] disabled:opacity-40";

// Primary CTA fills — gradient + a soft same-hue glow, reached through
// brand vars (never raw hex). "Next" reads as calm brand blue; the final
// "Open my library" reads celebratory purple→blue.
const NEXT_FILL = {
  background: "linear-gradient(180deg, var(--brand-blue), var(--primarypetrol-blue-02))",
  boxShadow: "0 18px 38px -16px var(--brand-blue)",
} as const;
const FINISH_FILL = {
  background: "linear-gradient(135deg, var(--brand-purple), var(--brand-blue))",
  boxShadow: "0 18px 38px -16px var(--brand-purple)",
} as const;

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
      navigate("/home");
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--brand-bg)] text-fan-primary px-6" data-testid="welcomeback-error">
        <div className={`${CARD} px-7 py-8 text-center max-w-[360px] w-full`}>
          <div className="text-lg font-semibold mb-2">Something went sideways</div>
          <div className="text-fan-secondary text-sm mb-5">{error}</div>
          <button onClick={() => navigate("/account")} className="px-5 py-3 rounded-full bg-white/10 text-sm font-medium transition-all active:scale-[0.98] active:bg-white/[0.16]" data-testid="button-welcomeback-back">Back to your account</button>
        </div>
      </main>
    );
  }
  if (!state) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--brand-bg)] text-fan-primary px-6">
        <div className="text-center" data-testid="welcomeback-loading">
          <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-[var(--brand-blue)] animate-spin mx-auto mb-4" />
          <div className="text-fan-secondary text-sm">Loading your library…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex justify-center bg-[var(--brand-bg)] text-fan-primary px-6 py-12" data-testid="page-welcome-back">
      <div className="w-full max-w-[440px]">
        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                n === step
                  ? "w-8 bg-[var(--brand-blue)] shadow-[0_0_12px_var(--brand-blue)]"
                  : n < step
                  ? "w-5 bg-[var(--brand-mint)]"
                  : "w-5 bg-white/15"
              }`}
              data-testid={`welcomeback-step-dot-${n}`}
            />
          ))}
        </div>

        {step === 1 && (
          <section className="gt-onboard-rise" data-testid="welcomeback-step-handle">
            <p className="text-[var(--brand-mint)] text-xs uppercase tracking-widest font-semibold mb-3">Welcome back</p>
            <h1 className="text-3xl font-bold leading-tight tracking-tight mb-3">Pick your @handle.</h1>
            <p className="text-fan-secondary text-sm mb-7 leading-relaxed">
              Your old gogoods.com account moved over. Pick the handle other GoodTunes fans will see when you share a playlist.
            </p>
            <div className={`${CARD} p-5 mb-6`}>
              <label className={FIELD_LABEL}>Handle</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-fan-faint text-base pointer-events-none">@</span>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase().replace(USERNAME_STRIP, "").slice(0, 30))}
                  className={`${FIELD_INPUT} pl-9`}
                  data-testid="input-welcomeback-handle"
                  autoFocus
                />
              </div>
              <p
                className={`text-xs mt-2.5 ml-1 transition-colors ${
                  handleStatus === "ok" ? "text-[var(--brand-mint)]" :
                  handleStatus === "taken" ? "text-[var(--brand-pink)]" :
                  handleStatus === "format" ? "text-[var(--brand-pink)]" :
                  "text-fan-faint"
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
              className={BTN_PRIMARY}
              style={NEXT_FILL}
              data-testid="button-welcomeback-next-1"
            >
              Next
            </button>
          </section>
        )}

        {step === 2 && (
          <section className="gt-onboard-rise" data-testid="welcomeback-step-name">
            <p className="text-[var(--brand-mint)] text-xs uppercase tracking-widest font-semibold mb-3">Step 2 of 3</p>
            <h1 className="text-3xl font-bold leading-tight tracking-tight mb-3">How should we say hi?</h1>
            <p className="text-fan-secondary text-sm mb-7 leading-relaxed">
              Display name shows up on your profile and playlists. Real name stays private — only labels and pressing partners see it on orders.
            </p>
            <div className={`${CARD} p-5 mb-3.5`}>
              <label className={FIELD_LABEL}>Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Sam"
                className={FIELD_INPUT}
                data-testid="input-welcomeback-display"
              />
            </div>
            <div className={`${CARD} p-5 mb-6`}>
              <label className={FIELD_LABEL}>Real name (private)</label>
              <input
                type="text"
                value={realName}
                onChange={(e) => setRealName(e.target.value)}
                placeholder="e.g. Sam Johnson"
                className={FIELD_INPUT}
                data-testid="input-welcomeback-real"
              />
              <p className="text-fan-faint text-xs mt-2.5 ml-1">Optional — leave blank to keep this off your orders.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className={BTN_SECONDARY}
                data-testid="button-welcomeback-back-2"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!displayName.trim()}
                className={`${BTN_PRIMARY} flex-1`}
                style={NEXT_FILL}
                data-testid="button-welcomeback-next-2"
              >
                Next
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="gt-onboard-rise" data-testid="welcomeback-step-reveal">
            <p className="text-[var(--brand-mint)] text-xs uppercase tracking-widest font-semibold mb-3">Last step</p>
            <h1 className="text-3xl font-bold leading-tight tracking-tight mb-3">Your library moved with you.</h1>
            <p className="text-fan-secondary text-sm mb-7 leading-relaxed">
              Every album you bought on gogoods.com is already in your account — ready to stream and to download.
            </p>
            <div className="grid grid-cols-2 gap-3.5 mb-7">
              <div className={`${CARD} relative overflow-hidden p-6 text-center`} data-testid="welcomeback-stat-albums">
                <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-28 w-28 rounded-full bg-[var(--brand-mint)] opacity-[0.18] blur-2xl" />
                <div className="relative text-6xl font-bold leading-none tracking-tight tabular-nums bg-gradient-to-br from-[var(--brand-mint)] to-[var(--brand-blue)] bg-clip-text text-transparent">{state.libraryStats?.albums ?? 0}</div>
                <div className="relative text-fan-secondary text-xs mt-3 uppercase tracking-[0.16em] font-semibold">Albums</div>
              </div>
              <div className={`${CARD} relative overflow-hidden p-6 text-center`} data-testid="welcomeback-stat-orders">
                <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-28 w-28 rounded-full bg-[var(--brand-blue)] opacity-[0.20] blur-2xl" />
                <div className="relative text-6xl font-bold leading-none tracking-tight tabular-nums bg-gradient-to-br from-[var(--brand-blue)] to-[var(--brand-purple)] bg-clip-text text-transparent">{state.libraryStats?.orders ?? 0}</div>
                <div className="relative text-fan-secondary text-xs mt-3 uppercase tracking-[0.16em] font-semibold">Orders</div>
              </div>
            </div>

            {/* Library reveal — actual records carried over, with cover,
                title, and the original GoodDeed certificate number. If
                the fan has nothing owned, fall back to the "what's new
                on GoodTunes" bullets instead of an empty grid. */}
            {state.recentItems.length > 0 ? (
              <div className="mb-7" data-testid="welcomeback-reveal-list">
                <p className="text-fan-faint text-xs uppercase tracking-[0.16em] font-semibold mb-3.5">
                  Already in your library
                </p>
                <ul className="space-y-2.5">
                  {state.recentItems.map((it) => (
                    <li
                      key={it.id}
                      className={`${CARD} flex items-center gap-3.5 p-3 transition-colors active:bg-white/[0.06]`}
                      data-testid={`welcomeback-record-${it.albumId}`}
                    >
                      <img
                        src={it.artwork}
                        alt=""
                        className="w-12 h-12 rounded-xl object-cover flex-shrink-0 bg-white/5 shadow-[0_6px_16px_-6px_rgba(0,0,0,0.7)]"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-fan-primary truncate" data-testid={`welcomeback-record-title-${it.albumId}`}>
                          {it.title}
                        </div>
                        <div className="text-xs text-fan-secondary truncate">{it.artist}</div>
                        {formatPurchased(it.acquiredAt) && (
                          <div
                            className="text-xs text-fan-faint mt-0.5"
                            data-testid={`welcomeback-record-date-${it.albumId}`}
                          >
                            Purchased {formatPurchased(it.acquiredAt)}
                          </div>
                        )}
                      </div>
                      {(it.certificateNumber != null || it.grantNumber != null) && (
                        <div
                          className="text-xs font-mono text-[var(--brand-mint)] tabular-nums flex-shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1"
                          data-testid={`welcomeback-record-cert-${it.albumId}`}
                        >
                          {it.certificateNumber != null
                            ? `#${it.certificateNumber}`
                            : `GR ${String(it.grantNumber).padStart(2, "0")}`}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mb-7" data-testid="welcomeback-whats-new">
                <p className="text-fan-faint text-xs uppercase tracking-[0.16em] font-semibold mb-3.5">
                  While you were away
                </p>
                <ul className="space-y-2.5">
                  {WHATS_NEW.map((b) => (
                    <li
                      key={b.title}
                      className={`${CARD} p-4`}
                      data-testid={`welcomeback-whatsnew-${b.title.replace(/\W+/g, "-").toLowerCase()}`}
                    >
                      <div className="text-sm font-semibold text-fan-primary">{b.title}</div>
                      <div className="text-xs text-fan-secondary mt-1 leading-relaxed">{b.body}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-fan-secondary text-xs leading-relaxed mb-5" data-testid="welcomeback-reassurance">
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
                className={BTN_SECONDARY}
                data-testid="button-welcomeback-back-3"
                disabled={saving}
              >
                Back
              </button>
              <button
                onClick={finish}
                disabled={saving}
                className={`${BTN_PRIMARY} flex-1`}
                style={FINISH_FILL}
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
