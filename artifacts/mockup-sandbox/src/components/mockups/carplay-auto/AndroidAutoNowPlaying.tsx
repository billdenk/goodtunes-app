/**
 * Android Auto · Now Playing
 *
 * Material Dark chrome with GoodTunes brand accent.
 * 800×480 — standard AAOS / car infotainment screen.
 */

const AUTO_BG = "#121212";
const AUTO_SURFACE = "#1e1e1e";
const AUTO_SURFACE2 = "#2a2a2a";
const BRAND_BLUE = "#319ED8";
const BRAND_PINK = "#FF5470";
const BRAND_BG = "#00062B";
const BRAND_ORANGE = "#FF7C06";
const AUTO_ACCENT = "#319ED8";  // GoodTunes blue as the Auto primary accent

const TRACK = {
  title: "Do I Have to Cry for You",
  artist: "Nick Carter",
  album: "Now or Never · 2002",
  elapsed: "1:42",
  remaining: "2:23",
  progress: 0.42,
  artFrom: "#7F10A7",
  artTo: "#319ED8",
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
        borderBottom: `1px solid rgba(255,255,255,0.06)`,
      }}
    >
      {/* Left: app icon + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 500, letterSpacing: 0.2 }}>GoodTunes</span>
      </div>

      {/* Center: time */}
      <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 500 }}>2:47 PM</span>

      {/* Right: signal + battery */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.5)" }}>
        <svg width="15" height="11" viewBox="0 0 24 18" fill="currentColor">
          <path d="M2 14h2v4H2v-4zm4-4h2v8H6v-8zm4-4h2v12h-2V6zm4-4h2v16h-2V2zm4-2h2v18h-2V0z" />
        </svg>
        <span style={{ fontSize: 12 }}>Bluetooth</span>
      </div>
    </div>
  );
}

function AutoBottomNav() {
  const items = [
    {
      label: "Home",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
      active: false,
    },
    {
      label: "Playing",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill={AUTO_ACCENT}>
          <circle cx="12" cy="12" r="10" fillOpacity="0.15" stroke={AUTO_ACCENT} strokeWidth="1.5" fill="none" />
          <polygon points="10,8 17,12 10,16" fill={AUTO_ACCENT} />
        </svg>
      ),
      active: true,
    },
    {
      label: "Library",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      ),
      active: false,
    },
    {
      label: "Search",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      ),
      active: false,
    },
  ];

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
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          style={{
            flex: 1,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            borderBottom: item.active ? `2px solid ${AUTO_ACCENT}` : "2px solid transparent",
          }}
        >
          {item.icon}
          <span
            style={{
              fontSize: 10,
              fontWeight: item.active ? 600 : 400,
              color: item.active ? AUTO_ACCENT : "rgba(255,255,255,0.4)",
              letterSpacing: 0.3,
            }}
          >
            {item.label}
          </span>
        </button>
      ))}
    </div>
  );
}

export function AndroidAutoNowPlaying() {
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

        {/* Left: Large album art */}
        <div
          style={{
            width: 340,
            flexShrink: 0,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Full-bleed art */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(140deg, ${TRACK.artFrom} 0%, ${TRACK.artTo} 100%)`,
            }}
          />
          {/* Gradient overlay toward right */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to right, rgba(18,18,18,0) 60%, rgba(18,18,18,0.95) 100%)",
            }}
          />
          {/* Subtle GT watermark */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ color: "rgba(255,255,255,0.08)", fontSize: 80, fontWeight: 700 }}>GT</span>
          </div>
        </div>

        {/* Right: Metadata + controls */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "24px 36px 20px 24px",
            gap: 0,
          }}
        >
          {/* Track metadata */}
          <div style={{ marginBottom: 4 }}>
            <p style={{ color: AUTO_ACCENT, fontSize: 11, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", margin: "0 0 8px" }}>
              Now Playing
            </p>
            <h2
              style={{
                color: "rgba(255,255,255,0.94)",
                fontSize: 22,
                fontWeight: 500,
                lineHeight: 1.2,
                margin: "0 0 6px",
                letterSpacing: -0.2,
              }}
            >
              {TRACK.title}
            </h2>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 15, margin: "0 0 3px", fontWeight: 400 }}>
              {TRACK.artist}
            </p>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, margin: 0 }}>
              {TRACK.album}
            </p>
          </div>

          {/* Scrubber */}
          <div style={{ marginTop: 20, marginBottom: 8 }}>
            <div
              style={{
                height: 3,
                borderRadius: 2,
                background: "rgba(255,255,255,0.12)",
                position: "relative",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${TRACK.progress * 100}%`,
                  background: AUTO_ACCENT,
                  borderRadius: 2,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: `${TRACK.progress * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: AUTO_ACCENT,
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>{TRACK.elapsed}</span>
              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>{TRACK.remaining}</span>
            </div>
          </div>

          {/* Transport controls */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            {/* Thumb down */}
            <button
              type="button"
              style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
              </svg>
            </button>

            {/* Previous */}
            <button type="button" style={{ width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.82)">
                <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
              </svg>
            </button>

            {/* Play/Pause — filled circle */}
            <button
              type="button"
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: AUTO_ACCENT,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 4px 20px rgba(49,158,216,0.45)`,
                flexShrink: 0,
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                <rect x="5" y="4" width="4" height="16" rx="1.5" />
                <rect x="15" y="4" width="4" height="16" rx="1.5" />
              </svg>
            </button>

            {/* Next */}
            <button type="button" style={{ width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.82)">
                <path d="M16 6h2v12h-2zm-3.5 6L4 6v12z" />
              </svg>
            </button>

            {/* Thumb up */}
            <button
              type="button"
              style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill={BRAND_PINK}>
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <AutoBottomNav />
    </div>
  );
}

export default AndroidAutoNowPlaying;
