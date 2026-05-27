// Orders — the fan-facing list of every album bundle they've bought
// (Task #44, step 11). Reads /api/orders, joins items+album server-side.
//
// Task #74 — adds the fulfillment-tracking surface: every physical order
// row carries a status pill driven by `fulfillmentStatus` (populated by
// the Order Desk webhook in #73), an inline carrier + tracking link,
// and a "View details" sheet that expands to show the full timeline
// (paid → submitted → in fulfillment → shipped → delivered), line items,
// shipping address, and gift-recipient info.
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { track } from "@/lib/analytics";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Check, Truck, Package, MapPin, ExternalLink, Award, Clock, Lock, Printer } from "lucide-react";
import type { StripeAddressSnapshot, AlbumFormat } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import { VinylPreview } from "@/components/VinylPreview";
import {
  DEFAULT_JACKET_UPGRADE,
  DEFAULT_VINYL_COLOR_ID,
  VINYL_COLOR_BY_ID,
  isVinylFormat,
  type JacketUpgrade,
} from "@shared/pressing";

// Task #46 — gift block on each row exposes the buyer's self-serve
// gifting controls (copy share link, resend, change recipient within
// 24h). Without these, a buyer who closes the post-checkout Welcome tab
// loses their only way to manage a gift they sent.
type GiftInfo = {
  id: string;
  buyerUserId: string;
  recipientFirstName: string;
  recipientLastName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  claimToken: string | null;
  claimed: boolean;
  claimedAt: string | null;
  expiresAt: string;
  createdAt: string;
  resendCount: number;
  isBuyer: boolean;
};

type CertInfo = {
  id: string;
  shortId: string;
  nameStatus: "awaiting" | "confirmed" | "locked_for_print" | "printed";
  confirmedIdentityKind: "display" | "username" | "real" | null;
  confirmedName: string | null;
  paperSize: "letter" | "a4";
};

type OrderRow = {
  id: string;
  albumId: string;
  albumTitle: string;
  albumArtist: string;
  albumArtwork: string | null;
  status: string;
  totalCents: number;
  goodDeedNumber: number | null;
  cert?: CertInfo | null;
  shippedAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  // Task #49 — order origin. "direct" = bought on goodtunes.music,
  // "shopify:<storeId>" = arrived via a label's Shopify webhook.
  origin?: string;
  // Task #73 / #74 — fulfillment lifecycle from the Order Desk webhook.
  // Null on digital-only orders (no physical leg).
  skuKind?: string | null;
  fulfillmentStatus?: string | null;
  submittedToFulfillmentAt?: string | null;
  inFulfillmentAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  returnedAt?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  shippingAddress?: StripeAddressSnapshot | null;
  items: {
    id: string;
    kind: string;
    sku: string;
    label: string;
    unitPriceCents: number;
    quantity: number;
    // Task #201 — pressing snapshot per item; null on non-vinyl rows.
    vinylColor?: string | null;
    jacketUpgrade?: JacketUpgrade | null;
  }[];
  gift: GiftInfo | null;
};

const PHYSICAL_KINDS = new Set(["vinyl", "cassette", "cd", "bundle"]);
function isPhysical(o: OrderRow): boolean {
  return !!o.skuKind && PHYSICAL_KINDS.has(o.skuKind);
}

// Origin label rendered next to the status pill. Direct orders stay
// unbadged (it's the default); Shopify-sourced orders surface a small
// "Shopify" tag so a fan can tell where they came from at a glance.
function OriginBadge({ origin }: { origin: string | undefined }) {
  if (!origin || origin === "direct") return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-[#95BF47]/15 text-[#95BF47] text-[10.5px] font-semibold uppercase tracking-wider px-2 py-0.5"
      data-testid="badge-origin-shopify"
      title="Bundled with a label's Shopify order"
    >
      Shopify
    </span>
  );
}

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-[#4AFFCA]/15 text-[#4AFFCA]" },
  shipped: { label: "Shipped", cls: "bg-[#319ED8]/15 text-[#319ED8]" },
  refunded: { label: "Refunded", cls: "bg-rose-500/15 text-rose-300" },
  pending: { label: "Pending", cls: "bg-white/10 text-white/55" },
};

