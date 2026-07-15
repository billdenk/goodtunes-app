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
import { Download, Loader2, AlertTriangle, RefreshCcw, CheckCircle2, Check, X, AudioLines, Palette, Truck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { VENDOR_SPECS, HIDDEN_PREFLIGHT_VENDORS, resolveVendorIdForPress, isGenericVendor, defaultPreflightVendor, type VendorId } from "@shared/vendorSpecs";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { UploadValidationResult } from "@shared/uploadValidation";
import { UploadValidationsPanel } from "@/components/admin/UploadValidationsPanel";
import { CompletedTemplatePanel } from "@/components/admin/CompletedTemplatePanel";
import { PressTemplateDownloads, type PressTemplate } from "@/components/admin/PressTemplateDownloads";
import { PrintPdfsPanel } from "@/components/admin/PrintPdfsPanel";
import { FulfillmentAssignmentPanel } from "@/components/admin/FulfillmentAssignmentPanel";
import { VinylOrderPanel } from "@/components/admin/VinylOrderPanel";
import type { VinylFormat } from "@shared/vinylFormatRules";
import { PHYSICAL_FORMAT_TO_ALBUM_FORMAT } from "@shared/schema";
import type { AlbumPhysicalFormat, AlbumFormat } from "@shared/schema";

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

// Task #2705 follow-up — Bill: the legacy plant tooling under the Completed
// Art grid (Pressing plant readout, Check masters against plant specs + its
// re-probe banner, the file-picker Art preflight, and Print-ready PDFs) is
// HIDDEN on the Physical → Art tab. The Completed Art cards + per-card
// template downloads are the whole surface now. Code kept so flipping this
// back on restores everything (masters preflight also still runs from the
// View Masters dialog).
const SHOW_LEGACY_PLANT_TOOLING = false;

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

// Task #2701 — sub-tab split of the Physical tab. Audio is the default;
// the active sub-tab persists in the URL as `ptab` merged with the
// page's existing `?tab=` handling so refresh + deep links restore it.
type PhysicalSubTab = "audio" | "art" | "fulfillment";
const PHYSICAL_SUB_TABS: Array<{ id: PhysicalSubTab; label: string; Icon: typeof AudioLines }> = [
  { id: "audio", label: "Audio", Icon: AudioLines },
  { id: "art", label: "Art", Icon: Palette },
  { id: "fulfillment", label: "Fulfillment", Icon: Truck },
];
function readSubTabFromUrl(): PhysicalSubTab {
  const v = new URLSearchParams(window.location.search).get("ptab");
  return v === "art" || v === "fulfillment" ? v : "audio";
}

export function PressPanel({
  albumId,
  albumTitle,
  songs,
  physicalFormat,
  vinylFormat,
  vinylSideCatalogNumbers,
  readyToSend = false,
  sendBlockers = [],
  pressMode = false,
  hideEntityLinks = false,
  canManageFulfillment = false,
  fulfillmentPartnerId = null,
  fulfillmentManufacturerId = null,
  fulfillmentDestinationId = null,
  shipperDisplayName = null,
}: {
  albumId: string;
  albumTitle?: string;
  songs: PressPanelSong[];
  // Task #583 — Sell-panel physical-format pick drives whether the Side
  // A / Side B cut block renders inside Masters on file (cassette + no
  // physical format hide the block; the rest of the panel stays).
  physicalFormat?: AlbumPhysicalFormat | null;
  vinylFormat?: VinylFormat | null;
  // Task #2583 — per-side catalog number overrides, forwarded to VinylOrderPanel.
  vinylSideCatalogNumbers?: Record<string, string> | null;
  // Task #1530 — completeness gating for the relocated Go-to-Press
  // affordance. `readyToSend` is true only when every section reads
  // complete + preflight is clean + masters are on file; `sendBlockers`
  // are the human phrases naming what's still outstanding (shown as a
  // quiet helper note while the submit is disabled).
  readyToSend?: boolean;
  sendBlockers?: string[];
  // Task #2320 — true when a press (manufacturer role) is viewing this
  // tab in their own portal (vs an operator in God-view). When the
  // album resolves to the synthetic "generic" spec, the press sees a
  // dedicated note + a CTA to send GoodTunes their plant's exact specs
  // instead of just the terse operator badge.
  pressMode?: boolean;
  // Task #2578 — true when an artist partner (not an operator or the
  // press itself) is viewing this tab. Hides the "Change/Assign a plant"
  // deep-links to /admin/people|labels/:id — those pages are operator-only
  // and the artist can't reach them, so the link would just dead-end.
  hideEntityLinks?: boolean;
  // Task #2703 — Fulfillment sub-tab. Only presses + super admins manage
  // destinations and see the custom-company contact card (the server
  // returns [] destinations for everyone else). Artists get a quiet
  // display-identity-only card instead.
  canManageFulfillment?: boolean;
  fulfillmentPartnerId?: string | null;
  fulfillmentManufacturerId?: string | null;
  fulfillmentDestinationId?: string | null;
  shipperDisplayName?: string | null;
}) {
  const showVinylSides =
    !!physicalFormat && physicalFormat !== "cassette" && physicalFormat !== "cd";
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
  const { data: invitedPress } = useQuery<{
    press: { name: string | null; logoUrl?: string | null } | null;
    // Task #1837 — effective plant from saved SKUs when no invited-by-press stamp.
    effectivePress?: { id: string; name: string; logoUrl?: string | null } | null;
    // Origin of the resolved plant: "invited" = invitedByPressId explicitly set
    // on the artist/label; "artist_default" / "label_default" = homed via
    // default_press_id; "sku_derived" = derived from this album's vinyl SKUs.
    effectivePressSource?: "invited" | "artist_default" | "label_default" | "sku_derived" | null;
    // Scope (artist or label) for the "change plant" deep-link.
    scopeKind?: "artist" | "label" | null;
    scopeId?: string | null;
    // Task #2115 — the invited press's uploaded print templates, offered
    // here as operator-facing downloads in the Physical tab.
    templates?: PressTemplate[];
  }>({
    queryKey: ["/api/admin/albums", albumId, "invited-press"],
  });
  // Task #1311 — Physical tab derives its plant from the SAME resolver as
  // the Sell panel: invited press → matchInvitedPressToVendor → defaultPreflightVendor().
  // No per-album override exists; setting the artist's plant on the People page
  // is the single authoritative control. `HIDDEN_PREFLIGHT_VENDORS` still governs
  // which vendors appear in generic contexts, but a deliberate artist stamp is
  // always honored even when the vendor is in that set.
  // Task #1837 — also try matching against the effective press (chosen per-SKU)
  // when no artist/label stamp exists, so the Physical tab stays consistent
  // with what the Sell panel's Printer row shows to partner roles.
  // Task #2309 — use resolveVendorIdForPress (never returns null): unknown
  // presses map to "generic" so preflight never silently defaults to MRP.
  const resolvedPressName: string | undefined = useMemo(
    () => invitedPress?.press?.name ?? invitedPress?.effectivePress?.name ?? undefined,
    [invitedPress],
  );
  const defaultVendor: VendorId = useMemo(
    () => resolveVendorIdForPress(resolvedPressName),
    [resolvedPressName],
  );
  const vendorId: VendorId = defaultVendor;

  // Derive the plant origin category for the "Pressing plant" section's
  // description + link. "explicit" = set on the artist/label via invitedByPressId
  // or default_press_id. "sku_derived" = unambiguously derived from this album's
  // vinyl SKUs (no artist/label plant set). "default" = nothing points anywhere.
  const pressOrigin: "explicit" | "sku_derived" | "default" = useMemo(() => {
    const src = invitedPress?.effectivePressSource;
    if (src === "invited" || src === "artist_default" || src === "label_default") return "explicit";
    if (src === "sku_derived") return "sku_derived";
    return "default";
  }, [invitedPress]);

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
        ...(resolvedPressName ? { pressName: resolvedPressName } : {}),
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

  // Task #2701 — the "Send the order to GoodTunes" card (all states) is
  // hidden for now. UI-only: the submit endpoint + pressing-order flow
  // stay intact server-side, and `readyToSend` / `sendBlockers` keep
  // arriving from AdminAlbum so re-enabling is a render change.
  void readyToSend;
  void sendBlockers;

  // Task #2701 — Audio | Art | Fulfillment sub-tabs, persisted in the
  // URL as `ptab` merged with the page's existing query params (never
  // clobbers `?tab=`).
  const [subTab, setSubTabState] = useState<PhysicalSubTab>(() => readSubTabFromUrl());
  function setSubTab(t: PhysicalSubTab) {
    setSubTabState(t);
    const params = new URLSearchParams(window.location.search);
    if (t === "audio") params.delete("ptab");
    else params.set("ptab", t);
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
    );
  }

  // Task #2701 — audio-preflight rollup for the Side Breaks header chip
  // and the per-track chips inside the View Masters dialog. Same query
  // key UploadValidationsPanel uses, so a run from either surface
  // refreshes both.
  const { data: validationRows } = useQuery<UploadValidationResult[]>({
    queryKey: ["/api/admin/albums", albumId, "upload-validations"],
  });
  const audioRows = useMemo(
    () => (validationRows ?? []).filter((r) => r.kind === "audio"),
    [validationRows],
  );
  const preflightState: "pass" | "fail" | "none" =
    audioRows.length === 0
      ? "none"
      : audioRows.some((r) => r.status === "fail" && !r.override)
        ? "fail"
        : "pass";
  function rowForSong(s: PressPanelSong): UploadValidationResult | undefined {
    const padded = String(s.trackNumber ?? 0).padStart(2, "0");
    return audioRows.find((r) => (r.fileName ?? "").startsWith(`${padded} `));
  }
  const [mastersOpen, setMastersOpen] = useState(false);

  // Task #2701 — right-aligned "Press:" readout on the sub-tab row.
  const pressReadoutName =
    resolvedPressName ?? VENDOR_SPECS[vendorId]?.label ?? vendorId;
  const pressLogoUrl =
    invitedPress?.press?.logoUrl ?? invitedPress?.effectivePress?.logoUrl ?? null;

  const preflightChip =
    preflightState === "pass" ? (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200"
        data-testid="chip-audio-preflight"
      >
        <Check className="w-3 h-3" /> Pass
      </span>
    ) : preflightState === "fail" ? (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full border bg-rose-50 text-rose-700 border-rose-200"
        data-testid="chip-audio-preflight"
      >
        <X className="w-3 h-3" /> Fail
      </span>
    ) : (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full border bg-slate-50 text-slate-500 border-slate-200"
        data-testid="chip-audio-preflight"
      >
        Not checked
      </span>
    );

  return (
    <div className="py-6" data-testid="panel-press">
      <div>
        <MastersApprovalBanner albumId={albumId} />
        {/* Task #533 — pool-funded early-cut ledger readout. */}
        <EarlyCutPoolReadout albumId={albumId} />

        {/* ── Audio | Art | Fulfillment sub-tabs (Task #2701) ─────────
            Quiet text tabs with small leading icons; the "Press:"
            readout (name + round logo avatar) sits far right on the
            same line. */}
        <div
          className="flex items-center justify-between gap-4 mb-8 border-b border-slate-200 pb-2"
          data-testid="press-subtabs"
        >
          <div className="flex items-center gap-5">
            {PHYSICAL_SUB_TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSubTab(id)}
                className={[
                  "inline-flex items-center gap-1.5 text-[13px] py-1",
                  subTab === id
                    ? "font-semibold text-slate-900"
                    : "font-medium text-slate-500 hover:text-slate-700",
                ].join(" ")}
                data-testid={`subtab-${id}`}
              >
                <Icon className={`w-3.5 h-3.5 ${subTab === id ? "text-slate-700" : "text-slate-400"}`} />
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 min-w-0" data-testid="press-readout">
            <span className="text-[12.5px] text-slate-400 shrink-0">Press:</span>
            <span className="text-[12.5px] font-semibold text-slate-900 truncate" data-testid="text-press-readout-name">
              {pressReadoutName}
            </span>
            {pressLogoUrl && (
              <img
                src={pressLogoUrl}
                alt=""
                className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0"
                data-testid="img-press-readout-logo"
              />
            )}
          </div>
        </div>

        {/* ── AUDIO sub-tab ──────────────────────────────────────────── */}
        {subTab === "audio" && (
          <div data-testid="press-subtab-audio">
            <div className="mb-10" data-testid="section-side-breaks">
              <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
                <h2 className="text-[15px] font-semibold text-slate-900">Side Breaks</h2>
                <div className="flex items-center gap-2">
                  {preflightChip}
                  <button
                    type="button"
                    onClick={() => setMastersOpen(true)}
                    className="shrink-0 inline-flex items-center gap-2 px-3 h-9 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    data-testid="button-view-masters"
                  >
                    View Masters
                  </button>
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
              </div>
              {showVinylSides && sorted.length > 0 ? (
                <VinylOrderPanel
                  albumId={albumId}
                  albumTitle={albumTitle}
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
                  vinylSideCatalogNumbers={vinylSideCatalogNumbers ?? null}
                />
              ) : (
                <p className="text-xs text-slate-500" data-testid="text-no-side-breaks">
                  {sorted.length === 0
                    ? "No tracks on this album yet — add tracks on the Tracks tab to plan side breaks."
                    : "This album's physical format has no sides to cut — side breaks apply to vinyl formats."}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── ART sub-tab (moved as-is, Task #2701) ──────────────────── */}
        {subTab === "art" && (
        <div data-testid="press-subtab-art">
        {/* ── Re-probe banner (Task #337) ─────────────────────────────
            Shown when any uploaded master is missing format / sample-
            rate / bit-depth on the songs row. Kicks the existing per-
            song probe pipeline for just those tracks, then auto-
            re-runs preflight so the warn rows clear. */}
        {SHOW_LEGACY_PLANT_TOOLING && staleSpecs.length > 0 && (
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

        {/* ── Completed Art card grid (Task #2705) ────────────────────
            Leads the Art tab per Bill's mockup: download the templates,
            drop the finished art on the cards, and the system validates
            each file. The legacy plant tooling below (vendor readout,
            master checks, art preflight, print PDFs) is hidden behind
            SHOW_LEGACY_PLANT_TOOLING per Bill. */}
        <CompletedTemplatePanel albumId={albumId} vendor={vendorId} canOperate={!pressMode} />

        {/* ── Single Press-tab vendor picker (Task #597) ──────────────
            Vendor is the only field lifted to the top of the tab —
            size / RPM / template / side vary per file and stay on
            their per-surface controls (runner, art template, replace
            inline). Default lands on the album's invited press when
            it matches a VENDOR_SPECS entry, otherwise the first
            non-hidden vendor. */}
        {SHOW_LEGACY_PLANT_TOOLING && (
        <div className="mb-10" data-testid="section-press-vendor-picker">
          <h2 className="text-base font-semibold text-slate-900 mb-1">Pressing plant</h2>
          <p className="text-xs text-slate-500 mb-4">
            Drives preflight checks, the art uploader, and the print-ready PDF generator below.{" "}
            {pressOrigin === "explicit" ? (
              <>
                Set on the {invitedPress?.scopeKind === "label" ? "label" : "artist"}&rsquo;s page.
                {invitedPress?.scopeKind && invitedPress.scopeId && !pressMode && !hideEntityLinks && (
                  <>
                    {" "}
                    <a
                      href={`/admin/${invitedPress.scopeKind === "label" ? "labels" : "people"}/${invitedPress.scopeId}`}
                      className="text-[color:var(--brand-blue)] hover:underline"
                      data-testid="link-change-press-on-entity"
                    >
                      Change on the {invitedPress.scopeKind === "label" ? "label" : "artist"}&rsquo;s page &rarr;
                    </a>
                  </>
                )}
              </>
            ) : pressOrigin === "sku_derived" ? (
              <>
                No plant is assigned to the{" "}
                {invitedPress?.scopeKind === "label" ? "label" : "artist"} — resolving from this album&rsquo;s vinyl pricing.
                {invitedPress?.scopeId && !pressMode && !hideEntityLinks && (
                  <>
                    {" "}
                    <a
                      href={`/admin/${invitedPress?.scopeKind === "label" ? "labels" : "people"}/${invitedPress.scopeId}`}
                      className="text-[color:var(--brand-blue)] hover:underline"
                      data-testid="link-assign-press-on-entity"
                    >
                      Assign a plant on the {invitedPress?.scopeKind === "label" ? "label" : "artist"}&rsquo;s page &rarr;
                    </a>
                  </>
                )}
              </>
            ) : (
              <>
                No plant assigned — using platform defaults.
                {invitedPress?.scopeId && !pressMode && !hideEntityLinks && (
                  <>
                    {" "}
                    <a
                      href={`/admin/${invitedPress?.scopeKind === "label" ? "labels" : "people"}/${invitedPress.scopeId}`}
                      className="text-[color:var(--brand-blue)] hover:underline"
                      data-testid="link-assign-press-on-entity-default"
                    >
                      Assign a plant on the {invitedPress?.scopeKind === "label" ? "label" : "artist"}&rsquo;s page &rarr;
                    </a>
                  </>
                )}
              </>
            )}
          </p>
          <div className="rounded-md border border-slate-200 bg-white p-4 flex items-center gap-3">
            <span className="text-sm font-medium text-slate-900" data-testid="press-vendor-label">
              {resolvedPressName ?? VENDOR_SPECS[vendorId]?.label ?? vendorId}
            </span>
            <span className="text-xs text-slate-400" data-testid="badge-press-origin">
              {pressOrigin === "explicit"
                ? (invitedPress?.scopeKind === "label" ? "label's plant" : "artist's plant")
                : pressOrigin === "sku_derived"
                  ? "from vinyl pricing"
                  : "platform default"}
            </span>
            {isGenericVendor(vendorId) && resolvedPressName && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 ml-1 cursor-help"
                    data-testid="badge-generic-vendor"
                  >
                    Basic Spec
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs leading-relaxed">
                  GoodTunes doesn&rsquo;t have this plant&rsquo;s exact specs on file yet, so
                  files are checked against a general industry-standard vinyl spec
                  (300&nbsp;PPI art, CMYK/PMS, 24-bit WAV).
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {/* Task #2320 — when the press itself is viewing this tab and the
              album resolves to the generic spec, explain plainly that
              GoodTunes doesn't have their plant's exact specs yet, and offer a
              CTA to send them so preflight checks against their real
              requirements. Operators (God-view) don't see this note — the
              terse "Basic Spec" badge above is enough for them. */}
          {pressMode && isGenericVendor(vendorId) && (
            <div
              className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800"
              data-testid="note-press-basic-spec"
            >
              <p className="font-semibold text-amber-900">We&rsquo;re checking against a basic vinyl spec.</p>
              <p className="mt-1">
                GoodTunes doesn&rsquo;t have {resolvedPressName ?? "your plant"}&rsquo;s exact
                specs on file yet, so preflight checks these files against a general
                industry-standard vinyl spec rather than your own. Send us your art and
                audio requirements and we&rsquo;ll check every release against your exact specs.
              </p>
              <a
                href="mailto:support@goodtunes.music?subject=Add%20our%20pressing%20plant%20specs"
                className="mt-2 inline-block font-semibold text-amber-900 underline underline-offset-2"
                data-testid="link-contact-goodtunes-specs"
              >
                Contact GoodTunes to add your specs
              </a>
            </div>
          )}
        </div>
        )}

        {/* ── Check masters against plant specs (Task #597) ──────────
            Merges the old "Run preflight on masters" runner with the
            "Audio preflight results" list — the runner sits on top
            and the per-track rows render directly below it. The
            clarifier reminds operators that upload-time probing
            already ran, so this step is the plant-spec check. */}
        {SHOW_LEGACY_PLANT_TOOLING && (
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
              pressName={resolvedPressName}
              defaultVinylSize={vinylSize}
              defaultRpm={rpm}
              hidePicker
              hideHeading
              onReprobeClick={staleSpecs.length > 0 ? scrollToReprobeBanner : undefined}
            />
          </div>
        </div>
        )}

        {/* ── Art preflight (file-picker path) ────────────────────────── */}
        {SHOW_LEGACY_PLANT_TOOLING && (
        <UploadValidationsPanel
          albumId={albumId}
          kindFilter="art"
          title="Art preflight"
          description="Drop a jacket / label / hype-sticker file to validate against the picked plant's print template before sending it to fulfillment."
          vendor={vendorId}
          pressName={resolvedPressName}
        />
        )}

        {/* ── Print-ready PDFs (Task #327, moved from Sell) ──────────── */}
        {SHOW_LEGACY_PLANT_TOOLING && (
        <PrintPdfsPanel albumId={albumId} vendor={vendorId} pressName={resolvedPressName} />
        )}

        {/* ── Press print templates (Task #2115; press-portal-only since
            Task #2725 — operators/artists work from the Completed Art
            cards' per-card template links instead; the Package tab keeps
            its own copy). ─────────────────────────────────────────────── */}
        {pressMode && (() => {
          const albumFormat: AlbumFormat | null = physicalFormat
            ? PHYSICAL_FORMAT_TO_ALBUM_FORMAT[
                physicalFormat as keyof typeof PHYSICAL_FORMAT_TO_ALBUM_FORMAT
              ] ?? null
            : null;
          if (!albumFormat) return null;
          return (
            <PressTemplateDownloads
              templates={invitedPress?.templates}
              format={albumFormat}
              pressName={invitedPress?.press?.name}
              className="rounded-lg border border-slate-200 bg-slate-50 p-4"
            />
          );
        })()}
        </div>
        )}

        {/* ── FULFILLMENT sub-tab (Task #2703) ───────────────────────── */}
        {subTab === "fulfillment" && canManageFulfillment && (
          <div data-testid="press-subtab-fulfillment">
            <FulfillmentAssignmentPanel
              albumId={albumId}
              fulfillmentPartnerId={fulfillmentPartnerId}
              fulfillmentManufacturerId={fulfillmentManufacturerId}
              fulfillmentDestinationId={fulfillmentDestinationId}
              shipperDisplayName={shipperDisplayName}
            />
          </div>
        )}
        {subTab === "fulfillment" && !canManageFulfillment && (
          <div
            className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center"
            data-testid="press-subtab-fulfillment"
          >
            <Truck className="w-6 h-6 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">
              Shipping shows to customers as{" "}
              <span className="font-semibold">{shipperDisplayName?.trim() || "GoodTunes"}</span>.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Fulfillment routing for this release is handled by GoodTunes and the press.
            </p>
          </div>
        )}

        {/* ── View Masters dialog (Task #2701) ─────────────────────────
            The old Masters-on-file table, tucked behind the Side Breaks
            header. Adds a per-track preflight chip column and hosts the
            preflight runner (size / RPM move in here); results refresh
            both the chips here and the header chip. */}
        <Dialog open={mastersOpen} onOpenChange={setMastersOpen}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto" data-testid="dialog-view-masters">
            <DialogHeader>
              <DialogTitle>Masters on file</DialogTitle>
              <DialogDescription>
                {sorted.length} track{sorted.length === 1 ? "" : "s"} · {withMaster.length} with
                master · {missing.length > 0 ? `${missing.length} missing` : "all present"} · {fmtBytes(totalBytes)} · {fmtDur(totalDur)}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-end gap-3" data-testid="dialog-preflight-runner">
              <label className="text-[12px] text-slate-600">
                Size
                <select
                  value={vinylSize}
                  onChange={(e) => setVinylSize(e.target.value as any)}
                  className="mt-1 block w-28 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px]"
                  data-testid="select-dialog-size"
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
                  className="mt-1 block w-24 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px]"
                  data-testid="select-dialog-rpm"
                >
                  <option value={33}>33</option>
                  <option value={45}>45</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => runOnFile.mutate()}
                disabled={runOnFile.isPending}
                className="inline-flex items-center gap-2 px-3 h-9 rounded-md bg-[var(--brand-blue)] text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-50"
                data-testid="button-dialog-run-preflight"
              >
                {runOnFile.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {runOnFile.isPending
                  ? "Validating masters…"
                  : `Run preflight on ${withMaster.length} master${withMaster.length === 1 ? "" : "s"}`}
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
                    <th className="px-3 py-2 text-left">Preflight</th>
                    <th className="px-3 py-2 text-right">File</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s, i) => {
                    const present = !!s.audioUrl;
                    const vRow = rowForSong(s);
                    return (
                      <tr
                        key={s.id}
                        className="group border-t border-slate-100"
                        data-testid={`row-master-${s.id}`}
                      >
                        <td className="px-3 py-2 text-slate-500 font-mono tabular-nums">
                          {String(i + 1).padStart(2, "0")}
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
                        <td className="px-3 py-2" data-testid={`chip-track-preflight-${s.id}`}>
                          {vRow ? (
                            vRow.status === "fail" && !vRow.override ? (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200">
                                <X className="w-2.5 h-2.5" /> Fail
                              </span>
                            ) : vRow.status === "warn" ? (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                                <AlertTriangle className="w-2.5 h-2.5" /> Warn
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                                <Check className="w-2.5 h-2.5" /> {vRow.override ? "Override" : "Pass"}
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
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
                      <td colSpan={8} className="px-3 py-6 text-center text-slate-500 italic">
                        No tracks on this album yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>
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
