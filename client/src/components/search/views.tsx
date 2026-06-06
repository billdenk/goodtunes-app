// Shared search presentational pieces (Task #530 + Task #713).
//
// Extracted from the old standalone Search page so the same ranked
// rendering is reused by BOTH the desktop /search page and the mobile
// bottom-dock inline search overlay. Keep the rendering identical
// across surfaces — the only thing that differs is the chrome that
// wraps these views.

import type { RecentSearchRow } from "@/hooks/useRecents";
import type { Album } from "@/data/musicData";
import { AlbumCard } from "@/components/ui/AlbumCard";

export type Hit = {
  kind: string;
  id: string;
  title: string;
  subtitle?: string | null;
  thumbUrl?: string | null;
  href: string;
  albumId?: string;
};

export type SearchResponse = {
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

export type CategoryKey =
  | "top"
  | "artists"
  | "albums"
  | "songs"
  | "gear"
  | "vendors"
  | "labels"
  | "people"
  | "playlists";

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
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
export const CATEGORY_ORDER: CategoryKey[] = [
  "top", "artists", "albums", "songs", "gear", "vendors", "labels", "people", "playlists",
];

export const KIND_LABEL: Record<string, string> = {
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
export const TOP_RESULTS_PER_SECTION = 3;

export function RecentSearchedList({
  rows,
  onPickEntity,
  onClear,
}: {
  rows: RecentSearchRow[];
  onPickEntity: (row: RecentSearchRow) => void;
  // Accepted for caller compatibility but unused: fans no longer see
  // bare typed-query rows (Task #1517). Raw queries are still recorded
  // server-side for analytics; they're just hidden from this list.
  onPickQuery?: (q: string) => void;
  onClear: () => void;
}) {
  // Only show rows for results the fan actually tapped into (rich
  // entity rows with a thumbnail). Plain typed-query rows are recorded
  // on the backend but never rendered here, so a fan who only ever
  // typed searches sees the resting empty state instead of a list of
  // bare query terms.
  const entityRows = rows.filter((r) => r.entityKind && r.entityId);

  if (entityRows.length === 0) {
    return (
      <div className="px-5 pt-6">
        <p className="text-fan-secondary text-sm">Search albums, songs, gear, vendors and more.</p>
      </div>
    );
  }
  return (
    <div className="px-5 pt-2">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-fan-primary text-[15px] font-bold">Recently Searched</h2>
        <button
          type="button"
          onClick={onClear}
          className="text-[color:var(--brand-blue)] text-[13px] font-semibold active:opacity-60"
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
    </div>
  );
}

export function CompactPreview({
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
              <span className="text-fan-primary text-[14px] truncate">{s.title}</span>
              {s.subtitle && <span className="text-fan-faint text-[13px] truncate">— {s.subtitle}</span>}
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
            className="px-5 py-2.5 rounded-full text-sm font-semibold text-[color:var(--brand-blue)] active:opacity-70"
            style={{ background: "rgba(49,158,216,0.12)" }}
            data-testid="button-show-all-results"
          >
            Show All Results
          </button>
        </div>
      )}
    </div>
  );
}

