// PressStickersComponent — ported from handoff/press-components/PressCatalogStickers.tsx.
// Renders ONLY the main-content body inside OperatorShell (the mock's PressShell,
// left rail, header, breadcrumb chrome, and the View-dark/light pill are all
// MOCK-ONLY and stripped). Theme mode comes from useAdminDark(); the THEMES map
// is copied handoff-verbatim. Press identity is data (payload.press).
//
// The mock's select-a-shape / select-a-size interaction is the preview browser
// and is KEPT. On top of it (Task #3049):
//   • Every shape tile and size card carries a hover-revealed ••• menu (same
//     interaction pattern as the vinyl-colors swatch menu): "Don't offer" flips
//     the offered state (dimmed "Not offered" card), and "Upload template…"
//     attaches a per-shape / per-size die-cut template (attach + store only).
//   • Size cards keep their explicit offered on/off toggle pill.
//   • The sticker face shows the press's real uploaded logo (label/product
//     logo first, then other uploaded variants) — initials only as a last
//     resort. No slogan: the promo face is logo-only.
// Staff (canEdit=false) is view-only: every edit affordance is hidden.
//
// The sticker render, contact shadow, and barcode are PRODUCT imagery — not
// themed. Self-contained: helper components live in this file, like the mock.

import { useState, useEffect } from "react";
import { Check, MoreHorizontal, Loader2 } from "lucide-react";
import { useAdminDark } from "@/lib/adminAppearance";
import { useToast } from "@/hooks/use-toast";
import { uploadAdminDoc, DOC_UPLOAD_ACCEPT } from "@/lib/adminUpload";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import type { PressComponentsPayload } from "./usePressComponents";
import type { StickersComponentConfig } from "@shared/pressComponents";

// Defense-in-depth mirror of the shared-schema constraint: templates are
// always /objects/uploads/<id> paths minted by the doc-upload sign flow.
// Never render anything else as a link (a legacy/tampered row must not be
// able to smuggle a javascript:/https: href to other privileged users).
export function isSafeTemplateUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && /^\/objects\/uploads\/[a-zA-Z0-9._-]+$/.test(url);
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ─── Themes — light = apple-canon; dark = charcoal admin canon ──────────
type Theme = {
  canvas: string;
  card: string;
  hairline: string;
  ink: string;
  subink: string;
  faint: string;
  tick: string;
  blue: string;
  chipFill: string;
  offeredWash: string;
  frost: string;
  menuHover: string;
};

const THEMES: Record<"light" | "dark", Theme> = {
  light: {
    canvas: "#f5f5f7",
    card: "#ffffff",
    hairline: "#e6e6ea",
    ink: "#1d1d1f",
    subink: "#6e6e73",
    faint: "#a1a1a6",
    tick: "#d0d0d5",
    blue: "#319ED8",
    chipFill: "rgba(0,0,0,0.06)",
    offeredWash: "rgba(28,138,91,0.10)",
    frost: "rgba(255,255,255,0.88)",
    menuHover: "hover:bg-slate-50",
  },
  dark: {
    canvas: "#161617",
    card: "#1e1e20",
    hairline: "rgba(255,255,255,0.10)",
    ink: "#f5f5f7",
    subink: "#98989d",
    faint: "#6e6e73",
    tick: "#48484c",
    blue: "#319ED8",
    chipFill: "rgba(255,255,255,0.08)",
    offeredWash: "rgba(28,138,91,0.16)",
    frost: "rgba(40,40,42,0.88)",
    menuHover: "hover:bg-white/5",
  },
};

// ─── Shapes → sizes: fixed product vocabulary (kept as a const) ─────────
// Artists pick a shape first, then a size within it. UPC is its own shape
// with one fixed size. payload.stickers.shapes records which size ids the
// press OFFERS per shape, the shape-level offered flag, and any attached
// die-cut templates.
type StickerShapeId = "rect" | "square" | "circle" | "upc";

type StickerSize = {
  id: string;
  name: string;
  wIn: number;
  hIn: number;
};

