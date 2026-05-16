import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Filter, EyeOff, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";

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
 *   - Live     — visible for purchase (isGoodTunesRelease && !isHidden)
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
}

type TabKey = "prepping" | "staged" | "live" | "sunset";

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

  const counts = useMemo(
    () => ({
      // "Prepping" today = imports that haven't been promoted to a GT release.
      // Once we add a real `lifecycle` enum, switch this over.
      prepping: albums.filter((a) => !a.isGoodTunesRelease).length,
      // No schema field for staged yet — see Storefront in docs/roadmap.md.
      staged: 0,
      live: albums.filter((a) => a.isGoodTunesRelease && !a.isHidden).length,
      sunset: albums.filter((a) => a.isGoodTunesRelease && a.isHidden).length,
    }),
    [albums],
  );

  const byTab = useMemo(() => {
    switch (tab) {
      case "prepping":
        return albums.filter((a) => !a.isGoodTunesRelease);
      case "staged":
        return [];
      case "live":
        return albums.filter((a) => a.isGoodTunesRelease && !a.isHidden);
      case "sunset":
        return albums.filter((a) => a.isGoodTunesRelease && a.isHidden);
    }
  }, [albums, tab]);

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

  const emptyCopy = (() => {
    if (search) return "No releases match that search.";
    switch (tab) {
      case "prepping":
        return "Nothing in prepping. Imported albums waiting to be promoted to a release show up here.";
      case "staged":
        return "Staged releases (ready, waiting for sunrise) will appear here when the schedule schema lands.";
      case "live":
        return "No live releases yet. Tap + to create one.";
      case "sunset":
        return "No sunset releases. Pulled-from-sale albums show up here.";
    }
  })();

  return (
    <AdminFrame active="albums">
      <div className="space-y-5">
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

        {/* TABS — 4-state release lifecycle. Prepping/Staged are intentionally
            count=0 or count=imports today; full schema in roadmap. */}
        <div className="border-b border-slate-200 flex items-center gap-6 overflow-x-auto">
          <TabBtn active={tab === "prepping"} onClick={() => setTab("prepping")} count={counts.prepping} testId="tab-prepping">
            Prepping
          </TabBtn>
          <TabBtn active={tab === "staged"} onClick={() => setTab("staged")} count={counts.staged} testId="tab-staged">
            Staged
          </TabBtn>
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
          <div className="py-20 text-center text-slate-500 text-sm max-w-md mx-auto">
            {emptyCopy}
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
        "w-9 h-9 inline-flex items-center justify-center rounded-md transition-colors",
        tone === "primary"
          ? "bg-white border border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white"
          : "text-slate-500 hover:text-slate-900 hover:bg-slate-100",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
