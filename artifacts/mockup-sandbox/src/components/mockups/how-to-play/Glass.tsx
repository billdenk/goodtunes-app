import {
  SheetShell,
  AlbumHero,
  SectionLabel,
  ListenOnAppleBadge,
  ListenOnSpotifyBadge,
} from "./_shared";

// Variant A — Official "Listen on" badges, stacked (Apple's recommended
// linking pattern). Dark sheet, full-width pills, generous breathing room.
export function Glass() {
  return (
    <SheetShell bg="#0E1334" textColor="#fff">
      <AlbumHero textPrimary="#fff" textSecondary="rgba(255,255,255,0.55)" />
      <div style={{ paddingLeft: 24, paddingRight: 24 }}>
        <SectionLabel color="rgba(255,255,255,0.55)">How to Play</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ListenOnAppleBadge />
          <ListenOnSpotifyBadge />
        </div>
        <p
          style={{
            textAlign: "center",
            marginTop: 18,
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