type StickerShape = {
  id: StickerShapeId;
  name: string;
  note: string;
  kind: "promo" | "upc";
  round: boolean;
  sizes: StickerSize[];
};

const sz = (wIn: number, hIn: number, round = false): StickerSize => ({
  id: `${wIn}x${hIn}`,
  name: round ? `${wIn}"` : `${wIn}" × ${hIn}"`,
  wIn,
  hIn,
});

const MOCK_STICKER_SHAPES: StickerShape[] = [
  {
    id: "rect",
    name: "Rectangle",
    note: "Wide promo strips and title stickers.",
    kind: "promo",
    round: false,
    sizes: [sz(1.5, 1), sz(2, 1), sz(2, 3), sz(2, 4), sz(2.5, 1)],
  },
  {
    id: "square",
    name: "Square",
    note: "Compact hype squares, tiny to full-size.",
    kind: "promo",
    round: false,
    sizes: [sz(1, 1), sz(1.5, 1.5), sz(2, 2), sz(2.5, 2.5), sz(3, 3), sz(3.5, 3.5), sz(4, 4)],
  },
  {
    id: "circle",
    name: "Circle",
    note: "Classic round hype stickers.",
    kind: "promo",
    round: true,
    sizes: [sz(1, 1, true), sz(1.5, 1.5, true), sz(2, 2, true), sz(2.5, 2.5, true), sz(3, 3, true), sz(3.5, 3.5, true), sz(4, 4, true)],
  },
  {
    id: "upc",
    name: "UPC",
    note: "Barcode retailers scan — one standard size.",
    kind: "upc",
    round: false,
    sizes: [sz(1.75, 0.75)],
  },
];

// ─── Barcode — quiet CSS-only UPC bars, no libraries ─────────────────
const UPC_BARS = [
  2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 1, 2, 2, 1, 3, 1, 1, 2,
  1, 1, 2, 1, 3, 1, 1, 2, 1, 2, 2, 1, 1, 3, 1, 1, 2, 1, 1, 2,
];

function Barcode({ height, scale = 1 }: { height: number; scale?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 * scale }}>
      <div style={{ display: "flex", alignItems: "stretch", height, gap: 1 * scale }} aria-hidden>
        {UPC_BARS.map((w, i) => (
          <div
            key={i}
            style={{
              width: Math.max(1, w * scale),
              background: i % 2 === 0 ? "#111114" : "transparent",
            }}
          />
        ))}
      </div>
      {scale >= 0.9 && (
        <div style={{ fontSize: 8 * scale, letterSpacing: 2 * scale, color: "#111114", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          8 12345 67890 4
        </div>
      )}
    </div>
  );
}

// ─── Press mark on the sticker face ──────────────────────────────────
// Task #3049 — the mark resolves through the press's uploaded logo variants
// (label/product logo first) before falling back to a neutral initials
// chip — NEVER a hardcoded mock logo.
export function resolveStickerLogo(press: PressComponentsPayload["press"]): string | null {
  return (
    press.labelLogoUrl ||
    press.squareLogoUrl ||
    press.logoUrl ||
    press.lightLogoUrl ||
    press.identityIconUrl ||
    null
  );
}

function PressMark({ logoUrl, name, size }: { logoUrl: string | null; name: string; size: number }) {
  if (logoUrl) {
    return <img src={logoUrl} alt="" aria-hidden style={{ width: size, height: size, objectFit: "contain" }} />;
  }
  const initials = (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: "1px solid rgba(0,0,0,0.14)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#6e6e73",
        fontWeight: 700,
        fontSize: Math.max(9, size * 0.34),
        letterSpacing: 0.5,
      }}
    >
      {initials || "•"}
    </div>
  );
}

