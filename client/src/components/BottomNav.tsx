import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavVisibility } from "@/hooks/useNavVisibility";
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
 * Bottom offset shared by all three floating dock elements (collapsed
 * puck, three-tab pillow, search/close toggle). Rests 12px from the
 * screen bottom so the dock sits tightly stacked under the mini-player
 * (which floats 79px up). The earlier "+24px" attempt added a FLAT inset
 * on every device, which pushed the bar up out of the stack and read as
 * detached/crooked. `env(safe-area-inset-bottom)` is the correct fix:
 * it's 0 on a normal browser / non-notch device (so the desktop + web
 * layout is byte-identical) and only adds the real home-indicator height
 * inside the iOS native webview, where 12px-from-true-bottom otherwise
 * tucked the dock under the home indicator. The mini-player adds the same
 * inset so the whole stack lifts together and the gap stays constant.
 */
export const DOCK_BOTTOM = "calc(12px + env(safe-area-inset-bottom, 0px))";

/**
 * Bottom padding every customer-shell scroll container must reserve so
 * content never slides under the floating nav + mini-player stack.
 *
 * The nav sits at `DOCK_BOTTOM` (12px), is ~64px tall (py-2 + pill), and
 * the mini-player floats ~79px above the bar. Together they occupy ~155px
 * of the viewport bottom — we round to 170px for a safe gutter plus haptic
 * breathing room on devices with a chunky home indicator.
 */
export const NAV_CLEARANCE = 170;

// Task #530 / #1376 — Apple-style split nav: a labeled three-tab pillow on
// the left (Home · Collection · Recents) + a standalone search circle on the
// right. Playlists is no longer a top-level tab — it folds under Collection
// (the Apple-Library landing list).
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
  const reduceMotion = useReducedMotion();
  const dir = align === "right" ? 1 : align === "left" ? -1 : 0;
  // End tabs nudge the highlight 2px toward the dock's outer curve so the
  // gap to the end curve matches the inner gap (Collection left, Recents
  // right). Both edges shift by the same 2px, so the pill's width/radius
  // stay identical to before — this is a pure horizontal offset.
  const pillLeft = dir === -1 ? "-6px" : dir === 1 ? "6px" : "-2px";
  const pillRight = dir === -1 ? "6px" : dir === 1 ? "-6px" : "-2px";
  const contentShift =
    dir === -1 ? "-translate-x-[6px]" : dir === 1 ? "translate-x-[6px]" : "";
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
        {/* Tab-to-tab bounce — the glyph gives a quick Apple-Music pop when
            its tab becomes active (the keyframe only re-fires when `active`
            flips false→true). Transform-only (GPU-cheap) and gated behind
            prefers-reduced-motion so reduced users get an instant color
            change with no scale. Lives on the no-translate inner div so it
            never clobbers the contentShift transform on the parent. */}
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
        className={`relative text-[10px] font-medium transition-colors duration-150 ${contentShift} ${active ? "text-[color:var(--brand-blue)]" : "text-fan-faint"}`}
      >
        {label}
      </span>
    </button>
  );
};

