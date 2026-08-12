// Task #3075 — Fulfillment partner GoodDeed service pricing.
//
// When a printer only prints (no hologram/shrinkwrap capability), the
// signed cert batch ships straight to a fulfillment company that applies
// the GoodTunes-supplied holographic stickers, shrinkwraps, and ships.
// This card lets the fulfillment partner quote that receive/hologram/
// shrinkwrap/ship service as a tiered ladder — mirroring the printer's
// GoodDeed pricing surface (GoodDeedServicesTab), one card, one Save.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, X } from "lucide-react";

type Tier = { qty: number; perUnitCents: number };

interface Service {
  active: boolean;
  tiers: Tier[];
  setupFeeCents?: number;
  leadTimeDays?: number;
  notes?: string | null;
}

const DEFAULT_TIERS: Tier[] = [
  { qty: 25, perUnitCents: 0 },
  { qty: 50, perUnitCents: 0 },
  { qty: 100, perUnitCents: 0 },
  { qty: 200, perUnitCents: 0 },
  { qty: 300, perUnitCents: 0 },
  { qty: 500, perUnitCents: 0 },
];

function parseDollars(s: string): number | null {
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function FulfillmentGoodDeedServiceTab({ partnerId }: { partnerId: string }) {
  const { data, isLoading } = useQuery<{ service: Service | null }>({
    queryKey: [`/api/fulfillment/${partnerId}/gooddeed-service`],
    enabled: !!partnerId,
  });

  if (isLoading) return <div className="py-10 text-center text-slate-500 text-sm">Loading service pricing…</div>;

  return (
    <div className="space-y-6" data-testid="panel-fulfillment-gooddeed-service">
      <header>
        <h2 className="text-sm font-semibold text-slate-900">GoodDeed service pricing</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
          Quote the per-unit price you charge GoodTunes to receive a signed
          certificate batch, apply the GoodTunes-supplied holographic
          stickers, shrinkwrap, and ship. Tier qty is the floor — 100 covers
          100–199. Toggle <span className="font-semibold text-slate-700">Active</span> to make
          this service quotable on releases.
        </p>
      </header>
      <ServiceCard partnerId={partnerId} existing={data?.service ?? null} />
    </div>
  );
}

function ServiceCard({ partnerId, existing }: { partnerId: string; existing: Service | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [active, setActive] = useState(existing?.active ?? false);
  const [tiers, setTiers] = useState<Array<{ qty: string; perUnit: string }>>(() =>
    (existing?.tiers?.length ? existing.tiers : DEFAULT_TIERS).map((t) => ({
      qty: String(t.qty),
      perUnit: (t.perUnitCents / 100).toFixed(2),
    })),
  );
  const [setupFee, setSetupFee] = useState(((existing?.setupFeeCents ?? 0) / 100).toFixed(2));
  const [leadDays, setLeadDays] = useState(String(existing?.leadTimeDays ?? 7));
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const save = useMutation({
    mutationFn: async (body: any) => {
      const r = await apiRequest("PUT", `/api/fulfillment/${partnerId}/gooddeed-service`, body);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/fulfillment/${partnerId}/gooddeed-service`] });
      toast({ title: "Saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message || "Try again", variant: "destructive" }),
  });

  const initial = useMemo(() => JSON.stringify({
    active: existing?.active ?? false,
    tiers: (existing?.tiers?.length ? existing.tiers : DEFAULT_TIERS).map((t) => ({ qty: t.qty, perUnitCents: t.perUnitCents })),
    setupFeeCents: existing?.setupFeeCents ?? 0,
    leadTimeDays: existing?.leadTimeDays ?? 7,
    notes: existing?.notes ?? "",
  }), [existing]);
  const current = JSON.stringify({
    active,
    tiers: tiers.map((t) => ({ qty: parseInt(t.qty, 10) || 0, perUnitCents: parseDollars(t.perUnit) ?? 0 })),
    setupFeeCents: parseDollars(setupFee) ?? 0,
    leadTimeDays: parseInt(leadDays, 10) || 7,
    notes: notes || "",
  });
  const dirty = current !== initial;

  function submit() {
    const parsedTiers = tiers
      .map((t) => ({ qty: parseInt(t.qty, 10), perUnitCents: parseDollars(t.perUnit) }))
      .filter((t) => Number.isFinite(t.qty) && t.qty > 0 && t.perUnitCents != null)
      .map((t) => ({ qty: t.qty, perUnitCents: t.perUnitCents as number }));
    if (parsedTiers.length === 0) {
      toast({ title: "Add at least one tier", variant: "destructive" });
      return;
    }
    save.mutate({
      active,
      tiers: parsedTiers,
      setupFeeCents: parseDollars(setupFee) ?? 0,
      leadTimeDays: parseInt(leadDays, 10) || 7,
      notes: notes || null,
    });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4" data-testid="card-fulfillment-gooddeed">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold text-slate-900">Receive + hologram + shrinkwrap + ship</h3>
            <span
              className={[
                "text-xs uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded",
                active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
              ].join(" ")}
              data-testid="badge-fulfillment-gooddeed-active"
            >
              {active ? "Active" : "Draft"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Per-unit, snapped to the actual batch size. Holographic stickers are supplied by GoodTunes.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-slate-700 select-none">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            data-testid="toggle-fulfillment-gooddeed-active"
          />
          Active
        </label>
      </div>

      <div className="space-y-2" data-testid="list-fulfillment-gooddeed-tiers">
        <div className="grid grid-cols-[1fr,1fr,32px] gap-2 items-center text-xs uppercase tracking-wider text-slate-500 font-semibold px-1">
          <div>Tier (qty ≥)</div>
          <div>Per-unit price</div>
          <div></div>
        </div>
        {tiers.map((t, i) => (
          <div key={i} className="grid grid-cols-[1fr,1fr,32px] gap-2 items-center">
            <input
              type="number"
              min={1}
              value={t.qty}
              onChange={(e) => setTiers((rows) => rows.map((r, j) => (j === i ? { ...r, qty: e.target.value } : r)))}
              className="h-8 px-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:border-[var(--brand-blue)]"
              data-testid={`input-fulfillment-tier-qty-${i}`}
            />
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={t.perUnit}
                onChange={(e) => setTiers((rows) => rows.map((r, j) => (j === i ? { ...r, perUnit: e.target.value } : r)))}
                className="w-full h-8 pl-5 pr-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:border-[var(--brand-blue)]"
                data-testid={`input-fulfillment-tier-price-${i}`}
              />
            </div>
            <button
              type="button"
              onClick={() => setTiers((rows) => rows.filter((_, j) => j !== i))}
              className="w-8 h-8 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center"
              aria-label="Remove tier"
              data-testid={`button-fulfillment-remove-tier-${i}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setTiers((rows) => [...rows, { qty: "", perUnit: "" }])}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--brand-blue)] font-semibold hover:underline"
          data-testid="button-fulfillment-add-tier"
        >
          <Plus className="w-3.5 h-3.5" /> Add tier
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Setup fee</span>
          <div className="mt-1 relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={setupFee}
              onChange={(e) => setSetupFee(e.target.value)}
              className="w-full h-8 pl-5 pr-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:border-[var(--brand-blue)]"
              data-testid="input-fulfillment-setup-fee"
            />
          </div>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Turnaround (days)</span>
          <div className="mt-1">
            <input
              type="number"
              min={0}
              value={leadDays}
              onChange={(e) => setLeadDays(e.target.value)}
              className="w-full h-8 px-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:border-[var(--brand-blue)]"
              data-testid="input-fulfillment-lead-days"
            />
          </div>
        </label>
        <div className="col-span-2">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Notes (visible to GoodTunes only)</span>
            <div className="mt-1">
              <textarea
                value={notes ?? ""}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-slate-200 p-2 text-sm focus:outline-none focus:border-[var(--brand-blue)]"
                data-testid="input-fulfillment-notes"
              />
            </div>
          </label>
        </div>
      </div>

      <div className="flex justify-end pt-1 border-t border-slate-100">
        <button
          type="button"
          onClick={submit}
          disabled={!dirty || save.isPending}
          className={
            "h-8 px-3 rounded-md text-xs font-semibold transition-colors " +
            (dirty && !save.isPending
              ? "bg-[var(--brand-blue)] text-white hover:bg-[#2789bd]"
              : "bg-slate-200 text-slate-400 cursor-default")
          }
          data-testid="button-save-fulfillment-gooddeed"
        >
          {save.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>
    </section>
  );
}
