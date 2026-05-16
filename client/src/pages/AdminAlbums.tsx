import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronRight, Plus, EyeOff, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Admin · Albums list (Phase 1 of admin restructure).
 *
 * The new admin surface is a per-album / per-track storyboard. This page is
 * the album picker that sits at the top of that flow. Each row links into
 * /admin/albums/:id where the per-album tab shell lives (Overview, Tracks,
 * Artwork, Masters, Bonus). The existing /admin route is preserved
 * untouched so the classic single-page editor is still reachable while we
 * incrementally migrate functionality into the new pages.
 *
 * Data: piggy-backs on the same /api/albums query the classic admin uses,
 * so this page and /admin stay in sync via TanStack Query's cache. No new
 * endpoints introduced in Phase 1.
 */
interface AlbumLite {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  year: number | null;
  type: "Single" | "EP" | "LP";
  isHidden: boolean;
  isGoodTunesRelease: boolean;
}

export function AdminAlbums() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");

  // Match the classic admin: tag <body> so index.css `.gt-admin` overrides
  // the global dark fan-player chrome and gives us a light surface.
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

  const { data: albums = [], isLoading } = useQuery<AlbumLite[]>({
    queryKey: ["/api/albums"],
    enabled: !!user?.isAdmin,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const onlyReleases = albums.filter((a) => a.isGoodTunesRelease);
    if (!q) return onlyReleases;
    return onlyReleases.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.artist.toLowerCase().includes(q),
    );
  }, [albums, search]);

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

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-[1080px] mx-auto px-6 py-8">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
              GoodTunes Admin
            </div>
            <h1
              className="text-slate-900 text-2xl font-bold mt-0.5"
              data-testid="heading-admin-albums"
            >
              Albums
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {filtered.length}{" "}
              {filtered.length === 1 ? "release" : "releases"} in the catalog.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 text-[12px] hover:bg-slate-100 inline-flex items-center gap-1.5"
              data-testid="link-classic-admin"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Classic admin
            </Link>
            <button
              onClick={() => navigate("/admin")}
              className="px-3 py-1.5 rounded-md bg-[#319ED8] text-white text-[12px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5"
              data-testid="button-new-album"
            >
              <Plus className="w-3.5 h-3.5" />
              New album
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-5">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by title or artist…"
              className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-200 bg-white text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#319ED8]"
              data-testid="input-search-albums"
            />
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            {albums.length === 0
              ? "No albums yet. Create one from the classic admin."
              : "No releases match that filter."}
          </div>
        ) : (
          <ul
            className="space-y-2"
            data-testid="list-admin-albums"
          >
            {filtered.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/admin/albums/${a.id}`}
                  className="group flex items-center gap-4 px-4 py-3 rounded-xl bg-white border border-slate-200 hover:border-[#319ED8] hover:shadow-sm transition-all"
                  data-testid={`row-album-${a.id}`}
                >
                  <img
                    src={a.artwork}
                    alt=""
                    className="w-14 h-14 rounded-md object-cover bg-slate-100 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3
                        className="text-slate-900 text-[14.5px] font-semibold truncate"
                        data-testid={`text-album-title-${a.id}`}
                      >
                        {a.title}
                      </h3>
                      {a.isHidden && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wide">
                          <EyeOff className="w-2.5 h-2.5" />
                          Hidden
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wide">
                        {a.type}
                      </span>
                    </div>
                    <div className="text-slate-500 text-[12.5px] truncate mt-0.5">
                      {a.artist}
                      {a.year && ` · ${a.year}`}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-[#319ED8] flex-shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
