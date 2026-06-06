import { useState } from "react";
import { formatUsdCents } from "@shared/money";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, XCircle, Clock, Factory, ChevronDown } from "lucide-react";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useExclusiveDisclosure } from "@/hooks/useExclusiveDisclosure";
import type { PressingOrderRequest } from "@shared/schema";

// Task #225 — GoodTunes-admin review inbox for artist "Go to Press!"
// submissions. Mirrors AdminReview's tabbed-status pattern. Approve
// stamps the row "approved — awaiting dispatch" (press handoff is
// out-of-band today); reject requires a short note (≥8 chars) that
// shows back to the artist on their Sell tab.

type Status = "pending" | "approved" | "rejected" | "cancelled" | "all";

type Row = PressingOrderRequest & {
  albumTitle: string | null;
  albumArtist: string | null;
  albumArtwork: string | null;
};

const dollars = (c: number) => formatUsdCents(c);

export function AdminPressingOrders() {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Exclusive-disclosure controller — at most one order row open at a
  // time so the inbox doesn't turn into a wall of expanded blocks.
  // See docs/design-system.md ("Expandable row lists").
  const disclosure = useExclusiveDisclosure<string>();

  const { data: rows, isLoading } = useQuery<Row[]>({
    queryKey: ["/api/admin/pressing-orders", { status }],
    queryFn: async () => {
      const r = await fetch(`/api/admin/pressing-orders?status=${status}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const decide = useMutation({
    mutationFn: async (input: { id: string; decision: "approve" | "reject"; note?: string }) => {
      const r = await apiRequest(
        "POST",
        `/api/admin/pressing-orders/${input.id}/${input.decision}`,
        input.decision === "reject" ? { note: input.note ?? "" } : {},
      );
      return r.json();
    },
    onSuccess: (_row, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pressing-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums"] });
      toast({
        title: vars.decision === "approve" ? "Order approved." : "Order rejected.",
      });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't record decision",
        description: e?.message || "Try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <AdminFrame active="pressing-orders">
      <div className="px-6 py-6 max-w-5xl mx-auto">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">
              Press Orders
            </h1>
            <p className="text-[13px] text-slate-500 mt-1">
              Artist-submitted "Go to Press!" requests awaiting GoodTunes review.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {(["pending", "approved", "rejected", "all"] as Status[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={[
                  "px-3 py-1.5 text-[12.5px] font-semibold rounded-full transition-colors",
                  status === s
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50",
                ].join(" ")}
                data-testid={`tab-status-${s}`}
              >
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <Card className="p-10 grid place-items-center" data-testid="state-pressing-orders-loading">
            <Spinner className="w-6 h-6 text-[var(--brand-blue)] animate-spin" />
          </Card>
        ) : !rows || rows.length === 0 ? (
          <Card className="p-10 text-center" data-testid="state-pressing-orders-empty">
            <Factory className="w-10 h-10 mx-auto text-slate-300" />
            <div className="mt-3 text-[14px] font-medium text-slate-700">
              Nothing {status === "all" ? "to show" : status} right now.
            </div>
            <div className="text-[12.5px] text-slate-500 mt-1">
              Artist "Go to Press!" submissions land here for review.
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const snap = row.packageSnapshot;
              const noteText = notes[row.id] ?? "";
              const canReject = noteText.trim().length >= 8;
              const expanded = disclosure.isOpen(row.id);
              return (
                <Card key={row.id} className="p-5" data-testid={`card-pressing-order-${row.id}`}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    onClick={() => disclosure.setOpen(row.id, !expanded)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        disclosure.setOpen(row.id, !expanded);
                      }
                    }}
                    className="flex items-start gap-4 cursor-pointer select-none"
                    data-testid={`button-toggle-${row.id}`}
                  >
                    {row.albumArtwork && (
                      <img
                        src={row.albumArtwork}
                        alt=""
                        className="w-16 h-16 rounded-md object-cover border border-slate-200 flex-shrink-0"
                        data-testid={`img-album-${row.id}`}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[11.5px] text-slate-500 uppercase tracking-wide">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(row.submittedAt).toLocaleString()}</span>
                        <span>·</span>
                        <span>{row.status}</span>
                        {row.preflightStatus && (
                          <>
                            <span>·</span>
                            <span
                              className={
                                row.preflightStatus === "fail"
                                  ? "text-[var(--brand-heart)]"
                                  : row.preflightStatus === "warn"
                                    ? "text-amber-600"
                                    : "text-emerald-600"
                              }
                              data-testid={`text-preflight-${row.id}`}
                            >
                              preflight: {row.preflightStatus}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="mt-1 text-[14px] font-semibold text-slate-900">
                        <Link href={`/admin/albums/${row.albumId}`} className="text-inherit hover:text-[var(--brand-blue)] hover:underline underline-offset-2"
                          data-testid={`link-album-${row.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.albumTitle ?? row.albumId.slice(0, 8)}
                        </Link>
                        {row.albumArtist && (
                          <span className="text-slate-500 font-normal"> · {row.albumArtist}</span>
                        )}
                      </div>
                      <div className="mt-1 text-[12.5px] text-slate-600">
                        {snap.format}
                        {snap.vinylColor && <> · {snap.vinylColor}</>}
                        {" · "}
                        {row.quantity} units
                        {" · "}
                        <span className="font-semibold text-slate-900">{dollars(row.totalCents)}</span>
                      </div>
                    </div>
                    <ChevronDown
                      className={[
                        "w-4 h-4 text-slate-400 mt-1 transition-transform flex-shrink-0",
                        expanded ? "rotate-180" : "",
                      ].join(" ")}
                    />
                  </div>

                  {expanded && (
                    <>
                      <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5 text-[12.5px]">
                        <Field label="Format" value={snap.format} />
                        <Field label="Press" value={snap.pressName ?? "—"} />
                        <Field
                          label="Color"
                          value={snap.vinylColor ?? "—"}
                          sub={snap.vinylColorTier ?? undefined}
                        />
                        <Field label="Jacket" value={snap.jacketUpgrade ?? "standard"} />
                        <Field label="Quantity" value={String(row.quantity)} />
                        <Field label="Unit" value={dollars(row.unitCents)} />
                        <Field label="Total" value={dollars(row.totalCents)} strong />
                      </div>

                      {row.status === "pending" ? (
                        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                          <Textarea
                            placeholder="Rejection note (required to reject — ≥8 chars; visible to artist)"
                            value={noteText}
                            onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                            rows={2}
                            className="text-[12.5px]"
                            data-testid={`textarea-note-${row.id}`}
                          />
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              onClick={() =>
                                decide.mutate({ id: row.id, decision: "reject", note: noteText })
                              }
                              disabled={decide.isPending || !canReject}
                              className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              data-testid={`button-reject-${row.id}`}
                            >
                              <XCircle className="w-4 h-4 mr-1.5" />
                              Reject
                            </Button>
                            <Button
                              type="button"
                              onClick={() => decide.mutate({ id: row.id, decision: "approve" })}
                              disabled={decide.isPending}
                              className="bg-emerald-600 text-white hover:bg-emerald-700"
                              data-testid={`button-approve-${row.id}`}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1.5" />
                              Approve
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 text-[12px] text-slate-500">
                          {row.decidedAt && <>Decided {new Date(row.decidedAt).toLocaleString()}</>}
                          {row.rejectionNote && <> · “{row.rejectionNote}”</>}
                        </div>
                      )}
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminFrame>
  );
}

function Field({
  label,
  value,
  sub,
  strong,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] uppercase tracking-wider text-slate-400 font-semibold">
        {label}
      </div>
      <div
        className={[
          "truncate",
          strong ? "text-[13.5px] font-semibold text-slate-900" : "text-[12.5px] text-slate-700",
        ].join(" ")}
      >
        {value}
        {sub && <span className="text-slate-400 ml-1">({sub})</span>}
      </div>
    </div>
  );
}

export default AdminPressingOrders;
