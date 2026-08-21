// Task #3248 — per-format UPC input + barcode artwork preview.
//
// Rendered inside the SellPanel's SkuRow. The value itself is saved with
// the rest of the row (the parent threads `upc` through the same PUT the
// price/quantity fields use, so edit gating — lock, partner scope — is
// inherited); this component owns live validation, the barcode preview,
// SVG/PNG downloads, and the required artwork-only disclaimer.
//
// Preview + downloads go through GET /api/admin/barcode/upc-a. That
// endpoint is bearer-gated, so a bare <img src> / <a href> would 401 for
// #token-hash logins — fetch with authHeaders() into a blob object-URL
// instead (same trap as report CSV exports).

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { fetchBlob } from "@/lib/queryClient";
import { normalizeUpc, UPC_ARTWORK_DISCLAIMER } from "@shared/upc";

export function SkuUpcField({
  format,
  value,
  onChange,
  disabled = false,
}: {
  format: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const trimmed = value.trim();
  const result = useMemo(() => (trimmed ? normalizeUpc(trimmed) : null), [trimmed]);
  const valid = result?.ok === true ? result : null;

  // Debounced SVG preview for a valid UPC. Object URL is revoked on swap.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!valid) {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setPreviewUrl(null);
      return;
    }
    setPreviewLoading(true);
    const t = setTimeout(async () => {
      try {
        const blob = await fetchBlob(
          `/api/admin/barcode/upc-a?upc=${encodeURIComponent(valid.upc12)}&fmt=svg`,
        );
        if (cancelled) return;
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
      } catch {
        if (!cancelled) setPreviewUrl(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [valid?.upc12]);
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  const [downloading, setDownloading] = useState<"svg" | "png" | null>(null);
  const download = async (fmt: "svg" | "png") => {
    if (!valid || downloading) return;
    setDownloading(fmt);
    try {
      const blob = await fetchBlob(
        `/api/admin/barcode/upc-a?upc=${encodeURIComponent(valid.upc12)}&fmt=${fmt}`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `UPC-${valid.upc12}.${fmt}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-2" data-testid={`upc-field-${format}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-500 text-xs">UPC (optional)</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="12 digits"
          inputMode="numeric"
          readOnly={disabled}
          className="w-44 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums text-slate-700 outline-none focus:border-slate-400 read-only:bg-slate-50 read-only:text-slate-400"
          data-testid={`input-upc-${format}`}
        />
      </div>
      {trimmed && result && !result.ok && (
        <p className="text-xs text-red-600" data-testid={`text-upc-error-${format}`}>
          {result.error}
        </p>
      )}
      {valid?.completedFrom11 && (
        <p className="text-xs text-slate-500" data-testid={`text-upc-completed-${format}`}>
          Check digit computed — full UPC saves as{" "}
          <span className="tabular-nums font-medium text-slate-700">{valid.upc12}</span>.
        </p>
      )}
      {valid && (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          {previewLoading && !previewUrl ? (
            <div className="flex h-20 items-center justify-center text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt={`UPC-A barcode ${valid.upc12}`}
              className="mx-auto h-24 w-auto"
              data-testid={`img-upc-preview-${format}`}
            />
          ) : null}
          <div className="mt-2 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => download("svg")}
              disabled={!!downloading}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              data-testid={`button-upc-download-svg-${format}`}
            >
              <Download className="h-3 w-3" /> SVG
            </button>
            <button
              type="button"
              onClick={() => download("png")}
              disabled={!!downloading}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              data-testid={`button-upc-download-png-${format}`}
            >
              <Download className="h-3 w-3" /> Print PNG
            </button>
          </div>
        </div>
      )}
      <p className="text-xs leading-snug text-slate-400" data-testid={`text-upc-disclaimer-${format}`}>
        {UPC_ARTWORK_DISCLAIMER}
      </p>
    </div>
  );
}
