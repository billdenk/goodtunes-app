// Task #53 — New-fan welcome sheet.
//
// One-time Apple-Music-style sheet shown to free signups: fans who have just
// created an account but haven't bought anything. Explains what GoodTunes
// actually is (free private player for music you own, early access before
// streaming, possible bonus/exclusive content) and offers a single ask:
// opt in to "notify me when new music drops."
//
// Gating: GET /api/me/new-fan-welcome/state. Shows only when:
//   • fan is a customer
//   • fan has no library (user_albums empty)
//   • fan is not a legacy gogoods import (those go to WelcomeBack)
//   • fan has not previously dismissed this sheet (newFanWelcomeSeenAt IS NULL)
//
// Shown once: POST /api/me/new-fan-welcome/dismiss stamps newFanWelcomeSeenAt.
//
// iOS-native guardrail: the sheet contains ZERO Buy / price / external-purchase
// copy. It frames around free access, ownership, early access, and bonus content
// only. BuyEnabled is already gated off on native (platform.ts); this sheet just
// doesn't reference purchasing at all so there's nothing to strip.
//
// Mounted globally in App.tsx (alongside DownloadEntitlementGuard, etc.) and
// self-gates so it never renders on blocked paths or for returning buyers.

import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { track } from "@/lib/analytics";
import { SheetClose } from "@/components/ui/SheetChrome";
import { Bell, BellOff, Music, Lock, Zap, Gift } from "lucide-react";

type NewFanWelcomeState = {
  shouldShow: boolean;
  notifyOptIn?: boolean | null;
};

// Paths where popping any sheet would feel intrusive. The sheet stays armed
// and surfaces the next time the fan lands on a regular player route.
const BLOCKED_PREFIXES = [
  "/login",
  "/register",
  "/admin",
  "/welcome",
  "/welcome-back",
  "/finish-setup",
  "/account/merge",
  "/invite",
  "/reset-password",
  "/forgot-password",
  "/gift",
  "/redeem",
  "/error",
  "/g/",
];

function isBlockedPath(pathname: string): boolean {
  return BLOCKED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p),
  );
}

// ─── Shared surface tokens (Apple-Music / ElevenLabs, mirrors WelcomeBack.tsx)
const CARD =
  "rounded-3xl bg-[color:var(--fan-surface)] shadow-[0_18px_50px_-24px_rgba(0,0,0,0.85)] backdrop-blur-xl";

// Value-prop rows on screen 1.
const VALUE_PROPS = [
  {
    Icon: Lock,
    title: "It's your private player",
    body: "GoodTunes plays music you actually own — not a catalog you rent. Your collection, your terms.",
  },
  {
    Icon: Zap,
    title: "Hear it before it's on streaming",
    body: "Albums arrive here first. You may be listening days — or weeks — before a release hits Spotify or Apple Music.",
  },
  {
    Icon: Gift,
    title: "Extras you won't find anywhere else",
    body: "Bonus tracks, behind-the-scenes audio, and exclusive video that artists never release to streaming.",
  },
];

