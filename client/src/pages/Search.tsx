import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { useAuth } from "@/hooks/useAuth";
import { useFanSearch } from "@/hooks/useFanSearch";
import {
  RecentSearchedList,
  CompactPreview,
  FullResults,
} from "@/components/search/views";

// Apple-Music-style unified search (Task #530).
//
// Desktop /search page. The mobile bottom-dock inline search overlay
// (Task #713) lives in BottomNav and reuses the same `useFanSearch`
// hook + view components, so ranking + recents behaviour stays in
// lock-step across both surfaces.
//
// Search-landing history is decoupled from the Recents tab — it lives
// in fan_recent_searches (text queries + entity taps that happened
// inside this surface) so "Clear" wipes only what the fan sees here
// and never touches the global Recents tab (fan_recents).

export function SearchPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
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
  // the two pages read as one shell.
  const avatarInitials = (user?.displayName || user?.username || "?")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <main className="h-screen w-full flex justify-center overflow-hidden bg-[var(--brand-bg)]">
      <section className="relative w-full max-w-[390px] md:max-w-[760px] lg:max-w-[1200px] lg:mx-auto h-screen text-white flex flex-col">
        <header className="relative z-10 flex items-end justify-between px-5 pt-14 pb-3">
          <h1 className="text-white text-[34px] font-bold leading-none tracking-tight" data-testid="text-page-title">Search</h1>
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
        </header>

        {/* Scrollable results column. Bottom padding clears the pinned
            search bar + MiniPlayer + BottomNav stack. */}
        <div className="relative z-10 flex-1 overflow-y-auto scrollbar-hide pb-[260px]">
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
        </div>

        {/* Bottom-anchored search bar — sits directly above the
            MiniPlayer + BottomNav cluster so the keyboard pushes
            nothing offscreen and the fan's thumb never has to travel
            to the top of the page. */}
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
              type="text"
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

        <MiniPlayer />
        <BottomNav />
      </section>
    </main>
  );
}

export default SearchPage;