export function BottomNav() {
  const [location, navigate] = useLocation();
  const { hidden, setHidden } = useNavVisibility();
  const reduceMotion = useReducedMotion();
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
  // Randomized, non-credential field name so Safari/password managers
  // don't surface a saved-value / typed-history chip (e.g. the
  // "my.goodtunes.music" autofill bar) above the keyboard.
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

  // Measure the resting pillow once it's on screen. We lock onto the
  // first real measurement, then only react to *meaningful* changes
  // (orientation, font swap). Sub-pixel/±1px flips — which an active-tab
  // stroke-weight change can introduce on re-measure — are ignored so
  // the reserved right-side space (and thus the justify-around tab
  // spacing) never oscillates as you switch tabs. Functional updater
  // keeps this dependency-free without a render loop.
  useLayoutEffect(() => {
    if (!searchOpen && !hidden && pillowRef.current) {
      const h = pillowRef.current.offsetHeight;
      if (!h) return;
      setDockH((prev) => (prev == null || Math.abs(h - prev) > 1 ? h : prev));
    }
  });

  // When the dock collapses, clear the draft so reopening is a fresh
  // resting state. (setters are stable, safe deps.)
  useEffect(() => {
    if (!searchOpen) { setDraft(""); setShowAll(false); }
  }, [searchOpen, setDraft, setShowAll]);

  // Task #913 — publish "bottom-nav search owns the top frosted layer" so the
  // album chrome (top ChromeScrim band + share/⋯ capsule) drops its own
  // backdrop-filter while search is open, leaving exactly one frosted surface
  // in the top band (iOS-WebKit one-blur-per-region rule). The release is
  // lifecycle-timed, not flag-timed: claim instantly on open, but hold the
  // claim through the top search field's own opacity exit fade (220ms /
  // ~80ms reduced) on close — otherwise the album chrome would re-blur while
  // the search field is still fading out and the two briefly coexist.
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

  // Home owns the owned-albums grid (`/home`), the bare root redirect, and
  // album detail (albums are opened from the Home grid).
  const isHome =
    location === "/home" || location === "/" || location.startsWith("/album");
  // Collection owns the Apple-Library landing + its Songs/Artists detail
  // views, and Playlists folds under it now that it's lost its own tab.
  const isCollection =
    location === "/collection" ||
    location.startsWith("/collection/") ||
    location.startsWith("/playlist");
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

  // Apple-style house for Home. Hollow stroke when inactive, heavier stroke
  // when active (matches the Recents clock's active/inactive treatment).
  const homeIcon = (active: boolean) => (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.7L12 3.5l9 7.2" />
      <path d="M5.2 9.4V20.5h4.6v-6.3h4.4v6.3h4.6V9.4" />
    </svg>
  );

  // Stacked bars (an Apple-Library "collection" mark) for Collection.
  const collectionIcon = (active: boolean) => (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="3" width="4" height="18" rx="1" opacity={active ? 1 : 0.7} />
      <rect x="9" y="3" width="3" height="18" rx="1" opacity={active ? 1 : 0.7} />
      <rect x="14" y="3" width="7" height="11" rx="1" opacity={active ? 1 : 0.7} />
      <rect x="14" y="16" width="7" height="5" rx="1" opacity={active ? 1 : 0.7} />
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

  // Blur-free twin of glassStyle (opaque fill, no backdrop-filter). Used by the
  // search/close toggle while search is open: the bottom ChromeScrim then owns
  // the region's single frosted layer, so the toggle must NOT add a second
  // backdrop-filter on top of it (iOS-WebKit stacked-blur rule).
  const solidDockStyle = {
    background: "rgba(20, 22, 38, 0.95)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 8px 36px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.08) inset",
  } as const;

  const dockHVal = dockH ?? 56;
  // Right search/close circle: matches the pillow height at rest /
  // expanded; shrinks to the 48px scrolled-state puck only when the dock
  // is hidden AND search isn't open.
  const toggleSize = hidden && !searchOpen ? 48 : dockHVal;

  let activeIcon: (a: boolean) => ReactNode = homeIcon;
  let activeLabel = "Home";
  if (isCollection) { activeIcon = collectionIcon; activeLabel = "Collection"; }
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
          style={{ background: "var(--brand-bg)" }}
          data-testid="overlay-search"
        >
          <div className="mx-auto h-full max-w-[390px] flex flex-col">
            {/* Scroll region flows DOWN from beneath the top-anchored
                search field (Task #770). Top padding clears the safe-area
                inset + the field (its 12px top offset + height + a 12px
                gap) so the first row sits just under the pill. Bottom
                padding clears the keyboard inset so the last rows aren't
                hidden behind the keyboard; falls back to a small gutter
                when no keyboard is up. */}
            <div
              className="flex-1 overflow-y-auto scrollbar-hide"
              style={{
                paddingTop: `calc(env(safe-area-inset-top, 0px) + ${dockHVal + 24}px)`,
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

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] z-40 pointer-events-none">
        {/* Shared chrome scrim behind the dock: a soft navy gradient fade at
            rest so collection art scrolls cleanly under the floating pills
            (no hard band). Never frosted here — the search overlay paints a
            fully solid var(--brand-bg) over the page, so there's nothing
            scrolling behind the dock for a blur band to do; an active frosted
            band would just read as a dark box over the solid overlay. First
            child so it sits behind every pill. */}
        <ChromeScrim
          edge="bottom"
          active={false}
          className="absolute inset-x-0 bottom-0 h-32"
        />
        {/* LEFT — collapsed active-tab puck (scrolled), shown only when
            the dock is hidden and search is closed. Springs in from the
            pillow's left edge so it reads as the pillow collapsing into the
            puck; whileTap replaces the old active:scale-95 (framer owns the
            transform now, so a CSS active: scale would be clobbered). */}
        <AnimatePresence>
          {hidden && !searchOpen && (
            <motion.button
              key="nav-puck"
              type="button"
              onClick={() => setHidden(false)}
              aria-label={`${activeLabel} (expand navigation)`}
              className="pointer-events-auto absolute left-3 flex items-center justify-center w-12 h-12 rounded-full text-[color:var(--brand-blue)]"
              style={{ bottom: DOCK_BOTTOM, ...glassStyle, transformOrigin: "left center" }}
              initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0.12 }
                  : { scale: { type: "spring", stiffness: 520, damping: 26, mass: 0.8 }, opacity: { duration: 0.14 } }
              }
              whileTap={reduceMotion ? undefined : { scale: 0.92 }}
              data-testid="nav-collapsed"
            >
              {activeIcon(true)}
            </motion.button>
          )}
        </AnimatePresence>

        {/* LEFT — labeled three-tab pillow (resting). Drives the measured
            dock height. Hidden while scrolled or while search is open.
            Springs/settles in (small overshoot) when re-expanding; framer
            owns scale/opacity, so the only CSS transition left is `right`
            (which moves just on dockH re-measure, never per frame). */}
        <AnimatePresence>
          {!hidden && !searchOpen && (
            <motion.nav
              key="nav-pillow"
              ref={pillowRef}
              className="pointer-events-auto absolute left-3 flex items-center justify-around px-2 py-2 rounded-full"
              style={{
                bottom: DOCK_BOTTOM,
                right: dockHVal + 20, // reserve the right circle + 8px gap
                ...glassStyle,
                transformOrigin: "left center",
                transition: "right 260ms cubic-bezier(0.32, 0.72, 0, 1)",
              }}
              initial={reduceMotion ? false : { scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { scale: 0.9, opacity: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0.12 }
                  : { scale: { type: "spring", stiffness: 460, damping: 28, mass: 0.9 }, opacity: { duration: 0.14 } }
              }
            >
              <NavItem label="Home" active={isHome} onClick={() => navigate("/home")} icon={homeIcon} testId="nav-home" />
              <NavItem label="Collection" active={isCollection} onClick={() => navigate("/collection")} icon={collectionIcon} testId="nav-collection" align="center" />
              <NavItem label="Recents" active={isRecents} onClick={() => navigate("/recents")} icon={recentsIcon} testId="nav-recents" align="right" />
            </motion.nav>
          )}
        </AnimatePresence>

        {/* RIGHT — the search/close toggle. Diameter == pillow height so
            it reads as the same rhythm; tapping toggles the field.
            Bounce: the size morph between the 48px scrolled puck and the
            full-height dock circle now springs with a small overshoot
            (matching the left pillow/puck) instead of snapping, and the
            glyph pops when it swaps search↔close. framer owns the
            transform, so whileTap replaces the old CSS active:scale-95. */}
        <motion.button
          type="button"
          onClick={onToggleSearch}
          aria-label={searchOpen ? "Close search" : "Search"}
          className={`pointer-events-auto absolute right-3 flex items-center justify-center rounded-full ${searchOpen ? "text-[color:var(--brand-blue)]" : "text-fan-primary"}`}
          style={{
            // Top-anchored field (Task #770) — the toggle no longer needs
            // to dodge the keyboard, so it rests at the bottom dock.
            // Shares DOCK_BOTTOM with the puck + pillow so all three stay
            // on the same raised baseline above the browser chrome.
            bottom: DOCK_BOTTOM,
            // Glass (own blur) at rest; blur-free fill while search is open so
            // the bottom region keeps at most one blur surface (the resting
            // glass), and the solid search overlay stays free of any band.
            ...(searchOpen ? solidDockStyle : glassStyle),
          }}
          animate={{ width: toggleSize, height: toggleSize }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 420, damping: 40, mass: 0.9 }
          }
          whileTap={reduceMotion ? undefined : { scale: 0.92 }}
          data-testid="nav-search"
        >
          <motion.span
            key={searchOpen ? "close" : "search"}
            className="flex items-center justify-center"
            initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 480, damping: 34, mass: 0.7 }
            }
          >
            {searchOpen ? closeIcon : searchIcon}
          </motion.span>
        </motion.button>
      </div>

      {/* Top-anchored search field (Task #770) — sits under the
          status-bar / safe-area inset so the keyboard (which covers the
          bottom of the screen) never hides it. Always mounted so the
          dock toggle can focus it synchronously inside the tap gesture
          (iOS keyboard); hidden + non-interactive at rest, slides down +
          fades in when search opens. Keeps the same glass pill, search
          icon, placeholder, and clear (×) button as before — only its
          position changed from above-the-keyboard to the top. z-40 keeps
          it above the results overlay (z-20). */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] z-40 px-3 pointer-events-none"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <div
          className="flex items-center rounded-full overflow-hidden"
          style={{
            height: dockHVal,
            ...glassStyle,
            transformOrigin: "top center",
            opacity: searchOpen ? 1 : 0,
            transform: searchOpen ? "translateY(0)" : "translateY(-16px)",
            pointerEvents: searchOpen ? "auto" : "none",
            transition: "transform 300ms cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms ease",
          }}
        >
          <span className="pl-4 pr-2 text-fan-secondary flex-shrink-0">{searchIcon}</span>
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
