import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { useAuth } from "@/hooks/useAuth";
import {
  useRecordSearch,
  useRecentSearches,
  useClearRecentSearches,
  useRecordRecent,
  useRecordSearchEntity,
  type RecentSearchRow,
} from "@/hooks/useRecents";

// Apple-Music-style unified search (Task #530).
//
// Search-landing history is decoupled from the Recents tab — it lives
// in fan_recent_searches (text queries + entity taps that happened
// inside this surface) so "Clear" wipes only what the fan sees here
// and never touches the global Recents tab (fan_recents).
//
// Layout
//   Top-right       → account avatar (parity with Collection).
//   Landing         → "Recently Searched" rendered as entity rows
//                     (thumb + label + type) plus any pure-text
//                     queries the fan typed without tapping a result.
//   Typing          → a 3-line autocomplete suggestion block. Tapping
//                     a suggestion *fills the input* (does not
//                     navigate) — exactly like iOS Spotlight. Below
//                     it sits a 5-row compact ranked mix and a single
//                     mint "Show All Results" CTA.
//   Show All        → sectioned "Top Results" view (best 2–3 per
//                     type) plus Apple-style category pills to drill
//                     into a single kind.

type Hit = {
  kind: string;
  id: string;
  title: string;
  subtitle?: string | null;
  thumbUrl?: string | null;
  href: string;
  albumId?: string;
};

type SearchResponse = {
  query: string;
  results: {
    albums: Hit[];
    songs: Hit[];
    artists: Hit[];
    people: Hit[];
    instruments: Hit[];
    vendors: Hit[];
    labels: Hit[];
    playlists: Hit[];
    videos: Hit[];
    photos: Hit[];
  };
};

type CategoryKey =
  | "top"
  | "artists"
  | "albums"
  | "songs"
  | "gear"
  | "vendors"
  | "labels"
  | "people"
  | "playlists";

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  top: "Top Results",
  artists: "Artists",
  albums: "Albums",
  songs: "Songs",
  gear: "Gear",
  vendors: "Vendors",
  labels: "Labels",
  people: "People",
  playlists: "Playlists",
};

// Apple-style category pill order. "Bonus Content" was retired from
// the pill row per Task #530 review — bonus video/photo matches now
// fold into Top Results only (still ranked, just no dedicated drill).
const CATEGORY_ORDER: CategoryKey[] = [
  "top", "artists", "albums", "songs", "gear", "vendors", "labels", "people", "playlists",
];

const KIND_LABEL: Record<string, string> = {
  album: "Album",
  song: "Song",
  artist: "Artist",
  person: "Person",
  instrument: "Gear",
  vendor: "Vendor",
  label: "Label",
  playlist: "Playlist",
  video: "Bonus video",
  photo: "Bonus photo",
};

// Best-2-3-per-type cap used in the "Top Results" sectioned view.
// Apple Music shows ~3 of each category before requiring a drill, so
// the surface stays scannable while still proving "we have more of
// this kind." 2 for low-volume types feels right on a 390-wide phone.
const TOP_RESULTS_PER_SECTION = 3;

