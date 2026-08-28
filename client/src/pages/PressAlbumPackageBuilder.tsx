// ─────────────────────────────────────────────────────────────────────
// PressAlbumPackageBuilder — the artist-facing "Design your package" page
// (handoff/press-catalog v2). Rendered INSTEAD of SellPanel on the album
// "Package" tab for artist-role viewers only; operators keep the full
// SellPanel untouched.
//
// Wholly handoff markup (Bill's rule 0), wired to live data:
//   • sizes / types / colors come from the invited press's catalog tree
//     (formats → tiers → colors), never the handoff's hardcoded lists;
//   • run options come from the selected tier's confirmed ladder rungs;
//   • the earnings receipt uses the REAL cost stack — ladder manufacturing
//     (snapCatalogLadder semantics), shared mechanicals rate, card fee,
//     platform margin (shared/breakEven.ts) — the same math SellPanel shows;
//   • GoodDeed per-cert cost comes from /gooddeed-pricing-preview;
//   • Save persists through the SAME endpoints SellPanel uses (SKU PUT +
//     signed_cert addon PUT) so nothing the operator view reads is lost;
//   • templates are the press's real uploads from the invited-press payload;
//   • jacket fallback (rule 1/2): real album art center-cropped square →
//     press default jacket → white pmp icon at ~45% width on #1d1d1f ink.
// Theming: the handoff ships a THEMES map (light + dark token sets) with
// mutable module bindings reassigned by applyTheme() at the top of the page
// render, so the self-contained sub-components read the active theme without
// threading a prop through every call site. Mode comes from the shell's active
// admin theme via useAdminDark() — no local toggle. Dark is charcoal, never
// navy. The CD/cassette-style catalog bodies are now theme-aware (the older
// dark-only convention is superseded).
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ALBUM_FORMAT_LABEL,
  type AlbumFormat,
  type AlbumSku,
  type AlbumAddon,
} from "@shared/schema";
import {
  MECH_RATE_CENTS_PER_TRACK,
  PLATFORM_MARGIN_CENTS,
  cardFeeCents,
} from "@shared/breakEven";
import { formatUsdCents } from "@shared/money";
import { Award, Check, ChevronRight, Download, FileText, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageColumn, PageHeader } from "@/components/admin/PageShell";
import { ColorBall, VinylDisc } from "./PressVinylColors";
import { JacketStage } from "./PressPackagePricingCatalog";
import {
  VINYL_FORMATS,
  type CatalogColor,
  type CatalogTier,
  type CatalogFormat as CatalogFormatRow,
} from "./AdminManufacturer";
import type { PressTemplate } from "@/components/admin/PressTemplateDownloads";
// "Start from a package" rail (Ruby handoff, Aug 19 2026) — the card face
// reuses the press builder's own renderers so the artist sees pixel-identical
// package art to what the press designed.
import {
  CATALOG_COLORS as PKG_SWATCHES,
  swatchesFromCatalogFormats,
  type CatalogFormat,
  VinylDisc as PkgRailDisc,
  PPB_COVERS,
  matchVinylBackground,
  DEFAULT_KIND_MIN_QTY,
  PressBrandContext,
  DEFAULT_PRESS_BRAND,
  pressShortName,
} from "./press-create/PressPackageBuilder";
import { useAdminDark } from "@/lib/adminAppearance";
import { resolvePressPlaceholderArt } from "@/lib/pressPlaceholderArt";
import { displayPressColorName } from "@/lib/pressColorName";

// ─── Theme-aware brand tokens (Apple calm visual language) ───────────
// Theme-aware: light = the ratified press-portal palette (apple-canon light);
// dark = apple-canon "Dark controls & surfaces" (charcoal, never navy). The
// mode comes from the shell's active admin theme (useAdminDark) — there is no
// per-page toggle. Handoff's mock-only light/dark pill is intentionally dropped.
//
// Mutable bindings reassigned by applyTheme() at the top of the page render,
// so the self-contained sub-components read the active theme without threading
// a prop through every call site.
type Theme = {
  BLUE: string;
  INK: string;
  SUBINK: string;
  FAINT: string;      // #a1a1a6 family — captions, muted icons
  HAIRLINE: string;
  CANVAS: string;
  RAIL: string;
  CARD: string;       // raised card surface (was bg-white / #ffffff / #fff)
  TRACK: string;      // segmented-control pill track (was #f0f0f2)
  HEADER_BG: string;  // translucent sticky header
  HOVER_WASH: string; // neutral hover tint (was hover:bg-slate-*)
  BLUE_WASH: string;  // blue text-button hover wash (was #f0f7fc)
  BLUE_TINT_TOP: string; // top stop of the GoodDeed blue-tinted card gradient
  RING: string;       // avatar/search ring (was slate-200)
  CHECK_HALO: string; // selected-swatch check halo behind the tick
  READY: string;
  PILL_SHADOW: string;
};

const THEMES: Record<"light" | "dark", Theme> = {
  light: {
    BLUE: "var(--apple-blue)",
    INK: "var(--apple-ink)",
    SUBINK: "var(--apple-subink)",
    FAINT: "var(--apple-faint)",
    HAIRLINE: "var(--apple-hairline)",
    CANVAS: "var(--apple-canvas)",
    RAIL: "var(--apple-canvas)",
    CARD: "var(--apple-card)",
    TRACK: "var(--apple-track)",
    HEADER_BG: "rgba(255,255,255,0.72)",
    HOVER_WASH: "rgba(0,0,0,0.05)",
    BLUE_WASH: "#f0f7fc",
    BLUE_TINT_TOP: "#f4faff",
    RING: "var(--apple-hairline)",
    CHECK_HALO: "rgba(255,255,255,0.85)",
    READY: "var(--apple-ready)",
    PILL_SHADOW: "0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)",
  },
  dark: {
    BLUE: "var(--apple-blue)",
    INK: "var(--apple-ink)",
    SUBINK: "var(--apple-subink)",
    FAINT: "var(--apple-faint)",
    HAIRLINE: "var(--apple-hairline)",
    CANVAS: "var(--apple-canvas)",
    RAIL: "var(--apple-canvas)",
    CARD: "var(--apple-card)",
    TRACK: "var(--apple-track)",
    HEADER_BG: "rgba(22,22,23,0.72)",
    HOVER_WASH: "rgba(255,255,255,0.05)",
    BLUE_WASH: "rgba(49,158,216,0.14)",
    BLUE_TINT_TOP: "rgba(49,158,216,0.10)",
    RING: "var(--apple-hairline)",
    CHECK_HALO: "rgba(0,0,0,0.55)",
    READY: "var(--apple-ready)",
    PILL_SHADOW: "0 1px 3px rgba(0,0,0,0.4)",
  },
};

// Mutable active-theme bindings (default light = unchanged render).
let BLUE = THEMES.light.BLUE;
let INK = THEMES.light.INK;
let SUBINK = THEMES.light.SUBINK;
let FAINT = THEMES.light.FAINT;
let HAIRLINE = THEMES.light.HAIRLINE;
let CANVAS = THEMES.light.CANVAS;
let RAIL = THEMES.light.RAIL;
let CARD = THEMES.light.CARD;
let TRACK = THEMES.light.TRACK;
let HEADER_BG = THEMES.light.HEADER_BG;
let HOVER_WASH = THEMES.light.HOVER_WASH;
let BLUE_WASH = THEMES.light.BLUE_WASH;
let BLUE_TINT_TOP = THEMES.light.BLUE_TINT_TOP;
let RING = THEMES.light.RING;
let CHECK_HALO = THEMES.light.CHECK_HALO;
let READY = THEMES.light.READY;
let PILL_SHADOW = THEMES.light.PILL_SHADOW;

// True while the dark theme is active — flips dark-only logo assets to white
// via CSS invert on dark surfaces, per apple-canon Logos.
let IS_DARK = false;

function applyTheme(mode: "light" | "dark") {
  IS_DARK = mode === "dark";
  const th = THEMES[mode];
  BLUE = th.BLUE;
  INK = th.INK;
  SUBINK = th.SUBINK;
  FAINT = th.FAINT;
  HAIRLINE = th.HAIRLINE;
  CANVAS = th.CANVAS;
  RAIL = th.RAIL;
  CARD = th.CARD;
  TRACK = th.TRACK;
  HEADER_BG = th.HEADER_BG;
  HOVER_WASH = th.HOVER_WASH;
  BLUE_WASH = th.BLUE_WASH;
  BLUE_TINT_TOP = th.BLUE_TINT_TOP;
  RING = th.RING;
  CHECK_HALO = th.CHECK_HALO;
  READY = th.READY;
  PILL_SHADOW = th.PILL_SHADOW;
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// Stacks the sticky two-column body when the viewport gets too narrow for the
// preview rail + the earnings column (avoids horizontal overflow < 1440), so
// the grid collapses gracefully at 1024/768 instead of relying on fixed widths.
function useNarrow(maxWidth = 1080): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    setNarrow(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [maxWidth]);
  return narrow;
}

const money = (cents: number) => formatUsdCents(Math.round(cents));

