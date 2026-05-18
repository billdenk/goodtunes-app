import type { CSSProperties } from "react";
import { SheetShell, AlbumHero, SectionLabel, AppleMusicLogo, SpotifyLogo, pressFx } from "./_shared";

// Variant B — Light sheet with brand-color tiles.
// Flips the sheet to a near-white card (matches Apple's AirPods sheet)
// and uses each service's brand color on the tile so the logos read as
// app-icon shortcuts rather than dark voids.
export function LightBrand() {
  const tile = (bg: string): CSSProperties => ({
    width: 108,
    height: 108,
    borderRadius: 28,
    background: bg,
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow:
      "0 12px 28px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    ...pressFx(),
  });

  return (
    <SheetShell bg="#F4F5F8" textColor="#111" grabberColor="rgba(0,0,0,0.18)">
      <AlbumHero textPrimary="#0B0F2A" textSecondary="rgba(11,15,42,0.55)" />
      <div style={{ paddingLeft: 24, paddingRight: 24 }}>
        <SectionLabel color="rgba(11,15,42,0.5)">How to Play</SectionLabel>
        <div style={{ display: "flex", justifyContent: "center", gap: 24 }}>
          <button
            type="button"
            style={tile("linear-gradient(160deg, #FB5C74 0%, #FA243C 100%)")}
            aria-label="Apple Music"
          >
            <AppleMusicLogo size={54} fill="#fff" />
          </button>
          <button type="button" style={tile("#000")} aria-label="Spotify">
            <SpotifyLogo size={54} fill="#1ED760" />
          </button>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 24,
            marginTop: 8,
          }}
        >
          <div style={{ width: 108, textAlign: "center", fontSize: 12, color: "rgba(11,15,42,0.6)" }}>
            Apple Music
          </div>
          <div style={{ width: 108, textAlign: "center", fontSize: 12, color: "rgba(11,15,42,0.6)" }}>
            Spotify
          </div>
        </div>
      </div>
    </SheetShell>
  );
}