export function SearchPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryKey>("top");
  // showAll flips the typing-state preview (5-row compact mix +
  // mint CTA) into the sectioned Top Results view with category pills.
  const [showAll, setShowAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recordSearch = useRecordSearch();
  const recordRecent = useRecordRecent();
  const recordSearchEntity = useRecordSearchEntity();
  const { data: recentSearches } = useRecentSearches();
  const clearRecentSearches = useClearRecentSearches();

  // Debounce typing → query (300ms) so we don't fire on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(draft.trim()), 300);
    return () => clearTimeout(t);
  }, [draft]);

  // Reset category + show-all whenever the query changes meaningfully.
  useEffect(() => { setCategory("top"); setShowAll(false); }, [query]);

  // Autofocus the input on mount (parity with iOS Search → search bar
  // focused with keyboard up).
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const { data, isFetching } = useQuery<SearchResponse>({
    queryKey: ["/api/search", query],
    queryFn: async () => {
      const url = `/api/search?q=${encodeURIComponent(query)}&limit=20`;
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("search failed");
      return r.json();
    },
    enabled: !!query,
  });

  const r = data?.results;
  const counts: Record<CategoryKey, number> = {
    top: 0,
    artists: r?.artists.length ?? 0,
    albums: r?.albums.length ?? 0,
    songs: r?.songs.length ?? 0,
    gear: r?.instruments.length ?? 0,
    vendors: r?.vendors.length ?? 0,
    labels: r?.labels.length ?? 0,
    people: r?.people.length ?? 0,
    playlists: r?.playlists.length ?? 0,
  };
  const bonusCount = (r?.videos.length ?? 0) + (r?.photos.length ?? 0);
  counts.top =
    counts.artists + counts.albums + counts.songs + bonusCount +
    counts.gear + counts.vendors + counts.labels + counts.people + counts.playlists;

  // Flattened ranked list — used only for the 5-row preview shown
  // before the fan taps "Show All". Order = Artists → Albums → Songs
  // → Gear → Vendors → Labels → People → Playlists → Bonus.
  const unifiedHits: Hit[] = useMemo(() => {
    if (!r) return [];
    return [
      ...r.artists,
      ...r.albums,
      ...r.songs,
      ...r.instruments,
      ...r.vendors,
      ...r.labels,
      ...r.people,
      ...r.playlists,
      ...r.videos,
      ...r.photos,
    ];
  }, [r]);

  // Autocomplete: the top 3 unified hits surface as a quick-tap
  // suggestion block above the preview list while typing. Tapping a
  // suggestion fills the input — it does NOT navigate (per Task #530
  // review: parity with iOS Spotlight tap-to-complete).
  const autocompleteSuggestions = useMemo(() => unifiedHits.slice(0, 3), [unifiedHits]);

  const visibleCategories = useMemo(
    () => CATEGORY_ORDER.filter((k) => k === "top" || counts[k] > 0),
    [counts],
  );

  // When the fan taps a result we (a) persist it into fan_recents
  // (Recents tab), (b) stamp it into fan_recent_searches (so it
  // reappears on the search landing — separate surface from Recents)
  // and (c) commit the text query as a fallback search-history row.
  const onPick = (hit: Hit) => {
    if (query) recordSearch(query);
    const entityKind = hit.kind;
    const entityId = hit.id;
    // Songs/videos/photos record their *parent album* as the recent
    // so the row still resolves after the bonus item is removed.
    const recentPayload =
      (entityKind === "song" || entityKind === "video" || entityKind === "photo") && hit.albumId
        ? {
            entityKind: "album" as const,
            entityId: hit.albumId,
            title: hit.title,
            subtitle: hit.subtitle ?? null,
            thumbUrl: hit.thumbUrl ?? null,
            href: hit.href,
          }
        : {
            entityKind: entityKind as any,
            entityId,
            title: hit.title,
            subtitle: hit.subtitle ?? null,
            thumbUrl: hit.thumbUrl ?? null,
            href: hit.href,
          };
    recordRecent(recentPayload);
    recordSearchEntity(recentPayload);
    navigate(hit.href);
  };

  // Autocomplete row tap: fill the input + commit the search query,
  // then keep the fan on the same surface so they can refine. No
  // navigation, no recents write (the typing itself isn't an "open").
  const onSuggest = (s: Hit) => {
    setDraft(s.title);
    setQuery(s.title);
    recordSearch(s.title);
    inputRef.current?.focus();
  };

  // Account avatar (top-right) — identical primitive to Collection so
  // the two pages read as one shell. Initials fallback when there's
  // no photoUrl on the customer record.
  const avatarInitials = (user?.displayName || user?.username || "?")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <main className="h-screen w-full flex justify-center overflow-hidden bg-[#00062B]">
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
              onPickEntity={(row) => {
                // Re-stamp recents on re-tap so the row floats to top
                // and also lands back in the Recents tab (open event).
                recordRecent({
                  entityKind: row.entityKind as any,
                  entityId: row.entityId!,
                  title: row.title!,
                  subtitle: row.subtitle,
                  thumbUrl: row.thumbUrl,
                  href: row.href!,
                });
                recordSearchEntity({
                  entityKind: row.entityKind as any,
                  entityId: row.entityId!,
                  title: row.title!,
                  subtitle: row.subtitle,
                  thumbUrl: row.thumbUrl,
                  href: row.href!,
                });
                navigate(row.href!);
              }}
              onPickQuery={(qStr) => { setDraft(qStr); setQuery(qStr); }}
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
                onClick={() => { setDraft(""); setQuery(""); setShowAll(false); }}
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

