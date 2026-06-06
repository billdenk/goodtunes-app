// Task #245 — Vendor-managed GoodDeed pricing portal.
//
// Three service legs, each a self-contained card. Printing carries a
// per-tier ladder (25/50/100/200/300/500 break-points are the defaults
// we seed an empty form with — the vendor edits any of them). Hologram
// and Insertion carry a single flat per-unit price. Each card has its
// own Save so a vendor can publish printing without holding hologram.

import { useEffect, useMemo, useState } from "react";
import { formatUsdCents } from "@shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, X } from "lucide-react";

type Tier = { qty: number; perUnitCents: number };

interface ServiceRow {
  id: string;
  vendorId: string;
  service: "printing" | "hologram" | "insertion";
  active: boolean;
  tiers: Tier[] | null;
  flatPerUnitCents: number | null;
  setupFeeCents: number;
  minBatch: number;
  leadTimeDays: number;
  shipToDefault: string | null;
  notes: string | null;
  updatedAt: string;
}

const DEFAULT_TIERS: Tier[] = [
  { qty: 25, perUnitCents: 0 },
  { qty: 50, perUnitCents: 0 },
  { qty: 100, perUnitCents: 0 },
  { qty: 200, perUnitCents: 0 },
  { qty: 300, perUnitCents: 0 },
  { qty: 500, perUnitCents: 0 },
];

const COPY = {
  printing: {
    title: "Printing",
    blurb: "Per-unit, snapped to the actual run size when the sale window closes. Tier qty is the floor — 100 covers 100–199.",
  },
  hologram: {
    title: "Hologram + shrinkwrap",
    blurb: "Flat per-unit. Holographic security seal applied, then shrink-wrapped for shipping.",
  },
  insertion: {
    title: "Insertion",
    blurb: "Flat per-unit. Inserts the signed cert into the sleeve at your pressing plant. Only meaningful when you also press the vinyl.",
  },
} as const;

