// Task #128 — Admin Print queue.
// Lists every signed_cert certificate row grouped by status (awaiting →
// confirmed → locked_for_print → printed), lets the operator override
// paper size + name on individual rows, and batch-downloads selected
// confirmed rows as a ZIP of individual PDFs or one merged PDF. The
// batch-download endpoint flips selected rows to `printed` server-side
// once the file is streamed.
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getAuthToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { AdminErrorBoundary, ErrorState } from "@/components/admin/AdminErrorBoundary";
import { AdminFrame } from "@/components/admin/AdminFrame";

type QueueRow = {
  id: string;
  shortId: string;
  orderId: string;
  nameStatus: "awaiting" | "confirmed" | "locked_for_print" | "printed";
  confirmedIdentityKind: "display" | "username" | "real" | null;
  confirmedName: string | null;
  paperSize: "letter" | "a4";
  paperSizeOverridden: boolean;
  albumTitle: string;
  albumArtist: string;
  albumArtwork: string | null;
  goodDeedNumber: number | null;
  customerEmail: string;
  customerDisplayName: string;
  shippingCountry: string | null;
  createdAt: string;
  confirmedAt: string | null;
  // Task #435 — order.origin pass-through. "legacy:gogoods" rows are
  // imported certs that fans already physically own; we badge them so
  // operators don't re-print them by reflex on the Printed tab.
  origin: string;
};

const TABS: { key: QueueRow["nameStatus"]; label: string }[] = [
  { key: "confirmed", label: "Ready to print" },
  { key: "awaiting", label: "Awaiting fan" },
  { key: "locked_for_print", label: "Locked" },
  { key: "printed", label: "Printed" },
];

const STATUS_PILL: Record<QueueRow["nameStatus"], string> = {
  awaiting: "bg-amber-100 text-amber-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  locked_for_print: "bg-indigo-100 text-indigo-700",
  printed: "bg-slate-100 text-slate-500",
};

export function AdminPrintQueue() {
  return (
    <AdminErrorBoundary title="Print queue failed to render">
      <AdminPrintQueueInner />
    </AdminErrorBoundary>
  );
}

