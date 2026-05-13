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
  // Apple Music-style: when active, the icon and label sit together inside a
  // single rounded pill. When inactive, the icon stacks above the label with
  // no background.
  if (active) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center justify-center min-w-[64px] py-1"
        data-testid={testId}
      >
        <div
          className="flex items-center gap-1.5 px-3 h-9 rounded-full transition-all duration-200 text-[#319ED8]"
          style={{ background: "rgba(49,158,216,0.18)" }}
        >
          {icon(true)}
          <span className="text-[12px] font-semibold leading-none">{label}</span>
        </div>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-[3px] min-w-[64px] py-1"
      data-testid={testId}
    >
      <div className="h-8 flex items-center justify-center text-white/35 transition-all duration-150">
        {icon(false)}
      </div>
      <span className="text-[10px] font-medium text-white/35 transition-colors duration-150">
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
      className="absolute bottom-0 left-0 right-0 z-40 flex items-start justify-around px-2 pt-2"
      style={{
        height: "83px",
        background: "rgba(0, 6, 43, 0.92)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        transform: hidden ? "translateY(100%)" : "translateY(0)",
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
