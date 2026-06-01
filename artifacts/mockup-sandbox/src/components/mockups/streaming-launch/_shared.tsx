import type { CSSProperties, ReactNode } from "react";
import spotifyLogo from "../../../assets/brand/spotify.svg";
import appleMusicLogo from "../../../assets/brand/apple-music.svg";
import tidalLogo from "../../../assets/brand/tidal.svg";
import qobuzLogo from "../../../assets/brand/qobuz.svg";
import deezerLogo from "../../../assets/brand/deezer.svg";
import pandoraLogo from "../../../assets/brand/pandora.svg";

// The album this launch sheet is announcing. Gradient art keeps the mockup
// self-contained (canvas iframes can't reach main-app /objects asset paths).
export const ALBUM = {
  title: "Paper Lanterns",
  artist: "Marigold Avenue",
  year: "2026",
};

export type ServiceId =
  | "spotify"
  | "apple_music"
  | "tidal"
  | "qobuz"
  | "deezer"
  | "pandora";

export interface Service {
  id: ServiceId;
  label: string;
  logo: string;
}

// Same order + official brand tiles the real fan surfaces use.
export const SERVICES: Service[] = [
  { id: "spotify", label: "Spotify", logo: spotifyLogo },
  { id: "apple_music", label: "Apple Music", logo: appleMusicLogo },
  { id: "tidal", label: "Tidal", logo: tidalLogo },
  { id: "qobuz", label: "Qobuz", logo: qobuzLogo },
  { id: "deezer", label: "Deezer", logo: deezerLogo },
  { id: "pandora", label: "Pandora", logo: pandoraLogo },
];

export function serviceById(id: ServiceId): Service {
  return SERVICES.find((s) => s.id === id) ?? SERVICES[0];
}

// Official brand tile — used as-supplied, never recolored.
export function SvcGlyph({ id, size = 56 }: { id: ServiceId; size?: number }) {
  const svc = serviceById(id);
  return (
    <img
      src={svc.logo}
      alt={svc.label}
      width={size}
      height={size}
      style={{ display: "block", flexShrink: 0, borderRadius: size * 0.22 }}
    />
  );
}

export function AlbumArt({ size = 96, radius }: { size?: number; radius?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.18),
        overflow: "hidden",
        boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
        background:
          "linear-gradient(135deg, #FF8A3D 0%, #E94A8C 35%, #7A5BE0 70%, #2BB7C5 100%)",
        flexShrink: 0,
      }}
    />
  );
}

export function CloseX({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-label="Close"
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        borderRadius: 999,
        background: "rgba(255,255,255,0.10)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        cursor: "pointer",
        flexShrink: 0,
        padding: 0,
      }}
    >
      <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true">
        <path
          d="M1.5 1.5 L10.5 10.5 M10.5 1.5 L1.5 10.5"
          stroke="#ffffff"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

// Dark Apple-Music-style sheet card. The launch flow renders all of its
// states inside this same card so transitions feel like one sheet morphing.
export function SheetCard({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 420,
        background: "#0E1334",
        color: "#fff",
        borderTopLeftRadius: 38,
        borderTopRightRadius: 38,
        paddingTop: 16,
        paddingBottom: 30,
        boxShadow: "0 -20px 60px rgba(0,0,0,0.6)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* grabber */}
      <div
        style={{
          width: 38,
          height: 5,
          borderRadius: 999,
          background: "rgba(255,255,255,0.22)",
          margin: "0 auto 4px",
        }}
      />
      <div style={{ position: "absolute", right: 22, top: 26 }}>
        <CloseX onClick={onClose} />
      </div>
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  tone = "white",
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "white" | "ghost";
} & React.HTMLAttributes<HTMLButtonElement>) {
  const isWhite = tone === "white";
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      style={{
        width: "100%",
        minHeight: 52,
        borderRadius: 16,
        border: isWhite ? "none" : "1px solid rgba(255,255,255,0.16)",
        background: isWhite ? "#ffffff" : "transparent",
        color: isWhite ? "#0B0E24" : "rgba(255,255,255,0.92)",
        fontSize: 16,
        fontWeight: 600,
        letterSpacing: -0.2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        cursor: "pointer",
        padding: "0 18px",
        transition: "transform 0.14s ease, background 0.14s ease, opacity 0.14s ease",
        ...(rest.style as CSSProperties),
      }}
    >
      {children}
    </button>
  );
}

export function captionStyle(): CSSProperties {
  return {
    fontSize: 12.5,
    fontWeight: 400,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
  };
}
