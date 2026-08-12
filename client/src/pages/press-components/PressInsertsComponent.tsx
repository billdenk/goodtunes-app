// Press Catalog › Components › Inserts — production page (Task #3052),
// ported from handoff/press-components/ArtistChooseInserts.tsx. Renders ONLY
// the page body inside OperatorShell; theme from useAdminDark(); press
// identity rides on the payload (labelLogoUrl reads white already).
// Four insert styles (INSERT_STYLE_IDS) persist offered/template; booklet
// page-count and poster size stay selection-only preview toggles.
import { useEffect, useState } from "react";
import type { PressComponentsPayload } from "./usePressComponents";
import { INSERT_STYLE_IDS, type InsertsComponentConfig } from "@shared/pressComponents";
import { useAdminDark } from "@/lib/adminAppearance";
import {
  OptionOfferMenu,
  NotOfferedChip,
  offerStateFromConfig,
  offerConfigFromState,
  type OfferState,
  type OfferMenuTheme,
} from "./packagingOffer";

// ─── Theme (copied from the mock; shell-only fields dropped) ─────────
type Theme = {
  blue: string;
  ink: string;
  subink: string;
  faint: string;
  hairline: string;
  canvas: string;
  card: string;
  soft: string;
  pillActive: string;
  pillInactive: string;
  pillShadow: string;
  emptyBorder: string;
  popShadow: string;
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
    soft: "#f2f2f5",
    pillActive: "#ffffff",
    pillInactive: "#8e8e93",
    pillShadow: "0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)",
    emptyBorder: "#d0d0d5",
    popShadow: "0 12px 40px rgba(0,0,0,0.16)",
  },
  dark: {
    blue: "#319ED8",
    ink: "#f5f5f7",
    subink: "#98989d",
    faint: "#6e6e73",
    hairline: "rgba(255,255,255,0.10)",
    canvas: "#161617",
    card: "#1e1e20",
    soft: "#26262a",
    pillActive: "#3a3a3e",
    pillInactive: "#98989d",
    pillShadow: "0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)",
    emptyBorder: "rgba(255,255,255,0.22)",
    popShadow: "0 12px 40px rgba(0,0,0,0.5)",
  },
};

function menuTheme(t: Theme, dark: boolean): OfferMenuTheme {
  return {
    card: t.card,
    hairline: t.hairline,
    ink: t.ink,
    subink: t.subink,
    faint: t.faint,
    popShadow: t.popShadow,
    hoverWash: dark ? "hover:bg-white/5" : "hover:bg-black/[0.03]",
  };
}

// Product-imagery hairline — NOT themed.
const HAIRLINE = "#e6e6ea";

// ─── Press mark on printed faces ─────────────────────────────────────
function FaceMark({ logoUrl, name, size }: { logoUrl: string | null; name: string; size: number }) {
  if (logoUrl) {
    return <img src={logoUrl} alt="" aria-hidden style={{ width: size, height: size, objectFit: "contain", opacity: 0.92 }} />;
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
        width: size, height: size, borderRadius: "50%",
        border: "1px solid rgba(255,255,255,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "rgba(255,255,255,0.85)", fontWeight: 700,
        fontSize: Math.max(9, size * 0.3), letterSpacing: 0.5, opacity: 0.92,
      }}
    >
      {initials || "\u2022"}
    </div>
  );
}

// Full-color print — same iridescent sunburst as the Full Color center label.
function RainbowPrintFace({ logoSize, logoUrl, pressName }: { logoSize: number; logoUrl: string | null; pressName: string }) {
  return (
    <>
      <div
        style={{
          position: "absolute", inset: 0,
          background:
            "conic-gradient(from 210deg," +
            "#e91e8c 0deg, #8e2de2 55deg, #2a52d8 110deg," +
            "#0fa596 165deg, #2e9e3f 210deg, #d99a00 265deg," +
            "#e05a1a 305deg, #e91e8c 360deg)",
        }}
      />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 60% at 70% 74%, rgba(255,210,74,0.55), rgba(255,210,74,0) 62%)", mixBlendMode: "screen" }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(55% 55% at 30% 26%, rgba(120,150,255,0.55), rgba(120,150,255,0) 60%)", mixBlendMode: "screen" }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(46% 46% at 50% 50%, rgba(0,0,0,0.52), rgba(0,0,0,0) 74%)" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <FaceMark logoUrl={logoUrl} name={pressName} size={logoSize} />
      </div>
    </>
  );
}

