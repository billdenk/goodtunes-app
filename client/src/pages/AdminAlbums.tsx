import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Filter,
  ChevronRight,
  Disc3,
  Music2,
  EyeOff,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Admin home · Albums list (Phase 1).
 *
 * Mirrors artifacts/mockup-sandbox/.../AlbumsHome.tsx — the canvas
 * storyboard's frame 1. Stats strip, search/filter toolbar, polished
 * album rows with cover + meta + status badge + chevron. Tapping a row
 * opens /admin/albums/:id (the per-album shell). "New album" still
 * deep-links to the classic /admin while creation hasn't been migrated.
 *
 * Data: piggy-backs on /api/albums (same query the classic admin uses),
 * so anything created or hidden over there shows up here without an
 * extra refetch. Per-album track count + credit-completion are TODOs
 * for Phase 2 — surfacing them requires either a heavier list endpoint
 * or a separate counts query; not faking them in the meantime.
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

  const hiddenCount = useMemo(
    () => releases.filter((a) => a.isHidden).length,
    [releases],
  );

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
    <main className="min-h-screen bg-slate-50 p-8 font-sans antialiased">
      <div className="max-w-[860px] mx-auto space-y-3">
        {/* HEADER */}
        <div className="flex items-center justify-between gap-3 pb-1">
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
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href="/admin"
              className="px-3 py-2 rounded-md border border-slate-200 bg-white text-slate-600 text-[12px] hover:bg-slate-50 inline-flex items-center gap-1.5"
              data-testid="link-classic-admin"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Classic admin
            </Link>
            <button
              onClick={() => navigate("/admin")}
              className="px-3 py-2 rounded-md bg-[#319ED8] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5"
              data-testid="button-new-album"
            >
              <Plus className="w-3.5 h-3.5" /> New album
            </button>
          </div>
        </div>

        {/* TOOLBAR */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-2.5 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-200">
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <input
              className="flex-1 bg-transparent text-[12.5px] text-slate-700 placeholder-slate-400 focus:outline-none"
              placeholder="Find an album, track or artist…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-albums"
            />
          </div>
          <button
            className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 text-[12px] hover:bg-slate-50 inline-flex items-center gap-1.5 flex-shrink-0"
            data-testid="button-filter-artists"
          >
            <Filter className="w-3.5 h-3.5" /> All artists
          </button>
        </section>

        {/* STATS */}
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Releases" value={String(releases.length)} testId="stat-releases" />
          <Stat label="Visible" value={String(releases.length - hiddenCount)} testId="stat-visible" />
          <Stat label="Hidden" value={String(hiddenCount)} tone={hiddenCount > 0 ? "warn" : undefined} testId="stat-hidden" />
          <Stat label="Filtered" value={String(filtered.length)} testId="stat-filtered" />
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
                : "No releases match that filter."}
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
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-slate-900 text-[14.5px] font-bold truncate"
            data-testid={`text-album-title-${album.id}`}
          >
            {album.title}
          </span>
          {album.year && (
            <span className="px-1.5 py-px rounded bg-slate-100 text-slate-500 text-[9.5px] font-bold uppercase tracking-wide flex-shrink-0">
              {album.year}
            </span>
          )}
          <span className="px-1.5 py-px rounded bg-slate-100 text-slate-500 text-[9.5px] font-bold uppercase tracking-wide flex-shrink-0">
            {album.type}
          </span>
          {album.isHidden && (
            <span className="inline-flex items-center gap-1 px-1.5 py-px rounded bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wide flex-shrink-0">
              <EyeOff className="w-2.5 h-2.5" />
              Hidden
            </span>
          )}
        </div>
        <div className="text-slate-500 text-[12px] mt-0.5 truncate inline-flex items-center gap-1.5">
          <Music2 className="w-3 h-3 text-slate-400" />
          {album.artist}
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
          {/* TODO Phase 2 — real tracks count + credit-completion from a
              counts query. Holding the slot so the row height stays
              consistent once it's wired. */}
          <span className="inline-flex items-center gap-1 text-slate-300">
            <Disc3 className="w-3 h-3" />
            tracks · pending
          </span>
        </div>
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

function Stat({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
  testId?: string;
}) {
  return (
    <div
      className="rounded-xl bg-white border border-slate-200 shadow-sm px-3 py-2.5"
      data-testid={testId}
    >
      <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </div>
      <div
        className={[
          "text-[20px] font-bold tabular-nums mt-0.5",
          tone === "ok"
            ? "text-emerald-700"
            : tone === "warn"
              ? "text-amber-700"
              : "text-slate-900",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}
