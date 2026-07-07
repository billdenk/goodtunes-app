/**
 * CarPlay · Queue / Browse
 *
 * CarPlay list template showing the current album's track list.
 * 800×480 — standard car infotainment screen.
 */

const BG = "#0a0a0f";
const BRAND_BLUE = "#319ED8";
const BRAND_BG = "#00062B";
const BRAND_ORANGE = "#FF7C06";

const ALBUM = {
  title: "Now or Never",
  artist: "Nick Carter",
  artFrom: "#7F10A7",
  artTo: "#319ED8",
};

const TRACKS = [
  { index: 1,  title: "Help Me",                  duration: "3:45", playing: false },
  { index: 2,  title: "Who Needs the World",       duration: "3:52", playing: false },
  { index: 3,  title: "My Revolution",             duration: "3:38", playing: false },
  { index: 4,  title: "Don't Go",                  duration: "4:12", playing: false },
  { index: 5,  title: "Do I Have to Cry for You",  duration: "4:05", playing: true  },
  { index: 6,  title: "I Got You",                 duration: "3:29", playing: false },
  { index: 7,  title: "Forever",                   duration: "4:33", playing: false },
  { index: 8,  title: "Walk On Water",             duration: "3:41", playing: false },
  { index: 9,  title: "I'll Never Find Another You", duration: "3:55", playing: false },
  { index: 10, title: "Just One Kiss",             duration: "4:17", playing: false },
];

function PlayingBars() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 16, width: 14 }}>
      {[10, 14, 8, 12].map((h, i) => (
        <div
          key={i}
          style={{
            width: 2.5,
            height: h,
            borderRadius: 1.5,
            background: BRAND_BLUE,
          }}
        />
      ))}
    </div>
  );
}

export function CarPlayQueue() {
  return (
    <div
      className="relative overflow-hidden select-none"
      style={{
        width: 800,
        height: 480,
        background: BG,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif",
      }}
    >
      {/* System status bar */}
      <div
        className="relative flex items-center justify-between px-5"
        style={{ height: 44, background: "rgba(0,0,0,0.55)", borderBottom: "1px solid rgba(255,255,255,0.06)", zIndex: 10, flexShrink: 0 }}
      >
        <button type="button" style={{ color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", gap: 6 }}>
          {/* Back arrow */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>GoodTunes</span>
        </button>
        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: 600 }}>2:47 PM</span>
        <div style={{ display: "flex", alignItems: "center", gap: 14, color: "rgba(255,255,255,0.55)", fontSize: 13 }}>
          <span>72°F</span>
          <svg width="16" height="12" viewBox="0 0 24 18" fill="currentColor" fillOpacity="0.7">
            <path d="M2 14h2v4H2v-4zm4-4h2v8H6v-8zm4-4h2v12h-2V6zm4-4h2v16h-2V2zm4-2h2v18h-2V0z" />
          </svg>
        </div>
      </div>

      {/* Main layout: sidebar (left) + list (right) */}
      <div style={{ display: "flex", height: "calc(100% - 44px)" }}>

        {/* Left sidebar: album identity */}
        <div
          style={{
            width: 200,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px 20px",
            borderRight: "1px solid rgba(255,255,255,0.07)",
            gap: 14,
            flexShrink: 0,
          }}
        >
          {/* Art thumbnail */}
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 12,
              background: `linear-gradient(140deg, ${ALBUM.artFrom} 0%, ${ALBUM.artTo} 100%)`,
              boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: BRAND_BG,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ color: BRAND_ORANGE, fontSize: 16, fontWeight: 700 }}>G</span>
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <p style={{ color: "rgba(255,255,255,0.9)", fontSize: 15, fontWeight: 600, margin: 0, lineHeight: 1.3 }}>{ALBUM.title}</p>
            <p style={{ color: BRAND_BLUE, fontSize: 13, fontWeight: 500, margin: "4px 0 0" }}>{ALBUM.artist}</p>
          </div>

          {/* Shuffle all button */}
          <button
            type="button"
            style={{
              width: "100%",
              padding: "9px 0",
              borderRadius: 10,
              background: "rgba(49,158,216,0.18)",
              border: "1px solid rgba(49,158,216,0.3)",
              color: BRAND_BLUE,
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={BRAND_BLUE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
            </svg>
            Shuffle
          </button>
        </div>

        {/* Right: Track list */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* Section header */}
          <div
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
              {TRACKS.length} Tracks
            </span>
          </div>

          {/* Track rows */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {TRACKS.map((track, i) => (
              <div
                key={track.index}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0 20px",
                  height: 52,
                  background: track.playing
                    ? "rgba(49,158,216,0.1)"
                    : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  gap: 14,
                }}
              >
                {/* Index or playing indicator */}
                <div style={{ width: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {track.playing ? (
                    <PlayingBars />
                  ) : (
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, fontWeight: 500 }}>
                      {track.index}
                    </span>
                  )}
                </div>

                {/* Title */}
                <span
                  style={{
                    flex: 1,
                    fontSize: 15,
                    fontWeight: track.playing ? 600 : 400,
                    color: track.playing ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.78)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {track.title}
                </span>

                {/* Now playing accent dot */}
                {track.playing && (
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: BRAND_BLUE, flexShrink: 0 }} />
                )}

                {/* Duration */}
                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, flexShrink: 0, marginLeft: 4 }}>
                  {track.duration}
                </span>

                {/* Chevron */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CarPlayQueue;
