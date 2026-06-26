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

  return (
    <AdminFrame title="QA Test Orders">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">QA Test Orders</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Orders placed in Stripe test mode (origin = <code className="bg-slate-100 px-1 rounded">qa:test</code>).
              These are excluded from all reports, buyer rosters, fan libraries, and fulfillment queues.
              Hard-delete them here to keep the database clean.
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="py-10 text-center text-slate-400 text-sm">Loading…</div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
            Failed to load QA orders: {(error as Error).message}
          </div>
        )}

        {!isLoading && !error && orders.length === 0 && (
          <div className="py-16 text-center text-slate-400 text-sm">
            No QA test orders found.
          </div>
        )}

        {orders.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm" data-testid="table-qa-orders">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
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
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                    data-testid={`row-qa-order-${o.id}`}
                  >
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {new Date(o.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-[180px] truncate">
                      {o.album_title ?? o.album_id}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate">
                      <div>{o.buyer_email}</div>
                      {o.buyer_name && (
                        <div className="text-xs text-slate-400">{o.buyer_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {formatUsdCents(o.total_cents)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
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
                            className="text-xs font-medium px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                            data-testid={`button-delete-qa-order-${o.id}`}
                          >
                            Remove
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove QA test order?</AlertDialogTitle>
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
                              className="bg-red-600 hover:bg-red-700 text-white"
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