function RecentSearchedList({
  rows,
  onPickEntity,
  onPickQuery,
  onClear,
}: {
  rows: RecentSearchRow[];
  onPickEntity: (row: RecentSearchRow) => void;
  onPickQuery: (q: string) => void;
  onClear: () => void;
}) {
  // Split entity rows from text queries — they share one table so
  // Clear wipes both at once, but render them as two visual groups
  // (Apple Music puts the rich rows above the plain query rows).
  const entityRows = rows.filter((r) => r.entityKind && r.entityId);
  const queryRows = rows.filter((r) => !r.entityKind);

  if (rows.length === 0) {
    return (
      <div className="px-5 pt-6">
        <p className="text-white/45 text-sm">Search albums, songs, gear, vendors and more.</p>
      </div>
    );
  }
  return (
    <div className="px-5 pt-2">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-white text-[15px] font-bold">Recently Searched</h2>
        <button
          type="button"
          onClick={onClear}
          className="text-[#319ED8] text-[13px] font-semibold active:opacity-60"
          data-testid="button-clear-recent-searches"
        >
          Clear
        </button>
      </div>
      <div className="-mx-5">
        {entityRows.slice(0, 10).map((row) => (
          <SearchEntityRow
            key={row.queryNorm}
            thumbUrl={row.thumbUrl}
            title={row.title ?? row.displayQuery}
            type={KIND_LABEL[row.entityKind ?? ""] ?? (row.entityKind ?? "")}
            isRound={row.entityKind === "artist" || row.entityKind === "person" || row.entityKind === "vendor" || row.entityKind === "label"}
            onClick={() => onPickEntity(row)}
            testId={`row-recent-search-${row.queryNorm}`}
          />
        ))}
      </div>
      {queryRows.length > 0 && (
        <div className="mt-3">
          <div className="-mx-5">
            {queryRows.slice(0, 10).map((tr) => (
              <SearchEntityRow
                key={tr.queryNorm}
                thumbUrl={null}
                title={tr.displayQuery}
                type="Search"
                isRound={false}
                onClick={() => onPickQuery(tr.displayQuery)}
                testId={`row-recent-query-${tr.queryNorm}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CompactPreview({
  suggestions,
  previewHits,
  hasMore,
  onPick,
  onSuggest,
  onShowAll,
}: {
  suggestions: Hit[];
  previewHits: Hit[];
  hasMore: boolean;
  onPick: (h: Hit) => void;
  onSuggest: (h: Hit) => void;
  onShowAll: () => void;
}) {
  return (
    <div>
      {/* 3-line autocomplete block — tap to FILL the input (Spotlight
          parity). The fan can then refine before committing to a row. */}
      {suggestions.length > 0 && (
        <div className="px-5 pt-1 pb-1">
          {suggestions.slice(0, 3).map((s) => (
            <button
              key={`sug-${s.kind}-${s.id}`}
              type="button"
              onClick={() => onSuggest(s)}
              className="w-full flex items-center gap-2 py-2 text-left active:opacity-60"
              data-testid={`row-autocomplete-${s.kind}-${s.id}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2.2" strokeLinecap="round" className="flex-shrink-0">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <span className="text-white text-[14px] truncate">{s.title}</span>
              {s.subtitle && <span className="text-white/40 text-[13px] truncate">— {s.subtitle}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="px-5 mt-2">
        {previewHits.map((hit) => (
          <ResultRow key={`prev-${hit.kind}-${hit.id}`} hit={hit} onPick={onPick} />
        ))}
      </div>
      {hasMore && (
        <div className="px-5 pt-3 pb-2 flex justify-center">
          <button
            type="button"
            onClick={onShowAll}
            className="px-5 py-2.5 rounded-full text-[14px] font-semibold active:opacity-70"
            style={{ background: "#4AFFCA", color: "#00062B" }}
            data-testid="button-show-all-results"
          >
            Show All Results
          </button>
        </div>
      )}
    </div>
  );
}

function FullResults({
  results,
  category,
  categories,
  onCategory,
  onPick,
}: {
  results: SearchResponse["results"];
  category: CategoryKey;
  categories: CategoryKey[];
  onCategory: (k: CategoryKey) => void;
  onPick: (h: Hit) => void;
}) {
  // Per-category drill lists. "top" is intentionally absent — Top
  // Results renders as a sectioned view of best-N-per-type below.
  const itemsForCategory = (k: CategoryKey): Hit[] => {
    switch (k) {
      case "top":       return [];
      case "artists":   return results.artists;
      case "albums":    return results.albums;
      case "songs":     return results.songs;
      case "gear":      return results.instruments;
      case "vendors":   return results.vendors;
      case "labels":    return results.labels;
      case "people":    return results.people;
      case "playlists": return results.playlists;
    }
  };

  // Sectioned blocks for Top Results — best 2-3 from each non-empty
  // category, in Apple's pill order. Bonus video/photo gets a small
  // tail block so it's still discoverable without a dedicated pill.
  const topSections: { key: CategoryKey; label: string; items: Hit[] }[] = ([
    { key: "artists",   label: CATEGORY_LABELS.artists,   items: results.artists.slice(0, TOP_RESULTS_PER_SECTION) },
    { key: "albums",    label: CATEGORY_LABELS.albums,    items: results.albums.slice(0, TOP_RESULTS_PER_SECTION) },
    { key: "songs",     label: CATEGORY_LABELS.songs,     items: results.songs.slice(0, TOP_RESULTS_PER_SECTION) },
    { key: "gear",      label: CATEGORY_LABELS.gear,      items: results.instruments.slice(0, TOP_RESULTS_PER_SECTION) },
    { key: "vendors",   label: CATEGORY_LABELS.vendors,   items: results.vendors.slice(0, TOP_RESULTS_PER_SECTION) },
    { key: "labels",    label: CATEGORY_LABELS.labels,    items: results.labels.slice(0, TOP_RESULTS_PER_SECTION) },
    { key: "people",    label: CATEGORY_LABELS.people,    items: results.people.slice(0, TOP_RESULTS_PER_SECTION) },
    { key: "playlists", label: CATEGORY_LABELS.playlists, items: results.playlists.slice(0, TOP_RESULTS_PER_SECTION) },
  ] as { key: CategoryKey; label: string; items: Hit[] }[]).filter((s) => s.items.length > 0);
  const bonusItems = [...results.videos, ...results.photos].slice(0, TOP_RESULTS_PER_SECTION);

  return (
    <div>
      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-5 pb-3">
          {categories.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onCategory(k)}
              className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-all"
              style={
                category === k
                  ? { background: "#319ED8", color: "#00062B" }
                  : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.80)" }
              }
              data-testid={`pill-category-${k}`}
            >
              {CATEGORY_LABELS[k]}
            </button>
          ))}
        </div>
      )}
      {category === "top" ? (
        <div className="px-5 space-y-4">
          {topSections.length === 0 ? (
            <p className="text-white/45 text-sm text-center mt-6">No results.</p>
          ) : (
            <>
              {topSections.map((s) => (
                <section key={s.key} data-testid={`section-top-${s.key}`}>
                  <h3 className="text-white text-base font-bold mb-1.5">{s.label}</h3>
                  {s.items.map((hit) => (
                    <ResultRow key={`top-${s.key}-${hit.kind}-${hit.id}`} hit={hit} onPick={onPick} />
                  ))}
                </section>
              ))}
              {bonusItems.length > 0 && (
                <section data-testid="section-top-bonus">
                  <h3 className="text-white text-base font-bold mb-1.5">Bonus Content</h3>
                  {bonusItems.map((hit) => (
                    <ResultRow key={`top-bonus-${hit.kind}-${hit.id}`} hit={hit} onPick={onPick} />
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="px-5">
          {itemsForCategory(category).length === 0 ? (
            <p className="text-white/45 text-sm text-center mt-6">Nothing in {CATEGORY_LABELS[category]}.</p>
          ) : (
            itemsForCategory(category).map((hit) => (
              <ResultRow key={`${category}-${hit.kind}-${hit.id}`} hit={hit} onPick={onPick} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SearchEntityRow({
  thumbUrl,
  title,
  type,
  isRound,
  onClick,
  testId,
}: {
  thumbUrl: string | null;
  title: string;
  type: string;
  isRound: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-5 py-2.5 active:opacity-60 transition-opacity text-left"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      data-testid={testId}
    >
      <div
        className={`w-11 h-11 flex-shrink-0 overflow-hidden flex items-center justify-center ${isRound ? "rounded-full" : "rounded-md"}`}
        style={{ background: "rgba(255,255,255,0.08)", border: isRound ? "1px solid rgba(255,255,255,0.10)" : undefined }}
      >
        {thumbUrl ? (
          <img src={thumbUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold truncate leading-tight">{title}</p>
        <p className="text-white/45 text-xs truncate leading-tight mt-0.5">{type}</p>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.3">
        <path d="M9 18l6-6-6-6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function ResultRow({ hit, onPick }: { hit: Hit; onPick: (h: Hit) => void }) {
  // Artist/person/vendor/label rows use a rounded thumb; everything
  // else uses a square 11×11 cover (Apple Music search-row rhythm).
  const isRound = hit.kind === "artist" || hit.kind === "person" || hit.kind === "vendor" || hit.kind === "label";
  const typeLabel = KIND_LABEL[hit.kind] ?? hit.kind;
  const subtitle = hit.subtitle ? `${typeLabel} · ${hit.subtitle}` : typeLabel;
  return (
    <button
      type="button"
      onClick={() => onPick(hit)}
      className="w-full flex items-center gap-3 py-2.5 active:opacity-60 transition-opacity text-left"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      data-testid={`row-search-${hit.kind}-${hit.id}`}
    >
      <div
        className={`w-11 h-11 flex-shrink-0 overflow-hidden flex items-center justify-center ${isRound ? "rounded-full" : "rounded-md"}`}
        style={{ background: "rgba(255,255,255,0.08)", border: isRound ? "1px solid rgba(255,255,255,0.10)" : undefined }}
      >
        {hit.thumbUrl ? (
          <img src={hit.thumbUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold truncate leading-tight">{hit.title}</p>
        <p className="text-white/45 text-xs truncate leading-tight mt-0.5">{subtitle}</p>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.3">
        <path d="M9 18l6-6-6-6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export default SearchPage;
