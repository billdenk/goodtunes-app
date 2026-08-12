// Press Catalog › Components › Inner Sleeves — production page (Task #3052),
// ported from handoff/press-components/ArtistChooseInnerSleeve.tsx. Renders
// ONLY the page body inside OperatorShell; theme from useAdminDark(); press
// identity rides on the payload (labelLogoUrl reads white already).
// The mock's 3 tiles × variants are flattened into SIX flat style tiles
// (SLEEVE_STYLE_IDS) so each carries its own offered/template ••• menu.
import { useEffect, useState } from "react";
import type { PressComponentsPayload } from "./usePressComponents";
import { SLEEVE_STYLE_IDS, type SleevesComponentConfig } from "@shared/pressComponents";
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
  canvas: string;
  card: string;
  soft: string;
  hairline: string;
  ink: string;
  subink: string;
  faint: string;
  blue: string;
  pillActive: string;
  pillShadow: string;
  pillInk: string;
  pillInkIdle: string;
  popShadow: string;
  dashedBorder: string;
};

const THEMES: Record<"light" | "dark", Theme> = {
  light: {
    canvas: "#f5f5f7",
    card: "#ffffff",
    soft: "#f2f2f5",
    hairline: "#e6e6ea",
    ink: "#1d1d1f",
    subink: "#6e6e73",
    faint: "#a1a1a6",
    blue: "#319ED8",
    pillActive: "#ffffff",
    pillShadow: "0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)",
    pillInk: "#1d1d1f",
    pillInkIdle: "#8e8e93",
    popShadow: "0 12px 40px rgba(0,0,0,0.16)",
    dashedBorder: "#d0d0d5",
  },
  dark: {
    canvas: "#161617",
    card: "#1e1e20",
    soft: "#26262a",
    hairline: "rgba(255,255,255,0.10)",
    ink: "#f5f5f7",
    subink: "#98989d",
    faint: "#6e6e73",
    blue: "#319ED8",
    pillActive: "#3a3a3e",
    pillShadow: "0 1px 3px rgba(0,0,0,0.4)",
    pillInk: "#f5f5f7",
    pillInkIdle: "#98989d",
    popShadow: "0 12px 40px rgba(0,0,0,0.5)",
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
    popShadow: t.popShadow,
    hoverWash: dark ? "hover:bg-white/5" : "hover:bg-black/[0.03]",
  };
}

// ─── Press mark on the printed sleeve face ───────────────────────────
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

// ─── Vinyl sizes — selection-only, informs the stage caption ──────────
const VINYL_SIZES = [
  { id: "7", label: '7"', note: "Single" },
  { id: "10", label: '10"', note: "EP" },
  { id: "12", label: '12"', note: "LP \u00b7 Standard" },
];

// ─── The six flat sleeve styles (persisted vocabulary) ────────────────
type SleeveLook = {
  color: "white" | "black";
  printed: boolean;
  polylined: boolean;
  boardWeight: boolean;
};

type SleeveStyle = {
  id: (typeof SLEEVE_STYLE_IDS)[number];
  name: string;
  note: string;
  look: SleeveLook;
};

const SLEEVE_STYLES: SleeveStyle[] = [
  {
    id: "printed-paper",
    name: "Printed Paper",
    note: "Full-color print on standard paper stock. Artist supplies artwork.",
    look: { color: "white", printed: true, polylined: false, boardWeight: false },
  },
  {
    id: "printed-board",
    name: "Printed Board Weight",
    note: "Full-color print on heavier board stock. More rigid \u2014 protects the record better.",
    look: { color: "white", printed: true, polylined: false, boardWeight: true },
  },
  {
    id: "white",
    name: "White",
    note: "Plain white paper sleeve. Clean and minimal \u2014 no artwork required.",
    look: { color: "white", printed: false, polylined: false, boardWeight: false },
  },
  {
    id: "black",
    name: "Black",
    note: "Plain black paper sleeve. Understated \u2014 no artwork required.",
    look: { color: "black", printed: false, polylined: false, boardWeight: false },
  },
  {
    id: "white-poly",
    name: "White Polylined",
    note: "White paper with anti-static poly lining. Protects against dust and scratches.",
    look: { color: "white", printed: false, polylined: true, boardWeight: false },
  },
  {
    id: "black-poly",
    name: "Black Polylined",
    note: "Black paper with anti-static poly lining. Protects against dust and scratches.",
    look: { color: "black", printed: false, polylined: true, boardWeight: false },
  },
];

// Stage size — same baseline as the jacket stage for visual consistency.
const SS = 321;
const HOLE_RATIO = 0.33;

