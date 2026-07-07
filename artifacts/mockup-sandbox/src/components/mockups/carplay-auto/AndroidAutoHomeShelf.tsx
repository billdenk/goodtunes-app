/**
 * Android Auto · Home Shelf
 *
 * The GoodTunes "shelf" that appears on the Android Auto home screen:
 * a media-card strip showing Continue Listening + recents below it.
 * 800×480 — standard AAOS / car infotainment screen.
 */

const AUTO_BG = "#121212";
const AUTO_SURFACE = "#1e1e1e";
const AUTO_SURFACE2 = "#272727";
const BRAND_BLUE = "#319ED8";
const BRAND_BG = "#00062B";
const BRAND_ORANGE = "#FF7C06";

const RECENT_ALBUMS = [
  { title: "Now or Never",   artist: "Nick Carter",    artFrom: "#7F10A7", artTo: "#319ED8" },
  { title: "I'm Taking Off", artist: "Nick Carter",    artFrom: "#319ED8", artTo: "#4AFFCA" },
  { title: "All American",   artist: "Nick Carter",    artFrom: "#FF5470", artTo: "#FF7C06" },
  { title: "CALIFORNIALAND", artist: "Niina Soleil",   artFrom: "#4AFFCA", artTo: "#7F10A7" },
  { title: "The Sequel",     artist: "Various Artists", artFrom: "#FF7C06", artTo: "#FF5470" },
];

const NOW_PLAYING = {
  title: "Do I Have to Cry for You",
  artist: "Nick Carter",
  album: "Now or Never",
  artFrom: "#7F10A7",
  artTo: "#319ED8",
  progress: 0.42,
};

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
      {/* Left: clock */}
      <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 500 }}>2:47 PM</span>

      {/* Center: car-mode indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={BRAND_BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v5" />
          <circle cx="16" cy="17" r="1" />
          <circle cx="9" cy="17" r="1" />
        </svg>
        <span style={{ color: BRAND_BLUE, fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>ANDROID AUTO</span>
      </div>

      {/* Right: signal */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.5)" }}>
        <svg width="15" height="11" viewBox="0 0 24 18" fill="currentColor">
          <path d="M2 14h2v4H2v-4zm4-4h2v8H6v-8zm4-4h2v12h-2V6zm4-4h2v16h-2V2zm4-2h2v18h-2V0z" />
        </svg>
        <span style={{ fontSize: 12 }}>72°F</span>
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
        { label: "Home", active: true, icon: (
          <svg width="22" height="22" viewBox="0 0 24 24" fill={BRAND_BLUE}>
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
        )},
        { label: "Playing", active: false, icon: (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
            <polygon points="10,8 17,12 10,16" fill="rgba(255,255,255,0.4)" />
          </svg>
        )},
        { label: "Library", active: false, icon: (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        )},
        { label: "Search", active: false, icon: (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        )},
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
            gap: 4,
            borderBottom: item.active ? `2px solid ${BRAND_BLUE}` : "2px solid transparent",
          }}
        >
          {item.icon}
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

export function AndroidAutoHomeShelf() {
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

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* ── Continue Listening card (GoodTunes primary shelf) ── */}
        <div style={{ padding: "18px 24px 12px" }}>
          {/* Shelf header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: BRAND_BG,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ color: BRAND_ORANGE, fontSize: 12, fontWeight: 700 }}>G</span>
            </div>
            <span style={{ color: "rgba(255,255,255,0.92)", fontSize: 14, fontWeight: 600 }}>GoodTunes</span>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginLeft: 2 }}>·</span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Continue Listening</span>
          </div>

          {/* Now-playing hero card */}
          <div
            style={{
              background: AUTO_SURFACE2,
              borderRadius: 12,
              overflow: "hidden",
              display: "flex",
              alignItems: "stretch",
              height: 80,
              border: `1px solid rgba(49,158,216,0.18)`,
            }}
          >
            {/* Art */}
            <div
              style={{
                width: 80,
                flexShrink: 0,
                background: `linear-gradient(140deg, ${NOW_PLAYING.artFrom}, ${NOW_PLAYING.artTo})`,
                position: "relative",
              }}
            >
              {/* Playing indicator overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2.5, height: 18 }}>
                  {[10, 16, 8, 14].map((h, i) => (
                    <div key={i} style={{ width: 3, height: h, borderRadius: 1.5, background: "white" }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Metadata */}
            <div style={{ flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
              <p style={{ color: "rgba(255,255,255,0.92)", fontSize: 14, fontWeight: 500, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {NOW_PLAYING.title}
              </p>
              <p style={{ color: BRAND_BLUE, fontSize: 12, margin: "3px 0 8px" }}>
                {NOW_PLAYING.artist} · {NOW_PLAYING.album}
              </p>
              {/* Progress bar */}
              <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.12)", position: "relative", overflow: "hidden" }}>
                <div
                  style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: `${NOW_PLAYING.progress * 100}%`,
                    background: BRAND_BLUE,
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>

            {/* Play button */}
            <button
              type="button"
              style={{
                width: 80,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderLeft: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: BRAND_BLUE,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <rect x="5" y="4" width="4" height="16" rx="1.5" />
                  <rect x="15" y="4" width="4" height="16" rx="1.5" />
                </svg>
              </div>
            </button>
          </div>
        </div>

        {/* ── Recent Releases horizontal rail ── */}
        <div style={{ padding: "4px 24px 16px" }}>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600, letterSpacing: 1.1, textTransform: "uppercase", margin: "0 0 12px" }}>
            Recent Releases
          </p>

          <div style={{ display: "flex", gap: 14, overflowX: "auto" }}>
            {RECENT_ALBUMS.map((album) => (
              <button
                key={album.title}
                type="button"
                style={{
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  width: 108,
                }}
              >
                {/* Art tile */}
                <div
                  style={{
                    width: 108,
                    height: 108,
                    borderRadius: 10,
                    background: `linear-gradient(140deg, ${album.artFrom}, ${album.artTo})`,
                    boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
                    flexShrink: 0,
                  }}
                />
                <div style={{ textAlign: "left" }}>
                  <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 500, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: 108 }}>
                    {album.title}
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: 108 }}>
                    {album.artist}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Quick-action strip ── */}
        <div
          style={{
            padding: "10px 24px",
            display: "flex",
            gap: 12,
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {[
            { label: "My Library", icon: "♪" },
            { label: "Recently Played", icon: "↺" },
            { label: "Search", icon: "⌕" },
          ].map((action) => (
            <button
              key={action.label}
              type="button"
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                background: AUTO_SURFACE2,
                border: "1px solid rgba(255,255,255,0.07)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                color: "rgba(255,255,255,0.65)",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              <span style={{ fontSize: 16 }}>{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      </div>

      <AutoBottomNav />
    </div>
  );
}

export default AndroidAutoHomeShelf;
