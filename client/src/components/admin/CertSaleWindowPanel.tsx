// Task #246 — Signed-cert sale-window batch workflow panel.
//
// Sits inside the Sell tab on AdminAlbum next to SignedCertVendorPanel.
// Lets the operator:
//   - configure the window open/close dates
//   - watch the live reservation count vs the 25-unit minimum
//   - manually close (or let the 5-min scheduler do it)
//   - download the print-batch ZIP once the window flips into production
//   - tick through the six operations steps with optional notes
//   - see the true-up ledger row recorded at close (Task #4 engine TBD)

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2, Download, Calendar, AlertTriangle, MessageSquare } from "lucide-react";

type WindowStatus =
  | null
  | "scheduled"
  | "open"
  | "closed_below_min"
  | "in_production"
  | "shipped"
  | "cancelled";

type Step = { key: string; label: string; completedAt: string | null };

interface Payload {
  window: {
    opensAt: string | null;
    closesAt: string | null;
    status: WindowStatus;
    closedAt: string | null;
    notes: Record<string, string>;
    pdfAssetUrl: string | null;
    pdfGeneratedAt: string | null;
    steps: Step[];
  };
  counts: {
    reserved: number;
    inProduction: number;
    fulfilled: number;
    refundedBelowMin: number;
    digitalOnly: number;
    cancelled: number;
    total: number;
  };
  trueup: {
    batchSize: number;
    projectedRungLabel: string | null;
    projectedWholesaleCents: number | null;
    actualRungLabel: string | null;
    actualWholesaleCents: number | null;
    deltaCentsPerUnit: number;
    totalDeltaCents: number;
    status: string;
    notes: string | null;
  } | null;
}