export function NewFanWelcomeSheet() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [notifyOptIn, setNotifyOptIn] = useState<boolean | null>(null);
  const shownRef = useRef(false);

  const enabled = !!user && user.kind === "customer" && !isBlockedPath(location);

  const { data } = useQuery<NewFanWelcomeState>({
    queryKey: ["/api/me/new-fan-welcome/state"],
    enabled,
    staleTime: 60 * 60 * 1000,
  });

  // Open exactly once per session when the gate flips to shouldShow.
  useEffect(() => {
    if (!enabled || !data?.shouldShow) return;
    if (shownRef.current) return;
    shownRef.current = true;
    // Seed the toggle from whatever the server has (usually null on first load).
    setNotifyOptIn(data.notifyOptIn ?? null);
    setOpen(true);
    try {
      track("new_fan_welcome_shown", {});
    } catch {}
  }, [enabled, data?.shouldShow, data?.notifyOptIn]);

  // Track step transitions.
  useEffect(() => {
    if (!open) return;
    try {
      track("new_fan_welcome_step", { step });
    } catch {}
  }, [step, open]);

  // Lock body scroll while the sheet is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const dismiss = async (via: "cta" | "close") => {
    if (closing) return;
    setClosing(true);
    const finalOptIn = notifyOptIn ?? false;
    try {
      track("new_fan_welcome_completed", { notifyOptIn: finalOptIn, via });
    } catch {}
    try {
      await apiRequest("POST", "/api/me/new-fan-welcome/dismiss", {
        notifyOptIn: typeof notifyOptIn === "boolean" ? notifyOptIn : undefined,
      });
      queryClient.setQueryData<NewFanWelcomeState>(["/api/me/new-fan-welcome/state"], (prev) =>
        prev ? { ...prev, shouldShow: false } : prev,
      );
    } catch {
      // Best-effort: if dismiss fails, close anyway. The DB guard (newFanWelcomeSeenAt)
      // wasn't stamped, so the sheet will re-appear on next session — acceptable.
    }
    setOpen(false);
    setClosing(false);
  };

  const toggleNotify = async (next: boolean) => {
    setNotifyOptIn(next);
    try {
      track("new_fan_notify_opt_in", { opted_in: next });
    } catch {}
    // Optimistically fire the standalone update; dismiss will also persist it.
    try {
      await apiRequest("PATCH", "/api/me/notify-opt-in", { notifyOptIn: next });
    } catch {}
  };

  if (!open || !data) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      data-testid="new-fan-welcome-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-fan-welcome-title"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close welcome"
        onClick={() => void dismiss("close")}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        data-testid="new-fan-welcome-scrim"
      />

      {/* Sheet — full-screen on phone, centered card on tablet+ */}
      <section
        className="relative w-full sm:max-w-[440px] sm:rounded-3xl text-white shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom sm:slide-in-from-bottom-4 duration-300 max-h-[100dvh] sm:max-h-[92vh]"
        style={{
          background: "var(--brand-bg)",
          paddingTop: "max(env(safe-area-inset-top), 0px)",
          paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
        }}
        data-testid="new-fan-welcome-card"
      >
        {/* Close (X) — top-right */}
        <div className="flex justify-end px-3 pt-3">
          <SheetClose
            onClick={() => void dismiss("close")}
            data-testid="button-new-fan-welcome-close"
          />
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 px-6 mb-1">
          {([1, 2] as const).map((n) => (
            <div
              key={n}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                n === step
                  ? "w-8 bg-[var(--brand-blue)] shadow-[0_0_12px_var(--brand-blue)]"
                  : n < step
                  ? "w-5 bg-[var(--brand-mint)]"
                  : "w-5 bg-white/15"
              }`}
              data-testid={`new-fan-welcome-step-dot-${n}`}
            />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* ── Step 1: What GoodTunes is ── */}
          {step === 1 && (
            <div className="gt-onboard-rise" data-testid="new-fan-welcome-step-1">
              {/* Eyebrow + headline */}
              <p className="text-[var(--brand-mint)] text-xs uppercase tracking-widest font-semibold mb-3 mt-2">
                Welcome to GoodTunes
              </p>
              <h1
                id="new-fan-welcome-title"
                className="text-3xl font-bold leading-tight tracking-tight mb-3"
                data-testid="new-fan-welcome-title"
              >
                This isn't streaming.
              </h1>
              <p className="text-fan-secondary text-sm mb-7 leading-relaxed" data-testid="new-fan-welcome-subtitle">
                GoodTunes is a private player for music you actually <em>own</em> — and right now you're here early.
              </p>

              {/* Value props */}
              <ul className="space-y-3 mb-7" data-testid="new-fan-welcome-props">
                {VALUE_PROPS.map(({ Icon, title, body }) => (
                  <li
                    key={title}
                    className={`${CARD} flex items-start gap-3.5 p-4`}
                    data-testid={`new-fan-welcome-prop-${title.replace(/\W+/g, "-").toLowerCase()}`}
                  >
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: "rgba(74,255,202,0.12)" }}
                    >
                      <Icon className="w-5 h-5 text-[var(--brand-mint)]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-white">{title}</span>
                      <span className="block text-xs text-fan-secondary mt-1 leading-relaxed">{body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Step 2: Notify opt-in ── */}
          {step === 2 && (
            <div className="gt-onboard-rise" data-testid="new-fan-welcome-step-2">
              <p className="text-[var(--brand-mint)] text-xs uppercase tracking-widest font-semibold mb-3 mt-2">
                One ask
              </p>
              <h2
                className="text-3xl font-bold leading-tight tracking-tight mb-3"
                data-testid="new-fan-welcome-notify-title"
              >
                Stay in the loop.
              </h2>
              <p className="text-fan-secondary text-sm mb-7 leading-relaxed">
                When a new album drops on GoodTunes, be the first to know. No spam — just the moment something worth hearing is ready.
              </p>

              {/* Opt-in toggle card */}
              <div
                className={`${CARD} p-5 mb-6`}
                data-testid="new-fan-welcome-notify-card"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background:
                          notifyOptIn
                            ? "rgba(49,158,216,0.18)"
                            : "rgba(255,255,255,0.06)",
                      }}
                    >
                      {notifyOptIn ? (
                        <Bell className="w-5 h-5 text-[var(--brand-blue)]" />
                      ) : (
                        <BellOff className="w-5 h-5 text-fan-faint" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white leading-snug">
                        {notifyOptIn ? "You're in" : "Notify me when new music drops"}
                      </div>
                      <div className="text-xs text-fan-secondary mt-0.5 leading-snug">
                        {notifyOptIn
                          ? "We'll let you know when something new is ready."
                          : "Turn this on to hear about new releases first."}
                      </div>
                    </div>
                  </div>
                  {/* Toggle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notifyOptIn ?? false}
                    onClick={() => void toggleNotify(!notifyOptIn)}
                    className={`relative flex-shrink-0 w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] ${
                      notifyOptIn
                        ? "bg-[var(--brand-blue)]"
                        : "bg-white/15"
                    }`}
                    data-testid="button-new-fan-welcome-notify-toggle"
                  >
                    {/* thumb — visual-only indicator inside the parent switch button */}
                    <span
                      aria-hidden="true"
                      className={`absolute top-1 bg-white shadow transition-all duration-200 ${
                        notifyOptIn ? "left-6" : "left-1"
                      }`}
                      style={{ width: 20, height: 20, borderRadius: "50%" }}
                    />
                  </button>
                </div>
              </div>

              <p className="text-fan-faint text-xs text-center mb-5 leading-relaxed px-2">
                This only covers GoodTunes release notifications. You can change it any time from your Account settings.
              </p>
            </div>
          )}
        </div>

        {/* Pinned CTA bar */}
        <div
          className="px-6 pb-6 pt-2 border-t border-white/5 space-y-3"
          style={{ background: "var(--brand-bg)" }}
        >
          {step === 1 ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={closing}
              className="w-full py-4 rounded-2xl font-semibold text-base text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, var(--brand-blue), var(--brand-purple))",
                boxShadow: "0 12px 32px -14px var(--brand-blue)",
              }}
              data-testid="button-new-fan-welcome-next"
            >
              Got it — what's the ask?
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void dismiss("cta")}
                disabled={closing}
                className="w-full py-4 rounded-2xl font-semibold text-base text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                style={{
                  background:
                    notifyOptIn
                      ? "linear-gradient(135deg, var(--brand-blue), var(--brand-purple))"
                      : "rgba(255,255,255,0.08)",
                  boxShadow: notifyOptIn
                    ? "0 12px 32px -14px var(--brand-blue)"
                    : undefined,
                }}
                data-testid="button-new-fan-welcome-done"
              >
                {closing ? "Saving…" : notifyOptIn ? "I'm in — open my player" : "No thanks — open my player"}
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={closing}
                className="w-full text-center text-sm text-fan-faint transition-colors hover:text-fan-secondary"
                data-testid="button-new-fan-welcome-back"
              >
                ← Back
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
