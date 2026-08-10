// ─────────────────────────────────────────────────────────────────────
// Press catalog — "Package pricing" (approved design, handoff/press-catalog).
// Replaces the legacy PressCatalogPanel editor body with the
// PressPackagePricingCatalog design: left sticky jacket+disc stage, right
// column of Pick a size / Pick a type / Pick a color / Name your price /
// Turnaround / Print templates / Audio spec.
//
// ZERO-DATA-LOSS wiring (Bill's rule 2): every field the old editor touched
// keeps a home here —
//   • formats incl. CD / Cassette / GoodDeeds + hidden flag + add/remove
//     (FormatDropdown reused; vinyl sizes get the design's cards)
//   • tiers (color groups) rename/delete/add
//   • colors: name, hex, photo swatch, remove (SwatchEditorPopover reused —
//     photo wins over hex; reorder lives on the Add-your-vinyl page)
//   • per-qty pricing incl. Quote-on-request (confirmed:false) and
//     not-offered (no rung), arbitrary quantities + Add run size
//   • per-format turnaround override (inherits press default)
//   • print templates incl. Booklet + finished-file-check fields
//   • audio spec incl. notes
//   • CSV export/import, Hellbender import/sync, GoodDeeds printing ladder
// Ladder save semantics are copied verbatim from the legacy CatalogEditor
// (same PUT, same rung encoding), so saved data round-trips identically.
// ─────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ALBUM_FORMAT_LABEL, type AlbumFormat } from "@shared/schema";
import { Check, ChevronDown, DollarSign, FileText, HelpCircle, Loader2, MinusCircle, MoreHorizontal, Plus, RotateCcw, Search, UploadCloud, X } from "lucide-react";
import { uploadAdminDoc, DOC_UPLOAD_ACCEPT } from "@/lib/adminUpload";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Catalog,
  CatalogColor,
  CatalogFormat,
  CatalogTab,
  CatalogTier,
  CatalogCsvButtons,
  GoodDeedPrintingEditor,
  DEFAULT_QTY_COLUMNS,
  HellbenderImportButton,
  HellbenderPricingSyncButton,
  VINYL_FORMATS,
  formatDollars,
  parseDollars,
  pressPlaceholderArt,
} from "./AdminManufacturer";
import {
  ColorBall,
  MoreTypesPopover,
  SwatchEditorPopover,
  VinylDisc,
} from "./PressVinylColors";
import { useAdminDark } from "@/lib/adminAppearance";
import { CdCatalogBody, CassetteCatalogBody } from "./PressMediaCatalog";

// ─── Design tokens (Apple canon; vars flip under gt-admin-dark) ──────
const BLUE = "var(--brand-blue)";
const INK = "var(--apple-ink)";
const SUBINK = "var(--apple-subink)";
const HAIRLINE = "var(--apple-hairline)";
const FAINT = "var(--apple-faint)";
const CRITICAL = "#e0245e";
/** Destructive red — brightened to rose on charcoal for legibility (dark canon). */
function criticalColor(dark: boolean): string {
  return dark ? "#ff6b8a" : CRITICAL;
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ─── Dark-mode surface constants (character-identical to the Dark reference).
// The catalog page renders inside body.gt-admin(.gt-admin-dark); tokens that
// are CSS vars flip automatically. The values below are the ones the reference
// hard-codes as literals — frosted panels, selection washes, disc rims — so
// they're picked inline via `useAdminDark()` where the surface differs.
const SEL_WASH = "rgba(49,158,216,0.16)"; // dark blue selection tint (light #f0f7fc)
const CRITICAL_WASH = "rgba(255,107,138,0.14)"; // dark destructive hover (light #fdeef2)
const CARD = "var(--apple-card)"; // base card surface (light #fff, dark #1e1e20)
const CARD_SOFT = "#26262a"; // inset chip / input surface (light #fff)
const PILL_ACTIVE = "#3a3a3e"; // raised active segmented pill (light #fff)
// Subtle light rim that separates a dark disc silhouette from the dark page.
const DISC_RIM = "0 0 0 0.5px rgba(255,255,255,0.14), 0 1px 3px rgba(0,0,0,0.5)";
// Reference-verbatim frosted pill shadow + label-logo recolor filter (Item 28).
const PILL_SHADOW = "0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)";
const PRESS_LABEL_LOGO_FILTER = "invert(1) brightness(1.7)";
// The jacket / center label / brand dialog render the press mark as a WHITE
// silhouette on black. Assets arrive in any ink (MRP's is already white,
// others are near-black) — brightness(0) flattens every opaque pixel to
// black, invert(1) lifts it to pure white, deterministically.
const FORCE_WHITE_MARK = "brightness(0) invert(1)";

// ─── Frosted editor popovers (same feel as Add Your Vinyl / handoff ref) ──
function frostedPanel(dark: boolean): React.CSSProperties {
  return {
    border: `1px solid ${HAIRLINE}`,
    backgroundColor: dark ? "rgba(28,28,30,0.82)" : "rgba(255,255,255,0.82)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    boxShadow: dark ? "0 20px 48px rgba(0,0,0,0.55)" : "0 20px 48px rgba(0,0,0,0.16)",
    ...(dark ? { color: INK } : null),
  };
}

function fieldInput(dark: boolean): React.CSSProperties {
  return {
    height: 40,
    border: `1px solid ${HAIRLINE}`,
    borderRadius: 10,
    padding: "0 12px",
    color: INK,
    background: dark ? CARD_SOFT : "#fff",
  };
}

// Size labels shown in the type editor's "Pressed in these sizes" chips.
const SIZES = ['7"', '10"', '12"'] as const;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: SUBINK }}>
      {children}
    </label>
  );
}

/** Frosted ··· trigger button, revealed on hover / focus by the parent `.group`. */
function DotsTrigger({ label, testId }: { label: string; testId: string }) {
  const dark = useAdminDark();
  return (
    <button
      type="button"
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      data-testid={testId}
      className={cn(
        "inline-flex items-center justify-center rounded-full transition-shadow focus:outline-none focus-visible:ring-2",
        dark ? "focus-visible:ring-white/30" : "focus-visible:ring-slate-300",
      )}
      style={{
        width: 26,
        height: 26,
        backgroundColor: dark ? "rgba(38,38,42,0.88)" : "rgba(255,255,255,0.88)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        border: `1px solid ${HAIRLINE}`,
        boxShadow: dark ? "0 1px 3px rgba(0,0,0,0.45)" : "0 1px 3px rgba(0,0,0,0.10)",
        color: SUBINK,
      }}
    >
      <MoreHorizontal className="w-4 h-4" />
    </button>
  );
}

function SizeChip({ size, active, onToggle }: { size: string; active: boolean; onToggle: () => void }) {
  const dark = useAdminDark();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      data-testid={`size-${size.replace('"', "in")}`}
      className="rounded-full transition-colors focus:outline-none tabular-nums"
      style={{
        padding: "8px 18px",
        fontSize: 13.5,
        fontWeight: 600,
        color: active ? "#ffffff" : INK,
        backgroundColor: active ? BLUE : dark ? CARD_SOFT : "#fff",
        border: active ? `1px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
      }}
    >
      {size}
    </button>
  );
}

// ─── Reorder mode controls — explicit enter/commit/cancel, Apple-quiet ─
// Reordering is opt-in so a stray drag can never shuffle the catalog.
function ReorderControls({
  on,
  onBegin,
  onCommit,
  onCancel,
  testId,
}: {
  on: boolean;
  onBegin: () => void;
  onCommit: () => void;
  onCancel: () => void;
  testId: string;
}) {
  const dark = useAdminDark();
  if (!on) {
    return (
      <button
        type="button"
        onClick={onBegin}
        data-testid={`button-reorder-${testId}`}
        className="text-[12px] font-semibold rounded-full transition-colors hover:bg-slate-100 focus:outline-none"
        style={{ padding: "5px 12px", color: SUBINK, border: `1px solid ${HAIRLINE}`, background: dark ? CARD : "#fff" }}
      >
        Rearrange
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onCancel}
        data-testid={`button-reorder-cancel-${testId}`}
        className="flex items-center gap-1 text-[12px] font-semibold rounded-full transition-colors hover:bg-slate-100 focus:outline-none"
        style={{ padding: "5px 12px", color: SUBINK, border: `1px solid ${HAIRLINE}`, background: dark ? CARD : "#fff" }}
      >
        <RotateCcw className="w-3 h-3" />
        Cancel
      </button>
      <button
        type="button"
        onClick={onCommit}
        data-testid={`button-reorder-done-${testId}`}
        className="text-[12px] font-semibold rounded-full text-white transition-opacity hover:opacity-90 focus:outline-none"
        style={{ padding: "5px 14px", backgroundColor: BLUE }}
      >
        Done
      </button>
    </div>
  );
}

// ─── Catalog search — magnifier reveals a frosted find-a-color popover ─
type CatalogEntry = { color: CatalogColor; tierId: string; tierName: string };

function CatalogSearchPopover({
  entries,
  totalCount,
  selectedId,
  onPick,
  labelLogoUrl,
  labelBgColor,
}: {
  entries: CatalogEntry[];
  totalCount: number;
  selectedId: string;
  onPick: (tierId: string, colorId: string) => void;
  labelLogoUrl: string | null;
  labelBgColor: string | null;
}) {
  const dark = useAdminDark();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      ({ color, tierName }) =>
        color.name.toLowerCase().includes(q) || tierName.toLowerCase().includes(q),
    );
  }, [entries, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Search catalog colors"
          data-testid="button-catalog-search"
          className="inline-flex items-center justify-center rounded-full flex-shrink-0 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          style={{ width: 34, height: 34, color: SUBINK, border: `1px solid ${HAIRLINE}`, background: dark ? CARD : "#fff" }}
        >
          <Search className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={10}
        avoidCollisions
        collisionPadding={16}
        className="w-[480px] max-w-[calc(100vw-32px)] p-0 rounded-2xl overflow-hidden flex flex-col"
        style={{
          ...frostedPanel(dark),
          maxHeight: "min(560px, calc(100vh - 32px), var(--radix-popover-content-available-height))",
        }}
        data-testid="popover-catalog-search"
      >
        {/* Pinned header — small-caps title + count, then the search pill */}
        <div className="flex-shrink-0" style={{ padding: "14px 18px", borderBottom: `1px solid ${HAIRLINE}` }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: SUBINK }}>
              Colors in your catalog
            </span>
            <span className="text-[12px] tabular-nums" style={{ color: FAINT }}>
              {totalCount}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: FAINT }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={cn(
                "w-full h-8 pl-9 pr-8 rounded-full text-[12.5px] focus:outline-none transition-colors",
                dark ? "placeholder:text-white/30 focus:border-white/30" : "placeholder:text-slate-400 focus:border-slate-400",
              )}
              style={{ border: `1px solid ${HAIRLINE}`, color: INK, background: dark ? CARD_SOFT : "#fff" }}
              placeholder="Find a color…"
              data-testid="input-catalog-search"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                data-testid="button-catalog-clear"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-full transition-colors hover:bg-slate-100"
                style={{ width: 18, height: 18, color: SUBINK }}
              >
                <X className="w-3 h-3" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable divided list — mini disc render + name + type */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {filtered.length === 0 ? (
            <div style={{ padding: "18px" }}>
              <p className="text-[12.5px]" style={{ color: FAINT }}>
                No colors match.
              </p>
            </div>
          ) : (
            <ul>
              {filtered.map(({ color, tierId, tierName }) => {
                const on = color.id === selectedId;
                return (
                  <li key={`${tierId}-${color.id}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(tierId, color.id);
                        setQuery("");
                        setOpen(false);
                      }}
                      data-testid={`catalog-item-${color.id}`}
                      className="w-full flex items-center gap-3 text-left transition-colors hover:bg-slate-50 focus:outline-none"
                      style={{ padding: "11px 18px", borderBottom: `1px solid ${HAIRLINE}`, backgroundColor: on ? (dark ? SEL_WASH : "#f0f7fc") : undefined }}
                    >
                      <VinylDisc size={40} color={color} labelLogoUrl={labelLogoUrl} labelBgColor={labelBgColor} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold truncate" style={{ color: on ? BLUE : INK }}>
                          {color.name}
                        </div>
                        <div className="text-[11.5px]" style={{ color: SUBINK }}>
                          {tierName}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: SUBINK }}>
      {children}
    </div>
  );
}
function TwoTone({ lead, rest, size = 24 }: { lead: string; rest: string; size?: number }) {
  return (
    <h2 className="tracking-tight" style={{ fontSize: size, lineHeight: 1.12, fontWeight: 600 }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: FAINT }}>{rest}</span>
    </h2>
  );
}
function Card({
  children,
  className,
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={cn("rounded-2xl bg-white", className)}
      style={{ border: `1px solid ${HAIRLINE}` }}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

const VINYL_SIZE_BLURB: Record<string, string> = {
  "7_inch": "Single",
  "12_lp": "LP",
  "12_double": "Double LP",
};

// ─── Hover-spin physics (Item 28, reference-verbatim) ────────────────
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

const SPIN_DPS = 360 / 8000;
const REWIND_MS = 700;
const REWIND_EASE = (t: number) => 1 - Math.pow(1 - t, 3);

function useVinylSpin() {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const angleRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const reduced = usePrefersReducedMotion();
  const [showRewind, setShowRewind] = useState(false);

  const apply = useCallback(() => {
    if (bodyRef.current) {
      bodyRef.current.style.transform = `rotate(${angleRef.current}deg)`;
    }
  }, []);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
  }, []);

  const spinLoop = useCallback(
    (ts: number) => {
      if (lastTsRef.current !== null) {
        angleRef.current += (ts - lastTsRef.current) * SPIN_DPS;
        apply();
      }
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(spinLoop);
    },
    [apply],
  );

  const onPointerEnter = useCallback(() => {
    if (reduced) return;
    setShowRewind(false);
    stopRaf();
    rafRef.current = requestAnimationFrame(spinLoop);
  }, [reduced, spinLoop, stopRaf]);

  const onPointerLeave = useCallback(() => {
    if (reduced) return;
    stopRaf();
    const settled = ((angleRef.current % 360) + 360) % 360;
    if (settled > 30) setShowRewind(true);
  }, [reduced, stopRaf]);

  const rewind = useCallback(() => {
    if (reduced) return;
    stopRaf();
    setShowRewind(false);
    const start = angleRef.current;
    const target = start - (((start % 360) + 360) % 360);
    const delta = target - start;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / REWIND_MS);
      angleRef.current = start + delta * REWIND_EASE(p);
      apply();
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        angleRef.current = target;
        apply();
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [reduced, apply, stopRaf]);

  useEffect(() => () => stopRaf(), [stopRaf]);

  return { bodyRef, onPointerEnter, onPointerLeave, showRewind, rewind, reduced };
}

function RewindButton({ show, onClick, size = 28 }: { show: boolean; onClick: () => void; size?: number }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label="Rewind record to start"
      data-testid="button-rewind"
      className="rounded-full flex items-center justify-center transition-all"
      style={{
        width: size,
        height: size,
        opacity: show ? 1 : 0,
        pointerEvents: show ? "auto" : "none",
        transform: show ? "scale(1)" : "scale(0.9)",
        background: "rgba(30,30,32,0.72)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: `1px solid ${HAIRLINE}`,
        boxShadow: PILL_SHADOW,
        color: SUBINK,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--apple-ink)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--apple-subink)";
      }}
    >
      <RotateCcw style={{ width: size * 0.5, height: size * 0.5 }} />
    </button>
  );
}

