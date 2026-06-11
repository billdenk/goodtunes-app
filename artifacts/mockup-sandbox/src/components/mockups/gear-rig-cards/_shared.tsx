import type { CSSProperties, ReactNode } from "react";
import "./_group.css";

// ---------------------------------------------------------------------------
// GoodTunes fan chrome — shared bits for the "Rig card" gear exploration.
//
// This is a DESIGN DEMO. It mirrors the live fan InstrumentSheet chrome
// (navy brand-bg surface, 44pt glass IconButtons, Apple-Music large headers)
// and introduces a new "Rig card" concept rendered in Apple Music's
// "Top Picks for You" tall-card format.
// ---------------------------------------------------------------------------

export const FAN = {
  bg: "var(--brand-bg)",
  blue: "var(--brand-blue)",
  purple: "var(--brand-purple)",
  mint: "var(--brand-mint)",
  pink: "var(--brand-heart)",
  orange: "var(--brand-orange)",
  textPrimary: "#FFFFFF",
  textSecondary: "rgba(235,235,245,0.62)",
  textTertiary: "rgba(235,235,245,0.40)",
  hairline: "rgba(255,255,255,0.10)",
  card: "rgba(255,255,255,0.06)",
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const IMG = (file: string) => `${BASE}/images/${file}`;

// --- Demo data -------------------------------------------------------------

export const INSTRUMENT = {
  category: "Electric Guitar",
  name: "1966 Fender Telecaster",
  maker: "Fender",
  photo: IMG("instrument-telecaster.png"),
  blurb:
    "Fernando's road-worn '66 Telecaster — a butterscotch-blonde workhorse with the original single-coil bridge pickup. The relic'd nitro finish and ash body give it the bright, biting attack you hear cut through every solo on the record.",
};

export type Rig = {
  id: string;
  track: string; // line 1 — dynamic (this rig can back more than one track)
  artist: string; // line 2
  rigName: string; // line 3 — dynamic to context (rig name here, brand on a vendor page)
  photo: string;
};

export const RIGS: Rig[] = [
  {
    id: "what-a-time",
    track: "What a Time",
    artist: "Fernando Perdomo",
    rigName: "’66 Telecaster Rig",
    photo: IMG("artist-fernando-live.jpg"),
  },
  {
    id: "wings-to-fly",
    track: "Wings to Fly",
    artist: "Fernando Perdomo",
    rigName: "Studio Tele Rig",
    photo: IMG("artist-fernando-perdomo.png"),
  },
];

export type Accessory = {
  type: string;
  brand: string;
  name: string;
  icon: ReactNode;
};

// --- Layout shells ---------------------------------------------------------

// Full-screen fan surface. Navy with the soft brand glows the live app uses,
// capped at the 440px mobile column, centered with a faint device frame.
export function FanScreen({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#02030f",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          minHeight: "100vh",
          position: "relative",
          color: FAN.textPrimary,
          background:
            "radial-gradient(circle at 18% 0%, rgba(127,16,167,0.30), transparent 46%), radial-gradient(circle at 92% 12%, rgba(49,158,216,0.22), transparent 50%), var(--brand-bg)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function StatusBar({ dark = false }: { dark?: boolean }) {
  const c = dark ? "#000" : "#fff";
  return (
    <div
      style={{
        height: 52,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        padding: "0 26px 10px",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 600, color: c }}>9:41</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden>
          <rect x="0" y="7" width="3" height="5" rx="1" fill={c} />
          <rect x="5" y="4.5" width="3" height="7.5" rx="1" fill={c} />
          <rect x="10" y="2" width="3" height="10" rx="1" fill={c} />
          <rect x="15" y="0" width="3" height="12" rx="1" fill={c} opacity={0.4} />
        </svg>
        <svg width="22" height="12" viewBox="0 0 24 13" aria-hidden>
          <rect x="1" y="1" width="20" height="11" rx="3" fill="none" stroke={c} strokeWidth="1.2" opacity="0.6" />
          <rect x="2.6" y="2.6" width="14" height="7.8" rx="1.6" fill={c} />
          <rect x="22" y="4" width="1.6" height="5" rx="0.8" fill={c} opacity="0.6" />
        </svg>
      </div>
    </div>
  );
}

// Apple-style glass 44pt icon button (matches IconButton "glass" variant).
export function IconButton({
  children,
  onDark = true,
}: {
  children: ReactNode;
  onDark?: boolean;
}) {
  return (
    <button
      type="button"
      style={{
        width: 38,
        height: 38,
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: onDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.30)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        color: "#fff",
      }}
    >
      {children}
    </button>
  );
}

// Apple-Music section header: bold title + chevron.
// `inlineChevron` tucks the carat immediately right of the text (Apple's
// "tap the header to see all" affordance) so it doesn't compete with a
// right-edge chevron on the rows below.
export function SectionHeader({
  title,
  chevron = true,
  inlineChevron = false,
}: {
  title: string;
  chevron?: boolean;
  inlineChevron?: boolean;
}) {
  const heading = (
    <h3
      style={{
        margin: 0,
        fontSize: 22,
        fontWeight: 800,
        letterSpacing: -0.4,
        color: FAN.textPrimary,
      }}
    >
      {title}
    </h3>
  );

  if (inlineChevron) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "0 20px",
          marginBottom: 14,
        }}
      >
        {heading}
        {chevron && <Chevron size={19} color={FAN.textSecondary} />}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        marginBottom: 14,
      }}
    >
      {heading}
      {chevron && <Chevron size={17} color={FAN.textSecondary} />}
    </div>
  );
}