// ─── Vinyl sizes — no 7" inserts ──────────────────────────────────────
const VINYL_SIZES = [
  { id: "10", label: '10"', note: "EP" },
  { id: "12", label: '12"', note: "LP \u00b7 Standard" },
];

const SIZE_SCALE: Record<string, number> = { "7": 7 / 12, "10": 10 / 12, "12": 1 };

// ─── Insert styles + variants ─────────────────────────────────────────
type InsertVariant = { id: string; label: string; note: string };

type InsertOption = {
  id: (typeof INSERT_STYLE_IDS)[number];
  name: string;
  note: string;
  variants: InsertVariant[];
  sizes?: string[]; // if set, only offered for these record sizes
};

const INSERT_OPTIONS: InsertOption[] = [
  {
    id: "sheet",
    name: "Insert Sheet",
    note: "Full-color flat sheet \u2014 lyrics, credits, liner notes. Printed both sides.",
    variants: [],
  },
  {
    id: "gatefold",
    name: "Gatefold Insert",
    note: "Two-panel fold-out that opens from the center. Printed both sides.",
    variants: [],
  },
  {
    id: "booklet",
    name: "Booklet",
    note: "Stapled multi-page booklet. Room for lyrics, art, and stories.",
    variants: [
      { id: "p4", label: "4-Page", note: "" },
      { id: "p8", label: "8-Page", note: "" },
    ],
  },
  {
    id: "poster",
    name: "Poster",
    note: "Large fold-out poster that ships inside the jacket.",
    variants: [
      { id: "small", label: '18" \u00d7 24"', note: "Folds to fit the jacket." },
      { id: "large", label: '24" \u00d7 36"', note: "Full wall poster \u2014 folds to fit." },
    ],
    sizes: ["12"], // posters only ship with 12" LPs
  },
];

type InsertLook = {
  kind: "sheet" | "gatefold" | "booklet" | "poster";
  posterSize: "small" | "large" | null;
};

function insertLook(style: InsertOption, variantId: string): InsertLook {
  return {
    kind: style.id,
    posterSize: style.id === "poster" ? (variantId === "large" ? "large" : "small") : null,
  };
}

const POSTER_RATIO: Record<"small" | "large", number> = { small: 18 / 24, large: 24 / 36 };
const SS = 321;

