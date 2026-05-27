// Task #536 — "What's New" welcome-back sheet.
//
// Apple-Music-style sheet that greets returning fans on first launch
// after the app update. Full-screen on phone, centered modal on
// tablet/desktop, safe-area aware. Mounted globally in App.tsx; gates
// itself on GET /api/me/whats-new (recognition + version check) so it
// only renders for recognized customers whose `whatsNewSeenVersion` is
// behind the current `WHATS_NEW_VERSION`.
//
// Dismissal is persisted server-side via POST /api/me/whats-new/dismiss
// (stamps `customerUsers.whatsNewSeenVersion`) so the sheet never
// re-appears for that wave even if the fan signs out / clears cookies.

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { track } from "@/lib/analytics";
import { WHATS_NEW_CARDS, type WhatsNewCard } from "@shared/whatsNew";
import {
  Mic2,
  ShieldCheck,
  MessageSquare,
  ListMusic,
  Sparkles,
  Heart,
  X,
  ArrowRight,
} from "lucide-react";

const ICONS = {
  Mic2,
  ShieldCheck,
  MessageSquare,
  ListMusic,
  Sparkles,
  Heart,
} as const;

type WhatsNewState = {
  shouldShow: boolean;
  recognized?: boolean;
  libraryCount?: number;
  currentVersion: number;
  seenVersion?: number | null;
};

// Routes where popping a sheet would feel intrusive (auth, onboarding,
// post-checkout, gift/redeem flows, admin shells, error pages). The
// sheet stays armed and surfaces the next time the fan lands on a
// regular player route.
const BLOCKED_PREFIXES = [
  "/login",
  "/register",
  "/admin",
  "/welcome",          // covers /welcome and /welcome-back, /welcome-invitee
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
  return BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
}

export function WhatsNewSheet() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const shownRef = useRef(false);

  const enabled = !!user && user.kind === "customer" && !isBlockedPath(location);

  const { data } = useQuery<WhatsNewState>({
    queryKey: ["/api/me/whats-new"],
    enabled,
    staleTime: 60 * 60 * 1000,
  });

  // Open exactly once per session when the gate goes from "should not
  // show" → "should show". A single fan won't see it more than once
  // per page-load even if the query re-fires.
  useEffect(() => {
    if (!enabled || !data?.shouldShow) return;
    if (shownRef.current) return;
    shownRef.current = true;
    setOpen(true);
    try {
      track("welcome_back_shown", {
        version: data.currentVersion,
        libraryCount: data.libraryCount ?? 0,
        recognized: !!data.recognized,
      });
    } catch {}
  }, [enabled, data?.shouldShow, data?.currentVersion, data?.libraryCount, data?.recognized]);

  // Lock body scroll while the sheet is up (matches Apple Music's
  // full-screen "What's New" presentation on iOS).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const close = async (via: "cta" | "close") => {
    if (closing) return;
    setClosing(true);
    try {
      track("welcome_back_dismissed", { version: data?.currentVersion ?? 0, via });
    } catch {}
    try {
      await apiRequest("POST", "/api/me/whats-new/dismiss", {
        version: data?.currentVersion ?? 1,
      });
      queryClient.setQueryData<WhatsNewState>(["/api/me/whats-new"], (prev) =>
        prev ? { ...prev, shouldShow: false, seenVersion: prev.currentVersion } : prev,
      );
    } catch {
      // Best-effort: even if the dismiss POST fails, close the sheet so
      // the fan isn't stuck behind it. The next session will re-fetch
      // the gate and surface it again — better than blocking.
    }
    setOpen(false);
    setClosing(false);
  };

  const onPrimary = () => {
    void close("cta");
    navigate("/collection");
  };

  const onCardTap = (card: WhatsNewCard) => {
    try {
      track("welcome_back_card_tapped", {
        version: data?.currentVersion ?? 0,
        cardKey: card.key,
      });
    } catch {}
  };

  if (!open || !data) return null;

  const libraryCount = data.libraryCount ?? 0;
  const cards = WHATS_NEW_CARDS.slice(0, 3);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      data-testid="whatsnew-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whatsnew-title"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close"
        onClick={() => void close("close")}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        data-testid="whatsnew-scrim"
      />

      {/* Sheet — full-screen on phone, centered card on tablet+ */}
      <section
        className="relative w-full sm:max-w-[440px] sm:rounded-3xl text-white shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom sm:slide-in-from-bottom-4 duration-300 max-h-[100dvh] sm:max-h-[88vh]"
        style={{
          background: "var(--brand-bg)",
          paddingTop: "max(env(safe-area-inset-top), 0px)",
          paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
        }}
        data-testid="whatsnew-card"
      >
        {/* Close (X) — top-right */}
        <div className="flex justify-end px-3 pt-3">
          <button
            type="button"
            onClick={() => void close("close")}
            className="w-11 h-11 rounded-full flex items-center justify-center text-white/70 hover:text-white active:scale-[0.94] transition bg-white/[0.06]"
            aria-label="Close"
            data-testid="button-whatsnew-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* Header */}
          <p
            className="text-[var(--brand-mint)] text-xs uppercase tracking-widest font-semibold mb-2"
            data-testid="whatsnew-eyebrow"
          >
            Welcome back
          </p>
          <h1
            id="whatsnew-title"
            className="text-3xl font-bold leading-tight mb-3"
            data-testid="whatsnew-title"
          >
            We saved your seat.
          </h1>
          <p className="text-white/55 text-sm mb-6 leading-relaxed" data-testid="whatsnew-subtitle">
            {libraryCount > 0 ? (
              <>
                Every album in your collection is right where you left it
                {" — "}
                <span className="text-white font-semibold tabular-nums" data-testid="text-library-count">
                  {libraryCount} {libraryCount === 1 ? "record" : "records"}
                </span>{" "}
                ready to stream on phone, tablet, and laptop.
              </>
            ) : (
              <>Your library moved with you — open it any time and pick up where you were.</>
            )}
          </p>

          {/* "What's new since you were here" — 2-3 capability cards */}
          <p className="text-white/40 text-xs uppercase tracking-wider font-semibold mb-3">
            What's new since you were here
          </p>
          <ul className="space-y-2.5 mb-6" data-testid="whatsnew-card-list">
            {cards.map((card) => {
              const Icon = ICONS[card.icon] ?? Sparkles;
              return (
                <li key={card.key}>
                  <button
                    type="button"
                    onClick={() => onCardTap(card)}
                    className="w-full text-left flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4 active:scale-[0.99] active:bg-white/[0.08] transition"
                    data-testid={`whatsnew-card-${card.key}`}
                  >
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(74, 255, 202, 0.12)" }}
                    >
                      <Icon className="w-5 h-5 text-[var(--brand-mint)]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-white">{card.title}</span>
                      <span className="block text-xs text-white/55 mt-1 leading-relaxed">
                        {card.body}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Primary CTA — pinned to the bottom, safe-area-padded */}
        <div
          className="px-6 pb-6 pt-2 border-t border-white/5"
          style={{ background: "var(--brand-bg)" }}
        >
          <button
            type="button"
            onClick={onPrimary}
            disabled={closing}
            className="w-full py-4 rounded-2xl font-semibold text-base text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, var(--brand-purple), var(--brand-blue))" }}
            data-testid="button-whatsnew-open-collection"
          >
            Open my collection
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