const MIN_BATCH = 25;

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  // YYYY-MM-DDTHH:mm — datetime-local format
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): string | null {
  if (!s) return null;
  return new Date(s).toISOString();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function fmtUSD(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "Scheduled", cls: "bg-slate-100 text-slate-700" },
  open: { label: "Open — taking orders", cls: "bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]" },
  closed_below_min: { label: "Closed below 25 — refunded", cls: "bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]" },
  in_production: { label: "In production", cls: "bg-[var(--brand-purple)]/10 text-[var(--brand-purple)]" },
  shipped: { label: "Shipped", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-500" },
};

export function CertSaleWindowPanel({ albumId }: { albumId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<Payload>({
    queryKey: ["/api/admin/albums", albumId, "cert-sale-window"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/albums/${albumId}/cert-sale-window`);
      return r.json();
    },
  });

  const [opensAt, setOpensAt] = useState<string>("");
  const [closesAt, setClosesAt] = useState<string>("");
  const [dirtied, setDirtied] = useState(false);

  // Reset edits when fresh data arrives & user hasn't started editing.
  useMemo(() => {
    if (!data || dirtied) return;
    setOpensAt(toLocalInput(data.window.opensAt));
    setClosesAt(toLocalInput(data.window.closesAt));
  }, [data, dirtied]);

  const saveWindow = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/admin/albums/${albumId}/cert-sale-window`, {
        opensAt: fromLocalInput(opensAt),
        closesAt: fromLocalInput(closesAt),
      });
    },
    onSuccess: () => {
      setDirtied(false);
      qc.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "cert-sale-window"] });
      toast({ title: "Window saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const closeWindow = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/cert-sale-window/close`);
      return r.json();
    },
    onSuccess: (r: { outcome: string; reservations: number; refundFailures?: { reservationId: string; reason: string }[] }) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "cert-sale-window"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "cert-reservations"] });
      if (r.outcome === "below_min_partial") {
        toast({
          title: `Partial close — ${r.refundFailures?.length ?? 0} refund(s) failed`,
          description: "Window left open; the scheduler will retry the failed refunds every 5 min. Check the reservations list for affected orders.",
          variant: "destructive",
        });
        return;
      }
      const msg =
        r.outcome === "below_min"
          ? `Closed below minimum — refunded ${r.reservations} order(s)`
          : r.outcome === "in_production"
            ? `Closed — ${r.reservations} reservations in production`
            : "No-op";
      toast({ title: msg });
    },
    onError: (e: any) => toast({ title: "Close failed", description: e?.message, variant: "destructive" }),
  });

  const stepMut = useMutation({
    mutationFn: async (p: { stepKey: string; action: "complete" | "undo" | "note"; note?: string }) => {
      await apiRequest("PATCH", `/api/admin/albums/${albumId}/cert-batch/step`, p);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "cert-sale-window"] }),
  });

  const [noteOpenFor, setNoteOpenFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>("");

  if (isLoading || !data) {
    return (
      <div className="text-sm text-slate-500">
        <Loader2 className="w-3.5 h-3.5 inline animate-spin" /> Loading sale window…
      </div>
    );
  }

  const { window: w, counts, trueup } = data;
  const badge = STATUS_BADGES[w.status ?? ""] ?? { label: "No window configured", cls: "bg-slate-100 text-slate-500" };
  const reservedTotal = counts.reserved + counts.inProduction + counts.fulfilled;
  const progressPct = Math.min(100, Math.round((reservedTotal / MIN_BATCH) * 100));
  const canDownloadBatch = w.status === "in_production" || w.status === "shipped";
  const canEditDates = w.status === null || w.status === "scheduled" || w.status === "open";

  return (
    <div className="space-y-5" data-testid="panel-cert-sale-window">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Sale window</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Reserved GoodDeed numbers for in-window orders. {MIN_BATCH}-unit minimum or we auto-refund.
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${badge.cls}`} data-testid="badge-window-status">
          {badge.label}
        </span>
      </div>

      {/* Date controls */}
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-slate-600">
          Opens at
          <input
            type="datetime-local"
            value={opensAt}
            disabled={!canEditDates}
            onChange={(e) => {
              setOpensAt(e.target.value);
              setDirtied(true);
            }}
            data-testid="input-window-opens-at"
            className="mt-1 w-full text-sm rounded border border-slate-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/30 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </label>
        <label className="block text-xs text-slate-600">
          Closes at
          <input
            type="datetime-local"
            value={closesAt}
            disabled={!canEditDates}
            onChange={(e) => {
              setClosesAt(e.target.value);
              setDirtied(true);
            }}
            data-testid="input-window-closes-at"
            className="mt-1 w-full text-sm rounded border border-slate-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/30 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canEditDates || !dirtied || saveWindow.isPending}
          onClick={() => saveWindow.mutate()}
          data-testid="button-save-window"
          className="text-xs px-3 py-1.5 rounded bg-[var(--brand-blue)] text-white font-medium disabled:opacity-40"
        >
          {saveWindow.isPending ? "Saving…" : "Save window"}
        </button>
        {(w.status === "open" || w.status === "scheduled") && (
          <button
            type="button"
            disabled={closeWindow.isPending}
            onClick={() => {
              if (
                confirm(
                  `Close window now? ${reservedTotal < MIN_BATCH
                    ? `Below 25 — ${counts.reserved} order(s) will be refunded.`
                    : `${reservedTotal} reservations will flip to production.`}`,
                )
              )
                closeWindow.mutate();
            }}
            data-testid="button-close-window-now"
            className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            {closeWindow.isPending ? "Closing…" : "Close now"}
          </button>
        )}
      </div>

      {/* Reservation counter */}
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
          <span>
            Reservations: <strong className="text-slate-900" data-testid="text-reserved-total">{reservedTotal}</strong> / {MIN_BATCH}
          </span>
          <span>
            {counts.digitalOnly > 0 && <span className="mr-2">{counts.digitalOnly} digital-only</span>}
            {counts.refundedBelowMin > 0 && (
              <span className="text-[var(--brand-pink)]">{counts.refundedBelowMin} refunded</span>
            )}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-white overflow-hidden">
          <div
            className={`h-full transition-all ${reservedTotal >= MIN_BATCH ? "bg-[var(--brand-mint)]" : "bg-[var(--brand-blue)]"}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {w.closedAt && (
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Closed {fmtDate(w.closedAt)}
          </p>
        )}
      </div>

      {/* Below-min banner */}
      {w.status === "closed_below_min" && (
        <div className="rounded-md border border-[var(--brand-pink)]/30 bg-[var(--brand-pink)]/5 p-3 text-xs text-slate-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-[var(--brand-pink)] flex-shrink-0 mt-0.5" />
          <div>
            Closed below the 25-unit minimum — every cert add-on line on the {counts.refundedBelowMin} affected order(s) was refunded automatically (Shopify orders) or marked for manual refund (direct orders). Fans keep the digital provenance page.
          </div>
        </div>
      )}

      {/* Batch operations tracker */}
      {(w.status === "in_production" || w.status === "shipped") && (
        <div className="rounded-md border border-slate-200 bg-white p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900">Print batch</h4>
            <button
              type="button"
              disabled={!canDownloadBatch}
              onClick={async () => {
                try {
                  const r = await fetch(`/api/admin/albums/${albumId}/cert-batch/pdf`, {
                    method: "POST",
                    credentials: "include",
                  });
                  if (!r.ok) {
                    toast({ title: "Batch download failed", variant: "destructive" });
                    return;
                  }
                  const blob = await r.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `gooddeed-batch-${albumId}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  qc.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "cert-sale-window"] });
                } catch (e: any) {
                  toast({ title: "Download failed", description: e?.message, variant: "destructive" });
                }
              }}
              data-testid="button-download-batch-pdf"
              className="text-xs px-3 py-1.5 rounded bg-[var(--brand-purple)] text-white font-medium inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" /> Send to press (PDF)
            </button>
          </div>
          {w.pdfGeneratedAt && (
            <p className="text-xs text-slate-500">
              Last generated {fmtDate(w.pdfGeneratedAt)}
              {w.pdfAssetUrl && (
                <>
                  {" · "}
                  <a
                    href={w.pdfAssetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--brand-blue)] hover:underline"
                    data-testid="link-batch-pdf-asset"
                  >
                    Re-download archived PDF
                  </a>
                </>
              )}
            </p>
          )}
          <ol className="space-y-1.5">
            {w.steps.map((step, i) => {
              const done = !!step.completedAt;
              const prev = i === 0 ? true : !!w.steps[i - 1].completedAt;
              const existingNote = w.notes?.[step.key] ?? "";
              const noteOpen = noteOpenFor === step.key;
              return (
                <li
                  key={step.key}
                  className="text-sm"
                  data-testid={`step-${step.key}`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!prev && !done}
                      onClick={() => stepMut.mutate({ stepKey: step.key, action: done ? "undo" : "complete" })}
                      className={`w-5 h-5 rounded-full flex items-center justify-center border ${done
                        ? "bg-[var(--brand-mint)] border-[var(--brand-mint)] text-[var(--brand-bg)]"
                        : prev
                          ? "border-slate-300 hover:border-[var(--brand-blue)]"
                          : "border-slate-200 bg-slate-50"}`}
                      data-testid={`button-step-toggle-${step.key}`}
                    >
                      {done && <Check className="w-3 h-3" />}
                    </button>
                    <span className={done ? "text-slate-900 font-medium" : "text-slate-600"}>
                      {step.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (noteOpen) {
                          setNoteOpenFor(null);
                        } else {
                          setNoteOpenFor(step.key);
                          setNoteDraft(existingNote);
                        }
                      }}
                      className={`ml-1 inline-flex items-center gap-1 text-xs ${existingNote ? "text-[var(--brand-blue)]" : "text-slate-400 hover:text-slate-600"}`}
                      data-testid={`button-step-note-${step.key}`}
                      title={existingNote ? "Edit note" : "Add note"}
                    >
                      <MessageSquare className="w-3 h-3" />
                      {existingNote ? <span className="hidden sm:inline">Note</span> : null}
                    </button>
                    <span className="text-xs text-slate-400 ml-auto">
                      {done ? fmtDate(step.completedAt) : ""}
                    </span>
                  </div>
                  {existingNote && !noteOpen && (
                    <p className="ml-7 mt-0.5 text-xs text-slate-500 italic" data-testid={`text-step-note-${step.key}`}>
                      {existingNote}
                    </p>
                  )}
                  {noteOpen && (
                    <div className="ml-7 mt-1.5 flex items-start gap-2">
                      <textarea
                        rows={2}
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Add a note for this step…"
                        data-testid={`input-step-note-${step.key}`}
                        className="flex-1 text-xs rounded border border-slate-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/30"
                      />
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            stepMut.mutate(
                              { stepKey: step.key, action: "note", note: noteDraft },
                              { onSuccess: () => setNoteOpenFor(null) },
                            );
                          }}
                          data-testid={`button-step-note-save-${step.key}`}
                          className="text-xs px-2 py-1 rounded bg-[var(--brand-blue)] text-white"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setNoteOpenFor(null)}
                          className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* True-up ledger */}
      {trueup && (
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <h4 className="text-sm font-semibold text-slate-900 mb-1">Tier true-up</h4>
          <p className="text-xs text-slate-500 mb-2">
            Recorded at close. Auto-charge engine pending — settle manually until Task #4 lands.
          </p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-700">
            <dt className="text-slate-500">Batch size</dt>
            <dd data-testid="text-trueup-batch">{trueup.batchSize}</dd>
            <dt className="text-slate-500">Projected rung</dt>
            <dd>{trueup.projectedRungLabel ?? "—"} @ {fmtUSD(trueup.projectedWholesaleCents)}</dd>
            <dt className="text-slate-500">Actual rung</dt>
            <dd>{trueup.actualRungLabel ?? "—"} @ {fmtUSD(trueup.actualWholesaleCents)}</dd>
            <dt className="text-slate-500">Δ per unit</dt>
            <dd>{fmtUSD(trueup.deltaCentsPerUnit)}</dd>
            <dt className="text-slate-500">Total Δ</dt>
            <dd className={trueup.totalDeltaCents >= 0 ? "text-slate-900 font-medium" : "text-[var(--brand-mint)] font-medium"} data-testid="text-trueup-total">
              {fmtUSD(trueup.totalDeltaCents)}
            </dd>
            <dt className="text-slate-500">Status</dt>
            <dd className="text-slate-600">{trueup.status}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