// ─── Sleeve thumbnail (64px tile preview) ────────────────────────────
function SleeveThumbnail({ sleeve, size = 48, logoUrl, pressName }: { sleeve: SleeveLook; size: number; logoUrl: string | null; pressName: string }) {
  const isBlack = sleeve.color === "black";
  const bg = isBlack ? "#0a0a0a" : "#ffffff";
  const border = isBlack ? "1.5px solid #333" : "1.5px solid #e6e6ea";
  const hole = size * HOLE_RATIO;

  const holeRadius = hole / 2;
  const holeMask = sleeve.polylined
    ? `radial-gradient(circle at 50% 50%, transparent ${holeRadius}px, black ${holeRadius + 1}px)`
    : undefined;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {sleeve.polylined && (
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: hole, height: hole, borderRadius: "50%", overflow: "hidden", zIndex: 1,
          background: "radial-gradient(circle at 38% 32%, rgba(210,225,238,0.96) 0%, rgba(165,185,205,0.88) 55%, rgba(185,205,222,0.92) 100%)",
        }}>
          <div style={{ position: "absolute", top: "10%", left: "14%", width: "55%", height: "32%", background: "linear-gradient(120deg, rgba(255,255,255,0.60) 0%, rgba(255,255,255,0) 70%)", borderRadius: "50%", transform: "rotate(-18deg)", filter: "blur(1px)" }} />
        </div>
      )}
      <div style={{
        position: "absolute", inset: 0, zIndex: 2,
        background: sleeve.printed ? "linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)" : bg,
        border,
        overflow: "hidden",
        ...(holeMask ? { maskImage: holeMask, WebkitMaskImage: holeMask } : {}),
      }}>
        {sleeve.printed && <RainbowPrintFace logoSize={size * 0.52} logoUrl={logoUrl} pressName={pressName} />}
        {sleeve.boardWeight && (
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 3, background: "rgba(255,255,255,0.25)" }} />
        )}
      </div>
    </div>
  );
}

// ─── SleeveStage — large left-panel preview ───────────────────────────
function SleeveStage({ sleeve, t, logoUrl, pressName }: { sleeve: SleeveLook | null; t: Theme; logoUrl: string | null; pressName: string }) {
  const isBlack = sleeve?.color === "black";
  const bg = isBlack ? "#0a0a0a" : "#ffffff";
  // Rendered sleeve is product imagery — its own hairline stays fixed, not themed
  const border = isBlack ? "1px solid #222" : "1px solid #e6e6ea";
  const hole = SS * HOLE_RATIO;

  if (!sleeve) {
    return (
      <div style={{
        width: SS, height: SS, flexShrink: 0,
        border: `1.5px dashed ${t.dashedBorder}`, borderRadius: 4,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: t.faint,
      }}>
        <svg width={36} height={36} viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <rect x={4} y={4} width={28} height={28} rx={1} />
          <path d="M14 4 L14 32" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Select a sleeve style</span>
      </div>
    );
  }

  const holeRadius = hole / 2;
  const holeMask = sleeve.polylined
    ? `radial-gradient(circle at 50% 50%, transparent ${holeRadius}px, black ${holeRadius + 1}px)`
    : undefined;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div style={{
        position: "absolute", bottom: -14, left: "50%", transform: "translateX(-50%)",
        width: SS * 0.75, height: 20, borderRadius: "50%",
        background: "radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.07) 55%, transparent 80%)",
        pointerEvents: "none",
      }} />

      {sleeve.polylined && (
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: hole, height: hole, borderRadius: "50%", overflow: "hidden", zIndex: 1,
          background: "radial-gradient(circle at 38% 32%, rgba(210,225,238,0.96) 0%, rgba(165,185,205,0.88) 55%, rgba(185,205,222,0.92) 100%)",
          boxShadow: "inset 0 2px 6px rgba(0,0,0,0.10)",
        }}>
          <div style={{ position: "absolute", top: "12%", left: "16%", width: "55%", height: "30%", background: "linear-gradient(120deg, rgba(255,255,255,0.60) 0%, rgba(255,255,255,0) 70%)", borderRadius: "50%", transform: "rotate(-18deg)", filter: "blur(2px)" }} />
          <div style={{ position: "absolute", bottom: "18%", right: "12%", width: "45%", height: "24%", background: "linear-gradient(300deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 70%)", borderRadius: "50%", transform: "rotate(14deg)", filter: "blur(2px)" }} />
        </div>
      )}

      <div style={{ zIndex: 2,
        position: "relative",
        width: SS, height: SS, flexShrink: 0,
        background: sleeve.printed ? "linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)" : bg,
        border,
        overflow: "hidden",
        boxShadow: sleeve.color === "black" ? "0 8px 32px rgba(0,0,0,0.45)" : "0 8px 32px rgba(0,0,0,0.10)",
        ...(holeMask ? { maskImage: holeMask, WebkitMaskImage: holeMask } : {}),
      }}>
        {sleeve.printed && <RainbowPrintFace logoSize={SS * 0.42} logoUrl={logoUrl} pressName={pressName} />}

        {!sleeve.printed && sleeve.color === "white" && (
          <>
            {Array.from({ length: 18 }, (_, i) => (
              <div key={i} style={{ position: "absolute", left: 0, right: 0, top: `${(i + 1) * 5.2}%`, height: 0.5, background: "rgba(0,0,0,0.025)" }} />
            ))}
          </>
        )}

        {!sleeve.printed && sleeve.color === "black" && (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "40%", background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)" }} />
        )}

        {sleeve.boardWeight && !sleeve.printed && (
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 5, background: isBlack ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }} />
        )}
      </div>
    </div>
  );
}

