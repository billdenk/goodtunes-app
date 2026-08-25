// Task #3379 — operator-only inbound ERP pricing push panel for a press
// (MRP's Matilda ERP first). Sits beside the Coda card: mint/revoke the
// per-press push API key (shown ONCE), see when pricing was last
// received, and review pending pushes with the same preview→commit diff
// the Coda sync uses. Pushed pricing can never write ladders directly.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type CredentialStatus = {
  configured: boolean;
  keyId?: string;
  createdAt?: string | null;
  lastUsedAt?: string | null;
  lastReceivedAt: string | null;
  pendingCount: number;
};

type PendingPush = {
  id: string;
  receivedAt: string;
  rowsReceived: number;
  rowsAccepted: number;
  errorCount: number;
};

type ProposalWrite = {
  format: string;
  tierName: string;
  qty: number;
  unitCents: number;
  change: "new" | "updated" | "unchanged" | "locked" | "tier_missing";
  oldUnitCents: number | null;
  matchedTierName: string | null;
};
type PushProposal = {
  receivedAt: string;
  rowsReceived: number;
  writes: ProposalWrite[];
  warnings: { index: number | null; code: string; message: string }[];
  tiersMissing: string[];
};

const FORMAT_LABEL: Record<string, string> = {
  "12_lp": '12" LP',
  "12_double": "2LP",
  "7_inch": '7"',
  cassette: "Cassette",
  cd: "CD",
};
const CHANGE_STYLE: Record<ProposalWrite["change"], string> = {
  new: "text-emerald-600",
  updated: "text-[var(--apple-blue)]",
  unchanged: "text-[var(--apple-text-tertiary)]",
  locked: "text-amber-600",
  tier_missing: "text-red-500",
};
const CHANGE_LABEL: Record<ProposalWrite["change"], string> = {
  new: "New",
  updated: "Update",
  unchanged: "Same",
  locked: "Locked (kept)",
  tier_missing: "No tier",
};

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString() : "never";

const btnCls =
  "px-3 py-1.5 rounded-full text-xs font-semibold text-[var(--apple-blue)] hover:bg-[var(--apple-blue)]/10 disabled:opacity-50 disabled:cursor-not-allowed";