function AdminPrintQueueInner() {
  const { toast } = useToast();
  const [tab, setTab] = useState<QueueRow["nameStatus"]>("confirmed");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const {
    data: rows,
    isLoading,
    isError: rowsError,
    error: rowsErrorObj,
    refetch: refetchRows,
  } = useQuery<QueueRow[]>({
    queryKey: ["/api/admin/print-queue", { status: tab }],
    queryFn: async () => {
      const token = getAuthToken();
      const r = await fetch(`/api/admin/print-queue?status=${tab}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) {
        let msg = `Request failed (${r.status})`;
        try {
          const body = await r.json();
          if (body?.message) msg = body.message;
        } catch {}
        throw new Error(msg);
      }
      return r.json();
    },
  });

  const visible = rows ?? [];

  const setPaper = useMutation({
    mutationFn: async (args: { certId: string; paperSize: "letter" | "a4" }) => {
      await apiRequest("PATCH", `/api/admin/print-queue/cert/${args.certId}/paper-size`, { paperSize: args.paperSize });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/print-queue"] }),
  });

  const setName = useMutation({
    mutationFn: async (args: { certId: string; identityKind: string; name: string }) => {
      await apiRequest("PATCH", `/api/admin/print-queue/cert/${args.certId}/name`, {
        identityKind: args.identityKind, name: args.name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/print-queue"] });
      toast({ title: "Name updated" });
    },
  });

  const allSelectable = visible.filter((r) => r.nameStatus === "confirmed").map((r) => r.id);
  const allSelected = allSelectable.length > 0 && allSelectable.every((id) => selected.has(id));

  // Task #1633 — how many of the current selection sit on each stock,
  // so the split-download buttons can show their counts and disable when
  // empty.
  const selectedRows = visible.filter((r) => selected.has(r.id));
  const letterCount = selectedRows.filter((r) => r.paperSize === "letter").length;
  const a4Count = selectedRows.filter((r) => r.paperSize === "a4").length;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allSelectable));
  }

  // Task #1633 — the printer runs one stock at a time, so beside the mixed
  // ZIP / merged PDF we offer paper-size-split merged PDFs: pass a
  // `paperFilter` and only the selected certs on that stock are batched,
  // downloaded, and flipped to printed (the other size stays selected so
  // the operator can immediately download it too).
  async function batchDownload(format: "zip" | "merged_pdf", paperFilter?: "letter" | "a4") {
    const ids = Array.from(selected).filter((id) => {
      if (!paperFilter) return true;
      const row = visible.find((v) => v.id === id);
      return row?.paperSize === paperFilter;
    });
    if (ids.length === 0) {
      toast({ title: "Select at least one certificate", variant: "destructive" });
      return;
    }
    const token = getAuthToken();
    const r = await fetch("/api/admin/print-queue/batch-download", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ certIds: ids, format }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ message: "Failed" }));
      toast({ title: "Batch download failed", description: err.message, variant: "destructive" });
      return;
    }
    const blob = await r.blob();
    const cd = r.headers.get("Content-Disposition") ?? "";
    const m = /filename="([^"]+)"/.exec(cd);
    let filename = m?.[1] ?? (format === "zip" ? "gooddeed-batch.zip" : "gooddeed-batch.pdf");
    // Stamp the stock into the split download's name so the printer can
    // tell the two single-stock files apart at a glance.
    if (paperFilter) filename = `gooddeed-print-${paperFilter}.${format === "zip" ? "zip" : "pdf"}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    // Clear only the certs we actually downloaded — a split run leaves the
    // other stock selected and ready to download next.
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/print-queue"] });
    toast({ title: "Batch downloaded", description: `${filename} — ${ids.length} certificate(s) marked printed.` });
  }

  function promptOverrideName(row: QueueRow) {
    const name = window.prompt("Override printed name for this certificate", row.confirmedName ?? "")?.trim();
    if (!name) return;
    setName.mutate({ certId: row.id, identityKind: "display", name });
  }

  function previewUrl(certId: string) {
    return `/api/admin/print-queue/cert/${certId}/pdf`;
  }

  const readyCount = useMemo(
    () => (rows ?? []).filter((r) => r.nameStatus === "confirmed").length,
    [rows],
  );

  return (
    <AdminFrame active="pressing-orders">
      <div className="max-w-5xl mx-auto py-8" data-testid="page-admin-print-queue">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[22px] font-semibold text-slate-900">Print queue</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/admin/cert-names"
              className="text-[12px] text-slate-500 hover:text-[color:var(--brand-blue)] hover:underline"
              data-testid="link-cert-names"
            >
              Cert names →
            </Link>
            <Link
              href="/admin/orders"
              className="text-[12px] text-slate-500 hover:text-[color:var(--brand-blue)] hover:underline"
              data-testid="link-admin-orders"
            >
              ← All orders
            </Link>
          </div>
        </div>
        <p className="text-slate-500 text-[13px] mb-6">
          Printable GoodDeed certificates. Confirmed rows are ready to print — batch them into a ZIP of single-page PDFs, one merged PDF, or split into single-stock <span className="text-slate-900">US Letter</span> / <span className="text-slate-900">A4</span> files (one clean merged PDF or ZIP per paper size), then download. Downloading the batch flips those rows to <span className="text-slate-900">printed</span>.
        </p>

        {/* Tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTab(t.key); setSelected(new Set()); }}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold ${
                tab === t.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              data-testid={`tab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Batch toolbar */}
        {tab === "confirmed" && (
          <div className="flex items-center gap-2 mb-3" data-testid="batch-toolbar">
            <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="accent-[color:var(--brand-blue)]"
                data-testid="checkbox-select-all"
              />
              Select all {allSelectable.length} ready
            </label>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => batchDownload("zip")}
              disabled={selected.size === 0}
              className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 text-[12px] font-semibold hover:bg-slate-50 disabled:opacity-40"
              data-testid="button-batch-zip"
            >
              Download ZIP ({selected.size})
            </button>
            <button
              type="button"
              onClick={() => batchDownload("merged_pdf")}
              disabled={selected.size === 0}
              className="px-3 py-1.5 rounded-full bg-slate-900 text-white text-[12px] font-semibold hover:bg-slate-800 disabled:opacity-40"
              data-testid="button-batch-pdf"
            >
              Download merged PDF ({selected.size})
            </button>
            {/* Task #1633 — single-stock splits: one clean file per paper
                size so the printer can run each stock in one pass. */}
            <button
              type="button"
              onClick={() => batchDownload("merged_pdf", "letter")}
              disabled={letterCount === 0}
              className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 text-[12px] font-semibold hover:bg-slate-50 disabled:opacity-40"
              data-testid="button-batch-pdf-letter"
            >
              US Letter PDF ({letterCount})
            </button>
            <button
              type="button"
              onClick={() => batchDownload("merged_pdf", "a4")}
              disabled={a4Count === 0}
              className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 text-[12px] font-semibold hover:bg-slate-50 disabled:opacity-40"
              data-testid="button-batch-pdf-a4"
            >
              A4 PDF ({a4Count})
            </button>
            {/* Task #1649 — single-stock ZIPs (one file per cert) so print
                shops that want individual files still get a single-stock
                archive instead of hand-sorting a mixed ZIP. */}
            <button
              type="button"
              onClick={() => batchDownload("zip", "letter")}
              disabled={letterCount === 0}
              className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 text-[12px] font-semibold hover:bg-slate-50 disabled:opacity-40"
              data-testid="button-batch-zip-letter"
            >
              US Letter ZIP ({letterCount})
            </button>
            <button
              type="button"
              onClick={() => batchDownload("zip", "a4")}
              disabled={a4Count === 0}
              className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 text-[12px] font-semibold hover:bg-slate-50 disabled:opacity-40"
              data-testid="button-batch-zip-a4"
            >
              A4 ZIP ({a4Count})
            </button>
          </div>
        )}

        {isLoading && <div className="text-slate-500 text-sm" data-testid="loading">Loading…</div>}
        {rowsError && (
          <ErrorState
            error={rowsErrorObj}
            onRetry={() => refetchRows()}
            title="Couldn't load the print queue"
            testId="print-queue-error"
          />
        )}
        {!isLoading && !rowsError && visible.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500" data-testid="empty">
            Nothing here.
          </div>
        )}

        <div className="flex flex-col gap-2">
          {visible.map((r) => {
            const sel = selected.has(r.id);
            // Admin can correct the name on any cert that hasn't gone
            // out the door yet — awaiting, confirmed, and even
            // locked_for_print (a fan email caught a typo after lock).
            // Once printed, the row is frozen.
            const editable = r.nameStatus !== "printed";
            return (
              <div
                key={r.id}
                className={`rounded-2xl border p-3 flex items-center gap-3 ${
                  sel ? "border-[color:var(--brand-blue)] bg-[color:var(--brand-blue-soft)]" : "border-slate-200 bg-white"
                }`}
                data-testid={`row-cert-${r.id}`}
              >
                {tab === "confirmed" && (
                  <input
                    type="checkbox"
                    checked={sel}
                    onChange={() => toggle(r.id)}
                    className="accent-[color:var(--brand-blue)] w-4 h-4"
                    data-testid={`checkbox-${r.id}`}
                  />
                )}
                {r.albumArtwork && (
                  <img src={r.albumArtwork} alt="" className="w-12 h-12 rounded-md object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${STATUS_PILL[r.nameStatus]}`}>
                      {r.nameStatus.replace("_", " ")}
                    </span>
                    {r.goodDeedNumber !== null && (
                      <span className="text-[11px] text-slate-500" data-testid={`gooddeed-${r.id}`}>
                        #{r.goodDeedNumber}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400">{r.shippingCountry ?? "?"}</span>
                    {r.origin === "legacy:gogoods" && (
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase bg-amber-100 text-amber-700"
                        title="Imported from gogoods.com — fan already has the original physical certificate; don't re-print unless asked."
                        data-testid={`badge-legacy-${r.id}`}
                      >
                        Legacy
                      </span>
                    )}
                  </div>
                  <div className="text-[14px] font-medium text-slate-900 truncate mt-0.5">
                    {r.confirmedName ?? <span className="text-slate-400 italic">No name yet</span>}
                  </div>
                  <div className="text-[12px] text-slate-500 truncate">
                    {r.albumTitle} — {r.albumArtist} · {r.customerEmail}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <select
                    value={r.paperSize}
                    onChange={(e) => setPaper.mutate({ certId: r.id, paperSize: e.target.value as "letter" | "a4" })}
                    className="bg-white border border-slate-200 text-slate-700 text-[11px] rounded px-2 py-1"
                    data-testid={`select-paper-${r.id}`}
                  >
                    <option value="letter">Letter</option>
                    <option value="a4">A4</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <a
                      href={previewUrl(r.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-[color:var(--brand-blue)] hover:underline active:opacity-70"
                      data-testid={`link-preview-${r.id}`}
                    >
                      Preview
                    </a>
                    {editable && (
                      <>
                        <span className="text-slate-300">·</span>
                        <button
                          type="button"
                          onClick={() => promptOverrideName(r)}
                          className="text-[11px] text-slate-600 hover:text-slate-900 active:opacity-70"
                          data-testid={`button-override-name-${r.id}`}
                        >
                          Override name
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {tab === "confirmed" && readyCount > 0 && (
          <div className="text-[11px] text-slate-400 mt-4" data-testid="ready-summary">
            {readyCount} ready certificate(s).
          </div>
        )}
      </div>
    </AdminFrame>
  );
}

export default AdminPrintQueue;
