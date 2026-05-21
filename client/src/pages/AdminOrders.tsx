// AdminOrders — operator-facing orders list with status filters +
// shipping action (Task #44, step 11). Admin-only.
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  items: { id: string; kind: string; sku: string; label: string; unitPriceCents: number; quantity: number }[];
  gift: GiftInfo | null;
};

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
  const { toast } = useToast();
  const { data: orders, isLoading } = useQuery<AdminOrderRow[]>({ queryKey: ["/api/admin/orders"] });

  const ship = useMutation({
    mutationFn: async (orderId: string) => {
      await apiRequest("POST", `/api/admin/orders/${orderId}/ship`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: "Marked shipped" });
    },
    onError: (e: any) => toast({ title: "Couldn't update", description: e?.message, variant: "destructive" }),
  });

  // Task #46 — operator-driven resend. The buyer can also do this from
  // their own order list, but admin support sometimes needs to do it for
  // a confused fan ("I lost the text") without making them open the app.
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

  const filtered = (orders ?? []).filter((o) => (filter === "all" ? true : o.status === filter));

  return (
    <main className="min-h-screen bg-slate-50" data-testid="page-admin-orders">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[22px] font-semibold text-slate-900">Orders</h1>
            <p className="text-slate-500 text-[13px]">Physical fulfillment + refund tracking.</p>
          </div>
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

        {isLoading && <div className="text-slate-500 text-sm" data-testid="admin-orders-loading">Loading…</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center" data-testid="admin-orders-empty">
            <div className="text-slate-700 font-medium">No orders</div>
            <div className="text-slate-500 text-[13px] mt-1">When fans buy, they'll show up here.</div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
          {filtered.map((o) => (
            <div key={o.id} className="px-4 py-4 flex items-center gap-4" data-testid={`row-admin-order-${o.id}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] flex-wrap">
                  <span className={[
                    "px-2 py-0.5 rounded-full font-semibold uppercase",
                    o.status === "paid" ? "bg-emerald-50 text-emerald-700" :
                    o.status === "shipped" ? "bg-sky-50 text-sky-700" :
                    o.status === "refunded" ? "bg-rose-50 text-rose-700" :
                    "bg-slate-100 text-slate-600",
                  ].join(" ")}>{o.status}</span>
                  {o.gift && (() => {
                    const s = giftStatus(o.gift);
                    return (
                      <span className={`px-2 py-0.5 rounded-full font-semibold uppercase ${s.cls}`} data-testid={`pill-gift-${o.id}`}>
                        {s.label}
                      </span>
                    );
                  })()}
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
                  <Link href={`/admin/albums/${o.albumId}`} className="hover:text-[#319ED8] hover:underline underline-offset-2 transition-colors">
                    {o.albumTitle}
                  </Link>
                  <span className="text-slate-400"> · </span>
                  <span className="text-slate-600">{o.albumArtist}</span>
                </div>
                <div className="text-[12.5px] text-slate-500 mt-0.5">
                  {(o.customerName || o.customerEmail) + (o.customerName && o.customerEmail ? ` · ${o.customerEmail}` : "")}
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
              </div>
              <div className="text-right">
                <div className="text-[14px] font-semibold text-slate-900">{dollars(o.totalCents)}</div>
                {o.status === "paid" && (
                  <button
                    type="button"
                    onClick={() => ship.mutate(o.id)}
                    disabled={ship.isPending}
                    className="mt-2 px-3 py-1 rounded-md text-[12px] font-medium bg-[#319ED8] text-white hover:bg-[#2a8cc1] disabled:opacity-50"
                    data-testid={`button-ship-${o.id}`}
                  >
                    Mark shipped
                  </button>
                )}
                {o.gift && !o.gift.claimed && new Date(o.gift.expiresAt).getTime() > Date.now() && (
                  <button
                    type="button"
                    onClick={() => resendGift.mutate(o.id)}
                    disabled={resendGift.isPending}
                    className="mt-2 ml-2 px-3 py-1 rounded-md text-[12px] font-medium bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-200 disabled:opacity-50"
                    data-testid={`button-resend-gift-${o.id}`}
                  >
                    Resend link
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