// ─── Server payload shapes (catalog types shared with the press pages) ──
type Catalog = { formats: CatalogFormatRow[] };
type InvitedPressResponse = {
  press: {
    id: string;
    name: string;
    domain?: string | null;
    logoUrl: string | null;
    vinylPlaceholderUrl?: string | null;
  } | null;
  catalog?: Catalog;
  effectivePress?: {
    id: string;
    name: string;
    domain?: string | null;
    logoUrl?: string | null;
    vinylPlaceholderUrl?: string | null;
  } | null;
  templates?: PressTemplate[];
  // Ruby handoff (Aug 19 2026) — the press's LIVE saved packages ("Start
  // from a package" rail). payload mirrors the press builder's save body.
  packages?: {
    id: string;
    title: string;
    payload?: {
      builderState?: {
        sizeId?: string;
        discs?: number;
        qty?: number;
        colorId?: string;
        colorKind?: string;
      } | null;
      summary?: string;
      sell?: string;
      coverId?: string;
      minRun?: number;
      minPerUnitCents?: number;
      perUnitCents?: number;
    } | null;
  }[];
};
type SellResponse = { skus: AlbumSku[]; addons: AlbumAddon[] };
type EditAccess = { canEdit: boolean; missingPermissions: string[] };

// Mirrors `snapToCatalogQuantityTier` server-side (copied from SellPanel —
// unconfirmed TBD rungs must never resolve as $0 manufacturing).
function snapCatalogLadder(
  ladder: { qty: number; unitCents: number; confirmed?: boolean; offered?: boolean }[],
  n: number,
): { qty: number; unitCents: number; requiresQuote: boolean } | null {
  if (!Array.isArray(ladder) || ladder.length === 0) return null;
  const sorted = [...ladder].filter((r) => r.confirmed !== false && r.offered !== false).sort((a, b) => a.qty - b.qty);
  if (sorted.length === 0) return null;
  const q = Math.max(1, Math.floor(n));
  for (const r of sorted) if (q <= r.qty) return { qty: r.qty, unitCents: r.unitCents, requiresQuote: false };
  const top = sorted[sorted.length - 1];
  return { qty: top.qty, unitCents: top.unitCents, requiresQuote: true };
}

// ─── Handoff markup primitives ───────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium" style={{ color: SUBINK }}>
      {children}
    </div>
  );
}
function TwoTone({ lead, rest }: { lead: string; rest: string }) {
  return (
    <h2 className="tracking-tight" style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 600 }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: FAINT }}>{rest}</span>
    </h2>
  );
}
function Divider() {
  return <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: "28px 0" }} />;
}

