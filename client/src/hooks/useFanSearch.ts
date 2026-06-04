import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useRecordSearch,
  useRecentSearches,
  useClearRecentSearches,
  useRecordRecent,
  useRecordSearchEntity,
  type RecentSearchRow,
} from "@/hooks/useRecents";
import {
  CATEGORY_ORDER,
  type CategoryKey,
  type Hit,
  type SearchResponse,
} from "@/components/search/views";

// Shared search state + behaviour (Task #530 + Task #713).
//
// Owns the draft → debounced query pipeline, the /api/search fetch,
// the ranked-list derivations, and the recents-stamping side effects.
// Both the desktop /search page and the mobile bottom-dock overlay
// drive their UI off this one hook so ranking, recents writes, and
// navigation stay identical across surfaces.
//
// `onNavigate` fires right after a result tap navigates — the dock
// uses it to collapse the inline search; the page leaves it undefined.

export function useFanSearch(opts?: { onNavigate?: () => void }) {
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryKey>("top");
  // showAll flips the typing-state preview (5-row compact mix +
  // mint CTA) into the sectioned Top Results view with category pills.
  const [showAll, setShowAll] = useState(false);
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

  const { data, isFetching } = useQuery<SearchResponse>({
    queryKey: ["/api/search", query],
    queryFn: async () => {
      const url = `/api/search?q=${encodeURIComponent(query)}&limit=20`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("search failed");
      return res.json();
    },
    enabled: !!query,
  });

  const r = data?.results;
  // Each category is optional-chained on BOTH `r` AND the array itself: a
  // malformed/partial search payload (a category key present but null, or a
  // 200 with a null body) would otherwise crash here with
  // `null is not an object (evaluating 'r.artists.length')` — and since
  // useFanSearch backs the BottomNav search dock mounted on every fan page,
  // that took down the whole fan app on iOS Safari (Task #1259). Treat a
  // missing/null category as "0 results", never throw.
  const counts: Record<CategoryKey, number> = {
    top: 0,
    artists: r?.artists?.length ?? 0,
    albums: r?.albums?.length ?? 0,
    songs: r?.songs?.length ?? 0,
    gear: r?.instruments?.length ?? 0,
    vendors: r?.vendors?.length ?? 0,
    labels: r?.labels?.length ?? 0,
    people: r?.people?.length ?? 0,
    playlists: r?.playlists?.length ?? 0,
  };
  const bonusCount = (r?.videos?.length ?? 0) + (r?.photos?.length ?? 0);
  counts.top =
    counts.artists + counts.albums + counts.songs + bonusCount +
    counts.gear + counts.vendors + counts.labels + counts.people + counts.playlists;

  // Flattened ranked list — used only for the 5-row preview shown
  // before the fan taps "Show All". Order = Artists → Albums → Songs
  // → Gear → Vendors → Labels → People → Playlists → Bonus.
  const unifiedHits: Hit[] = useMemo(() => {
    if (!r) return [];
    // `?? []` on every category for the same reason as `counts` above —
    // spreading a null category (`...null`) throws "is not iterable" and
    // would crash the search dock on a partial payload.
    return [
      ...(r.artists ?? []),
      ...(r.albums ?? []),
      ...(r.songs ?? []),
      ...(r.instruments ?? []),
      ...(r.vendors ?? []),
      ...(r.labels ?? []),
      ...(r.people ?? []),
      ...(r.playlists ?? []),
      ...(r.videos ?? []),
      ...(r.photos ?? []),
    ];
  }, [r]);

  // Autocomplete: the top 3 unified hits surface as a quick-tap
  // suggestion block above the preview list while typing.
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
    opts?.onNavigate?.();
  };

  // Autocomplete row tap: fill the input + commit the search query,
  // then keep the fan on the same surface so they can refine. No
  // navigation, no recents write (the typing itself isn't an "open").
  const onSuggest = (s: Hit) => {
    setDraft(s.title);
    setQuery(s.title);
    recordSearch(s.title);
  };

  // Recently-Searched entity tap — re-stamp recents so the row floats
  // to the top + lands back in the Recents tab, then open it.
  const onPickRecentEntity = (row: RecentSearchRow) => {
    const payload = {
      entityKind: row.entityKind as any,
      entityId: row.entityId!,
      title: row.title!,
      subtitle: row.subtitle,
      thumbUrl: row.thumbUrl,
      href: row.href!,
    };
    recordRecent(payload);
    recordSearchEntity(payload);
    navigate(row.href!);
    opts?.onNavigate?.();
  };

  // Recently-Searched plain-text tap — refill the field, no navigate.
  const onPickRecentQuery = (qStr: string) => { setDraft(qStr); setQuery(qStr); };

  // Reset to the empty resting state (used when the dock collapses).
  const reset = () => { setDraft(""); setQuery(""); setShowAll(false); setCategory("top"); };

  return {
    draft, setDraft,
    query,
    category, setCategory,
    showAll, setShowAll,
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
    reset,
  };
}