// Reseller logo placeholder — a glassy rounded tile with a serif monogram,
// standing in for a real shop wordmark (sits left of the shop name like the
// instrument thumbnail sits left of the guitar name).
export function ResellerLogo({
  mono,
  size = 46,
}: {
  mono: string;
  size?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))",
        border: `1px solid ${FAN.hairline}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
        color: "#fff",
        fontFamily: "'Georgia', 'Times New Roman', serif",
        fontWeight: 700,
        fontSize: mono.length > 1 ? size * 0.34 : size * 0.46,
        letterSpacing: mono.length > 1 ? 0 : 0.5,
      }}
    >
      {mono}
    </div>
  );
}

export function Chevron({
  size = 16,
  color = "rgba(255,255,255,0.5)",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path
        d="M6 3.5 L10.5 8 L6 12.5"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// --- The Rig card ----------------------------------------------------------
// Apple Music "Top Picks for You" tall card: full-bleed artist photo,
// bottom gradient scrim, three stacked lines bottom-left.
//   line 1 (track)  — small, ~80% white
//   line 2 (artist) — bold, white
//   line 3 (rig)    — small, ~80% white
export function RigCard({
  rig,
  width = 248,
  height = 330,
}: {
  rig: Rig;
  width?: number;
  height?: number;
}) {
  return (
    <div
      style={{
        width,
        height,
        flexShrink: 0,
        borderRadius: 16,
        overflow: "hidden",
        position: "relative",
        boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
        background: "#0b1030",
      }}
    >
      <img
        src={rig.photo}
        alt={rig.artist}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center 22%",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.30) 38%, rgba(0,0,0,0) 62%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 16,
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "rgba(255,255,255,0.85)",
            textShadow: "0 1px 6px rgba(0,0,0,0.6)",
          }}
        >
          {rig.track}
        </span>
        <span
          style={{
            fontSize: 21,
            fontWeight: 800,
            letterSpacing: -0.3,
            lineHeight: 1.12,
            color: "#fff",
            textShadow: "0 1px 8px rgba(0,0,0,0.6)",
          }}
        >
          {rig.artist}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "rgba(255,255,255,0.85)",
            textShadow: "0 1px 6px rgba(0,0,0,0.6)",
          }}
        >
          {rig.rigName}
        </span>
      </div>
    </div>
  );
}

// Maker brand-nod badge — a small, restrained co-brand chip standing in for the
// real maker wordmark. Bill is securing each maker's blessing, so this reads as
// a sanctioned "official maker" nod (mint verified tick), never decoration:
// tiny logo tile + name. Keep it near the gear, never over album artwork.
export function MakerBadge({
  maker,
  mono,
  floating = false,
}: {
  maker: string;
  mono?: string;
  floating?: boolean;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 11px 5px 5px",
        borderRadius: 999,
        background: floating ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.07)",
        border: `1px solid ${FAN.hairline}`,
        backdropFilter: floating ? "blur(16px)" : undefined,
        WebkitBackdropFilter: floating ? "blur(16px)" : undefined,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 7,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06))",
          border: `1px solid ${FAN.hairline}`,
          fontFamily: "'Georgia', 'Times New Roman', serif",
          fontWeight: 700,
          fontSize: 12,
          color: "#fff",
        }}
      >
        {mono ?? maker.slice(0, 1)}
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.2, color: "#fff" }}>
        {maker}
      </span>
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden style={{ marginLeft: -1 }}>
        <circle cx="12" cy="12" r="10" fill={FAN.mint} />
        <path
          d="M8 12.5 L11 15.5 L16.5 9"
          fill="none"
          stroke="#02030f"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// Streaming popularity cue — the catalog-scale signal we rank discovery by
// (Spotify/Deezer expose a 0–100 popularity score; our own play counts layer on
// as the platform grows). A tiny mint meter + a human-readable label.
export function PopularityCue({
  score,
  label,
}: {
  score: number; // 0–100
  label: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 5,
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 600, color: FAN.textSecondary }}>
        {label}
      </span>
      <div
        style={{
          width: 54,
          height: 4,
          borderRadius: 2,
          background: "rgba(255,255,255,0.12)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, score))}%`,
            height: "100%",
            borderRadius: 2,
            background: FAN.mint,
          }}
        />
      </div>
    </div>
  );
}

// Circular avatar — real photo when we have one, else a glassy monogram (same
// material as ResellerLogo) so placeholder artists read as clearly stand-in.
export function Avatar({
  src,
  mono,
  size = 46,
}: {
  src?: string;
  mono?: string;
  size?: number;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          objectFit: "cover",
          flexShrink: 0,
          background: "#070b22",
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))",
        border: `1px solid ${FAN.hairline}`,
        color: "#fff",
        fontFamily: "'Georgia', 'Times New Roman', serif",
        fontWeight: 700,
        fontSize: size * 0.36,
      }}
    >
      {mono}
    </div>
  );
}

export function pressFx(): CSSProperties {
  return { transition: "transform 0.15s ease, background 0.15s ease" };
}
