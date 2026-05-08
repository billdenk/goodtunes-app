import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

const NavItem = ({
  path,
  label,
  icon,
  active,
  onClick,
}: {
  path: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  active: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-[3px] min-w-[64px] py-1"
    >
      <div
        className="w-14 h-8 flex items-center justify-center rounded-2xl transition-all duration-200"
        style={active ? { background: "rgba(49,158,216,0.18)" } : {}}
      >
        <div className={`transition-all duration-150 ${active ? "text-[#319ED8]" : "text-white/35"}`}>
          {icon(active)}
        </div>
      </div>
      <span
        className={`text-[10px] font-medium transition-colors duration-150 ${active ? "text-[#319ED8]" : "text-white/35"}`}
      >
        {label}
      </span>
    </button>
  );
};

export function BottomNav() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  const isLibrary = location === "/collection" || location === "/" || location.startsWith("/album");
  const isPlaylists = location.startsWith("/playlist");
  const isAccount = location === "/account";

  return (
    <nav
      className="absolute bottom-0 left-0 right-0 z-40 flex items-start justify-around px-2 pt-2"
      style={{
        height: "83px",
        background: "rgba(0, 6, 43, 0.92)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <NavItem
        path="/collection"
        label="Library"
        active={isLibrary}
        onClick={() => navigate("/collection")}
        icon={(active) => (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            {active ? (
              <>
                <rect x="3" y="3" width="4" height="18" rx="1" />
                <rect x="9" y="3" width="3" height="18" rx="1" />
                <rect x="14" y="3" width="7" height="11" rx="1" />
                <rect x="14" y="16" width="7" height="5" rx="1" />
              </>
            ) : (
              <>
                <rect x="3" y="3" width="4" height="18" rx="1" opacity="0.7" />
                <rect x="9" y="3" width="3" height="18" rx="1" opacity="0.7" />
                <rect x="14" y="3" width="7" height="11" rx="1" opacity="0.7" />
                <rect x="14" y="16" width="7" height="5" rx="1" opacity="0.7" />
              </>
            )}
          </svg>
        )}
      />

      <NavItem
        path="/playlists"
        label="Playlists"
        active={isPlaylists}
        onClick={() => navigate("/playlists")}
        icon={(active) => (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 6h18M3 10h14M3 14h8"
              stroke="currentColor"
              strokeWidth={active ? "2.2" : "1.8"}
              strokeLinecap="round"
            />
            <path
              d="M17 14v6M14 17h6"
              stroke="currentColor"
              strokeWidth={active ? "2.2" : "1.8"}
              strokeLinecap="round"
            />
          </svg>
        )}
      />

      <NavItem
        path="/account"
        label="Account"
        active={isAccount}
        onClick={() => navigate("/account")}
        icon={(active) => (
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
              active
                ? "text-[#319ED8] ring-2 ring-[#319ED8] ring-offset-1 ring-offset-transparent"
                : "text-white/40 ring-1 ring-white/20"
            }`}
            style={{ background: active ? "rgba(49,158,216,0.15)" : "rgba(255,255,255,0.08)" }}
          >
            {initials}
          </div>
        )}
      />
    </nav>
  );
}
