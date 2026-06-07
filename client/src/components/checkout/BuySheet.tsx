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
import { formatUsdCents } from "@shared/money";
import { useLocation } from "wouter";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { track } from "@/lib/analytics";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { IconButton } from "@/components/ui/IconButton";
import { SheetClose } from "@/components/ui/SheetChrome";
import { cn } from "@/lib/utils";
import { Check, Gift, Minus, Plus } from "lucide-react";
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
  // Task #844 — operator-built custom ("Gift of Hope") add-ons offered
  // on this album (resolved from the primary artist). Each is a single
  // optional checkbox; one per order, no quantity. Empty when none.
  customAddons?: CustomAddon[];
};

// Task #844 — fan-facing shape of a custom add-on (mirrors the server's
// buy-options payload). Kept inline so the fan bundle stays light.
type CustomAddon = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  orgName: string;
  orgLogoUrl: string | null;
};

// Task #579 — Booklet anchors to a 7" vinyl or cassette purchase. Kept
// inline (not imported from @shared/schema) so the fan bundle stays
// dependency-light; values mirror BOOKLET_ELIGIBLE_FORMATS exactly.
const BOOKLET_FORMATS_FAN: ReadonlySet<string> = new Set(["7_inch", "cassette"]);

const MAX_COPIES_PER_CHECKOUT = 10;
const dollars = (cents: number) => formatUsdCents(cents);

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

// Apple-Music grouped fill: a borderless, soft white-alpha surface that
// houses one or more rows. Rows inside are separated by hairline insets
// (a left-inset top divider on every child after the first) rather than
// each row carrying its own 1px outline. No outer border — the fill alone
// defines the group, the way Apple Music's purchase / now-playing sheets do.
function Group({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl bg-white/[0.05]",
        "[&>*:not(:first-child)]:relative",
        "[&>*:not(:first-child)]:before:pointer-events-none [&>*:not(:first-child)]:before:absolute",
        "[&>*:not(:first-child)]:before:left-4 [&>*:not(:first-child)]:before:right-0 [&>*:not(:first-child)]:before:top-0",
        "[&>*:not(:first-child)]:before:h-px [&>*:not(:first-child)]:before:bg-white/[0.07]",
        className,
      )}
    >
      {children}
    </div>
  );
}

// Task #1630 — small round +/- control for the custom-addon quantity
// stepper. 44px touch target per the brand's touch-target rule.
function IconStep({
  icon,
  onClick,
  disabled,
  testId,
  label,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-testid={testId}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.08] transition-colors",
        disabled ? "text-fan-faint" : "text-fan-primary hover:bg-white/[0.14]",
      )}
    >
      {icon}
    </button>
  );
}

// Destination countries offered in the shipping selector. The eight in
// PRICED_COUNTRIES have their own Spinney rate; every other destination prices
// off the INTL average (the server resolves the band + rate for whatever is
// sent). Bill's call: ship anywhere, so OTHER_COUNTRIES is the full ISO-3166
// alpha-2 set minus the priced eight. The server accepts any code regardless.
const PRICED_COUNTRIES: { code: string; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "JP", name: "Japan" },
  { code: "MX", name: "Mexico" },
  { code: "HN", name: "Honduras" },
];

