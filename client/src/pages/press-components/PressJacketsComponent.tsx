// Press Catalog › Components › Jackets — production page (Task #3052),
// ported from handoff/press-components/ArtistChooseJacket.tsx. Renders ONLY
// the page body inside OperatorShell (the mock's inlined shell/rail/header
// is stripped); theme comes from useAdminDark(); press identity rides on the
// payload (labelLogoUrl reads white already — no invert filter; initials
// fallback when absent, NEVER Memphis's mark).
// Persistence: offered/template per JACKET STYLE id (global across sizes),
// saved as one whole config on every change (Stickers pattern).
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { resolvePressMarkLogo, type PressComponentsPayload } from "./usePressComponents";
import { WhiteMarkGlyph } from "./PressMarkGlyph";
import { JACKET_STYLE_IDS, type JacketsComponentConfig } from "@shared/pressComponents";
import { useAdminDark } from "@/lib/adminAppearance";
import {
  OptionOfferMenu,
  NotOfferedChip,
  offerStateFromConfig,
  offerConfigFromState,
  type OfferState,
  type OfferMenuTheme,
} from "./packagingOffer";

// ─── Theme (copied verbatim from the mock) ───────────────────────────
type Theme = {
  blue: string;
  ink: string;
  subink: string;
  faint: string;
  hairline: string;
  canvas: string;
  card: string;
  soft: string;
  pillShadow: string;
  pillIdle: string;
  headerBg: string;
  dashedBorder: string;
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
    pillShadow: "0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)",
    pillIdle: "#8e8e93",
    headerBg: "rgba(255,255,255,0.72)",
    dashedBorder: "#d0d0d5",
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
    pillShadow: "0 1px 2px rgba(0,0,0,0.4)",
    pillIdle: "#98989d",
    headerBg: "rgba(22,22,23,0.72)",
    dashedBorder: "rgba(255,255,255,0.22)",
  },
};

function menuTheme(t: Theme, dark: boolean): OfferMenuTheme {
  return {
    card: t.card,
    hairline: t.hairline,
    ink: t.ink,
    subink: t.subink,
    faint: t.faint,
    popShadow: dark ? "0 12px 40px rgba(0,0,0,0.5)" : "0 12px 40px rgba(0,0,0,0.16)",
    hoverWash: dark ? "hover:bg-white/5" : "hover:bg-black/[0.03]",
  };
}

// ─── Press mark on the dark jacket faces ─────────────────────────────
// labelLogoUrl is assumed already white-reading (same as the Labels page);
// when absent, white initials stand in.
function FaceMark({
  logoUrl,
  name,
  size,
  opacity = 0.92,
}: {
  logoUrl: string | null;
  name: string;
  size: number;
  opacity?: number;
}) {
  if (logoUrl) {
    return <WhiteMarkGlyph logoUrl={logoUrl} size={size} opacity={opacity} />;
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
        border: "1px solid rgba(255,255,255,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(255,255,255,0.85)",
        fontWeight: 700,
        fontSize: Math.max(9, size * 0.3),
        letterSpacing: 0.5,
        opacity,
      }}
    >
      {initials || "\u2022"}
    </div>
  );
}

// ─── Jacket options ───────────────────────────────────────────────────
type JacketVariant = { id: string; label: string; note: string };

type JacketOption = {
  id: string;
  name: string;
  note: string;
  gatefoldPanels: 0 | 1 | 2;
  printed: boolean;
  pvc?: boolean;
  variants: JacketVariant[];
};

const V_STANDARD: JacketVariant = { id: "standard", label: "Standard", note: "" };
const V_WIDESPINE: JacketVariant = { id: "widespine", label: "Widespine", note: "Wider spine \u2014 fits 2LP sets and heavyweight pressings." };
const V_TIPON: JacketVariant = { id: "tipon", label: "Old-Style Tip-On", note: "Artwork printed on textured paper, wrapped and glued over the board \u2014 the vintage look." };

