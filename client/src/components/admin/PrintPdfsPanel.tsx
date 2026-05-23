// Task #217 — Pressing-plant print PDF generation panel.
//
// Mounted in the Sell tab of AdminAlbum, just below the upload
// preflight panel. Lets an admin pick a vendor and press "Generate
// print PDFs for [Vendor]". The server composes one PDF per template
// the release needs (center label, jacket, insert …), sized to
// finished+bleed, named per the vendor's filename convention, and
// stores each generation as a versioned row. Re-clicking adds a new
// generation row at the top — previous versions stay downloadable.
//
// The server returns 409 with structured reasons:
//   • blocking — failing preflight rows for this vendor
//   • missingTemplates — no validated source for a required template
//   • fallbackTemplates — would fall back to album.artwork
//   • unsupportedContentType — source isn't JPEG/PNG
// The panel renders the actionable list inline and asks for an
// override justification (recorded on the generation row) where
// override is allowed.

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileText, Loader2 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { VENDOR_SPECS, type VendorId } from "@shared/vendorSpecs";

type Artifact = {
  id: string;
  templateId: string;
  templateLabel: string;
  fileName: string;
  assetUrl: string;
  sizeBytes: number;
};

type Generation = {
  id: string;
  albumId: string;
  vendorId: string;
  createdByUserId: string | null;
  overrideJustification: string | null;
  createdAt: string;
  artifacts: Artifact[];
};

type Blocking = { id: string; fileName: string | null; checks: Array<{ key: string; label: string; message: string }> };
type GenerateError = {
  message: string;
  blocking?: Blocking[];
  missingTemplates?: string[];
  fallbackTemplates?: string[];
  unsupportedContentType?: string;
};

