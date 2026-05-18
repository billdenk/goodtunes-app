import type { CSSProperties } from "react";
import { SheetShell, AlbumHero, SectionLabel, AppleMusicLogo, SpotifyLogo, pressFx } from "./_shared";

// Variant C — Apple "Listen on …" rows.
// Matches Apple's own handoff pattern (the same one Shazam and the
// iOS share sheet use): full-width pill rows with logo on the left,
// service name + caption, and a chevron on the right. Reads as
// app-launcher links rather than dark squares.
export function ListenRows() {
  const row: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    padding: "14px 16px",
    borderRadius: 18,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "#fff",
    textAlign: "left",
    ...pressFx(),
  };

  const logoTile = (bg: string): CSSProperties => ({
    width: 46,
    height: 46,
    borderRadius: 12,
    background: bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  });

  return (
    <SheetShell bg="#0E1334" textColor="#fff">
      <AlbumHero textPrimary="#fff" textSecondary="rgba(255,255,255,0.55)" />
      <div style={{ paddingLeft: 20, paddingRight: 20 }}>
        <SectionLabel color="rgba(255,255,255,0.55)">How to Play</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button" style={row} aria-label="Listen on Apple Music">
            <div style={logoTile("linear-gradient(160deg, #FB5C74 0%, #FA243C 100%)")}>
              <AppleMusicLogo size={26} fill="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Apple Music</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                Listen now
              </div>
            </div>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 22, lineHeight: 1 }}>›</span>
          </button>
          <button type="button" style={row} aria-label="Listen on Spotify">
            <div style={logoTile("#000")}>
              <SpotifyLogo size={26} fill="#1ED760" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Spotify</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
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
