// PressTemplatesIndex — Surface 3 from the template-canon brief, ported into
// the real press portal. The BODY only: the mock's PressShell (left nav, top
// bar, avatar, mock theme toggle) is dropped — this renders INSIDE
// OperatorShell. Theme mode comes from useAdminDark() (dark = gt-admin-dark).
// The THEMES color maps + tile / pill / modal styling are copied
// handoff-verbatim from handoff/press-templates/PressTemplatesIndex.tsx and
// PressTemplatesUpload.tsx.
//
// Live data replaces the MOCK_ consts: GET /api/press/:id/templates supplies
// every slot row with revision history + latest runs. Each Ruby SLOT_SET tile
// is matched to a DB spec row by (format, componentKey, variantKey). Slots
// with no DB format yet (Stickers, flexi-disc) render disabled with
// a "Not offered yet" note — no fabricated data.
//
// Status is icon + word (Bill is colorblind — never color alone) via
// slotStatus() from "./types".

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  BadgeCheck, Clock3, XCircle, AlertTriangle, History, Upload, CloudUpload, X,
  MoreHorizontal, Archive, Loader2, AlertCircle, Plus, Layers, Pencil, Trash2,
} from "lucide-react";
// Live-test flow (handoff, Aug 14 2026): the upload sheet stashes the chosen
// PDF in the transit store, then the tab routes to the Live test page.
import { pendingTemplateFile, freshLiveSave } from "./PressTemplateLiveTest";
import { ChevronDown as NavChevron } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAdminDark } from "@/lib/adminAppearance";
import { uploadAdminDoc, DOC_UPLOAD_ACCEPT } from "@/lib/adminUpload";
import {
  slotStatus,
  variantOptionsNote,
  type TemplatesPayload,
  type TemplateSpecWithHistory,
  type CustomTemplateSlot,
  type SlotStatus,
  type LiveTemplate,
} from "./types";

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ─── Themes — handoff-verbatim (light = apple-canon, dark = canon charcoal) ──
type Theme = {
  blue: string;
  ink: string;
  subink: string;
  faint: string;
  hairline: string;
  canvas: string;
  card: string;
  cardSoft: string;
  pillActive: string;
  pillShadow: string;
  segShadow: string;
  tileHover: string;
  dashedBorder: string;
  ready: string;
  crit: string;
  warn: string;
  iconFill: string;
  hoverWash: string;
  searchPlaceholder: string;
  popShadow: string;
  modalScrim: string;
  modalShadow: string;
  overlayBtn: string;
  logoRing: string;
};

const THEMES: Record<"light" | "dark", Theme> = {
  light: {
    blue: "#319ED8",
    ink: "#1d1d1f",
    subink: "#6e6e73",
    faint: "#a1a1a6",
    hairline: "#e6e6ea",
    canvas: "#f5f5f7",
    card: "#ffffff",
    cardSoft: "#f0f0f2",
    pillActive: "#ffffff",
    pillShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)",
    segShadow: "0 1px 3px rgba(0,0,0,0.08)",
    tileHover: "hover:bg-black/[0.02]",
    dashedBorder: "rgba(0,0,0,0.18)",
    ready: "#1c8a5b",
    crit: "#e0245e",
    warn: "#c98a00",
    iconFill: "#ffffff",
    hoverWash: "hover:bg-black/5",
    searchPlaceholder: "placeholder:text-black/30",
    popShadow: "0 12px 40px rgba(0,0,0,0.16)",
    modalScrim: "rgba(0,0,0,0.42)",
    modalShadow: "0 24px 80px rgba(0,0,0,0.24)",
    overlayBtn: "rgba(0,0,0,0.06)",
    logoRing: "#e6e6ea",
  },
  dark: {
    blue: "#319ED8",
    ink: "#f5f5f7",
    subink: "#98989d",
    faint: "#6e6e73",
    hairline: "rgba(255,255,255,0.10)",
    canvas: "#161617",
    card: "#1e1e20",
    cardSoft: "#26262a",
    pillActive: "#3a3a3e",
    pillShadow: "0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)",
    segShadow: "0 1px 3px rgba(0,0,0,0.4)",
    tileHover: "hover:bg-white/[0.03]",
    dashedBorder: "rgba(255,255,255,0.22)",
    ready: "#34c98e",
    crit: "#ff5d8f",
    warn: "#e8b34b",
    iconFill: "#1e1e20",
    hoverWash: "hover:bg-white/5",
    searchPlaceholder: "placeholder:text-white/30",
    popShadow: "0 12px 40px rgba(0,0,0,0.5)",
    modalScrim: "rgba(0,0,0,0.55)",
    modalShadow: "0 24px 80px rgba(0,0,0,0.55)",
    overlayBtn: "rgba(255,255,255,0.10)",
    logoRing: "rgba(255,255,255,0.10)",
  },
};

// ─── Status chip — icon + word, color supportive only (Bill is colorblind) ──
const STATUS_META: Record<
  SlotStatus,
  { label: string; tone: "ready" | "warn" | "crit"; Icon: typeof BadgeCheck }
> = {
  certified: { label: "Certified", tone: "ready", Icon: BadgeCheck },
  pending: { label: "Pending", tone: "warn", Icon: Clock3 },
  failed: { label: "Failed", tone: "crit", Icon: XCircle },
  // Auto-imported legacy upload the importer couldn't confidently match to
  // this slot — press confirms by re-attaching or archives it.
  review: { label: "Needs review", tone: "warn", Icon: AlertTriangle },
  // "empty" never reaches StatusChip (the empty tile renders its own affordance).
  empty: { label: "Empty", tone: "warn", Icon: Clock3 },
};

