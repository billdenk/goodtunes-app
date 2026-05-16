import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  EyeOff,
  ArrowLeftRight,
  Music,
  Calendar,
  Tag as TagIcon,
  Disc,
  AlertCircle,
  Upload,
  Loader2,
  ImageIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin · Single album. Wrapped in AdminFrame so it shares the top bar +
 * left entity sidebar with /admin/albums.
 *
 * Tabs:
 *   Overview · Tracks  — real data (Phase 2)
 *   Artwork · Masters · Bonus — Phase 3-5 placeholders that deep-link to
 *   the classic admin for now.
 *
 * Editing is still done in the classic admin — this surface is a clean
 * read view + jump-off. Each tab has a contextual "Edit in classic" button.
 */
interface AlbumFull {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  year: number | null;
  type: "Single" | "EP" | "LP";
  description: string | null;
  isHidden: boolean;
  isGoodTunesRelease: boolean;
  genre?: string | null;
  label?: string | null;
  goodTunesReleaseDate?: string | null;
  streamingReleaseDate?: string | null;
  appleMusicUrl?: string | null;
  spotifyUrl?: string | null;
  songs: SongLite[];
}

interface SongLite {
  id: string;
  title: string;
  trackNumber: number;
  duration: number;
  lyrics: string | null;
  audioUrl: string | null;
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

