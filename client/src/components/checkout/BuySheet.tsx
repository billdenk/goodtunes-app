// BuySheet — the bottom sheet that handles the entire fan purchase
// path on the album page (Task #44, steps 5–7).
//
// 1) Picks a format (7" / 12" LP / 12" Double / Cassette / CD — only those
//    the artist enabled in admin).
// 2) Picks a quantity (1–10) and toggles the signed-GoodDeed add-on
//    per individual copy (Task #549). Same album, multiple copies, mix
//    of signed / unsigned — the gifting flow can later peel any one
//    copy off into a recipient.
// 3) Gates non-signed-in fans through /login?next=… with the minimal
//    customer signup we built (email + 6-digit code + password, or
//    Continue with Google/Apple).
// 4) Spawns a Stripe Embedded Checkout session through
//    POST /api/checkout/session and mounts it inside this same sheet,
//    so the fan never leaves GoodTunes. Apple Pay / Google Pay
//    buttons are surfaced automatically by Stripe when the device
//    supports them.
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { track } from "@/lib/analytics";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { IconButton } from "@/components/ui/IconButton";
import { SheetClose } from "@/components/ui/SheetChrome";
import { Minus, Plus } from "lucide-react";
import { VinylPreview } from "@/components/VinylPreview";
import {
  DEFAULT_VINYL_COLOR_ID,
  DEFAULT_JACKET_UPGRADE,
  VINYL_COLOR_BY_ID,
  isVinylFormat,
  type JacketUpgrade,
} from "@shared/pressing";
import type { AlbumFormat } from "@shared/schema";

type Sku = {
  id: string;
  format: string;
  label: string;
  priceCents: number;
  stock: number | null;
  soldOut: boolean;
  // Task #201 — pressing snapshot so the "You'll get" preview shows the
  // actual disc color the artist picked. Null on non-vinyl SKUs.
  vinylColor: string | null;
  jacketUpgrade: JacketUpgrade | null;
};
type Addon = {
  id: string;
  kind: string;
  label: string;
  priceCents: number;
  minPriceCents: number;
  // Task #579 — booklet carries its own printed cover (NOT the album
  // jacket). Null on signed_cert and on booklet rows the artist
  // hasn't dropped art on yet.
  artworkUrl?: string | null;
};
type BuyOptions = {
  albumId: string;
  title: string;
  artist: string;
  artwork: string | null;
  currency: string;
  skus: Sku[];
  addons: Addon[];
  // Task #122 — true when the signed_cert add-on has a fixed planned
  // quantity and that many paid certs already exist for this album.
  signedCertSoldOut?: boolean;
  // Task #579 — true when this release has an active 7" vinyl or
  // cassette SKU (server already filters the booklet addon out of
  // the `addons` array when false; the flag lets the UI gate any
  // future booklet-only chrome without re-deriving eligibility).
  bookletEligible?: boolean;
  // Task #793 — flat "7\" + booklet" set price for the either/or variant
  // on the 7" single (e.g. $25). Null when not applicable. The 7" single
  // sells the booklet as a mutually-exclusive variant ("alone" vs "with
  // booklet"), not a stacked add-on; cassette keeps the legacy toggle.
  bookletBundlePriceCents?: number | null;
  // Task #549 — when the signed_cert add-on has a planned quantity, the
  // server can report how many slots remain so we can cap per-copy
  // toggles in a multi-quantity checkout. Undefined = uncapped.
  signedCertRemaining?: number | null;
};

// Task #579 — Booklet anchors to a 7" vinyl or cassette purchase. Kept
// inline (not imported from @shared/schema) so the fan bundle stays
// dependency-light; values mirror BOOKLET_ELIGIBLE_FORMATS exactly.
const BOOKLET_FORMATS_FAN: ReadonlySet<string> = new Set(["7_inch", "cassette"]);

const MAX_COPIES_PER_CHECKOUT = 10;
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

let stripePromise: Promise<Stripe | null> | null = null;
async function getStripePromise() {
  if (stripePromise) return stripePromise;
  stripePromise = (async () => {
    const r = await apiRequest("GET", "/api/checkout/publishable-key");
    const j = await r.json();
    if (!j.publishableKey) throw new Error("Stripe isn't configured yet");
    return loadStripe(j.publishableKey);
  })();
  return stripePromise;
}