function StatusChip({ status, t }: { status: SlotStatus; t: Theme }) {
  const { label, tone, Icon } = STATUS_META[status];
  const color = tone === "ready" ? t.ready : tone === "crit" ? t.crit : t.warn;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12px] font-medium"
      style={{ color }}
      data-testid={`status-${status}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

// ─── Component icons — blueprint die-line canon (handoff-verbatim) ──
type IconKind = "jacket" | "sleeve" | "labels" | "booklet";

function ComponentIcon({
  kind,
  color,
  fill,
  size = 44,
}: {
  kind: IconKind;
  color: string;
  fill: string;
  size?: number;
}) {
  const s: React.SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: "0 0 26 26",
    fill: "none",
    stroke: color,
    strokeWidth: 0.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  switch (kind) {
    case "jacket":
      return (
        <svg {...s} aria-hidden>
          <circle cx="17.5" cy="13" r="6.5" strokeDasharray="2 2.2" opacity={0.7} />
          <circle cx="17.5" cy="13" r="1.4" strokeDasharray="1.2 1.6" opacity={0.7} />
          <rect x="3" y="4" width="18" height="18" rx="1.2" fill={fill} />
        </svg>
      );
    case "labels":
      return (
        <svg {...s} aria-hidden>
          <circle cx="13" cy="13" r="11" strokeDasharray="2 2.2" opacity={0.7} />
          <circle cx="13" cy="13" r="6.5" fill={fill} />
          <circle cx="13" cy="13" r="1.3" />
          <path d="M9.6 10.4a4.6 4.6 0 0 1 6.8 0" opacity={0.6} />
        </svg>
      );
    case "sleeve":
      return (
        <svg {...s} aria-hidden>
          <rect x="9" y="5.5" width="15" height="15" rx="1" fill={fill} />
          <rect x="2" y="5" width="16" height="16" rx="1.2" strokeDasharray="2 2.2" opacity={0.7} fill={fill} />
        </svg>
      );
    case "booklet":
      return (
        <svg {...s} aria-hidden>
          <rect x="4" y="4.5" width="18" height="17" rx="1.2" fill={fill} />
          <path d="M13 4.5v17" strokeDasharray="2 2.2" opacity={0.7} />
          <path d="M7 9.5h3.5M7 12.5h3.5M7 15.5h2.5M15.5 9.5h3.5M15.5 12.5h3.5" opacity={0.7} />
        </svg>
      );
  }
}

// ─── Slot vocabulary — Ruby SLOT_SETS mapped to DB coords ──
// dbFormat/componentKey/variantKey are the (format, componentKey, variantKey)
// used to match a spec row. `disabled` slots have no DB format yet (flexi-disc,
// Stickers) and render greyed with a "Not offered yet" note.
type Slot = {
  kind: IconKind;
  title: string;
  note: string;
  dbFormat?: string;
  componentKey?: string;
  variantKey?: string;
  discCount?: number;
  disabled?: boolean;
  // Task #3066 — set on operator-created slots; enables rename / remove.
  customSlot?: CustomTemplateSlot;
};

// Vinyl size → slot list. 7″ = 7_inch, 10″ = 10_inch (template canon only —
// not sellable), 12″ = 12_lp (12_double rows shown when present).
const VINYL_SLOTS: Record<"7″" | "10″" | "12″", Slot[]> = {
  "7″": [
    { kind: "labels", title: "Center labels", note: "Small or large hole", dbFormat: "7_inch", componentKey: "labels" },
    { kind: "jacket", title: "Single jacket — no spine", note: "Outer sleeve", dbFormat: "7_inch", componentKey: "jacket", variantKey: "single" },
    { kind: "jacket", title: "Single jacket — 3 mm spine", note: "Outer sleeve", dbFormat: "7_inch", componentKey: "jacket", variantKey: "widespine" },
    { kind: "jacket", title: "Gatefold jacket", note: "Opens flat", dbFormat: "7_inch", componentKey: "jacket", variantKey: "gatefold" },
    { kind: "sleeve", title: "Inner sleeve", note: "Paper or board", dbFormat: "7_inch", componentKey: "inner_sleeve" },
    { kind: "labels", title: "Flexi disc label", note: "Not offered yet", disabled: true },
  ],
  "10″": [
    { kind: "labels", title: "Center labels", note: "Small or large hole", dbFormat: "10_inch", componentKey: "labels" },
    { kind: "jacket", title: "Single jacket", note: "Outer sleeve — no spine", dbFormat: "10_inch", componentKey: "jacket", variantKey: "single" },
    { kind: "jacket", title: "Widespine jacket", note: "Outer sleeve — wide spine", dbFormat: "10_inch", componentKey: "jacket", variantKey: "widespine" },
    { kind: "jacket", title: "Gatefold jacket", note: "Outer sleeve — opens flat", dbFormat: "10_inch", componentKey: "jacket", variantKey: "gatefold" },
    { kind: "sleeve", title: "Inner sleeve", note: "Paper", dbFormat: "10_inch", componentKey: "inner_sleeve" },
    { kind: "booklet", title: "Insert", note: "10 × 10 in · 2 pages", dbFormat: "10_inch", componentKey: "booklet" },
  ],
  "12″": [
    { kind: "labels", title: "Center labels", note: "Small or large hole", dbFormat: "12_lp", componentKey: "labels" },
    { kind: "jacket", title: "Single jacket", note: "Outer sleeve — no spine", dbFormat: "12_lp", componentKey: "jacket", variantKey: "single" },
    { kind: "jacket", title: "Widespine jacket", note: "Outer sleeve — wide spine", dbFormat: "12_lp", componentKey: "jacket", variantKey: "widespine" },
    { kind: "jacket", title: "Gatefold jacket", note: "Outer sleeve — opens flat", dbFormat: "12_lp", componentKey: "jacket", variantKey: "gatefold" },
    { kind: "sleeve", title: "Inner sleeve", note: "Paper", dbFormat: "12_lp", componentKey: "inner_sleeve" },
    { kind: "booklet", title: "Insert", note: "12 × 12 in · 2 pages", dbFormat: "12_lp", componentKey: "booklet" },
  ],
};

// Non-vinyl formats. Stickers has no DB format → disabled. CD/Cassette map to
// the cd / cassette DB formats.
const FORMAT_SLOTS: Record<"CD" | "Cassette" | "Stickers", Slot[]> = {
  CD: [
    { kind: "labels", title: "Disc face", note: "On-body print", dbFormat: "cd", componentKey: "labels" },
    { kind: "booklet", title: "Booklet", note: "Front of the jewel case", dbFormat: "cd", componentKey: "booklet" },
    { kind: "sleeve", title: "Tray card", note: "Back inlay — spines included", dbFormat: "cd", componentKey: "inner_sleeve" },
    { kind: "jacket", title: "Card wallet", note: "Sleeve alternative to the jewel case", dbFormat: "cd", componentKey: "jacket", variantKey: "single" },
  ],
  Cassette: [
    { kind: "booklet", title: "J-card", note: "Folds into the Norelco case", dbFormat: "cassette", componentKey: "j_card" },
    { kind: "jacket", title: "O-card", note: "Wraps around the case", dbFormat: "cassette", componentKey: "o_card" },
    { kind: "labels", title: "Shell print", note: "On-body", dbFormat: "cassette", componentKey: "shell" },
    { kind: "labels", title: "Shell labels", note: "Stick-on — A & B sides", dbFormat: "cassette", componentKey: "sticker" },
  ],
  Stickers: [
    { kind: "labels", title: "Rectangle sticker", note: "Not offered yet", disabled: true },
    { kind: "labels", title: "Square sticker", note: "Not offered yet", disabled: true },
    { kind: "labels", title: "Circle sticker", note: "Not offered yet", disabled: true },
    { kind: "labels", title: "UPC sticker", note: "Not offered yet", disabled: true },
  ],
};

// Match a slot to its live spec row: exact (format, componentKey, variantKey).
// Non-jacket rows carry an empty variantKey server-side; a slot with no
// variantKey matches any row of the right component.
function matchSpec(
  specs: TemplateSpecWithHistory[],
  slot: Slot,
): TemplateSpecWithHistory | undefined {
  if (!slot.dbFormat || !slot.componentKey) return undefined;
  return specs.find(
    (s) =>
      s.format === slot.dbFormat &&
      s.componentKey === slot.componentKey &&
      (slot.variantKey === undefined || (s.variantKey ?? "") === slot.variantKey),
  );
}

// ─── Upload / replace modal ──
type ModalState = {
  slot: Slot;
  spec?: TemplateSpecWithHistory; // set when replacing an existing tile
};

function UploadModal({
  t,
  pressId,
  state,
  onClose,
  onDone,
}: {
  t: Theme;
  pressId: string;
  state: ModalState;
  onClose: () => void;
  onDone: (specId: string) => void;
}) {
  const { toast } = useToast();
  const { slot, spec } = state;
  const [fileSource, setFileSource] = useState<"Upload file" | "Paste a URL">("Upload file");
  const [fileUrl, setFileUrl] = useState<string | null>(spec?.templateFileUrl ?? null);
  const [fileName, setFileName] = useState<string>(spec?.templateFileName ?? "");
  const [urlDraft, setUrlDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  // Task #3065 — the attach response can carry detected options (one file
  // drawing e.g. both center-hole sizes). The modal swaps to a confirm step;
  // nothing is stamped unless the operator says yes.
  const [detected, setDetected] = useState<{ specId: string; options: Array<{ key: string; label: string }> } | null>(null);

  const attach = useMutation({
    mutationFn: async (body: {
      format: string;
      componentKey: string;
      variantKey?: string;
      discCount?: number;
      fileUrl: string;
      fileName?: string | null;
    }) => {
      const r = await apiRequest("PUT", `/api/press/${pressId}/templates`, body);
      return (await r.json()) as {
        spec: TemplateSpecWithHistory;
        revision: unknown;
        detectedOptions?: Array<{ key: string; label: string }>;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/templates`] });
      if (data.detectedOptions && data.detectedOptions.length >= 2) {
        setDetected({ specId: data.spec.id, options: data.detectedOptions });
        return;
      }
      onDone(data.spec.id);
    },
    onError: (e: Error) =>
      toast({ title: "Couldn't attach the template", description: e.message, variant: "destructive" }),
  });

  const stampOptions = useMutation({
    mutationFn: async (p: { specId: string; options: Array<{ key: string; label: string }> }) => {
      await apiRequest("POST", `/api/press/${pressId}/templates/${p.specId}/options`, { options: p.options });
      return p.specId;
    },
    onSuccess: (specId) => {
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/templates`] });
      onDone(specId);
    },
    onError: (e: Error) =>
      toast({ title: "Couldn't save that", description: e.message, variant: "destructive" }),
  });

  const archive = useMutation({
    mutationFn: async () => {
      if (!spec) return;
      await apiRequest("POST", `/api/press/${pressId}/templates/${spec.id}/archive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/templates`] });
      onClose();
    },
    onError: (e: Error) =>
      toast({ title: "Couldn't archive the file", description: e.message, variant: "destructive" }),
  });

  const onPickFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadAdminDoc(file);
      setFileUrl(url);
      if (!fileName) setFileName(file.name);
    } catch (e: any) {
      toast({ title: "Couldn't upload the file", description: e?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    if (!slot.dbFormat || !slot.componentKey) return;
    const url = fileSource === "Paste a URL" ? urlDraft.trim() : fileUrl;
    if (!url) {
      toast({ title: "Add a file first", description: "Upload the file or paste an https:// link.", variant: "destructive" });
      return;
    }
    attach.mutate({
      format: slot.dbFormat,
      componentKey: slot.componentKey,
      variantKey: slot.variantKey,
      discCount: slot.discCount,
      fileUrl: url,
      fileName: fileName || null,
    });
  };

  const scanning = attach.isPending;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      style={{ backgroundColor: t.modalScrim, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      data-testid="modal-upload"
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{ width: 780, maxWidth: "92vw", backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.modalShadow }}
      >
        <div className="flex items-start justify-between gap-4 px-7 pt-6">
          <div>
            <h2 className="text-[19px] font-semibold" style={{ color: t.ink, letterSpacing: "-0.01em" }} data-testid="text-modal-title">
              {slot.title}
            </h2>
            <p className="mt-1 text-[12.5px]" style={{ color: t.subink }}>
              {detected ? "Template attached and measured." : spec ? "Replace the file — done." : "Drop the PDF — done."}
            </p>
          </div>
          <button
            type="button"
            className={cn("w-8 h-8 -mr-2 rounded-full flex items-center justify-center transition-colors flex-shrink-0", t.hoverWash)}
            style={{ color: t.subink }}
            aria-label="Close"
            onClick={onClose}
            data-testid="button-close-upload"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Task #3065 — detection confirm step: one file, multiple options */}
        {detected ? (
          <div className="px-7 pt-5 pb-7" data-testid="panel-detected-options">
            <div className="rounded-2xl px-5 py-5 flex items-start gap-3.5" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }}>
              <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
                <Layers className="w-4.5 h-4.5" style={{ color: t.blue, width: 18, height: 18 }} />
              </span>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold" style={{ color: t.ink }} data-testid="text-detected-title">
                  This template mentions {detected.options.length} options ({detected.options.map((o) => o.label).join(" / ")}).
                </div>
                <div className="mt-1 text-[12.5px]" style={{ color: t.subink }}>
                  Note that this one template serves both? It stays a single file and a single tile — the
                  note just tells everyone both options are covered here.
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => onDone(detected.specId)}
                disabled={stampOptions.isPending}
                className={cn("h-9 px-4 rounded-full text-[13px] font-medium transition-colors", t.hoverWash)}
                style={{ color: t.subink, border: `1px solid ${t.hairline}` }}
                data-testid="button-decline-options"
              >
                No — leave as is
              </button>
              <button
                type="button"
                onClick={() => stampOptions.mutate(detected)}
                disabled={stampOptions.isPending}
                className="h-9 px-5 rounded-full inline-flex items-center gap-2 text-[13px] font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: t.blue }}
                data-testid="button-confirm-options"
              >
                {stampOptions.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Yes — one template, both options
              </button>
            </div>
          </div>
        ) : (
        <div className="px-7 pt-5 pb-7 grid gap-6" style={{ gridTemplateColumns: "250px 1fr" }}>
          {/* Current file (only when replacing an existing tile) */}
          <div>
            <div className="h-7 flex items-center text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>
              {spec ? "Current file" : "New template"}
            </div>
            <div className="mt-2.5 aspect-square rounded-xl flex items-center justify-center relative" style={{ backgroundColor: t.cardSoft }} data-testid="preview-current-file">
              {spec && (
                <>
                  <button
                    type="button"
                    aria-label="File actions"
                    onClick={() => setFileMenuOpen((v) => !v)}
                    className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full inline-flex items-center justify-center hover:opacity-80 z-10"
                    style={{ backgroundColor: t.overlayBtn }}
                    data-testid="button-file-menu"
                  >
                    <MoreHorizontal className="w-4 h-4" style={{ color: t.ink }} />
                  </button>
                  {fileMenuOpen && (
                    <div
                      className="absolute z-20 rounded-xl py-1.5 text-left"
                      style={{ top: 44, right: 10, minWidth: 180, backgroundColor: t.card, boxShadow: t.popShadow, border: `1px solid ${t.hairline}` }}
                      data-testid="menu-file-actions"
                    >
                      <button
                        type="button"
                        className={cn("w-full flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] font-medium", t.hoverWash)}
                        style={{ color: t.ink }}
                        onClick={() => {
                          setFileMenuOpen(false);
                          setFileSource("Upload file");
                        }}
                        data-testid="button-replace-file-menu"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Replace file
                      </button>
                      <button
                        type="button"
                        className={cn("w-full flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] font-medium", t.hoverWash)}
                        style={{ color: t.ink }}
                        onClick={() => {
                          setFileMenuOpen(false);
                          if (window.confirm("Archive this file? The revision and any associations are kept — it can't be deleted.")) {
                            archive.mutate();
                          }
                        }}
                        data-testid="button-archive-file-menu"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        Archive file
                      </button>
                      <div className="px-3.5 pt-1.5 pb-1 text-[11px]" style={{ color: t.faint, borderTop: `1px solid ${t.hairline}`, marginTop: 4, maxWidth: 200 }} data-testid="text-archive-note">
                        This file has been used — it can be archived, never deleted.
                      </div>
                    </div>
                  )}
                </>
              )}
              <ComponentIcon kind={slot.kind} color={t.blue} fill={t.iconFill} size={64} />
            </div>
            <div className="mt-3 text-center">
              {spec?.templateFileName && (
                <div className="text-[12.5px] font-medium break-all" style={{ color: t.ink }}>{spec.templateFileName}</div>
              )}
              {spec?.measuredArtboardWInches != null && spec?.measuredArtboardHInches != null && (
                <div className="mt-0.5 text-[11.5px] tabular-nums" style={{ color: t.faint }}>
                  {spec.measuredArtboardWInches}″ × {spec.measuredArtboardHInches}″
                  {spec.measuredPages != null ? ` · ${spec.measuredPages} pages` : ""}
                </div>
              )}
            </div>
          </div>

          {/* Upload side */}
          <div className="flex flex-col">
            <div className="h-7 flex items-center justify-between gap-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>New file</div>
              <div className="inline-flex items-center rounded-full" style={{ padding: 3, backgroundColor: t.cardSoft }} role="tablist" aria-label="File source" data-testid="tabs-file-source">
                {(["Upload file", "Paste a URL"] as const).map((label) => {
                  const on = fileSource === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setFileSource(label)}
                      className="rounded-full transition-colors"
                      style={{
                        padding: "4px 14px",
                        fontSize: 12,
                        fontWeight: on ? 600 : 500,
                        color: on ? t.ink : t.faint,
                        backgroundColor: on ? t.pillActive : "transparent",
                        boxShadow: on ? t.pillShadow : "none",
                        cursor: "pointer",
                      }}
                      data-testid={`tab-source-${label === "Upload file" ? "upload" : "url"}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {fileSource === "Upload file" ? (
              <label
                className={cn("mt-2.5 w-full flex-1 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer", t.tileHover)}
                style={{ border: `1.5px dashed ${t.dashedBorder}`, padding: "20px", minHeight: 180 }}
                data-testid="button-upload-drop"
              >
                <input
                  type="file"
                  accept={DOC_UPLOAD_ACCEPT}
                  className="hidden"
                  disabled={uploading || scanning}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onPickFile(f);
                  }}
                  data-testid="input-upload-file"
                />
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: t.subink }} />
                    <span className="text-[13.5px] font-medium" style={{ color: t.ink }}>Uploading…</span>
                  </>
                ) : fileUrl ? (
                  <>
                    <CloudUpload className="w-5 h-5" style={{ color: t.ready }} />
                    <span className="text-[13.5px] font-medium break-all text-center" style={{ color: t.ink }}>{fileName || "File ready"}</span>
                    <span className="text-[12px]" style={{ color: t.faint }}>Click to pick a different file</span>
                  </>
                ) : (
                  <>
                    <CloudUpload className="w-5 h-5" style={{ color: t.subink }} />
                    <span className="text-[13.5px] font-medium" style={{ color: t.ink }}>Drag a file here, or click to pick</span>
                    <span className="text-[12px]" style={{ color: t.faint }}>Press-ready PDF · validated automatically</span>
                  </>
                )}
              </label>
            ) : (
              <div className="mt-2.5 w-full flex-1 rounded-2xl flex flex-col items-center justify-center gap-3" style={{ border: `1.5px dashed ${t.dashedBorder}`, padding: "20px 28px", minHeight: 180 }} data-testid="panel-paste-url">
                <div className="w-full flex items-center gap-2.5" style={{ maxWidth: 420 }}>
                  <input
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    placeholder="https://… Dropbox, Drive, WeTransfer"
                    className={cn("flex-1 h-9 px-3.5 rounded-full text-[12.5px] focus:outline-none", t.searchPlaceholder)}
                    style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}`, color: t.ink }}
                    data-testid="input-paste-url"
                  />
                </div>
                <span className="text-[12px]" style={{ color: t.faint }}>We fetch the PDF from the link · validated automatically</span>
              </div>
            )}

            {/* Optional file name */}
            <input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="File name (optional)"
              className={cn("mt-3 w-full h-9 px-3.5 rounded-full text-[12.5px] focus:outline-none", t.searchPlaceholder)}
              style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}`, color: t.ink }}
              data-testid="input-file-name"
            />

            {/* Submit + scanning spinner */}
            <div className="mt-4 flex items-center justify-end gap-3">
              {scanning && (
                <span className="inline-flex items-center gap-2 text-[12.5px]" style={{ color: t.subink }} data-testid="text-scanning">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Measuring the PDF… this can take ~30s
                </span>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={scanning || uploading}
                className="h-9 px-5 rounded-full inline-flex items-center gap-2 text-[13px] font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: t.blue }}
                data-testid="button-submit-template"
              >
                {spec ? "Replace template" : "Attach template"}
              </button>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

// ─── Task #3065 — "Create new template" dialog (custom slots) ──
// Task #3066 — doubles as the rename dialog when `editSlot` is set (display
// name / note only; the slot key + any attached spec stay put).
function CreateSlotModal({
  t,
  pressId,
  dbFormat,
  editSlot,
  onClose,
  onCreated,
}: {
  t: Theme;
  pressId: string;
  dbFormat: string;
  editSlot?: CustomTemplateSlot;
  onClose: () => void;
  onCreated: (slot: CustomTemplateSlot) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(editSlot?.displayName ?? "");
  const [note, setNote] = useState(editSlot?.note ?? "");

  const create = useMutation({
    mutationFn: async () => {
      const r = editSlot
        ? await apiRequest("PATCH", `/api/press/${pressId}/templates/custom-slots/${editSlot.id}`, {
            name: name.trim(),
            note: note.trim(),
          })
        : await apiRequest("POST", `/api/press/${pressId}/templates/custom-slots`, {
            format: dbFormat,
            name: name.trim(),
            note: note.trim() || undefined,
          });
      return (await r.json()) as { slot: CustomTemplateSlot };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/templates`] });
      onCreated(data.slot);
    },
    onError: (e: Error) =>
      toast({
        title: editSlot ? "Couldn't rename the template" : "Couldn't create the template",
        description: e.message.replace(/^\d{3}:\s*/, ""),
        variant: "destructive",
      }),
  });

  const canSubmit = name.trim().length >= 2 && !create.isPending;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      style={{ backgroundColor: t.modalScrim, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      data-testid="modal-create-slot"
    >
      <div className="rounded-2xl overflow-hidden" style={{ width: 460, maxWidth: "92vw", backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.modalShadow }}>
        <div className="flex items-start justify-between gap-4 px-7 pt-6">
          <div>
            <h2 className="text-[19px] font-semibold" style={{ color: t.ink, letterSpacing: "-0.01em" }}>
              {editSlot ? "Rename template" : "Create new template"}
            </h2>
            <p className="mt-1 text-[12.5px]" style={{ color: t.subink }}>
              {editSlot
                ? "The name and note change — any attached file and its history stay put."
                : "Name it — the upload and checks work exactly like the built-in tiles."}
            </p>
          </div>
          <button
            type="button"
            className={cn("w-8 h-8 -mr-2 rounded-full flex items-center justify-center transition-colors flex-shrink-0", t.hoverWash)}
            style={{ color: t.subink }}
            aria-label="Close"
            onClick={onClose}
            data-testid="button-close-create-slot"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-7 pt-5 pb-7">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && create.mutate()}
            placeholder="Template name — e.g. Hype sticker"
            autoFocus
            maxLength={64}
            className={cn("w-full h-10 px-4 rounded-full text-[13px] focus:outline-none", t.searchPlaceholder)}
            style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}`, color: t.ink }}
            data-testid="input-slot-name"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Short note (optional)"
            maxLength={140}
            className={cn("mt-3 w-full h-10 px-4 rounded-full text-[13px] focus:outline-none", t.searchPlaceholder)}
            style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}`, color: t.ink }}
            data-testid="input-slot-note"
          />
          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className={cn("h-9 px-4 rounded-full text-[13px] font-medium transition-colors", t.hoverWash)}
              style={{ color: t.subink, border: `1px solid ${t.hairline}` }}
              data-testid="button-cancel-create-slot"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => create.mutate()}
              disabled={!canSubmit}
              className="h-9 px-5 rounded-full inline-flex items-center gap-2 text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: t.blue }}
              data-testid="button-submit-create-slot"
            >
              {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editSlot ? "Save name" : "Create — then add the file"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Task #3066 — ⋯ actions on operator-created tiles (rename / remove) ──
// Sits as an absolute overlay sibling of the tile button (tiles are <button>
// roots — nesting is invalid HTML). Remove confirms; a slot whose spec has
// upload history is refused server-side (409) with an archive hint.
function CustomSlotActions({
  t,
  slot,
  onRename,
  onRemove,
  removing,
}: {
  t: Theme;
  slot: CustomTemplateSlot;
  onRename: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Template actions"
        onClick={() => setOpen((v) => !v)}
        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full inline-flex items-center justify-center hover:opacity-80 z-10"
        style={{ backgroundColor: t.overlayBtn }}
        data-testid={`button-slot-actions-${slot.id}`}
      >
        <MoreHorizontal className="w-4 h-4" style={{ color: t.ink }} />
      </button>
      {open && (
        <div
          className="absolute z-20 rounded-xl py-1.5 text-left"
          style={{ top: 44, right: 10, minWidth: 170, backgroundColor: t.card, boxShadow: t.popShadow, border: `1px solid ${t.hairline}` }}
          data-testid={`menu-slot-actions-${slot.id}`}
        >
          <button
            type="button"
            className={cn("w-full flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] font-medium", t.hoverWash)}
            style={{ color: t.ink }}
            onClick={() => {
              setOpen(false);
              onRename();
            }}
            data-testid={`button-rename-slot-${slot.id}`}
          >
            <Pencil className="w-3.5 h-3.5" />
            Rename
          </button>
          <button
            type="button"
            disabled={removing}
            className={cn("w-full flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] font-medium disabled:opacity-60", t.hoverWash)}
            style={{ color: t.crit }}
            onClick={() => {
              setOpen(false);
              if (
                window.confirm(
                  `Remove "${slot.displayName}"? A slot with upload history can't be deleted — archive the file instead.`,
                )
              ) {
                onRemove();
              }
            }}
            data-testid={`button-remove-slot-${slot.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove
          </button>
        </div>
      )}
    </>
  );
}

// ─── Tiles ──
function FilledTile({
  t,
  slot,
  spec,
  onOpen,
}: {
  t: Theme;
  slot: Slot;
  spec: TemplateSpecWithHistory;
  onOpen: () => void;
}) {
  const status = slotStatus(spec);
  const live = spec.revisions.find((r) => r.status === "certified" || r.status === "pending");
  const historyRevs = spec.revisions.filter((r) => r.status === "superseded" || r.status === "archived");
  const code = spec.templateFileName ?? slot.title;
  // Task #3065 — one file covering multiple options gets the confirmed
  // "serves both" note in place of the generic slot note.
  const note = spec.variantOptions?.length ? variantOptionsNote(spec.variantOptions) : slot.note;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn("rounded-2xl px-6 pt-7 pb-5 flex flex-col items-center text-center transition-colors group", t.tileHover)}
      style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}
      data-testid={`tile-template-${spec.id}`}
    >
      <div className="relative">
        <span className="rounded-full flex items-center justify-center" style={{ width: 104, height: 104, backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }}>
          <ComponentIcon kind={slot.kind} color={t.blue} fill={t.iconFill} size={54} />
        </span>
      </div>
      <div className="mt-4 text-[15px] font-semibold" style={{ color: t.ink, letterSpacing: "-0.01em" }}>{slot.title}</div>
      <div className="mt-1 text-[12.5px] inline-flex items-center gap-1.5 justify-center" style={{ color: t.subink }} data-testid={`note-${spec.id}`}>
        {spec.variantOptions?.length ? <Layers className="w-3 h-3 flex-shrink-0" style={{ color: t.blue }} /> : null}
        {note}
      </div>
      {live && (
        <div className="mt-0.5 text-[12.5px] tabular-nums" style={{ color: t.subink }} data-testid={`text-rev-${spec.id}`}>
          {live.revLabel}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <StatusChip status={status} t={t} />
        {status === "certified" && live?.certifiedAt && (
          <span className="text-[11.5px]" style={{ color: t.faint }}>
            {new Date(live.certifiedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        )}
      </div>
      {/* Revision history — superseded / archived entries expand on hover */}
      {historyRevs.length > 0 && (
        <div className="mt-2 max-h-0 overflow-hidden group-hover:max-h-40 transition-all duration-200 w-full" data-testid={`history-${spec.id}`}>
          {historyRevs.map((h) => (
            <div key={h.id} className="flex items-center justify-center gap-1.5 text-[11.5px]" style={{ color: t.faint, opacity: 0.85 }}>
              <History className="w-3 h-3 flex-shrink-0" />
              <span className="tabular-nums">{h.revLabel}</span>
              <span>{h.note ?? "in history"}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function EmptyTile({
  t,
  slot,
  canEdit,
  onAdd,
}: {
  t: Theme;
  slot: Slot;
  canEdit: boolean;
  onAdd: () => void;
}) {
  const disabled = !!slot.disabled;
  const testid = `tile-empty-${slot.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  // Hover invite (gogoods, 2026-08-12): alongside the Attach pill, the tile's
  // dashed border turns blue with the faintest glow — "a teeny bit if at all".
  const [hover, setHover] = useState(false);
  const invite = hover && !disabled && canEdit;
  return (
    <button
      type="button"
      disabled={disabled || !canEdit}
      onClick={disabled || !canEdit ? undefined : onAdd}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className="group relative rounded-2xl px-6 py-9 flex flex-col items-center justify-center text-center disabled:cursor-default transition-[border-color,box-shadow] duration-200"
      style={{
        border: `1.5px dashed ${invite ? t.blue : t.dashedBorder}`,
        boxShadow: invite ? `0 0 0 1px ${t.blue}33, 0 0 14px ${t.blue}2e` : "none",
        opacity: disabled ? 0.5 : 1,
      }}
      data-testid={testid}
    >
      <div className={cn("flex flex-col items-center transition-opacity", !disabled && canEdit && "group-hover:opacity-30")}>
        <ComponentIcon kind={slot.kind} color={t.faint} fill={t.iconFill} />
        <div className="mt-4 text-[15px] font-semibold" style={{ color: t.ink, letterSpacing: "-0.01em" }}>{slot.title}</div>
        <div className="mt-1 text-[12.5px]" style={{ color: t.faint }}>{slot.note || "Needed for packages"}</div>
      </div>
      {!disabled && canEdit && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="h-9 px-5 rounded-full inline-flex items-center gap-2 text-[13px] font-semibold text-white" style={{ backgroundColor: t.blue }}>
            <Upload className="w-4 h-4" />
            Attach template
          </span>
        </div>
      )}
    </button>
  );
}

