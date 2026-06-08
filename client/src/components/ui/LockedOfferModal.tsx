import { useEffect, useState } from "react";
import { Lock, Bell, Check, X, ShoppingCart, Play } from "lucide-react";
import { formatUsdCents } from "@shared/money";
import { apiRequest } from "@/lib/queryClient";

/**
 * Task #1734 — the auto-opening "offer" modal that fronts the
 * get.goodtunes.music locked-preview album page. Buying a release is meant to
 * *feel* like an unlock: the fan lands on what looks like the real player page
 * (hero art, tracklist, dock) with this centered card already open over it.
 *
 * Two modes share one card:
 *   • offer   — the package pitch. Primary CTA is "Buy {price}" when the
 *               release is live, or "Get Notified" when sales are still
 *               pending (pre-launch).
 *   • notify  — a single email field. Captures the fan into the release's
 *               waitlist (POST /api/albums/:id/notify) so the operator can
 *               reach them when sales open. Confirms inline, no nav.
 *
 * Dismissing ("Preview first") closes the card and reveals the locked page
 * underneath; the page's "Get Details" control reopens it.
 *
 * Brand-correct, self-contained (props in / callbacks out), used by BOTH the
 * mobile and desktop locked-preview surfaces so the two never drift.
 */
export type LockedOfferModalProps = {
  open: boolean;
  onClose: () => void;
  albumId: string;
  title: string;
  artist?: string | null;
  artworkUrl?: string | null;
  priceCents?: number | null;
  /** Pre-launch (sunrise pending): lead with "Get Notified" instead of Buy. */
  salesPending: boolean;
  /** Task #1755 — campaign fan link: the release is live (family can buy) but
   *  general fans are notify-only, so force the "Get Notified" lead and never
   *  surface a checkout CTA, even though `salesPending` is false. */
  notifyOnly?: boolean;
  /** e.g. "6/8" — shown in the pre-launch copy when known. */
  salesBeginLabel?: string | null;
  /** Opens the real Buy sheet (live releases only). */
  onBuy: () => void;
  /** Prefill the notify field for a signed-in fan. */
  prefilledEmail?: string | null;
  /** Light attribution stamped on the signup row ("get" / "store"). */
  source?: string;
};

const CARD_BG = "#0B1547";

