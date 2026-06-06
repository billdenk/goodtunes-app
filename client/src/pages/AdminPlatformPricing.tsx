// Task #119 / #471 / #649 — super-admin platform pricing.
//
// Two-up grid on desktop, read-only by default with pencil-to-edit on
// every card. Save dimmed until the card is dirty.
//
// Cards (and what they edit):
//   Platform fees           — `payout_settings.shopify_fee_cents`
//                             (Shopify checkout fee). Cert wholesale
//                             cost lives in the Wholesale Ladder below
//                             — there is no flat per-cert input here.
//   GoodDeed routing defaults — `payout_settings.default_{print,
//                             hologram,insertion}_vendor_id`
//   Wholesale Ladder        — `payout_settings.signed_cert_ladder`
//                             with each rung expandable to show the
//                             vendor cost stack at that quantity.
//   Per-format pricing      — `payout_format_costs` rows
//   Quickprinter ladder     — the platform-default Quickprinter's
//                             `vendor_gooddeed_services.size_ladders_json`
//
// `cert_cost_cents` stays on the server-side schema for back-compat
// (existing snapshots + `IStorage.upsertPayoutSettings`); the page no
// longer edits it. Source of truth for "what does a cert cost?" is the
// Wholesale Ladder.
import { useEffect, useMemo, useState } from "react";
import { formatUsdCents } from "@shared/money";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { SaveLink, EditPencil, CardHeader } from "@/components/admin/EditCardChrome";
import type { PayoutSettings, PayoutFormatCost, AlbumFormat } from "@shared/schema";
import { ALBUM_FORMATS, ALBUM_FORMAT_LABEL } from "@shared/schema";
import {
  DEFAULT_SIGNED_CERT_LADDER,
  SIGNED_CERT_MIN_BATCH,
  type SignedCertLadderRung,
} from "@shared/signedCertLadder";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { SiShopify } from "react-icons/si";

type RoleInfo = { role: string; roleScopeId: string | null };

const FORMAT_COST_FIELDS = [
  { key: "manufacturingCents", label: "Manufacturing" },
  { key: "publishingCents", label: "Publishing" },
  { key: "paymentProcessingCents", label: "Payment processing" },
  { key: "goodtunesCents", label: "GoodTunes margin" },
] as const;
type FormatCostField = (typeof FORMAT_COST_FIELDS)[number]["key"];

const dollars = (c: number) => formatUsdCents(c);
const parseDollars = (v: string): number | null => {
  const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const secs = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function AdminPlatformPricing() {
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => document.body.classList.remove("gt-admin");
  }, []);
  const { user, isLoading: authLoading } = useAuth();

  const { data: role, isLoading: roleLoading } = useQuery<RoleInfo>({
    queryKey: ["/api/me/role"],
    enabled: !!user?.isAdmin,
  });
  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsIsError,
    error: settingsError,
    refetch: refetchSettings,
    isFetching: settingsIsFetching,
  } = useQuery<PayoutSettings>({
    queryKey: ["/api/admin/payout-settings"],
    enabled: !!user?.isAdmin,
    retry: false,
  });
  const { data: formatCosts } = useQuery<PayoutFormatCost[]>({
    queryKey: ["/api/admin/payout-format-costs"],
    enabled: !!user?.isAdmin,
  });

  if (authLoading || roleLoading) {
    return (
      <AdminFrame active="platform-pricing">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[color:var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }
  if (!user?.isAdmin) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <p className="text-slate-500 text-sm">Admin only.</p>
      </main>
    );
  }
  if (role && role.role !== "super_admin") {
    return (
      <AdminFrame active="platform-pricing">
        <AdminPageHeader title="Platform pricing" subtitle="Restricted." />
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
          <div className="text-slate-700 font-medium">Super admin only</div>
          <div className="text-slate-500 text-[13px] mt-1">
            Ask a super admin to update platform-wide costs.
          </div>
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="platform-pricing">
      <div className="space-y-5">
        <AdminPageHeader
          title="Platform pricing"
          subtitle="Platform-wide costs that drive the artist profit readout on every Sell panel."
        />

        {settingsLoading ? (
          <div className="py-10 text-slate-500 text-sm">Loading…</div>
        ) : settingsIsError ? (
          <ErrorState
            error={settingsError}
            onRetry={() => refetchSettings()}
            title="Couldn't load platform pricing"
            testId="admin-platform-pricing-error"
          />
        ) : !settings ? (
          <div className="py-10 text-slate-500 text-sm">
            {settingsIsFetching ? "Loading…" : "No pricing settings available."}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <PlatformFeesCard settings={settings} />
              <RoutingDefaultsCard settings={settings} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              <SignedCertLadderCard settings={settings} />
              {formatCosts && formatCosts.length > 0 && (
                <FormatCostsCard formatCosts={formatCosts} />
              )}
            </div>

            {settings.defaultPrintVendorId && (
              <QuickprinterLadderCard vendorId={settings.defaultPrintVendorId} />
            )}
          </>
        )}
      </div>
    </AdminFrame>
  );
}

// --- Platform fees (Shopify + cert wholesale source-of-truth note) ---------

