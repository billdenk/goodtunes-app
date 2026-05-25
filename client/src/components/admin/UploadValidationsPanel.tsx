// Task #216 — Upload preflight UI.
//
// Mounted in the Sell tab of AdminAlbum. The artist/label operator
// picks a pressing vendor + template, sees the spec hints (finished
// size, bleed, PPI, accepted formats) BEFORE picking a file, then
// drops in art or audio and gets back a row of pass/warn/fail checks
// computed server-side. A failing row is blocking; an admin can write
// a justification to override it and unblock fulfillment.
//
// NOTE: art uploads are treated as PRINT masters today — when we add
// "for display" trim variants we'll surface a second usage toggle here
// and route to a thinner ruleset on the server.

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, AlertTriangle, X, Upload, Lock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { VENDOR_SPECS, type VendorId } from "@shared/vendorSpecs";
import type { UploadValidationResult, CheckStatus } from "@shared/uploadValidation";

const STATUS_STYLE: Record<CheckStatus, { ring: string; text: string; bg: string; label: string }> = {
  pass: { ring: "ring-emerald-200", text: "text-emerald-700", bg: "bg-emerald-50", label: "Pass" },
  warn: { ring: "ring-amber-200",   text: "text-amber-700",   bg: "bg-amber-50",   label: "Warn" },
  fail: { ring: "ring-rose-200",    text: "text-rose-700",    bg: "bg-rose-50",    label: "Fail" },
};

function StatusIcon({ s, className = "w-3.5 h-3.5" }: { s: CheckStatus; className?: string }) {
  if (s === "pass") return <Check className={className} />;
  if (s === "warn") return <AlertTriangle className={className} />;
  return <X className={className} />;
}

