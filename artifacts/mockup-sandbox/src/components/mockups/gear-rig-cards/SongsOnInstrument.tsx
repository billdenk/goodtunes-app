import {
  FAN,
  INSTRUMENT,
  IMG,
  FanScreen,
  StatusBar,
  IconButton,
  PopularityCue,
} from "./_shared";

// SCREEN 2 — Instrument → "Songs played on this guitar," ranked by streaming
// popularity. This is the discovery payoff of the gear graph: the guitar node
// lists every track it touched, ordered by the popularity score we read from the
// streaming catalogs (then sharpened by our own play counts). A popularity floor
// keeps the marquee songs up top, with deep cuts tucked below the line.

type SongRow = {
  rank: number;
  title: string;
  artist: string;
  album: string;
  art: string;
  label: string; // streams
  score: number; // 0–100 popularity
};

const ABOVE: SongRow[] = [
  { rank: 1, title: "What a Time", artist: "Fernando Perdomo", album: "Out to Sea", art: IMG("album-guitar-as-a-voice.png"), label: "1.4M", score: 96 },
  { rank: 2, title: "Wings to Fly", artist: "Fernando Perdomo", album: "The Golden Hour", art: IMG("album-california-way.png"), label: "980K", score: 82 },
  { rank: 3, title: "Cosmos", artist: "Fernando Perdomo", album: "Out to Sea", art: IMG("sample-album-art.png"), label: "610K", score: 68 },
  { rank: 4, title: "California Way", artist: "Fernando Perdomo", album: "California Way", art: IMG("album-california-way.png"), label: "430K", score: 55 },
  { rank: 5, title: "Golden Hour", artist: "Fernando Perdomo", album: "The Golden Hour", art: IMG("album-guitar-as-a-voice.png"), label: "280K", score: 44 },
];

const BELOW: SongRow[] = [
  { rank: 6, title: "Tidepool", artist: "Fernando Perdomo", album: "B-Sides", art: IMG("sample-album-art.png"), label: "18K", score: 12 },
  { rank: 7, title: "Backmask", artist: "Fernando Perdomo", album: "B-Sides", art: IMG("album-california-way.png"), label: "7K", score: 6 },
];

function Row({ s, dim = false }: { s: SongRow; dim?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "10px 0", opacity: dim ? 0.5 : 1 }}>
      <span style={{ width: 18, textAlign: "center", fontSize: 14, fontWeight: 700, color: FAN.textTertiary, flexShrink: 0 }}>
        {s.rank}
      </span>
      <div style={{ width: 50, height: 50, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: "#070b22" }}>
        <img src={s.art} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: -0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {s.title}
        </div>
        <div style={{ fontSize: 13, color: FAN.textSecondary, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {s.artist} · {s.album}
        </div>
      </div>
      <PopularityCue score={s.score} label={s.label} />
    </div>
  );
}

export function SongsOnInstrument() {
  return (
    <FanScreen>
      <StatusBar />

      <div style={{ padding: "2px 18px 6px" }}>
        <IconButton>
          <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden>
            <path d="M10 3 L5 8 L10 13" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconButton>
      </div>

      {/* Header */}
      <div style={{ padding: "8px 20px 0", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 12, overflow: "hidden", flexShrink: 0, background: "#070b22" }}>
          <img src={INSTRUMENT.photo} alt={INSTRUMENT.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: FAN.textSecondary, fontWeight: 500 }}>{INSTRUMENT.name}</div>
          <h1 style={{ margin: "2px 0 0", fontSize: 26, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.08 }}>
            Played on this guitar
          </h1>
        </div>
      </div>
      <p style={{ margin: "10px 20px 0", fontSize: 13.5, color: FAN.textSecondary, lineHeight: 1.4 }}>
        Ranked by what fans are streaming most — popularity pulled from the catalogs, then sharpened by GoodTunes plays.
      </p>

      {/* Popularity floor control */}
      <div style={{ margin: "18px 20px 0", padding: 14, background: FAN.card, border: `1px solid ${FAN.hairline}`, borderRadius: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.1 }}>Popularity floor</span>
          <span style={{ fontSize: 12.5, color: FAN.mint, fontWeight: 600 }}>~50K streams</span>
        </div>
        <div style={{ position: "relative", height: 4, borderRadius: 2, background: "rgba(255,255,255,0.12)", marginTop: 12 }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "62%", borderRadius: 2, background: FAN.mint }} />
          <div
            style={{
              position: "absolute",
              left: "62%",
              top: "50%",
              width: 16,
              height: 16,
              marginLeft: -8,
              marginTop: -8,
              borderRadius: 999,
              background: "#fff",
              boxShadow: "0 1px 6px rgba(0,0,0,0.5)",
            }}
          />
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: FAN.textTertiary, lineHeight: 1.4 }}>
          Keeps the list to songs people are actually streaming. Slide down to surface deep cuts.
        </p>
      </div>

      {/* Above the floor */}
      <div style={{ padding: "10px 20px 0", display: "flex", flexDirection: "column" }}>
        {ABOVE.map((s) => (
          <Row key={s.rank} s={s} />
        ))}
      </div>

      {/* Below the floor */}
      <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, height: 1, background: FAN.hairline }} />
        <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: FAN.textTertiary }}>
          Below the floor
        </span>
        <div style={{ flex: 1, height: 1, background: FAN.hairline }} />
      </div>
      <div style={{ padding: "2px 20px 44px", display: "flex", flexDirection: "column" }}>
        {BELOW.map((s) => (
          <Row key={s.rank} s={s} dim />
        ))}
      </div>
    </FanScreen>
  );
}
