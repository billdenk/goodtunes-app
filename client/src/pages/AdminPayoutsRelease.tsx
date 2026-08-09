import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, Clock, Mail, ShieldAlert, X } from "lucide-react";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { StatusDot, type StatusDotTone } from "@/components/admin/StatusDot";
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
            <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-[var(--apple-ink)]" data-testid="text-page-title">
              Payouts to release.
            </h1>
            <p className="text-sm text-[var(--apple-subink)] mt-1 max-w-xl">
              Every Stripe Connect transfer is held here until you release it. Other admins see this page read-only.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right pr-3 border-r border-[var(--apple-hairline)]">
              <div className="text-[28px] font-semibold tabular-nums tracking-tight text-[var(--apple-ink)]" data-testid="text-held-total">
                {fmtUsd(data?.heldTotalCents ?? 0)}
              </div>
              <div className="text-xs text-[var(--apple-subink)]">{data?.heldCount ?? 0} held</div>
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
          <div className="flex items-start gap-3 rounded-2xl border border-[var(--apple-warning)]/30 bg-[var(--apple-warning-wash)] px-4 py-3 text-sm text-[var(--apple-warning)]">
            <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              Read-only view. Only Bill can release, reject, or annotate earmarks. Set <code>BILL_USER_ID</code>{" "}
              or sign in as <code>bill@gogoods.com</code> to act.
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 border-b border-[var(--apple-hairline)]">
          {(["held", "failed", "released", "rejected", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              data-testid={`tab-${s}`}
              className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                status === s
                  ? "border-[var(--apple-ink)] text-[var(--apple-ink)] font-medium"
                  : "border-transparent text-[var(--apple-subink)]"
              }`}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {isLoading && <div className="text-sm text-[var(--apple-subink)]">Loading…</div>}
        {!isLoading && (data?.earmarks ?? []).length === 0 && (
          <AdminEmptyState testId="text-empty">
            Nothing {status === "all" ? "in the queue" : `with status “${status}”`}.
          </AdminEmptyState>
        )}

        {grouped.map(([kind, rows]) => (
          <section key={kind} className="space-y-2">
            <h2 className="text-[11px] font-semibold text-[var(--apple-subink)] uppercase tracking-wider">
              {SOURCE_LABEL[kind as EarmarkRow["sourceKind"]] ?? kind} · {rows.length}
            </h2>
            <div className="rounded-2xl border border-[var(--apple-hairline)] divide-y divide-[var(--apple-hairline)] bg-white">
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
        <AlertDialogContent className="rounded-2xl overflow-hidden border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Reject this payout earmark?</AlertDialogTitle>
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
              className="bg-[var(--apple-critical)]/10 text-[var(--apple-critical)] hover:bg-[var(--apple-critical)]/15"
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
          <span className="text-lg font-semibold tabular-nums text-[var(--apple-ink)]" data-testid={`text-amount-${row.id}`}>
            {fmtUsd(row.amountCents)}
          </span>
          <span className="text-sm text-[var(--apple-subink)]">
            to <strong>{row.ownerName ?? `${row.ownerKind}:${row.ownerId.slice(0, 8)}`}</strong>
            <span className="text-[var(--apple-faint)]"> ({row.ownerKind})</span>
          </span>
          <StatusChip status={row.status} />
        </div>
        <div className="text-xs text-[var(--apple-subink)]">
          {row.albumTitle && <span>album: <strong>{row.albumTitle}</strong> · </span>}
          source ref: <code className="text-xs">{row.sourceRef.slice(0, 60)}{row.sourceRef.length > 60 ? "…" : ""}</code> · held {fmtDate(row.heldAt)}
        </div>
        {row.transferError && (
          <div className="text-xs text-[var(--apple-critical)]">Last attempt: {row.transferError}</div>
        )}
        {row.rejectionReason && (
          <div className="text-xs text-[var(--apple-subink)]">Rejected: {row.rejectionReason}</div>
        )}
        {row.stripeTransferId && (
          <div className="text-xs text-[var(--apple-subink)]">
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
              className="inline-flex items-center gap-1 text-xs text-[var(--brand-blue)] hover:opacity-80 disabled:text-[var(--apple-faint)] disabled:cursor-not-allowed"
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
  const map: Record<EarmarkRow["status"], StatusDotTone> = {
    held: "warning",
    released: "ready",
    rejected: "neutral",
    failed: "critical",
  };
  return <StatusDot tone={map[status]}>{status}</StatusDot>;
}
