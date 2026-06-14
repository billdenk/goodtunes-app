import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatUsdCents } from "@shared/money";

/**
 * Shared order-detail Sheet (Task #1342).
 *
 * Extracted from AdminFanOrders so the same slide-over can open from both
 * the global Fan Orders queue and a customer's detail page — where an order
 * row used to bounce to `/admin/orders?orderId=…` (a list that can't be
 * drilled into). The origin badge, status pill, and helpers live here too
 * so both surfaces render orders identically.
 */

export type AdminOrderRow = {
  id: string;
  customerId: string;
  customerEmail: string;
  customerName: string | null;
  albumId: string;
  albumTitle: string;
  albumArtist: string;
  albumArtwork: string | null;
  status: string;
  totalCents: number;
  goodDeedNumber: number | null;
  shippingName: string | null;
  shippingAddress: any;
  shippedAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  origin?: string;
  items: {
    id: string;
    kind: string;
    sku: string;
    label: string;
    unitPriceCents: number;
    quantity: number;
  }[];
  skuKind?: string | null;
  fulfillmentStatus?: string | null;
  orderDeskOrderId?: string | null;
  odooOrderId?: string | null;
  odooLastSyncedAt?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  submittedToFulfillmentAt?: string | null;
  inFulfillmentAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  returnedAt?: string | null;
  fulfillmentError?: string | null;
};

export type AdminOrderDetail = {
  order: AdminOrderRow & Record<string, any>;
  items: Array<Record<string, any>>;
  album: { id: string; title: string; artist: string; artwork: string | null } | null;
  customer: { id: string; email: string; displayName: string | null; realName: string | null } | null;
  fulfillmentPartner: any;
  orderDeskEvents: Array<{
    id: string;
    receivedAt: string;
    eventType: string | null;
    fulfillmentStatus: string | null;
    trackingNumber: string | null;
  }>;
};

export const dollars = (c: number) => formatUsdCents(c);

export function orderShort(o: { goodDeedNumber: number | null; id: string }) {
  if (o.goodDeedNumber !== null && o.goodDeedNumber !== undefined) {
    return `#${o.goodDeedNumber}`;
  }
  return `#${o.id.slice(0, 8)}`;
}

/**
 * Task #1342 — honest origin badge. Direct stays blue, true Shopify orders
 * keep the green Shopify badge, and imported `legacy:gogoods` orders (and
 * any other non-Shopify origin) get an accurate "goGoods" / neutral badge
 * instead of being mislabeled as Shopify.
 */
export function originBadge(origin: string | undefined) {
  const o = origin && origin.trim() ? origin : "direct";
  if (o === "direct") {
    return (
      <span
        className="inline-flex items-center rounded-full bg-[var(--brand-blue)]/10 text-[var(--brand-blue)] text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5"
        data-testid="badge-origin-direct"
      >
        Direct
      </span>
    );
  }
  if (o.startsWith("shopify:")) {
    return (
      <span
        className="inline-flex items-center rounded-full bg-[#95BF47]/15 text-[#5a7c2c] text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5"
        data-testid="badge-origin-shopify"
        title="Bundled with a label's Shopify order"
      >
        Shopify
      </span>
    );
  }
  if (o === "legacy:gogoods") {
    return (
      <span
        className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5"
        data-testid="badge-origin-gogoods"
        title="Imported from GoGoods® (legacy platform)"
      >
        GoGoods®
      </span>
    );
  }
  // Any other origin (future legacy sources, etc.) — render it honestly
  // rather than guessing Shopify.
  const label = o.startsWith("legacy:") ? o.slice("legacy:".length) : o.split(":")[0];
  return (
    <span
      className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5"
      data-testid="badge-origin-other"
      title={`Order origin: ${o}`}
    >
      {label}
    </span>
  );
}

export function statusPill(o: { status: string; id: string }) {
  const s = o.status;
  const cls =
    s === "paid"
      ? "bg-emerald-50 text-emerald-700"
      : s === "shipped"
        ? "bg-sky-50 text-sky-700"
        : s === "refunded"
          ? "bg-rose-50 text-rose-700"
          : "bg-slate-100 text-slate-600";
  return (
    <span
      className={`px-2 py-0.5 rounded-full font-semibold uppercase text-[10px] ${cls}`}
      data-testid={`status-${o.id}`}
    >
      {s}
    </span>
  );
}

export function OrderDetailSheet({
  orderId,
  onClose,
}: {
  orderId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error, refetch } = useQuery<AdminOrderDetail>({
    queryKey: ["/api/admin/orders", orderId],
    enabled: !!orderId,
  });

  return (
    <Sheet open={!!orderId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto"
        data-testid="sheet-fan-order-detail"
      >
        <SheetHeader>
          <SheetTitle>Order detail</SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="text-slate-500 text-sm mt-4" data-testid="sheet-loading">
            Loading order…
          </div>
        )}
        {isError && (
          <div className="mt-4">
            <ErrorState
              error={error}
              onRetry={() => refetch()}
              title="Couldn't load order"
              testId="sheet-error"
            />
          </div>
        )}
        {data && <OrderDetailBody detail={data} />}
      </SheetContent>
    </Sheet>
  );
}

