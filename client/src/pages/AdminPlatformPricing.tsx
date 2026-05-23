// Task #119 — super-admin platform pricing.
//
// One page, two knobs: the platform's wholesale cost of a printed +
// signed GoodDeed certificate (`certCostCents`) and the per-order
// Shopify checkout fee (`shopifyFeeCents`). Saving here updates the
// global `payout_settings` singleton; the SellPanel's "You earn
// $X.XX per unit" readout reads the new cost the next time an artist
// saves their signed-cert addon (price-lock — see docs/admin-conventions.md).
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import type { PayoutSettings, PayoutFormatCost, AlbumFormat } from "@shared/schema";
import { ALBUM_FORMATS, ALBUM_FORMAT_LABEL } from "@shared/schema";

type RoleInfo = { role: string; roleScopeId: string | null };

// Task #218 — the four per-format lines super-admins edit here. Manufacturing
// stays as a placeholder for non-vinyl + free flows; invited-press vinyl now
// pulls its manufacturing cents from the press catalog ladder instead.
const FORMAT_COST_FIELDS = [
  { key: "manufacturingCents", label: "Manufacturing" },
  { key: "publishingCents", label: "Publishing" },
  { key: "paymentProcessingCents", label: "Payment processing" },
  { key: "goodtunesCents", label: "GoodTunes margin" },
] as const;
type FormatCostField = (typeof FORMAT_COST_FIELDS)[number]["key"];

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
const parseDollars = (v: string): number | null => {
  const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

export function AdminPlatformPricing() {
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => document.body.classList.remove("gt-admin");
  }, []);
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

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

  const [certStr, setCertStr] = useState("");
  const [shopifyStr, setShopifyStr] = useState("");

  useEffect(() => {
    if (settings) {
      setCertStr((settings.certCostCents / 100).toFixed(2));
      setShopifyStr((settings.shopifyFeeCents / 100).toFixed(2));
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, number> = {};
      const cert = parseDollars(certStr);
      const shopify = parseDollars(shopifyStr);
      if (cert === null || shopify === null) {
        throw new Error("Enter both prices as dollar amounts");
      }
      body.certCostCents = cert;
      body.shopifyFeeCents = shopify;
      const r = await apiRequest("PUT", "/api/admin/payout-settings", body);
      return (await r.json()) as PayoutSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payout-settings"] });
      toast({ title: "Platform pricing saved" });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  if (authLoading || roleLoading) {
    return (
      <AdminFrame active="platform-pricing">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
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
          <div className="rounded-lg border border-slate-200 bg-white p-5 max-w-2xl space-y-5">
            <Field
              label="Printed & signed certificate"
              hint={`Wholesale cost per unit. Currently ${dollars(settings.certCostCents)}. Default $12.00.`}
              value={certStr}
              onChange={setCertStr}
              testId="input-cert-cost"
            />
            <Field
              label="Shopify checkout fee"
              hint={`Per-order Shopify checkout fee. Currently ${dollars(settings.shopifyFeeCents)}. Default $3.50.`}
              value={shopifyStr}
              onChange={setShopifyStr}
              testId="input-shopify-fee"
            />

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => save.mutate()}
                disabled={save.isPending}
                className="h-9 px-4 rounded-md bg-[#319ED8] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-60"
                data-testid="button-save-platform-pricing"
              >
                {save.isPending ? "Saving…" : "Save"}
              </button>
            </div>

            <p className="text-[12px] text-slate-400 pt-2 border-t border-slate-100">
              Saving changes the global default. Existing signed-cert add-ons keep their previous
              cost snapshot until the artist re-saves their Sell panel — re-saving picks up the
              new platform price.
            </p>
          </div>
        )}

        <SignedCertLadderCard />

        {formatCosts && formatCosts.length > 0 && (
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
        )}
      </div>
    </AdminFrame>
  );
}

