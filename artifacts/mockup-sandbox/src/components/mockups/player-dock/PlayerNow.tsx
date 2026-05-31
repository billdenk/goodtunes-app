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
  <svg width="25" height="25" viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="3" width="4" height="18" rx="1" opacity={active ? 1 : 0.7} />
    <rect x="9" y="3" width="3" height="18" rx="1" opacity={active ? 1 : 0.7} />
    <rect x="14" y="3" width="7" height="11" rx="1" opacity={active ? 1 : 0.7} />
    <rect x="14" y="16" width="7" height="5" rx="1" opacity={active ? 1 : 0.7} />
  </svg>
);

const playlistsIcon = (active: boolean) => (
  <svg width="25" height="25" viewBox="0 0 24 24" fill="none">
    <path d="M3 6h18M3 10h14M3 14h8" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" />
    <path d="M17 14v6M14 17h6" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" />
  </svg>
);

const recentsIcon = (active: boolean) => (
  <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const searchIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

function NavItem({ label, icon, active, align = "left" }: {
  label: string;
  icon: (active: boolean) => React.ReactNode;
  active: boolean;
  align?: "left" | "right" | "center";
}) {
  const dir = align === "right" ? 1 : align === "left" ? -1 : 0;
  const pillLeft = dir === -1 ? "-6px" : dir === 1 ? "6px" : "-2px";
  const pillRight = dir === -1 ? "6px" : dir === 1 ? "-6px" : "-2px";
  const shift = dir === -1 ? "-6px" : dir === 1 ? "6px" : "0px";
  return (
    <button type="button" className="relative flex flex-col items-center gap-[2px] min-w-[86px]">
      <span
        aria-hidden
        className="absolute rounded-full"
        style={{
          background: active ? "rgba(49,158,216,0.18)" : "transparent",
          left: pillLeft, right: pillRight, top: "-3px", bottom: "-4px",
        }}
      />
      <div className="relative w-14 h-7 flex items-center justify-center" style={{ transform: `translateX(${shift})` }}>
        <div style={{ color: active ? BRAND_BLUE : "rgba(255,255,255,0.35)" }}>{icon(active)}</div>
      </div>
      <span
        className="relative text-[10px] font-medium"
        style={{ transform: `translateX(${shift})`, color: active ? BRAND_BLUE : "rgba(255,255,255,0.35)" }}
      >
        {label}
      </span>
    </button>
  );
}

export function PlayerNow() {
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

      {/* ===== bottom chrome (exact reconstruction) ===== */}

      {/* MiniPlayer — full-width capsule floating at bottom:79 */}
      <div className="absolute left-0 right-0 px-3" style={{ bottom: 79, zIndex: 30 }}>
        <div className="relative" style={{ borderRadius: 9999, ...glassStyle }}>
          <div className="flex items-center gap-3 pl-3 pr-3 py-1.5">
            <div className="flex-shrink-0" style={{ width: 32, height: 32, borderRadius: 6, background: "linear-gradient(140deg,#7F10A7,#319ED8)", boxShadow: "0 2px 8px rgba(0,0,0,0.45)" }} />
            <div className="flex-1 min-w-0">
              <p className="text-white text-[14px] font-semibold truncate leading-snug">Who I Am</p>
              <p className="text-white/55 text-[12px] truncate leading-snug">Nick Carter</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 text-white">
              <button type="button" className="w-9 h-9 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="4" width="4" height="16" rx="1.5" />
                  <rect x="15" y="4" width="4" height="16" rx="1.5" />
                </svg>
              </button>
              <button type="button" className="w-9 h-9 flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12z" />
                  <rect x="16" y="6" width="2" height="12" rx="1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* dock — three-tab pillow (left) + search circle (right), both at bottom:12 */}
      <div className="absolute left-0 right-0" style={{ bottom: 0, height: 80, zIndex: 40 }}>
        <nav
          className="absolute left-3 flex items-center justify-around px-2 py-2 rounded-full"
          style={{ bottom: 12, right: 76, ...glassStyle }}
        >
          <NavItem label="Collection" active icon={collectionIcon} align="left" />
          <NavItem label="Playlists" active={false} icon={playlistsIcon} align="center" />
          <NavItem label="Recents" active={false} icon={recentsIcon} align="right" />
        </nav>
        <button
          type="button"
          className="absolute right-3 flex items-center justify-center rounded-full text-white/80"
          style={{ bottom: 12, width: 56, height: 56, ...glassStyle }}
        >
          {searchIcon}
        </button>
      </div>
    </div>
  );
}