// ─── The sticker render — white stock, per-shape face ────────────────
// Task #3049 — the promo face is logo-only (no "Limited Pressing" slogan).
function Sticker({
  size,
  shape,
  pxPerInch,
  logoUrl,
  pressName,
}: {
  size: StickerSize;
  shape: StickerShape;
  pxPerInch: number;
  logoUrl: string | null;
  pressName: string;
}) {
  const kind = shape.kind;
  const w = Math.round(size.wIn * pxPerInch);
  const h = Math.round(size.hIn * pxPerInch);
  const isCircle = shape.round;
  const radius = isCircle ? "50%" : Math.round(pxPerInch * 0.09);
  const minDim = Math.min(w, h);

  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        borderRadius: radius,
        background: "radial-gradient(circle at 40% 30%, #ffffff 0%, #f7f7f8 62%, #eeeef0 100%)",
        border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.06), inset 0 1px 2px rgba(255,255,255,0.9)",
        overflow: "hidden",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {kind === "promo" ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: minDim * 0.12 }}>
          {/* Per-press: the press's own uploaded mark (resolveStickerLogo). */}
          <PressMark logoUrl={logoUrl} name={pressName} size={minDim * 0.56} />
        </div>
      ) : (
        <Barcode height={h * 0.34} scale={minDim / 200} />
      )}
    </div>
  );
}

// ─── Left preview stage — one large sticker ──────────────────────────
const STAGE_PX_PER_INCH = 75;

function StickerStage({
  size,
  shape,
  logoUrl,
  pressName,
}: {
  size: StickerSize;
  shape: StickerShape;
  logoUrl: string | null;
  pressName: string;
}) {
  const w = Math.round(size.wIn * STAGE_PX_PER_INCH);
  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
      <div style={{ position: "relative", height: 310, display: "flex", alignItems: "flex-end" }}>
        <div style={{ transition: "all 0.4s cubic-bezier(0.32, 0.72, 0.28, 1)" }}>
          <Sticker size={size} shape={shape} pxPerInch={STAGE_PX_PER_INCH} logoUrl={logoUrl} pressName={pressName} />
        </div>
        {/* Contact shadow */}
        <div
          style={{
            position: "absolute",
            bottom: -14,
            left: "50%",
            transform: "translateX(-50%)",
            width: Math.round(w * 0.66),
            height: 14,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.18)",
            filter: "blur(8px)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      </div>
    </div>
  );
}