function FormatCostRow({ row }: { row: PayoutFormatCost }) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<FormatCostField, string>>(() => ({
    manufacturingCents: (row.manufacturingCents / 100).toFixed(2),
    publishingCents: (row.publishingCents / 100).toFixed(2),
    paymentProcessingCents: (row.paymentProcessingCents / 100).toFixed(2),
    goodtunesCents: (row.goodtunesCents / 100).toFixed(2),
  }));
  useEffect(() => {
    setValues({
      manufacturingCents: (row.manufacturingCents / 100).toFixed(2),
      publishingCents: (row.publishingCents / 100).toFixed(2),
      paymentProcessingCents: (row.paymentProcessingCents / 100).toFixed(2),
      goodtunesCents: (row.goodtunesCents / 100).toFixed(2),
    });
  }, [row.manufacturingCents, row.publishingCents, row.paymentProcessingCents, row.goodtunesCents]);
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
      // Invited-press calculator on the SellPanel merges these defaults
      // into `formatCosts` — bust the album list so artists see the new
      // numbers immediately on the cost readout.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums"] });
      toast({ title: `Saved ${ALBUM_FORMAT_LABEL[row.format as AlbumFormat]} pricing` });
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
        <span className="text-[13.5px] font-semibold text-slate-900">
          {ALBUM_FORMAT_LABEL[row.format as AlbumFormat]}
        </span>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="h-8 px-3 rounded-md bg-[color:var(--brand-blue)] text-white text-[12px] font-semibold hover:opacity-90 disabled:opacity-60"
          data-testid={`button-save-format-cost-${row.format}`}
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {FORMAT_COST_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="block text-slate-500 text-[10.5px] font-semibold uppercase tracking-wider mb-1">
              {f.label}
            </span>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[12px]">$</span>
              <input
                value={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                inputMode="decimal"
                className="w-full h-8 border border-slate-200 rounded-md pl-5 pr-2 text-[12.5px] focus:outline-none focus:border-[color:var(--brand-blue)]"
                data-testid={`input-${f.key}-${row.format}`}
              />
            </div>
          </label>
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

// Task #241 — read-only reference rendering of the signed-cert wholesale
// ladder so operators always quote the same number the auto-charge logic
// uses. Source of truth lives in docs/shopify-pricing-strategy.md
// ("Signed-cert wholesale ladder" section); keep these in lockstep when
// the ladder moves.
const SIGNED_CERT_LADDER: { range: string; wholesale: string }[] = [
  { range: "25–49", wholesale: "$13" },
  { range: "50–99", wholesale: "$12" },
  { range: "100–199", wholesale: "$9" },
  { range: "200–299", wholesale: "$7" },
  { range: "300+", wholesale: "$6" },
];

function SignedCertLadderCard() {
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-5 max-w-2xl space-y-3"
      data-testid="panel-signed-cert-ladder"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-slate-900">
          Signed-cert wholesale ladder
        </h2>
        <p className="text-[13px] text-slate-500 mt-1">
          Per-unit price GoodTunes charges artists and labels for printed,
          signed, hologrammed GoodDeed certificates. Snapped to the actual
          run size at window close — not the artist's hoped-for number.
        </p>
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left font-semibold uppercase tracking-wider text-[10.5px] px-3 py-2">
                Batch size
              </th>
              <th className="text-right font-semibold uppercase tracking-wider text-[10.5px] px-3 py-2">
                Wholesale / unit
              </th>
            </tr>
          </thead>
          <tbody>
            {SIGNED_CERT_LADDER.map((row) => (
              <tr
                key={row.range}
                className="border-t border-slate-100"
                data-testid={`row-signed-cert-ladder-${row.range.replace(/[^0-9+]/g, "-")}`}
              >
                <td className="px-3 py-2 text-slate-900">{row.range}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900">
                  {row.wholesale}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="text-[12px] text-slate-500 space-y-1.5 pl-4 list-disc">
        <li>
          <span className="text-slate-900 font-medium">25-unit minimum.</span>{" "}
          If fewer than 25 sell at window close, the cert add-on auto-refunds
          and no print run happens.
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

      <p className="text-[11.5px] text-slate-400 pt-2 border-t border-slate-100">
        Read-only. Source of truth is{" "}
        <code className="text-slate-500">
          docs/shopify-pricing-strategy.md
        </code>{" "}
        — "Signed-cert wholesale ladder". Vendor-quoted inputs (the cost
        stack underneath this ladder) will move into a press-managed pricing
        portal in a later task.
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  testId,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  return (
    <label className="block">
      <span className="text-slate-900 text-[13.5px] font-semibold">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-slate-500 text-[13px]">$</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          className="w-32 h-9 border border-slate-200 rounded-md px-3 text-[13px] focus:outline-none focus:border-[#319ED8]"
          data-testid={testId}
        />
      </div>
      <p className="text-slate-500 text-[12px] mt-1.5">{hint}</p>
    </label>
  );
}
