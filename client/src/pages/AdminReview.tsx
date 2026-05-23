import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, XCircle, Clock, FileText, ChevronDown } from "lucide-react";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useExclusiveDisclosure } from "@/hooks/useExclusiveDisclosure";

// Task #79 — Super-admin queue of partner-submitted metadata edits.
// Each row shows the target (album or song), the scope, the diff, and
// approve/reject actions. Approving replays the patch server-side via
// storage.updateAlbum / storage.updateSong.

type Status = "pending" | "approved" | "rejected" | "all";

interface PendingChange {
  id: string;
  targetTable: "albums" | "songs";
  targetId: string;
  albumId: string | null;
  scopeKind: string;
  scopeId: string;
  patch: Record<string, unknown>;
  status: Status;
  submittedByUserId: string;
  submittedNote: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewerNote: string | null;
  createdAt: string;
}

export function AdminReview() {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>("pending");
  const queryKey = ["/api/admin/pending-changes", { status }] as const;

  const { data: rows, isLoading } = useQuery<PendingChange[]>({
    queryKey,
    queryFn: async () => {
      const r = await fetch(`/api/admin/pending-changes?status=${status}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const [notes, setNotes] = useState<Record<string, string>>({});

  // Per-row "edit the patch before approving" buffer. Keyed by row id;
  // the textarea is only mounted when the reviewer clicks Edit, so an
  // untouched row submits the original patch unchanged.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string | null>>({});
  // Exclusive-disclosure controller — at most one pending-change row
  // open at a time so the queue doesn't turn into a wall of JSON
  // patches + textareas. See docs/design-system.md ("Expandable row
  // lists").
  const disclosure = useExclusiveDisclosure<string>();

  const review = useMutation({
    mutationFn: async (input: {
      id: string;
      decision: "approved" | "rejected";
      reviewerNote: string;
      patchOverride?: Record<string, unknown> | null;
    }) => {
      const r = await apiRequest("POST", `/api/admin/pending-changes/${input.id}/review`, {
        decision: input.decision,
        reviewerNote: input.reviewerNote || null,
        patchOverride: input.patchOverride ?? null,
      });
      return r.json();
    },
    onSuccess: (_row, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-changes"] });
      toast({
        title: vars.decision === "approved" ? "Change applied." : "Change rejected.",
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
    <AdminFrame active="none">
      <div className="px-6 py-6 max-w-5xl">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">
              Pending changes
            </h1>
            <p className="text-[13px] text-slate-500 mt-1">
              Partner-submitted metadata edits awaiting GoodTunes review.
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
          <Card className="p-10 grid place-items-center" data-testid="state-review-loading">
            <Spinner className="w-6 h-6 text-[var(--brand-blue)] animate-spin" />
          </Card>
        ) : !rows || rows.length === 0 ? (
          <Card className="p-10 text-center" data-testid="state-review-empty">
            <FileText className="w-10 h-10 mx-auto text-slate-300" />
            <div className="mt-3 text-[14px] font-medium text-slate-700">
              Nothing {status === "all" ? "to show" : status} right now.
            </div>
            <div className="text-[12.5px] text-slate-500 mt-1">
              Partner edits with approval-required land here.
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const expanded = disclosure.isOpen(row.id);
              return (
              <Card key={row.id} className="p-5" data-testid={`card-pending-${row.id}`}>
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
                  className="flex items-start justify-between gap-4 cursor-pointer select-none"
                  data-testid={`button-toggle-${row.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[11.5px] text-slate-500 uppercase tracking-wide">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(row.createdAt).toLocaleString()}</span>
                      <span>·</span>
                      <span>{row.scopeKind}</span>
                      <span>·</span>
                      <span>{row.status}</span>
                    </div>
                    <div className="mt-1 text-[14px] font-semibold text-slate-900">
                      Edit to{" "}
                      {row.targetTable === "albums" ? (
                        <Link href={`/admin/albums/${row.targetId}`} className="text-[var(--brand-blue)] hover:underline underline-offset-2"
                          data-testid={`link-target-${row.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          album {row.targetId.slice(0, 8)}…
                        </Link>
                      ) : (
                        <span>
                          song {row.targetId.slice(0, 8)}…{" "}
                          {row.albumId && (
                            <Link href={`/admin/albums/${row.albumId}`} className="text-[var(--brand-blue)] hover:underline underline-offset-2 ml-1"
                              data-testid={`link-target-album-${row.id}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              (open album)
                            </Link>
                          )}
                        </span>
                      )}
                    </div>
                    {row.submittedNote && (
                      <div className="mt-1 text-[12.5px] text-slate-600 italic">
                        “{row.submittedNote}”
                      </div>
                    )}
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
                <pre
                  className="mt-3 text-[12px] bg-slate-50 border border-slate-200 rounded-md p-3 overflow-x-auto text-slate-700"
                  data-testid={`patch-${row.id}`}
                >
                  {JSON.stringify(row.patch, null, 2)}
                </pre>

                {row.status === "pending" ? (
                  <div className="mt-3 space-y-2">
                    {edits[row.id] !== undefined && (
                      <div className="space-y-1">
                        <Textarea
                          value={edits[row.id]}
                          onChange={(e) => {
                            const v = e.target.value;
                            setEdits((m) => ({ ...m, [row.id]: v }));
                            try {
                              const parsed = JSON.parse(v);
                              if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                                setEditErrors((m) => ({ ...m, [row.id]: "Patch must be a JSON object." }));
                              } else {
                                setEditErrors((m) => ({ ...m, [row.id]: null }));
                              }
                            } catch (err: any) {
                              setEditErrors((m) => ({ ...m, [row.id]: err?.message || "Invalid JSON" }));
                            }
                          }}
                          rows={8}
                          className="font-mono text-[12px]"
                          data-testid={`textarea-patch-edit-${row.id}`}
                        />
                        {editErrors[row.id] && (
                          <div className="text-[11.5px] text-[var(--brand-heart)]" data-testid={`text-patch-error-${row.id}`}>
                            {editErrors[row.id]}
                          </div>
                        )}
                      </div>
                    )}
                    <Textarea
                      placeholder="Reviewer note (optional)"
                      value={notes[row.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                      rows={2}
                      className="text-[12.5px]"
                      data-testid={`textarea-reviewer-note-${row.id}`}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        type="button"
                        onClick={() =>
                          setEdits((m) =>
                            m[row.id] !== undefined
                              ? Object.fromEntries(Object.entries(m).filter(([k]) => k !== row.id))
                              : { ...m, [row.id]: JSON.stringify(row.patch, null, 2) },
                          )
                        }
                        className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                        data-testid={`button-edit-patch-${row.id}`}
                      >
                        {edits[row.id] !== undefined ? "Cancel edits" : "Edit patch"}
                      </Button>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          onClick={() =>
                            review.mutate({
                              id: row.id,
                              decision: "rejected",
                              reviewerNote: notes[row.id] ?? "",
                            })
                          }
                          disabled={review.isPending}
                          className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                          data-testid={`button-reject-${row.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-1.5" />
                          Reject
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            let patchOverride: Record<string, unknown> | null = null;
                            if (edits[row.id] !== undefined) {
                              try {
                                const parsed = JSON.parse(edits[row.id]);
                                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                                  setEditErrors((m) => ({ ...m, [row.id]: "Patch must be a JSON object." }));
                                  return;
                                }
                                patchOverride = parsed;
                              } catch (err: any) {
                                setEditErrors((m) => ({ ...m, [row.id]: err?.message || "Invalid JSON" }));
                                return;
                              }
                            }
                            review.mutate({
                              id: row.id,
                              decision: "approved",
                              reviewerNote: notes[row.id] ?? "",
                              patchOverride,
                            });
                          }}
                          disabled={review.isPending || !!editErrors[row.id]}
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          data-testid={`button-approve-${row.id}`}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1.5" />
                          {edits[row.id] !== undefined ? "Approve with edits" : "Approve"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-[12px] text-slate-500">
                    Reviewed{row.reviewedAt && ` ${new Date(row.reviewedAt).toLocaleString()}`}
                    {row.reviewerNote && <> · “{row.reviewerNote}”</>}
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

export default AdminReview;
