import type { CSSProperties, ReactNode } from "react";

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

// Apple-style circular close X — top-right of the sheet header.
// Matches the chip Apple Music / Music app uses on modal sheets:
// small translucent circle, light X glyph, no border.
export function CloseX({ tone = "onDark" }: { tone?: "onDark" | "onLight" }) {
  const bg = tone === "onDark" ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)";
  const stroke = tone === "onDark" ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.6)";
  return (
    <button
      type="button"
      aria-label="Close"
      style={{
        width: 30,
        height: 30,
        borderRadius: 999,
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <svg width={13} height={13} viewBox="0 0 13 13" aria-hidden="true">
        <path
          d="M1 1 L12 12 M12 1 L1 12"
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
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
  grabberColor = "rgba(255,255,255,0.32)",
  closeTone = "onDark",
}: {
  bg: string;
  textColor: string;
  children: ReactNode;
  grabberColor?: string;
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
          paddingBottom: 36,
          boxShadow: "0 -20px 60px rgba(0,0,0,0.6)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Header band: grabber centered, close-X pinned right. */}
        <div
          style={{
            position: "relative",
            paddingTop: 10,
            paddingBottom: 6,
            paddingLeft: 16,
            paddingRight: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 36,
              height: 5,
              borderRadius: 999,
              background: grabberColor,
            }}
          />
          <div style={{ position: "absolute", right: 16, top: 12 }}>
            <CloseX tone={closeTone} />
          </div>
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
        paddingTop: 8,
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
// Apple Music app icon: red-gradient rounded square, white note. This is
// the OFFICIAL mark as supplied by Apple — we never recolor or restyle.
export function AppleMusicAppIcon({ size = 60 }: { size?: number }) {
  const r = Math.round(size * 0.235);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background:
          "linear-gradient(180deg, #FB5C74 0%, #FA243C 50%, #F92C46 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 14px rgba(250,36,60,0.35)",
        flexShrink: 0,
      }}
      aria-label="Apple Music"
    >
      <svg viewBox="0 0 60 60" width={size * 0.6} height={size * 0.6} aria-hidden="true">
        <path
          fill="#fff"
          d="M42 13.8c0-1.4-1-2.3-2.4-2L21 15.6c-1.3.3-2.1 1.1-2.1 2.4v18.8c0 .4-.2.7-.6.8l-2 .4c-3 .6-5 2.5-5 5.2 0 2.7 2.2 4.6 5 4.6 3.4 0 5.7-2.1 5.7-5.6V25.8c0-.4.2-.7.6-.8l16.7-3.4c.3-.1.5 0 .5.3v13.5c0 .4-.2.7-.6.8l-2 .4c-3 .6-5 2.5-5 5.2 0 2.7 2.2 4.6 5 4.6 3.4 0 5.7-2.1 5.7-5.6V13.8z"
        />
      </svg>
    </div>
  );
}

// Spotify icon: green circle, no surrounding container per their rules.
export function SpotifyIcon({ size = 60 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-label="Spotify">
      <circle cx={12} cy={12} r={12} fill="#1ED760" />
      <path
        fill="#000"
        d="M17.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"
      />
    </svg>
  );
}

// Official-style "Listen on Apple Music" pill badge: black background,
// white text + white-on-red app-icon glyph. Matches Apple's supplied
// linking badge.
export function ListenOnAppleBadge({ height = 48 }: { height?: number }) {
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
        paddingLeft: 18,
        paddingRight: 22,
        color: "#fff",
      }}
      aria-label="Listen on Apple Music"
    >
      <AppleMusicAppIcon size={Math.round(height * 0.58)} />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
        <span style={{ fontSize: 10, opacity: 0.75, letterSpacing: 0.2 }}>Listen on</span>
        <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.2 }}>Apple Music</span>
      </div>
    </div>
  );
}

// Official-style "Listen on Spotify" pill badge: Spotify-green pill, white
// wordmark, leading green-on-black icon. Matches Spotify's linking guidance.
export function ListenOnSpotifyBadge({ height = 48 }: { height?: number }) {
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
        paddingLeft: 16,
        paddingRight: 22,
        color: "#000",
      }}
      aria-label="Listen on Spotify"
    >
      <SpotifyIcon size={Math.round(height * 0.6)} />
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
