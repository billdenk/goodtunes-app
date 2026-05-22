// AdminOrders — operator-facing orders list with status filters +
// shipping action (Task #44, step 11). Admin-only.
//
// Task #48 additions:
// - Per-row payout chip (status + amount) and "Retry payout" button
//   when status === "failed" / "skipped".
// - "Stuck payouts" panel at the top of the page (collapsed by default)
//   driven by GET /api/admin/payouts/stuck — operator sees every shipped
//   order whose Connect transfer hasn't landed.
// - Inline settings popover for platformFeePct + certCostCents.
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Settings2, RefreshCw, Loader2 } from "lucide-react";
import type { PayoutSettings } from "@shared/schema";

type GiftInfo = {
  id: string;
  recipientFirstName: string;
  recipientLastName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  claimed: boolean;
  claimedAt: string | null;
  expiresAt: string;
  resendCount: number;
  createdAt: string;
};

type AdminOrderRow = {
  id: string;
  customerId: string;
  customerEmail: string;
  customerName: string | null;
  albumId: string;
  albumTitle: string;
  albumArtist: string;
  status: string;
  totalCents: number;
  goodDeedNumber: number | null;
  shippingName: string | null;
  shippingAddress: any;
  shippedAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  payoutStatus: string | null;
  payoutAmountCents: number | null;
  payoutError: string | null;
  payoutOwnerKind: string | null;
  payoutOwnerId: string | null;
  // Task #49 — order origin. "direct" | "shopify:<storeId>".
  origin?: string;
  items: { id: string; kind: string; sku: string; label: string; unitPriceCents: number; quantity: number }[];
  gift: GiftInfo | null;
  // Task #73 — Order Desk fulfillment lifecycle.
  skuKind?: string | null;
  fulfillmentStatus?: string | null;
  fulfillmentPartnerId?: string | null;
  orderDeskOrderId?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  submittedToFulfillmentAt?: string | null;
  inFulfillmentAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  returnedAt?: string | null;
};

// Small operator-facing badge surfacing where a row came from. Direct
// orders stay unbadged; Shopify rows render the Shopify green so the
// admin can filter visually without reading the origin string.
function OriginBadge({ origin }: { origin: string | undefined }) {
  if (!origin || origin === "direct") return null;
  return (
    <span
      className="inline-flex items-center rounded-full bg-[#95BF47]/15 text-[#5a7c2c] text-[10.5px] font-semibold uppercase tracking-wider px-2 py-0.5"
      data-testid="badge-origin-shopify"
      title="Bundled with a label's Shopify order"
    >
      Shopify
    </span>
  );
}

function giftStatus(g: GiftInfo): { label: string; cls: string } {
  if (g.claimed) return { label: "Gift · Claimed", cls: "bg-violet-50 text-violet-700" };
  if (new Date(g.expiresAt).getTime() < Date.now()) return { label: "Gift · Expired", cls: "bg-rose-50 text-rose-700" };
  if (g.resendCount > 0) return { label: `Gift · Resent ×${g.resendCount}`, cls: "bg-amber-50 text-amber-700" };
  return { label: "Gift · Sent", cls: "bg-fuchsia-50 text-fuchsia-700" };
}

const STATUSES = ["all", "paid", "shipped", "refunded"] as const;
type StatusFilter = (typeof STATUSES)[number];
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

