import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useNavVisibility } from "@/hooks/useNavVisibility";
import { subscribeChats, totalUnread } from "@/lib/chatStore";

const NavItem = ({
  label,
  icon,
  active,
  onClick,
  testId,
}: {
  label: string;
  icon: (active: boolean) => ReactNode;
  active: boolean;
  onClick: () => void;
  testId?: string;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      // Apple Music's tab bar wraps **icon + label** in the active pill,
      // not just the icon. We keep the icon box + label position identical
      // (w-14 h-8 centering wrapper, gap-[3px], py-1) and only relocate the
      // tinted bg from the inner icon box onto the outer column so the pill
      // grows to enclose both rows. Nothing moves; only the chip grows.
      //
      // Shape per Apple HIG: the active pill's long axis must run the
      // same direction as the bar's long axis (horizontal). At
      // min-w-[80px] × ~57px tall the pill becomes a horizontal capsule
      // — wider than tall, with the top and bottom reading slightly
      // flat (because width > height with rounded-full → semicircular
      // caps on the short sides, near-straight runs on the long sides),
      // which matches the bar's own oval. 80px is the safe ceiling: the
      // bar inner width is ~350px and four items at justify-around
      // need <=~87px each to keep visual gaps between them.
      className="flex flex-col items-center gap-[3px] min-w-[80px] py-1 rounded-full transition-colors duration-200"
      style={active ? { background: "rgba(49,158,216,0.18)" } : {}}
      data-testid={testId}
    >
      <div className="w-14 h-8 flex items-center justify-center">
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

  const { hidden, setHidden } = useNavVisibility();

  const isLibrary = location === "/collection" || location === "/" || location.startsWith("/album");
  const isPlaylists = location.startsWith("/playlist");
  const isChat = location.startsWith("/chat");
  const isAccount = location.startsWith("/account");

  const [unread, setUnread] = useState(() => totalUnread());
  useEffect(() => subscribeChats(() => setUnread(totalUnread())), []);

  const initials = user?.displayName
    ? user.displayName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const collectionIcon = (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="3" width="4" height="18" rx="1" opacity={active ? 1 : 0.7} />
      <rect x="9" y="3" width="3" height="18" rx="1" opacity={active ? 1 : 0.7} />
      <rect x="14" y="3" width="7" height="11" rx="1" opacity={active ? 1 : 0.7} />
      <rect x="14" y="16" width="7" height="5" rx="1" opacity={active ? 1 : 0.7} />
    </svg>
  );

  const playlistsIcon = (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 6h18M3 10h14M3 14h8" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" />
      <path d="M17 14v6M14 17h6" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" />
    </svg>
  );

  const chatIcon = (active: boolean) => (
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
  );

  const youIcon = (active: boolean) => (
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
  );

  // Compact (scrolled) state — Apple-style: only the active tab's icon stays
  // visible as a small pill anchored to the LEFT. Tapping it expands the bar.
  const glassStyle = {
    background: "rgba(28, 30, 48, 0.55)",
    backdropFilter: "blur(36px) saturate(200%)",
    WebkitBackdropFilter: "blur(36px) saturate(200%)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 8px 36px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.08) inset",
  } as const;

  if (hidden) {
    let activeIcon = collectionIcon;
    let activeLabel = "Collection";
    if (isPlaylists) { activeIcon = playlistsIcon; activeLabel = "Playlists"; }
    else if (isChat) { activeIcon = chatIcon; activeLabel = "Chat"; }
    else if (isAccount) { activeIcon = youIcon; activeLabel = "Account"; }

    return (
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] z-40 pointer-events-none">
        <button
          type="button"
          onClick={() => setHidden(false)}
          aria-label={`${activeLabel} (expand navigation)`}
          className="pointer-events-auto absolute bottom-3 left-3 flex items-center justify-center w-12 h-12 rounded-full text-[#319ED8] active:scale-95 transition-transform"
          style={glassStyle}
          data-testid="nav-collapsed"
        >
          {activeIcon(true)}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] z-40 pointer-events-none">
      <nav
        // py-3 (was py-2) gives the active pill ~12px breathing room top
        // and bottom within the bar — same proportion as Apple's tab bar
        // in Photos / Music, where the bar capsule is clearly visible
        // around the highlighted item rather than hugging it.
        className="pointer-events-auto absolute bottom-3 left-3 right-3 flex items-center justify-around px-2 py-3 rounded-full"
        style={{
          ...glassStyle,
          transition: "all 260ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <NavItem label="Collection" active={isLibrary} onClick={() => navigate("/collection")} icon={collectionIcon} />
        <NavItem label="Playlists" active={isPlaylists} onClick={() => navigate("/playlists")} icon={playlistsIcon} />
        <NavItem label="Chat" active={isChat} onClick={() => navigate("/chat")} testId="nav-chat" icon={chatIcon} />
        <NavItem label="Account" active={isAccount} onClick={() => navigate("/account")} testId="nav-you" icon={youIcon} />
      </nav>
    </div>
  );
}