const ALL_COUNTRIES: { code: string; name: string }[] = [
  { code: "AF", name: "Afghanistan" }, { code: "AL", name: "Albania" }, { code: "DZ", name: "Algeria" },
  { code: "AD", name: "Andorra" }, { code: "AO", name: "Angola" }, { code: "AG", name: "Antigua and Barbuda" },
  { code: "AR", name: "Argentina" }, { code: "AM", name: "Armenia" }, { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" }, { code: "AZ", name: "Azerbaijan" }, { code: "BS", name: "Bahamas" },
  { code: "BH", name: "Bahrain" }, { code: "BD", name: "Bangladesh" }, { code: "BB", name: "Barbados" },
  { code: "BY", name: "Belarus" }, { code: "BE", name: "Belgium" }, { code: "BZ", name: "Belize" },
  { code: "BJ", name: "Benin" }, { code: "BM", name: "Bermuda" }, { code: "BT", name: "Bhutan" },
  { code: "BO", name: "Bolivia" }, { code: "BA", name: "Bosnia and Herzegovina" }, { code: "BW", name: "Botswana" },
  { code: "BR", name: "Brazil" }, { code: "BN", name: "Brunei" }, { code: "BG", name: "Bulgaria" },
  { code: "BF", name: "Burkina Faso" }, { code: "BI", name: "Burundi" }, { code: "KH", name: "Cambodia" },
  { code: "CM", name: "Cameroon" }, { code: "CV", name: "Cape Verde" }, { code: "KY", name: "Cayman Islands" },
  { code: "TD", name: "Chad" }, { code: "CL", name: "Chile" }, { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" }, { code: "CR", name: "Costa Rica" }, { code: "HR", name: "Croatia" },
  { code: "CY", name: "Cyprus" }, { code: "CZ", name: "Czechia" }, { code: "DK", name: "Denmark" },
  { code: "DM", name: "Dominica" }, { code: "DO", name: "Dominican Republic" }, { code: "EC", name: "Ecuador" },
  { code: "EG", name: "Egypt" }, { code: "SV", name: "El Salvador" }, { code: "EE", name: "Estonia" },
  { code: "ET", name: "Ethiopia" }, { code: "FJ", name: "Fiji" }, { code: "FI", name: "Finland" },
  { code: "GA", name: "Gabon" }, { code: "GM", name: "Gambia" }, { code: "GE", name: "Georgia" },
  { code: "GH", name: "Ghana" }, { code: "GI", name: "Gibraltar" }, { code: "GR", name: "Greece" },
  { code: "GL", name: "Greenland" }, { code: "GD", name: "Grenada" }, { code: "GT", name: "Guatemala" },
  { code: "GY", name: "Guyana" }, { code: "HT", name: "Haiti" }, { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" }, { code: "IS", name: "Iceland" }, { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" }, { code: "IQ", name: "Iraq" }, { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" }, { code: "IT", name: "Italy" }, { code: "JM", name: "Jamaica" },
  { code: "JO", name: "Jordan" }, { code: "KZ", name: "Kazakhstan" }, { code: "KE", name: "Kenya" },
  { code: "KW", name: "Kuwait" }, { code: "KG", name: "Kyrgyzstan" }, { code: "LA", name: "Laos" },
  { code: "LV", name: "Latvia" }, { code: "LB", name: "Lebanon" }, { code: "LS", name: "Lesotho" },
  { code: "LR", name: "Liberia" }, { code: "LI", name: "Liechtenstein" }, { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" }, { code: "MO", name: "Macau" }, { code: "MG", name: "Madagascar" },
  { code: "MW", name: "Malawi" }, { code: "MY", name: "Malaysia" }, { code: "MV", name: "Maldives" },
  { code: "ML", name: "Mali" }, { code: "MT", name: "Malta" }, { code: "MR", name: "Mauritania" },
  { code: "MU", name: "Mauritius" }, { code: "MD", name: "Moldova" }, { code: "MC", name: "Monaco" },
  { code: "MN", name: "Mongolia" }, { code: "ME", name: "Montenegro" }, { code: "MA", name: "Morocco" },
  { code: "MZ", name: "Mozambique" }, { code: "NA", name: "Namibia" }, { code: "NP", name: "Nepal" },
  { code: "NL", name: "Netherlands" }, { code: "NZ", name: "New Zealand" }, { code: "NI", name: "Nicaragua" },
  { code: "NE", name: "Niger" }, { code: "NG", name: "Nigeria" }, { code: "MK", name: "North Macedonia" },
  { code: "NO", name: "Norway" }, { code: "OM", name: "Oman" }, { code: "PK", name: "Pakistan" },
  { code: "PA", name: "Panama" }, { code: "PG", name: "Papua New Guinea" }, { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" }, { code: "PH", name: "Philippines" }, { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" }, { code: "QA", name: "Qatar" }, { code: "RO", name: "Romania" },
  { code: "RW", name: "Rwanda" }, { code: "KN", name: "Saint Kitts and Nevis" }, { code: "LC", name: "Saint Lucia" },
  { code: "WS", name: "Samoa" }, { code: "SM", name: "San Marino" }, { code: "SA", name: "Saudi Arabia" },
  { code: "SN", name: "Senegal" }, { code: "RS", name: "Serbia" }, { code: "SC", name: "Seychelles" },
  { code: "SL", name: "Sierra Leone" }, { code: "SG", name: "Singapore" }, { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" }, { code: "SB", name: "Solomon Islands" }, { code: "ZA", name: "South Africa" },
  { code: "KR", name: "South Korea" }, { code: "ES", name: "Spain" }, { code: "LK", name: "Sri Lanka" },
  { code: "SR", name: "Suriname" }, { code: "SE", name: "Sweden" }, { code: "CH", name: "Switzerland" },
  { code: "TW", name: "Taiwan" }, { code: "TJ", name: "Tajikistan" }, { code: "TZ", name: "Tanzania" },
  { code: "TH", name: "Thailand" }, { code: "TG", name: "Togo" }, { code: "TO", name: "Tonga" },
  { code: "TT", name: "Trinidad and Tobago" }, { code: "TN", name: "Tunisia" }, { code: "TR", name: "Turkey" },
  { code: "TM", name: "Turkmenistan" }, { code: "UG", name: "Uganda" }, { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" }, { code: "UY", name: "Uruguay" }, { code: "UZ", name: "Uzbekistan" },
  { code: "VU", name: "Vanuatu" }, { code: "VE", name: "Venezuela" }, { code: "VN", name: "Vietnam" },
  { code: "YE", name: "Yemen" }, { code: "ZM", name: "Zambia" }, { code: "ZW", name: "Zimbabwe" },
];

// Every destination minus the priced eight, alphabetical, for the second group.
const PRICED_CODES = new Set(PRICED_COUNTRIES.map((c) => c.code));
const OTHER_COUNTRIES = ALL_COUNTRIES
  .filter((c) => !PRICED_CODES.has(c.code))
  .sort((a, b) => a.name.localeCompare(b.name));

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
  // Task #844 / #1630 — custom non-profit add-ons (e.g. Nightbirde's
  // "Gift of Hope" donation box) the fan ticked. Each can now be bought
  // in quantity, and carries an anonymous/specific recipient choice the
  // fan makes here. `customAddonQty` maps addon id → count (absent/0 =
  // not selected); `customAddonMode` maps addon id → recipient choice
  // (defaults to "anonymous"). Independent of every other line; the
  // server re-validates eligibility + price on checkout.
  const [customAddonQty, setCustomAddonQty] = useState<Record<string, number>>({});
  const [customAddonMode, setCustomAddonMode] = useState<
    Record<string, "anonymous" | "specific">
  >({});
  const MAX_CUSTOM_ADDON_QTY = 25;
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stripe, setStripe] = useState<Stripe | null>(null);
  // Destination + live shipping quote so the displayed total matches what
  // Stripe will charge (embedded checkout can't surface a country-driven
  // shipping rate on its own — we price it server-side and lock the
  // collected country to this one).
  const [country, setCountry] = useState("US");
  const [shipping, setShipping] = useState<{
    shippable?: boolean;
    available?: boolean;
    chargedCents?: number;
  } | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  // Task #1484 — optional "name on your GoodDeed® certificate" the buyer
  // can set up front, before paying. Only collected on digital-only
  // GoodDeed purchases (no physical signed-cert copy) — those keep the
  // operator-driven confirm flow. Persisted to orders.certConfirmedName
  // at materialization so the digital cert PDF prints it without a
  // second post-checkout step.
  const [certName, setCertName] = useState("");

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
  // Task #1484 — the optional certificate-name field only applies to a
  // digital-only GoodDeed purchase: the album offers a GoodDeed cert
  // AND no copy carries the physical signed-cert add-on (those keep the
  // operator confirm flow). The synthesized default mirrors the server's
  // realName → displayName → username fallback so the buyer sees what
  // will print if they leave it blank.
  const defaultCertName = isCustomerSignedIn
    ? user!.realName || user!.displayName || user!.username
    : "";
  const showCertNameField = !!addon && certCount === 0;
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
  // Task #844 / #1630 — each ticked custom add-on adds its price times the
  // chosen quantity.
  const customAddonsList = options?.customAddons ?? [];
  const selectedCustomAddons = customAddonsList
    .map((c) => ({ addon: c, qty: customAddonQty[c.id] ?? 0 }))
    .filter((x) => x.qty > 0);
  const customAddonsLineCents = selectedCustomAddons.reduce(
    (sum, x) => sum + x.addon.priceCents * x.qty,
    0,
  );
  const itemsTotalCents = formatLineCents + certLineCents + bookletLineCents + customAddonsLineCents;

  // Booklet weight: the 7" set variant ships one booklet per copy; the
  // cassette stacked add-on is a single booklet. Mirror the server so the
  // quoted band matches.
  const bookletCountForShip =
    bundleAvailable && booklet ? quantity : booklet && bookletAvailable && !bundleAvailable ? 1 : 0;

  // Live shipping estimate. Re-quotes whenever the format, destination,
  // quantity, or paper-weight inputs (signed certs / booklet) change.
  useEffect(() => {
    if (!selectedSku) {
      setShipping(null);
      return;
    }
    let cancelled = false;
    setShippingLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({
          format: selectedSku.format,
          country,
          quantity: String(quantity),
          certCount: String(certCount),
          bookletCount: String(bookletCountForShip),
        });
        const r = await apiRequest("GET", `/api/checkout/shipping-quote?${params.toString()}`);
        const j = await r.json();
        if (!cancelled) setShipping(j);
      } catch {
        if (!cancelled) setShipping(null);
      } finally {
        if (!cancelled) setShippingLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSku?.format, country, quantity, certCount, bookletCountForShip]);

  const shippingCents =
    shipping?.shippable && shipping?.available ? shipping.chargedCents ?? 0 : 0;
  const shippingUnavailable = !!shipping?.shippable && shipping?.available === false;
  const totalCents = itemsTotalCents + shippingCents;

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
        // Task #844 / #1630 — ticked custom non-profit add-ons with the
        // chosen quantity + anonymous/specific recipient intent. Server
        // re-validates each is active + targets this album's artist and
        // always uses the stored price.
        customAddons: selectedCustomAddons.map((x) => ({
          id: x.addon.id,
          quantity: x.qty,
          recipientMode: customAddonMode[x.addon.id] ?? "anonymous",
        })),
        // Destination drives the server-side shipping quote that becomes
        // the Stripe shipping_option; allowed_countries is locked to it.
        shippingCountry: country,
        // Task #1484 — optional name for the digital GoodDeed cert. Only
        // honored server-side when no physical signed-cert copy is in the
        // order; trimmed empty → server falls back to the synthesized name.
        certName:
          showCertNameField && certName.trim() ? certName.trim() : undefined,
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
        {/* Apple "Continue with Email" modal shape — the close chip floats
            in the top-LEFT corner and the title sits centered, rather than
            the prior title-left / close-right header bar. Content below is
            unchanged. */}
        <div className="relative flex items-center px-5 pt-5 pb-3">
          <SheetClose onClick={onClose} data-testid="button-close-buy" />
          <div className="absolute left-1/2 -translate-x-1/2 text-base font-semibold">
            {inCheckout ? "Checkout" : "Buy this album"}
          </div>
        </div>

        {!inCheckout && (
          <div className="px-5 pb-6 overflow-y-auto max-h-[78vh]">
            {!options && !error && (
              <div className="py-10 text-center text-white/55 text-sm">Loading…</div>
            )}
            {error && (
              <div className="my-3 rounded-xl bg-red-500/10 px-4 py-3 text-red-300 text-sm" data-testid="text-buy-error">
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
                    <div className="rounded-2xl bg-white/[0.05] p-4">
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
                  <Group className="mb-5">
                    {options.skus.map((s) => {
                      const selected = format === s.format;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={s.soldOut}
                          onClick={() => setFormat(s.format)}
                          className={cn(
                            "w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors",
                            s.soldOut
                              ? "opacity-40 cursor-not-allowed"
                              : selected
                                ? "bg-[color:var(--brand-blue)]/15"
                                : "hover:bg-white/[0.03]",
                          )}
                          data-testid={`button-format-${s.format}`}
                        >
                          <div className="flex flex-col">
                            <span className="text-[14px] font-medium">{s.label}</span>
                            {s.soldOut && <span className="text-[11px] text-rose-300">Sold out</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-semibold">{dollars(s.priceCents)}</span>
                            {selected && (
                              <Check
                                className="w-[18px] h-[18px] text-[color:var(--brand-blue)]"
                                strokeWidth={2.75}
                              />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </Group>
                )}

                {/* Task #549 — Quantity stepper. Capped at the lesser of
                    MAX_COPIES_PER_CHECKOUT and remaining stock. */}
                {selectedSku && (
                  <div className="mb-5">
                    <div className="text-white/55 text-[11px] font-semibold uppercase tracking-wider mb-2">Quantity</div>
                    <div className="flex items-center justify-between rounded-2xl bg-white/[0.05] px-4 py-3">
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
                    <Group>
                      {copyCerts.map((on, i) => {
                        const disabled = signedCertSoldOut || (!on && !canToggleMoreCerts(i));
                        return (
                          <button
                            key={`copy-${i}`}
                            type="button"
                            onClick={() => toggleCopyCert(i)}
                            disabled={disabled}
                            className={cn(
                              "w-full flex items-start justify-between gap-3 px-4 py-3.5 text-left transition-colors",
                              disabled
                                ? "opacity-50 cursor-not-allowed"
                                : on
                                  ? "bg-[color:var(--brand-pink)]/15"
                                  : "hover:bg-white/[0.03]",
                            )}
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
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              {on && (
                                <span className="text-[14px] font-semibold whitespace-nowrap">
                                  + {dollars(addon.priceCents)}
                                </span>
                              )}
                              {on && (
                                <Check
                                  className="w-[18px] h-[18px] text-[color:var(--brand-pink)]"
                                  strokeWidth={2.75}
                                />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </Group>
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
                    <Group>
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
                            className={cn(
                              "w-full flex items-start justify-between gap-3 px-4 py-3.5 text-left transition-colors",
                              selected
                                ? "bg-[color:var(--brand-mint)]/15"
                                : "hover:bg-white/[0.03]",
                            )}
                            data-testid={`button-booklet-variant-${withBooklet ? "with" : "alone"}`}
                          >
                            <div className="flex items-start gap-3 flex-1 min-w-0 pr-2">
                              <div
                                className="w-12 h-12 rounded-md bg-white/[0.06] flex-shrink-0 overflow-hidden flex items-center justify-center"
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
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="text-[14px] font-semibold whitespace-nowrap">
                                {dollars(priceCents)}
                              </span>
                              {selected && (
                                <Check
                                  className="w-[18px] h-[18px] text-[color:var(--brand-mint)]"
                                  strokeWidth={2.75}
                                />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </Group>
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
                    className={cn(
                      "w-full flex items-start justify-between gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors mb-5",
                      booklet
                        ? "bg-[color:var(--brand-mint)]/15"
                        : "bg-white/[0.05] hover:bg-white/[0.07]",
                    )}
                    data-testid="button-toggle-booklet"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0 pr-2">
                      <div
                        className="w-12 h-12 rounded-md bg-white/[0.06] flex-shrink-0 overflow-hidden flex items-center justify-center"
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
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span className="text-[14px] font-semibold whitespace-nowrap">
                        + {dollars(bookletAddon.priceCents)}
                      </span>
                      {booklet && (
                        <Check
                          className="w-[18px] h-[18px] text-[color:var(--brand-mint)]"
                          strokeWidth={2.75}
                        />
                      )}
                    </div>
                  </button>
                )}

                {/* Task #844 / #1630 — Operator-built custom non-profit
                    add-ons (e.g. Nightbirde's "Gift of Hope" donation
                    box). Each can be bought in quantity and carries an
                    anonymous/specific recipient choice. Shows the owning
                    non-profit so the fan knows where the money goes. */}
                {customAddonsList.length > 0 && (
                  <div className="mb-5">
                    <div className="text-white/55 text-[11px] font-semibold uppercase tracking-wider mb-2">
                      Add a little extra
                    </div>
                    <Group>
                      {customAddonsList.map((ca) => {
                        const qty = customAddonQty[ca.id] ?? 0;
                        const selected = qty > 0;
                        const mode = customAddonMode[ca.id] ?? "anonymous";
                        const setQty = (next: number) =>
                          setCustomAddonQty((prev) => {
                            const clamped = Math.max(0, Math.min(MAX_CUSTOM_ADDON_QTY, next));
                            return { ...prev, [ca.id]: clamped };
                          });
                        return (
                          <div key={ca.id}>
                            <button
                              type="button"
                              onClick={() => setQty(selected ? 0 : 1)}
                              className={cn(
                                "w-full flex items-start justify-between gap-3 px-4 py-3.5 text-left transition-colors",
                                selected
                                  ? "bg-[color:var(--brand-mint)]/15"
                                  : "hover:bg-white/[0.03]",
                              )}
                              data-testid={`button-toggle-custom-addon-${ca.id}`}
                            >
                              <div className="flex items-start gap-3 flex-1 min-w-0 pr-2">
                                <div
                                  className="w-12 h-12 rounded-md bg-white/[0.06] flex-shrink-0 overflow-hidden flex items-center justify-center"
                                  data-testid={`img-custom-addon-${ca.id}`}
                                >
                                  {ca.imageUrl ? (
                                    <img src={ca.imageUrl} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <Gift className="w-5 h-5 text-white/40" />
                                  )}
                                </div>
                                <div className="flex flex-col flex-1 min-w-0">
                                  <span className="text-sm font-medium">{ca.name}</span>
                                  <span className="text-[12px] text-white/55 leading-snug mt-0.5">
                                    {ca.description || `Supports ${ca.orgName}.`}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <span className="text-[14px] font-semibold whitespace-nowrap">
                                  + {dollars(ca.priceCents)}
                                </span>
                                {selected && (
                                  <Check
                                    className="w-[18px] h-[18px] text-[color:var(--brand-mint)]"
                                    strokeWidth={2.75}
                                  />
                                )}
                              </div>
                            </button>
                            {selected && (
                              <div className="px-4 pb-4 pt-1 flex flex-col gap-3 border-t border-white/[0.06]">
                                {/* Quantity stepper — total scales by count */}
                                <div className="flex items-center justify-between gap-3 pt-3">
                                  <span className="text-sm text-fan-secondary">How many?</span>
                                  <div className="flex items-center gap-3">
                                    <IconStep
                                      icon={<Minus className="w-4 h-4" strokeWidth={2.5} />}
                                      onClick={() => setQty(qty - 1)}
                                      disabled={qty <= 1}
                                      testId={`button-custom-addon-qty-dec-${ca.id}`}
                                      label="Decrease quantity"
                                    />
                                    <span
                                      className="text-base font-semibold tabular-nums w-6 text-center"
                                      data-testid={`text-custom-addon-qty-${ca.id}`}
                                    >
                                      {qty}
                                    </span>
                                    <IconStep
                                      icon={<Plus className="w-4 h-4" strokeWidth={2.5} />}
                                      onClick={() => setQty(qty + 1)}
                                      disabled={qty >= MAX_CUSTOM_ADDON_QTY}
                                      testId={`button-custom-addon-qty-inc-${ca.id}`}
                                      label="Increase quantity"
                                    />
                                  </div>
                                </div>
                                {/* Anonymous vs. specific recipient choice */}
                                <div className="flex flex-col gap-2">
                                  <span className="text-sm text-fan-secondary">Who is this for?</span>
                                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.04] p-1">
                                    {(
                                      [
                                        ["anonymous", "Anyone in need"],
                                        ["specific", "Someone specific"],
                                      ] as const
                                    ).map(([value, copy]) => (
                                      <button
                                        key={value}
                                        type="button"
                                        onClick={() =>
                                          setCustomAddonMode((prev) => ({ ...prev, [ca.id]: value }))
                                        }
                                        className={cn(
                                          "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                                          mode === value
                                            ? "bg-[color:var(--brand-mint)]/20 text-fan-primary"
                                            : "text-fan-secondary hover:text-fan-primary",
                                        )}
                                        data-testid={`button-custom-addon-recipient-${value}-${ca.id}`}
                                      >
                                        {copy}
                                      </button>
                                    ))}
                                  </div>
                                  <p className="text-xs text-fan-faint leading-snug">
                                    {mode === "specific"
                                      ? "You'll be able to assign the copies and certificates you purchase to specific recipients after checkout."
                                      : "These go to fans the foundation chooses. You can still assign your own purchased copies and certificates to recipients after checkout."}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </Group>
                  </div>
                )}

                {/* Task #1484 — name on the digital GoodDeed® certificate.
                    Only shown for a digital-only GoodDeed purchase (no
                    physical signed-cert copy); persisted to the order at
                    materialization so the cert PDF prints it with no
                    second post-checkout step. Left blank → the server
                    falls back to the buyer's account name. */}
                {showCertNameField && (
                  <div className="mb-4" data-testid="block-cert-name">
                    <label
                      htmlFor="buy-cert-name"
                      className="block text-fan-secondary text-sm mb-1.5"
                    >
                      Name on your GoodDeed® certificate{" "}
                      <span className="text-fan-faint">(optional)</span>
                    </label>
                    <input
                      id="buy-cert-name"
                      type="text"
                      value={certName}
                      maxLength={80}
                      onChange={(e) => setCertName(e.target.value)}
                      placeholder={defaultCertName || "e.g. Jane Doe"}
                      className="w-full rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-3 text-base text-white placeholder:text-white/35 focus:outline-none focus:border-white/25"
                      data-testid="input-cert-name"
                    />
                    <p className="text-fan-faint text-xs mt-1.5 ml-1 leading-snug">
                      {defaultCertName
                        ? `Leave blank to use “${defaultCertName}.” You can change it later, too.`
                        : "This prints on your digital certificate. You can change it later, too."}
                    </p>
                  </div>
                )}

                {/* Ship-to country — drives the live shipping quote below.
                    Embedded checkout can't pick a country-based rate on its
                    own, so we collect it here and lock it server-side. */}
                <div className="mb-4">
                  <label
                    htmlFor="buy-ship-country"
                    className="block text-fan-secondary text-sm mb-1.5"
                  >
                    Ship to
                  </label>
                  <select
                    id="buy-ship-country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-3 text-base text-white appearance-none focus:outline-none focus:border-white/25"
                    data-testid="select-ship-country"
                  >
                    <optgroup label="Common destinations" className="bg-[#0d1235]">
                      {PRICED_COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code} className="bg-[#0d1235]">
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="All other countries" className="bg-[#0d1235]">
                      {OTHER_COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code} className="bg-[#0d1235]">
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* Live breakdown — separate lines so the fan can verify
                    the math before tapping checkout. */}
                <div className="rounded-2xl bg-white/[0.05] p-4 mb-4 text-[13px]" data-testid="block-breakdown">
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
                  {/* Task #844 — one line per ticked custom add-on. */}
                  {selectedCustomAddons.map((ca) => (
                    <div key={ca.id} className="flex items-center justify-between mt-1.5">
                      <span className="text-white/65">{ca.name}</span>
                      <span className="text-white/85" data-testid={`text-line-custom-addon-${ca.id}`}>
                        {dollars(ca.priceCents)}
                      </span>
                    </div>
                  ))}
                  {/* Real shipping — quoted live for the chosen destination
                      (Spinney rate + GoodTunes markup). The fan pays exactly
                      this; the server re-prices it as the Stripe shipping
                      option. */}
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-fan-secondary">Shipping</span>
                    <span className="text-fan-primary" data-testid="text-line-shipping">
                      {shippingLoading
                        ? "…"
                        : shippingUnavailable
                          ? "—"
                          : dollars(shippingCents)}
                    </span>
                  </div>
                  {shippingUnavailable && (
                    <p
                      className="text-xs mt-1.5"
                      style={{ color: "var(--brand-heart)" }}
                      data-testid="text-shipping-unavailable"
                    >
                      We can't quote shipping to this destination yet — try another country.
                    </p>
                  )}
                  <div className="border-t border-white/[0.08] mt-3 pt-3 flex items-center justify-between">
                    <span className="text-white/55">Total</span>
                    <span className="text-[18px] font-bold" data-testid="text-buy-total">
                      {dollars(totalCents)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={beginCheckout}
                  disabled={!selectedSku || busy || shippingUnavailable}
                  className="w-full py-4 rounded-2xl font-semibold text-base text-white disabled:opacity-40 transition-all active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
                  data-testid="button-checkout"
                >
                  {busy
                    ? "Opening checkout…"
                    : !isCustomerSignedIn
                      ? "Sign in to continue"
                      : shippingUnavailable
                        ? "Choose a shippable destination"
                        : `Checkout — ${dollars(totalCents)}`}
                </button>
                <p className="mt-3 text-white/40 text-[11px] text-center leading-snug">
                  Shipping shown above; sales tax is calculated from your address
                  on the next step. Includes instant digital access in the player.
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