// ─── Sleeve tile — flat style (no variant pills) ─────────────────────
function SleeveTile({
  style: s,
  active,
  offered,
  onSelect,
  t,
  logoUrl,
  pressName,
}: {
  style: SleeveStyle;
  active: boolean;
  offered: boolean;
  onSelect: () => void;
  t: Theme;
  logoUrl: string | null;
  pressName: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`sleeve-${s.id}`}
      className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{
        width: "100%", padding: "13px 16px", display: "flex", alignItems: "center", gap: 16,
        background: t.card,
        border: active ? `2px solid ${t.blue}` : `1px ${offered ? "solid" : "dashed"} ${t.hairline}`,
        opacity: offered ? 1 : 0.55,
      }}
    >
      {/* SleeveThumbnail is product imagery — NOT themed (same in both modes) */}
      <SleeveThumbnail sleeve={s.look} size={64} logoUrl={logoUrl} pressName={pressName} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? t.blue : t.ink }}>
          {s.name}
        </div>
        <div className="text-[12px]" style={{ marginTop: 3, color: t.faint, lineHeight: 1.4 }}>
          {s.note}
        </div>
        {!offered && <NotOfferedChip color={t.subink} />}
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
export function PressInnerSleevesComponent({
  payload,
  canEdit,
  save,
  saving,
}: {
  payload: PressComponentsPayload;
  canEdit: boolean;
  save: (config: SleevesComponentConfig) => void;
  saving: boolean;
}) {
  const dark = useAdminDark();
  const t = THEMES[dark ? "dark" : "light"];
  const mt = menuTheme(t, dark);
  const press = payload.press;
  const logoUrl = press.labelLogoUrl;

  const [offer, setOffer] = useState<OfferState>(() => offerStateFromConfig(SLEEVE_STYLE_IDS, payload.sleeves?.options));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setOffer(offerStateFromConfig(SLEEVE_STYLE_IDS, payload.sleeves?.options));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [press.id]);

  const commit = (next: OfferState) => {
    setOffer(next);
    setDirty(true);
    save(offerConfigFromState(SLEEVE_STYLE_IDS, next));
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
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>("printed-paper");

  const selected = SLEEVE_STYLES.find((s) => s.id === selectedStyleId) ?? null;
  const offeredCount = SLEEVE_STYLES.filter((s) => offer[s.id]?.offered).length;

  return (
    <div className="font-sans" style={{ backgroundColor: t.canvas, color: t.ink }}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 96 }}>
        {/* Quiet opening header */}
        <div className="min-w-0">
          <PageHeading lead="Inner sleeves." rest="What holds the record." t={t} />
          <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: t.subink }}>
            Pick the inner-sleeve styles you offer. Artists choose from these when they design a record with {press.name}.
          </p>
          {saving && (
            <p className="text-[12px]" style={{ marginTop: 8, color: t.faint }} data-testid="sleeves-saving">
              Saving…
            </p>
          )}
        </div>

        {/* Split: sticky sleeve stage · size + style pickers */}
        <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 520px", gap: 56, alignItems: "start" }}>
          {/* LEFT — sticky sleeve preview */}
          <div className="sticky" style={{ top: 88 }}>
            <div className="flex flex-col items-center">
              <SleeveStage sleeve={selected?.look ?? null} t={t} logoUrl={logoUrl} pressName={press.name} />
              {selected && (
                <>
                  <div className="text-[13px] font-semibold" style={{ marginTop: 28, color: t.ink }}>
                    {VINYL_SIZES.find((s) => s.id === selectedSizeId)?.label} {selected.name}
                  </div>
                  <p className="text-[12px] text-center" style={{ marginTop: 6, color: t.faint, maxWidth: 280 }}>
                    {selected.note}
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
              Every sleeve style comes cut to the record size.
            </p>
            <div style={{ marginTop: 18, display: "flex", gap: 12 }}>
              {VINYL_SIZES.map((s) => {
                const active = s.id === selectedSizeId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSizeId(s.id)}
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
              <StepHeading lead="Pick a style." rest="The sleeve inside the jacket." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }} data-testid="sleeves-availability">
                {offeredCount} of {SLEEVE_STYLES.length} styles available from {press.name}.
              </p>
            </div>
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
              {SLEEVE_STYLES.map((s) => (
                <div key={s.id} className="group/offer relative">
                  <SleeveTile
                    style={s}
                    active={s.id === selectedStyleId}
                    offered={!!offer[s.id]?.offered}
                    onSelect={() => setSelectedStyleId(s.id)}
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
                      testId={`sleeve-offer-${s.id}`}
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

export default PressInnerSleevesComponent;
