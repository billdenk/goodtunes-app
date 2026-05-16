import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface LabelLite {
  id: string;
  name: string;
}
import {
  ChevronLeft,
  ChevronRight,
  EyeOff,
  ArrowLeftRight,
  GripVertical,
  Pencil,
  Trash2,
  Plus,
  Play,
  Film,
  Music,
  Tag as TagIcon,
  AlertCircle,
  Upload,
  Loader2,
  ImageIcon,
  ImagePlus,
  Link2,
  X as XIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { EditablePanel } from "@/components/admin/EditablePanel";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  labelId?: string | null;
  // Server-joined label row from AlbumWithLabel (storage.getAlbumById).
  label?: { id: string; name: string } | null;
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
  syncedLyrics?: { timeMs: number; text: string }[] | null;
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
              {album.label && <span>· {album.label.name}</span>}
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
          <OverviewPanel album={album} />
        )}
        {tab === "tracks" && (
          <TracksPanel album={album} onEdit={openInClassicAdmin} />
        )}
        {tab === "artwork" && <ArtworkPanel album={album} />}
        {tab === "masters" && <MastersPanel album={album} />}
        {tab === "bonus" && (
          <BonusPanel album={album} onEdit={openInClassicAdmin} />
        )}
      </div>
    </AdminFrame>
  );
}

/* ─── Overview tab ─────────────────────────────────────────────────── */

function OverviewPanel({ album }: { album: AlbumFull }) {
  const invalidate: (readonly unknown[])[] = [
    ["/api/albums", album.id],
    ["/api/albums"],
  ];
  const endpoint = `/api/admin/albums/${album.id}`;
  const { data: labels = [] } = useQuery<LabelLite[]>({
    queryKey: ["/api/labels"],
  });
  // Build the dropdown options. Most-used label names first would be
  // nicer but the list is short — alphabetical is fine.
  const labelOptions = [
    { value: "", label: "Independent" },
    ...[...labels]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((l) => ({ value: l.id, label: l.name })),
  ];
  return (
    <div className="space-y-5">
      <EditablePanel
        title="Release"
        testId="panel-overview-release"
        endpoint={endpoint}
        columns={4}
        values={{
          goodTunesReleaseDate: album.goodTunesReleaseDate,
          streamingReleaseDate: album.streamingReleaseDate,
          appleMusicUrl: album.appleMusicUrl,
          spotifyUrl: album.spotifyUrl,
        }}
        invalidate={invalidate}
        fields={[
          {
            key: "goodTunesReleaseDate",
            label: "GoodTunes release date",
            type: "date",
          },
          {
            key: "streamingReleaseDate",
            label: "Streaming release date",
            type: "date",
          },
          {
            key: "appleMusicUrl",
            label: "Apple Music",
            type: "url",
            placeholder: "https://music.apple.com/…",
          },
          {
            key: "spotifyUrl",
            label: "Spotify",
            type: "url",
            placeholder: "https://open.spotify.com/album/…",
          },
        ]}
      />
      <EditablePanel
        title="Metadata"
        testId="panel-overview-metadata"
        endpoint={endpoint}
        columns={4}
        values={{
          title: album.title,
          artist: album.artist,
          type: album.type,
          year: album.year ? String(album.year) : "",
          genre: album.genre,
          labelId: album.labelId ?? "",
          description: album.description,
        }}
        invalidate={invalidate}
        fields={[
          { key: "title", label: "Title", type: "text", required: true },
          { key: "artist", label: "Artist", type: "text", required: true },
          {
            key: "type",
            label: "Type",
            type: "select",
            required: true,
            options: [
              { value: "LP", label: "LP (8+ tracks)" },
              { value: "EP", label: "EP (3–7 tracks)" },
              { value: "Single", label: "Single (1–2 tracks)" },
            ],
          },
          {
            key: "year",
            label: "Year",
            type: "number",
            placeholder: "2025",
          },
          { key: "genre", label: "Genre", type: "text" },
          {
            key: "labelId",
            label: "Label",
            type: "select",
            options: labelOptions,
          },
          {
            key: "description",
            label: "Description",
            type: "textarea",
            placeholder: "Liner-notes-style blurb shown on the album page.",
          },
        ]}
      />
    </div>
  );
}

/* ─── Tracks tab ───────────────────────────────────────────────────── */

type AlbumCreditsMap = {
  bySongId: Record<
    string,
    {
      writers: {
        id: string;
        songId: string;
        personId: string | null;
        name: string;
        role: string;
        position: number;
        person: { id: string; name: string; photoUrl?: string | null } | null;
      }[];
      performers: {
        id: string;
        songId: string;
        personId: string | null;
        instrumentId: string | null;
        name: string;
        role: string;
        tuningNotes: string | null;
        position: number;
        person: { id: string; name: string; photoUrl?: string | null } | null;
        instrument: { id: string; name: string; category?: string | null } | null;
      }[];
    }
  >;
};

type AdminPersonLite = {
  id: string;
  name: string;
  photoUrl?: string | null;
};
type AdminInstrumentLite = {
  id: string;
  name: string;
  category?: string | null;
};
type AdminCreditRole = {
  id: string;
  kind: "writer" | "performer";
  name: string;
};

