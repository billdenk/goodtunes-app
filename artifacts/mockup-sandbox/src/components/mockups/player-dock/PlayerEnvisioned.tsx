import React from "react";

const BRAND_BG = "#00062B";
const BRAND_BLUE = "#319ED8";

const ALBUMS = [
  { title: "Who I Am", artist: "Nick Carter", from: "#7F10A7", to: "#319ED8" },
  { title: "All American", artist: "Nick Carter", from: "#FF5470", to: "#FF7C06" },
  { title: "Now or Never", artist: "Nick Carter", from: "#319ED8", to: "#4AFFCA" },
  { title: "The Sequel", artist: "Various", from: "#4AFFCA", to: "#7F10A7" },
  { title: "Heartbreaker", artist: "Various", from: "#FF7C06", to: "#FF5470" },
  { title: "Midnight Blue", artist: "Various", from: "#00062B", to: "#319ED8" },
];

const glassStyle: React.CSSProperties = {
  background: "rgba(20, 22, 38, 0.82)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 8px 36px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.08) inset",
};

const collectionIcon = (active: boolean) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="3" width="4" height="18" rx="1" opacity={active ? 1 : 0.7} />
    <rect x="9" y="3" width="3" height="18" rx="1" opacity={active ? 1 : 0.7} />
    <rect x="14" y="3" width="7" height="11" rx="1" opacity={active ? 1 : 0.7} />
    <rect x="14" y="16" width="7" height="5" rx="1" opacity={active ? 1 : 0.7} />
  </svg>
);

const playlistsIcon = (active: boolean) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M3 6h18M3 10h14M3 14h8" stroke="currentColor" strokeWidth={active ? "2.4" : "2"} strokeLinecap="round" />
    <path d="M17 14v6M14 17h6" stroke="currentColor" strokeWidth={active ? "2.4" : "2"} strokeLinecap="round" />
  </svg>
);

const recentsIcon = (active: boolean) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.4" : "2"} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const searchIcon = (active: boolean) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.6" : "2.2"} strokeLinecap="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

function NavItem({ label, icon, active }: {
  label: string;
  icon: (active: boolean) => React.ReactNode;
  active: boolean;
}) {
  return (
    <button type="button" className="relative flex flex-col items-center gap-[3px] flex-1 py-1">
      {active && (
        <span
          aria-hidden
          className="absolute rounded-xl"
          style={{
            background: "rgba(49,158,216,0.15)",
            top: 0, bottom: 0, left: "10%", right: "10%",
          }}
        />
      )}
      <div className="relative z-10 flex items-center justify-center h-7">
        <div style={{ color: active ? BRAND_BLUE : "rgba(255,255,255,0.4)" }}>
          {icon(active)}
        </div>
      </div>
      <span
        className="relative z-10 text-[10px] font-semibold tracking-wide"
        style={{ color: active ? BRAND_BLUE : "rgba(255,255,255,0.4)" }}
      >
        {label}
      </span>
    </button>
  );
}

export function PlayerEnvisioned() {
  return (
    <div
      className="relative mx-auto overflow-hidden"
      style={{ width: 390, height: 844, background: BRAND_BG, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      {/* status bar */}
      <div className="flex items-center justify-between px-6 pt-3 text-white text-[13px] font-semibold">
        <span>9:41</span>
        <span className="opacity-80">●●● ▮</span>
      </div>

      {/* large header */}
      <div className="flex items-center justify-between px-5 pt-3 pb-2">
        <h1 className="text-white text-[30px] font-bold tracking-tight">Collection</h1>
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[13px] font-semibold" style={{ background: "linear-gradient(135deg,#7F10A7,#319ED8)" }}>NC</div>
      </div>

      {/* segmented tabs */}
      <div className="px-5 pb-3">
        <div className="flex p-[3px] rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
          {["Albums", "Songs", "Artists"].map((t, i) => (
            <div
              key={t}
              className="flex-1 text-center text-[13px] font-semibold py-[7px] rounded-full"
              style={i === 0 ? { background: "rgba(255,255,255,0.14)", color: "#fff" } : { color: "rgba(255,255,255,0.5)" }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>

      {/* album grid */}
      <div className="px-5 grid grid-cols-2 gap-4">
        {ALBUMS.map((a) => (
          <div key={a.title}>
            <div
              className="w-full aspect-square rounded-xl"
              style={{ background: `linear-gradient(140deg, ${a.from}, ${a.to})`, boxShadow: "0 6px 18px rgba(0,0,0,0.4)" }}
            />
            <p className="text-white text-[13px] font-semibold truncate mt-2">{a.title}</p>
            <p className="text-white/50 text-[12px] truncate">{a.artist}</p>
          </div>
        ))}
      </div>

      {/* ===== REIMAGINED BOTTOM CONSOLE ===== */}
      <div className="absolute left-3 right-3 overflow-hidden flex flex-col" style={{ bottom: 12, borderRadius: 28, ...glassStyle, zIndex: 40 }}>
        
        {/* Now Playing section */}
        <div className="flex items-center gap-3 px-3 pt-3 pb-3">
          <div className="relative flex-shrink-0" style={{ width: 44, height: 44, borderRadius: 10, background: "linear-gradient(140deg,#7F10A7,#319ED8)", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
            <div className="absolute inset-0 rounded-[10px] border border-white/20" />
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="text-white text-[15px] font-bold tracking-tight truncate leading-tight">Who I Am</p>
            <p className="text-white/60 text-[13px] truncate leading-tight mt-[1px]">Nick Carter</p>
          </div>
          
          <div className="flex items-center gap-1 flex-shrink-0 text-white">
            <button type="button" className="w-9 h-9 flex items-center justify-center mr-1 text-[#FF5470]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </button>

            <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 active:bg-white/20 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="4" width="4" height="16" rx="1.5" />
                <rect x="15" y="4" width="4" height="16" rx="1.5" />
              </svg>
            </button>
            <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-transparent active:bg-white/10 transition-colors">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12z" />
                <rect x="16" y="6" width="2" height="12" rx="1" />
              </svg>
            </button>
          </div>
        </div>

        {/* Progress bar integrated seamlessly */}
        <div className="relative w-full h-[1px] bg-white/10">
          <div className="absolute left-0 top-0 bottom-0 bg-[#319ED8] rounded-r-full" style={{ width: '42%', boxShadow: '0 0 8px rgba(49,158,216,0.6)' }} />
        </div>

        {/* Nav section */}
        <nav className="flex items-center justify-around px-1 py-2 bg-white/[0.02]">
          <NavItem label="Collection" active={true} icon={collectionIcon} />
          <NavItem label="Playlists" active={false} icon={playlistsIcon} />
          <NavItem label="Recents" active={false} icon={recentsIcon} />
          <NavItem label="Search" active={false} icon={searchIcon} />
        </nav>
      </div>

    </div>
  );
}
