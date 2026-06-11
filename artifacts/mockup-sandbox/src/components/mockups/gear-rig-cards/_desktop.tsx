import type { CSSProperties, ReactNode } from "react";
import { FAN, IconButton } from "./_shared";

// ---------------------------------------------------------------------------
// DESKTOP gear-sheet chrome.
//
// The fan desktop app is a wide shell, never a stretched phone column. So every
// gear-discovery screen here renders as a centered, roughly-square SHEET card
// floating on the navy backdrop, with a two-column inner layout (image/identity
// rail + detail rail) that keeps the page short and balanced. Mirrors the
// gooddeed-library/_desktop "square look on desktop" convention. All chrome
// reuses the FAN tokens + IconButton from _shared so the brand colors and glass
// match the mobile mocks exactly.
// ---------------------------------------------------------------------------

const FONT =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif";

// Full navy stage with the soft brand glows the live fan app uses.
export function DesktopGearStage({
  children,
  maxW = 1040,
}: {
  children: ReactNode;
  maxW?: number;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        boxSizing: "border-box",
        background:
          "radial-gradient(circle at 14% -6%, rgba(127,16,167,0.26), transparent 42%), radial-gradient(circle at 92% 6%, rgba(49,158,216,0.20), transparent 46%), #02030f",
        color: FAN.textPrimary,
        fontFamily: FONT,
        WebkitFontSmoothing: "antialiased",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "48px 40px",
      }}
    >
      <div style={{ width: "100%", maxWidth: maxW }}>{children}</div>
    </div>
  );
}

// The floating sheet card.
export function GearSheet({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "rgba(8,13,42,0.72)",
        border: `1px solid ${FAN.hairline}`,
        borderRadius: 28,
        boxShadow: "0 40px 100px rgba(0,0,0,0.55)",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

// Sheet header: back chevron + optional context on the left, optional action
// icons + a close (X) on the right — the desktop equivalent of the mobile
// top chrome bar.
export function SheetTopBar({
  context,
  trailing,
}: {
  context?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "16px 20px",
        borderBottom: `1px solid ${FAN.hairline}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <IconButton>
          <BackIcon />
        </IconButton>
        {context}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {trailing}
        <IconButton>
          <CloseIcon />
        </IconButton>
      </div>
    </div>
  );
}

export function SheetBody({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return <div style={{ padding: 30, ...style }}>{children}</div>;
}

export const eyebrow: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: FAN.textSecondary,
};

// --- icons -----------------------------------------------------------------

export function BackIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden>
      <path d="M10 3 L5 8 L10 13" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ShareIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3 V15 M12 3 L8 7 M12 3 L16 7 M5 12 V20 H19 V12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BookmarkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path d="M6 3 H18 V21 L12 16 L6 21 Z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function PlayGlyph({ color = "#001020" }: { color?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
      <path d="M4 3 L13 8 L4 13 Z" fill={color} />
    </svg>
  );
}
