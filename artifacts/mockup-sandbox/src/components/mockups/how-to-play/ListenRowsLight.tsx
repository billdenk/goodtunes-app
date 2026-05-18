import type { CSSProperties } from "react";
import {
  SheetShell,
  AlbumHero,
  SectionLabel,
  AppleMusicAppIcon,
  SpotifyIcon,
  pressFx,
} from "./_shared";

// Variant D — Same app-icon row stack as C, but on a light sheet
// (Apple's AirPods-pairing-sheet treatment). Translucent slate rows
// over a near-white surface so the Apple Music + Spotify app icons
// pop without any recoloring.
export function ListenRowsLight() {
  const row: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    padding: "12px 16px",
    borderRadius: 18,
    background: "rgba(11,15,42,0.05)",
    border: "1px solid rgba(11,15,42,0.08)",
    color: "#0B0F2A",
    textAlign: "left",
    ...pressFx(),
  };

  const secondary = "rgba(11,15,42,0.55)";
  const chevron = "rgba(11,15,42,0.35)";

  return (
    <SheetShell bg="#F4F5F8" textColor="#0B0F2A" closeTone="onLight">
      <AlbumHero textPrimary="#0B0F2A" textSecondary={secondary} />
      <div style={{ paddingLeft: 20, paddingRight: 20 }}>
        <SectionLabel color={secondary}>How to Play</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button" style={row} aria-label="Listen on Apple Music">
            <AppleMusicAppIcon size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Apple Music</div>
              <div style={{ fontSize: 12, fontWeight: 400, color: secondary }}>
                Listen now
              </div>
            </div>
            <span style={{ color: chevron, fontSize: 22, lineHeight: 1 }}>›</span>
          </button>
          <button type="button" style={row} aria-label="Listen on Spotify">
            <SpotifyIcon size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Spotify</div>
              <div style={{ fontSize: 12, fontWeight: 400, color: secondary }}>
                Listen now
              </div>
            </div>
            <span style={{ color: chevron, fontSize: 22, lineHeight: 1 }}>›</span>
          </button>
        </div>
      </div>
    </SheetShell>
  );
}
