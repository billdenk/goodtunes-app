// Task #323 — Press tab. Owns everything fulfillment needs to send
// physical product to a pressing plant:
//
//   1. Masters on file — at-a-glance summary of every track's master
//      (format / sample rate / bit depth / duration / size), with per-
//      track download links and a "Download all" loop. Mirrors the
//      summary on the Tracks tab so the operator can verify what's
//      actually uploaded before kicking off preflight.
//   2. On-file audio preflight — pick vendor / size / RPM, then run
//      validateAudio against the existing masters in object storage.
//      No re-upload required. Tracks with no master come back as fail
//      rows so the gap is loud. Results render via the existing
//      UploadValidationsPanel locked to kind="audio".
//   3. Art preflight — UploadValidationsPanel locked to kind="art"
//      keeps the file-picker path for jackets / labels / hype stickers.
//
// SellPanel used to mount UploadValidationsPanel directly; that surface
// is now a one-line pointer to this tab.

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, Loader2, AlertTriangle, RefreshCcw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { VENDOR_SPECS, type VendorId } from "@shared/vendorSpecs";
import { UploadValidationsPanel } from "@/components/admin/UploadValidationsPanel";
import { PrintPdfsPanel } from "@/components/admin/PrintPdfsPanel";

export type PressPanelSong = {
  id: string;
  title: string;
  trackNumber: number;
  duration?: number | null;
  audioUrl?: string | null;
  audioSourceUrl?: string | null;
  audioFormat?: string | null;
  audioContainerExt?: string | null;
  audioSampleRate?: number | null;
  audioBitDepth?: number | null;
  audioChannels?: number | null;
  audioBytes?: number | null;
};

