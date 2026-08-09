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
import { formatUsdCents } from "@shared/money";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { AdminErrorBoundary, ErrorState } from "@/components/admin/AdminErrorBoundary";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AlertTriangle, Settings2, RefreshCw, Loader2, Gift } from "lucide-react";
import type { PayoutSettings, AlbumFormat } from "@shared/schema";
import { VinylPreview } from "@/components/VinylPreview";
import {
  DEFAULT_JACKET_UPGRADE,
  JACKET_UPGRADE_LABEL,
  resolveVinylColor,
  isVinylFormat,
  type JacketUpgrade,
} from "@shared/pressing";

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
  payoutStatus: string | null;
  payoutAmountCents: number | null;
  payoutError: string | null;
  payoutOwnerKind: string | null;
  payoutOwnerId: string | null;
  // Task #49 — order origin. "direct" | "shopify:<storeId>".
  origin?: string;
  items: {
    id: string;
    kind: string;
    sku: string;
    label: string;
    unitPriceCents: number;
    quantity: number;
    // Task #212 — pressing snapshot per item; null on non-vinyl rows.
    vinylColor?: string | null;
    jacketUpgrade?: JacketUpgrade | null;
    // Task #863 — custom ("Gift of Hope") add-on snapshot. fulfiller is
    // who ships it; orgName is the owning non-profit. Both null on
    // format / addon rows.
    fulfiller?: string | null;
    orgName?: string | null;
    // Task #2061 — per-recipient gift boxes for this custom_addon line.
    // PII fields only present when the viewer may see them (super_admin /
    // admin, or the owning non-profit); otherwise status-only.
    giftBoxes?: {
      id: string;
      position: number;
      mode: "foundation" | "known" | null;
      personalized: boolean;
      piiVisible: boolean;
      recipientName?: string | null;
      recipientPhone?: string | null;
      address1?: string | null;
      address2?: string | null;
      city?: string | null;
      zip?: string | null;
      state?: string | null;
      giverName?: string | null;
      message?: string | null;
    }[];
  }[];
  gift: GiftInfo | null;
  // Task #73 — Order Desk fulfillment lifecycle.
  skuKind?: string | null;
  fulfillmentStatus?: string | null;
  fulfillmentPartnerId?: string | null;
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

// Small operator-facing badge surfacing where a row came from. Direct
// orders stay unbadged; Shopify rows render the Shopify green so the
// admin can filter visually without reading the origin string.
// Task #216 — surfaces the worst non-overridden preflight status for
// this order's album in the queue chrome, so fulfillment sees pressing
// issues without opening the album. "Overridden" is its own tone so an
// admin who already justified the fail doesn't get re-prompted here.
function UploadValidationBadge({
  rollup,
  albumId,
}: {
  rollup: Record<string, string> | undefined;
  albumId: string;
}) {
  const status = rollup?.[albumId];
  if (!status || status === "pass") return null;
  const cls =
    status === "fail" ? "bg-[var(--apple-critical)]/10 text-[var(--apple-critical)]" :
    status === "warn" ? "bg-[var(--apple-warning)]/10 text-[var(--apple-warning)]" :
    "bg-[var(--apple-chip)] text-[var(--apple-subink)]"; // overridden
  const label = status === "overridden" ? "Preflight · overridden" : `Preflight · ${status}`;
  return (
    <span
      className={`px-2 py-0.5 rounded-full font-semibold uppercase ${cls}`}
      title="Click into the album's Sell tab to see per-rule details."
      data-testid={`pill-preflight-${albumId}`}
    >
      {label}
    </span>
  );
}

function OriginBadge({ origin }: { origin: string | undefined }) {
  // Only Shopify-sourced orders get the green pill. Everything else —
  // "direct", empty, and legacy import origins like "legacy:gogoods" —
  // stays unbadged. (Previously any non-"direct" origin rendered the
  // Shopify pill, which mislabeled all the gogoods-imported orders.)
  if (!origin || !origin.startsWith("shopify")) return null;
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
  if (g.claimed) return { label: "Gift · Claimed", cls: "bg-[var(--apple-chip)] text-[var(--apple-subink)]" };
  if (new Date(g.expiresAt).getTime() < Date.now()) return { label: "Gift · Expired", cls: "bg-[var(--apple-critical)]/10 text-[var(--apple-critical)]" };
  if (g.resendCount > 0) return { label: `Gift · Resent ×${g.resendCount}`, cls: "bg-[var(--apple-warning)]/10 text-[var(--apple-warning)]" };
  return { label: "Gift · Sent", cls: "bg-[var(--apple-blue)]/10 text-[var(--apple-blue)]" };
}

const STATUSES = ["all", "paid", "shipped", "refunded"] as const;
export type StatusFilter = (typeof STATUSES)[number];
const dollars = (c: number) => formatUsdCents(c);