function PlatformFeesCard({ settings }: { settings: PayoutSettings }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [shopifyStr, setShopifyStr] = useState(
    (settings.shopifyFeeCents / 100).toFixed(2),
  );
  useEffect(() => {
    setShopifyStr((settings.shopifyFeeCents / 100).toFixed(2));
  }, [settings.shopifyFeeCents]);

  const dirty = parseDollars(shopifyStr) !== settings.shopifyFeeCents;

  const save = useMutation({
    mutationFn: async () => {
      const cents = parseDollars(shopifyStr);
      if (cents == null) throw new Error("Enter a dollar amount");
      const r = await apiRequest("PUT", "/api/admin/payout-settings", {
        shopifyFeeCents: cents,
      });
      return (await r.json()) as PayoutSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payout-settings"] });
      toast({ title: "Platform fees saved" });
      setEditing(false);
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-5 space-y-4"
      data-testid="panel-platform-fees"
    >
      <CardHeader
        title="Platform fees"
        subtitle="Per-order fees billed on every Shopify checkout."
        icon={<SiShopify className="w-4 h-4 text-[#96BF48]" aria-hidden />}
        editing={editing}
        dirty={dirty}
        onEnterEdit={() => setEditing(true)}
        onCancelEdit={() => {
          setShopifyStr((settings.shopifyFeeCents / 100).toFixed(2));
          setEditing(false);
        }}
        testId="platform-fees"
      />

      <dl className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-sm text-slate-600">Shopify checkout fee</dt>
          {editing ? (
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[12px]">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={shopifyStr}
                onChange={(e) => setShopifyStr(e.target.value)}
                className="w-28 h-8 border border-slate-200 rounded-md pl-5 pr-2 text-right text-xs focus:outline-none focus:border-[color:var(--brand-blue)]"
                data-testid="input-shopify-fee"
              />
            </div>
          ) : (
            <dd className="text-sm font-semibold text-slate-900" data-testid="text-shopify-fee">
              {dollars(settings.shopifyFeeCents)}
            </dd>
          )}
        </div>
      </dl>

      {editing && (
        <div className="flex items-center justify-end gap-1 pt-1">
          <button
            type="button"
            onClick={() => {
              setShopifyStr((settings.shopifyFeeCents / 100).toFixed(2));
              setEditing(false);
            }}
            className="h-8 px-2.5 rounded-md text-xs font-medium text-slate-500 hover:bg-slate-50"
            data-testid="button-cancel-platform-fees"
          >
            Cancel
          </button>
          <SaveLink
            dirty={dirty}
            busy={save.isPending}
            onClick={() => save.mutate()}
            testId="button-save-platform-fees"
          />
        </div>
      )}

      <p className="text-[12px] text-slate-400 pt-2 border-t border-slate-100">
        Printed &amp; signed certificate wholesale cost lives in the
        Wholesale Ladder below — every rung's price is the source of truth
        for what a cert costs at that run size.
      </p>
    </div>
  );
}

// --- GoodDeed routing defaults --------------------------------------------

type GoodDeedVendor = { id: string; name: string; logoUrl: string | null };
type LegKey = "printing" | "hologram" | "insertion";
const LEG_FIELD: Record<
  LegKey,
  "defaultPrintVendorId" | "defaultHologramVendorId" | "defaultInsertionVendorId"
> = {
  printing: "defaultPrintVendorId",
  hologram: "defaultHologramVendorId",
  insertion: "defaultInsertionVendorId",
};
const LEG_LABEL: Record<LegKey, string> = {
  printing: "Printing (Quickprinter)",
  hologram: "Hologram + shrinkwrap",
  insertion: "Insertion",
};

function RoutingDefaultsCard({ settings }: { settings: PayoutSettings }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const printing = useQuery<GoodDeedVendor[]>({
    queryKey: ["/api/admin/gooddeed-vendors", { service: "printing" }],
  });
  const hologram = useQuery<GoodDeedVendor[]>({
    queryKey: ["/api/admin/gooddeed-vendors", { service: "hologram" }],
  });
  const insertion = useQuery<GoodDeedVendor[]>({
    queryKey: ["/api/admin/gooddeed-vendors", { service: "insertion" }],
  });

  const live: Record<LegKey, string | null> = {
    printing: settings.defaultPrintVendorId ?? null,
    hologram: settings.defaultHologramVendorId ?? null,
    insertion: settings.defaultInsertionVendorId ?? null,
  };
  const [draft, setDraft] = useState<Record<LegKey, string | null>>(live);
  useEffect(() => {
    setDraft(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.defaultPrintVendorId,
    settings.defaultHologramVendorId,
    settings.defaultInsertionVendorId,
  ]);

  const dirty = (Object.keys(LEG_FIELD) as LegKey[]).some(
    (leg) => draft[leg] !== live[leg],
  );

  const save = useMutation({
    mutationFn: async () => {
      const patch: Partial<Record<typeof LEG_FIELD[LegKey], string | null>> = {};
      for (const leg of Object.keys(LEG_FIELD) as LegKey[]) {
        if (draft[leg] !== live[leg]) patch[LEG_FIELD[leg]] = draft[leg];
      }
      const r = await apiRequest("PUT", "/api/admin/payout-settings", patch);
      return (await r.json()) as PayoutSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payout-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gooddeed-cost-stack"] });
      toast({ title: "Routing saved" });
      setEditing(false);
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save routing", description: e?.message, variant: "destructive" }),
  });

  const lists: Record<LegKey, GoodDeedVendor[] | undefined> = {
    printing: printing.data,
    hologram: hologram.data,
    insertion: insertion.data,
  };
  const nameOf = (leg: LegKey, id: string | null): string | null => {
    if (!id) return null;
    return lists[leg]?.find((v) => v.id === id)?.name ?? null;
  };

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-5 space-y-4"
      data-testid="panel-gooddeed-routing"
    >
      <CardHeader
        title="GoodDeed routing defaults"
        subtitle="Every album resolves printing, hologram, and insertion against these defaults. The Printing picker only shows Quickprinters."
        editing={editing}
        dirty={dirty}
        onEnterEdit={() => setEditing(true)}
        onCancelEdit={() => {
          setDraft(live);
          setEditing(false);
        }}
        testId="gooddeed-routing"
      />

      <div className="space-y-3">
        {(Object.keys(LEG_LABEL) as LegKey[]).map((leg) => {
          const list = lists[leg];
          const vendorId = editing ? draft[leg] : live[leg];
          const vendorName = nameOf(leg, vendorId);
          return (
            <div key={leg} data-testid={`row-routing-${leg}`}>
              <span className="block text-slate-500 text-[10.5px] font-semibold uppercase tracking-wider mb-1">
                {LEG_LABEL[leg]}
              </span>
              {editing ? (
                <select
                  value={draft[leg] ?? ""}
                  disabled={!list}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [leg]: e.target.value || null }))
                  }
                  className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm bg-white focus:outline-none focus:border-[color:var(--brand-blue)]"
                  data-testid={`select-routing-${leg}`}
                >
                  <option value="">— None —</option>
                  {(list ?? []).map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              ) : vendorId && vendorName ? (
                <Link href={`/admin/vendors/${vendorId}?tab=gooddeed`} className="inline-flex items-center gap-1.5 text-sm text-slate-900 hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors" data-testid={`link-routing-${leg}`}>
                  {vendorName}
                  <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                </Link>
              ) : (
                <span className="text-sm text-slate-400" data-testid={`text-routing-${leg}-empty`}>
                  — None selected —
                </span>
              )}
              {editing && leg === "printing" && list && list.length === 0 && (
                <p className="text-xs text-[color:var(--brand-heart)] mt-1">
                  No Quickprinters with active Printing pricing yet — mark a vendor as Quickprinter and add a tier.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="flex items-center justify-end gap-1 pt-1">
          <button
            type="button"
            onClick={() => {
              if (dirty && !window.confirm("Discard unsaved changes?")) return;
              setDraft(live);
              setEditing(false);
            }}
            className="h-8 px-2.5 rounded-md text-xs font-medium text-slate-500 hover:bg-slate-50"
            data-testid="button-cancel-routing"
          >
            Cancel
          </button>
          <SaveLink
            dirty={dirty}
            busy={save.isPending}
            onClick={() => save.mutate()}
            testId="button-save-routing"
          />
        </div>
      )}
    </div>
  );
}

// --- Signed-cert wholesale ladder ------------------------------------------

type RungDraft = {
  key: string;
  minQty: string;
  label: string;
  wholesale: string;
};
let __rungKeySeq = 0;
const nextRungKey = () => `rung-${++__rungKeySeq}`;

const rungsToDraft = (rungs: SignedCertLadderRung[]): RungDraft[] =>
  rungs.map((r) => ({
    key: nextRungKey(),
    minQty: String(r.minQty),
    label: r.label,
    wholesale: (r.wholesaleCents / 100).toFixed(2),
  }));

function SignedCertLadderCard({ settings }: { settings: PayoutSettings }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const liveRungs = settings.signedCertLadder ?? DEFAULT_SIGNED_CERT_LADDER;
  const [draft, setDraft] = useState<RungDraft[]>(() => rungsToDraft(liveRungs));
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    setDraft(rungsToDraft(settings.signedCertLadder ?? DEFAULT_SIGNED_CERT_LADDER));
  }, [settings.signedCertLadder]);

  const update = (i: number, patch: Partial<RungDraft>) =>
    setDraft((d) => d.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setDraft((d) => d.filter((_, idx) => idx !== i));
  const add = () => {
    setDraft((d) => {
      const last = d[d.length - 1];
      const nextMin = last ? Number(last.minQty) + 100 : SIGNED_CERT_MIN_BATCH;
      return [
        ...d,
        { key: nextRungKey(), minQty: String(nextMin), label: `${nextMin}+`, wholesale: "0.00" },
      ];
    });
  };
  const resetToDefaults = () => setDraft(rungsToDraft(DEFAULT_SIGNED_CERT_LADDER));

  const save = useMutation({
    mutationFn: async () => {
      const rungs: SignedCertLadderRung[] = [];
      for (const r of draft) {
        const minQty = Number.parseInt(r.minQty, 10);
        const w = Number.parseFloat(r.wholesale);
        if (!Number.isInteger(minQty) || minQty < 1) {
          throw new Error("Each rung needs a whole-number batch size");
        }
        if (!Number.isFinite(w) || w < 0) {
          throw new Error("Each rung needs a non-negative wholesale price");
        }
        const label = r.label.trim();
        if (!label) throw new Error("Each rung needs a batch-size label");
        rungs.push({ minQty, label, wholesaleCents: Math.round(w * 100) });
      }
      const r = await apiRequest("PUT", "/api/admin/payout-settings", {
        signedCertLadder: rungs,
      });
      return (await r.json()) as PayoutSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payout-settings"] });
      toast({ title: "Wholesale ladder saved" });
      setEditing(false);
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save ladder", description: e?.message, variant: "destructive" }),
  });

  const dirty =
    JSON.stringify(
      draft.map((d) => ({
        minQty: Number.parseInt(d.minQty, 10) || 0,
        label: d.label.trim(),
        wholesaleCents: Math.round((Number.parseFloat(d.wholesale) || 0) * 100),
      })),
    ) !==
    JSON.stringify(
      liveRungs.map((r) => ({
        minQty: r.minQty,
        label: r.label,
        wholesaleCents: r.wholesaleCents,
      })),
    );

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-5 space-y-3"
      data-testid="panel-signed-cert-ladder"
    >
      <CardHeader
        title="GoodTunes® Certificate Wholesale Ladder"
        subtitle="Per-unit price GoodTunes charges artists and labels for printed, signed, hologrammed GoodDeed certificates. Snapped to the actual run size at window close."
        editing={editing}
        dirty={dirty}
        onEnterEdit={() => setEditing(true)}
        onCancelEdit={() => {
          setDraft(rungsToDraft(liveRungs));
          setEditing(false);
        }}
        testId="signed-cert-ladder"
      />

      <div className="overflow-hidden rounded-md border border-slate-200">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="w-9" />
              <th className="text-left font-semibold uppercase tracking-wider text-[10.5px] px-3 py-2 w-[110px]">
                Starts at
              </th>
              <th className="text-left font-semibold uppercase tracking-wider text-[10.5px] px-3 py-2">
                Batch label
              </th>
              <th className="text-right font-semibold uppercase tracking-wider text-[10.5px] px-3 py-2 w-[140px]">
                Wholesale / unit
              </th>
              {editing && <th className="w-9" />}
            </tr>
          </thead>
          <tbody>
            {draft.map((r, i) => {
              const isFirst = i === 0;
              const isExpanded = expanded === r.key;
              const minQty = Number.parseInt(r.minQty, 10) || SIGNED_CERT_MIN_BATCH;
              const wholesaleCents = Math.round(
                (Number.parseFloat(r.wholesale) || 0) * 100,
              );
              return (
                <FragmentRow
                  key={r.key}
                  isFirst={isFirst}
                  isExpanded={isExpanded}
                  editing={editing}
                  draft={r}
                  draftLen={draft.length}
                  index={i}
                  minQty={minQty}
                  wholesaleCents={wholesaleCents}
                  ladderUpdatedAt={settings.updatedAt ? new Date(settings.updatedAt).toISOString() : null}
                  onToggle={() => setExpanded((prev) => (prev === r.key ? null : r.key))}
                  onUpdate={(patch) => update(i, patch)}
                  onRemove={() => remove(i)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={add}
            disabled={draft.length >= 10}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12px] font-semibold text-slate-600 hover:text-[color:var(--brand-blue)] hover:bg-slate-50 disabled:opacity-40"
            data-testid="button-rung-add"
          >
            <Plus className="w-3.5 h-3.5" />
            Add rung
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={resetToDefaults}
              className="h-8 px-3 rounded-md text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              data-testid="button-rung-reset"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(rungsToDraft(liveRungs));
                setEditing(false);
              }}
              className="h-8 px-2.5 rounded-md text-xs font-medium text-slate-500 hover:bg-slate-50"
              data-testid="button-cancel-signed-cert-ladder"
            >
              Cancel
            </button>
            <SaveLink
              dirty={dirty}
              busy={save.isPending}
              onClick={() => save.mutate()}
              testId="button-save-signed-cert-ladder"
            />
          </div>
        </div>
      )}

      <ul className="text-[12px] text-slate-500 space-y-1.5 pl-4 list-disc">
        <li>
          <span className="text-slate-900 font-medium">{SIGNED_CERT_MIN_BATCH}-unit minimum.</span>{" "}
          If fewer than {SIGNED_CERT_MIN_BATCH} sell at window close, the cert add-on auto-refunds
          and no print run happens. The first rung is pinned to this floor.
        </li>
        <li>
          <span className="text-slate-900 font-medium">Billed on actuals.</span>{" "}
          Artist is wholesale-billed on the count that actually sold, snapped
          to the ladder above — no pre-buying to lock a lower tier.
        </li>
        <li>
          <span className="text-slate-900 font-medium">Pass-throughs.</span>{" "}
          Expedited shipping, international shipping, and any mid-cycle vendor
          fee bumps (Hoover, Sticker Mule, Spinney) are billed at cost on top
          of the ladder.
        </li>
      </ul>
    </div>
  );
}

// One row's worth of <tr>s — the editable rung row plus, when expanded,
// a second <tr> that hosts the cost-stack breakdown.
function FragmentRow({
  isFirst,
  isExpanded,
  editing,
  draft,
  draftLen,
  index,
  minQty,
  wholesaleCents,
  ladderUpdatedAt,
  onToggle,
  onUpdate,
  onRemove,
}: {
  isFirst: boolean;
  isExpanded: boolean;
  editing: boolean;
  draft: RungDraft;
  draftLen: number;
  index: number;
  minQty: number;
  wholesaleCents: number;
  ladderUpdatedAt: string | null;
  onToggle: () => void;
  onUpdate: (patch: Partial<RungDraft>) => void;
  onRemove: () => void;
}) {
  const stack = useQuery<CostStack>({
    queryKey: ["/api/admin/gooddeed-cost-stack", { runQty: minQty }],
    queryFn: async () => {
      const r = await fetch(
        `/api/admin/gooddeed-cost-stack?runQty=${minQty}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error("Failed to load cost stack");
      return r.json();
    },
  });
  const erosion = hasErosion(stack.data, ladderUpdatedAt);
  return (
    <>
      <tr
        className="border-t border-slate-100"
        data-testid={`row-signed-cert-ladder-${index}`}
      >
        <td className="px-1 py-2 text-center">
          <button
            type="button"
            onClick={onToggle}
            aria-label={isExpanded ? "Collapse cost stack" : "Expand cost stack"}
            aria-expanded={isExpanded}
            className="relative h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-50"
            data-testid={`button-toggle-rung-${index}`}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            {erosion && (
              <span
                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500"
                title="A vendor cost rose since this ladder was last saved."
                data-testid={`rung-erosion-dot-${index}`}
              />
            )}
          </button>
        </td>
        <td className="px-3 py-2">
          {editing ? (
            <input
              type="number"
              min={1}
              step={1}
              value={draft.minQty}
              onChange={(e) => onUpdate({ minQty: e.target.value })}
              disabled={isFirst}
              title={isFirst ? `Locked to the ${SIGNED_CERT_MIN_BATCH}-unit print floor` : undefined}
              className="w-full h-8 border border-slate-200 rounded-md px-2 text-xs focus:outline-none focus:border-[color:var(--brand-blue)] disabled:bg-slate-50 disabled:text-slate-500"
              data-testid={`input-rung-minqty-${index}`}
            />
          ) : (
            <span className="text-slate-900 text-xs font-medium" data-testid={`text-rung-minqty-${index}`}>
              {draft.minQty}
            </span>
          )}
        </td>
        <td className="px-3 py-2">
          {editing ? (
            <input
              type="text"
              value={draft.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              placeholder="e.g. 25–49"
              className="w-full h-8 border border-slate-200 rounded-md px-2 text-xs focus:outline-none focus:border-[color:var(--brand-blue)]"
              data-testid={`input-rung-label-${index}`}
            />
          ) : (
            <span className="text-slate-700 text-xs" data-testid={`text-rung-label-${index}`}>
              {draft.label}
            </span>
          )}
        </td>
        <td className="px-3 py-2">
          {editing ? (
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[12px]">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={draft.wholesale}
                onChange={(e) => onUpdate({ wholesale: e.target.value })}
                className="w-full h-8 border border-slate-200 rounded-md pl-5 pr-2 text-right text-xs focus:outline-none focus:border-[color:var(--brand-blue)]"
                data-testid={`input-rung-wholesale-${index}`}
              />
            </div>
          ) : (
            <span className="text-slate-900 text-xs font-semibold block text-right" data-testid={`text-rung-wholesale-${index}`}>
              ${draft.wholesale}
            </span>
          )}
        </td>
        {editing && (
          <td className="px-2 py-2 text-center">
            {/* IconButton-equivalent admin destructive ghost — see EditPencil. */}
            <button
              type="button"
              onClick={onRemove}
              disabled={isFirst || draftLen === 1}
              title={isFirst ? "Can't remove the print-floor rung" : "Remove rung"}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-[color:var(--brand-heart)] hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
              data-testid={`button-rung-remove-${index}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </td>
        )}
      </tr>
      {isExpanded && (
        <tr className="bg-slate-50/60">
          <td className="px-3 py-3" />
          <td className="px-3 py-3" colSpan={editing ? 4 : 3}>
            <RungCostStack
              runQty={minQty}
              wholesaleCents={wholesaleCents}
              ladderUpdatedAt={ladderUpdatedAt}
              data={stack.data}
              isLoading={stack.isLoading}
              testId={`rung-stack-${index}`}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// --- Cost stack ----------------------------------------------------------

type CostStackLeg = {
  vendorId: string;
  vendorName: string;
  perUnitCents: number | null;
  updatedAt: string | null;
};
type CostStack = {
  runQty: number;
  printing: CostStackLeg | null;
  hologram: CostStackLeg | null;
  insertion: CostStackLeg | null;
  totalPerUnitCents: number;
};

const STACK_LABEL: Record<LegKey, string> = {
  printing: "Printing (Quickprinter)",
  hologram: "Hologram + shrinkwrap",
  insertion: "Insertion",
};

// Cost-stack tolerance — vendor subtotal within this many cents of the
// rung's wholesale is treated as matching. Avoids amber-flagging trivial
// rounding deltas (cents) on a $10+ wholesale price.
const MISMATCH_TOLERANCE_CENTS = 5;

// "Last price change" line — shows `changed Xh ago` when the leg has a
// recorded updatedAt, and a softer "no recorded changes yet" fallback
// when it doesn't (newly seeded vendors etc).
function PriceChangeLine({ updatedAt }: { updatedAt: string | null }) {
  if (updatedAt) {
    return <div className="text-xs text-slate-400">changed {timeAgo(updatedAt)}</div>;
  }
  return <div className="text-xs text-slate-400 italic">no recorded changes yet</div>;
}

// True when any leg's updatedAt is newer than the ladder's last save —
// signals that vendor pricing has moved since the rung wholesale was
// last priced against the cost stack.
function hasErosion(data: CostStack | undefined, ladderUpdatedAt: string | null): boolean {
  if (!data || !ladderUpdatedAt) return false;
  const ladderTs = Date.parse(ladderUpdatedAt);
  if (!Number.isFinite(ladderTs)) return false;
  for (const leg of ["printing", "hologram", "insertion"] as LegKey[]) {
    const u = data[leg]?.updatedAt;
    if (u && Date.parse(u) > ladderTs) return true;
  }
  return false;
}

function RungCostStack({
  runQty,
  wholesaleCents,
  ladderUpdatedAt,
  data,
  isLoading,
  testId,
}: {
  runQty: number;
  wholesaleCents: number;
  ladderUpdatedAt: string | null;
  data: CostStack | undefined;
  isLoading: boolean;
  testId: string;
}) {
  const legs: LegKey[] = ["printing", "hologram", "insertion"];
  const subtotalCents = data?.totalPerUnitCents ?? 0;
  const marginCents = wholesaleCents - subtotalCents;
  const delta = subtotalCents - wholesaleCents;
  const mismatch = !!data && delta > MISMATCH_TOLERANCE_CENTS;
  const erosion = hasErosion(data, ladderUpdatedAt);

  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="text-xs uppercase tracking-wider font-semibold text-slate-500">
        Cost stack at {runQty} units
      </div>

      {isLoading ? (
        <div className="text-xs text-slate-500">Loading vendor pricing…</div>
      ) : !data ? (
        <div className="text-xs text-slate-400">No cost stack available.</div>
      ) : (
        <div className="rounded-md bg-white border border-slate-200 divide-y divide-slate-100">
          {legs.map((leg) => {
            const row = data[leg];
            return (
              <div
                key={leg}
                className="flex items-center justify-between gap-3 px-3 py-2"
                data-testid={`${testId}-leg-${leg}`}
              >
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                    {STACK_LABEL[leg]}
                  </div>
                  {row ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Link href={`/admin/vendors/${row.vendorId}?tab=gooddeed`} className="text-sm text-slate-900 hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors inline-flex items-center gap-1" data-testid={`${testId}-leg-${leg}-link`}>
                        {row.vendorName}
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </Link>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400 mt-0.5">— No vendor assigned —</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-slate-900 tabular-nums" data-testid={`${testId}-leg-${leg}-cost`}>
                    {row?.perUnitCents != null ? dollars(row.perUnitCents) : "—"}
                  </div>
                  <PriceChangeLine updatedAt={row?.updatedAt ?? null} />
                </div>
              </div>
            );
          })}

          <div className="px-3 py-2 text-xs text-slate-500 italic" data-testid={`${testId}-shipping-note`}>
            Shipping (print → hologram → insertion → fulfillment) is
            bundled into the Quickprinter rung today. Per-leg shipping
            vendors will list here individually once the shipping-leg
            model lands (tracked separately).
          </div>
        </div>
      )}

      <div className="rounded-md bg-white border border-slate-200 text-sm divide-y divide-slate-100">
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-slate-600">Vendor subtotal / unit</span>
          <span className="text-slate-900 font-medium tabular-nums" data-testid={`${testId}-subtotal`}>
            {dollars(subtotalCents)}
          </span>
        </div>
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-slate-600">GoodTunes margin / unit</span>
          <span className={"font-medium tabular-nums " + (marginCents < 0 ? "text-[color:var(--brand-heart)]" : "text-slate-900")} data-testid={`${testId}-margin`}>
            {dollars(marginCents)}
          </span>
        </div>
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-slate-900 font-semibold">Rung wholesale / unit</span>
          <span className="text-slate-900 font-semibold tabular-nums" data-testid={`${testId}-wholesale`}>
            {dollars(wholesaleCents)}
          </span>
        </div>
      </div>

      {mismatch && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid={`${testId}-mismatch`}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Doesn't match cost stack — margin = {dollars(marginCents)}{" "}
            (vendor subtotal {dollars(subtotalCents)} vs rung wholesale{" "}
            {dollars(wholesaleCents)}). Re-check the ladder rung or the
            vendor's pricing.
          </span>
        </div>
      )}

      {erosion && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid={`${testId}-erosion`}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            A vendor cost rose since this ladder was last saved
            {ladderUpdatedAt ? <> ({timeAgo(ladderUpdatedAt)})</> : null}.
            Re-save the rung to lock in the new cost stack.
          </span>
        </div>
      )}
    </div>
  );
}

// --- Per-format pricing ----------------------------------------------------

function FormatCostsCard({ formatCosts }: { formatCosts: PayoutFormatCost[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4" data-testid="panel-format-costs">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-900">Per-format pricing</h2>
        <p className="text-[13px] text-slate-500 mt-1">
          Publishing fee, payment processing, and the GoodTunes margin charged on every unit
          of each format. Manufacturing is a placeholder for free / non-invited flows — when
          a press's catalog covers the format, the catalog's price ladder wins on cost.
        </p>
      </div>
      <div className="space-y-3">
        {ALBUM_FORMATS.map((fmt) => {
          const row = formatCosts.find((r) => r.format === fmt);
          if (!row) return null;
          return <FormatCostRow key={fmt} row={row} />;
        })}
      </div>
    </div>
  );
}

function FormatCostRow({ row }: { row: PayoutFormatCost }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const initial = useMemo(
    () => ({
      manufacturingCents: (row.manufacturingCents / 100).toFixed(2),
      publishingCents: (row.publishingCents / 100).toFixed(2),
      paymentProcessingCents: (row.paymentProcessingCents / 100).toFixed(2),
      goodtunesCents: (row.goodtunesCents / 100).toFixed(2),
    }),
    [row.manufacturingCents, row.publishingCents, row.paymentProcessingCents, row.goodtunesCents],
  );
  const [values, setValues] = useState<Record<FormatCostField, string>>(initial);
  useEffect(() => {
    setValues(initial);
  }, [initial]);

  const dirty = FORMAT_COST_FIELDS.some((f) => parseDollars(values[f.key]) !== row[f.key]);
  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, number> = {};
      for (const f of FORMAT_COST_FIELDS) {
        const c = parseDollars(values[f.key]);
        if (c == null) throw new Error(`Enter a valid ${f.label.toLowerCase()} amount`);
        body[f.key] = c;
      }
      const r = await apiRequest("PUT", `/api/admin/payout-format-costs/${row.format}`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payout-format-costs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums"] });
      toast({ title: `Saved ${ALBUM_FORMAT_LABEL[row.format as AlbumFormat]} pricing` });
      setEditing(false);
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });
  const total = FORMAT_COST_FIELDS.reduce(
    (sum, f) => sum + (parseDollars(values[f.key]) ?? 0),
    0,
  );

  return (
    <div className="rounded-md border border-slate-200 p-3" data-testid={`row-format-cost-${row.format}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-slate-900">
          {ALBUM_FORMAT_LABEL[row.format as AlbumFormat]}
        </span>
        <div className="flex items-center gap-1">
          {editing && (
            <>
              <button
                type="button"
                onClick={() => {
                  setValues(initial);
                  setEditing(false);
                }}
                className="h-8 px-2.5 rounded-md text-xs font-medium text-slate-500 hover:bg-slate-50"
                data-testid={`button-cancel-format-cost-${row.format}`}
              >
                Cancel
              </button>
              <SaveLink
                dirty={dirty}
                busy={save.isPending}
                onClick={() => save.mutate()}
                testId={`button-save-format-cost-${row.format}`}
              />
            </>
          )}
          {/* IconButton-equivalent admin ghost — matches CardHeader. */}
          <EditPencil
            active={editing}
            onClick={() => {
              if (editing) {
                if (dirty && !window.confirm("Discard unsaved changes?")) return;
                setValues(initial);
                setEditing(false);
              } else {
                setEditing(true);
              }
            }}
            testId={`edit-format-cost-${row.format}`}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {FORMAT_COST_FIELDS.map((f) => (
          <div key={f.key}>
            <span className="block text-slate-500 text-[10.5px] font-semibold uppercase tracking-wider mb-1">
              {f.label}
            </span>
            {editing ? (
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[12px]">$</span>
                <input
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  inputMode="decimal"
                  className="w-full h-8 border border-slate-200 rounded-md pl-5 pr-2 text-xs focus:outline-none focus:border-[color:var(--brand-blue)]"
                  data-testid={`input-${f.key}-${row.format}`}
                />
              </div>
            ) : (
              <div className="text-sm text-slate-900 font-medium tabular-nums" data-testid={`text-${f.key}-${row.format}`}>
                ${values[f.key]}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 text-right text-[12px] text-slate-500">
        Total per unit:{" "}
        <span className="text-slate-900 font-semibold" data-testid={`text-format-total-${row.format}`}>
          {dollars(total)}
        </span>
      </div>
    </div>
  );
}

// --- Quickprinter ladder ---------------------------------------------------

const QP_RUNGS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
type ServiceRow = {
  id: string;
  service: string;
  active: boolean;
  tiers: Array<{ qty: number; perUnitCents: number }> | null;
  sizeLadders: Record<string, Array<{ qty: number; perUnitCents: number }>> | null;
  flatPerUnitCents: number | null;
  setupFeeCents: number;
  minBatch: number;
  leadTimeDays: number;
};

function QuickprinterLadderCard({ vendorId }: { vendorId: string }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const { data, isLoading } = useQuery<{
    vendor: { id: string; name: string };
    services: ServiceRow[];
  }>({
    queryKey: ["/api/admin/vendors", vendorId, "gooddeed-services"],
  });
  const printing = data?.services.find((s) => s.service === "printing") ?? null;

  const seed = (): Record<number, string> => {
    const ladder = printing?.sizeLadders?.letter ?? printing?.tiers ?? [];
    const map: Record<number, string> = {};
    for (const rung of QP_RUNGS) {
      const t = ladder.find((x) => x.qty === rung);
      map[rung] = t ? (t.perUnitCents / 100).toFixed(2) : "";
    }
    return map;
  };
  const [letter, setLetter] = useState<Record<number, string>>(seed);
  useEffect(() => {
    setLetter(seed());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printing?.id, printing?.sizeLadders, printing?.tiers]);

  const baseline = seed();
  const dirty = QP_RUNGS.some((rung) => (letter[rung] ?? "") !== (baseline[rung] ?? ""));

  const save = useMutation({
    mutationFn: async () => {
      if (!printing) throw new Error("No printing row");
      const letterLadder: Array<{ qty: number; perUnitCents: number }> = [];
      for (const rung of QP_RUNGS) {
        const raw = (letter[rung] ?? "").trim();
        if (!raw) continue;
        const n = Number.parseFloat(raw);
        if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid price at qty ${rung}`);
        letterLadder.push({ qty: rung, perUnitCents: Math.round(n * 100) });
      }
      if (letterLadder.length === 0) throw new Error("Set at least one rung");
      const r = await apiRequest("PUT", `/api/admin/vendors/${vendorId}/gooddeed-services`, {
        service: "printing",
        active: printing.active,
        tiers: letterLadder,
        sizeLadders: { letter: letterLadder },
        setupFeeCents: printing.setupFeeCents,
        minBatch: printing.minBatch,
        leadTimeDays: printing.leadTimeDays,
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vendors", vendorId, "gooddeed-services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gooddeed-cost-stack"] });
      toast({ title: "Quickprinter ladder saved" });
      setEditing(false);
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save ladder", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3" data-testid="panel-quickprinter-ladder">
      <CardHeader
        title={`Quickprinter price ladder${data?.vendor ? ` — ${data.vendor.name}` : ""}`}
        subtitle="Per-unit cost at each quantity rung. Quantities between rungs walk down to the next-lower rung's price. Blank cells fall through too."
        editing={editing}
        dirty={dirty}
        onEnterEdit={() => setEditing(true)}
        onCancelEdit={() => {
          setLetter(seed());
          setEditing(false);
        }}
        testId="quickprinter-ladder"
      />

      <div className="flex items-center gap-1.5 border-b border-slate-100">
        <button
          type="button"
          className="px-3 h-8 text-xs font-semibold border-b-2 border-[color:var(--brand-blue)] text-slate-900"
          data-testid="tab-paper-letter"
        >
          US Letter (8.5×11)
        </button>
        <button
          type="button"
          disabled
          className="px-3 h-8 text-xs font-medium text-slate-300 cursor-not-allowed"
          data-testid="tab-paper-12x18"
          title="Scaffolded — wired up in a future task"
        >
          12×18 (coming soon)
        </button>
      </div>

      {isLoading || !printing ? (
        <div className="py-6 text-slate-500 text-sm">
          {isLoading ? "Loading ladder…" : "This vendor has no Printing row yet — add one from their vendor portal."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {QP_RUNGS.map((rung) => (
              <div key={rung} data-testid={`field-qp-rung-${rung}`}>
                <span className="block text-slate-500 text-[10.5px] font-semibold uppercase tracking-wider mb-1">
                  {rung} units
                </span>
                {editing ? (
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[12px]">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={letter[rung] ?? ""}
                      onChange={(e) => setLetter((m) => ({ ...m, [rung]: e.target.value }))}
                      placeholder="—"
                      className="w-full h-8 border border-slate-200 rounded-md pl-5 pr-2 text-right text-xs focus:outline-none focus:border-[color:var(--brand-blue)]"
                      data-testid={`input-qp-rung-${rung}`}
                    />
                  </div>
                ) : (
                  <div className="text-right text-sm font-medium text-slate-900 tabular-nums" data-testid={`text-qp-rung-${rung}`}>
                    {letter[rung] ? `$${letter[rung]}` : <span className="text-slate-300">—</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
          {editing && (
            <div className="flex justify-end items-center gap-1 pt-1">
              <button
                type="button"
                onClick={() => {
                  setLetter(seed());
                  setEditing(false);
                }}
                className="h-8 px-2.5 rounded-md text-xs font-medium text-slate-500 hover:bg-slate-50"
                data-testid="button-cancel-qp-ladder"
              >
                Cancel
              </button>
              <SaveLink
                dirty={dirty}
                busy={save.isPending}
                onClick={() => save.mutate()}
                testId="button-save-qp-ladder"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
