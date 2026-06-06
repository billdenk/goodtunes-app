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

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatUsdCents } from "@shared/money";
import { Download, Loader2, AlertTriangle, RefreshCcw, CheckCircle2, Send, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { VENDOR_SPECS, HIDDEN_PREFLIGHT_VENDORS, matchInvitedPressToVendor, defaultPreflightVendor, type VendorId } from "@shared/vendorSpecs";
import { UploadValidationsPanel } from "@/components/admin/UploadValidationsPanel";
import { PrintPdfsPanel } from "@/components/admin/PrintPdfsPanel";
import { VinylOrderPanel } from "@/components/admin/VinylOrderPanel";
import type { VinylFormat } from "@shared/vinylFormatRules";

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
  // Task #583 — vinyl cut-order fields surface in the Physical tab's
  // Side A / Side B block (moved out of the Tracks panel).
  vinylSide?: "A" | "B" | "C" | "D" | null;
  vinylOrder?: number | null;
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

// Task #533 — admin readout of the per-album pool-funded early-cut
// ledger. Shows what's been set aside from fan sales, what's been
// released to fund a cut, what's available, and which of the three
// consent gates are still outstanding. Read-only — the toggles live on
// the press (super-admin) and the Sell tab (artist opt-in); approval
// happens in the Early Cut Review queue.
function EarlyCutPoolReadout({ albumId }: { albumId: string }) {
  type EarlyCutState = {
    tier: { tierName: string; format: string } | null;
    pressFloorTotalCents: number;
    poolAccruedCents: number;
    poolReleasedCents: number;
    poolAvailableCents: number;
    poolReady: boolean;
    missingConsents: string[];
    mastersTriggeredAt: string | null;
  };
  const { data } = useQuery<EarlyCutState>({
    queryKey: ["/api/admin/albums", albumId, "early-cut"],
    enabled: !!albumId,
  });
  if (!data?.tier) return null;
  const dollars = (c: number) => formatUsdCents(Math.max(0, c), { maximumFractionDigits: 0 });
  const pct = data.pressFloorTotalCents > 0
    ? Math.min(100, Math.round((data.poolAvailableCents / data.pressFloorTotalCents) * 100))
    : 0;
  const CONSENT_LABEL: Record<string, string> = {
    press: "press auto-trigger toggle",
    artist: "artist opt-in",
    approval: "admin approval",
  };
  return (
    <div className="mb-8 rounded-xl border border-slate-200 bg-white p-4" data-testid="panel-early-cut-pool">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-sm font-bold text-slate-900">Pool-funded early cut</h3>
        <span className="text-xs text-slate-500">{data.tier.tierName} · {data.tier.format}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <div className="text-xs text-slate-500">Accrued</div>
          <div className="text-sm font-semibold text-slate-900" data-testid="text-pool-accrued">{dollars(data.poolAccruedCents)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Released</div>
          <div className="text-sm font-semibold text-slate-900" data-testid="text-pool-released">{dollars(data.poolReleasedCents)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Available</div>
          <div className="text-sm font-semibold text-slate-900" data-testid="text-pool-available">{dollars(data.poolAvailableCents)}</div>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>{pct}% of {dollars(data.pressFloorTotalCents)} floor</span>
        {data.mastersTriggeredAt ? (
          <span className="text-emerald-700 font-medium" data-testid="text-pool-status">Masters cut started</span>
        ) : data.missingConsents.length === 0 ? (
          <span className="text-emerald-700 font-medium" data-testid="text-pool-status">Ready — awaiting approval</span>
        ) : (
          <span data-testid="text-pool-status">
            Waiting on: {data.missingConsents.map((c) => CONSENT_LABEL[c] ?? c).join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}

// Task #1530 — the relocated "Go to Press" affordance. Quiet by design:
// while the album isn't ready it shows a muted helper line naming what's
// outstanding (no loud CTA); once every section reads complete the submit
// turns on. After submission it mirrors the strip's old status states
// (Awaiting review / Approved / Rejected note + resubmit).
function GoToPressAction({
  status,
  rejectionNote,
  readyToSend,
  blockers,
  isPending,
  onSubmit,
}: {
  status: string | null;
  rejectionNote: string | null;
  readyToSend: boolean;
  blockers: string[];
  isPending: boolean;
  onSubmit: () => void;
}) {
  const pending = status === "pending";
  const approved = status === "approved";
  const rejected = status === "rejected";

  if (pending || approved) {
    return (
      <div
        className="mb-6 rounded-lg border border-slate-200 bg-white p-4 flex items-center justify-between gap-3"
        data-testid="gotopress-action"
      >
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-slate-900">
            {approved ? "Approved — going to press" : "Sent to GoodTunes"}
          </div>
          <div className="text-[12px] text-slate-500">
            {approved
              ? "GoodTunes approved this run; it's headed to the plant."
              : "Awaiting GoodTunes review — you'll see it flip to Approved here."}
          </div>
        </div>
        <span
          className={[
            "shrink-0 text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full border",
            approved
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-amber-50 text-amber-700 border-amber-200",
          ].join(" ")}
          data-testid="badge-pressing-status"
        >
          {approved ? "Approved" : "Awaiting review"}
        </span>
      </div>
    );
  }

  // Not yet sent (or rejected → resubmit). Submit is enabled only when
  // every section reads complete.
  return (
    <div
      className="mb-6 rounded-lg border border-slate-200 bg-white p-4"
      data-testid="gotopress-action"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-slate-900">
            {rejected ? "Resubmit to GoodTunes" : "Send the order to GoodTunes"}
          </div>
          <div className="text-[12px] text-slate-500">
            {readyToSend
              ? "Everything's ready — send this run to GoodTunes for review."
              : "Finish the sections below before this run can be sent."}
          </div>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!readyToSend || isPending}
          title={
            readyToSend
              ? "Send this run to GoodTunes for review."
              : "Complete every section first."
          }
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-[var(--brand-blue)] text-white text-[12px] font-semibold hover:bg-[var(--brand-blue-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="button-go-to-press"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          {rejected ? "Resubmit" : "Go to Press"}
        </button>
      </div>

      {!readyToSend && blockers.length > 0 && (
        <ul
          className="mt-3 space-y-1 border-t border-slate-100 pt-3"
          data-testid="gotopress-blockers"
        >
          {blockers.map((b, i) => (
            <li
              key={i}
              className="text-[12px] text-slate-500 flex items-center gap-1.5"
            >
              <span className="inline-block h-[5px] w-[5px] rounded-full bg-slate-300" />
              {b}
            </li>
          ))}
        </ul>
      )}

      {rejected && (
        <div className="mt-3 rounded-md border border-[color:var(--brand-heart)]/40 bg-[color:var(--brand-heart)]/5 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-[color:var(--brand-heart)] flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold text-slate-900">
              GoodTunes asked for changes
            </div>
            {rejectionNote && (
              <div className="text-[12px] text-slate-700 mt-0.5">
                “{rejectionNote}”
              </div>
            )}
            <div className="text-[11.5px] text-slate-500 mt-1">
              Make the change and resubmit — your prior request is archived.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PressPanel({
  albumId,
  songs,
  physicalFormat,
  vinylFormat,
  readyToSend = false,
  sendBlockers = [],
}: {
  albumId: string;
  songs: PressPanelSong[];
  // Task #583 — Sell-panel physical-format pick drives whether the Side
  // A / Side B cut block renders inside Masters on file (cassette + no
  // physical format hide the block; the rest of the panel stays).
  physicalFormat?: "single_lp" | "double_lp" | "seven_inch" | "cassette" | null;
  vinylFormat?: VinylFormat | null;
  // Task #1530 — completeness gating for the relocated Go-to-Press
  // affordance. `readyToSend` is true only when every section reads
  // complete + preflight is clean + masters are on file; `sendBlockers`
  // are the human phrases naming what's still outstanding (shown as a
  // quiet helper note while the submit is disabled).
  readyToSend?: boolean;
  sendBlockers?: string[];
}) {
  const showVinylSides = !!physicalFormat && physicalFormat !== "cassette";
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

  // Task #597 — only VENDOR is lifted to the top of the Press tab.
  // Size / RPM stay per-file: the on-file runner keeps its own
  // size/RPM block (the run-all uses one pair for the whole album),
  // and the per-row "Replace this master" inline form carries its
  // own size/rpm/side (defaulted from the runner's pair) because
  // those values can legitimately differ per file.
  //
  // Default vendor is, in order: the album's invited press matched
  // against `VENDOR_SPECS`, or the first non-hidden vendor when
  // nothing matches. MRP + Hellbender are hidden from every
  // preflight surface pre-meeting (see HIDDEN_PREFLIGHT_VENDORS) so
  // the Press tab never lands the operator on a vendor the Sell-tab
  // Printer chip row also refuses to surface. Restore by emptying
  // `HIDDEN_PREFLIGHT_VENDORS`.
  // Task #1311 — Same endpoint as SellPanel's `invitedPress` query so both tabs
  // read the artist-level pressing plant from one source of truth.  When a plant
  // IS set, `matchInvitedPressToVendor` maps its name to a VendorId here, and
  // SellPanel drives its catalog from the same resolved press — the Physical and
  // Sell tabs always agree.  When NO plant is set, both fall back to
  // `defaultPreflightVendor()` (MRP) — the same platform-wide default —
  // so the two panels cannot diverge in either the set or unset case.
  const { data: invitedPress } = useQuery<{ press: { name: string | null } | null }>({
    queryKey: ["/api/admin/albums", albumId, "invited-press"],
  });
  // Task #1311 — Physical tab derives its plant from the SAME resolver as
  // the Sell panel: invited press → matchInvitedPressToVendor → defaultPreflightVendor().
  // No per-album override exists; setting the artist's plant on the People page
  // is the single authoritative control. `HIDDEN_PREFLIGHT_VENDORS` still governs
  // which vendors appear in generic contexts, but a deliberate artist stamp is
  // always honored even when the vendor is in that set.
  const defaultVendor: VendorId = useMemo(() => {
    const matched = matchInvitedPressToVendor(invitedPress?.press?.name);
    if (matched) return matched;
    // Same platform-default the Sell panel's mrpDefaults fallback resolves to.
    return defaultPreflightVendor();
  }, [invitedPress]);
  const vendorId: VendorId = defaultVendor;

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
      // and the masters table shows the new format/rate/bit-depth. The
      // masters table + stale-specs banner are derived from album.songs,
      // which load under the album-detail key (["/api/albums", albumId]) —
      // NOT the admin-albums key — so that's the one that must refetch.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId] }),
        queryClient.invalidateQueries({
          queryKey: ["/api/admin/albums", albumId, "upload-validations"],
        }),
      ]);
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

  // Task #1530 — the "Go to Press" submit + status lives here now (the
  // old top-of-page Path-to-press strip is gone). Same endpoint + query
  // key the strip used, so an order submitted from either surface keeps
  // its status in sync. The submit is gated on `readyToSend` (every
  // section complete + preflight clean + masters on file).
  const { data: pressingOrder } = useQuery<{
    status?: string | null;
    rejectionNote?: string | null;
  } | null>({
    queryKey: ["/api/admin/albums", albumId, "pressing-order"],
  });
  const submitMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "POST",
        `/api/admin/albums/${albumId}/pressing-order`,
        {},
      );
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/albums", albumId, "pressing-order"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/pressing-orders"],
      });
      toast({
        title: "Order sent to GoodTunes.",
        description: "You'll see it switch to Approved once GoodTunes reviews it.",
      });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't submit",
        description: e?.message || "Try again.",
        variant: "destructive",
      });
    },
  });
  const orderStatus = pressingOrder?.status ?? null;

  return (
    <div className="py-6" data-testid="panel-press">
      <div>
        <MastersApprovalBanner albumId={albumId} />
        <GoToPressAction
          status={orderStatus}
          rejectionNote={pressingOrder?.rejectionNote ?? null}
          readyToSend={readyToSend}
          blockers={sendBlockers}
          isPending={submitMutation.isPending}
          onSubmit={() => submitMutation.mutate()}
        />
        {/* Task #533 — pool-funded early-cut ledger readout. */}
        <EarlyCutPoolReadout albumId={albumId} />
        {/* ── Masters on file ─────────────────────────────────────────── */}
        <div className="mb-10" data-testid="section-masters-on-file">
          {/* Task #583 / #618 — header is a flex row: title + subhead
              on the left, "Download all masters" pinned bottom-right
              so its bottom edge sits on the subhead's last-line
              baseline (title still sits at the top of its own
              column). The title block reserves right padding (pr-4 +
              max-w) so the subhead's wrap line never crowds the
              button. */}
          <div className="flex items-end justify-between gap-4 mb-4">
            <div className="min-w-0 flex-1 pr-4 max-w-[calc(100%-12rem)]">
              <h2 className="text-[15px] font-semibold text-slate-900 mb-1">Masters on file</h2>
              <p className="text-xs text-slate-500">
                Confirm what's uploaded for this album before preflighting it against a pressing
                plant. {sorted.length} track{sorted.length === 1 ? "" : "s"} · {withMaster.length} with
                master · {missing.length > 0 ? <span className="text-rose-700">{missing.length} missing</span> : "all present"} · {fmtBytes(totalBytes)} · {fmtDur(totalDur)}
              </p>
            </div>
            <button
              type="button"
              onClick={downloadAll}
              disabled={withMaster.length === 0}
              className="shrink-0 inline-flex items-center gap-2 px-3 h-9 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              data-testid="button-download-all-masters"
            >
              <Download className="w-3.5 h-3.5" />
              Download all masters
            </button>
          </div>

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
                      className="group border-t border-slate-100"
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
                            className="inline-flex items-center gap-1 text-[var(--brand-blue)] hover:underline opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 transition-opacity"
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

          {/* Task #583 — Side A / Side B cut-order block, lifted out of
              the Tracks tab so the artist sees what's uploaded AND how
              it'll be cut in one place. Hidden when no physical format
              is picked or the format is cassette (no sides to cut). */}
          {showVinylSides && sorted.length > 0 && (
            <div className="mt-6">
              <VinylOrderPanel
                albumId={albumId}
                songs={sorted.map((s) => ({
                  id: s.id,
                  title: s.title,
                  trackNumber: s.trackNumber,
                  duration: s.duration ?? 0,
                  vinylSide: s.vinylSide ?? null,
                  vinylOrder: s.vinylOrder ?? null,
                }))}
                vinylFormat={vinylFormat ?? null}
                physicalFormat={physicalFormat ?? null}
              />
            </div>
          )}
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

        {/* ── Single Press-tab vendor picker (Task #597) ──────────────
            Vendor is the only field lifted to the top of the tab —
            size / RPM / template / side vary per file and stay on
            their per-surface controls (runner, art template, replace
            inline). Default lands on the album's invited press when
            it matches a VENDOR_SPECS entry, otherwise the first
            non-hidden vendor. */}
        <div className="mb-10" data-testid="section-press-vendor-picker">
          <h2 className="text-base font-semibold text-slate-900 mb-1">Pressing plant</h2>
          <p className="text-xs text-slate-500 mb-4">
            Drives preflight checks, the art uploader, and the print-ready PDF generator
            below. Set on the artist&rsquo;s page — changes here automatically.
          </p>
          <div className="rounded-md border border-slate-200 bg-white p-4 flex items-center gap-3">
            <span className="text-sm font-medium text-slate-900" data-testid="press-vendor-label">
              {VENDOR_SPECS[vendorId]?.label ?? vendorId}
            </span>
            <span className="text-xs text-slate-400">
              {invitedPress?.press?.name ? "artist's plant" : "platform default"}
            </span>
          </div>
        </div>

        {/* ── Check masters against plant specs (Task #597) ──────────
            Merges the old "Run preflight on masters" runner with the
            "Audio preflight results" list — the runner sits on top
            and the per-track rows render directly below it. The
            clarifier reminds operators that upload-time probing
            already ran, so this step is the plant-spec check. */}
        <div className="mb-10" data-testid="section-check-masters">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-1">
            Check masters against plant specs
          </h2>
          <p className="text-[13px] text-slate-500 mb-4">
            Format, sample rate, and bit depth were captured when each master was uploaded —
            this step checks them against the picked plant's specs. Tracks with no master are
            listed as fail rows so the gap is loud. Re-run after swapping a master or
            changing the size / RPM. Failing rows offer an inline replace below.
          </p>
          <div className="rounded-md border border-slate-200 bg-white p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 max-w-md">
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

          <div className="mt-4">
            <UploadValidationsPanel
              albumId={albumId}
              kindFilter="audio"
              vendor={vendorId}
              defaultVinylSize={vinylSize}
              defaultRpm={rpm}
              hidePicker
              hideHeading
              onReprobeClick={staleSpecs.length > 0 ? scrollToReprobeBanner : undefined}
            />
          </div>
        </div>

        {/* ── Art preflight (file-picker path) ────────────────────────── */}
        <UploadValidationsPanel
          albumId={albumId}
          kindFilter="art"
          title="Art preflight"
          description="Drop a jacket / label / hype-sticker file to validate against the picked plant's print template before sending it to fulfillment."
          vendor={vendorId}
        />

        {/* ── Print-ready PDFs (Task #327, moved from Sell) ──────────── */}
        <PrintPdfsPanel albumId={albumId} vendor={vendorId} />
      </div>
    </div>
  );
}

// ── Artist-side approval banner ──────────────────────────────────────
// Renders at the top of the Press tab whenever the press has triggered
// masters but the artist hasn't yet approved the early-start cut. The
// approval gates the Pipeline `masters_triggered` stage transition
// (server stamps `mastersApprovedByArtistAt`). Hidden when the album
// isn't masters-triggered yet, and downgrades to a passive "approved"
// chip once stamped so super_admins can audit when approval landed.
function MastersApprovalBanner({ albumId }: { albumId: string }) {
  const { toast } = useToast();
  const { data } = useQuery<{
    mastersTriggeredAt: string | null;
    mastersApprovedByArtistAt: string | null;
    canApprove: boolean;
  }>({ queryKey: ["/api/albums", albumId, "masters/state"] });
  const approve = useMutation({
    mutationFn: () => apiRequest("POST", `/api/albums/${albumId}/masters/approve`),
    onSuccess: () => {
      toast({ title: "Approved", description: "The press can begin cutting the early-start masters." });
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "masters/state"] });
    },
    onError: (e: any) => toast({ title: "Approval failed", description: e?.message ?? "", variant: "destructive" }),
  });
  if (!data?.mastersTriggeredAt) return null;
  if (data.mastersApprovedByArtistAt) {
    return (
      <div className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-3" data-testid="banner-masters-approved">
        <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
        <div className="flex-1 text-xs text-emerald-900">
          <div className="font-semibold">Artist approved early-start cutting</div>
          <div className="text-emerald-800">Approved {new Date(data.mastersApprovedByArtistAt).toLocaleString()}.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-3 flex items-start gap-3" data-testid="banner-masters-pending-approval">
      <AlertTriangle className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
      <div className="flex-1 text-xs text-blue-900">
        <div className="font-semibold">Masters trigger pending artist approval</div>
        <div className="text-blue-800">
          The press hit the masters-prep threshold {new Date(data.mastersTriggeredAt).toLocaleDateString()} and is ready to start cutting early. Approving here advances the pipeline to <strong>Masters triggered</strong>.
        </div>
        {data.canApprove ? (
          <button
            type="button"
            onClick={() => approve.mutate()}
            disabled={approve.isPending}
            className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:brightness-110 disabled:opacity-60"
            data-testid="button-approve-masters"
          >{approve.isPending ? "Approving…" : "Approve early-start cutting"}</button>
        ) : (
          <div className="mt-2 italic text-blue-800/80">Only the album's artist (or a super-admin) can approve.</div>
        )}
      </div>
    </div>
  );
}
