// Task #245 — Per-album signed-cert vendor routing + wholesale calculator.
//
// Three independent leg pickers (Printing / Hologram+shrinkwrap /
// Insertion). Each picker lists vendors that have an active row for
// that service. A run-quantity input drives the live preview total
// off the resolved tiers and flat per-unit prices.
//
// When the album has already been snapshotted (sale-window closed), we
// surface the locked snapshot alongside the live preview so the
// operator can compare "what the vendor would charge today" against
// "what we owe them for this release."

import { useEffect, useMemo, useState } from "react";
import { formatUsdCents } from "@shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, Lock } from "lucide-react";

type Service = "printing" | "hologram" | "insertion";
type VendorLite = { id: string; name: string; logoUrl: string | null };
type LegPrice = { vendorId: string; perUnitCents: number; setupFeeCents: number } | null;

interface Preview {
  legs: { printing: LegPrice; hologram: LegPrice; insertion: LegPrice };
  totalPerUnitCents: number;
  totalRunCents: number;
  snapshot:
    | {
        runQty: number;
        printing: LegPrice;
        hologram: LegPrice;
        insertion: LegPrice;
        totalPerUnitCents: number;
        totalRunCents: number;
      }
    | null;
  snapshotAt: string | null;
}

const LABELS: Record<Service, string> = {
  printing: "Printing",
  hologram: "Hologram + shrinkwrap",
  insertion: "Insertion",
};
const PATCH_KEY: Record<Service, "printVendorId" | "hologramVendorId" | "insertionVendorId"> = {
  printing: "printVendorId",
  hologram: "hologramVendorId",
  insertion: "insertionVendorId",
};

function dollars(c: number) {
  return formatUsdCents(c);
}

export function SignedCertVendorPanel({ albumId }: { albumId: string }) {
  const [runQty, setRunQty] = useState(100);
  const { data: preview, isLoading } = useQuery<Preview>({
    queryKey: ["/api/admin/albums", albumId, "gooddeed-pricing-preview", runQty],
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/admin/albums/${albumId}/gooddeed-pricing-preview?runQty=${runQty}`,
      );
      return r.json();
    },
  });

  if (isLoading || !preview) {
    return <p className="text-[13px] text-slate-500 py-2">Loading vendor routing…</p>;
  }

  const locked = !!preview.snapshot;

  return (
    <div className="space-y-4" data-testid="panel-signed-cert-vendors">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-slate-900">GoodDeed vendor routing</h3>
          <p className="text-[12.5px] text-slate-500 mt-0.5 max-w-xl">
            Pick one vendor per leg. The wholesale total below is the live
            quote at the chosen run size — what GoodTunes owes the vendors,
            not what the fan pays.
          </p>
        </div>
        {locked && (
          <span
            className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded"
            data-testid="badge-pricing-snapshotted"
          >
            <Lock className="w-3 h-3" /> Snapshot locked
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 gap-2">
        <LegRow albumId={albumId} service="printing" leg={preview.legs.printing} runQty={runQty} />
        <LegRow albumId={albumId} service="hologram" leg={preview.legs.hologram} runQty={runQty} />
        <LegRow albumId={albumId} service="insertion" leg={preview.legs.insertion} runQty={runQty} />
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
        <label className="text-[12px] text-slate-600">Run qty</label>
        <input
          type="number"
          min={1}
          value={runQty}
          onChange={(e) => setRunQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-24 h-8 px-2 rounded-md border border-slate-200 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
          data-testid="input-preview-run-qty"
        />
        <div className="ml-auto text-right">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Wholesale per unit</div>
          <div className="text-[18px] font-bold text-slate-900 tabular-nums" data-testid="text-wholesale-per-unit">
            {dollars(preview.totalPerUnitCents)}
          </div>
          <div className="text-[11px] text-slate-500 tabular-nums">
            Run total {dollars(preview.totalRunCents)}
          </div>
        </div>
      </div>

      {locked && preview.snapshot && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-900">
          <div className="font-semibold mb-1">Snapshot at sale-window close</div>
          <div className="tabular-nums">
            Run {preview.snapshot.runQty} × {dollars(preview.snapshot.totalPerUnitCents)} = {dollars(preview.snapshot.totalRunCents)}
          </div>
          <div className="opacity-75 mt-0.5">
            Stamped {preview.snapshotAt ? new Date(preview.snapshotAt).toLocaleString() : "—"}. Vendor price edits no longer affect this release.
          </div>
        </div>
      )}
    </div>
  );
}

function LegRow({
  albumId,
  service,
  leg,
  runQty,
}: {
  albumId: string;
  service: Service;
  leg: LegPrice;
  runQty: number;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: vendors = [] } = useQuery<VendorLite[]>({
    queryKey: ["/api/admin/gooddeed-vendors", service],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/gooddeed-vendors?service=${service}`);
      return r.json();
    },
  });

  const assign = useMutation({
    mutationFn: async (vendorId: string | null) => {
      const body: any = { [PATCH_KEY[service]]: vendorId };
      const r = await apiRequest("PATCH", `/api/admin/albums/${albumId}/signed-cert-vendors`, body);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "gooddeed-pricing-preview"] });
      toast({ title: `${LABELS[service]} vendor updated` });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't assign vendor", description: e?.message, variant: "destructive" }),
  });

  const current = leg?.vendorId
    ? vendors.find((v) => v.id === leg.vendorId) ?? { id: leg.vendorId, name: leg.vendorId, logoUrl: null }
    : null;

  return (
    <div
      className="grid grid-cols-[120px,1fr,auto] items-center gap-3 py-2"
      data-testid={`row-leg-${service}`}
    >
      <div className="text-[12.5px] text-slate-700 font-medium">{LABELS[service]}</div>
      <div className="relative">
        <select
          value={leg?.vendorId ?? ""}
          onChange={(e) => assign.mutate(e.target.value || null)}
          disabled={assign.isPending}
          className="w-full h-9 pl-3 pr-8 rounded-md border border-slate-200 bg-white text-[13px] text-slate-900 appearance-none focus:outline-none focus:border-[var(--brand-blue)]"
          data-testid={`select-vendor-${service}`}
        >
          <option value="">— None —</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
          {current && !vendors.some((v) => v.id === current.id) && (
            <option value={current.id}>{current.name} (draft pricing)</option>
          )}
        </select>
        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
      <div className="text-right min-w-[80px]">
        {leg ? (
          <div className="text-[13px] font-semibold text-slate-900 tabular-nums" data-testid={`text-leg-price-${service}`}>
            {dollars(leg.perUnitCents)}
          </div>
        ) : (
          <div className="text-[12px] text-slate-400">—</div>
        )}
        {leg && leg.setupFeeCents > 0 && (
          <div className="text-[10.5px] text-slate-500">+ {dollars(leg.setupFeeCents)} setup</div>
        )}
      </div>
    </div>
  );
}
