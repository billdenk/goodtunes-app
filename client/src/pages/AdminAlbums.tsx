import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useMutation, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Search, Filter, EyeOff, X, Plus, Disc3, Clock, AlertTriangle, MoreVertical, Copy, CheckCircle2 } from "lucide-react";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { ExplicitBadge } from "@/components/ui/ExplicitBadge";
import { AlbumCover } from "@/components/ui/AlbumCover";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  ViewModeToggle,
  useViewMode,
  type ViewMode,
} from "@/components/admin/ViewModeToggle";
import { Combobox } from "@/components/admin/Combobox";
import { NewAlbumArtistDialog } from "@/components/admin/NewAlbumArtistDialog";
import { NewAlbumTitleDialog } from "@/components/admin/NewAlbumTitleDialog";
import { albumStage, sunriseCountdownLabel } from "@shared/albumStage";

/**
 * Admin home · Albums (Phase 1).
 *
 * Wrapped in AdminFrame (top bar + left entity sidebar) so the new admin
 * keeps the same chrome as the classic one. Apple-Music-store grid in our
 * white/light skin, with the canonical 4-state release lifecycle as
 * underline tabs above it:
 *
 *   - Prepping — we're working on it (Task #440: `isPrepping=true` on the
 *                row, i.e. a new GoodTunes shell that hasn't been promoted
 *                to Released yet — artwork swap, tracks, pricing pending)
 *   - Staged   — ready, waiting for sunrise (Task #800: a finished
 *                GoodTunes release whose `goodTunesReleaseDate` is still
 *                in the future; derived from the date, no schema field)
 *   - Released — visible for purchase (isGoodTunesRelease && !isHidden).
 *                Industry standard term (Apple Music, Spotify, every
 *                distro / label tool says "Released"); we used "Live"
 *                briefly but it reads more like broadcast/streaming.
 *                The internal TabKey stays "live" — it's just a UI filter
 *                key, not user-facing, so renaming it would churn for
 *                no benefit.
 *   - Sunset   — pulled from sale, owners keep access (isHidden)
 *
 * Per-album track count + credit-completion are still Phase 2.
 */
interface AlbumLite {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  year: number | null;
  type: "Single" | "Duo" | "EP" | "LP";
  description: string | null;
  isHidden: boolean;
  isGoodTunesRelease: boolean;
  // Task #440 — new GoodTunes shells start in Prepping (true) so the
  // Released tab stays clean; admin promotes via the album page.
  isPrepping: boolean;
  isExplicit: boolean;
  // ISO `YYYY-MM-DD` sunrise date for finished GoodTunes releases. Drives
  // the Staged-tab "Live <date> · in N days" countdown. Null = no schedule.
  goodTunesReleaseDate: string | null;
  // Task #1049 — "Sunset date" (stored on the legacy `streamingReleaseDate`
  // column). Once reached the release moves to streaming + sells out, so the
  // shared `albumStage` helper buckets it into the Sunset tab.
  streamingReleaseDate: string | null;
  // Task #799 — TEMPORARY admin-only "SPIN Promo (digital-only legacy)"
  // marker. Drives the small tile/row badge below. No fan-facing effect.
  isSpinPromo?: boolean;
  genre: string | null;
  createdAt: string | null;
}

// Task #1967 — "attention" is the cross-stage incomplete-albums audit. It's
// not a lifecycle stage like the other four (which slice the grid by
// `albumStage`); it's a separate scannable table fed by its own server
// aggregate. It rides in the same tab row + URL so an operator can deep-link
// / refresh into it, but it renders a dedicated table instead of the grid.
type TabKey = "prepping" | "staged" | "live" | "sunset" | "attention";

const TAB_KEYS: TabKey[] = ["prepping", "staged", "live", "sunset", "attention"];

// Per-track completeness counts for one incomplete GoodTunes release, all
// aggregated server-side (GET /api/admin/reports/incomplete-albums). The
// rules mirror the album-editor Tracks tab: a master is ready when Mux says
// `ready`, lyrics are satisfied when present OR the track is instrumental,
// and credits are complete when the track has BOTH a writer and a performer.
interface IncompleteAlbumRow {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  primaryArtistId: string | null;
  isPrepping: boolean;
  isHidden: boolean;
  goodTunesReleaseDate: string | null;
  streamingReleaseDate: string | null;
  trackCount: number;
  mastersReady: number;
  lyricsSatisfied: number;
  creditsComplete: number;
}

// Task #1007 / #1008 — build the link into an album, carrying the entire
// originating list query (tab + view + search + filters) so the album page's
// delete redirect + "Back to albums" link can drop the operator back exactly
// where they left the list, not just on the right tab. The whole list query
// string rides along url-encoded as `albumsReturn`; when it's empty (all
// defaults) we still stamp `from=albums` so the back target stays the list.
// The existing `from=person` smart-back is set by the Person page instead and
// takes precedence on the album side.
function albumHref(albumId: string, listQuery: string): string {
  const base = `/admin/albums/${albumId}`;
  if (!listQuery) return `${base}?from=albums`;
  return `${base}?from=albums&albumsReturn=${encodeURIComponent(listQuery)}`;
}

// Task #2021 — decide whether an album row carries a *real* cover. `artwork`
// is a NOT-NULL string, so "no cover" arrives as one of several sentinels: the
// empty string, the literal "null"/"undefined" (a stale `String(nullish)`
// write), or the legacy "/album-placeholder.svg" default. All of those mean
// "no real art" — return undefined so <AlbumCover> renders its branded
// placeholder instead of a broken-image "?" glyph.
function realArtwork(artwork: string | null | undefined): string | undefined {
  if (!artwork) return undefined;
  const v = artwork.trim();
  if (
    v === "" ||
    v === "null" ||
    v === "undefined" ||
    v === "/album-placeholder.svg"
  ) {
    return undefined;
  }
  return v;
}