// ─── "Make it yours" branding dialog (Item 28 + Apple-ified header/footer) ───
// Centered modal opened from the jacket ⋯ — brand color chip-as-picker,
// SVG-only logo replace. Edits are DRAFTS: Save commits (PUT
// /catalog/branding); Cancel and the X discard and restore what was there
// when the dialog opened — closing never silently keeps half-made changes.
function BrandDialog({
  color,
  logoUrl,
  onColor,
  onLogoFile,
  onReset,
  onCancel,
  onSave,
  uploading,
  saving,
}: {
  color: string;
  logoUrl: string | null;
  onColor: (v: string) => void;
  onLogoFile: (file: File) => void;
  onReset: () => void;
  onCancel: () => void;
  onSave: () => void;
  uploading: boolean;
  saving: boolean;
}) {
  return createPortal(
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-2xl"
        style={{
          width: 420,
          padding: 20,
          background: "rgba(28,28,30,0.97)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          textAlign: "left",
          cursor: "default",
        }}
      >
        {/* Header air — title never crowds the close button (lh 1.3 + 28px
            right pad); close is a 28px round target with a faint white wash,
            tucked into the top-right corner. */}
        <div style={{ position: "relative", marginBottom: 16 }}>
          <span className="block text-[17px] font-semibold tracking-tight" style={{ lineHeight: 1.3, paddingRight: 28 }}>
            <span style={{ color: "#f5f5f7" }}>Make it yours. </span>
            <span style={{ color: "rgba(245,245,247,0.45)" }}>Color and logo flow to the cover and center label.</span>
          </span>
          <button
            type="button"
            aria-label="Close"
            data-testid="button-brand-close"
            onClick={onCancel}
            className="rounded-full flex items-center justify-center transition-colors"
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              width: 28,
              height: 28,
              background: "rgba(255,255,255,0.08)",
              border: "none",
              color: "rgba(245,245,247,0.55)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.14)";
              e.currentTarget.style.color = "#f5f5f7";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.08)";
              e.currentTarget.style.color = "rgba(245,245,247,0.55)";
            }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* Brand color — swatch chip IS the picker, so it always matches */}
        <div className="text-[11px] font-semibold uppercase" style={{ color: "rgba(245,245,247,0.45)", letterSpacing: 0.8, marginBottom: 8 }}>
          Brand color
        </div>
        <div className="flex items-center" style={{ gap: 8, marginBottom: 18 }}>
          <label
            className="rounded-[10px] flex-shrink-0"
            data-testid="chip-brand-color"
            style={{
              width: 46,
              height: 34,
              backgroundColor: color,
              border: "1px solid rgba(255,255,255,0.22)",
              boxShadow: "inset 0 1px 1px rgba(255,255,255,0.12)",
              cursor: "pointer",
              display: "block",
            }}
          >
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#000000"}
              onChange={(e) => onColor(e.target.value)}
              data-testid="input-brand-color-picker"
              style={{ opacity: 0, width: "100%", height: "100%", cursor: "pointer" }}
            />
          </label>
          <input
            type="text"
            value={color}
            onChange={(e) => onColor(e.target.value)}
            spellCheck={false}
            data-testid="input-brand-color-hex"
            className="rounded-lg text-[13px]"
            style={{ flex: 1, minWidth: 0, padding: "7px 11px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)", color: "#f5f5f7", fontVariantNumeric: "tabular-nums" }}
          />
        </div>

        {/* Logo — current + replace, same layout as the admin Logo dialog */}
        <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 14 }}>
          <div>
            <div className="text-[11px] font-semibold uppercase" style={{ color: "rgba(245,245,247,0.45)", letterSpacing: 0.8, marginBottom: 8 }}>
              Current logo
            </div>
            <div
              className="rounded-xl flex items-center justify-center"
              style={{ width: 150, height: 150, background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="" style={{ width: 104, height: 104, objectFit: "contain", filter: FORCE_WHITE_MARK, opacity: 0.94 }} />
              ) : (
                <span className="text-[12px]" style={{ color: "rgba(245,245,247,0.4)" }}>No logo yet</span>
              )}
            </div>
          </div>
          <div className="flex flex-col">
            <div className="text-[11px] font-semibold uppercase" style={{ color: "rgba(245,245,247,0.45)", letterSpacing: 0.8, marginBottom: 8 }}>
              Replace logo
            </div>
            <label
              className="rounded-xl flex flex-col items-center justify-center text-center transition-colors"
              data-testid="dropzone-brand-logo"
              style={{
                flex: 1,
                minHeight: 0,
                padding: "14px 10px",
                border: "1px dashed rgba(255,255,255,0.22)",
                background: "transparent",
                cursor: "pointer",
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.55)";
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              }}
              onDragLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)";
                e.currentTarget.style.background = "transparent";
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)";
                e.currentTarget.style.background = "transparent";
                const file = e.dataTransfer.files?.[0];
                if (file) onLogoFile(file);
              }}
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "rgba(245,245,247,0.4)" }} />
              ) : (
                <UploadCloud className="w-4 h-4" style={{ color: "rgba(245,245,247,0.4)" }} />
              )}
              <span className="text-[12px] font-medium" style={{ color: "#f5f5f7", marginTop: 7 }}>
                Drag an image here, or click to pick
              </span>
              <span className="text-[11px]" style={{ color: "rgba(245,245,247,0.45)", marginTop: 3 }}>
                SVG only — we recolor it for any surface
              </span>
              <input
                type="file"
                accept=".svg,image/svg+xml"
                data-testid="input-brand-logo"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onLogoFile(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>

        {/* Helper text on its own quiet line under the logo section */}
        <div className="text-[11.5px]" style={{ marginTop: 12, color: "rgba(245,245,247,0.4)" }}>
          Square works best — shown on the cover and center label.
        </div>

        {/* Hairline divider + footer: quiet Reset on the left; Cancel pill +
            filled blue Save pill on the right. */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "14px -20px 0" }} />
        <div className="flex items-center justify-between" style={{ paddingTop: 14 }}>
          <button
            type="button"
            onClick={onReset}
            data-testid="button-brand-reset"
            className="text-[12px] font-medium transition-colors"
            style={{ color: "rgba(245,245,247,0.6)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#f5f5f7")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(245,245,247,0.6)")}
          >
            Reset to default
          </button>
          <div className="flex items-center" style={{ gap: 8 }}>
            <button
              type="button"
              onClick={onCancel}
              data-testid="button-brand-cancel"
              className="rounded-full text-[13px] font-semibold transition-colors"
              style={{ height: 32, padding: "0 14px", background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(245,245,247,0.75)", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || uploading}
              data-testid="button-brand-save"
              className="rounded-full text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center"
              style={{ height: 32, padding: "0 18px", backgroundColor: BLUE, border: "none", cursor: "pointer", gap: 6 }}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function FitScale({ naturalWidth, children }: { naturalWidth: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setScale(w > 0 ? Math.min(1, w / naturalWidth) : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [naturalWidth]);
  return (
    <div ref={ref} className="w-full min-w-0 flex justify-center">
      <div style={scale < 1 ? ({ zoom: scale } as React.CSSProperties) : undefined}>{children}</div>
    </div>
  );
}
export function JacketStage({
  format,
  jacketUrl,
  color,
  labelLogoUrl,
  labelBgColor,
  placeholderIconUrl,
  typeName,
  brandEditable,
  onBrandColor,
  onBrandLogoFile,
  onBrandReset,
  onBrandSave,
  onBrandCancel,
  brandUploading,
  brandSaving,
}: {
  format: AlbumFormat;
  jacketUrl: string | null;
  color: CatalogColor | null;
  labelLogoUrl: string | null;
  labelBgColor: string | null;
  // Item 28 — "Make it yours" branding dialog behind the jacket ⋯. Passed
  // only by the press catalog page; the artist package builder keeps the
  // plain stage (no menu, no dialog).
  brandEditable?: boolean;
  onBrandColor?: (hex: string) => void;
  onBrandLogoFile?: (file: File) => void;
  onBrandReset?: () => void;
  /** Commits staged brand edits; returns false when validation blocks the save. */
  onBrandSave?: () => boolean;
  /** Discards staged brand edits (Cancel / X / backdrop). */
  onBrandCancel?: () => void;
  brandUploading?: boolean;
  brandSaving?: boolean;
  // Bill's rule 2 (handoff v2) — when the album has no uploaded art AND the
  // press has no default jacket, the jacket face is the white product-mark
  // icon at ~45% width on a `#1d1d1f` ink jacket. Passed only by the artist
  // package builder; the press catalog keeps its label-logo fallback.
  placeholderIconUrl?: string | null;
  typeName?: string | null;
}) {
  const dark = useAdminDark();
  const isDouble = format === "12_double";
  const jacketPx = format === "7_inch" ? 175 : 300;
  const DISC = Math.round(jacketPx * 0.96);
  // Blessed reference: label/hole ratios derived from the product size. 7"
  // formats use labelInches 3.3; 12" formats use 3.94.
  const inches = format === "7_inch" ? 7 : 12;
  const labelInches = format === "7_inch" ? 3.3 : 3.94;
  const labelRatio = labelInches / inches;
  const holeRatio = 0.3 / inches;
  // Item 28 hover mechanics — the record slides right while its body spins
  // continuously (360°/8 s, rAF-driven). The specular highlight lives outside
  // the body in VinylDisc, so it stays fixed like a real light source.
  // Leaving freezes the disc mid-turn and surfaces a rewind button below.
  const [hover, setHover] = useState(false);
  const [peek, setPeek] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { bodyRef, onPointerEnter: spinEnter, onPointerLeave: spinLeave, showRewind, rewind } = useVinylSpin();
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
  }, []);
  // Rewind with a peek — the record slides out while it turns back, then
  // tucks back in once the rewind finishes.
  const rewindWithPeek = () => {
    setPeek(true);
    rewind();
    if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
    peekTimerRef.current = setTimeout(() => setPeek(false), 1200);
  };
  const out = hover || peek;
  const bodyRef2 = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = bodyRef2.current;
    if (!el) return;
    el.style.transition = "transform 0.75s cubic-bezier(0.32, 0.72, 0.28, 1) 0.1s";
    el.style.transform = out ? "rotate(18deg)" : "rotate(0deg)";
  }, [out]);
  return (
    <div data-testid="jacket-stage">
      <div className="relative" style={{ width: jacketPx + jacketPx * 0.5, height: jacketPx + 24 }}>
        {/* Hover zone — the discs + jacket + floor shadow. The rewind button
            sits OUTSIDE this zone so clicking it never re-triggers the
            hover spin/slide. */}
        <div
          className="absolute"
          style={{ inset: 0, cursor: "pointer" }}
          onPointerEnter={() => {
            setHover(true);
            spinEnter();
          }}
          onPointerLeave={() => {
            setHover(false);
            spinLeave();
          }}
        >
        {/* Second record (Double LP) — peeks a touch further, on a slight delay */}
        {isDouble && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: (jacketPx - DISC) / 2,
              left: jacketPx - DISC + jacketPx * 0.27,
              transition: "transform 0.55s cubic-bezier(0.32, 0.72, 0.28, 1) 0.1s",
              transform: out ? `translateX(${jacketPx * 0.3}px)` : "translateX(0)",
              willChange: "transform",
              zIndex: 0,
              filter: "brightness(0.88)",
            }}
          >
            <VinylDisc size={DISC} color={color} labelLogoUrl={labelLogoUrl} labelBgColor={labelBgColor} bodyRef={bodyRef2} labelRatio={labelRatio} holeRatio={holeRatio} />
          </div>
        )}
        {/* Record — behind the jacket, slides right on hover (transform only) */}
        <div
          style={{
            position: "absolute",
            top: (jacketPx - DISC) / 2,
            left: jacketPx - DISC + jacketPx * 0.22,
            transition: "transform 0.55s cubic-bezier(0.32, 0.72, 0.28, 1)",
            transform: out ? `translateX(${jacketPx * 0.24}px)` : "translateX(0)",
            willChange: "transform",
            zIndex: 1,
          }}
        >
          <VinylDisc size={DISC} color={color} labelLogoUrl={labelLogoUrl} labelBgColor={labelBgColor} bodyRef={bodyRef} labelRatio={labelRatio} holeRatio={holeRatio} />
        </div>
        {/* Jacket in front — handoff-verbatim: black, square (radius 3), spine hint */}
        <div
          className="absolute left-0 top-0 overflow-hidden"
          style={{
            width: jacketPx,
            height: jacketPx,
            borderRadius: 3,
            backgroundColor: labelBgColor ?? "#141416",
            backgroundImage: dark
              ? "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, transparent 45%)"
              : "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 45%)",
            // Dark-on-dark separation: keep the artwork truly black, but trace a
            // whisper-quiet light hairline around the sleeve and deepen the lift
            // shadow so the cover pops off the near-black page.
            boxShadow: dark
              ? "0 0 0 1px rgba(255,255,255,0.12), 0 22px 48px rgba(0,0,0,0.55), inset -1px 0 0 rgba(255,255,255,0.06)"
              : "0 18px 40px rgba(0,0,0,0.25), inset -1px 0 0 rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2,
          }}
        >
          {jacketUrl ? (
            <img src={jacketUrl} alt="" aria-hidden className="h-full w-full object-cover" />
          ) : placeholderIconUrl ? (
            <img src={placeholderIconUrl} alt="" aria-hidden data-testid="jacket-placeholder-icon" style={{ width: "45%", opacity: 0.95 }} />
          ) : labelLogoUrl ? (
            <img src={labelLogoUrl} alt="" aria-hidden style={{ width: jacketPx * 0.42, height: jacketPx * 0.42, objectFit: "contain", filter: FORCE_WHITE_MARK, opacity: 0.92 }} />
          ) : null}
          {/* spine hint */}
          <span aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 7, background: "linear-gradient(90deg, rgba(0,0,0,0.5), transparent)" }} />
          {/* Item 28 — ⋯ opens the "Make it yours" branding dialog */}
          {brandEditable && (
            <button
              type="button"
              aria-label="Brand options"
              data-testid="button-brand-menu"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(true);
              }}
              className="rounded-full flex items-center justify-center transition-all"
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                zIndex: 5,
                width: 28,
                height: 28,
                opacity: hover || menuOpen ? 1 : 0,
                pointerEvents: hover || menuOpen ? "auto" : "none",
                background: menuOpen ? "rgba(0,0,0,0.44)" : "rgba(0,0,0,0.26)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "none",
                color: "rgba(255,255,255,0.92)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(0,0,0,0.44)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = menuOpen ? "rgba(0,0,0,0.44)" : "rgba(0,0,0,0.26)";
              }}
            >
              <MoreHorizontal style={{ width: 15, height: 15, strokeWidth: 2.2 }} />
            </button>
          )}
        </div>
        {/* floor shadow — fixed size, stretched with a transform so it never repaints mid-hover */}
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            bottom: -6,
            left: jacketPx * 0.1,
            width: jacketPx * 0.9 + jacketPx * 0.22 * 0.6,
            height: 14,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.28)",
            filter: "blur(9px)",
            transform: out ? "scaleX(1.18)" : "scaleX(1)",
            transformOrigin: "30% center",
            transition: "transform 0.55s cubic-bezier(0.32, 0.72, 0.28, 1)",
            willChange: "transform",
          }}
        />
        </div>
        {/* Rewind — outside the hover zone so clicking it never re-triggers
            the spin; centered under the jacket. */}
        <div
          className="absolute"
          style={{ left: `calc(50% - ${Math.round(jacketPx * 0.25)}px)`, transform: "translateX(-50%)", bottom: -14, zIndex: 3 }}
        >
          <RewindButton show={showRewind} onClick={rewindWithPeek} size={28} />
        </div>
      </div>
      {menuOpen && brandEditable && (
        <BrandDialog
          color={labelBgColor ?? "#141416"}
          logoUrl={labelLogoUrl}
          onColor={(v) => onBrandColor?.(v)}
          onLogoFile={(f) => onBrandLogoFile?.(f)}
          onReset={() => onBrandReset?.()}
          onCancel={() => {
            onBrandCancel?.();
            setMenuOpen(false);
          }}
          onSave={() => {
            const ok = onBrandSave?.() ?? true;
            if (ok) setMenuOpen(false);
          }}
          uploading={!!brandUploading}
          saving={!!brandSaving}
        />
      )}
      {/* Captions — shifted left so they center under the jacket, not the whole stage. */}
      <div className="flex flex-col items-center" style={{ transform: `translateX(-${Math.round(jacketPx * 0.25)}px)` }} data-testid="stage-caption">
        <div className="flex items-center gap-2.5 text-[13px]" style={{ marginTop: 28, color: SUBINK }}>
          {color && <ColorBall color={color} size={18} />}
          <span>{format === "7_inch" ? '7"' : '12"'}</span>
          <span style={{ color: dark ? FAINT : "#d1d1d6" }}>·</span>
          <span>{typeName ?? ALBUM_FORMAT_LABEL[format] ?? format}</span>
          {color ? <><span style={{ color: dark ? FAINT : "#d1d1d6" }}>·</span><span className="font-semibold" style={{ color: INK }}>{color.name}</span></> : null}
        </div>
        <div className="text-[12px] text-center" style={{ marginTop: 8, marginBottom: 16, color: FAINT, lineHeight: 1.4 }}>
          Printed jacket{format.startsWith("12") ? " and inner sleeve" : ""} included.
        </div>
      </div>
    </div>
  );
}

