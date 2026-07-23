// Task #2818 — Fulfillment-partner Orders + Inbound panels.
// Shared between the invited-partner portal (VendorPortal fulfillment
// shell) and the super-admin mirror tabs on AdminFulfillmentPartner —
// one component so the two surfaces can't drift. Light admin slate theme.

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PackageOpen, RefreshCw, Truck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface FulfillmentOrderRow {
  id: string;
  albumId: string;
  albumTitle: string;
  albumArtist: string | null;
  albumArtwork: string | null;
  skuKind: string | null;
  quantity: number;
  fulfillmentStatus: string | null;
  orderDeskOrderId: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shipCity: string | null;
  shipState: string | null;
  shipCountry: string | null;
  createdAt: string | null;
  submittedToFulfillmentAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export interface FulfillmentInboundRow {
  id: string;
  albumId: string;
  albumTitle: string;
  albumArtist: string | null;
  albumArtwork: string | null;
  format: string | null;
  pressName: string | null;
  vinylColor: string | null;
  quantity: number;
  approvedAt: string | null;
  expectedArrivalAt: string | null;
  expectedArrivalSource: "override" | "press_turn_time" | "default" | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function fulfillmentStatusPill(status: string | null, id: string) {
  const s = status ?? "pending";
  const cls =
    s === "shipped" || s === "delivered"
      ? "bg-sky-50 text-sky-700"
      : s === "in_fulfillment"
        ? "bg-amber-50 text-amber-700"
        : s === "submitted"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-600";
  return (
    <span
      className={`px-2 py-0.5 rounded-full font-semibold uppercase text-xs whitespace-nowrap ${cls}`}
      data-testid={`status-fulfillment-${id}`}
    >
      {s.replace(/_/g, " ")}
    </span>
  );
}

function ArtThumb({ src, title }: { src: string | null; title: string }) {
  return src ? (
    <img src={src} alt={title} className="w-9 h-9 rounded-md object-cover ring-1 ring-slate-200 flex-shrink-0" />
  ) : (
    <span className="w-9 h-9 rounded-md bg-slate-100 ring-1 ring-slate-200 inline-flex items-center justify-center flex-shrink-0">
      <PackageOpen className="w-4 h-4 text-slate-300" />
    </span>
  );
}

/** Fan orders routed to this warehouse. `canRefreshOd` shows a per-row
 * "Refresh from Order Desk" action — super-admin mirror only (the route
 * is operator-gated server-side). */
export function FulfillmentOrdersPanel({ partnerId, canRefreshOd = false }: { partnerId: string; canRefreshOd?: boolean }) {
  const { toast } = useToast();
  const { data: rows, isLoading } = useQuery<FulfillmentOrderRow[]>({
    queryKey: ["/api/fulfillment", partnerId, "orders"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/fulfillment/${partnerId}/orders`);
      return r.json();
    },
  });
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const refresh = useMutation({
    mutationFn: async (orderId: string) => {
      setRefreshingId(orderId);
      const r = await apiRequest("POST", `/api/admin/orders/${orderId}/orderdesk-refresh`);
      return r.json() as Promise<{ ok: boolean; changed: boolean }>;
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["/api/fulfillment", partnerId, "orders"] });
      toast({ title: d.changed ? "Updated from Order Desk" : "Already up to date" });
    },
    onError: (e: any) => toast({ title: "Couldn't refresh", description: e?.message, variant: "destructive" }),
    onSettled: () => setRefreshingId(null),
  });

  if (isLoading) {
    return <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Loading orders…</div>;
  }
  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-10 text-center" data-testid="empty-fulfillment-orders">
        <Truck className="w-7 h-7 text-slate-300 mx-auto" strokeWidth={1.5} />
        <p className="mt-2 text-sm font-semibold text-slate-600">No orders routed here yet</p>
        <p className="mt-1 text-xs text-slate-400">Fan orders appear as soon as they're routed to this warehouse.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden" data-testid="panel-fulfillment-orders">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-200">
              <th className="px-4 py-2.5 font-semibold">Release</th>
              <th className="px-3 py-2.5 font-semibold">Qty</th>
              <th className="px-3 py-2.5 font-semibold">Destination</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Tracking</th>
              <th className="px-3 py-2.5 font-semibold">Ordered</th>
              {canRefreshOd && <th className="px-3 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const dest = [o.shipCity, o.shipState, o.shipCountry].filter(Boolean).join(", ") || "—";
              return (
                <tr key={o.id} className="border-b border-slate-100 last:border-0" data-testid={`row-fulfillment-order-${o.id}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ArtThumb src={o.albumArtwork} title={o.albumTitle} />
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 truncate max-w-[220px]">{o.albumTitle}</div>
                        <div className="text-xs text-slate-400 truncate max-w-[220px]">
                          {o.albumArtist ?? ""}{o.skuKind ? ` · ${o.skuKind.replace(/_/g, " ")}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700 tabular-nums">{o.quantity}</td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{dest}</td>
                  <td className="px-3 py-2.5">{fulfillmentStatusPill(o.fulfillmentStatus, o.id)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {o.trackingNumber ? (
                      o.trackingUrl ? (
                        <a
                          href={o.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--brand-blue)] hover:underline underline-offset-2 text-xs font-medium"
                          data-testid={`link-tracking-${o.id}`}
                        >
                          {o.carrier ? `${o.carrier} · ` : ""}{o.trackingNumber}
                        </a>
                      ) : (
                        <span className="text-xs text-slate-600">{o.carrier ? `${o.carrier} · ` : ""}{o.trackingNumber}</span>
                      )
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtDate(o.createdAt)}</td>
                  {canRefreshOd && (
                    <td className="px-3 py-2.5 text-right">
                      {o.orderDeskOrderId ? (
                        <button
                          type="button"
                          onClick={() => refresh.mutate(o.id)}
                          disabled={refresh.isPending}
                          title="Refresh status from Order Desk"
                          aria-label="Refresh status from Order Desk"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-400 hover:text-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/10 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40"
                          data-testid={`button-od-refresh-${o.id}`}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${refreshingId === o.id ? "animate-spin" : ""}`} />
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300 uppercase tracking-wider">no OD</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Operator-only inline editor for a run's expected-arrival override.
 *  Setting a date pins it (drops the "est." tag); clearing falls back to
 *  the press-turn-time estimate. super_admin-gated server-side. */
function ArrivalEditor({ row, partnerId }: { row: FulfillmentInboundRow; partnerId: string }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const save = useMutation({
    mutationFn: async (dateStr: string | null) => {
      const iso = dateStr ? new Date(`${dateStr}T12:00:00Z`).toISOString() : null;
      const r = await apiRequest("PATCH", `/api/admin/pressing-orders/${row.id}/expected-arrival`, {
        expectedArrivalAt: iso,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.message ?? `Save failed (${r.status})`);
      }
      return r.json();
    },
    onSuccess: (_d, dateStr) => {
      toast({ title: dateStr ? "Expected arrival set" : "Override cleared" });
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/fulfillment", partnerId, "inbound"] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });
  if (!editing) {
    return (
      <span className="ml-2 inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setValue(row.expectedArrivalAt ? row.expectedArrivalAt.slice(0, 10) : "");
            setEditing(true);
          }}
          className="text-xs font-semibold text-[var(--brand-blue)] hover:underline"
          data-testid={`button-edit-arrival-${row.id}`}
        >
          {row.expectedArrivalSource === "override" ? "Edit" : "Set date"}
        </button>
        {row.expectedArrivalSource === "override" && (
          <button
            type="button"
            onClick={() => save.mutate(null)}
            disabled={save.isPending}
            className="text-xs text-slate-400 hover:text-slate-600 hover:underline disabled:opacity-60"
            data-testid={`button-clear-arrival-${row.id}`}
          >
            Clear
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="ml-2 inline-flex items-center gap-1.5">
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-7 rounded-md border border-slate-300 px-1.5 text-xs text-slate-700 bg-white"
        data-testid={`input-arrival-${row.id}`}
      />
      <button
        type="button"
        onClick={() => value && save.mutate(value)}
        disabled={!value || save.isPending}
        className="text-xs font-semibold text-[var(--brand-blue)] hover:underline disabled:opacity-50"
        data-testid={`button-save-arrival-${row.id}`}
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs text-slate-400 hover:text-slate-600"
        data-testid={`button-cancel-arrival-${row.id}`}
      >
        Cancel
      </button>
    </span>
  );
}

/** Approved press runs whose finished goods land at this warehouse.
 *  `canEditArrival` (super-admin mirror only) exposes the inline
 *  expected-arrival override editor. */
export function FulfillmentInboundPanel({ partnerId, canEditArrival }: { partnerId: string; canEditArrival?: boolean }) {
  const { data: rows, isLoading } = useQuery<FulfillmentInboundRow[]>({
    queryKey: ["/api/fulfillment", partnerId, "inbound"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/fulfillment/${partnerId}/inbound`);
      return r.json();
    },
  });
  if (isLoading) {
    return <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Loading inbound runs…</div>;
  }
  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-10 text-center" data-testid="empty-fulfillment-inbound">
        <PackageOpen className="w-7 h-7 text-slate-300 mx-auto" strokeWidth={1.5} />
        <p className="mt-2 text-sm font-semibold text-slate-600">Nothing inbound right now</p>
        <p className="mt-1 text-xs text-slate-400">Approved pressing runs headed to your dock show up here.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden" data-testid="panel-fulfillment-inbound">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-200">
              <th className="px-4 py-2.5 font-semibold">Release</th>
              <th className="px-3 py-2.5 font-semibold">Format</th>
              <th className="px-3 py-2.5 font-semibold">Press</th>
              <th className="px-3 py-2.5 font-semibold">Qty</th>
              <th className="px-3 py-2.5 font-semibold">Approved</th>
              <th className="px-3 py-2.5 font-semibold">Expected arrival</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0" data-testid={`row-fulfillment-inbound-${r.id}`}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ArtThumb src={r.albumArtwork} title={r.albumTitle} />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate max-w-[220px]">{r.albumTitle}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[220px]">{r.albumArtist ?? ""}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                  {r.format ?? "—"}{r.vinylColor ? ` · ${r.vinylColor}` : ""}
                </td>
                <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.pressName ?? "—"}</td>
                <td className="px-3 py-2.5 text-slate-700 tabular-nums">{r.quantity}</td>
                <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtDate(r.approvedAt)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="text-slate-800 font-medium text-xs" data-testid={`text-arrival-${r.id}`}>
                    {fmtDate(r.expectedArrivalAt)}
                  </span>
                  {r.expectedArrivalSource && r.expectedArrivalSource !== "override" && (
                    <span className="ml-1.5 text-xs uppercase tracking-wider text-slate-400">est.</span>
                  )}
                  {canEditArrival && <ArrivalEditor row={r} partnerId={partnerId} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