export function ErpPushCard({ pressId }: { pressId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const base = `/api/admin/manufacturers/${pressId}`;
  const credKey = [base, "push-credential"];
  const pushesKey = [base, "pricing-pushes"];

  const { data: cred, isLoading } = useQuery<CredentialStatus>({
    queryKey: credKey,
    queryFn: async () => (await apiRequest("GET", `${base}/push-credential`)).json(),
  });
  const { data: pushes } = useQuery<PendingPush[]>({
    queryKey: pushesKey,
    queryFn: async () => (await apiRequest("GET", `${base}/pricing-pushes`)).json(),
  });

  const [mintedKey, setMintedKey] = useState<string | null>(null);
  const [proposal, setProposal] = useState<PushProposal | null>(null);
  const [previewPushId, setPreviewPushId] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: credKey });
    qc.invalidateQueries({ queryKey: pushesKey });
    qc.invalidateQueries({ queryKey: [base, "pricing-syncs"] });
  };

  const mint = useMutation({
    mutationFn: async () => (await apiRequest("POST", `${base}/push-credential`)).json(),
    onSuccess: (r: { key: string }) => {
      setMintedKey(r.key);
      invalidate();
    },
    onError: (e: any) => toast({ title: "Couldn't mint a key", description: e.message, variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", `${base}/push-credential`)).json(),
    onSuccess: () => {
      setMintedKey(null);
      invalidate();
      toast({ title: "Push key revoked", description: "Pushes with the old key now fail with 401." });
    },
    onError: (e: any) => toast({ title: "Couldn't revoke", description: e.message, variant: "destructive" }),
  });

  const preview = useMutation({
    mutationFn: async (pushId: string) =>
      (await apiRequest("POST", `${base}/pricing-pushes/${pushId}/preview`)).json(),
    onSuccess: (r: { proposal: PushProposal }, pushId) => {
      setProposal(r.proposal);
      setPreviewPushId(pushId);
    },
    onError: (e: any) => toast({ title: "Preview failed", description: e.message, variant: "destructive" }),
  });

  const commit = useMutation({
    mutationFn: async (pushId: string) =>
      (await apiRequest("POST", `${base}/pricing-pushes/${pushId}/commit`)).json(),
    onSuccess: (r: { rungsWritten: number; rungsSkipped: number }) => {
      setProposal(null);
      setPreviewPushId(null);
      invalidate();
      toast({
        title: "Pushed pricing committed",
        description: `${r.rungsWritten} rung(s) written, ${r.rungsSkipped} skipped (locked or no matching tier).`,
      });
    },
    onError: (e: any) => toast({ title: "Commit failed", description: e.message, variant: "destructive" }),
  });

  const discard = useMutation({
    mutationFn: async (pushId: string) =>
      (await apiRequest("POST", `${base}/pricing-pushes/${pushId}/discard`)).json(),
    onSuccess: () => {
      setProposal(null);
      setPreviewPushId(null);
      invalidate();
      toast({ title: "Push discarded", description: "Nothing was written to the ladders." });
    },
    onError: (e: any) => toast({ title: "Discard failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !cred) return null;

  return (
    <div
      className="max-w-3xl rounded-2xl border border-[var(--apple-separator)] bg-[var(--apple-card)] p-4 space-y-3"
      data-testid="card-erp-push"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[var(--apple-text)]">ERP pricing push (Matilda)</div>
          <p className="text-xs text-[var(--apple-text-secondary)] mt-0.5">
            The press's ERP pushes pricing to us with a per-press API key. Pushes land here for
            review — nothing touches the ladders until you preview and commit. Operator-locked
            rungs are never overwritten. The integration spec for Matilda's developer lives in
            the repo at docs/matilda-integration-kit.md.
          </p>
        </div>
        {cred.configured && (
          <button
            type="button"
            className="text-xs text-red-500 hover:underline shrink-0"
            data-testid="button-erp-revoke-key"
            onClick={() => {
              if (window.confirm("Revoke the active push key? Matilda's pushes will fail until you mint and share a new one.")) revoke.mutate();
            }}
          >
            Revoke key
          </button>
        )}
      </div>

      {/* Key management */}
      <div className="text-xs text-[var(--apple-text-secondary)] space-y-1.5">
        {cred.configured ? (
          <div data-testid="text-erp-key-status">
            Active key <span className="font-mono text-[var(--apple-text)]">{cred.keyId}</span>
            {" · "}minted {when(cred.createdAt)}
            {" · "}last used {when(cred.lastUsedAt)}
          </div>
        ) : (
          <div data-testid="text-erp-key-status">No push key yet — mint one and share it with Matilda.</div>
        )}
        <div data-testid="text-erp-last-received">
          Pricing last received via push:{" "}
          <span className={cred.lastReceivedAt ? "text-[var(--apple-text)]" : "text-amber-600"}>
            {when(cred.lastReceivedAt)}
          </span>
        </div>
        <button
          type="button"
          className={btnCls}
          disabled={mint.isPending}
          onClick={() => {
            if (
              !cred.configured ||
              window.confirm("Minting a new key revokes the current one. Continue?")
            )
              mint.mutate();
          }}
          data-testid="button-erp-mint-key"
        >
          {mint.isPending ? "Minting…" : cred.configured ? "Mint replacement key" : "Mint push key"}
        </button>
        {mintedKey && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-500/10 p-2.5 space-y-1.5">
            <div className="font-medium text-amber-700 dark:text-amber-400">
              Copy this key now — it won't be shown again.
            </div>
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs break-all text-[var(--apple-text)]" data-testid="text-erp-minted-key">
                {mintedKey}
              </code>
              <button
                type="button"
                className={btnCls}
                onClick={() => {
                  navigator.clipboard?.writeText(mintedKey);
                  toast({ title: "Key copied" });
                }}
              >
                Copy
              </button>
              <button
                type="button"
                className="text-xs text-[var(--apple-text-tertiary)] hover:underline"
                onClick={() => setMintedKey(null)}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pending pushes */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-[var(--apple-text)]">
          Pending pushes {pushes && pushes.length > 0 ? `(${pushes.length})` : ""}
        </div>
        {!pushes || pushes.length === 0 ? (
          <div className="text-xs text-[var(--apple-text-tertiary)]">
            None waiting. New pushes appear here for review.
          </div>
        ) : (
          <ul className="space-y-1">
            {pushes.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--apple-separator)] px-2.5 py-1.5 text-xs"
                data-testid={`row-erp-push-${p.id}`}
              >
                <div className="text-[var(--apple-text-secondary)]">
                  {when(p.receivedAt)} · {p.rowsAccepted} row(s)
                  {p.errorCount > 0 ? ` · ${p.errorCount} error(s)` : ""}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    className={btnCls}
                    disabled={preview.isPending}
                    onClick={() => preview.mutate(p.id)}
                    data-testid={`button-erp-preview-${p.id}`}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-500 hover:underline"
                    disabled={discard.isPending}
                    onClick={() => {
                      if (window.confirm("Discard this push? It stays in the history as discarded.")) discard.mutate(p.id);
                    }}
                    data-testid={`button-erp-discard-${p.id}`}
                  >
                    Discard
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Preview → commit dialog (same diff table as the Coda card) */}
      <Dialog open={!!proposal} onOpenChange={(o) => { if (!o) { setProposal(null); setPreviewPushId(null); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pushed pricing preview</DialogTitle>
            <DialogDescription>
              {proposal
                ? `Received ${when(proposal.receivedAt)} · ${proposal.rowsReceived} row(s). Nothing is written until you commit.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {proposal && (
            <div className="space-y-3 text-xs">
              {proposal.tiersMissing.length > 0 && (
                <div className="text-red-500">
                  No matching catalog tier for: {proposal.tiersMissing.join(", ")} — these rows are skipped.
                </div>
              )}
              <table className="w-full text-left">
                <thead className="text-xs uppercase text-[var(--apple-text-tertiary)]">
                  <tr>
                    <th className="py-1 pr-2">Format</th>
                    <th className="py-1 pr-2">Tier</th>
                    <th className="py-1 pr-2 text-right">Qty</th>
                    <th className="py-1 pr-2 text-right">Unit price</th>
                    <th className="py-1">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {proposal.writes.map((w, i) => (
                    <tr key={i} className="border-t border-[var(--apple-separator)]">
                      <td className="py-1 pr-2">{FORMAT_LABEL[w.format] ?? w.format}</td>
                      <td className="py-1 pr-2">{w.matchedTierName ?? w.tierName}</td>
                      <td className="py-1 pr-2 text-right">{w.qty.toLocaleString()}</td>
                      <td className="py-1 pr-2 text-right">
                        {w.change === "updated" && w.oldUnitCents != null && (
                          <span className="line-through text-[var(--apple-text-tertiary)] mr-1.5">{usd(w.oldUnitCents)}</span>
                        )}
                        {usd(w.unitCents)}
                      </td>
                      <td className={`py-1 font-medium ${CHANGE_STYLE[w.change]}`}>{CHANGE_LABEL[w.change]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {proposal.warnings.length > 0 && (
                <div>
                  <div className="font-medium text-[var(--apple-text)]">Warnings ({proposal.warnings.length})</div>
                  <ul className="mt-1 space-y-0.5 text-[var(--apple-text-secondary)]">
                    {proposal.warnings.slice(0, 20).map((w2, i) => (
                      <li key={i}>{w2.index != null ? `Row ${w2.index}: ` : ""}{w2.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="text-xs text-[var(--apple-text-tertiary)] hover:underline"
                  onClick={() => { setProposal(null); setPreviewPushId(null); }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={btnCls}
                  disabled={
                    commit.isPending ||
                    !previewPushId ||
                    proposal.writes.every((w) => w.change === "unchanged" || w.change === "tier_missing" || w.change === "locked")
                  }
                  onClick={() => previewPushId && commit.mutate(previewPushId)}
                  data-testid="button-erp-commit"
                >
                  {commit.isPending ? "Committing…" : "Commit to ladders"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
