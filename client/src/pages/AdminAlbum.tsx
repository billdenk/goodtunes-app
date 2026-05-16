import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  EyeOff,
  ArrowLeftRight,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Admin · Single album (Phase 1 of admin restructure).
 *
 * Per-album storyboard shell. The five tabs (Overview / Tracks / Artwork /
 * Masters / Bonus) match the storyboard frames on the canvas. In Phase 1
 * each tab renders a placeholder + an "Open in classic admin →" deep-link
 * that selects this album in the existing single-page editor (via the
 * `gt:admin:*` localStorage keys it already reads). That keeps the new
 * surface navigable + demoable while the real tab content gets migrated
 * tab-by-tab in subsequent phases.
 */
interface AlbumLite {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  year: number | null;
  type: "Single" | "EP" | "LP";
  isHidden: boolean;
}

type Tab = "overview" | "tracks" | "artwork" | "masters" | "bonus";
const TABS: { key: Tab; label: string; phase: number }[] = [
  { key: "overview", label: "Overview", phase: 2 },
  { key: "tracks", label: "Tracks", phase: 2 },
  { key: "artwork", label: "Artwork", phase: 3 },
  { key: "masters", label: "Masters", phase: 4 },
  { key: "bonus", label: "Bonus", phase: 5 },
];

export function AdminAlbum() {
  const { user, isLoading: authLoading } = useAuth();
  const [, params] = useRoute<{ id: string }>("/admin/albums/:id");
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("overview");
  const albumId = params?.id ?? "";

  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

  const { data: album, isLoading, error } = useQuery<AlbumLite>({
    queryKey: ["/api/albums", albumId],
    enabled: !!user?.isAdmin && !!albumId,
  });

  /**
   * Deep-link into the classic /admin editor with this album pre-selected.
   * The existing Admin component reads `gt:admin:entity` and
   * `gt:admin:selectedByEntity` from localStorage on mount, so writing
   * them here before navigating is enough to land in the album-edit view.
   */
  const openInClassicAdmin = () => {
    try {
      localStorage.setItem("gt:admin:entity", "albums");
      const raw = localStorage.getItem("gt:admin:selectedByEntity");
      const prev = raw ? JSON.parse(raw) : {};
      localStorage.setItem(
        "gt:admin:selectedByEntity",
        JSON.stringify({ ...prev, albums: albumId }),
      );
    } catch {
      /* localStorage unavailable — classic admin will fall back to default */
    }
    navigate("/admin");
  };

  if (authLoading || isLoading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (!user?.isAdmin) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <p className="text-slate-500 text-sm">Admin only.</p>
      </main>
    );
  }

  if (error || !album) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <h1 className="text-slate-900 text-lg font-semibold">
            Album not found
          </h1>
          <Link
            href="/admin/albums"
            className="text-[#319ED8] text-sm hover:underline inline-flex items-center gap-1"
            data-testid="link-back-to-albums"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to albums
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-[1080px] mx-auto px-6 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 font-medium mb-4">
          <Link
            href="/admin/albums"
            className="hover:text-slate-700"
            data-testid="link-breadcrumb-albums"
          >
            Albums
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700 font-semibold truncate max-w-[420px]">
            {album.title}
          </span>
        </div>

        {/* Header */}
        <div className="flex items-start gap-5 mb-6">
          <img
            src={album.artwork}
            alt=""
            className="w-20 h-20 rounded-lg object-cover bg-slate-100 flex-shrink-0 border border-slate-200"
            data-testid="img-album-cover"
          />
          <div className="flex-1 min-w-0">
            <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-2 flex-wrap">
              <span>
                {album.type} · {album.artist}
              </span>
              {album.isHidden && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-bold uppercase">
                  <EyeOff className="w-2.5 h-2.5" />
                  Hidden
                </span>
              )}
            </div>
            <h1
              className="text-slate-900 text-2xl font-bold mt-0.5 truncate"
              data-testid="heading-album-title"
            >
              {album.title}
            </h1>
            {album.year && (
              <div className="text-slate-500 text-sm mt-0.5">
                {album.year}
              </div>
            )}
          </div>
          <button
            onClick={openInClassicAdmin}
            className="px-3 py-1.5 rounded-md bg-[#319ED8] text-white text-[12px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5 flex-shrink-0"
            data-testid="button-open-classic-admin"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Open in classic admin
          </button>
        </div>

        {/* Tab strip */}
        <div
          className="flex items-center gap-5 border-b border-slate-200 mb-6 overflow-x-auto"
          data-testid="tabs-admin-album"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                "px-1 pb-2.5 text-[13px] font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors",
                tab === t.key
                  ? "text-slate-900 border-[#319ED8]"
                  : "text-slate-400 border-transparent hover:text-slate-600",
              ].join(" ")}
              data-testid={`tab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content — Phase 1 stubs */}
        <TabPlaceholder
          tab={tab}
          onOpenClassic={openInClassicAdmin}
        />
      </div>
    </main>
  );
}

function TabPlaceholder({
  tab,
  onOpenClassic,
}: {
  tab: Tab;
  onOpenClassic: () => void;
}) {
  const meta = TABS.find((t) => t.key === tab)!;
  const blurb: Record<Tab, string> = {
    overview:
      "Title, artist, year, type, label, genre, GoodTunes release date, streaming handoff URLs, hidden toggle.",
    tracks:
      "Tracklist with drag-to-reorder. Click a track to open its per-track editor (Details · Credits · Lyrics).",
    artwork:
      "Album cover + alternate artwork. Per-track cover overrides are intentionally not here — most tracks reuse the album cover.",
    masters:
      "Streaming master (required), optional hi-res downloadable. Stems and track-cover-overrides are deferred.",
    bonus:
      "Bonus videos + photos. Lock-by-default with hover-reveal Edit/Trash. Future buckets: liner notes, lyric sheets, commentary, press kit.",
  };

  return (
    <section
      className="rounded-2xl bg-white border border-slate-200 shadow-sm px-6 py-10"
      data-testid={`panel-${tab}`}
    >
      <div className="max-w-[560px] mx-auto text-center space-y-4">
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10.5px] font-bold uppercase tracking-wider">
          Phase {meta.phase} · coming soon
        </div>
        <h2 className="text-slate-900 text-lg font-bold">{meta.label}</h2>
        <p className="text-slate-500 text-[13.5px] leading-relaxed">
          {blurb[tab]}
        </p>
        <p className="text-slate-400 text-[12px] italic">
          The full editor lives in the classic admin while this surface gets
          built out tab-by-tab.
        </p>
        <button
          onClick={onOpenClassic}
          className="px-3 py-1.5 rounded-md bg-[#319ED8] text-white text-[12px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5"
          data-testid={`button-open-classic-${tab}`}
        >
          Edit in classic admin
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </section>
  );
}
