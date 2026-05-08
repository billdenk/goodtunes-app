import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

const NavIcon = ({ path, label, children, active }: { path: string; label: string; children: React.ReactNode; active: boolean }) => {
  const [, navigate] = useLocation();
  return (
    <button
      type="button"
      onClick={() => navigate(path)}
      className="flex flex-col items-center gap-1 min-w-[60px]"
    >
      <div className={`transition-colors ${active ? "text-[#319ED8]" : "text-white/50"}`}>
        {children}
      </div>
      <span className={`text-[10px] font-medium transition-colors ${active ? "text-[#319ED8]" : "text-white/50"}`}>
        {label}
      </span>
    </button>
  );
};

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();

  const initials = user?.displayName
    ? user.displayName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <nav className="absolute bottom-0 left-0 right-0 z-40 h-[83px] bg-gradient-to-t from-[#00062B] to-[#00062B]/80 backdrop-blur-xl border-t border-white/10 flex items-start justify-around px-4 pt-3">
      <NavIcon path="/collection" label="Collection" active={location === "/collection" || location === "/"}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="8" height="8" rx="1.5" fill="currentColor" />
          <rect x="13" y="3" width="8" height="8" rx="1.5" fill="currentColor" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" fill="currentColor" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" fill="currentColor" />
        </svg>
      </NavIcon>

      <NavIcon path="/playlists" label="Playlists" active={location.startsWith("/playlist")}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M3 6h18M3 10h14M3 14h10M17 14v6M14 17h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </NavIcon>

      <NavIcon path="/account" label="Account" active={location === "/account"}>
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[9px] font-semibold transition-colors ${location === "/account" ? "border-[#319ED8] text-[#319ED8]" : "border-white/50 text-white/50"}`}>
          {initials}
        </div>
      </NavIcon>
    </nav>
  );
}
