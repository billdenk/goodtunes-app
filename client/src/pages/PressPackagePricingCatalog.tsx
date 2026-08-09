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
import { FileText, Loader2, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
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
  const DISC = 264;
  return (
    <div data-testid="jacket-stage">
      <style dangerouslySetInnerHTML={{ __html: DISC_SPIN_CSS }} />
      <div className="group relative" style={{ width: 300, height: 300 }}>
        {/* Discs peek out to the right; slide further on hover. */}
        {isDouble && (
          <div
            className="absolute transition-transform duration-500 ease-out group-hover:translate-x-6"
            style={{ top: 26, left: 96, opacity: 0.55, transitionDelay: "60ms" }}
            aria-hidden
          >
            <VinylDisc size={DISC - 16} color={color} labelLogoUrl={labelLogoUrl} labelBgColor={labelBgColor} />
          </div>
        )}
        <div
          className="absolute transition-transform duration-500 ease-out group-hover:translate-x-10"
          style={{ top: 18, left: 76 }}
        >
          <div className="gt-vinyl" style={{ borderRadius: "50%" }}>
            <VinylDisc size={DISC} color={color} labelLogoUrl={labelLogoUrl} labelBgColor={labelBgColor} spin />
          </div>
        </div>
        {/* Jacket in front */}
        <div
          className="absolute left-0 top-0 overflow-hidden rounded-[10px]"
          style={{
            width: 264,
            height: 264,
            boxShadow: "0 18px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.12)",
            backgroundColor: "#22242a",
            border: `1px solid ${HAIRLINE}`,
          }}
        >
          {jacketUrl ? (
            <img src={jacketUrl} alt="" aria-hidden className="h-full w-full object-cover" />
          ) : placeholderIconUrl ? (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ backgroundColor: "#1d1d1f" }}
              data-testid="jacket-placeholder-icon"
            >
              <img src={placeholderIconUrl} alt="" aria-hidden style={{ width: "45%", opacity: 0.95 }} />
            </div>
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{
                background:
                  "linear-gradient(150deg, #2b2e36 0%, #1c1e24 60%, #14161b 100%)",
              }}
            >
              {labelLogoUrl ? (
                <img src={labelLogoUrl} alt="" aria-hidden style={{ width: 96, opacity: 0.8 }} />
              ) : (
                <span className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Printed jacket
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Caption — centered under the jacket, not the full stage. */}
      <div className="mt-6 flex -translate-x-[33px] items-center gap-2.5" data-testid="stage-caption">
        {color && <ColorBall color={color} size={22} />}
        <span className="text-[13px]" style={{ color: SUBINK }}>
          <span>{format === "7_inch" ? '7"' : '12"'}</span>
          <span style={{ color: "#d1d1d6" }}> · </span>
          <span>{typeName ?? ALBUM_FORMAT_LABEL[format] ?? format}</span>
          {color ? <><span style={{ color: "#d1d1d6" }}> · </span><span className="font-semibold" style={{ color: INK }}>{color.name}</span></> : null}
        </span>
      </div>
      <p className="mt-1 text-[12px]" style={{ color: FAINT, marginBottom: 16 }}>
        Printed jacket{format.startsWith("12") ? " and inner sleeve" : ""} included.
      </p>
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
  onPick,
  onRename,
  onDelete,
  canEdit,
  labelLogoUrl,
  labelBgColor,
  busy,
}: {
  tier: CatalogTier;
  active: boolean;
  onPick: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  canEdit: boolean;
  labelLogoUrl: string | null;
  labelBgColor: string | null;
  busy: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState(tier.name);
  const [confirming, setConfirming] = useState(false);
  const preview = tier.colors[0] ?? null;
  return (
    <div className="group/type relative">
      <button
        type="button"
        onClick={onPick}
        data-testid={`card-type-${tier.id}`}
        className="flex w-full flex-col items-center rounded-2xl bg-white pb-3 pt-4 transition-all focus:outline-none"
        style={{
          border: `1.5px solid ${active ? BLUE : HAIRLINE}`,
          boxShadow: active ? "0 6px 18px rgba(49,158,216,0.16)" : undefined,
        }}
      >
        <VinylDisc size={90} color={preview} labelLogoUrl={labelLogoUrl} labelBgColor={labelBgColor} />
        <span className="mt-2.5 max-w-full truncate px-3 text-[13px] font-semibold" style={{ color: active ? BLUE : INK }}>
          {tier.name}
        </span>
        <span className="text-[11.5px]" style={{ color: SUBINK }}>
          {tier.colors.length} {tier.colors.length === 1 ? "color" : "colors"}
        </span>
      </button>
      {canEdit && !active && (
        <Popover
          open={menuOpen}
          onOpenChange={(v) => {
            setMenuOpen(v);
            if (v) {
              setName(tier.name);
              setConfirming(false);
            }
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Edit ${tier.name}`}
              data-testid={`button-type-menu-${tier.id}`}
              className={cn(
                "absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white transition-opacity hover:bg-slate-100",
                menuOpen ? "opacity-100" : "opacity-0 group-hover/type:opacity-100",
              )}
              style={{ color: SUBINK, border: `1px solid ${HAIRLINE}` }}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="w-72 rounded-2xl p-0"
            style={{
              border: `1px solid ${HAIRLINE}`,
              backgroundColor: "var(--apple-frost, rgba(255,255,255,0.85))",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              boxShadow: "0 20px 48px rgba(0,0,0,0.16)",
            }}
            data-testid={`popover-type-editor-${tier.id}`}
          >
            <div style={{ padding: 16 }}>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: SUBINK }}>
                Type name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim() && name.trim() !== tier.name) {
                    onRename(name.trim());
                    setMenuOpen(false);
                  }
                }}
                className="mt-1.5 w-full bg-white text-[13.5px] focus:outline-none focus:border-slate-400"
                style={{ height: 38, border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: "0 12px", color: INK }}
                data-testid={`input-type-rename-${tier.id}`}
              />
              {!confirming ? (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
                  style={{ color: CRITICAL }}
                  data-testid={`button-type-delete-${tier.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete type
                </button>
              ) : (
                <div className="mt-3 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(224,36,94,0.06)" }}>
                  <p className="text-[12px]" style={{ color: INK }}>
                    Deletes {tier.name}, its {tier.colors.length}{" "}
                    {tier.colors.length === 1 ? "color" : "colors"} and pricing. This can&rsquo;t be
                    undone.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete();
                      setMenuOpen(false);
                    }}
                    className="mt-1.5 text-[12.5px] font-semibold"
                    style={{ color: CRITICAL }}
                    data-testid={`button-type-delete-confirm-${tier.id}`}
                  >
                    Delete {tier.name}
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-1" style={{ padding: "10px 16px", borderTop: `1px solid ${HAIRLINE}` }}>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors hover:bg-slate-100"
                style={{ color: SUBINK }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !name.trim() || name.trim() === tier.name}
                onClick={() => {
                  onRename(name.trim());
                  setMenuOpen(false);
                }}
                className="rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors hover:bg-slate-100 disabled:opacity-40"
                style={{ color: BLUE }}
                data-testid={`button-type-rename-save-${tier.id}`}
              >
                Save
              </button>
            </div>
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
  const opts: { m: PriceMode; label: string }[] = [
    { m: "priced", label: "Priced" },
    { m: "quote", label: "Quote on request" },
    { m: "off", label: "Not offered" },
  ];
  return (
    <div
      className={cn(
        "flex items-center gap-1 transition-opacity",
        visible ? "opacity-100" : "opacity-0 group-hover/run:opacity-100 focus-within:opacity-100",
      )}
      role="radiogroup"
      aria-label={`Availability at ${qty}`}
    >
      {opts.map(({ m, label }) => {
        const on = mode === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(m)}
            data-testid={`mode-${m}-${qty}`}
            className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors"
            style={
              on
                ? { backgroundColor: "rgba(49,158,216,0.12)", color: BLUE }
                : { color: SUBINK }
            }
          >
            {label}
          </button>
        );
      })}
    </div>
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
        <button type="button" className="flex items-center gap-2 focus:outline-none" data-testid="button-add-run-size">
          <span
            className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border"
            style={{ borderColor: BLUE, color: BLUE }}
          >
            <Plus className="h-3 w-3" strokeWidth={2.5} />
          </span>
          <span className="text-[13px] font-semibold" style={{ color: BLUE }}>
            Add run size
          </span>
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
      setActiveTab(VINYL_FORMATS.find((f) => offeredList.includes(f)) ?? VINYL_FORMATS[0]);
      return;
    }
    if (!offeredList.includes(activeTab as AlbumFormat)) {
      setActiveTab(VINYL_FORMATS.find((f) => offeredList.includes(f)) ?? VINYL_FORMATS[0]);
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

  const jacketUrl = placeholderUrl || pressPlaceholderArt(pressDomain);
  const offeredVinyl = VINYL_FORMATS.filter((f) => offered.has(f));
  const missingVinyl = VINYL_FORMATS.filter((f) => !offered.has(f));

  return (
    <div className="max-w-[1400px]" data-testid="panel-press-catalog">
      {/* ── Catalog header ── */}
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div>
            <h1 className="tracking-tight" style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.08, color: INK }}>
              Catalog
            </h1>
            <div className="inline-flex items-center rounded-full p-1" style={{ backgroundColor: "var(--apple-track, #f0f0f2)" }} role="tablist" aria-label="Catalog format">
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
          <div className="mt-7">
            <SectionLabel>Vinyl · Package pricing</SectionLabel>
          </div>
          {!hideHeading ? (
            <h1 className="tracking-tight" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.08, marginTop: 8 }}>
              <span style={{ color: INK }}>Build your vinyl catalog. </span>
              <span style={{ color: FAINT, fontWeight: 600 }}>From scratch.</span>
            </h1>
          ) : (
            <h2 className="tracking-tight" style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
              <span style={{ color: INK }}>Build your vinyl catalog. </span>
              <span style={{ color: FAINT, fontWeight: 600 }}>From scratch.</span>
            </h2>
          )}
          <p className="mt-1.5 max-w-[680px] text-[13px]" style={{ color: SUBINK }}>
            Quote the way you already do — a single cost per finished package, per run size. Record, jacket, inner sleeve, and labels are all in it. No per-piece math.
          </p>
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
          <div className="flex flex-col gap-12 xl:flex-row">
            {/* ── LEFT: sticky stage (vinyl only) ── */}
            {isVinyl && (
              <div className="flex-shrink-0 w-full xl:w-[320px]" style={{ width: 320, maxWidth: "100%" }}>
                <div className="sticky top-8">
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
            <div className="min-w-0 flex-1 space-y-10">
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
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <TwoTone lead="Pick a type." rest="Each keeps its own package prices." />
                </div>
                {tiers.length === 0 ? (
                  <p className="mt-3 text-[13px]" style={{ color: SUBINK }}>
                    No pressing types yet — add one to start your {ALBUM_FORMAT_LABEL[fmt]} catalog.
                  </p>
                ) : (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {tiers.map((t) => (
                      <GroupCard
                        key={t.id}
                        tier={t}
                        active={t.id === selectedTierId}
                        onPick={() => setSelectedTierId(t.id)}
                        onRename={(name) => renameTier.mutate({ id: t.id, name })}
                        onDelete={() => deleteTier.mutate(t.id)}
                        canEdit={canEdit}
                        labelLogoUrl={labelLogoUrl}
                        labelBgColor={labelBgColor}
                        busy={renameTier.isPending || deleteTier.isPending}
                      />
                    ))}
                  </div>
                )}
                {canEdit && <MoreTypesPopover onAdd={(name) => addTier.mutate(name)} adding={addTier.isPending} />}
              </section>

              {/* Pick a color (vinyl only — CD/cassette skip swatches) */}
              {isVinyl && selectedTier && (
                <section id="section-pick-color" data-testid="section-pick-color">
                  <TwoTone lead="Pick a color." rest={`${selectedTier.name}.`} />
                  {canEdit && colors.length > 1 && (
                    <p className="mt-1.5 text-[12.5px]" style={{ color: FAINT }} data-testid="hint-color-reorder">
                      {colors.length} colors · drag to reorder — artists see this order
                    </p>
                  )}
                  <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5">
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
                          className="group/color relative"
                          draggable={canEdit}
                          onDragStart={(e) => {
                            if (!canEdit) return;
                            setDragColorId(c.id);
                            setColorOrderDraft(colors.map((x) => x.id));
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => {
                            if (!canEdit || !dragColorId || dragColorId === c.id) return;
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
                          onDragEnd={() => {
                            setDragColorId(null);
                            setColorOrderDraft((draft) => {
                              const orig = colors.map((x) => x.id).join(",");
                              if (draft && draft.join(",") !== orig && draft.length > 1) {
                                reorderColors.mutate(draft);
                                return draft; // keep the visual order until the refetch lands
                              }
                              return null;
                            });
                          }}
                          style={{
                            opacity: dragColorId === c.id ? 0.45 : 1,
                            cursor: dragColorId ? "grabbing" : undefined,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedColorId(c.id)}
                            data-testid={`card-color-${c.id}`}
                            className="flex w-full flex-col items-center rounded-2xl bg-white pb-2.5 pt-3.5 transition-all focus:outline-none"
                            style={{
                              border: `1.5px solid ${on ? BLUE : HAIRLINE}`,
                              boxShadow: on ? "0 6px 18px rgba(49,158,216,0.16)" : undefined,
                            }}
                          >
                            <ColorBall color={c} size={44} />
                            <span
                              className="mt-2 max-w-full truncate px-2 text-[12px] font-semibold"
                              style={{ color: on ? BLUE : INK }}
                            >
                              {c.name}
                            </span>
                          </button>
                          {canEdit && (
                            <SwatchEditorPopover
                              open={editColorId === c.id}
                              onOpenChange={(v) => setEditColorId(v ? c.id : null)}
                              edit={c}
                              saving={patchColor.isPending}
                              onSave={(v) => patchColor.mutate({ id: c.id, body: v })}
                              onRemove={() => deleteColor.mutate(c.id)}
                              labelLogoUrl={labelLogoUrl}
                              labelBgColor={labelBgColor}
                              trigger={
                                <button
                                  type="button"
                                  aria-label={`Edit ${c.name}`}
                                  data-testid={`button-color-menu-${c.id}`}
                                  className={cn(
                                    "absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white transition-opacity hover:bg-slate-100",
                                    editColorId === c.id
                                      ? "opacity-100"
                                      : "opacity-0 group-hover/color:opacity-100",
                                  )}
                                  style={{ color: SUBINK, border: `1px solid ${HAIRLINE}` }}
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                              }
                            />
                          )}
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
                          <button
                            type="button"
                            className="flex min-h-[104px] w-full flex-col items-center justify-center rounded-2xl transition-colors hover:bg-slate-50 focus:outline-none"
                            style={{ border: `1.5px dashed ${FAINT}` }}
                            data-testid="button-add-color"
                          >
                            <span
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border"
                              style={{ borderColor: BLUE, color: BLUE }}
                            >
                              <Plus className="h-4 w-4" strokeWidth={2.5} />
                            </span>
                            <span className="mt-1.5 text-[12px] font-semibold" style={{ color: BLUE }}>
                              Add color
                            </span>
                          </button>
                        }
                      />
                    )}
                  </div>
                </section>
              )}

              {/* Name your price */}
              {selectedTier && (
                <section id="section-price" data-testid="section-price">
                  <TwoTone lead="Name your price." rest={`${selectedTier.name} · ${ALBUM_FORMAT_LABEL[fmt]}.`} />
                  <Card className="mt-4 overflow-hidden" testId="price-strip">
                    {columns.map((q, i) => {
                      const mode = modeFor(q);
                      return (
                        <div
                          key={q}
                          className="group/run flex items-center gap-4 px-5"
                          style={{
                            borderTop: i === 0 ? undefined : `1px solid ${HAIRLINE}`,
                            backgroundColor: mode === "off" ? "var(--apple-canvas, #f5f5f7)" : undefined,
                            opacity: mode === "off" ? 0.75 : 1,
                            paddingTop: 10,
                            paddingBottom: 10,
                          }}
                          data-testid={`row-run-${q}`}
                        >
                          <div className="w-20 flex-shrink-0 text-[14px] font-semibold tabular-nums" style={{ color: mode === "off" ? SUBINK : INK }}>
                            {q.toLocaleString()}
                          </div>
                          <div className="flex-1">
                            {canEdit ? (
                              <ModePicker mode={mode} onChange={(m) => setMode(q, m)} qty={q} visible={mode !== "priced"} />
                            ) : (
                              <span className="text-[11.5px] font-semibold" style={{ color: SUBINK }}>
                                {mode === "priced" ? "" : mode === "quote" ? "Quote on request" : "Not offered"}
                              </span>
                            )}
                          </div>
                          <div className="w-36 flex-shrink-0 text-right">
                            {mode === "priced" ? (
                              <div className="inline-flex items-center gap-1">
                                <span className="text-[13px]" style={{ color: SUBINK }}>
                                  $
                                </span>
                                <input
                                  inputMode="decimal"
                                  value={cellValue(q)}
                                  onChange={(e) => setCellValue(q, e.target.value)}
                                  readOnly={!canEdit}
                                  aria-label={`Per-unit price at ${q}`}
                                  className="w-24 bg-white text-right text-[14px] font-semibold tabular-nums focus:outline-none focus:border-slate-400"
                                  style={{ height: 34, border: `1px solid ${HAIRLINE}`, borderRadius: 9, padding: "0 10px", color: INK }}
                                  data-testid={`input-price-${q}`}
                                />
                              </div>
                            ) : mode === "quote" ? (
                              <span
                                className="inline-flex h-[34px] w-full items-center justify-end rounded-[9px] px-2.5 text-[12.5px] font-medium"
                                style={{ border: `1px dashed ${FAINT}`, color: SUBINK }}
                              >
                                On request
                              </span>
                            ) : (
                              <span className="text-[14px]" style={{ color: FAINT }}>
                                —
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                      {canEdit ? (
                        <AddRunSizePopover onAdd={(q) => setExtraQuantities((prev) => [...prev, q])} existing={columns} />
                      ) : (
                        <span />
                      )}
                      <span className="text-[12px]" style={{ color: SUBINK }}>
                        Prices are per unit, per finished package.
                      </span>
                    </div>
                  </Card>
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
                    <p className="mt-1 text-[12.5px]" style={{ color: SUBINK }}>Attach a file or paste a link. Optional and quiet.</p>
                    <TemplateTilesGrid pressId={pressId} fmt={fmt} canEdit={canEdit} />
                  </section>
                  <section id="section-audio" data-testid="section-audio">
                    <TwoTone lead="Audio spec." rest="What the lathe can cut." />
                    <AudioSpecEditorCard pressId={pressId} canEdit={canEdit} />
                  </section>
                </>
              )}
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
