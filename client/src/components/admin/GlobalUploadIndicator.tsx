import { useState } from "react";
import { useLocation } from "wouter";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  RotateCw,
  UploadCloud,
} from "lucide-react";
import {
  useUploadManager,
  batchIsActive,
  type UploadBatch,
  type UploadItem,
} from "@/context/UploadManagerContext";

/* Task #2459 — the always-visible background-upload indicator. Lives at
   the admin-shell level (mounted once in App.tsx, gated to /admin routes
   so it inherits the light admin theme and never collides with the fan
   PlayerDock). Reads the module-singleton upload store, so it keeps
   showing progress after the originating dialog closed and across admin
   page navigation. Compact pill by default; expands to a per-file list
   with retry on failures. */

function itemLabel(item: UploadItem): string {
  if (item.status === "uploading") return item.pct > 0 ? `${item.pct}%` : "uploading…";
  if (item.status === "saving") return "saving…";
  if (item.status === "queued") return "queued";
  if (item.status === "done") return "done";
  return item.error || "failed";
}

function StatusIcon({ status }: { status: UploadItem["status"] }) {
  if (status === "done")
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />;
  if (status === "error")
    return <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />;
  if (status === "uploading" || status === "saving")
    return <Loader2 className="w-3.5 h-3.5 text-[var(--brand-blue)] animate-spin flex-shrink-0" />;
  return <span className="w-3.5 h-3.5 rounded-full border border-slate-300 flex-shrink-0" />;
}

function BatchRow({
  batch,
  onRetryItem,
  onRetryFailures,
  onDismiss,
}: {
  batch: UploadBatch;
  onRetryItem: (batchId: string, itemId: string) => void;
  onRetryFailures: (batchId: string) => void;
  onDismiss: (batchId: string) => void;
}) {
  const active = batchIsActive(batch);
  const done = batch.items.filter((i) => i.status === "done").length;
  const failed = batch.items.filter((i) => i.status === "error").length;
  const noun = batch.kind === "audio" ? "track" : "video";
  return (
    <div
      className="border-t border-slate-100 first:border-t-0 py-2"
      data-testid={`upload-batch-${batch.id}`}
    >
      <div className="flex items-center justify-between gap-2 px-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-[0.06em]">
          {batch.items.length} {batch.items.length === 1 ? noun : `${noun}s`}
          {active ? " · uploading" : failed > 0 ? ` · ${done} done, ${failed} failed` : " · done"}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!active && failed > 0 && (
            <button
              type="button"
              onClick={() => onRetryFailures(batch.id)}
              data-testid={`button-retry-batch-${batch.id}`}
              className="text-xs font-medium text-[var(--brand-blue)] hover:underline inline-flex items-center gap-1"
            >
              <RotateCw className="w-3 h-3" />
              Retry all
            </button>
          )}
          {!active && (
            <button
              type="button"
              onClick={() => onDismiss(batch.id)}
              aria-label="Dismiss"
              data-testid={`button-dismiss-batch-${batch.id}`}
              className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-slate-600 hover:bg-slate-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <ul className="mt-1 space-y-0.5">
        {batch.items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-2 px-3 py-0.5 text-xs text-slate-700"
            data-testid={`upload-manager-item-${item.id}`}
          >
            <StatusIcon status={item.status} />
            <span className="flex-1 truncate" title={item.name}>
              {item.name}
            </span>
            <span
              className={`tabular-nums flex-shrink-0 ${
                item.status === "error" ? "text-red-500 truncate max-w-[120px]" : "text-slate-400"
              }`}
              title={item.status === "error" ? item.error : undefined}
            >
              {itemLabel(item)}
            </span>
            {item.status === "error" && (
              <button
                type="button"
                onClick={() => onRetryItem(batch.id, item.id)}
                aria-label={`Retry ${item.name}`}
                data-testid={`button-retry-item-${item.id}`}
                className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-[var(--brand-blue)] hover:bg-slate-100 flex-shrink-0"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GlobalUploadIndicator() {
  const [location] = useLocation();
  const { batches, retryItem, retryBatchFailures, dismissBatch, clearCompletedBatches } =
    useUploadManager();
  const [expanded, setExpanded] = useState(true);

  // Admin-shell only: uploads originate from admin, the widget uses the
  // light admin palette, and the fan PlayerDock owns the fan viewport.
  if (!location.startsWith("/admin")) return null;
  if (batches.length === 0) return null;

  const activeItems = batches
    .flatMap((b) => b.items)
    .filter((i) => i.status === "uploading" || i.status === "saving" || i.status === "queued");
  const anyActive = activeItems.length > 0;
  const totalItems = batches.reduce((n, b) => n + b.items.length, 0);
  const doneItems = batches
    .flatMap((b) => b.items)
    .filter((i) => i.status === "done").length;
  const failedItems = batches
    .flatMap((b) => b.items)
    .filter((i) => i.status === "error").length;
  const anyCompletedBatch = batches.some((b) => !batchIsActive(b));

  return (
    <div
      className="fixed bottom-4 left-4 z-[70] w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
      data-testid="global-upload-indicator"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors"
        data-testid="button-toggle-upload-indicator"
        aria-expanded={expanded}
      >
        {anyActive ? (
          <Loader2 className="w-4 h-4 text-[var(--brand-blue)] animate-spin flex-shrink-0" />
        ) : failedItems > 0 ? (
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
        )}
        <span className="flex-1 text-left text-sm font-semibold text-slate-900">
          {anyActive ? (
            <>Uploading {activeItems.length} file{activeItems.length === 1 ? "" : "s"}…</>
          ) : failedItems > 0 ? (
            <>{doneItems} uploaded · {failedItems} failed</>
          ) : (
            <>{doneItems} of {totalItems} uploaded</>
          )}
        </span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="max-h-[46vh] overflow-y-auto">
          {batches.map((batch) => (
            <BatchRow
              key={batch.id}
              batch={batch}
              onRetryItem={retryItem}
              onRetryFailures={retryBatchFailures}
              onDismiss={dismissBatch}
            />
          ))}
          {anyCompletedBatch && !anyActive && (
            <div className="border-t border-slate-100 px-3 py-2 flex justify-end">
              <button
                type="button"
                onClick={clearCompletedBatches}
                data-testid="button-clear-completed-uploads"
                className="text-xs font-medium text-slate-500 hover:text-slate-800 inline-flex items-center gap-1.5"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
