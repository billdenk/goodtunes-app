/**
 * CarPlay + Android Auto — Design Canvas
 *
 * Shows all 5 in-car mockups side by side in two labeled columns:
 *   CarPlay: Home Tile · Now Playing · Queue
 *   Android Auto: Now Playing · Queue
 *
 * Designed for Bill's sign-off before any native implementation begins.
 */

import { CarPlayHomeTile } from "./CarPlayHomeTile";
import { CarPlayNowPlaying } from "./CarPlayNowPlaying";
import { CarPlayQueue } from "./CarPlayQueue";
import { AndroidAutoHomeShelf } from "./AndroidAutoHomeShelf";
import { AndroidAutoNowPlaying } from "./AndroidAutoNowPlaying";
import { AndroidAutoQueue } from "./AndroidAutoQueue";

const CANVAS_BG = "#0d0d14";
const CARPLAY_ACCENT = "#c8c8cc";   // Apple silver / gray
const AUTO_ACCENT   = "#319ED8";   // GoodTunes blue (matches Auto accent)
const LABEL_BG_CARPLAY = "rgba(200,200,204,0.08)";
const LABEL_BG_AUTO    = "rgba(49,158,216,0.08)";

const SCREEN_SCALE = 0.72;

function ScreenLabel({
  label,
  platform,
}: {
  label: string;
  platform: "carplay" | "auto";
}) {
  const isCarPlay = platform === "carplay";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 12px",
        borderRadius: 20,
        background: isCarPlay ? LABEL_BG_CARPLAY : LABEL_BG_AUTO,
        border: `1px solid ${isCarPlay ? "rgba(200,200,204,0.18)" : "rgba(49,158,216,0.22)"}`,
        marginBottom: 12,
      }}
    >
      {isCarPlay ? (
        /* Apple CarPlay logo mark */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="5" width="20" height="14" rx="2.5" stroke={CARPLAY_ACCENT} strokeWidth="1.5" fill="none" />
          <circle cx="12" cy="12" r="3.5" fill={CARPLAY_ACCENT} />
          <rect x="9" y="10" width="6" height="4" rx="1" fill={CARPLAY_ACCENT} />
        </svg>
      ) : (
        /* Android Auto chevrons */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M4 17l8-10 8 10" stroke={AUTO_ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 13l8-10 8 10" stroke={AUTO_ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
        </svg>
      )}
      <span
        style={{
          color: isCarPlay ? CARPLAY_ACCENT : AUTO_ACCENT,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 0.3,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function MockupFrame({
  label,
  platform,
  children,
}: {
  label: string;
  platform: "carplay" | "auto";
  children: React.ReactNode;
}) {
  const isCarPlay = platform === "carplay";
  const borderColor = isCarPlay ? "rgba(200,200,204,0.12)" : "rgba(49,158,216,0.14)";
  const shadowColor = isCarPlay ? "rgba(200,200,204,0.05)" : "rgba(49,158,216,0.06)";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <ScreenLabel label={label} platform={platform} />
      <div
        style={{
          transform: `scale(${SCREEN_SCALE})`,
          transformOrigin: "top left",
          borderRadius: 12,
          overflow: "hidden",
          border: `1px solid ${borderColor}`,
          boxShadow: `0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px ${shadowColor}`,
        }}
      >
        {children}
      </div>
      {/* Reserve the scaled-down height so the layout flow is correct */}
      <div style={{ height: (480 * SCREEN_SCALE) - 480 + 6 }} />
    </div>
  );
}

function ColumnHeader({
  platform,
  title,
  subtitle,
}: {
  platform: "carplay" | "auto";
  title: string;
  subtitle: string;
}) {
  const isCarPlay = platform === "carplay";
  return (
    <div
      style={{
        padding: "18px 24px",
        borderRadius: 12,
        background: isCarPlay ? "rgba(200,200,204,0.05)" : "rgba(49,158,216,0.05)",
        border: `1px solid ${isCarPlay ? "rgba(200,200,204,0.1)" : "rgba(49,158,216,0.12)"}`,
        marginBottom: 32,
      }}
    >
      <h2
        style={{
          color: isCarPlay ? CARPLAY_ACCENT : AUTO_ACCENT,
          fontSize: 20,
          fontWeight: 700,
          margin: "0 0 4px",
          letterSpacing: -0.3,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
        }}
      >
        {title}
      </h2>
      <p
        style={{
          color: "rgba(255,255,255,0.38)",
          fontSize: 13,
          margin: 0,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

export function CarPlayAutoCanvas() {
  // ?shift=N — screenshot-slicing aid: shifts the content up N px so a
  // fixed-viewport screenshot service can capture the full page in slices.
  const shift = Number(new URLSearchParams(window.location.search).get("shift") || 0);
  if (typeof document !== "undefined") document.body.style.background = CANVAS_BG;
  return (
    <div
      style={{
        minHeight: "100vh",
        background: CANVAS_BG,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
        padding: "48px 48px 80px",
        marginTop: shift ? -shift : undefined,
      }}
    >
      {/* Page header */}
      <div style={{ marginBottom: 56, maxWidth: 900 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: "#00062B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(255,124,6,0.3)",
            }}
          >
            <span style={{ color: "#FF7C06", fontSize: 18, fontWeight: 700 }}>G</span>
          </div>
          <div>
            <h1
              style={{
                color: "rgba(255,255,255,0.92)",
                fontSize: 26,
                fontWeight: 700,
                margin: 0,
                letterSpacing: -0.4,
              }}
            >
              CarPlay + Android Auto
            </h1>
          </div>
        </div>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
          Design mockups for Bill's sign-off — no native code has been written. Left column: Apple CarPlay (3 screens). Right column: Android Auto (3 screens).
          Apple has granted the CarPlay Audio App entitlement; implementation begins after approval.
        </p>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "flex", gap: 64, alignItems: "flex-start" }}>

        {/* ─── CarPlay Column ─── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <ColumnHeader
            platform="carplay"
            title="Apple CarPlay"
            subtitle="Dark glass · SF system font · 800×480 dash display · Apple HIG touch targets"
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
            <MockupFrame label="CarPlay · Home Grid" platform="carplay">
              <CarPlayHomeTile />
            </MockupFrame>

            <MockupFrame label="CarPlay · Now Playing" platform="carplay">
              <CarPlayNowPlaying />
            </MockupFrame>

            <MockupFrame label="CarPlay · Queue / Browse" platform="carplay">
              <CarPlayQueue />
            </MockupFrame>
          </div>
        </div>

        {/* Vertical divider */}
        <div
          style={{
            width: 1,
            background: "rgba(255,255,255,0.07)",
            alignSelf: "stretch",
            flexShrink: 0,
          }}
        />

        {/* ─── Android Auto Column ─── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <ColumnHeader
            platform="auto"
            title="Android Auto"
            subtitle="Material Dark chrome · Google Sans font · 800×480 AAOS display · GoodTunes blue accent · 3 screens"
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
            <MockupFrame label="Android Auto · Home Shelf" platform="auto">
              <AndroidAutoHomeShelf />
            </MockupFrame>

            <MockupFrame label="Android Auto · Now Playing" platform="auto">
              <AndroidAutoNowPlaying />
            </MockupFrame>

            <MockupFrame label="Android Auto · Queue / Browse" platform="auto">
              <AndroidAutoQueue />
            </MockupFrame>
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div
        style={{
          marginTop: 72,
          paddingTop: 24,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <p style={{ color: "rgba(255,255,255,0.22)", fontSize: 12, margin: 0 }}>
          All screens use real Nick Carter / "Now or Never" track data. Brand palette: <code style={{ color: "rgba(255,255,255,0.35)" }}>#00062B</code> · <code style={{ color: "#FF7C06" }}>#FF7C06</code> · <code style={{ color: "#319ED8" }}>#319ED8</code> · <code style={{ color: "#FF5470" }}>#FF5470</code>
        </p>
        <p style={{ color: "rgba(255,255,255,0.18)", fontSize: 12, margin: 0 }}>
          Design approval only — no Swift, Kotlin, or Capacitor code modified
        </p>
      </div>
    </div>
  );
}

export default CarPlayAutoCanvas;
