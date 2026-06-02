import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, Filter, EyeOff, X, Plus, Disc3, Clock } from "lucide-react";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { ExplicitBadge } from "@/components/ui/ExplicitBadge";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  ViewModeToggle,
  useViewMode,
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
  // Task #799 — TEMPORARY admin-only "SPIN Promo (digital-only legacy)"
  // marker. Drives the small tile/row badge below. No fan-facing effect.
  isSpinPromo?: boolean;
  genre: string | null;
  createdAt: string | null;
}

type TabKey = "prepping" | "staged" | "live" | "sunset";

const TAB_KEYS: TabKey[] = ["prepping", "staged", "live", "sunset"];

// Task #1007 — build the link into an album, carrying the originating tab so
// the album page's delete redirect + "Back to albums" link can return the
// operator to the tab they came from. The default Released tab is omitted to
// keep links clean; the album page falls back to `/admin/albums` (Released)
// when no tab rides along. The existing `from=person` smart-back is set by
// the Person page instead and takes precedence on the album side.
function albumHref(albumId: string, tab: TabKey): string {
  if (tab === "live") return `/admin/albums/${albumId}`;
  return `/admin/albums/${albumId}?from=albums&albumsTab=${tab}`;
}

export function AdminAlbums() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const urlSearch = useSearch();
  // Task #1007 — restore the active tab from the URL (`?tab=`) so a refresh
  // (or a return navigation after deleting/leaving an album) reopens the
  // tab the operator was on instead of snapping back to Released. Read
  // ONCE on mount; the mirror effect below keeps the URL in sync after.
  const initialTab = useMemo<TabKey>(() => {
    try {
      const t = new URLSearchParams(urlSearch).get("tab");
      if (t && (TAB_KEYS as string[]).includes(t)) return t as TabKey;
    } catch {
      /* malformed query string — fall through to the default */
    }
    return "live";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useViewMode("albums");
  const [filterOpen, setFilterOpen] = useState(false);
  // Filter chips cover the three GoodTunes-curated formats (LP / EP /
  // Duo). "Single" is intentionally absent — it's a streaming-import
  // artefact (1-track releases pulled from iTunes/Spotify), and the
  // admin Albums tabs already exclude imports. The default set has all
  // three on so the unfiltered grid shows everything.
  const [typeFilter, setTypeFilter] = useState<Set<AlbumLite["type"]>>(
    () => new Set<AlbumLite["type"]>(["LP", "EP", "Duo"]),
  );
  // "Date added" — single year picker (null = Any). Typeable via the
  // input; the datalist suggests years actually present in the catalog.
  const [dateAddedYear, setDateAddedYear] = useState<number | null>(null);
  // Genre filter — single-select via the shared admin Combobox so it
  // feels the same as the genre field on the album detail page. Empty
  // string = Any.
  const [genreFilter, setGenreFilter] = useState<string>("");
  const [explicitFilter, setExplicitFilter] = useState<
    "any" | "explicit" | "clean"
  >("any");
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

  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Task #1007 — mirror the active tab into the URL (`?tab=`) using `replace`
  // so a refresh or a return navigation (e.g. after deleting an album) lands
  // back on the same tab. The default Released tab keeps a clean URL (param
  // removed); any non-default tab is written. Early-returns when the URL
  // already matches so repeated clicks don't loop the navigate.
  useEffect(() => {
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(urlSearch);
    } catch {
      params = new URLSearchParams();
    }
    const current = params.get("tab");
    if (tab === "live") {
      if (current === null) return;
      params.delete("tab");
    } else {
      if (current === tab) return;
      params.set("tab", tab);
    }
    const qs = params.toString();
    navigate(`/admin/albums${qs ? `?${qs}` : ""}`, { replace: true });
  }, [tab, urlSearch, navigate]);

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
    }),
    [albums],
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
    explicitFilter !== "any";

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
      return true;
    });
  }, [searched, typeFilter, dateAddedYear, genreFilter, explicitFilter]);

  const resetFilters = () => {
    setTypeFilter(new Set<AlbumLite["type"]>(["LP", "EP", "Duo"]));
    setDateAddedYear(null);
    setGenreFilter("");
    setExplicitFilter("any");
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
            {/* Task #445 — "+ Add Album" opens the "Who's the artist?"
                dialog first. After the artist is picked (or skipped),
                the mutation creates the album with primaryArtistId set
                and navigates into the existing onboarding flow. */}
            <button
              type="button"
              disabled={createAlbum.isPending}
              onClick={() => {
                if (createAlbum.isPending) return;
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
            </div>
          )}
        />

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
              <AlbumTile key={a.id} album={a} tab={tab} />
            ))}
          </div>
        ) : (
          <div
            className="rounded-lg border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100"
            data-testid="list-admin-albums"
          >
            {filtered.map((a) => (
              <AlbumRow key={a.id} album={a} tab={tab} />
            ))}
          </div>
        )}

      </div>
    </AdminFrame>
  );
}

/* ─── Pieces ────────────────────────────────────────────────────────── */

function AlbumTile({ album, tab }: { album: AlbumLite; tab: TabKey }) {
  const countdown =
    albumStage(album) === "staged"
      ? sunriseCountdownLabel(album.goodTunesReleaseDate)
      : null;
  return (
    <Link
      href={albumHref(album.id, tab)}
      className="group block"
      data-testid={`tile-album-${album.id}`}
    >
      <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 shadow-sm group-hover:shadow-md transition-shadow ring-1 ring-slate-200/60">
        <img
          src={album.artwork}
          alt={album.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
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

function AlbumRow({ album, tab }: { album: AlbumLite; tab: TabKey }) {
  const countdown =
    albumStage(album) === "staged"
      ? sunriseCountdownLabel(album.goodTunesReleaseDate)
      : null;
  return (
    <Link
      href={albumHref(album.id, tab)}
      className="group flex items-center gap-3 px-3 py-2 hover:bg-slate-50 transition-colors"
      data-testid={`row-album-${album.id}`}
    >
      <div className="w-12 h-12 rounded-md overflow-hidden bg-slate-100 ring-1 ring-slate-200 flex-shrink-0">
        <img
          src={album.artwork}
          alt={album.title}
          className="w-full h-full object-cover"
          loading="lazy"
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
