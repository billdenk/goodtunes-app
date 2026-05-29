import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useNavVisibility } from "@/hooks/useNavVisibility";
import { subscribeChats } from "@/lib/chatStore";
import { useDesktopShell } from "@/hooks/useDesktopShell";
import { useFanSearch } from "@/hooks/useFanSearch";
import {
  RecentSearchedList,
  CompactPreview,
  FullResults,
} from "@/components/search/views";

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
// on the right.
//
// Task #713 — the right circle is now an *inline* search control. At
// rest it's a circle the exact height of the pillow (flex-stretch +
// measured `dockH`), separated by a clear 8px gap. Tapping it expands a
// search field LEFTWARD in place (the pillow yields room) and raises a
// solid results overlay with Recently-Searched / live ranked results.
// Tapping again collapses back to the resting dock. We never navigate to
// a /search route on mobile any more — the keyboard is raised inside the
// tap gesture (the input stays mounted, just scaled to 0 at rest) which
// is the only reliable way to bring up the iOS keyboard.
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
        <div className={`transition-all duration-150 ${active ? "text-[color:var(--brand-blue)]" : "text-white/35"}`}>
          {icon(active)}
        </div>
      </div>
      <span
        className={`relative text-[10px] font-medium transition-colors duration-150 ${contentShift} ${active ? "text-[color:var(--brand-blue)]" : "text-white/35"}`}
      >
        {label}
      </span>
    </button>
  );
};

