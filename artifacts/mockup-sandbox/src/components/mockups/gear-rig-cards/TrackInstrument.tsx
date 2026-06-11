import { useState } from "react";
import type { ReactNode } from "react";
import {
  FAN,
  INSTRUMENT,
  IMG,
  FanScreen,
  StatusBar,
  IconButton,
  SectionHeader,
  MakerBadge,
  Chevron,
} from "./_shared";

// SCREEN 1 — Track-level instrument view. A fan tapped the guitar credit from a
// specific song ("What a Time"), so we land on the instrument with the whole
// story on ONE page: hero + maker nod + About, the full kit inline (no detour),
// the artist's own photos of this exact guitar, and a door through to every song
// it played on (→ Screen 2).

type KitPiece = { type: string; brand: string; hero?: boolean; icon: ReactNode };

const KIT: KitPiece[] = [
  {
    type: "Electric Guitar",
    brand: "1966 Fender Telecaster",
    hero: true,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M14 4 l6 6 -8 8 a3 3 0 1 1 -4 -4 z M4 20 l4 -4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    type: "Strings",
    brand: "Ernie Ball Regular Slinky",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M5 3 V21 M10 3 V21 M15 3 V21 M20 3 V21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: "Picks",
    brand: "Dunlop Tortex .73",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 3 C18 3 21 7 21 11 C21 17 15 21 12 21 C9 21 3 17 3 11 C3 7 6 3 12 3 Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    type: "Amp",
    brand: "1965 Fender Deluxe Reverb",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6 7 h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

const PHOTOS = [
  IMG("artist-fernando-live.jpg"),
  IMG("instrument-telecaster.png"),
  IMG("artist-fernando-perdomo.png"),
];

export function TrackInstrument() {
  const [expanded, setExpanded] = useState(false);

  return (
    <FanScreen>
      <StatusBar />

      {/* Top chrome bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "2px 18px 12px",
        }}
      >
        <IconButton>
          <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden>
            <path d="M10 3 L5 8 L10 13" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconButton>
        <div style={{ display: "flex", gap: 10 }}>
          <IconButton>
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 3 V15 M12 3 L8 7 M12 3 L16 7 M5 12 V20 H19 V12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
          <IconButton>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
              <path d="M6 3 H18 V21 L12 16 L6 21 Z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </IconButton>
        </div>
      </div>

      {/* Track-context kicker — makes the track-level entry explicit */}
      <div style={{ padding: "0 20px 14px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
            padding: "6px 13px 6px 6px",
            borderRadius: 999,
            background: FAN.card,
            border: `1px solid ${FAN.hairline}`,
          }}
        >
          <div style={{ width: 26, height: 26, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "#070b22" }}>
            <img src={IMG("album-guitar-as-a-voice.png")} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <span style={{ fontSize: 13, color: FAN.textSecondary }}>
            Heard on <span style={{ color: "#fff", fontWeight: 600 }}>“What a Time”</span>
          </span>
        </div>
      </div>

      {/* Instrument hero */}
      <div style={{ padding: "0 20px" }}>
        <div
          style={{
            width: "100%",
            aspectRatio: "16 / 10",
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 20px 48px rgba(0,0,0,0.5)",
            background: "#070b22",
          }}
        >
          <img src={INSTRUMENT.photo} alt={INSTRUMENT.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>

        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: FAN.textSecondary,
            }}
          >
            {INSTRUMENT.category}
          </div>
          <h1 style={{ margin: "6px 0 2px", fontSize: 27, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.1 }}>
            {INSTRUMENT.name}
          </h1>
          <div style={{ fontSize: 15, color: FAN.textSecondary, fontWeight: 500 }}>{INSTRUMENT.maker}</div>
          {/* Maker co-brand nod — small, near the gear, never over album artwork */}
          <div style={{ marginTop: 12 }}>
            <MakerBadge maker="Fender" mono="F" />
          </div>
        </div>

        {/* About + More */}
        <div style={{ marginTop: 18 }}>
          <p
            style={{
              margin: 0,
              fontSize: 15,
              lineHeight: 1.5,
              color: "rgba(235,235,245,0.78)",
              display: "-webkit-box",
              WebkitLineClamp: expanded ? "unset" : 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {INSTRUMENT.blurb}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{
              marginTop: 6,
              padding: 0,
              border: "none",
              background: "none",
              color: FAN.blue,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {expanded ? "Less" : "More"}
          </button>
        </div>
      </div>

      {/* The full kit — inline on the same page (no detour) */}
      <div style={{ marginTop: 28 }}>
        <SectionHeader title="The full kit" chevron={false} />
        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {KIT.map((p) => (
            <div
              key={p.type}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                background: p.hero
                  ? "linear-gradient(135deg, rgba(49,158,216,0.16), rgba(127,16,167,0.16))"
                  : FAN.card,
                border: `1px solid ${FAN.hairline}`,
                borderRadius: 16,
                padding: 14,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255,255,255,0.06)",
                  color: p.hero ? FAN.mint : FAN.blue,
                }}
              >
                {p.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: -0.2 }}>{p.type}</div>
                <div style={{ fontSize: 13, color: FAN.textSecondary, marginTop: 1 }}>{p.brand}</div>
              </div>
              {p.hero ? (
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: FAN.mint }}>
                  This guitar
                </span>
              ) : (
                <Chevron color={FAN.textSecondary} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Artist's own photos of this guitar */}
      <div style={{ marginTop: 30 }}>
        <SectionHeader title="Fernando’s photos" inlineChevron />
        <div style={{ padding: "0 20px 4px", display: "flex", gap: 12, overflowX: "auto" }}>
          {PHOTOS.map((src, i) => (
            <div
              key={i}
              style={{
                width: 220,
                height: 150,
                flexShrink: 0,
                borderRadius: 16,
                overflow: "hidden",
                background: "#070b22",
                boxShadow: "0 10px 26px rgba(0,0,0,0.4)",
              }}
            >
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          ))}
        </div>
        <p style={{ margin: "12px 20px 0", fontSize: 13, color: FAN.textSecondary, lineHeight: 1.4 }}>
          Shots Fernando uploaded of this exact guitar — the real thing, not a catalog stock photo.
        </p>
      </div>

      {/* Door to the songs this guitar played on (→ Screen 2) */}
      <div style={{ marginTop: 26, padding: "0 20px 44px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            background: FAN.card,
            border: `1px solid ${FAN.hairline}`,
            borderRadius: 16,
            padding: 16,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: -0.2 }}>Songs played on this guitar</div>
            <div style={{ fontSize: 13, color: FAN.textSecondary, marginTop: 1 }}>14 tracks · ranked by what fans stream most</div>
          </div>
          <Chevron color={FAN.textSecondary} />
        </div>
      </div>
    </FanScreen>
  );
}