// Customer-facing pill for the fulfillment lifecycle. The Stripe-side
// `status` ("paid", "refunded") stays primary on the row — this is the
// physical-leg secondary pill so the fan can see at a glance where their
// vinyl actually is. Mirrors AdminOrders' palette but on the dark shell.
const FULFILLMENT_PILL: Record<string, { label: string; cls: string }> = {
  pending: { label: "Awaiting fulfillment", cls: "bg-white/10 text-white/65" },
  submitted: { label: "Submitted", cls: "bg-violet-500/20 text-violet-300" },
  in_fulfillment: { label: "In fulfillment", cls: "bg-indigo-500/20 text-indigo-200" },
  shipped: { label: "Shipped", cls: "bg-[#319ED8]/15 text-[#319ED8]" },
  delivered: { label: "Delivered", cls: "bg-[#4AFFCA]/15 text-[#4AFFCA]" },
  cancelled: { label: "Cancelled", cls: "bg-rose-500/15 text-rose-300" },
  returned: { label: "Returned", cls: "bg-rose-500/15 text-rose-300" },
};

const RECIPIENT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Task #130 — friendly status surface for the signed-cert lifecycle. The
// fan confirms the name (awaiting → confirmed), the admin batches it
// into a print run (locked_for_print), then ships (printed). Mirrors the
// fulfillment pill palette so the two strips read as a pair.
const CERT_STATUS_PILL: Record<
  CertInfo["nameStatus"],
  { label: string; cls: string; Icon: typeof Clock }
> = {
  awaiting: { label: "Awaiting your name", cls: "bg-white/10 text-white/70", Icon: Clock },
  confirmed: { label: "Queued for next print run", cls: "bg-violet-500/20 text-violet-200", Icon: Clock },
  locked_for_print: { label: "Locked for printing", cls: "bg-indigo-500/20 text-indigo-200", Icon: Lock },
  printed: { label: "Printed & on its way", cls: "bg-[#4AFFCA]/15 text-[#4AFFCA]", Icon: Printer },
};