// Task #73 fulfillment lifecycle — physical SKUs are the only ones that
// ever hand off to Order Desk, so they're the only rows that can carry a
// push failure. Mirror the FulfillmentTimeline gate.
function isPhysicalOrder(o: AdminOrderRow): boolean {
  return o.skuKind === "vinyl" || o.skuKind === "cassette" || o.skuKind === "cd" || o.skuKind === "bundle";
}

// A paid physical order with a recorded `fulfillmentError` never reached
// Order Desk — the push failed (or credentials weren't configured). We gate
// on `status === "paid"` so a refunded order that still carries a stale
// error doesn't read as a live fulfillment gap (refunds are nothing to push).
// The error is cleared on the next successful push (server/orderDesk.ts), so
// this flips back to false the moment the order is pushed, which is what
// clears the "needs attention" badge.
export function orderNeedsPush(o: AdminOrderRow): boolean {
  return o.status === "paid" && isPhysicalOrder(o) && !!o.fulfillmentError;
}

// Count of orders that need a (re)push — drives the alert badge. The badge
// only renders while this is > 0, so it clears itself the moment every error
// resolves (the server nulls `fulfillmentError` on a successful push).
export function countOrdersNeedingPush(orders: AdminOrderRow[]): number {
  return orders.filter(orderNeedsPush).length;
}

// The active list scope. Pure so the order pipeline (and its interaction
// with the needs-attention scope) is unit-testable without mounting the page.
export type OrderScope = {
  needsAttentionOnly: boolean;
  statusFilter: StatusFilter;
  fulfillerFilter: string;
};

export function applyOrderScope(orders: AdminOrderRow[], scope: OrderScope): AdminOrderRow[] {
  return orders
    .filter((o) => (scope.needsAttentionOnly ? orderNeedsPush(o) : true))
    .filter((o) => (scope.statusFilter === "all" ? true : o.status === scope.statusFilter))
    .filter((o) =>
      scope.fulfillerFilter === "all"
        ? true
        : o.items.some((it) => it.kind === "custom_addon" && it.fulfiller === scope.fulfillerFilter),
    );
}

// Toggling the alert badge. Enabling the needs-attention scope forces the
// status filter back to "all" so the failed-push rows can never be hidden
// behind an active paid/shipped/refunded filter; disabling leaves the
// operator's status filter untouched.
export function nextScopeOnNeedsAttentionToggle(current: {
  needsAttentionOnly: boolean;
  statusFilter: StatusFilter;
}): { needsAttentionOnly: boolean; statusFilter: StatusFilter } {
  const turningOn = !current.needsAttentionOnly;
  return {
    needsAttentionOnly: turningOn,
    statusFilter: turningOn ? "all" : current.statusFilter,
  };
}

export function AdminOrders() {
  return (
    <AdminErrorBoundary title="Orders failed to render">
      <AdminOrdersInner />
    </AdminErrorBoundary>
  );
}

