// Task #1609 — Admin: review + act on flagged digital cert names.
//
// Digital-only GoodDeed owners set the name printed on their certificate
// on a per-order field (orders.cert_confirmed_name) — they never mint a
// signed_cert_certificates row, so these names never appear in the print
// queue. This surface lists every digital order whose fan chose a name,
// surfaces the suspect ones (lightweight blocklist, flag-not-block) at
// the top, and lets the operator either CLEAR a bad name (re-opening the
// one-time fan edit) or CANCEL + REFUND the order (shared refund endpoint).
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient, getAuthToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AdminErrorBoundary, ErrorState } from "@/components/admin/AdminErrorBoundary";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { formatUsdCents } from "@shared/money";

type CertNameRow = {
  orderId: string;
  confirmedName: string | null;
  confirmedAt: string | null;
  status: string;
  goodDeedNumber: number | null;
  totalCents: number;
  origin: string | null;
  refundedAt: string | null;
  albumTitle: string;
  albumArtist: string;
  albumArtwork: string | null;
  customerEmail: string;
  customerDisplayName: string | null;
  flagged: boolean;
  flagMatches: string[];
};

export function AdminCertNames() {
  return (
    <AdminErrorBoundary title="Certificate names failed to render">
      <AdminCertNamesInner />
    </AdminErrorBoundary>
  );
}

