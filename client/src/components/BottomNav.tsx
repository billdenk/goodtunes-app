import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useNavVisibility } from "@/hooks/useNavVisibility";
import { subscribeChats, totalUnread } from "@/lib/chatStore";

/**
 * Bottom padding every customer-shell scroll container must reserve so
 * content never slides under the floating nav + mini-player stack.
 *
 * The nav itself sits at `bottom-3` (12px), is ~64px tall (py-2 + pill),
 * and the mini-player floats ~79px above the bar. Together they occupy
 * ~155px of the viewport bottom — we round to 170px for a safe gutter
 * plus haptic breathing room on devices with a chunky home indicator.
 */
export const NAV_CLEARANCE = 170;

// Task #530 — Apple-style split nav: a labeled three-tab pillow on the
// left (Collection · Playlists · Recents) + a standalone search circle
// on the right. Account avatar moved to the Collection top-right
// header; Chat tab pulled off the nav entirely (route still exists, the
// unread badge now lives on the Collection avatar dot).
//
// Locked dimensions — these come from the live spec and must not move:
//   * pillow height drives off py-2 + label/icon vertical stack (~64px)
//   * tab icon = 25×25, label = 10px font-medium
// If you change those, the visual rhythm in the dock breaks.

const NavItem = ({
  label,
  icon,
  active,
  onClick,
  testId,
  align = "left",
}: {
  label: string;
  icon: (active: boolean) => ReactNode;
  active: boolean;
  onClick: () => void;
  testId?: string;
  align?: "left" | "right" | "center";
}) => {
  const dir = align === "right" ? 1 : align === "left" ? -1 : 0;
  const pillLeft = dir === -1 ? "-4px" : dir === 1 ? "4px" : "-2px";
  const pillRight = dir === -1 ? "4px" : dir === 1 ? "-4px" : "-2px";
  const contentShift =
    dir === -1 ? "-translate-x-[4px]" : dir === 1 ? "translate-x-[4px]" : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-center gap-[2px] min-w-[86px]"
      data-testid={testId}
    >
      <span
        aria-hidden
        className="absolute rounded-full transition-colors duration-200"
        style={{
          background: active ? "rgba(49,158,216,0.18)" : "transparent",
          left: pillLeft,
          right: pillRight,
          top: "-3px",
          bottom: "-4px",
        }}
      />
      <div className={`relative w-14 h-7 flex items-center justify-center ${contentShift}`}>
        <div className={`transition-all duration-150 ${active ? "text-[#319ED8]" : "text-white/35"}`}>
          {icon(active)}
        </div>
      </div>
      <span
        className={`relative text-[10px] font-medium transition-colors duration-150 ${contentShift} ${active ? "text-[#319ED8]" : "text-white/35"}`}
      >
        {label}
      </span>
    </button>
  );
};

export function BottomNav() {
  const [location, navigate] = useLocation();
  const { hidden, setHidden } = useNavVisibility();

  const isLibrary =
    location === "/collection" || location === "/" || location.startsWith("/album");
  const isPlaylists = location.startsWith("/playlist");
  const isRecents = location.startsWith("/recents");
  const isSearch = location.startsWith("/search");

  // The Chat tab is gone from the nav (Task #530) but the unread count
  // still lives in the chat store — we surface it as the dot on the
  // Collection avatar in Collection.tsx. Subscribing here is no longer
  // needed; the avatar dot subscribes itself.
  useEffect(() => void subscribeChats(() => {}), []);

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

  // Apple-style clock-face for Recents. Hollow when inactive, filled
  // ring with a small hour-hand when active.
  const recentsIcon = (active: boolean) => (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );

  const searchIcon = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );

  // Frosted glass — kept thin (blur 14px, no saturate) per the
  // iOS-WebKit memo so stacking with MiniPlayer doesn't OOM the GPU
  // on iPhone 14 Pro over a scrolling album grid.
  const glassStyle = {
    background: "rgba(20, 22, 38, 0.82)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 8px 36px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.08) inset",
  } as const;

  // Collapsed (scrolled) state — just the active tab's icon as a small
  // 48×48 circle anchored to the LEFT. The MiniPlayer (when present)
  // sits between this pill and the standalone search circle on the
  // RIGHT. Tapping the tab circle expands the bar; the search circle
  // stays full-size in either state because Search is a destination,
  // not just a tab.
  if (hidden) {
    let activeIcon: (a: boolean) => ReactNode = collectionIcon;
    let activeLabel = "Collection";
    if (isPlaylists) { activeIcon = playlistsIcon; activeLabel = "Playlists"; }
    else if (isRecents) { activeIcon = recentsIcon; activeLabel = "Recents"; }

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
        <button
          type="button"
          onClick={() => navigate("/search")}
          aria-label="Search"
          className={`pointer-events-auto absolute bottom-3 right-3 flex items-center justify-center w-12 h-12 rounded-full active:scale-95 transition-transform ${isSearch ? "text-[#319ED8]" : "text-white/80"}`}
          style={glassStyle}
          data-testid="nav-search"
        >
          {searchIcon}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] z-40 pointer-events-none">
      {/* Left labeled pillow with three nav tabs. */}
      <nav
        className="pointer-events-auto absolute bottom-3 left-3 flex items-center justify-around px-2 py-2 rounded-full"
        style={{
          right: 72, // reserve room for the standalone right search circle
          ...glassStyle,
          transition: "all 260ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <NavItem label="Collection" active={isLibrary} onClick={() => navigate("/collection")} icon={collectionIcon} testId="nav-collection" />
        <NavItem label="Playlists" active={isPlaylists} onClick={() => navigate("/playlists")} icon={playlistsIcon} testId="nav-playlists" align="center" />
        <NavItem label="Recents" active={isRecents} onClick={() => navigate("/recents")} icon={recentsIcon} testId="nav-recents" align="right" />
      </nav>
      {/* Standalone right search circle. Apple Music keeps Search as a
          first-class destination at all times; we mirror that with a
          dedicated 56×56 circle (same height rhythm as the pillow,
          slightly larger than the collapsed-state pills). */}
      <button
        type="button"
        onClick={() => navigate("/search")}
        aria-label="Search"
        className={`pointer-events-auto absolute bottom-3 right-3 flex items-center justify-center w-14 h-14 rounded-full active:scale-95 transition-transform ${isSearch ? "text-[#319ED8]" : "text-white/80"}`}
        style={glassStyle}
        data-testid="nav-search"
      >
        {searchIcon}
      </button>
    </div>
  );
}
