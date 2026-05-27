// BuySheet — the bottom sheet that handles the entire fan purchase
// path on the album page (Task #44, steps 5–7).
//
// 1) Picks a format (7" / 12" LP / 12" Double / Cassette / CD — only those
//    the artist enabled in admin).
// 2) Optionally toggles on the printed-and-signed GoodDeed certificate
//    add-on at the artist's chosen price (subject to the per-album
//    minimum floor).
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
import { X } from "lucide-react";
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
type Addon = { id: string; kind: string; label: string; priceCents: number; minPriceCents: number };
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
};

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
  /** Pre-toggle the signed-cert add-on. Set when the fan opted in via
   *  the hover-revealed chip on the album hero before opening the sheet. */
  signedCertDefault?: boolean;
}) {
  const { user } = useAuth();
  const isCustomerSignedIn = !!user && user.kind === "customer";
  const [, navigate] = useLocation();

  const [options, setOptions] = useState<BuyOptions | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [signedCert, setSignedCert] = useState(signedCertDefault);
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
        // Fan is now looking at the full bundle (format SKUs × signed-cert
        // add-on). Distinct from `album_viewed` (just landing on the page).
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
  const signedCertSoldOut = !!options?.signedCertSoldOut;
  // If the run got exhausted between page-load and toggle (or by another
  // tab), defensively flip the local toggle off so the displayed total
  // matches what we'll actually charge.
  useEffect(() => {
    if (signedCertSoldOut && signedCert) setSignedCert(false);
  }, [signedCertSoldOut, signedCert]);
  const totalCents = (selectedSku?.priceCents ?? 0) + (signedCert && addon && !signedCertSoldOut ? addon.priceCents : 0);

  const beginCheckout = async () => {
    if (!selectedSku) return;
    // Non-signed-in fans → route through /login first. The login page
    // honors ?next= and bounces back into the album when done.
    if (!isCustomerSignedIn) {
      const next = `/album/${albumId}?buy=1`;
      navigate(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      track("checkout_started", { albumId, priceCents: totalCents });
      // Defensive: if the album doesn't actually offer a signed-cert
      // add-on (or the run sold out), never forward `signedCert=true`
      // to the server — it would 400 "Signed certificate isn't
      // offered on this album". Belt-and-suspenders against a stale
      // `signedCertDefault` carried in from the album page chip.
      const willSendSignedCert = !!(signedCert && addon && !signedCertSoldOut);
      const r = await apiRequest("POST", "/api/checkout/session", {
        albumId,
        skuFormat: selectedSku.format,
        signedCert: willSendSignedCert,
        signedCertPriceCents: willSendSignedCert ? addon!.priceCents : undefined,
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

  // The embedded checkout takes over the whole sheet once a session
  // exists; up until then we render the format/add-on picker.
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
          <IconButton label="Close" onClick={onClose} variant="glass" data-testid="button-close-buy">
            <X />
          </IconButton>
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

                {/* Task #201 — "You'll get" preview. When the fan has
                    a vinyl format selected, render the same
                    <VinylPreview> the artist sees in admin so the disc
                    they tap is the disc that arrives. Falls back to
                    Black when an older SKU never had a color picked. */}
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

                {addon && (
                  <button
                    type="button"
                    onClick={() => !signedCertSoldOut && setSignedCert((v) => !v)}
                    disabled={signedCertSoldOut}
                    className={[
                      "w-full flex items-start justify-between gap-3 rounded-2xl px-4 py-3 border transition-colors text-left mb-5",
                      signedCertSoldOut
                        ? "border-white/10 opacity-50 cursor-not-allowed"
                        : signedCert
                          ? "border-[#FF5470] bg-[#FF5470]/10"
                          : "border-white/10 hover:border-white/30",
                    ].join(" ")}
                    data-testid="button-toggle-signed-cert"
                  >
                    <div className="flex flex-col flex-1 min-w-0 pr-2">
                      <span className="text-[14px] font-medium">{addon.label}</span>
                      <span className="text-[12px] text-white/55 leading-snug mt-0.5">
                        {signedCertSoldOut
                          ? "All signed copies claimed"
                          : "Numbered, printed, and signed by the artist. Mailed with your record."}
                      </span>
                    </div>
                    <span className="text-[14px] font-semibold whitespace-nowrap">
                      {signedCertSoldOut ? "Sold out" : `+ ${dollars(addon.priceCents)}`}
                    </span>
                  </button>
                )}

                <div className="flex items-center justify-between mb-4">
                  <span className="text-white/55 text-[13px]">Total</span>
                  <span className="text-[18px] font-bold" data-testid="text-buy-total">
                    {dollars(totalCents)}
                  </span>
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
