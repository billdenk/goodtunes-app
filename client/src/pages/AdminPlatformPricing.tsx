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
import type { PayoutSettings } from "@shared/schema";

type RoleInfo = { role: string; roleScopeId: string | null };

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
      </div>
    </AdminFrame>
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
