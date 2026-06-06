import { useEffect, useRef } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useFanSearch } from "@/hooks/useFanSearch";
import {
  RecentSearchedList,
  CompactPreview,
  FullResults,
} from "@/components/search/views";

/**
 * Desktop search view (Task #1054). Mounts inside the fan-facing
 * Preview & Purchase shell's main content area when the sidebar's
 * "Search" entry is selected, replacing the album hero.
 *
 * Apple-Music placement: a search box pinned at the top of the content
 * column (auto-focused so the cursor is blinking, ready to type) with the
 * ranked results flowing below it. It drives off the SAME `useFanSearch`
 * hook + shared `views.tsx` blocks the mobile bottom-dock and the
 * standalone /search page use, so ranking, recents writes, and result
 * navigation stay identical across every surface.
 *
 * `onNavigate` fires right after a result tap navigates — the host uses
 * it to drop out of search mode so picking an album lands on that album
 * (not back on a stale search screen).
 */
export function DesktopSearchView({ onNavigate }: { onNavigate?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Randomized, non-credential field name so Safari/password managers
  // don't surface a saved-value / typed-history autofill chip.
  const searchFieldName = useRef(
    "gt-omnisearch-" + Math.random().toString(36).slice(2),
  ).current;
  const search = useFanSearch({ onNavigate });
  const {
    draft,
    setDraft,
    query,
    category,
    setCategory,
    showAll,
    setShowAll,
    isFetching,
    r,
    counts,
    unifiedHits,
    autocompleteSuggestions,
    visibleCategories,
    recentSearches,
    onPick,
    onSuggest,
    onPickRecentEntity,
    onPickRecentQuery,
    clearRecentSearches,
  } = search;

  // Autofocus on mount so the cursor is already blinking (parity with
  // Apple Music's Search → search bar focused).
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="max-w-[720px] mx-auto lg:max-w-none lg:mx-0 2xl:max-w-[1100px] 2xl:mx-auto px-6 lg:px-12 py-6 lg:py-8"
      data-testid="desktop-search-view"
    >
      {/* Compact, Apple-Music-sized search pill. Rather than spanning the
          full content width, it's a small rounded pill anchored toward the
          right/center of the content area (ml-auto) with a plain "Search"
          placeholder — matching Apple Music's top-right search field. The
          ranked results below still flow full-width. */}
      <div
        className="relative flex items-center ml-auto w-full max-w-[300px]"
        style={{
          background: "rgba(255,255,255,0.08)",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <SearchIcon
          className="ml-3 w-4 h-4 text-fan-secondary flex-shrink-0"
          strokeWidth={2.2}
        />
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
          placeholder="Search"
          className="flex-1 min-w-0 bg-transparent border-0 px-2.5 py-2 text-white placeholder-white/45 text-sm focus:outline-none"
          data-testid="input-search"
        />
        {draft && (
          <IconButton
            variant="ghost"
            size="sm"
            label="Clear search"
            className="mr-1 text-fan-secondary hover:text-white"
            onClick={() => {
              setDraft("");
              setShowAll(false);
              inputRef.current?.focus();
            }}
            data-testid="button-clear-search"
          >
            <X strokeWidth={2.6} />
          </IconButton>
        )}
      </div>

      {/* Results — same ranked blocks the mobile dock + /search page use. */}
      <div className="mt-5">
        {!query && (
          <RecentSearchedList
            rows={recentSearches ?? []}
            onPickEntity={onPickRecentEntity}
            onPickQuery={onPickRecentQuery}
            onClear={() => clearRecentSearches.mutate()}
          />
        )}

        {query && isFetching && !r && (
          <p
            className="text-fan-secondary text-sm text-center mt-8"
            data-testid="text-search-loading"
          >
            Searching…
          </p>
        )}

        {query && r && counts.top === 0 && (
          <p
            className="text-fan-secondary text-sm text-center mt-8"
            data-testid="text-search-empty"
          >
            No results for "{query}"
          </p>
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
    </div>
  );
}

export default DesktopSearchView;