function OrderDetailBody({ detail }: { detail: AdminOrderDetail }) {
  const o = detail.order;
  const customer = detail.customer;
  const items = (detail.items ?? []) as Array<{
    id: string;
    kind: string;
    sku: string;
    label: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  const refunded = o.status === "refunded";
  const events = detail.orderDeskEvents ?? [];
  const refundEvents = events.filter(
    (e) =>
      (e.eventType ?? "").toLowerCase().includes("refund") ||
      (e.fulfillmentStatus ?? "").toLowerCase().includes("refund"),
  );
  const addr = o.shippingAddress;

  return (
    <div className="mt-4 space-y-5 text-[13px]" data-testid="sheet-order-body">
      <div className="flex items-center gap-2 flex-wrap">
        {statusPill(o as AdminOrderRow)}
        {originBadge(o.origin)}
        <span className="text-slate-400 text-[12px]">
          {orderShort(o as AdminOrderRow)}
        </span>
        <span className="text-slate-400 text-[12px]">
          {new Date(o.createdAt).toLocaleString()}
        </span>
        <Link href={`/admin/orders?orderId=${o.id}`} className="ml-auto inline-flex items-center gap-1 text-[12px] text-[var(--brand-blue)] hover:underline underline-offset-2" data-testid="link-open-in-orders">
          Open in operator view <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <Section title="Album">
        <div className="flex items-center gap-3">
          {detail.album?.artwork ? (
            <img
              src={detail.album.artwork}
              alt=""
              className="w-12 h-12 rounded object-cover border border-slate-200"
            />
          ) : (
            <div className="w-12 h-12 rounded bg-slate-100" />
          )}
          <div className="min-w-0">
            <div className="font-medium text-slate-900 truncate">
              {detail.album?.title ?? o.albumTitle}
            </div>
            <div className="text-slate-500 truncate">
              {detail.album?.artist ?? o.albumArtist}
            </div>
          </div>
          {detail.album?.id && (
            <Link href={`/admin/albums/${detail.album.id}`} className="ml-auto text-[12px] text-[var(--brand-blue)] hover:underline underline-offset-2" data-testid="link-album">
              View album
            </Link>
          )}
        </div>
      </Section>

      <Section title="Customer">
        {customer ? (
          <div className="flex items-center gap-2">
            <div className="min-w-0">
              <div className="font-medium text-slate-900 truncate">
                {customer.realName || customer.displayName || customer.email}
              </div>
              <div className="text-slate-500 truncate">{customer.email}</div>
            </div>
            <Link href={`/admin/customers/${customer.id}`} className="ml-auto text-[12px] text-[var(--brand-blue)] hover:underline underline-offset-2" data-testid="link-customer">
              View customer
            </Link>
          </div>
        ) : (
          <div className="text-slate-500">Guest / unlinked customer.</div>
        )}
      </Section>

      <Section title="Line items">
        {items.length === 0 ? (
          <div className="text-slate-500">No line items recorded.</div>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {items.map((it) => (
              <li
                key={it.id}
                className="px-3 py-2 flex items-center gap-3"
                data-testid={`sheet-item-${it.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-slate-900 font-medium truncate">
                    {it.label}
                  </div>
                  <div className="text-slate-500 text-[11.5px]">
                    {it.kind} · {it.sku}
                    {it.quantity > 1 ? ` · ×${it.quantity}` : ""}
                  </div>
                </div>
                <div className="text-slate-900 tabular-nums">
                  {dollars(it.unitPriceCents * (it.quantity || 1))}
                </div>
              </li>
            ))}
            <li className="px-3 py-2 flex items-center bg-slate-50">
              <span className="text-slate-500 text-[11.5px] uppercase tracking-wider font-semibold flex-1">
                Total
              </span>
              <span
                className="text-slate-900 font-semibold tabular-nums"
                data-testid="sheet-total"
              >
                {dollars(o.totalCents)}
              </span>
            </li>
          </ul>
        )}
      </Section>

      <Section title="Fulfillment">
        <FulfillmentRetryButton order={o as AdminOrderRow} />
        <OdooPushButton order={o as AdminOrderRow} />
        <dl className="grid grid-cols-[120px_1fr] gap-y-1 gap-x-3">
          <Row label="Kind" value={o.skuKind ?? "—"} />
          <Row
            label="Status"
            value={
              <span className="flex items-center gap-2">
                {o.fulfillmentStatus ?? "—"}
                {o.orderDeskOrderId && (
                  <span className="text-slate-400 text-xs" data-testid="text-od-id">
                    OD #{o.orderDeskOrderId}
                  </span>
                )}
                {o.odooOrderId && (
                  <span className="text-slate-400 text-xs" data-testid="text-odoo-id">
                    Odoo #{o.odooOrderId}
                  </span>
                )}
              </span>
            }
          />
          {o.odooOrderId && (
            <Row
              label="Odoo synced"
              value={o.odooLastSyncedAt ? new Date(o.odooLastSyncedAt).toLocaleString() : "—"}
            />
          )}
          <Row
            label="Ship to"
            value={
              addr
                ? `${o.shippingName ?? "—"} · ${[
                    addr.line1,
                    addr.line2,
                    addr.city,
                    addr.state,
                    addr.postalCode,
                    addr.country,
                  ]
                    .filter(Boolean)
                    .join(", ")}`
                : "—"
            }
          />
          <Row
            label="Carrier"
            value={
              o.trackingUrl ? (
                <a
                  href={o.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--brand-blue)] hover:underline"
                  data-testid="link-tracking"
                >
                  {o.carrier ?? "Tracking"} · {o.trackingNumber ?? "open"}
                </a>
              ) : o.carrier ? (
                `${o.carrier} · ${o.trackingNumber ?? "—"}`
              ) : (
                "—"
              )
            }
          />
          <Row
            label="Submitted"
            value={o.submittedToFulfillmentAt ? new Date(o.submittedToFulfillmentAt).toLocaleString() : "—"}
          />
          <Row
            label="Shipped"
            value={o.shippedAt ? new Date(o.shippedAt).toLocaleString() : "—"}
          />
          <Row
            label="Delivered"
            value={o.deliveredAt ? new Date(o.deliveredAt).toLocaleString() : "—"}
          />
          <Row
            label="Returned"
            value={o.returnedAt ? new Date(o.returnedAt).toLocaleString() : "—"}
          />
        </dl>
      </Section>

      <Section title="Refund history">
        <RefundAction order={o as AdminOrderRow} />
        {!refunded && refundEvents.length === 0 ? (
          <div className="text-slate-500">No refunds recorded.</div>
        ) : (
          <ul className="space-y-1.5">
            {refunded && (
              <li
                className="flex items-center gap-2"
                data-testid="sheet-refund-status"
              >
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-rose-50 text-rose-700">
                  Refunded
                </span>
                <span className="text-slate-600">
                  {o.refundedAt
                    ? new Date(o.refundedAt).toLocaleString()
                    : "Marked refunded"}
                </span>
              </li>
            )}
            {refundEvents.map((e) => (
              <li
                key={e.id}
                className="text-slate-600"
                data-testid={`sheet-refund-event-${e.id}`}
              >
                <span className="text-slate-400">
                  {new Date(e.receivedAt).toLocaleString()}
                </span>{" "}
                · {e.eventType ?? "event"}
                {e.fulfillmentStatus ? ` → ${e.fulfillmentStatus}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// Fulfillment retry push button — surfaces for physical orders in "pending"
// state with no OD id yet (i.e. the initial push failed or never ran). Shows
// the last failure reason so the operator knows what to fix before retrying.
function FulfillmentRetryButton({ order }: { order: AdminOrderRow }) {
  const { toast } = useToast();
  const isPhysical = order.skuKind === "vinyl" || order.skuKind === "cassette" || order.skuKind === "cd" || order.skuKind === "bundle";
  const needsRetry = isPhysical && !order.orderDeskOrderId && (order.fulfillmentStatus === "pending" || !order.fulfillmentStatus);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/orders/${order.id}/orderdesk-push`, {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Push failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data: { orderDeskOrderId?: string }) => {
      toast({ title: "Pushed to Order Desk", description: data.orderDeskOrderId ? `OD #${data.orderDeskOrderId}` : undefined });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders", order.id] });
    },
    onError: (e: any) => {
      toast({ title: "Push failed", description: e?.message ?? "Unknown error", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders", order.id] });
    },
  });

  if (!needsRetry) return null;

  return (
    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1.5" data-testid="fulfillment-retry-banner">
      {order.fulfillmentError && (
        <p className="text-xs text-amber-900">
          <span className="font-semibold">Last push error:</span> {order.fulfillmentError}
        </p>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="border-amber-400 bg-amber-100 hover:bg-amber-200 text-amber-900"
        data-testid="button-push-to-orderdesk"
      >
        {mutation.isPending ? (
          <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Pushing…</>
        ) : (
          <><RefreshCw className="w-3 h-3 mr-1.5" /> Push to Order Desk</>
        )}
      </Button>
    </div>
  );
}

// Task #1976 — deliberate "Push to Odoo" operator action (parallel to the
// Order Desk retry above; there is no auto-push). Surfaces for physical
// orders that haven't been handed to Odoo yet. Once an order has an Odoo id
// the button hides — the poll scheduler owns it from there. Shows the last
// push error so the operator knows what to fix before retrying.
function OdooPushButton({ order }: { order: AdminOrderRow }) {
  const { toast } = useToast();
  const isPhysical = order.skuKind === "vinyl" || order.skuKind === "cassette" || order.skuKind === "cd" || order.skuKind === "bundle";
  const canPush = isPhysical && !order.odooOrderId;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/orders/${order.id}/odoo-push`, {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Push failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data: { odooOrderId?: string }) => {
      toast({ title: "Pushed to Odoo", description: data.odooOrderId ? `Odoo #${data.odooOrderId}` : undefined });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders", order.id] });
    },
    onError: (e: any) => {
      toast({ title: "Push to Odoo failed", description: e?.message ?? "Unknown error", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders", order.id] });
    },
  });

  if (!canPush) return null;

  return (
    <div className="mb-3 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2.5 space-y-1.5" data-testid="odoo-push-banner">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="border-indigo-400 bg-indigo-100 hover:bg-indigo-200 text-indigo-900"
        data-testid="button-push-to-odoo"
      >
        {mutation.isPending ? (
          <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Pushing…</>
        ) : (
          <><RefreshCw className="w-3 h-3 mr-1.5" /> Push to Odoo</>
        )}
      </Button>
    </div>
  );
}

// Task #236 — in-sheet refund control. Direct (Stripe) and Shopify-
// origin orders share a single `/api/admin/orders/:id/refund` endpoint;
// the server picks the right gateway from `order.origin`. We invalidate
// both the list and this order's detail query so the Refund history
// list + status pill update without a page reload.
function RefundAction({ order }: { order: AdminOrderRow }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>(
    ((order.totalCents ?? 0) / 100).toFixed(2),
  );
  const [reason, setReason] = useState<string>("");
  const refundable = order.status === "paid" || order.status === "shipped";
  const isShopify = (order.origin ?? "direct").startsWith("shopify:");

  const mutation = useMutation({
    mutationFn: async () => {
      const dollarsVal = Number.parseFloat(amount);
      if (!Number.isFinite(dollarsVal) || dollarsVal <= 0) {
        throw new Error("Enter a refund amount greater than $0");
      }
      const cents = Math.round(dollarsVal * 100);
      if (cents > order.totalCents) {
        throw new Error("Refund amount cannot exceed order total");
      }
      const res = await apiRequest("POST", `/api/admin/orders/${order.id}/refund`, {
        amountCents: cents,
        reason: reason.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (data: { full: boolean; amountCents: number }) => {
      toast({
        title: data.full ? "Refund issued" : "Partial refund issued",
        description: `${formatUsdCents(data.amountCents)} returned via ${isShopify ? "Shopify" : "Stripe"}.`,
      });
      setOpen(false);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders", order.id] });
    },
    onError: (err: any) => {
      toast({
        title: "Refund failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  if (!refundable) return null;

  if (!open) {
    return (
      <div className="mb-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
          data-testid="button-open-refund"
        >
          Refund this order
        </Button>
        <p className="text-[11.5px] text-slate-500 mt-1">
          Issues a {isShopify ? "Shopify" : "Stripe"} refund directly. Full refunds void the GoodDeed
          number and return the album unlock; partial refunds leave the order
          intact.
        </p>
      </div>
    );
  }

  return (
    <div
      className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2"
      data-testid="refund-form"
    >
      <div className="flex items-center gap-2">
        <label className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500 w-16">
          Amount
        </label>
        <span className="text-slate-500">$</span>
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          className="h-8 w-28 tabular-nums"
          data-testid="input-refund-amount"
        />
        <button
          type="button"
          onClick={() => setAmount((order.totalCents / 100).toFixed(2))}
          className="text-[11.5px] text-[var(--brand-blue)] hover:underline"
          data-testid="button-refund-full"
        >
          Full ({formatUsdCents(order.totalCents)})
        </button>
      </div>
      <div className="flex items-start gap-2">
        <label className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500 w-16 mt-1.5">
          Reason
        </label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Optional — shown in Stripe / sent in Shopify refund note"
          rows={2}
          className="text-[12.5px]"
          data-testid="input-refund-reason"
        />
      </div>
      <div className="flex items-center gap-2 justify-end">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={mutation.isPending}
          data-testid="button-cancel-refund"
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          data-testid="button-submit-refund"
        >
          {mutation.isPending ? "Refunding…" : "Issue refund"}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900 min-w-0 truncate">{value}</dd>
    </>
  );
}