export function Orders() {
  const { data: orders, isLoading } = useQuery<OrderRow[]>({ queryKey: ["/api/orders"] });
  const { toast } = useToast();
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const resendGift = useMutation({
    mutationFn: async (orderId: string) => {
      const r = await apiRequest("POST", `/api/orders/${orderId}/gift/resend`, {});
      return (await r.json()) as { shareUrl: string };
    },
    onSuccess: async (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      try {
        await navigator.clipboard.writeText(res.shareUrl);
        toast({ title: "Gift link refreshed", description: "Copied to clipboard — send it to your recipient." });
      } catch {
        toast({ title: "Gift link refreshed", description: res.shareUrl });
      }
    },
    onError: (e: any) => toast({ title: "Couldn't refresh link", description: e?.message, variant: "destructive" }),
  });

  const patchGift = useMutation({
    mutationFn: async (args: { orderId: string; body: { firstName: string; lastName: string; email: string | null; phone: string | null } }) => {
      const r = await apiRequest("PATCH", `/api/orders/${args.orderId}/gift`, args.body);
      return (await r.json()) as { shareUrl: string };
    },
    onSuccess: async (res, vars) => {
      // First buyer-initiated recipient set/change on this order — this is
      // the moment a paid order actually becomes a gift to a real person.
      track("gift_initiated", { orderId: vars.orderId });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      try {
        await navigator.clipboard.writeText(res.shareUrl);
        toast({ title: "Recipient updated · new link copied" });
      } catch {
        toast({ title: "Recipient updated", description: res.shareUrl });
      }
    },
    onError: (e: any) => toast({ title: "Couldn't update", description: e?.message, variant: "destructive" }),
  });

  async function copyLink(g: GiftInfo) {
    if (!g.claimToken) return;
    const url = `${window.location.origin}/gift/${g.claimToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Gift link copied" });
    } catch {
      toast({ title: "Gift link", description: url });
    }
  }

  function promptChangeRecipient(o: OrderRow) {
    if (!o.gift) return;
    const firstName = window.prompt("Recipient first name", o.gift.recipientFirstName)?.trim();
    if (!firstName) return;
    const lastName = window.prompt("Recipient last name", o.gift.recipientLastName)?.trim();
    if (!lastName) return;
    const email = window.prompt("Recipient email (blank to skip)", o.gift.recipientEmail ?? "")?.trim() || null;
    const phone = email ? null : window.prompt("Recipient phone (required if no email)", o.gift.recipientPhone ?? "")?.trim() || null;
    patchGift.mutate({ orderId: o.id, body: { firstName, lastName, email, phone } });
  }

  const openOrder = openOrderId ? orders?.find((o) => o.id === openOrderId) ?? null : null;

  return (
    <main className="min-h-screen bg-[#00062B] text-white pb-24" data-testid="page-orders">
      <div className="max-w-[440px] mx-auto px-5 pt-8">
        <h1 className="text-[28px] font-bold mb-1">Your orders</h1>
        <p className="text-white/55 text-[13px] mb-6">Records, certificates, and digital access you own.</p>

        {isLoading && <div className="text-white/55 text-sm" data-testid="orders-loading">Loading…</div>}
        {!isLoading && orders && orders.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center" data-testid="orders-empty">
            <div className="text-white/85 font-medium">No orders yet</div>
            <div className="text-white/55 text-[13px] mt-1 mb-4">
              When you buy a record, it shows up here — with its tracking number once it ships.
            </div>
            <Link
              href="/"
              className="inline-flex items-center px-4 py-2 rounded-full bg-[#319ED8] text-white text-[13px] font-semibold active:opacity-80"
              data-testid="button-browse-music"
            >
              Browse music
            </Link>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {orders?.map((o) => {
            const st = STATUS_LABEL[o.status] ?? STATUS_LABEL.pending;
            const g = o.gift;
            const gExpired = g ? new Date(g.expiresAt).getTime() < Date.now() : false;
            const gEditable = g ? Date.now() - new Date(g.createdAt).getTime() < RECIPIENT_EDIT_WINDOW_MS : false;
            const giftPill: { label: string; cls: string } | null = !g
              ? null
              : g.claimed
              ? { label: "Gift · Claimed", cls: "bg-violet-500/20 text-violet-300" }
              : gExpired
              ? { label: "Gift · Expired", cls: "bg-rose-500/15 text-rose-300" }
              : g.resendCount > 0
              ? { label: `Gift · Resent ×${g.resendCount}`, cls: "bg-amber-400/15 text-amber-200" }
              : { label: "Gift · Sent", cls: "bg-fuchsia-500/20 text-fuchsia-300" };
            const physical = isPhysical(o);
            const fStatus = (o.fulfillmentStatus ?? (physical ? "pending" : null)) as string | null;
            const fPill = fStatus ? FULFILLMENT_PILL[fStatus] ?? FULFILLMENT_PILL.pending : null;
            return (
              <div
                key={o.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
                data-testid={`row-order-${o.id}`}
              >
                <Link href={`/album/${o.albumId}`} className="block active:scale-[0.99] transition-transform">
                  <div className="flex gap-3">
                    {(() => {
                      // Task #201 — if this order has a vinyl line item,
                      // swap the plain artwork thumb for <VinylPreview>
                      // so the row shows the actual disc that's coming.
                      const vinylItem = o.items.find(
                        (it) => it.kind === "format" && isVinylFormat(it.sku as AlbumFormat),
                      );
                      if (vinylItem) {
                        const color =
                          VINYL_COLOR_BY_ID[vinylItem.vinylColor ?? DEFAULT_VINYL_COLOR_ID] ??
                          VINYL_COLOR_BY_ID[DEFAULT_VINYL_COLOR_ID];
                        return (
                          <div className="flex-shrink-0" data-testid={`order-vinyl-preview-${o.id}`}>
                            <VinylPreview
                              artworkUrl={o.albumArtwork}
                              color={color}
                              jacketUpgrade={vinylItem.jacketUpgrade ?? DEFAULT_JACKET_UPGRADE}
                              size="sm"
                            />
                          </div>
                        );
                      }
                      return o.albumArtwork ? (
                        <img src={o.albumArtwork} alt="" className="w-16 h-16 rounded-lg object-cover" />
                      ) : null;
                    })()}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${st.cls}`}>
                          {st.label}
                        </span>
                        {fPill && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${fPill.cls}`}
                            data-testid={`pill-fulfillment-${o.id}`}
                          >
                            {fPill.label}
                          </span>
                        )}
                        <OriginBadge origin={o.origin} />
                        {giftPill && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${giftPill.cls}`} data-testid={`pill-gift-${o.id}`}>
                            {giftPill.label}
                          </span>
                        )}
                        {o.goodDeedNumber !== null && (
                          <span className="text-[11px] text-white/40">#{o.goodDeedNumber}</span>
                        )}
                      </div>
                      <div className="text-[15px] font-semibold truncate mt-1">{o.albumTitle}</div>
                      <div className="text-[13px] text-white/55 truncate">{o.albumArtist}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[14px] font-semibold">{dollars(o.totalCents)}</div>
                      <div className="text-[11px] text-white/40 mt-1">
                        {new Date(o.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {o.items.map((it) => (
                      <span key={it.id} className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-white/70">
                        {it.label}
                      </span>
                    ))}
                  </div>
                </Link>

                {/* Inline tracking strip — surfaces the carrier + tap-to-track
                    link without needing to open the detail sheet. Only shows
                    once the carrier has actually picked up. */}
                {physical && o.trackingNumber && (
                  <div
                    className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 text-[12px] text-white/75"
                    data-testid={`tracking-strip-${o.id}`}
                  >
                    <Truck className="w-4 h-4 text-[#319ED8]" />
                    <span className="text-white/55">{o.carrier ?? "Carrier"}:</span>
                    {o.trackingUrl ? (
                      <a
                        href={o.trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#319ED8] font-medium inline-flex items-center gap-1 active:opacity-70"
                        data-testid={`link-tracking-${o.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {o.trackingNumber}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-white font-medium" data-testid={`text-tracking-${o.id}`}>{o.trackingNumber}</span>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setOpenOrderId(o.id)}
                  className="mt-3 w-full text-left text-[12.5px] text-white/65 hover:text-white active:opacity-70 inline-flex items-center justify-between"
                  data-testid={`button-order-details-${o.id}`}
                >
                  <span>View order details</span>
                  <span aria-hidden className="text-white/35">›</span>
                </button>

                {o.cert && (
                  <CertConfirmationCard order={o} cert={o.cert} />
                )}

                {g && g.isBuyer && (
                  <div className="mt-3 pt-3 border-t border-white/10" data-testid={`gift-controls-${o.id}`}>
                    <div className="text-[12px] text-white/65 leading-snug">
                      Gift to{" "}
                      <span className="text-white font-medium">
                        {g.recipientFirstName} {g.recipientLastName}
                      </span>
                      {g.recipientEmail && <> · <span className="text-white/55">{g.recipientEmail}</span></>}
                      {g.recipientPhone && <> · <span className="text-white/55">{g.recipientPhone}</span></>}
                    </div>
                    {!g.claimed && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {g.claimToken && !gExpired && (
                          <button
                            type="button"
                            onClick={() => copyLink(g)}
                            className="px-3 py-1 rounded-full text-[11.5px] font-medium bg-white/10 text-white hover:bg-white/15"
                            data-testid={`button-copy-link-${o.id}`}
                          >
                            Copy link
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => resendGift.mutate(o.id)}
                          disabled={resendGift.isPending}
                          className="px-3 py-1 rounded-full text-[11.5px] font-medium bg-[#FF5470]/20 text-[#FF5470] hover:bg-[#FF5470]/30 disabled:opacity-50"
                          data-testid={`button-resend-gift-${o.id}`}
                        >
                          {gExpired ? "Recover expired link" : "Resend link"}
                        </button>
                        {gEditable && (
                          <button
                            type="button"
                            onClick={() => promptChangeRecipient(o)}
                            disabled={patchGift.isPending}
                            className="px-3 py-1 rounded-full text-[11.5px] font-medium bg-[#7F10A7]/30 text-[#c89dff] hover:bg-[#7F10A7]/40 disabled:opacity-50"
                            data-testid={`button-change-recipient-${o.id}`}
                          >
                            Change recipient
                          </button>
                        )}
                      </div>
                    )}
                    {g.claimed && g.claimedAt && (
                      <div className="mt-1.5 text-[11.5px] text-[#4AFFCA]">
                        Claimed {new Date(g.claimedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <OrderDetailSheet order={openOrder} onClose={() => setOpenOrderId(null)} />
    </main>
  );
}

// ─────────────────────── Cert confirmation card ───────────────────────
// Task #128 — renders inside each order row that has a signed_cert
// add-on. Walks the fan through picking the name they want on the
// printed certificate (display / @username / real) using the same
// identity-picker logic as the digital share sheet, then flips the row
// to `confirmed` so the admin print queue can batch it.
function CertConfirmationCard({ order, cert }: { order: OrderRow; cert: CertInfo }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showPicker, setShowPicker] = useState(false);
  const [showRealNameInput, setShowRealNameInput] = useState(false);
  const [realNameDraft, setRealNameDraft] = useState("");
  const updateProfile = useMutation({
    mutationFn: async (body: { realName: string }) => {
      const r = await apiRequest("PATCH", "/api/me", body);
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/me"] }),
  });
  const confirm = useMutation({
    mutationFn: async (identityKind: "display" | "username" | "real") => {
      const r = await apiRequest("POST", `/api/orders/${order.id}/cert/confirm`, { identityKind });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Name confirmed", description: "Your certificate is queued for printing." });
      setShowPicker(false);
    },
    onError: (e: any) => toast({ title: "Couldn't confirm", description: e?.message, variant: "destructive" }),
  });

  const locked = cert.nameStatus === "locked_for_print" || cert.nameStatus === "printed";
  const confirmed = cert.nameStatus === "confirmed" || locked;
  const statusPill = CERT_STATUS_PILL[cert.nameStatus];

  async function pickIdentity(kind: "display" | "username" | "real") {
    if (kind === "real" && !user?.realName) {
      setShowRealNameInput(true);
      return;
    }
    confirm.mutate(kind);
  }

  async function saveRealName() {
    const v = realNameDraft.trim();
    if (!v) return;
    await updateProfile.mutateAsync({ realName: v });
    confirm.mutate("real");
  }

  return (
    <div
      className="mt-3 pt-3 border-t border-white/10"
      data-testid={`cert-card-${order.id}`}
    >
      <div className="flex items-start gap-3">
        <Award className="w-5 h-5 text-[#4AFFCA] mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[13px] font-semibold text-white">
              Printed GoodDeed certificate
            </div>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${statusPill.cls}`}
              data-testid={`cert-status-${order.id}`}
            >
              <statusPill.Icon className="w-3 h-3" />
              {statusPill.label}
            </span>
          </div>
          {confirmed ? (
            <>
              <div className="text-[12px] text-white/65 mt-1">
                Name to print:{" "}
                <span className="text-white font-medium" data-testid={`cert-name-${order.id}`}>
                  {cert.confirmedName}
                </span>
              </div>
              <div className="text-[11px] text-white/45 mt-0.5">
                {cert.nameStatus === "printed"
                  ? "Your certificate has been printed and shipped."
                  : cert.nameStatus === "locked_for_print"
                  ? "Locked for the next print run — name can no longer be changed."
                  : `Paper: ${cert.paperSize === "a4" ? "A4" : "US Letter"} · You can change the name until it's locked for printing.`}
              </div>
              {/* Task #435 — Download the PDF (works for every cert state
                  so legacy-import certs imported as `printed` AND
                  new-sale certs queued as `confirmed` both get the
                  action) and link out to the public provenance page once
                  the cert is finalised. */}
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <a
                  href={`/api/orders/${order.id}/cert/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold active:opacity-70"
                  style={{ color: "var(--brand-mint)" }}
                  data-testid={`link-cert-download-${order.id}`}
                >
                  Download GoodDeed
                  <ExternalLink className="w-3 h-3" />
                </a>
                {cert.nameStatus === "printed" && (
                  <Link
                    href={`/g/${cert.shortId}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold active:opacity-70"
                    style={{ color: "var(--brand-blue)" }}
                    data-testid={`link-cert-view-${order.id}`}
                  >
                    View provenance
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
              </div>
              {!locked && !showPicker && (
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="mt-2 text-[12px] text-[#319ED8] font-semibold active:opacity-70"
                  data-testid={`button-cert-change-${order.id}`}
                >
                  Change name
                </button>
              )}
            </>
          ) : (
            <>
              <div className="text-[12px] text-white/65 mt-0.5">
                Confirm the name to print on your certificate before it goes to print.
              </div>
              {!showPicker && (
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="mt-2 inline-flex items-center px-3 py-1.5 rounded-full bg-[#4AFFCA] text-[#00062B] text-[12px] font-semibold active:opacity-80"
                  data-testid={`button-cert-confirm-${order.id}`}
                >
                  Confirm name
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {showPicker && !locked && user && (
        <div className="mt-3 flex flex-col gap-2" data-testid={`cert-picker-${order.id}`}>
          <IdentityOption
            label="Display name"
            value={user.displayName}
            selected={cert.confirmedIdentityKind === "display"}
            onClick={() => pickIdentity("display")}
            testId={`cert-pick-display-${order.id}`}
          />
          <IdentityOption
            label="Username"
            value={`@${user.username}`}
            selected={cert.confirmedIdentityKind === "username"}
            onClick={() => pickIdentity("username")}
            testId={`cert-pick-username-${order.id}`}
          />
          {showRealNameInput ? (
            <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/5 border border-white/10">
              <label className="text-[11px] text-white/55 uppercase tracking-wider">Your real name</label>
              <input
                type="text"
                value={realNameDraft}
                onChange={(e) => setRealNameDraft(e.target.value)}
                placeholder="e.g. Jane Doe"
                className="bg-white/10 text-white text-[14px] rounded-lg px-3 py-2 outline-none focus:bg-white/15"
                data-testid={`cert-real-input-${order.id}`}
              />
              <button
                type="button"
                onClick={saveRealName}
                disabled={!realNameDraft.trim() || confirm.isPending}
                className="mt-1 px-3 py-1.5 rounded-full bg-[#4AFFCA] text-[#00062B] text-[12px] font-semibold disabled:opacity-50"
                data-testid={`cert-real-save-${order.id}`}
              >
                Save and use real name
              </button>
            </div>
          ) : (
            <IdentityOption
              label="Real name"
              value={user.realName || "Add real name…"}
              selected={cert.confirmedIdentityKind === "real" && !!user.realName}
              ghost={!user.realName}
              onClick={() => pickIdentity("real")}
              testId={`cert-pick-real-${order.id}`}
            />
          )}
          <button
            type="button"
            onClick={() => { setShowPicker(false); setShowRealNameInput(false); }}
            className="text-[12px] text-white/45 self-start mt-1 active:opacity-70"
            data-testid={`cert-picker-cancel-${order.id}`}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function IdentityOption({
  label, value, selected, onClick, testId, ghost,
}: {
  label: string;
  value: string;
  selected: boolean;
  onClick: () => void;
  testId: string;
  ghost?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-left border transition-colors active:opacity-80 ${
        selected
          ? "border-[#4AFFCA] bg-[#4AFFCA]/10"
          : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}
      data-testid={testId}
    >
      <div className="flex flex-col min-w-0">
        <span className="text-[11px] uppercase tracking-wider text-white/45">{label}</span>
        <span className={`text-[14px] font-medium truncate ${ghost ? "text-white/45 italic" : "text-white"}`}>
          {value}
        </span>
      </div>
      {selected && <Check className="w-4 h-4 text-[#4AFFCA] flex-shrink-0" />}
    </button>
  );
}

// ───────────────────────── Order detail sheet ─────────────────────────
// Bottom sheet (Apple-Music-style modal) for a single order: line items,
// shipping address, full lifecycle timeline (paid → submitted → in
// fulfillment → shipped → delivered, plus cancelled/returned offshoots),
// carrier + tap-to-track link, gift-recipient block when applicable.
function OrderDetailSheet({ order, onClose }: { order: OrderRow | null; onClose: () => void }) {
  return (
    <Sheet open={!!order} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="bottom"
        className="bg-[#00062B] text-white border-white/10 rounded-t-3xl max-h-[90vh] overflow-y-auto"
        data-testid="sheet-order-detail"
      >
        {order && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="text-white text-[20px] font-bold">{order.albumTitle}</SheetTitle>
              <p className="text-white/55 text-[13px]">{order.albumArtist}</p>
            </SheetHeader>

            <div className="mt-4 flex items-center gap-2 flex-wrap text-[11px]">
              <span className={`px-2 py-0.5 rounded-full font-semibold uppercase ${(STATUS_LABEL[order.status] ?? STATUS_LABEL.pending).cls}`}>
                {(STATUS_LABEL[order.status] ?? STATUS_LABEL.pending).label}
              </span>
              {order.goodDeedNumber !== null && (
                <span className="text-white/55">GoodDeed #{order.goodDeedNumber}</span>
              )}
              <span className="text-white/40">· {new Date(order.createdAt).toLocaleString()}</span>
            </div>

            <FulfillmentTimeline order={order} />

            {/* Line items — what was actually purchased. */}
            <section className="mt-5">
              <h3 className="text-[11px] uppercase tracking-widest text-white/40 font-semibold mb-2">Items</h3>
              <div className="rounded-2xl bg-white/5 border border-white/10 divide-y divide-white/10">
                {order.items.map((it) => {
                  // Task #201 — vinyl line items render the colored
                  // <VinylPreview> in the detail row so the fan sees the
                  // exact disc color confirmed on their receipt.
                  const isVinyl = it.kind === "format" && isVinylFormat(it.sku as AlbumFormat);
                  const color = isVinyl
                    ? VINYL_COLOR_BY_ID[it.vinylColor ?? DEFAULT_VINYL_COLOR_ID] ??
                      VINYL_COLOR_BY_ID[DEFAULT_VINYL_COLOR_ID]
                    : null;
                  return (
                    <div key={it.id} className="flex items-center gap-3 px-4 py-3" data-testid={`detail-item-${it.id}`}>
                      {isVinyl && color && (
                        <div className="flex-shrink-0" data-testid={`detail-vinyl-preview-${it.id}`}>
                          <VinylPreview
                            artworkUrl={order.albumArtwork}
                            color={color}
                            jacketUpgrade={it.jacketUpgrade ?? DEFAULT_JACKET_UPGRADE}
                            size="sm"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] text-white">{it.label}</div>
                        {isVinyl && color && (
                          <div className="text-[11.5px] text-white/55 mt-0.5">{color.name}</div>
                        )}
                        {it.quantity > 1 && (
                          <div className="text-[11px] text-white/45">Qty {it.quantity}</div>
                        )}
                      </div>
                      <div className="text-[13px] tabular-nums text-white/85">
                        {dollars(it.unitPriceCents * it.quantity)}
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between px-4 py-3 bg-white/[0.03]">
                  <div className="text-[12px] uppercase tracking-widest text-white/45 font-semibold">Total</div>
                  <div className="text-[15px] font-semibold tabular-nums">{dollars(order.totalCents)}</div>
                </div>
              </div>
            </section>

            {/* Shipping address — only on physical orders that have one. */}
            {isPhysical(order) && order.shippingAddress && (
              <section className="mt-5" data-testid="detail-shipping-address">
                <h3 className="text-[11px] uppercase tracking-widest text-white/40 font-semibold mb-2 flex items-center gap-1.5">
                  <MapPin className="w-3 h-3" /> Shipping to
                </h3>
                <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-[13px] text-white/85 leading-snug">
                  {order.shippingAddress.name && <div className="text-white font-medium">{order.shippingAddress.name}</div>}
                  {order.shippingAddress.line1 && <div>{order.shippingAddress.line1}</div>}
                  {order.shippingAddress.line2 && <div>{order.shippingAddress.line2}</div>}
                  <div>
                    {[order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.postalCode].filter(Boolean).join(", ")}
                  </div>
                  {order.shippingAddress.country && <div>{order.shippingAddress.country}</div>}
                </div>
              </section>
            )}

            {/* Carrier + tracking, repeated here for the detail context. */}
            {isPhysical(order) && order.trackingNumber && (
              <section className="mt-5" data-testid="detail-tracking">
                <h3 className="text-[11px] uppercase tracking-widest text-white/40 font-semibold mb-2 flex items-center gap-1.5">
                  <Truck className="w-3 h-3" /> Tracking
                </h3>
                <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-[13px]">
                  <div className="text-white/55 mb-1">{order.carrier ?? "Carrier"}</div>
                  {order.trackingUrl ? (
                    <a
                      href={order.trackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#319ED8] font-semibold inline-flex items-center gap-1 active:opacity-70"
                      data-testid="link-tracking-detail"
                    >
                      {order.trackingNumber}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : (
                    <span className="text-white font-semibold">{order.trackingNumber}</span>
                  )}
                </div>
              </section>
            )}

            {/* Gift recipient — visible to both buyer and recipient, with
                appropriate framing for each side. */}
            {order.gift && (
              <section className="mt-5" data-testid="detail-gift">
                <h3 className="text-[11px] uppercase tracking-widest text-white/40 font-semibold mb-2">
                  {order.gift.isBuyer ? "Gifted to" : "Sent to you by"}
                </h3>
                <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-[13px] text-white/85 leading-snug">
                  {order.gift.isBuyer ? (
                    <>
                      <div className="text-white font-medium">{order.gift.recipientFirstName} {order.gift.recipientLastName}</div>
                      {order.gift.recipientEmail && <div className="text-white/55">{order.gift.recipientEmail}</div>}
                      {order.gift.recipientPhone && <div className="text-white/55">{order.gift.recipientPhone}</div>}
                      <div className="text-white/45 mt-1 text-[12px]">
                        {order.gift.claimed && order.gift.claimedAt
                          ? `Claimed ${new Date(order.gift.claimedAt).toLocaleDateString()}`
                          : `Awaiting claim · expires ${new Date(order.gift.expiresAt).toLocaleDateString()}`}
                      </div>
                    </>
                  ) : (
                    <div className="text-white/75">A friend bought this record for you on GoodTunes. Enjoy.</div>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// Vertical timeline rendered inside the order detail sheet. Walks the
// canonical lifecycle in order and dims any step that hasn't happened
// yet; cancelled / returned terminate the timeline early with a rose
// callout. Digital-only orders collapse to just "Paid".
function FulfillmentTimeline({ order: o }: { order: OrderRow }) {
  const physical = isPhysical(o);
  type Step = { key: string; label: string; at: string | null | undefined; tone?: "rose" };
  const steps: Step[] = [];
  steps.push({ key: "paid", label: "Paid", at: o.createdAt });
  if (physical) {
    steps.push({ key: "submitted", label: "Submitted to fulfillment", at: o.submittedToFulfillmentAt });
    steps.push({ key: "in_fulfillment", label: "In fulfillment", at: o.inFulfillmentAt });
    steps.push({ key: "shipped", label: "Shipped", at: o.shippedAt });
    steps.push({ key: "delivered", label: "Delivered", at: o.deliveredAt });
  }
  if (o.refundedAt) steps.push({ key: "refunded", label: "Refunded", at: o.refundedAt, tone: "rose" });
  if (o.cancelledAt) steps.push({ key: "cancelled", label: "Cancelled", at: o.cancelledAt, tone: "rose" });
  if (o.returnedAt) steps.push({ key: "returned", label: "Returned", at: o.returnedAt, tone: "rose" });

  return (
    <section className="mt-5" data-testid="detail-timeline">
      <h3 className="text-[11px] uppercase tracking-widest text-white/40 font-semibold mb-2">Status</h3>
      <ol className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 flex flex-col gap-2.5">
        {steps.map((s) => {
          const reached = !!s.at;
          const isRose = s.tone === "rose";
          return (
            <li key={s.key} className="flex items-center gap-3" data-testid={`timeline-${s.key}`}>
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  reached
                    ? isRose
                      ? "bg-rose-500/25 text-rose-200"
                      : "bg-[#4AFFCA]/20 text-[#4AFFCA]"
                    : "bg-white/5 text-white/30"
                }`}
              >
                {reached ? (
                  isRose ? (
                    <Package className="w-3.5 h-3.5" />
                  ) : (
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  )
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
                )}
              </span>
              <div className="flex-1 min-w-0 flex items-baseline justify-between gap-2">
                <span className={`text-[13.5px] ${reached ? (isRose ? "text-rose-200" : "text-white") : "text-white/45"}`}>
                  {s.label}
                </span>
                {s.at && (
                  <span className="text-[11px] text-white/40 tabular-nums">
                    {new Date(s.at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
