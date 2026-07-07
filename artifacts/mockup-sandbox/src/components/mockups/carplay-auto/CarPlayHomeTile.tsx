/**
 * CarPlay · Home Tile
 *
 * Simulates the CarPlay home app grid with the GoodTunes tile.
 * 800×480 landscape — standard car infotainment screen.
 */

const BG = "#0a0a0f";
const BRAND_ORANGE = "#FF7C06";
const BRAND_BG = "#00062B";

const APPS: { name: string; color: string; icon: () => React.ReactNode; highlight?: boolean }[] = [
  {
    name: "Maps",
    color: "#1a8c3c",
    icon: () => (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="10" fill="#1a8c3c" />
        <path d="M20 8C14.48 8 10 12.48 10 18c0 7.5 10 18 10 18s10-10.5 10-18c0-5.52-4.48-10-10-10zm0 13.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" fill="white" />
      </svg>
    ),
  },
  {
    name: "Phone",
    color: "#2c7be5",
    icon: () => (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="10" fill="#2c7be5" />
        <path d="M25.5 26.2l2.7-2.7c.4-.4.4-1 0-1.4l-3-3c-.4-.4-1-.4-1.4 0l-1.2 1.2c-1.4-.7-2.6-1.9-3.3-3.3l1.2-1.2c.4-.4.4-1 0-1.4l-3-3c-.4-.4-1-.4-1.4 0l-2.7 2.7c-.4.4-.4 1.1 0 1.5 3.4 4.2 7.4 8.2 11.6 11.6.4.4 1.1.4 1.5 0z" fill="white" />
      </svg>
    ),
  },
  {
    name: "Messages",
    color: "#34c759",
    icon: () => (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="10" fill="#34c759" />
        <path d="M20 8C13.37 8 8 12.48 8 18c0 3.34 1.87 6.3 4.77 8.18L12 30l4.27-1.7C17.43 28.74 18.7 29 20 29c6.63 0 12-4.48 12-10S26.63 8 20 8z" fill="white" />
      </svg>
    ),
  },
  {
    name: "Music",
    color: "#fc3158",
    icon: () => (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="10" fill="#fc3158" />
        <path d="M28 12v10.5c0 .28-.22.5-.5.5H18v6c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3c.55 0 1.06.15 1.5.41V14.5c0-.28.22-.5.5-.5h9c.28 0 .5.22.5.5v6.5h1c.28 0 .5-.22.5-.5V12h-1z" fill="white" />
      </svg>
    ),
  },
  {
    name: "GoodTunes",
    color: BRAND_BG,
    highlight: true,
    icon: () => (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="10" fill={BRAND_BG} />
        <text x="20" y="27" textAnchor="middle" fontSize="22" fontWeight="700" fontFamily="-apple-system, sans-serif" fill={BRAND_ORANGE}>G</text>
      </svg>
    ),
  },
  {
    name: "Podcasts",
    color: "#a855f7",
    icon: () => (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="10" fill="#a855f7" />
        <circle cx="20" cy="17" r="5" fill="none" stroke="white" strokeWidth="2" />
        <path d="M14 24.5c0-3.31 2.69-6 6-6s6 2.69 6 6" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <path d="M10 27c0-5.52 4.48-10 10-10s10 4.48 10 10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <rect x="18" y="29" width="4" height="4" rx="1" fill="white" />
      </svg>
    ),
  },
  {
    name: "Settings",
    color: "#8e8e93",
    icon: () => (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="10" fill="#8e8e93" />
        <circle cx="20" cy="20" r="4" fill="none" stroke="white" strokeWidth="2.5" />
        <path d="M20 9v3M20 28v3M9 20h3M28 20h3M12.2 12.2l2.1 2.1M25.7 25.7l2.1 2.1M12.2 27.8l2.1-2.1M25.7 14.3l2.1-2.1" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: "Now Playing",
    color: "#1c1c1e",
    icon: () => (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="10" fill="#1c1c1e" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <rect x="8" y="8" width="24" height="24" rx="5" fill="linear-gradient(135deg,#FF5470,#FF7C06)" />
        <defs>
          <linearGradient id="npg" x1="8" y1="8" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7F10A7" />
            <stop offset="1" stopColor="#319ED8" />
          </linearGradient>
        </defs>
        <rect x="8" y="8" width="24" height="24" rx="5" fill="url(#npg)" />
        <path d="M17 14l9 6-9 6V14z" fill="white" />
      </svg>
    ),
  },
];

function GridAppIcon({ app }: { app: typeof APPS[0] }) {
  return (
    <div className="flex flex-col items-center gap-2" style={{ width: 84 }}>
      <div
        className="relative"
        style={{
          width: 72,
          height: 72,
          borderRadius: 18,
          boxShadow: app.highlight
            ? `0 0 0 3px ${BRAND_ORANGE}, 0 8px 24px rgba(255,124,6,0.45)`
            : "0 4px 16px rgba(0,0,0,0.5)",
          transform: app.highlight ? "scale(1.06)" : "scale(1)",
          transition: "transform 0.15s",
        }}
      >
        <div style={{ width: 72, height: 72, borderRadius: 18, overflow: "hidden" }}>
          {app.icon()}
        </div>
        {app.highlight && (
          <div
            className="absolute inset-0"
            style={{
              borderRadius: 18,
              background: "rgba(255,124,6,0.08)",
            }}
          />
        )}
      </div>
      <span
        className="text-center text-[13px] font-medium"
        style={{
          color: app.highlight ? "#FF7C06" : "rgba(255,255,255,0.75)",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
          lineHeight: 1.2,
        }}
      >
        {app.name}
      </span>
    </div>
  );
}

export function CarPlayHomeTile() {
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
      {/* Ambient background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(49,158,216,0.06) 0%, transparent 70%)",
        }}
      />

      {/* System status bar */}
      <div
        className="relative flex items-center justify-between px-6"
        style={{ height: 40, background: "rgba(0,0,0,0.5)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* Left: CarPlay menu icon */}
        <button type="button" style={{ color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </button>

        {/* Center: time */}
        <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 15, fontWeight: 600, letterSpacing: 0.3 }}>
          2:47 PM
        </span>

        {/* Right: temp + signal */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
          <span>72°F</span>
          <svg width="18" height="14" viewBox="0 0 24 18" fill="currentColor">
            <path d="M2 14h2v4H2v-4zm4-4h2v8H6v-8zm4-4h2v12h-2V6zm4-4h2v16h-2V2zm4-2h2v18h-2V0z" fillOpacity="0.8" />
          </svg>
        </div>
      </div>

      {/* Main content: app grid */}
      <div
        className="flex flex-col"
        style={{
          padding: "28px 40px",
          height: "calc(100% - 40px)",
          justifyContent: "center",
        }}
      >
        {/* Section label */}
        <p style={{ color: "rgba(255,255,255,0.38)", fontSize: 12, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 20 }}>
          Apps
        </p>

        {/* 4-column × 2-row grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", rowGap: 24, columnGap: 16 }}>
          {APPS.map((app) => (
            <GridAppIcon key={app.name} app={app} />
          ))}
        </div>
      </div>

      {/* Bottom hint bar */}
      <div
        className="absolute left-0 right-0 bottom-0 flex items-center justify-center"
        style={{
          height: 36,
          background: "rgba(0,0,0,0.4)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
          Tap GoodTunes to launch
        </span>
      </div>

      {/* Selected GoodTunes label overlay */}
      <div
        className="absolute"
        style={{
          top: 40 + 28 + 20 + 72 + 26 + 18 + 24 + 72 + 16,
          left: 40 + 4 * 84 + 4 * 16 + 16,
          opacity: 0,
        }}
      />
    </div>
  );
}

export default CarPlayHomeTile;
