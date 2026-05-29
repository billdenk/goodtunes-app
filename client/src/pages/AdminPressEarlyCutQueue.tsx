import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { DashboardPanel } from "@/components/partner/dashboard-controls";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Zap, Loader2 } from "lucide-react";

// Task #533 — Early Cut Review queue (Gate #3). Pool-funded masters cuts
// land here once the per-album pool covers the press's minimum-run floor
// AND both prior consents (press auto-trigger + artist opt-in) are in.
// Approving fires the cut and releases the floor from the pool to the
// press; declining is a soft "not now" with a reason. GoodTunes fronts
// no capital — the money is already collected before a row appears here.

interface QueueRow {
  id: string;
  albumId: string;
  pressId: string;
  status: string;
  pressFloorTotalCents: number;
  poolAvailableCents: number;
  unitsSold: number;
  tierName: string;
  format: string;
  createdAt: string;
  albumTitle: string;
  coverUrl: string | null;
  pressName: string | null;
}

const fmt = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function AdminPressEarlyCutQueue() {
  const { toast } = useToast();
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const list = useQuery<QueueRow[]>({
    queryKey: ["/api/admin/early-cut/queue"],
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("POST", `/api/admin/early-cut/${id}/approve`);
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.message ?? "Couldn't approve");
      }
      return r.json() as Promise<{ releasedCents: number }>;
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/early-cut/queue"] });
      toast({ title: "Early cut approved", description: `${fmt(d.releasedCents)} released to the press; the artist is notified.` });
    },
    onError: (e: Error) => toast({ title: "Couldn't approve", description: e.message, variant: "destructive" }),
  });

  const decline = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const r = await apiRequest("POST", `/api/admin/early-cut/${id}/decline`, { reason });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.message ?? "Couldn't decline");
      }
    },
    onSuccess: () => {
      setDecliningId(null);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/early-cut/queue"] });
      toast({ title: "Declined", description: "Left in the pool — it can re-enter the queue if it stays eligible." });
    },
    onError: (e: Error) => toast({ title: "Couldn't decline", description: e.message, variant: "destructive" }),
  });

  const rows = list.data ?? [];

  return (
    <AdminFrame active="early-cut">
      <div className="mb-5">
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <Zap className="w-6 h-6 text-[color:var(--brand-mint)]" />
          Early Cut Review
        </h1>
        <p className="text-white/55 text-sm mt-1 max-w-2xl">
          Pool-funded masters cuts ready to start early. Each album below has
          collected enough in per-sale earmarks to cover the press's
          minimum-run floor, and both the press and the artist have already
          opted in. Approving releases the floor to the press and starts the
          cut — GoodTunes fronts no capital.
        </p>
      </div>

      {list.isLoading ? (
        <div className="flex items-center gap-2 text-white/55 text-sm" data-testid="status-loading">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <DashboardPanel padding="md">
          <div className="text-white/55 text-sm text-center py-8" data-testid="text-empty">
            Nothing waiting. Albums appear here automatically once their pool
            covers the floor and both consents are in place.
          </div>
        </DashboardPanel>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <DashboardPanel key={r.id} padding="md" data-testid={`row-early-cut-${r.id}`}>
              <div className="flex gap-3">
                <div className="w-12 h-12 rounded bg-white/5 ring-1 ring-white/10 overflow-hidden flex-shrink-0">
                  {r.coverUrl && <img src={r.coverUrl} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate" data-testid={`text-title-${r.id}`}>{r.albumTitle}</div>
                  <div className="text-white/55 text-xs truncate">
                    {r.pressName ?? "Press"} · {r.format} / {r.tierName}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-white/45">Floor</div>
                      <div className="font-semibold" data-testid={`text-floor-${r.id}`}>{fmt(r.pressFloorTotalCents)}</div>
                    </div>
                    <div>
                      <div className="text-white/45">Pool available</div>
                      <div className="font-semibold text-[color:var(--brand-mint)]" data-testid={`text-pool-${r.id}`}>{fmt(r.poolAvailableCents)}</div>
                    </div>
                    <div>
                      <div className="text-white/45">Units sold</div>
                      <div className="font-semibold" data-testid={`text-units-${r.id}`}>{r.unitsSold}</div>
                    </div>
                  </div>
                </div>
              </div>

              {decliningId === r.id ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why are you declining? (optional — the album stays in the pool)"
                    rows={2}
                    className="w-full rounded-md bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-[color:var(--brand-blue)]"
                    data-testid={`input-decline-reason-${r.id}`}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => decline.mutate({ id: r.id, reason })}
                      disabled={decline.isPending}
                      className="bg-transparent text-white ring-1 ring-white/15 hover:bg-white/5 border-0"
                      data-testid={`button-confirm-decline-${r.id}`}
                    >Confirm decline</Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => { setDecliningId(null); setReason(""); }}
                      className="text-white/60 hover:text-white"
                      data-testid={`button-cancel-decline-${r.id}`}
                    >Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => approve.mutate(r.id)}
                    disabled={approve.isPending}
                    className="bg-[color:var(--brand-mint)] text-[color:var(--brand-bg)] hover:brightness-110 font-semibold"
                    data-testid={`button-approve-${r.id}`}
                  >Approve early cut</Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => { setDecliningId(r.id); setReason(""); }}
                    className="bg-transparent text-white ring-1 ring-white/15 hover:bg-white/5 border-0"
                    data-testid={`button-decline-${r.id}`}
                  >Decline</Button>
                </div>
              )}
            </DashboardPanel>
          ))}
        </div>
      )}
    </AdminFrame>
  );
}