// ─── Album-context banner ────────────────────────────────────────────
function AlbumBanner({
  coverUrl,
  albumTitle,
  artistName,
  trackCount,
  pressName,
}: {
  coverUrl: string | null;
  albumTitle: string;
  artistName: string;
  trackCount: number;
  pressName: string | null;
}) {
  return (
    <div
      className="flex items-center gap-4 rounded-2xl"
      style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}`, padding: 16 }}
      data-testid="album-banner"
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={`${albumTitle} cover`}
          className="rounded-xl object-cover flex-shrink-0"
          style={{ width: 64, height: 64 }}
        />
      ) : (
        <div className="rounded-xl flex-shrink-0" style={{ width: 64, height: 64, backgroundColor: "#1d1d1f" }} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[15px] font-semibold tracking-tight truncate" style={{ color: INK }}>
            {albumTitle}
          </span>
          <span className="text-[13px] flex-shrink-0" style={{ color: FAINT }}>·</span>
          <span className="text-[13px] truncate" style={{ color: SUBINK }}>{artistName}</span>
        </div>
        <div className="text-[12.5px]" style={{ color: FAINT, marginTop: 2 }}>
          {trackCount} {trackCount === 1 ? "track" : "tracks"}
          {pressName ? <> · Pressed by {pressName}</> : null}
        </div>
      </div>
    </div>
  );
}

// ─── Size cards (formats from the press catalog) ─────────────────────
const VINYL_SIZE_BLURB: Record<string, string> = {
  "7_inch": "Two songs. One single.",
  "12_lp": "The classic full-length.",
  "12_double": "Two discs. One gatefold.",
};

function SizeCards({
  formats,
  value,
  onChange,
}: {
  formats: AlbumFormat[];
  value: AlbumFormat | null;
  onChange: (f: AlbumFormat) => void;
}) {
  return (
    <div style={{ marginTop: 14, display: "flex", gap: 12 }}>
      {formats.map((f) => {
        const active = f === value;
        const label = ALBUM_FORMAT_LABEL[f] ?? f;
        const [big, ...rest] = label.split(" ");
        return (
          <button
            key={f}
            type="button"
            onClick={() => onChange(f)}
            aria-pressed={active}
            data-testid={`size-${f}`}
            className="rounded-2xl transition-all hover:-translate-y-px focus:outline-none"
            style={{
              backgroundColor: CARD,
              flex: 1,
              padding: "16px 12px",
              border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK }}>{big}</div>
            <div className="text-[11px]" style={{ marginTop: 3, color: FAINT }}>
              {rest.join(" ") || VINYL_SIZE_BLURB[f] || "\u00A0"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Type cards (tiers from the press catalog — data-driven names) ───
function TypeCards({
  tiers,
  value,
  onChange,
  labelLogoUrl,
  labelBgColor,
}: {
  tiers: CatalogTier[];
  value: string | null;
  onChange: (id: string) => void;
  labelLogoUrl: string | null;
  labelBgColor: string | null;
}) {
  return (
    <div className="grid grid-cols-4 gap-3" style={{ marginTop: 14 }}>
      {tiers.map((t) => {
        const active = t.id === value;
        const preview = t.colors[0] ?? null;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-pressed={active}
            data-testid={`type-${t.id}`}
            className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
            style={{ backgroundColor: CARD, padding: 14, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
          >
            <div className="flex justify-center" style={{ marginBottom: 10 }}>
              <VinylDisc size={84} color={preview} labelLogoUrl={labelLogoUrl} labelBgColor={labelBgColor} />
            </div>
            <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
              {t.name}
            </div>
            <div className="text-[11.5px]" style={{ marginTop: 2, color: FAINT }}>
              {t.colors.length} {t.colors.length === 1 ? "color" : "colors"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Color swatch cards ──────────────────────────────────────────────
function ColorCards({
  colors,
  value,
  onChange,
  fallbackLabel,
  labelLogoUrl,
  labelBgColor,
}: {
  colors: CatalogColor[];
  value: string | null;
  onChange: (id: string) => void;
  fallbackLabel: string;
  labelLogoUrl: string | null;
  labelBgColor: string | null;
}) {
  return (
    <div className="grid grid-cols-4 gap-3" style={{ marginTop: 14 }}>
      {colors.map((c) => {
        const on = c.id === value;
        const displayName = displayPressColorName(c.name);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            aria-pressed={on}
            data-testid={`color-${c.id}`}
            className="rounded-2xl text-center transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
            style={{ backgroundColor: CARD, padding: "16px 10px 12px", border: on ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
          >
            <div className="relative flex justify-center" style={{ marginBottom: 8 }}>
              <ColorBall color={c} size={32} labelLogoUrl={labelLogoUrl} labelBgColor={labelBgColor} />
              {on && (
                <span
                  className="absolute flex items-center justify-center rounded-full"
                  style={{
                    width: 18,
                    height: 18,
                    backgroundColor: CHECK_HALO,
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <Check className="w-3 h-3" style={{ color: BLUE }} strokeWidth={3} />
                </span>
              )}
            </div>
            <div className="text-[12.5px] font-semibold leading-tight" style={{ color: on ? BLUE : INK }}>
              {displayName ?? fallbackLabel}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Earnings receipt line ───────────────────────────────────────────
function EarnLine({ label, hint, value, strong }: { label: string; hint?: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4" style={{ padding: "11px 0" }}>
      <div className="min-w-0">
        <div className={cn("leading-tight", strong ? "text-[14px] font-semibold" : "text-[13.5px]")} style={{ color: strong ? INK : SUBINK }}>
          {label}
        </div>
        {hint && (
          <div className="text-[11.5px]" style={{ color: FAINT, marginTop: 2 }}>
            {hint}
          </div>
        )}
      </div>
      <div className={cn("tabular-nums flex-shrink-0", strong ? "text-[15px] font-semibold" : "text-[14px] font-medium")} style={{ color: INK }}>
        {value}
      </div>
    </div>
  );
}

// ─── Mini GoodDeed cert (composed live from the album cover) ─────────
function MiniGoodDeed({ coverSrc }: { coverSrc: string | null }) {
  return (
    <div
      className="flex-shrink-0 transition-transform duration-300 hover:scale-105 hover:rotate-0"
      style={{
        width: 76,
        padding: 5,
        backgroundColor: "#f4831f",
        borderRadius: 4,
        transform: "rotate(-2deg)",
        boxShadow: "0 6px 16px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.1)",
      }}
      data-testid="gooddeed-mini-cert"
    >
      {coverSrc ? (
        <img src={coverSrc} alt="Album art on the GoodDeed certificate" className="block w-full object-cover" style={{ aspectRatio: "1 / 1.1" }} />
      ) : (
        <div className="block w-full" style={{ aspectRatio: "1 / 1.1", backgroundColor: "#1d1d1f" }} />
      )}
      <div style={{ backgroundColor: "#101d36", padding: "4px 4px 3px" }}>
        <div style={{ height: 2, width: "70%", backgroundColor: CHECK_HALO, borderRadius: 1 }} />
        <div style={{ height: 1.5, width: "50%", backgroundColor: "rgba(255,255,255,0.4)", borderRadius: 1, marginTop: 2.5 }} />
        <div className="flex items-end justify-between" style={{ marginTop: 3 }}>
          <div style={{ height: 1.5, width: "40%", backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 1, marginBottom: 1 }} />
          <div style={{ width: 7, height: 7, backgroundColor: "#fff", borderRadius: 1 }} />
        </div>
      </div>
    </div>
  );
}

// ─── Segmented run control (options from the tier's ladder) ──────────
function RunControl({ options, value, onChange }: { options: number[]; value: number; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full p-1" style={{ backgroundColor: TRACK }} data-testid="control-run">
      {options.map((q) => {
        const active = q === value;
        return (
          <button
            key={q}
            type="button"
            onClick={() => onChange(q)}
            aria-pressed={active}
            data-testid={`run-${q}`}
            className="rounded-full transition-all focus:outline-none tabular-nums"
            style={{
              padding: "7px 16px",
              fontSize: 13,
              fontWeight: 600,
              color: active ? INK : SUBINK,
              backgroundColor: active ? CARD : "transparent",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : undefined,
            }}
          >
            {q.toLocaleString("en-US")}
          </button>
        );
      })}
    </div>
  );
}

// ─── Retail price field (cents in state; dollars in the box) ─────────
function RetailControl({
  cents,
  onCents,
  testId = "input-retail",
}: {
  cents: number;
  onCents: (v: number) => void;
  testId?: string;
}) {
  const [draft, setDraft] = useState<string>((cents / 100).toFixed(2));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft((cents / 100).toFixed(2));
  }, [cents]);
  return (
    <label
      className="inline-flex items-center h-11 rounded-xl transition-shadow focus-within:ring-1 focus-within:ring-slate-300"
      style={{ border: `1px solid ${HAIRLINE}`, background: CARD, cursor: "text", padding: "0 14px" }}
      data-testid={`${testId}-field`}
    >
      <span className="text-[16px] font-semibold" style={{ color: FAINT, marginRight: 2 }}>$</span>
      <input
        value={draft}
        onFocus={() => {
          editing.current = true;
        }}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ""))}
        onBlur={() => {
          editing.current = false;
          const n = Number.parseFloat(draft);
          const next = Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : cents;
          onCents(next);
          setDraft((next / 100).toFixed(2));
        }}
        inputMode="decimal"
        data-testid={testId}
        className="text-[16px] font-semibold tabular-nums focus:outline-none"
        style={{ color: INK, background: "transparent", border: "none", width: "6ch", padding: 0 }}
      />
    </label>
  );
}

// ─── GoodDeed flagship card ──────────────────────────────────────────
function GoodDeedCard({
  on,
  onToggle,
  runQty,
  deedUnits,
  perUnitCents,
  totalCents,
  coverSrc,
  retailCents,
  onRetailCents,
  mode,
  onMode,
  cap,
  onCap,
  mfgCents,
  feeCents,
  costCents,
  costPending,
}: {
  on: boolean;
  onToggle: () => void;
  runQty: number;
  deedUnits: number;
  perUnitCents: number | null;
  totalCents: number | null;
  coverSrc: string | null;
  retailCents: number;
  onRetailCents: (v: number) => void;
  mode: "nolimit" | "cap";
  onMode: (m: "nolimit" | "cap") => void;
  cap: number;
  onCap: (v: number) => void;
  mfgCents: number | null;
  feeCents: number;
  costCents: number | null;
  costPending: boolean;
}) {
  const [showDeedCost, setShowDeedCost] = useState(false);
  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        border: on ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
        background: on
          ? `linear-gradient(180deg, ${BLUE_TINT_TOP} 0%, ${CARD} 55%)`
          : CARD,
      }}
      data-testid="addon-gooddeed"
    >
      <div className="flex items-start gap-4" style={{ padding: 18 }}>
        <MiniGoodDeed coverSrc={coverSrc} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold tracking-tight" style={{ color: INK }}>
              Offer Signed GoodDeed<sup style={{ fontSize: "0.6em", top: "-0.5em" }}>®</sup>
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full text-xs font-medium px-2 h-5"
              style={{ color: BLUE, backgroundColor: BLUE_WASH }}
            >
              <Sparkles className="w-3 h-3" /> Flagship
            </span>
          </div>
          <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 5, lineHeight: 1.45, maxWidth: 460 }}>
            You sign each certificate. We handle printing, the holographic authenticity seal, and
            fulfillment with the record. One per vinyl — a true collectible that helps the record sell.
          </p>
          <div className="text-[12px]" style={{ color: FAINT, marginTop: 8 }}>
            {mode === "cap" ? (
              <>
                Capped at <span className="font-semibold tabular-nums" style={{ color: INK }}>{deedUnits.toLocaleString("en-US")}</span> certificates
                {" · "}run of <span className="tabular-nums">{runQty.toLocaleString("en-US")}</span>
              </>
            ) : (
              <>
                Up to one per vinyl · typically <span className="font-semibold tabular-nums" style={{ color: INK }}>{deedUnits.toLocaleString("en-US")}</span> of{" "}
                <span className="tabular-nums">{runQty.toLocaleString("en-US")}</span> sell certified
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={onToggle}
          data-testid="toggle-gooddeed"
          className="relative flex-shrink-0 rounded-full transition-colors focus:outline-none"
          style={{ width: 46, height: 28, backgroundColor: on ? BLUE : FAINT }}
        >
          <span
            className="absolute rounded-full transition-transform"
            style={{ backgroundColor: CARD, width: 22, height: 22, top: 3, left: 3, transform: on ? "translateX(18px)" : "translateX(0)", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}
          />
        </button>
      </div>
      {on && (
        <>
          {/* Approved-mock layout (gogoods, Aug 15 2026): stacked, never
              side-by-side — Certificate price is its own full-width row,
              then How many with the two tiles; the follow-up control sits
              in the COLUMN of the tile it belongs to (take-rate estimate
              under No limit, cap stepper under Limit quantity). */}
          <div style={{ padding: "16px 18px", borderTop: `1px solid ${HAIRLINE}` }}>
            <div>
              <div className="text-xs font-medium" style={{ color: SUBINK, marginBottom: 8 }}>
                Certificate price
              </div>
              <RetailControl cents={retailCents} onCents={onRetailCents} testId="input-deed-retail" />
            </div>
            <div style={{ marginTop: 20 }}>
              <div className="text-xs font-medium" style={{ color: SUBINK, marginBottom: 8 }}>
                How many
              </div>
              <div className="grid grid-cols-2 gap-x-2.5 gap-y-0">
                {([
                  { m: "nolimit" as const, title: "No limit", sub: "Up to one per vinyl sold" },
                  { m: "cap" as const, title: "Limit quantity", sub: "Set a cap for scarcity" },
                ]).map(({ m, title, sub }) => {
                  const active = mode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onMode(m)}
                      data-testid={`deed-mode-${m}`}
                      className="rounded-xl text-left transition-all"
                      style={{
                        backgroundColor: CARD,
                        padding: "12px 14px",
                        border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
                        margin: active ? 0 : 1,
                      }}
                    >
                      <div className="text-[13.5px] font-semibold" style={{ color: active ? BLUE : INK }}>{title}</div>
                      <div className="text-[11.5px]" style={{ color: SUBINK, marginTop: 2 }}>{sub}</div>
                    </button>
                  );
                })}
                {/* Follow-up row — left column under No limit, right column
                    under Limit quantity; the inactive column stays empty. */}
                <div>
                  {mode === "nolimit" && (
                    <div className="text-[11.5px]" style={{ color: FAINT, marginTop: 10 }} data-testid="deed-take-rate">
                      Typically <span className="font-semibold tabular-nums" style={{ color: SUBINK }}>{Math.round(DEED_TAKE_RATE * 100)}%</span> sell certified — est.{" "}
                      <span className="tabular-nums">{deedUnits.toLocaleString("en-US")}</span> of{" "}
                      <span className="tabular-nums">{runQty.toLocaleString("en-US")}</span>.
                    </div>
                  )}
                </div>
                <div>
                  {mode === "cap" && (
                    <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 10 }}>
                      <div className="inline-flex items-center rounded-xl overflow-hidden" style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}` }}>
                        <button
                          type="button"
                          onClick={() => onCap(Math.max(50, cap - 50))}
                          data-testid="deed-cap-minus"
                          className="flex items-center justify-center transition-colors"
                          style={{ width: 36, height: 38, color: SUBINK, fontSize: 16 }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = HOVER_WASH)}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                        >
                          −
                        </button>
                        <div
                          className="tabular-nums text-[14px] font-semibold text-center"
                          style={{ color: INK, minWidth: 92, borderLeft: `1px solid ${HAIRLINE}`, borderRight: `1px solid ${HAIRLINE}`, padding: "8px 10px" }}
                        >
                          {cap.toLocaleString("en-US")} <span className="font-normal" style={{ color: SUBINK }}>certs</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onCap(Math.min(runQty, cap + 50))}
                          data-testid="deed-cap-plus"
                          className="flex items-center justify-center transition-colors"
                          style={{ width: 36, height: 38, color: SUBINK, fontSize: 16 }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = HOVER_WASH)}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                        >
                          +
                        </button>
                      </div>
                      <span className="text-[11.5px]" style={{ color: FAINT }}>Never more than one per vinyl sold.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: "0 18px" }}>
            <div className="flex items-baseline justify-between gap-4" style={{ paddingTop: 12 }}>
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium leading-tight" style={{ color: INK }}>Profit per certificate</div>
                <button
                  type="button"
                  onClick={() => setShowDeedCost((v) => !v)}
                  data-testid="button-deed-cost-breakdown"
                  className="flex items-center gap-1 text-[11.5px] transition-colors"
                  style={{ color: FAINT, marginTop: 2 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = SUBINK)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = FAINT)}
                >
                  {costCents != null ? <>After the {money(costCents)} cost per signed certificate</> : costPending ? "Pricing the certificate…" : "Certificate cost unavailable"}
                  <ChevronRight className="w-3 h-3 transition-transform" style={{ transform: showDeedCost ? "rotate(90deg)" : "none" }} />
                </button>
              </div>
              <div className="tabular-nums flex-shrink-0 text-[14px] font-medium" style={{ color: INK }}>
                {perUnitCents != null ? money(perUnitCents) : "—"}
              </div>
            </div>
            <div
              style={{
                overflow: "hidden",
                maxHeight: showDeedCost ? 140 : 0,
                opacity: showDeedCost ? 1 : 0,
                transition: "max-height 0.35s ease, opacity 0.25s ease",
              }}
            >
              <div style={{ margin: "8px 0 4px", paddingLeft: 14, borderLeft: `2px solid ${HAIRLINE}` }}>
                <div className="flex items-baseline justify-between gap-4" style={{ padding: "4px 0" }}>
                  <span className="text-[12px]" style={{ color: SUBINK }}>Manufacturing & shipping · printed, sealed, fulfilled</span>
                  <span className="tabular-nums text-[12px]" style={{ color: SUBINK }}>{mfgCents != null ? money(mfgCents) : "—"}</span>
                </div>
                <div className="flex items-baseline justify-between gap-4" style={{ padding: "4px 0" }}>
                  <span className="text-[12px]" style={{ color: SUBINK }}>Payment processing</span>
                  <span className="tabular-nums text-[12px]" style={{ color: SUBINK }}>{money(feeCents)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-4" style={{ padding: "6px 0 2px", borderTop: `1px solid ${HAIRLINE}`, marginTop: 4 }}>
                  <span className="text-[12px] font-semibold" style={{ color: INK }}>Cost per certificate</span>
                  <span className="tabular-nums text-[12px] font-semibold" style={{ color: INK }}>{costCents != null ? money(costCents) : "—"}</span>
                </div>
              </div>
            </div>
            <div style={{ paddingBottom: 12 }} />
          </div>

          <div
            className="flex items-center justify-between"
            style={{ padding: "13px 18px", borderTop: `1px solid ${HAIRLINE}` }}
            data-testid="gooddeed-earnings"
          >
            <div className="text-[12.5px]" style={{ color: SUBINK }}>
              {perUnitCents != null ? (
                <>
                  Adds <span className="font-semibold tabular-nums" style={{ color: INK }}>{money(perUnitCents)}</span> per certified unit
                  {" · "}
                  <span className="tabular-nums">{deedUnits.toLocaleString("en-US")}</span> certificates
                </>
              ) : (
                <>Certificate economics load once the press prices the run.</>
              )}
            </div>
            <div className="text-[15px] font-semibold tabular-nums" style={{ color: READY }}>
              {totalCents != null ? <>+ {money(totalCents)}</> : "—"}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Print template download tile ────────────────────────────────────
function middleTruncate(s: string, max = 26): string {
  if (s.length <= max) return s;
  const keep = Math.floor((max - 1) / 2);
  return `${s.slice(0, max - 1 - keep)}…${s.slice(-keep)}`;
}
const COMPONENT_LABEL: Record<string, string> = {
  jacket: "Jacket",
  labels: "Center labels",
  inner_sleeve: "Inner sleeve",
  booklet: "Booklet",
};

function TemplateTile({ tpl }: { tpl: PressTemplate }) {
  const fileName = (() => {
    try {
      const path = new URL(tpl.templateFileUrl, window.location.origin).pathname;
      return decodeURIComponent(path.split("/").pop() || tpl.templateFileUrl);
    } catch {
      return tpl.templateFileUrl;
    }
  })();
  const label = COMPONENT_LABEL[tpl.componentKey] ?? tpl.componentKey;
  return (
    <div
      className="group relative flex flex-col items-center justify-center rounded-xl text-center"
      style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}`, padding: "18px 12px" }}
      data-testid={`template-${tpl.componentKey}`}
    >
      <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: CANVAS }}>
        <FileText className="w-4 h-4" style={{ color: BLUE }} />
      </span>
      <div className="text-[13px] font-semibold" style={{ color: INK, marginTop: 8 }}>
        {label}
      </div>
      <div className="text-[11.5px] tabular-nums" style={{ color: SUBINK, marginTop: 3 }} title={fileName}>
        {middleTruncate(fileName)}
      </div>
      <a
        href={tpl.templateFileUrl}
        download
        target="_blank"
        rel="noreferrer"
        data-testid={`template-download-${tpl.componentKey}`}
        className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: SUBINK }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = HOVER_WASH)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        aria-label={`Download ${label} template`}
      >
        <Download className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

// ─── Print templates section (approved as-is) ────────────────────────
// Moved, not restyled (gogoods, Aug 15 2026): this exact section used to
// sit at the bottom of the artist Package tab; it now renders on the
// Physical → Art tab (PressPanel) for artist viewers.
export function PackagePrintTemplates({
  templates,
  pressName,
}: {
  templates: PressTemplate[];
  pressName?: string | null;
}) {
  // The palette consts (INK/SUBINK/…) are mutable module bindings set by
  // applyTheme() when the *builder page* renders. This section now renders
  // on the always-light Physical → Art tab, so pin light here — otherwise a
  // prior visit to a dark-themed builder would leak dark ink onto the light
  // admin surface (theme becomes route-history-dependent).
  applyTheme("light");
  if (templates.length === 0) return null;
  return (
    <>
      <Divider />
      <TwoTone lead="Print templates" rest="Everything your designer needs" />
      <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.4 }}>
        Sized for this package{pressName ? <> by {pressName}</> : null}. Download, hand to your artwork
        team, drop the files back in.
      </p>
      <div className="grid grid-cols-3 gap-3" style={{ marginTop: 14 }}>
        {templates.map((t) => (
          <TemplateTile key={t.id} tpl={t} />
        ))}
      </div>
    </>
  );
}

// ─── Main page ───────────────────────────────────────────────────────
const FALLBACK_RUN_OPTIONS = [500, 1000, 2000, 3000];
const DEED_TAKE_RATE = 0.25;
const PLACEHOLDER_ART = "/album-placeholder.svg";
const PMP_ICON = "/pmp-icon.png";

// ─── "Start from a package" rail (Ruby handoff, Aug 19 2026) ─────────────
// Apple-Music-wide cards: the ENTIRE card face is the jacket cover with the
// press-designed vinyl disc arcing up from the bottom edge. Rendered with the
// press builder's own cover/disc renderers so the art is pixel-identical to
// what the press saved. Word + icon everywhere; quiet price line; the blue
// "Start from this package" affordance earns full opacity on hover/selected.
type RailPkg = NonNullable<InvitedPressResponse["packages"]>[number];

function railSwatch(pkg: RailPkg, catalog?: typeof PKG_SWATCHES) {
  const bs = pkg.payload?.builderState ?? {};
  return (
    catalog?.find((c) => c.id === bs.colorId) ??
    PKG_SWATCHES.find((c) => c.id === bs.colorId) ??
    catalog?.[0] ??
    PKG_SWATCHES[0]
  );
}

function StartPackageCard({ pkg, pressName, selected, onSelect, catalogSwatches }: {
  pkg: RailPkg;
  pressName: string;
  selected: boolean;
  onSelect: () => void;
  catalogSwatches?: typeof PKG_SWATCHES;
}) {
  const [hover, setHover] = useState(false);
  const p = pkg.payload ?? {};
  const swatch = railSwatch(pkg, catalogSwatches);
  const cover = PPB_COVERS.find((c) => c.id === String(p.coverId ?? "match"));
  const CoverAd = cover?.ad;
  const minRun = Number(p.minRun ?? p.builderState?.qty ?? DEFAULT_KIND_MIN_QTY[swatch.kind] ?? 300) || 300;
  const perUnitCents = Number(p.minPerUnitCents ?? p.perUnitCents ?? 0) || 0;
  const sell = String(p.sell ?? "").trim();

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      aria-pressed={selected}
      style={{ width: 460, flexShrink: 0, background: "transparent", border: "none", padding: 0, textAlign: "left", cursor: "pointer", color: INK }}
      data-testid={`start-package-${pkg.id}`}
    >
      {/* eyebrow + title + subtitle above the image (Apple Music order) */}
      <div style={{ fontSize: 12.5, fontWeight: 500, color: SUBINK }}>
        {pressName} package
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.2, marginTop: 4, color: INK }}>
        {pkg.title}
      </div>
      <div style={{ fontSize: 13, color: SUBINK, marginTop: 2, lineHeight: 1.35, minHeight: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {String(p.summary ?? "")}
      </div>

      {/* WIDE card face — the cover IS the card, vinyl rising from the bottom */}
      <div
        style={{
          position: "relative", marginTop: 12, height: 260, borderRadius: 14, overflow: "hidden",
          border: selected ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
          transition: "transform 0.25s ease, box-shadow 0.25s ease",
          transform: hover ? "translateY(-3px)" : "none",
          boxShadow: hover ? "0 14px 34px rgba(0,0,0,0.5)" : "0 4px 14px rgba(0,0,0,0.35)",
        }}
      >
        {!CoverAd || String(p.coverId ?? "match") === "match" ? (
          <div style={{ position: "absolute", inset: 0, background: matchVinylBackground(swatch.base) }} />
        ) : (
          <CoverAd />
        )}
        <div
          aria-hidden
          style={{ position: "absolute", left: "50%", top: 78, transform: "translateX(-50%)", filter: "drop-shadow(0 -6px 22px rgba(0,0,0,0.45))" }}
        >
          <PkgRailDisc size={330} swatch={swatch} />
        </div>
        {selected && (
          <span style={{ position: "absolute", top: 10, right: 10, zIndex: 3, display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 999, background: "rgba(11,11,12,0.82)", color: "#f5f5f7", fontSize: 11, fontWeight: 600 }}>
            <Check className="w-3 h-3" style={{ color: BLUE }} strokeWidth={3} />
            Selected
          </span>
        )}
        {/* sell line lives in the TOP area of the cover, over a top scrim */}
        <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 0, height: 92, background: "linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0) 100%)" }} />
        <div style={{ position: "absolute", left: 16, right: 100, top: 14, zIndex: 2, fontSize: 15, fontWeight: 600, color: "#fff", lineHeight: 1.3, letterSpacing: -0.1, textShadow: "0 1px 3px rgba(0,0,0,0.5)", opacity: sell ? 1 : 0.55 }}>
          {sell || "Everything a first pressing needs."}
        </div>
      </div>

      {/* quiet price line */}
      {perUnitCents > 0 && (
        <div style={{ fontSize: 12, color: SUBINK, marginTop: 10 }}>
          From {money(perUnitCents)} / unit at {minRun.toLocaleString()}
        </div>
      )}

      {/* quiet affordance — earns opacity on hover/selected */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: 12.5, fontWeight: 600, color: BLUE, opacity: hover || selected ? 1 : 0.35, transition: "opacity 0.2s ease" }}>
        Start from this package
        <ChevronRight className="w-3.5 h-3.5" />
      </div>
    </button>
  );
}

export function PressAlbumPackageBuilder({
  albumId,
  albumTitle,
  artistName,
  artworkUrl,
  trackCount,
}: {
  albumId: string;
  albumTitle: string;
  artistName: string;
  artworkUrl: string | null;
  trackCount: number;
}) {
  // Theme mode comes from the shell's active admin theme — no local toggle.
  // Reassign the active-theme token bindings synchronously before any child
  // renders this pass (mode = dark ? 'dark' : 'light').
  const dark = useAdminDark();
  applyTheme(dark ? "dark" : "light");
  const narrow = useNarrow(1080);

  const { toast } = useToast();

  const { data: sell } = useQuery<SellResponse>({
    queryKey: ["/api/admin/albums", albumId, "skus"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/albums/${albumId}/skus`);
      return r.json();
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
  const { data: invited } = useQuery<InvitedPressResponse>({
    queryKey: ["/api/admin/albums", albumId, "invited-press"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/albums/${albumId}/invited-press`);
      return r.json();
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
  const { data: editAccess } = useQuery<EditAccess>({
    queryKey: ["/api/admin/albums", albumId, "edit-access"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/albums/${albumId}/edit-access`);
      return r.json();
    },
  });
  // Fail CLOSED: the builder stays read-only until edit-access resolves
  // affirmatively (server gates are defense-in-depth, not the UI gate).
  const canEdit = editAccess?.canEdit === true;

  const press = invited?.press ?? invited?.effectivePress ?? null;
  // Label branding for the disc center — the invited-press payload doesn't
  // carry it, so pull the full press row (same source the catalog page uses).
  const { data: pressRow } = useQuery<{ labelLogoUrl?: string | null; labelBgColor?: string | null; vinylPlaceholderUrl?: string | null; logoUrl?: string | null; lightLogoUrl?: string | null; lightSquareLogoUrl?: string | null }>({
    queryKey: ["/api/manufacturers", press?.id],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/manufacturers/${press!.id}`);
      return r.json();
    },
    enabled: !!press?.id,
  });
  // Same fallback the catalog page uses: a press without a dedicated label
  // logo (e.g. Hellbender) still shows its main mark on disc labels.
  // Extra rung: fall back to the invited-press payload's logo so the disc
  // center still wears the right press mark even when the manufacturers
  // row fetch fails or comes back without branding fields.
  const labelLogoUrl = pressRow?.labelLogoUrl || pressRow?.logoUrl || press?.logoUrl || null;
  // Task #3446 — uploaded light-background mark for white product surfaces
  // (B&W labels, sticker previews) in the builder kit; null = polarity
  // filter fallback on labelLogo.
  const lightLabelLogoUrl = pressRow?.lightSquareLogoUrl || pressRow?.lightLogoUrl || null;
  const labelBgColor = pressRow?.labelBgColor || null;

  // Vinyl formats the press actually offers, in canon order.
  const catalogFormats = useMemo<CatalogFormatRow[]>(() => {
    const rows = invited?.catalog?.formats ?? [];
    return VINYL_FORMATS.map((f) => rows.find((r) => r.format === f)).filter(
      (r): r is CatalogFormatRow => !!r && r.tiers.length > 0,
    );
  }, [invited]);

  // The press's real colors as builder swatches — drives the "Start from a
  // package" rail cards + the name-based color prefill (never the demo set
  // when the press has a real catalog).
  const catalogSwatches = useMemo(
    () => swatchesFromCatalogFormats((invited?.catalog?.formats as CatalogFormat[] | undefined) ?? null).colors,
    [invited],
  );

  // ── Decision state (seeded once from the saved SKU/addon) ──────────
  const [format, setFormat] = useState<AlbumFormat | null>(null);
  const [tierSel, setTierSel] = useState<Record<string, string>>({}); // format → tierId
  const [colorSel, setColorSel] = useState<Record<string, string>>({}); // tierId → colorId
  const [retailCents, setRetailCents] = useState(3500);
  const [runQty, setRunQty] = useState<number | null>(null);
  const [gooddeedOn, setGooddeedOn] = useState(false);
  const [deedRetailCents, setDeedRetailCents] = useState(2000);
  const [deedMode, setDeedMode] = useState<"nolimit" | "cap">("nolimit");
  const [deedCap, setDeedCap] = useState(200);
  const [dirty, setDirty] = useState(false);
  const seeded = useRef(false);

  const savedSku = useMemo<AlbumSku | null>(() => {
    if (!sell) return null;
    const vinyl = sell.skus.filter((s) => (VINYL_FORMATS as string[]).includes(s.format));
    return vinyl.find((s) => s.active) ?? vinyl[0] ?? null;
  }, [sell]);
  const signedAddon = useMemo<AlbumAddon | null>(
    () => sell?.addons.find((a) => a.kind === "signed_cert") ?? null,
    [sell],
  );

  useEffect(() => {
    if (seeded.current || !sell || !invited || catalogFormats.length === 0) return;
    seeded.current = true;
    const fmt =
      (savedSku && catalogFormats.find((r) => r.format === savedSku.format)?.format) ??
      catalogFormats[0].format;
    setFormat(fmt);
    if (savedSku) {
      if (savedSku.pressTierId) setTierSel((p) => ({ ...p, [fmt]: savedSku.pressTierId! }));
      if (savedSku.pressTierId && savedSku.pressColorId) {
        setColorSel((p) => ({ ...p, [savedSku.pressTierId!]: savedSku.pressColorId! }));
      }
      if (savedSku.priceCents > 0) setRetailCents(savedSku.priceCents);
      if (savedSku.plannedQuantity) setRunQty(savedSku.plannedQuantity);
    }
    if (signedAddon) {
      setGooddeedOn(!!signedAddon.active);
      if (signedAddon.priceCents > 0) setDeedRetailCents(signedAddon.priceCents);
      if (signedAddon.plannedQuantity) {
        setDeedMode("cap");
        setDeedCap(signedAddon.plannedQuantity);
      }
    }
  }, [sell, invited, catalogFormats, savedSku, signedAddon]);

  // ── "Start from a package" rail (Ruby handoff, Aug 19 2026) ─────────
  // The invited press's LIVE packages ride the invited-press payload. Only
  // the true invited press's rail shows — effectivePress fallbacks carry no
  // packages array, so the section quietly stays hidden.
  const railPackages = useMemo<RailPkg[]>(() => invited?.packages ?? [], [invited]);
  const [startPkgId, setStartPkgId] = useState<string | null>(null);

  // Prefill the builder from the press's saved package — best-effort mapping
  // from the press builder's state onto THIS album's catalog choices:
  //   size → catalog format (7" / LP / double by disc count), run → min run,
  //   vinyl color → the catalog color whose name matches the package swatch.
  // Anything that doesn't resolve is left alone; the artist keeps tuning.
  // Client-local prefill only — like every other picker on this page it stays
  // interactive for read-only viewers; Save alone is canEdit-gated (and the
  // server gates writes regardless).
  const applyStartPackage = (pkg: RailPkg) => {
    if (startPkgId === pkg.id) { setStartPkgId(null); return; } // toggle off — deselect only, keep tuned state
    const bs = pkg.payload?.builderState ?? {};
    const wantFormat: AlbumFormat =
      String(bs.sizeId ?? "12") === "7" ? "7_inch" : (bs.discs ?? 1) >= 2 ? "12_double" : "12_lp";
    const row =
      catalogFormats.find((r) => r.format === wantFormat) ??
      catalogFormats.find((r) => r.format === "12_lp") ??
      catalogFormats[0];
    if (!row) return;
    setFormat(row.format);
    const minRun = Number(pkg.payload?.minRun ?? bs.qty ?? 0) || null;
    setRunQty(minRun);
    // Match the package's vinyl color by NAME against this press's catalog.
    const swatchName = railSwatch(pkg, catalogSwatches).name.trim().toLowerCase();
    let matchedTier: CatalogTier | null = null;
    let matchedColor: CatalogColor | null = null;
    for (const t of row.tiers) {
      const c = t.colors.find((c) => c.name.trim().toLowerCase() === swatchName);
      if (c) { matchedTier = t; matchedColor = c; break; }
    }
    if (matchedTier) {
      setTierSel((p) => ({ ...p, [row.format]: matchedTier!.id }));
      if (matchedColor) setColorSel((p) => ({ ...p, [matchedTier!.id]: matchedColor!.id }));
    }
    setStartPkgId(pkg.id);
    setDirty(true);
    toast({
      title: `Prefilled from ${pkg.title}`,
      description: matchedTier
        ? "Size, run and color are set — keep tuning below."
        : "Size and run are set — pick the vinyl color below.",
    });
  };

  const fmtRow = useMemo(
    () => catalogFormats.find((r) => r.format === format) ?? null,
    [catalogFormats, format],
  );
  const tiers = fmtRow?.tiers ?? [];
  const activeTier = useMemo<CatalogTier | null>(() => {
    if (!fmtRow) return null;
    return tiers.find((t) => t.id === tierSel[fmtRow.format]) ?? tiers[0] ?? null;
  }, [fmtRow, tiers, tierSel]);
  const selectedColor = useMemo<CatalogColor | null>(() => {
    if (!activeTier) return null;
    return activeTier.colors.find((c) => c.id === colorSel[activeTier.id]) ?? activeTier.colors[0] ?? null;
  }, [activeTier, colorSel]);

  // Run options come from the tier's confirmed ladder rungs.
  const runOptions = useMemo<number[]>(() => {
    const qtys = (activeTier?.priceLadder ?? [])
      .filter((r) => r.confirmed !== false)
      .map((r) => r.qty)
      .sort((a, b) => a - b);
    return qtys.length > 0 ? qtys : FALLBACK_RUN_OPTIONS;
  }, [activeTier]);
  const effectiveRunQty = runQty ?? runOptions[Math.min(1, runOptions.length - 1)];

  // ── The earnings math — the REAL cost stack ────────────────────────
  const snap = useMemo(
    () => (activeTier ? snapCatalogLadder(activeTier.priceLadder, effectiveRunQty) : null),
    [activeTier, effectiveRunQty],
  );
  const mfgCents = snap && !snap.requiresQuote ? snap.unitCents : null;
  const publishingCents = Math.round(MECH_RATE_CENTS_PER_TRACK * Math.max(1, trackCount));
  const paymentCents = cardFeeCents(retailCents);
  const packageCostCents = mfgCents != null ? mfgCents + publishingCents + paymentCents + PLATFORM_MARGIN_CENTS : null;
  const profitPerUnitCents = packageCostCents != null ? Math.max(0, retailCents - packageCostCents) : null;
  const baseTotalCents = profitPerUnitCents != null ? profitPerUnitCents * effectiveRunQty : null;
  const [showCost, setShowCost] = useState(false);

  // Canon collapsible picker (same tool as PressVinylColors / the press
  // catalog): the "Pick your vinyl" grid renders as a one-line summary row
  // unless explicitly opened via "Change"; picking a type (or a color)
  // collapses it again. The color row always has a valid default
  // (selectedColor falls back to the tier's first color), so collapsing
  // immediately on the type pick never leaves the stage colorless.
  const [typeGridOpen, setTypeGridOpen] = useState(false);
  const typeGridExpanded = typeGridOpen;
  const costParts =
    mfgCents != null
      ? [
          { label: "Manufacturing", value: mfgCents },
          { label: `Publishing · ($0.127 × 2 [vinyl + digital]) × ${Math.max(1, trackCount)} tracks`, value: publishingCents },
          { label: "Payment processing", value: paymentCents },
          { label: "GoodTunes", value: PLATFORM_MARGIN_CENTS },
        ]
      : [];

  // GoodDeed — real per-cert cost from the pricing preview.
  const deedUnits = deedMode === "cap" ? Math.min(deedCap, effectiveRunQty) : Math.round(effectiveRunQty * DEED_TAKE_RATE);
  const { data: deedPreview, isLoading: deedPreviewLoading } = useQuery<{ totalPerUnitCents?: number }>({
    queryKey: ["/api/admin/albums", albumId, "gooddeed-pricing-preview", deedUnits],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/albums/${albumId}/gooddeed-pricing-preview?runQty=${deedUnits}`);
      return r.json();
    },
    enabled: !!albumId && gooddeedOn && deedUnits > 0,
  });
  const deedMfgCents = typeof deedPreview?.totalPerUnitCents === "number" && deedPreview.totalPerUnitCents > 0 ? deedPreview.totalPerUnitCents : null;
  const deedFeeCents = cardFeeCents(deedRetailCents);
  const deedCostCents = deedMfgCents != null ? deedMfgCents + deedFeeCents : null;
  const deedPerUnitCents = deedCostCents != null ? Math.max(0, deedRetailCents - deedCostCents) : null;
  const deedTotalCents = gooddeedOn && deedPerUnitCents != null ? deedPerUnitCents * deedUnits : null;

  const artistNetCents = baseTotalCents != null ? baseTotalCents + (deedTotalCents ?? 0) : null;

  // ── Jacket art chain (rule 1/2) ────────────────────────────────────
  const realArt = artworkUrl && artworkUrl !== PLACEHOLDER_ART ? artworkUrl : null;
  // Press-branded jacket fallback chain (matches the admin Albums list /
  // package designer): uploaded press default jacket → bundled grayscale
  // placeholder resolved by press domain (pressPlaceholderArt.ts). Only a
  // truly press-less album should ever fall through to the generic
  // product-mark icon below — a Memphis album must never wear another
  // press's mark. `||` (not `??`) so empty-string DB values don't win.
  const pressDefaultJacket =
    pressRow?.vinylPlaceholderUrl ||
    press?.vinylPlaceholderUrl ||
    resolvePressPlaceholderArt(press?.domain) ||
    null;
  const jacketUrl = realArt ?? pressDefaultJacket ?? null;

  // ── Save — the same endpoints SellPanel writes ─────────────────────
  const save = useMutation({
    mutationFn: async () => {
      if (!format || !activeTier) throw new Error("Pick a size and vinyl first.");
      // Zero data loss: preserve every field this page doesn't surface from
      // the TARGET format's existing SKU row (not whatever row we seeded
      // from), so a format switch never nulls out operator-set config.
      const targetSku = sell?.skus.find((s) => s.format === format) ?? null;
      await apiRequest("PUT", `/api/admin/albums/${albumId}/skus/${format}`, {
        format,
        priceCents: retailCents,
        stock: targetSku?.stock ?? null,
        active: true,
        plannedQuantity: effectiveRunQty,
        vinylColor: targetSku?.vinylColor ?? null,
        jacketUpgrade: (targetSku?.jacketUpgrade as any) ?? null,
        pressTierId: activeTier.id,
        pressColorId: selectedColor?.id ?? null,
        displayName: targetSku?.displayName ?? null,
        trackCount: trackCount || null,
      });
      // The builder is a single-package decision: switching size deactivates
      // the previously active vinyl SKU (row + its config are kept — only
      // the active flag flips) so two formats can't both be sellable.
      const staleActive = (sell?.skus ?? []).filter(
        (s) => s.active && s.format !== format && (VINYL_FORMATS as readonly string[]).includes(s.format),
      );
      for (const s of staleActive) {
        await apiRequest("PUT", `/api/admin/albums/${albumId}/skus/${s.format}`, {
          format: s.format,
          priceCents: s.priceCents,
          stock: s.stock ?? null,
          active: false,
          plannedQuantity: s.plannedQuantity ?? null,
          vinylColor: s.vinylColor ?? null,
          jacketUpgrade: (s.jacketUpgrade as any) ?? null,
          pressTierId: s.pressTierId ?? null,
          pressColorId: s.pressColorId ?? null,
          displayName: s.displayName ?? null,
        });
      }
      await apiRequest("PUT", `/api/admin/albums/${albumId}/addons/signed_cert`, {
        priceCents: deedRetailCents,
        active: gooddeedOn,
        minPriceCents: signedAddon?.minPriceCents ?? 0,
        plannedQuantity: gooddeedOn && deedMode === "cap" ? deedCap : null,
      });
    },
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "skus"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "early-cut"] });
      toast({ title: "Package saved" });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  const markDirty = () => setDirty(true);

  if (!invited || !sell) {
    return (
      <div className="flex items-center gap-2 py-16 justify-center text-[13px]" style={{ color: SUBINK }} data-testid="package-builder-loading">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your package…
      </div>
    );
  }

  if (catalogFormats.length === 0) {
    return (
      <PageColumn padded={false} className="!max-w-none" testId="package-builder-empty">
        <PageHeader
          title="Design your package"
          subtitle="See what it earns"
          contentGap={false}
        />
        <p className="text-[14px]" style={{ color: SUBINK, marginTop: 16, lineHeight: 1.5 }}>
          Your press hasn't published a vinyl catalog yet. As soon as {press?.name ?? "the press"} adds
          sizes and pricing, you'll design your package right here.
        </p>
      </PageColumn>
    );
  }

  return (
    <PressBrandContext.Provider
      value={{
        name: press?.name ?? DEFAULT_PRESS_BRAND.name,
        shortName: pressShortName(press?.name),
        labelLogo: labelLogoUrl ?? DEFAULT_PRESS_BRAND.labelLogo,
        lightLabelLogo: lightLabelLogoUrl,
        pressId: press?.id,
        catalogFormats: (invited?.catalog?.formats as CatalogFormat[] | undefined) ?? null,
      }}
    >
    <PageColumn
      padded={false}
      className="!max-w-none"
      testId="panel-package-builder"
    >
      {/* Page header + quiet save state */}
      <PageHeader
        title="Design your package"
        subtitle={
          <>
            One confident decision at a time — size, vinyl, price. Every choice updates the
            record on the left and your take-home on the right. Honest math, no surprises.
          </>
        }
        titleExtras={<SectionLabel>Your release · {albumTitle}</SectionLabel>}
        actions={canEdit ? (
          <div className="flex items-center gap-3 flex-shrink-0" style={{ marginTop: 24 }}>
            <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: dirty ? SUBINK : FAINT }} data-testid="save-state">
              {dirty ? <FileText className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
              {dirty ? "Edited" : "All changes saved"}
            </span>
            <Button
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
              className="bg-[var(--apple-blue)] text-white hover:bg-[var(--apple-blue)] hover:opacity-90 rounded-full disabled:opacity-40"
              style={{ borderColor: BLUE, paddingLeft: 22, paddingRight: 22 }}
              data-testid="button-save"
            >
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save
            </Button>
          </div>
        ) : undefined}
      />

      <div style={{ marginTop: 20 }}>
        <AlbumBanner
          coverUrl={realArt}
          albumTitle={albumTitle}
          artistName={artistName}
          trackCount={trackCount}
          pressName={press?.name ?? null}
        />
      </div>

      <Divider />

      <fieldset disabled={!canEdit} className="min-w-0">
        {/* Two-column body — jacket preview left (sticky), decisions right.
            Collapses to a single column when the viewport gets too narrow. */}
        <div
          className="grid gap-16"
          style={{ gridTemplateColumns: narrow ? "1fr" : "minmax(0, 1fr) minmax(0, 620px)" }}
        >
          {/* LEFT — the record, no card around it */}
          <div
            className="flex flex-col items-center"
            style={
              narrow
                ? { minHeight: 560, paddingTop: 24 }
                : { position: "sticky", top: 24, alignSelf: "start", minHeight: 560, paddingTop: 24 }
            }
          >
            {format && (
              <JacketStage
                format={format}
                jacketUrl={jacketUrl}
                color={selectedColor}
                labelLogoUrl={labelLogoUrl}
                labelBgColor={labelBgColor}
                placeholderIconUrl={PMP_ICON}
              />
            )}
          </div>

          {/* RIGHT — the decisions. Above the sliding jacket, opaque canvas bg. */}
          <div className="min-w-0" style={{ position: "relative", zIndex: 2, backgroundColor: CANVAS }}>
            {/* Start from a package (Ruby handoff, Aug 19 2026) — only when
                the invited press has LIVE packages; otherwise the builder
                opens on Pick-a-size exactly as before. */}
            {railPackages.length > 0 && (
              <section data-testid="section-start-packages" style={{ marginBottom: 40 }}>
                <TwoTone lead="Start from a package" rest="Or build your own below" />
                <p style={{ fontSize: 13, color: SUBINK, marginTop: 8, maxWidth: 620, lineHeight: 1.45 }}>
                  Ready builds from {press?.name ?? "your press"} — pick one to prefill your
                  record, then keep tuning.
                </p>
                <div
                  style={{ marginTop: 20, display: "flex", gap: 20, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "thin" }}
                  data-testid="rail-start-packages"
                >
                  {railPackages.map((p) => (
                    <StartPackageCard
                      key={p.id}
                      pkg={p}
                      pressName={press?.name ?? "Press"}
                      selected={startPkgId === p.id}
                      onSelect={() => applyStartPackage(p)}
                      catalogSwatches={catalogSwatches}
                    />
                  ))}
                </div>
                <div className="inline-flex items-center gap-1.5" style={{ marginTop: 6, fontSize: 12.5, color: FAINT }}>
                  <Sparkles className="w-3.5 h-3.5" />
                  Prefer to start clean? The builder below is yours from scratch.
                </div>
              </section>
            )}

            {/* Pick a size */}
            <TwoTone lead="Pick a size" rest="Prices follow the record" />
            <SizeCards
              formats={catalogFormats.map((r) => r.format)}
              value={format}
              onChange={(f) => {
                setFormat(f);
                setRunQty(null);
                markDirty();
              }}
            />

            <Divider />

            {/* Pick a type (tier) */}
            <TwoTone lead="Pick your vinyl" rest="Black, color, or a wild splatter" />
            {!typeGridExpanded && activeTier ? (
              // Collapsed summary — the picked type, one quiet row (canon:
              // same as the press Vinyl-colors page).
              <div
                className="flex items-center gap-3 rounded-2xl"
                style={{ marginTop: 14, padding: "10px 14px", backgroundColor: CARD, border: `1px solid ${HAIRLINE}` }}
                data-testid="type-summary"
              >
                <VinylDisc size={44} color={activeTier.colors[0] ?? null} labelLogoUrl={labelLogoUrl} labelBgColor={labelBgColor} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate" style={{ fontSize: 13.5, color: INK }}>
                    {activeTier.name}
                  </div>
                  <div style={{ fontSize: 11.5, marginTop: 1, color: FAINT }}>
                    Type · {activeTier.colors.length} {activeTier.colors.length === 1 ? "color" : "colors"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTypeGridOpen(true)}
                  className="flex-shrink-0 font-semibold rounded-full px-3 py-1.5 transition-colors"
                  style={{ fontSize: 12.5, color: BLUE }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(49,158,216,0.12)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  data-testid="button-change-type"
                >
                  Change
                </button>
              </div>
            ) : (
              <TypeCards
                tiers={tiers}
                value={activeTier?.id ?? null}
                onChange={(id) => {
                  if (fmtRow) setTierSel((p) => ({ ...p, [fmtRow.format]: id }));
                  setRunQty(null);
                  // Canon: picking a type collapses the grid back to the
                  // summary row; the color section below shows the new
                  // type's default color immediately.
                  setTypeGridOpen(false);
                  markDirty();
                }}
                labelLogoUrl={labelLogoUrl}
                labelBgColor={labelBgColor}
              />
            )}

            <Divider />

            {/* Pick a color */}
            <TwoTone lead="Pick a color" rest="This is the one fans hold" />
            {activeTier && (
              <p className="text-[12.5px]" style={{ marginTop: 6 }}>
                <span className="font-semibold" style={{ color: INK }}>{activeTier.name}</span>
                <span style={{ color: FAINT }}> · {activeTier.colors.length} colors</span>
              </p>
            )}
            <ColorCards
              colors={activeTier?.colors ?? []}
              value={selectedColor?.id ?? null}
              fallbackLabel={activeTier?.name ?? "Vinyl color"}
              labelLogoUrl={labelLogoUrl}
              labelBgColor={labelBgColor}
              onChange={(id) => {
                if (activeTier) setColorSel((p) => ({ ...p, [activeTier.id]: id }));
                // A choice closes the collapsible picker (standing rule).
                setTypeGridOpen(false);
                markDirty();
              }}
            />

            <Divider />

            {/* Pricing & earnings */}
            <TwoTone lead="Set your price" rest="Watch what you earn" />
            <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.4 }}>
              Pick a retail price and a run. GoodTunes<sup style={{ fontSize: "0.6em", top: "-0.5em" }}>®</sup> does the math live —
              this is your take-home, before a single record ships.
            </p>

            <div className="flex flex-wrap items-end gap-x-10 gap-y-5" style={{ marginTop: 18 }}>
              <div>
                <div className="text-xs font-medium" style={{ color: SUBINK, marginBottom: 8 }}>
                  Retail price
                </div>
                <RetailControl
                  cents={retailCents}
                  onCents={(v) => {
                    setRetailCents(v);
                    markDirty();
                  }}
                />
              </div>
              <div>
                <div className="text-xs font-medium" style={{ color: SUBINK, marginBottom: 8 }}>
                  Run quantity
                </div>
                <RunControl
                  options={runOptions}
                  value={effectiveRunQty}
                  onChange={(v) => {
                    setRunQty(v);
                    markDirty();
                  }}
                />
              </div>
            </div>

            {/* The earnings receipt */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}`, marginTop: 20 }}
              data-testid="earnings-panel"
            >
              <div style={{ padding: "4px 18px" }}>
                <EarnLine label="Retail price" hint="What fans pay per record" value={money(retailCents)} />
                <div className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />
                {packageCostCents != null ? (
                  <>
                    <div className="flex items-baseline justify-between gap-4" style={{ padding: "11px 0 0" }}>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-medium leading-tight" style={{ color: INK }}>Profit per unit sold</div>
                        <button
                          type="button"
                          onClick={() => setShowCost((v) => !v)}
                          data-testid="button-cost-breakdown"
                          className="flex items-center gap-1 text-[11.5px] transition-colors"
                          style={{ color: FAINT, marginTop: 2 }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = SUBINK)}
                          onMouseLeave={(e) => (e.currentTarget.style.color = FAINT)}
                        >
                          After the {money(packageCostCents)} package cost{press?.name ? <> from {press.name}</> : null}
                          <ChevronRight className="w-3 h-3 transition-transform" style={{ transform: showCost ? "rotate(90deg)" : "none" }} />
                        </button>
                      </div>
                      <div className="tabular-nums flex-shrink-0 text-[14px] font-medium" style={{ color: INK }}>
                        {money(profitPerUnitCents!)}
                      </div>
                    </div>
                    <div
                      style={{
                        overflow: "hidden",
                        maxHeight: showCost ? 220 : 0,
                        opacity: showCost ? 1 : 0,
                        transition: "max-height 0.35s ease, opacity 0.25s ease",
                      }}
                    >
                      <div style={{ margin: "8px 0 12px", paddingLeft: 14, borderLeft: `2px solid ${HAIRLINE}` }}>
                        {costParts.map((p) => (
                          <div key={p.label} className="flex items-baseline justify-between gap-4" style={{ padding: "4px 0" }}>
                            <span className="text-[12px]" style={{ color: SUBINK }}>{p.label}</span>
                            <span className="tabular-nums text-[12px]" style={{ color: SUBINK }}>{money(p.value)}</span>
                          </div>
                        ))}
                        <div className="flex items-baseline justify-between gap-4" style={{ padding: "6px 0 2px", borderTop: `1px solid ${HAIRLINE}`, marginTop: 4 }}>
                          <span className="text-[12px] font-semibold" style={{ color: INK }}>
                            Cost per unit <span style={{ color: FAINT, fontWeight: 400 }}>({money(packageCostCents * effectiveRunQty)} for the run)</span>
                          </span>
                          <span className="tabular-nums text-[12px] font-semibold" style={{ color: INK }}>{money(packageCostCents)}</span>
                        </div>
                      </div>
                    </div>
                    {!showCost && <div style={{ paddingBottom: 11 }} />}
                    <div className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />
                    <EarnLine
                      label={`Base earnings · ${effectiveRunQty.toLocaleString("en-US")} units`}
                      value={money(baseTotalCents!)}
                      strong
                    />
                  </>
                ) : (
                  <div style={{ padding: "11px 0" }} data-testid="earnings-quote-needed">
                    <div className="text-sm font-medium leading-tight" style={{ color: INK }}>Custom estimate needed</div>
                    <div className="text-[11.5px]" style={{ color: FAINT, marginTop: 2, lineHeight: 1.4 }}>
                      {snap?.requiresQuote
                        ? `Runs above ${snap.qty.toLocaleString("en-US")} are estimated by ${press?.name ?? "the press"} — your earnings appear once the estimate arrives.`
                        : `${press?.name ?? "The press"} hasn't priced this combination yet.`}
                    </div>
                  </div>
                )}
                {gooddeedOn && deedTotalCents != null && (
                  <>
                    <div className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />
                    <div className="flex items-baseline justify-between gap-4" style={{ padding: "11px 0" }}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[13.5px] leading-tight" style={{ color: INK }}>
                          <Award className="w-3.5 h-3.5" style={{ color: BLUE }} />
                          <span className="font-medium">
                            GoodDeed<sup style={{ fontSize: "0.6em", top: "-0.5em" }}>®</sup> certificates
                          </span>
                        </div>
                        <div className="text-[11.5px]" style={{ color: FAINT, marginTop: 2 }}>
                          {deedMode === "cap" ? "Capped at" : "Est."} {deedUnits.toLocaleString("en-US")} of {effectiveRunQty.toLocaleString("en-US")} → {money(deedPerUnitCents!)}/unit
                        </div>
                      </div>
                      <div className="tabular-nums flex-shrink-0 text-[14px] font-medium" style={{ color: READY }}>
                        + {money(deedTotalCents)}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Artist Net — the hero number */}
              <div
                className="flex items-center justify-between"
                style={{
                  padding: 18,
                  borderTop: `1px solid ${HAIRLINE}`,
                  background: `linear-gradient(180deg, ${BLUE_TINT_TOP} 0%, ${CARD} 100%)`,
                }}
                data-testid="artist-net"
              >
                <div>
                  <div className="text-xs font-medium" style={{ color: SUBINK }}>
                    Artist net
                  </div>
                  <div className="text-[12px]" style={{ color: SUBINK, marginTop: 3 }}>
                    If the full run sells through
                  </div>
                </div>
                <div className="text-right">
                  <div className="tabular-nums tracking-tight" style={{ fontSize: 38, fontWeight: 600, color: INK, lineHeight: 1 }}>
                    {artistNetCents != null ? money(artistNetCents) : "—"}
                  </div>
                </div>
              </div>
            </div>

            <Divider />

            {/* GoodDeed flagship */}
            <TwoTone lead="GoodDeed®" rest="Make it collectible" />
            <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.4 }}>
              Every record includes a free certificate. Add a signed premium tier below.
            </p>
            <div style={{ marginTop: 14 }}>
              <GoodDeedCard
                coverSrc={realArt}
                on={gooddeedOn}
                onToggle={() => {
                  setGooddeedOn((v) => !v);
                  markDirty();
                }}
                runQty={effectiveRunQty}
                deedUnits={deedUnits}
                perUnitCents={deedPerUnitCents}
                totalCents={deedPerUnitCents != null ? deedPerUnitCents * deedUnits : null}
                retailCents={deedRetailCents}
                onRetailCents={(v) => {
                  setDeedRetailCents(v);
                  markDirty();
                }}
                mode={deedMode}
                onMode={(m) => {
                  setDeedMode(m);
                  markDirty();
                }}
                cap={deedCap}
                onCap={(v) => {
                  setDeedCap(v);
                  markDirty();
                }}
                mfgCents={deedMfgCents}
                feeCents={deedFeeCents}
                costCents={deedCostCents}
                costPending={deedPreviewLoading}
              />
            </div>

            {/* Print templates moved to the Physical → Art tab (gogoods,
                Aug 15 2026) — see PackagePrintTemplates below, rendered by
                PressPanel. Same section, same styling, new home. */}
          </div>
        </div>
      </fieldset>
    </PageColumn>
    </PressBrandContext.Provider>
  );
}

export default PressAlbumPackageBuilder;