export function AdminOrders() {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [showSettings, setShowSettings] = useState(false);
  const { toast } = useToast();
  const { data: orders, isLoading } = useQuery<AdminOrderRow[]>({ queryKey: ["/api/admin/orders"] });
  const { data: stuck } = useQuery<AdminOrderRow[]>({ queryKey: ["/api/admin/payouts/stuck"] });

  const ship = useMutation({
    mutationFn: async (orderId: string) => {
      await apiRequest("POST", `/api/admin/orders/${orderId}/ship`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payouts/stuck"] });
      toast({ title: "Marked shipped" });
    },
    onError: (e: any) => toast({ title: "Couldn't update", description: e?.message, variant: "destructive" }),
  });

  // Task #46 — operator-driven resend. The buyer can also do this from
  // their own order list, but admin support sometimes needs to do it for
  // a confused fan ("I lost the text") without making them open the app.
  // Resend works even on expired gifts — it rotates the token and resets
  // the 30-day claim window.
  const resendGift = useMutation({
    mutationFn: async (orderId: string) => {
      const r = await apiRequest("POST", `/api/admin/orders/${orderId}/gift/resend-as-admin`, {});
      return (await r.json()) as { shareUrl: string };
    },
    onSuccess: async (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      try {
        await navigator.clipboard.writeText(res.shareUrl);
        toast({ title: "Gift link resent + copied to clipboard" });
      } catch {
        toast({ title: "Gift link resent", description: res.shareUrl });
      }
    },
    onError: (e: any) => toast({ title: "Couldn't resend", description: e?.message, variant: "destructive" }),
  });

  // Admin recipient change (within 24h, pre-claim) — captured via a
  // sequence of prompt()s to keep the row dense. Fields default to the
  // current values so a quick typo-fix is one prompt away.
  const patchGift = useMutation({
    mutationFn: async (args: { orderId: string; body: { firstName: string; lastName: string; email: string | null; phone: string | null } }) => {
      const r = await apiRequest("PATCH", `/api/admin/orders/${args.orderId}/gift`, args.body);
      return (await r.json()) as { shareUrl: string };
    },
    onSuccess: async (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      try {
        await navigator.clipboard.writeText(res.shareUrl);
        toast({ title: "Recipient updated · new link copied" });
      } catch {
        toast({ title: "Recipient updated", description: res.shareUrl });
      }
    },
    onError: (e: any) => toast({ title: "Couldn't update", description: e?.message, variant: "destructive" }),
  });

  function promptChangeRecipient(o: AdminOrderRow) {
    if (!o.gift) return;
    const firstName = window.prompt("Recipient first name", o.gift.recipientFirstName)?.trim();
    if (!firstName) return;
    const lastName = window.prompt("Recipient last name", o.gift.recipientLastName)?.trim();
    if (!lastName) return;
    const email = window.prompt("Recipient email (blank to skip)", o.gift.recipientEmail ?? "")?.trim() || null;
    const phone = email ? null : window.prompt("Recipient phone (required if no email)", o.gift.recipientPhone ?? "")?.trim() || null;
    patchGift.mutate({ orderId: o.id, body: { firstName, lastName, email, phone } });
  }

  const retryPayout = useMutation({
    mutationFn: async (orderId: string) => apiRequest("POST", `/api/admin/payouts/orders/${orderId}/retry`, {}),
    onSuccess: (_d, orderId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payouts/stuck"] });
      toast({ title: `Retried payout for order ${orderId.slice(0, 8)}` });
    },
    onError: (e: any) => toast({ title: "Retry failed", description: e?.message, variant: "destructive" }),
  });


  const filtered = (orders ?? []).filter((o) => (filter === "all" ? true : o.status === filter));

  // Task #131 — Deep-link focus. When AdminCustomerDetail (or any
  // other admin page) links here as `/admin/orders?orderId=<id>` we
  // scroll the matching row into view and flash a focus ring so the
  // operator can see exactly which order the link landed on. We force
  // the filter back to "all" so the requested order is never hidden
  // by the active status filter.
  const focusOrderId = (() => {
    if (typeof window === "undefined") return null;
    try {
      return new URLSearchParams(window.location.search).get("orderId");
    } catch {
      return null;
    }
  })();
  const focusedRef = useRef<HTMLDivElement | null>(null);
  const [didFocus, setDidFocus] = useState(false);
  useEffect(() => {
    if (focusOrderId && filter !== "all") setFilter("all");
  }, [focusOrderId, filter]);
  useEffect(() => {
    if (!focusOrderId || didFocus) return;
    if (!filtered.some((o) => o.id === focusOrderId)) return;
    const t = setTimeout(() => {
      focusedRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setDidFocus(true);
    }, 50);
    return () => clearTimeout(t);
  }, [filtered, focusOrderId, didFocus]);

  return (
    <main className="min-h-screen bg-slate-50" data-testid="page-admin-orders">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[22px] font-semibold text-slate-900">Orders</h1>
            <p className="text-slate-500 text-[13px]">Physical fulfillment + refund tracking.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/print-queue"
              className="h-8 px-3 rounded-md border border-slate-200 bg-white text-slate-700 text-[12px] font-medium hover:bg-slate-50 inline-flex items-center gap-1.5"
              data-testid="link-print-queue"
            >
              Print queue
            </Link>
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="h-8 px-3 rounded-md border border-slate-200 bg-white text-slate-700 text-[12px] font-medium hover:bg-slate-50 inline-flex items-center gap-1.5"
              data-testid="button-payout-settings"
            >
              <Settings2 className="w-3.5 h-3.5" /> Payout settings
            </button>
            <div className="flex p-0.5 rounded-md bg-slate-100">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-3 py-1 rounded text-[12px] font-medium capitalize ${
                    filter === s ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                  }`}
                  data-testid={`filter-status-${s}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {showSettings && <PayoutSettingsPanel onClose={() => setShowSettings(false)} />}

        {stuck && stuck.length > 0 && (
          <StuckPayoutsPanel
            rows={stuck}
            onRetry={(id) => retryPayout.mutate(id)}
            isRetrying={retryPayout.isPending}
          />
        )}

        {isLoading && <div className="text-slate-500 text-sm" data-testid="admin-orders-loading">Loading…</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center" data-testid="admin-orders-empty">
            <div className="text-slate-700 font-medium">No orders</div>
            <div className="text-slate-500 text-[13px] mt-1">When fans buy, they'll show up here.</div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
          {filtered.map((o) => {
            const isFocus = focusOrderId === o.id;
            return (
            <div
              key={o.id}
              ref={isFocus ? focusedRef : undefined}
              className={[
                "px-4 py-4 flex items-center gap-4 transition-colors",
                isFocus ? "bg-[var(--brand-blue)]/5 ring-2 ring-inset ring-[var(--brand-blue)]/40" : "",
              ].join(" ")}
              data-testid={`row-admin-order-${o.id}`}
              data-focused={isFocus ? "true" : undefined}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] flex-wrap">
                  <span className={[
                    "px-2 py-0.5 rounded-full font-semibold uppercase",
                    o.status === "paid" ? "bg-emerald-50 text-emerald-700" :
                    o.status === "shipped" ? "bg-sky-50 text-sky-700" :
                    o.status === "refunded" ? "bg-rose-50 text-rose-700" :
                    "bg-slate-100 text-slate-600",
                  ].join(" ")}>{o.status}</span>
                  <OriginBadge origin={o.origin} />
                  {o.gift && (() => {
                    const s = giftStatus(o.gift);
                    return (
                      <span className={`px-2 py-0.5 rounded-full font-semibold uppercase ${s.cls}`} data-testid={`pill-gift-${o.id}`}>
                        {s.label}
                      </span>
                    );
                  })()}
                  {o.payoutStatus && <PayoutChip status={o.payoutStatus} amountCents={o.payoutAmountCents} />}
                  {o.goodDeedNumber !== null && (
                    <span className="text-slate-400">#{o.goodDeedNumber}</span>
                  )}
                  <span className="text-slate-400">{new Date(o.createdAt).toLocaleDateString()}</span>
                </div>
                {o.gift && (
                  <div className="text-[11.5px] text-slate-500 mt-1.5 leading-snug" data-testid={`text-gift-${o.id}`}>
                    Gift to <span className="text-slate-700 font-medium">{o.gift.recipientFirstName} {o.gift.recipientLastName}</span>
                    {o.gift.recipientEmail && <> · {o.gift.recipientEmail}</>}
                    {o.gift.recipientPhone && <> · {o.gift.recipientPhone}</>}
                  </div>
                )}
                <div className="text-[14px] font-medium text-slate-900 mt-1">
                  <Link href={`/admin/albums/${o.albumId}`} className="hover:text-[var(--brand-blue)] hover:underline underline-offset-2 transition-colors">
                    {o.albumTitle}
                  </Link>
                  <span className="text-slate-400"> · </span>
                  <span className="text-slate-600">{o.albumArtist}</span>
                </div>
                {/* Task #131 — Cross-link into the Customers directory.
                    Only orders with a real customerId get the link;
                    guest / orphan orders keep their snapshot text as
                    plain copy so we don't navigate to a 404. */}
                <div className="text-[12.5px] text-slate-500 mt-0.5">
                  {o.customerId ? (
                    <Link
                      href={`/admin/customers/${o.customerId}`}
                      className="hover:text-[var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
                      data-testid={`link-customer-${o.id}`}
                    >
                      {(o.customerName || o.customerEmail) + (o.customerName && o.customerEmail ? ` · ${o.customerEmail}` : "")}
                    </Link>
                  ) : (
                    (o.customerName || o.customerEmail) + (o.customerName && o.customerEmail ? ` · ${o.customerEmail}` : "")
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {o.items.map((it) => (
                    <span key={it.id} className="text-[10.5px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      {it.label}
                    </span>
                  ))}
                </div>
                {o.shippingAddress && (
                  <div className="text-[11.5px] text-slate-500 mt-1.5 leading-snug">
                    Ship to: {o.shippingName ?? o.customerName ?? "—"},{" "}
                    {[o.shippingAddress.line1, o.shippingAddress.line2, o.shippingAddress.city, o.shippingAddress.state, o.shippingAddress.postalCode, o.shippingAddress.country].filter(Boolean).join(", ")}
                  </div>
                )}
                {o.payoutError && (
                  <div className="text-[11.5px] text-rose-600 mt-1.5" data-testid={`text-payout-error-${o.id}`}>
                    Payout error: {o.payoutError}
                  </div>
                )}
                <FulfillmentTimeline order={o} />
              </div>
              <div className="text-right">
                <div className="text-[14px] font-semibold text-slate-900">{dollars(o.totalCents)}</div>
                {o.status === "paid" && (
                  <button
                    type="button"
                    onClick={() => ship.mutate(o.id)}
                    disabled={ship.isPending}
                    className="mt-2 px-3 py-1 rounded-md text-[12px] font-medium bg-[var(--brand-blue)] text-white hover:bg-[var(--brand-blue-hover)] disabled:opacity-50"
                    data-testid={`button-ship-${o.id}`}
                  >
                    Mark shipped
                  </button>
                )}
                {o.gift && !o.gift.claimed && (
                  <button
                    type="button"
                    onClick={() => resendGift.mutate(o.id)}
                    disabled={resendGift.isPending}
                    className="mt-2 ml-2 px-3 py-1 rounded-md text-[12px] font-medium bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-200 disabled:opacity-50"
                    data-testid={`button-resend-gift-${o.id}`}
                  >
                    {new Date(o.gift.expiresAt).getTime() < Date.now() ? "Recover expired link" : "Resend link"}
                  </button>
                )}
                {o.gift && !o.gift.claimed && Date.now() - new Date(o.gift.createdAt).getTime() < 24 * 60 * 60 * 1000 && (
                  <button
                    type="button"
                    onClick={() => promptChangeRecipient(o)}
                    disabled={patchGift.isPending}
                    className="mt-2 ml-2 px-3 py-1 rounded-md text-[12px] font-medium bg-violet-100 text-violet-700 hover:bg-violet-200 disabled:opacity-50"
                    data-testid={`button-change-recipient-${o.id}`}
                  >
                    Change recipient
                  </button>
                )}
                {o.status === "shipped" && o.payoutStatus && o.payoutStatus !== "transferred" && (
                  <button
                    type="button"
                    onClick={() => retryPayout.mutate(o.id)}
                    disabled={retryPayout.isPending}
                    className="mt-2 px-3 py-1 rounded-md text-[12px] font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 inline-flex items-center gap-1.5"
                    data-testid={`button-retry-payout-${o.id}`}
                  >
                    {retryPayout.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Retry payout
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

// Task #73 — Order Desk fulfillment lifecycle strip. Only renders for
// physical orders (skuKind ∈ vinyl/cassette/cd/bundle). Shows the
// submitted → in-fulfillment → shipped → delivered (or cancelled /
// returned) progression with the inbound tracking link when OD has
// emitted it.
function FulfillmentTimeline({ order: o }: { order: AdminOrderRow }) {
  const isPhysical = o.skuKind === "vinyl" || o.skuKind === "cassette" || o.skuKind === "cd" || o.skuKind === "bundle";
  if (!isPhysical) return null;
  const stages: { key: string; label: string; at: string | null | undefined }[] = [
    { key: "submitted", label: "Submitted", at: o.submittedToFulfillmentAt },
    { key: "in_fulfillment", label: "In fulfillment", at: o.inFulfillmentAt },
    { key: "shipped", label: "Shipped", at: o.shippedAt },
    { key: "delivered", label: "Delivered", at: o.deliveredAt },
  ];
  const status = o.fulfillmentStatus ?? "pending";
  const tone =
    status === "delivered" ? "bg-emerald-50 text-emerald-700" :
    status === "shipped" ? "bg-sky-50 text-sky-700" :
    status === "in_fulfillment" ? "bg-indigo-50 text-indigo-700" :
    status === "submitted" ? "bg-violet-50 text-violet-700" :
    status === "cancelled" || status === "returned" ? "bg-rose-50 text-rose-700" :
    "bg-amber-50 text-amber-700";
  return (
    <div className="mt-2 rounded-md bg-slate-50 border border-slate-200 px-2.5 py-2" data-testid={`fulfillment-timeline-${o.id}`}>
      <div className="flex items-center gap-2 text-[11px] flex-wrap">
        <span className={`px-2 py-0.5 rounded-full font-semibold uppercase ${tone}`} data-testid={`pill-fulfillment-${o.id}`}>
          {status.replace("_", " ")}
        </span>
        {o.orderDeskOrderId && (
          <span className="text-slate-400" data-testid={`text-od-id-${o.id}`}>OD #{o.orderDeskOrderId}</span>
        )}
        {(o.carrier || o.trackingNumber) && (
          <span className="text-slate-500">
            {o.carrier ? `${o.carrier} · ` : ""}
            {o.trackingUrl ? (
              <a href={o.trackingUrl} target="_blank" rel="noreferrer" className="text-[#319ED8] hover:underline" data-testid={`link-tracking-${o.id}`}>
                {o.trackingNumber ?? "track"}
              </a>
            ) : (
              <span data-testid={`text-tracking-${o.id}`}>{o.trackingNumber}</span>
            )}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-[10.5px] text-slate-500 flex-wrap">
        {stages.map((s) => (
          <span key={s.key} className={s.at ? "text-slate-700 font-medium" : "text-slate-400"}>
            {s.label}{s.at ? ` · ${new Date(s.at).toLocaleDateString()}` : ""}
          </span>
        ))}
        {o.cancelledAt && (
          <span className="text-rose-600 font-medium">Cancelled · {new Date(o.cancelledAt).toLocaleDateString()}</span>
        )}
        {o.returnedAt && (
          <span className="text-rose-600 font-medium">Returned · {new Date(o.returnedAt).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
}

function PayoutChip({ status, amountCents }: { status: string; amountCents: number | null }) {
  const tone =
    status === "transferred"
      ? "bg-emerald-50 text-emerald-700"
      : status === "reversed"
      ? "bg-slate-100 text-slate-600"
      : status === "skipped"
      ? "bg-amber-50 text-amber-700"
      : status === "failed"
      ? "bg-rose-50 text-rose-700"
      : "bg-slate-100 text-slate-600";
  return (
    <span className={`px-2 py-0.5 rounded-full font-semibold uppercase ${tone}`} data-testid={`payout-chip-${status}`}>
      payout: {status}{amountCents != null && status === "transferred" ? ` · ${dollars(amountCents)}` : ""}
    </span>
  );
}

function StuckPayoutsPanel({
  rows,
  onRetry,
  isRetrying,
}: {
  rows: AdminOrderRow[];
  onRetry: (id: string) => void;
  isRetrying: boolean;
}) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-4" data-testid="panel-stuck-payouts">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-600" />
        <h2 className="text-amber-900 text-[13px] font-bold uppercase tracking-wide">
          Stuck payouts ({rows.length})
        </h2>
      </div>
      <div className="space-y-2">
        {rows.map((o) => (
          <div
            key={o.id}
            className="rounded-md bg-white border border-amber-100 px-3 py-2 flex items-center gap-3 text-[12.5px]"
            data-testid={`row-stuck-${o.id}`}
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-900 truncate">
                {o.albumTitle} <span className="text-slate-400">·</span>{" "}
                <span className="text-slate-600">{o.albumArtist}</span>
              </div>
              <div className="text-slate-500 text-[11.5px]">
                Order {o.id.slice(0, 8)} · shipped {o.shippedAt ? new Date(o.shippedAt).toLocaleDateString() : "—"} ·{" "}
                <span className="text-amber-700 font-medium">{o.payoutStatus ?? "no-status"}</span>
                {o.payoutError && <span className="text-rose-600"> — {o.payoutError}</span>}
              </div>
            </div>
            <div className="font-semibold text-slate-900">{dollars(o.totalCents)}</div>
            <button
              type="button"
              onClick={() => onRetry(o.id)}
              disabled={isRetrying}
              className="h-8 px-3 rounded-md bg-amber-500 text-white text-[12px] font-semibold hover:bg-amber-600 disabled:opacity-60 inline-flex items-center gap-1.5"
              data-testid={`button-retry-stuck-${o.id}`}
            >
              {isRetrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Retry
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function PayoutSettingsPanel({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<PayoutSettings>({ queryKey: ["/api/admin/payout-settings"] });
  const [feePct, setFeePct] = useState<string>("");
  const [certCents, setCertCents] = useState<string>("");

  const save = useMutation({
    mutationFn: async () => {
      const body: any = {};
      if (feePct !== "") body.platformFeePct = Number(feePct);
      if (certCents !== "") body.certCostCents = Number(certCents);
      return apiRequest("PUT", "/api/admin/payout-settings", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payout-settings"] });
      toast({ title: "Payout settings saved" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  const currentFee = settings?.platformFeePct ?? 10;
  const currentCert = settings?.certCostCents ?? 500;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 mb-4 space-y-3" data-testid="panel-payout-settings">
      <div className="flex items-center justify-between">
        <h2 className="text-slate-900 text-[13px] font-bold">Payout settings</h2>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-[12px]">Close</button>
      </div>
      {isLoading ? (
        <div className="text-slate-400 text-[12px]">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">Platform fee %</span>
            <input
              type="number"
              min={0}
              max={100}
              placeholder={String(currentFee)}
              value={feePct}
              onChange={(e) => setFeePct(e.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-md border border-slate-200 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
              data-testid="input-platform-fee-pct"
            />
            <p className="text-slate-400 text-[11px] mt-1">Currently {currentFee}%. Applied off the top of every paid order.</p>
          </label>
          <label className="block">
            <span className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">Cert cost (cents)</span>
            <input
              type="number"
              min={0}
              placeholder={String(currentCert)}
              value={certCents}
              onChange={(e) => setCertCents(e.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-md border border-slate-200 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
              data-testid="input-cert-cost-cents"
            />
            <p className="text-slate-400 text-[11px] mt-1">Currently {dollars(currentCert)}. Subtracted before the artist split when a signed cert is in the order.</p>
          </label>
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending || (feePct === "" && certCents === "")}
          className="h-9 px-4 rounded-md bg-[var(--brand-blue)] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-60"
          data-testid="button-save-payout-settings"
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}
