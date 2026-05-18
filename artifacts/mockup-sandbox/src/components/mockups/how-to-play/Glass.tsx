import { SheetShell, AlbumHero, SectionLabel, AppleMusicLogo, SpotifyLogo, pressFx } from "./_shared";

// Variant A — Glass tiles on the existing dark navy sheet.
// Keeps the dark mood but replaces the pitch-black tiles with frosted
// white scrims so the brand-color logos pop. iOS-Material feel.
export function Glass() {
  const tile = {
    width: 108,
    height: 108,
    borderRadius: 28,
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.16)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    boxShadow:
      "0 10px 30px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    ...pressFx(),
  } as const;

  return (
    <SheetShell bg="#0E1334" textColor="#fff">
      <AlbumHero textPrimary="#fff" textSecondary="rgba(255,255,255,0.55)" />
      <div style={{ paddingLeft: 24, paddingRight: 24 }}>
        <SectionLabel color="rgba(255,255,255,0.55)">How to Play</SectionLabel>
        <div style={{ display: "flex", justifyContent: "center", gap: 24 }}>
          <button type="button" style={tile} aria-label="Apple Music">
            <AppleMusicLogo size={50} />
          </button>
          <button type="button" style={tile} aria-label="Spotify">
            <SpotifyLogo size={50} />
          </button>
        </div>
        <p
          style={{
            textAlign: "center",
            marginTop: 22,
            fontSize: 12,
            color: "rgba(255,255,255,0.45)",
          }}
        >
          Opens in your music app
        </p>
      </div>
    </SheetShell>
  );
}