export function LockedOfferModal({
  open,
  onClose,
  albumId,
  title,
  artist,
  artworkUrl,
  priceCents,
  salesPending,
  notifyOnly,
  salesBeginLabel,
  onBuy,
  prefilledEmail,
  source,
}: LockedOfferModalProps) {
  // Lead with the notify flow either pre-launch (sunrise pending) OR when the
  // campaign fan link forces notify-only on an otherwise-live release.
  const leadNotify = salesPending || !!notifyOnly;
  const [mode, setMode] = useState<"offer" | "notify" | "done">("offer");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to the offer step whenever the modal is (re)opened, and seed the
  // email field from the signed-in fan when we have it.
  useEffect(() => {
    if (open) {
      setMode("offer");
      setEmail(prefilledEmail ?? "");
      setError(null);
      setSubmitting(false);
    }
  }, [open, prefilledEmail]);

  if (!open) return null;

  const priceLabel =
    priceCents != null ? formatUsdCents(priceCents) : null;

  async function submitNotify() {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest("POST", `/api/albums/${albumId}/notify`, {
        email: trimmed,
        source: source ?? null,
      });
      setMode("done");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-5"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — offer`}
      data-testid="locked-offer-modal"
    >
      {/* Scrim. No backdrop-filter here — the locked page may own its own
          chrome blur, and stacking two backdrop-filters bricks iOS WebKit
          (see chrome-scrim-one-blur-region). A solid wash is enough. */}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: "rgba(0,3,18,0.72)" }}
        data-testid="locked-offer-scrim"
      />
      <div
        className="relative w-[min(440px,calc(100vw-32px))] max-h-[calc(100dvh-48px)] overflow-y-auto rounded-[26px] flex flex-col"
        style={{
          background: CARD_BG,
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3.5 right-3.5 w-11 h-11 rounded-full flex items-center justify-center text-fan-secondary active:scale-95 transition-transform"
          style={{ background: "rgba(255,255,255,0.10)" }}
          data-testid="button-close-offer"
        >
          <X className="w-5 h-5" strokeWidth={2.2} />
        </button>

        <div className="px-6 pt-7 pb-6 flex flex-col items-center text-center">
          {/* Artwork */}
          <div
            className="w-32 h-32 rounded-2xl overflow-hidden flex-shrink-0 mb-4"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            {artworkUrl ? (
              <img
                src={artworkUrl}
                alt={title}
                className="w-full h-full object-cover"
                data-testid="img-offer-artwork"
              />
            ) : null}
          </div>

          {mode === "done" ? (
            <>
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                style={{ background: "rgba(74,255,202,0.16)" }}
              >
                <Check className="w-6 h-6" style={{ color: "var(--brand-mint)" }} strokeWidth={2.4} />
              </div>
              <h2 className="text-white text-xl font-bold leading-tight">
                You're on the list
              </h2>
              <p className="text-sm mt-2 leading-snug" style={{ color: "#98A2B3" }}>
                We'll email you the moment <span className="text-white">{title}</span> is
                available to buy.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 w-full h-12 rounded-full font-semibold text-base text-white active:scale-[0.98] transition-transform"
                style={{ background: "rgba(255,255,255,0.12)" }}
                data-testid="button-offer-preview"
              >
                Preview the album
              </button>
            </>
          ) : mode === "notify" ? (
            <>
              <h2 className="text-white text-xl font-bold leading-tight">
                Get notified
              </h2>
              <p className="text-sm mt-2 leading-snug" style={{ color: "#98A2B3" }}>
                Drop your email and we'll let you know the second{" "}
                <span className="text-white">{title}</span> goes on sale
                {salesBeginLabel ? ` (${salesBeginLabel})` : ""}.
              </p>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitNotify();
                }}
                className="mt-5 w-full h-12 rounded-xl px-4 text-white text-base outline-none"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.14)",
                }}
                data-testid="input-notify-email"
              />
              {error && (
                <p
                  className="text-xs mt-2 self-start"
                  style={{ color: "var(--brand-pink)" }}
                  data-testid="text-notify-error"
                >
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={submitNotify}
                disabled={submitting}
                className="mt-4 w-full h-12 rounded-full font-semibold text-base text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, var(--brand-purple), var(--brand-blue))" }}
                data-testid="button-submit-notify"
              >
                <Bell className="w-[18px] h-[18px]" strokeWidth={2.2} />
                {submitting ? "Saving…" : "Notify me"}
              </button>
              <button
                type="button"
                onClick={() => setMode("offer")}
                className="mt-3 text-sm font-medium"
                style={{ color: "#98A2B3" }}
                data-testid="button-notify-back"
              >
                Back
              </button>
            </>
          ) : (
            <>
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-3"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                <Lock className="w-3.5 h-3.5" style={{ color: "var(--brand-mint)" }} strokeWidth={2.4} />
                <span className="text-xs font-semibold tracking-wide" style={{ color: "var(--brand-mint)" }}>
                  {leadNotify ? "COMING SOON" : "UNLOCK THIS RELEASE"}
                </span>
              </div>
              <h2 className="text-white text-2xl font-bold leading-tight" data-testid="text-offer-title">
                {title}
              </h2>
              {artist && (
                <p className="text-sm mt-1 font-medium" style={{ color: "var(--brand-blue)" }}>
                  {artist}
                </p>
              )}
              <p className="text-sm mt-3 leading-snug" style={{ color: "#98A2B3" }}>
                {leadNotify
                  ? `This release isn't on sale yet${salesBeginLabel ? ` — sales begin ${salesBeginLabel}` : ""}. Be first in line and we'll email you the moment it drops.`
                  : "Own it forever — the full album, lossless audio, bonus videos and your GoodDeed certificate of ownership."}
              </p>

              {leadNotify ? (
                <button
                  type="button"
                  onClick={() => setMode("notify")}
                  className="mt-6 w-full h-12 rounded-full font-semibold text-base text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  style={{ background: "linear-gradient(135deg, var(--brand-purple), var(--brand-blue))" }}
                  data-testid="button-offer-get-notified"
                >
                  <Bell className="w-[18px] h-[18px]" strokeWidth={2.2} />
                  Get Early Access
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onBuy}
                  className="mt-6 w-full h-12 rounded-full font-semibold text-base text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  style={{ background: "linear-gradient(135deg, #1D5E8F, var(--brand-blue))" }}
                  data-testid="button-offer-buy"
                >
                  <ShoppingCart className="w-[18px] h-[18px]" strokeWidth={2.2} />
                  {priceLabel ? `Buy ${priceLabel}` : "Buy Now"}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full h-11 rounded-full font-medium text-sm text-fan-secondary flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                style={{ background: "rgba(255,255,255,0.10)" }}
                data-testid="button-offer-preview"
              >
                <Play className="w-4 h-4" fill="currentColor" strokeWidth={0} />
                Preview first
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
