/**
 * CarPlay · Now Playing
 *
 * Split layout: album art (left) + metadata/controls (right).
 * 800×480 — standard car infotainment screen.
 */

const BG = "#0a0a0f";
const BRAND_BLUE = "#319ED8";
const BRAND_PINK = "#FF5470";
const BRAND_ORANGE = "#FF7C06";
const BRAND_BG = "#00062B";

const TRACK = {
  title: "Do I Have to Cry for You",
  artist: "Nick Carter",
  album: "Now or Never",
  elapsed: "1:42",
  remaining: "-2:23",
  progress: 0.42,
  artFrom: "#7F10A7",
  artTo: "#319ED8",
};

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: "rgba(255,255,255,0.7)" }}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={BRAND_PINK}>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function ShuffleIcon({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? BRAND_BLUE : "rgba(255,255,255,0.45)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
    </svg>
  );
}

function RepeatIcon({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? BRAND_BLUE : "rgba(255,255,255,0.45)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

export function CarPlayNowPlaying() {
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
      {/* Ambient art-color glow bleeding from left */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: 0, top: 0, width: 420, height: "100%",
          background: `radial-gradient(ellipse 80% 90% at 30% 50%, rgba(127,16,167,0.22) 0%, transparent 70%)`,
        }}
      />

      {/* System status bar */}
      <div
        className="relative flex items-center justify-between px-5"
        style={{ height: 44, background: "rgba(0,0,0,0.55)", borderBottom: "1px solid rgba(255,255,255,0.06)", zIndex: 10 }}
      >
        <button type="button" style={{ color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", gap: 6 }}>
          <MenuIcon />
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

      {/* Main layout: art (left) + controls (right) */}
      <div style={{ display: "flex", height: "calc(100% - 44px)" }}>

        {/* Left: Album art */}
        <div
          style={{
            width: 436,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "28px 24px 28px 36px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 360,
              height: 360,
              borderRadius: 20,
              background: `linear-gradient(140deg, ${TRACK.artFrom} 0%, ${TRACK.artTo} 100%)`,
              boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 72, fontWeight: 700 }}>GT</span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, background: "rgba(255,255,255,0.07)", margin: "20px 0", flexShrink: 0 }} />

        {/* Right: Metadata + Controls */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "28px 36px 24px 32px",
            gap: 0,
          }}
        >
          {/* Heart + track info */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2
                style={{
                  color: "rgba(255,255,255,0.92)",
                  fontSize: 26,
                  fontWeight: 700,
                  lineHeight: 1.15,
                  margin: 0,
                  letterSpacing: -0.3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {TRACK.title}
              </h2>
              <p style={{ color: BRAND_BLUE, fontSize: 17, fontWeight: 500, margin: "5px 0 3px", letterSpacing: -0.1 }}>{TRACK.artist}</p>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 15, margin: 0 }}>{TRACK.album}</p>
            </div>
            <button type="button" style={{ marginLeft: 16, padding: 8, flexShrink: 0, marginTop: 2 }}>
              <HeartIcon filled />
            </button>
          </div>

          {/* Scrubber */}
          <div style={{ marginTop: 20, marginBottom: 10 }}>
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: "rgba(255,255,255,0.15)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${TRACK.progress * 100}%`,
                  background: `linear-gradient(90deg, ${BRAND_BLUE}, #4AFFCA)`,
                  borderRadius: 2,
                }}
              />
              {/* Thumb */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: `${TRACK.progress * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "white",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{TRACK.elapsed}</span>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{TRACK.remaining}</span>
            </div>
          </div>

          {/* Transport controls */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            {/* Shuffle */}
            <button type="button" style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ShuffleIcon />
            </button>

            {/* Previous */}
            <button type="button" style={{ width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.85)">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            {/* Play/Pause — larger */}
            <button
              type="button"
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.12)",
                border: "1.5px solid rgba(255,255,255,0.16)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.92)">
                <rect x="5" y="4" width="4" height="16" rx="1.5" />
                <rect x="15" y="4" width="4" height="16" rx="1.5" />
              </svg>
            </button>

            {/* Next */}
            <button type="button" style={{ width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.85)">
                <path d="M16 6h2v12h-2zm-3.5 6L4 6v12z" />
              </svg>
            </button>

            {/* Repeat */}
            <button type="button" style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <RepeatIcon active />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CarPlayNowPlaying;