export function FullResults({
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
  // Every category is `?? []`-guarded: a partial search payload (a category
  // key present but null) reaches here whenever counts.top > 0 from a sibling
  // category, and an unguarded `.slice()` / spread on a null array would crash
  // the whole fan app (Task #1259, same root cause as useFanSearch).
  const itemsForCategory = (k: CategoryKey): Hit[] => {
    switch (k) {
      case "top":       return [];
      case "artists":   return results.artists ?? [];
      case "albums":    return results.albums ?? [];
      case "songs":     return results.songs ?? [];
      case "gear":      return results.instruments ?? [];
      case "vendors":   return results.vendors ?? [];
      case "labels":    return results.labels ?? [];
      case "people":    return results.people ?? [];
      case "playlists": return results.playlists ?? [];
    }
  };

  // Sectioned blocks for Top Results — best 2-3 from each non-empty
  // category, in Apple's pill order. Bonus video/photo gets a small
  // tail block so it's still discoverable without a dedicated pill.
  const topSections: { key: CategoryKey; label: string; items: Hit[] }[] = ([
    { key: "artists",   label: CATEGORY_LABELS.artists,   items: (results.artists ?? []).slice(0, TOP_RESULTS_PER_SECTION) },
    { key: "albums",    label: CATEGORY_LABELS.albums,    items: (results.albums ?? []).slice(0, TOP_RESULTS_PER_SECTION) },
    { key: "songs",     label: CATEGORY_LABELS.songs,     items: (results.songs ?? []).slice(0, TOP_RESULTS_PER_SECTION) },
    { key: "gear",      label: CATEGORY_LABELS.gear,      items: (results.instruments ?? []).slice(0, TOP_RESULTS_PER_SECTION) },
    { key: "vendors",   label: CATEGORY_LABELS.vendors,   items: (results.vendors ?? []).slice(0, TOP_RESULTS_PER_SECTION) },
    { key: "labels",    label: CATEGORY_LABELS.labels,    items: (results.labels ?? []).slice(0, TOP_RESULTS_PER_SECTION) },
    { key: "people",    label: CATEGORY_LABELS.people,    items: (results.people ?? []).slice(0, TOP_RESULTS_PER_SECTION) },
    { key: "playlists", label: CATEGORY_LABELS.playlists, items: (results.playlists ?? []).slice(0, TOP_RESULTS_PER_SECTION) },
  ] as { key: CategoryKey; label: string; items: Hit[] }[]).filter((s) => s.items.length > 0);
  const bonusItems = [...(results.videos ?? []), ...(results.photos ?? [])].slice(0, TOP_RESULTS_PER_SECTION);

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
                  ? { background: "var(--brand-blue)", color: "var(--brand-bg)" }
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
            <p className="text-fan-secondary text-sm text-center mt-6">No results.</p>
          ) : (
            <>
              {topSections.map((s) => (
                <section key={s.key} data-testid={`section-top-${s.key}`}>
                  <h3 className="text-fan-primary text-base font-bold mb-1.5">{s.label}</h3>
                  {s.items.map((hit) => (
                    <ResultRow key={`top-${s.key}-${hit.kind}-${hit.id}`} hit={hit} onPick={onPick} />
                  ))}
                </section>
              ))}
              {bonusItems.length > 0 && (
                <section data-testid="section-top-bonus">
                  <h3 className="text-fan-primary text-base font-bold mb-1.5">Bonus Content</h3>
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
            <p className="text-fan-secondary text-sm text-center mt-6">Nothing in {CATEGORY_LABELS[category]}.</p>
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

export function SearchEntityRow({
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
        <p className="text-fan-primary text-sm font-normal truncate leading-tight">{title}</p>
        <p className="text-fan-secondary text-xs truncate leading-tight mt-0.5">{type}</p>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.3">
        <path d="M9 18l6-6-6-6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function ResultRow({ hit, onPick }: { hit: Hit; onPick: (h: Hit) => void }) {
  // Album hits route through the shared AlbumCard (row mode) so the
  // pointer/desktop hover Play + "…" affordances match every other
  // album surface (Task #1090). Touch keeps tap-to-navigate.
  if (hit.kind === "album") {
    const album = {
      id: hit.albumId ?? hit.id,
      title: hit.title,
      artist: hit.subtitle ?? "",
      artwork: hit.thumbUrl ?? "",
    } as Album;
    return (
      <AlbumCard
        album={album}
        mode="row"
        subtitle={hit.subtitle ? `${KIND_LABEL[hit.kind] ?? hit.kind} · ${hit.subtitle}` : (KIND_LABEL[hit.kind] ?? hit.kind)}
        onNavigate={() => onPick(hit)}
      />
    );
  }
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
        <p className="text-fan-primary text-sm font-semibold truncate leading-tight">{hit.title}</p>
        <p className="text-fan-secondary text-xs truncate leading-tight mt-0.5">{subtitle}</p>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.3">
        <path d="M9 18l6-6-6-6" strokeLinecap="round" />
      </svg>
    </button>
  );
}
