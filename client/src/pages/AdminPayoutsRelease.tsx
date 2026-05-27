import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, Clock, Mail, ShieldAlert, X } from "lucide-react";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Task #543 — Bill-only payout-release queue. Every Stripe Connect
// transfer the platform previously fired automatically now lands here
// as a HELD earmark. Bill walks the list; every other admin gets the
// same data read-only with the action buttons disabled.

interface EarmarkRow {
  id: string;
  sourceKind: "order_royalty" | "press_invoice" | "referral_credit" | "fulfillment_fee" | "vendor_payout";
  sourceRef: string;
  albumId: string | null;
  albumTitle: string | null;
  ownerKind: string;
  ownerId: string;
  ownerName: string | null;
  amountCents: number;
  currency: string;
  status: "held" | "released" | "rejected" | "failed";
  heldAt: string;
  releasedAt: string | null;
  releasedByUserId: string | null;
  rejectedAt: string | null;
  rejectedByUserId: string | null;
  rejectionReason: string | null;
  stripeTransferId: string | null;
  transferError: string | null;
  notes: string | null;
}

interface QueueResponse {
  earmarks: EarmarkRow[];
  heldCount: number;
  heldTotalCents: number;
  viewerIsBill: boolean;
}

const SOURCE_LABEL: Record<EarmarkRow["sourceKind"], string> = {
  order_royalty: "Order royalty",
  press_invoice: "Press invoice",
  referral_credit: "Referral credits",
  fulfillment_fee: "Fulfillment fee",
  vendor_payout: "Vendor payout",
};

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function AdminPayoutsRelease() {
  const { toast } = useToast();
  const [status, setStatus] = useState<"held" | "released" | "rejected" | "failed" | "all">("held");
  const [rejecting, setRejecting] = useState<EarmarkRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data, isLoading } = useQuery<QueueResponse>({
    queryKey: ["/api/admin/payout-earmarks", { status }],
  });

  const releaseMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/payout-earmarks/${id}/release`);
    },
    onSuccess: () => {
      toast({ title: "Released", description: "Stripe transfer fired." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payout-earmarks"] });
    },
    onError: (err: any) => {
      toast({ title: "Release failed", description: err?.message ?? "Try again.", variant: "destructive" });
    },
  });

  const rejectMut = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await apiRequest("POST", `/api/admin/payout-earmarks/${id}/reject`, { reason });
    },
    onSuccess: () => {
      toast({ title: "Rejected", description: "Earmark closed; source row reverted." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payout-earmarks"] });
      setRejecting(null);
      setRejectReason("");
    },
    onError: (err: any) => {
      toast({ title: "Reject failed", description: err?.message ?? "Try again.", variant: "destructive" });
    },
  });

  const holdMut = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      await apiRequest("POST", `/api/admin/payout-earmarks/${id}/hold-longer`, { notes });
    },
    onSuccess: () => {
      toast({ title: "Note saved", description: "Earmark remains held." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payout-earmarks"] });
    },
  });

  const digestMut = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/admin/payout-earmarks/send-digest`);
    },
    onSuccess: () => toast({ title: "Digest sent", description: "Mail dispatched to Bill." }),
    onError: (err: any) =>
      toast({ title: "Digest send failed", description: err?.message ?? "Check Resend status.", variant: "destructive" }),
  });

  const viewerIsBill = !!data?.viewerIsBill;
  const grouped = useMemo(() => {
    const byKind = new Map<string, EarmarkRow[]>();
    for (const r of data?.earmarks ?? []) {
      const arr = byKind.get(r.sourceKind) ?? [];
      arr.push(r);
      byKind.set(r.sourceKind, arr);
    }
    return Array.from(byKind.entries());
  }, [data?.earmarks]);

  return (
    <AdminFrame active="payouts-release" contentWidth="wide">
      <div className="max-w-[1200px] mx-auto px-4 py-6 space-y-6">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
              Payouts to release
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-xl">
              Every Stripe Connect transfer is held here until you release it. Other admins see this page read-only.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right pr-3 border-r border-slate-200">
              <div className="text-2xl font-semibold" data-testid="text-held-total">
                {fmtUsd(data?.heldTotalCents ?? 0)}
              </div>
              <div className="text-xs text-slate-500">{data?.heldCount ?? 0} held</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!viewerIsBill || digestMut.isPending}
              onClick={() => digestMut.mutate()}
              data-testid="button-send-digest"
            >
              <Mail className="w-4 h-4 mr-2" /> Send digest now
            </Button>
          </div>
        </header>

        {!viewerIsBill && (
          <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              Read-only view. Only Bill can release, reject, or annotate earmarks. Set <code>BILL_USER_ID</code>{" "}
              or sign in as <code>bill@gogoods.com</code> to act.
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 border-b border-slate-200">
          {(["held", "failed", "released", "rejected", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              data-testid={`tab-${s}`}
              className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                status === s
                  ? "border-slate-900 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {isLoading && <div className="text-sm text-slate-500">Loading…</div>}
        {!isLoading && (data?.earmarks ?? []).length === 0 && (
          <div className="text-center py-12 text-slate-500" data-testid="text-empty">
            Nothing {status === "all" ? "in the queue" : `with status “${status}”`}.
          </div>
        )}

        {grouped.map(([kind, rows]) => (
          <section key={kind} className="space-y-2">
            <h2 className="text-sm font-medium text-slate-600 uppercase tracking-wide">
              {SOURCE_LABEL[kind as EarmarkRow["sourceKind"]] ?? kind} · {rows.length}
            </h2>
            <div className="rounded-md border border-slate-200 divide-y divide-slate-100 bg-white">
              {rows.map((r) => (
                <EarmarkRowCard
                  key={r.id}
                  row={r}
                  viewerIsBill={viewerIsBill}
                  onRelease={() => releaseMut.mutate(r.id)}
                  onReject={() => {
                    setRejecting(r);
                    setRejectReason("");
                  }}
                  onSaveNotes={(notes) => holdMut.mutate({ id: r.id, notes })}
                  releasing={releaseMut.isPending && releaseMut.variables === r.id}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <AlertDialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this payout earmark?</AlertDialogTitle>
            <AlertDialogDescription>
              The {rejecting ? SOURCE_LABEL[rejecting.sourceKind] : ""} earmark for{" "}
              <strong>{rejecting ? fmtUsd(rejecting.amountCents) : "—"}</strong> to{" "}
              <strong>{rejecting?.ownerName ?? rejecting?.ownerId}</strong> will be marked rejected. For order
              royalties the order's payout status reverts to <code>skipped</code>; for referral credits the rows
              return to the pending pool. The reason is recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2">
            <Input
              autoFocus
              placeholder="Reason (required, 3–500 chars)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              data-testid="input-reject-reason"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-reject-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={rejectReason.trim().length < 3 || rejectMut.isPending}
              onClick={() => rejecting && rejectMut.mutate({ id: rejecting.id, reason: rejectReason.trim() })}
              data-testid="button-reject-confirm"
            >
              Reject earmark
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminFrame>
  );
}

interface EarmarkRowCardProps {
  row: EarmarkRow;
  viewerIsBill: boolean;
  onRelease: () => void;
  onReject: () => void;
  onSaveNotes: (notes: string) => void;
  releasing: boolean;
}
function EarmarkRowCard({ row, viewerIsBill, onRelease, onReject, onSaveNotes, releasing }: EarmarkRowCardProps) {
  const [notes, setNotes] = useState(row.notes ?? "");
  const acting = row.status === "held" || row.status === "failed";
  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3" data-testid={`row-earmark-${row.id}`}>
      <div className="space-y-1.5">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-lg font-semibold" data-testid={`text-amount-${row.id}`}>
            {fmtUsd(row.amountCents)}
          </span>
          <span className="text-sm text-slate-600">
            to <strong>{row.ownerName ?? `${row.ownerKind}:${row.ownerId.slice(0, 8)}`}</strong>
            <span className="text-slate-400"> ({row.ownerKind})</span>
          </span>
          <StatusChip status={row.status} />
        </div>
        <div className="text-xs text-slate-500">
          {row.albumTitle && <span>album: <strong>{row.albumTitle}</strong> · </span>}
          source ref: <code className="text-xs">{row.sourceRef.slice(0, 60)}{row.sourceRef.length > 60 ? "…" : ""}</code> · held {fmtDate(row.heldAt)}
        </div>
        {row.transferError && (
          <div className="text-xs text-red-600">Last attempt: {row.transferError}</div>
        )}
        {row.rejectionReason && (
          <div className="text-xs text-slate-600">Rejected: {row.rejectionReason}</div>
        )}
        {row.stripeTransferId && (
          <div className="text-xs text-slate-500">
            Transfer: <code>{row.stripeTransferId}</code> at {fmtDate(row.releasedAt)}
          </div>
        )}
        {acting && (
          <div className="flex items-center gap-2 pt-2">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Hold-longer note (optional)"
              className="h-8 text-xs max-w-md"
              disabled={!viewerIsBill}
              data-testid={`input-notes-${row.id}`}
            />
            {/* SaveLink pattern — per-row note save uses an inline
                link affordance rather than an explicit Save button
                (see docs/design-system.md → Save semantics). */}
            <button
              type="button"
              disabled={!viewerIsBill || notes === (row.notes ?? "")}
              onClick={() => onSaveNotes(notes)}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed"
              data-testid={`button-save-notes-${row.id}`}
            >
              <Clock className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        )}
      </div>
      {acting && (
        <div className="flex md:flex-col gap-2 md:w-44 justify-end">
          <Button
            size="sm"
            disabled={!viewerIsBill || releasing}
            onClick={onRelease}
            data-testid={`button-release-${row.id}`}
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            {releasing ? "Releasing…" : "Release"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!viewerIsBill}
            onClick={onReject}
            data-testid={`button-reject-${row.id}`}
          >
            <X className="w-4 h-4 mr-1.5" /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: EarmarkRow["status"] }) {
  const map: Record<EarmarkRow["status"], string> = {
    held: "bg-amber-100 text-amber-900",
    released: "bg-emerald-100 text-emerald-900",
    rejected: "bg-slate-200 text-slate-700",
    failed: "bg-red-100 text-red-900",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${map[status]}`}>
      {status}
    </span>
  );
}