export function PressTemplatesIndex({
  pressId,
  onOpenSpec,
  onOpenLiveTest,
}: {
  pressId: string;
  onOpenSpec: (specId: string) => void;
  onOpenLiveTest: () => void;
}) {
  const dark = useAdminDark();
  const t = THEMES[dark ? "dark" : "light"];
  const [format, setFormat] = useState<"Vinyl" | "CD" | "Cassette" | "Stickers">("Vinyl");
  const [size, setSize] = useState<"7″" | "10″" | "12″">("12″");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  // Live-test upload sheet (handoff, Aug 14 2026): header "Upload a template"
  // opens it; pick the PDF here, then land on the live test with it.
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadComponent, setUploadComponent] = useState<string | null>(null);
  const [reopening, setReopening] = useState<string | null>(null); // shelf tile id being fetched
  // Detail sheet — click a certified tile to view the template, then replace
  // it from there if desired (Bill, Aug 14 2026).
  const [detail, setDetail] = useState<{ slot: Slot; spec: TemplateSpecWithHistory } | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  // Just-saved tile gets a one-time hairline pulse — blue, then back to gray.
  const [flashFresh, setFlashFresh] = useState(() => freshLiveSave.flag);
  useEffect(() => {
    if (!freshLiveSave.flag) return;
    freshLiveSave.flag = false;
    const t1 = setTimeout(() => setFlashFresh(false), 900);
    return () => clearTimeout(t1);
  }, []);
  const onPickLiveTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    pendingTemplateFile.file = f;
    pendingTemplateFile.name = uploadName.trim() || null;
    pendingTemplateFile.liveId = null;
    pendingTemplateFile.component = uploadComponent;
    setUploadOpen(false);
    onOpenLiveTest();
  };
  // Reopen a saved shelf template: fetch its stored PDF back into a File and
  // ride the same transit store (liveId set → the live test PATCHes on save).
  const reopenSaved = async (sv: LiveTemplate) => {
    setReopening(sv.id);
    try {
      const r = await fetch(sv.fileUrl, { credentials: "include" });
      if (!r.ok) throw new Error(`Couldn't fetch the template file (${r.status})`);
      const blob = await r.blob();
      pendingTemplateFile.file = new File([blob], sv.fileName ?? `${sv.name}.pdf`, { type: "application/pdf" });
      pendingTemplateFile.name = sv.name;
      pendingTemplateFile.liveId = sv.id;
      pendingTemplateFile.component = sv.component;
      onOpenLiveTest();
    } catch (e: any) {
      toast({ title: "Couldn't reopen the template", description: e?.message, variant: "destructive" });
    } finally {
      setReopening(null);
    }
  };
  // Task #3066 — rename dialog for an operator-created slot.
  const [editSlot, setEditSlot] = useState<CustomTemplateSlot | null>(null);
  const { toast } = useToast();

  // Task #3066 — remove a custom slot made by mistake. The server refuses
  // (409) when the slot's spec already has upload history.
  const removeSlot = useMutation({
    mutationFn: async (slotId: string) => {
      await apiRequest("DELETE", `/api/press/${pressId}/templates/custom-slots/${slotId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/templates`] });
    },
    onError: (e: Error) =>
      toast({
        title: "Couldn't remove the template",
        description: e.message.replace(/^\d{3}:\s*/, ""),
        variant: "destructive",
      }),
  });

  const { data, isLoading, isError, error } = useQuery<TemplatesPayload>({
    queryKey: [`/api/press/${pressId}/templates`],
  });

  const canEdit = data?.canEdit ?? false;
  const specs = data?.specs ?? [];
  const liveTemplates = data?.liveTemplates ?? [];

  // The DB format the current section maps to (custom slots + create flow).
  const sectionDbFormat =
    format === "Vinyl"
      ? size === "7″"
        ? "7_inch"
        : size === "10″"
          ? "10_inch"
          : "12_lp"
      : format === "CD"
        ? "cd"
        : format === "Cassette"
          ? "cassette"
          : null;

  // Task #3065 — operator-defined slots render after the built-ins.
  const customSlotToSlot = (c: CustomTemplateSlot): Slot => ({
    kind: (["jacket", "sleeve", "labels", "booklet"].includes(c.iconKind) ? c.iconKind : "labels") as IconKind,
    title: c.displayName,
    note: c.note ?? "Custom template",
    dbFormat: c.format,
    componentKey: c.slotKey,
    customSlot: c,
  });
  const customSlots = (data?.customSlots ?? [])
    .filter((c) => c.format === sectionDbFormat)
    .map(customSlotToSlot);

  const slots: Slot[] = [
    ...(format === "Vinyl" ? VINYL_SLOTS[size] : FORMAT_SLOTS[format]),
    ...customSlots,
  ];

  return (
    <div className="w-full" style={{ color: t.ink }}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: "8px 0 96px" }}>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[12px] font-medium" style={{ color: t.faint }}>Catalog · Templates</div>
            <h1 className="mt-1" style={{ fontSize: 30, letterSpacing: "-0.02em", fontWeight: 600, lineHeight: 1.12 }}>
              <span style={{ color: t.ink }}>Templates. </span>
              <span style={{ color: t.subink, fontWeight: 500 }}>Your standards, set.</span>
            </h1>
            <p className="mt-1.5 text-[13.5px]" style={{ color: t.subink, maxWidth: 620 }}>
              Every file a client uploads is measured against the live canon below — your numbers, read straight
              from your template PDFs. One certified revision is live per component.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
          {canEdit && (
            <button
              type="button"
              onClick={() => { setUploadName(""); setUploadComponent(null); setUploadOpen(true); }}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-semibold flex-shrink-0"
              style={{ backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}` }}
              data-testid="button-upload-template"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload a template
            </button>
          )}
          {/* Format switcher — Stickers disabled (no DB format yet) */}
          <div className="inline-flex items-center rounded-full flex-shrink-0" style={{ padding: 3, backgroundColor: t.cardSoft }} role="tablist" aria-label="Template format" data-testid="tabs-template-format">
            {(
              [
                { label: "Vinyl", enabled: true },
                { label: "CD", enabled: true },
                { label: "Cassette", enabled: true },
                { label: "Stickers", enabled: false },
              ] as const
            ).map((f) => {
              const on = format === f.label;
              return (
                <button
                  key={f.label}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  disabled={!f.enabled}
                  onClick={() => f.enabled && setFormat(f.label)}
                  title={!f.enabled ? "Not offered yet" : undefined}
                  className="rounded-full transition-colors"
                  style={{
                    padding: "6px 18px",
                    fontSize: 13.5,
                    fontWeight: on ? 600 : 500,
                    color: on ? t.ink : t.faint,
                    backgroundColor: on ? t.pillActive : "transparent",
                    boxShadow: on ? t.segShadow : "none",
                    cursor: f.enabled ? "pointer" : "default",
                    opacity: f.enabled ? 1 : 0.5,
                  }}
                  data-testid={`tab-format-${f.label.toLowerCase()}`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          </div>
        </div>

        {/* Task #3065 — the "VINYL · TEMPLATES" eyebrow is gone (the page
            header + format tabs already say where you are); the size pills
            keep the row. */}
        <div className="mt-6 flex items-center justify-end gap-4">
          <div className="flex items-center gap-1.5">
            {format === "Vinyl" &&
              (["7″", "10″", "12″"] as const).map((sz) => {
                const disabled = false;
                const on = sz === size;
                return (
                  <button
                    key={sz}
                    type="button"
                    disabled={disabled}
                    onClick={() => !disabled && setSize(sz)}
                    title={disabled ? "Not offered yet" : undefined}
                    className="h-7 px-3 rounded-full text-[12px] font-semibold tabular-nums transition-colors"
                    style={
                      on
                        ? { backgroundColor: t.pillActive, color: t.ink, boxShadow: t.segShadow }
                        : { color: t.faint, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 }
                    }
                    data-testid={`filter-size-${sz.replace("″", "")}`}
                  >
                    {sz}
                  </button>
                );
              })}
          </div>
        </div>

        {/* Loading / error / grid */}
        {isLoading ? (
          <div className="mt-16 flex items-center justify-center" data-testid="state-loading">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: t.blue }} />
          </div>
        ) : isError ? (
          <div className="mt-16 flex flex-col items-center justify-center gap-2 text-center" data-testid="state-error">
            <AlertCircle className="w-6 h-6" style={{ color: t.crit }} />
            <div className="text-[13.5px]" style={{ color: t.subink }}>
              {(error as Error)?.message ?? "Couldn't load the templates."}
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-4" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            {/* Saved live-test shelf (handoff): appears with the 12″ vinyl
                slots — reopening a tile rides its stored PDF back into the
                live test and appends to the same test trail. */}
            {format === "Vinyl" && size === "12″" &&
              liveTemplates.map((sv) => {
                const fresh = flashFresh;
                const busy = reopening === sv.id;
                return (
                  <button
                    key={`live-${sv.id}`}
                    type="button"
                    disabled={busy}
                    onClick={() => reopenSaved(sv)}
                    className={cn("rounded-2xl px-6 py-7 flex flex-col items-center text-center transition-colors", t.tileHover)}
                    style={{
                      backgroundColor: t.card,
                      border: `1px solid ${fresh ? t.blue : t.hairline}`,
                      boxShadow: t.pillShadow,
                      transition: "border-color 600ms ease",
                      opacity: busy ? 0.6 : 1,
                    }}
                    data-testid={`tile-live-template-${sv.id}`}
                  >
                    {sv.previewImg ? (
                      <img
                        src={sv.previewImg}
                        alt=""
                        className="w-20 h-20 rounded-full object-cover"
                        style={{ border: `1px solid ${t.hairline}` }}
                      />
                    ) : (
                      <span className="w-20 h-20 rounded-full flex items-center justify-center" style={{ border: `1px solid ${t.hairline}` }}>
                        <Layers className="w-6 h-6" style={{ color: t.faint }} />
                      </span>
                    )}
                    <div className="mt-4 text-[15px] font-semibold" style={{ color: t.ink, letterSpacing: "-0.01em" }}>
                      {sv.name}
                    </div>
                    <div className="mt-1 text-[12.5px]" style={{ color: t.faint }}>
                      {sv.wMm && sv.hMm ? `${Math.round(sv.wMm)} × ${Math.round(sv.hMm)} mm · ` : ""}
                      {sv.layerCount} GT layer{sv.layerCount === 1 ? "" : "s"}
                    </div>
                    <div className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: t.ready }}>
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5" />}
                      Saved · {new Date(sv.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </div>
                    {sv.tests.length > 0 && (
                      <div className="mt-1 text-[12px]" style={{ color: t.faint }}>
                        {sv.tests.length} art file{sv.tests.length === 1 ? "" : "s"} tested
                      </div>
                    )}
                  </button>
                );
              })}
            {slots.map((slot) => {
              const spec = matchSpec(specs, slot);
              const filled = spec && spec.templateFileUrl;
              const key = slot.customSlot ? `custom-${slot.customSlot.id}` : `${slot.title}-${slot.variantKey ?? ""}`;
              const tile = filled ? (
                <FilledTile
                  key={key}
                  t={t}
                  slot={slot}
                  spec={spec!}
                  onOpen={() => setDetail({ slot, spec: spec! })}
                />
              ) : (
                <EmptyTile
                  key={key}
                  t={t}
                  slot={slot}
                  canEdit={canEdit}
                  onAdd={() => setModal({ slot, spec: spec ?? undefined })}
                />
              );
              // Task #3066 — operator-created tiles get a ⋯ overlay with
              // rename / remove (tiles are <button> roots — overlay sibling).
              if (slot.customSlot && canEdit) {
                return (
                  <div key={key} className="relative [&>button]:w-full [&>button]:h-full">
                    {tile}
                    <CustomSlotActions
                      t={t}
                      slot={slot.customSlot}
                      onRename={() => setEditSlot(slot.customSlot!)}
                      onRemove={() => removeSlot.mutate(slot.customSlot!.id)}
                      removing={removeSlot.isPending}
                    />
                  </div>
                );
              }
              return tile;
            })}
            {/* Task #3065 — "Create new template": operator-defined slots for
                this format section (needs an editable role + a real format). */}
            {canEdit && sectionDbFormat && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className={cn("rounded-2xl px-6 py-9 flex flex-col items-center justify-center text-center transition-colors", t.tileHover)}
                style={{ border: `1.5px dashed ${t.dashedBorder}` }}
                data-testid="tile-create-template"
              >
                <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ border: `1.5px dashed ${t.dashedBorder}` }}>
                  <Plus className="w-5 h-5" style={{ color: t.faint }} />
                </span>
                <div className="mt-4 text-[15px] font-semibold" style={{ color: t.ink, letterSpacing: "-0.01em" }}>Create new template</div>
                <div className="mt-1 text-[12.5px]" style={{ color: t.faint }}>Anything not listed above</div>
              </button>
            )}
          </div>
        )}
      </div>

      {createOpen && sectionDbFormat && (
        <CreateSlotModal
          t={t}
          pressId={pressId}
          dbFormat={sectionDbFormat}
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            setCreateOpen(false);
            // Hand straight off to the normal upload flow for the new slot.
            setModal({ slot: customSlotToSlot(created) });
          }}
        />
      )}
      {editSlot && (
        <CreateSlotModal
          t={t}
          pressId={pressId}
          dbFormat={editSlot.format}
          editSlot={editSlot}
          onClose={() => setEditSlot(null)}
          onCreated={() => setEditSlot(null)}
        />
      )}
      {modal && (
        <UploadModal
          t={t}
          pressId={pressId}
          state={modal}
          onClose={() => setModal(null)}
          onDone={(specId) => {
            setModal(null);
            onOpenSpec(specId);
          }}
        />
      )}

      {/* Template detail sheet — view it, then replace if desired (Bill, Aug 14 2026) */}
      {detail && (() => {
        const { slot, spec } = detail;
        const status = slotStatus(spec);
        const live = spec.revisions.find((r) => r.status === "certified" || r.status === "pending");
        const historyRevs = spec.revisions.filter((r) => r.status === "superseded" || r.status === "archived");
        const preview = spec.previewUrls?.[0] ?? null;
        return (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-6"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            onClick={() => setDetail(null)}
            data-testid="sheet-template-detail-backdrop"
          >
            <div
              className="rounded-2xl overflow-hidden shadow-2xl w-full text-center px-8 py-9"
              style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, maxWidth: 560 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label={slot.title}
              data-testid="sheet-template-detail"
            >
              <span className="mx-auto rounded-full overflow-hidden flex items-center justify-center" style={{ width: 168, height: 168, backgroundColor: "#fff", border: `1px solid ${t.hairline}` }}>
                {preview ? (
                  <img src={preview} alt={`${slot.title} — template preview`} className="w-full h-full object-cover" data-testid="img-detail-preview" />
                ) : (
                  <ComponentIcon kind={slot.kind} color={t.blue} fill={t.iconFill} size={84} />
                )}
              </span>
              <div className="mt-5 text-[17px] font-semibold" style={{ color: t.ink, letterSpacing: "-0.01em" }}>{slot.title}</div>
              <div className="mt-1 text-[13px]" style={{ color: t.subink }}>
                {spec.variantOptions?.length ? variantOptionsNote(spec.variantOptions) : slot.note}
              </div>
              {(spec.templateFileName || live) && (
                <div className="mt-0.5 text-[13px] tabular-nums" style={{ color: t.subink }}>
                  {spec.templateFileName}
                  {spec.templateFileName && live ? <span style={{ color: t.faint }}> · </span> : null}
                  {live?.revLabel}
                </div>
              )}
              <div className="mt-3 flex items-center justify-center gap-2">
                <StatusChip status={status} t={t} />
                {status === "certified" && live?.certifiedAt && (
                  <span className="text-[11.5px]" style={{ color: t.faint }}>
                    {new Date(live.certifiedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
              </div>
              {historyRevs.map((h) => (
                <div key={h.id} className="mt-3 flex items-center justify-center gap-1.5 text-[12px]" style={{ color: t.faint }}>
                  <History className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="tabular-nums">{h.revLabel}</span>
                  <span>· {h.note ?? "in history"}</span>
                </div>
              ))}
              <div className="mt-7 flex items-center justify-center gap-2.5">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => { setDetail(null); setModal({ slot, spec }); }}
                    className="h-9 px-5 rounded-full text-[13px] font-semibold text-white"
                    style={{ backgroundColor: t.blue }}
                    data-testid="button-replace-template"
                  >
                    Replace template
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setDetail(null); onOpenSpec(spec.id); }}
                  className="h-9 px-5 rounded-full text-[13px] font-semibold"
                  style={{ color: t.ink, border: `1px solid ${t.hairline}` }}
                  data-testid="button-open-live-test"
                >
                  Open live test
                </button>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="h-9 px-5 rounded-full text-[13px] font-semibold"
                  style={{ color: t.ink, border: `1px solid ${t.hairline}` }}
                  data-testid="button-close-detail"
                >
                  Close
                </button>
              </div>
              {canEdit && (
                <p className="mt-4 text-[11.5px]" style={{ color: t.faint }}>
                  Replacing uploads a new revision — the current one moves to history, it is never deleted.
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Live-test upload sheet (handoff): name + optional component, then
          pick the PDF — the file rides the transit store to the live test. */}
      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={() => setUploadOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl p-6" style={{ backgroundColor: t.card, boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }} data-testid="sheet-live-upload">
            <button type="button" onClick={() => setUploadOpen(false)} className="absolute right-4 top-4" aria-label="Close" data-testid="button-close-live-upload">
              <X className="w-4.5 h-4.5" style={{ color: t.faint }} />
            </button>
            <div className="text-[17px] font-semibold" style={{ color: t.ink, letterSpacing: "-0.01em" }}>Upload a template</div>
            <div className="mt-1 text-[13px]" style={{ color: t.subink }}>
              Pick a PDF and we'll read its GT layers so you can test real art against it.
            </div>
            <label className="mt-5 block text-[12.5px] font-medium" style={{ color: t.subink }}>
              Name <span style={{ color: t.faint }}>(optional — we'll use the file name)</span>
            </label>
            <input
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="e.g. 12″ gatefold jacket"
              className="mt-1.5 w-full h-10 rounded-xl px-3 text-[14px] outline-none"
              style={{ backgroundColor: t.cardSoft, color: t.ink, border: `1px solid ${t.hairline}` }}
              data-testid="input-live-template-name"
            />
            <label className="mt-4 block text-[12.5px] font-medium" style={{ color: t.subink }}>
              Component <span style={{ color: t.faint }}>(optional)</span>
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {["Jacket", "Sleeve", "Labels", "Booklet", "Other"].map((c) => {
                const on = uploadComponent === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setUploadComponent(on ? null : c)}
                    className="h-8 px-3.5 rounded-full text-[12.5px] font-medium"
                    style={{
                      backgroundColor: on ? t.blue : t.cardSoft,
                      color: on ? "#fff" : t.subink,
                      border: `1px solid ${on ? t.blue : t.hairline}`,
                    }}
                    data-testid={`pill-live-component-${c.toLowerCase()}`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => uploadInput.current?.click()}
              className="mt-6 w-full h-11 rounded-full inline-flex items-center justify-center gap-2 text-[14px] font-semibold"
              style={{ backgroundColor: t.blue, color: "#fff" }}
              data-testid="button-choose-live-pdf"
            >
              <CloudUpload className="w-4 h-4" />
              Choose PDF
            </button>
            <input ref={uploadInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onPickLiveTemplate} data-testid="input-live-pdf-file" />
          </div>
        </div>
      )}
    </div>
  );
}

export default PressTemplatesIndex;