const VINYL_SIZES = [
  { id: "7", label: '7"', note: "Single" },
  { id: "10", label: '10"', note: "EP" },
  { id: "12", label: '12"', note: "LP \u00b7 Standard" },
];

// Jacket styles per record size — names follow the catalog vocabulary
// (Full Color Sleeve / Double Gatefold / Triple Gatefold / Discobag /
// PVC Deluxe Bag). Style ids are the persisted vocabulary in
// JACKET_STYLE_IDS; offered state applies to the style across sizes.
const JACKET_CATALOG: Record<string, JacketOption[]> = {
  "7": [
    { id: "single", name: "Full Color Sleeve", note: "Standard printed jacket. Artist supplies artwork.", gatefoldPanels: 0, printed: true, variants: [
      { id: "nospine", label: "No Spine", note: "Flat pocket \u2014 the classic 45 sleeve." },
      { id: "spine3", label: "3mm Spine", note: "Adds a slim printable spine." },
    ] },
    { id: "gatefold", name: "Double Gatefold", note: "Two-panel fold-out. Extra interior art space.", gatefoldPanels: 1, printed: true, variants: [V_STANDARD] },
  ],
  "10": [
    { id: "single", name: "Full Color Sleeve", note: "Standard printed jacket. Artist supplies artwork.", gatefoldPanels: 0, printed: true, variants: [V_STANDARD, V_WIDESPINE] },
    { id: "gatefold", name: "Double Gatefold", note: "Two-panel fold-out. Extra interior art space.", gatefoldPanels: 1, printed: true, variants: [V_STANDARD] },
  ],
  "12": [
    { id: "single", name: "Full Color Sleeve", note: "Standard printed jacket. Artist supplies artwork.", gatefoldPanels: 0, printed: true, variants: [V_STANDARD, V_WIDESPINE, V_TIPON] },
    { id: "gatefold", name: "Double Gatefold", note: "Two-panel fold-out. Extra interior art space.", gatefoldPanels: 1, printed: true, variants: [V_STANDARD, V_TIPON] },
    { id: "trifold", name: "Triple Gatefold", note: "Three-panel fold-out. Maximum interior canvas.", gatefoldPanels: 2, printed: true, variants: [V_STANDARD] },
    { id: "discobag", name: "Discobag", note: "Plain inner sleeve with die-cut center window.", gatefoldPanels: 0, printed: false, variants: [V_STANDARD] },
    { id: "pvc", name: "PVC Deluxe Bag", note: "Heavy clear PVC outer bag over the printed sleeve \u2014 deluxe protection.", gatefoldPanels: 0, printed: true, pvc: true, variants: [V_STANDARD] },
  ],
};

const STYLE_NAMES: Record<string, string> = {
  single: "Full Color Sleeve",
  gatefold: "Double Gatefold",
  trifold: "Triple Gatefold",
  discobag: "Discobag",
  pvc: "PVC Deluxe Bag",
};

const GATEFOLD_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const JS_BASE = 321;
const THUMB = 64;
const THUMB_LOGO = 0.52;

// PVC overlay — glossy translucent bag sheen shared by thumbnail + stage.
function PvcOverlay() {
  return (
    <>
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "linear-gradient(115deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.08) 40%, rgba(255,255,255,0.02) 55%, rgba(255,255,255,0.22) 82%, rgba(255,255,255,0.10) 100%)",
      }} />
      {/* Diagonal glare stripe */}
      <div style={{
        position: "absolute", top: "-20%", bottom: "-20%", left: "18%", width: "14%",
        transform: "rotate(18deg)", pointerEvents: "none",
        background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0) 100%)",
        filter: "blur(1px)",
      }} />
      {/* Top weld/flap seam */}
      <div style={{ position: "absolute", top: "7%", left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.30)", pointerEvents: "none" }} />
      {/* Bag edge */}
      <div style={{ position: "absolute", inset: 0, border: "1.5px solid rgba(255,255,255,0.35)", pointerEvents: "none" }} />
    </>
  );
}