// ─── ••• hover menu (vinyl-colors swatch-menu pattern) ────────────────
// Frosted round trigger revealed on card hover/focus; the popover offers
// "Don't offer" / "Offer" plus template attach / view / replace.
function CardMenu({
  label,
  offered,
  templateUrl,
  uploading,
  onToggleOffered,
  onUploadTemplate,
  t,
  testId,
}: {
  label: string;
  offered: boolean;
  templateUrl: string | null;
  uploading: boolean;
  onToggleOffered: () => void;
  onUploadTemplate: (file: File) => void;
  t: Theme;
  testId: string;
}) {
  const [open, setOpen] = useState(false);

  const pickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = DOC_UPLOAD_ACCEPT;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) onUploadTemplate(file);
      setOpen(false);
    };
    input.click();
  };

  const rowClass = cn(
    "w-full text-left text-sm rounded-md px-2.5 py-2 transition-colors focus:outline-none",
    t.menuHover,
  );

  return (
    <div
      className={cn(
        "absolute transition-opacity",
        open ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
      )}
      style={{ top: 8, right: 8, zIndex: 5 }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Options for ${label}`}
            data-testid={`${testId}-menu`}
            className="inline-flex items-center justify-center rounded-full transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            style={{
              width: 26,
              height: 26,
              backgroundColor: t.frost,
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: `1px solid ${t.hairline}`,
              boxShadow: "0 1px 3px rgba(0,0,0,0.10)",
              color: t.subink,
            }}
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="w-60 p-1.5"
          style={{ backgroundColor: t.card, borderColor: t.hairline, color: t.ink }}
        >
          <button
            type="button"
            className={rowClass}
            style={{ color: t.ink }}
            data-testid={`${testId}-toggle-offered`}
            onClick={() => {
              onToggleOffered();
              setOpen(false);
            }}
          >
            {offered ? `Don't offer this ${label}` : `Offer this ${label}`}
          </button>
          <button
            type="button"
            className={rowClass}
            style={{ color: t.ink }}
            disabled={uploading}
            data-testid={`${testId}-upload-template`}
            onClick={pickFile}
          >
            {templateUrl ? "Replace template…" : "Upload template…"}
          </button>
          {isSafeTemplateUrl(templateUrl) && (
            <a
              href={templateUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(rowClass, "block")}
              style={{ color: t.blue }}
              data-testid={`${testId}-view-template`}
              onClick={() => setOpen(false)}
            >
              View template
            </a>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── Shape option tile — mini sticker face, representative size ──────
function ShapeTile({
  shape,
  active,
  offered,
  templateUrl,
  canEdit,
  uploading,
  onSelect,
  onToggleOffered,
  onUploadTemplate,
  offeredCount,
  logoUrl,
  pressName,
  t,
}: {
  shape: StickerShape;
  active: boolean;
  offered: boolean;
  templateUrl: string | null;
  canEdit: boolean;
  uploading: boolean;
  onSelect: () => void;
  onToggleOffered: () => void;
  onUploadTemplate: (file: File) => void;
  offeredCount: number;
  logoUrl: string | null;
  pressName: string;
  t: Theme;
}) {
  const rep = shape.sizes[Math.floor(shape.sizes.length / 2)];
  const tilePxPerInch = 76 / Math.max(rep.wIn, rep.hIn);
  return (
    <div className="group relative">
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        aria-pressed={active}
        data-testid={`sticker-shape-${shape.id}`}
        className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
        style={{
          backgroundColor: t.card,
          padding: 16,
          border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}`,
          opacity: offered ? 1 : 0.55,
        }}
      >
        <div className="flex justify-center" style={{ marginBottom: 12 }}>
          <div style={{ width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sticker size={rep} shape={shape} pxPerInch={tilePxPerInch} logoUrl={logoUrl} pressName={pressName} />
          </div>
        </div>
        <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? t.blue : t.ink }}>
          {shape.name}
        </div>
        <div className="text-[11.5px]" style={{ marginTop: 3, color: t.faint, lineHeight: 1.35 }}>
          {offered ? (
            <>
              {shape.sizes.length === 1 ? shape.sizes[0].name : `${shape.sizes.length} sizes`}
              {" · "}
              {offeredCount} offered
            </>
          ) : (
            <span data-testid={`sticker-shape-not-offered-${shape.id}`}>Not offered</span>
          )}
          {templateUrl && (
            <>
              {" · "}
              <span style={{ color: t.subink }}>Template attached</span>
            </>
          )}
        </div>
      </div>
      {canEdit && (
        <CardMenu
          label="shape"
          offered={offered}
          templateUrl={templateUrl}
          uploading={uploading}
          onToggleOffered={onToggleOffered}
          onUploadTemplate={onUploadTemplate}
          t={t}
          testId={`sticker-shape-${shape.id}`}
        />
      )}
    </div>
  );
}

// ─── Size option card — quiet text card + offered toggle + ••• menu ──
// The card itself previews the size (mock behaviour). The check pill in the
// corner is the offered on/off control: word + shape state (a filled check
// pill labelled "Offered" vs. a hollow pill labelled "Not offered"), never
// color alone. Hidden entirely when the press can't edit (view-only Staff).
function SizeCard({
  size,
  round,
  active,
  offered,
  templateUrl,
  canEdit,
  uploading,
  onSelect,
  onToggleOffered,
  onUploadTemplate,
  t,
}: {
  size: StickerSize;
  round: boolean;
  active: boolean;
  offered: boolean;
  templateUrl: string | null;
  canEdit: boolean;
  uploading: boolean;
  onSelect: () => void;
  onToggleOffered: () => void;
  onUploadTemplate: (file: File) => void;
  t: Theme;
}) {
  return (
    <div className="group relative">
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        aria-pressed={active}
        data-testid={`sticker-size-${size.id}`}
        className="rounded-2xl transition-all hover:-translate-y-px focus:outline-none"
        style={{
          position: "relative",
          backgroundColor: offered ? t.offeredWash : t.card,
          padding: "14px 10px",
          border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}`,
          textAlign: "center",
          cursor: "pointer",
          opacity: offered ? 1 : 0.55,
        }}
      >
        <div className="text-[15px] font-semibold" style={{ color: active ? t.blue : t.ink }}>{size.name}</div>
        <div className="text-[11px]" style={{ marginTop: 2, color: t.faint }}>
          {round ? "Circle" : size.wIn === size.hIn ? "Square" : "Rectangle"}
          {templateUrl && (
            <>
              {" · "}
              <span style={{ color: t.subink }}>Template</span>
            </>
          )}
        </div>

        {canEdit ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleOffered();
            }}
            aria-pressed={offered}
            aria-label={offered ? `${size.name} offered — click to stop offering` : `${size.name} not offered — click to offer`}
            data-testid={`sticker-size-toggle-${size.id}`}
            className="inline-flex items-center gap-1 rounded-full transition-colors focus:outline-none"
            style={{
              marginTop: 10,
              padding: "3px 9px",
              fontSize: 10.5,
              fontWeight: 600,
              border: offered ? "1px solid transparent" : `1px solid ${t.hairline}`,
              backgroundColor: offered ? t.blue : "transparent",
              color: offered ? "#ffffff" : t.subink,
            }}
          >
            {offered && <Check className="w-3 h-3" />}
            {offered ? "Offered" : "Not offered"}
          </button>
        ) : (
          <div
            className="inline-flex items-center gap-1 rounded-full"
            style={{
              marginTop: 10,
              padding: "3px 9px",
              fontSize: 10.5,
              fontWeight: 600,
              border: offered ? "1px solid transparent" : `1px solid ${t.hairline}`,
              backgroundColor: offered ? t.chipFill : "transparent",
              color: offered ? t.ink : t.faint,
            }}
            data-testid={`sticker-size-state-${size.id}`}
          >
            {offered && <Check className="w-3 h-3" />}
            {offered ? "Offered" : "Not offered"}
          </div>
        )}
      </div>
      {canEdit && (
        <CardMenu
          label="size"
          offered={offered}
          templateUrl={templateUrl}
          uploading={uploading}
          onToggleOffered={onToggleOffered}
          onUploadTemplate={onUploadTemplate}
          t={t}
          testId={`sticker-size-${size.id}`}
        />
      )}
    </div>
  );
}