function dollars(cents: number | null | undefined) {
  if (cents == null) return "—";
  return formatUsdCents(cents);
}
function parseDollars(s: string): number | null {
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function GoodDeedServicesTab({ vendorId }: { vendorId: string }) {
  const { data, isLoading } = useQuery<{ vendor: any; services: ServiceRow[] }>({
    queryKey: ["/api/admin/vendors", vendorId, "gooddeed-services"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/vendors/${vendorId}/gooddeed-services`);
      return r.json();
    },
    enabled: !!vendorId,
  });

  if (isLoading) return <div className="py-10 text-center text-slate-500 text-sm">Loading services…</div>;

  const byKind = new Map((data?.services ?? []).map((s) => [s.service, s]));

  return (
    <div className="space-y-6" data-testid="panel-gooddeed-services">
      <header>
        <h2 className="text-[15px] font-semibold text-slate-900">GoodDeed pricing</h2>
        <p className="text-[13px] text-slate-500 mt-1 max-w-2xl">
          Quote the per-unit price you charge GoodTunes for each leg of a
          signed-GoodDeed run. Toggle <span className="font-semibold text-slate-700">Active</span> on a
          card to make that leg assignable to a release. Drafts don't show up on
          the artist's wholesale calculator.
        </p>
      </header>
      <PrintingCard vendorId={vendorId} existing={byKind.get("printing")} />
      <FlatCard vendorId={vendorId} service="hologram" existing={byKind.get("hologram")} />
      <FlatCard vendorId={vendorId} service="insertion" existing={byKind.get("insertion")} />
    </div>
  );
}

function ShellCard({
  service,
  active,
  setActive,
  children,
  onSave,
  saving,
  dirty,
}: {
  service: "printing" | "hologram" | "insertion";
  active: boolean;
  setActive: (v: boolean) => void;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
}) {
  const c = COPY[service];
  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-5 space-y-4"
      data-testid={`card-service-${service}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h3 className="text-[14px] font-semibold text-slate-900">{c.title}</h3>
            <span
              className={[
                "text-[10.5px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded",
                active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
              ].join(" ")}
              data-testid={`badge-${service}-active`}
            >
              {active ? "Active" : "Draft"}
            </span>
          </div>
          <p className="text-[12.5px] text-slate-500 mt-1">{c.blurb}</p>
        </div>
        <label className="inline-flex items-center gap-2 text-[12.5px] text-slate-700 select-none">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            data-testid={`toggle-${service}-active`}
          />
          Active
        </label>
      </div>
      {children}
      <div className="flex justify-end pt-1 border-t border-slate-100">
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          className={
            "h-8 px-3 rounded-md text-[12px] font-semibold transition-colors " +
            (dirty && !saving
              ? "bg-[var(--brand-blue)] text-white hover:bg-[#2789bd]"
              : "bg-slate-200 text-slate-400 cursor-default")
          }
          data-testid={`button-save-${service}`}
        >
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>
    </section>
  );
}

function commonFields({
  setupFee, setSetupFee,
  minBatch, setMinBatch,
  leadDays, setLeadDays,
  shipTo, setShipTo,
  notes, setNotes,
  service,
}: any) {
  return (
    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
      <Labeled label="Setup fee">
        <DollarInput value={setupFee} onChange={setSetupFee} testId={`input-${service}-setup-fee`} />
      </Labeled>
      <Labeled label="Min batch">
        <input
          type="number"
          min={1}
          value={minBatch}
          onChange={(e) => setMinBatch(e.target.value)}
          className="w-full h-8 px-2 rounded-md border border-slate-200 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
          data-testid={`input-${service}-min-batch`}
        />
      </Labeled>
      <Labeled label="Lead time (days)">
        <input
          type="number"
          min={0}
          value={leadDays}
          onChange={(e) => setLeadDays(e.target.value)}
          className="w-full h-8 px-2 rounded-md border border-slate-200 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
          data-testid={`input-${service}-lead-days`}
        />
      </Labeled>
      <Labeled label="Ship-to default (address line)">
        <input
          type="text"
          value={shipTo}
          onChange={(e) => setShipTo(e.target.value)}
          placeholder="Optional"
          className="w-full h-8 px-2 rounded-md border border-slate-200 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
          data-testid={`input-${service}-ship-to`}
        />
      </Labeled>
      <div className="col-span-2">
        <Labeled label="Notes (visible to GoodTunes only)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-200 p-2 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
            data-testid={`input-${service}-notes`}
          />
        </Labeled>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function DollarInput({ value, onChange, testId }: { value: string; onChange: (v: string) => void; testId: string }) {
  return (
    <div className="relative">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[12px]">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 pl-5 pr-2 rounded-md border border-slate-200 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
        data-testid={testId}
      />
    </div>
  );
}

function useSave(vendorId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: any) => {
      const r = await apiRequest("PUT", `/api/admin/vendors/${vendorId}/gooddeed-services`, body);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/vendors", vendorId, "gooddeed-services"] });
      toast({ title: "Saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message || "Try again", variant: "destructive" }),
  });
}

function PrintingCard({ vendorId, existing }: { vendorId: string; existing?: ServiceRow }) {
  const save = useSave(vendorId);
  const [active, setActive] = useState(existing?.active ?? false);
  const [tiers, setTiers] = useState<Array<{ qty: string; perUnit: string }>>(() =>
    (existing?.tiers ?? DEFAULT_TIERS).map((t) => ({
      qty: String(t.qty),
      perUnit: (t.perUnitCents / 100).toFixed(2),
    })),
  );
  const [setupFee, setSetupFee] = useState(((existing?.setupFeeCents ?? 0) / 100).toFixed(2));
  const [minBatch, setMinBatch] = useState(String(existing?.minBatch ?? 25));
  const [leadDays, setLeadDays] = useState(String(existing?.leadTimeDays ?? 14));
  const [shipTo, setShipTo] = useState(existing?.shipToDefault ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  // Snapshot for dirty-check.
  const initial = useMemo(() => JSON.stringify({
    active: existing?.active ?? false,
    tiers: (existing?.tiers ?? DEFAULT_TIERS).map((t) => ({ qty: t.qty, perUnitCents: t.perUnitCents })),
    setupFeeCents: existing?.setupFeeCents ?? 0,
    minBatch: existing?.minBatch ?? 25,
    leadTimeDays: existing?.leadTimeDays ?? 14,
    shipToDefault: existing?.shipToDefault ?? "",
    notes: existing?.notes ?? "",
  }), [existing]);

  const current = JSON.stringify({
    active,
    tiers: tiers.map((t) => ({ qty: parseInt(t.qty, 10) || 0, perUnitCents: parseDollars(t.perUnit) ?? 0 })),
    setupFeeCents: parseDollars(setupFee) ?? 0,
    minBatch: parseInt(minBatch, 10) || 25,
    leadTimeDays: parseInt(leadDays, 10) || 14,
    shipToDefault: shipTo,
    notes,
  });
  const dirty = current !== initial;

  function submit() {
    const parsedTiers = tiers
      .map((t) => ({ qty: parseInt(t.qty, 10), perUnitCents: parseDollars(t.perUnit) }))
      .filter((t) => Number.isFinite(t.qty) && t.qty > 0 && t.perUnitCents != null)
      .map((t) => ({ qty: t.qty, perUnitCents: t.perUnitCents as number }));
    save.mutate({
      service: "printing",
      active,
      tiers: parsedTiers,
      setupFeeCents: parseDollars(setupFee) ?? 0,
      minBatch: parseInt(minBatch, 10) || 25,
      leadTimeDays: parseInt(leadDays, 10) || 14,
      shipToDefault: shipTo || null,
      notes: notes || null,
    });
  }

  return (
    <ShellCard service="printing" active={active} setActive={setActive} onSave={submit} saving={save.isPending} dirty={dirty}>
      <div className="space-y-2" data-testid="list-printing-tiers">
        <div className="grid grid-cols-[1fr,1fr,32px] gap-2 items-center text-[10.5px] uppercase tracking-wider text-slate-500 font-semibold px-1">
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
              onChange={(e) => setTiers((rows) => rows.map((r, j) => j === i ? { ...r, qty: e.target.value } : r))}
              className="h-8 px-2 rounded-md border border-slate-200 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
              data-testid={`input-printing-tier-qty-${i}`}
            />
            <DollarInput
              value={t.perUnit}
              onChange={(v) => setTiers((rows) => rows.map((r, j) => j === i ? { ...r, perUnit: v } : r))}
              testId={`input-printing-tier-price-${i}`}
            />
            <button
              type="button"
              onClick={() => setTiers((rows) => rows.filter((_, j) => j !== i))}
              className="w-8 h-8 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center"
              aria-label="Remove tier"
              data-testid={`button-remove-tier-${i}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setTiers((rows) => [...rows, { qty: "", perUnit: "" }])}
          className="inline-flex items-center gap-1.5 text-[12px] text-[var(--brand-blue)] font-semibold hover:underline"
          data-testid="button-add-tier"
        >
          <Plus className="w-3.5 h-3.5" /> Add tier
        </button>
      </div>
      {commonFields({
        setupFee, setSetupFee, minBatch, setMinBatch, leadDays, setLeadDays,
        shipTo, setShipTo, notes, setNotes, service: "printing",
      })}
    </ShellCard>
  );
}

function FlatCard({ vendorId, service, existing }: { vendorId: string; service: "hologram" | "insertion"; existing?: ServiceRow }) {
  const save = useSave(vendorId);
  const [active, setActive] = useState(existing?.active ?? false);
  const [perUnit, setPerUnit] = useState(((existing?.flatPerUnitCents ?? 0) / 100).toFixed(2));
  const [setupFee, setSetupFee] = useState(((existing?.setupFeeCents ?? 0) / 100).toFixed(2));
  const [minBatch, setMinBatch] = useState(String(existing?.minBatch ?? 25));
  const [leadDays, setLeadDays] = useState(String(existing?.leadTimeDays ?? 14));
  const [shipTo, setShipTo] = useState(existing?.shipToDefault ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const initial = useMemo(() => JSON.stringify({
    active: existing?.active ?? false,
    flatPerUnitCents: existing?.flatPerUnitCents ?? 0,
    setupFeeCents: existing?.setupFeeCents ?? 0,
    minBatch: existing?.minBatch ?? 25,
    leadTimeDays: existing?.leadTimeDays ?? 14,
    shipToDefault: existing?.shipToDefault ?? "",
    notes: existing?.notes ?? "",
  }), [existing]);
  const current = JSON.stringify({
    active,
    flatPerUnitCents: parseDollars(perUnit) ?? 0,
    setupFeeCents: parseDollars(setupFee) ?? 0,
    minBatch: parseInt(minBatch, 10) || 25,
    leadTimeDays: parseInt(leadDays, 10) || 14,
    shipToDefault: shipTo,
    notes,
  });
  const dirty = current !== initial;

  function submit() {
    save.mutate({
      service,
      active,
      flatPerUnitCents: parseDollars(perUnit) ?? 0,
      setupFeeCents: parseDollars(setupFee) ?? 0,
      minBatch: parseInt(minBatch, 10) || 25,
      leadTimeDays: parseInt(leadDays, 10) || 14,
      shipToDefault: shipTo || null,
      notes: notes || null,
    });
  }

  return (
    <ShellCard service={service} active={active} setActive={setActive} onSave={submit} saving={save.isPending} dirty={dirty}>
      <Labeled label="Flat per-unit price">
        <DollarInput value={perUnit} onChange={setPerUnit} testId={`input-${service}-per-unit`} />
      </Labeled>
      {commonFields({
        setupFee, setSetupFee, minBatch, setMinBatch, leadDays, setLeadDays,
        shipTo, setShipTo, notes, setNotes, service,
      })}
    </ShellCard>
  );
}
