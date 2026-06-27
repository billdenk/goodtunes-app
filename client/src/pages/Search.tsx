import { useEffect, useRef } from "react";
import { getInitials } from "@/lib/initials";
import { useLocation } from "wouter";
import { MiniPlayer } from "@/components/MiniPlayer";
import { FanScreen } from "@/components/ui/FanScreen";
import { useAuth } from "@/hooks/useAuth";
import { useFanSearch } from "@/hooks/useFanSearch";
import { useDesktopShell, LYRICS_RAIL_CONTENT_OFFSET } from "@/hooks/useDesktopShell";
import { useLyricsRailOpen } from "@/components/ui/DesktopLyricsRail";
import { DesktopSearchView } from "@/components/search/DesktopSearchView";
import {
  RecentSearchedList,
  CompactPreview,
  FullResults,
} from "@/components/search/views";

// Apple-Music-style unified search (Task #530).
//
// The standalone /search page has two presentations that share the SAME
// `useFanSearch` hook + view components so ranking + recents stay in
// lock-step:
//   * lg+ web desktop — the top-anchored, narrow Apple-style pill from
//     `DesktopSearchView` (Task #1521). This is byte-identical to the
//     in-album rail search so reaching Search from either rail lands on
//     the same look. The global StorefrontSidebar + MiniPlayer dock
//     provide the surrounding chrome.
//   * mobile / tablet — the bottom-anchored, full-width keyboard-friendly
//     bar (built mobile-first, thumb-reachable above the MiniPlayer +
//     BottomNav cluster).
//
// The mobile bottom-dock inline search overlay (Task #713) lives in
// BottomNav and reuses the same hook + views too.
//
// Search-landing history is decoupled from the Recents tab — it lives
// in fan_recent_searches (text queries + entity taps that happened
// inside this surface) so "Clear" wipes only what the fan sees here
// and never touches the global Recents tab (fan_recents).

export function SearchPage() {
  const isDesktop = useDesktopShell();
  // Desktop/tablet (lg+) reuses the in-album top/narrow pill so the two
  // surfaces can't drift; phone keeps its own bottom-anchored bar.
  return isDesktop ? <DesktopSearchPage /> : <MobileSearchPage />;
}

// lg+ web desktop. The top-anchored narrow pill comes straight from the
// shared DesktopSearchView (same component the album-page rail mounts), so
// styling/placement is single-sourced. The global StorefrontSidebar owns
// the left rail + account chip; MiniPlayer renders the bottom PlayerDock.
function DesktopSearchPage() {
  const railOpen = useLyricsRailOpen();
  return (
    <main
      className="h-screen w-full overflow-hidden bg-[var(--brand-bg)] lg:pl-[284px]"
      style={railOpen ? { paddingRight: LYRICS_RAIL_CONTENT_OFFSET } : undefined}
    >
      {/* Scrollable content column; bottom padding clears the floating
          PlayerDock when a song is playing. */}
      <div className="h-full overflow-y-auto scrollbar-hide pb-40">
        <DesktopSearchView />
      </div>
      <MiniPlayer />
    </main>
  );
}

function MobileSearchPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  // Randomized, non-credential field name so Safari/password managers
  // don't surface a saved-value / typed-history autofill chip.
  const searchFieldName = useRef("gt-omnisearch-" + Math.random().toString(36).slice(2)).current;
  const search = useFanSearch();
  const {
    draft, setDraft, query, category, setCategory, showAll, setShowAll,
    isFetching, r, counts, unifiedHits, autocompleteSuggestions, visibleCategories,
    recentSearches, onPick, onSuggest, onPickRecentEntity, onPickRecentQuery,
    clearRecentSearches,
  } = search;

  // Autofocus the input on mount (parity with iOS Search → search bar
  // focused). On the mobile dock the keyboard is raised inside the tap
  // gesture instead (see BottomNav) — this page is the desktop surface.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  // Account avatar (top-right) — identical primitive to Collection so
  // the two pages read as one shell. Lives in FanScreen's `trailing`
  // slot with `fadeTrailing` so it fades + scales out on scroll exactly
  // like Home / Collection / Recents.
  const avatarInitials = getInitials(user?.displayName || user?.username, "?");

  const accountAvatar = (
    <button
      type="button"
      onClick={() => navigate("/account")}
      aria-label="Account"
      className="relative w-9 h-9 rounded-full overflow-hidden flex items-center justify-center active:opacity-70"
      style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.12)" }}
      data-testid="button-open-account"
    >
      {user?.photoUrl ? (
        <img src={user.photoUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-white text-xs font-semibold">{avatarInitials}</span>
      )}
    </button>
  );

  // Bottom-anchored search bar — sits directly above the MiniPlayer +
  // BottomNav cluster so the keyboard pushes nothing offscreen and the
  // fan's thumb never has to travel to the top of the page. Rendered in
  // FanScreen's `footer` slot (a sibling of the scroll container) so it
  // stays pinned while the results scroll underneath it.
  const searchBar = (
    <div
      className="absolute left-0 right-0 z-20 px-5 pb-2"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 152px)" }}
    >
      <div className="relative flex items-center" style={{ background: "rgba(255,255,255,0.14)", borderRadius: 999, backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2.2" strokeLinecap="round" className="ml-3.5 flex-shrink-0">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
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
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Albums, songs, gear, vendors…"
          className="flex-1 bg-transparent border-0 px-2.5 py-2.5 text-white placeholder-white/45 text-sm focus:outline-none"
          data-testid="input-search"
        />
        {draft && (
          <button
            type="button"
            onClick={() => { setDraft(""); setShowAll(false); }}
            className="mr-2 w-5 h-5 flex items-center justify-center rounded-full"
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
  );

  return (
    <FanScreen title="Search" trailing={accountAvatar} fadeTrailing footer={searchBar}>
      {/* Results column. The trailing spacer clears the pinned search bar
          (FanScreen's own pb-[170px] only clears the MiniPlayer +
          BottomNav stack, the bar floats ~90px above that). */}
      {!query && (
        <RecentSearchedList
          rows={recentSearches ?? []}
          onPickEntity={onPickRecentEntity}
          onPickQuery={onPickRecentQuery}
          onClear={() => clearRecentSearches.mutate()}
        />
      )}

      {query && isFetching && !r && (
        <p className="text-white/45 text-sm text-center mt-8" data-testid="text-search-loading">Searching…</p>
      )}

      {query && r && counts.top === 0 && (
        <p className="text-white/45 text-sm text-center mt-8" data-testid="text-search-empty">No results for "{query}"</p>
      )}

      {query && r && counts.top > 0 && !showAll && (
        <CompactPreview
          suggestions={autocompleteSuggestions}
          previewHits={unifiedHits.slice(0, 5)}
          hasMore={unifiedHits.length > 5}
          onPick={onPick}
          onSuggest={onSuggest}
          onShowAll={() => setShowAll(true)}
        />
      )}

      {query && r && counts.top > 0 && showAll && (
        <FullResults
          results={r}
          category={category}
          categories={visibleCategories}
          onCategory={setCategory}
          onPick={onPick}
        />
      )}

      <div aria-hidden style={{ height: 110, flexShrink: 0 }} />
    </FanScreen>
  );
}

export default SearchPage;
