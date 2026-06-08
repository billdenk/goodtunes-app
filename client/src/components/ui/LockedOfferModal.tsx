import { useEffect, useState } from "react";
import {
  Lock,
  Bell,
  Check,
  X,
  ShoppingCart,
  ShoppingBag,
  Play,
  ChevronRight,
  ChevronLeft,
  Minus,
  Plus,
  Gift,
  Sparkles,
  Info,
  Expand,
} from "lucide-react";
import { formatUsdCents } from "@shared/money";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { getCampaignRelease, type ReleaseContent } from "@/pages/Hope";

/**
 * Task #1734 / #1816 — the auto-opening "offer" modal that fronts the
 * get.goodtunes.music locked-preview album page. Buying a release is meant to
 * *feel* like an unlock: the fan lands on what looks like the real player page
 * (hero art, tracklist, dock) with this centered card already open over it.
 *
 * Two shells share one set of hooks:
 *
 *   • Generic card (no campaign match) — the original package pitch. Primary
 *     CTA is "Buy {price}" when the release is live, or "Get Notified" when
 *     sales are still pending (pre-launch). A single email field captures the
 *     fan into the waitlist (POST /api/albums/:id/notify).
 *
 *   • Campaign flow (Task #1816) — when the artist/release maps to a known
 *     campaign in Hope.tsx (e.g. Nightbirde · Hope), render the rich
 *     "Get Hope. Gift Hope." multi-step flow that Bill signed off on in the
 *     mockup. The /staging dry-run (forceBuy) walks overview → Get Hope →
 *     Gift Hope → sign-in/pay and hands off to the real BuySheet (Stripe).
 *     The /hope fan link (notifyOnly) shows the same editorial overview but
 *     leads to Get Early Access email capture only — never checkout.
 *
 * The campaign flow reads its copy/imagery from the Hope.tsx registry and its
 * prices from the real /api/albums/:id/buy-options response, so it never drifts
 * from what the fan is actually charged. Quantity and gift selections are
 * editorial (they drive the in-modal order recap); the BuySheet collects the
 * binding selection on the Stripe screen. The one selection threaded into the
 * handoff is the signed-cert upgrade, via onBuy({ signedCert }).
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
  /** Opens the real Buy sheet (live releases only). The optional signed-cert
   *  flag pre-selects the signed GoodDeed upgrade in the sheet. */
  onBuy: (opts?: { signedCert?: boolean }) => void;
  /** Prefill the notify field for a signed-in fan. */
  prefilledEmail?: string | null;
  /** Light attribution stamped on the signup row ("get" / "store"). */
  source?: string;
  /** Task #1784 — /staging dry-run: force the Buy CTA even while the release
   *  is prepping/notify-only, so a reviewer can walk the purchase screens. */
  forceBuy?: boolean;
  /** Task #1784 — preview surfaces (/hope, /staging) paint the primary CTA in
   *  the brand mint treatment (mint fill, deep-navy text) to match the page. */
  accentMint?: boolean;
  /** Task #1784 — override the bottom dismiss label (e.g. "Preview the Music"). */
  dismissLabel?: string;
};

const CARD_BG = "#0B1547";
// Campaign-flow palette. Non-brand support hexes (allowed by design-lint);
// brand colors are referenced via var(--brand-*) only.
const CARD = "#0E1A4E";
const PANEL = "#19295D";
const ORANGE = "#F09837";

type Step = "overview" | "buy" | "signed" | "give" | "pay";
const ORDER: Step[] = ["overview", "buy", "signed", "give", "pay"];

/* ── campaign primitives ──────────────────────────────────────────── */

function QtyStepper({
  value,
  onChange,
  testid,
  min = 0,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  testid: string;
  min?: number;
  max?: number;
}) {
  const atMin = value <= min;
  const atMax = max != null && value >= max;
  return (
    <div
      className="inline-flex items-center rounded-full border border-white/20 bg-white/[0.04] h-10 px-1"
      data-testid={testid}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={atMin}
        className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-fan-secondary active:scale-95 transition-transform disabled:opacity-30"
      >
        <Minus className="w-4 h-4" strokeWidth={2.4} />
      </button>
      <span className="w-7 text-center text-fan-primary text-sm font-semibold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(max != null ? Math.min(max, value + 1) : value + 1)}
        disabled={atMax}
        className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-fan-secondary active:scale-95 transition-transform disabled:opacity-30"
      >
        <Plus className="w-4 h-4" strokeWidth={2.4} />
      </button>
    </div>
  );
}