export function BuySheet({
  albumId,
  onClose,
  signedCertDefault = false,
}: {
  albumId: string;
  onClose: () => void;
  /** Pre-toggle the signed-cert add-on on the FIRST copy. Set when the
   *  fan opted in via the hover-revealed chip on the album hero before
   *  opening the sheet. */
  signedCertDefault?: boolean;
}) {
  const { user } = useAuth();
  const isCustomerSignedIn = !!user && user.kind === "customer";
  const [, navigate] = useLocation();

  const [options, setOptions] = useState<BuyOptions | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  // Task #549 — Per-copy signed-cert toggles. Length always tracks
  // `quantity`. First copy seeds from `signedCertDefault` so the
  // hero-pill pre-toggle still flows through.
  const [copyCerts, setCopyCerts] = useState<boolean[]>([signedCertDefault]);
  // Task #579 — Booklet add-on toggle. Independent of signedCert; both
  // can be on the same checkout. Forced off when the selected format
  // isn't booklet-eligible (e.g. fan switches from 7" to 12"LP after
  // toggling on), so the displayed total can't drift from what we
  // POST to /api/checkout/session.
  const [booklet, setBooklet] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stripe, setStripe] = useState<Stripe | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiRequest("GET", `/api/albums/${albumId}/buy-options`);
        const j: BuyOptions = await r.json();
        setOptions(j);
        const firstAvailable = j.skus.find((s) => !s.soldOut);
        if (firstAvailable) setFormat(firstAvailable.format);
        track("bundle_viewed", {
          albumId,
          skuCount: j.skus.length,
          hasSignedCert: j.addons.some((a) => a.kind === "signed_cert"),
        });
      } catch (e: any) {
        setError(e?.message ?? "Couldn't load buy options");
      }
    })();
  }, [albumId]);

  useEffect(() => {
    if (!clientSecret) return;
    getStripePromise().then(setStripe).catch((e) => setError(e?.message ?? "Stripe failed to load"));
  }, [clientSecret]);

  const selectedSku = options?.skus.find((s) => s.format === format) ?? null;
  const addon = options?.addons.find((a) => a.kind === "signed_cert") ?? null;
  // Task #579 — booklet add-on. Server already hides it on releases
  // without a booklet-eligible SKU; we additionally gate on the
  // *currently selected* SKU because a release with both a 7" and a
  // 12" SKU can have the booklet listed, but it only ships with the 7".
  const bookletAddon = options?.addons.find((a) => a.kind === "booklet") ?? null;
  const bookletAvailable =
    !!bookletAddon && !!selectedSku && BOOKLET_FORMATS_FAN.has(selectedSku.format);
  // Task #793 — on the 7" single the booklet is an either/or variant
  // ("7\" alone" vs "7\" + booklet") at a flat set price, NOT a stacked
  // add-on. Cassette keeps the legacy toggle (`bundleAvailable` is false
  // there, so the booklet-toggle chrome below still renders for it).
  const bookletBundleCents = options?.bookletBundlePriceCents ?? null;
  const bundleAvailable =
    bookletAvailable &&
    selectedSku?.format === "7_inch" &&
    bookletBundleCents != null;
  const signedCertSoldOut = !!options?.signedCertSoldOut;
  const signedCertRemaining = options?.signedCertRemaining ?? null;

  // Cap quantity by the SKU stock (when metered).
  const maxQuantity = useMemo(() => {
    const stockCap = selectedSku?.stock ?? MAX_COPIES_PER_CHECKOUT;
    return Math.max(1, Math.min(MAX_COPIES_PER_CHECKOUT, stockCap));
  }, [selectedSku]);

  // Sync the per-copy toggle array as quantity changes. Preserve existing
  // picks where we can (extending pads with `false`; shrinking truncates).
  useEffect(() => {
    setCopyCerts((prev) => {
      if (prev.length === quantity) return prev;
      if (prev.length > quantity) return prev.slice(0, quantity);
      return [...prev, ...Array(quantity - prev.length).fill(false)];
    });
  }, [quantity]);

  // If the run got exhausted or the stock cap shrank, clamp.
  useEffect(() => {
    if (quantity > maxQuantity) setQuantity(maxQuantity);
  }, [maxQuantity, quantity]);
  useEffect(() => {
    if (signedCertSoldOut && copyCerts.some(Boolean)) {
      setCopyCerts(copyCerts.map(() => false));
    }
  }, [signedCertSoldOut, copyCerts]);
  // Task #579 — Format pivot may invalidate a booklet selection (fan
  // toggles booklet on a 7", then swaps to 12"LP). Hard-reset so the
  // POST body and displayed total stay in sync.
  useEffect(() => {
    if (booklet && !bookletAvailable) setBooklet(false);
  }, [booklet, bookletAvailable]);

  const certCount = copyCerts.filter(Boolean).length;
  // Task #793 — when the with-booklet 7" variant is chosen the per-copy
  // price IS the flat set bundle price; otherwise it's the SKU price.
  const perCopyFormatCents =
    bundleAvailable && booklet
      ? bookletBundleCents!
      : selectedSku?.priceCents ?? 0;
  const formatLineCents = perCopyFormatCents * quantity;
  const certLineCents = (addon && !signedCertSoldOut ? addon.priceCents : 0) * certCount;
  // Booklet only renders as its own line for the legacy cassette stacked
  // add-on; the 7" variant is folded into the format price above.
  const bookletLineCents =
    booklet && bookletAvailable && !bundleAvailable ? bookletAddon!.priceCents : 0;
  const totalCents = formatLineCents + certLineCents + bookletLineCents;

  // If the run is capped, don't let the fan toggle more copies than
  // remain in inventory. The server validates this too — this is just
  // immediate UX.
  const canToggleMoreCerts = (idx: number): boolean => {
    if (signedCertSoldOut) return false;
    if (copyCerts[idx]) return true; // turning OFF is always allowed
    if (signedCertRemaining == null) return true;
    return certCount < signedCertRemaining;
  };

  const toggleCopyCert = (idx: number) => {
    if (!canToggleMoreCerts(idx)) return;
    setCopyCerts((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  };

  const beginCheckout = async () => {
    if (!selectedSku) return;
    if (!isCustomerSignedIn) {
      const next = `/album/${albumId}?buy=1`;
      navigate(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      track("checkout_started", { albumId, priceCents: totalCents });
      const willSendCert = !!(addon && !signedCertSoldOut);
      const copiesPayload = copyCerts.map((sc) => ({
        skuFormat: selectedSku.format,
        signedCert: willSendCert && sc,
      }));
      const r = await apiRequest("POST", "/api/checkout/session", {
        albumId,
        skuFormat: selectedSku.format,
        copies: copiesPayload,
        signedCertPriceCents: willSendCert && certCount > 0 ? addon!.priceCents : undefined,
        // Task #579 — booklet add-on. Sent only when the toggle is on
        // AND the selected SKU is eligible (defensive: a stale state
        // post-format-swap shouldn't slip through). Server re-validates
        // both conditions before adding it to the Stripe line items.
        booklet: booklet && bookletAvailable,
        bookletPriceCents:
          booklet && bookletAvailable ? bookletAddon!.priceCents : undefined,
      });
      const j = await r.json();
      if (!j.clientSecret) throw new Error(j?.message ?? "Checkout failed to start");
      setClientSecret(j.clientSecret);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't start checkout");
    } finally {
      setBusy(false);
    }
  };

  const inCheckout = !!clientSecret;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70"
      onClick={onClose}
      data-testid="overlay-buy-sheet"
    >
      <div
        className="relative w-full sm:max-w-[440px] max-h-[92vh] overflow-hidden rounded-t-3xl sm:rounded-3xl bg-[#0d1235] text-white shadow-2xl"
        style={{ boxShadow: "0 -20px 60px rgba(0,0,0,0.6)" }}
        onClick={(e) => e.stopPropagation()}
        data-testid="sheet-buy"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="text-[15px] font-semibold">
            {inCheckout ? "Checkout" : "Buy this album"}
          </div>
          <SheetClose onClick={onClose} data-testid="button-close-buy" />
        </div>

        {!inCheckout && (
          <div className="px-5 pb-6 overflow-y-auto max-h-[78vh]">
            {!options && !error && (
              <div className="py-10 text-center text-white/55 text-sm">Loading…</div>
            )}
            {error && (
              <div className="my-3 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-red-300 text-sm" data-testid="text-buy-error">
                {error}
              </div>
            )}
            {options && (
              <>
                <div className="flex items-center gap-3 mb-5">
                  {options.artwork && (
                    <img
                      src={options.artwork}
                      alt=""
                      className="w-14 h-14 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold truncate">{options.title}</div>
                    <div className="text-[13px] text-white/55 truncate">{options.artist}</div>
                  </div>
                </div>

                {selectedSku && isVinylFormat(selectedSku.format as AlbumFormat) && (
                  <div className="mb-5" data-testid="youll-get-vinyl">
                    <div className="text-white/55 text-[11px] font-semibold uppercase tracking-wider mb-2">You'll get</div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <VinylPreview
                        artworkUrl={options.artwork}
                        color={
                          VINYL_COLOR_BY_ID[selectedSku.vinylColor ?? DEFAULT_VINYL_COLOR_ID] ??
                          VINYL_COLOR_BY_ID[DEFAULT_VINYL_COLOR_ID]
                        }
                        jacketUpgrade={selectedSku.jacketUpgrade ?? DEFAULT_JACKET_UPGRADE}
                        size="md"
                      />
                      <div className="mt-3 text-[12px] text-white/60 leading-snug">
                        {(VINYL_COLOR_BY_ID[selectedSku.vinylColor ?? DEFAULT_VINYL_COLOR_ID] ?? VINYL_COLOR_BY_ID[DEFAULT_VINYL_COLOR_ID]).name}
                        {" · "}
                        {selectedSku.label}
                      </div>
                    </div>
                  </div>
                )}

                <div className="text-white/55 text-[11px] font-semibold uppercase tracking-wider mb-2">Format</div>
                {options.skus.length === 0 ? (
                  <div className="text-white/55 text-sm py-6 text-center">
                    Not available for sale yet.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 mb-5">
                    {options.skus.map((s) => {
                      const selected = format === s.format;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={s.soldOut}
                          onClick={() => setFormat(s.format)}
                          className={[
                            "w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-3 border transition-colors text-left",
                            s.soldOut
                              ? "border-white/10 opacity-40 cursor-not-allowed"
                              : selected
                                ? "border-[#319ED8] bg-[#319ED8]/10"
                                : "border-white/10 hover:border-white/30",
                          ].join(" ")}
                          data-testid={`button-format-${s.format}`}
                        >
                          <div className="flex flex-col">
                            <span className="text-[14px] font-medium">{s.label}</span>
                            {s.soldOut && <span className="text-[11px] text-rose-300">Sold out</span>}
                          </div>
                          <span className="text-[14px] font-semibold">{dollars(s.priceCents)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Task #549 — Quantity stepper. Capped at the lesser of
                    MAX_COPIES_PER_CHECKOUT and remaining stock. */}
                {selectedSku && (
                  <div className="mb-5">
                    <div className="text-white/55 text-[11px] font-semibold uppercase tracking-wider mb-2">Quantity</div>
                    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                      <span className="text-[14px] text-white/85">How many copies?</span>
                      <div className="flex items-center gap-3">
                        <IconButton
                          label="Decrease quantity"
                          variant="glass"
                          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                          disabled={quantity <= 1}
                          data-testid="button-qty-dec"
                        >
                          <Minus />
                        </IconButton>
                        <span className="text-[18px] font-semibold w-6 text-center tabular-nums" data-testid="text-quantity">
                          {quantity}
                        </span>
                        <IconButton
                          label="Increase quantity"
                          variant="glass"
                          onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                          disabled={quantity >= maxQuantity}
                          data-testid="button-qty-inc"
                        >
                          <Plus />
                        </IconButton>
                      </div>
                    </div>
                    {quantity >= maxQuantity && maxQuantity < MAX_COPIES_PER_CHECKOUT && (
                      <p className="text-white/40 text-[11px] mt-1.5 ml-1" data-testid="text-qty-cap">
                        That's all we have in stock for this format.
                      </p>
                    )}
                  </div>
                )}

                {/* Task #549 — Per-copy signed-cert toggles. One row per
                    copy so the fan can mix signed + unsigned (e.g. one
                    for yourself + one to gift, only the gift one is
                    signed). When qty = 1 this collapses to the original
                    single-toggle behaviour visually. */}
                {addon && selectedSku && (
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-white/55 text-[11px] font-semibold uppercase tracking-wider">
                        {quantity === 1 ? "Add-on" : "Per-copy add-ons"}
                      </div>
                      {signedCertRemaining != null && !signedCertSoldOut && (
                        <div className="text-white/40 text-[11px]" data-testid="text-signed-cert-remaining">
                          {signedCertRemaining} signed left
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      {copyCerts.map((on, i) => {
                        const disabled = signedCertSoldOut || (!on && !canToggleMoreCerts(i));
                        return (
                          <button
                            key={`copy-${i}`}
                            type="button"
                            onClick={() => toggleCopyCert(i)}
                            disabled={disabled}
                            className={[
                              "w-full flex items-start justify-between gap-3 rounded-2xl px-4 py-3 border transition-colors text-left",
                              disabled
                                ? "border-white/10 opacity-50 cursor-not-allowed"
                                : on
                                  ? "border-[#FF5470] bg-[#FF5470]/10"
                                  : "border-white/10 hover:border-white/30",
                            ].join(" ")}
                            data-testid={`button-toggle-signed-cert-${i}`}
                          >
                            <div className="flex flex-col flex-1 min-w-0 pr-2">
                              <span className="text-[14px] font-medium">
                                {quantity === 1 ? addon.label : `Copy ${i + 1} · ${addon.label}`}
                              </span>
                              <span className="text-[12px] text-white/55 leading-snug mt-0.5">
                                {signedCertSoldOut
                                  ? "All signed copies claimed"
                                  : on
                                    ? "Numbered, printed, and signed by the artist. Mailed with your record."
                                    : "Tap to add a signed certificate for this copy."}
                              </span>
                            </div>
                            <span className="text-[14px] font-semibold whitespace-nowrap">
                              {on ? `+ ${dollars(addon.priceCents)}` : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Task #793 — On the 7" single the booklet is an
                    either/or VARIANT, not a stacked add-on: the fan picks
                    "7\" alone" ($15) or "7\" + booklet" ($25, a flat set
                    price). Mutually exclusive; the chosen variant price
                    drives the format line. Cassette keeps the legacy
                    toggle (rendered in the branch below). */}
                {bookletAddon && bundleAvailable && selectedSku && (
                  <div className="mb-5">
                    <div className="text-white/55 text-[11px] font-semibold uppercase tracking-wider mb-2">
                      Booklet
                    </div>
                    <div className="flex flex-col gap-2">
                      {[false, true].map((withBooklet) => {
                        const selected = booklet === withBooklet;
                        const priceCents = withBooklet
                          ? bookletBundleCents!
                          : selectedSku.priceCents;
                        return (
                          <button
                            key={withBooklet ? "with-booklet" : "alone"}
                            type="button"
                            onClick={() => setBooklet(withBooklet)}
                            className={[
                              "w-full flex items-start justify-between gap-3 rounded-2xl px-4 py-3 border transition-colors text-left",
                              selected
                                ? "border-[color:var(--brand-mint)] bg-[color:var(--brand-mint)]/10"
                                : "border-white/10 hover:border-white/30",
                            ].join(" ")}
                            data-testid={`button-booklet-variant-${withBooklet ? "with" : "alone"}`}
                          >
                            <div className="flex items-start gap-3 flex-1 min-w-0 pr-2">
                              <div
                                className="w-12 h-12 rounded-md border border-white/10 bg-white/[0.04] flex-shrink-0 overflow-hidden flex items-center justify-center"
                                data-testid={`img-booklet-variant-${withBooklet ? "with" : "alone"}`}
                              >
                                {withBooklet && bookletAddon.artworkUrl ? (
                                  <img
                                    src={bookletAddon.artworkUrl}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                ) : withBooklet ? (
                                  <span className="text-xs text-white/40 font-semibold uppercase tracking-wider">
                                    16pp
                                  </span>
                                ) : (
                                  <span className="text-xs text-white/40 font-semibold uppercase tracking-wider">
                                    7&quot;
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className="text-sm font-medium">
                                  {withBooklet
                                    ? `${selectedSku.label} + booklet`
                                    : `${selectedSku.label} alone`}
                                </span>
                                <span className="text-[12px] text-white/55 leading-snug mt-0.5">
                                  {withBooklet
                                    ? "Includes a 7.125″ × 7.125″, 16-page full-colour booklet tucked in with your record."
                                    : "Just the 7\" record."}
                                </span>
                              </div>
                            </div>
                            <span className="text-[14px] font-semibold whitespace-nowrap">
                              {dollars(priceCents)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Task #579 — Cassette booklet stays a stacked add-on
                    (one booklet per order regardless of copy count).
                    Renders a small thumbnail of the artist's uploaded
                    printed cover when present. */}
                {bookletAddon && bookletAvailable && !bundleAvailable && (
                  <button
                    type="button"
                    onClick={() => setBooklet((v) => !v)}
                    className={[
                      "w-full flex items-start justify-between gap-3 rounded-2xl px-4 py-3 border transition-colors text-left mb-5",
                      booklet
                        ? "border-[color:var(--brand-mint)] bg-[color:var(--brand-mint)]/10"
                        : "border-white/10 hover:border-white/30",
                    ].join(" ")}
                    data-testid="button-toggle-booklet"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0 pr-2">
                      <div
                        className="w-12 h-12 rounded-md border border-white/10 bg-white/[0.04] flex-shrink-0 overflow-hidden flex items-center justify-center"
                        data-testid="img-booklet-thumb"
                      >
                        {bookletAddon.artworkUrl ? (
                          <img
                            src={bookletAddon.artworkUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-white/40 font-semibold uppercase tracking-wider">
                            16pp
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm font-medium">{bookletAddon.label}</span>
                        <span className="text-[12px] text-white/55 leading-snug mt-0.5">
                          7.125&quot; × 7.125&quot;, 16 full-colour pages on 100# gloss text.
                          Tucked in with your record.
                        </span>
                      </div>
                    </div>
                    <span className="text-[14px] font-semibold whitespace-nowrap">
                      + {dollars(bookletAddon.priceCents)}
                    </span>
                  </button>
                )}

                {/* Live breakdown — separate lines so the fan can verify
                    the math before tapping checkout. */}
                <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 mb-4 text-[13px]" data-testid="block-breakdown">
                  <div className="flex items-center justify-between">
                    <span className="text-white/65">
                      {selectedSku?.label ?? "Format"}
                      {bundleAvailable && booklet ? " + booklet" : ""} × {quantity}
                    </span>
                    <span className="text-white/85" data-testid="text-line-format">{dollars(formatLineCents)}</span>
                  </div>
                  {addon && certCount > 0 && (
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-white/65">{addon.label} × {certCount}</span>
                      <span className="text-white/85" data-testid="text-line-cert">{dollars(certLineCents)}</span>
                    </div>
                  )}
                  {/* Booklet shows as its own line only for the cassette
                      stacked add-on; the 7" variant is folded above. */}
                  {bookletAddon && booklet && bookletAvailable && !bundleAvailable && (
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-white/65">{bookletAddon.label}</span>
                      <span className="text-white/85" data-testid="text-line-booklet">{dollars(bookletLineCents)}</span>
                    </div>
                  )}
                  <div className="border-t border-white/10 mt-3 pt-3 flex items-center justify-between">
                    <span className="text-white/55">Total</span>
                    <span className="text-[18px] font-bold" data-testid="text-buy-total">
                      {dollars(totalCents)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={beginCheckout}
                  disabled={!selectedSku || busy}
                  className="w-full py-4 rounded-2xl font-semibold text-base text-white disabled:opacity-40 transition-all active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
                  data-testid="button-checkout"
                >
                  {busy
                    ? "Opening checkout…"
                    : !isCustomerSignedIn
                      ? "Sign in to continue"
                      : `Checkout — ${dollars(totalCents)}`}
                </button>
                <p className="mt-3 text-white/40 text-[11px] text-center leading-snug">
                  Shipping & taxes calculated at checkout. Includes instant digital access
                  in the player.
                </p>
              </>
            )}
          </div>
        )}

        {inCheckout && stripe && clientSecret && (
          <div className="px-2 pb-2 overflow-y-auto max-h-[82vh] bg-white text-slate-900" data-testid="embedded-checkout">
            <EmbeddedCheckoutProvider stripe={stripe} options={{ clientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        )}
        {inCheckout && !stripe && (
          <div className="px-5 py-10 text-center text-white/55 text-sm">Loading checkout…</div>
        )}
      </div>
    </div>
  );
}
