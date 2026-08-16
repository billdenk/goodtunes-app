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
  BadgeCheck, Clock3, XCircle, AlertTriangle, History, Upload, X,
  MoreHorizontal, Archive, RotateCcw, Loader2, AlertCircle, Plus, Layers, Pencil, Trash2, Info,
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
  const matches = specs.filter(
    (s) =>
      s.format === slot.dbFormat &&
      s.componentKey === slot.componentKey &&
      (slot.variantKey === undefined || (s.variantKey ?? "") === slot.variantKey),
  );
  // Duplicate rows happen (empty legacy shells beside the real spec) — prefer
  // the one carrying a live file, then one with revision history.
  return (
    matches.find((s) => s.templateFileUrl) ??
    matches.find((s) => s.revisions.length > 0) ??
    matches[0]
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

// ─── Per-tile ••• overflow (handoff, Aug 15 2026) — appears on hover in the
// tile's top-right corner. Archive lives here (with a confirm); archived
// tiles get Restore instead. Handoff-verbatim styling; wired handlers.
function TileOverflow({ tileKey, title, archived, t, menuFor, setMenuFor, onArchive, onRestore, onReplace, pos }: {
  tileKey: string; title: string; archived: boolean; t: Theme;
  menuFor: string | null; setMenuFor: (k: string | null) => void;
  onArchive: () => void; onRestore: () => void; onReplace?: () => void;
  pos?: string; // position classes — default hugs the tile's top-right corner
}) {
  const open = menuFor === tileKey;
  return (
    <div className={cn("absolute z-10", pos ?? "top-2.5 right-2.5")}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setMenuFor(open ? null : tileKey); }}
        className={cn("w-8 h-8 rounded-full flex items-center justify-center transition-opacity", open ? "opacity-100" : "opacity-0 group-hover:opacity-100", t.hoverWash)}
        style={{ color: t.subink }}
        aria-label={`More options for ${title}`}
        aria-expanded={open}
        data-testid={`button-tile-overflow-${tileKey}`}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuFor(null); }} aria-hidden />
          <div
            className="absolute right-0 mt-1 z-20 rounded-xl overflow-hidden py-1 shadow-xl"
            style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, minWidth: 190 }}
            role="menu"
            data-testid={`menu-tile-overflow-${tileKey}`}
          >
            {archived ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRestore(); }}
                className={cn("w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] font-medium text-left", t.hoverWash)}
                style={{ color: t.ink }}
                role="menuitem"
                data-testid={`menuitem-restore-${tileKey}`}
              >
                <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} />
                Restore template
              </button>
            ) : (
              <>
              {onReplace && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onReplace(); }}
                  className={cn("w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] font-medium text-left", t.hoverWash)}
                  style={{ color: t.ink }}
                  role="menuitem"
                  data-testid={`menuitem-replace-${tileKey}`}
                >
                  <Upload className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} />
                  Replace template&hellip;
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuFor(null); onArchive(); }}
                className={cn("w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] font-medium text-left", t.hoverWash)}
                style={{ color: t.ink }}
                role="menuitem"
                data-testid={`menuitem-archive-${tileKey}`}
              >
                <Archive className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} />
                Archive template…
              </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tiles ──