/** Inline "$25 × 2 = $50" math, sitting where a button used to be. */
function LineMath({ unitCents, qty, testid }: { unitCents: number; qty: number; testid: string }) {
  return (
    <span className="text-fan-secondary text-sm tabular-nums" data-testid={testid}>
      {formatUsdCents(unitCents)} <span className="text-fan-faint">×</span> {qty}{" "}
      <span className="text-fan-faint">=</span>{" "}
      <span className="text-fan-primary font-bold">{formatUsdCents(unitCents * qty)}</span>
    </span>
  );
}

/** Tap-to-reveal explainer (tap, not hover — this lands on touch). */
function WhyMore({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="link-why-more"
        className="inline-flex items-center gap-1 text-fan-faint text-xs"
      >
        <Info className="w-3.5 h-3.5" strokeWidth={2} />
        Why more than one?
      </button>
      {open && (
        <div
          data-testid="popover-why-more"
          className="absolute z-30 left-0 top-full mt-2 w-[268px] rounded-xl p-3.5 text-xs leading-relaxed text-fan-primary"
          style={{
            background: PANEL,
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function EditionCol({
  label,
  items,
}: {
  label: string;
  items: { head: string; body: string }[];
}) {
  return (
    <div className="flex-1 min-w-0">
      <div
        className="text-xs font-bold uppercase tracking-wide mb-3"
        style={{ color: ORANGE }}
      >
        {label}
      </div>
      <div className="flex flex-col gap-3.5">
        {items.map((it) => (
          <div key={it.head}>
            <div className="text-fan-primary text-sm font-semibold">{it.head}</div>
            <div className="text-fan-secondary text-xs leading-relaxed mt-0.5">
              {it.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Note({ icon: Icon, children }: { icon: typeof Gift; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 items-start text-fan-secondary text-xs leading-relaxed">
      <Icon className="w-4 h-4 mt-px flex-shrink-0" strokeWidth={2} style={{ color: ORANGE }} />
      <span>{children}</span>
    </div>
  );
}

/** A product image you can tap to enlarge. Every card uses this so size +
 *  styling stay identical across the bundle, signed cert and gift box. */
function Zoomable({
  src,
  alt,
  onZoom,
  testid,
}: {
  src: string;
  alt: string;
  onZoom: (src: string) => void;
  testid: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onZoom(src)}
      data-testid={testid}
      className="group relative flex-shrink-0 w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden bg-white cursor-zoom-in"
      style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}
    >
      <img src={src} alt={alt} className="w-full h-full object-cover" draggable={false} />
      <span
        className="absolute bottom-2 right-2 w-7 h-7 rounded-lg inline-flex items-center justify-center text-white"
        style={{ background: "rgba(0,0,0,0.5)" }}
      >
        <Expand className="w-3.5 h-3.5" strokeWidth={2.4} />
      </span>
    </button>
  );
}

/** Full-bleed enlarged view of a tapped product image. */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-8"
      style={{ background: "rgba(0,2,12,0.88)" }}
      onClick={() => onClose()}
      data-testid="lightbox"
    >
      <img
        src={src}
        alt=""
        className="max-w-[86%] max-h-[86%] rounded-2xl object-contain bg-white"
        style={{ boxShadow: "0 30px 90px rgba(0,0,0,0.7)" }}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
      <button
        type="button"
        aria-label="Close"
        onClick={() => onClose()}
        data-testid="button-lightbox-close"
        className="absolute top-5 right-5 w-11 h-11 rounded-full inline-flex items-center justify-center text-white"
        style={{ background: "rgba(0,0,0,0.45)" }}
      >
        <X className="w-5 h-5" strokeWidth={2.2} />
      </button>
    </div>
  );
}

/* ── campaign steps ───────────────────────────────────────────────── */

function OverviewStep({ c, heroSrc }: { c: ReleaseContent; heroSrc: string }) {
  return (
    <div data-testid="step-overview">
      <h1 className="text-fan-primary text-2xl font-bold tracking-tight mb-5">
        {c.overview.heading}
      </h1>
      <div className="flex flex-col sm:flex-row gap-5">
        <div
          className="flex-shrink-0 mx-auto sm:mx-0 w-44 h-44 rounded-2xl overflow-hidden bg-white"
          style={{ boxShadow: "0 12px 36px rgba(0,0,0,0.4)" }}
        >
          <img
            src={heroSrc}
            alt={`${c.artistName} — ${c.releaseName}`}
            className="w-full h-full object-cover"
            data-testid="img-overview-hero"
          />
        </div>
        <div className="flex-1 min-w-0 text-fan-secondary text-sm leading-relaxed flex flex-col gap-3">
          {c.overview.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-2xl p-5 sm:p-6" style={{ background: PANEL }}>
        <h2 className="text-fan-primary text-xl font-bold tracking-tight">
          {c.overview.panelTitle}
        </h2>
        <p className="text-fan-secondary text-sm leading-snug mt-1.5 max-w-[560px]">
          {c.overview.panelBody}
        </p>
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 mt-5">
          {c.overview.editions.map((ed) => (
            <EditionCol key={ed.label} label={ed.label} items={ed.items} />
          ))}
        </div>
      </div>
    </div>
  );
}

function BundleStep({
  c,
  heroSrc,
  bundleQty,
  onBundle,
  bundleUnitCents,
  onZoom,
}: {
  c: ReleaseContent;
  heroSrc: string;
  bundleQty: number;
  onBundle: (n: number) => void;
  bundleUnitCents: number;
  onZoom: (src: string) => void;
}) {
  return (
    <div data-testid="step-buy">
      <h1 className="text-fan-primary text-2xl font-bold tracking-tight mb-1.5">
        {c.buy.heading}
      </h1>
      <p className="text-fan-secondary text-sm leading-snug mb-6 max-w-[520px]">
        {c.buy.intro}
      </p>

      <div className="flex gap-4 sm:gap-5">
        <Zoomable src={heroSrc} alt={c.buy.bundleName} onZoom={onZoom} testid="zoom-bundle" />
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-fan-primary text-lg font-bold tracking-tight">
              {c.buy.bundleName}
            </h3>
            <div
              className="flex-shrink-0 text-fan-primary text-lg font-bold tabular-nums"
              data-testid="price-bundle"
            >
              {formatUsdCents(bundleUnitCents)}
            </div>
          </div>
          <p className="text-fan-secondary text-sm leading-snug mt-1.5 max-w-[340px]">
            {c.buy.bundleBody}
          </p>
          <div className="mt-auto pt-4 flex items-center gap-4">
            <QtyStepper value={bundleQty} onChange={onBundle} min={1} testid="stepper-bundle" />
            <LineMath unitCents={bundleUnitCents} qty={bundleQty} testid="linetotal-bundle" />
          </div>
          <div className="mt-2.5">
            <WhyMore>{c.buy.whyMore}</WhyMore>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignedStep({
  c,
  certSrc,
  bundleQty,
  signedQty,
  onSigned,
  signedUnitCents,
  onZoom,
}: {
  c: ReleaseContent;
  certSrc: string;
  bundleQty: number;
  signedQty: number;
  onSigned: (n: number) => void;
  signedUnitCents: number;
  onZoom: (src: string) => void;
}) {
  return (
    <div data-testid="step-signed">
      <h1 className="text-fan-primary text-2xl font-bold tracking-tight mb-1.5">
        {c.buy.signedHeading}
      </h1>
      <p className="text-fan-secondary text-sm leading-snug mb-6 max-w-[520px]">
        {c.buy.signedIntro}
      </p>

      <div className="flex gap-4 sm:gap-5">
        <Zoomable src={certSrc} alt={c.buy.signedName} onZoom={onZoom} testid="zoom-signed" />
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-fan-primary text-lg font-bold tracking-tight">
              {c.buy.signedName}
            </h3>
            <div
              className="flex-shrink-0 text-fan-primary text-sm font-bold tabular-nums"
              data-testid="price-signed"
            >
              +{formatUsdCents(signedUnitCents)} each
            </div>
          </div>
          <p className="text-fan-secondary text-xs leading-snug mt-1.5 max-w-[360px]">
            {c.buy.signedBody}
          </p>
          <div className="mt-auto pt-3.5 flex items-center gap-4">
            <QtyStepper
              value={signedQty}
              onChange={onSigned}
              min={0}
              max={bundleQty}
              testid="stepper-signed"
            />
            <span className="text-sm tabular-nums" data-testid="hint-signed">
              {signedQty === 0 ? (
                <span className="text-fan-faint">
                  Optional — up to your {bundleQty} cop{bundleQty > 1 ? "ies" : "y"}
                </span>
              ) : (
                <span className="text-fan-secondary">
                  {signedQty} of {bundleQty} signed{" "}
                  <span className="text-fan-faint">=</span>{" "}
                  <span className="text-fan-primary font-bold">
                    {formatUsdCents(signedUnitCents * signedQty)}
                  </span>
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GiveStep({
  c,
  boxSrc,
  boxQty,
  onBox,
  giftCents,
  onGift,
  giftMinCents,
  giftPresetsCents,
  onZoom,
}: {
  c: ReleaseContent;
  boxSrc: string;
  boxQty: number;
  onBox: (n: number) => void;
  giftCents: number;
  onGift: (n: number) => void;
  giftMinCents: number;
  giftPresetsCents: number[];
  onZoom: (src: string) => void;
}) {
  const active = boxQty > 0;
  return (
    <div data-testid="step-give">
      <h1 className="text-fan-primary text-2xl font-bold tracking-tight mb-1.5">
        {c.give.heading}
      </h1>
      <p className="text-fan-secondary text-sm leading-snug mb-6 max-w-[540px]">
        {c.give.intro}
      </p>

      <div className="flex gap-4 sm:gap-5">
        <Zoomable src={boxSrc} alt={c.give.boxName} onZoom={onZoom} testid="zoom-box" />
        <div className="flex-1 min-w-0 flex flex-col">
          <h3 className="text-fan-primary text-lg font-bold tracking-tight">{c.give.boxName}</h3>
          <p className="text-fan-secondary text-sm leading-snug mt-1.5 max-w-[360px]">
            {c.give.boxBody}
          </p>
          <div className="mt-auto pt-4 flex items-center gap-4">
            <QtyStepper value={boxQty} onChange={onBox} min={0} testid="stepper-box" />
            <span className="text-sm" data-testid="hint-box">
              {active ? (
                <span className="text-fan-secondary">
                  {boxQty} box{boxQty > 1 ? "es" : ""}
                </span>
              ) : (
                <span className="text-fan-faint">Optional</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {active && (
        <div className="mt-6 rounded-2xl p-5" style={{ background: PANEL }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-fan-primary text-sm font-semibold">
              Your gift{boxQty > 1 ? " (each box)" : ""}
            </span>
            <span className="text-fan-faint text-xs">
              Minimum {formatUsdCents(giftMinCents)}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {giftPresetsCents.map((p) => {
              const on = giftCents === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onGift(p)}
                  data-testid={`pill-gift-${p}`}
                  className="h-10 px-4 rounded-full text-sm font-semibold tabular-nums transition-colors"
                  style={
                    on
                      ? { background: "#fff", color: "var(--brand-bg)" }
                      : {
                          background: "rgba(255,255,255,0.06)",
                          color: "var(--fan-text-secondary)",
                          border: "1px solid rgba(255,255,255,0.16)",
                        }
                  }
                >
                  {formatUsdCents(p)}
                </button>
              );
            })}
            <div className="inline-flex items-center rounded-full border border-white/20 bg-white/[0.04] h-10 px-1">
              <button
                type="button"
                aria-label="Give less"
                onClick={() => onGift(Math.max(giftMinCents, giftCents - 2500))}
                disabled={giftCents <= giftMinCents}
                className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-fan-secondary active:scale-95 transition-transform disabled:opacity-30"
              >
                <Minus className="w-4 h-4" strokeWidth={2.4} />
              </button>
              <span
                className="px-2 text-center text-fan-primary text-sm font-semibold tabular-nums"
                data-testid="text-gift-amount"
              >
                {formatUsdCents(giftCents)}
              </span>
              <button
                type="button"
                aria-label="Give more"
                onClick={() => onGift(giftCents + 2500)}
                className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-fan-secondary active:scale-95 transition-transform"
              >
                <Plus className="w-4 h-4" strokeWidth={2.4} />
              </button>
            </div>
          </div>
          {boxQty > 1 && (
            <div
              className="mt-3 text-fan-secondary text-sm tabular-nums"
              data-testid="text-gift-total"
            >
              {formatUsdCents(giftCents)} <span className="text-fan-faint">×</span> {boxQty}{" "}
              <span className="text-fan-faint">=</span>{" "}
              <span className="text-fan-primary font-bold">
                {formatUsdCents(giftCents * boxQty)}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {c.give.notes.map((n, i) => (
          <Note key={i} icon={i === 0 ? Gift : Sparkles}>
            {n}
          </Note>
        ))}
      </div>
    </div>
  );
}

function PayStep({
  c,
  bundleQty,
  signedQty,
  boxQty,
  bundleUnitCents,
  signedUnitCents,
  giftCents,
  onPay,
  accentMint,
}: {
  c: ReleaseContent;
  bundleQty: number;
  signedQty: number;
  boxQty: number;
  bundleUnitCents: number;
  signedUnitCents: number;
  giftCents: number;
  onPay: () => void;
  accentMint?: boolean;
}) {
  const lines = [
    { label: c.buy.bundleName, sub: 'Physical + Digital Collector Edition', qty: bundleQty, unit: bundleUnitCents },
    { label: c.buy.signedName, sub: undefined as string | undefined, qty: signedQty, unit: signedUnitCents },
    { label: `${c.give.boxName} (donation)`, sub: undefined, qty: boxQty, unit: giftCents },
  ].filter((l) => l.qty > 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit, 0);

  return (
    <div data-testid="step-pay">
      <h1 className="text-fan-primary text-2xl font-bold tracking-tight mb-1">Almost there</h1>
      <p className="text-fan-secondary text-sm mb-6">
        Sign in to lock in your GoodDeed® number and complete your order.
      </p>

      <div className="rounded-2xl p-5" style={{ background: PANEL }}>
        <div className="text-fan-faint text-xs font-bold uppercase tracking-widest mb-3">
          Your order
        </div>
        <div className="flex flex-col gap-3">
          {lines.map((l) => (
            <div key={l.label} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-fan-primary text-sm">{l.label}</span>
                {l.sub && <div className="text-fan-faint text-xs mt-0.5">{l.sub}</div>}
                {l.qty > 1 && (
                  <div className="text-fan-faint text-xs tabular-nums mt-0.5">
                    {formatUsdCents(l.unit)} × {l.qty}
                  </div>
                )}
              </div>
              <span className="flex-shrink-0 text-fan-primary text-sm font-semibold tabular-nums">
                {formatUsdCents(l.unit * l.qty)}
              </span>
            </div>
          ))}
        </div>
        <div className="h-px bg-white/10 my-4" />
        <div className="flex items-center justify-between">
          <span className="text-fan-secondary text-sm font-semibold">Subtotal</span>
          <span className="text-fan-primary text-lg font-bold tabular-nums" data-testid="text-subtotal">
            {formatUsdCents(subtotal)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-fan-faint text-xs mt-3">
          <Lock className="w-3.5 h-3.5" strokeWidth={2} />
          Shipping &amp; sales tax calculated at checkout.
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => onPay()}
          className={`h-12 rounded-full inline-flex items-center justify-center gap-2 text-base font-semibold active:scale-[0.98] transition-transform ${accentMint ? "" : "text-white"}`}
          style={
            accentMint
              ? { background: "var(--brand-mint)", color: "var(--brand-bg)" }
              : { background: "var(--brand-blue)" }
          }
          data-testid="button-signin-pay"
        >
          Sign in &amp; pay with card
        </button>
        <p className="text-fan-faint text-xs text-center mt-1">
          New here? You'll create your account during checkout.
        </p>
      </div>
    </div>
  );
}

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
  forceBuy,
  accentMint,
  dismissLabel,
}: LockedOfferModalProps) {
  // Lead with the notify flow either pre-launch (sunrise pending) OR when the
  // campaign fan link forces notify-only on an otherwise-live release.
  // Task #1784 — the /staging dry-run forces the Buy CTA past both gates so a
  // reviewer can reach the Stripe card screen on a still-prepping release.
  const leadNotify = !forceBuy && (salesPending || !!notifyOnly);
  // Task #1816 — does this release map to a rich campaign in Hope.tsx?
  const campaign = getCampaignRelease(artist ?? undefined, title);
  const richBuy = !!campaign && !leadNotify;

  // Task #1784 — mint primary treatment for the preview surfaces. Brand vars
  // only (design-system.md): mint fill + deep-navy text, never raw hex.
  const primaryAccentStyle = accentMint
    ? { background: "var(--brand-mint)", color: "var(--brand-bg)" }
    : null;

  const [mode, setMode] = useState<"offer" | "notify" | "done">("offer");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Campaign-flow state (inert unless a campaign matches).
  const [step, setStep] = useState<Step>("overview");
  const [bundleQty, setBundleQty] = useState(1);
  const [signedQty, setSignedQty] = useState(0);
  const [boxQty, setBoxQty] = useState(0);
  const [giftCents, setGiftCents] = useState(() =>
    campaign ? campaign.gift.min * 100 : 7500,
  );
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);

  // Real prices from the buy-options endpoint, so the recap matches checkout.
  const { data: buyOptions } = useQuery<{
    skus?: { priceCents: number }[];
    addons?: { kind: string; priceCents: number }[];
    customAddons?: { id: string; name: string; priceCents: number; orgName?: string }[];
  }>({
    queryKey: ["/api/albums", albumId, "buy-options"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/albums/${albumId}/buy-options`);
      return r.json();
    },
    enabled: open && richBuy && !!albumId,
    staleTime: 60_000,
  });

  // Reset to the first step whenever the modal is (re)opened, and seed the
  // email field from the signed-in fan when we have it.
  useEffect(() => {
    if (open) {
      setMode("offer");
      setStep("overview");
      setBundleQty(1);
      setSignedQty(0);
      setBoxQty(0);
      setZoomSrc(null);
      setEmail(prefilledEmail ?? "");
      setError(null);
      setSubmitting(false);
    }
  }, [open, prefilledEmail]);

  // Signed certs can never exceed the number of copies in the bag.
  useEffect(() => {
    if (signedQty > bundleQty) setSignedQty(bundleQty);
  }, [bundleQty, signedQty]);

  if (!open) return null;

  const priceLabel = priceCents != null ? formatUsdCents(priceCents) : null;

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

  /* ── campaign flow ──────────────────────────────────────────────── */
  if (campaign) {
    const heroSrc = `${campaign.imageBase}/${campaign.images.hero}`;
    const certSrc = `${campaign.imageBase}/${campaign.images.cert}`;
    const boxSrc = `${campaign.imageBase}/${campaign.images.box}`;

    // Real prices, falling back to the editorial registry values.
    const skuMin = (buyOptions?.skus ?? [])
      .map((s) => s.priceCents)
      .filter((n): n is number => typeof n === "number" && n > 0);
    const bundleUnitCents =
      priceCents ??
      (skuMin.length ? Math.min(...skuMin) : campaign.prices.bundle * 100);
    const signedUnitCents =
      buyOptions?.addons?.find((a) => a.kind === "signed_cert")?.priceCents ??
      campaign.prices.signed * 100;
    const giftAddon =
      buyOptions?.customAddons?.find((a) => a.orgName === campaign.org) ??
      buyOptions?.customAddons?.find((a) => /gift/i.test(a.name)) ??
      buyOptions?.customAddons?.[0];
    const giftMinCents = giftAddon?.priceCents ?? campaign.gift.min * 100;
    const giftPresetsCents = Array.from(
      new Set([
        giftMinCents,
        ...campaign.gift.presets.map((p) => p * 100).filter((c) => c >= giftMinCents),
      ]),
    ).sort((a, b) => a - b);
    const effectiveGift = Math.max(giftCents, giftMinCents);

    const idx = ORDER.indexOf(step);
    const go = (s: Step) => setStep(s);

    // Campaign notify-only (/hope): editorial overview → Get Early Access.
    const showNotify = leadNotify;

    const primary = (() => {
      if (showNotify) return null;
      switch (step) {
        case "overview":
          return { label: campaign.buy.heading, onClick: () => go("buy"), Icon: ChevronRight };
        case "buy":
          return { label: `Add ${bundleQty} to Bag`, onClick: () => go("signed"), Icon: ShoppingBag };
        case "signed":
          return { label: "Gift Hope", onClick: () => go("give"), Icon: ChevronRight };
        case "give":
          return { label: "Review order", onClick: () => go("pay"), Icon: ChevronRight };
        case "pay":
          return null;
      }
    })();

    return (
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center px-4"
        role="dialog"
        aria-modal="true"
        aria-label={`${campaign.overview.heading}`}
        data-testid="locked-offer-modal"
      >
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => onClose()}
          className="absolute inset-0 cursor-default"
          style={{ background: "rgba(0,3,18,0.72)" }}
          data-testid="locked-offer-scrim"
        />

        <div
          className="relative w-[min(720px,calc(100vw-32px))] max-h-[calc(100dvh-48px)] rounded-[28px] flex flex-col overflow-hidden"
          style={{
            background: CARD,
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
          }}
          data-testid="offer-modal"
        >
          {/* header: progress + close */}
          <div className="flex items-center gap-3 px-5 sm:px-7 pt-5">
            {!showNotify && (
              <div className="flex items-center gap-1.5">
                {ORDER.map((s, i) => (
                  <span
                    key={s}
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: i === idx ? 22 : 7,
                      background: i <= idx ? "var(--brand-blue)" : "rgba(255,255,255,0.18)",
                    }}
                  />
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 text-fan-faint text-xs font-medium">
              <img
                src={heroSrc}
                alt=""
                className="w-5 h-5 rounded-md object-cover"
                draggable={false}
              />
              {campaign.artistName} · {campaign.releaseName}
            </div>
            <div className="flex-1" />
            <button
              type="button"
              aria-label="Close"
              onClick={() => onClose()}
              data-testid="button-close-offer"
              className="w-11 h-11 -mr-1 rounded-full inline-flex items-center justify-center text-fan-secondary active:scale-95 transition-transform"
            >
              <X className="w-5 h-5" strokeWidth={2.2} />
            </button>
          </div>

          {/* body */}
          <div className="px-5 sm:px-7 py-6 overflow-y-auto">
            {showNotify ? (
              mode === "done" ? (
                <div className="flex flex-col items-center text-center py-4" data-testid="step-notify-done">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                    style={{ background: "rgba(74,255,202,0.16)" }}
                  >
                    <Check className="w-6 h-6" style={{ color: "var(--brand-mint)" }} strokeWidth={2.4} />
                  </div>
                  <h2 className="text-fan-primary text-xl font-bold leading-tight">
                    You're on the list
                  </h2>
                  <p className="text-fan-secondary text-sm mt-2 leading-snug max-w-[360px]">
                    We'll email you the moment{" "}
                    <span className="text-fan-primary font-semibold">{campaign.releaseName}</span>{" "}
                    is available.
                  </p>
                </div>
              ) : mode === "notify" ? (
                <div data-testid="step-notify">
                  <h1 className="text-fan-primary text-2xl font-bold tracking-tight mb-1.5">
                    Get Early Access
                  </h1>
                  <p className="text-fan-secondary text-sm leading-snug mb-5 max-w-[420px]">
                    Drop your email and we'll let you know the second{" "}
                    <span className="text-fan-primary font-semibold">{campaign.releaseName}</span>{" "}
                    goes on sale{salesBeginLabel ? ` (${salesBeginLabel})` : ""}.
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
                    className="w-full h-12 rounded-xl px-4 text-fan-primary text-base outline-none"
                    style={{
                      background: "rgba(255,255,255,0.07)",
                      border: "1px solid rgba(255,255,255,0.14)",
                    }}
                    data-testid="input-notify-email"
                  />
                  {error && (
                    <p
                      className="text-xs mt-2"
                      style={{ color: "var(--brand-pink)" }}
                      data-testid="text-notify-error"
                    >
                      {error}
                    </p>
                  )}
                </div>
              ) : (
                <OverviewStep c={campaign} heroSrc={heroSrc} />
              )
            ) : (
              <>
                {step === "overview" && <OverviewStep c={campaign} heroSrc={heroSrc} />}
                {step === "buy" && (
                  <BundleStep
                    c={campaign}
                    heroSrc={heroSrc}
                    bundleQty={bundleQty}
                    onBundle={setBundleQty}
                    bundleUnitCents={bundleUnitCents}
                    onZoom={setZoomSrc}
                  />
                )}
                {step === "signed" && (
                  <SignedStep
                    c={campaign}
                    certSrc={certSrc}
                    bundleQty={bundleQty}
                    signedQty={signedQty}
                    onSigned={setSignedQty}
                    signedUnitCents={signedUnitCents}
                    onZoom={setZoomSrc}
                  />
                )}
                {step === "give" && (
                  <GiveStep
                    c={campaign}
                    boxSrc={boxSrc}
                    boxQty={boxQty}
                    onBox={setBoxQty}
                    giftCents={effectiveGift}
                    onGift={setGiftCents}
                    giftMinCents={giftMinCents}
                    giftPresetsCents={giftPresetsCents}
                    onZoom={setZoomSrc}
                  />
                )}
                {step === "pay" && (
                  <PayStep
                    c={campaign}
                    bundleQty={bundleQty}
                    signedQty={signedQty}
                    boxQty={boxQty}
                    bundleUnitCents={bundleUnitCents}
                    signedUnitCents={signedUnitCents}
                    giftCents={effectiveGift}
                    onPay={() => {
                      onClose();
                      onBuy({ signedCert: signedQty > 0 });
                    }}
                    accentMint={accentMint}
                  />
                )}
              </>
            )}
          </div>

          {/* footer nav */}
          <div
            className="flex items-center gap-3 px-5 sm:px-7 py-4 border-t border-white/10"
            style={{ background: "rgba(0,0,0,0.18)" }}
          >
            {showNotify ? (
              mode === "done" ? (
                <button
                  type="button"
                  onClick={() => onClose()}
                  data-testid="button-offer-preview"
                  className="h-11 px-2 text-fan-faint text-sm font-medium"
                >
                  {dismissLabel ?? "Preview the Music"}
                </button>
              ) : mode === "notify" ? (
                <button
                  type="button"
                  onClick={() => setMode("offer")}
                  data-testid="button-notify-back"
                  className="h-11 pl-3 pr-5 rounded-full inline-flex items-center gap-1.5 text-fan-secondary text-sm font-semibold"
                >
                  <ChevronLeft className="w-4 h-4" strokeWidth={2.4} />
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onClose()}
                  data-testid="button-offer-preview"
                  className="h-11 px-2 text-fan-faint text-sm font-medium"
                >
                  {dismissLabel ?? "Preview the Music"}
                </button>
              )
            ) : idx > 0 ? (
              <button
                type="button"
                onClick={() => go(ORDER[idx - 1])}
                data-testid="button-back"
                className="h-11 pl-3 pr-5 rounded-full inline-flex items-center gap-1.5 text-fan-secondary text-sm font-semibold"
              >
                <ChevronLeft className="w-4 h-4" strokeWidth={2.4} />
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onClose()}
                data-testid="button-offer-preview"
                className="h-11 px-2 text-fan-faint text-sm font-medium"
              >
                {dismissLabel ?? "Preview the Music"}
              </button>
            )}

            <div className="flex-1" />

            {showNotify && mode !== "done" ? (
              <button
                type="button"
                onClick={() => (mode === "notify" ? submitNotify() : setMode("notify"))}
                disabled={submitting}
                className={`h-11 pl-6 pr-5 rounded-full inline-flex items-center gap-2 font-semibold text-sm active:scale-[0.97] transition-transform disabled:opacity-60 ${accentMint ? "" : "text-white"}`}
                style={primaryAccentStyle ?? { background: "var(--brand-blue)" }}
                data-testid="button-offer-get-notified"
              >
                <Bell className="w-4 h-4" strokeWidth={2.4} />
                {mode === "notify" ? (submitting ? "Saving…" : "Notify me") : "Get Early Access"}
              </button>
            ) : (
              primary && (
                <button
                  type="button"
                  onClick={primary.onClick}
                  data-testid="button-primary"
                  className={`h-11 pl-6 pr-5 rounded-full inline-flex items-center gap-2 font-semibold text-sm active:scale-[0.97] transition-transform ${accentMint ? "" : "text-white"}`}
                  style={primaryAccentStyle ?? { background: "var(--brand-blue)" }}
                >
                  {primary.label}
                  <primary.Icon className="w-4 h-4" strokeWidth={2.4} />
                </button>
              )
            )}
          </div>
        </div>

        {zoomSrc && <Lightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />}
      </div>
    );
  }

  /* ── generic (non-campaign) card — unchanged ────────────────────── */
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
                  className={`mt-6 w-full h-12 rounded-full font-semibold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform ${accentMint ? "" : "text-white"}`}
                  style={
                    primaryAccentStyle ?? {
                      background:
                        "linear-gradient(135deg, var(--brand-purple), var(--brand-blue))",
                    }
                  }
                  data-testid="button-offer-get-notified"
                >
                  <Bell className="w-[18px] h-[18px]" strokeWidth={2.2} />
                  Get Early Access
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onBuy()}
                  className={`mt-6 w-full h-12 rounded-full font-semibold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform ${accentMint ? "" : "text-white"}`}
                  style={
                    primaryAccentStyle ?? {
                      background: "linear-gradient(135deg, #1D5E8F, var(--brand-blue))",
                    }
                  }
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
                {dismissLabel ?? "Preview first"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
