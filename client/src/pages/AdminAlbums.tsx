import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Filter, EyeOff, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Admin home · Albums (Phase 1).
 *
 * Apple-Music-store look in our white/light skin: big artwork tiles in a
 * grid with title + artist underneath. Underline text tabs slice by
 * lifecycle. Today we honestly only have two states:
 *   - Live   = isGoodTunesRelease && !isHidden
 *   - Sunset = isHidden  (pulled from sale; existing owners keep it)
 * "Prep" is a roadmap state (needs a sunrise/draft flag in the schema).
 * Auto-sunset by scheduled date also lives in the roadmap. When those
 * land, add tabs here.
 *
 * Toolbar lives in the header — icon-only search/filter/+ to stay quiet.
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
}

type TabKey = "live" | "sunset";

export function AdminAlbums() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<TabKey>("live");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const releases = useMemo(
    () => albums.filter((a) => a.isGoodTunesRelease),
    [albums],
  );

  // "Sunset" = pulled from sale (isHidden). Existing owners keep the
  // album in their Collection regardless — Collection is per-user and
  // orthogonal to the album's storefront visibility.
  const counts = useMemo(
    () => ({
      live: releases.filter((a) => !a.isHidden).length,
      sunset: releases.filter((a) => a.isHidden).length,
    }),
    [releases],
  );

  const byTab = useMemo(
    () =>
      tab === "live"
        ? releases.filter((a) => !a.isHidden)
        : releases.filter((a) => a.isHidden),
    [releases, tab],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.artist.toLowerCase().includes(q),
    );
  }, [byTab, search]);

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

  return (
    <main className="min-h-screen bg-slate-50 p-8 font-sans antialiased">
      <div className="max-w-[1180px] mx-auto space-y-5">
        {/* HEADER */}
        <div className="flex items-end justify-between gap-3 pb-1">
          <div className="min-w-0">
            <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
              GoodTunes Admin
            </div>
            <h1
              className="text-slate-900 text-[26px] font-bold tracking-tight"
              data-testid="heading-admin-albums"
            >
              Albums
            </h1>
            <p className="text-slate-500 text-[12.5px]">
              Manage everything that shows up in the GoodTunes® player.
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
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
            <IconBtn
              onClick={() => navigate("/admin")}
              label="New album"
              testId="button-new-album"
              tone="primary"
            >
              <Plus className="w-4 h-4" />
            </IconBtn>
          </div>
        </div>

        {/* TABS — underline style. Add Prep + Sunset when sunrise/sunset
            schema lands (see Storefront in docs/roadmap.md). */}
        <div className="border-b border-slate-200 flex items-center gap-6">
          <TabBtn active={tab === "live"} onClick={() => setTab("live")} count={counts.live} testId="tab-live">
            Live
          </TabBtn>
          <TabBtn active={tab === "sunset"} onClick={() => setTab("sunset")} count={counts.sunset} testId="tab-sunset">
            Sunset
          </TabBtn>
        </div>

        {/* GRID */}
        {isLoading ? (
          <div className="py-20 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-slate-500 text-sm">
            {tab === "sunset"
              ? search
                ? "No sunset releases match that search."
                : "No sunset releases. Pulled-from-sale albums show up here."
              : search
                ? "No releases match that search."
                : "No live releases yet. Tap + to create one."}
          </div>
        ) : (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-7"
            data-testid="grid-admin-albums"
          >
            {filtered.map((a) => (
              <AlbumTile key={a.id} album={a} />
            ))}
          </div>
        )}

        {/* FOOTER NOTE */}
        <p className="text-slate-400 text-[11px] leading-relaxed px-1 pt-4">
          <span className="font-semibold text-slate-500">Scope:</span> the
          admin only manages what the player needs — cover art, metadata,
          credits, lyrics, files. No distribution, no royalty collection, no
          DSP delivery.
        </p>
      </div>
    </main>
  );
}

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
        <div className="text-slate-400 text-[10.5px] mt-0.5 uppercase tracking-wide font-semibold">
          {album.type}
          {album.year && <> · {album.year}</>}
        </div>
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
        "relative py-2.5 text-[13.5px] font-semibold transition-colors inline-flex items-center gap-1.5",
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
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
  testId?: string;
  tone?: "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={[
        "w-9 h-9 inline-flex items-center justify-center rounded-md border transition-colors",
        tone === "primary"
          ? "bg-[#319ED8] hover:bg-[#2890c8] text-white border-[#319ED8]"
          : "bg-white hover:bg-slate-50 text-slate-600 border-slate-200",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
