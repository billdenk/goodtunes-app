import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Filter,
  ChevronRight,
  EyeOff,
  Sparkles,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Admin home · Albums list (Phase 1).
 *
 * Frame 1 of the storyboard. Compact toolbar — search and filter live as
 * icon-only buttons that expand on demand; "New album" is just a `+`
 * next to them, matching how we collapse chrome elsewhere in the player.
 *
 * Data piggy-backs on /api/albums (same query the classic admin uses).
 * Per-album track count + credit-completion are Phase 2 (need a counts
 * query); not faking them in the meantime.
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

export function AdminAlbums() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
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
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return releases;
    return releases.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.artist.toLowerCase().includes(q),
    );
  }, [releases, search]);

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
      <div className="max-w-[860px] mx-auto space-y-3">
        {/* HEADER */}
        <div className="flex items-end justify-between gap-3 pb-1">
          <div className="min-w-0">
            <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
              GoodTunes Admin
            </div>
            <h1
              className="text-slate-900 text-[22px] font-bold"
              data-testid="heading-admin-albums"
            >
              Albums
            </h1>
            <p className="text-slate-500 text-[12px]">
              Manage everything that shows up in the GoodTunes® player.
            </p>
          </div>
          {/* Toolbar — icon-only, expand-on-tap. Search + filter + new. */}
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

        {/* ALBUM ROWS */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="py-12 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              {releases.length === 0
                ? "No releases yet. Create one from the classic admin."
                : "No releases match that search."}
            </div>
          ) : (
            <div className="divide-y divide-slate-100" data-testid="list-admin-albums">
              {filtered.map((a) => (
                <AlbumRow key={a.id} album={a} />
              ))}
              <EmptyStateRow onClick={() => navigate("/admin")} />
            </div>
          )}
        </section>

        {/* FOOTER NOTE */}
        <p className="text-slate-400 text-[11px] leading-relaxed px-1 pt-2">
          <span className="font-semibold text-slate-500">Scope:</span> the
          admin only manages what the player needs — cover art, metadata,
          credits, lyrics, files. No distribution, no royalty collection, no
          DSP delivery.
        </p>
      </div>
    </main>
  );
}

function AlbumRow({ album }: { album: AlbumLite }) {
  return (
    <Link
      href={`/admin/albums/${album.id}`}
      className="w-full text-left flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-slate-50 active:bg-slate-100"
      data-testid={`row-album-${album.id}`}
    >
      <img
        src={album.artwork}
        alt=""
        className="w-14 h-14 rounded-lg object-cover bg-slate-100 flex-shrink-0 shadow-sm"
      />
      <div className="flex-1 min-w-0">
        <div
          className="text-slate-900 text-[14.5px] font-bold truncate"
          data-testid={`text-album-title-${album.id}`}
        >
          {album.title}
        </div>
        <div className="text-slate-500 text-[12px] mt-0.5 truncate">
          {album.artist}
        </div>
        {album.description && (
          <div className="text-slate-400 text-[11.5px] mt-1 line-clamp-1">
            {album.description}
          </div>
        )}
      </div>
      {/* Right-side meta — pills + hidden badge, replaces the void where
          the mockup had status / % credited (not faking those yet). */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {album.year && (
          <span className="px-1.5 py-px rounded bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wide">
            {album.year}
          </span>
        )}
        <span className="px-1.5 py-px rounded bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wide">
          {album.type}
        </span>
        {album.isHidden && (
          <span className="inline-flex items-center gap-1 px-1.5 py-px rounded bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wide">
            <EyeOff className="w-2.5 h-2.5" />
            Hidden
          </span>
        )}
      </div>
      <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
    </Link>
  );
}

function EmptyStateRow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-4 px-4 py-5 hover:bg-slate-50"
      data-testid="row-new-album"
    >
      <div className="w-14 h-14 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center flex-shrink-0 text-slate-300">
        <Plus className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-slate-700 text-[13.5px] font-semibold inline-flex items-center gap-2">
          New album
          <Sparkles className="w-3.5 h-3.5 text-[#319ED8]" />
        </div>
        <div className="text-slate-500 text-[11.5px] mt-0.5">
          Seed from an Apple Music URL or start blank
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
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