function AdminCertNamesInner() {
  const { toast } = useToast();
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const {
    data: rows,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<CertNameRow[]>({
    queryKey: ["/api/admin/cert-names"],
    queryFn: async () => {
      const token = getAuthToken();
      const r = await fetch("/api/admin/cert-names", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) {
        let msg = `Request failed (${r.status})`;
        try {
          const body = await r.json();
          if (body?.message) msg = body.message;
        } catch {}
        throw new Error(msg);
      }
      return r.json();
    },
  });

  const reset = useMutation({
    mutationFn: async (orderId: string) => {
      await apiRequest("POST", `/api/admin/cert-names/${orderId}/reset`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cert-names"] });
      toast({ title: "Name cleared", description: "The fan can pick a new name from their cert viewer." });
    },
    onError: (e: any) => {
      toast({ title: "Couldn't clear name", description: e?.message, variant: "destructive" });
    },
  });

  const refund = useMutation({
    mutationFn: async (orderId: string) => {
      await apiRequest("POST", `/api/admin/orders/${orderId}/refund`, {
        reason: "Certificate name policy violation",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cert-names"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: "Order refunded", description: "The full order was cancelled and refunded." });
    },
    onError: (e: any) => {
      toast({ title: "Refund failed", description: e?.message, variant: "destructive" });
    },
  });

  const visible = useMemo(() => {
    const all = rows ?? [];
    return flaggedOnly ? all.filter((r) => r.flagged) : all;
  }, [rows, flaggedOnly]);

  const flaggedCount = useMemo(() => (rows ?? []).filter((r) => r.flagged).length, [rows]);

  function onClear(row: CertNameRow) {
    if (!window.confirm(`Clear the name "${row.confirmedName}"? The fan will be able to pick a new one.`)) return;
    reset.mutate(row.orderId);
  }

  function onRefund(row: CertNameRow) {
    if (
      !window.confirm(
        `Cancel + fully refund this order (${formatUsdCents(row.totalCents)})? This voids the GoodDeed and cannot be undone.`,
      )
    )
      return;
    refund.mutate(row.orderId);
  }

  return (
    <AdminFrame active="cert-names">
      <div className="max-w-5xl mx-auto py-8 space-y-5" data-testid="page-admin-cert-names">
        <AdminPageHeader
          title="Certificate names."
          subtitle={
            <>
              Names fans chose for their <span className="text-[var(--apple-ink)]">digital</span> GoodDeed certificates. Suspect
              entries are flagged for review — clear a bad name to let the fan pick again, or cancel + refund the order.
              Physical signed-certificate names live in the{" "}
              <Link href="/admin/print-queue" className="text-[color:var(--brand-blue)] hover:underline">
                print queue
              </Link>{" "}
              instead.
            </>
          }
          actions={
            <Link
              href="/admin/print-queue"
              className="text-[12px] text-[var(--apple-subink)] hover:text-[color:var(--brand-blue)] hover:underline px-3 py-1.5 rounded-full hover:bg-[var(--apple-track)] transition-colors"
              data-testid="link-print-queue"
            >
              Print queue →
            </Link>
          }
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFlaggedOnly(false)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
              !flaggedOnly ? "bg-[var(--apple-ink)] text-white" : "bg-[var(--apple-track)] text-[var(--apple-subink)] hover:bg-[var(--apple-chip)]"
            }`}
            data-testid="tab-all"
          >
            All ({(rows ?? []).length})
          </button>
          <button
            type="button"
            onClick={() => setFlaggedOnly(true)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
              flaggedOnly ? "bg-[var(--apple-critical)]/15 text-[var(--apple-critical)]" : "bg-[var(--apple-track)] text-[var(--apple-subink)] hover:bg-[var(--apple-chip)]"
            }`}
            data-testid="tab-flagged"
          >
            Flagged ({flaggedCount})
          </button>
        </div>

        {isLoading && <div className="text-[13px] text-[var(--apple-subink)]" data-testid="loading">Loading…</div>}
        {isError && (
          <ErrorState
            error={error}
            onRetry={() => refetch()}
            title="Couldn't load certificate names"
            testId="cert-names-error"
          />
        )}
        {!isLoading && !isError && visible.length === 0 && (
          <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white" data-testid="empty">
            <AdminEmptyState>
              {flaggedOnly ? "No flagged names." : "No fan-chosen certificate names yet."}
            </AdminEmptyState>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {visible.map((r) => {
            const refunded = r.status === "refunded" || !!r.refundedAt;
            return (
              <div
                key={r.orderId}
                className={`rounded-2xl border p-3 flex items-center gap-3 ${
                  r.flagged ? "border-[var(--apple-critical)]/30 bg-[var(--apple-critical)]/[0.06]" : "border-[var(--apple-hairline)] bg-white"
                }`}
                data-testid={`row-cert-name-${r.orderId}`}
              >
                {r.albumArtwork && (
                  <img src={r.albumArtwork} alt="" className="w-12 h-12 rounded-md object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.flagged && (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-[var(--apple-critical)]/15 text-[var(--apple-critical)]"
                        title={`Matched: ${r.flagMatches.join(", ")}`}
                        data-testid={`badge-flagged-${r.orderId}`}
                      >
                        Flagged
                      </span>
                    )}
                    {refunded && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-[var(--apple-chip)] text-[var(--apple-subink)]">
                        Refunded
                      </span>
                    )}
                    {r.goodDeedNumber !== null && (
                      <span className="text-[11px] text-[var(--apple-subink)]" data-testid={`gooddeed-${r.orderId}`}>
                        #{r.goodDeedNumber}
                      </span>
                    )}
                    {r.origin === "legacy:gogoods" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-[var(--apple-warning)]/10 text-[var(--apple-warning)]">
                        Legacy
                      </span>
                    )}
                  </div>
                  <div
                    className="text-[14px] font-medium text-[var(--apple-ink)] truncate mt-0.5"
                    data-testid={`name-${r.orderId}`}
                  >
                    {r.confirmedName}
                  </div>
                  <div className="text-[12px] text-[var(--apple-subink)] truncate">
                    {r.albumTitle} — {r.albumArtist} · {r.customerEmail}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <a
                    href={`/api/admin/legacy-cert-preview/order/${r.orderId}.pdf?name=${encodeURIComponent(
                      r.confirmedName ?? "",
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-[color:var(--brand-blue)] hover:underline active:opacity-70"
                    data-testid={`link-preview-${r.orderId}`}
                  >
                    Preview cert
                  </a>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onClear(r)}
                      disabled={reset.isPending}
                      className="text-[11px] text-[var(--apple-subink)] hover:text-[var(--apple-ink)] active:opacity-70 disabled:opacity-40"
                      data-testid={`button-clear-${r.orderId}`}
                    >
                      Clear name
                    </button>
                    {!refunded && (
                      <>
                        <span className="text-[var(--apple-faint)]">·</span>
                        <button
                          type="button"
                          onClick={() => onRefund(r)}
                          disabled={refund.isPending}
                          className="text-[11px] text-[var(--apple-critical)] hover:text-[var(--apple-critical)] active:opacity-70 disabled:opacity-40"
                          data-testid={`button-refund-${r.orderId}`}
                        >
                          Cancel + refund
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminFrame>
  );
}

export default AdminCertNames;