// ─── Insert thumbnail (64px tile preview) ────────────────────────────
function InsertThumbnail({
  insert,
  size = 48,
  hovered = false,
  logoUrl,
  pressName,
}: {
  insert: InsertLook;
  size: number;
  hovered?: boolean;
  logoUrl: string | null;
  pressName: string;
}) {
  const isBooklet = insert.kind === "booklet";
  const isPoster = insert.kind === "poster";
  const posterW = isPoster ? Math.round(size * POSTER_RATIO[insert.posterSize ?? "small"]) : size;

  if (insert.kind === "gatefold") {
    return (
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0, perspective: 300 }}>
        <div style={{ position: "absolute", inset: 0, background: "#E8DBCA", overflow: "hidden", border: "1.5px solid #d0c4b0" }}>
          {Array.from({ length: 14 }, (_, i) => (
            <div key={i} style={{ position: "absolute", left: 0, right: 0, top: `${(i + 1) * 6.5}%`, height: 1, background: "rgba(0,0,0,0.035)" }} />
          ))}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 7, fontWeight: 600, color: "rgba(80,60,30,0.32)", letterSpacing: 1.5, textTransform: "uppercase" }}>Interior</span>
          </div>
        </div>
        <div style={{
          position: "absolute", inset: 0,
          overflow: "hidden", transformOrigin: "left center",
          transform: hovered ? "rotateY(-75deg)" : "rotateY(0deg)",
          transition: "transform 0.45s cubic-bezier(0.32, 0.72, 0.28, 1)",
          border: "1.5px solid #333",
          background: "linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)",
          boxShadow: hovered ? "6px 4px 12px rgba(0,0,0,0.25)" : "none",
        }}>
          <RainbowPrintFace logoSize={size * 0.52} logoUrl={logoUrl} pressName={pressName} />
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: "linear-gradient(90deg, rgba(0,0,0,0.45), rgba(0,0,0,0))" }} />
        </div>
      </div>
    );
  }

  if (isBooklet) {
    return (
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0, perspective: 300 }}>
        <div style={{ position: "absolute", inset: 0, background: "#ffffff", border: `1.5px solid ${HAIRLINE}`, overflow: "hidden" }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ position: "absolute", left: "18%", right: "14%", top: `${28 + i * 15}%`, height: 2, borderRadius: 1, background: "#dcdce0" }} />
          ))}
        </div>
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)",
          border: "1.5px solid #333",
          overflow: "hidden",
          transformOrigin: "left center",
          transform: hovered ? "rotateY(-52deg)" : "rotateY(0deg)",
          transition: "transform 0.45s cubic-bezier(0.32, 0.72, 0.28, 1)",
          boxShadow: hovered ? "6px 4px 12px rgba(0,0,0,0.25)" : "none",
        }}>
          <RainbowPrintFace logoSize={size * 0.52} logoUrl={logoUrl} pressName={pressName} />
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: "linear-gradient(90deg, rgba(0,0,0,0.45), rgba(0,0,0,0))" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        position: "relative",
        width: posterW, height: size,
        background: "linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)",
        border: "1.5px solid #333",
        overflow: "hidden",
        transition: "width 0.35s cubic-bezier(0.32, 0.72, 0.28, 1)",
      }}>
        <RainbowPrintFace logoSize={Math.min(posterW, size) * 0.52} logoUrl={logoUrl} pressName={pressName} />
        {isPoster && insert.posterSize === "small" && (
          <>
            <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "rgba(255,255,255,0.14)" }} />
            <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "rgba(0,0,0,0.12)" }} />
          </>
        )}
        {isPoster && insert.posterSize === "large" && (
          <>
            <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "rgba(255,255,255,0.14)" }} />
            <div style={{ position: "absolute", left: 0, right: 0, top: "33.33%", height: 1, background: "rgba(0,0,0,0.12)" }} />
            <div style={{ position: "absolute", left: 0, right: 0, top: "66.66%", height: 1, background: "rgba(0,0,0,0.12)" }} />
          </>
        )}
      </div>
    </div>
  );
}

