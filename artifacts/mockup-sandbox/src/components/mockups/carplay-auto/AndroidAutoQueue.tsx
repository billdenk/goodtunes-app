/**
 * Android Auto · Queue / Browse
 *
 * Auto list template with track rows, thumbnail + metadata pattern.
 * 800×480 — standard AAOS / car infotainment screen.
 */

const AUTO_BG = "#121212";
const AUTO_SURFACE = "#1e1e1e";
const BRAND_BLUE = "#319ED8";
const BRAND_BG = "#00062B";
const BRAND_ORANGE = "#FF7C06";

const ALBUM = {
  title: "Now or Never",
  artist: "Nick Carter",
  artFrom: "#7F10A7",
  artTo: "#319ED8",
  year: "2002",
  trackCount: 10,
};

const TRACKS = [
  { index: 1,  title: "Help Me",                     artist: "Nick Carter", duration: "3:45", playing: false },
  { index: 2,  title: "Who Needs the World",          artist: "Nick Carter", duration: "3:52", playing: false },
  { index: 3,  title: "My Revolution",                artist: "Nick Carter", duration: "3:38", playing: false },
  { index: 4,  title: "Don't Go",                     artist: "Nick Carter", duration: "4:12", playing: false },
  { index: 5,  title: "Do I Have to Cry for You",     artist: "Nick Carter", duration: "4:05", playing: true  },
  { index: 6,  title: "I Got You",                    artist: "Nick Carter", duration: "3:29", playing: false },
  { index: 7,  title: "Forever",                      artist: "Nick Carter", duration: "4:33", playing: false },
  { index: 8,  title: "Walk On Water",                artist: "Nick Carter", duration: "3:41", playing: false },
];

function PlayingBars() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2.5, height: 16, width: 16 }}>
      {[8, 14, 10, 13].map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: h,
            borderRadius: 1.5,
            background: BRAND_BLUE,
          }}
        />
      ))}
    </div>
  );
}

function AutoStatusBar() {
  return (
    <div
      style={{
        height: 36,
        background: AUTO_BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.7)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 5,
            background: BRAND_BG,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ color: BRAND_ORANGE, fontSize: 11, fontWeight: 700 }}>G</span>
        </div>
        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 500 }}>GoodTunes</span>
      </div>
      <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 500 }}>2:47 PM</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.5)" }}>
        <svg width="15" height="11" viewBox="0 0 24 18" fill="currentColor">
          <path d="M2 14h2v4H2v-4zm4-4h2v8H6v-8zm4-4h2v12h-2V6zm4-4h2v16h-2V2zm4-2h2v18h-2V0z" />
        </svg>
      </div>
    </div>
  );
}

function AutoBottomNav() {
  return (
    <div
      style={{
        height: 64,
        background: AUTO_SURFACE,
        borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
      }}
    >
      {[
        { label: "Home", active: false },
        { label: "Playing", active: false },
        { label: "Library", active: true },
        { label: "Search", active: false },
      ].map((item) => (
        <div
          key={item.label}
          style={{
            flex: 1,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            borderBottom: item.active ? `2px solid ${BRAND_BLUE}` : "2px solid transparent",
          }}
        >
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: item.active ? `rgba(49,158,216,0.15)` : "transparent" }} />
          <span
            style={{
              fontSize: 10,
              fontWeight: item.active ? 600 : 400,
              color: item.active ? BRAND_BLUE : "rgba(255,255,255,0.4)",
            }}
          >
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AndroidAutoQueue() {
  return (
    <div
      className="relative overflow-hidden select-none"
      style={{
        width: 800,
        height: 480,
        background: AUTO_BG,
        fontFamily: "'Google Sans', 'Roboto', -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <AutoStatusBar />

      {/* Content area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left panel: album summary + actions */}
        <div
          style={{
            width: 220,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            padding: "20px 16px",
            borderRight: "1px solid rgba(255,255,255,0.06)",
            gap: 14,
          }}
        >
          {/* Album art */}
          <div
            style={{
              width: 130,
              height: 130,
              borderRadius: 8,
              background: `linear-gradient(140deg, ${ALBUM.artFrom} 0%, ${ALBUM.artTo} 100%)`,
              boxShadow: "0 6px 20px rgba(0,0,0,0.55)",
              flexShrink: 0,
              alignSelf: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: BRAND_BG,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ color: BRAND_ORANGE, fontSize: 18, fontWeight: 700 }}>G</span>
            </div>
          </div>

          <div>
            <p style={{ color: "rgba(255,255,255,0.92)", fontSize: 14, fontWeight: 500, margin: "0 0 3px", lineHeight: 1.3 }}>{ALBUM.title}</p>
            <p style={{ color: BRAND_BLUE, fontSize: 12, margin: "0 0 2px" }}>{ALBUM.artist}</p>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, margin: 0 }}>{ALBUM.year} · {ALBUM.trackCount} tracks</p>
          </div>

          {/* Play All */}
          <button
            type="button"
            style={{
              width: "100%",
              padding: "10px 0",
              borderRadius: 24,
              background: BRAND_BLUE,
              color: "white",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              border: "none",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Play All
          </button>

          {/* Shuffle */}
          <button
            type="button"
            style={{
              width: "100%",
              padding: "9px 0",
              borderRadius: 24,
              background: "rgba(49,158,216,0.12)",
              border: `1px solid rgba(49,158,216,0.28)`,
              color: BRAND_BLUE,
              fontSize: 13,
              fontWeight: 500,
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Column headers */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 20px",
              height: 36,
              background: "rgba(255,255,255,0.025)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span style={{ width: 32, color: "rgba(255,255,255,0.25)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>#</span>
            <span style={{ flex: 1, color: "rgba(255,255,255,0.25)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>Title</span>
            <span style={{ width: 50, color: "rgba(255,255,255,0.25)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, textAlign: "right" }}>Time</span>
          </div>

          {/* Rows */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {TRACKS.map((track) => (
              <div
                key={track.index}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0 20px",
                  height: 50,
                  background: track.playing
                    ? "rgba(49,158,216,0.1)"
                    : "transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  cursor: "pointer",
                  gap: 12,
                }}
              >
                {/* Index / playing */}
                <div style={{ width: 32, display: "flex", alignItems: "center", justifyContent: "flex-start" }}>
                  {track.playing ? (
                    <PlayingBars />
                  ) : (
                    <span style={{ color: "rgba(255,255,255,0.28)", fontSize: 13 }}>{track.index}</span>
                  )}
                </div>

                {/* Small art thumbnail */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 5,
                    background: `linear-gradient(140deg, ${ALBUM.artFrom}, ${ALBUM.artTo})`,
                    flexShrink: 0,
                    opacity: track.playing ? 1 : 0.7,
                  }}
                />

                {/* Title + artist */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      color: track.playing ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.78)",
                      fontSize: 14,
                      fontWeight: track.playing ? 500 : 400,
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      lineHeight: 1.3,
                    }}
                  >
                    {track.title}
                  </p>
                  <p
                    style={{
                      color: track.playing ? BRAND_BLUE : "rgba(255,255,255,0.38)",
                      fontSize: 12,
                      margin: "2px 0 0",
                      lineHeight: 1.2,
                    }}
                  >
                    {track.artist}
                  </p>
                </div>

                {/* Duration */}
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, flexShrink: 0 }}>{track.duration}</span>

                {/* More button */}
                <button type="button" style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,0.25)">
                    <circle cx="5" cy="12" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                    <circle cx="19" cy="12" r="1.5" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AutoBottomNav />
    </div>
  );
}

export default AndroidAutoQueue;