// ─── Pick a size ─────────────────────────────────────────────────────
function SizeCard({
  format,
  active,
  hidden,
  onPick,
  onHide,
  onRemove,
  canEdit,
}: {
  format: AlbumFormat;
  active: boolean;
  hidden: boolean;
  onPick: () => void;
  onHide: (hidden: boolean) => void;
  onRemove: () => void;
  canEdit: boolean;
}) {
  const dark = useAdminDark();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="group/size relative">
      <button
        type="button"
        onClick={onPick}
        data-testid={`card-size-${format}`}
        className="w-full rounded-2xl bg-white text-left transition-all focus:outline-none"
        style={{
          border: `1.5px solid ${active ? BLUE : HAIRLINE}`,
          boxShadow: active ? "0 6px 18px rgba(49,158,216,0.16)" : undefined,
          padding: "14px 16px",
          opacity: hidden ? 0.6 : 1,
        }}
      >
        <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK }}>
          {format === "7_inch" ? '7"' : format === "12_lp" ? '12"' : '12"'}
        </div>
        <div className="mt-0.5 text-[12px]" style={{ color: SUBINK }}>
          {VINYL_SIZE_BLURB[format] ?? "\u00A0"}
        </div>
      </button>
      {canEdit && (
        <Popover
          open={menuOpen}
          onOpenChange={(v) => {
            setMenuOpen(v);
            if (!v) setConfirming(false);
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Options for ${ALBUM_FORMAT_LABEL[format]}`}
              data-testid={`button-size-menu-${format}`}
              className={cn(
                "absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full transition-opacity hover:bg-slate-100",
                menuOpen ? "opacity-100" : "opacity-0 group-hover/size:opacity-100",
              )}
              style={{ color: SUBINK }}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="w-60 rounded-2xl p-2"
            style={{
              border: `1px solid ${HAIRLINE}`,
              backgroundColor: dark ? "rgba(28,28,30,0.82)" : "var(--apple-frost, rgba(255,255,255,0.85))",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              boxShadow: dark ? "0 20px 48px rgba(0,0,0,0.55)" : "0 20px 48px rgba(0,0,0,0.16)",
              ...(dark ? { color: INK } : null),
            }}
          >
            <button
              type="button"
              onClick={() => {
                onHide(!hidden);
                setMenuOpen(false);
              }}
              className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-slate-100"
              style={{ color: INK }}
              data-testid={`button-size-hide-${format}`}
            >
              {hidden ? "Show to artists" : "Hide from artists"}
              <span className="block text-[11.5px] font-normal" style={{ color: SUBINK }}>
                {hidden
                  ? "Put this size back in the artist picker."
                  : "Keeps pricing and colors — just not offered."}
              </span>
            </button>
            {!confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-rose-50"
                style={{ color: criticalColor(dark) }}
                data-testid={`button-size-remove-${format}`}
              >
                Remove size…
              </button>
            ) : (
              <div className="rounded-lg px-3 py-2" style={{ backgroundColor: dark ? CRITICAL_WASH : "rgba(224,36,94,0.06)" }}>
                <p className="text-[12px]" style={{ color: INK }}>
                  Removing deletes this size&rsquo;s pricing from the artist picker. Colors and
                  saved ladders stay in the database.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onRemove();
                    setMenuOpen(false);
                  }}
                  className="mt-1.5 text-[12.5px] font-semibold"
                  style={{ color: criticalColor(dark) }}
                  data-testid={`button-size-remove-confirm-${format}`}
                >
                  Remove {ALBUM_FORMAT_LABEL[format]}
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

// ─── Pick a type (color group) card ──────────────────────────────────
function GroupCard({
  tier,
  active,
  offeredSizes,
  canRemove,
  onPick,
  onSave,
  onArchive,
  canEdit,
  labelLogoUrl,
  labelBgColor,
}: {
  tier: CatalogTier;
  active: boolean;
  /** Sizes this type is currently pressed in (derived from sibling formats). */
  offeredSizes: string[];
  canRemove: boolean;
  onPick: () => void;
  onSave: (name: string, sizes: string[]) => void;
  onArchive: () => void;
  canEdit: boolean;
  labelLogoUrl: string | null;
  labelBgColor: string | null;
}) {
  const dark = useAdminDark();
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState(tier.name);
  const [sizes, setSizes] = useState<string[]>(offeredSizes);
  useEffect(() => {
    if (menuOpen) {
      setName(tier.name);
      setSizes(offeredSizes);
    }
  }, [menuOpen, tier.name, offeredSizes]);
  const canSave = name.trim().length > 0 && sizes.length > 0;
  const toggleSize = (s: string) =>
    setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const preview = tier.colors[0] ?? null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
      aria-pressed={active}
      data-testid={`card-type-${tier.id}`}
      className="group/type relative rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 14, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <div className="flex justify-center" style={{ marginBottom: 10 }}>
        <VinylDisc size={90} color={preview} labelLogoUrl={labelLogoUrl} labelBgColor={labelBgColor} />
      </div>
      {/* One line, always — long names truncate and hover reveals the full
          name, so every tile in a row keeps the same height. */}
      <div className="text-[13.5px] font-semibold leading-tight truncate" title={tier.name} style={{ color: active ? BLUE : INK }}>
        {tier.name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 2, color: FAINT }}>
        {tier.colors.length} {tier.colors.length === 1 ? "color" : "colors"}
      </div>
      {canEdit && (
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Edit ${tier.name}`}
              data-testid={`button-type-menu-${tier.id}`}
              className={cn(
                "absolute inline-flex items-center justify-center rounded-full transition-opacity focus:outline-none focus-visible:ring-2",
                dark ? "focus-visible:ring-white/30" : "focus-visible:ring-slate-300",
                menuOpen ? "opacity-100" : "opacity-0 group-hover/type:opacity-100 group-focus-within/type:opacity-100",
              )}
              style={{
                top: 8,
                right: 8,
                zIndex: 2,
                width: 26,
                height: 26,
                backgroundColor: dark ? "rgba(38,38,42,0.88)" : "rgba(255,255,255,0.88)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: `1px solid ${HAIRLINE}`,
                boxShadow: dark ? "0 1px 3px rgba(0,0,0,0.45)" : "0 1px 3px rgba(0,0,0,0.10)",
                color: SUBINK,
              }}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-80 p-0 rounded-2xl overflow-hidden"
            style={frostedPanel(dark)}
            data-testid={`popover-edit-group-${tier.id}`}
          >
            <div style={{ padding: 18 }}>
              <div className="text-[15px] font-semibold tracking-tight" style={{ color: INK }}>
                Edit type. <span style={{ color: FAINT, fontWeight: 600 }}>{tier.name}.</span>
              </div>
              <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 2, lineHeight: 1.4 }}>
                Sizes here gate the whole type &mdash; every color in it.
              </p>
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <FieldLabel>Type name</FieldLabel>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={cn(
                      "text-[13.5px] focus:outline-none transition-colors",
                      dark ? "focus:border-white/30" : "focus:border-slate-400",
                    )}
                    style={fieldInput(dark)}
                    data-testid={`input-group-name-${tier.id}`}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <FieldLabel>Pressed in these sizes</FieldLabel>
                  {/* Size gating has no persistence route yet (tiers are
                      per-format server-side), so the chips are DISPLAY-ONLY —
                      they show the type's real offered sizes but can't be
                      toggled. Interactive toggling silently discarding the
                      change would be worse than read-only. Re-enable when a
                      size-gating endpoint ships. */}
                  <div className="flex items-center gap-2" style={{ pointerEvents: "none" }}>
                    {SIZES.map((s) => (
                      <SizeChip key={s} size={s} active={sizes.includes(s)} onToggle={() => toggleSize(s)} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3" style={{ padding: "12px 18px", borderTop: `1px solid ${HAIRLINE}` }}>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors hover:bg-slate-100"
                style={{ color: SUBINK }}
                data-testid={`button-cancel-group-${tier.id}`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canSave}
                onClick={() => {
                  onSave(name.trim(), sizes);
                  setMenuOpen(false);
                }}
                className="text-[13px] font-semibold rounded-full px-4 py-1.5 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: BLUE }}
                data-testid={`button-save-group-${tier.id}`}
              >
                Save
              </button>
            </div>
            {/* Archive — Apple convention: destructive-adjacent action gets its own
                hairline-separated full-width row at the very bottom. Archive (not
                delete): pressed records keep their history; the type just retires. */}
            <button
              type="button"
              disabled={!canRemove}
              onClick={() => {
                onArchive();
                setMenuOpen(false);
              }}
              className="w-full text-[13px] font-semibold transition-colors disabled:opacity-40"
              style={{ padding: "12px 18px", borderTop: `1px solid ${HAIRLINE}`, color: criticalColor(dark), textAlign: "center", background: "transparent" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = dark ? CRITICAL_WASH : "#fdeef2")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              data-testid={`button-archive-group-${tier.id}`}
            >
              Archive type
            </button>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

// ─── Name your price — one vertical strip per run quantity ───────────
type PriceMode = "priced" | "quote" | "off";

function ModePicker({
  mode,
  onChange,
  qty,
  visible,
}: {
  mode: PriceMode;
  onChange: (m: PriceMode) => void;
  qty: number;
  visible: boolean;
}) {
  const dark = useAdminDark();
  // Status hues are brightened on charcoal for legibility (dark canon).
  const priceColor = dark ? "#4cc98a" : "#248a3d";
  const quoteColor = dark ? "#e8b04b" : "#c98a00";
  const buildMeta = (m: PriceMode) => ({
    priced: { label: "Priced", hint: "A clear package price", icon: DollarSign, color: priceColor },
    quote: { label: "Quote", hint: "Ask for a custom quote", icon: HelpCircle, color: quoteColor },
    off: { label: "Off", hint: "Not available at this size", icon: MinusCircle, color: FAINT },
  }[m]);
  const meta = buildMeta(mode);
  const [open, setOpen] = useState(false);
  const opts: PriceMode[] = ["priced", "quote", "off"];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button type="button" className="inline-flex items-center gap-1 rounded-full px-2 h-6 text-[11px] font-semibold transition-colors hover:bg-slate-50" style={{ color: meta.color }}><meta.icon className="w-3 h-3" /><span>{meta.label}</span><ChevronDown className="w-2.5 h-2.5" /></button></PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-64 p-1.5 rounded-2xl" style={{ border: `1px solid ${HAIRLINE}` }}>
        {opts.map((m) => {
          const mm = buildMeta(m);
          const Icon = mm.icon;
          return <button key={m} type="button" onClick={() => { onChange(m); setOpen(false); }} className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-slate-50"><span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ background: m === mode ? (dark ? SEL_WASH : "#f0f7fc") : (dark ? CARD_SOFT : "#f5f5f7"), color: mm.color }}><Icon className="w-3.5 h-3.5" /></span><span className="flex-1"><span className="block text-[13px] font-semibold" style={{ color: INK }}>{mm.label}</span><span className="block text-[11.5px]" style={{ color: SUBINK }}>{mm.hint}</span></span>{m === mode && <Check className="w-3.5 h-3.5" style={{ color: BLUE }} />}</button>;
        })}
      </PopoverContent>
    </Popover>
  );
}

function AddRunSizePopover({ onAdd, existing }: { onAdd: (qty: number) => void; existing: number[] }) {
  const dark = useAdminDark();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const qty = Number(value.replace(/[^0-9]/g, ""));
  const valid = Number.isInteger(qty) && qty > 0 && !existing.includes(qty);
  const submit = () => {
    if (!valid) return;
    onAdd(qty);
    setValue("");
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="button-add-run-size"
          className="flex items-center gap-1.5 rounded-full px-2.5 h-7 text-[12px] font-semibold transition-colors hover:bg-slate-100"
          style={{ color: SUBINK }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add run size
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-64 rounded-2xl p-4"
        style={{
          border: `1px solid ${HAIRLINE}`,
          backgroundColor: dark ? "rgba(28,28,30,0.82)" : "var(--apple-frost, rgba(255,255,255,0.85))",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: dark ? "0 20px 48px rgba(0,0,0,0.55)" : "0 20px 48px rgba(0,0,0,0.16)",
          ...(dark ? { color: INK } : null),
        }}
        data-testid="popover-add-run-size"
      >
        <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: SUBINK }}>
          Units in the run
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="e.g. 750"
            className={cn(
              "w-full text-[13.5px] tabular-nums focus:outline-none",
              dark ? "focus:border-white/30" : "bg-white focus:border-slate-400",
            )}
            style={{ height: 38, border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: "0 12px", color: INK, ...(dark ? { background: CARD_SOFT } : null) }}
            data-testid="input-add-run-size"
          />
          <button
            type="button"
            disabled={!valid}
            onClick={submit}
            className="rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors hover:bg-slate-100 disabled:opacity-40"
            style={{ color: BLUE }}
            data-testid="button-add-run-size-confirm"
          >
            Add
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main page ───────────────────────────────────────────────────────
// hint: Logic changed on both sides. Requires understanding intent of each change.
export function PressPackagePricingCatalog({
  pressId,
  pressDomain,
  placeholderUrl = null,
  pressLogoUrl = null,
  hideHeading = false,
  onOpenColors,
}: {
  pressId: string;
  pressDomain: string | null;
  placeholderUrl?: string | null;
  pressLogoUrl?: string | null;
  hideHeading?: boolean;
  onOpenColors?: () => void;
}) {
  const { toast } = useToast();
  const dark = useAdminDark();

  // Role gate — identical to the legacy panel.
  const { data: roleInfo } = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
  });
  const canView =
    roleInfo?.role === "super_admin" ||
    roleInfo?.role === "admin" ||
    (roleInfo?.role === "manufacturer" && roleInfo?.roleScopeId === pressId);
  const { data: catalogRaw, isLoading } = useQuery<Catalog | { data: Catalog }>({
    queryKey: ["/api/admin/manufacturers", pressId, "catalog"],
    enabled: !!pressId && !!canView,
  });
  // Older admin query clients sometimes return the JSON envelope; normalize it
  // once so every press reads the same live formats/tiers payload.
  const catalog = ((catalogRaw as { data?: Catalog } | undefined)?.data ?? catalogRaw) as Catalog | undefined;
  const canEdit = catalog?.canEdit !== false;
  // Press branding for the disc center label (portal + god-view).
  const { data: pressRow } = useQuery<{ labelLogoUrl?: string | null; labelBgColor?: string | null; logoUrl?: string | null }>({
    queryKey: ["/api/manufacturers", pressId],
    enabled: !!pressId && !!canView,
  });
  // Fall back to the press's square logo so white-label instances (Viryl / PMP /
  // Hellbender) show their own mark on the jacket instead of nothing.
  // Item 28 — "Make it yours" branding dialog. Local overrides render
  // instantly (color picker drags, fresh logo upload); the PUT persists and
  // the refetch reconciles. `undefined` = no override, `null` = reset.
  const [brandColorDraft, setBrandColorDraft] = useState<string | null | undefined>(undefined);
  const [brandLogoDraft, setBrandLogoDraft] = useState<string | null | undefined>(undefined);
  const [brandUploading, setBrandUploading] = useState(false);
  const labelLogoUrl = (brandLogoDraft !== undefined ? brandLogoDraft : pressRow?.labelLogoUrl) ?? pressRow?.logoUrl ?? null;
  const labelBgColor = brandColorDraft !== undefined ? brandColorDraft : (pressRow?.labelBgColor ?? null);
  const saveBranding = useMutation({
    mutationFn: async (body: { labelBgColor?: string | null; labelLogoUrl?: string | null }) => {
      const r = await apiRequest("PUT", `/api/admin/manufacturers/${pressId}/catalog/branding`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers", pressId] });
    },
    onError: (e: Error) =>
      toast({ title: "Couldn't save branding", description: e.message, variant: "destructive" }),
  });
  // Draft-until-Save: every edit only stages a draft (the jacket/label
  // preview updates live). Save commits the drafts in one PUT; Cancel and
  // the X drop them, restoring what was there when the dialog opened.
  const onBrandColor = (hex: string) => setBrandColorDraft(hex);
  const onBrandLogoFile = async (file: File) => {
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    if (!isSvg) {
      toast({ title: "SVG only", description: "The logo is recolored for any surface, so it must be an SVG.", variant: "destructive" });
      return;
    }
    setBrandUploading(true);
    try {
      const url = await uploadAdminDoc(file);
      setBrandLogoDraft(url); // staged — persists only on Save
    } catch (e: any) {
      toast({ title: "Couldn't upload logo", description: e?.message, variant: "destructive" });
    } finally {
      setBrandUploading(false);
    }
  };
  const onBrandReset = () => {
    // Stage the platform default; commits on Save like any other edit.
    setBrandColorDraft(null);
    setBrandLogoDraft(null);
  };
  const onBrandCancel = () => {
    setBrandColorDraft(undefined);
    setBrandLogoDraft(undefined);
  };
  const onBrandSave = () => {
    const body: { labelBgColor?: string | null; labelLogoUrl?: string | null } = {};
    if (brandColorDraft !== undefined) {
      // Guard mid-typing hex — commit only a full #rrggbb (or a reset).
      if (brandColorDraft !== null && !/^#[0-9a-fA-F]{6}$/.test(brandColorDraft)) {
        toast({ title: "Check the color", description: "Use a full hex value like #e40a13.", variant: "destructive" });
        return false;
      }
      body.labelBgColor = brandColorDraft;
    }
    if (brandLogoDraft !== undefined) body.labelLogoUrl = brandLogoDraft;
    if (Object.keys(body).length > 0) {
      saveBranding.mutate(body, {
        onSuccess: () => {
          setBrandColorDraft(undefined);
          setBrandLogoDraft(undefined);
        },
      });
    }
    return true;
  };

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/admin/manufacturers", pressId, "catalog"] });

  // ── Format selection (vinyl sizes only; CD and cassette are coming)
  const [activeTab, setActiveTab] = useState<CatalogTab | null>(null);
  useEffect(() => {
    if (!catalog) return;
    // Item 28 — "Don't offer this size" grays the card; the active tab must
    // fall back to the first still-offered size when the current one hides.
    const visible = catalog.formats.filter((f) => !f.hidden).map((f) => f.format);
    const offeredList = visible.length > 0 ? visible : catalog.formats.map((f) => f.format);
    if (activeTab === null) {
      // Deep-link: ?catalogFormat=vinyl_12 preselects a size (parity screenshots)
      const wanted = new URLSearchParams(window.location.search).get("catalogFormat");
      if (wanted && VINYL_FORMATS.includes(wanted as AlbumFormat) && offeredList.includes(wanted as AlbumFormat)) {
        setActiveTab(wanted as AlbumFormat);
        return;
      }
      // 12" LP is the default when the press offers it (Bill: not 7").
      setActiveTab(
        offeredList.includes("12_lp")
          ? "12_lp"
          : VINYL_FORMATS.find((f) => offeredList.includes(f)) ?? "12_lp",
      );
      return;
    }
    if (!offeredList.includes(activeTab as AlbumFormat)) {
      setActiveTab(
        offeredList.includes("12_lp")
          ? "12_lp"
          : VINYL_FORMATS.find((f) => offeredList.includes(f)) ?? "12_lp",
      );
    }
  }, [catalog, activeTab]);

  const offered = new Set((catalog?.formats ?? []).map((f) => f.format));
  // Item 28 — ⋯ on a size card toggles "Don't offer this size" (reversible
  // gray-out; the format PUT's non-destructive hidden flag).
  const [sizeMenuId, setSizeMenuId] = useState<AlbumFormat | null>(null);
  const setSizeOffered = useMutation({
    mutationFn: async ({ format, hidden }: { format: AlbumFormat; hidden: boolean }) => {
      const r = await apiRequest("PUT", `/api/admin/manufacturers/${pressId}/catalog/formats/${format}`, { hidden });
      return r.json();
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: "Couldn't update size", description: e.message, variant: "destructive" }),
  });
  const fmt = activeTab as AlbumFormat | null;
  // handoff/cd-cassette-catalog — which media family the pill row shows.
  // CD/cassette have a fixed product structure and render their own bodies;
  // vinyl keeps everything below untouched.
  const [mediaTab, setMediaTab] = useState<"vinyl" | "cd" | "cassette">(() => {
    // Deep-linkable (?media=cd|cassette) so portal/feedback links land on the
    // right family (partner-portal tab-in-URL convention).
    const m = new URLSearchParams(window.location.search).get("media");
    return m === "cd" || m === "cassette" ? m : "vinyl";
  });
  // Item 28 — hide/restore print-prep template tiles (per-format; server
  // default when never touched is ["booklet"]).
  const setHiddenTemplates = useMutation({
    mutationFn: async (keys: string[]) => {
      const r = await apiRequest("PUT", `/api/admin/manufacturers/${pressId}/catalog/formats/${fmt}`, { hiddenTemplates: keys });
      return r.json();
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: "Couldn't update templates", description: e.message, variant: "destructive" }),
  });
  const fmtRow: CatalogFormat | null =
    (fmt && catalog?.formats.find((f) => f.format === fmt)) || null;
  const isVinyl = !!fmt && VINYL_FORMATS.includes(fmt);
  const tiers = fmtRow?.tiers ?? [];

  // ── Tier (type) selection
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const pendingTierIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (tiers.length === 0) {
      if (selectedTierId !== null) setSelectedTierId(null);
      pendingTierIdRef.current = null;
      return;
    }
    if (pendingTierIdRef.current) {
      if (tiers.some((t) => t.id === pendingTierIdRef.current)) pendingTierIdRef.current = null;
      else return;
    }
    if (!tiers.some((t) => t.id === selectedTierId)) {
      // Deep-link: ?catalogTier=<name> preselects a type (parity screenshots)
      const wantedTier = new URLSearchParams(window.location.search).get("catalogTier");
      const match = wantedTier ? tiers.find((t) => t.name.toLowerCase() === wantedTier.toLowerCase()) : null;
      // Handoff default: the page opens on the Black type (Classic Black), not
      // whichever tier happens to sort first. Prefer the Black tier by name;
      // fall back to the first tier only when a press has no Black type.
      const blackDefault = tiers.find((t) => t.name.trim().toLowerCase() === "black");
      setSelectedTierId((match ?? blackDefault ?? tiers[0]).id);
    }
  }, [tiers, selectedTierId]);
  const selectedTier = tiers.find((t) => t.id === selectedTierId) ?? null;

  // Handoff v2 — the "Pick a type" step collapses to a one-line summary once a
  // type is chosen (and on first load, since Black is pre-picked). "Change"
  // re-expands the grid; picking a type collapses it again.
  const [typeSectionOpen, setTypeSectionOpen] = useState(false);

  // ── Color selection (drives the stage)
  const colors = selectedTier?.colors ?? [];
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null);
  const colorIds = colors.map((c) => c.id).join(",");
  useEffect(() => {
    if (colors.length === 0) {
      if (selectedColorId !== null) setSelectedColorId(null);
      return;
    }
    if (!colors.some((c) => c.id === selectedColorId)) setSelectedColorId(colors[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorIds]);
  const selectedColor = colors.find((c) => c.id === selectedColorId) ?? null;

  // ── Tier & color mutations
  const addTier = useMutation({
    mutationFn: async (name: string) => {
      const r = await apiRequest(
        "POST",
        `/api/admin/manufacturers/${pressId}/catalog/formats/${fmt}/tiers`,
        { name },
      );
      return r.json() as Promise<{ id: string }>;
    },
    onSuccess: (row) => {
      pendingTierIdRef.current = row.id;
      setSelectedTierId(row.id);
      invalidate();
    },
    onError: (e: any) =>
      toast({ title: "Couldn't add type", description: e?.message, variant: "destructive" }),
  });
  const renameTier = useMutation({
    mutationFn: async (args: { id: string; name: string }) => {
      const r = await apiRequest("PATCH", `/api/admin/manufacturers/${pressId}/catalog/tiers/${args.id}`, {
        name: args.name,
      });
      return r.json();
    },
    onSuccess: invalidate,
    onError: (e: any) =>
      toast({ title: "Couldn't rename type", description: e?.message, variant: "destructive" }),
  });
  const deleteTier = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/manufacturers/${pressId}/catalog/tiers/${id}`);
    },
    onSuccess: invalidate,
    onError: (e: any) =>
      toast({ title: "Couldn't delete type", description: e?.message, variant: "destructive" }),
  });
  const [addColorOpen, setAddColorOpen] = useState(false);
  const [editColorId, setEditColorId] = useState<string | null>(null);
  const addColor = useMutation({
    mutationFn: async (v: { name: string; swatchHex: string | null; swatchImageUrl: string | null }) => {
      if (!selectedTier) throw new Error("Pick a type first.");
      const r = await apiRequest(
        "POST",
        `/api/admin/manufacturers/${pressId}/catalog/tiers/${selectedTier.id}/colors`,
        v,
      );
      return r.json() as Promise<{ id: string }>;
    },
    onSuccess: (row) => {
      setAddColorOpen(false);
      setSelectedColorId(row.id);
      invalidate();
    },
    onError: (e: any) =>
      toast({ title: "Couldn't add color", description: e?.message, variant: "destructive" }),
  });
  const patchColor = useMutation({
    mutationFn: async (args: {
      id: string;
      body: { name: string; swatchHex: string | null; swatchImageUrl: string | null };
    }) => {
      const r = await apiRequest(
        "PATCH",
        `/api/admin/manufacturers/${pressId}/catalog/colors/${args.id}`,
        args.body,
      );
      return r.json();
    },
    onSuccess: () => {
      setEditColorId(null);
      invalidate();
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save color", description: e?.message, variant: "destructive" }),
  });
  const deleteColor = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/manufacturers/${pressId}/catalog/colors/${id}`);
    },
    onSuccess: () => {
      setEditColorId(null);
      invalidate();
    },
    onError: (e: any) =>
      toast({ title: "Couldn't remove color", description: e?.message, variant: "destructive" }),
  });
  // Handoff v2.1 — drag a tile onto another to reorder (replaces the
  // ManageColorsPanel modal). Order updates live in a local override while
  // dragging; the drop persists through the SAME /colors/reorder endpoint
  // the modal used, so artists see the saved order on their package picker.
  const [dragColorId, setDragColorId] = useState<string | null>(null);
  const [colorOrderDraft, setColorOrderDraft] = useState<string[] | null>(null);
  const reorderColors = useMutation({
    mutationFn: async (colorIds: string[]) => {
      if (!selectedTier) throw new Error("Pick a type first.");
      await apiRequest(
        "POST",
        `/api/admin/manufacturers/${pressId}/catalog/tiers/${selectedTier.id}/colors/reorder`,
        { colorIds },
      );
    },
    onSuccess: () => {
      setColorOrderDraft(null);
      invalidate();
    },
    onError: (e: any) => {
      setColorOrderDraft(null);
      toast({ title: "Couldn't reorder colors", description: e?.message, variant: "destructive" });
    },
  });
  // Type reorder persistence — no batch tiers/reorder route exists, so commit
  // the new order by PATCHing each tier's `position` (an existing field on the
  // PATCH tiers route). Artists see this order on their package picker.
  const reorderTiers = useMutation({
    mutationFn: async (tierIds: string[]) => {
      // Sequential (not Promise.all) so a mid-flight failure leaves a
      // prefix-consistent order instead of an arbitrary partial shuffle.
      for (let i = 0; i < tierIds.length; i++) {
        await apiRequest("PATCH", `/api/admin/manufacturers/${pressId}/catalog/tiers/${tierIds[i]}`, {
          position: i,
        });
      }
    },
    onSuccess: invalidate,
    onError: (e: any) => {
      // Some PATCHes may have landed — refetch server truth so the grid
      // never shows an order the server doesn't have.
      invalidate();
      toast({ title: "Couldn't reorder types", description: e?.message, variant: "destructive" });
    },
  });

  // ── Reorder is an explicit MODE (handoff item 21) — tiles are never
  // draggable at rest, so a stray cursor can't shuffle the catalog. Enter,
  // drag, then Done commits (through the existing reorder endpoints) or
  // Cancel restores the order captured when the mode was entered.
  const [reorderTypesOn, setReorderTypesOn] = useState(false);
  const [reorderColorsOn, setReorderColorsOn] = useState(false);
  const [tierOrderDraft, setTierOrderDraft] = useState<string[] | null>(null);
  const [dragTierId, setDragTierId] = useState<string | null>(null);

  // ── Pricing drafts — semantics copied from the legacy CatalogEditor.
  // Key = `${format}:${tierId}`. A qty is OFFERED when a saved rung exists
  // or the operator flips it on; offered+price = Priced (confirmed:true),
  // offered+blank = Quote (confirmed:false), not offered = no rung.
  const [drafts, setDrafts] = useState<Record<string, Record<number, string>>>({});
  const [offeredDrafts, setOfferedDrafts] = useState<Record<string, Set<number>>>({});
  const [extraQuantities, setExtraQuantities] = useState<number[]>([]);
  // Item 28 — two price books, 140 g and 180 g. They share run sizes (adding
  // one adds it to both weights); each keeps its own numbers. Draft keys are
  // `${format}:${tierId}:${weight}` so edits in one book never clobber the
  // other.
  const [weight, setWeight] = useState<"140" | "180">("140");

  const defaultJacketId = fmtRow?.defaultJacketId ?? catalog?.defaultJacketId ?? null;
  const ladderForTier = (
    tier: CatalogTier | null,
    fRow: CatalogFormat | null,
    w: "140" | "180" = "140",
  ): { qty: number; unitCents: number; confirmed?: boolean; offered?: boolean }[] => {
    if (!tier || !catalog) return [];
    const jId = fRow?.defaultJacketId ?? catalog.defaultJacketId;
    if (w === "180") {
      if (jId && tier.laddersByJacket180?.[jId]) return tier.laddersByJacket180[jId];
      return [];
    }
    if (jId && tier.laddersByJacket[jId]) return tier.laddersByJacket[jId];
    return tier.priceLadder ?? [];
  };
  const savedLadder = ladderForTier(selectedTier, fmtRow, weight);
  const comboKey = fmt && selectedTier ? `${fmt}:${selectedTier.id}:${weight}` : null;

  // ── Which sizes a type is pressed in (handoff item 20). Real data has no
  // per-tier size field — a tier lives inside one format, and the server
  // mirrors same-named tiers across sibling formats. So a type's offered
  // sizes = the size labels of every format that carries a same-named tier.
  const FORMAT_TO_SIZE: Record<string, string> = { "7_inch": '7"', "12_lp": '12"', "12_double": '12"' };
  const offeredSizesForTier = (tierName: string): string[] => {
    const set = new Set<string>();
    for (const f of catalog?.formats ?? []) {
      if (f.tiers.some((t) => t.name.trim().toLowerCase() === tierName.trim().toLowerCase())) {
        const s = FORMAT_TO_SIZE[f.format];
        if (s) set.add(s);
      }
    }
    return SIZES.filter((s) => set.has(s));
  };

  // Flat list of every color across all types (current format) — feeds the
  // find-a-color catalog search popover (handoff item 21b).
  const catalogList: CatalogEntry[] = useMemo(
    () =>
      tiers.flatMap((t) =>
        t.colors.map((c) => ({ color: c, tierId: t.id, tierName: t.name })),
      ),
    [tiers],
  );
  const selectFromCatalog = (tierId: string, colorId: string) => {
    setSelectedTierId(tierId);
    setSelectedColorId(colorId);
  };

  // Reorder mode begin/commit/cancel — snapshot captured on entry so Cancel
  // restores exactly. Done commits through the existing reorder endpoints.
  const beginReorderTypes = () => {
    setTierOrderDraft(tiers.map((t) => t.id));
    setReorderTypesOn(true);
  };
  const endReorderTypes = (commit: boolean) => {
    if (commit && tierOrderDraft && tierOrderDraft.join(",") !== tiers.map((t) => t.id).join(",")) {
      reorderTiers.mutate(tierOrderDraft);
    }
    setTierOrderDraft(null);
    setDragTierId(null);
    setReorderTypesOn(false);
  };
  const beginReorderColors = () => {
    setColorOrderDraft(colors.map((c) => c.id));
    setReorderColorsOn(true);
  };
  const endReorderColors = (commit: boolean) => {
    if (commit && colorOrderDraft && colorOrderDraft.join(",") !== colors.map((c) => c.id).join(",") && colorOrderDraft.length > 1) {
      reorderColors.mutate(colorOrderDraft);
    } else {
      setColorOrderDraft(null);
    }
    setDragColorId(null);
    setReorderColorsOn(false);
  };

  const columns = useMemo(() => {
    const set = new Set<number>(DEFAULT_QTY_COLUMNS);
    for (const f of catalog?.formats ?? []) {
      for (const t of f.tiers) {
        for (const r of t.priceLadder ?? []) set.add(r.qty);
        for (const j of Object.keys(t.laddersByJacket))
          for (const r of t.laddersByJacket[j]) set.add(r.qty);
        // Item 28 — run sizes are shared across both weight books.
        for (const j of Object.keys(t.laddersByJacket180 ?? {}))
          for (const r of (t.laddersByJacket180 ?? {})[j]) set.add(r.qty);
      }
    }
    for (const q of extraQuantities) set.add(q);
    return Array.from(set).sort((a, b) => a - b);
  }, [catalog, extraQuantities]);

  const savedRungKey = comboKey
    ? savedLadder
        .map((r) => `${r.qty}:${r.offered === false ? "x" : r.confirmed === false ? "q" : "p"}`)
        .sort()
        .join(",")
    : "";
  useEffect(() => {
    if (!comboKey) return;
    setOfferedDrafts((prev) => ({
      ...prev,
      [comboKey]: new Set(savedLadder.filter((r) => r.offered !== false).map((r) => r.qty)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comboKey, savedRungKey]);

  const modeFor = (q: number): PriceMode => {
    if (!comboKey) return "off";
    const offeredSet =
      offeredDrafts[comboKey] ??
      new Set(savedLadder.filter((r) => r.offered !== false).map((r) => r.qty));
    if (!offeredSet.has(q)) return "off";
    const d = drafts[comboKey];
    const raw =
      d && Object.prototype.hasOwnProperty.call(d, q)
        ? d[q]
        : (() => {
            const s = savedLadder.find((r) => r.qty === q);
            return s && s.confirmed !== false ? formatDollars(s.unitCents) : "";
          })();
    return raw.trim() === "" ? "quote" : "priced";
  };
  const cellValue = (q: number): string => {
    if (!comboKey) return "";
    const d = drafts[comboKey];
    if (d && Object.prototype.hasOwnProperty.call(d, q)) return d[q];
    const saved = savedLadder.find((r) => r.qty === q);
    if (!saved || saved.confirmed === false) return "";
    return formatDollars(saved.unitCents);
  };
  const setCellValue = (q: number, v: string) => {
    if (!comboKey) return;
    setDrafts((prev) => ({ ...prev, [comboKey]: { ...(prev[comboKey] ?? {}), [q]: v } }));
  };
  const setMode = (q: number, m: PriceMode) => {
    if (!comboKey) return;
    setOfferedDrafts((prev) => {
      const cur =
        prev[comboKey] ??
        new Set<number>(savedLadder.filter((r) => r.offered !== false).map((r) => r.qty));
      const next = new Set(cur);
      if (m === "off") next.delete(q);
      else next.add(q);
      return { ...prev, [comboKey]: next };
    });
    if (m === "quote") setCellValue(q, "");
  };

  const buildLadder = (
    cKey: string,
    saved: { qty: number; unitCents: number; confirmed?: boolean; offered?: boolean }[],
  ): { ladder: { qty: number; unitCents: number; confirmed: boolean; offered?: boolean }[]; error: string | null } => {
    const off =
      offeredDrafts[cKey] ??
      new Set<number>(saved.filter((r) => r.offered !== false).map((r) => r.qty));
    const dr = drafts[cKey] ?? {};
    const out: { qty: number; unitCents: number; confirmed: boolean; offered?: boolean }[] = [];
    for (const q of columns) {
      // Item 28 — "Not offered" rungs persist with offered:false so the run
      // size stays shared across both weight books (server keeps qty sets in
      // lockstep; dropping the rung entirely would delete it from BOTH).
      if (!off.has(q)) {
        out.push({ qty: q, unitCents: 0, confirmed: false, offered: false });
        continue;
      }
      let raw: string;
      if (Object.prototype.hasOwnProperty.call(dr, q)) raw = dr[q];
      else {
        const s = saved.find((r) => r.qty === q);
        raw = s && s.confirmed !== false ? formatDollars(s.unitCents) : "";
      }
      const v = (raw ?? "").trim();
      if (!v) {
        out.push({ qty: q, unitCents: 0, confirmed: false });
        continue;
      }
      const cents = parseDollars(v);
      if (cents === null)
        return { ladder: out, error: `"${v}" at qty ${q} isn't a valid dollar amount` };
      out.push({ qty: q, unitCents: cents, confirmed: true });
    }
    return { ladder: out, error: null };
  };
  // Off rungs are dropped before comparing: legacy saved ladders encode "off"
  // as ABSENT while buildLadder now emits explicit offered:false rungs, so
  // comparing them raw would flag every viewed combo dirty.
  const normalize = (l: { qty: number; unitCents: number; confirmed?: boolean; offered?: boolean }[]): string =>
    l
      .slice()
      .filter((r) => r.offered !== false)
      .sort((a, b) => a.qty - b.qty)
      .map((r) => `${r.qty}:${r.confirmed === false ? "Q" : r.unitCents}`)
      .join("|");
  const comboIsDirty = (cKey: string): boolean => {
    if (!catalog) return false;
    const [f, tierId, w] = cKey.split(":");
    const fRow = catalog.formats.find((x) => x.format === f) ?? null;
    const tier = fRow?.tiers.find((t) => t.id === tierId) ?? null;
    if (!tier) return false;
    const saved = ladderForTier(tier, fRow, w === "180" ? "180" : "140");
    const { ladder } = buildLadder(cKey, saved);
    return normalize(ladder) !== normalize(saved);
  };
  const dirtyKeys = useMemo(() => {
    const keys = Array.from(
      new Set<string>([...Object.keys(drafts), ...Object.keys(offeredDrafts)]),
    );
    return keys.filter((k) => comboIsDirty(k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, offeredDrafts, catalog, columns]);
  const anyDirty = dirtyKeys.length > 0;

  // "Save catalog" flushes EVERY dirty combo (the legacy editor saved one
  // combo at a time; the design has a single header save).
  const saveCatalog = useMutation({
    // Snapshot the dirty combos + the exact draft values being flushed so
    // onSuccess can clear ONLY edits that were actually included in this
    // save — anything the operator types mid-flight survives.
    mutationFn: async (): Promise<{
      savedDraftValues: Record<string, Record<number, string>>;
      savedOffered: Record<string, number[]>;
    }> => {
      const savedDraftValues: Record<string, Record<number, string>> = {};
      const savedOffered: Record<string, number[]> = {};
      if (!catalog) return { savedDraftValues, savedOffered };
      for (const cKey of dirtyKeys) {
        savedDraftValues[cKey] = { ...(drafts[cKey] ?? {}) };
        if (offeredDrafts[cKey]) savedOffered[cKey] = Array.from(offeredDrafts[cKey]);
        const [f, tierId, wKey] = cKey.split(":");
        const w: "140" | "180" = wKey === "180" ? "180" : "140";
        const fRow = catalog.formats.find((x) => x.format === f) ?? null;
        const tier = fRow?.tiers.find((t) => t.id === tierId) ?? null;
        if (!tier) continue;
        let jacketId = fRow?.defaultJacketId ?? catalog.defaultJacketId;
        if (!jacketId) {
          const jr = await apiRequest("POST", `/api/admin/manufacturers/${pressId}/catalog/jackets`, {
            name: "Standard",
          });
          jacketId = ((await jr.json()) as { id: string }).id;
        }
        const saved = ladderForTier(tier, fRow, w);
        const { ladder, error } = buildLadder(cKey, saved);
        if (error) throw new Error(error);
        await apiRequest(
          "PUT",
          `/api/admin/manufacturers/${pressId}/catalog/tiers/${tier.id}/jackets/${jacketId}/ladder`,
          { priceLadder: ladder, weight: w },
        );
      }
      return { savedDraftValues, savedOffered };
    },
    onSuccess: ({ savedDraftValues, savedOffered }) => {
      // Clear only draft entries whose value is unchanged since the save
      // snapshot; edits made while the save was in flight stay dirty.
      setDrafts((prev) => {
        const next: Record<string, Record<number, string>> = {};
        for (const [cKey, cur] of Object.entries(prev)) {
          const snap = savedDraftValues[cKey];
          if (!snap) {
            next[cKey] = cur; // combo wasn't part of this save
            continue;
          }
          const kept: Record<number, string> = {};
          for (const [q, v] of Object.entries(cur)) {
            if (!Object.prototype.hasOwnProperty.call(snap, q) || snap[Number(q)] !== v) {
              kept[Number(q)] = v;
            }
          }
          if (Object.keys(kept).length > 0) next[cKey] = kept;
        }
        return next;
      });
      setOfferedDrafts((prev) => {
        const next: Record<string, Set<number>> = {};
        for (const [cKey, cur] of Object.entries(prev)) {
          const snap = savedOffered[cKey];
          if (!snap) {
            next[cKey] = cur;
            continue;
          }
          const snapKey = Array.from(snap).sort((a, b) => a - b).join(",");
          const curKey = Array.from(cur).sort((a, b) => a - b).join(",");
          // Availability changed mid-save → keep the newer draft; otherwise
          // drop it and let the refetched catalog reseed from saved rungs.
          if (curKey !== snapKey) next[cKey] = cur;
        }
        return next;
      });
      toast({ title: "Catalog saved" });
      invalidate();
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save catalog", description: e?.message, variant: "destructive" }),
  });

  // Deep-link scroll: ?catalogSection=section-price etc. (also lets parity
  // screenshots reach lower sections).
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (scrolledRef.current || !catalog) return;
    const target = new URLSearchParams(window.location.search).get("catalogSection");
    if (!target) return;
    const el = document.getElementById(target);
    if (el) {
      el.scrollIntoView({ block: "start" });
      scrolledRef.current = true;
    }
  }, [catalog, selectedTier]);

  if (roleInfo && !canView) return null;

  // Handoff mock: the catalog stage always shows the black printed jacket with
  // the press's label logo inverted — never the white placeholder art (that
  // stays for real albums in the package builder).
  const jacketUrl = null;
  const offeredVinyl = VINYL_FORMATS.filter((f) => offered.has(f));
  const missingVinyl = VINYL_FORMATS.filter((f) => !offered.has(f));

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: "32px 40px 96px" }} data-testid="panel-press-catalog">
      {/* ── Catalog header ── */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <div>
            <h1 className="tracking-tight" style={{ color: INK, fontSize: 32, lineHeight: 1.1, fontWeight: 700 }}>
              Catalog
            </h1>
            <div className="inline-flex items-center rounded-full" style={{ marginTop: 16, padding: 3, backgroundColor: dark ? CARD_SOFT : "#ececf0" }} role="tablist" aria-label="Catalog format">
              {(() => {
                const vinylActive = mediaTab === "vinyl" && !!fmt && VINYL_FORMATS.includes(fmt);
                const pill = (active: boolean) =>
                  active
                    ? { color: BLUE, backgroundColor: dark ? PILL_ACTIVE : "var(--apple-pill, #fff)", boxShadow: dark ? "0 1px 3px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,.08)" }
                    : { color: INK };
                return (
                  <>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={vinylActive}
                      className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold"
                      style={pill(vinylActive)}
                      onClick={() => { setMediaTab("vinyl"); if (offeredVinyl[0]) setActiveTab(offeredVinyl[0]); }}
                      data-testid="format-pill-vinyl"
                    >
                      Vinyl
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mediaTab === "cd"}
                      className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold"
                      style={pill(mediaTab === "cd")}
                      onClick={() => setMediaTab("cd")}
                      data-testid="format-pill-cd"
                    >
                      CD
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mediaTab === "cassette"}
                      className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold"
                      style={pill(mediaTab === "cassette")}
                      onClick={() => setMediaTab("cassette")}
                      data-testid="format-pill-cassette"
                    >
                      Cassette
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
          <div style={{ marginTop: 24 }}>
            <SectionLabel>
              {mediaTab === "cd" ? "CD · Package pricing" : mediaTab === "cassette" ? "Cassette · Package pricing" : "Vinyl · Package pricing"}
            </SectionLabel>
          {!hideHeading ? (
              <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
              <span style={{ color: INK }}>
                Build your GoodTunes
                <span style={{ fontSize: "0.38em", fontWeight: 400, verticalAlign: "super", position: "relative", top: "-0.15em" }}>®</span>
                {" packages."}
                {" "}
              </span>
              <span style={{ color: FAINT, fontWeight: 600 }}>{mediaTab === "cd" ? "On disc." : mediaTab === "cassette" ? "On tape." : "For the record."}</span>
            </h1>
          ) : (
            <h2 className="tracking-tight" style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
              <span style={{ color: INK }}>
                Build your GoodTunes
                <span style={{ fontSize: "0.38em", fontWeight: 400, verticalAlign: "super", position: "relative", top: "-0.15em" }}>®</span>
                {" packages."}
                {" "}
              </span>
              <span style={{ color: FAINT, fontWeight: 600 }}>{mediaTab === "cd" ? "On disc." : mediaTab === "cassette" ? "On tape." : "For the record."}</span>
            </h2>
          )}
           <p className="text-[15px]" style={{ color: SUBINK, marginTop: 12, maxWidth: 560, lineHeight: 1.5 }}>
            {mediaTab === "cd"
              ? "Every CD is a 12 cm silver disc. What you choose here is how it's printed, what it lives in, and what the booklet holds."
              : mediaTab === "cassette"
                ? "One shell, one speed. What you choose here is the shell color, how the shell gets its ink, and what wraps it."
                : "Quote the way you already do — a single cost per finished package, per run size. Record, jacket, inner sleeve, and labels are all in it. No per-piece math."}
          </p>
          </div>
        </div>
      </div>

      {canEdit && anyDirty && (
        <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 flex items-center gap-4 rounded-full px-4 py-2.5"
          style={{ color: INK, background: "var(--apple-glass, rgba(255,255,255,.78))", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: `1px solid ${HAIRLINE}`, boxShadow: "0 12px 32px rgba(0,0,0,.12)" }}
          data-testid="save-bar">
          <span className="text-[13px] font-medium">Edited · Save catalog</span>
          <button type="button" onClick={() => saveCatalog.mutate()} disabled={saveCatalog.isPending}
            className="rounded-full px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50" style={{ backgroundColor: BLUE }} data-testid="button-save-catalog">
            {saveCatalog.isPending ? "Saving…" : "Save catalog"}
          </button>
        </div>
      )}

      {!canEdit && (
        <div
          className="mt-4 rounded-xl px-4 py-2.5 text-[13px]"
          style={{ border: `1px solid ${HAIRLINE}`, backgroundColor: "var(--apple-canvas, #f5f5f7)", color: SUBINK }}
          data-testid="banner-catalog-readonly"
        >
          You have view-only access to this catalog. Only an Owner or Admin can change formats,
          colors, prices, or specs.
        </div>
      )}

      {isLoading || !catalog ? (
        <div className="py-10 text-[13.5px]" style={{ color: SUBINK }}>
          Loading…
        </div>
      ) : mediaTab === "cd" && catalog.cdCatalog ? (
        <CdCatalogBody
          pressId={pressId}
          canEdit={canEdit}
          logoUrl={pressRow?.labelLogoUrl ?? pressRow?.logoUrl ?? pressLogoUrl}
          data={catalog.cdCatalog}
        />
      ) : mediaTab === "cassette" && catalog.cassetteCatalog ? (
        <CassetteCatalogBody
          pressId={pressId}
          canEdit={canEdit}
          logoUrl={pressRow?.labelLogoUrl ?? pressRow?.logoUrl ?? pressLogoUrl}
          data={catalog.cassetteCatalog}
        />
      ) : !fmt ? null : (
        <fieldset disabled={!canEdit} className="mt-8 min-w-0">
          {/* Layout (Bill, Aug 09 2026):
              - Tablet (≥900px) and up: TWO columns — jacket pinned (sticky)
                on the LEFT, size/type sections scrolling on the RIGHT. The
                scroll content must never slide over/under the album.
              - ≥1440px keeps the original wide split (1fr jacket / 620px
                sections) so nothing changes on desktop.
              - Below 900px (phones / iPad portrait): stack, album on top
                scrolling WITH the page (not sticky), sections below.
              CD/cassette tabs have no stage, so they stay single-column at
              every width. Shared by the GoodTunes admin catalog and the
              white-label press portal (both render this component). */}
          <div
            className={cn(
              "grid gap-10 grid-cols-1",
              isVinyl &&
                // Two columns only when the RIGHT column keeps a workable
                // width beside the admin rail. The left stage track's max is
                // a PERCENTAGE (not 460px) so it can't gobble the leftover
                // space before the 1fr right column — a fixed-max minmax
                // track grows to its max before fr tracks get anything,
                // which at 1024–1300px squeezed the sections column to
                // ~124px and pushed its content past the viewport edge
                // (Task #2981).
                "min-[1200px]:grid-cols-[minmax(340px,36%)_minmax(0,1fr)] min-[1440px]:gap-16 min-[1440px]:grid-cols-[minmax(0,1fr)_620px]",
            )}
          >
            {/* ── LEFT: sticky stage (vinyl only) ──
                Sticky (never absolute) so it can't overlap the header, the
                rail, or the white-label "Powered by GoodTunes" footer. The
                column top-anchors at two-col widths (aligned with the top
                of the right-hand sections) and stays pinned via sticky as
                the right column scrolls; no fixed height, so the art is
                never cropped on short viewports. The left padding
                guarantees ≥48px of gutter between the rail and the art
                edge (page padding + this). */}
            {isVinyl && (
              <div className="flex flex-col items-center min-w-0 pt-6 min-[1200px]:pt-0 min-[1200px]:pl-6 min-[1200px]:sticky min-[1200px]:top-[72px] min-[1200px]:self-start">
                {/* Task #2987 — FitScale keeps the fixed-px stage inside the
                    column at every width (see comment on FitScale). */}
                <FitScale naturalWidth={(fmt === "7_inch" ? 175 : 300) * 1.5}>
                  <JacketStage
                    format={fmt}
                    jacketUrl={jacketUrl}
                    color={selectedColor}
                    labelLogoUrl={labelLogoUrl}
                    labelBgColor={labelBgColor}
                      typeName={selectedTier?.name}
                    brandEditable={canEdit}
                    onBrandColor={onBrandColor}
                    onBrandLogoFile={onBrandLogoFile}
                    onBrandReset={onBrandReset}
                    onBrandSave={onBrandSave}
                    onBrandCancel={onBrandCancel}
                    brandUploading={brandUploading}
                    brandSaving={saveBranding.isPending}
                  />
                </FitScale>
              </div>
            )}

            {/* ── RIGHT: sections ── */}
            {/* ── RIGHT: sections ── (plain flow — the old zIndex/background
                slab masked the stacked-sticky overlap, which no longer
                exists: two-col widths pin the stage in its own column and
                phone widths scroll it with the page) */}
            <div className="min-w-0">
              {/* Pick a size */}
              {isVinyl && (
                <section id="section-pick-size" data-testid="section-pick-size">
                  <div>
                    <TwoTone lead="Pick a size." rest="Start your build." />
                    <div style={{ marginTop: 14, display: "flex", gap: 12 }}>
                      {VINYL_FORMATS.map((f) => {
                        const available = offered.has(f);
                        const row = catalog?.formats.find((x) => x.format === f);
                        const off = !!row?.hidden;
                        const active = activeTab === f && !off;
                        const big = f === "7_inch" ? '7"' : '12"';
                        return (
                          <div key={f} className="group relative" style={{ flex: 1 }}>
                            <button type="button" disabled={!available || off} onClick={() => available && !off && setActiveTab(f)}
                              aria-pressed={active}
                              className={cn("w-full rounded-2xl bg-white transition-all focus:outline-none disabled:opacity-40", !off && available && "hover:-translate-y-px")}
                              style={{ padding: "16px 12px", border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: "center", cursor: available && !off ? "pointer" : "default", opacity: off ? 0.4 : undefined }}
                              data-testid={`card-size-${f}`}>
                              <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK }}>{big}</div>
                              <div className="text-[11px]" style={{ marginTop: 3, color: FAINT }}>{off ? "Not offered" : VINYL_SIZE_BLURB[f]}</div>
                            </button>
                            {canEdit && available && (
                              <Popover open={sizeMenuId === f} onOpenChange={(v) => setSizeMenuId(v ? f : null)}>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label={`Options for ${ALBUM_FORMAT_LABEL[f]}`}
                                    data-testid={`size-menu-${f}`}
                                    className={cn(
                                      "absolute inline-flex items-center justify-center rounded-full transition-opacity",
                                      sizeMenuId === f ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                                    )}
                                    style={{ top: 6, right: 6, width: 22, height: 22, background: "var(--apple-fill-quaternary, rgba(120,120,128,0.12))", color: SUBINK }}
                                  >
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent align="end" sideOffset={6} className="w-56 rounded-2xl p-2" style={{ border: `1px solid ${HAIRLINE}` }}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSizeMenuId(null);
                                      setSizeOffered.mutate({ format: f, hidden: !off });
                                    }}
                                    className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-black/5"
                                    style={{ color: INK }}
                                    data-testid={`size-toggle-${f}`}
                                  >
                                    {off ? "Offer this size" : "Don't offer this size"}
                                    <span className="block text-[11.5px] font-normal" style={{ color: SUBINK }}>
                                      {off ? "Put this size back in your catalog." : "Keeps pricing and colors — just not offered."}
                                    </span>
                                  </button>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}

              {isVinyl && <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: "28px 0" }} />}

              {/* Pick a type */}
              <section id="section-pick-type" data-testid="section-pick-type">
                {!typeSectionOpen && selectedTier ? (
                  // Collapsed summary row — disc chip + type name + "Type · n
                  // colors" + a blue Change link that re-expands the grid.
                  <div
                    className="flex items-center gap-3.5"
                    data-testid="row-type-summary"
                  >
                    <VinylDisc
                      size={40}
                      color={selectedTier.colors[0] ?? null}
                      labelLogoUrl={labelLogoUrl}
                      labelBgColor={labelBgColor}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold leading-tight truncate" style={{ color: INK }}>
                        {selectedTier.name}
                      </div>
                      <div className="text-[12px]" style={{ marginTop: 2, color: FAINT }}>
                        Type · {selectedTier.colors.length} {selectedTier.colors.length === 1 ? "color" : "colors"}
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid="button-change-type"
                      onClick={() => setTypeSectionOpen(true)}
                      className="text-[13px] font-semibold flex-shrink-0"
                      style={{ color: BLUE }}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                <>
                <div className="flex items-start justify-between gap-3">
                  <TwoTone lead="Pick a type." rest="Grow your offering." />
                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <span className="text-[12px] tabular-nums" style={{ color: FAINT }}>
                      {catalogList.length} colors
                    </span>
                    <CatalogSearchPopover
                      entries={catalogList}
                      totalCount={catalogList.length}
                      selectedId={selectedColor?.id ?? ""}
                      onPick={selectFromCatalog}
                      labelLogoUrl={labelLogoUrl}
                      labelBgColor={labelBgColor}
                    />
                    {canEdit && tiers.length > 1 && (
                      <ReorderControls
                        on={reorderTypesOn}
                        onBegin={beginReorderTypes}
                        onCommit={() => endReorderTypes(true)}
                        onCancel={() => endReorderTypes(false)}
                        testId="types"
                      />
                    )}
                  </div>
                </div>
                {reorderTypesOn && (
                  <p className="text-[12.5px]" style={{ marginTop: 6, color: BLUE }}>
                    Drag a type onto another to move it — artists see this order. Done keeps it, Cancel puts everything back.
                  </p>
                )}
                {tiers.length === 0 ? (
                  <p className="mt-3 text-[13px]" style={{ color: SUBINK }}>
                    No pressing types yet — add one to start your {ALBUM_FORMAT_LABEL[fmt]} catalog.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 min-[1440px]:grid-cols-4 gap-3" style={{ marginTop: 12 }}>
                    {(tierOrderDraft
                      ? tierOrderDraft
                          .map((id) => tiers.find((t) => t.id === id))
                          .filter((t): t is CatalogTier => !!t)
                      : tiers
                    ).map((t) => (
                      <div
                        key={t.id}
                        draggable={reorderTypesOn}
                        onDragStart={(e) => {
                          if (!reorderTypesOn) return;
                          setDragTierId(t.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          if (!reorderTypesOn || !dragTierId || dragTierId === t.id) return;
                          e.preventDefault();
                          setTierOrderDraft((prev) => {
                            const arr = [...(prev ?? tiers.map((x) => x.id))];
                            const f = arr.indexOf(dragTierId);
                            const to = arr.indexOf(t.id);
                            if (f < 0 || to < 0 || f === to) return prev;
                            arr.splice(to, 0, ...arr.splice(f, 1));
                            return arr;
                          });
                        }}
                        onDragEnd={() => setDragTierId(null)}
                        style={{
                          opacity: dragTierId === t.id ? 0.45 : 1,
                          cursor: reorderTypesOn ? (dragTierId ? "grabbing" : "grab") : undefined,
                        }}
                      >
                        <GroupCard
                          tier={t}
                          active={t.id === selectedTierId}
                          offeredSizes={offeredSizesForTier(t.name)}
                          // No soft-retire (archive) route exists yet, so the
                          // Archive row stays disabled — deleting would destroy
                          // pressed-record history, which archive must not do.
                          canRemove={false}
                          onPick={() => setSelectedTierId(t.id)}
                          onSave={(name, _sizes) => {
                            // Name persists via the real rename route. Sizes gate
                            // the type across formats, but no server route accepts
                            // per-tier size gating yet — wired to real offered sizes
                            // for display; persistence lands with that endpoint.
                            if (name && name !== t.name) renameTier.mutate({ id: t.id, name });
                          }}
                          onArchive={() => {
                            // Archive = retire (keep pressed-record history), NOT delete.
                            // No soft-retire route exists server-side; deleting would
                            // destroy history, so leave archive inert until the retire
                            // endpoint ships. (Do not wire to DELETE — that's not archive.)
                          }}
                          canEdit={canEdit}
                          labelLogoUrl={labelLogoUrl}
                          labelBgColor={labelBgColor}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {canEdit && <MoreTypesPopover onAdd={(name) => addTier.mutate(name)} adding={addTier.isPending} />}
                </>
                )}
              </section>

              {/* Pick a color (vinyl only — CD/cassette skip swatches) */}
              {isVinyl && selectedTier && (
                <>
                <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: "28px 0" }} />
                <section id="section-pick-color" data-testid="section-pick-color">
                  <div className="flex items-start justify-between gap-3">
                    <TwoTone lead="Build colors." rest="The world needs more color." />
                    {canEdit && colors.length > 1 && (
                      <ReorderControls
                        on={reorderColorsOn}
                        onBegin={beginReorderColors}
                        onCommit={() => endReorderColors(true)}
                        onCancel={() => endReorderColors(false)}
                        testId="colors"
                      />
                    )}
                  </div>
                  <p className="text-[12.5px]" style={{ marginTop: 6 }} data-testid="hint-color-reorder">
                    <span className="font-semibold" style={{ color: INK }}>{selectedTier.name}</span>
                    <span style={{ color: reorderColorsOn ? BLUE : FAINT }}>
                      {" "}· {colors.length} {colors.length === 1 ? "color" : "colors"} ·{" "}
                      {reorderColorsOn
                        ? "drag a color onto another to move it — Done keeps it, Cancel puts everything back"
                        : "artists see this order"}
                    </span>
                  </p>
                  <div className="grid grid-cols-3 min-[1440px]:grid-cols-4 gap-3" style={{ marginTop: 12 }}>
                    {(colorOrderDraft
                      ? colorOrderDraft
                          .map((id) => colors.find((c) => c.id === id))
                          .filter((c): c is (typeof colors)[number] => !!c)
                      : colors
                    ).map((c) => {
                      const on = c.id === selectedColorId;
                      return (
                        <div
                          key={c.id}
                          className="group relative rounded-2xl bg-white text-center transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
                          draggable={reorderColorsOn}
                          onDragStart={(e) => {
                            if (!reorderColorsOn) return;
                            setDragColorId(c.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => {
                            if (!reorderColorsOn || !dragColorId || dragColorId === c.id) return;
                            e.preventDefault();
                            setColorOrderDraft((prev) => {
                              const arr = [...(prev ?? colors.map((x) => x.id))];
                              const f = arr.indexOf(dragColorId);
                              const t = arr.indexOf(c.id);
                              if (f < 0 || t < 0 || f === t) return prev;
                              arr.splice(t, 0, ...arr.splice(f, 1));
                              return arr;
                            });
                          }}
                          onDragEnd={() => setDragColorId(null)}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedColorId(c.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedColorId(c.id);
                            }
                          }}
                          aria-pressed={on}
                          data-testid={`card-color-${c.id}`}
                          style={{
                            padding: "16px 10px 12px",
                            border: on ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
                            opacity: dragColorId === c.id ? 0.45 : 1,
                            cursor: reorderColorsOn ? (dragColorId ? "grabbing" : "grab") : undefined,
                          }}
                        >
                          {canEdit && (
                            <div
                              className="absolute opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                              style={{ top: 6, right: 6, zIndex: 2 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <SwatchEditorPopover
                                open={editColorId === c.id}
                                onOpenChange={(v) => setEditColorId(v ? c.id : null)}
                                edit={c}
                                saving={patchColor.isPending}
                                onSave={(v) => patchColor.mutate({ id: c.id, body: v })}
                                onRemove={() => deleteColor.mutate(c.id)}
                                labelLogoUrl={labelLogoUrl}
                                labelBgColor={labelBgColor}
                                trigger={<DotsTrigger label={`Edit ${c.name}`} testId={`color-menu-${c.id}`} />}
                              />
                            </div>
                          )}
                          <div className="relative flex justify-center" style={{ marginBottom: 8 }}>
                            <ColorBall color={c} size={48} />
                            {on && (
                              <span
                                className="absolute flex items-center justify-center rounded-full"
                                style={{ width: 18, height: 18, backgroundColor: "rgba(255,255,255,0.85)", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
                              >
                                <Check className="w-3 h-3" style={{ color: BLUE }} strokeWidth={3} />
                              </span>
                            )}
                          </div>
                          <div className="text-[12.5px] font-semibold leading-tight" style={{ color: on ? BLUE : INK }}>
                            {c.name}
                          </div>
                        </div>
                      );
                    })}
                    {canEdit && (
                      <SwatchEditorPopover
                        open={addColorOpen}
                        onOpenChange={setAddColorOpen}
                        saving={addColor.isPending}
                        onSave={(v) => addColor.mutate(v)}
                        labelLogoUrl={labelLogoUrl}
                        labelBgColor={labelBgColor}
                        trigger={
                          <div
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                setAddColorOpen(true);
                              }
                            }}
                            data-testid="button-add-color"
                            className="rounded-2xl text-center transition-all hover:-translate-y-px focus:outline-none cursor-pointer flex flex-col items-center justify-center"
                            style={{ padding: "16px 10px 12px", border: `1.5px dashed ${dark ? "rgba(255,255,255,0.18)" : "#c7c7cc"}`, minHeight: 104 }}
                          >
                            <span className="flex items-center justify-center rounded-full" style={{ width: 32, height: 32, border: `1.5px solid ${BLUE}` }}>
                              <Plus className="w-4 h-4" style={{ color: BLUE }} />
                            </span>
                            <span className="text-[12.5px] font-semibold" style={{ color: INK, marginTop: 8 }}>
                              Add color
                            </span>
                          </div>
                        }
                      />
                    )}
                  </div>
                </section>
                </>
              )}

              {/* Name your price */}
              {selectedTier && (
                <>
                <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: "28px 0" }} />
                <section id="section-price" data-testid="section-price">
                  <TwoTone lead="Set your price." rest="They'll show you the money." />
                  <p className="text-[12.5px]" style={{ marginTop: 6 }}>
                    <span className="font-semibold" style={{ color: INK }}>{selectedTier.name}</span>
                    <span style={{ color: FAINT }}>{colors.length > 0 ? ` · one price covers all ${colors.length} colors` : " · add colors in the step above"}</span>
                  </p>
                  {/* Item 28 — 140 g / 180 g segmented books share run sizes */}
                  <div className="flex items-center justify-between" style={{ marginTop: 10, marginBottom: 8 }}>
                    <div
                      className="inline-flex rounded-full p-0.5"
                      style={{ backgroundColor: dark ? CARD_SOFT : "#ececf0", border: `1px solid ${HAIRLINE}` }}
                      role="tablist"
                      aria-label="Vinyl weight"
                      data-testid="weight-toggle"
                    >
                      {(["140", "180"] as const).map((w) => (
                        <button
                          key={w}
                          type="button"
                          role="tab"
                          aria-selected={weight === w}
                          onClick={() => setWeight(w)}
                          className="rounded-full text-[12px] font-semibold transition-colors"
                          style={{
                            padding: "4px 13px",
                            backgroundColor: weight === w ? (dark ? "rgba(255,255,255,0.13)" : "var(--apple-pill, #fff)") : "transparent",
                            color: weight === w ? INK : FAINT,
                            boxShadow: weight === w ? (dark ? "0 1px 3px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,.08)") : undefined,
                          }}
                          data-testid={`weight-${w}`}
                        >
                          {w} g
                        </button>
                      ))}
                    </div>
                    {canEdit && (
                      <AddRunSizePopover onAdd={(q) => setExtraQuantities((prev) => [...prev, q])} existing={columns} />
                    )}
                  </div>
                  <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${HAIRLINE}` }} data-testid="price-strip">
                    {columns.map((q, i) => {
                      const mode = modeFor(q);
                      return (
                        <div
                          key={q}
                          className="group flex items-center justify-between"
                          style={{
                            borderTop: i === 0 ? undefined : `1px solid ${HAIRLINE}`,
                            backgroundColor: mode === "off" ? (dark ? "rgba(0,0,0,0.2)" : "var(--apple-canvas, #f5f5f7)") : (dark ? CARD : "#fff"),
                            opacity: mode === "off" ? 0.75 : 1,
                            padding: "12px 18px",
                            transition: "background-color 0.2s ease, opacity 0.2s ease",
                          }}
                          data-testid={`row-run-${q}`}
                        >
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[15px] font-bold tabular-nums tracking-tight" style={{ color: INK }}>{q.toLocaleString()}</span>
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: FAINT }}>units</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {canEdit && <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"><ModePicker mode={mode} onChange={(m) => setMode(q, m)} qty={q} visible /></div>}
                            {mode === "priced" ? (
                              <label className={cn("flex items-center justify-center h-9 rounded-lg transition-shadow focus-within:ring-1", dark ? "focus-within:ring-white/25" : "focus-within:ring-slate-300")} style={{ border: `1px solid ${HAIRLINE}`, background: dark ? CARD_SOFT : "#fff", cursor: "text", padding: "0 12px", minWidth: 92 }}>
                                <span className="text-[13px] font-semibold" style={{ color: FAINT, marginRight: 1 }}>$</span>
                                <input
                                  inputMode="decimal" value={cellValue(q)} onChange={(e) => setCellValue(q, e.target.value)} readOnly={!canEdit}
                                  className="border-0 bg-transparent p-0 text-[14px] font-semibold tabular-nums focus:outline-none" style={{ width: `${Math.max(cellValue(q).length, 4)}ch`, color: INK }}
                                  data-testid={`input-price-${q}`}
                                />
                              </label>
                            ) : (
                              <span className="h-9 rounded-lg flex items-center justify-center text-[12px]" style={{ border: `1px dashed ${HAIRLINE}`, color: FAINT, background: mode === "off" ? (dark ? CARD : "#fff") : (dark ? "rgba(0,0,0,0.2)" : "var(--apple-canvas, #f5f5f7)"), padding: "0 12px", minWidth: 92 }}>
                                {mode === "quote" ? "On request" : "—"}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-center" style={{ marginTop: 10 }}>
                    <span className="text-[11.5px]" style={{ color: FAINT }}>Prices are per unit, per finished package · {weight} g vinyl.</span>
                  </div>
                </section>
                </>
              )}

              <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: "28px 0" }} />

              {/* Turnaround — handoff row: heading left, min–max inputs right */}
              <section id="section-turnaround" data-testid="section-turnaround">
                <TurnaroundRow
                  key={fmt}
                  pressId={pressId}
                  format={fmt}
                  initialMin={fmtRow?.turnaroundWeeksMin ?? null}
                  initialMax={fmtRow?.turnaroundWeeksMax ?? null}
                  canEdit={canEdit}
                  onChanged={invalidate}
                />
              </section>

              {/* Print templates + audio spec (vinyl only, handoff markup) */}
              {isVinyl && (
                <>
                  <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: "28px 0" }} />
                  <section id="section-templates" data-testid="section-templates">
                    <TwoTone lead="Print prep." rest="The template for your templates." />
                  <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.4 }}>Attach a file or paste a link. Optional and quiet.</p>
                    <TemplateTilesGrid
                      pressId={pressId}
                      fmt={fmt}
                      canEdit={canEdit}
                      hiddenTemplates={fmtRow?.hiddenTemplates ?? ["booklet"]}
                      onSetHidden={(keys) => setHiddenTemplates.mutate(keys)}
                    />
                  </section>
                    <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: "28px 0" }} />
                    <section id="section-audio" data-testid="section-audio">
                    <TwoTone lead="Set your audio specs." rest="Help them turn it up to 11." />
                      <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.4 }}>Blank fields inherit the press default — the gray numbers.</p>
                    <AudioSpecEditorCard pressId={pressId} canEdit={canEdit} />
                  </section>
                </>
              )}
              <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: "28px 0" }} />
              <section className="pt-2" data-testid="section-gooddeeds">
                <TwoTone lead="GoodDeeds." rest="Printing options." />
                <p className="mt-1 text-[12.5px]" style={{ color: SUBINK }}>Keep the signed GoodDeed® printing ladder separate from vinyl package pricing.</p>
                <fieldset disabled={!canEdit} className="mt-3"><GoodDeedPrintingEditor pressId={pressId} /></fieldset>
              </section>
            </div>
          </div>
        </fieldset>
      )}
      {/* Item 28 (correction 12) — footer stays empty: "Add your vinyl" and
          the CSV options were removed from this page entirely. CSV import/
          export + Hellbender sync move to a separate operator surface. */}
    </div>
  );
}

// ─── Turnaround (handoff TurnaroundCard, wired to the per-format override) ───
// Heading left, min–max week inputs right. Blank inherits the press default
// per-field (placeholders show it); saves on blur via the same PUT the legacy
// editor used. "Use press default" clears the override.
function TurnaroundRow({
  pressId,
  format,
  initialMin,
  initialMax,
  canEdit,
  onChanged,
}: {
  pressId: string;
  format: AlbumFormat;
  initialMin: number | null;
  initialMax: number | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const dark = useAdminDark();
  const { data: press } = useQuery<{ turnaroundWeeksMin?: number | null; turnaroundWeeksMax?: number | null }>({
    queryKey: ["/api/manufacturers", pressId],
  });
  const [min, setMin] = useState(initialMin != null ? String(initialMin) : "");
  const [max, setMax] = useState(initialMax != null ? String(initialMax) : "");
  useEffect(() => {
    setMin(initialMin != null ? String(initialMin) : "");
    setMax(initialMax != null ? String(initialMax) : "");
  }, [format, initialMin, initialMax]);

  const pressMin = press?.turnaroundWeeksMin ?? null;
  const pressMax = press?.turnaroundWeeksMax ?? null;
  const parse = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isInteger(n) && n > 0 && n <= 520 ? n : null;
  };
  const parsedMin = parse(min);
  const parsedMax = parse(max);
  const minBad = min.trim() !== "" && parsedMin === null;
  const maxBad = max.trim() !== "" && parsedMax === null;
  const rangeBad = parsedMin != null && parsedMax != null && parsedMin > parsedMax;
  const dirty = parsedMin !== (initialMin ?? null) || parsedMax !== (initialMax ?? null);
  const hasOverride = initialMin != null || initialMax != null;

  const rangeLabel = (lo: number | null, hi: number | null): string | null => {
    if (lo != null && hi != null) return `${lo}–${hi} weeks`;
    if (lo != null) return `${lo}+ weeks`;
    if (hi != null) return `up to ${hi} weeks`;
    return null;
  };
  const resolvedLabel = rangeLabel(initialMin ?? pressMin, initialMax ?? pressMax);
  const pressLabel = rangeLabel(pressMin, pressMax);

  const save = useMutation({
    mutationFn: async (payload: { turnaroundWeeksMin: number | null; turnaroundWeeksMax: number | null }) => {
      const r = await apiRequest("PUT", `/api/admin/manufacturers/${pressId}/catalog/formats/${format}`, payload);
      return r.json();
    },
    onSuccess: () => {
      onChanged();
      toast({ title: "Turnaround saved" });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save turnaround", description: e?.message ?? "", variant: "destructive" }),
  });
  const commit = () => {
    if (!minBad && !maxBad && !rangeBad && dirty) {
      save.mutate({ turnaroundWeeksMin: parsedMin, turnaroundWeeksMax: parsedMax });
    }
  };
  const numInput: React.CSSProperties = {
    width: 56,
    height: 40,
    border: `1px solid ${HAIRLINE}`,
    borderRadius: 10,
    color: INK,
    background: dark ? CARD_SOFT : "#fff",
    fontWeight: 600,
  };

  return (
    <div data-testid="turnaround-row">
      <div>
        <div>
          <h2 className="tracking-tight" style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 600 }}>
            <span style={{ color: INK }}>Turnaround time. </span>
            <span style={{ color: FAINT }}>From order, to out the door.</span>
          </h2>
          <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.4 }}>
            Weeks from confirmed order to finished records on the truck.
          </p>
        </div>
        {/* Item 28 — inputs stack below the heading */}
        <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
          <input
            value={min}
            onChange={(e) => setMin(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={commit}
            inputMode="numeric"
            readOnly={!canEdit}
            placeholder={pressMin != null ? String(pressMin) : "min"}
            aria-label="Minimum weeks"
            data-testid="input-turnaround-min"
            className={cn("text-[14px] text-center tabular-nums focus:outline-none transition-colors", dark ? "focus:border-white/30" : "focus:border-slate-400")}
            style={numInput}
          />
          <span className="text-[13px]" style={{ color: FAINT }}>
            –
          </span>
          <input
            value={max}
            onChange={(e) => setMax(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={commit}
            inputMode="numeric"
            readOnly={!canEdit}
            placeholder={pressMax != null ? String(pressMax) : "max"}
            aria-label="Maximum weeks"
            data-testid="input-turnaround-max"
            className={cn("text-[14px] text-center tabular-nums focus:outline-none transition-colors", dark ? "focus:border-white/30" : "focus:border-slate-400")}
            style={numInput}
          />
          <span className="text-[13px] font-medium" style={{ color: SUBINK }}>
            weeks
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3" style={{ marginTop: 8 }}>
        {rangeBad && (
          <span className="text-[12px]" style={{ color: criticalColor(dark) }}>
            Min weeks can't be more than max weeks.
          </span>
        )}
        <span className="text-[12px]" style={{ color: SUBINK }} data-testid={`text-format-turnaround-resolved-${format}`}>
          {hasOverride ? `This product: ${resolvedLabel ?? "—"}` : "Blank inherits the press default."}
        </span>
        {hasOverride && canEdit && (
          <button
            type="button"
            onClick={() => save.mutate({ turnaroundWeeksMin: null, turnaroundWeeksMax: null })}
            disabled={save.isPending}
            className="text-[12px] font-semibold hover:underline underline-offset-2"
            style={{ color: BLUE }}
            data-testid={`button-clear-format-turnaround-${format}`}
          >
            Use press default
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Print templates (handoff tile grid, wired to press_template_specs) ─────
// Four slots — Jacket / Inner sleeve / Center labels / Booklet — stored in the
// generic catalog slot (variantKey="" discCount=0). Empty slots are dashed
// invitations; filled slots show the file with Replace-on-hover. The frosted
// popover carries the full legacy capability set: upload a file, paste a URL,
// the optional finished-file check dims, and Remove.
type PressTemplateSpecRow = {
  id: string;
  format: AlbumFormat;
  // Vinyl pieces plus cassette pieces (shell / j_card / o_card / sticker) —
  // the table stores a plain string; the per-surface tile lists constrain it.
  componentKey: string;
  variantKey: string;
  discCount: number;
  artboardWInches: number | null;
  artboardHInches: number | null;
  expectedPages: number | null;
  minPpi: number | null;
  color: "process-4c" | "cmyk-or-pms" | null;
  fontsRule: string | null;
  templateFileUrl: string | null;
  templateFileName: string | null;
};
// Blueprint icons — line drawings of the actual piece, drawn like a die-line.
// Solid strokes are edges; dashed strokes are folds, holes, and hidden parts.
// (Same canon as the artist package builder — one icon language on both sides.)
function BlueprintIcon({ kind }: { kind: string }) {
  const dark = useAdminDark();
  const paper = dark ? CARD : "#fff";
  const s: React.SVGProps<SVGSVGElement> = {
    width: 44,
    height: 44,
    viewBox: "0 0 26 26",
    fill: "none",
    stroke: BLUE,
    strokeWidth: 0.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  switch (kind) {
    case "jacket": // square jacket, record peeking out the right
      return (
        <svg {...s}>
          <circle cx="17.5" cy="13" r="6.5" strokeDasharray="2 2.2" opacity={0.7} />
          <circle cx="17.5" cy="13" r="1.4" strokeDasharray="1.2 1.6" opacity={0.7} />
          <rect x="3" y="4" width="18" height="18" rx="1.2" fill={paper} />
        </svg>
      );
    case "labels": // center label — dashed record as context, solid label as the piece
      return (
        <svg {...s}>
          <circle cx="13" cy="13" r="11" strokeDasharray="2 2.2" opacity={0.7} />
          <circle cx="13" cy="13" r="6.5" fill={paper} />
          <circle cx="13" cy="13" r="1.3" />
          <path d="M9.6 10.4a4.6 4.6 0 0 1 6.8 0" opacity={0.6} />
        </svg>
      );
    case "inner": // inner sleeve — square sleeve half-hidden behind the dashed jacket
      return (
        <svg {...s}>
          <rect x="9" y="5.5" width="15" height="15" rx="1" fill={paper} />
          <rect x="2" y="5" width="16" height="16" rx="1.2" strokeDasharray="2 2.2" opacity={0.7} fill={paper} />
        </svg>
      );
    case "booklet": // folded booklet — dashed center fold, text lines
      return (
        <svg {...s}>
          <rect x="4" y="4.5" width="18" height="17" rx="1.2" fill={paper} />
          <path d="M13 4.5v17" strokeDasharray="2 2.2" opacity={0.7} />
          <path d="M7 9.5h3.5M7 12.5h3.5M7 15.5h2.5M15.5 9.5h3.5M15.5 12.5h3.5" opacity={0.7} />
        </svg>
      );
    default:
      return <FileText className="w-4 h-4" style={{ color: BLUE }} />;
  }
}

const TEMPLATE_TILES: { key: string; componentKey: PressTemplateSpecRow["componentKey"]; label: string; sub: string }[] = [
  { key: "jacket", componentKey: "jacket", label: "Jacket", sub: "Outer sleeve print template" },
  { key: "inner", componentKey: "inner_sleeve", label: "Inner sleeve", sub: "Printed liner template" },
  { key: "labels", componentKey: "labels", label: "Center labels", sub: "A-side & B-side label template" },
  { key: "booklet", componentKey: "booklet", label: "Booklet", sub: "Lyric & photo booklet template" },
];

function middleTruncate(s: string, max = 26): string {
  if (s.length <= max) return s;
  const keep = Math.floor((max - 1) / 2);
  return `${s.slice(0, max - 1 - keep)}…${s.slice(-keep)}`;
}

export function TemplateTilesGrid({
  pressId,
  fmt,
  canEdit,
  hiddenTemplates,
  onSetHidden,
  tiles = TEMPLATE_TILES,
  allowHide = true,
}: {
  pressId: string;
  fmt: AlbumFormat;
  canEdit: boolean;
  // Item 28 — componentKey values the press tucked away (server default when
  // untouched: ["booklet"]).
  hiddenTemplates: string[];
  onSetHidden: (keys: string[]) => void;
  // Cassette/CD reuse: per-format piece list; hide is vinyl-only (its
  // persistence rides the vinyl formats PUT).
  tiles?: { key: string; componentKey: string; label: string; sub: string }[];
  allowHide?: boolean;
}) {
  const { toast } = useToast();
  const qk = ["/api/admin/manufacturers", pressId, "template-specs"];
  const { data } = useQuery<{ specs: PressTemplateSpecRow[] }>({ queryKey: qk });
  const specsForFmt = (data?.specs ?? []).filter((s) => s.format === fmt && s.variantKey === "" && s.discCount === 0);
  const byComponent = (key: PressTemplateSpecRow["componentKey"]) =>
    specsForFmt.find((s) => s.componentKey === key) ?? null;

  // Item 28 — ⋯ menu + centered add/replace dialog state
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [dialogKey, setDialogKey] = useState<string | null>(null);
  const hiddenSet = new Set(hiddenTemplates);
  const visibleTiles = tiles.filter((t) => !hiddenSet.has(t.componentKey));
  const hiddenTiles = tiles.filter((t) => hiddenSet.has(t.componentKey));

  const save = useMutation({
    mutationFn: async (body: Partial<PressTemplateSpecRow> & { componentKey: string }) => {
      // Full-row upsert: always re-send existing fields so a file attach never
      // wipes saved check dims (and vice-versa).
      const existing = specsForFmt.find((s) => s.componentKey === body.componentKey) ?? null;
      const res = await apiRequest("PUT", `/api/admin/manufacturers/${pressId}/template-specs`, {
        format: fmt,
        variantKey: "",
        discCount: 0,
        templateFileUrl: existing?.templateFileUrl ?? null,
        templateFileName: existing?.templateFileName ?? null,
        artboardWInches: existing?.artboardWInches ?? null,
        artboardHInches: existing?.artboardHInches ?? null,
        expectedPages: existing?.expectedPages ?? null,
        minPpi: existing?.minPpi ?? null,
        color: existing?.color ?? null,
        fontsRule: existing?.fontsRule ?? null,
        ...body,
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk }),
    onError: (e: any) => toast({ title: e?.message || "Couldn't save template", variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async (specId: string) => {
      await apiRequest("DELETE", `/api/admin/manufacturers/${pressId}/template-specs/${specId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk }),
    onError: (e: any) => toast({ title: e?.message || "Couldn't remove template", variant: "destructive" }),
  });

  const dialogTile = tiles.find((t) => t.key === dialogKey) ?? null;

  return (
    <>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {visibleTiles.map((tile) => (
          <div key={tile.key} className="group/slot relative">
            <TemplateRow
              tile={tile}
              spec={byComponent(tile.componentKey)}
              canEdit={canEdit}
              onOpen={() => canEdit && setDialogKey(tile.key)}
            />
            {canEdit && (
              <Popover open={menuKey === tile.key} onOpenChange={(v) => setMenuKey(v ? tile.key : null)}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Options for ${tile.label}`}
                    data-testid={`template-menu-${tile.key}`}
                    className={cn(
                      "absolute inline-flex items-center justify-center rounded-full transition-opacity",
                      menuKey === tile.key ? "opacity-100" : "opacity-0 group-hover/slot:opacity-100",
                    )}
                    style={{ top: 6, left: 6, width: 22, height: 22, background: "var(--apple-fill-quaternary, rgba(120,120,128,0.12))", color: SUBINK }}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={6} className="w-48 rounded-2xl p-2" style={{ border: `1px solid ${HAIRLINE}` }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuKey(null);
                      setDialogKey(tile.key);
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-black/5"
                    style={{ color: INK }}
                    data-testid={`template-replace-${tile.key}`}
                  >
                    {byComponent(tile.componentKey)?.templateFileUrl ? "Replace…" : "Add file…"}
                  </button>
                  {allowHide && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuKey(null);
                        onSetHidden(Array.from(new Set([...hiddenTemplates, tile.componentKey])));
                      }}
                      className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-black/5"
                      style={{ color: INK }}
                      data-testid={`template-hide-${tile.key}`}
                    >
                      Hide for now
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            )}
          </div>
        ))}
      </div>
      {hiddenTiles.length > 0 && (
        <div className="text-[12px]" style={{ color: FAINT, marginTop: 10 }}>
          {hiddenTiles.map((tile, i) => (
            <span key={tile.key}>
              {i > 0 && <span> · </span>}
              Hidden: {tile.label} ·{" "}
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => onSetHidden(hiddenTemplates.filter((k) => k !== tile.componentKey))}
                className="font-semibold disabled:opacity-50"
                style={{ color: BLUE, background: "none", border: "none", padding: 0, cursor: canEdit ? "pointer" : "default" }}
                data-testid={`template-show-${tile.key}`}
              >
                Show
              </button>
            </span>
          ))}
        </div>
      )}
      {dialogTile && (
        <TemplateDialog
          tile={dialogTile}
          spec={byComponent(dialogTile.componentKey)}
          busy={save.isPending || remove.isPending}
          onSave={(body) => save.mutate({ componentKey: dialogTile.componentKey, ...body })}
          onRemove={(specId) => remove.mutate(specId)}
          onClose={() => setDialogKey(null)}
        />
      )}
    </>
  );
}

// Item 28 — the tile itself. Clicking anywhere opens the centered dialog; the
// old hover-"Replace" swap is gone.
// Item 28 — a tile shows the ORIGINAL filename captured at upload / paste
// time (upload URLs are opaque /objects/uploads/<id> ids). Legacy rows saved
// before the name column fall back to the URL tail with any query stripped.
function templateDisplayName(spec: PressTemplateSpecRow | null): string | null {
  if (!spec?.templateFileUrl) return null;
  if (spec.templateFileName) return spec.templateFileName;
  try {
    const path = spec.templateFileUrl.startsWith("/")
      ? spec.templateFileUrl.split("?")[0]
      : new URL(spec.templateFileUrl).pathname;
    const tail = path.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(tail) || "template";
  } catch {
    return "template";
  }
}

function TemplateRow({
  tile,
  spec,
  canEdit,
  onOpen,
}: {
  tile: (typeof TEMPLATE_TILES)[number];
  spec: PressTemplateSpecRow | null;
  canEdit: boolean;
  onOpen: () => void;
}) {
  const dark = useAdminDark();
  const fileUrl = spec?.templateFileUrl ?? null;
  const fileName = templateDisplayName(spec);

  // Empty slot — the visible invitation. Dashed, one clear action.
  if (!fileUrl) {
    return (
      <button
        type="button"
        disabled={!canEdit}
        onClick={onOpen}
        data-testid={`template-upload-${tile.key}`}
        className="w-full flex flex-col items-center justify-center rounded-xl transition-colors hover:bg-white focus:outline-none disabled:cursor-default"
        style={{ border: `1.5px dashed ${dark ? "rgba(255,255,255,0.18)" : FAINT}`, padding: "18px 12px", cursor: canEdit ? "pointer" : "default", background: "transparent" }}
      >
        <span style={{ opacity: 0.55 }}>
          <BlueprintIcon kind={tile.key} />
        </span>
        <div className="text-[13px] font-semibold" style={{ color: INK, marginTop: 8 }}>
          {tile.label}
        </div>
        {canEdit ? (
          <div className="text-[11.5px] font-semibold" style={{ color: BLUE, marginTop: 3 }}>
            Upload or paste a link
          </div>
        ) : (
          <div className="text-[11.5px]" style={{ color: SUBINK, marginTop: 3 }}>
            {tile.sub}
          </div>
        )}
      </button>
    );
  }

  // Filled slot — calm and complete; clicking opens the dialog.
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!canEdit}
      className="w-full flex flex-col items-center justify-center rounded-xl bg-white text-center transition-colors hover:bg-white/5 focus:outline-none disabled:cursor-default"
      style={{ border: `1px solid ${HAIRLINE}`, padding: "18px 12px", background: dark ? CARD : "#fff", cursor: canEdit ? "pointer" : "default" }}
      data-testid={`template-${tile.key}`}
    >
      <BlueprintIcon kind={tile.key} />
      <div className="text-[13px] font-semibold" style={{ color: INK, marginTop: 8 }}>
        {tile.label}
      </div>
      <div
        className="text-[11.5px] tabular-nums"
        style={{ color: SUBINK, marginTop: 3 }}
        title={fileName ?? undefined}
        data-testid={`text-template-filename-${tile.key}`}
      >
        {middleTruncate(fileName ?? "template")}
      </div>
    </button>
  );
}

// Item 28 — centered add/replace dialog, like the album "Completed Art"
// dialog: current file on the left, drag-and-drop + paste-a-URL on the right.
// Keeps the legacy capability set: download, the optional finished-file check
// dims, and Remove.
function TemplateDialog({
  tile,
  spec,
  busy,
  onSave,
  onRemove,
  onClose,
}: {
  tile: (typeof TEMPLATE_TILES)[number];
  spec: PressTemplateSpecRow | null;
  busy: boolean;
  onSave: (body: Partial<PressTemplateSpecRow>) => void;
  onRemove: (specId: string) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const dark = useAdminDark();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const numOrEmpty = (n: number | null | undefined) => (n == null ? "" : String(n));
  const [wDraft, setWDraft] = useState(numOrEmpty(spec?.artboardWInches));
  const [hDraft, setHDraft] = useState(numOrEmpty(spec?.artboardHInches));
  const [pagesDraft, setPagesDraft] = useState(numOrEmpty(spec?.expectedPages));
  const [ppiDraft, setPpiDraft] = useState(numOrEmpty(spec?.minPpi));
  useEffect(() => {
    setWDraft(numOrEmpty(spec?.artboardWInches));
    setHDraft(numOrEmpty(spec?.artboardHInches));
    setPagesDraft(numOrEmpty(spec?.expectedPages));
    setPpiDraft(numOrEmpty(spec?.minPpi));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec?.artboardWInches, spec?.artboardHInches, spec?.expectedPages, spec?.minPpi]);

  const fileUrl = spec?.templateFileUrl ?? null;
  const fileName = templateDisplayName(spec);

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadAdminDoc(file);
      onSave({ templateFileUrl: url, templateFileName: file.name });
    } catch (e: any) {
      toast({ title: e?.message || "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const commitUrl = () => {
    const url = urlDraft.trim();
    if (!url) return;
    let name: string | null = null;
    try {
      const path = url.startsWith("/") ? url.split("?")[0] : new URL(url).pathname;
      name = decodeURIComponent(path.split("/").filter(Boolean).pop() ?? "") || null;
    } catch {
      name = null;
    }
    onSave({ templateFileUrl: url, templateFileName: name });
    setUrlDraft("");
  };
  const saveDims = () => {
    const num = (s: string) => (s.trim() === "" ? null : Number(s));
    const w = num(wDraft);
    const h = num(hDraft);
    const pages = num(pagesDraft);
    const ppi = num(ppiDraft);
    if ([w, h, pages, ppi].some((v) => v != null && !Number.isFinite(v))) {
      toast({ title: "Enter valid numbers for the check dimensions.", variant: "destructive" });
      return;
    }
    if (ppi != null && (ppi < 72 || ppi > 2400)) {
      toast({ title: "Minimum resolution must be between 72 and 2400 PPI.", variant: "destructive" });
      return;
    }
    onSave({
      artboardWInches: w,
      artboardHInches: h,
      expectedPages: pages,
      minPpi: ppi != null ? Math.round(ppi) : null,
    });
  };

  const dimInput: React.CSSProperties = {
    height: 34,
    border: `1px solid ${HAIRLINE}`,
    borderRadius: 9,
    padding: "0 8px",
    color: INK,
    background: dark ? CARD_SOFT : "#fff",
  };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-2xl"
        style={{
          width: 600,
          maxWidth: "calc(100vw - 32px)",
          padding: 24,
          background: dark ? "rgba(28,28,30,0.97)" : "#fff",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: `1px solid ${dark ? "rgba(255,255,255,0.12)" : HAIRLINE}`,
          boxShadow: dark ? "0 24px 64px rgba(0,0,0,0.6)" : "0 24px 64px rgba(0,0,0,0.25)",
          textAlign: "left",
          cursor: "default",
        }}
        data-testid={`template-dialog-${tile.key}`}
      >
        <div className="flex items-start justify-between" style={{ marginBottom: 18 }}>
          <span className="text-[17px] font-semibold tracking-tight" style={{ lineHeight: 1.25, paddingRight: 8 }}>
            <span style={{ color: INK }}>{tile.label}: </span>
            <span style={{ color: FAINT }}>{tile.sub}</span>
          </span>
          <button
            type="button"
            aria-label="Close"
            data-testid="button-template-close"
            onClick={onClose}
            className="rounded-full flex items-center justify-center transition-colors"
            style={{ width: 24, height: 24, background: "none", border: "none", color: FAINT, cursor: "pointer" }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
        <div className="flex" style={{ gap: 24 }}>
          {/* LEFT — current file */}
          <div style={{ width: 190, flexShrink: 0 }}>
            <div className="text-[11px] font-semibold uppercase" style={{ color: FAINT, letterSpacing: 0.8, marginBottom: 8 }}>
              Current file
            </div>
            <div
              className="rounded-xl flex flex-col items-center justify-center text-center"
              style={{ height: 208, padding: 12, background: dark ? "rgba(255,255,255,0.035)" : "var(--apple-canvas, #f5f5f7)", border: `1px solid ${dark ? "rgba(255,255,255,0.07)" : HAIRLINE}` }}
            >
              {fileUrl ? (
                <>
                  <BlueprintIcon kind={tile.key} />
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="text-[11.5px] tabular-nums hover:underline underline-offset-2"
                    style={{ color: SUBINK, marginTop: 10, wordBreak: "break-all" }}
                    title={fileName ?? undefined}
                    data-testid={`link-template-download-${tile.key}`}
                  >
                    {middleTruncate(fileName ?? "template")}
                  </a>
                  {spec && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRemove(spec.id)}
                      className="text-[12px] font-semibold disabled:opacity-40"
                      style={{ color: criticalColor(dark), marginTop: 10, background: "none", border: "none", cursor: "pointer" }}
                      data-testid={`template-dialog-remove-${tile.key}`}
                    >
                      Remove file
                    </button>
                  )}
                </>
              ) : (
                <span className="text-[12px]" style={{ color: FAINT }}>No file yet</span>
              )}
            </div>
          </div>
          {/* RIGHT — upload + paste URL + check dims */}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase" style={{ color: FAINT, letterSpacing: 0.8, marginBottom: 8 }}>
              Upload file
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={DOC_UPLOAD_ACCEPT}
              className="hidden"
              onChange={(e) => handleUpload(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={busy || uploading}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = dark ? "rgba(255,255,255,0.55)" : SUBINK;
              }}
              onDragLeave={(e) => {
                e.currentTarget.style.borderColor = dark ? "rgba(255,255,255,0.22)" : FAINT;
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = dark ? "rgba(255,255,255,0.22)" : FAINT;
                handleUpload(e.dataTransfer.files?.[0]);
              }}
              className="w-full rounded-xl flex flex-col items-center justify-center transition-colors disabled:opacity-50"
              style={{ height: 104, border: `1.5px dashed ${dark ? "rgba(255,255,255,0.22)" : FAINT}`, background: "transparent", cursor: "pointer" }}
              data-testid={`template-dialog-drop-${tile.key}`}
            >
              {uploading ? (
                <Loader2 className="animate-spin" style={{ width: 18, height: 18, color: SUBINK }} />
              ) : (
                <UploadCloud style={{ width: 18, height: 18, color: SUBINK }} />
              )}
              <span className="text-[12.5px] font-medium" style={{ color: INK, marginTop: 7 }}>
                Drag a file here, or click to pick
              </span>
              <span className="text-[11px]" style={{ color: FAINT, marginTop: 3 }}>
                Press-ready PDF · validated automatically
              </span>
            </button>
            <div className="text-[11px] font-semibold uppercase" style={{ color: FAINT, letterSpacing: 0.8, marginTop: 14, marginBottom: 8 }}>
              Or paste a URL
            </div>
            <div className="flex items-center gap-2">
              <input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitUrl();
                }}
                placeholder="https://… Dropbox, Drive, WeTransfer"
                className={cn("min-w-0 flex-1 rounded-full text-[13px] focus:outline-none", dark ? "focus:border-white/30" : "focus:border-slate-400")}
                style={{ height: 36, border: `1px solid ${HAIRLINE}`, padding: "0 14px", color: INK, background: dark ? CARD_SOFT : "#fff" }}
                data-testid={`template-dialog-url-${tile.key}`}
              />
              <button
                type="button"
                onClick={commitUrl}
                disabled={!urlDraft.trim() || busy}
                className="rounded-full text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40 flex-shrink-0"
                style={{ height: 32, padding: "0 14px", backgroundColor: urlDraft.trim() ? BLUE : (dark ? CARD_SOFT : "#d1d1d6"), border: "none", cursor: "pointer" }}
                data-testid={`template-dialog-use-url-${tile.key}`}
              >
                Use URL
              </button>
            </div>
            {/* Finished-file check (legacy capability, kept inside the dialog) */}
            <div className="text-[11px] font-semibold uppercase" style={{ color: FAINT, letterSpacing: 0.8, marginTop: 14, marginBottom: 6 }}>
              Finished-file check
            </div>
            <div className="grid grid-cols-4 gap-2">
              <label className="flex items-center gap-1.5">
                <input value={wDraft} onChange={(e) => setWDraft(e.target.value)} inputMode="decimal" placeholder="W" className="w-full text-[13px] tabular-nums focus:outline-none" style={dimInput} data-testid={`input-template-w-${tile.key}`} />
              </label>
              <label className="flex items-center gap-1.5">
                <input value={hDraft} onChange={(e) => setHDraft(e.target.value)} inputMode="decimal" placeholder="H" className="w-full text-[13px] tabular-nums focus:outline-none" style={dimInput} data-testid={`input-template-h-${tile.key}`} />
              </label>
              <label className="flex items-center gap-1.5">
                <input value={pagesDraft} onChange={(e) => setPagesDraft(e.target.value)} inputMode="numeric" placeholder="Pages" className="w-full text-[13px] tabular-nums focus:outline-none" style={dimInput} data-testid={`input-template-pages-${tile.key}`} />
              </label>
              <label className="flex items-center gap-1.5">
                <input value={ppiDraft} onChange={(e) => setPpiDraft(e.target.value)} inputMode="numeric" placeholder="PPI" className="w-full text-[13px] tabular-nums focus:outline-none" style={dimInput} data-testid={`input-template-ppi-${tile.key}`} />
              </label>
            </div>
            <div className="flex justify-end" style={{ marginTop: 6 }}>
              <button type="button" onClick={saveDims} disabled={busy} className="text-[12.5px] font-semibold hover:underline underline-offset-2 disabled:opacity-40" style={{ color: BLUE, background: "none", border: "none", cursor: "pointer" }} data-testid={`button-save-template-dims-${tile.key}`}>
                Save check
              </button>
            </div>
          </div>
        </div>
        <p className="text-[11px]" style={{ color: FAINT, marginTop: 14 }}>
          Pasted share links are scanned in place — the file is never re-hosted.
        </p>
      </div>
    </div>,
    document.body,
  );
}

// ─── Audio spec (handoff AudioSpecCard, wired to the press audio override) ──
// One card of rows: bit depth, sample rate, longest side per size (33⅓ / 45),
// and Notes. Values are shown in minutes / kHz; a BLANK field inherits the
// plant's measured baseline (shown as the placeholder). Saves on blur.
const AUDIO_SIZES = ['7"', '10"', '12"'] as const;
const AUDIO_RPMS = ["33", "45"] as const;
type PressAudioSpecRow = {
  id: string;
  requiredBitDepth: number | null;
  requiredSampleRateHz: number | null;
  maxSideSeconds: Record<string, Record<string, number>> | null;
  notes: string | null;
};
type AudioBaselineRow = {
  requiredBitDepth: number | null;
  requiredSampleRateHz: number | null;
  maxSideSeconds: Record<string, Record<string, number>> | null;
};

function AudioSpecField({
  value,
  onChange,
  onBlur,
  placeholder,
  suffix,
  wch = 4,
  readOnly,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder: string;
  suffix: string;
  wch?: number;
  readOnly: boolean;
  testId: string;
}) {
  const dark = useAdminDark();
  return (
    <label
      className={cn("flex h-9 items-center justify-center rounded-lg transition-shadow focus-within:ring-1", dark ? "focus-within:ring-white/25" : "focus-within:ring-slate-300")}
      style={{ border: `1px solid ${HAIRLINE}`, background: dark ? CARD_SOFT : "#fff", cursor: "text", padding: "0 10px" }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        onBlur={onBlur}
        inputMode="decimal"
        readOnly={readOnly}
        placeholder={placeholder}
        data-testid={testId}
        className="text-center text-[14px] font-semibold tabular-nums focus:outline-none"
        style={{ color: INK, background: "transparent", border: "none", width: `${wch}ch`, padding: 0 }}
      />
      <span className="text-[11px] font-semibold" style={{ color: FAINT, marginLeft: 5 }}>
        {suffix}
      </span>
    </label>
  );
}

function AudioSpecEditorCard({ pressId, canEdit }: { pressId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const qk = ["/api/admin/manufacturers", pressId, "audio-spec"];
  const { data } = useQuery<{ spec: PressAudioSpecRow | null; baseline: AudioBaselineRow | null }>({
    queryKey: qk,
  });
  const spec = data?.spec ?? null;
  const baseline = data?.baseline ?? null;

  const [bitDepth, setBitDepth] = useState("");
  const [sampleKhz, setSampleKhz] = useState("");
  const [grid, setGrid] = useState<Record<string, Record<string, string>>>({});
  const [notes, setNotes] = useState("");

  // Rehydrate the draft from the saved row whenever it (re)loads. Seconds are
  // surfaced as minutes (one decimal); Hz as kHz.
  useEffect(() => {
    setBitDepth(spec?.requiredBitDepth != null ? String(spec.requiredBitDepth) : "");
    setSampleKhz(spec?.requiredSampleRateHz != null ? String(spec.requiredSampleRateHz / 1000) : "");
    const g: Record<string, Record<string, string>> = {};
    for (const size of AUDIO_SIZES) {
      for (const rpm of AUDIO_RPMS) {
        const secs = spec?.maxSideSeconds?.[size]?.[rpm];
        if (typeof secs === "number") {
          (g[size] ??= {})[rpm] = String(Math.round((secs / 60) * 10) / 10);
        }
      }
    }
    setGrid(g);
    setNotes(spec?.notes ?? "");
  }, [spec]);

  const buildBody = () => {
    const maxSideSeconds: Record<string, Record<string, number>> = {};
    for (const size of AUDIO_SIZES) {
      for (const rpm of AUDIO_RPMS) {
        const raw = grid[size]?.[rpm];
        const mins = raw != null && raw.trim() !== "" ? Number(raw) : NaN;
        if (Number.isFinite(mins) && mins > 0) {
          (maxSideSeconds[size] ??= {})[rpm] = Math.round(mins * 60);
        }
      }
    }
    const bd = bitDepth.trim() !== "" ? Number(bitDepth) : NaN;
    const khz = sampleKhz.trim() !== "" ? Number(sampleKhz) : NaN;
    return {
      requiredBitDepth: Number.isFinite(bd) ? Math.round(bd) : null,
      requiredSampleRateHz: Number.isFinite(khz) ? Math.round(khz * 1000) : null,
      maxSideSeconds: Object.keys(maxSideSeconds).length > 0 ? maxSideSeconds : null,
      notes: notes.trim() !== "" ? notes.trim() : null,
    };
  };
  const savedBodyKey = JSON.stringify({
    requiredBitDepth: spec?.requiredBitDepth ?? null,
    requiredSampleRateHz: spec?.requiredSampleRateHz ?? null,
    maxSideSeconds: spec?.maxSideSeconds ?? null,
    notes: spec?.notes ?? null,
  });

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/admin/manufacturers/${pressId}/audio-spec`, buildBody());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
      toast({ title: "Audio spec saved" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't save audio spec", variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/manufacturers/${pressId}/audio-spec`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
      toast({ title: "Audio override cleared — inheriting baseline" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't clear audio spec", variant: "destructive" }),
  });
  const commit = () => {
    if (!canEdit || save.isPending) return;
    const body = buildBody();
    const isEmpty =
      body.requiredBitDepth == null && body.requiredSampleRateHz == null && body.maxSideSeconds == null && body.notes == null;
    if (JSON.stringify(body) === savedBodyKey) return;
    if (isEmpty && !spec) return;
    if (isEmpty && spec) {
      remove.mutate();
      return;
    }
    save.mutate();
  };

  const setCell = (size: string, rpm: string, v: string) =>
    setGrid((g) => ({ ...g, [size]: { ...(g[size] ?? {}), [rpm]: v } }));
  const sideDefault = (size: string, rpm: string): string => {
    const secs = baseline?.maxSideSeconds?.[size]?.[rpm];
    return typeof secs === "number" ? String(Math.round((secs / 60) * 10) / 10) : "—";
  };
  const bitDefault = baseline?.requiredBitDepth != null ? `Default: ${baseline.requiredBitDepth}-bit` : "Default: no minimum";
  const rateDefault =
    baseline?.requiredSampleRateHz != null ? `Default: ${baseline.requiredSampleRateHz / 1000} kHz` : "Default: no minimum";

  const rows: { label: string; sub?: string; controls: React.ReactNode }[] = [
    {
      label: "Minimum bit depth",
      sub: bitDefault,
      controls: (
        <AudioSpecField
          value={bitDepth}
          onChange={setBitDepth}
          onBlur={commit}
          placeholder={baseline?.requiredBitDepth != null ? String(baseline.requiredBitDepth) : "—"}
          suffix="bit"
          readOnly={!canEdit}
          testId="input-audio-bit"
        />
      ),
    },
    {
      label: "Minimum sample rate",
      sub: rateDefault,
      controls: (
        <AudioSpecField
          value={sampleKhz}
          onChange={setSampleKhz}
          onBlur={commit}
          placeholder={baseline?.requiredSampleRateHz != null ? String(baseline.requiredSampleRateHz / 1000) : "—"}
          suffix="kHz"
          wch={5}
          readOnly={!canEdit}
          testId="input-audio-rate"
        />
      ),
    },
    ...AUDIO_SIZES.map((size) => ({
      label: `Longest side — ${size}`,
      controls: (
        <div className="flex items-center gap-2">
          <AudioSpecField
            value={grid[size]?.["33"] ?? ""}
            onChange={(v) => setCell(size, "33", v)}
            onBlur={commit}
            placeholder={sideDefault(size, "33")}
            suffix="min at 33⅓"
            wch={3}
            readOnly={!canEdit}
            testId={`input-audio-${size.replace(/\D/g, "")}-33`}
          />
          <AudioSpecField
            value={grid[size]?.["45"] ?? ""}
            onChange={(v) => setCell(size, "45", v)}
            onBlur={commit}
            placeholder={sideDefault(size, "45")}
            suffix="min at 45"
            wch={3}
            readOnly={!canEdit}
            testId={`input-audio-${size.replace(/\D/g, "")}-45`}
          />
        </div>
      ),
    })),
  ];

  return (
    <div>
      <Card className="mt-3 overflow-hidden" testId="audio-spec-card">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className="flex items-center justify-between gap-4"
            style={{ padding: "12px 18px", borderTop: i > 0 ? `1px solid ${HAIRLINE}` : undefined }}
          >
            <div>
              <div className="text-[13.5px] font-semibold" style={{ color: INK }}>
                {r.label}
              </div>
              {r.sub && (
                <div className="text-[11.5px]" style={{ color: FAINT, marginTop: 2 }}>
                  {r.sub}
                </div>
              )}
            </div>
            {r.controls}
          </div>
        ))}
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${HAIRLINE}` }}>
          <div className="text-[13.5px] font-semibold" style={{ color: INK }}>
            Notes
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={commit}
            readOnly={!canEdit}
            placeholder="Optional context for operators — e.g. where these numbers come from."
            data-testid="input-audio-notes"
            rows={2}
            className="w-full resize-none text-[13px] focus:outline-none"
            style={{ color: INK, background: "transparent", border: "none", marginTop: 4, padding: 0, lineHeight: 1.45 }}
          />
        </div>
      </Card>
      <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
        <span className="text-[11.5px]" style={{ color: SUBINK }}>
          Blank fields inherit the plant's measured baseline — nothing here is assumed.
        </span>
        {spec && canEdit && (
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="text-[11.5px] font-semibold hover:underline underline-offset-2 disabled:opacity-40"
            style={{ color: BLUE }}
            data-testid="button-clear-audio-spec"
          >
            Clear override
          </button>
        )}
      </div>
    </div>
  );
}

export default PressPackagePricingCatalog;