export function BottomNav() {
  const [location, navigate] = useLocation();
  const { hidden, setHidden } = useNavVisibility();
  // Task #547 — at lg+ on web the StorefrontSidebar takes over. Native
  // shell (Capacitor) always renders the bottom-nav pill regardless of
  // viewport.
  const isDesktop = useDesktopShell();

  // --- inline search state (Task #713) ---
  const [searchOpen, setSearchOpen] = useState(false);
  // Measured pillow height — the search circle + expanded field key off
  // this so they're pixel-identical to the tab pillow regardless of font
  // rendering, and the tab-bar height itself never changes.
  const [dockH, setDockH] = useState<number>();
  const pillowRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useFanSearch({ onNavigate: () => setSearchOpen(false) });
  const { setDraft, setShowAll } = search;

  // The Chat tab is gone from the nav (Task #530) but the unread count
  // still lives in the chat store — surfaced as the dot on the
  // Collection avatar in Collection.tsx.
  useEffect(() => void subscribeChats(() => {}), []);

  // Measure the resting pillow once it's on screen. Guarded so it only
  // sets state when the value actually changes (no render loop).
  useLayoutEffect(() => {
    if (!searchOpen && !hidden && pillowRef.current) {
      const h = pillowRef.current.offsetHeight;
      if (h && h !== dockH) setDockH(h);
    }
  });

  // When the dock collapses, clear the draft so reopening is a fresh
  // resting state. (setters are stable, safe deps.)
  useEffect(() => {
    if (!searchOpen) { setDraft(""); setShowAll(false); }
  }, [searchOpen, setDraft, setShowAll]);

  if (isDesktop) return null;

  const isLibrary =
    location === "/collection" || location === "/" || location.startsWith("/album");
  const isPlaylists = location.startsWith("/playlist");
  const isRecents = location.startsWith("/recents");

  const onToggleSearch = () => {
    if (searchOpen) {
      setSearchOpen(false);
      inputRef.current?.blur();
    } else {
      // Expand the dock first, then focus SYNCHRONOUSLY inside this tap
      // gesture — the input is already mounted (scaled to 0), so iOS
      // raises the keyboard. A deferred focus after navigation would not.
      setHidden(false);
      setSearchOpen(true);
      inputRef.current?.focus();
    }
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

  const closeIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
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

  const dockHVal = dockH ?? 56;
  // Right search/close circle: matches the pillow height at rest /
  // expanded; shrinks to the 48px scrolled-state puck only when the dock
  // is hidden AND search isn't open.
  const toggleSize = hidden && !searchOpen ? 48 : dockHVal;

  let activeIcon: (a: boolean) => ReactNode = collectionIcon;
  let activeLabel = "Collection";
  if (isPlaylists) { activeIcon = playlistsIcon; activeLabel = "Playlists"; }
  else if (isRecents) { activeIcon = recentsIcon; activeLabel = "Recents"; }

  return (
    <>
      {/* Results overlay — solid bg (NOT a second backdrop-blur, per the
          iOS-WebKit memo) so it sits cheaply over the scrolling page.
          z-20 keeps it below the MiniPlayer (z-30) and dock (z-40), so
          the now-playing strip + field stay visible above it. */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-20"
          style={{ background: "rgba(0,6,43,0.97)" }}
          data-testid="overlay-search"
        >
          <div className="mx-auto h-full max-w-[390px] flex flex-col">
            <div className="flex-1 overflow-y-auto scrollbar-hide pt-14 pb-[150px]">
              {!search.query && (
                <RecentSearchedList
                  rows={search.recentSearches ?? []}
                  onPickEntity={search.onPickRecentEntity}
                  onPickQuery={search.onPickRecentQuery}
                  onClear={() => search.clearRecentSearches.mutate()}
                />
              )}
              {search.query && search.isFetching && !search.r && (
                <p className="text-white/45 text-sm text-center mt-8" data-testid="text-search-loading">Searching…</p>
              )}
              {search.query && search.r && search.counts.top === 0 && (
                <p className="text-white/45 text-sm text-center mt-8" data-testid="text-search-empty">No results for "{search.query}"</p>
              )}
              {search.query && search.r && search.counts.top > 0 && !search.showAll && (
                <CompactPreview
                  suggestions={search.autocompleteSuggestions}
                  previewHits={search.unifiedHits.slice(0, 5)}
                  hasMore={search.unifiedHits.length > 5}
                  onPick={search.onPick}
                  onSuggest={search.onSuggest}
                  onShowAll={() => search.setShowAll(true)}
                />
              )}
              {search.query && search.r && search.counts.top > 0 && search.showAll && (
                <FullResults
                  results={search.r}
                  category={search.category}
                  categories={search.visibleCategories}
                  onCategory={search.setCategory}
                  onPick={search.onPick}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] z-40 pointer-events-none">
        {/* LEFT — collapsed active-tab puck (scrolled), shown only when
            the dock is hidden and search is closed. */}
        {hidden && !searchOpen && (
          <button
            type="button"
            onClick={() => setHidden(false)}
            aria-label={`${activeLabel} (expand navigation)`}
            className="pointer-events-auto absolute bottom-3 left-3 flex items-center justify-center w-12 h-12 rounded-full text-[color:var(--brand-blue)] active:scale-95 transition-transform"
            style={glassStyle}
            data-testid="nav-collapsed"
          >
            {activeIcon(true)}
          </button>
        )}

        {/* LEFT — labeled three-tab pillow (resting). Drives the measured
            dock height. Hidden while scrolled or while search is open. */}
        {!hidden && !searchOpen && (
          <nav
            ref={pillowRef}
            className="pointer-events-auto absolute bottom-3 left-3 flex items-center justify-around px-2 py-2 rounded-full"
            style={{
              right: dockHVal + 20, // reserve the right circle + 8px gap
              ...glassStyle,
              transition: "all 260ms cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            <NavItem label="Collection" active={isLibrary} onClick={() => navigate("/collection")} icon={collectionIcon} testId="nav-collection" />
            <NavItem label="Playlists" active={isPlaylists} onClick={() => navigate("/playlists")} icon={playlistsIcon} testId="nav-playlists" align="center" />
            <NavItem label="Recents" active={isRecents} onClick={() => navigate("/recents")} icon={recentsIcon} testId="nav-recents" align="right" />
          </nav>
        )}

        {/* Expanding search field — always mounted so the toggle can focus
            it synchronously (iOS keyboard). Scaled to 0 from the right at
            rest, grows leftward into the freed pillow space when open. */}
        <div
          className="pointer-events-auto absolute flex items-center rounded-full overflow-hidden"
          style={{
            bottom: 12,
            left: 12,
            right: dockHVal + 20,
            height: dockHVal,
            ...glassStyle,
            transformOrigin: "right center",
            transform: searchOpen ? "scaleX(1)" : "scaleX(0)",
            pointerEvents: searchOpen ? "auto" : "none",
            transition: "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          <span className="pl-4 pr-2 text-white/55 flex-shrink-0">{searchIcon}</span>
          <input
            ref={inputRef}
            type="text"
            value={search.draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Albums, songs, gear, vendors…"
            className="flex-1 min-w-0 bg-transparent border-0 py-0 pr-2 text-white placeholder-white/45 text-[15px] focus:outline-none"
            data-testid="input-search"
          />
          {search.draft && (
            <button
              type="button"
              onClick={() => setDraft("")}
              className="mr-3 w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.22)" }}
              data-testid="button-clear-search"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>

        {/* RIGHT — the search/close toggle. Diameter == pillow height so
            it reads as the same rhythm; tapping toggles the field. */}
        <button
          type="button"
          onClick={onToggleSearch}
          aria-label={searchOpen ? "Close search" : "Search"}
          className={`pointer-events-auto absolute bottom-3 right-3 flex items-center justify-center rounded-full active:scale-95 transition-transform ${searchOpen ? "text-[color:var(--brand-blue)]" : "text-white/80"}`}
          style={{ width: toggleSize, height: toggleSize, ...glassStyle }}
          data-testid="nav-search"
        >
          {searchOpen ? closeIcon : searchIcon}
        </button>
      </div>
    </>
  );
}
