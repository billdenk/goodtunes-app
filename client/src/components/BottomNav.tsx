import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { usePlayer } from "@/context/PlayerContext";
import { useTopChromeFrost } from "@/hooks/useTopChromeFrost";
import { subscribeChats } from "@/lib/chatStore";
import { useDesktopShell } from "@/hooks/useDesktopShell";
import { useFanSearch } from "@/hooks/useFanSearch";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import {
  RecentSearchedList,
  CompactPreview,
  FullResults,
} from "@/components/search/views";
import { ChromeScrim } from "@/components/ui/ChromeScrim";

/**
 * Bottom offset of the unified console card — it rests at a flat 12px from
 * the screen bottom so it floats just above the browser/home-indicator
 * chrome. Exported so the few callers that mirror the dock geometry stay in
 * sync with the console.
 */
export const DOCK_BOTTOM = "12px";

/**
 * Bottom padding every customer-shell scroll container must reserve so
 * content never slides under the floating console.
 *
 * The console rests at `DOCK_BOTTOM` (12px) and, with a now-playing row
 * (~68px) + hairline progress + 4-item nav row (~56px), tops out around
 * ~140px tall. We round to 170px for a safe gutter plus haptic breathing
 * room on devices with a chunky home indicator.
 */
export const NAV_CLEARANCE = 170;

// Task #1092 — the "Envisioned" unified bottom console. On mobile/tablet a
// single rounded glass card pinned at the bottom replaces the old split
// pieces (floating mini-player capsule + three-tab pillow + standalone
// search circle). The card stacks:
//   * a now-playing row (44px art · title/artist · heart/play-pause/skip)
//   * a hairline blue progress bar (full width, soft glow)
//   * a 4-item nav row (Collection · Playlists · Recents · Search)
// Search is the 4th nav item — it raises the same inline search overlay the
// old standalone circle did (we never navigate to a /search route on
// mobile; the keyboard is raised synchronously inside the tap gesture).
// Tapping the now-playing row (but not the transport buttons) opens the
// full Player. When nothing is playing the card collapses to nav-only.
//
// Locked dimensions:
//   * console corner radius = 28; nav icon = 24×24, label = 10px font.
//   * the top-anchored search field height = FIELD_H (52px).
// Desktop (lg+ web) keeps the StorefrontSidebar + bottom-right MiniPlayer —
// this whole component returns null there.

const FIELD_H = 52;

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
  const reduceMotion = useReducedMotion();
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-center gap-[3px] flex-1 py-1"
      data-testid={testId}
    >
      {active && (
        <span
          aria-hidden
          className="absolute rounded-xl"
          style={{ background: "rgba(49,158,216,0.15)", top: 0, bottom: 0, left: "12%", right: "12%" }}
        />
      )}
      <div className="relative z-10 flex items-center justify-center h-7">
        {/* Tab-to-tab bounce — the glyph gives a quick Apple-Music pop when
            its tab becomes active. Transform-only (GPU-cheap) and gated
            behind prefers-reduced-motion. */}
        <motion.div
          className={`transition-colors duration-150 ${active ? "text-[color:var(--brand-blue)]" : "text-fan-faint"}`}
          animate={reduceMotion ? { scale: 1 } : { scale: active ? [1, 1.22, 0.97, 1] : 1 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 0.4, times: [0, 0.4, 0.7, 1], ease: "easeOut" }
          }
        >
          {icon(active)}
        </motion.div>
      </div>
      <span
        className={`relative z-10 text-[10px] font-semibold tracking-wide ${active ? "text-[color:var(--brand-blue)]" : "text-fan-faint"}`}
      >
        {label}
      </span>
    </button>
  );
};

