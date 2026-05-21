// Task #48 — Payout panel for a Person or Label detail page.
// Manages a single Stripe Connect Express account: create, onboard,
// refresh capability flags, and unlink.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, AlertTriangle, ExternalLink, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { SiStripe } from "react-icons/si";
import type { PayoutAccount, PayoutOwnerKind } from "@shared/schema";

interface Props {
  ownerKind: PayoutOwnerKind;
  ownerId: string;
  ownerName: string;
  ownerEmail?: string | null;
}

export function PayoutAccountPanel({ ownerKind, ownerId, ownerName, ownerEmail }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [unlinking, setUnlinking] = useState(false);

  const accountQ = useQuery<PayoutAccount | null>({
    queryKey: ["/api/admin/payouts/accounts", ownerKind, ownerId],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch(
        `/api/admin/payouts/accounts?ownerKind=${ownerKind}&ownerId=${encodeURIComponent(ownerId)}`,
        {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/payouts/accounts", {
        ownerKind,
        ownerId,
        email: ownerEmail ?? undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/payouts/accounts", ownerKind, ownerId] });
      toast({ title: "Stripe account created", description: "Click 'Continue onboarding' to finish KYC." });
    },
    onError: (e: any) => toast({ title: "Couldn't create account", description: e?.message, variant: "destructive" }),
  });

  const onboard = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await apiRequest("POST", `/api/admin/payouts/accounts/${accountId}/onboard`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.url) window.open(data.url, "_blank", "noopener,noreferrer");
    },
    onError: (e: any) => toast({ title: "Couldn't open onboarding", description: e?.message, variant: "destructive" }),
  });

  const refresh = useMutation({
    mutationFn: async (accountId: string) => apiRequest("POST", `/api/admin/payouts/accounts/${accountId}/refresh`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/payouts/accounts", ownerKind, ownerId] });
      toast({ title: "Status refreshed from Stripe" });
    },
    onError: (e: any) => toast({ title: "Couldn't refresh", description: e?.message, variant: "destructive" }),
  });

  const unlink = useMutation({
    mutationFn: async (accountId: string) => apiRequest("DELETE", `/api/admin/payouts/accounts/${accountId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/payouts/accounts", ownerKind, ownerId] });
      setUnlinking(false);
      toast({ title: "Connected account removed" });
    },
    onError: (e: any) => toast({ title: "Couldn't remove", description: e?.message, variant: "destructive" }),
  });

  const account = accountQ.data;

  if (accountQ.isLoading) {
    return (
      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6" data-testid="panel-payouts-loading">
        <div className="flex items-center gap-2 text-slate-400 text-[13px]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading payout details…
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-4" data-testid="panel-payouts">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-900 text-[14px] font-bold flex items-center gap-2">
            <SiStripe className="w-3.5 h-3.5 text-[#635BFF]" />
            Stripe Connect payouts
          </h2>
          <p className="text-slate-500 text-[12px] mt-0.5">
            When an order on a release tied to {ownerName} ships, the artist share is auto-transferred here.
          </p>
        </div>
      </div>

      {!account && (
        <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center" data-testid="payouts-no-account">
          <p className="text-slate-700 text-[13.5px] font-medium">No connected Stripe account yet</p>
          <p className="text-slate-500 text-[12px] mt-1">
            Create an Express account, then run the onboarding link to collect KYC + a bank account.
          </p>
          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="mt-3 h-9 px-4 rounded-md bg-[#319ED8] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-60 inline-flex items-center gap-2"
            data-testid="button-create-payout-account"
          >
            {create.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SiStripe className="w-3.5 h-3.5" />}
            Create Stripe Express account
          </button>
        </div>
      )}

      {account && <AccountDetails account={account} onboard={onboard} refresh={refresh} onUnlink={() => setUnlinking(true)} />}

      {unlinking && account && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 space-y-2" data-testid="payouts-unlink-confirm">
          <p className="text-rose-700 text-[13px] font-medium">Remove this connected account?</p>
          <p className="text-rose-600 text-[12px]">
            Existing transfers stay in Stripe. Future orders for {ownerName} will land in stuck-cases until you link a new account.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setUnlinking(false)}
              className="h-8 px-3 rounded-md bg-white border border-slate-200 text-slate-700 text-[12px] font-semibold hover:bg-slate-50"
              data-testid="button-unlink-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => unlink.mutate(account.id)}
              disabled={unlink.isPending}
              className="h-8 px-3 rounded-md bg-rose-600 text-white text-[12px] font-semibold hover:bg-rose-700 disabled:opacity-60"
              data-testid="button-unlink-confirm"
            >
              {unlink.isPending ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function AccountDetails({
  account,
  onboard,
  refresh,
  onUnlink,
}: {
  account: PayoutAccount;
  onboard: ReturnType<typeof useMutation<any, any, string>>;
  refresh: ReturnType<typeof useMutation<any, any, string>>;
  onUnlink: () => void;
}) {
  const ready = account.payoutsEnabled && account.detailsSubmitted;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        <Field label="Stripe account">
          <span className="font-mono text-[11.5px] text-slate-700" data-testid="text-stripe-account-id">{account.stripeAccountId}</span>
        </Field>
        <Field label="KYC status">
          {ready ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 text-[12.5px] font-semibold" data-testid="status-kyc-ready">
              <CheckCircle2 className="w-3.5 h-3.5" /> Ready to receive payouts
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-700 text-[12.5px] font-semibold" data-testid="status-kyc-pending">
              <AlertTriangle className="w-3.5 h-3.5" />
              {account.detailsSubmitted ? "Awaiting Stripe review" : "Onboarding incomplete"}
            </span>
          )}
        </Field>
        <Field label="Charges enabled">
          <span className={account.chargesEnabled ? "text-emerald-700" : "text-slate-400"}>
            {account.chargesEnabled ? "Yes" : "No"}
          </span>
        </Field>
        <Field label="Payouts enabled">
          <span className={account.payoutsEnabled ? "text-emerald-700" : "text-slate-400"}>
            {account.payoutsEnabled ? "Yes" : "No"}
          </span>
        </Field>
      </div>

      {account.requirementsDue && account.requirementsDue.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3" data-testid="payouts-requirements">
          <p className="text-amber-800 text-[12px] font-semibold mb-1">Stripe still needs:</p>
          <ul className="text-amber-700 text-[11.5px] list-disc pl-5 space-y-0.5">
            {account.requirementsDue.slice(0, 6).map((r) => (
              <li key={r}>{prettyRequirement(r)}</li>
            ))}
            {account.requirementsDue.length > 6 && <li>…and {account.requirementsDue.length - 6} more</li>}
          </ul>
        </div>
      )}

      {account.disabledReason && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700 text-[12px]" data-testid="payouts-disabled-reason">
          Account disabled: {account.disabledReason}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => onboard.mutate(account.id)}
          disabled={onboard.isPending}
          className="h-9 px-3 rounded-md bg-[#319ED8] text-white text-[12px] font-semibold hover:bg-[#2890c8] disabled:opacity-60 inline-flex items-center gap-1.5"
          data-testid="button-continue-onboarding"
        >
          {onboard.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
          {ready ? "Update Stripe info" : "Continue onboarding"}
        </button>
        <button
          type="button"
          onClick={() => refresh.mutate(account.id)}
          disabled={refresh.isPending}
          className="h-9 px-3 rounded-md bg-white border border-slate-200 text-slate-700 text-[12px] font-semibold hover:bg-slate-50 inline-flex items-center gap-1.5"
          data-testid="button-refresh-payout-status"
        >
          {refresh.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh status
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onUnlink}
          className="h-9 px-3 rounded-md text-rose-600 text-[12px] font-semibold hover:bg-rose-50 inline-flex items-center gap-1.5"
          data-testid="button-unlink-payout-account"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Unlink
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-0.5">{label}</dt>
      <dd className="text-[13px] text-slate-900">{children}</dd>
    </div>
  );
}

function prettyRequirement(r: string): string {
  return r
    .replace(/_/g, " ")
    .replace(/\bdob\b/g, "date of birth")
    .replace(/\bssn\b/g, "SSN")
    .replace(/^business profile\./, "business profile: ")
    .replace(/^individual\./, "individual: ")
    .replace(/^external account$/, "bank account");
}