// ─── Jacket tile thumbnail ─────────────────────────────────────────────
function JacketThumbnail({
  jacket,
  size = THUMB,
  logoUrl,
  pressName,
}: {
  jacket: JacketOption;
  size?: number;
  logoUrl: string | null;
  pressName: string;
}) {
  if (jacket.id === "discobag") {
    const hole = size * 0.33;
    return (
      <div style={{ width: size, height: size, position: "relative", overflow: "hidden", background: "#0a0a0a", border: "1.5px solid #222", flexShrink: 0 }}>
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: hole, height: hole, borderRadius: "50%", overflow: "hidden",
          background: "radial-gradient(circle at 42% 36%, #ffffff 0%, #f2f2f2 60%, #e8e8e8 100%)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 3px rgba(0,0,0,0.30)",
        }}>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: Math.max(2, hole * 0.1), height: Math.max(2, hole * 0.1), borderRadius: "50%", background: "#0a0a0a" }} />
        </div>
      </div>
    );
  }

  const panels = jacket.gatefoldPanels;
  return (
    <div style={{ width: size, height: size, position: "relative", overflow: "hidden", background: "linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)", boxShadow: "0 3px 10px rgba(0,0,0,0.40)", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.12)" }} />
      {panels >= 1 && <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "rgba(255,255,255,0.14)", transform: "translateX(-50%)" }} />}
      {panels >= 2 && (
        <>
          <div style={{ position: "absolute", top: 0, bottom: 0, left: "33.3%", width: 1, background: "rgba(255,255,255,0.12)" }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, left: "66.6%", width: 1, background: "rgba(255,255,255,0.12)" }} />
        </>
      )}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <FaceMark logoUrl={logoUrl} name={pressName} size={size * THUMB_LOGO} opacity={0.9} />
      </div>
      {jacket.pvc && <PvcOverlay />}
    </div>
  );
}

