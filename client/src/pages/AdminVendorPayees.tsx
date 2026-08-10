import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Mail, RefreshCw } from "lucide-react";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { StatusDot, type StatusDotTone } from "@/components/admin/StatusDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Task #3005 — press (vendor) payout onboarding lifecycle. Each press
// is onboarded once as a Stripe Connect Express account; status runs
// Invited → Onboarding → Active. A press can only be paid once Active.
// Super-admin-only page (the API 403s everyone else).

interface VendorPayeeRow {
  manufacturerId: string;
  name: string;
  contactEmail: string | null;
  account: {
    id: string;
    email: string | null;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    disabledReason: string | null;
    requirementsDue: string[];
    onboardingEmailSentAt: string | null;
    onboardingEmailCount: number;
    lastSyncedAt: string | null;
  } | null;
  onboardingStatus: "none" | "invited" | "onboarding" | "active";
}

const STATUS_LABEL: Record<VendorPayeeRow["onboardingStatus"], string> = {
  none: "Not invited",
  invited: "Invited",
  onboarding: "Onboarding",
  active: "Active",
};
const STATUS_TONE: Record<VendorPayeeRow["onboardingStatus"], StatusDotTone> = {
  none: "neutral",
  invited: "warning",
  onboarding: "warning",
  active: "ready",
};

export default function AdminVendorPayees() {
  const { toast } = useToast();
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});

  const { data, isLoading, refetch, isRefetching } = useQuery<VendorPayeeRow[]>({
    queryKey: ["/api/admin/vendor-payees"],
  });

  const inviteMut = useMutation({
    mutationFn: async ({ manufacturerId, email }: { manufacturerId: string; email?: string }) => {
      await apiRequest("POST", `/api/admin/vendor-payees/${manufacturerId}/invite`, email ? { email } : {});
    },
    onSuccess: () => {
      toast({ title: "Onboarding email sent", description: "The press received their Stripe onboarding link." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vendor-payees"] });
    },
    onError: (err: any) => {
      toast({ title: "Invite failed", description: err?.message ?? "Try again.", variant: "destructive" });
    },
  });

  return (
    <AdminFrame active="vendor-payees" contentWidth="wide">
      <div className="max-w-[1100px] mx-auto px-4 py-6 space-y-6">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.02em] text-[var(--apple-ink)]" data-testid="text-page-title">
              Vendor payees.
            </h1>
            <p className="text-sm text-[var(--apple-subink)] mt-1 max-w-xl">
              Presses and plants we pay via Stripe Connect. Email each one its onboarding link; a press can only be
              paid once its status is Active. Pay from an album&rsquo;s manufacturing ledger.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching} data-testid="button-refresh">
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} /> Refresh status
          </Button>
        </header>

        {isLoading && <div className="text-sm text-[var(--apple-subink)]">Loading…</div>}
        {!isLoading && (data ?? []).length === 0 && (
          <AdminEmptyState testId="text-empty">No presses on file yet.</AdminEmptyState>
        )}

        {(data ?? []).length > 0 && (
          <div className="rounded-2xl border border-[var(--apple-hairline)] divide-y divide-[var(--apple-hairline)] bg-white">
            {(data ?? []).map((row) => {
              const draft = emailDrafts[row.manufacturerId] ?? "";
              const effectiveEmail = draft || row.account?.email || row.contactEmail || "";
              const needsEmail = !effectiveEmail;
              const pending = inviteMut.isPending && (inviteMut.variables as any)?.manufacturerId === row.manufacturerId;
              return (
                <div key={row.manufacturerId} className="p-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3" data-testid={`row-vendor-${row.manufacturerId}`}>
                  <div className="space-y-1.5">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="text-sm font-semibold text-[var(--apple-ink)]">{row.name}</span>
                      <StatusDot tone={STATUS_TONE[row.onboardingStatus]}>
                        {STATUS_LABEL[row.onboardingStatus]}
                      </StatusDot>
                    </div>
                    <div className="text-xs text-[var(--apple-subink)]">
                      {row.account?.email || row.contactEmail || "No email on file"}
                      {row.account?.onboardingEmailSentAt && (
                        <>
                          {" "}· link emailed {new Date(row.account.onboardingEmailSentAt).toLocaleDateString()}
                          {row.account.onboardingEmailCount > 1 ? ` (×${row.account.onboardingEmailCount})` : ""}
                        </>
                      )}
                    </div>
                    {row.account?.disabledReason && (
                      <div className="text-xs text-[var(--apple-critical)]">Stripe: {row.account.disabledReason}</div>
                    )}
                    {row.onboardingStatus !== "active" && (row.account?.requirementsDue?.length ?? 0) > 0 && (
                      <div className="text-xs text-[var(--apple-subink)]">
                        Stripe still needs: {row.account!.requirementsDue.slice(0, 4).join(", ")}
                        {row.account!.requirementsDue.length > 4 ? "…" : ""}
                      </div>
                    )}
                  </div>
                  {row.onboardingStatus !== "active" && (
                    <div className="flex items-center gap-2 md:justify-end flex-wrap">
                      {!row.account?.email && !row.contactEmail && (
                        <Input
                          type="email"
                          placeholder="press@example.com"
                          value={draft}
                          onChange={(e) => setEmailDrafts((d) => ({ ...d, [row.manufacturerId]: e.target.value }))}
                          className="h-8 text-xs w-56"
                          data-testid={`input-email-${row.manufacturerId}`}
                        />
                      )}
                      <Button
                        size="sm"
                        variant={row.onboardingStatus === "none" ? "default" : "outline"}
                        disabled={pending || needsEmail}
                        onClick={() =>
                          inviteMut.mutate({ manufacturerId: row.manufacturerId, email: draft || undefined })
                        }
                        data-testid={`button-invite-${row.manufacturerId}`}
                      >
                        <Mail className="w-4 h-4 mr-1.5" />
                        {pending
                          ? "Sending…"
                          : row.onboardingStatus === "none"
                            ? "Email onboarding link"
                            : "Re-send link"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminFrame>
  );
}
