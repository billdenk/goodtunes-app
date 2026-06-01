import {
  SheetShell,
  AlbumHero,
  SectionLabel,
  ServiceIcon,
  STREAMING_SERVICES,
} from "./_shared";

// Frame 2 — Returning fan. We already know their service, so we skip the
// grid entirely: one big tap-and-go button straight into Spotify. A quiet
// caption teaches the press-and-hold gesture for switching services without
// cluttering the happy path.
export function ReturningFan() {
  const spotify = STREAMING_SERVICES.find((s) => s.name === "Spotify")!;

  return (
    <SheetShell bg="#0E1334" textColor="#fff">
      <AlbumHero textPrimary="#fff" textSecondary="rgba(255,255,255,0.55)" />
      <div style={{ paddingLeft: 20, paddingRight: 20 }}>
        <SectionLabel color="rgba(255,255,255,0.55)">How to Play</SectionLabel>
        <button
          type="button"
          aria-label="Open in Spotify"
          style={{
            width: "100%",
            height: 60,
            borderRadius: 30,
            background: "#1ED760",
            color: "#000",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            cursor: "pointer",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: -0.2,
          }}
        >
          <ServiceIcon src={spotify.src} name={spotify.name} size={34} />
          Open in Spotify
        </button>
        <p
          style={{
            marginTop: 16,
            textAlign: "center",
            fontSize: 12.5,
            fontWeight: 400,
            color: "rgba(255,255,255,0.5)",
            lineHeight: 1.4,
          }}
        >
          Press &amp; hold to choose another service.
        </p>
      </div>
    </SheetShell>
  );
}
