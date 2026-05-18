import type { CSSProperties, ReactNode } from "react";
import appleMusicLogoSrc from "../../../assets/brand/apple-music.svg";
import spotifyLogoSrc from "../../../assets/brand/spotify.svg";

export const ALBUM = {
  title: "Here Now Evolve",
  artist: "Johanna Stahley",
  year: "2024",
};

export function AlbumArt({ size = 176 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 22,
        overflow: "hidden",
        boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
        background:
          "linear-gradient(135deg, #FF8A3D 0%, #E94A8C 35%, #7A5BE0 70%, #2BB7C5 100%)",
        flexShrink: 0,
      }}
    />
  );
}

// Dismiss control — clean chevron-down glyph, no background chip.
// This matches how Apple dismisses full sheets on iOS (Now Playing,
// Music app detail sheets) and reads quieter than a circle-X.
// 44×44 hit target with a 20px glyph centered inside.
export function CloseX({ tone = "onDark" }: { tone?: "onDark" | "onLight" }) {
  const stroke = tone === "onDark" ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.55)";
  return (
    <button
      type="button"
      aria-label="Close"
      style={{
        width: 44,
        height: 44,
        background: "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        cursor: "pointer",
        padding: 0,
        margin: 0,
      }}
    >
      <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden="true" fill="none">
        <path
          d="M6 9 L12 15 L18 9"
          stroke={stroke}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

// Shared sheet shell. Big Apple-continuous-curve top corners (38px).
// Header carries grabber (centered) + close X (right). Close X tone
// flips with the sheet's textColor.
export function SheetShell({
  bg,
  textColor,
  children,
  closeTone = "onDark",
}: {
  bg: string;
  textColor: string;
  children: ReactNode;
  closeTone?: "onDark" | "onLight";
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 30% 0%, rgba(255,138,61,0.18), transparent 55%), radial-gradient(circle at 80% 30%, rgba(123,91,224,0.22), transparent 60%), #050926",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 0,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: bg,
          color: textColor,
          borderTopLeftRadius: 38,
          borderTopRightRadius: 38,
          paddingTop: 16,
          paddingBottom: 36,
          boxShadow: "0 -20px 60px rgba(0,0,0,0.6)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Apple uses EITHER a grabber OR a close glyph, never both.
            We use a chevron-down glyph, top-right, no chip. */}
        <div style={{ position: "absolute", right: 8, top: 4 }}>
          <CloseX tone={closeTone} />
        </div>
        {children}
      </div>
    </div>
  );
}

export function AlbumHero({ textPrimary, textSecondary }: { textPrimary: string; textSecondary: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        paddingLeft: 24,
        paddingRight: 24,
        paddingTop: 28,
        paddingBottom: 24,
      }}
    >
      <AlbumArt />
      <h3
        style={{
          marginTop: 20,
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: -0.2,
          lineHeight: 1.2,
          color: textPrimary,
        }}
      >
        {ALBUM.title}
      </h3>
      {/* Apple-style secondary line: regular weight, ~55% opacity, 13px. */}
      <p
        style={{
          marginTop: 4,
          fontSize: 13,
          fontWeight: 400,
          color: textSecondary,
        }}
      >
        {ALBUM.artist} · {ALBUM.year}
      </p>
    </div>
  );
}

export function SectionLabel({ children, color }: { children: ReactNode; color: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

// --- Brand marks ---
// Apple Music app icon — the OFFICIAL Apple-supplied SVG, used as-is.
// Never recolored, never wrapped in another colored container.
export function AppleMusicAppIcon({ size = 60 }: { size?: number }) {
  return (
    <img
      src={appleMusicLogoSrc}
      alt="Apple Music"
      width={size}
      height={size}
      style={{ display: "block", flexShrink: 0 }}
    />
  );
}

// Spotify icon — the OFFICIAL Spotify-supplied SVG (green circle + bars).
// Used as-is on the sheet background; no surrounding container per their rules.
export function SpotifyIcon({ size = 60 }: { size?: number }) {
  return (
    <img
      src={spotifyLogoSrc}
      alt="Spotify"
      width={size}
      height={size}
      style={{ display: "block", flexShrink: 0 }}
    />
  );
}

// "Listen on Apple Music" pill: black pill, leading Apple-Music app icon
// (as supplied), two-line "Listen on / Apple Music" wordmark. Matches
// Apple's supplied linking badge anatomy.
export function ListenOnAppleBadge({ height = 52 }: { height?: number }) {
  const iconSize = Math.round(height * 0.7);
  return (
    <div
      style={{
        height,
        borderRadius: height / 2,
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        paddingLeft: 10,
        paddingRight: 22,
        color: "#fff",
      }}
      aria-label="Listen on Apple Music"
    >
      <AppleMusicAppIcon size={iconSize} />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
        <span style={{ fontSize: 10, opacity: 0.75, letterSpacing: 0.2 }}>Listen on</span>
        <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.2 }}>Apple Music</span>
      </div>
    </div>
  );
}

// "Listen on Spotify" pill: Spotify-green background, leading official
// Spotify icon, two-line "Listen on / Spotify" wordmark.
export function ListenOnSpotifyBadge({ height = 52 }: { height?: number }) {
  const iconSize = Math.round(height * 0.62);
  return (
    <div
      style={{
        height,
        borderRadius: height / 2,
        background: "#1ED760",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        paddingLeft: 14,
        paddingRight: 22,
        color: "#000",
      }}
      aria-label="Listen on Spotify"
    >
      <SpotifyIcon size={iconSize} />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
        <span style={{ fontSize: 10, opacity: 0.75, letterSpacing: 0.2 }}>Listen on</span>
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.2 }}>Spotify</span>
      </div>
    </div>
  );
}

export function pressFx(): CSSProperties {
  return { transition: "transform 0.15s ease, background 0.15s ease" };
}
