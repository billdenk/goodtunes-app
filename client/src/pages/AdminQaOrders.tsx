// Task #2270 — QA test-purchase order cleanup.
// Lists all orders with origin='qa:test' so the operator can inspect
// and hard-delete test runs without them lingering in the real data.
// Only visible in non-production (Stripe test-mode) environments.
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AdminErrorBoundary } from "@/components/admin/AdminErrorBoundary";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatUsdCents } from "@shared/money";

type QaOrder = {
  id: string;
  created_at: string;
  album_id: string;
  album_title: string | null;
  buyer_email: string;
  buyer_name: string | null;
  total_cents: number;
  status: string;
  stripe_checkout_session_id: string | null;
};

function AdminQaOrdersInner() {
  const { toast } = useToast();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { data: orders = [], isLoading, error } = useQuery<QaOrder[]>({
    queryKey: ["/api/admin/qa-orders"],
  });

  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/admin/qa-orders/${id}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j as any)?.message ?? "Delete failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/qa-orders"] });
      toast({ title: "QA order deleted" });
      setPendingDeleteId(null);
    },
    onError: (e: any) => {
      toast({ title: "Delete failed", description: e?.message, variant: "destructive" });
      setPendingDeleteId(null);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("DELETE", "/api/admin/qa-orders");
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j as any)?.message ?? "Bulk delete failed");
      }
      return (await r.json().catch(() => ({}))) as { deleted?: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/qa-orders"] });
      toast({ title: `Removed ${data?.deleted ?? 0} QA test order${(data?.deleted ?? 0) === 1 ? "" : "s"}` });
      setBulkDeleteOpen(false);
    },
    onError: (e: any) => {
      toast({ title: "Bulk delete failed", description: e?.message, variant: "destructive" });
      setBulkDeleteOpen(false);
    },
  });

  return (
    <AdminFrame active="qa-orders">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-start gap-3 mb-6">
          <div className="flex-1">
            <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-[var(--apple-ink)]">QA test orders.</h1>
            <p className="text-sm text-[var(--apple-subink)] mt-0.5">
              Orders placed in Stripe test mode (origin = <code className="bg-[var(--apple-track)] px-1 rounded">qa:test</code>).
              These are excluded from all reports, buyer rosters, fan libraries, and fulfillment queues.
              Hard-delete them here to keep the database clean.
            </p>
          </div>
          {orders.length > 0 && (
            <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 text-sm font-medium px-3.5 py-2 rounded-full text-[var(--apple-critical)] hover:bg-[var(--apple-critical)]/10 transition-colors"
                  data-testid="button-delete-all-qa-orders"
                >
                  Remove all ({orders.length})
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl overflow-hidden border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Remove all QA test orders?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently hard-delete{" "}
                    <strong>{orders.length} QA test order{orders.length === 1 ? "" : "s"}</strong>{" "}
                    and all their child records (items, copies, certs). This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      bulkDeleteMutation.mutate();
                    }}
                    className="bg-[var(--apple-critical)]/10 text-[var(--apple-critical)] hover:bg-[var(--apple-critical)]/15"
                    disabled={bulkDeleteMutation.isPending}
                    data-testid="button-confirm-delete-all-qa-orders"
                  >
                    {bulkDeleteMutation.isPending ? "Removing…" : "Remove all permanently"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {isLoading && (
          <div className="py-10 text-center text-[var(--apple-faint)] text-sm">Loading…</div>
        )}

        {error && (
          <div className="rounded-2xl bg-[var(--apple-critical-wash)] border border-[var(--apple-critical)]/30 px-4 py-3 text-[var(--apple-critical)] text-sm">
            Failed to load QA orders: {(error as Error).message}
          </div>
        )}

        {!isLoading && !error && orders.length === 0 && (
          <AdminEmptyState>No QA test orders found.</AdminEmptyState>
        )}

        {orders.length > 0 && (
          <div className="bg-white border border-[var(--apple-hairline)] rounded-2xl overflow-hidden">
            <table className="w-full text-sm" data-testid="table-qa-orders">
              <thead>
                <tr className="border-b border-[var(--apple-hairline)] bg-[var(--apple-track)] text-left text-[11px] font-semibold text-[var(--apple-subink)] uppercase tracking-wider">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Album</th>
                  <th className="px-4 py-3">Buyer</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-[var(--apple-hairline)] last:border-0 hover:bg-[var(--apple-track)] transition-colors"
                    data-testid={`row-qa-order-${o.id}`}
                  >
                    <td className="px-4 py-3 text-[var(--apple-ink)] whitespace-nowrap">
                      {new Date(o.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-[var(--apple-ink)] max-w-[180px] truncate">
                      {o.album_title ?? o.album_id}
                    </td>
                    <td className="px-4 py-3 text-[var(--apple-subink)] max-w-[180px] truncate">
                      <div>{o.buyer_email}</div>
                      {o.buyer_name && (
                        <div className="text-xs text-[var(--apple-faint)]">{o.buyer_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--apple-ink)] whitespace-nowrap">
                      {formatUsdCents(o.total_cents)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--apple-warning)]/10 text-[var(--apple-warning)]">
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AlertDialog
                        open={pendingDeleteId === o.id}
                        onOpenChange={(open) => !open && setPendingDeleteId(null)}
                      >
                        <AlertDialogTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(o.id)}
                            className="text-xs font-medium px-3 py-1.5 rounded-full text-[var(--apple-critical)] hover:bg-[var(--apple-critical)]/10 transition-colors"
                            data-testid={`button-delete-qa-order-${o.id}`}
                          >
                            Remove
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-2xl overflow-hidden border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Remove QA test order?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently hard-delete the test order for{" "}
                              <strong>{o.buyer_email}</strong>
                              {o.album_title ? ` (${o.album_title})` : ""} and all its
                              child records (items, copies, certs). This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(o.id)}
                              className="bg-[var(--apple-critical)]/10 text-[var(--apple-critical)] hover:bg-[var(--apple-critical)]/15"
                              disabled={deleteMutation.isPending}
                              data-testid={`button-confirm-delete-qa-order-${o.id}`}
                            >
                              {deleteMutation.isPending ? "Removing…" : "Remove permanently"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminFrame>
  );
}

export function AdminQaOrders() {
  return (
    <AdminErrorBoundary title="QA orders page failed to render">
      <AdminQaOrdersInner />
    </AdminErrorBoundary>
  );
}