// ─── InsertStage — large left-panel preview ───────────────────────────
function InsertStage({
  insert,
  sizeId,
  t,
  logoUrl,
  pressName,
}: {
  insert: InsertLook | null;
  sizeId: string;
  t: Theme;
  logoUrl: string | null;
  pressName: string;
}) {
  const [hovered, setHovered] = useState(false);
  const base = Math.round(SS * (SIZE_SCALE[sizeId] ?? 1));

  const isGatefoldLike = insert?.kind === "gatefold";
  useEffect(() => {
    if (!isGatefoldLike) {
      setHovered(false);
      return;
    }
    const id = setTimeout(() => setHovered(true), 600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insert?.kind]);

  if (!insert) {
    return (
      <div style={{
        width: SS, height: SS, flexShrink: 0,
        border: `1.5px dashed ${t.emptyBorder}`, borderRadius: 4,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: t.faint,
      }}>
        <svg width={36} height={36} viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <rect x={4} y={4} width={28} height={28} rx={1} />
          <path d="M14 4 L14 32" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Select an insert style</span>
      </div>
    );
  }

  const isBooklet = insert.kind === "booklet";
  const isPoster = insert.kind === "poster";
  const isGatefold = insert.kind === "gatefold";

  const stageW = isPoster ? Math.round(base * POSTER_RATIO[insert.posterSize ?? "small"]) : base;

  if (isBooklet) {
    return <BookletStage stage={base} logoUrl={logoUrl} pressName={pressName} />;
  }

  if (isGatefold) {
    const tilt = hovered
      ? "perspective(1200px) rotateY(0deg) rotateX(0deg)"
      : "perspective(1200px) rotateY(-8deg) rotateX(2deg)";
    return (
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ position: "relative", display: "inline-block" }}
      >
        <div style={{
          position: "absolute", bottom: -14, left: "50%", transform: "translateX(-50%)",
          width: base * 0.88, height: 22, borderRadius: "50%",
          background: "radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.07) 55%, transparent 80%)",
          pointerEvents: "none", zIndex: 0,
        }} />

        <div style={{ position: "relative", zIndex: 1, width: SS, height: SS, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            position: "relative", width: base, height: base, flexShrink: 0,
            transform: tilt,
            transition: "transform 600ms cubic-bezier(0.32, 0.72, 0.28, 1)",
            transformStyle: "preserve-3d",
          }}>
            <div style={{ position: "absolute", inset: 0, perspective: "1200px", perspectiveOrigin: "50% 50%", overflow: "visible" }}>
              <div style={{
                position: "absolute",
                top: hovered ? 0 : 5, left: hovered ? 0 : -5,
                width: base, height: base,
                overflow: "hidden", zIndex: 1,
                background: "#E8DBCA",
                border: "1px solid #d0c4b0",
                transition: "top 600ms cubic-bezier(0.32, 0.72, 0.28, 1), left 600ms cubic-bezier(0.32, 0.72, 0.28, 1)",
              }}>
                {Array.from({ length: 14 }, (_, i) => (
                  <div key={i} style={{ position: "absolute", left: 0, right: 0, top: `${(i + 1) * 6.5}%`, height: 1, background: "rgba(0,0,0,0.035)" }} />
                ))}
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(80,60,30,0.28)", letterSpacing: 2.5, textTransform: "uppercase" }}>Interior</span>
                </div>
              </div>
              <div style={{
                position: "absolute", top: 0, left: 0,
                width: base, height: base,
                transformOrigin: "left center",
                transform: hovered ? "rotateY(-75deg)" : "rotateY(0deg)",
                transition: "transform 600ms cubic-bezier(0.32, 0.72, 0.28, 1)",
                willChange: "transform",
                zIndex: 2, overflow: "hidden",
                border: "1px solid #222",
                background: "linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)",
              }}>
                <RainbowPrintFace logoSize={base * 0.42} logoUrl={logoUrl} pressName={pressName} />
              </div>
              <div style={{
                position: "absolute", top: 0, bottom: 0, left: 0, width: 2,
                background: "rgba(0,0,0,0.40)", zIndex: 3, pointerEvents: "none",
                opacity: hovered ? 1 : 0, transition: "opacity 300ms ease 150ms",
              }} />
              {hovered && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(90deg, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0) 60%)",
                  zIndex: 1, pointerEvents: "none",
                }} />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div style={{
        position: "absolute", bottom: -14, left: "50%", transform: "translateX(-50%)",
        width: stageW * 0.75, height: 20, borderRadius: "50%",
        background: "radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.07) 55%, transparent 80%)",
        pointerEvents: "none", zIndex: 0,
        transition: "width 0.45s cubic-bezier(0.32, 0.72, 0.28, 1)",
      }} />

      <div style={{ position: "relative", zIndex: 1, width: SS, height: SS, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          position: "relative",
          width: stageW, height: base, flexShrink: 0,
          background: "linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)",
          border: "1px solid #222",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
          transition: "width 0.45s cubic-bezier(0.32, 0.72, 0.28, 1), height 0.45s cubic-bezier(0.32, 0.72, 0.28, 1)",
        }}>
          <RainbowPrintFace logoSize={Math.min(stageW, base) * 0.42} logoUrl={logoUrl} pressName={pressName} />

          {isPoster && insert.posterSize === "small" && (
            <>
              <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "rgba(255,255,255,0.14)" }} />
              <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "rgba(0,0,0,0.12)" }} />
            </>
          )}
          {isPoster && insert.posterSize === "large" && (
            <>
              <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "rgba(255,255,255,0.14)" }} />
              <div style={{ position: "absolute", top: 0, bottom: 0, left: "calc(50% + 1px)", width: 2, background: "linear-gradient(90deg, rgba(0,0,0,0.12), rgba(0,0,0,0))" }} />
              <div style={{ position: "absolute", left: 0, right: 0, top: "33.33%", height: 1, background: "rgba(0,0,0,0.12)" }} />
              <div style={{ position: "absolute", left: 0, right: 0, top: "66.66%", height: 1, background: "rgba(0,0,0,0.12)" }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── BookletStage — opens like a book on hover ───────────────────────
function BookletStage({ stage = SS, logoUrl, pressName }: { stage?: number; logoUrl: string | null; pressName: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "relative", display: "inline-block", cursor: "pointer" }}
    >
      <div style={{
        position: "absolute", bottom: -14, left: "50%", transform: "translateX(-50%)",
        width: stage * 0.75, height: 20, borderRadius: "50%",
        background: "radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.07) 55%, transparent 80%)",
        pointerEvents: "none", zIndex: 0,
      }} />
      <div style={{ position: "relative", zIndex: 1, width: SS, height: SS, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: stage, height: stage, position: "relative", perspective: 1100 }}>
          <div style={{ position: "absolute", inset: 0, background: "#ffffff", border: `1px solid ${HAIRLINE}`, overflow: "hidden" }}>
            <div style={{ position: "absolute", left: "16%", top: "14%", width: "38%", height: 8, borderRadius: 2, background: "#c9c9cf" }} />
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} style={{ position: "absolute", left: "16%", right: `${14 + (i % 3) * 9}%`, top: `${28 + i * 7}%`, height: 4, borderRadius: 2, background: "#e3e3e8" }} />
            ))}
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 22, background: "linear-gradient(90deg, rgba(0,0,0,0.14), rgba(0,0,0,0))" }} />
            <div style={{ position: "absolute", left: 8, top: "30%", width: 2.5, height: 16, background: "#9a9aa0", borderRadius: 1 }} />
            <div style={{ position: "absolute", left: 8, bottom: "30%", width: 2.5, height: 16, background: "#9a9aa0", borderRadius: 1 }} />
          </div>
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)",
            border: "1px solid #222",
            overflow: "hidden",
            transformOrigin: "left center",
            transform: hovered ? "rotateY(-58deg)" : "rotateY(0deg)",
            transition: "transform 0.6s cubic-bezier(0.32, 0.72, 0.28, 1)",
            boxShadow: hovered ? "18px 10px 36px rgba(0,0,0,0.35)" : "0 8px 32px rgba(0,0,0,0.35)",
          }}>
            <RainbowPrintFace logoSize={stage * 0.42} logoUrl={logoUrl} pressName={pressName} />
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 18, background: "linear-gradient(90deg, rgba(0,0,0,0.5), rgba(0,0,0,0))" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Insert tile ──────────────────────────────────────────────────────
// div[role=button] — the variant pills inside are real <button>s, and
// nesting buttons is invalid HTML (hydration error).
function InsertTile({
  insert,
  active,
  offered,
  variantId,
  onSelect,
  onVariantSelect,
  t,
  logoUrl,
  pressName,
}: {
  insert: InsertOption;
  active: boolean;
  offered: boolean;
  variantId: string;
  onSelect: () => void;
  onVariantSelect: (id: string) => void;
  t: Theme;
  logoUrl: string | null;
  pressName: string;
}) {
  const selectedVariant = insert.variants.find((v) => v.id === variantId);
  const [hovered, setHovered] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`insert-${insert.id}`}
      className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{
        width: "100%", padding: "13px 16px", display: "flex", alignItems: "center", gap: 16,
        background: t.card,
        border: active ? `2px solid ${t.blue}` : `1px ${offered ? "solid" : "dashed"} ${t.hairline}`,
        opacity: offered ? 1 : 0.55,
      }}
    >
      <InsertThumbnail insert={insertLook(insert, variantId)} size={64} hovered={hovered} logoUrl={logoUrl} pressName={pressName} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? t.blue : t.ink }}>
          {insert.name}
        </div>
        <div className="text-[12px]" style={{ marginTop: 3, color: t.faint, lineHeight: 1.4 }}>
          {insert.note}
        </div>
        {!offered && <NotOfferedChip color={t.subink} />}
        {active && insert.variants.length > 0 && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
            <div style={{ display: "inline-flex", gap: 6, padding: 3, borderRadius: 999, background: t.soft, border: `1px solid ${t.hairline}` }}>
              {insert.variants.map((v) => {
                const vActive = v.id === variantId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onVariantSelect(v.id)}
                    aria-pressed={vActive}
                    data-testid={`insert-variant-${insert.id}-${v.id}`}
                    className="transition-all focus:outline-none"
                    style={{
                      padding: "5px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
                      color: vActive ? t.ink : t.pillInactive,
                      background: vActive ? t.pillActive : "transparent",
                      boxShadow: vActive ? t.pillShadow : "none",
                      border: "none", cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
            {selectedVariant && selectedVariant.note && (
              <div className="text-[11.5px]" style={{ marginTop: 8, color: t.faint, lineHeight: 1.4 }}>
                {selectedVariant.note}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Headings ─────────────────────────────────────────────────────────
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

// ─── Component ───────────────────────────────────────────────────────
export function PressInsertsComponent({
  payload,
  canEdit,
  save,
  saving,
}: {
  payload: PressComponentsPayload;
  canEdit: boolean;
  save: (config: InsertsComponentConfig) => void;
  saving: boolean;
}) {
  const dark = useAdminDark();
  const t = THEMES[dark ? "dark" : "light"];
  const mt = menuTheme(t, dark);
  const press = payload.press;
  const logoUrl = press.labelLogoUrl;

  const [offer, setOffer] = useState<OfferState>(() => offerStateFromConfig(INSERT_STYLE_IDS, payload.inserts?.options));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setOffer(offerStateFromConfig(INSERT_STYLE_IDS, payload.inserts?.options));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [press.id]);

  const commit = (next: OfferState) => {
    setOffer(next);
    setDirty(true);
    save(offerConfigFromState(INSERT_STYLE_IDS, next));
  };
  const toggleOffered = (id: string) => {
    if (!canEdit) return;
    const row = offer[id] ?? { offered: true, templateUrl: null };
    commit({ ...offer, [id]: { ...row, offered: !row.offered } });
  };
  const setTemplateUrl = (id: string, url: string) => {
    if (!canEdit) return;
    const row = offer[id] ?? { offered: true, templateUrl: null };
    commit({ ...offer, [id]: { ...row, templateUrl: url } });
  };

  // Selection state (preview only — not persisted).
  const [selectedInsertId, setSelectedInsertId] = useState<string | null>("sheet");
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [selectedSizeId, setSelectedSizeId] = useState<string>("12");

  // Styles offered for the current record size (no posters below 12").
  const visibleOptions = INSERT_OPTIONS.filter((o) => !o.sizes || o.sizes.includes(selectedSizeId));

  const insertType = visibleOptions.find((s) => s.id === selectedInsertId) ?? null;
  const selectedVariant = insertType?.variants.find((v) => v.id === selectedVariantId) ?? null;
  const look = insertType ? insertLook(insertType, selectedVariantId) : null;
  const offeredCount = visibleOptions.filter((o) => offer[o.id]?.offered).length;

  const selectInsert = (id: string) => {
    setSelectedInsertId(id);
    const opt = INSERT_OPTIONS.find((s) => s.id === id);
    setSelectedVariantId(opt?.variants[0]?.id ?? "");
  };

  const selectSize = (id: string) => {
    setSelectedSizeId(id);
    // If the current style isn't offered for this size, fall back to the sheet.
    const current = INSERT_OPTIONS.find((s) => s.id === selectedInsertId);
    if (current?.sizes && !current.sizes.includes(id)) selectInsert("sheet");
  };

  return (
    <div className="font-sans" style={{ backgroundColor: t.canvas, color: t.ink }}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 96 }}>
        {/* Quiet opening header */}
        <div className="min-w-0">
          <PageHeading lead="Inserts." rest="What ships inside." t={t} />
          <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: t.subink }}>
            Pick the insert styles you offer — lyrics, credits, art, posters. Artists choose from these when they design a record with {press.name}.
          </p>
          {saving && (
            <p className="text-[12px]" style={{ marginTop: 8, color: t.faint }} data-testid="inserts-saving">
              Saving…
            </p>
          )}
        </div>

        {/* Split: sticky insert stage · pickers */}
        <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 520px", gap: 56, alignItems: "start" }}>
          {/* LEFT — sticky insert preview */}
          <div className="sticky" style={{ top: 88 }}>
            <div className="flex flex-col items-center">
              <InsertStage insert={look} sizeId={selectedSizeId} t={t} logoUrl={logoUrl} pressName={press.name} />
              {insertType && (
                <>
                  <div className="text-[13px] font-semibold" style={{ marginTop: 28, color: t.ink }}>
                    {VINYL_SIZES.find((s) => s.id === selectedSizeId)?.label} {insertType.name}
                    {selectedVariant && (
                      <span style={{ color: t.faint }}> · {selectedVariant.label}</span>
                    )}
                  </div>
                  <p className="text-[12px] text-center" style={{ marginTop: 6, color: t.faint, maxWidth: 280 }}>
                    {insertType.note}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* RIGHT — size + style pickers */}
          <div className="min-w-0">
            {/* Size */}
            <StepHeading lead="Pick a size." rest="The record sets the fit." t={t} />
            <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
              The record size determines which inserts fit the jacket.
            </p>
            <div style={{ marginTop: 18, display: "flex", gap: 12 }}>
              {VINYL_SIZES.map((s) => {
                const active = s.id === selectedSizeId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => selectSize(s.id)}
                    aria-pressed={active}
                    data-testid={`size-${s.id}`}
                    className="rounded-2xl transition-all hover:-translate-y-px focus:outline-none"
                    style={{ flex: 1, padding: "16px 12px", background: t.card, border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}`, textAlign: "center", cursor: "pointer" }}
                  >
                    <div className="text-[17px] font-semibold" style={{ color: active ? t.blue : t.ink }}>{s.label}</div>
                    <div className="text-[11px]" style={{ marginTop: 3, color: t.faint }}>{s.note}</div>
                  </button>
                );
              })}
            </div>

            {/* Style */}
            <div style={{ marginTop: 36 }}>
              <StepHeading lead="Pick a style." rest="What the artwork ships on." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }} data-testid="inserts-availability">
                {offeredCount} of {visibleOptions.length} styles available from {press.name}.
              </p>
            </div>
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
              {visibleOptions.map((s) => (
                <div key={s.id} className="group/offer relative">
                  <InsertTile
                    insert={s}
                    active={s.id === selectedInsertId}
                    offered={!!offer[s.id]?.offered}
                    variantId={s.id === selectedInsertId ? selectedVariantId : (s.variants[0]?.id ?? "")}
                    onSelect={() => selectInsert(s.id)}
                    onVariantSelect={setSelectedVariantId}
                    t={t}
                    logoUrl={logoUrl}
                    pressName={press.name}
                  />
                  {canEdit && (
                    <OptionOfferMenu
                      name={s.name}
                      offered={!!offer[s.id]?.offered}
                      templateUrl={offer[s.id]?.templateUrl ?? null}
                      onToggleOffered={() => toggleOffered(s.id)}
                      onTemplateUrl={(url) => setTemplateUrl(s.id, url)}
                      t={mt}
                      testId={`insert-offer-${s.id}`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PressInsertsComponent;
