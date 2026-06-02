import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X, HeartHandshake } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient as globalQueryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type NonProfit = { id: string; name: string; logoUrl: string | null };

type Beneficiary = {
  id: string | null;
  organizationId: string;
  perUnitCents: number;
  name: string;
  logoUrl: string | null;
};

type SplitResponse = {
  beneficiaries: Beneficiary[];
  totalCents: number;
  remainingCents: number;
  capCents: number;
  maxBeneficiaries: number;
  isDefault: boolean;
  locked: boolean;
};

type Row = {
  organizationId: string;
  perUnitCents: number;
  /** True when this is a persisted beneficiary under the post-sale lock —
   * it can't be removed and its share can't be reduced, only increased. */
  baselineCents: number | null;
};

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function AlbumNpoSplitPanel({ albumId }: { albumId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const split = useQuery<SplitResponse>({
    queryKey: ["/api/admin/albums", albumId, "npo-beneficiaries"],
  });
  const npos = useQuery<NonProfit[]>({ queryKey: ["/api/non-profits"] });

  const cap = split.data?.capCents ?? 100;
  const max = split.data?.maxBeneficiaries ?? 4;
  const locked = !!split.data?.locked;
  const isDefault = !!split.data?.isDefault;

  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);

  // Seed local editor state from the server whenever it loads/refetches.
  useEffect(() => {
    if (!split.data) return;
    setRows(
      split.data.beneficiaries.map((b) => ({
        organizationId: b.organizationId,
        perUnitCents: b.perUnitCents,
        baselineCents: locked && !isDefault && b.id != null ? b.perUnitCents : null,
      })),
    );
    setDirty(false);
  }, [split.data, locked, isDefault]);

  const npoById = useMemo(() => {
    const m = new Map<string, NonProfit>();
    (npos.data ?? []).forEach((n) => m.set(n.id, n));
    return m;
  }, [npos.data]);

  const total = rows.reduce((s, r) => s + (r.perUnitCents || 0), 0);
  const remaining = Math.max(0, cap - total);
  const overCap = total > cap;

  const usedOrgIds = new Set(rows.map((r) => r.organizationId).filter(Boolean));
  const available = (npos.data ?? []).filter((n) => !usedOrgIds.has(n.id));

  const canAdd = rows.length < max && !overCap && remaining > 0;
  const blankOrg = rows.some((r) => !r.organizationId);
  const canSave =
    dirty && !overCap && !blankOrg && rows.every((r) => r.perUnitCents >= 1);

  const update = (next: Row[]) => {
    setRows(next);
    setDirty(true);
  };

  const addRow = () => {
    const first = available[0];
    update([
      ...rows,
      { organizationId: first?.id ?? "", perUnitCents: Math.min(remaining || 1, cap), baselineCents: null },
    ]);
  };

  const removeRow = (idx: number) => {
    update(rows.filter((_, i) => i !== idx));
  };

  const setOrg = (idx: number, orgId: string) => {
    update(rows.map((r, i) => (i === idx ? { ...r, organizationId: orgId } : r)));
  };

  const setCents = (idx: number, raw: string) => {
    const n = Math.max(0, Math.min(cap, Math.round(Number(raw) || 0)));
    update(rows.map((r, i) => (i === idx ? { ...r, perUnitCents: n } : r)));
  };

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/admin/albums/${albumId}/npo-beneficiaries`, {
        beneficiaries: rows.map((r) => ({
          organizationId: r.organizationId,
          perUnitCents: r.perUnitCents,
        })),
      });
    },
    onSuccess: () => {
      (qc ?? globalQueryClient).invalidateQueries({
        queryKey: ["/api/admin/albums", albumId, "npo-beneficiaries"],
      });
      toast({ title: "Donation split saved" });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't save split",
        description: e?.message ?? "Please try again",
        variant: "destructive",
      });
    },
  });

  if (split.isLoading) {
    return (
      <Card className="p-4 text-sm text-muted-foreground" data-testid="panel-npo-split-loading">
        Loading donation split…
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4" data-testid="panel-npo-split">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <HeartHandshake className="h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold leading-tight">NPO donation split</h3>
            <p className="text-xs text-muted-foreground">
              Up to {max} non-profits share up to {fmt(cap)} per unit, funded from
              GoodTunes margin (album price is unchanged).
            </p>
          </div>
        </div>
      </div>

      {isDefault && (
        <p
          className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
          data-testid="text-npo-split-default"
        >
          Showing the default inherited from this artist's NPO referral. Save to
          set an explicit split for this album.
        </p>
      )}
      {locked && (
        <p
          className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
          data-testid="text-npo-split-locked"
        >
          This album has sold — existing beneficiaries are locked. You can add new
          ones or increase shares from the unallocated remainder, but can't reduce
          or remove a beneficiary.
        </p>
      )}

      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground" data-testid="text-npo-split-empty">
            No beneficiaries yet.
          </p>
        )}
        {rows.map((row, idx) => {
          const isLockedRow = row.baselineCents != null;
          const options = (npos.data ?? []).filter(
            (n) => n.id === row.organizationId || !usedOrgIds.has(n.id),
          );
          return (
            <div
              key={`${row.organizationId || "new"}-${idx}`}
              className="flex items-center gap-2"
              data-testid={`row-npo-beneficiary-${idx}`}
            >
              <Select
                value={row.organizationId || undefined}
                onValueChange={(v) => setOrg(idx, v)}
                disabled={isLockedRow}
              >
                <SelectTrigger className="h-9 flex-1" data-testid={`select-npo-org-${idx}`}>
                  <SelectValue placeholder="Choose a non-profit" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((n) => (
                    <SelectItem key={n.id} value={n.id} data-testid={`option-npo-${n.id}`}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative w-24">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  ¢
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={isLockedRow ? row.baselineCents ?? 1 : 1}
                  max={cap}
                  value={row.perUnitCents}
                  onChange={(e) => setCents(idx, e.target.value)}
                  className="h-9 pl-5 tabular-nums"
                  data-testid={`input-npo-cents-${idx}`}
                />
              </div>
              {!isLockedRow && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => removeRow(idx)}
                  data-testid={`button-npo-remove-${idx}`}
                  aria-label="Remove beneficiary"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          onClick={addRow}
          disabled={!canAdd || available.length === 0}
          data-testid="button-npo-add"
        >
          <Plus className="mr-1 h-4 w-4" /> Add NPO
        </Button>
        <div className="text-xs tabular-nums" data-testid="text-npo-split-totals">
          <span className={overCap ? "font-semibold text-destructive" : "text-muted-foreground"}>
            {fmt(total)} allocated
          </span>
          <span className="text-muted-foreground"> · {fmt(remaining)} unallocated</span>
        </div>
      </div>

      {overCap && (
        <p className="text-xs text-destructive" data-testid="text-npo-split-over">
          Total exceeds the {fmt(cap)} per-unit cap.
        </p>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          className="h-9"
          onClick={() => save.mutate()}
          disabled={!canSave || save.isPending}
          data-testid="button-npo-save"
        >
          {save.isPending ? "Saving…" : "Save split"}
        </Button>
      </div>
    </Card>
  );
}

export default AlbumNpoSplitPanel;