export function UploadValidationsPanel({
  albumId,
  kindFilter,
  title,
  description,
}: {
  albumId: string;
  // When set, the Kind selector is hidden, the panel is locked to that
  // kind, and the results list only shows rows of that kind. Used by
  // PressPanel to split the art and audio flows into two surfaces.
  kindFilter?: "art" | "audio";
  // Optional override for the panel header copy. Lets PressPanel re-
  // frame each surface ("Art preflight" / "Replacement audio").
  title?: string;
  description?: string;
}) {
  const { toast } = useToast();
  const [vendorId, setVendorId] = useState<VendorId>("mrp");
  const [templateId, setTemplateId] = useState<string>(VENDOR_SPECS.mrp.art.templates[0].id);
  const [kind, setKind] = useState<"art" | "audio">(kindFilter ?? "art");
  const [vinylSize, setVinylSize] = useState<'7"' | '10"' | '12"'>('12"');
  const [rpm, setRpm] = useState<33 | 45>(33);
  const [side, setSide] = useState<string>("A");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const spec = VENDOR_SPECS[vendorId];
  const template = useMemo(
    () => spec.art.templates.find((t) => t.id === templateId) ?? spec.art.templates[0],
    [spec, templateId],
  );

  const validations = useQuery<UploadValidationResult[]>({
    queryKey: ["/api/admin/albums", albumId, "upload-validations"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/albums/${albumId}/upload-validations`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load validations");
      return r.json();
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("albumId", albumId);
      fd.append("vendorId", vendorId);
      if (kind === "art") {
        fd.append("templateId", templateId);
      } else {
        fd.append("vinylSize", vinylSize);
        fd.append("rpm", String(rpm));
        fd.append("side", side);
      }
      const r = await fetch(`/api/admin/uploads/validate-${kind}`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message ?? "Validation failed");
      return j as UploadValidationResult;
    },
    onSuccess: (row) => {
      const sty = STATUS_STYLE[row.status];
      toast({ title: `Preflight ${sty.label.toLowerCase()}`, description: `${row.fileName ?? "File"} — ${row.checks.length} check(s).` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "upload-validations"] });
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e?.message, variant: "destructive" }),
  });

  // When the operator switches vendor, snap to that vendor's first
  // template so the dropdown never carries a stale id from the
  // previous vendor.
  function pickVendor(v: VendorId) {
    setVendorId(v);
    setTemplateId(VENDOR_SPECS[v].art.templates[0].id);
  }

  // When kindFilter is set we only render rows of that kind; the run
  // catalog of audio rows lives on the Press tab next to the on-file
  // masters runner, while the art rows render in their own panel
  // above. Both views share the same /upload-validations endpoint.
  const visibleRows = (validations.data ?? []).filter((r) =>
    kindFilter ? r.kind === kindFilter : true,
  );

  return (
    <div className="mb-10" data-testid={`panel-upload-validations${kindFilter ? `-${kindFilter}` : ""}`}>
      <h2 className="text-[15px] font-semibold text-slate-900 mb-1">
        {title ?? "Upload preflight"}
      </h2>
      <p className="text-[13px] text-slate-500 mb-4">
        {description ??
          "Validate art & audio against pressing-plant specs before sending it to fulfillment. Failing rows block the order; an admin can override with a justification."}
      </p>

      <div className="rounded-md border border-slate-200 bg-white p-4 space-y-4">
        <div className={`grid ${kindFilter ? "grid-cols-1" : "grid-cols-2"} gap-3`}>
          <label className="text-[12px] text-slate-600">
            Vendor
            <select
              value={vendorId}
              onChange={(e) => pickVendor(e.target.value as VendorId)}
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px]"
              data-testid="select-preflight-vendor"
            >
              {Object.values(VENDOR_SPECS).map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          {!kindFilter && (
            <label className="text-[12px] text-slate-600">
              Kind
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as "art" | "audio")}
                className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px]"
                data-testid="select-preflight-kind"
              >
                <option value="art">Art</option>
                <option value="audio">Audio</option>
              </select>
            </label>
          )}
        </div>

        {kind === "art" ? (
          <label className="block text-[12px] text-slate-600">
            Template
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px]"
              data-testid="select-preflight-template"
            >
              {spec.art.templates.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <label className="text-[12px] text-slate-600">
              Size
              <select
                value={vinylSize}
                onChange={(e) => setVinylSize(e.target.value as any)}
                className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px]"
                data-testid="select-preflight-size"
              >
                <option value={'7"'}>7"</option>
                <option value={'10"'}>10"</option>
                <option value={'12"'}>12"</option>
              </select>
            </label>
            <label className="text-[12px] text-slate-600">
              RPM
              <select
                value={rpm}
                onChange={(e) => setRpm(Number(e.target.value) as 33 | 45)}
                className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px]"
                data-testid="select-preflight-rpm"
              >
                <option value={33}>33</option>
                <option value={45}>45</option>
              </select>
            </label>
            <label className="text-[12px] text-slate-600">
              Side
              <input
                value={side}
                onChange={(e) => setSide(e.target.value.toUpperCase().slice(0, 2))}
                className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px]"
                data-testid="input-preflight-side"
              />
            </label>
          </div>
        )}

        {/* Spec hints — shown BEFORE the operator picks a file so they
            know exactly what shape the bytes need to be. */}
        <div className="rounded-md bg-slate-50 border border-slate-100 p-3 text-[12px] text-slate-600 space-y-0.5">
          {kind === "art" ? (
            <>
              <div>
                <span className="font-semibold text-slate-700">Finished:</span>{" "}
                {template.finishedInches.w}″ × {template.finishedInches.h}″
                {template.bleedInches > 0 && <> · <span className="font-semibold text-slate-700">Bleed:</span> {template.bleedInches}″ all sides</>}
              </div>
              <div>
                <span className="font-semibold text-slate-700">Resolution:</span> {spec.art.requiredPpi} PPI ·{" "}
                <span className="font-semibold text-slate-700">Color:</span> {spec.art.allowedColorSpaces.map((c) => c.toUpperCase()).join(" / ")}
              </div>
              <div>
                <span className="font-semibold text-slate-700">Accepts:</span> {spec.art.acceptedFormats.join(", ").toUpperCase()}
              </div>
              {spec.art.filenamePattern && (
                <div className="text-amber-700">
                  Filename must match: Catalog#_Artist_TemplateType_YYYYMMDD.ext
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <span className="font-semibold text-slate-700">Format:</span> {spec.audio.requiredFormats.map((f) => f.toUpperCase()).join(" or ")}
                {spec.audio.requiredBitDepth && <> · ≥ {spec.audio.requiredBitDepth}-bit</>}
              </div>
              <div>
                <span className="font-semibold text-slate-700">One file per side.</span>{" "}
                Side-break tracklist required for length check.
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = "";
            }}
            data-testid="input-preflight-file"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--brand-blue)] text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-50"
            data-testid="button-preflight-upload"
          >
            <Upload className="w-3.5 h-3.5" />
            {upload.isPending ? "Validating…" : `Validate ${kind} file`}
          </button>
        </div>
      </div>

      {/* Results list */}
      <div className="mt-4 space-y-2">
        {validations.isLoading && <div className="text-[13px] text-slate-500">Loading…</div>}
        {validations.data && visibleRows.length === 0 && (
          <div className="text-[13px] text-slate-500 italic">No files validated yet.</div>
        )}
        {visibleRows.map((row) => (
          <ValidationRow key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
}

function ValidationRow({ row }: { row: UploadValidationResult }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(row.status !== "pass");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [justification, setJustification] = useState("");
  const sty = STATUS_STYLE[row.status];
  const override = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/upload-validations/${row.id}/override`, { justification });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Override saved" });
      setOverrideOpen(false);
      setJustification("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", row.albumId, "upload-validations"] });
    },
    onError: (e: any) => toast({ title: "Couldn't save override", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className={`rounded-md border border-slate-200 bg-white p-3 ring-1 ${sty.ring}`} data-testid={`row-validation-${row.id}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 text-left"
        data-testid={`button-toggle-validation-${row.id}`}
      >
        <span className={`inline-flex items-center gap-1 rounded-full ${sty.bg} ${sty.text} px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider`}>
          <StatusIcon s={row.status} />
          {sty.label}
        </span>
        <span className="text-[13px] text-slate-700 truncate flex-1">
          {row.kind === "art" ? "Art" : "Audio"} · {row.fileName ?? row.assetUrl}
        </span>
        <span className="text-[11px] text-slate-400">{row.vendorId.toUpperCase()}{row.templateId ? ` · ${row.templateId}` : ""}</span>
        {row.override && (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-violet-700">
            <Lock className="w-3 h-3" /> overridden
          </span>
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-1.5">
          {row.checks.map((c) => {
            const cs = STATUS_STYLE[c.status];
            return (
              <div key={c.key} className="flex items-start gap-2 text-[12.5px]" data-testid={`check-${row.id}-${c.key}`}>
                <span className={`mt-0.5 inline-flex items-center justify-center rounded-full ${cs.bg} ${cs.text} w-4 h-4`}>
                  <StatusIcon s={c.status} className="w-2.5 h-2.5" />
                </span>
                <div className="flex-1">
                  <div className="font-medium text-slate-800">{c.label}</div>
                  <div className="text-slate-500">{c.message}</div>
                </div>
              </div>
            );
          })}

          {row.override ? (
            <div className="mt-3 rounded-md bg-violet-50 border border-violet-100 p-2 text-[12px] text-violet-800">
              <div className="font-semibold">Overridden by admin</div>
              <div>{row.override.justification}</div>
            </div>
          ) : (
            row.status !== "pass" && (
              <div className="mt-3">
                {!overrideOpen ? (
                  <button
                    type="button"
                    onClick={() => setOverrideOpen(true)}
                    className="text-[12px] font-semibold text-[var(--brand-blue)] hover:underline"
                    data-testid={`button-override-open-${row.id}`}
                  >
                    Override and continue…
                  </button>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      placeholder="Why is it OK to ship this anyway? (Required, ≥ 8 chars.)"
                      className="block w-full rounded-md border border-slate-200 p-2 text-[12.5px] min-h-[60px]"
                      data-testid={`textarea-override-${row.id}`}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => override.mutate()}
                        disabled={justification.trim().length < 8 || override.isPending}
                        className="px-3 py-1 rounded-md bg-[var(--brand-blue)] text-white text-[12px] font-semibold disabled:opacity-50"
                        data-testid={`button-override-save-${row.id}`}
                      >
                        {override.isPending ? "Saving…" : "Save override"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOverrideOpen(false); setJustification(""); }}
                        className="px-3 py-1 rounded-md border border-slate-200 text-[12px]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