function AdminOrdersInner() {
  const [filter, setFilter] = useState<StatusFilter>("all");
  // Task #863 — filter the queue to orders carrying a custom add-on
  // fulfilled by the selected party. "all" = no fulfiller filter.
  const [fulfillerFilter, setFulfillerFilter] = useState<string>("all");
  // Task #1919 — scope the list to physical orders whose Order Desk push
  // failed (non-null fulfillmentError). Toggled by the alert badge, or
  // deep-linked from the Dashboard "failed to reach fulfillment" chip via
  // `/admin/orders?needsPush=1`.
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return new URLSearchParams(window.location.search).get("needsPush") === "1";
    } catch {
      return false;
    }
  });
  const [showSettings, setShowSettings] = useState(false);
  const { toast } = useToast();
  const {
    data: orders,
    isLoading,
    isError: ordersError,
    error: ordersErrorObj,
    refetch: refetchOrders,
  } = useQuery<AdminOrderRow[]>({
    queryKey: ["/api/admin/orders"],
    // Task #1782 — auto-refresh the queue so a fresh sale lands in front
    // of the operator without a manual reload. 15s is frequent enough to
    // feel live but light on the API. `refetchIntervalInBackground` stays
    // false (the TanStack default) so the timer pauses whenever the tab is
    // hidden/backgrounded. We also pause while the payout-settings popover
    // is open so a background refresh can't reorder the list out from under
    // an operator who's mid-edit.
    refetchInterval: showSettings ? false : 15_000,
    refetchIntervalInBackground: false,
  });
  const { data: stuck } = useQuery<AdminOrderRow[]>({ queryKey: ["/api/admin/payouts/stuck"] });
  // Task #216 — per-album worst preflight status, used by the pill in
  // each order row. One query for the whole queue (not per-row).
  const { data: preflightRollup } = useQuery<Record<string, string>>({
    queryKey: ["/api/admin/upload-validations/rollup"],
  });

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


  // Task #863 — the set of distinct fulfillers across every custom
  // add-on line, so we can offer a "who ships this" filter only when
  // there's actually something to filter by.
  const fulfillers = Array.from(
    new Set(
      (orders ?? [])
        .flatMap((o) => o.items)
        .filter((it) => it.kind === "custom_addon" && it.fulfiller)
        .map((it) => it.fulfiller as string),
    ),
  ).sort((a, b) => a.localeCompare(b));

  // Task #1919 — count of physical orders whose push to Order Desk failed.
  // Drives the alert badge + clears itself the moment every error resolves.
  const needsPushCount = countOrdersNeedingPush(orders ?? []);
  // Once every push failure resolves the badge disappears; drop the scope
  // too so the operator isn't left staring at an empty filtered list.
  useEffect(() => {
    if (needsAttentionOnly && needsPushCount === 0) setNeedsAttentionOnly(false);
  }, [needsAttentionOnly, needsPushCount]);

  const filtered = applyOrderScope(orders ?? [], {
    needsAttentionOnly,
    statusFilter: filter,
    fulfillerFilter,
  });

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
    // A deep-linked order must never be hidden by the needs-attention scope.
    if (focusOrderId && needsAttentionOnly) setNeedsAttentionOnly(false);
  }, [focusOrderId, filter, needsAttentionOnly]);
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
    <AdminFrame active="fan-orders">
      <div className="max-w-5xl mx-auto py-8" data-testid="page-admin-orders">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-[var(--apple-ink)]">Orders.</h1>
            <p className="text-[var(--apple-subink)] text-[13px] font-medium">Physical fulfillment and refund tracking.</p>
          </div>
          <div className="flex items-center gap-2">
            {needsPushCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  const next = nextScopeOnNeedsAttentionToggle({
                    needsAttentionOnly,
                    statusFilter: filter,
                  });
                  setFilter(next.statusFilter);
                  setNeedsAttentionOnly(next.needsAttentionOnly);
                }}
                aria-pressed={needsAttentionOnly}
                className={`h-8 px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                  needsAttentionOnly
                    ? "bg-[var(--apple-critical)] text-white hover:bg-[var(--apple-critical)]/90"
                    : "bg-[var(--apple-critical)]/10 text-[var(--apple-critical)] hover:bg-[var(--apple-critical)]/15"
                }`}
                data-testid="button-needs-attention"
                title="These physical orders failed to push to Order Desk. Click to filter the list to just them."
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {needsPushCount} {needsPushCount === 1 ? "order needs" : "orders need"} push
              </button>
            )}
            <Link
              href="/admin/print-queue"
              className="h-8 px-3 rounded-full border border-[var(--apple-hairline)] bg-white text-[var(--apple-ink)] text-[12px] font-medium hover:bg-[var(--apple-track)] inline-flex items-center gap-1.5"
              data-testid="link-print-queue"
            >
              Print queue
            </Link>
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="h-8 px-3 rounded-full border border-[var(--apple-hairline)] bg-white text-[var(--apple-ink)] text-[12px] font-medium hover:bg-[var(--apple-track)] inline-flex items-center gap-1.5"
              data-testid="button-payout-settings"
            >
              <Settings2 className="w-3.5 h-3.5" /> Payout settings
            </button>
            {fulfillers.length > 0 && (
              <div className="relative inline-flex items-center">
                <Gift className="w-3.5 h-3.5 text-[var(--apple-ready)] absolute left-2.5 pointer-events-none" />
                <select
                  value={fulfillerFilter}
                  onChange={(e) => setFulfillerFilter(e.target.value)}
                  className="h-8 pl-7 pr-3 rounded-full border border-[var(--apple-hairline)] bg-white text-[var(--apple-ink)] text-xs font-medium hover:bg-[var(--apple-track)]"
                  data-testid="filter-fulfiller"
                  title="Show only orders with a custom add-on this party fulfills"
                >
                  <option value="all">All fulfillers</option>
                  {fulfillers.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex p-0.5 rounded-full bg-[var(--apple-track)]">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-3 py-1 rounded-full text-[12px] font-medium capitalize ${
                    filter === s ? "bg-white shadow-sm text-[var(--apple-ink)]" : "text-[var(--apple-subink)]"
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

        {isLoading && <div className="text-[var(--apple-subink)] text-sm" data-testid="admin-orders-loading">Loading…</div>}
        {ordersError && (
          <ErrorState
            error={ordersErrorObj}
            onRetry={() => refetchOrders()}
            title="Couldn't load orders"
            testId="admin-orders-error"
          />
        )}
        {!isLoading && !ordersError && filtered.length === 0 && (
          <Card className="rounded-2xl shadow-none" data-testid="admin-orders-empty">
            <AdminEmptyState>No orders yet — when fans buy, they'll show up here.</AdminEmptyState>
          </Card>
        )}

        <Card className="rounded-2xl shadow-none divide-y divide-[var(--apple-hairline)] overflow-hidden">
          {filtered.map((o) => {
            const isFocus = focusOrderId === o.id;
            return (
            <div
              key={o.id}
              ref={isFocus ? focusedRef : undefined}
              className={[
                "px-4 py-4 flex items-start gap-4 transition-colors",
                isFocus ? "bg-[var(--brand-blue)]/5 ring-2 ring-inset ring-[var(--brand-blue)]/40" : "",
              ].join(" ")}
              data-testid={`row-admin-order-${o.id}`}
              data-focused={isFocus ? "true" : undefined}
            >
              {(() => {
                // Task #212 — if any line item is a pressed vinyl, lead
                // the row with the colored VinylPreview so Bill can scan
                // color/jacket without opening every order. Falls back
                // to plain artwork for non-vinyl orders.
                const vinylItem = o.items.find(
                  (it) => it.kind === "format" && isVinylFormat(it.sku as AlbumFormat),
                );
                if (vinylItem) {
                  const color = resolveVinylColor(vinylItem.vinylColor);
                  return (
                    <div className="flex-shrink-0" data-testid={`admin-order-vinyl-preview-${o.id}`}>
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
                  <img
                    src={o.albumArtwork}
                    alt=""
                    className="w-16 h-16 rounded-md object-cover border border-[var(--apple-hairline)] flex-shrink-0"
                    data-testid={`admin-order-artwork-${o.id}`}
                  />
                ) : null;
              })()}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] flex-wrap">
                  <span className={[
                    "px-2 py-0.5 rounded-full font-semibold uppercase",
                    o.status === "paid" ? "bg-[var(--apple-ready)]/10 text-[var(--apple-ready)]" :
                    o.status === "shipped" ? "bg-[var(--apple-blue)]/10 text-[var(--apple-blue)]" :
                    o.status === "refunded" ? "bg-[var(--apple-critical)]/10 text-[var(--apple-critical)]" :
                    "bg-[var(--apple-track)] text-[var(--apple-subink)]",
                  ].join(" ")}>{o.status}</span>
                  <OriginBadge origin={o.origin} />
                  <UploadValidationBadge rollup={preflightRollup} albumId={o.albumId} />
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
                    <span className="text-[var(--apple-faint)]">#{o.goodDeedNumber}</span>
                  )}
                  <span className="text-[var(--apple-faint)]">{new Date(o.createdAt).toLocaleDateString()}</span>
                </div>
                {o.gift && (
                  <div className="text-[11.5px] text-[var(--apple-subink)] mt-1.5 leading-snug" data-testid={`text-gift-${o.id}`}>
                    Gift to <span className="text-[var(--apple-ink)] font-medium">{o.gift.recipientFirstName} {o.gift.recipientLastName}</span>
                    {o.gift.recipientEmail && <> · {o.gift.recipientEmail}</>}
                    {o.gift.recipientPhone && <> · {o.gift.recipientPhone}</>}
                  </div>
                )}
                <div className="text-[14px] font-medium text-[var(--apple-ink)] mt-1">
                  <Link href={`/admin/albums/${o.albumId}`} className="hover:text-[var(--brand-blue)] hover:underline underline-offset-2 transition-colors">
                    {o.albumTitle}
                  </Link>
                  <span className="text-[var(--apple-faint)]"> · </span>
                  <span className="text-[var(--apple-subink)]">{o.albumArtist}</span>
                </div>
                {/* Task #131 — Cross-link into the Customers directory.
                    Only orders with a real customerId get the link;
                    guest / orphan orders keep their snapshot text as
                    plain copy so we don't navigate to a 404. */}
                <div className="text-[12.5px] text-[var(--apple-subink)] mt-0.5">
                  {o.customerId ? (
                    <Link
                      href={`/admin/customers/${o.customerId}?from=partner&backHref=${encodeURIComponent("/admin/orders")}&backName=${encodeURIComponent("Orders")}`}
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
                  {o.items.map((it) =>
                    it.kind === "custom_addon" ? (
                      <span
                        key={it.id}
                        className="text-xs px-2 py-0.5 rounded-full bg-[var(--apple-ready)]/10 text-[var(--apple-ready)] font-semibold inline-flex items-center gap-1"
                        data-testid={`pill-custom-addon-${it.id}`}
                      >
                        <Gift className="w-3 h-3" />
                        {it.label}
                      </span>
                    ) : (
                      <span key={it.id} className="text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--apple-track)] text-[var(--apple-subink)]">
                        {it.label}
                      </span>
                    ),
                  )}
                </div>
                {/* Task #863 — custom ("Gift of Hope") add-on detail. The
                    party shipping a non-profit add-on isn't the press or
                    the artist, so call out the add-on name, owning
                    non-profit, and the snapshotted fulfiller so whoever
                    owes the physical item can see it without opening the
                    order. */}
                {(() => {
                  const addonLines = o.items.filter((it) => it.kind === "custom_addon");
                  if (addonLines.length === 0) return null;
                  return (
                    <div className="mt-2 flex flex-col gap-2" data-testid={`admin-order-custom-addons-${o.id}`}>
                      {addonLines.map((it) => (
                        <div
                          key={`custom-addon-line-${it.id}`}
                          className="flex items-start gap-2.5 rounded-xl border border-[var(--apple-ready)]/20 bg-[var(--apple-ready)]/[0.06] px-2.5 py-2"
                          data-testid={`admin-order-custom-addon-line-${it.id}`}
                        >
                          <Gift className="w-4 h-4 text-[var(--apple-ready)] mt-0.5 flex-shrink-0" />
                          <div className="min-w-0 flex-1 text-[12px] leading-snug">
                            <div className="font-medium text-[var(--apple-ink)]">
                              {it.label}
                              {it.quantity > 1 && <span className="text-[var(--apple-subink)]"> · ×{it.quantity}</span>}
                            </div>
                            <div className="text-[var(--apple-subink)]">
                              {it.orgName ? (
                                <span data-testid={`text-addon-org-${it.id}`}>{it.orgName}</span>
                              ) : (
                                <span className="text-[var(--apple-faint)]">Non-profit removed</span>
                              )}
                              <span className="text-[var(--apple-faint)]"> · </span>
                              <span data-testid={`text-addon-fulfiller-${it.id}`}>
                                Fulfilled by{" "}
                                <span className="font-medium text-[var(--apple-ready)]">
                                  {it.fulfiller || "Unassigned"}
                                </span>
                              </span>
                            </div>
                            {/* Task #2061 — per-recipient gift boxes. Status is
                                always shown; recipient PII appears only when the
                                server marked the box visible to this viewer. */}
                            {it.giftBoxes && it.giftBoxes.length > 0 && (
                              <div className="mt-1.5 flex flex-col gap-1.5" data-testid={`admin-gift-boxes-${it.id}`}>
                                {it.giftBoxes.map((b) => {
                                  const addr = [b.address1, b.address2].filter(Boolean).join(", ");
                                  const cityLine = [b.city, b.state, b.zip].filter(Boolean).join(" ");
                                  return (
                                    <div
                                      key={b.id}
                                      className="rounded-lg border border-[var(--apple-hairline)] bg-white px-2 py-1.5"
                                      data-testid={`admin-gift-box-${b.id}`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-medium text-[var(--apple-ink)]">Gift {b.position}</span>
                                        <span
                                          className={`text-xs px-1.5 py-0.5 rounded-full ${
                                            b.personalized
                                              ? "bg-[var(--apple-ready)]/10 text-[var(--apple-ready)]"
                                              : "bg-[var(--apple-track)] text-[var(--apple-subink)]"
                                          }`}
                                          data-testid={`admin-gift-box-status-${b.id}`}
                                        >
                                          {b.personalized
                                            ? b.mode === "foundation"
                                              ? "Foundation chooses"
                                              : "Recipient added"
                                            : "Awaiting recipient"}
                                        </span>
                                      </div>
                                      {b.mode === "known" &&
                                        (b.piiVisible ? (
                                          <div className="mt-1 text-[var(--apple-subink)]" data-testid={`admin-gift-box-pii-${b.id}`}>
                                            <div className="font-medium text-[var(--apple-ink)]">{b.recipientName || "—"}</div>
                                            {b.recipientPhone && <div>{b.recipientPhone}</div>}
                                            {addr && <div>{addr}</div>}
                                            {cityLine && <div>{cityLine}</div>}
                                            {b.giverName && <div className="text-[var(--apple-subink)]">From {b.giverName}</div>}
                                            {b.message && <div className="text-[var(--apple-subink)] italic">“{b.message}”</div>}
                                          </div>
                                        ) : (
                                          <div className="mt-1 text-[var(--apple-faint)]" data-testid={`admin-gift-box-pii-hidden-${b.id}`}>
                                            Recipient details hidden
                                          </div>
                                        ))}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* Task #212 — per-vinyl-line detail. Mirrors the fan-side
                    Orders detail layout: jacket + colored disc on the left,
                    color name + jacket upgrade + format label on the right. */}
                {(() => {
                  const vinylLines = o.items.filter(
                    (it) => it.kind === "format" && isVinylFormat(it.sku as AlbumFormat),
                  );
                  if (vinylLines.length === 0) return null;
                  return (
                    <div className="mt-2 flex flex-col gap-2" data-testid={`admin-order-vinyl-lines-${o.id}`}>
                      {vinylLines.map((it) => {
                        const color = resolveVinylColor(it.vinylColor);
                        const jacket = it.jacketUpgrade ?? DEFAULT_JACKET_UPGRADE;
                        return (
                          <div
                            key={`vinyl-line-${it.id}`}
                            className="flex items-center gap-3 rounded-xl border border-[var(--apple-hairline)] bg-white px-2.5 py-2"
                            data-testid={`admin-order-vinyl-line-${it.id}`}
                          >
                            <div className="flex-shrink-0">
                              <VinylPreview
                                artworkUrl={o.albumArtwork}
                                color={color}
                                jacketUpgrade={jacket}
                                size="sm"
                              />
                            </div>
                            <div className="min-w-0 flex-1 text-[12px] leading-snug">
                              <div className="font-medium text-[var(--apple-ink)]">{it.label}</div>
                              <div className="text-[var(--apple-subink)]">
                                {color.name}
                                <span className="text-[var(--apple-faint)]"> · </span>
                                {JACKET_UPGRADE_LABEL[jacket]}
                                {it.quantity > 1 && (
                                  <>
                                    <span className="text-[var(--apple-faint)]"> · </span>
                                    ×{it.quantity}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {o.shippingAddress && (
                  <div className="text-[11.5px] text-[var(--apple-subink)] mt-1.5 leading-snug">
                    Ship to: {o.shippingName ?? o.customerName ?? "—"},{" "}
                    {[o.shippingAddress.line1, o.shippingAddress.line2, o.shippingAddress.city, o.shippingAddress.state, o.shippingAddress.postalCode, o.shippingAddress.country].filter(Boolean).join(", ")}
                  </div>
                )}
                {o.payoutError && (
                  <div className="text-[11.5px] text-[var(--apple-critical)] mt-1.5" data-testid={`text-payout-error-${o.id}`}>
                    Payout error: {o.payoutError}
                  </div>
                )}
                <FulfillmentTimeline order={o} />
              </div>
              <div className="text-right">
                <div className="text-[14px] font-semibold tabular-nums text-[var(--apple-ink)]">{dollars(o.totalCents)}</div>
                {o.status === "paid" && (
                  <button
                    type="button"
                    onClick={() => ship.mutate(o.id)}
                    disabled={ship.isPending}
                    className="mt-2 px-3 py-1 rounded-full text-[12px] font-medium bg-[var(--brand-blue)] text-white hover:bg-[var(--brand-blue-hover)] disabled:opacity-50"
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
                    className="mt-2 ml-2 px-3 py-1 rounded-full text-[12px] font-medium border border-[var(--apple-hairline)] bg-white text-[var(--apple-ink)] hover:bg-[var(--apple-track)] disabled:opacity-50"
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
                    className="mt-2 ml-2 px-3 py-1 rounded-full text-[12px] font-medium border border-[var(--apple-hairline)] bg-white text-[var(--apple-ink)] hover:bg-[var(--apple-track)] disabled:opacity-50"
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
                    className="mt-2 px-3 py-1 rounded-full text-[12px] font-medium bg-[var(--apple-warning)]/10 text-[var(--apple-warning)] hover:bg-[var(--apple-warning)]/15 disabled:opacity-50 inline-flex items-center gap-1.5"
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
        </Card>
      </div>
    </AdminFrame>
  );
}

// Task #73 — Order Desk fulfillment lifecycle strip. Only renders for
// physical orders (skuKind ∈ vinyl/cassette/cd/bundle). Shows the
// submitted → in-fulfillment → shipped → delivered (or cancelled /
// returned) progression with the inbound tracking link when OD has
// emitted it.
function FulfillmentTimeline({ order: o }: { order: AdminOrderRow }) {
  const { toast } = useToast();
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
    status === "delivered" ? "bg-[var(--apple-ready)]/10 text-[var(--apple-ready)]" :
    status === "shipped" ? "bg-[var(--apple-blue)]/10 text-[var(--apple-blue)]" :
    status === "in_fulfillment" ? "bg-[var(--apple-blue)]/10 text-[var(--apple-blue)]" :
    status === "submitted" ? "bg-[var(--apple-chip)] text-[var(--apple-subink)]" :
    status === "cancelled" || status === "returned" ? "bg-[var(--apple-critical)]/10 text-[var(--apple-critical)]" :
    "bg-[var(--apple-warning)]/10 text-[var(--apple-warning)]";

  // Show a retry push button when the order hasn't reached OD yet.
  const needsPush = isPhysical && !o.orderDeskOrderId && (status === "pending" || !o.fulfillmentStatus);
  const retryPush = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/orders/${o.id}/orderdesk-push`, {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Push failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data: { orderDeskOrderId?: string }) => {
      toast({ title: "Pushed to Order Desk", description: data.orderDeskOrderId ? `OD #${data.orderDeskOrderId}` : undefined });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
    },
    onError: (e: any) => toast({ title: "Push failed", description: e?.message, variant: "destructive" }),
  });

  // Task #2818 — on-demand Order Desk status refresh for orders that have
  // reached OD; pulls the freshest status when a webhook was missed.
  const canRefreshOd = isPhysical && !!o.orderDeskOrderId;
  const odRefresh = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/orders/${o.id}/orderdesk-refresh`, {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `Refresh failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data: { changed?: boolean }) => {
      toast({ title: data.changed ? "Status updated from Order Desk" : "Already up to date" });
      if (data.changed) queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
    },
    onError: (e: any) => toast({ title: "Refresh failed", description: e?.message, variant: "destructive" }),
  });

  // Task #1976 — deliberate "Push to Odoo" action, parallel to "Push to OD".
  // No auto-push: an order only reaches Odoo when the operator clicks this.
  const needsOdooPush = isPhysical && !o.odooOrderId;
  const odooPush = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/orders/${o.id}/odoo-push`, {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Push failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data: { odooOrderId?: string }) => {
      toast({ title: "Pushed to Odoo", description: data.odooOrderId ? `Odoo #${data.odooOrderId}` : undefined });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
    },
    onError: (e: any) => toast({ title: "Push to Odoo failed", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="mt-2 rounded-xl bg-[var(--apple-track)] border border-[var(--apple-hairline)] px-2.5 py-2" data-testid={`fulfillment-timeline-${o.id}`}>
      <div className="flex items-center gap-2 text-[11px] flex-wrap">
        <span className={`px-2 py-0.5 rounded-full font-semibold uppercase ${tone}`} data-testid={`pill-fulfillment-${o.id}`}>
          {status.replace("_", " ")}
        </span>
        {o.orderDeskOrderId && (
          <span className="text-[var(--apple-faint)]" data-testid={`text-od-id-${o.id}`}>OD #{o.orderDeskOrderId}</span>
        )}
        {canRefreshOd && (
          <button
            type="button"
            onClick={() => odRefresh.mutate()}
            disabled={odRefresh.isPending}
            title="Refresh status from Order Desk"
            className="px-1.5 py-0.5 rounded-full border border-[var(--apple-hairline)] text-[var(--apple-subink)] hover:bg-[var(--apple-track)] disabled:opacity-60 inline-flex items-center gap-1 text-xs font-semibold"
            data-testid={`button-od-refresh-${o.id}`}
          >
            {odRefresh.isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
            Refresh
          </button>
        )}
        {o.odooOrderId && (
          <span className="text-[var(--apple-faint)]" data-testid={`text-odoo-id-${o.id}`}>Odoo #{o.odooOrderId}</span>
        )}
        {(o.carrier || o.trackingNumber) && (
          <span className="text-[var(--apple-subink)]">
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
        {needsPush && (
          <button
            type="button"
            onClick={() => retryPush.mutate()}
            disabled={retryPush.isPending}
            className="ml-auto px-2 py-0.5 rounded-full bg-[var(--apple-warning)]/10 text-[var(--apple-warning)] text-[10.5px] font-semibold hover:bg-[var(--apple-warning)]/15 disabled:opacity-60 inline-flex items-center gap-1"
            data-testid={`button-push-od-${o.id}`}
          >
            {retryPush.isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
            Push to OD
          </button>
        )}
        {needsOdooPush && (
          <button
            type="button"
            onClick={() => odooPush.mutate()}
            disabled={odooPush.isPending}
            className={`${needsPush ? "" : "ml-auto "}px-2 py-0.5 rounded-full border border-[var(--apple-hairline)] bg-white text-[var(--apple-ink)] text-xs font-semibold hover:bg-[var(--apple-track)] disabled:opacity-60 inline-flex items-center gap-1`}
            data-testid={`button-push-odoo-${o.id}`}
          >
            {odooPush.isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
            Push to Odoo
          </button>
        )}
      </div>
      {o.fulfillmentError && needsPush && (
        <div className="mt-1 text-[10.5px] text-[var(--apple-warning)]" data-testid={`text-push-error-${o.id}`}>
          Error: {o.fulfillmentError}
        </div>
      )}
      <div className="flex items-center gap-3 mt-1.5 text-[10.5px] text-[var(--apple-subink)] flex-wrap">
        {stages.map((s) => (
          <span key={s.key} className={s.at ? "text-[var(--apple-ink)] font-medium" : "text-[var(--apple-faint)]"}>
            {s.label}{s.at ? ` · ${new Date(s.at).toLocaleDateString()}` : ""}
          </span>
        ))}
        {o.cancelledAt && (
          <span className="text-[var(--apple-critical)] font-medium">Cancelled · {new Date(o.cancelledAt).toLocaleDateString()}</span>
        )}
        {o.returnedAt && (
          <span className="text-[var(--apple-critical)] font-medium">Returned · {new Date(o.returnedAt).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
}

function PayoutChip({ status, amountCents }: { status: string; amountCents: number | null }) {
  const tone =
    status === "transferred"
      ? "bg-[var(--apple-ready)]/10 text-[var(--apple-ready)]"
      : status === "reversed"
      ? "bg-[var(--apple-chip)] text-[var(--apple-subink)]"
      : status === "skipped"
      ? "bg-[var(--apple-warning)]/10 text-[var(--apple-warning)]"
      : status === "failed"
      ? "bg-[var(--apple-critical)]/10 text-[var(--apple-critical)]"
      : "bg-[var(--apple-chip)] text-[var(--apple-subink)]";
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
    <section className="rounded-2xl border border-[var(--apple-warning)]/30 bg-[var(--apple-warning-wash)] p-4 mb-4" data-testid="panel-stuck-payouts">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-[var(--apple-warning)]" />
        <h2 className="text-[var(--apple-warning)] text-[11px] font-semibold uppercase tracking-wider">
          Stuck payouts ({rows.length})
        </h2>
      </div>
      <div className="space-y-2">
        {rows.map((o) => (
          <div
            key={o.id}
            className="rounded-xl bg-white border border-[var(--apple-hairline)] px-3 py-2 flex items-center gap-3 text-[12.5px]"
            data-testid={`row-stuck-${o.id}`}
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[var(--apple-ink)] truncate">
                {o.albumTitle} <span className="text-[var(--apple-faint)]">·</span>{" "}
                <span className="text-[var(--apple-subink)]">{o.albumArtist}</span>
              </div>
              <div className="text-[var(--apple-subink)] text-[11.5px]">
                Order {o.id.slice(0, 8)} · shipped {o.shippedAt ? new Date(o.shippedAt).toLocaleDateString() : "—"} ·{" "}
                <span className="text-[var(--apple-warning)] font-medium">{o.payoutStatus ?? "no-status"}</span>
                {o.payoutError && <span className="text-[var(--apple-critical)]"> — {o.payoutError}</span>}
              </div>
            </div>
            <div className="font-semibold tabular-nums text-[var(--apple-ink)]">{dollars(o.totalCents)}</div>
            <button
              type="button"
              onClick={() => onRetry(o.id)}
              disabled={isRetrying}
              className="h-8 px-3 rounded-full bg-[var(--apple-warning)]/10 text-[var(--apple-warning)] text-[12px] font-semibold hover:bg-[var(--apple-warning)]/15 disabled:opacity-60 inline-flex items-center gap-1.5"
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
    <Card className="rounded-2xl shadow-none p-4 mb-4 space-y-3" data-testid="panel-payout-settings">
      <div className="flex items-center justify-between">
        <h2 className="text-[var(--apple-ink)] text-[13px] font-semibold">Payout settings</h2>
        <button type="button" onClick={onClose} className="text-[var(--apple-subink)] hover:text-[var(--apple-ink)] text-[12px]">Close</button>
      </div>
      {isLoading ? (
        <div className="text-[var(--apple-faint)] text-[12px]">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-[var(--apple-subink)] text-[11px] font-semibold uppercase tracking-wider">Platform fee %</span>
            <input
              type="number"
              min={0}
              max={100}
              placeholder={String(currentFee)}
              value={feePct}
              onChange={(e) => setFeePct(e.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-lg border border-[var(--apple-hairline)] text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
              data-testid="input-platform-fee-pct"
            />
            <p className="text-[var(--apple-faint)] text-[11px] mt-1">Currently {currentFee}%. Applied off the top of every paid order.</p>
          </label>
          <label className="block">
            <span className="text-[var(--apple-subink)] text-[11px] font-semibold uppercase tracking-wider">Cert cost (cents)</span>
            <input
              type="number"
              min={0}
              placeholder={String(currentCert)}
              value={certCents}
              onChange={(e) => setCertCents(e.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-lg border border-[var(--apple-hairline)] text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
              data-testid="input-cert-cost-cents"
            />
            <p className="text-[var(--apple-faint)] text-[11px] mt-1">Currently {dollars(currentCert)}. Subtracted before the artist split when a signed cert is in the order.</p>
          </label>
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending || (feePct === "" && certCents === "")}
          className="h-9 px-4 rounded-full bg-[var(--brand-blue)] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-60"
          data-testid="button-save-payout-settings"
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </Card>
  );
}