// ─── Two-tone headings ───────────────────────────────────────────────
function PageHeading({ lead, rest, t }: { lead: string; rest: string; t: Theme }) {
  return (
    <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
      <span style={{ color: t.ink }}>{lead} </span>
      <span style={{ color: t.faint, fontWeight: 600 }}>{rest}</span>
    </h1>
  );
}

function StepHeading({ lead, rest, t }: { lead: string; rest: string; t: Theme }) {
  return (
    <h2 className="tracking-tight" style={{ fontSize: 24, lineHeight: 1.15, fontWeight: 600 }}>
      <span style={{ color: t.ink }}>{lead} </span>
      <span style={{ color: t.faint }}>{rest}</span>
    </h2>
  );
}

// ─── Local editing helpers ───────────────────────────────────────────
type ShapeState = {
  offered: boolean;
  sizes: Set<string>;
  templateUrl: string | null;
  sizeTemplates: Record<string, string>;
};
type ConfigMap = Record<StickerShapeId, ShapeState>;

const emptyShapeState = (): ShapeState => ({
  offered: true,
  sizes: new Set(),
  templateUrl: null,
  sizeTemplates: {},
});

function configToMap(cfg: StickersComponentConfig): ConfigMap {
  const map: ConfigMap = {
    rect: emptyShapeState(),
    square: emptyShapeState(),
    circle: emptyShapeState(),
    upc: emptyShapeState(),
  };
  for (const s of cfg.shapes) {
    if (!map[s.id]) continue;
    // Drop any non-upload-path template values on load (isSafeTemplateUrl):
    // they can't render as links anyway, and echoing them back on the next
    // save would 400 against the server-side path constraint.
    const sizeTemplates: Record<string, string> = {};
    for (const [k, v] of Object.entries(s.sizeTemplates ?? {})) {
      if (isSafeTemplateUrl(v)) sizeTemplates[k] = v;
    }
    map[s.id] = {
      // Absent offered flag = offered (backward-compatible with pre-#3049 configs).
      offered: s.offered !== false,
      sizes: new Set(s.offeredSizeIds),
      templateUrl: isSafeTemplateUrl(s.templateUrl) ? s.templateUrl : null,
      sizeTemplates,
    };
  }
  return map;
}