export function AdminAlbums() {
  const { user, isLoading: authLoading } = useAuth();
  // Task #1494 — the Duplicate row action is operator-only (the server route
  // is too): duplicating mints a brand-new draft, not a scoped partner edit,
  // so partner (artist/label) admins must not see it. Mirror AdminAlbum, which
  // reads the resolved role off /api/me/role.
  const { data: adminRoleInfo } = useQuery<{ role: string }>({
    queryKey: ["/api/me/role"],
    enabled: !!user?.isAdmin,
  });
  const isOperator =
    adminRoleInfo?.role === "super_admin" || adminRoleInfo?.role === "admin";
  const [, navigate] = useLocation();
  const urlSearch = useSearch();
  // Task #1007 / #1008 — restore the whole list view from the URL so a
  // refresh (or a return navigation after deleting/leaving an album) drops
  // the operator back exactly where they were: same lifecycle tab, grid/list
  // view, search text, and type/genre/date/explicit filters. Parsed ONCE on
  // mount; the mirror effect below keeps the URL in sync after every change.
  const initial = useMemo(() => {
    const out = {
      tab: "live" as TabKey,
      view: null as ViewMode | null,
      search: "",
      types: new Set<AlbumLite["type"]>(["LP", "EP", "Duo"]),
      year: null as number | null,
      genre: "",
      explicit: "any" as "any" | "explicit" | "clean",
      spinPromo: false,
    };
    try {
      const p = new URLSearchParams(urlSearch);
      const t = p.get("tab");
      if (t && (TAB_KEYS as string[]).includes(t)) out.tab = t as TabKey;
      const v = p.get("view");
      if (v === "grid" || v === "list") out.view = v;
      const q = p.get("q");
      if (q) out.search = q;
      const types = p.get("types");
      if (types) {
        const valid: AlbumLite["type"][] = ["LP", "EP", "Duo"];
        const chosen = types
          .split(",")
          .filter((x): x is AlbumLite["type"] =>
            (valid as string[]).includes(x),
          );
        if (chosen.length) out.types = new Set(chosen);
      }
      const year = p.get("year");
      if (year) {
        const n = parseInt(year, 10);
        if (Number.isFinite(n)) out.year = n;
      }
      const genre = p.get("genre");
      if (genre) out.genre = genre;
      const ex = p.get("explicit");
      if (ex === "explicit" || ex === "clean") out.explicit = ex;
      if (p.get("spinPromo") === "1") out.spinPromo = true;
    } catch {
      /* malformed query string — fall through to the defaults */
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tab, setTab] = useState<TabKey>(initial.tab);
  const [search, setSearch] = useState(initial.search);
  // Open the search box on mount when a query rode in on the URL, so the
  // restored text is actually visible (and clearable) instead of filtering
  // the grid from a collapsed control.
  const [searchOpen, setSearchOpen] = useState(initial.search !== "");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useViewMode("albums");
  const [filterOpen, setFilterOpen] = useState(false);
  // Filter chips cover the three GoodTunes-curated formats (LP / EP /
  // Duo). "Single" is intentionally absent — it's a streaming-import
  // artefact (1-track releases pulled from iTunes/Spotify), and the
  // admin Albums tabs already exclude imports. The default set has all
  // three on so the unfiltered grid shows everything.
  const [typeFilter, setTypeFilter] = useState<Set<AlbumLite["type"]>>(
    () => new Set<AlbumLite["type"]>(initial.types),
  );
  // "Date added" — single year picker (null = Any). Typeable via the
  // input; the datalist suggests years actually present in the catalog.
  const [dateAddedYear, setDateAddedYear] = useState<number | null>(
    initial.year,
  );
  // Genre filter — single-select via the shared admin Combobox so it
  // feels the same as the genre field on the album detail page. Empty
  // string = Any.
  const [genreFilter, setGenreFilter] = useState<string>(initial.genre);
  const [explicitFilter, setExplicitFilter] = useState<
    "any" | "explicit" | "clean"
  >(initial.explicit);
  // Task #1304 — admin-only "SPIN Promo" filter. When on, the grid/list
  // shows only albums flagged `is_spin_promo = true` (the same purple-disc
  // badge already rendered on the tile/row). Mirrored to the URL as
  // `?spinPromo=1` so Bill can bookmark / share the flagged-set view.
  const [spinPromoOnly, setSpinPromoOnly] = useState<boolean>(
    initial.spinPromo,
  );
  // Task #445 — "+ Add Album" opens the "Who's the artist?" dialog first
  // so the new album lands with primaryArtistId already attached instead
  // of "Unknown artist". The dialog stays open (and its actions disabled)
  // while the album POST is in flight; the existing onSuccess navigate
  // unmounts this page, which tears the dialog down.
  const [artistDialogOpen, setArtistDialogOpen] = useState(false);
  // Task #468 — second step: name the album. Holds the resolved artist
  // (or null after "I'll set the artist later") between the artist
  // dialog closing and the create POST firing.
  const [titleDialogOpen, setTitleDialogOpen] = useState(false);
  const [pendingArtist, setPendingArtist] = useState<
    { name: string; id: string } | null
  >(null);
  const { toast } = useToast();

  // Task #335 / #445 — "+ Add Album" opens the "Who's the artist?"
  // dialog first (NewAlbumArtistDialog, mode="album"); on pick/skip the
  // mutation below creates the GoodTunes shell with primaryArtistId
  // already attached (or null on skip → legacy "Unknown artist"), then
  // navigates to the album page with `?onboarding=1` so the two-step
  // mode/format chooser modal opens over the scaffolding. The Metadata
  // panel's ArtistPickerField stays the late-attach fallback.
  const createAlbum = useMutation({
    mutationFn: async (args: {
      title: string;
      artist?: { name: string; id: string };
    }) => {
      const res = await apiRequest("POST", "/api/admin/albums", {
        title: args.title,
        artist: args.artist?.name || "Unknown artist",
        artwork: "/album-placeholder.svg",
        // Default `type` stays LP — the two-step modal sets the new
        // sellMode + physicalFormat right after the row exists.
        type: "LP",
        isGoodTunesRelease: true,
        // Task #440 — land new shells in Prepping. The server also defaults
        // GT-release creates to isPrepping=true, but we send it explicitly
        // so the call site advertises the intent.
        isPrepping: true,
        primaryArtistId: args.artist?.id || null,
      });
      return res.json() as Promise<AlbumLite>;
    },
    onSuccess: (a) => {
      queryClient.setQueryData<AlbumLite[]>(["/api/albums"], (old) =>
        old ? (old.some((x) => x.id === a.id) ? old : [...old, a]) : [a],
      );
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-albums"] });
      navigate(`/admin/albums/${a.id}?onboarding=1`);
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't create album",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Task #1494 — Duplicate an album from its row menu. Server clones the
  // descriptive content + full tracklist/credits (referencing existing
  // masters) into a fresh Prepping draft with no sales/ownership carried
  // over; we land the operator straight on the new draft.
  const duplicateAlbum = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/albums/${id}/duplicate`);
      return res.json() as Promise<AlbumLite>;
    },
    onSuccess: (a) => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-albums"] });
      toast({
        title: "Album duplicated",
        description: "Opened the new Prepping draft.",
      });
      navigate(`/admin/albums/${a.id}`);
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't duplicate album",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Task #1008 — when a `view` rode in on the URL (a shared/bookmarked link or
  // a return-from-album navigation), let it win over the localStorage default
  // once on mount. After that `useViewMode` owns persistence as usual.
  useEffect(() => {
    if (initial.view && initial.view !== view) setView(initial.view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Task #1007 / #1008 — serialize the full list view (tab + grid/list view +
  // search + type/genre/date/explicit filters) into a single query string.
  // Defaults are omitted so the common case keeps a clean `/admin/albums` URL;
  // this same string is mirrored into the URL below and carried into album
  // links so a refresh or a return-from-album navigation restores everything.
  const listQueryString = useMemo(() => {
    const p = new URLSearchParams();
    if (tab !== "live") p.set("tab", tab);
    if (view !== "grid") p.set("view", view);
    if (search) p.set("q", search);
    if (typeFilter.size !== 3) {
      const order: AlbumLite["type"][] = ["LP", "EP", "Duo"];
      p.set("types", order.filter((t) => typeFilter.has(t)).join(","));
    }
    if (dateAddedYear !== null) p.set("year", String(dateAddedYear));
    if (genreFilter.trim()) p.set("genre", genreFilter.trim());
    if (explicitFilter !== "any") p.set("explicit", explicitFilter);
    if (spinPromoOnly) p.set("spinPromo", "1");
    return p.toString();
  }, [tab, view, search, typeFilter, dateAddedYear, genreFilter, explicitFilter, spinPromoOnly]);

  // Mirror the serialized list view into the URL with `replace` so refreshes
  // and return navigations land back where the operator was. Early-returns
  // when the URL already matches so repeated state writes don't loop navigate.
  useEffect(() => {
    let current = "";
    try {
      current = new URLSearchParams(urlSearch).toString();
    } catch {
      current = "";
    }
    if (current === listQueryString) return;
    navigate(
      `/admin/albums${listQueryString ? `?${listQueryString}` : ""}`,
      { replace: true },
    );
  }, [listQueryString, urlSearch, navigate]);

  const {
    data: albumsData,
    isLoading,
    isError: albumsError,
    error: albumsErrorObj,
    refetch: refetchAlbums,
  } = useQuery<AlbumLite[] | null>({
    queryKey: ["/api/albums"],
    enabled: !!user?.isAdmin,
  });
  const albums = albumsData ?? [];

  // Task #1967 — the cross-stage incomplete-albums audit. Operator-only
  // (the route is `requireRole(super_admin, admin)`), so don't even fetch
  // for partner admins — the "Needs attention" tab is hidden for them. The
  // table component below reads the same queryKey so React Query dedupes to
  // a single request; this parent copy just drives the tab's count badge.
  const incompleteQuery = useQuery<{ rows: IncompleteAlbumRow[] }>({
    queryKey: ["/api/admin/reports/incomplete-albums"],
    enabled: !!user?.isAdmin && isOperator,
  });
  const incompleteRows = incompleteQuery.data?.rows ?? [];

  const counts = useMemo(
    () => ({
      // Task #440 — Prepping is now a real lifecycle gate (`isPrepping`).
      // New "+ Add Album" shells land here; admin promotes them to Released
      // from the album page once artwork / tracks / pricing are in place.
      prepping: albums.filter(
        (a) => a.isGoodTunesRelease && albumStage(a) === "prepping",
      ).length,
      // Task #800 — Staged is no longer a dead placeholder: it's every
      // GoodTunes release that's finished but whose sunrise
      // (`goodTunesReleaseDate`) is still in the future. Derived from the
      // date via the shared `albumStage` helper.
      staged: albums.filter(
        (a) => a.isGoodTunesRelease && albumStage(a) === "staged",
      ).length,
      live: albums.filter(
        (a) => a.isGoodTunesRelease && albumStage(a) === "released",
      ).length,
      sunset: albums.filter(
        (a) => a.isGoodTunesRelease && albumStage(a) === "sunset",
      ).length,
      // Task #1967 — count of GoodTunes releases short of complete in at
      // least one dimension, straight off the server aggregate.
      attention: incompleteRows.length,
    }),
    [albums, incompleteRows.length],
  );

  // Imported streaming catalog (`!isGoodTunesRelease`) is intentionally
  // excluded from the admin — the operator only cares about GoodTunes
  // releases, and 200+ imported rows just create noise. They still get
  // surfaced on the fan side via the Discography pull.
  const byTab = useMemo(() => {
    switch (tab) {
      case "prepping":
        return albums.filter(
          (a) => a.isGoodTunesRelease && albumStage(a) === "prepping",
        );
      case "staged":
        return albums.filter(
          (a) => a.isGoodTunesRelease && albumStage(a) === "staged",
        );
      case "live":
        return albums.filter(
          (a) => a.isGoodTunesRelease && albumStage(a) === "released",
        );
      case "sunset":
        return albums.filter(
          (a) => a.isGoodTunesRelease && albumStage(a) === "sunset",
        );
      case "attention":
        // The audit table fetches its own server aggregate; the grid path
        // is never rendered on this tab, so there's nothing to slice here.
        return [];
    }
  }, [albums, tab]);

  // Search runs across every GoodTunes release when there's a query (not
  // just the active tab's slice — typing "f" while sitting on Prepping
  // used to filter nothing visible). Imported streaming catalog is
  // excluded everywhere on the admin, search included.
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return byTab;
    return albums.filter(
      (a) =>
        a.isGoodTunesRelease &&
        (a.title.toLowerCase().includes(q) ||
          a.artist.toLowerCase().includes(q)),
    );
  }, [albums, byTab, search]);

  // Distinct "date added" years derived from createdAt across the whole
  // GoodTunes-release set (not just the active tab) so the suggestion
  // list stays stable as the operator pivots tabs.
  const availableDateAddedYears = useMemo(() => {
    const years = new Set<number>();
    for (const a of albums) {
      if (!a.isGoodTunesRelease) continue;
      if (!a.createdAt) continue;
      const y = new Date(a.createdAt).getFullYear();
      if (!Number.isFinite(y)) continue;
      years.add(y);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [albums]);

  const isFilterActive =
    typeFilter.size !== 3 ||
    dateAddedYear !== null ||
    genreFilter !== "" ||
    explicitFilter !== "any" ||
    spinPromoOnly;

  const filtered = useMemo(() => {
    const wantGenre = genreFilter.trim().toLowerCase();
    return searched.filter((a) => {
      if (!typeFilter.has(a.type)) return false;
      if (dateAddedYear !== null) {
        if (!a.createdAt) return false;
        const y = new Date(a.createdAt).getFullYear();
        if (y !== dateAddedYear) return false;
      }
      if (wantGenre) {
        const g = (a.genre ?? "").trim().toLowerCase();
        if (g !== wantGenre) return false;
      }
      if (explicitFilter === "explicit" && !a.isExplicit) return false;
      if (explicitFilter === "clean" && a.isExplicit) return false;
      if (spinPromoOnly && !a.isSpinPromo) return false;
      return true;
    });
  }, [searched, typeFilter, dateAddedYear, genreFilter, explicitFilter, spinPromoOnly]);

  const resetFilters = () => {
    setTypeFilter(new Set<AlbumLite["type"]>(["LP", "EP", "Duo"]));
    setDateAddedYear(null);
    setGenreFilter("");
    setExplicitFilter("any");
    setSpinPromoOnly(false);
  };

  const toggleType = (t: AlbumLite["type"]) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        if (next.size === 1) return prev; // never allow empty
        next.delete(t);
      } else {
        next.add(t);
      }
      return next;
    });
  };

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (!user?.isAdmin) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <h1 className="text-slate-900 text-xl font-bold">Admin only</h1>
          <p className="text-slate-500 text-sm">
            You need an admin account to view this page.
          </p>
          <button
            onClick={() => navigate("/collection")}
            className="px-3 py-1.5 rounded-md bg-[var(--brand-blue)] text-white text-sm font-medium"
            data-testid="button-back-to-app"
          >
            Back to the app
          </button>
        </div>
      </main>
    );
  }

  const closeSearch = () => {
    setSearch("");
    setSearchOpen(false);
  };

  const emptyCopy = (() => {
    if (search && searched.length === 0)
      return "No releases match that search.";
    if (isFilterActive && searched.length > 0)
      return "No releases match the current filters.";
    switch (tab) {
      case "prepping":
        return "Nothing in prepping. GoodTunes releases that are still being worked on will show up here once the lifecycle enum lands.";
      case "staged":
        return "Nothing staged. Finished releases scheduled for a future date wait here for sunrise, then go live for fans automatically.";
      case "live":
        return "No released albums yet. Tap + to create one.";
      case "sunset":
        return "No sunset releases. Pulled-from-sale albums show up here.";
      case "attention":
        // Unused — the attention tab renders NeedsAttentionTable, which has
        // its own loading / empty / error states, never this grid empty copy.
        return "";
    }
  })();

  return (
    <AdminFrame active="albums">
      <div className="space-y-5">
        {/* Header + tabs — driven by the shared AdminPageHeader primitive
            so title size / subtitle / spacing match every other admin
            index page. Tabs row is passed as `belowHeader` so its own
            `border-b` provides the hairline (no double border). */}
        <AdminPageHeader
          title="Albums"
          subtitle="Manage everything that shows up in the GoodTunes® player."
          testId="heading-admin-albums"
          actions={(<>
            {/* Task #1967 — search / filter / view controls slice the grid by
                stage; they don't apply to the cross-stage audit table, so
                they're hidden while the "Needs attention" tab is active. */}
            {tab !== "attention" && (<>
            {searchOpen ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-slate-200 shadow-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  className="w-48 bg-transparent text-[12.5px] text-slate-700 placeholder-slate-400 focus:outline-none"
                  placeholder="Find an album or artist…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") closeSearch();
                  }}
                  data-testid="input-search-albums"
                />
                <button
                  type="button"
                  onClick={closeSearch}
                  className="text-slate-400 hover:text-slate-700"
                  data-testid="button-close-search"
                  aria-label="Close search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <IconBtn
                onClick={() => setSearchOpen(true)}
                label="Search"
                testId="button-open-search"
              >
                <Search className="w-4 h-4" />
              </IconBtn>
            )}
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Filter"
                  title="Filter"
                  data-testid="button-filter"
                  className="relative w-9 h-9 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 data-[state=open]:bg-slate-100 data-[state=open]:text-slate-900 data-[state=open]:ring-1 data-[state=open]:ring-slate-200 transition-colors"
                >
                  <Filter className="w-4 h-4" />
                  {isFilterActive && (
                    <span
                      className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--brand-blue)]"
                      data-testid="badge-filter-active"
                    />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                alignOffset={-8}
                sideOffset={6}
                className="w-[300px] p-0 bg-white border border-slate-200 rounded-xl shadow-[0_10px_30px_-12px_rgba(15,23,42,0.18)]"
                data-testid="popover-filter"
              >
                {/* Apple-style caret tying the popover to the Filter button —
                    Radix positions the arrow at the trigger center, so with
                    align="end" + alignOffset=-8 it lands directly under the
                    icon. */}
                <PopoverArrow />
                <div className="px-4 pt-3.5 pb-4 space-y-4">
                  {/* Type — refined chip group: slate-100 base, brand-blue
                      ring + tint on active, no heavy saturated fill. */}
                  <FilterSection label="Type">
                    <div className="flex flex-wrap gap-1.5">
                      {(["LP", "EP", "Duo"] as const).map((t) => (
                        <FilterChip
                          key={t}
                          active={typeFilter.has(t)}
                          onClick={() => toggleType(t)}
                          testId={`filter-type-${t}`}
                        >
                          {t}
                        </FilterChip>
                      ))}
                    </div>
                  </FilterSection>

                  {/* Genre — single-select via the shared admin Combobox.
                      Same primitive as the album detail page's Genre field
                      so the picker reads identically across the two
                      surfaces. `allowAdd={false}` because filtering by a
                      genre that doesn't exist in the catalog would always
                      return zero rows; `allowClear` exposes the "Any"
                      escape hatch. */}
                  <FilterSection label="Genre">
                    <Combobox
                      value={genreFilter}
                      onChange={setGenreFilter}
                      optionsEndpoint="/api/admin/albums/genres"
                      placeholder="Any genre"
                      testId="filter-genre"
                      allowAdd={false}
                      allowClear
                    />
                  </FilterSection>

                  {/* Date added — typeable year picker. The datalist
                      suggests every year that actually has albums in the
                      catalog; the operator can also type any 4-digit
                      year. Blank input clears the filter. */}
                  <FilterSection label="Date added">
                    <div className="flex items-center gap-1.5">
                      {/* Year dropdown — GoodTunes itself shipped in 2024,
                          so there are no admin-managed releases dated
                          earlier. Range runs from 2024 → max(this year,
                          latest year actually present in the catalog) so
                          if the system clock ever drifts the list still
                          covers every row in the grid. */}
                      <select
                        value={dateAddedYear ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDateAddedYear(v ? parseInt(v, 10) : null);
                        }}
                        data-testid="filter-date-added-input"
                        className="flex-1 h-8 px-2.5 text-[13px] bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/30 focus:border-[var(--brand-blue)] tabular-nums"
                      >
                        <option value="">Any year</option>
                        {(() => {
                          const thisYear = new Date().getFullYear();
                          const latest = Math.max(
                            thisYear,
                            availableDateAddedYears[0] ?? thisYear,
                          );
                          const years: number[] = [];
                          for (let y = latest; y >= 2024; y--) years.push(y);
                          return years.map((y) => (
                            <option
                              key={y}
                              value={y}
                              data-testid={`filter-date-added-${y}`}
                            >
                              {y}
                            </option>
                          ));
                        })()}
                      </select>
                    </div>
                  </FilterSection>

                  {/* Explicit — tri-state segmented control */}
                  <FilterSection label="Explicit">
                    <div className="inline-flex items-center bg-slate-100 rounded-md p-0.5 w-full">
                      {(
                        [
                          { v: "any", label: "Any" },
                          { v: "explicit", label: "Explicit only" },
                          { v: "clean", label: "Clean only" },
                        ] as const
                      ).map((opt) => {
                        const active = explicitFilter === opt.v;
                        return (
                          <button
                            key={opt.v}
                            type="button"
                            onClick={() => setExplicitFilter(opt.v)}
                            aria-pressed={active}
                            data-testid={`filter-explicit-${opt.v}`}
                            className={[
                              "flex-1 h-8 text-[12px] font-semibold rounded transition-colors",
                              active
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-500 hover:text-slate-900",
                            ].join(" ")}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </FilterSection>

                  {/* SPIN Promo — admin-only flag (purple disc badge on the
                      tile/row). Single toggle: on = show only flagged
                      titles so Bill can audit the set without opening each
                      album. Mirrored to the URL as `?spinPromo=1`. */}
                  <FilterSection label="SPIN Promo">
                    <div className="inline-flex items-center bg-slate-100 rounded-md p-0.5 w-full">
                      {(
                        [
                          { v: false, label: "Any" },
                          { v: true, label: "Flagged only" },
                        ] as const
                      ).map((opt) => {
                        const active = spinPromoOnly === opt.v;
                        return (
                          <button
                            key={String(opt.v)}
                            type="button"
                            onClick={() => setSpinPromoOnly(opt.v)}
                            aria-pressed={active}
                            data-testid={`filter-spin-promo-${opt.v ? "on" : "any"}`}
                            className={[
                              "flex-1 h-8 text-[12px] font-semibold rounded transition-colors",
                              active
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-500 hover:text-slate-900",
                            ].join(" ")}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </FilterSection>
                </div>
                <div className="flex items-center justify-end px-4 py-2.5 border-t border-slate-100 bg-slate-50/60">
                  <button
                    type="button"
                    onClick={resetFilters}
                    disabled={!isFilterActive}
                    data-testid="button-filter-reset"
                    className="text-[12.5px] font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </PopoverContent>
            </Popover>
            <div className="ml-1">
              <ViewModeToggle
                value={view}
                onChange={setView}
                testIdPrefix="view-mode-albums"
              />
            </div>
            </>)}
            {/* Task #445 — "+ Add Album" opens the "Who's the artist?"
                dialog first. After the artist is picked (or skipped),
                the mutation creates the album with primaryArtistId set
                and navigates into the existing onboarding flow. */}
            <button
              type="button"
              disabled={createAlbum.isPending}
              onClick={() => {
                if (createAlbum.isPending) return;
                // Task #1251 — artist-role users already are the artist,
                // so skip the "Who's the artist?" picker and go straight
                // to naming the album with their own identity attached.
                // Other roles (super_admin/admin/label) keep the picker;
                // an artist with no scope id falls back to it too.
                if (user?.role === "artist" && user.roleScopeId) {
                  setPendingArtist({
                    name: user.roleScopeName || user.displayName,
                    id: user.roleScopeId,
                  });
                  setTitleDialogOpen(true);
                  return;
                }
                setArtistDialogOpen(true);
              }}
              className="px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-new-album"
            >
              <Plus className="w-3 h-3" />
              Add Album
            </button>
            <NewAlbumArtistDialog
              open={artistDialogOpen}
              onOpenChange={(next) => {
                // Don't allow the user to dismiss mid-create; the
                // navigate on success will unmount us anyway.
                if (createAlbum.isPending && !next) return;
                setArtistDialogOpen(next);
              }}
              busy={createAlbum.isPending}
              mode="album"
              onSelect={({ name, id }) => {
                if (createAlbum.isPending) return;
                // Task #468 — hand off to the title dialog. The artist
                // dialog closes, the title dialog opens with the
                // resolved artist echoed back as helper copy.
                setPendingArtist({ name, id });
                setArtistDialogOpen(false);
                setTitleDialogOpen(true);
              }}
              onSkip={() => {
                if (createAlbum.isPending) return;
                setPendingArtist(null);
                setArtistDialogOpen(false);
                setTitleDialogOpen(true);
              }}
            />
            <NewAlbumTitleDialog
              open={titleDialogOpen}
              onOpenChange={(next) => {
                if (createAlbum.isPending && !next) return;
                setTitleDialogOpen(next);
              }}
              artistName={pendingArtist?.name ?? null}
              busy={createAlbum.isPending}
              onSubmit={(title) => {
                if (createAlbum.isPending) return;
                createAlbum.mutate({
                  title,
                  artist: pendingArtist ?? undefined,
                });
              }}
            />
          </>)}
          belowHeader={(
            <div className="border-b border-slate-200 flex items-center gap-6 overflow-x-auto mt-3">
              <TabBtn active={tab === "prepping"} onClick={() => setTab("prepping")} count={counts.prepping} testId="tab-prepping">
                Prepping
              </TabBtn>
              <TabBtn active={tab === "staged"} onClick={() => setTab("staged")} count={counts.staged} testId="tab-staged">
                Staged
              </TabBtn>
              <TabBtn active={tab === "live"} onClick={() => setTab("live")} count={counts.live} testId="tab-released">
                Released
              </TabBtn>
              <TabBtn active={tab === "sunset"} onClick={() => setTab("sunset")} count={counts.sunset} testId="tab-sunset">
                Sunset
              </TabBtn>
              {/* Task #1967 — cross-stage incomplete-albums audit. Operator-
                  only (the report route is super_admin/admin); hidden for
                  partner admins, who'd 403 on the endpoint. */}
              {isOperator && (
                <TabBtn active={tab === "attention"} onClick={() => setTab("attention")} count={counts.attention} testId="tab-attention">
                  Needs attention
                </TabBtn>
              )}
            </div>
          )}
        />

        {/* Task #1314 — migration sweep banner. Lists releases whose own
            share slug is set but whose primary artist never got an artist
            slug, so their two-part link is dead until the artist URL is set.
            Each links straight to the album where the one-tap fix lives. */}
        {tab !== "attention" && (
          <IncompleteShareLinksBanner listQuery={listQueryString} />
        )}

        {/* Task #1967 — cross-stage incomplete-albums audit table. Renders in
            place of the grid on the "Needs attention" tab; has its own
            loading / empty / error states off a dedicated server aggregate. */}
        {tab === "attention" ? (
          <NeedsAttentionTable
            query={incompleteQuery}
            listQuery={listQueryString}
          />
        ) : (
        <>
        {/* GRID */}
        {isLoading ? (
          <div className="py-20 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : albumsError ? (
          <ErrorState
            error={albumsErrorObj}
            onRetry={() => refetchAlbums()}
            title="Couldn't load albums"
            testId="admin-albums-error"
          />
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-slate-500 text-sm max-w-md mx-auto">
            {emptyCopy}
          </div>
        ) : view === "grid" ? (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-7"
            data-testid="grid-admin-albums"
          >
            {filtered.map((a) => (
              <AlbumTile
                key={a.id}
                album={a}
                href={albumHref(a.id, listQueryString)}
              />
            ))}
          </div>
        ) : (
          <div
            className="rounded-lg border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100"
            data-testid="list-admin-albums"
          >
            {filtered.map((a) => (
              <AlbumRow
                key={a.id}
                album={a}
                href={albumHref(a.id, listQueryString)}
                canDuplicate={isOperator}
                onDuplicate={(id) => duplicateAlbum.mutate(id)}
                isDuplicating={
                  duplicateAlbum.isPending && duplicateAlbum.variables === a.id
                }
              />
            ))}
          </div>
        )}
        </>
        )}

      </div>
    </AdminFrame>
  );
}

/* ─── Pieces ────────────────────────────────────────────────────────── */

// Task #1314 — migration sweep banner for half-built share links. Task #1310
// switched share links to a two-part artist/album shape; any album whose own
// `share_slug` is still set but whose primary artist never got an
// `artist_share_slug` now resolves to a dead link. The endpoint returns those
// releases; each row deep-links to the album page where the one-tap "Suggest &
// save artist URL" fix lives. Renders nothing when there's nothing to fix.
type IncompleteShareLink = {
  id: string;
  title: string;
  artist: string;
  shareSlug: string | null;
  primaryArtistId: string | null;
  artistName: string | null;
};

function IncompleteShareLinksBanner({ listQuery }: { listQuery: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery<{ albums: IncompleteShareLink[] }>({
    queryKey: ["/api/admin/albums/incomplete-share-links"],
    staleTime: Infinity,
  });
  const items = data?.albums ?? [];
  if (items.length === 0) return null;

  return (
    <div
      className="rounded-lg border border-amber-200 bg-amber-50 p-3"
      data-testid="banner-incomplete-share-links"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-900">
            {items.length} release{items.length === 1 ? "" : "s"} with an incomplete share link
          </p>
          <p className="text-xs text-amber-800 mt-0.5 leading-snug">
            These have an album URL but their artist never got an artist URL, so
            the two-part share link won't work yet. Open each release to set (or
            one-tap suggest) its artist URL.
          </p>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-1.5 text-xs font-semibold text-amber-900 hover:underline"
            data-testid="button-toggle-incomplete-share-links"
          >
            {open ? "Hide list" : "Show list"}
          </button>
          {open && (
            <ul className="mt-2 space-y-1" data-testid="list-incomplete-share-links">
              {items.map((a) => (
                <li key={a.id}>
                  <Link
                    href={albumHref(a.id, listQuery)}
                    className="text-xs text-amber-900 hover:underline"
                    data-testid={`link-incomplete-share-${a.id}`}
                  >
                    <span className="font-medium">{a.title}</span>
                    <span className="text-amber-700"> — {a.artistName || a.artist}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// Task #1967 — small stage pill for the audit table. Uses the SAME
// `albumStage` rule as the four lifecycle tabs so the badge can never
// disagree with where the album actually sits. Stage is shown here as a
// column (not a filter) because the audit spans every stage at once.
const STAGE_BADGE: Record<
  ReturnType<typeof albumStage>,
  { label: string; className: string }
> = {
  prepping: { label: "Prepping", className: "bg-slate-100 text-slate-600" },
  staged: { label: "Staged", className: "bg-[color:var(--brand-blue)]/10 text-[color:var(--brand-blue)]" },
  released: { label: "Released", className: "bg-emerald-100 text-emerald-700" },
  sunset: { label: "Sunset", className: "bg-slate-200 text-slate-700" },
};

function StageBadge({ stage }: { stage: ReturnType<typeof albumStage> }) {
  const s = STAGE_BADGE[stage];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${s.className}`}
      data-testid={`badge-stage-${stage}`}
    >
      {s.label}
    </span>
  );
}

// One completeness cell: shows `value/total` (or a bare count for Tracks).
// Short of complete → amber-flagged; complete → neutral slate. A zero total
// (album with no tracks) is treated as incomplete for the per-dimension
// cells so an empty release reads as needing work, matching the Tracks tab.
function CountCell({
  value,
  total,
  testId,
  showTotal = true,
}: {
  value: number;
  total: number;
  testId: string;
  showTotal?: boolean;
}) {
  const complete = showTotal ? total > 0 && value >= total : value > 0;
  return (
    <td className="px-3 py-2.5 text-right">
      <span
        className={`inline-flex items-center justify-end gap-1 px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums ${
          complete ? "text-slate-600" : "bg-amber-100 text-amber-800"
        }`}
        data-testid={testId}
      >
        {!complete && <AlertTriangle className="w-3 h-3 flex-shrink-0" />}
        {showTotal ? `${value}/${total}` : value}
      </span>
    </td>
  );
}

// Task #1967 — the "Needs attention" cross-stage incomplete-albums audit.
// One scannable table of every GoodTunes release short of complete in at
// least one dimension (tracks / masters / lyrics / credits), aggregated
// server-side. Each row deep-links into the album editor carrying the list
// query so "Back to albums" returns here. Has its own loading / empty /
// error states; the friendly empty state means everything is complete.
function NeedsAttentionTable({
  query,
  listQuery,
}: {
  query: UseQueryResult<{ rows: IncompleteAlbumRow[] }, Error>;
  listQuery: string;
}) {
  const [, navigate] = useLocation();
  const rows = query.data?.rows ?? [];

  if (query.isLoading) {
    return (
      <div
        className="rounded-lg border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100"
        data-testid="loading-needs-attention"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <div className="w-10 h-10 rounded bg-slate-100 animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-40 rounded bg-slate-100 animate-pulse" />
              <div className="h-2.5 w-24 rounded bg-slate-100 animate-pulse" />
            </div>
            <div className="h-3 w-32 rounded bg-slate-100 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => query.refetch()}
        title="Couldn't load the audit"
        testId="needs-attention-error"
      />
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className="py-20 text-center max-w-md mx-auto"
        data-testid="empty-needs-attention"
      >
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
        <p className="text-slate-900 text-sm font-semibold">Everything's complete</p>
        <p className="text-slate-500 text-sm mt-1 leading-snug">
          Every GoodTunes release has all its tracks, masters, lyrics, and
          credits in place. Nothing needs attention right now.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white overflow-x-auto"
      data-testid="table-needs-attention"
    >
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">Album</th>
            <th className="px-3 py-2 font-semibold hidden sm:table-cell">Artist</th>
            <th className="px-3 py-2 font-semibold">Stage</th>
            <th className="px-3 py-2 font-semibold text-right">Tracks</th>
            <th className="px-3 py-2 font-semibold text-right">Masters</th>
            <th className="px-3 py-2 font-semibold text-right">Lyrics</th>
            <th className="px-3 py-2 font-semibold text-right">Credits</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const href = albumHref(r.id, listQuery);
            return (
              <tr
                key={r.id}
                onClick={() => navigate(href)}
                className="hover:bg-slate-50 cursor-pointer transition-colors"
                data-testid={`row-attention-${r.id}`}
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={href}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-2.5 min-w-0 group"
                    data-testid={`link-attention-${r.id}`}
                  >
                    <div className="w-10 h-10 rounded overflow-hidden bg-slate-100 ring-1 ring-slate-200/60 flex-shrink-0">
                      <AlbumCover
                        artwork={realArtwork(r.artwork)}
                        title={r.title}
                        showName={false}
                      />
                    </div>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900 truncate group-hover:text-[var(--brand-blue)] transition-colors">
                        {r.title}
                      </span>
                      <span className="block text-xs text-slate-500 truncate sm:hidden">
                        {r.artist}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-600 truncate hidden sm:table-cell">
                  {r.artist}
                </td>
                <td className="px-3 py-2.5">
                  <StageBadge stage={albumStage(r)} />
                </td>
                <CountCell
                  value={r.trackCount}
                  total={0}
                  showTotal={false}
                  testId={`cell-tracks-${r.id}`}
                />
                <CountCell
                  value={r.mastersReady}
                  total={r.trackCount}
                  testId={`cell-masters-${r.id}`}
                />
                <CountCell
                  value={r.lyricsSatisfied}
                  total={r.trackCount}
                  testId={`cell-lyrics-${r.id}`}
                />
                <CountCell
                  value={r.creditsComplete}
                  total={r.trackCount}
                  testId={`cell-credits-${r.id}`}
                />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AlbumTile({ album, href }: { album: AlbumLite; href: string }) {
  const countdown =
    albumStage(album) === "staged"
      ? sunriseCountdownLabel(album.goodTunesReleaseDate)
      : null;
  return (
    <Link
      href={href}
      className="group block"
      data-testid={`tile-album-${album.id}`}
    >
      <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 shadow-sm group-hover:shadow-md transition-shadow ring-1 ring-slate-200/60">
        <AlbumCover artwork={realArtwork(album.artwork)} title={album.title} />
        {album.isHidden && (
          <div
            className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/65 text-white text-[10px] font-bold uppercase tracking-wide backdrop-blur-sm"
            title="Pulled from sale — owners keep access"
          >
            <EyeOff className="w-2.5 h-2.5" />
            Sunset
          </div>
        )}
        {/* Task #799 — TEMPORARY admin-only "SPIN Promo" tile badge. No
            fan-facing effect; remove with the rest of the flag. */}
        {album.isSpinPromo && (
          <div
            className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[color:var(--brand-purple)]/85 text-white text-[10px] font-bold uppercase tracking-wide backdrop-blur-sm"
            title="SPIN Promo — digital-only legacy release (admin-only tag)"
            data-testid={`badge-spin-promo-tile-${album.id}`}
          >
            <Disc3 className="w-2.5 h-2.5" />
            SPIN
          </div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <div
          className="text-slate-900 text-[13.5px] font-semibold truncate group-hover:text-[var(--brand-blue)] transition-colors"
          data-testid={`text-album-title-${album.id}`}
        >
          {album.title}
        </div>
        <div className="text-slate-500 text-[12px] truncate">
          {album.artist}
        </div>
        <div className="text-slate-400 text-[10.5px] mt-0.5 uppercase tracking-wide font-semibold flex items-center gap-1.5">
          <span>
            {album.type}
            {album.year && <> · {album.year}</>}
          </span>
          {album.isExplicit && <ExplicitBadge tone="slate" />}
        </div>
        {countdown && (
          <div
            className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[color:var(--brand-blue)]/10 text-[color:var(--brand-blue)] text-xs font-semibold tabular-nums"
            title={`Goes live for fans on ${album.goodTunesReleaseDate}`}
            data-testid={`text-sunrise-countdown-tile-${album.id}`}
          >
            <Clock className="w-2.5 h-2.5" />
            {countdown}
          </div>
        )}
      </div>
    </Link>
  );
}

function AlbumRow({
  album,
  href,
  canDuplicate,
  onDuplicate,
  isDuplicating,
}: {
  album: AlbumLite;
  href: string;
  canDuplicate: boolean;
  onDuplicate: (id: string) => void;
  isDuplicating: boolean;
}) {
  const countdown =
    albumStage(album) === "staged"
      ? sunriseCountdownLabel(album.goodTunesReleaseDate)
      : null;
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 px-3 py-2 hover:bg-slate-50 transition-colors"
      data-testid={`row-album-${album.id}`}
    >
      <div className="w-12 h-12 rounded-md overflow-hidden bg-slate-100 ring-1 ring-slate-200 flex-shrink-0">
        <AlbumCover
          artwork={realArtwork(album.artwork)}
          title={album.title}
          showName={false}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-slate-900 text-[13.5px] font-semibold group-hover:text-[var(--brand-blue)] transition-colors flex items-center gap-2.5"
          data-testid={`text-album-title-${album.id}`}
        >
          <span className="min-w-0 flex-1 truncate">{album.title}</span>
          {album.isExplicit && <ExplicitBadge tone="slate" />}
        </div>
        <div className="text-slate-500 text-[12px] truncate">
          {album.artist}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Task #799 — TEMPORARY admin-only "SPIN Promo" row badge. No
            fan-facing effect; remove with the rest of the flag. */}
        {album.isSpinPromo && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-[color:var(--brand-purple)] bg-[color:var(--brand-purple)]/10"
            title="SPIN Promo — digital-only legacy release (admin-only tag)"
            data-testid={`badge-spin-promo-row-${album.id}`}
          >
            <Disc3 className="w-2.5 h-2.5" />
            SPIN
          </span>
        )}
        {album.isHidden && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wide"
            title="Pulled from sale — owners keep access"
          >
            <EyeOff className="w-2.5 h-2.5" />
            Sunset
          </span>
        )}
        {countdown && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[color:var(--brand-blue)]/10 text-[color:var(--brand-blue)] text-xs font-semibold tabular-nums"
            title={`Goes live for fans on ${album.goodTunesReleaseDate}`}
            data-testid={`text-sunrise-countdown-row-${album.id}`}
          >
            <Clock className="w-2.5 h-2.5" />
            {countdown}
          </span>
        )}
        <span className="text-slate-400 text-[11px] uppercase tracking-wide font-semibold tabular-nums">
          {album.type}
          {album.year && <> · {album.year}</>}
        </span>
        {/* Task #1494 — per-row actions menu (Duplicate). Operator-only
            (the server route enforces it too); partner admins never see it.
            Trigger lives inside the row anchor, so it preventDefault/
            stopPropagation to keep the row tap from navigating; the portalled
            menu sits outside the anchor. Hover-revealed to match the chrome. */}
        {canDuplicate && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              disabled={isDuplicating}
              aria-label="Album actions"
              title="Album actions"
              className="inline-flex items-center justify-center w-7 h-7 -mr-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 data-[state=open]:bg-slate-100 data-[state=open]:text-slate-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 transition-opacity"
              data-testid={`button-album-actions-${album.id}`}
            >
              <span className="sr-only">Album actions</span>
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="min-w-[240px] p-1.5 bg-white text-slate-900 border border-slate-200 shadow-lg"
          >
            <DropdownMenuItem
              onSelect={() => onDuplicate(album.id)}
              disabled={isDuplicating}
              data-testid={`menu-duplicate-album-${album.id}`}
              className="gap-2.5 px-2.5 py-2 text-xs cursor-pointer focus:bg-slate-100 focus:text-slate-900 data-[disabled]:opacity-50"
            >
              <Copy className="w-4 h-4 text-slate-500" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900">
                  {isDuplicating ? "Duplicating…" : "Duplicate album"}
                </div>
                <div className="text-xs text-slate-500">
                  Clones into a new Prepping draft.
                </div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        )}
      </div>
    </Link>
  );
}

function TabBtn({
  active,
  onClick,
  count,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={[
        "relative py-2.5 text-[13.5px] font-semibold transition-colors inline-flex items-center gap-1.5 flex-shrink-0",
        active ? "text-slate-900" : "text-slate-400 hover:text-slate-700",
      ].join(" ")}
    >
      {children}
      <span
        className={[
          "tabular-nums text-[11.5px] font-bold px-1.5 py-px rounded",
          active ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-400",
        ].join(" ")}
      >
        {count}
      </span>
      {active && (
        <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-[var(--brand-blue)] rounded-full" />
      )}
    </button>
  );
}

function FilterSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}

/**
 * Filter chip — soft slate-100 pill at rest, brand-blue tint + ring +
 * brand-blue text on active. Avoids the heavy saturated fill of the
 * first pass; reads closer to the admin "Mac-app" chrome.
 */
function FilterChip({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={[
        "h-7 px-2.5 text-[12px] font-semibold rounded-md transition-colors inline-flex items-center",
        active
          ? "bg-[var(--brand-blue)]/12 text-[#1f7ab4] ring-1 ring-inset ring-[var(--brand-blue)]/40"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  testId,
  tone,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
  testId?: string;
  tone?: "primary";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testId}
      disabled={disabled}
      className={[
        "w-9 h-9 inline-flex items-center justify-center rounded-md transition-colors",
        tone === "primary"
          ? "bg-transparent border border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
          : "text-slate-500 hover:text-slate-900 hover:bg-slate-100",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