export function BottomNav() {
  const [location, navigate] = useLocation();
  const { currentSong, isPlaying, currentTime, duration, togglePlay, next, setShowPlayer, toggleFavorite, isFavorite } = usePlayer();
  const reduceMotion = useReducedMotion();
  // Task #547 — at lg+ on web the StorefrontSidebar + bottom-right
  // MiniPlayer take over. Native shell (Capacitor) always renders the
  // mobile console regardless of viewport.
  const isDesktop = useDesktopShell();

  // --- inline search state (Task #713) ---
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Randomized, non-credential field name so Safari/password managers
  // don't surface a saved-value / typed-history chip above the keyboard.
  const searchFieldName = useRef("gt-omnisearch-" + Math.random().toString(36).slice(2)).current;
  const search = useFanSearch({ onNavigate: () => setSearchOpen(false) });
  const { setDraft, setShowAll } = search;
  // How much of the viewport the keyboard covers while search is open —
  // 0 when no keyboard / API unavailable. Drives lifting the field above
  // the keyboard and constraining the results scroll region.
  const kbInset = useKeyboardInset(searchOpen);

  // The Chat tab is gone from the nav (Task #530) but the unread count
  // still lives in the chat store — surfaced as the dot on the
  // Collection avatar in Collection.tsx.
  useEffect(() => void subscribeChats(() => {}), []);

  // When the search collapses, clear the draft so reopening is a fresh
  // resting state. (setters are stable, safe deps.)
  useEffect(() => {
    if (!searchOpen) { setDraft(""); setShowAll(false); }
  }, [searchOpen, setDraft, setShowAll]);

  // Task #913 — publish "bottom-nav search owns the top frosted layer" so the
  // album chrome (top ChromeScrim band + share/⋯ capsule) drops its own
  // backdrop-filter while search is open, leaving exactly one frosted surface
  // in the top band (iOS-WebKit one-blur-per-region rule). The release is
  // lifecycle-timed: claim instantly on open, but hold the claim through the
  // top search field's own opacity exit fade on close.
  const { setSearchOwnsTop } = useTopChromeFrost();
  useEffect(() => {
    if (searchOpen) {
      setSearchOwnsTop(true);
      return;
    }
    const t = setTimeout(() => setSearchOwnsTop(false), reduceMotion ? 80 : 240);
    return () => clearTimeout(t);
  }, [searchOpen, reduceMotion, setSearchOwnsTop]);

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
      // Focus SYNCHRONOUSLY inside this tap gesture — the input is always
      // mounted (hidden at rest), so iOS raises the keyboard. A deferred
      // focus after a state flush would not.
      setSearchOpen(true);
      inputRef.current?.focus();
    }
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

  // Apple-style clock-face for Recents.
  const recentsIcon = (active: boolean) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.4" : "2"} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );

  const searchNavIcon = (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.6" : "2.2"} strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );

  // Close (×) glyph the Search tab swaps to while the overlay is open.
  const closeNavIcon = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );

  // Static search glyph for the top input's leading icon.
  const searchFieldIcon = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );

  // Frosted glass — kept thin (blur 14px, no saturate) per the iOS-WebKit
  // memo so it doesn't OOM the GPU on iPhone over a scrolling album grid.
  const glassStyle = {
    background: "rgba(20, 22, 38, 0.82)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 8px 36px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.08) inset",
  } as const;

  // Blur-free twin of glassStyle (opaque fill, no backdrop-filter). Used by
  // the console while search is open: the bottom ChromeScrim then owns the
  // region's single frosted layer, so the card must NOT add a second
  // backdrop-filter on top of it (iOS-WebKit stacked-blur rule).
  const solidDockStyle = {
    background: "rgba(20, 22, 38, 0.95)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 8px 36px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.08) inset",
  } as const;

  const favorited = currentSong ? isFavorite(currentSong.id) : false;
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <>
      {/* Results overlay — solid bg (NOT a second backdrop-blur, per the
          iOS-WebKit memo) so it sits cheaply over the scrolling page.
          z-20 keeps it below the console (z-40), so the now-playing row +
          search field stay visible above it. */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-20"
          style={{ background: "var(--brand-bg)" }}
          data-testid="overlay-search"
        >
          <div className="mx-auto h-full max-w-[390px] flex flex-col">
            {/* Scroll region flows DOWN from beneath the top-anchored
                search field. Top padding clears the safe-area inset + the
                field; bottom padding clears the keyboard inset. */}
            <div
              className="flex-1 overflow-y-auto scrollbar-hide"
              style={{
                paddingTop: `calc(env(safe-area-inset-top, 0px) + ${FIELD_H + 24}px)`,
                paddingBottom: Math.max(24, kbInset + 24),
              }}
            >
              {!search.query && (
                <RecentSearchedList
                  rows={search.recentSearches ?? []}
                  onPickEntity={search.onPickRecentEntity}
                  onPickQuery={search.onPickRecentQuery}
                  onClear={() => search.clearRecentSearches.mutate()}
                />
              )}
              {search.query && search.isFetching && !search.r && (
                <p className="text-fan-secondary text-sm text-center mt-8" data-testid="text-search-loading">Searching…</p>
              )}
              {search.query && search.r && search.counts.top === 0 && (
                <p className="text-fan-secondary text-sm text-center mt-8" data-testid="text-search-empty">No results for "{search.query}"</p>
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

      {/* ===== Unified bottom console ===== */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] z-40 px-3 pointer-events-none">
        {/* Shared chrome scrim behind the console: a soft navy gradient fade
            at rest so art scrolls cleanly under the card (no hard band),
            swapping in a single frosted blur band only while search is open.
            First child so it sits behind the card. */}
        <ChromeScrim
          edge="bottom"
          active={searchOpen}
          className="absolute inset-x-0 bottom-0 h-32"
        />

        <motion.div
          className="pointer-events-auto overflow-hidden flex flex-col"
          style={{
            marginBottom: DOCK_BOTTOM,
            borderRadius: 28,
            // Glass (own blur) at rest; blur-free fill while search is open so
            // the active ChromeScrim is the bottom region's only blur surface.
            ...(searchOpen ? solidDockStyle : glassStyle),
          }}
          initial={false}
          data-testid="mobile-console"
        >
          {/* Now-playing row — tapping it (anywhere but the transport
              cluster) opens the full Player. Only mounted when something is
              playing; otherwise the console is nav-only. */}
          {currentSong && (
            <>
              <div
                className="flex items-center gap-3 px-3 pt-3 pb-3 cursor-pointer active:bg-white/[0.03] transition-colors"
                onClick={() => setShowPlayer(true)}
                data-testid="console-nowplaying"
              >
                <img
                  src={currentSong.album.artwork}
                  alt={currentSong.album.title}
                  className="flex-shrink-0 object-cover"
                  style={{ width: 44, height: 44, borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[15px] font-bold tracking-tight truncate leading-tight" data-testid="text-console-title">{currentSong.title}</p>
                  <p className="text-fan-secondary text-[13px] truncate leading-tight mt-[1px]" data-testid="text-console-artist">{currentSong.album.artist}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 text-white" onClick={(e) => e.stopPropagation()}>
                  {/* Heart = favorite toggle. Per the design system, favorite
                      markers render in dimmed-white (filled = favorited,
                      hollow outline = not) — NOT heart-pink. */}
                  <button
                    type="button"
                    onClick={() => toggleFavorite(currentSong.id)}
                    aria-label={favorited ? "Unfavorite" : "Favorite"}
                    aria-pressed={favorited}
                    className="w-9 h-9 flex items-center justify-center mr-1 active:opacity-60 transition-opacity"
                    data-testid="button-console-favorite"
                  >
                    {favorited ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.55)">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={isPlaying ? "Pause" : "Play"}
                    className="w-11 h-11 flex items-center justify-center rounded-full bg-white/10 active:bg-white/20 transition-colors"
                    data-testid="button-console-playpause"
                  >
                    {isPlaying ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="5" y="4" width="4" height="16" rx="1.5" />
                        <rect x="15" y="4" width="4" height="16" rx="1.5" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 6.82v10.36c0 .79.87 1.27 1.54.84l8.14-5.18a1 1 0 000-1.69L9.54 5.98A.998.998 0 008 6.82z" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={next}
                    aria-label="Next track"
                    className="w-11 h-11 flex items-center justify-center rounded-full bg-transparent active:bg-white/10 transition-colors"
                    data-testid="button-console-next"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 18l8.5-6L6 6v12z" />
                      <rect x="16" y="6" width="2" height="12" rx="1" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Hairline progress — full width, soft blue glow. */}
              <div className="relative w-full h-[1px] bg-white/10" data-testid="console-progress">
                <div
                  className="absolute left-0 top-0 bottom-0 rounded-r-full"
                  style={{ width: `${progressPct}%`, background: "var(--brand-blue)", boxShadow: "0 0 8px rgba(49,158,216,0.6)" }}
                />
              </div>
            </>
          )}

          {/* Nav row — Collection · Playlists · Recents · Search. */}
          <nav
            className="flex items-center justify-around px-1 py-2"
            style={{ background: currentSong ? "rgba(255,255,255,0.02)" : "transparent" }}
          >
            <NavItem label="Collection" active={isLibrary && !searchOpen} onClick={() => { setSearchOpen(false); navigate("/collection"); }} icon={collectionIcon} testId="nav-collection" />
            <NavItem label="Playlists" active={isPlaylists && !searchOpen} onClick={() => { setSearchOpen(false); navigate("/playlists"); }} icon={playlistsIcon} testId="nav-playlists" />
            <NavItem label="Recents" active={isRecents && !searchOpen} onClick={() => { setSearchOpen(false); navigate("/recents"); }} icon={recentsIcon} testId="nav-recents" />
            <NavItem label="Search" active={searchOpen} onClick={onToggleSearch} icon={searchOpen ? () => closeNavIcon : searchNavIcon} testId="nav-search" />
          </nav>
        </motion.div>
      </div>

      {/* Top-anchored search field (Task #770) — sits under the
          status-bar / safe-area inset so the keyboard (which covers the
          bottom of the screen) never hides it. Always mounted so the
          Search tab can focus it synchronously inside the tap gesture
          (iOS keyboard); hidden + non-interactive at rest, slides down +
          fades in when search opens. z-40 keeps it above the results
          overlay (z-20). */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] z-40 px-3 pointer-events-none"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <div
          className="flex items-center rounded-full overflow-hidden"
          style={{
            height: FIELD_H,
            ...glassStyle,
            transformOrigin: "top center",
            opacity: searchOpen ? 1 : 0,
            transform: searchOpen ? "translateY(0)" : "translateY(-16px)",
            pointerEvents: searchOpen ? "auto" : "none",
            transition: "transform 300ms cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms ease",
          }}
        >
          <span className="pl-4 pr-2 text-fan-secondary flex-shrink-0">{searchFieldIcon}</span>
          <input
            ref={inputRef}
            type="search"
            name={searchFieldName}
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-autocomplete="none"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
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
      </div>
    </>
  );
}
