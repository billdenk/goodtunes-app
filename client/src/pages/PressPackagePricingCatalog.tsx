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
import { Loader2, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Catalog,
  CatalogColor,
  CatalogFormat,
  CatalogTab,
  CatalogTier,
  CatalogCsvButtons,
  DEFAULT_QTY_COLUMNS,
  FormatDropdown,
  FormatTurnaroundEditor,
  GoodDeedPrintingEditor,
  HellbenderImportButton,
  HellbenderPricingSyncButton,
  PressAudioSpecCard,
  PressTemplateSpecsCard,
  ManageColorsPanel,
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
  "7_inch": "Two songs. One single.",
  "12_lp": "The classic full-length.",
  "12_double": "Two discs. One gatefold.",
};

// ─── Left column: jacket + disc stage ────────────────────────────────
// The album jacket with the vinyl peeking out to the right. Hovering
// slides the disc further out and spins the disc body (highlight stays
// fixed — VinylDisc already keeps its sheen static). Double LP shows a
// second, dimmer disc behind the first.
function JacketStage({
  format,
  jacketUrl,
  color,
  labelLogoUrl,
  labelBgColor,
}: {
  format: AlbumFormat;
  jacketUrl: string | null;
  color: CatalogColor | null;
  labelLogoUrl: string | null;
  labelBgColor: string | null;
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
      {/* Caption */}
      <div className="mt-6 flex items-center gap-2.5" data-testid="stage-caption">
        {color && <ColorBall color={color} size={22} />}
        <span className="text-[13px] font-semibold" style={{ color: INK }}>
          {ALBUM_FORMAT_LABEL[format] ?? format}
          {color ? <span style={{ color: SUBINK, fontWeight: 500 }}> · {color.name}</span> : null}
        </span>
      </div>
      <p className="mt-1 text-[12px]" style={{ color: SUBINK }}>
        Each comes with a printed jacket{format.startsWith("12") ? " and inner sleeve" : ""}.
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
        <div className="text-[14px] font-semibold" style={{ color: active ? BLUE : INK }}>
          {ALBUM_FORMAT_LABEL[format] ?? format}
        </div>
        <div className="mt-0.5 text-[12px]" style={{ color: SUBINK }}>
          {hidden ? "Hidden from artists" : VINYL_SIZE_BLURB[format] ?? "\u00A0"}
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
      {canEdit && (
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
}: {
  pressId: string;
  pressDomain: string | null;
  placeholderUrl?: string | null;
  pressLogoUrl?: string | null;
  hideHeading?: boolean;
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
  const { data: catalog, isLoading } = useQuery<Catalog>({
    queryKey: ["/api/admin/manufacturers", pressId, "catalog"],
    enabled: !!pressId && !!canView,
  });
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

  // ── Format selection (vinyl size cards + dropdown for CD/cassette/GoodDeeds)
  const [activeTab, setActiveTab] = useState<CatalogTab | null>(null);
  useEffect(() => {
    if (!catalog) return;
    const offeredList = catalog.formats.map((f) => f.format);
    if (activeTab === null) {
      if (offeredList.length === 0) setActiveTab("gooddeeds");
      else setActiveTab(VINYL_FORMATS.find((f) => offeredList.includes(f)) ?? offeredList[0]);
      return;
    }
    if (activeTab !== "gooddeeds" && !offeredList.includes(activeTab as AlbumFormat)) {
      if (offeredList.length === 0) setActiveTab("gooddeeds");
      else setActiveTab(VINYL_FORMATS.find((f) => offeredList.includes(f)) ?? offeredList[0]);
    }
  }, [catalog, activeTab]);

  const toggleFormat = useMutation({
    mutationFn: async (args: { format: AlbumFormat; enabled: boolean }) => {
      const r = await apiRequest(
        "PUT",
        `/api/admin/manufacturers/${pressId}/catalog/formats/${args.format}`,
        { enabled: args.enabled },
      );
      return r.json();
    },
    onSuccess: invalidate,
    onError: (e: any) =>
      toast({ title: "Couldn't update formats", description: e?.message, variant: "destructive" }),
  });
  const hideFormat = useMutation({
    mutationFn: async (args: { format: AlbumFormat; hidden: boolean }) => {
      const r = await apiRequest(
        "PUT",
        `/api/admin/manufacturers/${pressId}/catalog/formats/${args.format}`,
        { hidden: args.hidden },
      );
      return r.json();
    },
    onSuccess: invalidate,
    onError: (e: any) =>
      toast({ title: "Couldn't update format", description: e?.message, variant: "destructive" }),
  });

  const offered = new Set((catalog?.formats ?? []).map((f) => f.format));
  const fmt = activeTab && activeTab !== "gooddeeds" ? (activeTab as AlbumFormat) : null;
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
    if (!tiers.some((t) => t.id === selectedTierId)) setSelectedTierId(tiers[0].id);
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
  const [manageColorsOpen, setManageColorsOpen] = useState(false);
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
      {/* ── Header row: label, heading, save ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionLabel>Vinyl catalog · Package pricing</SectionLabel>
          {!hideHeading ? (
            <h1 className="tracking-tight" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.08, marginTop: 8 }}>
              <span style={{ color: INK }}>One price. </span>
              <span style={{ color: FAINT, fontWeight: 600 }}>The whole record.</span>
            </h1>
          ) : (
            <h2 className="tracking-tight" style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
              <span style={{ color: INK }}>One price. </span>
              <span style={{ color: FAINT, fontWeight: 600 }}>The whole record.</span>
            </h2>
          )}
          <p className="mt-1.5 text-[13px]" style={{ color: SUBINK }}>
            Every price covers the finished package — pressing, printed jacket and sleeves.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <CatalogCsvButtons pressId={pressId} pressName={pressDomain} onApplied={invalidate} canEdit={canEdit} />
          {canEdit && pressDomain === "hellbendervinyl.com" && (
            <>
              <HellbenderImportButton pressId={pressId} catalog={catalog ?? null} onImported={invalidate} />
              <HellbenderPricingSyncButton pressId={pressId} onSynced={invalidate} />
            </>
          )}
          {canEdit && (
            <div className="flex items-center gap-3">
              <span className="text-[12.5px]" style={{ color: anyDirty ? SUBINK : FAINT }} data-testid="text-save-status">
                {saveCatalog.isPending ? "Saving…" : anyDirty ? "Edited" : "All changes saved"}
              </span>
              <button
                type="button"
                disabled={!anyDirty || saveCatalog.isPending}
                onClick={() => saveCatalog.mutate()}
                className="inline-flex h-9 items-center gap-2 rounded-full px-5 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: BLUE }}
                data-testid="button-save-catalog"
              >
                {saveCatalog.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save catalog
              </button>
            </div>
          )}
        </div>
      </div>

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

      {/* Non-vinyl format switch (CD / Cassette / GoodDeeds live here, plus
          add/remove format — full parity with the legacy dropdown). */}
      <div className="mt-5">
        <FormatDropdown
          offered={offered}
          activeTab={activeTab}
          onSetTab={setActiveTab}
          onAddFormat={(f) => {
            setActiveTab(f);
            toggleFormat.mutate({ format: f, enabled: true });
          }}
          onRemoveFormat={(f) => {
            const remaining = (Array.from(offered) as AlbumFormat[]).filter((x) => x !== f);
            setActiveTab(remaining.length > 0 ? remaining[0] : "gooddeeds");
            toggleFormat.mutate({ format: f, enabled: false });
          }}
          addBusy={toggleFormat.isPending}
          removeBusy={toggleFormat.isPending}
          canEdit={canEdit}
        />
      </div>

      {isLoading || !catalog ? (
        <div className="py-10 text-[13.5px]" style={{ color: SUBINK }}>
          Loading…
        </div>
      ) : activeTab === "gooddeeds" ? (
        <fieldset disabled={!canEdit} className="mt-6 min-w-0">
          <GoodDeedPrintingEditor pressId={pressId} />
        </fieldset>
      ) : !fmt ? null : (
        <fieldset disabled={!canEdit} className="mt-8 min-w-0">
          <div className="flex flex-col gap-12 lg:flex-row">
            {/* ── LEFT: sticky stage (vinyl only) ── */}
            {isVinyl && (
              <div className="hidden flex-shrink-0 lg:block" style={{ width: 320 }}>
                <div className="sticky top-8">
                  <JacketStage
                    format={fmt}
                    jacketUrl={jacketUrl}
                    color={selectedColor}
                    labelLogoUrl={labelLogoUrl}
                    labelBgColor={labelBgColor}
                  />
                </div>
              </div>
            )}

            {/* ── RIGHT: sections ── */}
            <div className="min-w-0 flex-1 space-y-10">
              {/* Pick a size */}
              {isVinyl && (
                <section id="section-pick-size" data-testid="section-pick-size">
                  <TwoTone lead="Pick a size." rest="Seven or twelve." />
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {offeredVinyl.map((f) => (
                      <SizeCard
                        key={f}
                        format={f}
                        active={activeTab === f}
                        hidden={!!catalog.formats.find((x) => x.format === f)?.hidden}
                        onPick={() => setActiveTab(f)}
                        onHide={(hidden) => hideFormat.mutate({ format: f, hidden })}
                        onRemove={() => {
                          const remaining = offeredVinyl.filter((x) => x !== f);
                          setActiveTab(
                            remaining[0] ??
                              (Array.from(offered).filter((x) => x !== f)[0] as AlbumFormat) ??
                              "gooddeeds",
                          );
                          toggleFormat.mutate({ format: f, enabled: false });
                        }}
                        canEdit={canEdit}
                      />
                    ))}
                    {canEdit &&
                      missingVinyl.map((f) => (
                        <button
                          key={f}
                          type="button"
                          disabled={toggleFormat.isPending}
                          onClick={() => {
                            setActiveTab(f);
                            toggleFormat.mutate({ format: f, enabled: true });
                          }}
                          className="rounded-2xl text-left transition-colors hover:bg-slate-50 focus:outline-none"
                          style={{ border: `1.5px dashed ${FAINT}`, padding: "14px 16px" }}
                          data-testid={`button-add-size-${f}`}
                        >
                          <span className="flex items-center gap-1.5 text-[14px] font-semibold" style={{ color: BLUE }}>
                            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                            {ALBUM_FORMAT_LABEL[f]}
                          </span>
                          <span className="mt-0.5 block text-[12px]" style={{ color: SUBINK }}>
                            Add this size
                          </span>
                        </button>
                      ))}
                  </div>
                </section>
              )}

              {/* Pick a type */}
              <section id="section-pick-type" data-testid="section-pick-type">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <TwoTone lead="Pick a type." rest="How the vinyl is made." />
                  {canEdit && <MoreTypesPopover onAdd={(name) => addTier.mutate(name)} adding={addTier.isPending} />}
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
              </section>

              {/* Pick a color (vinyl only — CD/cassette skip swatches) */}
              {isVinyl && selectedTier && (
                <section id="section-pick-color" data-testid="section-pick-color">
                  <TwoTone lead="Pick a color." rest={`${selectedTier.name}.`} />
                  <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5">
                    {colors.map((c) => {
                      const on = c.id === selectedColorId;
                      return (
                        <div key={c.id} className="group/color relative">
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
                                  <Pencil className="h-3 w-3" />
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
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => setManageColorsOpen(true)}
                        data-testid="button-manage-colors"
                        className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold hover:underline underline-offset-2"
                        style={{ color: BLUE }}
                      >
                        <Pencil className="h-3 w-3" />
                        Manage colors — rename, reorder, remove
                      </button>
                      {manageColorsOpen && (
                        <ManageColorsPanel
                          open={manageColorsOpen}
                          pressId={pressId}
                          tier={selectedTier}
                          onChanged={invalidate}
                          onClose={() => setManageColorsOpen(false)}
                        />
                      )}
                    </>
                  )}
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

              {/* Turnaround */}
              <section id="section-turnaround" data-testid="section-turnaround">
                <TwoTone lead="Turnaround." rest="From masters to shipped." />
                <Card className="mt-4 overflow-hidden">
                  <FormatTurnaroundEditor
                    pressId={pressId}
                    format={fmt}
                    initialMin={fmtRow?.turnaroundWeeksMin ?? null}
                    initialMax={fmtRow?.turnaroundWeeksMax ?? null}
                    onChanged={invalidate}
                  />
                </Card>
              </section>

              {/* Print templates + audio spec (vinyl only, mirrors legacy) */}
              {isVinyl && (
                <>
                  <section id="section-templates" data-testid="section-templates">
                    <TwoTone lead="Print templates." rest="What artists design against." />
                    <Card className="mt-4 overflow-hidden">
                      <PressTemplateSpecsCard pressId={pressId} fmt={fmt} />
                    </Card>
                  </section>
                  <section id="section-audio" data-testid="section-audio">
                    <TwoTone lead="Audio spec." rest="What your lathe needs." />
                    <Card className="mt-4 overflow-hidden">
                      <PressAudioSpecCard pressId={pressId} />
                    </Card>
                  </section>
                </>
              )}
            </div>
          </div>
        </fieldset>
      )}
    </div>
  );
}

export default PressPackagePricingCatalog;
