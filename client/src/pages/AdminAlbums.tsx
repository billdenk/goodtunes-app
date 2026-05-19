import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Search, Filter, EyeOff, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ExplicitBadge } from "@/components/ui/ExplicitBadge";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  ViewModeToggle,
  useViewMode,
} from "@/components/admin/ViewModeToggle";
import { NewAlbumArtistDialog } from "@/components/admin/NewAlbumArtistDialog";

/**
 * Admin home · Albums (Phase 1).
 *
 * Wrapped in AdminFrame (top bar + left entity sidebar) so the new admin
 * keeps the same chrome as the classic one. Apple-Music-store grid in our
 * white/light skin, with the canonical 4-state release lifecycle as
 * underline tabs above it:
 *
 *   - Prepping — we're working on it (today: imported but not yet a GT release)
 *   - Staged   — ready, waiting for sunrise (today: schema doesn't model this; count is 0)
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
  type: "Single" | "EP" | "LP";
  description: string | null;
  isHidden: boolean;
  isGoodTunesRelease: boolean;
  isExplicit: boolean;
}

type TabKey = "prepping" | "staged" | "live" | "sunset";

export function AdminAlbums() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<TabKey>("live");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useViewMode("albums");
  const { toast } = useToast();

  // "+" in the header — opens the "Who's the artist?" dialog first so we
  // can attach a Person up-front (with optional Spotify/Apple enrichment),
  // then creates the blank GoodTunes release and jumps into its editor.
  // The dialog can be skipped — that path falls back to the legacy
  // "Unknown artist" placeholder so the editor still loads.
  const [artistDialogOpen, setArtistDialogOpen] = useState(false);
  const createAlbum = useMutation({
    mutationFn: async (artist?: { name: string; id: string }) => {
      const res = await apiRequest("POST", "/api/admin/albums", {
        title: "New album",
        artist: artist?.name || "Unknown artist",
        artwork: "/album-placeholder.svg",
        type: "LP",
        isGoodTunesRelease: true,
        primaryArtistId: artist?.id || null,
      });
      return res.json() as Promise<AlbumLite>;
    },
    onSuccess: (a) => {
      queryClient.setQueryData<AlbumLite[]>(["/api/albums"], (old) =>
        old ? (old.some((x) => x.id === a.id) ? old : [...old, a]) : [a],
      );
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-albums"] });
      navigate(`/admin/albums/${a.id}`);
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

  const { data: albums = [], isLoading } = useQuery<AlbumLite[]>({
    queryKey: ["/api/albums"],
    enabled: !!user?.isAdmin,
  });

  const counts = useMemo(
    () => ({
      // "Prepping" = GT releases that aren't live yet. We don't model this
      // distinct from "not isGoodTunesRelease" until the lifecycle enum
      // lands (see docs/roadmap.md), so for now this is 0.
      prepping: 0,
      // No schema field for staged yet — see Storefront in docs/roadmap.md.
      staged: 0,
      live: albums.filter((a) => a.isGoodTunesRelease && !a.isHidden).length,
      sunset: albums.filter((a) => a.isGoodTunesRelease && a.isHidden).length,
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
        return [];
      case "staged":
        return [];
      case "live":
        return albums.filter((a) => a.isGoodTunesRelease && !a.isHidden);
      case "sunset":
        return albums.filter((a) => a.isGoodTunesRelease && a.isHidden);
    }
  }, [albums, tab]);

  // Search runs across every GoodTunes release when there's a query (not
  // just the active tab's slice — typing "f" while sitting on Prepping
  // used to filter nothing visible). Imported streaming catalog is
  // excluded everywhere on the admin, search included.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return byTab;
    return albums.filter(
      (a) =>
        a.isGoodTunesRelease &&
        (a.title.toLowerCase().includes(q) ||
          a.artist.toLowerCase().includes(q)),
    );
  }, [albums, byTab, search]);

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
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
            className="px-3 py-1.5 rounded-md bg-[#319ED8] text-white text-sm font-medium"
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
    if (search) return "No releases match that search.";
    switch (tab) {
      case "prepping":
        return "Nothing in prepping. GoodTunes releases that are still being worked on will show up here once the lifecycle enum lands.";
      case "staged":
        return "Staged releases (ready, waiting for sunrise) will appear here when the schedule schema lands.";
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
            <IconBtn label="Filter" testId="button-filter">
              <Filter className="w-4 h-4" />
            </IconBtn>
            <div className="ml-1">
              <ViewModeToggle
                value={view}
                onChange={setView}
                testIdPrefix="view-mode-albums"
              />
            </div>
            <IconBtn
              onClick={() => {
                if (createAlbum.isPending) return;
                setArtistDialogOpen(true);
              }}
              label="New album"
              testId="button-new-album"
              tone="primary"
              disabled={createAlbum.isPending}
            >
              <Plus className="w-4 h-4" />
            </IconBtn>
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
            <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
          </div>
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
              <AlbumTile key={a.id} album={a} />
            ))}
          </div>
        ) : (
          <div
            className="rounded-lg border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100"
            data-testid="list-admin-albums"
          >
            {filtered.map((a) => (
              <AlbumRow key={a.id} album={a} />
            ))}
          </div>
        )}

      </div>
      <NewAlbumArtistDialog
        open={artistDialogOpen}
        onOpenChange={setArtistDialogOpen}
        busy={createAlbum.isPending}
        onSelect={(artist) => {
          setArtistDialogOpen(false);
          createAlbum.mutate(artist);
        }}
        onSkip={() => {
          setArtistDialogOpen(false);
          createAlbum.mutate(undefined);
        }}
      />
    </AdminFrame>
  );
}

/* ─── Pieces ────────────────────────────────────────────────────────── */

function AlbumTile({ album }: { album: AlbumLite }) {
  return (
    <Link
      href={`/admin/albums/${album.id}`}
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
      </div>
      <div className="mt-2 px-0.5">
        <div
          className="text-slate-900 text-[13.5px] font-semibold truncate group-hover:text-[#319ED8] transition-colors"
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
      </div>
    </Link>
  );
}

function AlbumRow({ album }: { album: AlbumLite }) {
  return (
    <Link
      href={`/admin/albums/${album.id}`}
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
          className="text-slate-900 text-[13.5px] font-semibold group-hover:text-[#319ED8] transition-colors flex items-center gap-1.5"
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
        {album.isHidden && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wide"
            title="Pulled from sale — owners keep access"
          >
            <EyeOff className="w-2.5 h-2.5" />
            Sunset
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
        <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-[#319ED8] rounded-full" />
      )}
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