// ─── JacketStage — large left-panel jacket preview ────────────────────
function JacketStage({
  jacketType,
  widespine = false,
  tipOn = false,
  t,
  logoUrl,
  pressName,
}: {
  jacketType: JacketOption | null;
  widespine?: boolean;
  tipOn?: boolean;
  t: Theme;
  logoUrl: string | null;
  pressName: string;
}) {
  const JS = JS_BASE;
  const SPINE_W = widespine ? 20 : 10;
  const panels = jacketType?.gatefoldPanels ?? 0;
  const isGatefold = panels > 0;
  const [open, setOpen] = useState(false);
  const [showVinyl, setShowVinyl] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isDiscobag = jacketType?.id === "discobag";

  const HOLE_D = JS * (368 / 1104);
  const HOLE_R = HOLE_D / 2;

  useEffect(() => {
    if (isGatefold && !tipOn) {
      const timer = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(timer);
    }
    setOpen(false);
    return undefined;
  }, [jacketType?.id, isGatefold, tipOn]);

  useEffect(() => {
    if (!isDiscobag) setShowVinyl(false);
  }, [isDiscobag]);

  function PrintedFace() {
    const P = JS * 0.16;
    return (
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "50%", background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)" }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FaceMark logoUrl={logoUrl} name={pressName} size={JS * 0.52} />
        </div>
        {tipOn && (
          <div style={{ position: "absolute", top: 0, right: 0, width: P, height: P, pointerEvents: "none" }}>
            <div style={{ position: "absolute", inset: 0, clipPath: "polygon(0 0, 100% 0, 100% 100%)", background: "linear-gradient(135deg, #c4b294 0%, #a8946f 100%)", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.25)" }} />
            <div style={{ position: "absolute", inset: 0, clipPath: "polygon(0 0, 100% 100%, 0 100%)", background: "linear-gradient(315deg, #ffffff 0%, #f3ecdf 45%, #ddd2bd 100%)", filter: "drop-shadow(-2px 2px 3px rgba(0,0,0,0.35))", borderRadius: "0 0 0 4px" }} />
            <div style={{ position: "absolute", top: 0, left: 0, width: Math.SQRT2 * P, height: 1.5, transformOrigin: "0 0", transform: "rotate(45deg)", background: "rgba(255,255,255,0.55)" }} />
          </div>
        )}
        {jacketType?.pvc && <PvcOverlay />}
      </div>
    );
  }

  function KraftFace() {
    return (
      <div style={{ position: "absolute", inset: 0, background: "#E8DBCA", overflow: "hidden" }}>
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} style={{ position: "absolute", left: 0, right: 0, top: `${(i + 1) * 6.5}%`, height: 1, background: "rgba(0,0,0,0.035)" }} />
        ))}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(80,60,30,0.28)", letterSpacing: 2.5, textTransform: "uppercase" }}>Interior</span>
        </div>
      </div>
    );
  }

  function DiscobagFace() {
    const holeMask = `radial-gradient(circle ${HOLE_R}px at 50% 50%, transparent ${HOLE_R}px, black ${HOLE_R + 0.5}px)`;
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        {showVinyl && (
          <div style={{ position: "absolute", inset: 0, background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              width: JS * 0.86, height: JS * 0.86, borderRadius: "50%",
              background: "radial-gradient(circle at 34% 30%, #1a1a1a 0%, #050505 60%)",
              flexShrink: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {[0.82, 0.68, 0.54, 0.4].map((r) => (
                <div key={r} style={{ position: "absolute", width: `${r * 100}%`, height: `${r * 100}%`, borderRadius: "50%", border: "0.5px solid rgba(255,255,255,0.04)", pointerEvents: "none" }} />
              ))}
              <div style={{ width: HOLE_D * 0.96, height: HOLE_D * 0.96, borderRadius: "50%", background: "#ffffff", flexShrink: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* Black-reading label mark on white stock — logo as-is */}
                {logoUrl ? (
                  <img src={logoUrl} alt="" aria-hidden style={{ width: HOLE_D * 0.56, height: HOLE_D * 0.56, objectFit: "contain", opacity: 0.78 }} />
                ) : (
                  <span style={{ color: "#6e6e73", fontWeight: 700, fontSize: HOLE_D * 0.16 }}>
                    {(pressName || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
                  </span>
                )}
                <div style={{ position: "absolute", width: HOLE_D * 0.075, height: HOLE_D * 0.075, borderRadius: "50%", background: "#f5f5f7" }} />
              </div>
            </div>
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, background: "#0a0a0a", WebkitMaskImage: holeMask, maskImage: holeMask }}>
          <div style={{ position: "absolute", top: JS * 0.1, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#444", letterSpacing: 2, textTransform: "uppercase" }}>Discobag</span>
          </div>
        </div>
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: HOLE_D, height: HOLE_D, borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.10)", boxShadow: "inset 0 1px 4px rgba(0,0,0,0.50)", pointerEvents: "none",
        }} />
      </div>
    );
  }

  function FrontFace() {
    if (jacketType?.id === "discobag") return <DiscobagFace />;
    return <PrintedFace />;
  }

  const tilt = (!isGatefold || !open)
    ? "perspective(1200px) rotateY(-8deg) rotateX(2deg)"
    : "perspective(1200px) rotateY(0deg) rotateX(0deg)";

  if (jacketType === null) {
    return (
      <div style={{
        width: JS, height: JS, flexShrink: 0,
        border: `1.5px dashed ${t.dashedBorder}`, borderRadius: 4,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: t.faint,
      }}>
        <svg width={36} height={36} viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <rect x={4} y={4} width={28} height={28} rx={1} />
          <line x1={16} y1={4} x2={16} y2={32} />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Select a jacket style</span>
      </div>
    );
  }

  const openGatefold = () => { if (isGatefold) { clearTimeout(closeTimer.current); setOpen(true); } };
  const scheduleClose = () => { if (isGatefold) { closeTimer.current = setTimeout(() => setOpen(false), 200); } };

  return (
    <div style={{ position: "relative", display: "inline-block" }} onMouseEnter={openGatefold} onMouseLeave={scheduleClose}>
      <div style={{
        position: "relative", width: JS, height: JS, flexShrink: 0, zIndex: 2,
        transform: tilt, transition: `transform 600ms ${GATEFOLD_EASE}`, transformStyle: "preserve-3d",
      }}>
        <div style={{ position: "absolute", inset: 0, perspective: "1200px", perspectiveOrigin: "50% 50%", overflow: "visible" }}>
          {panels === 0 && (
            <div style={{ position: "absolute", inset: 0 }}>
              <FrontFace />
            </div>
          )}

          {panels === 1 && (
            <>
              <div style={{
                position: "absolute", top: open ? 0 : 5, left: open ? 0 : -5,
                width: JS, height: JS, overflow: "hidden", zIndex: 1,
                transition: `top 600ms ${GATEFOLD_EASE}, left 600ms ${GATEFOLD_EASE}`,
              }}>
                <KraftFace />
              </div>
              <div
                onMouseEnter={openGatefold}
                onMouseLeave={scheduleClose}
                style={{
                  position: "absolute", top: 0, left: 0, width: JS, height: JS,
                  transformOrigin: "left center",
                  transform: open ? "rotateY(-75deg)" : "rotateY(0deg)",
                  transition: `transform 600ms ${GATEFOLD_EASE}`,
                  willChange: "transform", zIndex: 2, overflow: "hidden",
                }}>
                <FrontFace />
              </div>
              <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 2, background: "rgba(0,0,0,0.40)", zIndex: 3, pointerEvents: "none", opacity: open ? 1 : 0, transition: "opacity 300ms ease 150ms" }} />
              {open && (
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0) 60%)", zIndex: 0, pointerEvents: "none" }} />
              )}
            </>
          )}

          {panels === 2 && (
            <>
              {[8, 4].map((offset, i) => (
                <div key={i} style={{
                  position: "absolute", top: offset, left: -offset, width: JS, height: JS,
                  overflow: "hidden", zIndex: i, opacity: open ? 0 : 1,
                  transition: "opacity 150ms ease", pointerEvents: "none",
                }}>
                  <PrintedFace />
                  <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${0.14 + i * 0.08})` }} />
                </div>
              ))}
              <div style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 1 }}>
                <KraftFace />
              </div>
              <div
                onMouseEnter={openGatefold}
                onMouseLeave={scheduleClose}
                style={{
                  position: "absolute", top: 0, left: 0, width: JS, height: JS,
                  transformOrigin: "right center",
                  transform: open ? "rotateY(75deg)" : "rotateY(0deg)",
                  transition: `transform 600ms ${GATEFOLD_EASE}`,
                  willChange: "transform", zIndex: 2, overflow: "hidden",
                }}>
                <FrontFace />
              </div>
              <div
                onMouseEnter={openGatefold}
                onMouseLeave={scheduleClose}
                style={{
                  position: "absolute", top: 0, left: 0, width: JS, height: JS,
                  transformOrigin: "left center",
                  transform: open ? "rotateY(-75deg)" : "rotateY(0deg)",
                  transition: `transform 600ms ${GATEFOLD_EASE}`,
                  willChange: "transform", zIndex: 3, overflow: "hidden",
                }}>
                <FrontFace />
              </div>
              <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 2, background: "rgba(0,0,0,0.40)", zIndex: 4, pointerEvents: "none", opacity: open ? 1 : 0, transition: "opacity 300ms ease 150ms" }} />
              <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 2, background: "rgba(0,0,0,0.40)", zIndex: 4, pointerEvents: "none", opacity: open ? 1 : 0, transition: "opacity 300ms ease 150ms" }} />
            </>
          )}
        </div>

        {!open && (
          <div style={{
            position: "absolute", top: 0, right: -SPINE_W, bottom: 0, width: SPINE_W,
            background: "linear-gradient(90deg, #0a0a10 0%, #1a1a22 100%)",
            transform: "rotateY(90deg)", transformOrigin: "left center", pointerEvents: "none",
          }} />
        )}
      </div>

      <div style={{
        position: "absolute", bottom: -14, left: "50%", transform: "translateX(-50%)",
        width: JS * 0.88, height: 22, borderRadius: "50%",
        background: "radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.10) 55%, transparent 80%)",
        pointerEvents: "none", zIndex: 0, willChange: "width", transition: `width 600ms ${GATEFOLD_EASE}`,
      }} />

      {isDiscobag && (
        <button
          type="button"
          onClick={() => setShowVinyl((v) => !v)}
          aria-label={showVinyl ? "Hide vinyl inside" : "Show vinyl inside"}
          style={{
            display: "flex", alignItems: "center", gap: 6, marginTop: 14,
            padding: "5px 12px 5px 10px", borderRadius: 999,
            background: t.headerBg, backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
            border: `1px solid ${t.hairline}`, boxShadow: t.pillShadow, cursor: "pointer",
            fontSize: 12, fontWeight: 500, color: t.subink, transition: "color 120ms ease, background 120ms ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = t.ink; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = t.subink; }}
        >
          {showVinyl ? <EyeOff style={{ width: 13, height: 13, flexShrink: 0 }} /> : <Eye style={{ width: 13, height: 13, flexShrink: 0 }} />}
          {showVinyl ? "Hide vinyl" : "Vinyl inside"}
        </button>
      )}
    </div>
  );
}

// ─── Jacket option tile ───────────────────────────────────────────────
// div[role=button] — the variant pills inside are real <button>s, and
// nesting buttons is invalid HTML (hydration error).
function JacketTile({
  jacket,
  active,
  offered,
  variantId,
  onSelect,
  onVariantSelect,
  t,
  logoUrl,
  pressName,
}: {
  jacket: JacketOption;
  active: boolean;
  offered: boolean;
  variantId: string;
  onSelect: () => void;
  onVariantSelect: (id: string) => void;
  t: Theme;
  logoUrl: string | null;
  pressName: string;
}) {
  const [hovered, setHovered] = useState(false);
  const showFold = hovered && jacket.gatefoldPanels > 0;
  const hasVariants = jacket.variants.length > 1;
  const selectedVariant = jacket.variants.find((v) => v.id === variantId);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`jacket-${jacket.id}`}
      className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{
        width: "100%", padding: "13px 16px", display: "flex", alignItems: "center", gap: 16,
        backgroundColor: t.card,
        border: active ? `2px solid ${t.blue}` : `1px ${offered ? "solid" : "dashed"} ${t.hairline}`,
        opacity: offered ? 1 : 0.55,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ flexShrink: 0, display: "flex", perspective: "300px", perspectiveOrigin: "50% 50%" }}>
        {jacket.gatefoldPanels === 0 ? (
          <JacketThumbnail jacket={jacket} size={THUMB} logoUrl={logoUrl} pressName={pressName} />
        ) : jacket.gatefoldPanels === 1 ? (
          <div style={{ position: "relative", width: THUMB, height: THUMB, perspective: "300px" }}>
            <div style={{ position: "absolute", inset: 0, background: "#E8DBCA", overflow: "hidden", zIndex: 1 }}>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 7, fontWeight: 600, color: "rgba(80,60,30,0.32)", letterSpacing: 1.5, textTransform: "uppercase" }}>Interior</span>
              </div>
            </div>
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)",
              transformOrigin: "left center",
              transform: showFold ? "rotateY(-75deg)" : "rotateY(0deg)",
              transition: `transform 600ms ${GATEFOLD_EASE}`,
              willChange: "transform", overflow: "hidden", zIndex: 2,
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.12)" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <FaceMark logoUrl={logoUrl} name={pressName} size={THUMB * THUMB_LOGO} opacity={0.9} />
              </div>
            </div>
            <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 1, background: "rgba(0,0,0,0.45)", zIndex: 4 }} />
          </div>
        ) : (
          <div style={{ position: "relative", width: THUMB, height: THUMB, perspective: "300px" }}>
            <div style={{ position: "absolute", inset: 0, background: "#E8DBCA", overflow: "hidden", zIndex: 1 }}>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 6, fontWeight: 600, color: "rgba(80,60,30,0.32)", letterSpacing: 1.2, textTransform: "uppercase" }}>Interior</span>
              </div>
            </div>
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(155deg, #1c1c22 0%, #0f0f14 100%)",
              transformOrigin: "right center",
              transform: showFold ? "rotateY(75deg)" : "rotateY(0deg)",
              transition: `transform 600ms ${GATEFOLD_EASE}`,
              willChange: "transform", overflow: "hidden", zIndex: 2,
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.10)" }} />
            </div>
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)",
              transformOrigin: "left center",
              transform: showFold ? "rotateY(-75deg)" : "rotateY(0deg)",
              transition: `transform 600ms ${GATEFOLD_EASE}`,
              willChange: "transform", overflow: "hidden", zIndex: 3,
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.12)" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <FaceMark logoUrl={logoUrl} name={pressName} size={THUMB * THUMB_LOGO} opacity={0.9} />
              </div>
            </div>
            <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 1, background: "rgba(0,0,0,0.40)", zIndex: 4 }} />
            <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 1, background: "rgba(0,0,0,0.40)", zIndex: 4 }} />
          </div>
        )}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? t.blue : t.ink }}>
          {jacket.name}
        </div>
        <div className="text-[12px]" style={{ marginTop: 3, color: t.faint, lineHeight: 1.4 }}>
          {jacket.note}
        </div>
        {!offered && <NotOfferedChip color={t.subink} />}
        {active && hasVariants && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
            <div style={{ display: "inline-flex", gap: 6, padding: 3, borderRadius: 999, background: t.soft, border: `1px solid ${t.hairline}` }}>
              {jacket.variants.map((v) => {
                const vActive = v.id === variantId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onVariantSelect(v.id)}
                    aria-pressed={vActive}
                    data-testid={`variant-${jacket.id}-${v.id}`}
                    className="transition-all focus:outline-none"
                    style={{
                      padding: "5px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
                      color: vActive ? t.ink : t.pillIdle,
                      background: vActive ? t.card : "transparent",
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
export function PressJacketsComponent({
  payload,
  canEdit,
  save,
  saving,
}: {
  payload: PressComponentsPayload;
  canEdit: boolean;
  save: (config: JacketsComponentConfig) => void;
  saving: boolean;
}) {
  const dark = useAdminDark();
  const t = THEMES[dark ? "dark" : "light"];
  const mt = menuTheme(t, dark);
  const press = payload.press;
  const logoUrl = resolvePressMarkLogo(press);

  // Offered/template state seeded from payload; re-seed only on press
  // identity change when there are no unsaved edits.
  const [offer, setOffer] = useState<OfferState>(() => offerStateFromConfig(JACKET_STYLE_IDS, payload.jackets?.options));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setOffer(offerStateFromConfig(JACKET_STYLE_IDS, payload.jackets?.options));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [press.id]);

  const commit = (next: OfferState) => {
    setOffer(next);
    setDirty(true);
    save(offerConfigFromState(JACKET_STYLE_IDS, next));
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
  const [selectedSizeId, setSelectedSizeId] = useState<string>("12");
  const [selectedJacketId, setSelectedJacketId] = useState<string | null>("single");
  const [selectedVariantId, setSelectedVariantId] = useState<string>("standard");

  const jacketOptions = JACKET_CATALOG[selectedSizeId] ?? [];
  const jacketType = jacketOptions.find((j) => j.id === selectedJacketId) ?? null;
  const offeredCount = jacketOptions.filter((j) => offer[j.id]?.offered).length;

  const selectJacket = (id: string) => {
    setSelectedJacketId(id);
    const opt = jacketOptions.find((j) => j.id === id);
    setSelectedVariantId(opt?.variants[0]?.id ?? "standard");
  };

  const selectSize = (id: string) => {
    setSelectedSizeId(id);
    const nextOptions = JACKET_CATALOG[id] ?? [];
    const still = nextOptions.find((j) => j.id === selectedJacketId);
    const fallback = nextOptions[0];
    const next = still ?? fallback ?? null;
    setSelectedJacketId(next?.id ?? null);
    setSelectedVariantId(next?.variants[0]?.id ?? "standard");
  };

  const selectedVariant = jacketType?.variants.find((v) => v.id === selectedVariantId);
  const widespine = selectedVariantId === "widespine";
  const tipOn = selectedVariantId === "tipon";

  return (
    <div className="font-sans" style={{ backgroundColor: t.canvas, color: t.ink }}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 96 }}>
        {/* Quiet opening header */}
        <div className="min-w-0">
          <PageHeading lead="Jackets." rest="How the record is dressed." t={t} />
          <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: t.subink }}>
            Pick the jacket styles you offer. Artists choose from these when they design a record with {press.name}.
          </p>
          {saving && (
            <p className="text-[12px]" style={{ marginTop: 8, color: t.faint }} data-testid="jackets-saving">
              Saving…
            </p>
          )}
        </div>

        {/* Split: sticky jacket stage · size + style pickers */}
        <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 520px", gap: 56, alignItems: "start" }}>
          {/* LEFT — sticky jacket preview */}
          <div className="sticky" style={{ top: 88 }}>
            <div className="flex flex-col items-center">
              <JacketStage jacketType={jacketType} widespine={widespine} tipOn={tipOn} t={t} logoUrl={logoUrl} pressName={press.name} />
              {jacketType && (
                <>
                  <div className="text-[13px] font-semibold" style={{ marginTop: 28, color: t.ink }}>
                    {VINYL_SIZES.find((s) => s.id === selectedSizeId)?.label} {jacketType.name}
                    {selectedVariant && selectedVariant.id !== "standard" && (
                      <span style={{ color: t.faint }}> · {selectedVariant.label}</span>
                    )}
                  </div>
                  <p className="text-[12px] text-center" style={{ marginTop: 6, color: t.faint, maxWidth: 280 }}>
                    {jacketType.note}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* RIGHT — size + style pickers */}
          <div className="min-w-0">
            {/* Size */}
            <StepHeading lead="Pick a size." rest="The record sets the jacket." t={t} />
            <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
              The record size determines which jacket constructions are available.
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
              <StepHeading lead="Pick a style." rest="The jacket sets the tone." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }} data-testid="jackets-availability">
                {offeredCount} of {jacketOptions.length} styles available from {press.name}.
              </p>
            </div>
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
              {jacketOptions.map((j) => (
                <div key={j.id} className="group/offer relative">
                  <JacketTile
                    jacket={j}
                    active={j.id === selectedJacketId}
                    offered={!!offer[j.id]?.offered}
                    variantId={j.id === selectedJacketId ? selectedVariantId : (j.variants[0]?.id ?? "standard")}
                    onSelect={() => selectJacket(j.id)}
                    onVariantSelect={setSelectedVariantId}
                    t={t}
                    logoUrl={logoUrl}
                    pressName={press.name}
                  />
                  {canEdit && (
                    <OptionOfferMenu
                      name={STYLE_NAMES[j.id] ?? j.name}
                      offered={!!offer[j.id]?.offered}
                      templateUrl={offer[j.id]?.templateUrl ?? null}
                      onToggleOffered={() => toggleOffered(j.id)}
                      onTemplateUrl={(url) => setTemplateUrl(j.id, url)}
                      t={mt}
                      testId={`jacket-offer-${j.id}`}
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

export default PressJacketsComponent;