function mapToConfig(map: ConfigMap): StickersComponentConfig {
  return {
    shapes: MOCK_STICKER_SHAPES.map((shape) => {
      const st = map[shape.id] ?? emptyShapeState();
      return {
        id: shape.id,
        offeredSizeIds: shape.sizes.filter((sz) => st.sizes.has(sz.id)).map((sz) => sz.id),
        offered: st.offered,
        ...(st.templateUrl ? { templateUrl: st.templateUrl } : {}),
        ...(Object.keys(st.sizeTemplates).length ? { sizeTemplates: st.sizeTemplates } : {}),
      };
    }),
  };
}

// ─── Component ───────────────────────────────────────────────────────
export function PressStickersComponent({
  payload,
  canEdit,
  save,
  saving,
}: {
  payload: PressComponentsPayload;
  canEdit: boolean;
  save: (config: StickersComponentConfig) => void;
  saving: boolean;
}) {
  const t = THEMES[useAdminDark() ? "dark" : "light"];
  const { toast } = useToast();
  const press = payload.press;
  const stickerLogo = resolveStickerLogo(press);

  // Local edit state seeded from payload; re-seed only on press identity change
  // when there are no unsaved edits (local-edit vs shared-query re-seed rule).
  const [cfg, setCfg] = useState<ConfigMap>(() => configToMap(payload.stickers));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setCfg(configToMap(payload.stickers));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [press.id]);

  const [selectedShapeId, setSelectedShapeId] = useState<StickerShapeId>("circle");
  const [selectedSizeId, setSelectedSizeId] = useState<string>("3x3");
  // "shape:<id>" or "size:<shapeId>:<sizeId>" while a template upload streams.
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const shape = MOCK_STICKER_SHAPES.find((s) => s.id === selectedShapeId) ?? MOCK_STICKER_SHAPES[0];
  const size = shape.sizes.find((s) => s.id === selectedSizeId) ?? shape.sizes[Math.floor(shape.sizes.length / 2)];

  const chooseShape = (id: StickerShapeId) => {
    setSelectedShapeId(id);
    const next = MOCK_STICKER_SHAPES.find((s) => s.id === id);
    if (next) setSelectedSizeId(next.sizes[Math.floor(next.sizes.length / 2)].id);
  };

  // Commit a state transform: update local + persist the WHOLE config
  // atomically (same commit-point pattern as the previous toggle).
  const commit = (fn: (prev: ConfigMap) => ConfigMap) => {
    if (!canEdit) return;
    setCfg((prev) => {
      const next = fn(prev);
      save(mapToConfig(next));
      return next;
    });
    setDirty(true);
  };

  const toggleSizeOffered = (shapeId: StickerShapeId, sizeId: string) =>
    commit((prev) => {
      const st = prev[shapeId];
      const sizes = new Set(st.sizes);
      if (sizes.has(sizeId)) sizes.delete(sizeId);
      else sizes.add(sizeId);
      return { ...prev, [shapeId]: { ...st, sizes } };
    });

  const toggleShapeOffered = (shapeId: StickerShapeId) =>
    commit((prev) => ({
      ...prev,
      [shapeId]: { ...prev[shapeId], offered: !prev[shapeId].offered },
    }));

  const uploadTemplate = async (shapeId: StickerShapeId, sizeId: string | null, file: File) => {
    if (!canEdit) return;
    const key = sizeId ? `size:${shapeId}:${sizeId}` : `shape:${shapeId}`;
    setUploadingKey(key);
    try {
      const url = await uploadAdminDoc(file);
      commit((prev) => {
        const st = prev[shapeId];
        return sizeId
          ? { ...prev, [shapeId]: { ...st, sizeTemplates: { ...st.sizeTemplates, [sizeId]: url } } }
          : { ...prev, [shapeId]: { ...st, templateUrl: url } };
      });
      toast({ title: "Template attached" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message, variant: "destructive" });
    } finally {
      setUploadingKey(null);
    }
  };

  return (
    <div className="font-sans" style={{ backgroundColor: t.canvas, color: t.ink }}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 96 }}>
        {/* Quiet opening header */}
        <div className="min-w-0">
          <PageHeading lead="Stickers." rest="Promo and UPC options." t={t} />
          <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: t.subink }}>
            Pick the sticker sizes you offer. Artists choose from these when they design a record with {press.name}.
          </p>
          {saving && (
            <p className="text-[12px]" style={{ marginTop: 8, color: t.faint }} data-testid="stickers-saving">
              Saving…
            </p>
          )}
        </div>

        {/* Split: sticky sticker stage · size + style picker */}
        <div
          style={{
            marginTop: 40,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 520px",
            gap: 56,
            alignItems: "start",
          }}
        >
          {/* LEFT — the calm sticker stage (sticky) */}
          <div className="sticky" style={{ top: 88 }}>
            <div className="flex flex-col items-center">
              <StickerStage size={size} shape={shape} logoUrl={stickerLogo} pressName={press.name} />
              <div className="flex items-center justify-center gap-2 text-[13px]" style={{ marginTop: 28, color: t.subink }}>
                <span className="font-semibold" style={{ color: t.ink }}>
                  {size.name}
                </span>
                <span style={{ color: t.tick }}>·</span>
                <span>{shape.name}</span>
              </div>
              <p className="text-[12px] text-center" style={{ marginTop: 6, maxWidth: 320, color: t.faint }}>
                {shape.note}
              </p>
            </div>
          </div>

          {/* RIGHT — pick a shape → pick a size */}
          <div className="min-w-0 flex flex-col" style={{ gap: 48 }}>
            {/* Shape */}
            <section>
              <StepHeading lead="Pick a shape." rest="Die-cut to fit." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
                Stickers apply to the shrink-wrap, not the jacket itself.
              </p>
              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                {MOCK_STICKER_SHAPES.map((s) => (
                  <ShapeTile
                    key={s.id}
                    shape={s}
                    active={s.id === selectedShapeId}
                    offered={cfg[s.id]?.offered ?? true}
                    templateUrl={cfg[s.id]?.templateUrl ?? null}
                    canEdit={canEdit}
                    uploading={uploadingKey === `shape:${s.id}`}
                    onSelect={() => chooseShape(s.id)}
                    onToggleOffered={() => toggleShapeOffered(s.id)}
                    onUploadTemplate={(file) => uploadTemplate(s.id, null, file)}
                    offeredCount={cfg[s.id]?.sizes.size ?? 0}
                    logoUrl={stickerLogo}
                    pressName={press.name}
                    t={t}
                  />
                ))}
              </div>
            </section>

            {/* Size — options follow the chosen shape */}
            <section>
              <StepHeading lead="Pick a size." rest={`For ${shape.name.toLowerCase()}s.`} t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
                {shape.id === "upc"
                  ? "UPC stickers come in one standard retail size."
                  : canEdit
                  ? "Tap a size to preview it; use its toggle or ••• menu to offer or hide it and attach a die-cut template. Every size prints on the same white die-cut stock."
                  : "Every size prints on the same white die-cut stock."}
              </p>
              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                {shape.sizes.map((s) => (
                  <SizeCard
                    key={s.id}
                    size={s}
                    round={shape.round}
                    active={s.id === selectedSizeId}
                    offered={cfg[shape.id]?.sizes.has(s.id) ?? false}
                    templateUrl={cfg[shape.id]?.sizeTemplates[s.id] ?? null}
                    canEdit={canEdit}
                    uploading={uploadingKey === `size:${shape.id}:${s.id}`}
                    onSelect={() => setSelectedSizeId(s.id)}
                    onToggleOffered={() => toggleSizeOffered(shape.id, s.id)}
                    onUploadTemplate={(file) => uploadTemplate(shape.id, s.id, file)}
                    t={t}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PressStickersComponent;
