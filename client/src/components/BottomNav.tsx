import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

const NavItem = ({
  path,
  label,
  icon,
  active,
}: {
  path: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) => {
  const [, navigate] = useLocation();
  return (
    <button
      type="button"
      onClick={() => navigate(path)}
      className="flex flex-col items-center gap-[3px] min-w-[64px] py-1"
    >
      <div className={`transition-all duration-150 ${active ? "text-white scale-110" : "text-white/40"}`}>
        {icon}
      </div>
      <span
        className={`text-[10px] font-medium transition-colors duration-150 ${
          active ? "text-white" : "text-white/40"
        }`}
      >
        {label}
      </span>
    </button>
  );
};

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  return (
    <nav
      className="absolute bottom-0 left-0 right-0 z-40 flex items-start justify-around px-4 pt-3 pb-safe"
      style={{
        height: "83px",
        background: "rgba(0, 6, 43, 0.88)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderTop: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <NavItem
        path="/collection"
        label="Library"
        active={location === "/collection" || location === "/" || location.startsWith("/album")}
        icon={
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 4.5h2v15H3V4.5zm4.5 0h2v15h-2V4.5zm3.5 0h8a1 1 0 011 1v13a1 1 0 01-1 1H11V4.5z"
              fill="currentColor"
              opacity={location === "/collection" || location === "/" || location.startsWith("/album") ? "1" : "0.6"}
            />
          </svg>
        }
      />

      <NavItem
        path="/playlists"
        label="Playlists"
        active={location.startsWith("/playlist")}
        icon={
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 6h16M4 10h12M4 14h8M15 17l5-3-5-3v6z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        }
      />

      <NavItem
        path="/account"
        label="Account"
        active={location === "/account"}
        icon={
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
              location === "/account"
                ? "bg-white text-[#00062B]"
                : "bg-white/20 text-white"
            }`}
          >
            {initials}
          </div>
        }
      />
    </nav>
  );
}