function fmtKb(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export function PrintPdfsPanel({ albumId }: { albumId: string }) {
  const { toast } = useToast();
  const [vendorId, setVendorId] = useState<VendorId>("mrp");
  const [blocked, setBlocked] = useState<GenerateError | null>(null);
  const [justification, setJustification] = useState("");

  const generations = useQuery<Generation[]>({
    queryKey: ["/api/admin/albums", albumId, "print-pdfs"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/albums/${albumId}/print-pdfs`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load print generations");
      return r.json();
    },
  });

  const generate = useMutation({
    mutationFn: async (overrideJustification?: string) => {
      const r = await fetch(`/api/admin/albums/${albumId}/print-pdfs/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, overrideJustification }),
      });
      const j = await r.json();
      if (r.status === 409) {
        const err: any = new Error(j.message ?? "Blocked.");
        err.payload = j as GenerateError;
        throw err;
      }
      if (!r.ok) throw new Error(j?.message ?? "Generation failed");
      return j as Generation;
    },
    onSuccess: (gen) => {
      setBlocked(null);
      setJustification("");
      toast({ title: "Print PDFs generated", description: `${gen.artifacts.length} template(s) for ${VENDOR_SPECS[gen.vendorId as VendorId]?.label ?? gen.vendorId}.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "print-pdfs"] });
    },
    onError: (e: any) => {
      if (e.payload) {
        setBlocked(e.payload);
        return;
      }
      toast({ title: "Couldn't generate PDFs", description: e?.message, variant: "destructive" });
    },
  });

  const overrideAllowed =
    !!blocked && (
      (blocked.blocking && blocked.blocking.length > 0) ||
      (blocked.fallbackTemplates && blocked.fallbackTemplates.length > 0)
    );

  return (
    <div className="mb-10" data-testid="panel-print-pdfs">
      <h2 className="text-base font-semibold text-slate-900 mb-1">Print-ready PDFs</h2>
      <p className="text-sm text-slate-500 mb-4">
        Compose vendor-shaped print PDFs from this release's validated artwork — sized to the right trim+bleed,
        named per the vendor's filename convention. Each click stores a new versioned set; older generations
        stay downloadable below.
      </p>

      <div className="rounded-md border border-slate-200 bg-white p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 items-end">
          <label className="text-xs text-slate-600">
            Vendor
            <select
              value={vendorId}
              onChange={(e) => { setVendorId(e.target.value as VendorId); setBlocked(null); }}
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
              data-testid="select-print-vendor"
            >
              {Object.values(VENDOR_SPECS).map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => generate.mutate(undefined)}
            disabled={generate.isPending}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-[var(--brand-blue)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            data-testid="button-print-generate"
          >
            {generate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            Generate print PDFs for {VENDOR_SPECS[vendorId].label}
          </button>
        </div>

        {blocked && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 space-y-2" data-testid="print-blocked">
            <div className="font-semibold">{blocked.message}</div>
            {blocked.blocking && blocked.blocking.length > 0 && (
              <ul className="list-disc pl-4 space-y-0.5">
                {blocked.blocking.flatMap((b) =>
                  b.checks.map((c, i) => (
                    <li key={`${b.id}-${i}`}>
                      <span className="font-medium">{b.fileName ?? "file"}</span> · {c.label}: {c.message}
                    </li>
                  )),
                )}
              </ul>
            )}
            {blocked.missingTemplates && blocked.missingTemplates.length > 0 && (
              <ul className="list-disc pl-4 space-y-0.5">
                {blocked.missingTemplates.map((t) => <li key={t}>{t}</li>)}
              </ul>
            )}
            {blocked.fallbackTemplates && blocked.fallbackTemplates.length > 0 && (
              <ul className="list-disc pl-4 space-y-0.5">
                {blocked.fallbackTemplates.map((t) => <li key={t}>{t} — would use album cover</li>)}
              </ul>
            )}
            {overrideAllowed && (
              <>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Why is it OK to ship this anyway? (Required, ≥ 8 chars.) Recorded on the generation."
                  className="block w-full rounded-md border border-rose-200 bg-white p-2 text-sm min-h-[60px]"
                  data-testid="textarea-print-override"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => generate.mutate(justification.trim())}
                    disabled={justification.trim().length < 8 || generate.isPending}
                    className="px-3 py-1.5 rounded-md bg-rose-600 text-white text-xs font-semibold disabled:opacity-50"
                    data-testid="button-print-override-generate"
                  >
                    {generate.isPending ? "Generating…" : "Override and generate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setBlocked(null); setJustification(""); }}
                    className="px-3 py-1.5 rounded-md border border-slate-200 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {generations.isLoading && <div className="text-sm text-slate-500">Loading…</div>}
        {generations.data && generations.data.length === 0 && (
          <div className="text-sm text-slate-500 italic" data-testid="print-empty">No print PDFs generated yet.</div>
        )}
        {generations.data?.map((g) => (
          <div key={g.id} className="rounded-md border border-slate-200 bg-white p-3" data-testid={`row-print-gen-${g.id}`}>
            <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
              <span>
                <span className="font-semibold text-slate-900">{VENDOR_SPECS[g.vendorId as VendorId]?.label ?? g.vendorId}</span>
                {" · "}
                {new Date(g.createdAt).toLocaleString()}
              </span>
              <span className="text-slate-400">{g.artifacts.length} file(s)</span>
            </div>
            {g.overrideJustification && (
              <div className="rounded-md bg-violet-50 border border-violet-100 p-2 text-xs text-violet-800 mb-2">
                <span className="font-semibold">Overridden: </span>{g.overrideJustification}
              </div>
            )}
            <ul className="space-y-1">
              {g.artifacts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    <span className="text-slate-700">{a.templateLabel}</span>
                    <span className="text-slate-400"> · {fmtKb(a.sizeBytes)}</span>
                  </span>
                  <a
                    href={a.assetUrl}
                    download={a.fileName}
                    className="inline-flex items-center gap-1 text-[var(--brand-blue)] font-semibold hover:underline"
                    data-testid={`link-print-download-${a.id}`}
                  >
                    <Download className="w-3 h-3" />
                    {a.fileName}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