// GoodStudio-card treatment (handoff Addendum 5, Bill Aug 15 2026): the
// template's own rendered page bleeds edge-to-edge across the tile's top;
// small quiet text block flush-left below — name + status at rest, file
// identity (nickname · code · rev · history) as hover fine print. Pending's
// why + action live behind a click ⓘ beside the chip, not on the tile face.
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
  // Task #3065 — one file covering multiple options gets the confirmed
  // "serves both" note in place of the generic slot note.
  const note = spec.variantOptions?.length ? variantOptionsNote(spec.variantOptions) : slot.note;
  // Real render of the template's own page 1 (Task #3099). No render yet →
  // honest icon panel, never a fabricated stock image.
  const preview = spec.previewUrls?.[0] ?? null;
  // Which pending ⓘ popover is open — anchored by viewport coords; the tile
  // clips overflow, so the popover floats fixed (Bill, Aug 16 2026).
  const [pendingInfo, setPendingInfo] = useState<{ x: number; y: number } | null>(null);
  const togglePendingInfo = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPendingInfo((v) => (v ? null : { x: r.left, y: r.bottom }));
  };
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn("gt-tile rounded-2xl overflow-hidden flex flex-col text-left transition-colors group", t.tileHover)}
      style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}
      data-testid={`tile-template-${spec.id}`}
    >
      {/* GoodStudio proportions: big preview, small quiet text block. */}
      <span className="block w-full flex-shrink-0" style={{ height: 200, backgroundColor: "#fff", borderBottom: `1px solid ${t.hairline}` }}>
        {preview ? (
          <img src={preview} alt={`${slot.title} — the template page itself`} className="w-full h-full object-cover object-top" data-testid={`img-tile-preview-${spec.id}`} />
        ) : (
          <span className="w-full h-full flex items-center justify-center" style={{ backgroundColor: t.cardSoft }}>
            <ComponentIcon kind={slot.kind} color={t.blue} fill={t.iconFill} size={54} />
          </span>
        )}
      </span>
      <div className="w-full px-5 pt-3.5 pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[16px] font-semibold truncate" style={{ color: t.ink, letterSpacing: "-0.01em" }}>{slot.title}</div>
          {/* Icon docks across from the name; yields to the ••• on hover */}
          <span className="flex-shrink-0 transition-opacity group-hover:opacity-0" aria-hidden>
            <ComponentIcon kind={slot.kind} color={t.blue} fill={t.iconFill} size={20} />
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <StatusChip status={status} t={t} />
          {status === "certified" && live?.certifiedAt && (
            <span className="text-[11.5px]" style={{ color: t.faint }}>
              {new Date(live.certifiedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
          {/* Pending's why + action behind a click ⓘ — a real popover, not a
              hover tooltip (Bill, Aug 16 2026). */}
          {status === "pending" && (
            <span className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
              <span
                role="button"
                tabIndex={0}
                aria-label="Why is this pending?"
                onClick={(e) => togglePendingInfo(e.currentTarget as HTMLElement)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    togglePendingInfo(e.currentTarget as HTMLElement);
                  }
                }}
                className="inline-flex items-center justify-center cursor-pointer"
                style={{ color: t.faint }}
                data-testid={`info-pending-${spec.id}`}
              >
                <Info className="w-3.5 h-3.5" />
              </span>
              {pendingInfo && (
                <>
                  <span className="fixed inset-0 z-[70]" onClick={() => setPendingInfo(null)} />
                  <span
                    className="fixed z-[71] block rounded-xl px-4 py-3 text-[12px] leading-relaxed shadow-2xl"
                    style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, color: t.subink, width: 260, top: pendingInfo.y + 8, left: Math.max(12, pendingInfo.x - 8) }}
                    data-testid={`text-pending-why-${spec.id}`}
                  >
                    Attached, not yet certified — it certifies itself when a finished file passes. Open to test.
                  </span>
                </>
              )}
            </span>
          )}
        </div>
        {/* Hover fine print: nickname, note, code · rev, supersede history. */}
        {spec.displayName && (
          <div className="gt-detail mt-1.5 text-[12px] truncate" style={{ color: t.subink }} title={spec.displayName} data-testid={`nickname-${spec.id}`}>
            {spec.displayName}
          </div>
        )}
        <div className="gt-detail mt-1 text-[12px] inline-flex items-center gap-1.5 max-w-full" style={{ color: t.subink }} data-testid={`note-${spec.id}`}>
          {spec.variantOptions?.length ? <Layers className="w-3 h-3 flex-shrink-0" style={{ color: t.blue }} /> : null}
          <span className="truncate">{note}</span>
        </div>
        {(spec.templateFileName || live) && (
          <div className="gt-detail mt-1 text-[12px] tabular-nums truncate" style={{ color: t.subink }} data-testid={`text-rev-${spec.id}`}>
            {spec.templateFileName ?? slot.title}
            {live && (
              <>
                {" "}
                <span style={{ color: t.faint }}>·</span> {live.revLabel}
              </>
            )}
          </div>
        )}
        {historyRevs.length > 0 && (
          <div className="gt-detail mt-1 w-full" data-testid={`history-${spec.id}`}>
            {historyRevs.map((h) => (
              <div key={h.id} className="flex items-center gap-1.5 text-[11.5px]" style={{ color: t.faint }}>
                <History className="w-3 h-3 flex-shrink-0" />
                <span className="tabular-nums">{h.revLabel}</span>
                <span className="truncate">{h.note ?? "superseded · in history"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

function EmptyTile({
  t,
  slot,
  canEdit,
  archived,
  archivedNote,
  onAdd,
}: {
  t: Theme;
  slot: Slot;
  canEdit: boolean;
  archived?: boolean;
  archivedNote?: string;
  onAdd: () => void;
}) {
  const disabled = !!slot.disabled || !!archived;
  const testid = `tile-empty-${slot.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  // Aug 15 2026: the "Click to add" / Attach overlay is gone — anything that
  // opens simply shows the solid blue border on hover (gt-slot CSS).
  return (
    <button
      type="button"
      disabled={disabled || !canEdit}
      onClick={disabled || !canEdit ? undefined : onAdd}
      className={cn("relative rounded-2xl px-6 py-9 flex flex-col items-center justify-center text-center disabled:cursor-default transition-[border-color,box-shadow] duration-200", !disabled && canEdit && "gt-slot")}
      style={{
        border: `1.5px dashed ${t.dashedBorder}`,
        opacity: disabled ? 0.5 : 1,
      }}
      data-testid={testid}
    >
      <div className="flex flex-col items-center">
        {archived ? (
          <Archive className="w-10 h-10" style={{ color: t.faint }} />
        ) : (
          <ComponentIcon kind={slot.kind} color={t.faint} fill={t.iconFill} />
        )}
        <div className="mt-4 text-[15px] font-semibold" style={{ color: t.ink, letterSpacing: "-0.01em" }}>{slot.title}</div>
        <div className="mt-1 text-[12.5px]" style={{ color: t.faint }}>
          {archived ? archivedNote ?? "Archived — not offered" : slot.note || "Needed for packages"}
        </div>
      </div>
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
  const [createOpen, setCreateOpen] = useState(false);
  // Live-test upload sheet (handoff, Aug 14 2026): header "Upload a template"
  // opens it; pick the PDF here, then land on the live test with it.
  const [uploadOpen, setUploadOpen] = useState(false);
  // Header upload = a template with no slot below: ask for a name + component.
  // Slot/tile uploads already know what they are (Bill, Aug 14 2026).
  const [uploadSlot, setUploadSlot] = useState<Slot | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadComponent, setUploadComponent] = useState<string | null>(null);
  const openUpload = (slot: Slot | null) => { setUploadSlot(slot); setUploadName(""); setUploadComponent(null); setUploadOpen(true); };
  // No detail popup (Bill, Aug 15 2026): clicking a template opens it live —
  // the same view as before it was saved. Replace and re-test live there.
  // Archive moved to a per-tile ••• with a confirm; a view pill filters
  // All / Current / Archived. Archived is history, never deletion.
  const [view, setView] = useState<"All" | "Current" | "Archived">("Current");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<{ kind: "spec" | "slot" | "live"; id: string; title: string } | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/templates`] });
  const archiveErr = (e: any) => toast({ title: "Couldn't archive the template", description: e?.message, variant: "destructive" });
  const restoreErr = (e: any) => toast({ title: "Couldn't restore the template", description: e?.message, variant: "destructive" });
  // Attached template file: pull it off the slot (revisions stay in history).
  const archiveSpec = useMutation({
    mutationFn: async (specId: string) => {
      await apiRequest("POST", `/api/press/${pressId}/templates/${specId}/archive`);
    },
    onSuccess: invalidate,
    onError: archiveErr,
  });
  const restoreSpec = useMutation({
    mutationFn: async (specId: string) => {
      await apiRequest("POST", `/api/press/${pressId}/templates/${specId}/restore`);
    },
    onSuccess: invalidate,
    onError: restoreErr,
  });
  // Standard slots a press doesn't offer archive too (Bill, Aug 15 2026) —
  // per-press dismissal persisted on the manufacturer row.
  const slotArchive = useMutation({
    mutationFn: async (slotKey: string) => {
      await apiRequest("POST", `/api/press/${pressId}/templates/slots/archive`, { slotKey });
    },
    onSuccess: invalidate,
    onError: archiveErr,
  });
  const slotRestore = useMutation({
    mutationFn: async (slotKey: string) => {
      await apiRequest("POST", `/api/press/${pressId}/templates/slots/restore`, { slotKey });
    },
    onSuccess: invalidate,
    onError: restoreErr,
  });
  // Saved shelf tiles (live-test templates).
  const liveArchive = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/press/${pressId}/templates/live/${id}/archive`);
    },
    onSuccess: invalidate,
    onError: archiveErr,
  });
  const liveRestore = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/press/${pressId}/templates/live/${id}/restore`);
    },
    onSuccess: invalidate,
    onError: restoreErr,
  });
  const doArchive = (c: { kind: "spec" | "slot" | "live"; id: string }) => {
    if (c.kind === "spec") archiveSpec.mutate(c.id);
    else if (c.kind === "slot") slotArchive.mutate(c.id);
    else liveArchive.mutate(c.id);
    setConfirmArchive(null);
  };
  const doRestore = (c: { kind: "spec" | "slot" | "live"; id: string }) => {
    if (c.kind === "spec") restoreSpec.mutate(c.id);
    else if (c.kind === "slot") slotRestore.mutate(c.id);
    else liveRestore.mutate(c.id);
    setMenuFor(null);
  };
  const [reopening, setReopening] = useState<string | null>(null); // shelf tile id being fetched
  const uploadInput = useRef<HTMLInputElement>(null);
  // ••• → Replace template… on a saved shelf tile (Bill, Aug 15 2026): pick a
  // new file under the same name; the old revision supersedes into history —
  // the tile never moves or duplicates. One tile per template, always.
  const replaceLive = useRef<LiveTemplate | null>(null);
  const startReplaceLive = (sv: LiveTemplate) => {
    replaceLive.current = sv;
    setMenuFor(null);
    uploadInput.current?.click();
  };
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
    // ••• → Replace on a saved shelf tile: the new file rides in under the
    // SAME saved row (liveId) and name — Save updates that tile in place,
    // never a second one (Bill, Aug 15 2026).
    const rl = replaceLive.current;
    replaceLive.current = null;
    pendingTemplateFile.file = f;
    pendingTemplateFile.name = rl ? rl.name : (uploadName.trim() || uploadSlot?.title || null);
    pendingTemplateFile.liveId = rl ? rl.id : null;
    pendingTemplateFile.component = rl ? rl.component : uploadComponent;
    pendingTemplateFile.fromSaved = false; // fresh file = unsaved work
    pendingTemplateFile.priorTests = rl ? rl.tests.map((t) => ({ artName: t.artName, verdict: t.verdict })) : null;
    if (rl) {
      pendingTemplateFile.slot = null;
      setUploadOpen(false);
      onOpenLiveTest();
      return;
    }
    // Slot-mode upload (dashed tile / Replace): the live test saves back to
    // THIS slot — Accept & Save mints a revision instead of a shelf row.
    pendingTemplateFile.slot =
      uploadSlot?.dbFormat && uploadSlot.componentKey
        ? {
            format: uploadSlot.dbFormat,
            componentKey: uploadSlot.componentKey,
            variantKey: uploadSlot.variantKey,
            discCount: uploadSlot.discCount,
            title: uploadSlot.title,
          }
        : null;
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
      pendingTemplateFile.fromSaved = true; // reopening — arrives clean, Save stays quiet
      pendingTemplateFile.priorTests = sv.tests.map((t) => ({ artName: t.artName, verdict: t.verdict })); // display-only trail
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
  // Stable shelf order (Bill, Aug 15 2026): oldest first, so a fresh save
  // APPENDS — tiles never rearrange when a save lands.
  const sortedLiveTemplates = [...liveTemplates].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  // Standard slots this press archived off the shelf ("not offered").
  const archivedSlotKeys = new Set(data?.archivedSlots ?? []);

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

  // 12_double rows shown when present (per the slot-list note above): a 2LP
  // spec (e.g. the imported 2LP center labels) gets its own tile beside the
  // 12″ canon — otherwise a certified template would have nowhere to appear.
  const DOUBLE_TITLES: Record<string, { kind: IconKind; title: string; note: string }> = {
    labels: { kind: "labels", title: "Center labels — 2LP", note: "Two discs" },
    jacket: { kind: "jacket", title: "Jacket — 2LP", note: "Double pocket" },
    inner_sleeve: { kind: "sleeve", title: "Inner sleeve — 2LP", note: "Paper" },
    booklet: { kind: "booklet", title: "Insert — 2LP", note: "12 × 12 in" },
  };
  const doubleSlots: Slot[] =
    format === "Vinyl" && size === "12″"
      ? specs
          .filter((s) => s.format === "12_double" && (s.templateFileUrl || s.revisions.length > 0))
          // One slot per component+variant — empty legacy shells can sit
          // beside the real spec row; matchSpec prefers the live one.
          .filter((s, i, arr) => arr.findIndex((o) => o.componentKey === s.componentKey && (o.variantKey ?? "") === (s.variantKey ?? "")) === i)
          .map((s) => {
            const d = DOUBLE_TITLES[s.componentKey] ?? { kind: "labels" as IconKind, title: `${s.componentKey} — 2LP`, note: "Two discs" };
            return { kind: d.kind, title: d.title, note: d.note, dbFormat: "12_double", componentKey: s.componentKey, variantKey: s.variantKey || undefined } as Slot;
          })
      : [];

  const slots: Slot[] = [
    ...(format === "Vinyl" ? VINYL_SLOTS[size] : FORMAT_SLOTS[format]),
    ...doubleSlots,
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
        </div>

        {/* Controls row — format family on the left; views · sizes · Create New
            on the right. The bright header upload button and the "Vinyl ·
            Templates" caption are gone (Bill, Aug 15 2026): the format chip
            says it, and Create New is the quiet escape hatch. */}
        <div className="mt-6 flex items-center justify-between gap-4">
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
          <div className="flex items-center gap-1.5">
            {/* View pill — All / Current / Archived. Archive is history, not deletion. */}
            {(["All", "Current", "Archived"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className="h-7 px-3 rounded-full text-[12px] font-semibold transition-colors"
                style={v === view ? { backgroundColor: t.pillActive, color: t.ink, boxShadow: t.segShadow } : { color: t.faint, cursor: "pointer" }}
                data-testid={`filter-view-${v.toLowerCase()}`}
              >
                {v}
              </button>
            ))}
            {format === "Vinyl" && <span className="mx-1.5 self-stretch w-px" style={{ backgroundColor: t.hairline }} aria-hidden />}
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
            {canEdit && (
              <>
                <span className="mx-1.5 self-stretch w-px" style={{ backgroundColor: t.hairline }} aria-hidden />
                {/* "Create New" — quiet ghost pill, same weight as the filter pills
                    beside it; it's the escape hatch, not the main road (Bill, Aug 15 2026) */}
                <button
                  type="button"
                  onClick={() => openUpload(null)}
                  className={cn("inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[12px] font-semibold flex-shrink-0 transition-colors", t.hoverWash)}
                  style={{ color: t.subink }}
                  data-testid="button-upload-template"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create New
                </button>
              </>
            )}
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
            {slots.map((slot) => {
              const spec = matchSpec(specs, slot);
              const filled = !!(spec && spec.templateFileUrl);
              // A spec with no live file but archived revisions = an archived
              // template (restorable); a slot key on the press's dismissal
              // list = "Archived — not offered" (standard slot the press
              // doesn't carry). Both live under the Archived view.
              const specArchived = !!(spec && !spec.templateFileUrl && spec.revisions.some((r) => r.status === "archived"));
              const slotKey = `${slot.dbFormat ?? ""}:${slot.componentKey ?? ""}:${slot.variantKey ?? ""}:${slot.discCount ?? ""}`;
              const slotArchived = !filled && !specArchived && archivedSlotKeys.has(slotKey);
              const isArchived = specArchived || slotArchived;
              if (view === "Current" && isArchived) return null;
              if (view === "Archived" && !isArchived) return null;
              const key = slot.customSlot ? `custom-${slot.customSlot.id}` : `${slot.title}-${slot.variantKey ?? ""}`;
              const tile = filled ? (
                <FilledTile
                  key={key}
                  t={t}
                  slot={slot}
                  spec={spec!}
                  onOpen={() => onOpenSpec(spec!.id)}
                />
              ) : (
                <EmptyTile
                  key={key}
                  t={t}
                  slot={slot}
                  canEdit={canEdit}
                  archived={isArchived}
                  archivedNote={specArchived ? "Archived" : "Archived — not offered"}
                  onAdd={() => openUpload(slot)}
                />
              );
              // Per-tile ••• (archive / restore) + Task #3066 custom-slot
              // rename / remove — overlay siblings (tiles are <button> roots).
              const overflowKey = slot.customSlot ? `custom-${slot.customSlot.id}` : slotKey.replace(/[^a-z0-9_-]+/gi, "-");
              const canArchiveHere = canEdit && !slot.disabled && (filled || spec || slot.dbFormat) && !slot.customSlot;
              const showOverflow = canArchiveHere || isArchived;
              if ((slot.customSlot && canEdit) || showOverflow) {
                return (
                  <div key={key} className="relative group [&>button]:w-full [&>button]:h-full">
                    {tile}
                    {showOverflow && (
                      <TileOverflow
                        tileKey={overflowKey}
                        title={slot.title}
                        archived={isArchived}
                        t={t}
                        pos={filled ? "top-[206px] right-3" : undefined}
                        menuFor={menuFor}
                        setMenuFor={setMenuFor}
                        onArchive={() =>
                          setConfirmArchive(
                            filled
                              ? { kind: "spec", id: spec!.id, title: slot.title }
                              : { kind: "slot", id: slotKey, title: slot.title },
                          )
                        }
                        onRestore={() =>
                          doRestore(
                            specArchived
                              ? { kind: "spec", id: spec!.id }
                              : { kind: "slot", id: slotKey },
                          )
                        }
                        onReplace={canEdit && filled ? () => { setMenuFor(null); openUpload(slot); } : undefined}
                      />
                    )}
                    {slot.customSlot && canEdit && (
                      <CustomSlotActions
                        t={t}
                        slot={slot.customSlot}
                        onRename={() => setEditSlot(slot.customSlot!)}
                        onRemove={() => removeSlot.mutate(slot.customSlot!.id)}
                        removing={removeSlot.isPending}
                      />
                    )}
                  </div>
                );
              }
              return tile;
            })}
            {/* Saved live-test shelf — renders AFTER the certified canon:
                tiles never rearrange when a save lands; existing tiles keep
                their spots, new saves append (Bill, Aug 15 2026). Reopening a
                tile rides its stored PDF back into the live test. */}
            {format === "Vinyl" && size === "12″" &&
              sortedLiveTemplates.map((sv) => {
                const fresh = flashFresh;
                const busy = reopening === sv.id;
                const isArchived = !!sv.archivedAt;
                if ((view === "Current" && isArchived) || (view === "Archived" && !isArchived)) return null;
                const key = `live-${sv.id}`;
                return (
                  <div key={key} className="relative group" style={{ opacity: isArchived ? 0.7 : 1 }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => reopenSaved(sv)}
                    className={cn("gt-tile w-full h-full rounded-2xl overflow-hidden flex flex-col text-left transition-colors", t.tileHover)}
                    style={{
                      backgroundColor: t.card,
                      border: `1px solid ${fresh ? t.blue : t.hairline}`,
                      boxShadow: t.pillShadow,
                      transition: "border-color 600ms ease",
                      opacity: busy ? 0.6 : 1,
                    }}
                    data-testid={`tile-live-template-${sv.id}`}
                  >
                    {/* Same flat-top treatment as the canon tiles (Addendum 5):
                        page-1 preview bleeds across the top; honest placeholder
                        when the save predates preview capture. */}
                    <span className="block w-full flex-shrink-0" style={{ height: 200, backgroundColor: "#fff", borderBottom: `1px solid ${t.hairline}` }}>
                      {sv.previewImg ? (
                        <img src={sv.previewImg} alt="" className="w-full h-full object-cover object-top" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center" style={{ backgroundColor: t.cardSoft }}>
                          <Layers className="w-6 h-6" style={{ color: t.faint }} />
                        </span>
                      )}
                    </span>
                    <div className="w-full px-5 pt-3.5 pb-4">
                      <div className="text-[16px] font-semibold truncate w-full" style={{ color: t.ink, letterSpacing: "-0.01em" }} title={sv.name}>
                        {sv.name}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11.5px]" style={{ color: t.faint }}>
                        {isArchived ? (
                          <><Archive className="w-3.5 h-3.5 flex-shrink-0" /><span style={{ fontWeight: 600 }}>Archived</span></>
                        ) : (
                          <>
                            {busy ? <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin" style={{ color: t.ready }} /> : <BadgeCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.ready }} />}
                            <span style={{ color: t.ready, fontWeight: 600 }}>Saved</span>
                            <span>{new Date(sv.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                          </>
                        )}
                        {sv.tests.length > 0 && <span>· {sv.tests.length} art file{sv.tests.length === 1 ? "" : "s"} tested</span>}
                      </div>
                      <div className="gt-detail mt-1.5 text-[12px] tabular-nums" style={{ color: t.subink }}>
                        {sv.wMm && sv.hMm ? `${Math.round(sv.wMm)} × ${Math.round(sv.hMm)} mm · ` : ""}
                        {sv.layerCount} GT layer{sv.layerCount === 1 ? "" : "s"}
                      </div>
                    </div>
                  </button>
                  {canEdit && (
                    <TileOverflow
                      tileKey={key}
                      title={sv.name}
                      archived={isArchived}
                      t={t}
                      pos="top-[206px] right-3"
                      menuFor={menuFor}
                      setMenuFor={setMenuFor}
                      onArchive={() => setConfirmArchive({ kind: "live", id: sv.id, title: sv.name })}
                      onRestore={() => doRestore({ kind: "live", id: sv.id })}
                      onReplace={() => startReplaceLive(sv)}
                    />
                  )}
                  </div>
                );
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
            // Hand straight off to the slot-mode upload sheet for the new slot.
            openUpload(customSlotToSlot(created));
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
      {/* Archive confirm — are-you-sure before a tile leaves the live shelf
          (Bill, Aug 15 2026). Archive is history, never deletion. */}
      {confirmArchive && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-6"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={() => setConfirmArchive(null)}
          data-testid="modal-confirm-archive-backdrop"
        >
          <div
            className="relative rounded-2xl overflow-hidden shadow-2xl w-full text-center px-8 py-9"
            style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`Archive ${confirmArchive.title}`}
            data-testid="modal-confirm-archive"
          >
            <button
              type="button"
              onClick={() => setConfirmArchive(null)}
              className={cn("absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-colors", t.hoverWash)}
              style={{ color: t.subink }}
              aria-label="Close"
              data-testid="button-close-confirm-archive"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }}>
              <Archive className="w-5 h-5" style={{ color: t.subink }} />
            </div>
            <div className="mt-4 text-[17px] font-semibold" style={{ color: t.ink, letterSpacing: "-0.01em" }}>
              Archive &ldquo;{confirmArchive.title}&rdquo;?
            </div>
            <p className="mt-1.5 text-[13px] mx-auto" style={{ color: t.subink, maxWidth: 340 }}>
              It leaves the live shelf and stops measuring client files. It moves to Archived —
              nothing is ever deleted, and you can restore it any time.
            </p>
            {/* Canon (Bill, Aug 15 2026): confirming action is always rightmost; Cancel is quiet text to its left. */}
            <div className="mt-6 flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmArchive(null)}
                className={cn('h-9 px-4 rounded-full text-[13px] font-medium transition-colors', t.hoverWash)}
                style={{ color: t.subink }}
                data-testid="button-cancel-archive"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => doArchive(confirmArchive)}
                className="h-9 px-5 rounded-full text-[13px] font-semibold text-white"
                style={{ backgroundColor: t.blue }}
                data-testid="button-confirm-archive"
              >
                Archive template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload sheet — Apple-style: dimmed page, one decision (Bill, Aug 14 2026).
          Handoff-verbatim; slot mode shows "For: {slot}", header mode asks
          name + component. The picked file rides the transit store. */}
      {uploadOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={() => setUploadOpen(false)}
          data-testid="sheet-upload-backdrop"
        >
          <div
            className="rounded-2xl overflow-hidden shadow-2xl w-full text-center px-8 py-9"
            style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Upload your template"
            data-testid="sheet-upload-template"
          >
            <button
              type="button"
              onClick={() => setUploadOpen(false)}
              className={cn('absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverWash)}
              style={{ color: t.subink }}
              aria-label="Close"
              data-testid="button-close-upload"
            >
              <X className="w-4 h-4" />
            </button>
            <div
              className="mx-auto w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }}
            >
              <Upload className="w-5 h-5" style={{ color: t.subink }} />
            </div>
            <div className="mt-4 text-[17px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>Upload your template</div>
            {/* One line, Apple-quiet; the detail lives behind the i (Bill, Aug 15 2026) */}
            <p className="mt-1.5 text-[13px] mx-auto inline-flex items-center gap-1.5" style={{ color: t.subink }}>
              Your Illustrator PDF, GT layers included.
              <span
                className="inline-flex items-center justify-center cursor-help"
                title={'Layers named "GT CUT LINE", "GT BLEED AREA", and so on are read by name, exactly where you drew them.'}
                aria-label="About GT layers"
                data-testid="info-gt-layers"
              >
                <Info className="w-3.5 h-3.5" style={{ color: t.faint }} />
              </span>
            </p>
            {uploadSlot ? (
              <div className="mt-4 text-[12.5px] font-semibold" style={{ color: t.subink }} data-testid="text-upload-for">
                For: <span style={{ color: t.ink }}>{uploadSlot.title}</span>
              </div>
            ) : (
              <div className="mt-5 text-left mx-auto" style={{ maxWidth: 360 }}>
                <label className="block text-[11px] font-semibold" style={{ color: t.subink }}>
                  Name
                  <input
                    type="text"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    placeholder="Single jacket — Special"
                    className="block w-full mt-1.5 h-9 px-3 rounded-lg text-[13px] font-medium outline-none"
                    style={{ backgroundColor: t.cardSoft, color: t.ink, border: `1px solid ${t.hairline}` }}
                    data-testid="input-template-name"
                  />
                </label>
                <div className="mt-3 text-[11px] font-semibold" style={{ color: t.subink }}>Component</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {['Jacket', 'Sleeve', 'Labels', 'Booklet', 'Other'].map((c) => {
                    const on = uploadComponent === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setUploadComponent(on ? null : c)}
                        className="h-7 px-3 rounded-full text-[12px] font-semibold transition-colors"
                        style={{
                          border: `1px solid ${on ? t.subink : t.hairline}`,
                          color: on ? t.ink : t.faint,
                          backgroundColor: on ? t.cardSoft : 'transparent',
                        }}
                        data-testid={`pill-component-${c.toLowerCase()}`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 text-[11px]" style={{ color: t.faint }}>
                  Both optional — name it later from the test page, associate the component any time.
                </div>
              </div>
            )}
            {/* Canon (Bill, Aug 15 2026): confirming action is always rightmost; Cancel is quiet text to its left. */}
            <div className="mt-6 flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className={cn('h-9 px-4 rounded-full text-[13px] font-medium transition-colors', t.hoverWash)}
                style={{ color: t.subink }}
                data-testid="button-cancel-upload"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => uploadInput.current?.click()}
                className="h-9 px-5 rounded-full text-[13px] font-semibold text-white"
                style={{ backgroundColor: t.blue }}
                data-testid="button-choose-pdf"
              >
                Choose PDF
              </button>
            </div>
          </div>
        </div>
      )}
      <input ref={uploadInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onPickLiveTemplate} data-testid="input-upload-template" />
      {/* Handoff CSS (Aug 15 2026): anything that opens gets the solid blue
          border on hover; tiles rest quiet — fine print fades in on hover or
          keyboard focus, with its space reserved so nothing jumps. */}
      <style>{`.gt-slot:hover { border-color: #319ED8 !important; border-style: solid !important; }
.gt-tile:hover { border-color: #319ED8 !important; }
.gt-tile .gt-detail, .relative.group .gt-detail { opacity: 0; transition: opacity 150ms ease; }
.gt-tile:hover .gt-detail, .gt-tile:focus-visible .gt-detail, .relative.group:hover .gt-detail, .relative.group:focus-within .gt-detail { opacity: 1; }`}</style>
    </div>
  );
}

export default PressTemplatesIndex;
