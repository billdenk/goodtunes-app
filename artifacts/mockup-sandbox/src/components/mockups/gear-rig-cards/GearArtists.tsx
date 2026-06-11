import {
  FAN,
  RIGS,
  IMG,
  FanScreen,
  StatusBar,
  IconButton,
  SectionHeader,
  RigCard,
  MakerBadge,
  Avatar,
  PopularityCue,
  Chevron,
} from "./_shared";

// SCREEN 4 — Gear → "Artists who've used it" → rig. The flip side of the graph:
// start from a piece of gear and fan out to every artist whose rig includes it,
// each tappable through to their full setup (→ Rig detail). Built around a
// consumable (a string set) on purpose — it proves the same flow works for ANY
// gear node, not just the marquee '66 Telecaster.

type ArtistRow = {
  name: string;
  rig: string;
  label: string; // monthly listeners
  score: number; // 0–100 popularity
  photo?: string;
  mono?: string;
};

const ARTISTS: ArtistRow[] = [
  { name: "Fernando Perdomo", rig: "’66 Telecaster Rig", label: "1.2M", score: 92, photo: IMG("artist-fernando-live.jpg") },
  { name: "June Avila", rig: "Neon Strat Rig", label: "540K", score: 64, mono: "JA" },
  { name: "The Wilder Sons", rig: "Front Porch Rig", label: "410K", score: 57, mono: "WS" },
  { name: "Marco Reyes", rig: "Desert Tele Rig", label: "260K", score: 41, mono: "MR" },
  { name: "Sam Okafor", rig: "Lo-Fi Loop Rig", label: "120K", score: 28, mono: "SO" },
];

const stringsIcon = (
  <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden>
    <path d="M5 3 V21 M10 3 V21 M15 3 V21 M20 3 V21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export function GearArtists() {
  return (
    <FanScreen>
      <StatusBar />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 18px 10px" }}>
        <IconButton>
          <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden>
            <path d="M10 3 L5 8 L10 13" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconButton>
        <IconButton>
          <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 3 V15 M12 3 L8 7 M12 3 L16 7 M5 12 V20 H19 V12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconButton>
      </div>

      {/* Gear header */}
      <div style={{ padding: "0 20px" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 16,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, rgba(49,158,216,0.18), rgba(127,16,167,0.18))",
              border: `1px solid ${FAN.hairline}`,
              color: FAN.mint,
            }}
          >
            {stringsIcon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", color: FAN.textSecondary }}>
              Strings
            </div>
            <h1 style={{ margin: "5px 0 0", fontSize: 23, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.08 }}>
              Ernie Ball Regular Slinky
            </h1>
          </div>
        </div>
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <MakerBadge maker="Ernie Ball" mono="EB" />
          <span style={{ fontSize: 13, color: FAN.textSecondary }}>
            Used by <span style={{ color: "#fff", fontWeight: 600 }}>312 artists</span> on GoodTunes
          </span>
        </div>
      </div>

      {/* Featured rigs — ties straight back to Rig detail */}
      <div style={{ marginTop: 28 }}>
        <SectionHeader title="Featured rigs" inlineChevron />
        <div style={{ display: "flex", gap: 14, overflowX: "auto", padding: "0 20px 4px" }}>
          {RIGS.map((rig) => (
            <RigCard key={rig.id} rig={rig} width={210} height={280} />
          ))}
        </div>
      </div>

      {/* Artists who use these — each row opens that artist's rig */}
      <div style={{ marginTop: 30, paddingBottom: 44 }}>
        <SectionHeader title="Artists who use these" chevron={false} />
        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column" }}>
          {ARTISTS.map((a, i) => (
            <div
              key={a.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
                padding: "11px 0",
                borderTop: i === 0 ? "none" : `1px solid ${FAN.hairline}`,
              }}
            >
              <Avatar src={a.photo} mono={a.mono} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: -0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.name}
                </div>
                <div style={{ fontSize: 13, color: FAN.textSecondary, marginTop: 1 }}>{a.rig}</div>
              </div>
              <PopularityCue score={a.score} label={a.label} />
              <div style={{ marginLeft: 6, flexShrink: 0 }}>
                <Chevron color={FAN.textSecondary} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </FanScreen>
  );
}
