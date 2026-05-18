import {
  SheetShell,
  AlbumHero,
  SectionLabel,
  ListenOnAppleBadge,
  ListenOnSpotifyBadge,
} from "./_shared";

// Variant B — Official "Listen on" badges, side-by-side on a light sheet
// (Apple's AirPods-sheet treatment). Same compliant marks as A, denser
// layout, lighter mood.
export function LightBrand() {
  return (
    <SheetShell
      bg="#F4F5F8"
      textColor="#111"
      grabberColor="rgba(0,0,0,0.18)"
      closeTone="onLight"
    >
      <AlbumHero textPrimary="#0B0F2A" textSecondary="rgba(11,15,42,0.55)" />
      <div style={{ paddingLeft: 16, paddingRight: 16 }}>
        <SectionLabel color="rgba(11,15,42,0.5)">How to Play</SectionLabel>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <ListenOnAppleBadge height={52} />
          </div>
          <div style={{ flex: 1 }}>
            <ListenOnSpotifyBadge height={52} />
          </div>
        </div>
        <p
          style={{
            textAlign: "center",
            marginTop: 18,
            fontSize: 12,
            color: "rgba(11,15,42,0.5)",
          }}
        >
          Opens in your music app
        </p>
      </div>
    </SheetShell>
  );
}