  const { data: album, isLoading, error } = useQuery<AlbumFull>({
    queryKey: ["/api/albums", albumId],
    enabled: !!user?.isAdmin && !!albumId,
  });

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
      <AdminFrame active="albums">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
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
      <AdminFrame active="albums">
        <div className="py-20 text-center space-y-3">
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
      </AdminFrame>
    );
  }

  // Lifecycle pill — derived from the same logic the Albums grid uses.
  const lifecycle = !album.isGoodTunesRelease
    ? { label: "Prepping", tone: "slate" as const }
    : album.isHidden
      ? { label: "Sunset", tone: "amber" as const }
      : { label: "Live", tone: "mint" as const };

  return (
    <AdminFrame active="albums">
      <div className="space-y-6">
        {/* BREADCRUMB */}
        <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 font-medium">
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

        {/* HEADER */}
        <div className="flex items-start gap-5">
          <img
            src={album.artwork}
            alt=""
            className="w-24 h-24 rounded-xl object-cover bg-slate-100 flex-shrink-0 border border-slate-200 shadow-sm"
            data-testid="img-album-cover"
          />
          <div className="flex-1 min-w-0">
            <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-2 flex-wrap">
              <span>
                {album.type} · {album.artist}
              </span>
              <LifecyclePill {...lifecycle} />
              {album.isHidden && (
                <span
                  className="inline-flex items-center gap-1 text-amber-700 text-[10.5px] font-medium normal-case tracking-normal"
                  title="Pulled from sale — owners keep access"
                >
                  <EyeOff className="w-3 h-3" />
                  Hidden from store
                </span>
              )}
            </div>
            <h1
              className="text-slate-900 text-[26px] font-bold tracking-tight mt-0.5 truncate"
              data-testid="heading-album-title"
            >
              {album.title}
            </h1>
            <div className="text-slate-500 text-[13px] mt-0.5 flex items-center gap-3 flex-wrap">
              {album.year && <span>{album.year}</span>}
              <span className="inline-flex items-center gap-1">
                <Music className="w-3 h-3" />
                {album.songs.length}{" "}
                {album.songs.length === 1 ? "track" : "tracks"}
              </span>
              {album.label && <span>· {album.label}</span>}
            </div>
          </div>
          <button
            onClick={openInClassicAdmin}
            className="px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-700 text-[12px] font-semibold hover:bg-slate-50 inline-flex items-center gap-1.5 flex-shrink-0"
            data-testid="button-open-classic-admin"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Open in classic admin
          </button>
        </div>

        {/* TABS */}
        <div
          className="flex items-center gap-5 border-b border-slate-200 overflow-x-auto"
          data-testid="tabs-admin-album"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                "relative pb-2.5 text-[13.5px] font-semibold whitespace-nowrap transition-colors",
                tab === t.key
                  ? "text-slate-900"
                  : "text-slate-400 hover:text-slate-700",
              ].join(" ")}
              data-testid={`tab-${t.key}`}
            >
              {t.label}
              {tab === t.key && (
                <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-[#319ED8] rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* TAB CONTENT */}
        {tab === "overview" && (
          <OverviewPanel album={album} onEdit={openInClassicAdmin} />
        )}
        {tab === "tracks" && (
          <TracksPanel album={album} onEdit={openInClassicAdmin} />
        )}
        {tab === "artwork" && <ArtworkPanel album={album} />}
        {(tab === "masters" || tab === "bonus") && (
          <PhasePlaceholder tab={tab} onEdit={openInClassicAdmin} />
        )}
      </div>
    </AdminFrame>
  );
}

/* ─── Overview tab ─────────────────────────────────────────────────── */

function OverviewPanel({
  album,
  onEdit,
}: {
  album: AlbumFull;
  onEdit: () => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {/* Metadata card */}
      <section
        className="md:col-span-2 rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-5"
        data-testid="panel-overview-metadata"
      >
        <PanelHeader title="Metadata" onEdit={onEdit} />
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <Field label="Title" value={album.title} testId="field-title" />
          <Field label="Artist" value={album.artist} testId="field-artist" />
          <Field label="Type" value={album.type} testId="field-type" />
          <Field
            label="Year"
            value={album.year ? String(album.year) : null}
            testId="field-year"
          />
          <Field
            label="Label"
            value={album.label || null}
            testId="field-label"
            icon={TagIcon}
          />
          <Field
            label="Genre"
            value={album.genre || null}
            testId="field-genre"
            icon={Disc}
          />
        </dl>
        {album.description && (
          <div>
            <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-1">
              Description
            </div>
            <p
              className="text-slate-700 text-[13.5px] leading-relaxed whitespace-pre-wrap"
              data-testid="text-description"
            >
              {album.description}
            </p>
          </div>
        )}
      </section>

      {/* Release & links card */}
      <section
        className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-5"
        data-testid="panel-overview-release"
      >
        <PanelHeader title="Release" onEdit={onEdit} />
        <dl className="space-y-4">
          <Field
            label="GoodTunes release date"
            value={formatDate(album.goodTunesReleaseDate)}
            testId="field-gt-release"
            icon={Calendar}
          />
          <Field
            label="Streaming release date"
            value={formatDate(album.streamingReleaseDate)}
            testId="field-streaming-release"
            icon={Calendar}
          />
        </dl>
        <div className="pt-3 border-t border-slate-100 space-y-2">
          <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider">
            Streaming handoff
          </div>
          <ExternalRow
            label="Apple Music"
            url={album.appleMusicUrl}
            testId="link-apple-music"
          />
          <ExternalRow
            label="Spotify"
            url={album.spotifyUrl}
            testId="link-spotify"
          />
        </div>
      </section>
    </div>
  );
}

/* ─── Tracks tab ───────────────────────────────────────────────────── */

function TracksPanel({
  album,
  onEdit,
}: {
  album: AlbumFull;
  onEdit: () => void;
}) {
  const sorted = [...album.songs].sort(
    (a, b) => a.trackNumber - b.trackNumber,
  );

  if (sorted.length === 0) {
    return (
      <section
        className="rounded-2xl bg-white border border-slate-200 shadow-sm p-10 text-center"
        data-testid="panel-tracks-empty"
      >
        <div className="inline-flex items-center gap-2 text-slate-500 text-sm">
          <AlertCircle className="w-4 h-4" />
          This album has no tracks yet.
        </div>
        <button
          onClick={onEdit}
          className="mt-4 px-3 py-1.5 rounded-md bg-[#319ED8] text-white text-[12px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5"
          data-testid="button-add-tracks"
        >
          Add tracks in classic admin
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden"
      data-testid="panel-tracks"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <div>
          <h2 className="text-slate-900 text-[14px] font-bold">Tracklist</h2>
          <p className="text-slate-400 text-[11.5px]">
            {sorted.length} {sorted.length === 1 ? "track" : "tracks"} · Tap a
            row to edit credits, lyrics, and master in classic admin.
          </p>
        </div>
        <button
          onClick={onEdit}
          className="px-2.5 py-1.5 rounded-md bg-white border border-slate-200 text-slate-700 text-[11.5px] font-semibold hover:bg-slate-50 inline-flex items-center gap-1.5"
          data-testid="button-reorder-tracks"
        >
          <ArrowLeftRight className="w-3 h-3" />
          Reorder
        </button>
      </div>
      <ol>
        {sorted.map((song, i) => (
          <li
            key={song.id}
            className={[
              "flex items-center gap-4 px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors",
              i !== sorted.length - 1 && "border-b border-slate-100",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={onEdit}
            data-testid={`row-track-${song.id}`}
          >
            <span className="w-7 text-right text-slate-400 text-[12px] tabular-nums font-medium flex-shrink-0">
              {song.trackNumber}
            </span>
            <div className="flex-1 min-w-0">
              <div
                className="text-slate-900 text-[13.5px] font-medium truncate"
                data-testid={`text-track-title-${song.id}`}
              >
                {song.title}
              </div>
              <div className="flex items-center gap-2.5 mt-0.5">
                <TrackChip
                  ok={!!song.audioUrl}
                  label={song.audioUrl ? "Master" : "No master"}
                  testId={`chip-master-${song.id}`}
                />
                <TrackChip
                  ok={!!song.lyrics}
                  label={song.lyrics ? "Lyrics" : "No lyrics"}
                  testId={`chip-lyrics-${song.id}`}
                />
              </div>
            </div>
            <span
              className="text-slate-400 text-[12px] tabular-nums flex-shrink-0"
              data-testid={`text-track-duration-${song.id}`}
            >
              {formatDuration(song.duration)}
            </span>
            <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
          </li>
        ))}
      </ol>
    </section>
  );
}

function TrackChip({
  ok,
  label,
  testId,
}: {
  ok: boolean;
  label: string;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={[
        "inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-semibold uppercase tracking-wide",
        ok
          ? "bg-[#4AFFCA]/15 text-emerald-700"
          : "bg-slate-100 text-slate-400",
      ].join(" ")}
    >
      <span
        className={[
          "w-1 h-1 rounded-full",
          ok ? "bg-emerald-500" : "bg-slate-300",
        ].join(" ")}
      />
      {label}
    </span>
  );
}

/* ─── Artwork tab ──────────────────────────────────────────────────── */

async function uploadImageFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const token = getAuthToken();
  if (!token) {
    throw new Error("Sign out and back in — your session token is missing.");
  }
  const res = await fetch("/api/admin/upload", {
    method: "POST",
    body: fd,
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Upload failed (${res.status})`);
  }
  const { url } = await res.json();
  return url as string;
}

function ArtworkPanel({ album }: { album: AlbumFull }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async (file: File) => {
      // Show an instant local preview so the swap feels immediate.
      setPreviewUrl(URL.createObjectURL(file));
      const url = await uploadImageFile(file);
      await apiRequest("PUT", `/api/admin/albums/${album.id}`, {
        artwork: url,
      });
      return url;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/albums", album.id] });
      await qc.invalidateQueries({ queryKey: ["/api/albums"] });
      setPreviewUrl(null);
      toast({ title: "Cover updated" });
    },
    onError: (e: any) => {
      setPreviewUrl(null);
      toast({
        title: "Couldn't update the cover",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const acceptFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast({
        title: "That's not an image",
        description: "Cover art needs to be a JPG, PNG, or WebP file.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Keep covers under 15 MB.",
        variant: "destructive",
      });
      return;
    }
    mut.mutate(file);
  };

  const busy = mut.isPending;
  const shownUrl = previewUrl || album.artwork;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* Current cover (big preview) */}
      <section
        className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6"
        data-testid="panel-artwork-current"
      >
        <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-3">
          Current cover
        </div>
        <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 ring-1 ring-slate-200">
          {shownUrl ? (
            <img
              src={shownUrl}
              alt={album.title}
              className="w-full h-full object-cover"
              data-testid="img-artwork-current"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
              <ImageIcon className="w-10 h-10" />
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 text-[#319ED8] animate-spin" />
              <span className="text-[12px] text-slate-700 font-semibold">
                Uploading…
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Replace */}
      <section
        className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 flex flex-col"
        data-testid="panel-artwork-upload"
      >
        <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-3">
          Replace cover
        </div>
        <button
          type="button"
          onClick={() => !busy && fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (busy) return;
            acceptFile(e.dataTransfer.files?.[0]);
          }}
          disabled={busy}
          data-testid="dropzone-artwork"
          className={[
            "flex-1 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors px-6 py-10 text-center",
            dragging
              ? "border-[#319ED8] bg-[#319ED8]/5"
              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
            busy && "opacity-60 cursor-not-allowed",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Upload
            className={[
              "w-7 h-7",
              dragging ? "text-[#319ED8]" : "text-slate-400",
            ].join(" ")}
          />
          <div className="text-slate-700 text-[13px] font-semibold">
            {dragging
              ? "Drop to upload"
              : "Drag an image here, or click to pick"}
          </div>
          <div className="text-slate-400 text-[11.5px]">
            JPG, PNG, or WebP · up to 15 MB
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            acceptFile(e.target.files?.[0]);
            // Reset so re-uploading the same file re-triggers onChange.
            e.target.value = "";
          }}
          data-testid="input-artwork-file"
        />
        <div className="mt-4 space-y-2 text-[11.5px] text-slate-500 leading-relaxed">
          <p>
            <span className="font-semibold text-slate-700">Recommended:</span>{" "}
            square, at least 3000×3000 px. Anything smaller will still work
            but may look soft on big screens.
          </p>
          <p>
            New cover goes live everywhere — store grid, player Now Playing,
            playlist mosaics — as soon as the upload finishes.
          </p>
        </div>
      </section>
    </div>
  );
}

/* ─── Phase placeholder (Masters / Bonus) ──────────────────────────── */

function PhasePlaceholder({
  tab,
  onEdit,
}: {
  tab: Exclude<Tab, "overview" | "tracks" | "artwork">;
  onEdit: () => void;
}) {
  const meta = TABS.find((t) => t.key === tab)!;
  const blurb: Record<typeof tab, string> = {
    masters:
      "Streaming master (required), optional hi-res downloadable. Stems and per-track cover overrides are deferred.",
    bonus:
      "Bonus videos + photos. Lock-by-default with hover-reveal Edit/Trash. Future buckets: liner notes, lyric sheets, commentary, press kit.",
  };

  return (
    <section
      className="rounded-2xl bg-white border border-slate-200 shadow-sm px-6 py-12"
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
        <button
          onClick={onEdit}
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

/* ─── Bits ─────────────────────────────────────────────────────────── */

function PanelHeader({
  title,
  onEdit,
}: {
  title: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-slate-900 text-[14px] font-bold">{title}</h2>
      <button
        onClick={onEdit}
        className="text-[#319ED8] text-[11.5px] font-semibold hover:underline inline-flex items-center gap-1"
        data-testid={`button-edit-${title.toLowerCase()}`}
      >
        Edit
        <ExternalLink className="w-3 h-3" />
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  testId,
  icon: Icon,
}: {
  label: string;
  value: string | null;
  testId?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div data-testid={testId}>
      <dt className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-0.5 flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </dt>
      <dd
        className={[
          "text-[13.5px]",
          value ? "text-slate-900 font-medium" : "text-slate-300 italic",
        ].join(" ")}
      >
        {value || "Not set"}
      </dd>
    </div>
  );
}

function ExternalRow({
  label,
  url,
  testId,
}: {
  label: string;
  url: string | null | undefined;
  testId?: string;
}) {
  if (!url) {
    return (
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="text-slate-500">{label}</span>
        <span className="text-slate-300 italic text-[11.5px]">Not linked</span>
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between text-[12.5px] group"
      data-testid={testId}
    >
      <span className="text-slate-700 group-hover:text-[#319ED8]">{label}</span>
      <span className="text-slate-400 group-hover:text-[#319ED8] inline-flex items-center gap-1">
        Open
        <ExternalLink className="w-3 h-3" />
      </span>
    </a>
  );
}

function LifecyclePill({
  label,
  tone,
}: {
  label: string;
  tone: "slate" | "amber" | "mint";
}) {
  const cls =
    tone === "mint"
      ? "bg-[#4AFFCA]/15 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";
  return (
    <span
      className={[
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider normal-case",
        cls,
      ].join(" ")}
      data-testid="badge-lifecycle"
    >
      {label}
    </span>
  );
}

function formatDate(d: string | null | undefined): string | null {
  if (!d) return null;
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return null;
    return dt.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
