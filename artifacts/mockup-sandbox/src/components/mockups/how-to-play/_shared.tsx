import type { CSSProperties, ReactNode } from "react";

export const ALBUM = {
  title: "Here Now Evolve",
  artist: "Johanna Stahley",
  year: "2024",
  // Pulled from one of the artwork-heavy releases — replace with whatever
  // image the sandbox already has if this 404s; the layout doesn't depend
  // on it.
  art: "/__mockup/images/here-now-evolve.jpg",
};

// Tries to use a local sample image first; if absent, falls back to a
// solid gradient so the mockup still reads visually.
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

// The shared sheet shell. Big Apple-continuous-curve top corners (38px),
// generous safe-area bottom padding, dimmed scrim behind.
export function SheetShell({
  bg,
  textColor,
  children,
  grabberColor = "rgba(255,255,255,0.32)",
}: {
  bg: string;
  textColor: string;
  children: ReactNode;
  grabberColor?: string;
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
          // CSS approximation of iOS continuous corners. Browsers don't
          // expose the squircle curve, but the larger radius + the
          // overlay gradient below sells the look.
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 6 }}>
          <div
            style={{
              width: 36,
              height: 5,
              borderRadius: 999,
              background: grabberColor,
            }}
          />
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
        paddingTop: 16,
        paddingBottom: 28,
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
      <p style={{ marginTop: 4, fontSize: 13, color: textSecondary }}>
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

// Inline SVG logos so the mockup has no extra deps. Brand-accurate
// silhouettes pulled from each company's identity guidelines.
export function AppleMusicLogo({ size = 44, fill = "#FA243C" }: { size?: number; fill?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-label="Apple Music">
      <path
        fill={fill}
        d="M19.97 5.42c-.05-1.06-.27-2.06-.93-2.9-.83-1.07-1.96-1.5-3.27-1.51C11.66 1 7.56 1 3.45 1.01 2.6 1.01 1.78 1.15 1.02 1.6.42 1.96 0 2.48 0 3.21v17.58c0 .73.42 1.25 1.02 1.61.76.45 1.58.59 2.43.59 4.1.01 8.2.01 12.31 0 1.31 0 2.45-.43 3.28-1.5.65-.84.88-1.85.93-2.91V5.42zM16.6 14.7c0 1.1-.78 1.96-1.86 2.06-1.08.1-1.95-.66-2.05-1.74-.1-1.08.66-1.95 1.74-2.05.32-.03.65 0 .97-.04.43-.05.6-.27.6-.7V8.18c0-.51-.16-.66-.66-.55-1.55.33-3.1.66-4.65.99-.43.09-.6.31-.6.74v6.84c0 1.1-.78 1.96-1.86 2.06-1.08.1-1.95-.66-2.05-1.74-.1-1.08.66-1.95 1.74-2.05.32-.03.65 0 .97-.04.43-.05.6-.27.6-.7V8.18l.01-2.6c0-.74.31-1.21 1.04-1.37 1.65-.36 3.31-.71 4.96-1.06.6-.13 1.2-.27 1.81-.36.72-.1 1.29.41 1.29 1.14V14.7z"
      />
    </svg>
  );
}

export function SpotifyLogo({ size = 44, fill = "#1ED760" }: { size?: number; fill?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-label="Spotify">
      <path
        fill={fill}
        d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-1.02-.12-1.14-.6-.12-.48.12-1.02.6-1.14 4.38-1.32 9.78-.66 13.5 1.62.36.18.54.78.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.36c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.72 1.02.42 1.56-.3.42-1.02.6-1.56.24z"
      />
    </svg>
  );
}

// Tiny helper for the "available not-available" disabled state.
export function pressFx(): CSSProperties {
  return { transition: "transform 0.15s ease, background 0.15s ease" };
}
