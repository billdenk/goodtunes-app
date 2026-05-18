import type { CSSProperties } from "react";
import {
  SheetShell,
  AlbumHero,
  SectionLabel,
  AppleMusicAppIcon,
  SpotifyIcon,
  pressFx,
} from "./_shared";

// Variant C — App-icon rows (guideline-compliant): Apple Music app icon
// (as supplied) and Spotify icon (no surrounding container) used at
// matching sizes inside a translucent row. Chevron right, "Listen now"
// caption. Reads as a launcher list.
export function ListenRows() {
  const row: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    padding: "12px 16px",
    borderRadius: 18,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "#fff",
    textAlign: "left",
    ...pressFx(),
  };

  return (
    <SheetShell bg="#0E1334" textColor="#fff">
      <AlbumHero textPrimary="#fff" textSecondary="rgba(255,255,255,0.55)" />
      <div style={{ paddingLeft: 20, paddingRight: 20 }}>
        <SectionLabel color="rgba(255,255,255,0.55)">How to Play</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button" style={row} aria-label="Listen on Apple Music">
            <AppleMusicAppIcon size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Apple Music</div>
              <div style={{ fontSize: 12, fontWeight: 400, color: "rgba(255,255,255,0.55)" }}>
                Listen now
              </div>
            </div>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 22, lineHeight: 1 }}>›</span>
          </button>
          <button type="button" style={row} aria-label="Listen on Spotify">
            <SpotifyIcon size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Spotify</div>
              <div style={{ fontSize: 12, fontWeight: 400, color: "rgba(255,255,255,0.55)" }}>
                Listen now
              </div>
            </div>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 22, lineHeight: 1 }}>›</span>
          </button>
        </div>
      </div>
    </SheetShell>
  );
}