function fmtBytes(b: number | null | undefined): string {
  if (!b || b <= 0) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
function fmtSr(sr: number | null | undefined): string {
  if (!sr || sr <= 0) return "—";
  const khz = sr / 1000;
  return Number.isInteger(khz) ? `${khz} kHz` : `${khz.toFixed(1)} kHz`;
}
function fmtFmt(f: string | null | undefined, ext: string | null | undefined, url: string | null | undefined): string {
  if (f) {
    const lo = f.toLowerCase();
    if (lo.startsWith("pcm")) return "PCM";
    return f.toUpperCase();
  }
  const e = (ext || urlExt(url) || "").replace(/^\./, "");
  return e ? e.toUpperCase() : "—";
}
function urlExt(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\.(\w+)(?:\?|$)/);
  return m ? `.${m[1].toLowerCase()}` : null;
}
function fmtDur(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s) || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function PressPanel({
  albumId,
  songs,
}: {
  albumId: string;
  songs: PressPanelSong[];
}) {
  const { toast } = useToast();
  const sorted = [...songs].sort((a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
  const withMaster = sorted.filter((s) => !!s.audioUrl);
  const missing = sorted.filter((s) => !s.audioUrl);
  // Task #337 — a master with NULL format / sample rate / bit depth is
  // the only thing that makes `validateAudioFromSpecs` emit a "couldn't
  // read…" warn. Surface those rows up here so the operator can
  // re-probe in one click instead of digging through the Tracks tab.
  const staleSpecs = withMaster.filter(
    (s) => !s.audioFormat || !s.audioSampleRate || !s.audioBitDepth,
  );
  const bannerRef = useRef<HTMLDivElement | null>(null);
  function scrollToReprobeBanner() {
    bannerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  const totalBytes = withMaster.reduce((acc, s) => acc + (s.audioBytes ?? 0), 0);
  const totalDur = withMaster.reduce((acc, s) => acc + (s.duration ?? 0), 0);

  // ── Audio preflight controls (shared by "Run on-file" runner and
  //    the UploadValidationsPanel below, which carries its own copy
  //    of these fields for the replacement-upload path).
  const [vendorId, setVendorId] = useState<VendorId>("mrp");
  const [vinylSize, setVinylSize] = useState<'7"' | '10"' | '12"'>('12"');
  const [rpm, setRpm] = useState<33 | 45>(33);

  const reprobe = useMutation({
    mutationFn: async (songIds: string[] | undefined) => {
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/reprobe-masters`, {
        songIds,
      });
      return r.json() as Promise<{
        scanned: number;
        probedOk: number;
        unreadable: Array<{ songId: string; title: string | null }>;
        errored: Array<{ songId: string; title: string | null; error: string }>;
      }>;
    },
    onSuccess: async (j) => {
      const bits: string[] = [];
      bits.push(`${j.probedOk} probed`);
      if (j.unreadable.length > 0) bits.push(`${j.unreadable.length} unreadable`);
      if (j.errored.length > 0) bits.push(`${j.errored.length} errored`);
      toast({
        title: "Re-probe complete",
        description: `${j.scanned} master${j.scanned === 1 ? "" : "s"} · ${bits.join(" · ")}`,
        variant: j.errored.length > 0 ? "destructive" : undefined,
      });
      // Refresh the album/song rows so the staleSpecs banner updates
      // and the masters table shows the new format/rate/bit-depth.
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId] });
      // Re-run preflight automatically — the spec says clicking the
      // affordance should kick the probe pipeline THEN re-run preflight.
      // Skip if there's nothing to validate (saves a noisy empty run).
      if (withMaster.length > 0) runOnFile.mutate();
    },
    onError: (e: any) =>
      toast({ title: "Re-probe failed", description: e?.message ?? "Unknown error", variant: "destructive" }),
  });

  const runOnFile = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/preflight-masters`, {
        vendorId,
        vinylSize,
        rpm,
      });
      return r.json() as Promise<{ tracksValidated: number; tracksMissing: number }>;
    },
    onSuccess: (j) => {
      const bits: string[] = [];
      bits.push(`${j.tracksValidated} track${j.tracksValidated === 1 ? "" : "s"} validated`);
      if (j.tracksMissing > 0) {
        bits.push(`${j.tracksMissing} missing master${j.tracksMissing === 1 ? "" : "s"}`);
      }
      toast({ title: "Preflight complete", description: bits.join(" · ") });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "upload-validations"] });
    },
    onError: (e: any) =>
      toast({ title: "Preflight failed", description: e?.message ?? "Unknown error", variant: "destructive" }),
  });

  function downloadAll() {
    if (withMaster.length === 0) {
      toast({ title: "No masters to download", description: "Upload masters on the Tracks tab first." });
      return;
    }
    withMaster.forEach((s, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = s.audioUrl!;
        const ext = urlExt(s.audioUrl) ?? ".mp3";
        a.download = `${String(s.trackNumber).padStart(2, "0")} ${s.title}${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 250);
    });
    toast({
      title: `Downloading ${withMaster.length} master${withMaster.length === 1 ? "" : "s"}`,
      description: "Your browser will save each file.",
    });
  }

  return (
    <div className="py-6" data-testid="panel-press">
      <div className="max-w-3xl">
        {/* ── Masters on file ─────────────────────────────────────────── */}
        <div className="mb-10" data-testid="section-masters-on-file">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-1">Masters on file</h2>
          <p className="text-[13px] text-slate-500 mb-4">
            Confirm what's uploaded for this album before preflighting it against a pressing
            plant. {sorted.length} track{sorted.length === 1 ? "" : "s"} · {withMaster.length} with
            master · {missing.length > 0 ? <span className="text-rose-700">{missing.length} missing</span> : "all present"} · {fmtBytes(totalBytes)} · {fmtDur(totalDur)}
          </p>

          <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left w-8">#</th>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Format</th>
                  <th className="px-3 py-2 text-left">Rate / Depth</th>
                  <th className="px-3 py-2 text-left">Duration</th>
                  <th className="px-3 py-2 text-left">Size</th>
                  <th className="px-3 py-2 text-right">File</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const present = !!s.audioUrl;
                  return (
                    <tr
                      key={s.id}
                      className="border-t border-slate-100"
                      data-testid={`row-master-${s.id}`}
                    >
                      <td className="px-3 py-2 text-slate-500 font-mono tabular-nums">
                        {String(s.trackNumber ?? 0).padStart(2, "0")}
                      </td>
                      <td className="px-3 py-2 text-slate-800 font-medium">{s.title}</td>
                      <td className="px-3 py-2 text-slate-700 font-mono tabular-nums">
                        {present ? fmtFmt(s.audioFormat, s.audioContainerExt, s.audioUrl) : (
                          <span className="inline-flex items-center gap-1 text-rose-700">
                            <AlertTriangle className="w-3 h-3" /> missing
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-700 font-mono tabular-nums">
                        {present ? `${fmtSr(s.audioSampleRate)}${s.audioBitDepth ? ` · ${s.audioBitDepth}-bit` : ""}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-700 font-mono tabular-nums">{fmtDur(s.duration)}</td>
                      <td className="px-3 py-2 text-slate-700 font-mono tabular-nums">
                        {present ? fmtBytes(s.audioBytes) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {present ? (
                          <a
                            href={s.audioUrl!}
                            download={`${String(s.trackNumber).padStart(2, "0")} ${s.title}${urlExt(s.audioUrl) ?? ""}`}
                            className="inline-flex items-center gap-1 text-[var(--brand-blue)] hover:underline"
                            data-testid={`link-download-master-${s.id}`}
                          >
                            <Download className="w-3 h-3" /> download
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500 italic">
                      No tracks on this album yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={downloadAll}
              disabled={withMaster.length === 0}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              data-testid="button-download-all-masters"
            >
              <Download className="w-3.5 h-3.5" />
              Download all masters
            </button>
          </div>
        </div>

        {/* ── Re-probe banner (Task #337) ─────────────────────────────
            Shown when any uploaded master is missing format / sample-
            rate / bit-depth on the songs row. Kicks the existing per-
            song probe pipeline for just those tracks, then auto-
            re-runs preflight so the warn rows clear. */}
        {staleSpecs.length > 0 && (
          <div
            ref={bannerRef}
            id="press-reprobe-banner"
            className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-3 flex items-start gap-3"
            data-testid="banner-reprobe-stale-specs"
          >
            <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="flex-1 text-xs text-amber-900">
              <div className="font-semibold">
                {staleSpecs.length} track{staleSpecs.length === 1 ? "" : "s"} have incomplete specs
              </div>
              <div className="text-amber-800">
                Stored audio format, sample rate, or bit depth is missing — preflight
                will flag these as warns until the master is re-probed.
              </div>
            </div>
            <button
              type="button"
              onClick={() => reprobe.mutate(staleSpecs.map((s) => s.id))}
              disabled={reprobe.isPending || runOnFile.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 disabled:opacity-50 shrink-0"
              data-testid="button-reprobe-stale-masters"
            >
              {reprobe.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="w-3.5 h-3.5" />
              )}
              {reprobe.isPending
                ? "Re-probing…"
                : runOnFile.isPending
                  ? "Re-running preflight…"
                  : `Re-probe ${staleSpecs.length} master${staleSpecs.length === 1 ? "" : "s"}`}
            </button>
          </div>
        )}

        {/* ── On-file audio preflight runner ──────────────────────────── */}
        <div className="mb-10" data-testid="section-on-file-preflight">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-1">
            Run preflight on masters
          </h2>
          <p className="text-[13px] text-slate-500 mb-4">
            Validates every uploaded master against the picked plant's specs — no re-upload
            needed. Tracks with no master are listed as fail rows so the gap is loud. Re-run
            after swapping a master or changing the vendor / size / RPM.
          </p>
          <div className="rounded-md border border-slate-200 bg-white p-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <label className="text-[12px] text-slate-600">
                Vendor
                <select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value as VendorId)}
                  className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px]"
                  data-testid="select-onfile-vendor"
                >
                  {Object.values(VENDOR_SPECS).map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-[12px] text-slate-600">
                Size
                <select
                  value={vinylSize}
                  onChange={(e) => setVinylSize(e.target.value as any)}
                  className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px]"
                  data-testid="select-onfile-size"
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
                  data-testid="select-onfile-rpm"
                >
                  <option value={33}>33</option>
                  <option value={45}>45</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={() => runOnFile.mutate()}
              disabled={runOnFile.isPending}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--brand-blue)] text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-50"
              data-testid="button-run-onfile-preflight"
            >
              {runOnFile.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {runOnFile.isPending
                ? "Validating masters…"
                : `Run preflight on ${withMaster.length} master${withMaster.length === 1 ? "" : "s"}`}
            </button>
            <p className="text-[11px] text-slate-500">
              Replaces any prior audio preflight rows for this album. Art rows are left alone.
            </p>
          </div>
        </div>

        {/* ── Audio preflight rows (shared with replacement-upload) ───── */}
        <UploadValidationsPanel
          albumId={albumId}
          kindFilter="audio"
          title="Audio preflight results"
          description="Per-track pass / warn / fail against the picked plant's specs. Failing rows block fulfillment; an admin can override with a justification."
          onReprobeClick={staleSpecs.length > 0 ? scrollToReprobeBanner : undefined}
        />

        {/* ── Art preflight (file-picker path) ────────────────────────── */}
        <UploadValidationsPanel
          albumId={albumId}
          kindFilter="art"
          title="Art preflight"
          description="Drop a jacket / label / hype-sticker file to validate against the picked plant's print template before sending it to fulfillment."
        />

        {/* ── Print-ready PDFs (Task #327, moved from Sell) ──────────── */}
        <PrintPdfsPanel albumId={albumId} />
      </div>
    </div>
  );
}
