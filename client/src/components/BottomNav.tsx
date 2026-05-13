import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useNavVisibility } from "@/hooks/useNavVisibility";
import { subscribeChats, totalUnread } from "@/lib/chatStore";

const NavItem = ({
  path,
  label,
  icon,
  active,
  onClick,
  testId,
}: {
  path: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  active: boolean;
  onClick: () => void;
  testId?: string;
}) => {
  // Layout is identical for active and inactive — icon stacks above label,
  // always in the same position. The active state simply wraps a tinted pill
  // around the icon area (Apple-style highlight, no jumping).
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-[3px] min-w-[64px] py-1"
      data-testid={testId}
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

  const { hidden } = useNavVisibility();

  const isLibrary = location === "/collection" || location === "/" || location.startsWith("/album");
  const isPlaylists = location.startsWith("/playlist");
  const isChat = location.startsWith("/chat");
  const isAccount = location.startsWith("/account");

  const [unread, setUnread] = useState(() => totalUnread());
  useEffect(() => subscribeChats(() => setUnread(totalUnread())), []);

  const initials = user?.displayName
    ? user.displayName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <nav
      className="absolute bottom-4 left-3 right-3 z-40 flex items-center justify-around px-2 py-2 rounded-3xl"
      style={{
        background: "rgba(10, 18, 60, 0.82)",
        backdropFilter: "blur(28px) saturate(180%)",
        WebkitBackdropFilter: "blur(28px) saturate(180%)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)",
        transform: hidden ? "translateY(calc(100% + 16px))" : "translateY(0)",
        transition: "transform 260ms cubic-bezier(0.32, 0.72, 0, 1)",
        pointerEvents: hidden ? "none" : "auto",
      }}
    >
      <NavItem
        path="/collection"
        label="Collection"
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
        path="/chat"
        label="Chat"
        active={isChat}
        onClick={() => navigate("/chat")}
        testId="nav-chat"
        icon={(active) => (
          <div className="relative">
            <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "0" : "1.8"} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {unread > 0 && (
              <span
                className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                style={{ background: "#FF5470", border: "1.5px solid #00062B" }}
                aria-label={`${unread} unread`}
              >
                {unread}
              </span>
            )}
          </div>
        )}
      />

      <NavItem
        path="/account"
        label="You"
        active={isAccount}
        onClick={() => navigate("/account")}
        testId="nav-you"
        icon={(active) => (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
            style={{
              background: active ? "rgba(49,158,216,0.22)" : "rgba(255,255,255,0.10)",
              border: `1px solid ${active ? "rgba(49,158,216,0.55)" : "rgba(255,255,255,0.18)"}`,
              color: active ? "#319ED8" : "rgba(255,255,255,0.75)",
            }}
          >
            {initials}
          </div>
        )}
      />

    </nav>
  );
}
