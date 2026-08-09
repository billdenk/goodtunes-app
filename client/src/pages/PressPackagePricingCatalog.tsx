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
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ALBUM_FORMAT_LABEL, type AlbumFormat } from "@shared/schema";
import { Check, ChevronDown, DollarSign, FileText, HelpCircle, Loader2, MinusCircle, MoreHorizontal, Plus, RotateCcw, Search, X } from "lucide-react";
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
  DISC_SPIN_CSS,
  MoreTypesPopover,
  SwatchEditorPopover,
  VinylDisc,
} from "./PressVinylColors";

// ─── Design tokens (Apple canon; vars flip under gt-admin-dark) ──────
const BLUE = "var(--brand-blue)";
const INK = "var(--apple-ink)";
const SUBINK = "var(--apple-subink)";
const HAIRLINE = "var(--apple-hairline)";
const FAINT = "var(--apple-faint)";
const CRITICAL = "#e0245e";

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ─── Frosted editor popovers (same feel as Add Your Vinyl / handoff ref) ──
const FROSTED_PANEL: React.CSSProperties = {
  border: `1px solid ${HAIRLINE}`,
  backgroundColor: "rgba(255,255,255,0.82)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  boxShadow: "0 20px 48px rgba(0,0,0,0.16)",
};

const FIELD_INPUT: React.CSSProperties = {
  height: 40,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 10,
  padding: "0 12px",
  color: INK,
  background: "#fff",
};

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
  return (
    <button
      type="button"
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      data-testid={testId}
      className="inline-flex items-center justify-center rounded-full transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      style={{
        width: 26,
        height: 26,
        backgroundColor: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        border: `1px solid ${HAIRLINE}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.10)",
        color: SUBINK,
      }}
    >
      <MoreHorizontal className="w-4 h-4" />
    </button>
  );
}

function SizeChip({ size, active, onToggle }: { size: string; active: boolean; onToggle: () => void }) {
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
        backgroundColor: active ? BLUE : "#fff",
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
  if (!on) {
    return (
      <button
        type="button"
        onClick={onBegin}
        data-testid={`button-reorder-${testId}`}
        className="text-[12px] font-semibold rounded-full transition-colors hover:bg-slate-100 focus:outline-none"
        style={{ padding: "5px 12px", color: SUBINK, border: `1px solid ${HAIRLINE}`, background: "#fff" }}
      >
        Reorder
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
        style={{ padding: "5px 12px", color: SUBINK, border: `1px solid ${HAIRLINE}`, background: "#fff" }}
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
          style={{ width: 34, height: 34, color: SUBINK, border: `1px solid ${HAIRLINE}`, background: "#fff" }}
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
          ...FROSTED_PANEL,
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
            <span className="text-[12px] tabular-nums" style={{ color: "#a1a1a6" }}>
              {totalCount}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "#a1a1a6" }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-8 pl-9 pr-8 rounded-full text-[12.5px] placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors"
              style={{ border: `1px solid ${HAIRLINE}`, color: INK, background: "#fff" }}
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
              <p className="text-[12.5px]" style={{ color: "#a1a1a6" }}>
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
                      style={{ padding: "11px 18px", borderBottom: `1px solid ${HAIRLINE}`, backgroundColor: on ? "#f0f7fc" : undefined }}
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

// ─── Left column: jacket + disc stage ────────────────────────────────
// The album jacket with the vinyl peeking out to the right. Hovering
// slides the disc further out and spins the disc body (highlight stays
// fixed — VinylDisc already keeps its sheen static). Double LP shows a
// second, dimmer disc behind the first.
export function JacketStage({
  format,
  jacketUrl,
  color,
  labelLogoUrl,
  labelBgColor,
  placeholderIconUrl,
  typeName,
}: {
  format: AlbumFormat;
  jacketUrl: string | null;
  color: CatalogColor | null;
  labelLogoUrl: string | null;
  labelBgColor: string | null;
  // Bill's rule 2 (handoff v2) — when the album has no uploaded art AND the
  // press has no default jacket, the jacket face is the white product-mark
  // icon at ~45% width on a `#1d1d1f` ink jacket. Passed only by the artist
  // package builder; the press catalog keeps its label-logo fallback.
  placeholderIconUrl?: string | null;
  typeName?: string | null;
}) {
  const isDouble = format === "12_double";
  const jacketPx = format === "7_inch" ? 175 : 300;
  const DISC = Math.round(jacketPx * 0.96);
  return (
    <div data-testid="jacket-stage">
      <style dangerouslySetInnerHTML={{ __html: DISC_SPIN_CSS }} />
      <div className="group relative" style={{ width: jacketPx + jacketPx * 0.5, height: jacketPx + 24 }}>
        {/* Discs peek out to the right; slide further on hover. */}
        {isDouble && (
          <div
            className="absolute transition-transform duration-500 ease-out group-hover:translate-x-6"
            style={{ top: (jacketPx - DISC) / 2, left: jacketPx - DISC + jacketPx * 0.27, opacity: 0.55, transitionDelay: "60ms" }}
            aria-hidden
          >
            <VinylDisc size={DISC - 16} color={color} labelLogoUrl={labelLogoUrl} labelBgColor={labelBgColor} />
          </div>
        )}
        <div
          className="absolute transition-transform duration-500 ease-out group-hover:translate-x-10"
            style={{ top: (jacketPx - DISC) / 2, left: jacketPx - DISC + jacketPx * 0.22 }}
        >
          <div className="gt-vinyl" style={{ borderRadius: "50%" }}>
            <VinylDisc size={DISC} color={color} labelLogoUrl={labelLogoUrl} labelBgColor={labelBgColor} spin />
          </div>
        </div>
        {/* Jacket in front — handoff-verbatim: black, square (radius 3), spine hint */}
        <div
          className="absolute left-0 top-0 overflow-hidden"
          style={{
            width: jacketPx,
            height: jacketPx,
            borderRadius: 3,
            backgroundColor: "#141416",
            backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 45%)",
            boxShadow: "0 18px 40px rgba(0,0,0,0.25), inset -1px 0 0 rgba(255,255,255,0.06)",
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
            <img src={labelLogoUrl} alt="" aria-hidden style={{ width: jacketPx * 0.42, height: jacketPx * 0.42, objectFit: "contain", filter: "invert(1)", opacity: 0.92 }} />
          ) : (
            <span className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
              Printed jacket
            </span>
          )}
          {/* spine hint */}
          <span aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 7, background: "linear-gradient(90deg, rgba(0,0,0,0.5), transparent)" }} />
        </div>
        {/* floor shadow — fixed size, stretched with a transform so it never repaints mid-hover */}
        <div
          aria-hidden
          className="pointer-events-none absolute transition-transform duration-500 ease-out group-hover:scale-x-[1.18]"
          style={{
            bottom: -6,
            left: jacketPx * 0.1,
            width: jacketPx * 0.9 + jacketPx * 0.22 * 0.6,
            height: 14,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.28)",
            filter: "blur(9px)",
            transformOrigin: "30% center",
          }}
        />
      </div>
      {/* Captions — shifted left so they center under the jacket, not the whole stage. */}
      <div className="flex flex-col items-center" style={{ transform: `translateX(-${Math.round(jacketPx * 0.25)}px)` }} data-testid="stage-caption">
        <div className="flex items-center gap-2.5 text-[13px]" style={{ marginTop: 28, color: SUBINK }}>
          {color && <ColorBall color={color} size={18} />}
          <span>{format === "7_inch" ? '7"' : '12"'}</span>
          <span style={{ color: "#d1d1d6" }}>·</span>
          <span>{typeName ?? ALBUM_FORMAT_LABEL[format] ?? format}</span>
          {color ? <><span style={{ color: "#d1d1d6" }}>·</span><span className="font-semibold" style={{ color: INK }}>{color.name}</span></> : null}
        </div>
        <div className="text-[12px] text-center" style={{ marginTop: 8, marginBottom: 16, color: "#a1a1a6", lineHeight: 1.4 }}>
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
              backgroundColor: "var(--apple-frost, rgba(255,255,255,0.85))",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              boxShadow: "0 20px 48px rgba(0,0,0,0.16)",
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
                style={{ color: CRITICAL }}
                data-testid={`button-size-remove-${format}`}
              >
                Remove size…
              </button>
            ) : (
              <div className="rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(224,36,94,0.06)" }}>
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
                  style={{ color: CRITICAL }}
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
      <div className="text-[11.5px]" style={{ marginTop: 2, color: "#a1a1a6" }}>
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
                "absolute inline-flex items-center justify-center rounded-full transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
                menuOpen ? "opacity-100" : "opacity-0 group-hover/type:opacity-100 group-focus-within/type:opacity-100",
              )}
              style={{
                top: 8,
                right: 8,
                zIndex: 2,
                width: 26,
                height: 26,
                backgroundColor: "rgba(255,255,255,0.88)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: `1px solid ${HAIRLINE}`,
                boxShadow: "0 1px 3px rgba(0,0,0,0.10)",
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
            style={FROSTED_PANEL}
            data-testid={`popover-edit-group-${tier.id}`}
          >
            <div style={{ padding: 18 }}>
              <div className="text-[15px] font-semibold tracking-tight" style={{ color: INK }}>
                Edit type. <span style={{ color: "#a1a1a6", fontWeight: 600 }}>{tier.name}.</span>
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
                    className="text-[13.5px] focus:outline-none focus:border-slate-400 transition-colors"
                    style={FIELD_INPUT}
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
              style={{ padding: "12px 18px", borderTop: `1px solid ${HAIRLINE}`, color: CRITICAL, textAlign: "center", background: "transparent" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#fdeef2")}
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
  const meta = {
    priced: { label: "Priced", hint: "A clear package price", icon: DollarSign, color: "#248a3d" },
    quote: { label: "Quote", hint: "Ask for a custom quote", icon: HelpCircle, color: "#c98a00" },
    off: { label: "Off", hint: "Not available at this size", icon: MinusCircle, color: "#a1a1a6" },
  }[mode];
  const [open, setOpen] = useState(false);
  const opts: PriceMode[] = ["priced", "quote", "off"];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button type="button" className="inline-flex items-center gap-1 rounded-full px-2 h-6 text-[11px] font-semibold transition-colors hover:bg-slate-50" style={{ color: meta.color }}><meta.icon className="w-3 h-3" /><span>{meta.label}</span><ChevronDown className="w-2.5 h-2.5" /></button></PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-64 p-1.5 rounded-2xl" style={{ border: `1px solid ${HAIRLINE}` }}>
        {opts.map((m) => {
          const mm = { priced: { label: "Priced", hint: "A clear package price", icon: DollarSign, color: "#248a3d" }, quote: { label: "Quote", hint: "Ask for a custom quote", icon: HelpCircle, color: "#c98a00" }, off: { label: "Off", hint: "Not available at this size", icon: MinusCircle, color: "#a1a1a6" } }[m];
          const Icon = mm.icon;
          return <button key={m} type="button" onClick={() => { onChange(m); setOpen(false); }} className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-slate-50"><span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ background: m === mode ? "#f0f7fc" : "#f5f5f7", color: mm.color }}><Icon className="w-3.5 h-3.5" /></span><span className="flex-1"><span className="block text-[13px] font-semibold" style={{ color: INK }}>{mm.label}</span><span className="block text-[11.5px]" style={{ color: SUBINK }}>{mm.hint}</span></span>{m === mode && <Check className="w-3.5 h-3.5" style={{ color: BLUE }} />}</button>;
        })}
      </PopoverContent>
    </Popover>
  );
}

function AddRunSizePopover({ onAdd, existing }: { onAdd: (qty: number) => void; existing: number[] }) {
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
          backgroundColor: "var(--apple-frost, rgba(255,255,255,0.85))",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 20px 48px rgba(0,0,0,0.16)",
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
            className="w-full bg-white text-[13.5px] tabular-nums focus:outline-none focus:border-slate-400"
            style={{ height: 38, border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: "0 12px", color: INK }}
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
  const { data: pressRow } = useQuery<{ labelLogoUrl?: string | null; labelBgColor?: string | null }>({
    queryKey: ["/api/manufacturers", pressId],
    enabled: !!pressId && !!canView,
  });
  const labelLogoUrl = pressRow?.labelLogoUrl ?? null;
  const labelBgColor = pressRow?.labelBgColor ?? null;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/admin/manufacturers", pressId, "catalog"] });

  // ── Format selection (vinyl sizes only; CD and cassette are coming)
  const [activeTab, setActiveTab] = useState<CatalogTab | null>(null);
  useEffect(() => {
    if (!catalog) return;
    const offeredList = catalog.formats.map((f) => f.format);
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
  const fmt = activeTab as AlbumFormat | null;
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
      setSelectedTierId((match ?? tiers[0]).id);
    }
  }, [tiers, selectedTierId]);
  const selectedTier = tiers.find((t) => t.id === selectedTierId) ?? null;

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

  const defaultJacketId = fmtRow?.defaultJacketId ?? catalog?.defaultJacketId ?? null;
  const ladderForTier = (
    tier: CatalogTier | null,
    fRow: CatalogFormat | null,
  ): { qty: number; unitCents: number; confirmed?: boolean }[] => {
    if (!tier || !catalog) return [];
    const jId = fRow?.defaultJacketId ?? catalog.defaultJacketId;
    if (jId && tier.laddersByJacket[jId]) return tier.laddersByJacket[jId];
    return tier.priceLadder ?? [];
  };
  const savedLadder = ladderForTier(selectedTier, fmtRow);
  const comboKey = fmt && selectedTier ? `${fmt}:${selectedTier.id}` : null;

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
      }
    }
    for (const q of extraQuantities) set.add(q);
    return Array.from(set).sort((a, b) => a - b);
  }, [catalog, extraQuantities]);

  const savedRungKey = comboKey
    ? savedLadder
        .map((r) => `${r.qty}:${r.confirmed === false ? "q" : "p"}`)
        .sort()
        .join(",")
    : "";
  useEffect(() => {
    if (!comboKey) return;
    setOfferedDrafts((prev) => ({ ...prev, [comboKey]: new Set(savedLadder.map((r) => r.qty)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comboKey, savedRungKey]);

  const modeFor = (q: number): PriceMode => {
    if (!comboKey) return "off";
    const offeredSet = offeredDrafts[comboKey] ?? new Set(savedLadder.map((r) => r.qty));
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
      const cur = prev[comboKey] ?? new Set<number>(savedLadder.map((r) => r.qty));
      const next = new Set(cur);
      if (m === "off") next.delete(q);
      else next.add(q);
      return { ...prev, [comboKey]: next };
    });
    if (m === "quote") setCellValue(q, "");
  };

  const buildLadder = (
    cKey: string,
    saved: { qty: number; unitCents: number; confirmed?: boolean }[],
  ): { ladder: { qty: number; unitCents: number; confirmed: boolean }[]; error: string | null } => {
    const off = offeredDrafts[cKey] ?? new Set<number>(saved.map((r) => r.qty));
    const dr = drafts[cKey] ?? {};
    const out: { qty: number; unitCents: number; confirmed: boolean }[] = [];
    for (const q of columns) {
      if (!off.has(q)) continue;
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
  const normalize = (l: { qty: number; unitCents: number; confirmed?: boolean }[]): string =>
    l
      .slice()
      .sort((a, b) => a.qty - b.qty)
      .map((r) => `${r.qty}:${r.confirmed === false ? "Q" : r.unitCents}`)
      .join("|");
  const comboIsDirty = (cKey: string): boolean => {
    if (!catalog) return false;
    const [f, tierId] = cKey.split(":");
    const fRow = catalog.formats.find((x) => x.format === f) ?? null;
    const tier = fRow?.tiers.find((t) => t.id === tierId) ?? null;
    if (!tier) return false;
    const saved = ladderForTier(tier, fRow);
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
        const [f, tierId] = cKey.split(":");
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
        const saved = ladderForTier(tier, fRow);
        const { ladder, error } = buildLadder(cKey, saved);
        if (error) throw new Error(error);
        await apiRequest(
          "PUT",
          `/api/admin/manufacturers/${pressId}/catalog/tiers/${tier.id}/jackets/${jacketId}/ladder`,
          { priceLadder: ladder },
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
            <div className="inline-flex items-center rounded-full" style={{ marginTop: 16, padding: 3, backgroundColor: "#ececf0" }} role="tablist" aria-label="Catalog format">
              {(() => {
                const vinylActive = !!fmt && VINYL_FORMATS.includes(fmt);
                const pill = (active: boolean) =>
                  active
                    ? { color: BLUE, backgroundColor: "var(--apple-pill, #fff)", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }
                    : { color: INK };
                return (
                  <>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={vinylActive}
                      className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold"
                      style={pill(vinylActive)}
                      onClick={() => { if (offeredVinyl[0]) setActiveTab(offeredVinyl[0]); }}
                      data-testid="format-pill-vinyl"
                    >
                      Vinyl
                    </button>
                    <button type="button" disabled title="Coming" className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold opacity-40 cursor-default" style={{ color: INK }} data-testid="format-pill-cd">CD</button>
                    <button type="button" disabled title="Coming" className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold opacity-40 cursor-default" style={{ color: INK }} data-testid="format-pill-cassette">Cassette</button>
                  </>
                );
              })()}
            </div>
          </div>
          <div style={{ marginTop: 24 }}>
            <SectionLabel>Vinyl · Package pricing</SectionLabel>
          {!hideHeading ? (
              <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
              <span style={{ color: INK }}>Build your vinyl catalog. </span>
              <span style={{ color: FAINT, fontWeight: 600 }}>From scratch.</span>
            </h1>
          ) : (
            <h2 className="tracking-tight" style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
              <span style={{ color: INK }}>Build your vinyl catalog. </span>
              <span style={{ color: FAINT, fontWeight: 600 }}>From scratch.</span>
            </h2>
          )}
           <p className="text-[15px]" style={{ color: SUBINK, marginTop: 12, maxWidth: 560, lineHeight: 1.5 }}>
            Quote the way you already do — a single cost per finished package, per run size. Record, jacket, inner sleeve, and labels are all in it. No per-piece math.
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
      ) : !fmt ? null : (
        <fieldset disabled={!canEdit} className="mt-8 min-w-0">
          <div className="grid gap-16" style={{ gridTemplateColumns: "minmax(0, 1fr) 620px" }}>
            {/* ── LEFT: sticky stage (vinyl only) ── */}
            {isVinyl && (
              <div className="flex flex-col items-center justify-center" style={{ position: "sticky", top: 24, alignSelf: "start", minHeight: 560, paddingTop: 24 }}>
                <div>
                  <JacketStage
                    format={fmt}
                    jacketUrl={jacketUrl}
                    color={selectedColor}
                    labelLogoUrl={labelLogoUrl}
                    labelBgColor={labelBgColor}
                      typeName={selectedTier?.name}
                  />
                </div>
              </div>
            )}

            {/* ── RIGHT: sections ── */}
            <div className="min-w-0" style={{ position: "relative", zIndex: 2, backgroundColor: "var(--apple-canvas, #f5f5f7)" }}>
              {/* Pick a size */}
              {isVinyl && (
                <section id="section-pick-size" data-testid="section-pick-size">
                  <div>
                    <TwoTone lead="Pick a size." rest="Prices follow the record." />
                    <div style={{ marginTop: 14, display: "flex", gap: 12 }}>
                      {VINYL_FORMATS.map((f) => {
                        const available = offered.has(f);
                        const active = activeTab === f;
                        const big = f === "7_inch" ? '7"' : '12"';
                        return (
                          <button key={f} type="button" disabled={!available} onClick={() => available && setActiveTab(f)}
                            aria-pressed={active}
                            className="rounded-2xl bg-white transition-all hover:-translate-y-px focus:outline-none disabled:opacity-40"
                            style={{ flex: 1, padding: "16px 12px", border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: "center", cursor: available ? "pointer" : "default" }}
                            data-testid={`card-size-${f}`}>
                            <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK }}>{big}</div>
                            <div className="text-[11px]" style={{ marginTop: 3, color: "#a1a1a6" }}>{VINYL_SIZE_BLURB[f]}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}

              {/* Pick a type */}
              <section id="section-pick-type" data-testid="section-pick-type">
                <div className="flex items-start justify-between gap-3">
                  <TwoTone lead="Pick a type." rest="Each keeps its own package prices." />
                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <span className="text-[12px] tabular-nums" style={{ color: "#a1a1a6" }}>
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
                  <div className="grid grid-cols-4 gap-3" style={{ marginTop: 12 }}>
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
              </section>

              {/* Pick a color (vinyl only — CD/cassette skip swatches) */}
              {isVinyl && selectedTier && (
                <section id="section-pick-color" data-testid="section-pick-color">
                  <div className="flex items-start justify-between gap-3">
                    <TwoTone lead="Pick a color." rest="Or add a new one." />
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
                    <span style={{ color: reorderColorsOn ? BLUE : "#a1a1a6" }}>
                      {" "}· {colors.length} {colors.length === 1 ? "color" : "colors"} ·{" "}
                      {reorderColorsOn
                        ? "drag a color onto another to move it — Done keeps it, Cancel puts everything back"
                        : "artists see this order"}
                    </span>
                  </p>
                  <div className="grid grid-cols-4 gap-3" style={{ marginTop: 12 }}>
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
                            style={{ padding: "16px 10px 12px", border: `1.5px dashed #c7c7cc`, minHeight: 104 }}
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
              )}

              {/* Name your price */}
              {selectedTier && (
                <section id="section-price" data-testid="section-price">
                  <TwoTone lead="Name your price." rest="Per package, per run." />
                  <p className="text-[12.5px]" style={{ marginTop: 6 }}>
                    <span className="font-semibold" style={{ color: INK }}>{selectedTier.name}</span>
                    <span style={{ color: FAINT }}>{colors.length > 0 ? ` · one price covers all ${colors.length} colors` : " · add colors in the step above"}</span>
                  </p>
                  {canEdit && <div className="flex justify-end" style={{ marginBottom: 8 }}>
                    <AddRunSizePopover onAdd={(q) => setExtraQuantities((prev) => [...prev, q])} existing={columns} />
                  </div>}
                  <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${HAIRLINE}` }} data-testid="price-strip">
                    {columns.map((q, i) => {
                      const mode = modeFor(q);
                      return (
                        <div
                          key={q}
                          className="group flex items-center justify-between"
                          style={{
                            borderTop: i === 0 ? undefined : `1px solid ${HAIRLINE}`,
                            backgroundColor: mode === "off" ? "var(--apple-canvas, #f5f5f7)" : "#fff",
                            opacity: mode === "off" ? 0.75 : 1,
                            padding: "12px 18px",
                            transition: "background-color 0.2s ease, opacity 0.2s ease",
                          }}
                          data-testid={`row-run-${q}`}
                        >
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[15px] font-bold tabular-nums tracking-tight" style={{ color: INK }}>{q.toLocaleString()}</span>
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#a1a1a6" }}>units</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {canEdit && <div className={mode === "priced" ? "opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" : undefined}><ModePicker mode={mode} onChange={(m) => setMode(q, m)} qty={q} visible /></div>}
                            {mode === "priced" ? (
                              <label className="flex items-center justify-center h-9 rounded-lg transition-shadow focus-within:ring-1 focus-within:ring-slate-300" style={{ border: `1px solid ${HAIRLINE}`, background: "#fff", cursor: "text", padding: "0 12px", minWidth: 92 }}>
                                <span className="text-[13px] font-semibold" style={{ color: "#a1a1a6", marginRight: 1 }}>$</span>
                                <input
                                  inputMode="decimal" value={cellValue(q)} onChange={(e) => setCellValue(q, e.target.value)} readOnly={!canEdit}
                                  className="border-0 bg-transparent p-0 text-[14px] font-semibold tabular-nums focus:outline-none" style={{ width: `${Math.max(cellValue(q).length, 4)}ch`, color: INK }}
                                  data-testid={`input-price-${q}`}
                                />
                              </label>
                            ) : (
                              <span className="h-9 rounded-lg flex items-center justify-center text-[12px]" style={{ border: `1px dashed ${HAIRLINE}`, color: "#a1a1a6", background: mode === "off" ? "#fff" : "var(--apple-canvas, #f5f5f7)", padding: "0 12px", minWidth: 92 }}>
                                {mode === "quote" ? "On request" : "—"}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-center" style={{ marginTop: 10 }}>
                    <span className="text-[11.5px]" style={{ color: "#a1a1a6" }}>Prices are per unit, per finished package.</span>
                  </div>
                </section>
              )}

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
                  <section id="section-templates" data-testid="section-templates">
                    <TwoTone lead="Print templates." rest="Artwork specs for artists." />
                  <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.4 }}>Attach a file or paste a link. Optional and quiet.</p>
                    <TemplateTilesGrid pressId={pressId} fmt={fmt} canEdit={canEdit} />
                  </section>
                    <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: "28px 0" }} />
                    <section id="section-audio" data-testid="section-audio">
                    <TwoTone lead="Audio spec." rest="What the lathe can cut." />
                      <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.4 }}>Leave a field blank to inherit the press default — the gray numbers. These drive each album's audio preflight.</p>
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
      <div className="mt-12 flex flex-wrap items-center justify-end gap-4 border-t pt-4" style={{ borderColor: HAIRLINE }}>
        <button type="button" onClick={() => onOpenColors?.()} disabled={!onOpenColors || !canEdit} className="text-[12.5px] font-semibold disabled:opacity-40" style={{ color: BLUE }} data-testid="button-open-vinyl-colors">Add your vinyl</button>
        <CatalogCsvButtons pressId={pressId} pressName={pressDomain} onApplied={invalidate} canEdit={canEdit} />
        {canEdit && pressDomain === "hellbendervinyl.com" && (
          <>
            <HellbenderImportButton pressId={pressId} catalog={catalog ?? null} onImported={invalidate} />
            <HellbenderPricingSyncButton pressId={pressId} onSynced={invalidate} />
          </>
        )}
      </div>
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
    background: "#fff",
    fontWeight: 600,
  };

  return (
    <div data-testid="turnaround-row">
      <div className="flex items-center justify-between gap-6">
        <div>
          <h2 className="tracking-tight" style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 600 }}>
            <span style={{ color: INK }}>Turnaround. </span>
            <span style={{ color: FAINT }}>Order to ship.</span>
          </h2>
          <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.4 }}>
            Weeks from confirmed order to finished records on the truck.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <input
            value={min}
            onChange={(e) => setMin(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={commit}
            inputMode="numeric"
            readOnly={!canEdit}
            placeholder={pressMin != null ? String(pressMin) : "min"}
            aria-label="Minimum weeks"
            data-testid="input-turnaround-min"
            className="text-[14px] text-center tabular-nums focus:outline-none focus:border-slate-400 transition-colors"
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
            className="text-[14px] text-center tabular-nums focus:outline-none focus:border-slate-400 transition-colors"
            style={numInput}
          />
          <span className="text-[13px] font-medium" style={{ color: SUBINK }}>
            weeks
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3" style={{ marginTop: 8 }}>
        {rangeBad && (
          <span className="text-[12px]" style={{ color: CRITICAL }}>
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
  componentKey: "jacket" | "labels" | "inner_sleeve" | "booklet";
  variantKey: string;
  discCount: number;
  artboardWInches: number | null;
  artboardHInches: number | null;
  expectedPages: number | null;
  minPpi: number | null;
  color: "process-4c" | "cmyk-or-pms" | null;
  fontsRule: string | null;
  templateFileUrl: string | null;
};
// Blueprint icons — line drawings of the actual piece, drawn like a die-line.
// Solid strokes are edges; dashed strokes are folds, holes, and hidden parts.
// (Same canon as the artist package builder — one icon language on both sides.)
function BlueprintIcon({ kind }: { kind: string }) {
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
          <rect x="3" y="4" width="18" height="18" rx="1.2" fill="#fff" />
        </svg>
      );
    case "labels": // center label — dashed record as context, solid label as the piece
      return (
        <svg {...s}>
          <circle cx="13" cy="13" r="11" strokeDasharray="2 2.2" opacity={0.7} />
          <circle cx="13" cy="13" r="6.5" fill="#fff" />
          <circle cx="13" cy="13" r="1.3" />
          <path d="M9.6 10.4a4.6 4.6 0 0 1 6.8 0" opacity={0.6} />
        </svg>
      );
    case "inner": // inner sleeve — square sleeve half-hidden behind the dashed jacket
      return (
        <svg {...s}>
          <rect x="9" y="5.5" width="15" height="15" rx="1" fill="#fff" />
          <rect x="2" y="5" width="16" height="16" rx="1.2" strokeDasharray="2 2.2" opacity={0.7} fill="#fff" />
        </svg>
      );
    case "booklet": // folded booklet — dashed center fold, text lines
      return (
        <svg {...s}>
          <rect x="4" y="4.5" width="18" height="17" rx="1.2" fill="#fff" />
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

function TemplateTilesGrid({ pressId, fmt, canEdit }: { pressId: string; fmt: AlbumFormat; canEdit: boolean }) {
  const { toast } = useToast();
  const qk = ["/api/admin/manufacturers", pressId, "template-specs"];
  const { data } = useQuery<{ specs: PressTemplateSpecRow[] }>({ queryKey: qk });
  const specsForFmt = (data?.specs ?? []).filter((s) => s.format === fmt && s.variantKey === "" && s.discCount === 0);
  const byComponent = (key: PressTemplateSpecRow["componentKey"]) =>
    specsForFmt.find((s) => s.componentKey === key) ?? null;

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

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {TEMPLATE_TILES.map((tile) => (
        <TemplateTile
          key={tile.key}
          tile={tile}
          spec={byComponent(tile.componentKey)}
          canEdit={canEdit}
          busy={save.isPending || remove.isPending}
          onSave={(body) => save.mutate({ componentKey: tile.componentKey, ...body })}
          onRemove={(specId) => remove.mutate(specId)}
        />
      ))}
    </div>
  );
}

function TemplateTile({
  tile,
  spec,
  canEdit,
  busy,
  onSave,
  onRemove,
}: {
  tile: (typeof TEMPLATE_TILES)[number];
  spec: PressTemplateSpecRow | null;
  canEdit: boolean;
  busy: boolean;
  onSave: (body: Partial<PressTemplateSpecRow>) => void;
  onRemove: (specId: string) => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
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
  const fileName = fileUrl ? fileUrl.split("/").pop() ?? "template" : null;

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadAdminDoc(file);
      onSave({ templateFileUrl: url });
      setOpen(false);
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
    onSave({ templateFileUrl: url });
    setUrlDraft("");
    setOpen(false);
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
    setOpen(false);
  };

  const dimInput: React.CSSProperties = {
    height: 34,
    border: `1px solid ${HAIRLINE}`,
    borderRadius: 9,
    padding: "0 8px",
    color: INK,
    background: "#fff",
  };
  const editor = (
    <PopoverContent align="center" sideOffset={8} className="w-72 rounded-2xl p-4" style={{ border: `1px solid ${HAIRLINE}` }} data-testid={`template-editor-${tile.key}`}>
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
        className="w-full inline-flex h-9 items-center justify-center gap-2 rounded-full text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        style={{ backgroundColor: BLUE }}
        data-testid={`template-upload-file-${tile.key}`}
      >
        {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {fileUrl ? "Replace file" : "Upload a file"}
      </button>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitUrl();
          }}
          placeholder="…or paste a link"
          className="min-w-0 flex-1 text-[13px] focus:outline-none focus:border-slate-400"
          style={{ ...dimInput, height: 36 }}
          data-testid={`input-template-url-${tile.key}`}
        />
        {urlDraft.trim() && (
          <button type="button" onClick={commitUrl} className="text-[12.5px] font-semibold" style={{ color: BLUE }}>
            Save
          </button>
        )}
      </div>
      <div className="mt-4">
        <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: SUBINK }}>
          Finished-file check
        </div>
        <p className="text-[11.5px]" style={{ color: SUBINK, marginTop: 3, lineHeight: 1.35 }}>
          Optional — refines the artboard check on finished print files.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="flex items-center gap-1.5">
            <input value={wDraft} onChange={(e) => setWDraft(e.target.value)} inputMode="decimal" placeholder="W" className="w-full text-[13px] tabular-nums focus:outline-none" style={dimInput} data-testid={`input-template-w-${tile.key}`} />
            <span className="text-[11px]" style={{ color: SUBINK }}>in</span>
          </label>
          <label className="flex items-center gap-1.5">
            <input value={hDraft} onChange={(e) => setHDraft(e.target.value)} inputMode="decimal" placeholder="H" className="w-full text-[13px] tabular-nums focus:outline-none" style={dimInput} data-testid={`input-template-h-${tile.key}`} />
            <span className="text-[11px]" style={{ color: SUBINK }}>in</span>
          </label>
          <label className="flex items-center gap-1.5">
            <input value={pagesDraft} onChange={(e) => setPagesDraft(e.target.value)} inputMode="numeric" placeholder="Pages" className="w-full text-[13px] tabular-nums focus:outline-none" style={dimInput} data-testid={`input-template-pages-${tile.key}`} />
          </label>
          <label className="flex items-center gap-1.5">
            <input value={ppiDraft} onChange={(e) => setPpiDraft(e.target.value)} inputMode="numeric" placeholder="Min PPI" className="w-full text-[13px] tabular-nums focus:outline-none" style={dimInput} data-testid={`input-template-ppi-${tile.key}`} />
          </label>
        </div>
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={saveDims} disabled={busy} className="text-[12.5px] font-semibold hover:underline underline-offset-2 disabled:opacity-40" style={{ color: BLUE }} data-testid={`button-save-template-dims-${tile.key}`}>
            Save check
          </button>
        </div>
      </div>
      {fileUrl && spec && (
        <div className="mt-3 flex items-center justify-between" style={{ borderTop: `1px solid ${HAIRLINE}`, paddingTop: 10 }}>
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" download className="text-[12.5px] font-semibold hover:underline underline-offset-2" style={{ color: BLUE }} data-testid={`link-template-download-${tile.key}`}>
            Download
          </a>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onRemove(spec.id);
              setOpen(false);
            }}
            className="text-[12.5px] font-semibold hover:underline underline-offset-2 disabled:opacity-40"
            style={{ color: CRITICAL }}
            data-testid={`template-remove-${tile.key}`}
          >
            Remove
          </button>
        </div>
      )}
    </PopoverContent>
  );

  // Empty slot — the visible invitation. Dashed, one clear action.
  if (!fileUrl) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={!canEdit}
            data-testid={`template-upload-${tile.key}`}
            className="flex flex-col items-center justify-center rounded-xl transition-colors hover:bg-white focus:outline-none disabled:cursor-default"
            style={{ border: `1.5px dashed ${FAINT}`, padding: "18px 12px", cursor: canEdit ? "pointer" : "default", background: "transparent" }}
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
        </PopoverTrigger>
        {canEdit && editor}
      </Popover>
    );
  }

  // Filled slot — calm and complete. Replace appears only on hover.
  return (
    <div
      className="group relative flex flex-col items-center justify-center rounded-xl bg-white text-center"
      style={{ border: `1px solid ${HAIRLINE}`, padding: "18px 12px" }}
      data-testid={`template-${tile.key}`}
    >
      <BlueprintIcon kind={tile.key} />
      <div className="text-[13px] font-semibold" style={{ color: INK, marginTop: 8 }}>
        {tile.label}
      </div>
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        download
        className="text-[11.5px] tabular-nums hover:underline underline-offset-2"
        style={{ color: SUBINK, marginTop: 3 }}
        title={fileName ?? undefined}
        data-testid={`text-template-filename-${tile.key}`}
      >
        {middleTruncate(fileName ?? "template")}
      </a>
      {canEdit && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="absolute right-2 top-2 h-7 rounded-full px-2.5 text-[11.5px] font-semibold opacity-0 transition-opacity hover:bg-slate-100 group-hover:opacity-100"
              style={{ color: SUBINK }}
              data-testid={`button-template-replace-${tile.key}`}
            >
              Replace
            </button>
          </PopoverTrigger>
          {editor}
        </Popover>
      )}
    </div>
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
  return (
    <label
      className="flex h-9 items-center justify-center rounded-lg transition-shadow focus-within:ring-1 focus-within:ring-slate-300"
      style={{ border: `1px solid ${HAIRLINE}`, background: "#fff", cursor: "text", padding: "0 10px" }}
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