function TracksPanel({
  album,
  onEdit,
}: {
  album: AlbumFull;
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const sorted = [...album.songs].sort(
    (a, b) => a.trackNumber - b.trackNumber,
  );
  const { data: albumCredits } = useQuery<AlbumCreditsMap>({
    queryKey: ["/api/albums", album.id, "credits"],
  });

  // Drag-to-reorder state lives at the panel level so a row knows when
  // another row is being dragged over it. We pair an optimistic cache
  // rewrite with a server POST; on error we roll the cache back to the
  // snapshot taken before the mutation started.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropOnId, setDropOnId] = useState<string | null>(null);
  // Inline composer for new tracks. Stays open across saves so the user
  // can hammer through a tracklist without clicking "Add track" each time.
  const [adding, setAdding] = useState(false);

  const invalidateAlbum = async () => {
    await qc.invalidateQueries({ queryKey: ["/api/albums", album.id] });
    await qc.invalidateQueries({ queryKey: ["/api/albums"] });
  };

  const reorderMut = useMutation({
    mutationFn: async (songIds: string[]) => {
      await apiRequest(
        "POST",
        `/api/admin/albums/${album.id}/tracks/reorder`,
        { songIds },
      );
    },
    onMutate: async (songIds: string[]) => {
      await qc.cancelQueries({ queryKey: ["/api/albums", album.id] });
      const prev = qc.getQueryData<AlbumFull>(["/api/albums", album.id]);
      if (prev) {
        const byId = new Map(prev.songs.map((s) => [s.id, s]));
        const nextSongs = songIds
          .map((id, i) => {
            const s = byId.get(id);
            return s ? { ...s, trackNumber: i + 1 } : null;
          })
          .filter((s): s is (typeof prev.songs)[number] => s !== null);
        qc.setQueryData<AlbumFull>(["/api/albums", album.id], {
          ...prev,
          songs: nextSongs,
        });
      }
      return { prev };
    },
    onError: (e: any, _songIds, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(["/api/albums", album.id], ctx.prev);
      }
      toast({
        title: "Couldn't reorder tracks",
        description: e?.message || "Order has been reverted.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["/api/albums", album.id] });
      qc.invalidateQueries({ queryKey: ["/api/albums"] });
    },
  });

  const handleDragStart = (id: string) => (e: React.DragEvent) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", id);
    } catch {
      // Some browsers throw if setData is called too late; ignore.
    }
  };
  const handleDragOver = (id: string) => (e: React.DragEvent) => {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropOnId !== id) setDropOnId(id);
  };
  const handleDragEnd = () => {
    setDragId(null);
    setDropOnId(null);
  };
  const handleDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const src = dragId;
    setDragId(null);
    setDropOnId(null);
    if (!src || src === targetId) return;
    const ids = sorted.map((s) => s.id);
    const from = ids.indexOf(src);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = ids.slice();
    next.splice(from, 1);
    next.splice(from < to ? to - 1 : to, 0, src);
    if (next.every((id, i) => id === ids[i])) return;
    reorderMut.mutate(next);
  };

  if (sorted.length === 0 && !adding) {
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
          onClick={() => setAdding(true)}
          className="mt-4 px-3 py-1.5 rounded-md bg-[#319ED8] text-white text-[12px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5"
          data-testid="button-add-first-track"
        >
          <Plus className="w-3.5 h-3.5" />
          Add the first track
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
            {sorted.length === 0 ? (
              <>Add your first track below. Press Enter to add and keep going.</>
            ) : (
              <>
                {sorted.length} {sorted.length === 1 ? "track" : "tracks"} ·
                Hover a row to rename, delete, or drag the grip on the left to
                reorder.
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className={
            "px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold inline-flex items-center gap-1.5 " +
            (adding
              ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
              : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50")
          }
          data-testid="button-toggle-add-track"
          aria-expanded={adding}
        >
          <Plus className={"w-3 h-3 " + (adding ? "rotate-45" : "")} />
          {adding ? "Done" : "Add track"}
        </button>
      </div>
      <ol>
        {sorted.map((song, i) => {
          const songCredits = albumCredits?.bySongId[song.id];
          const creditCount =
            (songCredits?.writers.length ?? 0) +
            (songCredits?.performers.length ?? 0);
          return (
            <TrackRow
              key={song.id}
              song={song}
              albumId={album.id}
              onOpen={onEdit}
              withBorder={i !== sorted.length - 1}
              creditCount={creditCount}
              credits={songCredits ?? null}
              isDragging={dragId === song.id}
              isDropTarget={dropOnId === song.id && dragId !== song.id}
              onDragStart={handleDragStart(song.id)}
              onDragOver={handleDragOver(song.id)}
              onDrop={handleDrop(song.id)}
              onDragEnd={handleDragEnd}
            />
          );
        })}
      </ol>
      {adding && (
        <AddTrackForm
          albumId={album.id}
          nextTrackNumber={sorted.length + 1}
          onSaved={invalidateAlbum}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}

/* ─── Inline composer for adding new tracks ──────────────────────────── */

// Parses a duration string the way an admin would type it: "3:30", "0:42",
// "210" (raw seconds), or "" (empty → fall back to the default). Returns
// the seconds value plus an error flag so the form can surface bad input
// inline without throwing.
function parseDurationInput(raw: string): { seconds: number; error: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { seconds: 180, error: null };
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (n > 0 && n < 36000) return { seconds: n, error: null };
    return { seconds: 180, error: "Pick a duration under 10 hours." };
  }
  const m = trimmed.match(/^(\d{1,2}):([0-5]?\d)$/);
  if (m) {
    const mins = Number(m[1]);
    const secs = Number(m[2]);
    const total = mins * 60 + secs;
    if (total > 0 && total < 36000) return { seconds: total, error: null };
    return { seconds: 180, error: "Pick a duration under 10 hours." };
  }
  return { seconds: 180, error: "Use mm:ss (e.g. 3:30) or whole seconds." };
}

function AddTrackForm({
  albumId,
  nextTrackNumber,
  onSaved,
  onClose,
}: {
  albumId: string;
  nextTrackNumber: number;
  onSaved: () => Promise<void> | void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [durationText, setDurationText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Focus the title field on first mount + after each successful save so
  // the admin can stay on the keyboard and rip through a tracklist.
  useEffect(() => {
    queueMicrotask(() => titleRef.current?.focus());
  }, []);

  const createMut = useMutation({
    mutationFn: async (input: { title: string; duration: number }) => {
      const res = await apiRequest("POST", "/api/admin/songs", {
        albumId,
        title: input.title,
        trackNumber: nextTrackNumber,
        duration: input.duration,
      });
      return res.json();
    },
    onSuccess: async () => {
      await onSaved();
      toast({ title: `Track ${nextTrackNumber} added` });
      // Clear and refocus so the user can keep adding without re-clicking.
      setTitle("");
      setDurationText("");
      setError(null);
      queueMicrotask(() => titleRef.current?.focus());
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't add the track",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required.");
      titleRef.current?.focus();
      return;
    }
    const parsed = parseDurationInput(durationText);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    setError(null);
    createMut.mutate({ title: trimmed, duration: parsed.seconds });
  };

  return (
    <div
      className="border-t border-slate-200 bg-[#319ED8]/5 px-5 py-3.5"
      data-testid="form-add-track"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (!createMut.isPending) submit();
        } else if (e.key === "Escape" && !createMut.isPending) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex items-center gap-2">
        <span className="w-7 text-right text-slate-400 text-[12px] tabular-nums font-medium flex-shrink-0">
          {nextTrackNumber}
        </span>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Track title"
          disabled={createMut.isPending}
          className="flex-1 h-8 rounded-md border border-slate-300 bg-white px-2.5 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent disabled:opacity-50"
          data-testid="input-new-track-title"
        />
        <input
          type="text"
          value={durationText}
          onChange={(e) => {
            setDurationText(e.target.value);
            if (error) setError(null);
          }}
          placeholder="3:00"
          disabled={createMut.isPending}
          aria-label="Track duration in mm:ss"
          className="w-20 h-8 rounded-md border border-slate-300 bg-white px-2.5 text-[13.5px] text-slate-900 placeholder:text-slate-400 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent disabled:opacity-50"
          data-testid="input-new-track-duration"
        />
        <button
          type="button"
          onClick={submit}
          disabled={createMut.isPending}
          className="px-3 h-8 rounded-md bg-[#319ED8] text-white text-[11.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-1"
          data-testid="button-save-new-track"
        >
          {createMut.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            "Add"
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={createMut.isPending}
          className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-600 text-[11.5px] font-semibold hover:bg-slate-50"
          data-testid="button-close-add-track"
        >
          Done
        </button>
      </div>
      <p className="text-[11px] text-slate-500 mt-1.5 pl-9">
        {error ? (
          <span className="text-rose-600">{error}</span>
        ) : (
          <>Press Enter to add and keep going · Esc to close · Duration defaults to 3:00 if blank</>
        )}
      </p>
    </div>
  );
}

type TrackMode = "view" | "rename" | "audio" | "lyrics" | "synced" | "credits";

type SongCreditsLite = AlbumCreditsMap["bySongId"][string];

function TrackRow({
  song,
  albumId,
  onOpen,
  withBorder,
  creditCount,
  credits,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  song: SongLite;
  albumId: string;
  onOpen: () => void;
  withBorder: boolean;
  creditCount: number;
  credits: SongCreditsLite | null;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const [mode, setMode] = useState<TrackMode>("view");
  const [draft, setDraft] = useState(song.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const pencilRef = useRef<HTMLButtonElement>(null);
  const masterChipRef = useRef<HTMLButtonElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Resync the title draft from the source-of-truth only on entry to
  // rename mode — anti-clobber so a background refetch can't wipe out
  // the user's in-progress typing. `song.title` intentionally NOT in deps.
  useEffect(() => {
    if (mode === "rename") {
      setDraft(song.title);
      queueMicrotask(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["/api/albums", albumId] });
    await qc.invalidateQueries({ queryKey: ["/api/albums"] });
  };

  const renameMut = useMutation({
    mutationFn: async (title: string) =>
      apiRequest("PUT", `/api/admin/songs/${song.id}`, { title }),
    onSuccess: async () => {
      await invalidate();
      setMode("view");
      queueMicrotask(() => pencilRef.current?.focus());
      toast({ title: "Track renamed" });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't rename the track",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const deleteMut = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/admin/songs/${song.id}`),
    onSuccess: async () => {
      await invalidate();
      toast({ title: "Track deleted" });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't delete the track",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const submitRename = () => {
    const next = draft.trim();
    if (!next) {
      toast({ title: "Title can't be empty", variant: "destructive" });
      return;
    }
    if (next === song.title) {
      setMode("view");
      queueMicrotask(() => pencilRef.current?.focus());
      return;
    }
    renameMut.mutate(next);
  };

  const cancelRename = () => {
    setMode("view");
    queueMicrotask(() => pencilRef.current?.focus());
  };

  const closeAudio = () => {
    setMode("view");
    queueMicrotask(() => masterChipRef.current?.focus());
  };

  const lyricsChipRef = useRef<HTMLButtonElement>(null);
  const closeLyrics = () => {
    setMode("view");
    queueMicrotask(() => lyricsChipRef.current?.focus());
  };

  const syncedChipRef = useRef<HTMLButtonElement>(null);
  const closeSynced = () => {
    setMode("view");
    queueMicrotask(() => syncedChipRef.current?.focus());
  };

  const creditsChipRef = useRef<HTMLButtonElement>(null);
  const closeCredits = () => {
    setMode("view");
    queueMicrotask(() => creditsChipRef.current?.focus());
  };

  const liCls = [
    "group relative flex flex-col transition-colors",
    withBorder && "border-b border-slate-100",
    mode !== "view" ? "bg-[#319ED8]/5" : "",
    isDragging ? "opacity-40" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li
      className={liCls}
      data-testid={`row-track-${song.id}`}
      onDragOver={mode === "view" ? onDragOver : undefined}
      onDrop={mode === "view" ? onDrop : undefined}
      onDragEnd={onDragEnd}
    >
      {/* Drop-target indicator — thin blue bar at the top of the row
          the user is currently hovering over while dragging another row.
          Absolute-positioned so it never shifts the row's layout. */}
      {isDropTarget && (
        <span
          aria-hidden="true"
          className="absolute left-0 right-0 -top-px h-0.5 bg-[#319ED8] z-10"
          data-testid={`indicator-drop-${song.id}`}
        />
      )}
      <div
        className={[
          "flex items-center gap-2 px-3 py-3",
          mode === "view" && "hover:bg-slate-50",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Drag handle — only active while we're in resting view mode so
            it never fights with the rename input or the open editors.
            Hidden until row-hover (or always visible on touch) to keep
            the resting row tidy. */}
        <button
          type="button"
          draggable={mode === "view"}
          onDragStart={mode === "view" ? onDragStart : undefined}
          aria-label="Drag to reorder"
          title="Drag to reorder"
          className={[
            "w-5 h-7 -ml-1 inline-flex items-center justify-center text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#319ED8]/40 rounded transition-opacity",
            mode === "view"
              ? "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60"
              : "opacity-0 pointer-events-none",
          ].join(" ")}
          data-testid={`grip-track-${song.id}`}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <span className="w-7 text-right text-slate-400 text-[12px] tabular-nums font-medium flex-shrink-0">
          {song.trackNumber}
        </span>

        {mode === "rename" ? (
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitRename();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelRename();
                }
              }}
              className="flex-1 h-8 rounded-md border border-slate-300 bg-white px-2.5 text-[13.5px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent"
              data-testid={`input-track-title-${song.id}`}
            />
            <button
              type="button"
              onClick={submitRename}
              disabled={renameMut.isPending}
              className="px-2.5 h-8 rounded-md bg-[#319ED8] text-white text-[11.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-1"
              data-testid={`button-save-track-${song.id}`}
            >
              {renameMut.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                "Save"
              )}
            </button>
            <button
              type="button"
              onClick={cancelRename}
              disabled={renameMut.isPending}
              className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-600 text-[11.5px] font-semibold hover:bg-slate-50"
              data-testid={`button-cancel-track-${song.id}`}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <button
                type="button"
                onClick={onOpen}
                className="block w-full text-left"
                data-testid={`button-open-track-${song.id}`}
              >
                <div
                  className="text-slate-900 text-[13.5px] font-medium truncate"
                  data-testid={`text-track-title-${song.id}`}
                >
                  {song.title}
                </div>
              </button>
              <div className="flex items-center gap-2.5 mt-0.5">
                <button
                  ref={masterChipRef}
                  type="button"
                  onClick={() =>
                    setMode((m) => (m === "audio" ? "view" : "audio"))
                  }
                  aria-label="Edit master audio file"
                  title="Edit master"
                  data-testid={`button-edit-master-${song.id}`}
                  className="rounded focus:outline-none focus:ring-2 focus:ring-[#319ED8]/40"
                >
                  <TrackChip
                    ok={!!song.audioUrl}
                    label={song.audioUrl ? "Master" : "No master"}
                    testId={`chip-master-${song.id}`}
                    interactive
                  />
                </button>
                <button
                  ref={lyricsChipRef}
                  type="button"
                  onClick={() =>
                    setMode((m) => (m === "lyrics" ? "view" : "lyrics"))
                  }
                  aria-label="Edit lyrics"
                  title="Edit lyrics"
                  data-testid={`button-edit-lyrics-${song.id}`}
                  className="rounded focus:outline-none focus:ring-2 focus:ring-[#319ED8]/40"
                >
                  <TrackChip
                    ok={!!song.lyrics}
                    label={song.lyrics ? "Lyrics" : "No lyrics"}
                    testId={`chip-lyrics-${song.id}`}
                    interactive
                  />
                </button>
                <button
                  ref={syncedChipRef}
                  type="button"
                  onClick={() =>
                    setMode((m) => (m === "synced" ? "view" : "synced"))
                  }
                  aria-label="Edit synced lyrics"
                  title="Edit synced lyrics (WebVTT)"
                  data-testid={`button-edit-synced-${song.id}`}
                  className="rounded focus:outline-none focus:ring-2 focus:ring-[#319ED8]/40"
                >
                  <TrackChip
                    ok={!!(song.syncedLyrics && song.syncedLyrics.length)}
                    label={
                      song.syncedLyrics && song.syncedLyrics.length
                        ? `Synced · ${song.syncedLyrics.length}`
                        : "No sync"
                    }
                    testId={`chip-synced-${song.id}`}
                    interactive
                  />
                </button>
                <button
                  ref={creditsChipRef}
                  type="button"
                  onClick={() =>
                    setMode((m) => (m === "credits" ? "view" : "credits"))
                  }
                  aria-label="View credits"
                  title="View credits (writers + performers)"
                  data-testid={`button-view-credits-${song.id}`}
                  className="rounded focus:outline-none focus:ring-2 focus:ring-[#319ED8]/40"
                >
                  <TrackChip
                    ok={creditCount > 0}
                    label={
                      creditCount > 0
                        ? `Credits · ${creditCount}`
                        : "No credits"
                    }
                    testId={`chip-credits-${song.id}`}
                    interactive
                  />
                </button>
              </div>
            </div>
            <span
              className="text-slate-400 text-[12px] tabular-nums flex-shrink-0"
              data-testid={`text-track-duration-${song.id}`}
            >
              {formatDuration(song.duration)}
            </span>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                ref={pencilRef}
                type="button"
                onClick={() => setMode("rename")}
                aria-label="Rename track"
                title="Rename"
                className="w-7 h-7 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-900 inline-flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                data-testid={`button-rename-track-${song.id}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete "${song.title}"? This removes the track, its credits, and any uploaded master.`,
                    )
                  ) {
                    deleteMut.mutate();
                  }
                }}
                disabled={deleteMut.isPending}
                aria-label="Delete track"
                title="Delete"
                className="w-7 h-7 rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 inline-flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                data-testid={`button-delete-track-${song.id}`}
              >
                {deleteMut.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {mode === "audio" && (
        <AudioEditor
          song={song}
          albumId={albumId}
          onClose={closeAudio}
          onSaved={invalidate}
        />
      )}

      {mode === "lyrics" && (
        <LyricsEditor
          song={song}
          onClose={closeLyrics}
          onSaved={invalidate}
        />
      )}

      {mode === "synced" && (
        <SyncedLyricsEditor
          song={song}
          onClose={closeSynced}
          onSaved={invalidate}
        />
      )}

      {mode === "credits" && (
        <CreditsEditor
          songId={song.id}
          albumId={albumId}
          credits={credits}
          onClose={closeCredits}
        />
      )}
    </li>
  );
}

/* ─── Per-track lyrics editor ────────────────────────────────────────── */

function LyricsEditor({
  song,
  onClose,
  onSaved,
}: {
  song: SongLite;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<string>(song.lyrics ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Seed the draft + focus the textarea only on first mount.
  // Anti-clobber: a background refetch of `song.lyrics` won't wipe the
  // in-progress edit because we don't depend on it after mount.
  useEffect(() => {
    queueMicrotask(() => {
      textareaRef.current?.focus();
      const el = textareaRef.current;
      if (el) el.setSelectionRange(el.value.length, el.value.length);
    });
  }, []);

  const normalized = draft.trim() ? draft : "";
  const dirty = (normalized || null) !== (song.lyrics ?? null);

  const saveMut = useMutation({
    mutationFn: async () =>
      apiRequest("PUT", `/api/admin/songs/${song.id}`, {
        lyrics: normalized || null,
      }),
    onSuccess: async () => {
      await onSaved();
      toast({
        title: normalized ? "Lyrics saved" : "Lyrics cleared",
      });
      onClose();
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save lyrics",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const lineCount = draft ? draft.split("\n").length : 0;

  return (
    <div
      className="px-5 pb-4"
      onKeyDown={(e) => {
        // Cmd/Ctrl+Enter saves; Escape cancels.
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          if (dirty && !saveMut.isPending) saveMut.mutate();
        } else if (e.key === "Escape" && !saveMut.isPending) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 flex-1">
            Lyrics
          </span>
          <span className="text-[10.5px] text-slate-400 tabular-nums">
            {lineCount} {lineCount === 1 ? "line" : "lines"}
          </span>
        </div>

        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={12}
          placeholder={
            "[Verse 1]\nFirst line of the verse\nSecond line of the verse\n\n[Chorus]\nFirst line of the chorus"
          }
          disabled={saveMut.isPending}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[12.5px] leading-relaxed text-slate-900 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent disabled:opacity-50"
          data-testid={`textarea-lyrics-${song.id}`}
        />

        <p className="text-[10.5px] text-slate-400 leading-snug">
          Section headers go in square brackets — <code className="font-mono">[Verse 1]</code>,{" "}
          <code className="font-mono">[Chorus]</code>,{" "}
          <code className="font-mono">[Bridge]</code> — they render dimmed in the player and are skipped when timing is auto-distributed.
        </p>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saveMut.isPending}
            className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-600 text-[11.5px] font-semibold hover:bg-slate-50 disabled:opacity-50"
            data-testid={`button-cancel-lyrics-${song.id}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={!dirty || saveMut.isPending}
            className="px-3 h-8 rounded-md bg-[#319ED8] text-white text-[11.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-1.5"
            data-testid={`button-save-lyrics-${song.id}`}
          >
            {saveMut.isPending && (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            )}
            Save lyrics
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Per-track synced lyrics editor (WebVTT) ──────────────────────── */

function SyncedLyricsEditor({
  song,
  onClose,
  onSaved,
}: {
  song: SongLite;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<{ timeMs: number; text: string }[] | null>(
    song.syncedLyrics ?? null,
  );
  const [rawText, setRawText] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autofocus the textarea on mount so the editor's own keydown handlers
  // (Escape to close) take effect immediately without an extra click.
  useEffect(() => {
    queueMicrotask(() => textareaRef.current?.focus());
  }, []);

  const cueCount = draft?.length ?? 0;
  const origCount = song.syncedLyrics?.length ?? 0;
  const dirty =
    JSON.stringify(draft ?? null) !== JSON.stringify(song.syncedLyrics ?? null);

  const parseAndSet = async (text: string, sourceLabel: string) => {
    setLocalError(null);
    setParsing(true);
    try {
      const { parseVtt } = await import("@/lib/vttParser");
      const cues = parseVtt(text);
      if (cues.length === 0) {
        setLocalError(
          `No cues found in ${sourceLabel}. Make sure it's a WebVTT file (header line "WEBVTT" + cues like "00:00:12.000 --> 00:00:15.000").`,
        );
        return;
      }
      setDraft(cues);
    } catch (e: any) {
      setLocalError(e?.message || `Couldn't parse ${sourceLabel}.`);
    } finally {
      setParsing(false);
    }
  };

  const handleFile = async (f: File) => {
    setLocalError(null);
    if (!/\.vtt$/i.test(f.name) && f.type && f.type !== "text/vtt") {
      setLocalError("That doesn't look like a .vtt file.");
      return;
    }
    try {
      const text = await f.text();
      setRawText(text);
      await parseAndSet(text, "the file");
    } catch (e: any) {
      setLocalError(e?.message || "Couldn't read the file.");
    }
  };

  const saveMut = useMutation({
    mutationFn: async () =>
      apiRequest("PUT", `/api/admin/songs/${song.id}`, {
        syncedLyrics: draft && draft.length > 0 ? draft : null,
      }),
    onSuccess: async () => {
      await onSaved();
      toast({
        title:
          draft && draft.length > 0
            ? `Synced lyrics saved · ${draft.length} cue${draft.length === 1 ? "" : "s"}`
            : "Synced lyrics cleared",
      });
      onClose();
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save synced lyrics",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const fmtTimestamp = (ms: number) =>
    `${Math.floor(ms / 60000)
      .toString()
      .padStart(2, "0")}:${Math.floor((ms % 60000) / 1000)
      .toString()
      .padStart(2, "0")}.${(ms % 1000).toString().padStart(3, "0")}`;

  return (
    <div
      className="px-5 pb-4"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !parsing && !saveMut.isPending) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className={[
          "rounded-xl border-2 border-dashed px-4 py-3 space-y-3 transition-colors",
          dragOver
            ? "border-[#319ED8] bg-[#319ED8]/10"
            : "border-slate-200 bg-slate-50/60",
        ].join(" ")}
        data-testid={`dropzone-vtt-${song.id}`}
      >
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 flex-1">
            Synced lyrics (WebVTT)
            {cueCount > 0 && (
              <span className="ml-1.5 text-slate-400 font-normal normal-case tracking-normal">
                · {cueCount} cue{cueCount === 1 ? "" : "s"}
                {dirty && origCount !== cueCount && (
                  <span className="text-[#319ED8]">
                    {" "}
                    (was {origCount})
                  </span>
                )}
              </span>
            )}
            {parsing && (
              <span className="ml-1.5 text-slate-400 font-normal normal-case tracking-normal">
                · parsing…
              </span>
            )}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".vtt,text/vtt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
            data-testid={`input-vtt-file-${song.id}`}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={parsing || saveMut.isPending}
            className="text-[12px] text-[#319ED8] hover:underline disabled:opacity-40 font-semibold"
            data-testid={`button-choose-vtt-${song.id}`}
          >
            {cueCount > 0 ? "Replace .vtt" : "Upload .vtt"}
          </button>
          {cueCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setRawText("");
                setLocalError(null);
              }}
              disabled={parsing || saveMut.isPending}
              className="text-[12px] text-slate-500 hover:text-slate-700 hover:underline disabled:opacity-40"
              data-testid={`button-clear-vtt-${song.id}`}
            >
              Clear
            </button>
          )}
        </div>

        <textarea
          ref={textareaRef}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          onBlur={() => {
            // parseVtt tolerates a missing WEBVTT header, so attempt to
            // parse anything non-empty and let the parser decide.
            if (rawText.trim()) {
              parseAndSet(rawText, "the pasted text");
            }
          }}
          rows={4}
          placeholder={
            "Or paste WebVTT text here:\nWEBVTT\n\n00:00:12.000 --> 00:00:15.500\nFirst line of lyric"
          }
          disabled={parsing || saveMut.isPending}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[11.5px] leading-relaxed text-slate-900 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent disabled:opacity-50"
          data-testid={`textarea-vtt-raw-${song.id}`}
        />

        {draft && draft.length > 0 ? (
          <div className="rounded-md bg-white border border-slate-200 px-3 py-2">
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">
              Preview · first {Math.min(draft.length, 5)} cue
              {Math.min(draft.length, 5) === 1 ? "" : "s"}
            </div>
            <ul
              className="text-[11.5px] font-mono text-slate-700 space-y-0.5"
              data-testid={`list-vtt-preview-${song.id}`}
            >
              {draft.slice(0, 5).map((c, i) => (
                <li key={i} className="flex gap-2 items-baseline">
                  <span className="text-slate-400 tabular-nums flex-shrink-0">
                    {fmtTimestamp(c.timeMs)}
                  </span>
                  <span className="truncate">{c.text}</span>
                </li>
              ))}
              {draft.length > 5 && (
                <li className="text-slate-400 italic">
                  + {draft.length - 5} more cue{draft.length - 5 === 1 ? "" : "s"}…
                </li>
              )}
            </ul>
          </div>
        ) : (
          <p className="text-[10.5px] text-slate-400 leading-snug">
            No file loaded. The player will fall back to even auto-distributed
            timing across the song's duration.
          </p>
        )}

        {localError && (
          <p
            className="text-[11px] text-rose-600"
            data-testid={`text-vtt-error-${song.id}`}
          >
            {localError}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={parsing || saveMut.isPending}
            className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-600 text-[11.5px] font-semibold hover:bg-slate-50 disabled:opacity-50"
            data-testid={`button-cancel-vtt-${song.id}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={!dirty || parsing || saveMut.isPending}
            className="px-3 h-8 rounded-md bg-[#319ED8] text-white text-[11.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-1.5"
            data-testid={`button-save-vtt-${song.id}`}
          >
            {saveMut.isPending && (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            )}
            Save sync
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Per-track credits editor (inline add / edit / delete) ─────────── */

function CreditsEditor({
  songId,
  albumId,
  credits,
  onClose,
}: {
  songId: string;
  albumId: string;
  credits: SongCreditsLite | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: people = [] } = useQuery<AdminPersonLite[]>({
    queryKey: ["/api/people"],
  });
  const { data: instruments = [] } = useQuery<AdminInstrumentLite[]>({
    queryKey: ["/api/instruments"],
  });
  const { data: roles = [] } = useQuery<AdminCreditRole[]>({
    queryKey: ["/api/admin/credit-roles"],
  });
  const [adding, setAdding] = useState<null | "writer" | "performer">(null);

  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: ["/api/albums", albumId, "credits"],
    });

  const writers = credits?.writers ?? [];
  const performers = credits?.performers ?? [];
  const total = writers.length + performers.length;

  return (
    <div
      className="px-5 pb-4"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !adding) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 flex-1">
            SuperCredits
            {total > 0 && (
              <span className="ml-1.5 text-slate-400 font-normal normal-case tracking-normal">
                · {writers.length} writer{writers.length === 1 ? "" : "s"} ·{" "}
                {performers.length} performer
                {performers.length === 1 ? "" : "s"}
              </span>
            )}
          </span>
        </div>

        {total === 0 && !adding && (
          <p className="text-[12px] text-slate-500 leading-snug">
            No credits on this track yet. Add writers (composer / lyricist /
            producer) and performers (with the specific instrument used on
            this track) to enable the SuperCredits badge.
          </p>
        )}

        {writers.length > 0 && (
          <div>
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">
              Writers
            </div>
            <ul className="space-y-1" data-testid="list-credits-writers">
              {writers.map((w) => (
                <CreditRowItem
                  key={`writer-${w.id}`}
                  kind="writer"
                  row={w}
                  songId={songId}
                  people={people}
                  instruments={instruments}
                  roles={roles}
                  onInvalidate={invalidate}
                />
              ))}
            </ul>
          </div>
        )}
        {performers.length > 0 && (
          <div>
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">
              Performers
            </div>
            <ul className="space-y-1" data-testid="list-credits-performers">
              {performers.map((p) => (
                <CreditRowItem
                  key={`performer-${p.id}`}
                  kind="performer"
                  row={p}
                  songId={songId}
                  people={people}
                  instruments={instruments}
                  roles={roles}
                  onInvalidate={invalidate}
                />
              ))}
            </ul>
          </div>
        )}

        {adding && (
          <AddCreditForm
            kind={adding}
            songId={songId}
            people={people}
            instruments={instruments}
            roles={roles}
            onCancel={() => setAdding(null)}
            onSaved={async () => {
              await invalidate();
              setAdding(null);
            }}
          />
        )}

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAdding("writer")}
              disabled={!!adding}
              className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-700 text-[11.5px] font-semibold hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1"
              data-testid="button-add-writer"
            >
              <Plus className="w-3 h-3" />
              Writer
            </button>
            <button
              type="button"
              onClick={() => setAdding("performer")}
              disabled={!!adding}
              className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-700 text-[11.5px] font-semibold hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1"
              data-testid="button-add-performer"
            >
              <Plus className="w-3 h-3" />
              Performer
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-600 text-[11.5px] font-semibold hover:bg-slate-50"
            data-testid="button-close-credits"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

type WriterRow = SongCreditsLite["writers"][number];
type PerformerRow = SongCreditsLite["performers"][number];

function CreditRowItem({
  kind,
  row,
  songId,
  people,
  instruments,
  roles,
  onInvalidate,
}: {
  kind: "writer" | "performer";
  row: WriterRow | PerformerRow;
  songId: string;
  people: AdminPersonLite[];
  instruments: AdminInstrumentLite[];
  roles: AdminCreditRole[];
  onInvalidate: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);

  // Edit-mode draft (one piece of state, anti-clobber resync on entry).
  const [eKind, setEKind] = useState<"writer" | "performer">(kind);
  const [personId, setPersonId] = useState<string | null>(row.personId);
  const [name, setName] = useState<string>(row.name);
  const [role, setRole] = useState<string>(row.role);
  const [instrumentId, setInstrumentId] = useState<string | null>(
    "instrumentId" in row ? row.instrumentId : null,
  );
  const [tuningNotes, setTuningNotes] = useState<string>(
    "tuningNotes" in row ? row.tuningNotes ?? "" : "",
  );
  const editPersonRef = useRef<HTMLSelectElement>(null);

  // Reset on entry to edit mode only — keeps a background refetch from
  // wiping in-progress edits. `row` intentionally NOT in deps.
  useEffect(() => {
    if (editing) {
      setEKind(kind);
      setPersonId(row.personId);
      setName(row.name);
      setRole(row.role);
      setInstrumentId("instrumentId" in row ? row.instrumentId : null);
      setTuningNotes("tuningNotes" in row ? row.tuningNotes ?? "" : "");
      // Move focus into the row so the editor's own Escape handler is
      // active immediately and keyboard users can start changing fields
      // without an extra click.
      queueMicrotask(() => editPersonRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const save = useMutation({
    mutationFn: async () => {
      const sameKind = eKind === kind;
      const trimmedTuning = tuningNotes.trim() || null;
      const effectiveName = (() => {
        if (personId) {
          const p = people.find((pp) => pp.id === personId);
          return p?.name ?? name;
        }
        return name;
      })();
      if (sameKind) {
        const url =
          kind === "writer"
            ? `/api/admin/writers/${row.id}`
            : `/api/admin/performers/${row.id}`;
        const body: any = { personId, name: effectiveName, role };
        if (kind === "performer") {
          body.instrumentId = instrumentId;
          body.tuningNotes = trimmedTuning;
        }
        await apiRequest("PUT", url, body);
      } else {
        // Cross-kind flip — non-atomic on the server. Create on the new
        // table first, then delete the old row. If the delete fails we
        // roll back by deleting the row we just created so the user
        // never ends up with a duplicate credit.
        const createUrl =
          eKind === "writer"
            ? `/api/admin/songs/${songId}/writers`
            : `/api/admin/songs/${songId}/performers`;
        const createBody: any = {
          personId,
          name: effectiveName,
          role,
        };
        if (eKind === "performer") {
          createBody.instrumentId = instrumentId;
          createBody.tuningNotes = trimmedTuning;
        }
        const createRes = await apiRequest("POST", createUrl, createBody);
        const created = (await createRes.json()) as { id: string };
        const delUrl =
          kind === "writer"
            ? `/api/admin/writers/${row.id}`
            : `/api/admin/performers/${row.id}`;
        try {
          await apiRequest("DELETE", delUrl);
        } catch (e) {
          // Best-effort compensation: remove the row we just created so
          // we don't leave the track with duplicate credits. If the
          // rollback itself fails we surface the original error.
          const rollbackUrl =
            eKind === "writer"
              ? `/api/admin/writers/${created.id}`
              : `/api/admin/performers/${created.id}`;
          try {
            await apiRequest("DELETE", rollbackUrl);
          } catch {
            // Rollback failed too — surface the original delete error.
          }
          throw e;
        }
      }
    },
    onSuccess: async () => {
      await onInvalidate();
      setEditing(false);
      toast({ title: "Credit saved" });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save credit",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const del = useMutation({
    mutationFn: async () => {
      const url =
        kind === "writer"
          ? `/api/admin/writers/${row.id}`
          : `/api/admin/performers/${row.id}`;
      await apiRequest("DELETE", url);
    },
    onSuccess: async () => {
      await onInvalidate();
      toast({ title: "Credit deleted" });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't delete credit",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  if (editing) {
    return (
      <li
        className="rounded-md bg-white border border-[#319ED8]/40 px-2.5 py-2 space-y-1.5"
        data-testid={`row-credit-edit-${row.id}`}
        onKeyDown={(e) => {
          // Escape cancels the row edit. Stop propagation so the parent
          // CreditsEditor doesn't also close the whole panel.
          if (e.key === "Escape" && !save.isPending) {
            e.preventDefault();
            e.stopPropagation();
            setEditing(false);
          }
        }}
      >
        <div className="grid grid-cols-[1fr_1fr] gap-1.5">
          <PersonSelect
            people={people}
            value={personId}
            onChange={(id) => {
              setPersonId(id);
              if (id) {
                const p = people.find((pp) => pp.id === id);
                if (p) setName(p.name);
              }
            }}
            selectRef={editPersonRef}
            testId={`select-person-${row.id}`}
          />
          <RoleSelect
            roles={roles}
            kind={eKind}
            role={role}
            onChange={(k, r) => {
              setEKind(k);
              setRole(r);
            }}
            testId={`select-role-${row.id}`}
          />
        </div>
        {eKind === "performer" && (
          <div className="grid grid-cols-[1fr_1fr] gap-1.5">
            <InstrumentSelect
              instruments={instruments}
              value={instrumentId}
              onChange={setInstrumentId}
              testId={`select-instrument-${row.id}`}
            />
            <input
              type="text"
              value={tuningNotes}
              onChange={(e) => setTuningNotes(e.target.value)}
              placeholder="Tuning / setup notes…"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[12px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent"
              data-testid={`input-tuning-${row.id}`}
            />
          </div>
        )}
        <div className="flex items-center justify-end gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={save.isPending}
            className="px-2 h-7 rounded-md bg-white border border-slate-200 text-slate-600 text-[11px] font-semibold hover:bg-slate-50 disabled:opacity-50"
            data-testid={`button-cancel-credit-${row.id}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || !role}
            className="px-2.5 h-7 rounded-md bg-[#319ED8] text-white text-[11px] font-semibold hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-1"
            data-testid={`button-save-credit-${row.id}`}
          >
            {save.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
            Save
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className="group flex items-center gap-2 text-[12.5px] hover:bg-slate-100/50 rounded px-1 py-0.5"
      data-testid={`item-credit-${kind}-${row.id}`}
    >
      <PersonAvatar
        name={row.person?.name ?? row.name}
        photoUrl={row.person?.photoUrl ?? null}
      />
      <span className="text-slate-900 font-medium truncate flex-shrink-0">
        {row.person?.name ?? row.name}
      </span>
      <span className="text-slate-400">·</span>
      <span className="text-slate-500 truncate">{row.role}</span>
      {kind === "performer" && (row as PerformerRow).instrument && (
        <>
          <span className="text-slate-300">on</span>
          <span className="text-slate-700 truncate">
            {(row as PerformerRow).instrument!.name}
          </span>
        </>
      )}
      {kind === "performer" && (row as PerformerRow).tuningNotes && (
        <span className="text-slate-400 italic truncate">
          ({(row as PerformerRow).tuningNotes})
        </span>
      )}
      <span className="flex-1" />
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit credit"
          title="Edit"
          className="w-6 h-6 rounded text-slate-400 hover:bg-slate-200 hover:text-slate-900 inline-flex items-center justify-center"
          data-testid={`button-edit-credit-${row.id}`}
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                `Delete this credit (${row.person?.name ?? row.name} · ${row.role})?`,
              )
            ) {
              del.mutate();
            }
          }}
          disabled={del.isPending}
          aria-label="Delete credit"
          title="Delete"
          className="w-6 h-6 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 inline-flex items-center justify-center disabled:opacity-50"
          data-testid={`button-delete-credit-${row.id}`}
        >
          {del.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Trash2 className="w-3 h-3" />
          )}
        </button>
      </div>
    </li>
  );
}

function AddCreditForm({
  kind,
  songId,
  people,
  instruments,
  roles,
  onCancel,
  onSaved,
}: {
  kind: "writer" | "performer";
  songId: string;
  people: AdminPersonLite[];
  instruments: AdminInstrumentLite[];
  roles: AdminCreditRole[];
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const defaultRole =
    roles.find((r) => r.kind === kind)?.name ??
    (kind === "writer" ? "Composer" : "Performer");
  const [personId, setPersonId] = useState<string | null>(null);
  const [role, setRole] = useState<string>(defaultRole);
  const [instrumentId, setInstrumentId] = useState<string | null>(null);
  const [tuningNotes, setTuningNotes] = useState<string>("");

  const personSelectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    queueMicrotask(() => personSelectRef.current?.focus());
  }, []);

  const create = useMutation({
    mutationFn: async () => {
      const url =
        kind === "writer"
          ? `/api/admin/songs/${songId}/writers`
          : `/api/admin/songs/${songId}/performers`;
      const person = personId ? people.find((p) => p.id === personId) : null;
      const body: any = {
        personId,
        name: person?.name ?? "",
        role,
      };
      if (kind === "performer") {
        body.instrumentId = instrumentId;
        body.tuningNotes = tuningNotes.trim() || null;
      }
      await apiRequest("POST", url, body);
    },
    onSuccess: async () => {
      await onSaved();
      toast({ title: `${kind === "writer" ? "Writer" : "Performer"} added` });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't add credit",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  return (
    <div
      className="rounded-md bg-white border border-[#319ED8]/40 px-2.5 py-2 space-y-1.5"
      data-testid={`form-add-credit-${kind}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !create.isPending) {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="text-[10.5px] uppercase tracking-wider font-semibold text-[#319ED8]">
        Add {kind}
      </div>
      <div className="grid grid-cols-[1fr_1fr] gap-1.5">
        <PersonSelect
          people={people}
          value={personId}
          onChange={setPersonId}
          selectRef={personSelectRef}
          testId={`select-person-new-${kind}`}
        />
        <RoleSelect
          roles={roles}
          kind={kind}
          role={role}
          onChange={(_, r) => setRole(r)}
          lockKind
          testId={`select-role-new-${kind}`}
        />
      </div>
      {kind === "performer" && (
        <div className="grid grid-cols-[1fr_1fr] gap-1.5">
          <InstrumentSelect
            instruments={instruments}
            value={instrumentId}
            onChange={setInstrumentId}
            testId={`select-instrument-new-${kind}`}
          />
          <input
            type="text"
            value={tuningNotes}
            onChange={(e) => setTuningNotes(e.target.value)}
            placeholder="Tuning / setup notes…"
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[12px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent"
            data-testid={`input-tuning-new-${kind}`}
          />
        </div>
      )}
      <div className="flex items-center justify-end gap-1.5 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={create.isPending}
          className="px-2 h-7 rounded-md bg-white border border-slate-200 text-slate-600 text-[11px] font-semibold hover:bg-slate-50 disabled:opacity-50"
          data-testid={`button-cancel-add-${kind}`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={create.isPending || !personId || !role}
          className="px-2.5 h-7 rounded-md bg-[#319ED8] text-white text-[11px] font-semibold hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-1"
          data-testid={`button-save-add-${kind}`}
        >
          {create.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
          Add
        </button>
      </div>
    </div>
  );
}

/* ─── Credit pickers (simple selects backed by /api/people, /api/instruments,
       /api/admin/credit-roles). Searchable comboboxes + inline-create
       live in classic admin — admins can add people / instruments there
       and they appear here on next refetch. ──────────────────────── */

function PersonSelect({
  people,
  value,
  onChange,
  selectRef,
  testId,
}: {
  people: AdminPersonLite[];
  value: string | null;
  onChange: (id: string | null) => void;
  selectRef?: React.RefObject<HTMLSelectElement>;
  testId?: string;
}) {
  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <select
      ref={selectRef}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[12px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent"
      data-testid={testId}
    >
      <option value="">— Pick a person —</option>
      {sorted.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

function InstrumentSelect({
  instruments,
  value,
  onChange,
  testId,
}: {
  instruments: AdminInstrumentLite[];
  value: string | null;
  onChange: (id: string | null) => void;
  testId?: string;
}) {
  const sorted = [...instruments].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[12px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent"
      data-testid={testId}
    >
      <option value="">— No instrument —</option>
      {sorted.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name}
        </option>
      ))}
    </select>
  );
}

function RoleSelect({
  roles,
  kind,
  role,
  onChange,
  lockKind = false,
  testId,
}: {
  roles: AdminCreditRole[];
  kind: "writer" | "performer";
  role: string;
  onChange: (kind: "writer" | "performer", role: string) => void;
  lockKind?: boolean;
  testId?: string;
}) {
  const writerRoles = roles.filter((r) => r.kind === "writer");
  const performerRoles = roles.filter((r) => r.kind === "performer");
  // Encode as "kind:role" so flipping kinds via the same select works
  // without a second dropdown. The edit-row save path picks up the kind
  // change and triggers delete-then-create on the server.
  const value = `${kind}:${role}`;
  return (
    <select
      value={value}
      onChange={(e) => {
        const [k, ...rest] = e.target.value.split(":");
        onChange(k as "writer" | "performer", rest.join(":"));
      }}
      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[12px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent"
      data-testid={testId}
    >
      {(lockKind ? kind === "writer" : true) && writerRoles.length > 0 && (
        <optgroup label="Writer">
          {writerRoles.map((r) => (
            <option key={r.id} value={`writer:${r.name}`}>
              {r.name}
            </option>
          ))}
        </optgroup>
      )}
      {(lockKind ? kind === "performer" : true) && performerRoles.length > 0 && (
        <optgroup label="Performer">
          {performerRoles.map((r) => (
            <option key={r.id} value={`performer:${r.name}`}>
              {r.name}
            </option>
          ))}
        </optgroup>
      )}
      {/* Always include the current role even if it's not in the canonical
          list (legacy data, custom role added via classic admin, etc.). */}
      {!roles.some((r) => r.kind === kind && r.name === role) && role && (
        <option value={value}>{role}</option>
      )}
    </select>
  );
}

function PersonAvatar({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl: string | null;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        className="w-5 h-5 rounded-full object-cover flex-shrink-0 bg-slate-200"
      />
    );
  }
  return (
    <span className="w-5 h-5 rounded-full bg-[#319ED8]/15 text-[#319ED8] text-[10px] font-bold inline-flex items-center justify-center flex-shrink-0">
      {initial}
    </span>
  );
}

/* ─── Per-track audio editor (drag-drop, file picker, paste URL) ─────── */

function AudioEditor({
  song,
  albumId: _albumId,
  onClose,
  onSaved,
}: {
  song: SongLite;
  albumId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [draftUrl, setDraftUrl] = useState<string>(song.audioUrl ?? "");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = (draftUrl || null) !== (song.audioUrl ?? null);

  const handleFile = async (f: File) => {
    setLocalError(null);
    if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|aac|wav|flac|ogg)$/i.test(f.name)) {
      setLocalError("That's not an audio file. Use MP3, M4A/AAC, WAV, FLAC, or OGG.");
      return;
    }
    if (f.size > 150 * 1024 * 1024) {
      setLocalError("File too large — keep masters under 150 MB.");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadAudioFile(f);
      setDraftUrl(url);
    } catch (e: any) {
      setLocalError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const saveMut = useMutation({
    mutationFn: async () =>
      apiRequest("PUT", `/api/admin/songs/${song.id}`, {
        audioUrl: draftUrl || null,
      }),
    onSuccess: async () => {
      await onSaved();
      toast({ title: song.audioUrl ? "Master updated" : "Master added" });
      onClose();
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save the master",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  return (
    <div
      className="px-5 pb-4"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !uploading && !saveMut.isPending) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className={[
          "rounded-xl border-2 border-dashed px-4 py-4 space-y-3 transition-colors",
          dragOver
            ? "border-[#319ED8] bg-[#319ED8]/10"
            : "border-slate-200 bg-slate-50/60",
        ].join(" ")}
        data-testid={`dropzone-audio-${song.id}`}
      >
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 flex-1">
            Master audio
            {uploading && (
              <span className="ml-1.5 text-slate-400 font-normal normal-case tracking-normal">
                · uploading…
              </span>
            )}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
            data-testid={`input-audio-file-${song.id}`}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || saveMut.isPending}
            className="text-[12px] text-[#319ED8] hover:underline disabled:opacity-40 font-semibold"
            data-testid={`button-choose-audio-${song.id}`}
          >
            {draftUrl ? "Replace file" : "Choose file"}
          </button>
          {draftUrl && (
            <button
              type="button"
              onClick={() => {
                setDraftUrl("");
                setLocalError(null);
              }}
              disabled={uploading || saveMut.isPending}
              className="text-[12px] text-slate-500 hover:text-slate-700 hover:underline disabled:opacity-40"
              data-testid={`button-clear-audio-${song.id}`}
            >
              Clear
            </button>
          )}
        </div>

        <input
          type="text"
          value={draftUrl}
          onChange={(e) => {
            setDraftUrl(e.target.value);
            setLocalError(null);
          }}
          placeholder="Drop a file here, choose one, or paste a URL"
          disabled={uploading || saveMut.isPending}
          className="w-full h-8 rounded-md border border-slate-300 bg-white px-2.5 text-[12.5px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent disabled:opacity-50"
          data-testid={`input-audio-url-${song.id}`}
        />

        {draftUrl && (
          <audio
            controls
            src={draftUrl}
            preload="none"
            onError={() =>
              setLocalError(
                "Preview failed to load. If you pasted a URL, make sure it's a direct audio link (not a share page).",
              )
            }
            className="w-full h-8"
            data-testid={`audio-preview-${song.id}`}
          />
        )}

        {localError && (
          <p
            className="text-[11px] text-rose-600"
            data-testid={`text-audio-error-${song.id}`}
          >
            {localError}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading || saveMut.isPending}
            className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-600 text-[11.5px] font-semibold hover:bg-slate-50 disabled:opacity-50"
            data-testid={`button-cancel-audio-${song.id}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={!dirty || uploading || saveMut.isPending}
            className="px-3 h-8 rounded-md bg-[#319ED8] text-white text-[11.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-1.5"
            data-testid={`button-save-audio-${song.id}`}
          >
            {saveMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Save master
          </button>
        </div>
      </div>
    </div>
  );
}

function TrackChip({
  ok,
  label,
  testId,
  interactive,
}: {
  ok: boolean;
  label: string;
  testId?: string;
  interactive?: boolean;
}) {
  return (
    <span
      data-testid={testId}
      className={[
        "inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-semibold uppercase tracking-wide",
        ok
          ? "bg-[#4AFFCA]/15 text-emerald-700"
          : "bg-slate-100 text-slate-400",
        interactive && "hover:ring-1 hover:ring-[#319ED8]/40 transition-shadow",
      ]
        .filter(Boolean)
        .join(" ")}
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
    if (file.size > 8 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Keep covers under 8 MB.",
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
            JPG, PNG, or WebP · up to 8 MB
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

/* ─── Masters tab ──────────────────────────────────────────────────── */

async function uploadAudioFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const token = getAuthToken();
  if (!token) {
    throw new Error("Sign out and back in — your session token is missing.");
  }
  const res = await fetch("/api/admin/upload-audio", {
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

// Read duration (in seconds, rounded) from an audio file via a hidden
// <audio> element. Falls back to the song's existing duration if the
// browser can't decode the file — the server requires a number.
function readAudioDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("audio");
    a.preload = "metadata";
    a.src = url;
    const cleanup = () => URL.revokeObjectURL(url);
    a.onloadedmetadata = () => {
      const d = a.duration;
      cleanup();
      resolve(Number.isFinite(d) && d > 0 ? Math.round(d) : null);
    };
    a.onerror = () => {
      cleanup();
      resolve(null);
    };
  });
}

function MastersPanel({ album }: { album: AlbumFull }) {
  const sorted = [...album.songs].sort(
    (a, b) => a.trackNumber - b.trackNumber,
  );
  const withMaster = sorted.filter((s) => !!s.audioUrl).length;

  if (sorted.length === 0) {
    return (
      <section
        className="rounded-2xl bg-white border border-slate-200 shadow-sm p-10 text-center"
        data-testid="panel-masters-empty"
      >
        <div className="inline-flex items-center gap-2 text-slate-500 text-sm">
          <AlertCircle className="w-4 h-4" />
          Add tracks first, then come back here to upload their masters.
        </div>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden"
      data-testid="panel-masters"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <div>
          <h2 className="text-slate-900 text-[14px] font-bold">
            Streaming masters
          </h2>
          <p className="text-slate-400 text-[11.5px]">
            <span
              className={
                withMaster === sorted.length
                  ? "text-emerald-700 font-semibold"
                  : "text-slate-500 font-semibold"
              }
            >
              {withMaster} of {sorted.length}
            </span>{" "}
            uploaded · MP3, M4A, WAV, or FLAC · up to 150 MB each
          </p>
        </div>
      </div>
      <div className="px-5 py-2.5 bg-slate-50/60 border-b border-slate-100 text-[11.5px] text-slate-500 leading-relaxed">
        A <span className="font-semibold text-slate-700">master</span> is the
        streaming audio file for a track. One row below = one track on this
        album. To add a new master, first{" "}
        <span className="font-semibold text-slate-700">add a track</span> on the
        Tracks tab — its master slot will show up here.
      </div>
      <ol>
        {sorted.map((song, i) => (
          <MasterRow
            key={song.id}
            song={song}
            albumId={album.id}
            isLast={i === sorted.length - 1}
          />
        ))}
      </ol>
      <div className="px-5 py-3 border-t border-slate-100 text-[11px] text-slate-400 leading-relaxed">
        Hi-res downloadable masters + stems are deferred — see roadmap.
      </div>
    </section>
  );
}

function MasterRow({
  song,
  albumId,
  isLast,
}: {
  song: SongLite;
  albumId: string;
  isLast: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["/api/albums", albumId] });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const detectedDuration = await readAudioDurationSeconds(file);
      const url = await uploadAudioFile(file);
      const body: Record<string, unknown> = { audioUrl: url };
      if (detectedDuration) body.duration = detectedDuration;
      await apiRequest("PUT", `/api/admin/songs/${song.id}`, body);
      return url;
    },
    onSuccess: async () => {
      await invalidate();
      setReplaceOpen(false);
      toast({
        title: song.audioUrl ? "Master replaced" : "Master uploaded",
        description: song.title,
      });
    },
    onError: (e: any) => {
      toast({
        title: "Upload failed",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const setUrlMut = useMutation({
    mutationFn: async (url: string) => {
      await apiRequest("PUT", `/api/admin/songs/${song.id}`, { audioUrl: url });
    },
    onSuccess: async () => {
      await invalidate();
      setUrlDraft("");
      setReplaceOpen(false);
      toast({
        title: song.audioUrl ? "Master replaced" : "Master added",
        description: song.title,
      });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save that URL",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const removeMut = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/admin/songs/${song.id}`, {
        audioUrl: null,
      });
    },
    onSuccess: async () => {
      await invalidate();
      toast({ title: "Master removed", description: song.title });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't remove the master",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const acceptFile = (file: File | undefined | null) => {
    if (!file) return;
    if (
      !/^audio\//.test(file.type) &&
      !/\.(mp3|m4a|aac|wav|flac|ogg)$/i.test(file.name)
    ) {
      toast({
        title: "That's not an audio file",
        description: "Masters need to be MP3, M4A, WAV, FLAC, or OGG.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 150 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Keep masters under 150 MB.",
        variant: "destructive",
      });
      return;
    }
    uploadMut.mutate(file);
  };

  const submitUrl = () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    if (trimmed === song.audioUrl) {
      setUrlDraft("");
      return;
    }
    setUrlMut.mutate(trimmed);
  };

  const busy =
    uploadMut.isPending || setUrlMut.isPending || removeMut.isPending;
  const hasMaster = !!song.audioUrl;

  return (
    <li
      className={[
        "px-5 py-3 transition-colors",
        !isLast && "border-b border-slate-100",
        busy && "bg-slate-50",
        dragOver && "bg-[#319ED8]/5",
      ]
        .filter(Boolean)
        .join(" ")}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!busy) setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (busy) return;
        acceptFile(e.dataTransfer.files?.[0]);
      }}
      data-testid={`row-master-${song.id}`}
    >
      <div className="group flex items-center gap-4">
        <span className="w-7 text-right text-slate-400 text-[12px] tabular-nums font-medium flex-shrink-0">
          {song.trackNumber}
        </span>
        <div className="flex-1 min-w-0">
          <div
            className="text-slate-900 text-[13.5px] font-medium truncate"
            data-testid={`text-master-title-${song.id}`}
          >
            {song.title}
          </div>
          <div className="flex items-center gap-2.5 mt-0.5">
            <TrackChip
              ok={hasMaster}
              label={hasMaster ? "Master loaded" : "No master"}
              testId={`chip-master-${song.id}`}
            />
            <span className="text-slate-400 text-[11px] tabular-nums">
              {formatDuration(song.duration)}
            </span>
          </div>
        </div>
        {hasMaster && song.audioUrl && (
          <audio
            controls
            src={song.audioUrl}
            preload="none"
            className="h-8 max-w-[220px]"
            data-testid={`audio-preview-${song.id}`}
          />
        )}
        {/* Hover-reveal actions. Touch devices keep them visible via the
            media-hover query so phones aren't stuck without controls. */}
        <div
          className={[
            "flex items-center gap-1 flex-shrink-0 transition-opacity",
            hasMaster
              ? "opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"
              : "opacity-100",
            replaceOpen && "opacity-100",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Popover open={replaceOpen} onOpenChange={setReplaceOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={busy}
                className={[
                  "px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition-colors",
                  hasMaster
                    ? "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                    : "bg-[#319ED8] text-white hover:bg-[#2890c8]",
                  busy && "opacity-60 cursor-not-allowed",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-testid={`button-replace-master-${song.id}`}
              >
                {uploadMut.isPending || setUrlMut.isPending ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {uploadMut.isPending ? "Uploading…" : "Saving…"}
                  </>
                ) : (
                  <>
                    <Upload className="w-3 h-3" />
                    {hasMaster ? "Replace" : "Upload master"}
                  </>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-80 p-0"
              data-testid={`popover-replace-master-${song.id}`}
            >
              <div className="p-4 space-y-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {hasMaster ? "Replace master" : "Add master"}
                  </div>
                  <div className="text-[12px] text-slate-500 mt-0.5 truncate">
                    {song.title}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !busy && fileInputRef.current?.click()}
                  disabled={busy}
                  className="w-full h-9 px-3 rounded-md bg-[#319ED8] text-white text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-[#2890c8] disabled:opacity-60"
                  data-testid={`button-popover-upload-${song.id}`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload from this device
                </button>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[10.5px] uppercase tracking-wider text-slate-400 font-semibold">
                    or
                  </span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Link2 className="w-3 h-3" />
                    Paste a URL
                  </label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      type="text"
                      value={urlDraft}
                      onChange={(e) => setUrlDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submitUrl();
                        }
                      }}
                      placeholder="https://…"
                      disabled={busy}
                      autoFocus={false}
                      className="flex-1 h-8 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent disabled:opacity-50"
                      data-testid={`input-popover-url-${song.id}`}
                    />
                    <button
                      type="button"
                      onClick={submitUrl}
                      disabled={busy || !urlDraft.trim()}
                      className="h-8 px-3 rounded-md bg-slate-900 text-white text-[11.5px] font-semibold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                      data-testid={`button-popover-save-url-${song.id}`}
                    >
                      Save
                    </button>
                  </div>
                </div>
                {hasMaster && (
                  <div className="text-[11px] text-slate-400 pt-1">
                    Tip: you can also drop an audio file directly on the row.
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
          {hasMaster && (
            <button
              type="button"
              onClick={() => {
                if (busy) return;
                if (
                  window.confirm(
                    `Remove the master from "${song.title}"? The track keeps its title, lyrics, and credits.`,
                  )
                ) {
                  removeMut.mutate();
                }
              }}
              disabled={busy}
              className="px-2 py-1.5 rounded-md text-[11.5px] font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors disabled:opacity-50 inline-flex items-center gap-1"
              data-testid={`button-remove-master-${song.id}`}
              aria-label="Remove master"
              title="Remove master"
            >
              {removeMut.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.flac"
        className="hidden"
        onChange={(e) => {
          acceptFile(e.target.files?.[0]);
          e.target.value = "";
        }}
        data-testid={`input-master-file-${song.id}`}
      />
    </li>
  );
}

/* ─── Bonus tab (videos + photos) ──────────────────────────────────── */

interface AlbumVideo {
  id: string;
  albumId: string;
  title: string;
  description: string | null;
  videoUrl: string;
  posterUrl: string | null;
  position: number;
}
interface AlbumPhoto {
  id: string;
  albumId: string;
  photoUrl: string;
  caption: string | null;
  position: number;
}

// Three-step direct-to-GCS upload (sign → PUT → finalize) so files past
// Replit's ~32MB inbound proxy cap still work, with optional progress.
async function uploadVideoFile(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Sign out and back in — your session token is missing.");
  }
  const signRes = await fetch("/api/admin/upload-video/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify({ contentType: file.type || "video/mp4" }),
  });
  if (!signRes.ok) {
    const body = await signRes.json().catch(() => ({}));
    throw new Error(body.message || `Upload failed (${signRes.status})`);
  }
  const { uploadUrl, finalPath, contentType } = (await signRes.json()) as {
    uploadUrl: string;
    finalPath: string;
    contentType: string;
  };
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — network error"));
    xhr.send(file);
  });
  const finRes = await fetch("/api/admin/upload-video/finalize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify({ finalPath }),
  });
  if (!finRes.ok) {
    const body = await finRes.json().catch(() => ({}));
    throw new Error(body.message || `Upload finalize failed (${finRes.status})`);
  }
  const { url } = (await finRes.json()) as { url: string };
  return url;
}

function friendlyVideoError(raw: string): string {
  let msg = raw || "";
  const jsonMatch = msg.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.message) msg = String(parsed.message);
    } catch {}
  }
  if (/larger than the 500MB/i.test(msg) || /exceeded 500MB/i.test(msg)) {
    return "Sorry, this video is larger than the 500MB import limit.";
  }
  if (/unsupported|mime|content[- ]type/i.test(msg)) {
    return "That link doesn't look like an MP4, MOV, or WebM video.";
  }
  if (/fetch|network|timed? ?out|enotfound|econnrefused/i.test(msg)) {
    return "We couldn't reach that link. Double-check the URL and try again.";
  }
  return msg || "Upload failed.";
}

type VideoSheetMode =
  | { kind: "closed" }
  | { kind: "new" }
  | { kind: "edit"; video: AlbumVideo };

type PhotoSheetMode =
  | { kind: "closed" }
  | { kind: "new" }
  | { kind: "edit"; photo: AlbumPhoto };

function BonusPanel({
  album,
  onEdit,
}: {
  album: AlbumFull;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-5">
      <BonusVideos albumId={album.id} onEdit={onEdit} />
      <BonusPhotos albumId={album.id} onEdit={onEdit} />
      <p className="text-slate-400 text-[11px] leading-relaxed px-1">
        Liner notes, lyric sheets, commentary, and press-kit assets are
        deferred — see roadmap.
      </p>
    </div>
  );
}

function BonusVideos({
  albumId,
  onEdit: _onEdit,
}: {
  albumId: string;
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sheet, setSheet] = useState<VideoSheetMode>({ kind: "closed" });

  const { data: videos = [], isLoading } = useQuery<AlbumVideo[]>({
    queryKey: ["/api/albums", albumId, "videos"],
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/album-videos/${id}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["/api/albums", albumId, "videos"],
      });
      toast({ title: "Video removed" });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't remove the video",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  return (
    <section
      className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden"
      data-testid="panel-bonus-videos"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <div>
          <h2 className="text-slate-900 text-[14px] font-bold inline-flex items-center gap-2">
            <Film className="w-4 h-4 text-slate-400" />
            Videos
          </h2>
          <p className="text-slate-400 text-[11.5px]">
            {videos.length} {videos.length === 1 ? "video" : "videos"} ·
            MP4 / MOV / WebM · up to 500 MB
          </p>
        </div>
      </div>
      <div className="p-5">
        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          </div>
        ) : (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
            data-testid="grid-bonus-videos"
          >
            {videos
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((v) => (
                <VideoTile
                  key={v.id}
                  video={v}
                  onDelete={() => {
                    if (confirm(`Remove "${v.title}"?`)) {
                      deleteMut.mutate(v.id);
                    }
                  }}
                  onEdit={() => setSheet({ kind: "edit", video: v })}
                  busy={deleteMut.isPending}
                />
              ))}
            <AddTile
              busy={false}
              label="Add video"
              onClick={() => setSheet({ kind: "new" })}
              testId="button-add-video"
            />
          </div>
        )}
      </div>
      {sheet.kind !== "closed" && (
        <AlbumVideoSheet
          mode={sheet}
          albumId={albumId}
          onClose={() => setSheet({ kind: "closed" })}
          onSaved={async () => {
            setSheet({ kind: "closed" });
            await qc.invalidateQueries({
              queryKey: ["/api/albums", albumId, "videos"],
            });
            toast({
              title: sheet.kind === "edit" ? "Video updated" : "Video added",
            });
          }}
          onRequestDelete={(v) => {
            if (confirm(`Remove "${v.title}"?`)) {
              deleteMut.mutate(v.id);
              setSheet({ kind: "closed" });
            }
          }}
        />
      )}
    </section>
  );
}

function BonusPhotos({
  albumId,
  onEdit: _onEdit,
}: {
  albumId: string;
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sheet, setSheet] = useState<PhotoSheetMode>({ kind: "closed" });

  const { data: photos = [], isLoading } = useQuery<AlbumPhoto[]>({
    queryKey: ["/api/albums", albumId, "photos"],
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/album-photos/${id}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["/api/albums", albumId, "photos"],
      });
      toast({ title: "Photo removed" });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't remove the photo",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  return (
    <section
      className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden"
      data-testid="panel-bonus-photos"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <div>
          <h2 className="text-slate-900 text-[14px] font-bold inline-flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-slate-400" />
            Photos
          </h2>
          <p className="text-slate-400 text-[11.5px]">
            {photos.length} {photos.length === 1 ? "photo" : "photos"} ·
            JPG / PNG / WebP · up to 8 MB
          </p>
        </div>
      </div>
      <div className="p-5">
        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          </div>
        ) : (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
            data-testid="grid-bonus-photos"
          >
            {photos
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((p) => (
                <PhotoTile
                  key={p.id}
                  photo={p}
                  onDelete={() => {
                    if (confirm("Remove this photo?")) {
                      deleteMut.mutate(p.id);
                    }
                  }}
                  onEdit={() => setSheet({ kind: "edit", photo: p })}
                />
              ))}
            <AddTile
              busy={false}
              label="Add photo"
              onClick={() => setSheet({ kind: "new" })}
              testId="button-add-photo"
            />
          </div>
        )}
      </div>
      {sheet.kind !== "closed" && (
        <AlbumPhotoSheet
          mode={sheet}
          albumId={albumId}
          onClose={() => setSheet({ kind: "closed" })}
          onSaved={async () => {
            setSheet({ kind: "closed" });
            await qc.invalidateQueries({
              queryKey: ["/api/albums", albumId, "photos"],
            });
            toast({
              title: sheet.kind === "edit" ? "Photo updated" : "Photo added",
            });
          }}
          onRequestDelete={(p) => {
            if (confirm("Remove this photo?")) {
              deleteMut.mutate(p.id);
              setSheet({ kind: "closed" });
            }
          }}
        />
      )}
    </section>
  );
}

function VideoTile({
  video,
  onDelete,
  onEdit,
  busy,
}: {
  video: AlbumVideo;
  onDelete: () => void;
  onEdit: () => void;
  busy: boolean;
}) {
  return (
    <div
      className="group relative aspect-video rounded-xl overflow-hidden bg-slate-900 ring-1 ring-slate-200 shadow-sm"
      data-testid={`tile-video-${video.id}`}
    >
      {video.posterUrl ? (
        <img
          src={video.posterUrl}
          alt=""
          className="w-full h-full object-cover"
        />
      ) : (
        <video
          src={video.videoUrl}
          preload="metadata"
          className="w-full h-full object-cover"
          muted
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <Play className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 text-white/85 drop-shadow-lg" />
      <div
        className="absolute bottom-2 left-2 right-2 text-white text-[12px] font-semibold truncate drop-shadow"
        data-testid={`text-video-title-${video.id}`}
      >
        {video.title}
      </div>
      <TileActions onEdit={onEdit} onDelete={onDelete} disabled={busy} />
    </div>
  );
}

function PhotoTile({
  photo,
  onDelete,
  onEdit,
}: {
  photo: AlbumPhoto;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className="group relative aspect-square rounded-xl overflow-hidden bg-slate-100 ring-1 ring-slate-200 shadow-sm"
      data-testid={`tile-photo-${photo.id}`}
    >
      <img
        src={photo.photoUrl}
        alt={photo.caption || ""}
        className="w-full h-full object-cover"
      />
      {photo.caption && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
          <div
            className="absolute bottom-2 left-2 right-2 text-white text-[11.5px] font-medium truncate drop-shadow"
            data-testid={`text-photo-caption-${photo.id}`}
          >
            {photo.caption}
          </div>
        </>
      )}
      <TileActions onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

function TileActions({
  onEdit,
  onDelete,
  disabled,
}: {
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        disabled={disabled}
        aria-label="Edit"
        title="Edit"
        className="w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm text-slate-700 hover:bg-white hover:text-slate-900 inline-flex items-center justify-center shadow"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        disabled={disabled}
        aria-label="Delete"
        title="Delete"
        className="w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm text-rose-600 hover:bg-white hover:text-rose-700 inline-flex items-center justify-center shadow"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function AddTile({
  busy,
  label,
  onClick,
  testId,
}: {
  busy: boolean;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      data-testid={testId}
      className={[
        "aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 text-slate-400 transition-colors",
        busy
          ? "border-slate-200 bg-slate-50 cursor-not-allowed"
          : "border-slate-200 hover:border-[#319ED8] hover:text-[#319ED8] hover:bg-[#319ED8]/5",
      ].join(" ")}
    >
      {busy ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Plus className="w-6 h-6" />
      )}
      <span className="text-[11.5px] font-semibold">{label}</span>
    </button>
  );
}

/* ─── (No more phase placeholders — all five tabs are real) ────────── */


/* ─── Bits ─────────────────────────────────────────────────────────── */

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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ─── Add/Edit video sheet ─────────────────────────────────────────── */

function AlbumVideoSheet({
  mode,
  albumId,
  onClose,
  onSaved,
  onRequestDelete,
}: {
  mode: { kind: "new" } | { kind: "edit"; video: AlbumVideo };
  albumId: string;
  onClose: () => void;
  onSaved: () => void;
  onRequestDelete: (v: AlbumVideo) => void;
}) {
  const isEdit = mode.kind === "edit";
  const existing = isEdit ? mode.video : null;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [posterUrl, setPosterUrl] = useState<string | null>(
    existing?.posterUrl ?? null,
  );

  const [source, setSource] = useState<"upload" | "url">("upload");
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [pickedFilePreview, setPickedFilePreview] = useState<string | null>(
    null,
  );
  const [importUrl, setImportUrl] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (pickedFilePreview) URL.revokeObjectURL(pickedFilePreview);
    };
  }, [pickedFilePreview]);

  function handlePickFile(file: File) {
    if (pickedFilePreview) URL.revokeObjectURL(pickedFilePreview);
    setPickedFile(file);
    setPickedFilePreview(URL.createObjectURL(file));
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, "") || "Untitled video");
  }

  async function handlePickPoster(file: File) {
    try {
      setErr(null);
      const url = await uploadImageFile(file);
      setPosterUrl(url);
    } catch (e: any) {
      setErr(e?.message || "Poster upload failed");
    }
  }

  const canSubmit = isEdit
    ? title.trim().length > 0
    : (source === "upload" && !!pickedFile && title.trim().length > 0) ||
      (source === "url" && importUrl.trim().length > 0);

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    setProgress(null);
    try {
      if (isEdit && existing) {
        await apiRequest("PUT", `/api/admin/album-videos/${existing.id}`, {
          title: title.trim(),
          description: description.trim() || null,
          posterUrl,
        });
      } else {
        let videoUrl = "";
        if (source === "upload" && pickedFile) {
          setProgress(0);
          videoUrl = await uploadVideoFile(pickedFile, (f) =>
            setProgress(Math.min(0.99, f)),
          );
        } else if (source === "url") {
          const res = await apiRequest(
            "POST",
            "/api/admin/upload-video/from-url",
            { url: importUrl.trim() },
          );
          const data = await res.json();
          videoUrl = data.url;
          if (!title.trim() && data.suggestedTitle) {
            setTitle(data.suggestedTitle);
          }
        }
        const finalTitle =
          title.trim() ||
          (source === "url" ? "Imported video" : "Untitled video");
        await apiRequest("POST", `/api/admin/albums/${albumId}/videos`, {
          videoUrl,
          title: finalTitle,
          description: description.trim() || null,
          posterUrl,
        });
      }
      onSaved();
    } catch (e: any) {
      console.error("[AlbumVideoSheet] submit failed", e);
      setErr(friendlyVideoError(e?.message || ""));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (busy) return;
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="!bg-white !border-slate-200 !rounded-2xl !shadow-xl !p-0 !gap-0 max-w-2xl max-h-[90vh] overflow-hidden flex flex-col [&>button]:!text-slate-400 [&>button]:hover:!text-slate-700"
        data-testid="dialog-album-video-sheet"
      >
        <DialogHeader className="px-5 py-4 border-b border-slate-100 flex-shrink-0 space-y-0">
          <DialogTitle className="text-slate-900 text-[17px] font-semibold">
            {isEdit ? "Edit video" : "Add a video"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit
              ? "Update the video's title, description, or thumbnail."
              : "Pick a video file or paste a link, then give it a title and an optional description."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 pb-4">
            {isEdit ? (
              <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-200">
                {existing?.posterUrl ? (
                  <img
                    src={existing.posterUrl}
                    alt=""
                    className="w-full h-full object-cover opacity-90"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Play
                      className="w-10 h-10 text-slate-600"
                      strokeWidth={1.5}
                    />
                  </div>
                )}
                <a
                  href={existing?.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute inset-0 flex items-center justify-center"
                  aria-label="Open video in a new tab"
                  data-testid="link-preview-album-video"
                >
                  <div className="w-14 h-14 rounded-full bg-white/95 flex items-center justify-center shadow-lg">
                    <Play
                      className="w-5 h-5 text-slate-900 ml-1"
                      fill="currentColor"
                    />
                  </div>
                </a>
              </div>
            ) : pickedFile || pickedFilePreview ? (
              <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-200">
                {pickedFilePreview ? (
                  <video
                    src={pickedFilePreview}
                    className="w-full h-full object-contain bg-black"
                    muted
                    playsInline
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Play
                      className="w-10 h-10 text-slate-600"
                      strokeWidth={1.5}
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="absolute bottom-3 right-3 text-xs font-medium px-2.5 py-1.5 rounded-md bg-white/95 backdrop-blur-md text-slate-700 hover:text-[#319ED8] shadow-sm border border-black/5 disabled:opacity-50"
                  data-testid="button-replace-video-file"
                >
                  Replace video
                </button>
              </div>
            ) : (
              <>
                <div className="inline-flex p-0.5 rounded-lg bg-slate-100 mb-3 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setSource("upload")}
                    className={
                      "px-3 py-1.5 rounded-md transition-colors " +
                      (source === "upload"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700")
                    }
                    data-testid="tab-source-upload"
                  >
                    Upload file
                  </button>
                  <button
                    type="button"
                    onClick={() => setSource("url")}
                    className={
                      "px-3 py-1.5 rounded-md transition-colors " +
                      (source === "url"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700")
                    }
                    data-testid="tab-source-url"
                  >
                    Import from URL
                  </button>
                </div>

                {source === "upload" ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      if (e.dataTransfer.files?.[0])
                        handlePickFile(e.dataTransfer.files[0]);
                    }}
                    className={
                      "w-full aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-colors " +
                      (dragActive
                        ? "border-[#319ED8] bg-blue-50"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300")
                    }
                    data-testid="button-video-dropzone"
                  >
                    <svg
                      className={
                        "w-8 h-8 mb-3 transition-colors " +
                        (dragActive ? "text-[#319ED8]" : "text-slate-400")
                      }
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                      <path d="M12 12v9" />
                      <path d="m16 16-4-4-4 4" />
                    </svg>
                    <p className="text-sm font-medium text-slate-700">
                      Drop a video here, or click to browse
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      MP4, MOV, or WebM · up to 500MB
                    </p>
                  </button>
                ) : (
                  <div className="w-full aspect-video rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-6">
                    <svg
                      className="w-7 h-7 text-slate-400 mb-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
                      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    <p className="text-sm font-medium text-slate-700 mb-3">
                      Paste a video link
                    </p>
                    <input
                      type="url"
                      autoFocus
                      placeholder="https://www.dropbox.com/scl/fi/… or https://…/video.mp4"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      className="w-full max-w-md text-sm bg-white border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#319ED8] focus:ring-1 focus:ring-[#319ED8]/30"
                      data-testid="input-video-import-url"
                    />
                    <p className="text-[11px] text-slate-400 mt-2 text-center">
                      We'll pull the file straight into storage — no need to
                      download it first.
                    </p>
                  </div>
                )}
              </>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handlePickFile(e.target.files[0]);
              }}
            />
          </div>

          <div className="px-5 pb-2 space-y-4">
            <div>
              <label
                htmlFor="album-video-title"
                className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide"
              >
                Title
              </label>
              <input
                id="album-video-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Live at the Troubadour — 2019"
                className="w-full text-sm text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#319ED8] focus:ring-1 focus:ring-[#319ED8]/30"
                data-testid="input-album-video-title"
              />
            </div>

            <div>
              <label
                htmlFor="album-video-description"
                className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide"
              >
                Description
                <span className="ml-2 normal-case tracking-normal text-slate-400 text-[11px] font-normal">
                  optional
                </span>
              </label>
              <textarea
                id="album-video-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short note that shows under the video on the album page."
                rows={2}
                className="w-full text-sm text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#319ED8] focus:ring-1 focus:ring-[#319ED8]/30 resize-none"
                data-testid="input-album-video-description"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">
                Thumbnail
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => posterInputRef.current?.click()}
                  className="aspect-video w-28 rounded-lg border-2 border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                  title="Upload custom thumbnail"
                  data-testid="button-upload-album-video-poster"
                >
                  <Plus className="w-5 h-5" />
                </button>
                {posterUrl ? (
                  <div className="relative aspect-video w-28 rounded-lg overflow-hidden border-2 border-[#319ED8] flex-shrink-0">
                    <img
                      src={posterUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPosterUrl(null)}
                      className="absolute top-1 right-1 p-0.5 rounded-full bg-white/90 hover:bg-white text-slate-600 hover:text-red-600 shadow-sm"
                      title="Remove thumbnail"
                      aria-label="Remove thumbnail"
                      data-testid="button-remove-album-video-poster"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="aspect-video w-28 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center text-slate-300 flex-shrink-0">
                    <ImagePlus className="w-5 h-5" strokeWidth={1.5} />
                  </div>
                )}
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="aspect-video w-28 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-50 opacity-40 flex items-center justify-center flex-shrink-0"
                    title="Frames from video (coming soon)"
                  >
                    <Play
                      className="w-4 h-4 text-slate-400 ml-0.5"
                      strokeWidth={1.5}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Pick a frame from the video — coming soon. For now, upload a
                still (16:9 · 1280×720 or 1920×1080 retina · JPG/PNG/WebP).
              </p>
              <input
                ref={posterInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handlePickPoster(e.target.files[0]);
                }}
              />
            </div>

            {err && (
              <div
                role="alert"
                className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-[13px] leading-snug"
                data-testid="banner-album-video-error"
              >
                {err}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-slate-100 flex items-center !justify-between bg-slate-50/50 flex-shrink-0 gap-2 sm:gap-2">
          <div>
            {isEdit && existing && (
              <button
                type="button"
                onClick={() => onRequestDelete(existing)}
                disabled={busy}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600 transition-colors disabled:opacity-50"
                data-testid="button-delete-from-sheet"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete video
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              data-testid="button-cancel-album-video-sheet"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || busy}
              className="px-4 py-2 text-sm font-medium text-white bg-[#319ED8] hover:bg-[#2a8ac0] disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              data-testid="button-submit-album-video-sheet"
            >
              {busy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {progress !== null
                    ? `Uploading ${Math.round(progress * 100)}%`
                    : isEdit
                      ? "Saving…"
                      : "Adding…"}
                </>
              ) : (
                <>{isEdit ? "Save" : "Add video"}</>
              )}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Add/Edit photo sheet ─────────────────────────────────────────── */

function AlbumPhotoSheet({
  mode,
  albumId,
  onClose,
  onSaved,
  onRequestDelete,
}: {
  mode: { kind: "new" } | { kind: "edit"; photo: AlbumPhoto };
  albumId: string;
  onClose: () => void;
  onSaved: () => void;
  onRequestDelete: (p: AlbumPhoto) => void;
}) {
  const isEdit = mode.kind === "edit";
  const existing = isEdit ? mode.photo : null;

  const [caption, setCaption] = useState(existing?.caption ?? "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(
    existing?.photoUrl ?? null,
  );
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handlePickFile(file: File) {
    setErr(null);
    setUploadingImage(true);
    try {
      const url = await uploadImageFile(file);
      setPhotoUrl(url);
    } catch (e: any) {
      setErr(e?.message || "Upload failed");
    } finally {
      setUploadingImage(false);
    }
  }

  const canSubmit = !!photoUrl && !uploadingImage && !busy;

  async function handleSubmit() {
    if (!canSubmit || !photoUrl) return;
    setBusy(true);
    setErr(null);
    try {
      const trimmed = caption.trim();
      if (isEdit && existing) {
        await apiRequest("PUT", `/api/admin/album-photos/${existing.id}`, {
          photoUrl,
          caption: trimmed || null,
        });
      } else {
        await apiRequest("POST", `/api/admin/albums/${albumId}/photos`, {
          photoUrl,
          caption: trimmed || null,
        });
      }
      onSaved();
    } catch (e: any) {
      console.error("[AlbumPhotoSheet] submit failed", e);
      setErr(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (busy || uploadingImage) return;
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="!bg-white !border-slate-200 !rounded-2xl !shadow-xl !p-0 !gap-0 max-w-2xl max-h-[90vh] overflow-hidden flex flex-col [&>button]:!text-slate-400 [&>button]:hover:!text-slate-700"
        data-testid="dialog-album-photo-sheet"
      >
        <DialogHeader className="px-5 py-4 border-b border-slate-100 flex-shrink-0 space-y-0">
          <DialogTitle className="text-slate-900 text-[17px] font-semibold">
            {isEdit ? "Edit photo" : "Add a photo"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit
              ? "Update the photo or its caption."
              : "Pick an image, then add an optional caption."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 pb-4">
            {photoUrl ? (
              <div className="relative w-full max-w-sm mx-auto aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                <img
                  src={photoUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
                {uploadingImage && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-[#319ED8] animate-spin" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage || busy}
                  className="absolute bottom-3 right-3 text-xs font-medium px-2.5 py-1.5 rounded-md bg-white/95 backdrop-blur-md text-slate-700 hover:text-[#319ED8] shadow-sm border border-black/5 disabled:opacity-50"
                  data-testid="button-replace-album-photo"
                >
                  Replace photo
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  if (e.dataTransfer.files?.[0])
                    handlePickFile(e.dataTransfer.files[0]);
                }}
                disabled={uploadingImage}
                className={
                  "w-full max-w-sm mx-auto block aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-colors disabled:opacity-50 " +
                  (dragActive
                    ? "border-[#319ED8] bg-blue-50"
                    : "border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300")
                }
                data-testid="button-photo-dropzone"
              >
                {uploadingImage ? (
                  <>
                    <Loader2 className="w-7 h-7 text-[#319ED8] animate-spin mb-3" />
                    <p className="text-sm font-medium text-slate-700">
                      Uploading…
                    </p>
                  </>
                ) : (
                  <>
                    <ImagePlus
                      className={
                        "w-8 h-8 mb-3 transition-colors " +
                        (dragActive ? "text-[#319ED8]" : "text-slate-400")
                      }
                      strokeWidth={1.75}
                    />
                    <p className="text-sm font-medium text-slate-700">
                      Drop a photo here, or click to browse
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Square · 1200×1200 px recommended · JPG, PNG, WebP, or GIF
                    </p>
                  </>
                )}
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handlePickFile(e.target.files[0]);
              }}
            />
          </div>

          <div className="px-5 pb-2 space-y-4">
            <div>
              <label
                htmlFor="album-photo-caption"
                className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide"
              >
                Caption
                <span className="ml-2 normal-case tracking-normal text-slate-400 text-[11px] font-normal">
                  optional
                </span>
              </label>
              <input
                id="album-photo-caption"
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="e.g. Nick on stage — Brooklyn Steel, 2024"
                className="w-full text-sm text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#319ED8] focus:ring-1 focus:ring-[#319ED8]/30"
                data-testid="input-album-photo-caption"
              />
            </div>

            {err && (
              <div
                role="alert"
                className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-[13px] leading-snug"
                data-testid="banner-album-photo-error"
              >
                {err}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-slate-100 flex items-center !justify-between bg-slate-50/50 flex-shrink-0 gap-2 sm:gap-2">
          <div>
            {isEdit && existing && (
              <button
                type="button"
                onClick={() => onRequestDelete(existing)}
                disabled={busy || uploadingImage}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600 transition-colors disabled:opacity-50"
                data-testid="button-delete-photo-from-sheet"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete photo
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy || uploadingImage}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              data-testid="button-cancel-album-photo-sheet"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-4 py-2 text-sm font-medium text-white bg-[#319ED8] hover:bg-[#2a8ac0] disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              data-testid="button-submit-album-photo-sheet"
            >
              {busy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {isEdit ? "Saving…" : "Adding…"}
                </>
              ) : (
                <>{isEdit ? "Save" : "Add photo"}</>
              )}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
