import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  SiApplemusic,
  SiSpotify,
  SiInstagram,
  SiTiktok,
  SiX,
  SiBluesky,
  SiFacebook,
} from "react-icons/si";
import { Globe, Check, Search, X as XIcon, Plus, Disc3, UserRound, Guitar, Store, Tag } from "lucide-react";

interface AdminAlbum {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  year: number | null;
  type: "Single" | "EP" | "LP";
  description: string | null;
  goodTunesReleaseDate: string | null;
  streamingReleaseDate: string | null;
  // Optional FK into People. When set, `artist` (string) mirrors the picked
  // person's name; when null, `artist` is whatever was typed manually.
  primaryArtistId: string | null;
  // Demo show/hide. When true the album (and its songs/credits) is hidden
  // from the fan-side catalog. CMS callers see hidden rows so they can
  // flip the toggle back on.
  isHidden: boolean;
  // True only for albums GoodTunes is actually releasing (curated by the
  // label, not pulled in via a discography import). Filters the Albums
  // sidebar list to the curated catalog only.
  isGoodTunesRelease: boolean;
  // Optional record-label FK. SET NULL in the DB so a deleted label leaves
  // the album's catalog row intact (just with no label credit). The album
  // read endpoints denormalize the full label entity onto `album.label`,
  // but the editor only ever writes back the FK.
  labelId: string | null;
  // Per-album streaming-service handoff. Populated either by the People
  // discography panel (Apple Music) or manually on the album editor.
  appleMusicUrl: string | null;
  spotifyUrl: string | null;
  // Free-text primary genre ("Indie Rock", "Soul", …). Rendered on the
  // fan-side album page next to the year. Null hides the genre half of
  // that line cleanly.
  genre: string | null;
}

// Record label. One row per real-world label (Sub Pop, Warp, …). Each album
// points at zero or one of these via `albums.labelId`. Editing the label
// here propagates to every album released on it.
interface AdminLabel {
  id: string;
  name: string;
  logoUrl: string | null;
  bio: string | null;
  location: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  coverUrl: string | null;
  createdAt: string | null;
}

interface AdminSong {
  id: string;
  albumId: string;
  title: string;
  trackNumber: number;
  duration: number;
  lyrics: string | null;
  audioUrl: string | null;
  syncedLyrics: { timeMs: number; text: string }[] | null;
}

interface AlbumWithSongs extends AdminAlbum {
  // Denormalized label entity from the album LEFT JOIN. Reading happens
  // here; writes still flow through `labelId` on `AdminAlbum`.
  label: AdminLabel | null;
  songs: AdminSong[];
}

interface AdminPerson {
  id: string;
  name: string;
  photoUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  appleMusicUrl: string | null;
  spotifyUrl: string | null;
  itunesArtistId: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  twitterUrl: string | null;
  blueskyUrl: string | null;
  facebookUrl: string | null;
  websiteUrl: string | null;
  // Optional FK to a label this artist is signed to. Independent of
  // album.labelId — an artist can be tagged with a label even when their
  // releases aren't (or vice-versa, e.g. one-off licensed album).
  labelId: string | null;
}

interface ScrapedArtistAlbum {
  collectionId: number;
  name: string;
  artworkUrl: string;
  year: number | null;
  trackCount: number | null;
  type: "album" | "EP";
  releaseDate: string | null;
  appleMusicUrl: string | null;
}

interface ArtistScrapeResult {
  source: "apple" | "spotify" | "unknown";
  name: string | null;
  photoUrl: string | null;
  bio: string | null;
  itunesArtistId: string | null;
  appleMusicUrl: string | null;
  spotifyUrl: string | null;
  albums: ScrapedArtistAlbum[];
}

// Flat shape returned by /api/instruments and /api/songs/:id/credits — the
// API server denormalizes the vendor entity onto each attachment so fan-side
// consumers (AlbumDetail.tsx) keep working unchanged after the M:N split.
// `id` is the attachment id (instrument_vendors.id); `vendorId` points at
// the vendor entity. Editing entity-level fields (name/logo/bio/location/
// cover/tagline/aboutUrl/domain/homeUrl) affects every instrument using this
// vendor; affiliateUrl + isHidden + position are per-attachment.
interface AdminVendor {
  id: string;
  instrumentId: string;
  vendorId: string;
  name: string;
  domain: string;
  homeUrl: string | null;
  affiliateUrl: string;
  aboutUrl: string | null;
  logoUrl: string | null;
  tagline: string | null;
  bio: string | null;
  location: string | null;
  coverUrl: string | null;
  position: number;
  // Demo show/hide — hides this vendor's button from the fan-side
  // InstrumentSheet. Admins still see it in the CMS so they can flip it back.
  isHidden: boolean;
  // ISO timestamp on the ATTACHMENT row; powers "Pulled 2m ago".
  createdAt: string | null;
}

// Light-touch "x time ago" for vendor-row provenance hints. Keeps the
// numbers in admin-grey rather than yelling at the user — we only want
// them as a "when did I last touch this" cue.
function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// Vendor entity grouped across all its attachments. Built client-side on
// the Vendors tab so each unique vendor (one Carter row, not three) is
// listed once. `id` mirrors `vendorId` so the existing selection state
// (which keys on row id) keeps working without restructuring.
interface AdminVendorGrouped {
  id: string;
  vendorId: string;
  name: string;
  domain: string;
  homeUrl: string | null;
  aboutUrl: string | null;
  logoUrl: string | null;
  tagline: string | null;
  bio: string | null;
  location: string | null;
  coverUrl: string | null;
  createdAt: string | null;
  attachments: {
    attachmentId: string;
    instrumentId: string;
    instrumentName: string;
    instrumentPhotoUrl: string | null;
    instrumentCategory: string | null;
    affiliateUrl: string;
    isHidden: boolean;
    position: number;
  }[];
}

interface AdminInstrument {
  id: string;
  name: string;
  category: string;
  shortCategory: string | null;
  photoUrl: string | null;
  about: string | null;
  artistNote: string | null;
  vendors: AdminVendor[];
}

type EntityKey = "albums" | "people" | "instruments" | "vendors" | "labels";

// ---------- Shared bits ----------

// Normalize the most common "share link" pasted into the artwork field.
// Dropbox: ?dl=0  →  ?raw=1 so the URL serves the binary image instead of
// Dropbox's HTML preview page. Anything else passes through untouched.
function normalizeImageUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("dropbox.com")) {
      u.searchParams.delete("dl");
      u.searchParams.set("raw", "1");
      return u.toString();
    }
  } catch {
    // Not a parseable URL (could be a relative path like /uploads/x.png). Leave alone.
  }
  return url;
}

// File-or-URL artwork picker. Hands the resolved URL back via onChange so the
// parent form treats both paths the same way (everything just ends up in
// album.artwork as a plain URL string).
function ArtworkPicker({
  value,
  onChange,
  shape = "square",
  testId,
  hint,
}: {
  value: string;
  onChange: (next: string) => void;
  shape?: "square" | "circle";
  testId: string;
  hint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File) {
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // Token lives in localStorage (managed by queryClient); apiRequest
      // already adds it but expects JSON, so we hit fetch directly here.
      // Bearer is *required* by the backend for /api/admin/upload — the
      // cookie session alone is rejected to block cross-site CSRF uploads.
      const token = getAuthToken();
      if (!token)
        throw new Error(
          "Sign out and back in — your session token is missing.",
        );
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
      onChange(url);
    } catch (e: any) {
      setErr(e.message || "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        {value ? (
          <img
            src={value}
            alt=""
            className={`w-20 h-20 object-cover border border-slate-200 shrink-0 ${shape === "circle" ? "rounded-full" : "rounded-md"}`}
            data-testid={`${testId}-preview`}
          />
        ) : (
          <div
            className={`w-20 h-20 bg-slate-100 border border-dashed border-slate-300 shrink-0 flex items-center justify-center text-slate-400 text-[11px] ${shape === "circle" ? "rounded-full" : "rounded-md"}`}
          >
            No image
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-2">
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => {
              const norm = normalizeImageUrl(e.target.value);
              if (norm !== e.target.value) onChange(norm);
            }}
            placeholder="Paste an image URL — Dropbox links work too"
            className={inputCls}
            data-testid={`${testId}-url`}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="px-3 py-1.5 text-[12px] rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-50"
              data-testid={`${testId}-upload`}
            >
              {busy ? "Uploading…" : "Upload from device"}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="px-2 py-1.5 text-[12px] text-slate-500 hover:text-red-600"
                data-testid={`${testId}-clear`}
              >
                Remove
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>
          {hint && (
            <p
              className="text-[11px] text-slate-400"
              data-testid={`${testId}-hint`}
            >
              {hint}
            </p>
          )}
          {err && (
            <p className="text-red-600 text-xs" data-testid={`${testId}-error`}>
              {err}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Promote another user to admin by @username. Lives quietly in the top-bar
// as a "+" icon button that expands inline into a username field + submit.
// Collapsed by default to keep the chrome calm — admin invites are a rare
// action and shouldn't fight the rest of the UI for attention. No revoke
// path — by design (see /api/admin/promote comment in server/routes.ts).
function PromotePanel() {
  const [expanded, setExpanded] = useState(false);
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const promote = useMutation({
    mutationFn: async (u: string) => {
      const res = await apiRequest("POST", "/api/admin/promote", {
        username: u,
      });
      return res.json() as Promise<{
        username: string;
        alreadyAdmin?: boolean;
      }>;
    },
    onSuccess: (r) => {
      setMsg({
        kind: "ok",
        text: r.alreadyAdmin
          ? `@${r.username} is already an admin.`
          : `@${r.username} is now an admin.`,
      });
      setUsername("");
    },
    onError: (e: Error) => setMsg({ kind: "err", text: e.message }),
  });

  // Auto-focus the field on expand, and collapse on outside-click + Escape
  // so the bar snaps back to a single icon when the admin is done.
  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);
  useEffect(() => {
    if (!expanded) return;
    function onDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setExpanded(false);
        setMsg(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setExpanded(false);
        setMsg(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        title="Add admin"
        aria-label="Add admin"
        className="w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        data-testid="button-promote-toggle"
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const u = username.trim().replace(/^@/, "");
          if (!u) return;
          setMsg(null);
          promote.mutate(u);
        }}
        className="flex items-center gap-1.5"
      >
        <input
          ref={inputRef}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="@username"
          className="w-44 px-2.5 py-1 text-xs rounded-md border border-slate-200 bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#319ED8]"
          data-testid="input-promote-username"
        />
        <button
          type="submit"
          disabled={promote.isPending || !username.trim()}
          className="px-2.5 py-1 rounded-md bg-[#319ED8] text-white text-xs font-medium hover:bg-[#319ED8]/90 disabled:opacity-40"
          data-testid="button-promote-admin"
        >
          {promote.isPending ? "…" : "Add"}
        </button>
      </form>
      {msg && (
        <p
          className={`absolute right-0 top-full mt-1 text-[11px] whitespace-nowrap ${msg.kind === "ok" ? "text-[#319ED8]" : "text-red-600"}`}
          data-testid="text-promote-result"
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}

// ---------- AlbumEditor ----------

function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function AlbumEditor({
  albumId,
  onDeleted,
}: {
  albumId: string;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<AlbumWithSongs>({
    queryKey: ["/api/albums", albumId],
  });

  const [form, setForm] = useState<AdminAlbum | null>(null);
  const [dirty, setDirty] = useState(false);
  // Editor-wide tab strip — mirrors the PersonEditor pattern (About | Music
  // | Gear) so admins move through the four entities the same way. About =
  // the metadata form, Content = tracklist + videos + photos, People +
  // Gear are placeholders until per-song writer/performer/instrument
  // editing graduates out of the song-row credits sheet.
  const [tab, setTab] = useState<"about" | "content" | "people" | "gear">("about");
  // Reset to the About tab whenever the editor switches to a different
  // album so a deep-linked tab doesn't carry over between rows.
  useEffect(() => { setTab("about"); }, [albumId]);
  useEffect(() => {
    if (data) {
      setForm({
        id: data.id,
        title: data.title,
        artist: data.artist,
        artwork: data.artwork,
        year: data.year,
        type: data.type,
        description: data.description,
        isHidden: data.isHidden,
        isGoodTunesRelease: (data as any).isGoodTunesRelease ?? false,
        labelId: data.labelId ?? null,
        appleMusicUrl: data.appleMusicUrl,
        spotifyUrl: data.spotifyUrl,
        genre: (data as any).genre ?? null,
        goodTunesReleaseDate: (data as any).goodTunesReleaseDate ?? null,
        streamingReleaseDate: (data as any).streamingReleaseDate ?? null,
        primaryArtistId: (data as any).primaryArtistId ?? null,
      });
      setDirty(false);
    }
  }, [data?.id]);

  // Every mutation invalidates the full set of surfaces an album touches:
  // the album list, the album detail (which the iframe loads), the user's
  // owned-album list (Collection shows this), and any cached playlists
  // because a deleted song removes itself from playlist rows.
  const invalidateAlbumSurfaces = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
    queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId] });
    queryClient.invalidateQueries({ queryKey: ["/api/my-albums"] });
    queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
  };

  const saveAlbum = useMutation({
    mutationFn: async (payload: Partial<AdminAlbum>) => {
      const res = await apiRequest(
        "PUT",
        `/api/admin/albums/${albumId}`,
        payload,
      );
      return res.json();
    },
    onSuccess: () => {
      invalidateAlbumSurfaces();
      setDirty(false);
    },
  });

  const deleteAlbum = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/albums/${albumId}`);
    },
    onSuccess: () => {
      // Drop the stale detail cache entirely so the iframe doesn't re-show
      // an album that no longer exists.
      queryClient.removeQueries({ queryKey: ["/api/albums", albumId] });
      invalidateAlbumSurfaces();
      onDeleted();
    },
  });

  const updateSong = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<AdminSong>;
    }) => {
      const res = await apiRequest("PUT", `/api/admin/songs/${id}`, patch);
      return res.json();
    },
    onSuccess: () => invalidateAlbumSurfaces(),
  });

  const deleteSong = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/songs/${id}`);
    },
    onSuccess: () => invalidateAlbumSurfaces(),
  });

  const addSong = useMutation({
    mutationFn: async () => {
      const nextTrack = (data?.songs?.length ?? 0) + 1;
      const res = await apiRequest("POST", `/api/admin/songs`, {
        albumId,
        title: "Untitled",
        trackNumber: nextTrack,
        duration: 180,
      });
      return res.json();
    },
    onSuccess: () => invalidateAlbumSurfaces(),
  });

  // Drag-to-reorder the tracklist. We optimistically rewrite the album's
  // cached songs array (so the user sees the new order the instant they
  // drop), then POST the full ordered ID list to the server. On error we
  // refetch — the server is the source of truth for trackNumber.
  const reorderSongs = useMutation({
    mutationFn: async (songIds: string[]) => {
      await apiRequest("POST", `/api/admin/albums/${albumId}/tracks/reorder`, {
        songIds,
      });
    },
    onMutate: async (songIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: ["/api/albums", albumId] });
      const prev = queryClient.getQueryData<AlbumWithSongs>(["/api/albums", albumId]);
      if (prev) {
        const byId = new Map(prev.songs.map((s) => [s.id, s]));
        const next = songIds
          .map((id, i) => {
            const s = byId.get(id);
            return s ? { ...s, trackNumber: i + 1 } : null;
          })
          .filter((s): s is AdminSong => s !== null);
        queryClient.setQueryData<AlbumWithSongs>(["/api/albums", albumId], {
          ...prev,
          songs: next,
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(["/api/albums", albumId], ctx.prev);
      }
    },
    onSettled: () => invalidateAlbumSurfaces(),
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<string | null>(null);
  const handleDragStart = (id: string) => (e: React.DragEvent) => {
    setDragId(id);
    // Firefox requires setData to actually initiate the drag.
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", id); } catch {}
  };
  const handleDragOver = (id: string) => (e: React.DragEvent) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropBeforeId(id);
  };
  const handleDragEnd = () => {
    setDragId(null);
    setDropBeforeId(null);
  };
  const handleDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const src = dragId;
    setDragId(null);
    setDropBeforeId(null);
    if (!src || src === targetId) return;
    const songs = data?.songs ?? [];
    const ids = songs.map((s) => s.id);
    const from = ids.indexOf(src);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = ids.slice();
    next.splice(from, 1);
    // If we removed a row above the target, the target index shifts up by 1.
    next.splice(from < to ? to - 1 : to, 0, src);
    // No-op if nothing actually changed.
    if (next.every((id, i) => id === ids[i])) return;
    reorderSongs.mutate(next);
  };

  if (isLoading || !form) {
    return <div className="p-8 text-slate-500">Loading…</div>;
  }

  const set = <K extends keyof AdminAlbum>(k: K, v: AdminAlbum[K]) => {
    setForm({ ...form, [k]: v });
    setDirty(true);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <div>
          <h2
            className="text-slate-900 text-lg font-semibold truncate max-w-[480px]"
            data-testid="text-editor-title"
            title={form.title || "Untitled album"}
          >
            {form.title?.trim() || "Untitled album"}
          </h2>
          <p className="text-slate-400 text-xs truncate max-w-[480px]" title={albumId}>{albumId}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  "Delete this album, all its songs, and any playlist references? This cannot be undone.",
                )
              ) {
                deleteAlbum.mutate();
              }
            }}
            disabled={deleteAlbum.isPending}
            className="px-3 py-1.5 text-[13px] text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50"
            data-testid="button-delete-album"
          >
            Delete
          </button>
          {/* Demo hide toggle. Flipping this away from `false` immediately
              dirties the form so the change rides the regular Save button —
              keeps the editor's single source of truth (no separate mutation). */}
          <button
            type="button"
            onClick={() => set("isHidden", !form.isHidden)}
            className={`px-3 py-1.5 text-[12px] rounded-md border ${
              form.isHidden
                ? "border-[#FF5470]/40 bg-[#FF5470]/10 text-[#FF5470]"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            title={
              form.isHidden
                ? "Hidden from fans. Click to show."
                : "Visible to fans. Click to hide."
            }
            data-testid="button-toggle-album-hidden"
          >
            {form.isHidden ? "Hidden" : "Visible"}
          </button>
          <button
            type="button"
            onClick={() => saveAlbum.mutate(form)}
            disabled={!dirty || saveAlbum.isPending}
            className="px-4 py-1.5 text-[13px] font-medium rounded-md bg-[#319ED8] text-white hover:bg-[#319ED8]/90 disabled:opacity-40"
            data-testid="button-save-album"
          >
            {saveAlbum.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      {/* Tab strip — About | Content | People | Gear. Mirrors the
          PersonEditor pattern. People + Gear are placeholders until
          per-song writer/performer/instrument editing graduates out
          of the song-row credits sheet. */}
      <div role="tablist" aria-label="Album editor sections" className="flex gap-5 px-6 border-b border-slate-200">
        {(["about", "content", "people", "gear"] as const).map((t) => {
          const active = tab === t;
          const label = t === "about" ? "About" : t === "content" ? "Content" : t === "people" ? "People" : "Gear";
          const count = t === "content" ? (data?.songs?.length ?? 0) : undefined;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              id={`tab-admin-album-${t}`}
              aria-selected={active}
              aria-controls={`panel-admin-album-${t}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t)}
              className="relative pb-2.5 pt-3 text-[13px] font-semibold tracking-wide transition-colors"
              style={{ color: active ? "#0f172a" : "#64748b" }}
              data-testid={`tab-admin-album-${t}`}
            >
              <span className="flex items-center gap-1.5">
                {label}
                {typeof count === "number" && count > 0 && (
                  <span className="text-[11px] font-medium text-slate-400">{count}</span>
                )}
              </span>
              {active && (
                <span className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full" style={{ background: "#319ED8" }} />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      {tab === "about" && (<div role="tabpanel" id="panel-admin-album-about" aria-labelledby="tab-admin-album-about" className="space-y-6" data-testid="panel-admin-album-about">
        <Field label="Title">
          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className={inputCls}
            data-testid="input-album-title"
          />
        </Field>
        <AlbumArtistPicker
          personId={form.primaryArtistId}
          displayName={form.artist}
          onChange={({ personId, name }) => {
            // Atomic update — switch both fields in one setState so the
            // dirty flag fires once and the form never momentarily shows
            // a stale display name against a new id.
            setForm((f) => (f ? { ...f, primaryArtistId: personId, artist: name } : f));
            setDirty(true);
          }}
        />
        <Field label="Artwork">
          <ArtworkPicker
            value={form.artwork}
            onChange={(next) => set("artwork", next)}
            shape="square"
            testId="input-album-artwork"
            hint="Square. 1000×1000 px recommended (3000×3000 for a future Apple-Music-grade master). JPG or PNG. Larger uploads are fine — the player scales them down."
          />
        </Field>
        {/* Year takes the remaining flex space; Type is capped narrow because
            the longest option ("Album") is only ~5ch. */}
        <div className="grid grid-cols-[1fr_180px] gap-4">
          <Field label="Year">
            <input
              type="number"
              value={form.year ?? ""}
              onChange={(e) =>
                set(
                  "year",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
              className={inputCls}
              data-testid="input-album-year"
            />
          </Field>
          <Field label="Type">
            <select
              value={form.type}
              onChange={(e) =>
                set("type", e.target.value as "Single" | "EP" | "LP")
              }
              className={inputCls}
              data-testid="select-album-type"
            >
              <option value="Single">Single</option>
              <option value="EP">EP</option>
              <option value="LP">LP</option>
            </select>
          </Field>
        </div>
        <Field label="Genre">
          <input
            value={form.genre ?? ""}
            onChange={(e) => set("genre", e.target.value || null)}
            placeholder="Indie Rock"
            className={inputCls}
            data-testid="input-album-genre"
          />
        </Field>
        <Field label="Description">
          <textarea
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            className={inputCls + " resize-none"}
            data-testid="input-album-description"
          />
        </Field>

        <AlbumLabelPicker
          value={form.labelId}
          onChange={(next) => set("labelId", next)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Apple Music URL (album)">
            <input
              value={form.appleMusicUrl ?? ""}
              onChange={(e) => set("appleMusicUrl", e.target.value || null)}
              placeholder="https://music.apple.com/us/album/…"
              className={inputCls}
              data-testid="input-album-apple-url"
            />
          </Field>
          <Field label="Spotify URL (album)">
            <input
              value={form.spotifyUrl ?? ""}
              onChange={(e) => set("spotifyUrl", e.target.value || null)}
              placeholder="https://open.spotify.com/album/…"
              className={inputCls}
              data-testid="input-album-spotify-url"
            />
          </Field>
        </div>

        {/* GoodTunes-release toggle. Determines whether this album shows up
            in the admin Albums sidebar (the curated catalog column). Off by
            default for discography-imported rows; flip on once the album is
            being scheduled as an actual GoodTunes release. */}
        <label
          className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100"
          data-testid="label-album-is-goodtunes-release"
        >
          <input
            type="checkbox"
            checked={!!form.isGoodTunesRelease}
            onChange={(e) => set("isGoodTunesRelease", e.target.checked)}
            className="mt-0.5 h-4 w-4"
            data-testid="checkbox-album-is-goodtunes-release"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-900">GoodTunes release</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Show this album in the Albums sidebar. Leave off for albums pulled in via an artist's discography — they stay reachable from the artist profile and credits, but won't clutter the curated list.
            </div>
          </div>
        </label>

        {/* Release dates. Two-pane: the GoodTunes go-live date (when fans with
            the bundle can start listening in-app) and the streaming-release
            date (when Apple/Spotify drop). Leaving either blank means "not
            scheduled yet". The streaming date drives the "Now on streaming"
            banner once it lands — see roadmap. */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="GoodTunes release date">
            <input
              type="date"
              value={form.goodTunesReleaseDate ?? ""}
              onChange={(e) =>
                set("goodTunesReleaseDate", e.target.value || null)
              }
              className={inputCls}
              data-testid="input-album-goodtunes-release-date"
            />
          </Field>
          <Field label="Streaming release date">
            <input
              type="date"
              value={form.streamingReleaseDate ?? ""}
              onChange={(e) =>
                set("streamingReleaseDate", e.target.value || null)
              }
              className={inputCls}
              data-testid="input-album-streaming-release-date"
            />
          </Field>
        </div>
        <p className="text-[11px] text-slate-400 -mt-2">
          GoodTunes goes live first — fans with the vinyl bundle hear it in-app
          during the pre-streaming window. On the streaming date the player
          surfaces a friendly "now on Apple/Spotify" handoff so fans can listen
          however they normally do.
        </p>
        <p className="text-[11px] text-slate-400 -mt-2">
          "Listen on…" handoff. Surfaced on the album page after the in-app
          preview window. Apple Music URL is auto-filled when an album is pulled
          from an artist's discography.
        </p>
      </div>)}

      {tab === "content" && (<div role="tabpanel" id="panel-admin-album-content" aria-labelledby="tab-admin-album-content" className="space-y-6" data-testid="panel-admin-album-content">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-slate-900 text-sm font-semibold uppercase tracking-wider">
              Tracklist
            </h3>
            <button
              type="button"
              onClick={() => addSong.mutate()}
              disabled={addSong.isPending}
              className="text-[12px] text-[#319ED8] hover:underline"
              data-testid="button-add-song"
            >
              + Add song
            </button>
          </div>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            {(data?.songs ?? []).map((s) => (
              <SongRow
                key={s.id}
                song={s}
                onSave={(patch) => updateSong.mutate({ id: s.id, patch })}
                onDelete={() => {
                  if (confirm(`Delete "${s.title}"?`)) deleteSong.mutate(s.id);
                }}
                isDragging={dragId === s.id}
                isDropTarget={dropBeforeId === s.id && dragId !== s.id}
                onDragStart={handleDragStart(s.id)}
                onDragOver={handleDragOver(s.id)}
                onDrop={handleDrop(s.id)}
                onDragEnd={handleDragEnd}
              />
            ))}
            {(data?.songs ?? []).length === 0 && (
              <div className="px-4 py-6 text-center text-slate-400 text-sm">
                No songs yet.
              </div>
            )}
          </div>
        </div>

        {/* Bonus content — videos + photos. Admin always sees these sections
            (so they can add to an empty album); fans only see them when the
            arrays are non-empty (handled in AlbumDetail). */}
        <AlbumVideosSection albumId={albumId} />
        <AlbumPhotosSection albumId={albumId} />
      </div>)}

      {tab === "people" && (<div role="tabpanel" id="panel-admin-album-people" aria-labelledby="tab-admin-album-people" className="space-y-4" data-testid="panel-admin-album-people">
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-6">
          <h3 className="text-slate-900 text-sm font-semibold mb-1">Songwriters &amp; performers</h3>
          <p className="text-slate-500 text-[13px] leading-relaxed">
            Per-song writers (composer / lyricist / producer) and performers
            are configured today from each song row in the <button type="button" onClick={() => setTab("content")} className="text-[#319ED8] hover:underline">Content</button> tab.
            An album-level roll-up — with writer splits — lands here next.
          </p>
        </div>
      </div>)}

      {tab === "gear" && (<div role="tabpanel" id="panel-admin-album-gear" aria-labelledby="tab-admin-album-gear" className="space-y-4" data-testid="panel-admin-album-gear">
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-6">
          <h3 className="text-slate-900 text-sm font-semibold mb-1">Gear used on this album</h3>
          <p className="text-slate-500 text-[13px] leading-relaxed">
            Instruments are attached to each performer credit on a per-song
            basis (see the credits sheet inside each row in the <button type="button" onClick={() => setTab("content")} className="text-[#319ED8] hover:underline">Content</button> tab).
            An album-level "all gear on this record" summary lands here next.
          </p>
        </div>
      </div>)}
      </div>
    </div>
  );
}

// Shared upload helper for video files.
//
// Music-video files routinely run past 50MB, which is above Replit's
// inbound proxy body cap (~32MB), so a normal multipart POST to our
// Express route fails with 413 before the request ever reaches our
// handler. To dodge that, we use a three-step direct-to-storage flow:
//
//   1. POST /api/admin/upload-video/sign  → server mints a signed PUT
//      URL pointing straight at Google Cloud Storage.
//   2. Browser PUTs the raw bytes directly to GCS (no proxy in the
//      middle, no size cap on our side, progress streamed via XHR).
//   3. POST /api/admin/upload-video/finalize → server flips ACL to
//      public and returns the /objects/uploads/<id> URL.
//
// `onProgress` is optional; callers that want a percent indicator can
// pass it and we'll forward XHR upload progress as 0–1.
async function uploadVideoFile(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const token = getAuthToken();
  if (!token) throw new Error("Sign out and back in — your session token is missing.");

  // 1. Sign
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

  // 2. PUT directly to GCS. Use XHR (not fetch) so we get upload
  // progress events — fetch's `ReadableStream` upload progress is still
  // not broadly supported across browsers.
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

  // 3. Finalize (flip ACL to public)
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

// Shared upload helper for audio files (per-song MP3/M4A/WAV/FLAC).
// Routes through the dedicated `/api/admin/upload-audio` endpoint, which
// has a 150MB cap and an audio-only MIME whitelist — distinct from the
// 8MB image route and the 200MB video route.
async function uploadAudioFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const token = getAuthToken();
  if (!token) throw new Error("Sign out and back in — your session token is missing.");
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

// Same helper but for the image-upload route (poster frames + photos).
async function uploadImageFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const token = getAuthToken();
  if (!token) throw new Error("Sign out and back in — your session token is missing.");
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

interface AdminAlbumVideo {
  id: string;
  albumId: string;
  title: string;
  videoUrl: string;
  posterUrl: string | null;
  position: number;
}

function AlbumVideosSection({ albumId }: { albumId: string }) {
  const queryClient = useQueryClient();
  const { data: videos = [] } = useQuery<AdminAlbumVideo[]>({
    queryKey: ["/api/albums", albumId, "videos"],
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "videos"] });

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAddVideo(file: File) {
    setErr(null);
    setBusy(true);
    setProgress(0);
    try {
      const url = await uploadVideoFile(file, (f) =>
        setProgress(Math.min(0.99, f)),
      );
      await apiRequest("POST", `/api/admin/albums/${albumId}/videos`, {
        videoUrl: url,
        title: file.name.replace(/\.[^.]+$/, "") || "Untitled video",
      });
      invalidate();
    } catch (e: any) {
      setErr(e.message || "Upload failed");
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const updateVideo = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AdminAlbumVideo> }) => {
      const res = await apiRequest("PUT", `/api/admin/album-videos/${id}`, patch);
      return res.json();
    },
    onSuccess: invalidate,
  });
  const deleteVideo = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/album-videos/${id}`);
    },
    onSuccess: invalidate,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-slate-900 text-sm font-semibold uppercase tracking-wider">
          Music videos
        </h3>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="text-[12px] text-[#319ED8] hover:underline disabled:opacity-50"
          data-testid="button-add-album-video"
        >
          {busy
            ? progress !== null
              ? `Uploading… ${Math.round(progress * 100)}%`
              : "Uploading…"
            : "+ Upload video"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleAddVideo(f);
          }}
        />
      </div>
      {err && <p className="text-[12px] text-red-600 mb-2">{err}</p>}
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        {videos.length === 0 && (
          <div className="px-4 py-6 text-center text-slate-400 text-sm">
            No videos yet. Upload an MP4 to add a "Music Videos" section to the album.
          </div>
        )}
        {videos.map((v) => (
          <div
            key={v.id}
            className="flex items-start gap-3 p-3 border-b border-slate-100 last:border-b-0"
            data-testid={`row-album-video-${v.id}`}
          >
            <video
              src={v.videoUrl}
              poster={v.posterUrl ?? undefined}
              className="w-28 h-16 bg-slate-100 rounded object-cover flex-shrink-0"
              controls
              preload="metadata"
            />
            <div className="flex-1 min-w-0 space-y-2">
              <input
                type="text"
                defaultValue={v.title}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (val && val !== v.title) updateVideo.mutate({ id: v.id, patch: { title: val } });
                }}
                className={inputCls}
                data-testid={`input-album-video-title-${v.id}`}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/png,image/jpeg,image/webp";
                    input.onchange = async () => {
                      const f = input.files?.[0];
                      if (!f) return;
                      try {
                        const url = await uploadImageFile(f);
                        updateVideo.mutate({ id: v.id, patch: { posterUrl: url } });
                      } catch (e: any) {
                        setErr(e.message || "Poster upload failed");
                      }
                    };
                    input.click();
                  }}
                  className="px-3 py-1.5 text-[12px] rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                  data-testid={`button-album-video-poster-${v.id}`}
                >
                  {v.posterUrl ? "Change poster" : "Add poster"}
                </button>
                {v.posterUrl && (
                  <button
                    type="button"
                    onClick={() => updateVideo.mutate({ id: v.id, patch: { posterUrl: null as any } })}
                    className="px-2 py-1.5 text-[12px] text-slate-500 hover:text-red-600"
                  >
                    Remove poster
                  </button>
                )}
                <span className="text-[11px] text-slate-400">
                  16:9 still. 1280×720 px recommended (1920×1080 retina). JPG, PNG, or WebP.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete "${v.title}"?`)) deleteVideo.mutate(v.id);
                  }}
                  className="ml-auto px-2 py-1.5 text-[12px] text-red-600 hover:underline"
                  data-testid={`button-delete-album-video-${v.id}`}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface AdminAlbumPhoto {
  id: string;
  albumId: string;
  photoUrl: string;
  caption: string | null;
  position: number;
}

function AlbumPhotosSection({ albumId }: { albumId: string }) {
  const queryClient = useQueryClient();
  const { data: photos = [] } = useQuery<AdminAlbumPhoto[]>({
    queryKey: ["/api/albums", albumId, "photos"],
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "photos"] });

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAddPhoto(file: File) {
    setErr(null);
    setBusy(true);
    try {
      const url = await uploadImageFile(file);
      await apiRequest("POST", `/api/admin/albums/${albumId}/photos`, { photoUrl: url });
      invalidate();
    } catch (e: any) {
      setErr(e.message || "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const updatePhoto = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AdminAlbumPhoto> }) => {
      const res = await apiRequest("PUT", `/api/admin/album-photos/${id}`, patch);
      return res.json();
    },
    onSuccess: invalidate,
  });
  const deletePhoto = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/album-photos/${id}`);
    },
    onSuccess: invalidate,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-slate-900 text-sm font-semibold uppercase tracking-wider">
          Photos
        </h3>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="text-[12px] text-[#319ED8] hover:underline disabled:opacity-50"
          data-testid="button-add-album-photo"
        >
          {busy ? "Uploading…" : "+ Upload photo"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleAddPhoto(f);
          }}
        />
      </div>
      <p className="text-[11px] text-slate-400 mb-2">
        Square. 1200×1200 px recommended (2400×2400 retina). JPG, PNG, WebP, or GIF.
      </p>
      {err && <p className="text-[12px] text-red-600 mb-2">{err}</p>}
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        {photos.length === 0 && (
          <div className="px-4 py-6 text-center text-slate-400 text-sm">
            No photos yet. Upload an image to add a "Photos" section to the album.
          </div>
        )}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3">
            {photos.map((p) => (
              <div
                key={p.id}
                className="space-y-1.5"
                data-testid={`tile-album-photo-${p.id}`}
              >
                <img
                  src={p.photoUrl}
                  alt={p.caption ?? ""}
                  className="w-full aspect-square object-cover rounded-md border border-slate-200"
                />
                <input
                  type="text"
                  defaultValue={p.caption ?? ""}
                  placeholder="Caption (optional)"
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val !== (p.caption ?? "")) updatePhoto.mutate({ id: p.id, patch: { caption: val || (null as any) } });
                  }}
                  className={`${inputCls} text-[12px]`}
                  data-testid={`input-album-photo-caption-${p.id}`}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Delete this photo?")) deletePhoto.mutate(p.id);
                  }}
                  className="text-[11px] text-red-600 hover:underline"
                  data-testid={`button-delete-album-photo-${p.id}`}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface AdminTrackWriter {
  id: string;
  songId: string;
  personId: string | null;
  name: string;
  role: string;
  position: number;
}
interface AdminTrackPerformer {
  id: string;
  songId: string;
  personId: string | null;
  instrumentId: string | null;
  name: string;
  role: string;
  tuningNotes: string | null;
  position: number;
}
interface SongCredits {
  // Enriched shape — server resolves person + instrument so the fan-side
  // credits sheet can render from a single GET. The admin editor only
  // touches the flat row fields and ignores the joined objects.
  writers: (AdminTrackWriter & { person: AdminPerson | null })[];
  performers: (AdminTrackPerformer & {
    person: AdminPerson | null;
    instrument: (AdminInstrument & { vendors: any[] }) | null;
  })[];
}

interface AdminCreditRole {
  id: string;
  kind: "writer" | "performer";
  name: string;
}

// Unified credit row — one shape covering both writer and performer rows
// in the merged list. `kind` reflects whichever backend table the row
// currently lives in; flipping it in the role picker triggers a
// delete-then-create migration on save.
type UnifiedCredit = {
  kind: "writer" | "performer";
  id: string;
  songId: string;
  personId: string | null;
  name: string;
  role: string;
  position: number;
  person: AdminPerson | null;
  // Performer-only fields. Left null/undefined for writer rows.
  instrumentId?: string | null;
  tuningNotes?: string | null;
  instrument?: (AdminInstrument & { vendors: any[] }) | null;
};

function SongCreditsEditor({ songId }: { songId: string }) {
  const queryClient = useQueryClient();
  const { data: credits } = useQuery<SongCredits>({
    queryKey: ["/api/songs", songId, "credits"],
  });
  const { data: people = [] } = useQuery<AdminPerson[]>({
    queryKey: ["/api/people"],
  });
  const { data: instruments = [] } = useQuery<AdminInstrument[]>({
    queryKey: ["/api/instruments"],
  });
  const { data: roles = [] } = useQuery<AdminCreditRole[]>({
    queryKey: ["/api/admin/credit-roles"],
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["/api/songs", songId, "credits"],
    });
  const invalidatePeople = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/people"] });

  // Default new credit = writer + Composer, blank name. The row appears in
  // the list immediately; the admin then picks a person from the picker.
  const addCredit = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/admin/songs/${songId}/writers`,
        { name: "", role: "Composer" },
      );
      return res.json();
    },
    onSuccess: invalidate,
  });

  if (!credits)
    return <div className="text-slate-400 text-xs py-2">Loading credits…</div>;

  // Writers first, then performers. Each list is already server-sorted by
  // position; we surface them in that order without resorting.
  const unified: UnifiedCredit[] = [
    ...credits.writers.map<UnifiedCredit>((w) => ({
      kind: "writer",
      id: w.id,
      songId: w.songId,
      personId: w.personId,
      name: w.name,
      role: w.role,
      position: w.position,
      person: w.person,
    })),
    ...credits.performers.map<UnifiedCredit>((p) => ({
      kind: "performer",
      id: p.id,
      songId: p.songId,
      personId: p.personId,
      name: p.name,
      role: p.role,
      position: p.position,
      person: p.person,
      instrumentId: p.instrumentId,
      tuningNotes: p.tuningNotes,
      instrument: p.instrument,
    })),
  ];

  return (
    <div className="space-y-2 pt-2">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-slate-500 text-[11px] uppercase tracking-wider">
          Credits{" "}
          <span className="text-slate-300 ml-1">({unified.length})</span>
        </h4>
        <button
          type="button"
          onClick={() => addCredit.mutate()}
          disabled={addCredit.isPending}
          className="text-[11px] text-[#319ED8] hover:underline disabled:opacity-40"
          data-testid={`button-add-credit-${songId}`}
        >
          + Credit
        </button>
      </div>
      <div className="space-y-1">
        {unified.map((row) => (
          <CreditRow
            key={`${row.kind}-${row.id}`}
            songId={songId}
            row={row}
            people={people}
            instruments={instruments}
            roles={roles}
            onChanged={invalidate}
            onPersonCreated={invalidatePeople}
          />
        ))}
        {unified.length === 0 && (
          <p className="text-slate-300 text-xs">No credits yet.</p>
        )}
      </div>
    </div>
  );
}

function CreditRow({
  songId,
  row,
  people,
  instruments,
  roles,
  onChanged,
  onPersonCreated,
}: {
  songId: string;
  row: UnifiedCredit;
  people: AdminPerson[];
  instruments: AdminInstrument[];
  roles: AdminCreditRole[];
  onChanged: () => void;
  onPersonCreated: () => void;
}) {
  const { draft, setDraft, dirty, snapshot } = useRowDraft(row);

  // Save dispatches based on whether kind changed. Same-kind = PUT in
  // place. Cross-kind = create a fresh row in the other table, then
  // delete the original — server treats the two tables as independent.
  const save = useMutation({
    mutationFn: async () => {
      const s = snapshot();
      const sameKind = s.kind === row.kind;
      if (sameKind) {
        const url =
          s.kind === "writer"
            ? `/api/admin/writers/${row.id}`
            : `/api/admin/performers/${row.id}`;
        const body: any = {
          personId: s.personId,
          name: s.name,
          role: s.role,
        };
        if (s.kind === "performer") {
          body.instrumentId = s.instrumentId ?? null;
          body.tuningNotes = s.tuningNotes ?? null;
        }
        await apiRequest("PUT", url, body);
        return;
      }
      // Kind changed — create on the new table, then delete the old.
      const createUrl =
        s.kind === "writer"
          ? `/api/admin/songs/${songId}/writers`
          : `/api/admin/songs/${songId}/performers`;
      const createBody: any = {
        personId: s.personId,
        name: s.name,
        role: s.role,
      };
      if (s.kind === "performer") {
        createBody.instrumentId = s.instrumentId ?? null;
        createBody.tuningNotes = s.tuningNotes ?? null;
      }
      await apiRequest("POST", createUrl, createBody);
      const deleteUrl =
        row.kind === "writer"
          ? `/api/admin/writers/${row.id}`
          : `/api/admin/performers/${row.id}`;
      await apiRequest("DELETE", deleteUrl);
    },
    onSuccess: onChanged,
  });
  const del = useMutation({
    mutationFn: async () => {
      const url =
        row.kind === "writer"
          ? `/api/admin/writers/${row.id}`
          : `/api/admin/performers/${row.id}`;
      await apiRequest("DELETE", url);
    },
    onSuccess: onChanged,
  });

  const selectedPerson =
    people.find((p) => p.id === draft.personId) ?? draft.person;
  const selectedInstrument =
    draft.kind === "performer"
      ? instruments.find((i) => i.id === draft.instrumentId) ?? null
      : null;

  return (
    <div
      className="rounded-md border border-slate-200 bg-white p-2 space-y-2"
      data-testid={`row-credit-${row.kind}-${row.id}`}
    >
      <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-start">
        <PersonPicker
          people={people}
          value={selectedPerson ?? null}
          fallbackName={draft.name}
          onChange={(p) => {
            setDraft({
              ...draft,
              personId: p?.id ?? null,
              name: p?.name ?? draft.name,
              person: p,
            });
          }}
          onCreated={(p) => {
            onPersonCreated();
            setDraft({
              ...draft,
              personId: p.id,
              name: p.name,
              person: p,
            });
          }}
        />
        <RolePicker
          roles={roles}
          kind={draft.kind}
          role={draft.role}
          onChange={(kind, role) => {
            // Preserve performer-only fields in the draft when toggling to
            // writer so flipping back ("oops, wrong kind") restores the
            // gear selection. They're only sent to the server on save
            // when kind === "performer".
            setDraft({ ...draft, kind, role });
          }}
        />
        <button
          type="button"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          className="px-2 py-1 rounded bg-[#319ED8] text-white text-[11px] disabled:opacity-40"
          data-testid={`button-save-credit-${row.id}`}
        >
          {save.isPending ? "…" : "Save"}
        </button>
        <button
          type="button"
          disabled={del.isPending}
          onClick={() => {
            if (confirm("Delete this credit?")) del.mutate();
          }}
          className="px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 rounded disabled:opacity-40"
          data-testid={`button-delete-credit-${row.id}`}
        >
          ×
        </button>
      </div>
      {draft.kind === "performer" && (
        <div className="grid grid-cols-[2fr_1fr] gap-2 items-center">
          <InstrumentPicker
            instruments={instruments}
            value={selectedInstrument}
            onChange={(i) =>
              setDraft({ ...draft, instrumentId: i?.id ?? null })
            }
            onCreated={(i) =>
              setDraft({ ...draft, instrumentId: i.id })
            }
          />
          <input
            value={draft.tuningNotes ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                tuningNotes: e.target.value || null,
              })
            }
            placeholder="DADGAD, capo 3…"
            className={inputCls + " py-1 text-xs"}
            data-testid={`input-tuning-${row.id}`}
          />
        </div>
      )}
    </div>
  );
}

// Labels-style searchable Person combobox. Mirrors InstrumentPicker —
// search, pick, or create-inline. When a row already has a person, shows
// a compact card with a Change button; otherwise shows the search input.
function PersonPicker({
  people,
  value,
  fallbackName,
  onChange,
  onCreated,
}: {
  people: AdminPerson[];
  value: AdminPerson | null;
  fallbackName: string;
  onChange: (p: AdminPerson | null) => void;
  onCreated: (p: AdminPerson) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const matches = (() => {
    if (!query.trim()) return people.slice(0, 25);
    const q = query.toLowerCase();
    return people.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 25);
  })();

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setCreateErr("Name is required.");
      return;
    }
    setCreateBusy(true);
    setCreateErr(null);
    try {
      const res = await apiRequest("POST", "/api/admin/people", { name });
      const created = (await res.json()) as AdminPerson;
      onCreated(created);
      setCreating(false);
      setOpen(false);
      setQuery("");
      setNewName("");
    } catch (e: any) {
      setCreateErr(e?.message || "Create failed");
    } finally {
      setCreateBusy(false);
    }
  }

  if (value && !creating) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"
        data-testid="display-selected-person"
      >
        <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
          {value.photoUrl ? (
            <img
              src={value.photoUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : null}
        </div>
        <p className="flex-1 min-w-0 text-slate-900 text-[12px] truncate">
          {value.name}
        </p>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-[11px] text-slate-500 hover:text-slate-800"
          data-testid="button-change-person"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative" data-testid="combobox-person">
      {!creating ? (
        <>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={
              fallbackName
                ? `Search people… (was "${fallbackName}")`
                : "Search people…"
            }
            className={inputCls + " py-1.5 text-xs"}
            data-testid="input-person-search"
          />
          {open && (
            <div className="absolute z-10 left-0 right-0 mt-1 rounded-md border border-slate-200 bg-white shadow-lg max-h-64 overflow-y-auto">
              {matches.length === 0 && (
                <p className="px-3 py-2 text-slate-400 text-[12px]">
                  No matches.
                </p>
              )}
              {matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(p);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 text-left"
                  data-testid={`option-person-${p.id}`}
                >
                  <div className="w-6 h-6 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
                    {p.photoUrl ? (
                      <img
                        src={p.photoUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>
                  <span className="flex-1 min-w-0 text-slate-900 text-[12px] truncate">
                    {p.name}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setNewName(query);
                  setCreating(true);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 border-t border-slate-100 text-[12px] text-[#319ED8] hover:bg-slate-50"
                data-testid="button-create-new-person"
              >
                + Create new person{query.trim() ? ` "${query.trim()}"` : ""}
              </button>
            </div>
          )}
        </>
      ) : (
        <div
          className="rounded-md border border-slate-200 bg-white p-2 space-y-2"
          data-testid="form-new-person"
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Person name"
            className={inputCls + " py-1.5 text-xs"}
            data-testid="input-new-person-name"
          />
          {createErr && (
            <p className="text-red-600 text-[11px]">{createErr}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setCreateErr(null);
              }}
              className="text-[11px] text-slate-500 hover:text-slate-800 px-2 py-1"
              data-testid="button-cancel-new-person"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={createBusy}
              onClick={handleCreate}
              className="px-2.5 py-1 text-[11px] rounded bg-[#319ED8] text-white font-medium disabled:opacity-40"
              data-testid="button-save-new-person"
            >
              {createBusy ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Flat searchable role list combining writer + performer kinds. Each
// option carries its kind so picking flips the parent row's `kind`,
// revealing the gear picker for performers. Creates new roles inline
// via POST /api/admin/credit-roles; defaults to writer kind for free
// text the admin types (they can flip with the kind toggle below).
function RolePicker({
  roles,
  kind,
  role,
  onChange,
}: {
  roles: AdminCreditRole[];
  kind: "writer" | "performer";
  role: string;
  onChange: (kind: "writer" | "performer", role: string) => void;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"writer" | "performer">("writer");
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const matches = (() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? roles.filter((r) => r.name.toLowerCase().includes(q))
      : roles;
    // Writers first then performers, alphabetical within each kind.
    return filtered.slice().sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "writer" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  })();

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setCreateErr("Role name is required.");
      return;
    }
    setCreateBusy(true);
    setCreateErr(null);
    try {
      const res = await apiRequest("POST", "/api/admin/credit-roles", {
        kind: newKind,
        name,
      });
      const created = (await res.json()) as AdminCreditRole;
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/credit-roles"],
      });
      onChange(created.kind, created.name);
      setCreating(false);
      setOpen(false);
      setQuery("");
      setNewName("");
    } catch (e: any) {
      setCreateErr(e?.message || "Create failed");
    } finally {
      setCreateBusy(false);
    }
  }

  if (creating) {
    return (
      <div
        className="rounded-md border border-slate-200 bg-white p-2 space-y-2"
        data-testid="form-new-role"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Role name (e.g. Engineer)"
          className={inputCls + " py-1.5 text-xs"}
          data-testid="input-new-role-name"
        />
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-500">Kind:</span>
          <button
            type="button"
            onClick={() => setNewKind("writer")}
            className={`px-2 py-0.5 rounded ${newKind === "writer" ? "bg-[#319ED8] text-white" : "bg-slate-100 text-slate-600"}`}
            data-testid="button-new-role-kind-writer"
          >
            Writer
          </button>
          <button
            type="button"
            onClick={() => setNewKind("performer")}
            className={`px-2 py-0.5 rounded ${newKind === "performer" ? "bg-[#319ED8] text-white" : "bg-slate-100 text-slate-600"}`}
            data-testid="button-new-role-kind-performer"
          >
            Performer
          </button>
        </div>
        {createErr && <p className="text-red-600 text-[11px]">{createErr}</p>}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setCreateErr(null);
            }}
            className="text-[11px] text-slate-500 hover:text-slate-800 px-2 py-1"
            data-testid="button-cancel-new-role"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={createBusy}
            onClick={handleCreate}
            className="px-2.5 py-1 text-[11px] rounded bg-[#319ED8] text-white font-medium disabled:opacity-40"
            data-testid="button-save-new-role"
          >
            {createBusy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" data-testid="combobox-role">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          inputCls +
          " py-1.5 text-xs text-left flex items-center justify-between gap-2"
        }
        data-testid="button-role-current"
      >
        <span className="truncate">
          {role || <span className="text-slate-400">Select role…</span>}
        </span>
        <span
          className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${kind === "writer" ? "bg-[#7F10A7]/10 text-[#7F10A7]" : "bg-[#319ED8]/10 text-[#319ED8]"}`}
        >
          {kind}
        </span>
      </button>
      {open && (
        <div className="absolute z-10 left-0 right-0 mt-1 rounded-md border border-slate-200 bg-white shadow-lg max-h-64 overflow-y-auto">
          <div className="p-1 sticky top-0 bg-white border-b border-slate-100">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search roles…"
              className={inputCls + " py-1 text-xs"}
              autoFocus
              data-testid="input-role-search"
            />
          </div>
          {matches.length === 0 && (
            <p className="px-3 py-2 text-slate-400 text-[12px]">No matches.</p>
          )}
          {matches.map((r) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(r.kind, r.name);
                setOpen(false);
                setQuery("");
              }}
              className="w-full flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-slate-50 text-left"
              data-testid={`option-role-${r.id}`}
            >
              <span className="text-slate-900 text-[12px] truncate">
                {r.name}
              </span>
              <span
                className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${r.kind === "writer" ? "bg-[#7F10A7]/10 text-[#7F10A7]" : "bg-[#319ED8]/10 text-[#319ED8]"}`}
              >
                {r.kind}
              </span>
            </button>
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setNewName(query);
              setNewKind(kind);
              setCreating(true);
              setOpen(false);
            }}
            className="w-full text-left px-3 py-2 border-t border-slate-100 text-[12px] text-[#319ED8] hover:bg-slate-50"
            data-testid="button-create-new-role"
          >
            + Create new role{query.trim() ? ` "${query.trim()}"` : ""}
          </button>
        </div>
      )}
    </div>
  );
}

// Shared dirty-tracking hook. Resets the local draft from the server row
// only when the user has no unsaved edits — prevents a background refetch
// from clobbering whatever they're typing. Returns a payload snapshot so
// rapid-fire saves use the exact bytes that were on screen at click time.
function useRowDraft<T extends { id: string }>(row: T) {
  const [draft, setDraft] = useState<T>(row);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dirtyRef = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(row);
  dirtyRef.current = dirty;
  useEffect(() => {
    // Only adopt fresh server state when the user has nothing in-flight.
    if (!dirtyRef.current) setDraft(row);
  }, [JSON.stringify(row)]);
  return { draft, setDraft, dirty, snapshot: () => draftRef.current };
}

function SongRow({
  song,
  onSave,
  onDelete,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  song: AdminSong;
  onSave: (p: Partial<AdminSong>) => void;
  onDelete: () => void;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(song);
  // Surface VTT-parse / audio-upload errors inline rather than via
  // window.alert so the admin can fix the file without losing context.
  // Cleared on each new file pick or when the editor reopens.
  const [vttError, setVttError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioUploading, setAudioUploading] = useState(false);
  // dragOver targets — used to highlight the drop zone the file is over.
  const [audioDragOver, setAudioDragOver] = useState(false);
  const [vttDragOver, setVttDragOver] = useState(false);
  const vttInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(
    () => {
      setDraft(song);
      // Reset transient UI state alongside the draft so stale errors,
      // upload spinners, or drag-over highlights from one song don't
      // bleed into the next when the prop identity changes.
      setVttError(null);
      setAudioError(null);
      setAudioUploading(false);
      setAudioDragOver(false);
      setVttDragOver(false);
    },
    [
      song.id,
      song.title,
      song.lyrics,
      song.trackNumber,
      song.duration,
      song.audioUrl,
      // Including the cue array in the dep list so a save-then-reopen
      // re-syncs the preview to whatever the server actually stored.
      JSON.stringify(song.syncedLyrics ?? null),
    ],
  );
  // Clear inline errors whenever the editor is reopened — admins expect
  // a fresh state on each Edit click, not a leftover red message from
  // an earlier failed upload.
  useEffect(() => {
    if (open) {
      setVttError(null);
      setAudioError(null);
    }
  }, [open]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(song);

  const handleVttFile = async (file: File) => {
    setVttError(null);
    // Defensive — drag-drop doesn't enforce `accept`, only the file input
    // does. Reject anything that isn't plausibly a VTT file by extension
    // before we try to parse, so we don't get a confusing "no cues found"
    // error from, say, an MP3 dropped on the wrong zone.
    if (!/\.vtt$/i.test(file.name) && file.type && file.type !== "text/vtt") {
      setVttError("That doesn't look like a .vtt file.");
      return;
    }
    try {
      const text = await file.text();
      const { parseVtt } = await import("@/lib/vttParser");
      const cues = parseVtt(text);
      if (cues.length === 0) {
        setVttError("No cues found. Make sure this is a WebVTT (.vtt) file.");
        return;
      }
      setDraft((d) => ({ ...d, syncedLyrics: cues }));
    } catch (e: any) {
      setVttError(e?.message || "Couldn't read the file.");
    }
  };

  const handleAudioFile = async (file: File) => {
    setAudioError(null);
    // Same defensive check as VTT — drag-drop bypasses `accept`. Reject
    // anything whose MIME doesn't look like audio so we fail fast with a
    // clearer message than the server's MIME-whitelist error.
    if (file.type && !file.type.startsWith("audio/")) {
      setAudioError("That doesn't look like an audio file.");
      return;
    }
    setAudioUploading(true);
    try {
      const url = await uploadAudioFile(file);
      setDraft((d) => ({ ...d, audioUrl: url }));
    } catch (e: any) {
      setAudioError(e?.message || "Upload failed.");
    } finally {
      setAudioUploading(false);
    }
  };

  return (
    <div
      className={
        "border-b border-slate-200 last:border-b-0 transition-opacity " +
        (isDragging ? "opacity-40 " : "") +
        (isDropTarget ? "border-t-2 border-t-[#319ED8] " : "")
      }
      // Row-level drag wiring. The whole row is draggable so the user can
      // grab anywhere along the resting (un-expanded) bar; the open-edit
      // panel below sits outside this listener so its inputs still work.
      draggable={!open}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50">
        {/* Grip handle — visually signals draggability. Drag events are
            wired on the parent row so grabbing anywhere on the bar works,
            but this icon gives the user a clear target. */}
        <span
          className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing flex-shrink-0"
          aria-hidden="true"
          data-testid={`grip-song-${song.id}`}
          title="Drag to reorder"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </span>
        <span className="text-slate-400 text-xs w-6 text-right">
          {song.trackNumber}
        </span>
        <span
          className="flex-1 text-slate-900 text-sm truncate"
          data-testid={`text-song-${song.id}`}
        >
          {song.title}
        </span>
        <span className="text-slate-400 text-xs tabular-nums">
          {fmtDuration(song.duration)}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[12px] text-[#319ED8] hover:underline"
          data-testid={`button-edit-song-${song.id}`}
        >
          {open ? "Close" : "Edit"}
        </button>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 bg-white">
          <div className="grid grid-cols-[1fr_80px_80px] gap-2">
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Title"
              className={inputCls}
            />
            <input
              type="number"
              value={draft.trackNumber}
              onChange={(e) =>
                setDraft({ ...draft, trackNumber: Number(e.target.value) })
              }
              className={inputCls}
              title="Track #"
            />
            <input
              type="number"
              value={draft.duration}
              onChange={(e) =>
                setDraft({ ...draft, duration: Number(e.target.value) })
              }
              className={inputCls}
              title="Duration (s)"
            />
          </div>
          {/* Audio source — drop an MP3/M4A/WAV/FLAC, browse to one, or
              paste a URL. Upload routes through /api/admin/upload-audio
              and lands the song at /objects/uploads/<id>.<ext>. */}
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setAudioDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setAudioDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setAudioDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setAudioDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleAudioFile(f);
            }}
            className={
              "rounded-md border px-3 py-2.5 space-y-1.5 transition-colors " +
              (audioDragOver
                ? "border-[#319ED8] bg-[#319ED8]/10"
                : "border-slate-200 bg-slate-50/60")
            }
          >
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 flex-1">
                Audio file
                {audioUploading && (
                  <span className="ml-1.5 text-slate-400 font-normal normal-case tracking-normal">
                    · uploading…
                  </span>
                )}
              </span>
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleAudioFile(f);
                  e.target.value = "";
                }}
                data-testid={`input-audio-${song.id}`}
              />
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                disabled={audioUploading}
                className="text-[12px] text-[#319ED8] hover:underline disabled:opacity-40"
                data-testid={`button-upload-audio-${song.id}`}
              >
                {draft.audioUrl ? "Replace file" : "Choose file"}
              </button>
              {draft.audioUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft((d) => ({ ...d, audioUrl: null }));
                    setAudioError(null);
                  }}
                  className="text-[12px] text-slate-500 hover:text-slate-700 hover:underline"
                  data-testid={`button-clear-audio-${song.id}`}
                >
                  Clear
                </button>
              )}
            </div>
            <input
              value={draft.audioUrl ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, audioUrl: e.target.value || null })
              }
              placeholder="Drop MP3/M4A/AAC/WAV/FLAC/OGG here, or paste a URL"
              className={inputCls + " text-xs"}
              data-testid={`input-audio-url-${song.id}`}
            />
            {audioError && (
              <p className="text-[11px] text-red-600" data-testid={`text-audio-error-${song.id}`}>
                {audioError}
              </p>
            )}
          </div>
          <textarea
            value={draft.lyrics ?? ""}
            onChange={(e) => setDraft({ ...draft, lyrics: e.target.value })}
            placeholder="Lyrics (use [Verse 1], [Chorus] etc. for section headers)"
            rows={6}
            className={inputCls + " resize-none font-mono text-xs"}
          />
          {/* Synced lyrics (WebVTT) — when uploaded, the Player lyrics
              overlay uses these timestamps verbatim instead of the
              evenly-distributed auto-timing it derives from the plain
              lyrics + duration. Cleared = fall back to auto. */}
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setVttDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setVttDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setVttDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setVttDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleVttFile(f);
            }}
            className={
              "rounded-md border px-3 py-2.5 space-y-1.5 transition-colors " +
              (vttDragOver
                ? "border-[#319ED8] bg-[#319ED8]/10"
                : "border-slate-200 bg-slate-50/60")
            }
          >
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 flex-1">
                Synced lyrics (WebVTT)
                {draft.syncedLyrics && draft.syncedLyrics.length > 0 && (
                  <span className="ml-1.5 text-slate-400 font-normal normal-case tracking-normal">
                    · {draft.syncedLyrics.length} cue{draft.syncedLyrics.length === 1 ? "" : "s"}
                  </span>
                )}
              </span>
              <input
                ref={vttInputRef}
                type="file"
                accept=".vtt,text/vtt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleVttFile(f);
                  // Reset value so picking the same file again re-fires onChange.
                  e.target.value = "";
                }}
                data-testid={`input-vtt-${song.id}`}
              />
              <button
                type="button"
                onClick={() => vttInputRef.current?.click()}
                className="text-[12px] text-[#319ED8] hover:underline"
                data-testid={`button-upload-vtt-${song.id}`}
              >
                {draft.syncedLyrics && draft.syncedLyrics.length > 0 ? "Replace .vtt" : "Upload .vtt"}
              </button>
              {draft.syncedLyrics && draft.syncedLyrics.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft((d) => ({ ...d, syncedLyrics: null }));
                    setVttError(null);
                  }}
                  className="text-[12px] text-slate-500 hover:text-slate-700 hover:underline"
                  data-testid={`button-clear-vtt-${song.id}`}
                >
                  Clear
                </button>
              )}
            </div>
            {draft.syncedLyrics && draft.syncedLyrics.length > 0 ? (
              <ul className="text-[11px] font-mono text-slate-600 space-y-0.5">
                {draft.syncedLyrics.slice(0, 4).map((c, i) => (
                  <li key={i} className="truncate">
                    <span className="text-slate-400">
                      {Math.floor(c.timeMs / 60000)
                        .toString()
                        .padStart(2, "0")}
                      :
                      {Math.floor((c.timeMs % 60000) / 1000)
                        .toString()
                        .padStart(2, "0")}
                      .
                      {(c.timeMs % 1000).toString().padStart(3, "0")}
                    </span>{" "}
                    {c.text}
                  </li>
                ))}
                {draft.syncedLyrics.length > 4 && (
                  <li className="text-slate-400">+ {draft.syncedLyrics.length - 4} more…</li>
                )}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-400 leading-relaxed">
                No file uploaded. Lyrics will auto-scroll using even
                distribution across the song's duration.
              </p>
            )}
            {vttError && (
              <p className="text-[11px] text-red-600" data-testid={`text-vtt-error-${song.id}`}>
                {vttError}
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onDelete}
              className="px-3 py-1 text-[12px] text-red-600 hover:bg-red-50 rounded"
              data-testid={`button-delete-song-${song.id}`}
            >
              Delete
            </button>
            <button
              type="button"
              disabled={!dirty}
              onClick={() =>
                onSave({
                  title: draft.title,
                  trackNumber: draft.trackNumber,
                  duration: draft.duration,
                  lyrics: draft.lyrics,
                  audioUrl: draft.audioUrl,
                  syncedLyrics: draft.syncedLyrics,
                })
              }
              className="px-3 py-1 text-[12px] rounded bg-[#319ED8] text-white disabled:opacity-40"
              data-testid={`button-save-song-${song.id}`}
            >
              Save song
            </button>
          </div>
          <div className="pt-3 mt-2 border-t border-slate-200">
            <SongCreditsEditor songId={song.id} />
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#319ED8] focus:ring-2 focus:ring-[#319ED8]/20 transition";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-slate-400 text-[11px] uppercase tracking-wider mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

// ---------- PersonEditor ----------

// Discography row — one pulled album from iTunes Lookup. Shows artwork +
// title + year + a status pill on the right ("In library" if we already
// have a matching album, otherwise "+ Add" which one-clicks creating it
// in GoodTunes with the right artist/year/artwork/Apple Music URL).
function DiscographyRow({
  album,
  artistName,
  personId,
  match,
  bulkPending = false,
  onAdded,
}: {
  album: ScrapedArtistAlbum;
  artistName: string;
  // Owning person — set on the created album as `primaryArtistId` so the
  // new release is linked to this profile from the moment it's created.
  personId: string;
  match: AdminAlbum | null;
  // True while a bucket-level "+ Add all" is in flight. Locks the per-row
  // "+ Add" button so the admin can't double-create against a stale match.
  bulkPending?: boolean;
  onAdded: () => void;
}) {
  const queryClient = useQueryClient();
  const add = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/albums", {
        title: album.name,
        artist: artistName,
        artwork: album.artworkUrl,
        year: album.year,
        type: album.type,
        appleMusicUrl: album.appleMusicUrl,
        primaryArtistId: personId,
      });
      const json = await res.json();
      // Refetch BEFORE resolving so `isPending` stays true until the
      // library cache reflects this create. Without the await, a rapid
      // second click can fire while `match` is still null and duplicate
      // the album.
      await queryClient.refetchQueries({ queryKey: ["/api/albums"] });
      return json;
    },
    onSuccess: () => {
      onAdded();
    },
  });
  // Inverse of `add` — DELETEs the matched library album so the pill can
  // toggle back to "+ Add". The match comes from `matchAlbum`, which gives
  // us the GoodTunes album row by title+artist; once gone, the next refetch
  // of /api/albums recomputes match=null and the row flips automatically.
  const remove = useMutation({
    mutationFn: async () => {
      if (!match) return;
      await apiRequest("DELETE", `/api/admin/albums/${match.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
    },
  });
  // Hover state on the "In library" pill — at rest it stays neutral and
  // reads "In library"; on hover it turns red and reads "Remove". Same
  // pattern the admin uses for other destructive toggles.
  const [hoverRemove, setHoverRemove] = useState(false);
  return (
    <div
      className="flex items-center gap-3 py-2"
      data-testid={`row-discography-${album.collectionId}`}
    >
      {album.artworkUrl ? (
        <img
          src={album.artworkUrl}
          alt=""
          className="w-12 h-12 rounded object-cover shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded bg-slate-200 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-slate-900 text-sm font-medium truncate">
          {album.name}
        </div>
        <div className="text-slate-400 text-[11px]">
          {[
            album.type,
            album.year,
            album.trackCount ? `${album.trackCount} tracks` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      {match ? (
        <button
          type="button"
          onClick={() => remove.mutate()}
          onMouseEnter={() => setHoverRemove(true)}
          onMouseLeave={() => setHoverRemove(false)}
          disabled={remove.isPending}
          className={
            "text-[11px] font-medium px-2 py-1 rounded transition-colors disabled:opacity-40 " +
            (hoverRemove
              ? "text-[#C8102E] bg-[#C8102E]/10"
              : "text-[#319ED8] bg-[#319ED8]/10")
          }
          data-testid={`button-remove-album-${album.collectionId}`}
          aria-label={`Remove ${album.name} from library`}
        >
          {remove.isPending ? "Removing…" : hoverRemove ? "Remove" : "In library"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => add.mutate()}
          disabled={add.isPending || bulkPending}
          className="text-[12px] text-[#319ED8] font-medium hover:underline disabled:opacity-40"
          data-testid={`button-add-album-${album.collectionId}`}
        >
          {add.isPending ? "Adding…" : bulkPending ? "…" : "+ Add"}
        </button>
      )}
    </div>
  );
}

// ---------- PersonGearManager (admin Gear tab on the Person editor) ----------
//
// Full read+write surface for everything in the SuperCredits "performer"
// table that's anchored on this person. The fan-side Gear tab is a flat
// derived list (distinct instruments + per-instrument track counts); this
// admin version is the editor for the rows that produce that list.
//
// Two flows live here:
//   1) "+ Add gear": pick an instrument (search the existing catalog, or
//      create a new minimal one inline with name + category), pick one or
//      more tracks from this artist's albums (their primary-artist
//      catalog plus any album they already have credits on), set a role
//      + optional tuning notes, save → fans out one performer row per
//      selected track.
//   2) Existing gear rows: each gear row is clickable; expanded view
//      shows every track that row is credited on with a per-track ✕ to
//      delete that single performer row (i.e. "they didn't actually play
//      this on Track 5"). A row that ends up with zero tracks disappears.
//
// Data sources:
//   - GET /api/admin/people/:id/gear-context   (admin-only, full bundle)
//   - GET /api/instruments                     (existing list, for typeahead)
//   - POST /api/admin/instruments              (create-new path)
//   - POST /api/admin/songs/:id/performers     (one call per track on save)
//   - DELETE /api/admin/performers/:id         (per-track row delete)
type GearContextAlbum = {
  albumId: string;
  albumTitle: string;
  albumArtwork: string;
  albumYear: number | null;
  tracks: Array<{
    songId: string;
    title: string;
    trackNumber: number;
    performers: Array<{
      id: string;
      instrumentId: string | null;
      instrumentName: string | null;
      instrumentPhotoUrl: string | null;
      role: string;
      tuningNotes: string | null;
    }>;
  }>;
};

function PersonGearManager({
  personId,
  personName,
}: {
  personId: string;
  personName: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: context = [], isLoading } = useQuery<GearContextAlbum[]>({
    queryKey: ["/api/admin/people", personId, "gear-context"],
  });
  const { data: instruments = [] } = useQuery<AdminInstrument[]>({
    queryKey: ["/api/instruments"],
  });

  // Re-derive the read-only "rows" the fan-side gear tab also shows:
  // one entry per distinct instrumentId this person has credits on, with
  // the list of (performerId, songId, song title, track number, album)
  // attached so we can render per-track delete affordances.
  type GearRow = {
    instrumentId: string;
    instrumentName: string;
    instrumentPhotoUrl: string | null;
    instrumentCategory: string | null;
    tracks: Array<{
      performerId: string;
      songId: string;
      songTitle: string;
      trackNumber: number;
      albumId: string;
      albumTitle: string;
      role: string;
    }>;
  };
  const gearRows: GearRow[] = (() => {
    const byInst = new Map<string, GearRow>();
    for (const a of context) {
      for (const t of a.tracks) {
        for (const p of t.performers) {
          if (!p.instrumentId) continue; // role-only credits hidden here
          const inst = instruments.find((i) => i.id === p.instrumentId);
          const key = p.instrumentId;
          const row =
            byInst.get(key) ??
            ({
              instrumentId: key,
              instrumentName: p.instrumentName ?? inst?.name ?? "Instrument",
              instrumentPhotoUrl: p.instrumentPhotoUrl ?? inst?.photoUrl ?? null,
              instrumentCategory: inst?.shortCategory ?? inst?.category ?? null,
              tracks: [],
            } satisfies GearRow);
          row.tracks.push({
            performerId: p.id,
            songId: t.songId,
            songTitle: t.title,
            trackNumber: t.trackNumber,
            albumId: a.albumId,
            albumTitle: a.albumTitle,
            role: p.role,
          });
          byInst.set(key, row);
        }
      }
    }
    return Array.from(byInst.values()).sort(
      (a, b) =>
        b.tracks.length - a.tracks.length ||
        a.instrumentName.localeCompare(b.instrumentName),
    );
  })();

  const [adding, setAdding] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["/api/admin/people", personId, "gear-context"],
    });
    // Fan-side profile also needs to re-derive (the visible Gear chip
    // counts and the read-only "Music" tab in admin both come from it).
    queryClient.invalidateQueries({
      queryKey: ["/api/people", personId, "profile"],
    });
    // Adding/removing a performer row also flips the counts on the
    // Instrument editor's Tracks + Artists tabs (which queries
    // /api/instruments/:id/profile). Predicate-match so we hit any
    // currently-mounted instrument profile, whichever instrument it is.
    queryClient.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey;
        return (
          Array.isArray(k) &&
          k[0] === "/api/instruments" &&
          k[2] === "profile"
        );
      },
    });
  };

  const deletePerformer = useMutation({
    mutationFn: async (performerId: string) => {
      await apiRequest("DELETE", `/api/admin/performers/${performerId}`);
    },
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-3" data-testid="panel-admin-person-gear">
      <div className="flex items-center justify-between">
        <p className="text-slate-500 text-[12px]">
          {gearRows.length === 0
            ? `No gear credited to ${personName} yet.`
            : `${gearRows.length} piece${gearRows.length === 1 ? "" : "s"} of gear across ${gearRows.reduce((n, r) => n + r.tracks.length, 0)} track${gearRows.reduce((n, r) => n + r.tracks.length, 0) === 1 ? "" : "s"}.`}
        </p>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-[12px] text-[#319ED8] hover:underline"
            data-testid="button-add-gear"
          >
            + Add gear
          </button>
        )}
      </div>

      {adding && (
        <AddGearPanel
          personId={personId}
          personName={personName}
          instruments={instruments}
          context={context}
          onClose={() => setAdding(false)}
          onSaved={() => {
            invalidate();
            setAdding(false);
            toast({ title: "Gear saved", description: "Track credits updated." });
          }}
        />
      )}

      {gearRows.length > 0 && (
        <ul
          className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden"
          data-testid="list-admin-person-gear"
        >
          {gearRows.map((g) => {
            const isOpen = expandedRow === g.instrumentId;
            return (
              <li key={g.instrumentId} data-testid={`row-admin-person-gear-${g.instrumentId}`}>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedRow((prev) => (prev === g.instrumentId ? null : g.instrumentId))
                  }
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                  data-testid={`button-gear-row-${g.instrumentId}`}
                >
                  <div className="w-10 h-10 rounded-md overflow-hidden bg-slate-200 flex-shrink-0">
                    {g.instrumentPhotoUrl ? (
                      <img src={g.instrumentPhotoUrl} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-900 text-[13px] font-medium truncate">
                      {g.instrumentName}
                    </p>
                    <p className="text-slate-400 text-[11px] truncate">
                      {g.instrumentCategory ?? "Instrument"} · {g.tracks.length} track
                      {g.tracks.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="text-slate-300 text-[11px]">{isOpen ? "▾" : "▸"}</span>
                </button>
                {isOpen && (
                  <ul className="bg-slate-50/60 border-t border-slate-100">
                    {g.tracks.map((t) => (
                      <li
                        key={t.performerId}
                        className="flex items-center gap-3 pl-16 pr-3 py-1.5"
                        data-testid={`row-gear-track-${t.performerId}`}
                      >
                        <span className="text-slate-400 text-[11px] w-6 text-right tabular-nums">
                          {t.trackNumber}
                        </span>
                        <span className="flex-1 min-w-0 text-slate-700 text-[12px] truncate">
                          {t.songTitle}
                          <span className="text-slate-400"> · {t.albumTitle}</span>
                          {t.role && t.role.toLowerCase() !== (g.instrumentCategory ?? "").toLowerCase() ? (
                            <span className="text-slate-400"> · {t.role}</span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Remove "${g.instrumentName}" from "${t.songTitle}"?`)) {
                              deletePerformer.mutate(t.performerId);
                            }
                          }}
                          disabled={deletePerformer.isPending}
                          className="text-slate-400 hover:text-red-600 disabled:opacity-40 p-1"
                          data-testid={`button-remove-gear-track-${t.performerId}`}
                          aria-label="Remove credit"
                        >
                          <XIcon className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isLoading && gearRows.length === 0 && (
        <p className="text-slate-400 text-sm">Loading gear…</p>
      )}
    </div>
  );
}

// Inline "+ Add gear" panel. Three sub-pickers stacked: instrument, tracks,
// role/notes. Save fires N parallel POSTs (one performer row per selected
// track). We use Promise.allSettled so a single FK fail (e.g. song was
// deleted in another tab) doesn't roll back the rest — and we surface a
// toast with the failure count from the parent on resolve.
function AddGearPanel({
  personId,
  personName,
  instruments,
  context,
  onClose,
  onSaved,
}: {
  personId: string;
  personName: string;
  instruments: AdminInstrument[];
  context: GearContextAlbum[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedInstrument, setSelectedInstrument] = useState<AdminInstrument | null>(null);
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(new Set());
  const [role, setRole] = useState("");
  const [tuningNotes, setTuningNotes] = useState("");
  const [saving, setSaving] = useState(false);
  // When the user picks an instrument, default the role to the
  // instrument's short category ("Guitar" / "Bass" / "Drums"). They can
  // overwrite it before saving — e.g. "Acoustic guitar (capo 3)".
  useEffect(() => {
    if (selectedInstrument && !role) {
      setRole(
        selectedInstrument.shortCategory ||
          selectedInstrument.category ||
          "",
      );
    }
  }, [selectedInstrument?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSong = (songId: string) => {
    setSelectedSongIds((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  };

  const canSave =
    !!selectedInstrument && selectedSongIds.size > 0 && role.trim().length > 0 && !saving;

  async function handleSave() {
    if (!canSave || !selectedInstrument) return;
    setSaving(true);
    // Dedupe up front: if a selected track already has a performer row for
    // THIS person on THIS instrument, drop it. Without this the server
    // happily creates a second identical row (there's no DB-level unique
    // constraint on personId + songId + instrumentId), which would inflate
    // the gear track counts and require manual cleanup.
    const allSelected = Array.from(selectedSongIds);
    const songIdToTrack = new Map<string, GearContextAlbum["tracks"][number]>();
    for (const a of context) for (const t of a.tracks) songIdToTrack.set(t.songId, t);
    const skipped: string[] = [];
    const songIds = allSelected.filter((songId) => {
      const t = songIdToTrack.get(songId);
      const dup = t?.performers.some((p) => p.instrumentId === selectedInstrument!.id);
      if (dup) skipped.push(t?.title ?? songId);
      return !dup;
    });
    if (songIds.length === 0) {
      setSaving(false);
      toast({
        title: "Nothing to save",
        description: `Already credited on ${skipped.length} track${skipped.length === 1 ? "" : "s"}.`,
        variant: "destructive",
      });
      return;
    }
    const body = {
      personId,
      instrumentId: selectedInstrument.id,
      name: personName,
      role: role.trim(),
      tuningNotes: tuningNotes.trim() || null,
    };
    const results = await Promise.allSettled(
      songIds.map((songId) =>
        apiRequest("POST", `/api/admin/songs/${songId}/performers`, body),
      ),
    );
    const fails = results.filter((r) => r.status === "rejected").length;
    const ok = songIds.length - fails;
    setSaving(false);
    // If every POST failed, keep the panel open so the admin can fix the
    // input and retry instead of seeing a misleading "Gear saved" toast.
    if (ok === 0) {
      toast({
        title: "Save failed",
        description: `0/${songIds.length} tracks saved. Check the console for details.`,
        variant: "destructive",
      });
      return;
    }
    if (fails > 0 || skipped.length > 0) {
      const parts: string[] = [];
      if (fails > 0) parts.push(`${fails} failed`);
      if (skipped.length > 0) parts.push(`${skipped.length} already credited`);
      toast({
        title: `Saved ${ok}/${allSelected.length}`,
        description: parts.join(" · "),
        variant: fails > 0 ? "destructive" : undefined,
      });
    }
    onSaved();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3" data-testid="panel-add-gear">
      <div className="flex items-center justify-between">
        <h4 className="text-slate-900 text-[13px] font-semibold">Add gear</h4>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 text-[12px]"
          data-testid="button-cancel-add-gear"
        >
          Cancel
        </button>
      </div>

      <Field label="Instrument">
        <InstrumentPicker
          instruments={instruments}
          value={selectedInstrument}
          onChange={setSelectedInstrument}
          onCreated={(created) => {
            // New instrument was just POSTed — invalidate the instruments
            // query so the dropdown stays consistent across the editor,
            // then auto-select.
            queryClient.invalidateQueries({ queryKey: ["/api/instruments"] });
            setSelectedInstrument(created);
          }}
        />
      </Field>

      <Field label="Role on these tracks">
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Guitar / Bass / Lead vocals…"
          className={inputCls}
          data-testid="input-add-gear-role"
        />
      </Field>

      <Field label="Tuning / setup notes (optional)">
        <input
          value={tuningNotes}
          onChange={(e) => setTuningNotes(e.target.value)}
          placeholder="DADGAD, capo 3…"
          className={inputCls}
          data-testid="input-add-gear-tuning"
        />
      </Field>

      <div>
        <span className="block text-slate-400 text-[11px] uppercase tracking-wider mb-1">
          Tracks ({selectedSongIds.size} selected)
        </span>
        {context.length === 0 ? (
          <p className="text-slate-400 text-[12px] py-2">
            No tracks available yet. Add this person as the primary artist on an album, or open an album editor and add their credits there first.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200" data-testid="list-add-gear-tracks">
            {context.map((a) => {
              const allSelected = a.tracks.length > 0 && a.tracks.every((t) => selectedSongIds.has(t.songId));
              const toggleAll = () => {
                setSelectedSongIds((prev) => {
                  const next = new Set(prev);
                  if (allSelected) {
                    for (const t of a.tracks) next.delete(t.songId);
                  } else {
                    for (const t of a.tracks) next.add(t.songId);
                  }
                  return next;
                });
              };
              return (
                <div key={a.albumId} className="border-b border-slate-100 last:border-b-0">
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50">
                    {a.albumArtwork ? (
                      <img src={a.albumArtwork} alt="" className="w-6 h-6 rounded object-cover" />
                    ) : null}
                    <span className="flex-1 text-slate-700 text-[12px] font-medium truncate">
                      {a.albumTitle}
                      {a.albumYear ? <span className="text-slate-400 font-normal"> · {a.albumYear}</span> : null}
                    </span>
                    <button
                      type="button"
                      onClick={toggleAll}
                      className="text-[11px] text-[#319ED8] hover:underline"
                      data-testid={`button-toggle-album-${a.albumId}`}
                    >
                      {allSelected ? "Clear" : "Select all"}
                    </button>
                  </div>
                  <ul>
                    {a.tracks.map((t) => {
                      const checked = selectedSongIds.has(t.songId);
                      const alreadyOnThisInstrument =
                        !!selectedInstrument &&
                        t.performers.some((p) => p.instrumentId === selectedInstrument.id);
                      const otherCredits = t.performers.filter(
                        (p) => !selectedInstrument || p.instrumentId !== selectedInstrument.id,
                      );
                      return (
                        <li
                          key={t.songId}
                          className="flex items-center gap-2 px-2 py-1.5"
                          data-testid={`row-add-gear-track-${t.songId}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSong(t.songId)}
                            className="h-3.5 w-3.5 accent-[#319ED8]"
                            data-testid={`checkbox-add-gear-track-${t.songId}`}
                          />
                          <span className="text-slate-400 text-[11px] w-6 text-right tabular-nums">
                            {t.trackNumber}
                          </span>
                          <span className="flex-1 min-w-0 text-slate-700 text-[12px] truncate">
                            {t.title}
                            {alreadyOnThisInstrument && (
                              <span className="ml-2 text-[10px] text-amber-600">
                                already credited
                              </span>
                            )}
                            {!alreadyOnThisInstrument && otherCredits.length > 0 && (
                              <span className="ml-2 text-[10px] text-slate-400">
                                {otherCredits
                                  .map((p) => p.instrumentName ?? p.role)
                                  .filter(Boolean)
                                  .join(", ")}
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-100 rounded"
          data-testid="button-cancel-save-gear"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          className="px-3 py-1.5 text-[12px] rounded-md bg-[#319ED8] text-white font-medium disabled:opacity-40"
          data-testid="button-save-gear"
        >
          {saving
            ? "Saving…"
            : `Save${selectedSongIds.size > 0 ? ` (${selectedSongIds.size})` : ""}`}
        </button>
      </div>
    </div>
  );
}

// Search-or-create combobox for the instrument catalog. The dropdown
// shows the top N matches against the typed query (name + category +
// shortCategory, case-insensitive). The bottom row is always a "+ Create
// new instrument" entry — when there's no query it lands on a small
// inline form (name + category); when there IS a query, that query
// pre-fills the name field so a typo like "telecastor" can be promoted
// into a new instrument in one tap.
function InstrumentPicker({
  instruments,
  value,
  onChange,
  onCreated,
}: {
  instruments: AdminInstrument[];
  value: AdminInstrument | null;
  onChange: (i: AdminInstrument | null) => void;
  onCreated: (i: AdminInstrument) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const matches = (() => {
    if (!query.trim()) return instruments.slice(0, 25);
    const q = query.toLowerCase();
    return instruments
      .filter((i) => {
        const hay = `${i.name} ${i.category ?? ""} ${i.shortCategory ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 25);
  })();

  async function handleCreate() {
    const name = newName.trim();
    const category = newCategory.trim();
    if (!name || !category) {
      setCreateErr("Name and category are both required.");
      return;
    }
    setCreateBusy(true);
    setCreateErr(null);
    try {
      const res = await apiRequest("POST", "/api/admin/instruments", { name, category });
      const created = (await res.json()) as AdminInstrument;
      onCreated(created);
      setCreating(false);
      setOpen(false);
      setQuery("");
      setNewName("");
      setNewCategory("");
    } catch (e: any) {
      setCreateErr(e?.message || "Create failed");
    } finally {
      setCreateBusy(false);
    }
  }

  if (value && !creating) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5" data-testid="display-selected-instrument">
        <div className="w-8 h-8 rounded overflow-hidden bg-slate-200 flex-shrink-0">
          {value.photoUrl ? <img src={value.photoUrl} alt="" className="w-full h-full object-cover" /> : null}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-slate-900 text-[13px] font-medium truncate">{value.name}</p>
          <p className="text-slate-400 text-[11px] truncate">
            {value.shortCategory ?? value.category}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-[11px] text-slate-500 hover:text-slate-800"
          data-testid="button-change-instrument"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative" data-testid="combobox-instrument">
      {!creating ? (
        <>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Search gear by name or category…"
            className={inputCls}
            data-testid="input-instrument-search"
          />
          {open && (
            <div className="absolute z-10 left-0 right-0 mt-1 rounded-md border border-slate-200 bg-white shadow-lg max-h-64 overflow-y-auto">
              {matches.length === 0 && (
                <p className="px-3 py-2 text-slate-400 text-[12px]">No matches.</p>
              )}
              {matches.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(i);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 text-left"
                  data-testid={`option-instrument-${i.id}`}
                >
                  <div className="w-7 h-7 rounded overflow-hidden bg-slate-200 flex-shrink-0">
                    {i.photoUrl ? <img src={i.photoUrl} alt="" className="w-full h-full object-cover" /> : null}
                  </div>
                  <span className="flex-1 min-w-0">
                    <span className="block text-slate-900 text-[12px] truncate">{i.name}</span>
                    <span className="block text-slate-400 text-[10px] truncate">
                      {i.shortCategory ?? i.category}
                    </span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setNewName(query);
                  setCreating(true);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 border-t border-slate-100 text-[12px] text-[#319ED8] hover:bg-slate-50"
                data-testid="button-create-new-instrument"
              >
                + Create new instrument{query.trim() ? ` "${query.trim()}"` : ""}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-md border border-slate-200 bg-white p-2 space-y-2" data-testid="form-new-instrument">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Instrument name (e.g. 1973 Martin D-28)"
            className={inputCls}
            data-testid="input-new-instrument-name"
          />
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Category (e.g. Acoustic guitar)"
            className={inputCls}
            data-testid="input-new-instrument-category"
          />
          {createErr && <p className="text-red-600 text-[11px]">{createErr}</p>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setCreateErr(null);
              }}
              className="text-[11px] text-slate-500 hover:text-slate-800 px-2 py-1"
              data-testid="button-cancel-new-instrument"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={createBusy}
              onClick={handleCreate}
              className="px-2.5 py-1 text-[11px] rounded bg-[#319ED8] text-white font-medium disabled:opacity-40"
              data-testid="button-save-new-instrument"
            >
              {createBusy ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PersonEditor({
  personId,
  onDeleted,
  onCreatedAlbum,
}: {
  personId: string;
  onDeleted: () => void;
  // Bubbles up to the shell after a "+ New release" click — the shell
  // switches the active tab to Albums and selects the freshly-created row
  // so the admin lands straight in the new album's editor.
  onCreatedAlbum: (albumId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<AdminPerson>({
    queryKey: ["/api/people", personId],
  });
  const { data: libraryAlbums = [] } = useQuery<AdminAlbum[]>({
    queryKey: ["/api/albums"],
  });
  const [form, setForm] = useState<AdminPerson | null>(null);
  const [dirty, setDirty] = useState(false);
  // Discography is per-session and per-person, but the Replit dev iframe
  // reloads aggressively (every restart of the workflow re-mounts this
  // component and wipes useState). Persist into sessionStorage keyed by
  // personId so a pulled list survives page reloads, server restarts, and
  // toggling between the Apple/Spotify/Instagram tabs. Cleared automatically
  // when the browser tab closes — still session-scoped, just resilient.
  const discoKey = `gt:admin:discography:${personId}`;
  const [discography, setDiscography] = useState<ScrapedArtistAlbum[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = sessionStorage.getItem(discoKey);
      return raw ? (JSON.parse(raw) as ScrapedArtistAlbum[]) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      if (discography.length > 0) sessionStorage.setItem(discoKey, JSON.stringify(discography));
      else sessionStorage.removeItem(discoKey);
    } catch {
      /* storage full or unavailable — fine to skip persistence */
    }
  }, [discography, discoKey]);
  // Which streaming/social tab is currently revealed below the icon strip.
  // Default to Apple Music — the most common starting point for a fresh
  // person (the Pull bar drops an Apple URL straight into that field).
  const [activeSocial, setActiveSocial] = useState<string>("apple");
  // The single input rendered under the active tab. One ref is enough now
  // — focusing it on tab change keeps the keyboard-paste flow smooth.
  const socialInputRef = useRef<HTMLInputElement>(null);

  // Editor-wide tab strip (About | Music | Gear). About wraps the full
  // existing editor (streaming/identity/bio/accent + discography). Music
  // and Gear are read-only catalog-derived views so the admin can quickly
  // see which tracks reference this person and what gear they've played,
  // without leaving the editor. Both panels pull from the same
  // /api/people/:id/profile bundle that powers the fan-side PerformerSheet.
  const [tab, setTab] = useState<"about" | "music" | "gear">("about");
  type PersonProfile = {
    person: { id: string; name: string; photoUrl: string | null; bio: string | null };
    tracks: Array<{
      performerId: string;
      songId: string; songTitle: string; trackNumber: number;
      albumId: string; albumTitle: string; albumArtwork: string;
      albumArtist: string; albumYear: number | null;
      role: string; tuningNotes: string | null;
      instrumentId: string | null; instrumentName: string | null;
      instrumentShortCategory: string | null; instrumentCategory: string | null;
      instrumentPhotoUrl: string | null;
    }>;
  };
  const { data: profile } = useQuery<PersonProfile>({
    queryKey: ["/api/people", personId, "profile"],
  });
  // Group tracks by album for the Music tab.
  const musicAlbums = (() => {
    if (!profile) return [] as Array<{ albumId: string; albumTitle: string; albumArtwork: string; albumYear: number | null; tracks: PersonProfile["tracks"] }>;
    const byAlbum = new Map<string, { albumId: string; albumTitle: string; albumArtwork: string; albumYear: number | null; tracks: PersonProfile["tracks"] }>();
    for (const t of profile.tracks) {
      const entry = byAlbum.get(t.albumId) ?? { albumId: t.albumId, albumTitle: t.albumTitle, albumArtwork: t.albumArtwork, albumYear: t.albumYear, tracks: [] };
      entry.tracks.push(t);
      byAlbum.set(t.albumId, entry);
    }
    return Array.from(byAlbum.values());
  })();
  // Distinct gear with per-instrument track count.
  const personGear = (() => {
    if (!profile) return [] as Array<{ id: string; name: string; shortCategory: string | null; category: string | null; photoUrl: string | null; trackCount: number }>;
    const byInst = new Map<string, { id: string; name: string; shortCategory: string | null; category: string | null; photoUrl: string | null; tracks: Set<string> }>();
    for (const t of profile.tracks) {
      if (!t.instrumentId) continue;
      const entry = byInst.get(t.instrumentId) ?? { id: t.instrumentId, name: t.instrumentName ?? "Instrument", shortCategory: t.instrumentShortCategory, category: t.instrumentCategory, photoUrl: t.instrumentPhotoUrl, tracks: new Set<string>() };
      entry.tracks.add(t.songId);
      byInst.set(t.instrumentId, entry);
    }
    return Array.from(byInst.values()).map(({ tracks, ...r }) => ({ ...r, trackCount: tracks.size })).sort((a, b) => b.trackCount - a.trackCount || a.name.localeCompare(b.name));
  })();
  useEffect(() => {
    if (data) {
      setForm(data);
      setDirty(false);
      // Don't clear `discography` here. The parent uses `key={selectedId}`
      // on PersonEditor, so switching to a different person already
      // remounts this component (which resets all local state, including
      // discography). Clearing in this effect made saves wipe the pulled
      // list whenever React Query re-resolved `data` after invalidation —
      // even though personId hadn't changed — because `data?.id` could
      // transiently flip during refetch.
    }
  }, [data?.id]);

  const update = (patch: Partial<AdminPerson>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setDirty(true);
  };

  // Auto-fill state for the Apple Music / Spotify tabs. Pasting a URL into
  // either tab (or pressing the inline "Fill form" button) calls the same
  // /api/admin/people/scrape endpoint the old top bar used and drops the
  // result into name/photo/bio + pulls the Apple discography below.
  const [scrapeBusy, setScrapeBusy] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  async function runScrape(rawUrl: string) {
    const u = rawUrl.trim();
    if (!u || !form) return;
    setScrapeBusy(true);
    setScrapeMsg(null);
    try {
      const res = await apiRequest("POST", "/api/admin/people/scrape", {
        url: u,
      });
      const data = (await res.json()) as ArtistScrapeResult;
      const lower = u.toLowerCase();
      const pastedIsApple = /music\.apple\.com/.test(lower);
      const pastedIsSpotify = /open\.spotify\.com/.test(lower);
      // Merge against the LATEST form (functional update) — the scrape is
      // async, and the user may have typed in name/photo/bio while it was in
      // flight. Reading from a closure-captured `form` would silently
      // overwrite those edits.
      setForm((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          // Never clobber a non-empty existing value
          name:
            prev.name && prev.name !== "New person"
              ? prev.name
              : data.name || prev.name,
          photoUrl: prev.photoUrl || data.photoUrl,
          bio: prev.bio || data.bio,
          appleMusicUrl:
            data.appleMusicUrl || (pastedIsApple ? u : prev.appleMusicUrl),
          spotifyUrl:
            data.spotifyUrl || (pastedIsSpotify ? u : prev.spotifyUrl),
          itunesArtistId: data.itunesArtistId || prev.itunesArtistId,
        };
      });
      setDirty(true);
      // Only replace the discography when this scrape actually returned
      // albums. Spotify's artist endpoint (and most non-Apple sources) come
      // back with `albums: []` — overwriting in that case would wipe a list
      // the admin just pulled from Apple. Keep what we have until another
      // source proves it has a better list.
      if (data.albums.length > 0) {
        setDiscography(data.albums);
        // Mirror the pulled discography to the database so the fan-side
        // artist page's "Streaming" section sees it without re-hitting
        // Apple. Fire-and-forget — the in-memory list is already updated
        // and the only consumer is the public fan endpoint.
        apiRequest("PUT", `/api/admin/people/${personId}/discography`, {
          items: data.albums.map((a, idx) => ({ ...a, position: idx })),
        }).catch(() => {
          /* non-fatal — admin will re-pull and we'll persist next time */
        });
      }
      const src =
        data.source === "apple"
          ? "Apple Music"
          : data.source === "spotify"
            ? "Spotify"
            : "page";
      const discog =
        data.albums.length > 0
          ? ` Found ${data.albums.length} album${data.albums.length === 1 ? "" : "s"}.`
          : "";
      setScrapeMsg({
        kind: "ok",
        text: `Filled name, photo, bio from ${src}. Review and Save.${discog}`,
      });
    } catch (e: any) {
      setScrapeMsg({
        kind: "err",
        text: e?.message || "Couldn't read that page.",
      });
    } finally {
      setScrapeBusy(false);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const res = await apiRequest(
        "PUT",
        `/api/admin/people/${personId}`,
        form,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      queryClient.invalidateQueries({ queryKey: ["/api/people", personId] });
      queryClient.invalidateQueries({ queryKey: ["/api/people", personId, "profile"] });
      setDirty(false);
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/people/${personId}`);
    },
    onSuccess: async () => {
      // Await the refetch so the parent's auto-select effect sees the list
      // without the just-deleted row before we clear `selectedId`. Otherwise
      // the effect can re-pick the deleted id from stale cache.
      await queryClient.refetchQueries({ queryKey: ["/api/people"] });
      onDeleted();
    },
  });

  // Match a scraped album against the GoodTunes library by lowercased title
  // + artist. Lossy on purpose: "Greatest Hits (Deluxe Edition)" won't match
  // "Greatest Hits" — admin can still click + Add and we'd get a dupe, but
  // that's the safer side of the trade-off.
  //
  // Bulk "+ Add all" per bucket. Fires N parallel POST /api/admin/albums
  // calls, each with primaryArtistId set so the new albums link back to
  // this person from the moment they're created. Rows already matched in
  // the library are filtered out before this fires (see button render).
  // Uses Promise.allSettled so a single failure (network blip, server
  // validation) doesn't abandon successful sibling creates mid-batch — we
  // invalidate on settle so any albums that did land show up immediately,
  // then surface the failure count via the toast hook. `addAll.isPending`
  // is also passed to each DiscographyRow so individual "+ Add" buttons
  // are disabled while the batch runs (prevents double-creates against
  // a stale `match` value).
  const { toast } = useToast();
  const addAll = useMutation({
    mutationFn: async (items: ScrapedArtistAlbum[]) => {
      const results = await Promise.allSettled(
        items.map((a) =>
          apiRequest("POST", "/api/admin/albums", {
            title: a.name,
            artist: form?.name ?? "",
            artwork: a.artworkUrl,
            year: a.year,
            type: a.type,
            appleMusicUrl: a.appleMusicUrl,
            primaryArtistId: personId,
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      // Refetch before resolving so `isPending` stays true until fresh
      // album rows are in the cache. Without this, the bulk button can
      // re-enable while `unmatched` still reflects pre-batch state and
      // a second click duplicates everything that just succeeded.
      await queryClient.refetchQueries({ queryKey: ["/api/albums"] });
      return { added: items.length - failed, failed };
    },
    onSuccess: ({ added, failed }) => {
      if (failed === 0) {
        toast({ title: `Added ${added} album${added === 1 ? "" : "s"}` });
      } else {
        toast({
          title: `Added ${added}, ${failed} failed`,
          description: "Retry the rows still showing + Add.",
          variant: "destructive",
        });
      }
    },
  });
  const matchAlbum = (
    a: ScrapedArtistAlbum,
    artistName: string,
  ): AdminAlbum | null => {
    const key = `${a.name}::${artistName}`.toLowerCase().trim();
    return (
      libraryAlbums.find(
        (lib) => `${lib.title}::${lib.artist}`.toLowerCase().trim() === key,
      ) || null
    );
  };

  if (isLoading || !form)
    return <div className="p-6 text-slate-400">Loading…</div>;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4 max-w-2xl">
      <div className="flex items-center gap-4">
        {form.photoUrl ? (
          <img
            src={form.photoUrl}
            alt=""
            className="w-16 h-16 rounded-full object-cover"
          />
        ) : (
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold text-white"
            style={{ background: "#319ED8" }}
          >
            {form.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h2
            className="text-slate-900 text-xl font-semibold truncate"
            data-testid="text-person-heading"
          >
            {form.name || "Untitled person"}
          </h2>
          <p className="text-slate-400 text-xs font-mono">{form.id}</p>
        </div>
      </div>

      {/* Tab strip — mirrors the fan-side PerformerSheet tabs so the admin
          can see this artist the same way fans do. About holds the full
          editing surface; Music + Gear are read-only catalog views. */}
      <div role="tablist" aria-label="Person editor sections" className="flex gap-5 border-b border-slate-200 -mx-6 px-6">
        {(["about", "music", "gear"] as const).map((t) => {
          const active = tab === t;
          const label = t === "about" ? "About" : t === "music" ? "Music" : "Gear";
          const count = t === "music" ? profile?.tracks.length : t === "gear" ? personGear.length : undefined;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              id={`tab-admin-person-${t}`}
              aria-selected={active}
              aria-controls={`panel-admin-person-${t}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t)}
              className="relative pb-2.5 pt-1 text-[13px] font-semibold tracking-wide transition-colors"
              style={{ color: active ? "#0f172a" : "#64748b" }}
              data-testid={`tab-admin-person-${t}`}
            >
              <span className="flex items-center gap-1.5">
                {label}
                {typeof count === "number" && count > 0 && (
                  <span className="text-[11px] font-medium text-slate-400">{count}</span>
                )}
              </span>
              {active && (
                <span className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full" style={{ background: "#319ED8" }} />
              )}
            </button>
          );
        })}
      </div>

      {tab === "music" && (
        <div role="tabpanel" id="panel-admin-person-music" aria-labelledby="tab-admin-person-music" className="space-y-6" data-testid="panel-admin-person-music">
          {/* GoodTunes Releases — curated, in-library albums by this artist.
              Distinct from the iTunes-pulled Discography below: this is
              what fans actually play inside GoodTunes (album rows whose
              `primaryArtistId` matches this person AND that admin has
              flagged as a real GoodTunes release). */}
          {(() => {
            const gtReleases = libraryAlbums.filter(
              (a) => a.primaryArtistId === personId && a.isGoodTunesRelease,
            );
            if (gtReleases.length === 0) return null;
            return (
              <div className="space-y-2" data-testid="section-goodtunes-releases">
                <div className="flex items-center justify-between">
                  <h3 className="text-slate-900 text-sm font-semibold uppercase tracking-wider">
                    GoodTunes Releases
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {gtReleases.length} in library
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {gtReleases.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 py-2"
                      data-testid={`row-goodtunes-release-${a.id}`}
                    >
                      {a.artwork ? (
                        <img src={a.artwork} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded bg-slate-200 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-slate-900 text-sm font-medium truncate">{a.title}</div>
                        <div className="text-slate-400 text-[11px]">
                          {[a.type, a.year].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <span className="text-[11px] font-medium px-2 py-1 rounded text-[#319ED8] bg-[#319ED8]/10">
                        In library
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* "+ New release" — creates a fresh album pre-linked to this
              person and jumps the shell straight into the album editor. */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex items-center gap-3" data-testid="row-person-new-release">
            <div className="w-10 h-10 rounded-full bg-[#319ED8]/10 grid place-items-center shrink-0">
              <Disc3 className="w-5 h-5 text-[#319ED8]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-slate-900 text-sm font-medium">New release for {form.name || "this artist"}</div>
              <div className="text-slate-500 text-[12px]">Creates a draft LP pre-linked to this profile. You'll land in the album editor to fill in title, artwork, and tracks.</div>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await apiRequest("POST", "/api/admin/albums", {
                    title: `New release — ${form.name || "Untitled"}`,
                    artist: form.name || "Unknown artist",
                    artwork: "/album-placeholder.svg",
                    type: "LP",
                    primaryArtistId: personId,
                    // Admin is starting a curated release for this artist —
                    // surface it in the Albums sidebar from the moment it's
                    // created (unlike the discography "+ Add" path).
                    isGoodTunesRelease: true,
                  });
                  const album = (await res.json()) as AdminAlbum;
                  await queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
                  onCreatedAlbum(album.id);
                } catch (e: any) {
                  /* surface failures via the existing toast hook in the editor area —
                     for this simple action we just log; the create endpoint is well-tested. */
                  console.error("Couldn't create release", e);
                }
              }}
              className="px-3 py-1.5 rounded-md bg-[#319ED8] text-white text-sm font-medium hover:bg-[#2A89BD]"
              data-testid="button-person-new-release"
            >
              + New release
            </button>
          </div>

          {/* Apple Music discography — only present after a Pull. Lives at
              the top of the Music tab so the + Add buttons are the first
              thing the admin sees right after scraping. */}
          {discography.length > 0 && (
            <div className="space-y-2" data-testid="section-discography">
              <div className="flex items-center justify-between">
                <h3 className="text-slate-900 text-sm font-semibold uppercase tracking-wider">
                  Discography on Streaming
                </h3>
                <span className="text-[11px] text-slate-400">
                  {discography.length} from Apple Music · newest first
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                One-click adds an album to GoodTunes with real artwork + the Apple
                Music handoff URL. Track-by-track import and Spotify URLs come next.
              </p>
              {/* Apple-style grouping: full-lengths first, then EPs, then
                  Singles. Singles are detected by trackCount === 1 since the
                  iTunes API marks them as collectionType "EP" with one track. */}
              {(() => {
                const albums = discography.filter((a) => a.type === "album" && a.trackCount !== 1);
                const eps = discography.filter((a) => a.type === "EP" && (a.trackCount ?? 0) > 1);
                const singles = discography.filter((a) => a.trackCount === 1);
                const groups: Array<{ label: string; items: ScrapedArtistAlbum[] }> = [
                  { label: "Albums", items: albums },
                  { label: "EPs", items: eps },
                  { label: "Singles", items: singles },
                ];
                return groups.filter((g) => g.items.length > 0).map((g) => {
                  const unmatched = g.items.filter((a) => !matchAlbum(a, form.name));
                  return (
                  <div key={g.label} className="space-y-1" data-testid={`section-discography-${g.label.toLowerCase()}`}>
                    <div className="flex items-baseline justify-between pt-2 gap-2">
                      <h4 className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">{g.label}</h4>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-400">{g.items.length}</span>
                        {unmatched.length > 0 && (
                          <button
                            type="button"
                            onClick={() => addAll.mutate(unmatched)}
                            disabled={addAll.isPending}
                            className="text-[11px] font-medium text-[#319ED8] hover:underline disabled:opacity-40"
                            data-testid={`button-add-all-${g.label.toLowerCase()}`}
                          >
                            {addAll.isPending ? "Adding…" : `+ Add all (${unmatched.length})`}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {g.items.map((a) => (
                        <DiscographyRow
                          key={a.collectionId}
                          album={a}
                          artistName={form.name}
                          personId={personId}
                          match={matchAlbum(a, form.name)}
                          bulkPending={addAll.isPending}
                          onAdded={() => {
                            /* match recomputes after invalidation refetches /api/albums */
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  );
                });
              })()}
            </div>
          )}

          {/* Tracks where this person is credited (from the catalog). */}
          {musicAlbums.length > 0 && (
            <div className="flex items-center justify-between">
              <h3 className="text-slate-900 text-sm font-semibold uppercase tracking-wider">
                Credited tracks
              </h3>
              <span className="text-[11px] text-slate-400">
                {profile?.tracks.length ?? 0} track{(profile?.tracks.length ?? 0) === 1 ? "" : "s"} across {musicAlbums.length} album{musicAlbums.length === 1 ? "" : "s"}
              </span>
            </div>
          )}
          {musicAlbums.length === 0 ? (
            discography.length === 0 ? (
              <p className="text-slate-400 text-sm">No tracks credit {form.name} yet. Pull a discography above, or add credits from an album's song editor.</p>
            ) : null
          ) : (
            musicAlbums.map((alb) => (
              <div key={alb.albumId} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 bg-slate-50">
                  <div className="w-10 h-10 rounded-md overflow-hidden bg-slate-200 flex-shrink-0">
                    {alb.albumArtwork ? <img src={alb.albumArtwork} alt="" className="w-full h-full object-cover" /> : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-900 text-sm font-medium truncate">{alb.albumTitle}</p>
                    <p className="text-slate-400 text-[11px] truncate">{alb.albumYear ? `${alb.albumYear} · ` : ""}{alb.tracks.length} track{alb.tracks.length === 1 ? "" : "s"}</p>
                  </div>
                </div>
                <ul className="divide-y divide-slate-100">
                  {alb.tracks.map((t) => (
                    <li key={t.performerId} className="flex items-center gap-3 px-3 py-2" data-testid={`row-admin-person-track-${t.performerId}`}>
                      <span className="w-6 text-right text-[12px] tabular-nums text-slate-400 flex-shrink-0">{t.trackNumber}</span>
                      <span className="flex-1 min-w-0 text-slate-900 text-[13px] truncate">{t.songTitle}</span>
                      <span className="text-slate-500 text-[12px] truncate">{t.role}</span>
                      {t.instrumentName && (
                        <span className="text-slate-400 text-[11px] truncate max-w-[200px]">· {t.instrumentName}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "gear" && (
        <div role="tabpanel" id="panel-admin-person-gear" aria-labelledby="tab-admin-person-gear">
          <PersonGearManager personId={personId} personName={form.name} />
        </div>
      )}

      {/* ABOUT tab — the original editing surface. Wrapped as a single
          conditional fragment so the existing JSX stays untouched below. */}
      {tab === "about" && (<div role="tabpanel" id="panel-admin-person-about" aria-labelledby="tab-admin-person-about" className="space-y-4">
      {/* Streaming + social URLs collapsed into a single tabbed control:
          eight platform icons act as both completion indicators (mint check
          when filled) and tabs. Clicking one reveals a single input bound
          to that platform's URL field. The Apple Music + Spotify tabs
          double as the auto-fill entry point — paste a URL there (or press
          "Engage") and we scrape name, photo, bio, and (Apple) the full
          discography. */}
      {(() => {
        type Key =
          | "apple"
          | "spotify"
          | "instagram"
          | "tiktok"
          | "twitter"
          | "bluesky"
          | "facebook"
          | "website";
        // Restrict the dynamic field write to keys whose value type on
        // AdminPerson is `string | null`. This makes `update({ [field]: v
        // || null })` type-safe and prevents a future contributor from
        // accidentally pointing a tab at a non-URL field (id, accent,
        // photoUrl, etc.).
        type SocialField =
          | "appleMusicUrl"
          | "spotifyUrl"
          | "instagramUrl"
          | "tiktokUrl"
          | "twitterUrl"
          | "blueskyUrl"
          | "facebookUrl"
          | "websiteUrl";
        const platforms: {
          key: Key;
          label: string;
          placeholder: string;
          field: SocialField;
          testid: string;
        }[] = [
          {
            key: "apple",
            label: "Apple Music URL (artist)",
            placeholder: "https://music.apple.com/us/artist/…",
            field: "appleMusicUrl",
            testid: "input-person-apple-url",
          },
          {
            key: "spotify",
            label: "Spotify URL (artist)",
            placeholder: "https://open.spotify.com/artist/…",
            field: "spotifyUrl",
            testid: "input-person-spotify-url",
          },
          {
            key: "instagram",
            label: "Instagram URL",
            placeholder: "https://instagram.com/…",
            field: "instagramUrl",
            testid: "input-person-instagram-url",
          },
          {
            key: "tiktok",
            label: "TikTok URL",
            placeholder: "https://tiktok.com/@…",
            field: "tiktokUrl",
            testid: "input-person-tiktok-url",
          },
          {
            key: "twitter",
            label: "X / Twitter URL",
            placeholder: "https://x.com/…",
            field: "twitterUrl",
            testid: "input-person-twitter-url",
          },
          {
            key: "bluesky",
            label: "Bluesky URL",
            placeholder: "https://bsky.app/profile/…",
            field: "blueskyUrl",
            testid: "input-person-bluesky-url",
          },
          {
            key: "facebook",
            label: "Facebook URL",
            placeholder: "https://facebook.com/…",
            field: "facebookUrl",
            testid: "input-person-facebook-url",
          },
          {
            key: "website",
            label: "Website / other",
            placeholder: "https://… (Linktree, Bandcamp, personal site)",
            field: "websiteUrl",
            testid: "input-person-website-url",
          },
        ];
        const active =
          platforms.find((p) => p.key === activeSocial) ?? platforms[0];
        const activeValue = (form[active.field] as string | null) ?? "";
        const isScrapable =
          active.key === "apple" || active.key === "spotify";
        return (
          <div className="space-y-2">
            <SocialFieldShortcuts
              activeKey={active.key}
              filled={{
                apple: !!form.appleMusicUrl,
                spotify: !!form.spotifyUrl,
                instagram: !!form.instagramUrl,
                tiktok: !!form.tiktokUrl,
                twitter: !!form.twitterUrl,
                bluesky: !!form.blueskyUrl,
                facebook: !!form.facebookUrl,
                website: !!form.websiteUrl,
              }}
              onSelect={(key) => {
                setActiveSocial(key);
                // Defer focus to the next paint so the input has rendered
                // with its new value/placeholder before we focus + select.
                requestAnimationFrame(() => {
                  const el = socialInputRef.current;
                  if (el) {
                    el.focus({ preventScroll: true });
                    el.select();
                  }
                });
              }}
            />
            <Field label={active.label}>
              <div className="flex items-center gap-2">
                <input
                  ref={socialInputRef}
                  key={active.key}
                  value={activeValue}
                  onChange={(e) =>
                    update({ [active.field]: e.target.value || null })
                  }
                  onPaste={(e) => {
                    if (!isScrapable) return;
                    const pasted = e.clipboardData.getData("text").trim();
                    if (!pasted) return;
                    // Read the pasted URL straight from the clipboard event
                    // instead of waiting for the onChange round-trip — the
                    // scrape fires immediately with the value the user
                    // actually pasted, and the resulting prefill merges
                    // against the latest form state inside runScrape.
                    runScrape(pasted);
                  }}
                  onKeyDown={(e) => {
                    if (
                      isScrapable &&
                      e.key === "Enter" &&
                      activeValue.trim()
                    ) {
                      e.preventDefault();
                      runScrape(activeValue);
                    }
                  }}
                  placeholder={active.placeholder}
                  className={inputCls + " flex-1"}
                  disabled={isScrapable && scrapeBusy}
                  data-testid={active.testid}
                />
                {/* Open-in-new-tab — visible for every platform so the admin
                    can always jump to the saved URL with one click. Disabled
                    until the field has a parseable value. */}
                <OpenUrlButton url={activeValue} testId="button-artist-open-url" />
                {isScrapable && (
                  <button
                    type="button"
                    onClick={() => runScrape(activeValue)}
                    disabled={scrapeBusy || !activeValue.trim()}
                    className="px-3 py-2 rounded-md bg-[#319ED8] text-white text-sm font-medium disabled:opacity-40 shrink-0"
                    data-testid="button-artist-scrape-url"
                  >
                    {scrapeBusy ? "Reading…" : "Engage"}
                  </button>
                )}
              </div>
            </Field>
            {isScrapable ? (
              <p
                role="status"
                aria-live="polite"
                className={`text-[11px] min-h-[1em] ${scrapeMsg?.kind === "err" ? "text-red-600" : "text-slate-400"}`}
                data-testid="text-artist-scrape-result"
              >
                {scrapeMsg?.text ??
                  "Paste an Apple Music or Spotify artist URL — we'll fill name, photo, bio, and pull the discography. Nothing saves until you click Save changes."}
              </p>
            ) : null}
          </div>
        );
      })()}

      <Field label="Name">
        <input
          value={form.name}
          onChange={(e) => update({ name: e.target.value })}
          className={inputCls}
          data-testid="input-person-name"
        />
      </Field>
      <Field label="Photo">
        <ArtworkPicker
          value={form.photoUrl ?? ""}
          onChange={(next) => update({ photoUrl: next || null })}
          shape="circle"
          testId="input-person-photo"
          hint="Square, displayed as a circle. 400×400 px minimum (800×800 for retina). JPG or PNG."
        />
      </Field>
      <Field label="Cover image">
        <ArtworkPicker
          value={form.coverUrl ?? ""}
          onChange={(next) => update({ coverUrl: next || null })}
          shape="square"
          testId="input-person-cover"
          hint="Wide hero banner for the artist page. Optional — falls back to the circular photo when empty."
        />
      </Field>
      <Field label="Bio">
        <textarea
          value={form.bio ?? ""}
          onChange={(e) => update({ bio: e.target.value || null })}
          rows={4}
          className={inputCls + " resize-none"}
          data-testid="input-person-bio"
        />
      </Field>

      {/* Label picker — same search-or-create UX as the album editor, so
          an artist can be signed to a label independently of any single
          release. "No label" is a real choice (independent artist). */}
      <AlbumLabelPicker
        value={form.labelId}
        onChange={(next) => update({ labelId: next })}
      />

      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete ${form.name}? This cannot be undone.`))
              del.mutate();
          }}
          className="text-red-600 hover:bg-red-50 px-3 py-2 text-sm rounded"
          data-testid="button-delete-person"
        >
          Delete person
        </button>
        <button
          type="button"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          className="px-4 py-2 rounded-md bg-[#319ED8] text-white font-medium disabled:opacity-40"
          data-testid="button-save-person"
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>

      </div>)}
    </div>
  );
}

// ---------- InstrumentEditor ----------

// Small "open URL in a new tab" affordance shown next to every URL input
// that the admin might want to verify by hand (artist Apple/Spotify, label
// website, instrument product URL, vendor affiliate URL, …). Disabled
// until the field holds something that parses as an http(s) URL. Kept as
// a single component so we don't ship a different icon/style per surface.
function OpenUrlButton({ url, testId }: { url: string; testId?: string }) {
  const trimmed = (url || "").trim();
  let href: string | null = null;
  try {
    if (trimmed) {
      const u = new URL(trimmed);
      if (u.protocol === "http:" || u.protocol === "https:") href = u.toString();
    }
  } catch { /* not a valid URL — button stays disabled */ }
  return (
    <button
      type="button"
      onClick={() => { if (href) window.open(href, "_blank", "noopener,noreferrer"); }}
      disabled={!href}
      aria-label="Open URL in a new tab"
      title={href ? `Open ${href}` : "Enter a valid URL to open"}
      className="w-9 h-9 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-[#319ED8] hover:border-[#319ED8] flex items-center justify-center disabled:opacity-40 disabled:hover:text-slate-500 disabled:hover:border-slate-200 shrink-0"
      data-testid={testId}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 4h6v6" />
        <path d="M20 4L10 14" />
        <path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
      </svg>
    </button>
  );
}

// Paste-a-vendor-URL bar. Calls the server scraper, prefills name/photo/
// category on the parent form, and pushes a pre-populated vendor row.
// On hosts we don't recognise yet we still show what we found — the admin
// can edit the inferred vendor name before saving.
function ScrapeBar({
  storageKey,
  onPrefill,
}: {
  // Per-instrument localStorage key so the last-pulled URL survives both
  // refreshes and switching between instruments in the middle pane. Without
  // this the input would always re-mount empty even though the rest of the
  // form is restored from the DB.
  storageKey?: string;
  onPrefill: (r: {
    name: string | null;
    brand: string | null;
    category: string | null;
    description: string | null;
    specs: Record<string, string>;
    price: string | null;
    photoUrl: string | null;
    vendor: {
      name: string;
      affiliateUrl: string;
      aboutUrl: string;
      logoUrl: string;
      domain: string;
      known: boolean;
    };
  }) => Promise<{ ok: boolean; warn?: string } | void>;
}) {
  const [url, setUrl] = useState<string>(() => {
    if (!storageKey) return "";
    try { return localStorage.getItem(storageKey) || ""; } catch { return ""; }
  });
  // Re-hydrate when the active instrument changes (the component instance
  // is reused across instrument switches, so we can't rely on the lazy
  // useState initializer alone).
  useEffect(() => {
    if (!storageKey) { setUrl(""); return; }
    try { setUrl(localStorage.getItem(storageKey) || ""); } catch { setUrl(""); }
  }, [storageKey]);
  useEffect(() => {
    if (!storageKey) return;
    try {
      if (url) localStorage.setItem(storageKey, url);
      else localStorage.removeItem(storageKey);
    } catch {}
  }, [url, storageKey]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  async function go() {
    const u = url.trim();
    if (!u) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiRequest("POST", "/api/admin/instruments/scrape", {
        url: u,
      });
      const data = await res.json();
      const r = await onPrefill(data);
      const base = data.vendor?.known
        ? `Pulled from ${data.vendor.name}.`
        : `Pulled from ${data.vendor.name} (new vendor — confirm the name).`;
      const warn = r && "warn" in r && r.warn ? ` ${r.warn}` : "";
      setMsg({ kind: "ok", text: `${base} Review and Save.${warn}` });
      // Intentionally NOT clearing `url` — keeping the pulled URL visible
      // mirrors the People/Artist editor's Apple Music field. Admins can
      // see the source they pulled from, tweak the path, and re-pull
      // without retyping the whole URL.
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || "Couldn't read that page." });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-[#f7fbff] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              go();
            }
          }}
          placeholder="Paste a product URL — Carter Vintage, Reverb, Gibson, Martin, Sweetwater…"
          className={inputCls + " flex-1"}
          disabled={busy}
          data-testid="input-scrape-url"
        />
        <OpenUrlButton url={url} testId="button-scrape-open-url" />
        <button
          type="button"
          onClick={go}
          disabled={busy || !url.trim()}
          className="px-3 py-2 rounded-md bg-[#319ED8] text-white text-sm font-medium disabled:opacity-40"
          data-testid="button-scrape-url"
        >
          {busy ? "Reading…" : "Pull"}
        </button>
      </div>
      <p className="text-[11px] text-slate-400">
        Reads the page's Open Graph + product metadata and rehosts the hero
        image. Most modern shops work without an account.
      </p>
      {msg && (
        <p
          className={`text-[12px] ${msg.kind === "ok" ? "text-[#319ED8]" : "text-red-600"}`}
          data-testid="text-scrape-result"
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}

function InstrumentEditor({
  instrumentId,
  onDeleted,
}: {
  instrumentId: string;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<AdminInstrument>({
    queryKey: ["/api/instruments", instrumentId],
  });
  // Profile bundle — artists credited on this instrument. Powers the
  // People tab count + listing below. Separate query so the About form
  // (which writes back to /api/instruments/:id) can invalidate without
  // having to know about the catalog side. (The endpoint also returns
  // a `tracks` array used by other admin surfaces; not rendered here.)
  type InstrumentProfile = {
    instrument: AdminInstrument;
    artists: Array<{
      id: string;
      name: string;
      photoUrl: string | null;
      shortRole: string | null;
      trackCount: number;
    }>;
    tracks: Array<{
      performerId: string;
      songId: string;
      songTitle: string;
      trackNumber: number;
      albumId: string;
      albumTitle: string;
      albumArtwork: string;
      albumYear: number | null;
      personId: string | null;
      personName: string;
      personPhotoUrl: string | null;
      role: string;
      tuningNotes: string | null;
    }>;
  };
  const { data: profile } = useQuery<InstrumentProfile>({
    queryKey: ["/api/instruments", instrumentId, "profile"],
  });
  const [tab, setTab] = useState<"about" | "vendors" | "people">("about");
  // Reset tab to About whenever the admin switches to a different
  // instrument, so we never land on a tab with zero items for a brand-new
  // one.
  useEffect(() => {
    setTab("about");
  }, [instrumentId]);
  const [form, setForm] = useState<AdminInstrument | null>(null);
  const [dirty, setDirty] = useState(false);
  // Re-sync from the server every time `data` changes. On instrument switch
  // we replace `form` wholesale; for same-id refreshes (typically triggered
  // by a vendor mutation that invalidated the cache) we keep the user's
  // in-progress instrument-field edits but always refresh `vendors` so the
  // attachment list reflects the latest server state. This is what makes
  // edits in VendorRow propagate cleanly back into the form without losing
  // unsaved instrument-level changes.
  useEffect(() => {
    if (!data) return;
    setForm((prev) => {
      if (!prev || prev.id !== data.id) {
        setDirty(false);
        return data;
      }
      return { ...prev, vendors: data.vendors };
    });
  }, [data]);

  const update = (patch: Partial<AdminInstrument>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setDirty(true);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/instruments"] });
    queryClient.invalidateQueries({
      queryKey: ["/api/instruments", instrumentId],
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const { vendors, ...rest } = form;
      const res = await apiRequest(
        "PUT",
        `/api/admin/instruments/${instrumentId}`,
        rest,
      );
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setDirty(false);
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/instruments/${instrumentId}`);
    },
    onSuccess: async () => {
      // See PersonEditor.del — refetch before clearing selection.
      await queryClient.refetchQueries({ queryKey: ["/api/instruments"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/instruments", instrumentId],
      });
      onDeleted();
    },
  });

  // Add-vendor flow: prompt for a product URL up-front. The backend will
  // find-or-create a vendor entity by domain, so pasting a Carter URL after
  // Carter already exists just attaches the existing Carter — no dupes.
  const addVendor = useMutation({
    mutationFn: async () => {
      const url = window.prompt(
        "Paste the product URL (Reverb, Sweetwater, Carter, …). If this vendor already exists, the existing entity will be reused.",
        "https://",
      );
      if (!url || url === "https://") throw new Error("cancelled");
      let domain = "";
      try {
        domain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
      } catch {
        throw new Error("That doesn't look like a valid URL.");
      }
      const defaultName = domain
        .split(".")
        .slice(0, -1)
        .join(" ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const res = await apiRequest(
        "POST",
        `/api/admin/instruments/${instrumentId}/vendors`,
        { domain, name: defaultName, affiliateUrl: url },
      );
      return res.json();
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => {
      if (e.message !== "cancelled") alert(e.message);
    },
  });

  if (isLoading || !form)
    return <div className="p-6 text-slate-400">Loading…</div>;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4 max-w-2xl">
      <div className="flex items-center gap-4">
        {form.photoUrl ? (
          <img
            src={form.photoUrl}
            alt=""
            className="w-20 h-20 rounded-lg object-cover"
          />
        ) : (
          <div className="w-20 h-20 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300 text-xs">
            No photo
          </div>
        )}
        <div className="min-w-0">
          <h2
            className="text-slate-900 text-xl font-semibold truncate"
            data-testid="text-instrument-heading"
          >
            {form.name || "Untitled instrument"}
          </h2>
          <p className="text-slate-400 text-xs">
            {form.category || "Uncategorised"}
          </p>
          <p className="text-slate-300 text-xs font-mono">{form.id}</p>
        </div>
      </div>

      {/* Tab strip — mirrors the Person editor pattern. About holds the
          editing surface; Vendors holds the affiliate-link rows; People is
          a catalog view derived from SuperCredits performer credits.
          Counts shown when > 0. */}
      <div role="tablist" aria-label="Instrument editor sections" className="flex gap-5 border-b border-slate-200 -mx-6 px-6">
        {(["about", "vendors", "people"] as const).map((t) => {
          const active = tab === t;
          const label = t === "about" ? "About" : t === "vendors" ? "Vendors" : "People";
          const count =
            t === "vendors" ? form.vendors.length :
            t === "people" ? profile?.artists.length :
            undefined;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              id={`tab-admin-instrument-${t}`}
              aria-selected={active}
              aria-controls={`panel-admin-instrument-${t}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t)}
              className="relative pb-2.5 pt-1 text-[13px] font-semibold tracking-wide transition-colors"
              style={{ color: active ? "#0f172a" : "#64748b" }}
              data-testid={`tab-admin-instrument-${t}`}
            >
              <span className="flex items-center gap-1.5">
                {label}
                {typeof count === "number" && count > 0 && (
                  <span className="text-[11px] font-medium text-slate-400">{count}</span>
                )}
              </span>
              {active && (
                <span className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full" style={{ background: "#319ED8" }} />
              )}
            </button>
          );
        })}
      </div>

      {tab === "vendors" && (
        <div role="tabpanel" id="panel-admin-instrument-vendors" aria-labelledby="tab-admin-instrument-vendors" className="space-y-3" data-testid="panel-admin-instrument-vendors">
          <div className="flex items-center justify-between">
            <p className="text-slate-500 text-[12px] leading-relaxed">
              Affiliate links that surface in the in-app instrument sheet's
              "Where to buy" list.
            </p>
            <button
              type="button"
              onClick={() => addVendor.mutate()}
              disabled={addVendor.isPending}
              className="text-[12px] text-[#319ED8] hover:underline flex-shrink-0 ml-3"
              data-testid="button-new-vendor"
            >
              + Add vendor
            </button>
          </div>
          <div className="space-y-2">
            {form.vendors.map((v) => (
              <VendorRow key={v.id} vendor={v} onChanged={invalidate} />
            ))}
            {form.vendors.length === 0 && (
              <p className="text-slate-400 text-sm py-3">
                No vendors yet. Paste a product URL in the About tab's Pull
                bar, or click + Add vendor above.
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "people" && (
        <div role="tabpanel" id="panel-admin-instrument-people" aria-labelledby="tab-admin-instrument-people" data-testid="panel-admin-instrument-people">
          {(() => {
            const artists = profile?.artists ?? [];
            if (artists.length === 0) {
              return (
                <p className="text-slate-400 text-sm py-3">
                  No artists credited on this instrument yet.
                </p>
              );
            }
            return (
              <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
                {artists.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 px-3 py-2.5"
                    data-testid={`row-instrument-artist-${a.id}`}
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
                      {a.photoUrl ? (
                        <img src={a.photoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm font-semibold">
                          {a.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 text-[13px] font-medium truncate">{a.name}</p>
                      <p className="text-slate-400 text-[11px] truncate">
                        {a.trackCount} track{a.trackCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      )}

      {tab === "about" && (<div role="tabpanel" id="panel-admin-instrument-about" aria-labelledby="tab-admin-instrument-about" className="space-y-4" data-testid="panel-admin-instrument-about">
      <ScrapeBar
        storageKey={`gt:admin:scrape-url:${instrumentId}`}
        onPrefill={async (r) => {
          // The admin explicitly clicked Pull — overwrite the standard
          // "New instrument" placeholders without ceremony. Only preserve
          // values that look custom (i.e. not the new-record defaults).
          const isDefaultName =
            !form.name ||
            form.name === "New instrument" ||
            form.name.toLowerCase().startsWith("untitled");
          const isDefaultCategory =
            !form.category || form.category === "Guitar";

          // Compose the best possible Name from whatever we extracted.
          // Preferred shape (matches the editor's "year + maker + model"
          // convention): "<Year> <Brand> <Model> — <Finish>".
          //   • Year/Brand/Model/Finish live in the spec table when present
          //   • Otherwise fall back to brand + product.name + meta title
          const specs = r.specs || {};
          const pickSpec = (...keys: string[]): string | null => {
            for (const k of keys) {
              const hit = Object.keys(specs).find(
                (sk) => sk.toLowerCase() === k.toLowerCase(),
              );
              if (hit && specs[hit]) return specs[hit];
            }
            return null;
          };
          const year = pickSpec("Made In Year", "Year", "Year Made");
          const brand = r.brand || pickSpec("Brand", "Make", "Manufacturer");
          const finish = pickSpec("Finish", "Color", "Colour");
          // Manufacturer pages (Martin, Gibson, etc.) usually have JSON-LD
          // Product.name set to just the model ("00L Biosphere® IV") with
          // no two-column spec table, so pickSpec("Model") is empty. Fall
          // back to r.name with the brand prefix and any "| Vendor" suffix
          // stripped, so we don't end up composing the bare brand on its
          // own and dropping the model entirely.
          const cleanFallbackName = (raw: string | null): string | null => {
            if (!raw) return null;
            let s = raw.replace(/\s*\|\s*[^|]+$/, "").trim();
            if (brand) {
              const re = new RegExp(
                "^\\s*" + brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+",
                "i",
              );
              s = s.replace(re, "").trim();
            }
            return s || null;
          };
          const model = pickSpec("Model") || cleanFallbackName(r.name);
          const parts: string[] = [];
          if (year) parts.push(year);
          if (brand) parts.push(brand);
          if (model) parts.push(model);
          let composedName = parts.join(" ").trim();
          if (finish && composedName)
            composedName = `${composedName} — ${finish}`;
          // Final fallbacks if neither brand nor model produced anything.
          if (!composedName)
            composedName = [r.brand, r.name].filter(Boolean).join(" ").trim();
          if (!composedName) composedName = r.name || "";

          const merged: Partial<AdminInstrument> = {};
          if (composedName && isDefaultName) merged.name = composedName;
          if (r.photoUrl && !form.photoUrl) merged.photoUrl = r.photoUrl;
          // Prefer the Instrument spec value (e.g. "Dreadnought") over the
          // generic Schema.org category when both exist.
          const cat = pickSpec("Instrument", "Type", "Category") || r.category;
          if (cat && isDefaultCategory) merged.category = String(cat);

          // Build the About field: a clean spec block + blank line + the
          // narrative description. Only include the rows that actually
          // matter for credits — the page may have 40 rows of marketing.
          if (!form.about) {
            const specOrder = [
              "Instrument",
              "Brand",
              "Model",
              "Finish",
              "Made In Year",
              "Year",
              "Top",
              "Back and Sides",
              "Neck/Fingerboard",
              "Bridge Material",
              "Tuners",
              "Radius",
              "Neck Profile",
              "Neck Depth",
              "Scale Length",
              "Nut Width",
              "String Spacing at Saddle",
              "Electronics",
              "Pickups",
              "Case",
              "SKU",
              "Handedness",
            ];
            const seen = new Set<string>();
            const lines: string[] = [];
            for (const key of specOrder) {
              const hit = Object.keys(specs).find(
                (sk) => sk.toLowerCase() === key.toLowerCase(),
              );
              if (hit && !seen.has(hit.toLowerCase())) {
                lines.push(`${hit}: ${specs[hit]}`);
                seen.add(hit.toLowerCase());
              }
            }
            // Append any extra specs we didn't anticipate, capped so the
            // About field doesn't become a wall of text.
            for (const [k, v] of Object.entries(specs)) {
              if (seen.has(k.toLowerCase())) continue;
              if (lines.length >= 24) break;
              lines.push(`${k}: ${v}`);
            }
            const block = lines.join("\n");
            const desc = r.description?.trim() || "";
            const composed = [block, desc].filter(Boolean).join("\n\n").trim();
            if (composed) merged.about = composed;
          }
          if (Object.keys(merged).length) update(merged);

          // Dedupe: if a vendor with this exact affiliateUrl is already on
          // the instrument, skip the create — protects against accidental
          // double-pulls and re-pulls after a manual edit.
          const existing = (form.vendors || []).some(
            (v) =>
              (v.affiliateUrl || "").toLowerCase() ===
              r.vendor.affiliateUrl.toLowerCase(),
          );
          if (existing)
            return {
              ok: true,
              warn: "(Vendor already on this instrument — skipped.)",
            };

          // Create the vendor row server-side, then splice it into local
          // form state directly. invalidate() alone is not enough because
          // the editor's useEffect only resyncs `form` when the instrument
          // id changes — that's why the previous attempt showed "Vendors (0)"
          // even though the POST succeeded.
          try {
            const res = await apiRequest(
              "POST",
              `/api/admin/instruments/${instrumentId}/vendors`,
              {
                // Find-or-create body. If a vendor with this domain
                // already exists, the server reuses it (its existing
                // metadata wins) and just creates the attachment.
                domain: (r.vendor as any).domain,
                name: r.vendor.name,
                affiliateUrl: r.vendor.affiliateUrl,
                aboutUrl: r.vendor.aboutUrl,
                logoUrl: r.vendor.logoUrl,
              },
            );
            const newVendor = await res.json();
            setForm((f) =>
              f ? { ...f, vendors: [...(f.vendors || []), newVendor] } : f,
            );
            invalidate();
            return { ok: true };
          } catch (e: any) {
            return {
              ok: false,
              warn: `(Vendor row not added: ${e?.message || "save failed"})`,
            };
          }
        }}
      />

      <Field label="Name (year + maker + model)">
        <input
          value={form.name}
          onChange={(e) => update({ name: e.target.value })}
          className={inputCls}
          data-testid="input-instrument-name"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <input
            value={form.category}
            onChange={(e) => update({ category: e.target.value })}
            placeholder="Acoustic Guitar"
            className={inputCls}
            data-testid="input-instrument-category"
          />
        </Field>
        <Field label="Short category (shown inline)">
          <input
            value={form.shortCategory ?? ""}
            onChange={(e) => update({ shortCategory: e.target.value || null })}
            placeholder="Guitar"
            className={inputCls}
            data-testid="input-instrument-short-category"
          />
        </Field>
      </div>
      <Field label="Photo">
        <ArtworkPicker
          value={form.photoUrl ?? ""}
          onChange={(next) => update({ photoUrl: next || null })}
          shape="square"
          testId="input-instrument-photo"
          hint="Square. 800×800 px recommended (1600×1600 for retina). JPG or PNG. Plain or neutral background reads best."
        />
      </Field>
      <Field label="About (neutral: history, model facts)">
        <textarea
          value={form.about ?? ""}
          onChange={(e) => update({ about: e.target.value || null })}
          rows={3}
          className={inputCls + " resize-none"}
          data-testid="input-instrument-about"
        />
      </Field>
      <Field label="Artist note (why this artist chose THIS instrument)">
        <textarea
          value={form.artistNote ?? ""}
          onChange={(e) => update({ artistNote: e.target.value || null })}
          rows={3}
          className={inputCls + " resize-none"}
          data-testid="input-instrument-artist-note"
        />
      </Field>

      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete ${form.name}? Vendors will be removed too.`))
              del.mutate();
          }}
          className="text-red-600 hover:bg-red-50 px-3 py-2 text-sm rounded"
          data-testid="button-delete-instrument"
        >
          Delete instrument
        </button>
        <button
          type="button"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          className="px-4 py-2 rounded-md bg-[#319ED8] text-white font-medium disabled:opacity-40"
          data-testid="button-save-instrument"
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>

      </div>)}
    </div>
  );
}

function VendorRow({
  vendor,
  onChanged,
}: {
  vendor: AdminVendor;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState(vendor);
  const [open, setOpen] = useState(false);
  // Stringify-key the vendor so the draft snaps back to server state any
  // time the parent passes in a refreshed vendor object (after our own
  // save succeeds, or after a different surface — Vendors tab — edits the
  // shared entity). Without this, dirty stayed true after a save because
  // the useEffect only fired on id change.
  const vendorKey = JSON.stringify(vendor);
  const dirty = useMemo(
    () => JSON.stringify(draft) !== vendorKey,
    [draft, vendorKey],
  );
  useEffect(() => {
    setDraft(vendor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorKey]);

  // Saving splits into two requests because the model now is M:N:
  //   • Entity fields (name/logo/tagline/bio/location/cover/aboutUrl/homeUrl)
  //     PUT to /api/admin/vendors/:vendorId — affects every instrument
  //     using this vendor. The admin should expect that.
  //   • Attachment fields (affiliateUrl + isHidden + position) PUT to
  //     /api/admin/instrument-vendors/:attachmentId — local to this
  //     instrument. The two go in parallel.
  const save = useMutation({
    mutationFn: async () => {
      const entityChanged =
        draft.name !== vendor.name ||
        draft.logoUrl !== vendor.logoUrl ||
        draft.aboutUrl !== vendor.aboutUrl ||
        draft.tagline !== vendor.tagline ||
        draft.bio !== vendor.bio ||
        draft.location !== vendor.location ||
        draft.coverUrl !== vendor.coverUrl;
      const attachmentChanged =
        draft.affiliateUrl !== vendor.affiliateUrl ||
        draft.isHidden !== vendor.isHidden;
      const ops: Promise<unknown>[] = [];
      if (entityChanged) {
        ops.push(
          apiRequest("PUT", `/api/admin/vendors/${vendor.vendorId}`, {
            name: draft.name,
            logoUrl: draft.logoUrl,
            aboutUrl: draft.aboutUrl,
            tagline: draft.tagline,
            bio: draft.bio,
            location: draft.location,
            coverUrl: draft.coverUrl,
          }),
        );
      }
      if (attachmentChanged) {
        ops.push(
          apiRequest("PUT", `/api/admin/instrument-vendors/${vendor.id}`, {
            affiliateUrl: draft.affiliateUrl,
            isHidden: draft.isHidden,
          }),
        );
      }
      await Promise.all(ops);
    },
    onSuccess: onChanged,
  });
  // Row-level remove = detach this vendor from THIS instrument. The vendor
  // entity stays (it may be on other instruments). To delete the vendor
  // entity outright, use the Vendors tab pane.
  const del = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/instrument-vendors/${vendor.id}`);
    },
    onSuccess: onChanged,
  });

  // Auto-derive default logo from affiliate hostname when none is set.
  const logoFallback = useMemo(() => {
    if (draft.logoUrl) return draft.logoUrl;
    try {
      const u = new URL(draft.affiliateUrl);
      return `https://www.google.com/s2/favicons?sz=128&domain=${u.hostname}`;
    } catch {
      return "";
    }
  }, [draft.logoUrl, draft.affiliateUrl]);

  const pulledAgo = relativeTime(vendor.createdAt);

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div
        className={`w-full pl-3 pr-2 py-2 flex items-center gap-3 hover:bg-slate-50 ${draft.isHidden ? "opacity-50" : ""}`}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-3 text-left flex-1 min-w-0"
          data-testid={`row-vendor-${vendor.id}`}
        >
          {logoFallback ? (
            <img
              src={logoFallback}
              alt=""
              className="w-8 h-8 rounded bg-slate-50 object-contain"
            />
          ) : (
            <div className="w-8 h-8 rounded bg-slate-100" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-slate-900 text-sm truncate">
              {draft.name || "Untitled vendor"}
            </div>
            <div className="text-slate-400 text-xs truncate">
              {draft.affiliateUrl}
            </div>
          </div>
          {pulledAgo && (
            <span className="text-[11px] text-slate-300 shrink-0 hidden sm:inline">
              Pulled {pulledAgo}
            </span>
          )}
          {draft.isHidden && (
            <span className="text-[10px] uppercase tracking-wider text-[#FF5470] bg-[#FF5470]/10 border border-[#FF5470]/30 rounded px-1.5 py-0.5">
              Hidden
            </span>
          )}
          <span className="text-slate-400 text-xs">{open ? "▾" : "▸"}</span>
        </button>
        {/* Inline remove — detaches this vendor from THIS instrument; the
            vendor entity remains for use elsewhere. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (
              confirm(
                `Remove "${draft.name || "this vendor"}" from this instrument? The vendor entity stays available for other instruments.`,
              )
            )
              del.mutate();
          }}
          className="shrink-0 w-7 h-7 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center text-base leading-none"
          title="Detach vendor from this instrument"
          aria-label="Detach vendor from this instrument"
          data-testid={`button-remove-vendor-${vendor.id}`}
        >
          ×
        </button>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-slate-200">
          <Field label="Vendor name">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={inputCls}
              data-testid={`input-vendor-name-${vendor.id}`}
            />
          </Field>
          <Field label="Affiliate / product URL (where the buy button goes)">
            <div className="flex items-center gap-2">
              <input
                value={draft.affiliateUrl}
                onChange={(e) =>
                  setDraft({ ...draft, affiliateUrl: e.target.value })
                }
                className={inputCls + " flex-1"}
                data-testid={`input-vendor-affiliate-${vendor.id}`}
              />
              <OpenUrlButton url={draft.affiliateUrl} testId={`button-vendor-affiliate-open-${vendor.id}`} />
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="About URL (homepage)">
              <input
                value={draft.aboutUrl ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, aboutUrl: e.target.value || null })
                }
                className={inputCls}
                data-testid={`input-vendor-about-${vendor.id}`}
              />
            </Field>
            <Field label="Logo URL (else favicon)">
              <input
                value={draft.logoUrl ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, logoUrl: e.target.value || null })
                }
                className={inputCls}
                data-testid={`input-vendor-logo-${vendor.id}`}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Square. 200×200 px min (400×400 retina). Transparent PNG or SVG.
              </p>
            </Field>
          </div>
          <Field label="Tagline (one-liner)">
            <input
              value={draft.tagline ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, tagline: e.target.value || null })
              }
              className={inputCls}
              data-testid={`input-vendor-tagline-${vendor.id}`}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Location">
              <input
                value={draft.location ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, location: e.target.value || null })
                }
                placeholder="Nashville, TN"
                className={inputCls}
                data-testid={`input-vendor-location-${vendor.id}`}
              />
            </Field>
            <Field label="Cover URL (hero photo)">
              <input
                value={draft.coverUrl ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, coverUrl: e.target.value || null })
                }
                className={inputCls}
                data-testid={`input-vendor-cover-${vendor.id}`}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Wide hero. 1200×400 px recommended (2400×800 retina). JPG.
              </p>
            </Field>
          </div>
          <Field label="Bio (longer About copy)">
            <textarea
              value={draft.bio ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, bio: e.target.value || null })
              }
              rows={3}
              className={inputCls + " resize-none"}
              data-testid={`input-vendor-bio-${vendor.id}`}
            />
          </Field>
          <div className="flex items-center justify-end gap-2 pt-1">
            {/* Demo hide toggle — rides the same Save button via the dirty flag. */}
            <button
              type="button"
              onClick={() => setDraft({ ...draft, isHidden: !draft.isHidden })}
              className={`px-3 py-1 text-[12px] rounded border ${
                draft.isHidden
                  ? "border-[#FF5470]/40 bg-[#FF5470]/10 text-[#FF5470]"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              } mr-auto`}
              title={
                draft.isHidden
                  ? "Hidden from fans. Click to show."
                  : "Visible to fans. Click to hide."
              }
              data-testid={`button-toggle-vendor-hidden-${vendor.id}`}
            >
              {draft.isHidden ? "Hidden" : "Visible"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    "Detach this vendor from this instrument? The vendor entity will remain for other instruments.",
                  )
                )
                  del.mutate();
              }}
              className="px-3 py-1 text-[12px] text-red-600 hover:bg-red-50 rounded"
              data-testid={`button-delete-vendor-${vendor.id}`}
            >
              Detach
            </button>
            <button
              type="button"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
              className="px-3 py-1 text-[12px] rounded bg-[#319ED8] text-white disabled:opacity-40"
              data-testid={`button-save-vendor-${vendor.id}`}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Full-pane vendor ENTITY editor used by the top-level Vendors tab. Edits
// here are entity-wide: one Carter row, edit logo + bio + cover once, see
// it in every instrument using Carter. Per-attachment fields (affiliateUrl,
// isHidden) live in VendorRow inside the InstrumentEditor — not here.
function VendorPaneEditor({
  vendor,
  onJumpToInstrument,
  onDeleted,
}: {
  vendor: AdminVendorGrouped;
  onJumpToInstrument: (instrumentId: string) => void;
  onDeleted: () => void;
}) {
  // Tab strip mirrors the PersonEditor (About | Music | Gear) and the
  // fan-side VendorSheet (About | Gear | Artists). About wraps the editable
  // form. Gear lists every instrument this vendor is attached to (the old
  // "USED ON" block, now on-demand instead of always-visible). Artists is
  // read-only and pulls from the same /api/vendors/:id/profile bundle the
  // fan sheet uses, so admins can see who's been tagged via SuperCredits™.
  const [tab, setTab] = useState<"about" | "gear" | "artists">("about");
  type VendorProfile = {
    vendor: unknown;
    instruments: Array<{ id: string; name: string; category: string; shortCategory: string | null; photoUrl: string | null }>;
    artists: Array<{ id: string; name: string; photoUrl: string | null; trackCount: number }>;
  };
  const { data: vendorProfile } = useQuery<VendorProfile>({
    queryKey: ["/api/vendors", vendor.vendorId, "profile"],
    enabled: tab !== "about" && !!vendor.vendorId,
  });
  const visibleAttachments = vendor.attachments.filter((a) => !a.isHidden);
  const gearCount = vendor.attachments.length;
  const artistsCount = vendorProfile?.artists.length ?? 0;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AdminVendorGrouped>(vendor);
  useEffect(() => {
    setDraft(vendor);
  }, [vendor.id]);
  // Compare only the entity-editable fields — attachments are read-only here.
  const dirty = useMemo(() => {
    const keys: (keyof AdminVendorGrouped)[] = [
      "name",
      "domain",
      "homeUrl",
      "aboutUrl",
      "logoUrl",
      "tagline",
      "bio",
      "location",
      "coverUrl",
    ];
    return keys.some((k) => draft[k] !== vendor[k]);
  }, [draft, vendor]);

  const invalidate = () => {
    // Every instrument query may reflect the edited vendor metadata, so
    // invalidate the broad list. Per-attachment query keys are nested under
    // the instrument keys, so this catches them too.
    queryClient.invalidateQueries({ queryKey: ["/api/instruments"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/admin/vendors/${vendor.vendorId}`, {
        name: draft.name,
        domain: draft.domain,
        homeUrl: draft.homeUrl,
        aboutUrl: draft.aboutUrl,
        logoUrl: draft.logoUrl,
        tagline: draft.tagline,
        bio: draft.bio,
        location: draft.location,
        coverUrl: draft.coverUrl,
      });
    },
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: async () => {
      // Deleting the vendor entity cascades to every attachment using it.
      await apiRequest("DELETE", `/api/admin/vendors/${vendor.vendorId}`);
    },
    onSuccess: () => {
      invalidate();
      onDeleted();
    },
  });

  const logoFallback = useMemo(() => {
    if (draft.logoUrl) return draft.logoUrl;
    if (draft.domain)
      return `https://www.google.com/s2/favicons?sz=128&domain=${draft.domain}`;
    return "";
  }, [draft.logoUrl, draft.domain]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 border-b border-slate-200 flex items-center gap-4">
        {logoFallback ? (
          <img
            src={logoFallback}
            alt=""
            className="w-14 h-14 rounded bg-slate-50 object-contain shrink-0 border border-slate-200"
          />
        ) : (
          <div className="w-14 h-14 rounded bg-slate-100 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <h1
            className="text-slate-900 text-lg font-semibold truncate"
            data-testid="text-vendor-title"
          >
            {draft.name || "Untitled vendor"}
          </h1>
          <p className="text-[12px] text-slate-500 truncate">
            {draft.domain || "no domain"}
          </p>
        </div>
      </div>

      {/* Tab strip — About | Gear N | Artists N. Mirrors PersonEditor and
          the fan-side VendorSheet so the admin can flip between the editable
          form and the read-only catalog views without leaving the pane. */}
      <div role="tablist" aria-label="Vendor editor sections" className="flex gap-5 border-b border-slate-200 px-6">
        {(["about", "gear", "artists"] as const).map((t) => {
          const active = tab === t;
          const label = t === "about" ? "About" : t === "gear" ? "Gear" : "Artists";
          const count = t === "gear" ? gearCount : t === "artists" ? artistsCount : undefined;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              id={`tab-admin-vendor-${t}`}
              aria-selected={active}
              aria-controls={`panel-admin-vendor-${t}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t)}
              className="relative pb-2.5 pt-4 text-[13px] font-semibold tracking-wide transition-colors"
              style={{ color: active ? "#0f172a" : "#64748b" }}
              data-testid={`tab-admin-vendor-${t}`}
            >
              <span className="flex items-center gap-1.5">
                {label}
                {typeof count === "number" && count > 0 && (
                  <span className="text-[11px] font-medium text-slate-400">{count}</span>
                )}
              </span>
              {active && (
                <span className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full" style={{ background: "#319ED8" }} />
              )}
            </button>
          );
        })}
      </div>

      {tab === "gear" && (
        <div
          role="tabpanel"
          id="panel-admin-vendor-gear"
          aria-labelledby="tab-admin-vendor-gear"
          className="px-6 py-5"
          data-testid="panel-admin-vendor-gear"
        >
          {gearCount === 0 ? (
            <p className="text-slate-400 text-sm">
              Not attached to any instrument yet. Add a vendor row inside an instrument's editor to populate this list.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-md">
              {vendor.attachments.map((a) => (
                <li key={a.attachmentId}>
                  <button
                    type="button"
                    onClick={() => onJumpToInstrument(a.instrumentId)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                    data-testid={`link-vendor-instrument-${a.instrumentId}`}
                  >
                    {a.instrumentPhotoUrl ? (
                      <img
                        src={a.instrumentPhotoUrl}
                        alt=""
                        className="w-10 h-10 rounded-md object-cover border border-slate-200 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-slate-100 border border-slate-200 flex-shrink-0" aria-hidden="true" />
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-slate-800 truncate">{a.instrumentName}</span>
                      {a.instrumentCategory && (
                        <span className="block text-[11px] text-slate-400 truncate">{a.instrumentCategory}</span>
                      )}
                    </span>
                    {a.isHidden && (
                      <span className="text-[10px] uppercase tracking-wider text-[#FF5470] bg-[#FF5470]/10 border border-[#FF5470]/30 rounded px-1.5 py-0.5">
                        Hidden
                      </span>
                    )}
                    <span className="text-slate-300 text-xs">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            Every instrument this vendor is attached to. Tap to open and edit the per-attachment affiliate URL or visibility.
          </p>
        </div>
      )}

      {tab === "artists" && (
        <div
          role="tabpanel"
          id="panel-admin-vendor-artists"
          aria-labelledby="tab-admin-vendor-artists"
          className="px-6 py-5"
          data-testid="panel-admin-vendor-artists"
        >
          {!vendor.vendorId ? (
            <p className="text-slate-400 text-sm">No vendor record yet — save first to load credited artists.</p>
          ) : !vendorProfile ? (
            <p className="text-slate-400 text-sm">Loading…</p>
          ) : artistsCount === 0 ? (
            <p className="text-slate-400 text-sm">
              No artists have credited this vendor's instruments on a track yet. As SuperCredits™ are filled in across the catalog, performers who played one of {draft.name || "this vendor"}'s instruments will show up here.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-md">
              {vendorProfile.artists.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  {p.photoUrl ? (
                    <img src={p.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-semibold"
                      style={{ background: "#319ED8" }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="flex-1 text-sm text-slate-700 truncate">{p.name}</span>
                  <span className="text-[11px] text-slate-400">
                    {p.trackCount} {p.trackCount === 1 ? "track" : "tracks"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            From SuperCredits™ — performers who've credited one of this vendor's instruments. Producers and lyricists won't appear because the vendor sheet is reached through gear.
          </p>
        </div>
      )}

      {tab === "about" && (
      <div
        role="tabpanel"
        id="panel-admin-vendor-about"
        aria-labelledby="tab-admin-vendor-about"
        className="px-6 py-5 space-y-3 max-w-2xl"
        data-testid="panel-admin-vendor-about"
      >
        <Field label="Vendor name">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className={inputCls}
            data-testid="input-vendor-pane-name"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Domain (unique key)">
            <input
              value={draft.domain}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  domain: e.target.value.toLowerCase().replace(/^www\./, ""),
                })
              }
              placeholder="cartervintage.com"
              className={inputCls}
              data-testid="input-vendor-pane-domain"
            />
          </Field>
          <Field label="Home URL">
            <input
              value={draft.homeUrl ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, homeUrl: e.target.value || null })
              }
              placeholder="https://cartervintage.com/"
              className={inputCls}
              data-testid="input-vendor-pane-home"
            />
          </Field>
        </div>
        <Field label="About URL (homepage)">
          <input
            value={draft.aboutUrl ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, aboutUrl: e.target.value || null })
            }
            className={inputCls}
            data-testid="input-vendor-pane-about"
          />
        </Field>
        <Field label="Tagline (one-liner)">
          <input
            value={draft.tagline ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, tagline: e.target.value || null })
            }
            className={inputCls}
            data-testid="input-vendor-pane-tagline"
          />
        </Field>
        <Field label="Location">
          <input
            value={draft.location ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, location: e.target.value || null })
            }
            placeholder="Nashville, TN"
            className={inputCls}
            data-testid="input-vendor-pane-location"
          />
        </Field>

        {/* Logo + cover both go through ArtworkPicker so admins can paste a
            URL, drop a file, or upload from disk — the same UX as albums,
            people, and instruments. Logo falls back to the site favicon at
            render time, so leaving it blank is still fine for most vendors. */}
        <Field label="Logo (circular). Leave blank to use site favicon.">
          <ArtworkPicker
            value={draft.logoUrl ?? ""}
            onChange={(v) => setDraft({ ...draft, logoUrl: v || null })}
            shape="circle"
            testId="input-vendor-pane-logo"
            hint="Square. 200×200 px min (400×400 retina). Transparent PNG or SVG. Falls back to a Google-served favicon if empty."
          />
        </Field>
        <Field label="Cover / hero background">
          <ArtworkPicker
            value={draft.coverUrl ?? ""}
            onChange={(v) => setDraft({ ...draft, coverUrl: v || null })}
            testId="input-vendor-pane-cover"
            hint="Wide hero. 1200×400 px recommended (2400×800 retina). JPG. Storefront, workshop, or hero product shot."
          />
        </Field>
        <Field label="Bio (short paragraph)">
          <textarea
            value={draft.bio ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, bio: e.target.value || null })
            }
            className={`${inputCls} min-h-[100px]`}
            data-testid="input-vendor-pane-bio"
          />
        </Field>
      </div>
      )}

      <div className="px-6 py-4 border-t border-slate-200 flex items-center gap-3 sticky bottom-0 bg-white">
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete "${draft.name || "this vendor"}"?`))
              del.mutate();
          }}
          className="px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50 rounded mr-auto"
          data-testid="button-delete-vendor-pane"
        >
          Delete vendor
        </button>
        <button
          type="button"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          className="px-4 py-1.5 text-[13px] rounded bg-[#319ED8] text-white disabled:opacity-40"
          data-testid="button-save-vendor-pane"
        >
          {save.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </div>
    </div>
  );
}

// Phone-frame preview that mirrors the fan-side InstrumentSheet so admins
// can see how their edits will render *before* publishing. Reads the live
// instrument record (same query key as the editor — TanStack dedupes the
// fetch) so prefilled fields appear here moments after the scrape.
// Mirrors the fan-side InstrumentAboutSection (AlbumDetail.tsx). Parses the
// raw `about` blob into prose + "Label: Value" specs and shows an
// Apple-Music-style About/Specs segmented control inside the phone preview
// so admins see the dense spec list collapsed behind a tap — exactly how
// fans will.
function parseAdminInstrumentAbout(about: string): {
  prose: string;
  specs: { label: string; value: string }[];
} {
  const lines = about.split(/\r?\n/);
  const proseLines: string[] = [];
  const specs: { label: string; value: string }[] = [];
  const specLine = /^\s*([A-Z][A-Za-z0-9 /()&'.-]{0,40}):\s+(.{1,80})\s*$/;
  for (const raw of lines) {
    const m = raw.match(specLine);
    const looksProse =
      m && (/[.!?]\s+\S/.test(m[2]) || /[.!?]["')\]]?\s*$/.test(m[2]));
    if (m && !looksProse) {
      specs.push({ label: m[1].trim(), value: m[2].trim() });
    } else {
      proseLines.push(raw);
    }
  }
  const prose = proseLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { prose, specs };
}

function InstrumentPreviewAbout({
  category,
  about,
}: {
  category: string;
  about: string;
}) {
  const { prose, specs } = useMemo(
    () => parseAdminInstrumentAbout(about),
    [about],
  );
  const hasProse = prose.length > 0;
  const hasSpecs = specs.length > 0;
  const [tab, setTab] = useState<"about" | "specs">(
    hasProse ? "about" : "specs",
  );
  const showBoth = hasProse && hasSpecs;

  if (!hasSpecs) {
    return (
      <div className="px-5 pb-4">
        <p
          className="text-[12.5px] leading-relaxed whitespace-pre-line"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          {prose || about}
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 pb-4">
      {showBoth && (
        <div
          className="flex items-center gap-1 p-1 rounded-full mb-3"
          style={{ background: "rgba(255,255,255,0.06)" }}
          role="tablist"
          aria-label="About or specs"
        >
          {(["about", "specs"] as const).map((v) => {
            const active = tab === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setTab(v)}
                aria-pressed={active}
                className="flex-1 h-7 rounded-full text-[11.5px] font-semibold transition-colors"
                style={{
                  background: active ? "rgba(255,255,255,0.14)" : "transparent",
                  color: active ? "#ffffff" : "rgba(235,235,245,0.55)",
                }}
                data-testid={`tab-preview-instrument-${v}`}
              >
                {v === "about" ? "About" : "Specs"}
              </button>
            );
          })}
        </div>
      )}
      {tab === "about" && hasProse && (
        <p
          className="text-[12.5px] leading-relaxed whitespace-pre-line"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          {prose}
        </p>
      )}
      {tab === "specs" && (
        <dl
          className="text-[11.5px] leading-snug"
          data-testid="list-preview-instrument-specs"
        >
          {specs.map((s, i) => (
            <div
              key={`${s.label}-${i}`}
              className="grid grid-cols-[42%_58%] gap-2 py-1.5"
              style={{
                borderTop:
                  i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <dt style={{ color: "rgba(235,235,245,0.55)" }}>{s.label}</dt>
              <dd className="text-white">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function InstrumentPreviewCard({ instrumentId }: { instrumentId: string }) {
  const { data } = useQuery<AdminInstrument>({
    queryKey: ["/api/instruments", instrumentId],
  });
  return (
    <>
      <div
        className="relative rounded-[42px] overflow-hidden shadow-2xl"
        style={{
          width: 360,
          height: 760,
          background: "#00062B",
          padding: 10,
          boxShadow:
            "0 0 0 2px rgba(255,255,255,0.08), 0 30px 70px rgba(0,0,0,0.6)",
        }}
        data-testid="preview-instrument"
      >
        <div className="w-full h-full rounded-[32px] overflow-hidden bg-[#00062B] flex flex-col">
          {/* Mock status bar */}
          <div
            className="flex-shrink-0 flex items-center justify-between px-5 pt-3 pb-1 text-[11px] font-medium"
            style={{ color: "#ffffff" }}
          >
            <span>9:41</span>
            <span>● ● ●</span>
          </div>
          {/* Sheet chrome — back chevron + share/bookmark hints */}
          <div className="flex-shrink-0 flex items-center justify-between px-3 pb-2">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.10)", color: "#ffffff" }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-full"
                style={{ background: "rgba(255,255,255,0.10)" }}
              />
              <div
                className="w-9 h-9 rounded-full"
                style={{ background: "rgba(255,255,255,0.10)" }}
              />
            </div>
          </div>
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto scrollbar-hide pb-6">
            <div
              className="mx-5 mt-1 rounded-2xl overflow-hidden mb-4"
              style={{
                aspectRatio: "16 / 10",
                background: "linear-gradient(135deg, #1a1f4a 0%, #2a1156 100%)",
              }}
            >
              {data?.photoUrl ? (
                <img
                  src={data.photoUrl}
                  alt={data.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-xs"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  No photo yet
                </div>
              )}
            </div>
            <div className="px-5 pb-3">
              <p
                className="text-[11px] font-medium uppercase tracking-wider mb-1"
                style={{ color: "#4AFFCA" }}
              >
                {data?.shortCategory || data?.category || "Instrument"}
              </p>
              <h2
                className="text-[22px] font-bold leading-tight"
                style={{ color: "#ffffff" }}
              >
                {data?.name || "Untitled instrument"}
              </h2>
            </div>
            {data?.about && (
              <InstrumentPreviewAbout
                category={data.shortCategory || data.category || "Instrument"}
                about={data.about}
              />
            )}
            {data?.artistNote && (
              <div
                className="mx-5 mb-4 rounded-xl p-3"
                style={{
                  background: "rgba(74,255,202,0.08)",
                  border: "1px solid rgba(74,255,202,0.18)",
                }}
              >
                <p
                  className="text-[10px] font-medium uppercase tracking-wider mb-1"
                  style={{ color: "#4AFFCA" }}
                >
                  Artist note
                </p>
                <p
                  className="text-[13px] leading-relaxed"
                  style={{ color: "#ffffff" }}
                >
                  {data.artistNote}
                </p>
              </div>
            )}
            {data?.vendors &&
              data.vendors.filter((v) => !v.isHidden).length > 0 && (
                <div className="px-5 pb-3">
                  <p
                    className="text-[11px] font-medium uppercase tracking-wider mb-2"
                    style={{ color: "rgba(255,255,255,0.55)" }}
                  >
                    Discover more / Buy
                  </p>
                  <div className="space-y-2">
                    {data.vendors
                      .filter((v) => !v.isHidden)
                      .map((v) => {
                        const logo =
                          v.logoUrl ||
                          (() => {
                            try {
                              return `https://www.google.com/s2/favicons?sz=128&domain=${new URL(v.affiliateUrl).hostname}`;
                            } catch {
                              return "";
                            }
                          })();
                        let host = "";
                        try {
                          host = new URL(v.affiliateUrl).hostname.replace(
                            /^www\./,
                            "",
                          );
                        } catch {
                          /* */
                        }
                        return (
                          <div
                            key={v.id}
                            className="rounded-xl p-3 flex items-center gap-3"
                            style={{ background: "rgba(255,255,255,0.06)" }}
                          >
                            {logo ? (
                              <img
                                src={logo}
                                alt=""
                                className="w-9 h-9 rounded object-contain"
                                style={{ background: "rgba(255,255,255,0.10)" }}
                              />
                            ) : (
                              <div
                                className="w-9 h-9 rounded"
                                style={{ background: "rgba(255,255,255,0.10)" }}
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <div
                                className="text-[13px] font-medium truncate"
                                style={{ color: "#ffffff" }}
                              >
                                {v.name}
                              </div>
                              <div
                                className="text-[11px] truncate"
                                style={{ color: "rgba(255,255,255,0.50)" }}
                              >
                                {v.tagline || host}
                              </div>
                            </div>
                            <div
                              className="text-[14px]"
                              style={{ color: "rgba(255,255,255,0.45)" }}
                            >
                              ›
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
          </div>
        </div>
      </div>
      <p className="text-slate-300 text-xs mt-3">
        Preview of the in-app InstrumentSheet.
      </p>
    </>
  );
}

// Phone-frame preview of the full fan-side Artist page. We iframe the
// real /artist/<slug> route so the preview can never drift from what fans
// see (GoodTunes Releases + Discography on Streaming buckets, About, the
// works). Same-origin so cookies/auth carry over and the React Query
// cache writes the admin already made are immediately visible.
function PersonPreviewCard({ person }: { person: AdminPerson }) {
  const slug = encodeURIComponent(person.name || "");
  const src = person.name ? `/artist/${slug}` : "";
  return (
    <>
      <div
        className="relative rounded-[42px] overflow-hidden shadow-2xl"
        style={{
          width: 360,
          height: 760,
          background: "#00062B",
          padding: 10,
          boxShadow:
            "0 0 0 2px rgba(255,255,255,0.08), 0 30px 70px rgba(0,0,0,0.6)",
        }}
        data-testid="preview-person"
      >
        <div className="w-full h-full rounded-[32px] overflow-hidden bg-[#00062B]">
          {src ? (
            <iframe
              key={src}
              src={src}
              title={`Artist page preview — ${person.name}`}
              className="w-full h-full border-0 block"
              data-testid="iframe-preview-person"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/50 text-sm text-center px-6">
              Add a name to preview this artist's page.
            </div>
          )}
        </div>
      </div>
      <p className="text-slate-300 text-xs mt-3">
        Live preview of /artist/{person.name || "…"} — the page fans see.
      </p>
    </>
  );
}

// Renders the standard row of small circular social icons used in the
// PersonPreviewCard (and reusable later for the fan-side PerformerSheet).
// Order is intentional: streaming first (where the music is), then the
// platforms artists are most active on, then the generic website fallback.
// Compact strip of platform-icon buttons that doubles as a tab control
// for the single streaming/social URL input in PersonEditor:
//   - mint check overlay = that platform's URL is filled
//   - blue ring + bold border = that platform is the currently revealed tab
// Used in the admin form, NOT on the fan-facing PerformerSheet (that's
// SocialIconRow's job).
function SocialFieldShortcuts({
  filled,
  activeKey,
  onSelect,
}: {
  filled: Record<string, boolean>;
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const items: { key: string; Icon: any; label: string }[] = [
    { key: "apple", Icon: SiApplemusic, label: "Apple Music" },
    { key: "spotify", Icon: SiSpotify, label: "Spotify" },
    { key: "instagram", Icon: SiInstagram, label: "Instagram" },
    { key: "tiktok", Icon: SiTiktok, label: "TikTok" },
    { key: "twitter", Icon: SiX, label: "X / Twitter" },
    { key: "bluesky", Icon: SiBluesky, label: "Bluesky" },
    { key: "facebook", Icon: SiFacebook, label: "Facebook" },
    { key: "website", Icon: Globe, label: "Website" },
  ];
  const count = items.filter((i) => filled[i.key]).length;
  return (
    <div data-testid="row-social-shortcuts">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
          Streaming &amp; social links
        </span>
        <span className="text-[11px] text-slate-400">
          {count} of {items.length} filled
        </span>
      </div>
      <div
        className="flex flex-wrap items-center gap-2"
        role="tablist"
        aria-label="Streaming and social platforms"
      >
        {items.map(({ key, Icon, label }) => {
          const isFilled = !!filled[key];
          const isActive = key === activeKey;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(key)}
              aria-label={`${label}${isFilled ? " (filled)" : " (empty)"}${isActive ? " — selected" : ""}`}
              title={`${label}${isFilled ? " — filled" : ""}`}
              className={
                "relative w-9 h-9 rounded-full flex items-center justify-center transition-all " +
                (isFilled
                  ? "bg-slate-900 text-white border border-slate-900 hover:bg-slate-800"
                  : "bg-white text-slate-400 border border-slate-200 hover:border-slate-400 hover:text-slate-600") +
                (isActive
                  ? " ring-2 ring-[#319ED8] ring-offset-2 ring-offset-[#f7fbff]"
                  : "")
              }
              data-testid={`button-shortcut-${key}`}
            >
              <Icon size={15} />
              {isFilled && (
                <span
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#4AFFCA] flex items-center justify-center ring-2 ring-white"
                  aria-hidden="true"
                >
                  <Check size={9} className="text-slate-900" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SocialIconRow({ person }: { person: AdminPerson }) {
  const links: {
    key: string;
    url: string;
    Icon: React.ComponentType<{ size?: number; className?: string }>;
    label: string;
  }[] = [
    person.appleMusicUrl && {
      key: "apple",
      url: person.appleMusicUrl,
      Icon: SiApplemusic,
      label: "Apple Music",
    },
    person.spotifyUrl && {
      key: "spotify",
      url: person.spotifyUrl,
      Icon: SiSpotify,
      label: "Spotify",
    },
    person.instagramUrl && {
      key: "instagram",
      url: person.instagramUrl,
      Icon: SiInstagram,
      label: "Instagram",
    },
    person.tiktokUrl && {
      key: "tiktok",
      url: person.tiktokUrl,
      Icon: SiTiktok,
      label: "TikTok",
    },
    person.twitterUrl && {
      key: "twitter",
      url: person.twitterUrl,
      Icon: SiX,
      label: "X",
    },
    person.blueskyUrl && {
      key: "bluesky",
      url: person.blueskyUrl,
      Icon: SiBluesky,
      label: "Bluesky",
    },
    person.facebookUrl && {
      key: "facebook",
      url: person.facebookUrl,
      Icon: SiFacebook,
      label: "Facebook",
    },
    person.websiteUrl && {
      key: "website",
      url: person.websiteUrl,
      Icon: Globe,
      label: "Website",
    },
  ].filter(Boolean) as { key: string; url: string; Icon: any; label: string }[];

  if (links.length === 0) return null;

  return (
    <div
      className="px-5 pt-5 pb-5 mt-auto flex flex-wrap items-center gap-2.5"
      data-testid="row-person-socials"
    >
      {links.map(({ key, url, Icon, label }) => (
        <a
          key={key}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${label} in a new tab`}
          title={`Open ${label}`}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          style={{ background: "rgba(255,255,255,0.10)" }}
          data-testid={`link-social-${key}`}
        >
          <Icon size={16} />
        </a>
      ))}
    </div>
  );
}

// Phone-frame preview mirroring the fan-side VendorSheet hero so admins can
// see exactly how the cover image, logo, name, tagline and bio land before
// publishing. We don't replicate the full sheet (vendor pages have action
// buttons, "About", and "Used by these artists" sections that don't add much
// to a design preview) — just the hero + bio, which is everything that
// actually changes when the admin edits the form.
function VendorPreviewCard({
  vendor,
}: {
  vendor: AdminVendorGrouped;
}) {
  // Mirror the fan-side VendorSheet so admins see exactly what fans see.
  // Tabs are interactive (About / Gear / Artists) and the scroll region
  // scrolls — both are needed for an admin to actually proof a long bio
  // or a vendor that's attached to dozens of instruments.
  const [tab, setTab] = useState<"about" | "gear" | "artists">("about");
  const [bioExpanded, setBioExpanded] = useState(false);
  const visibleAttachments = vendor.attachments
    .filter((a) => !a.isHidden)
    // Same Apple-Music / Spotify rule as artists/albums: alphabetical by
    // display name, case- and accent-insensitive. Once instruments grow a
    // dedicated `year` column we can flip this to year-desc and add a
    // brand chip filter (see TODO in the user-facing notes).
    .sort((a, b) =>
      (a.instrumentName ?? "").localeCompare(
        b.instrumentName ?? "",
        undefined,
        { sensitivity: "base" },
      ),
    );
  const gearCount = visibleAttachments.length;
  // "Featured instrument" on the real sheet is the instrument that opened it;
  // in the admin preview we don't have that context, so we show the first
  // visible attachment as a representative example.
  const featuredInstrumentName =
    visibleAttachments[0]?.instrumentName ?? null;

  const domain = (() => {
    const raw = vendor.aboutUrl ?? vendor.homeUrl ?? "";
    try {
      return new URL(raw).hostname.replace(/^www\./, "");
    } catch {
      return vendor.domain || "";
    }
  })();
  const tagline = vendor.tagline ?? domain;
  const bioFallback = `${vendor.name || "This vendor"} is one of the trusted shops we link out to from SuperCredits™. Tap the globe icon to visit their full catalog, or start a chat to ask about availability, condition, and shipping.`;

  const IconBtn = ({
    children,
    testId,
  }: {
    children: React.ReactNode;
    testId?: string;
  }) => (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-white/85"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(12px)" }}
      data-testid={testId}
    >
      {children}
    </div>
  );

  return (
    <>
      <div
        className="relative rounded-[42px] overflow-hidden shadow-2xl"
        style={{
          width: 360,
          height: 760,
          background: "#00062B",
          padding: 10,
          boxShadow:
            "0 0 0 2px rgba(255,255,255,0.08), 0 30px 70px rgba(0,0,0,0.6)",
        }}
        data-testid="preview-vendor"
      >
        <div className="w-full h-full rounded-[32px] overflow-hidden bg-[#00062B] flex flex-col">
          {/* Mock status bar */}
          <div className="flex-shrink-0 flex items-center justify-between px-5 pt-3 pb-1 text-[11px] font-medium text-white">
            <span>9:41</span>
            <span>● ● ●</span>
          </div>

          {/* Scrollable region — matches fan sheet order
              (floating toolbar → hero → profile row → tabs → tab content)
              and uses overflow-y-auto so a long bio or big Gear list is
              actually reachable inside the phone frame. */}
          <div className="flex-1 overflow-y-auto scrollbar-hide relative">
            {/* Floating toolbar — back + bookmark + share + globe + chat */}
            <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-3 pt-2">
              <IconBtn testId="preview-vendor-back">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </IconBtn>
              <div className="flex items-center gap-1.5">
                <IconBtn>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </IconBtn>
                <IconBtn>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3v12" />
                    <path d="M7 8l5-5 5 5" />
                    <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
                  </svg>
                </IconBtn>
                <IconBtn>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18" />
                    <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
                  </svg>
                </IconBtn>
                <IconBtn>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </IconBtn>
              </div>
            </div>

            {/* Hero — square-ish cover (matches fan sheet aspectRatio: 1 / 1.05) */}
            <div className="relative w-full" style={{ aspectRatio: "1 / 1.05" }}>
              {vendor.coverUrl ? (
                <img
                  src={vendor.coverUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  data-testid="img-preview-vendor-cover"
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(135deg, #1a1f4a 0%, #2a1156 50%, #00062B 100%)",
                  }}
                >
                  {vendor.logoUrl && (
                    <>
                      <img
                        src={vendor.logoUrl}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{
                          filter: "blur(40px) saturate(160%)",
                          transform: "scale(1.3)",
                          opacity: 0.85,
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div
                          className="w-32 h-32 rounded-full flex items-center justify-center overflow-hidden"
                          style={{
                            background: "rgba(255,255,255,0.55)",
                            backdropFilter: "blur(8px)",
                          }}
                        >
                          <img
                            src={vendor.logoUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            style={{ opacity: 0.92 }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              {/* Bottom gradient — soft fade into #00062B so the avatar overlap
                  sits clean against the page bg (matches fan sheet). */}
              <div
                className="absolute inset-x-0 bottom-0 h-1/3"
                style={{
                  background:
                    "linear-gradient(to bottom, rgba(0,6,43,0) 0%, #00062B 100%)",
                }}
              />
            </div>

            {/* Instagram-style profile row: gradient-ring logo overlapping
                the hero, then name + domain beside it. */}
            <div className="px-5 -mt-10 relative flex items-end gap-3">
              <div
                className="flex-shrink-0 w-[72px] h-[72px] rounded-full p-[3px]"
                style={{
                  background:
                    "linear-gradient(135deg, #4AFFCA 0%, #319ED8 50%, #7F10A7 100%)",
                }}
                data-testid="preview-vendor-avatar"
              >
                <div
                  className="w-full h-full rounded-full overflow-hidden flex items-center justify-center"
                  style={{ background: "#fff" }}
                >
                  {vendor.logoUrl ? (
                    <img
                      src={vendor.logoUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span
                      className="text-[26px] font-bold"
                      style={{ color: "#00062B" }}
                    >
                      {(vendor.name || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1 pb-1">
                {/* Allow the name to wrap to a second line (or shrink one
                    notch) instead of truncating — vendor names like "Carter
                    Vintage Guitars" routinely lose their tail otherwise.
                    14px stays within Apple HIG for a secondary header on a
                    profile row; the wrap cap keeps it from blowing the row
                    height on extreme cases. */}
                <h2
                  className="text-white font-bold leading-tight tracking-tight line-clamp-2 break-words"
                  style={{ fontSize: (vendor.name?.length ?? 0) > 18 ? 17 : 20 }}
                  data-testid="text-preview-vendor-name"
                >
                  {vendor.name || "Untitled vendor"}
                </h2>
                {tagline && (
                  <p
                    className="text-[13px] mt-0.5 line-clamp-2"
                    style={{ color: "rgba(235,235,245,0.7)" }}
                  >
                    {tagline}
                  </p>
                )}
              </div>
            </div>

            {/* Tabs — About | Gear N | Artists. Interactive so admins can
                proof each tab; "Artists" (not "People") because you only
                land on a vendor sheet through gear, so the only people who
                end up here are performers who actually played one. */}
            <div className="px-5 pt-4">
              <div className="flex gap-5 border-b border-white/10">
                {([
                  { key: "about", label: "About", count: undefined as number | undefined },
                  { key: "gear", label: "Gear", count: gearCount > 0 ? gearCount : undefined },
                  { key: "artists", label: "Artists", count: undefined },
                ] as const).map((t) => {
                  const active = tab === t.key;
                  return (
                    <button
                      type="button"
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className="relative pb-2 text-[14px] font-semibold active:opacity-80"
                      style={{
                        color: active ? "#fff" : "rgba(235,235,245,0.55)",
                      }}
                      data-testid={`tab-preview-vendor-${t.key}`}
                    >
                      {t.label}
                      {typeof t.count === "number" && (
                        <span
                          className="ml-1.5 text-[12px] font-medium"
                          style={{ color: "rgba(235,235,245,0.45)" }}
                        >
                          {t.count}
                        </span>
                      )}
                      {active && (
                        <span
                          aria-hidden
                          className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full"
                          style={{ background: "#319ED8" }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {tab === "about" && (
              <div className="px-5 pt-4 pb-6">
                <h3 className="text-white text-[18px] font-bold leading-tight tracking-tight mb-1.5">
                  About {vendor.name || "this vendor"}
                </h3>
                {(() => {
                  const body = vendor.bio || bioFallback;
                  // Bio toggle: clamp to 5 lines by default, full text on tap.
                  // Mirrors how the fan sheet renders long copy (the real sheet
                  // is scrollable end-to-end, but the preview lives inside a
                  // mock phone so we collapse + reveal instead). The "more" /
                  // "less" affordance keeps the admin in control of how much
                  // they want to see at once.
                  const isLong = body.length > 260;
                  return (
                    <>
                      <p
                        className={`text-[13px] leading-relaxed ${
                          isLong && !bioExpanded ? "line-clamp-5" : ""
                        }`}
                        style={{ color: "rgba(235,235,245,0.72)" }}
                        data-testid="text-preview-vendor-bio"
                      >
                        {body}
                      </p>
                      {isLong && (
                        <button
                          type="button"
                          onClick={() => setBioExpanded((v) => !v)}
                          className="mt-1.5 text-[13px] font-semibold active:opacity-70"
                          style={{ color: "#319ED8" }}
                          data-testid="button-preview-vendor-bio-toggle"
                        >
                          {bioExpanded ? "less" : "more"}
                        </button>
                      )}
                    </>
                  );
                })()}

                {vendor.location && (
                  <div className="mt-4">
                    <p className="text-[12px] mb-0.5" style={{ color: "rgba(235,235,245,0.55)" }}>
                      Location
                    </p>
                    <p className="text-white text-[14px]">{vendor.location}</p>
                  </div>
                )}

                {domain && (
                  <div className="mt-4">
                    <p className="text-[12px] mb-0.5" style={{ color: "rgba(235,235,245,0.55)" }}>
                      Web
                    </p>
                    <p className="text-[14px]" style={{ color: "#319ED8" }}>
                      {domain}
                    </p>
                  </div>
                )}

                {featuredInstrumentName && (
                  <div className="mt-4">
                    <p className="text-[12px] mb-0.5" style={{ color: "rgba(235,235,245,0.55)" }}>
                      Featured instrument
                    </p>
                    <p className="text-white text-[14px]">{featuredInstrumentName}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "rgba(235,235,245,0.45)" }}>
                      The instrument that opened this page — tap the Gear tab to see the rest.
                    </p>
                  </div>
                )}
              </div>
            )}

            {tab === "gear" && (
              <div className="px-5 pt-4 pb-6">
                <h3 className="text-white text-[18px] font-bold leading-tight tracking-tight mb-3">
                  Gear
                </h3>
                {gearCount === 0 ? (
                  <p className="text-[13px]" style={{ color: "rgba(235,235,245,0.5)" }}>
                    Not attached to any instrument yet. Add a vendor row inside an instrument's editor to populate this list.
                  </p>
                ) : (
                  // 2-col grid of instrument tiles — same shape as the
                  // LabelPreviewCard Music tab and the fan-side Artist
                  // Albums grid, so every "list of stuff" surface reads the
                  // same way across admin previews.
                  <div className="grid grid-cols-2 gap-3">
                    {visibleAttachments.map((a) => (
                      <div
                        key={a.attachmentId}
                        className="flex flex-col text-left"
                        data-testid={`preview-vendor-gear-${a.instrumentId}`}
                      >
                        <div
                          className="aspect-square rounded-2xl overflow-hidden"
                          style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}
                        >
                          {a.instrumentPhotoUrl ? (
                            <img
                              src={a.instrumentPhotoUrl}
                              alt={a.instrumentName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center text-white/40 text-[28px]"
                              style={{ background: "rgba(255,255,255,0.06)" }}
                              aria-hidden
                            >
                              ♪
                            </div>
                          )}
                        </div>
                        <p className="text-white text-[13px] font-semibold leading-tight truncate mt-2">
                          {a.instrumentName}
                        </p>
                        {a.instrumentCategory && (
                          <p
                            className="text-[11px] truncate mt-0.5"
                            style={{ color: "rgba(235,235,245,0.5)" }}
                          >
                            {a.instrumentCategory}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "artists" && (
              <div className="px-5 pt-4 pb-6">
                <h3 className="text-white text-[18px] font-bold leading-tight tracking-tight mb-3">
                  Artists
                </h3>
                <p className="text-[13px]" style={{ color: "rgba(235,235,245,0.5)" }}>
                  Live in the app — pulls from SuperCredits™. Any performer who's credited one of {vendor.name || "this vendor"}'s instruments on a track shows up here.
                </p>
                <p className="pt-3 text-[11px] leading-relaxed" style={{ color: "rgba(235,235,245,0.45)" }}>
                  Producers and lyricists won't appear here because vendors are reached through gear; only people who actually played a vendor's instrument get tagged.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="text-slate-300 text-xs mt-3">
        Preview of the in-app VendorSheet (About tab) — surfaces wherever this
        vendor is attached ({gearCount}{" "}
        {gearCount === 1 ? "instrument" : "instruments"}).
      </p>
    </>
  );
}


// Phone-frame preview mirroring VendorPreviewCard one-for-one — same hero
// chrome, same Instagram-style profile row, same tab strip (About | Music N
// | Artists N). The fan-side LabelSheet hasn't shipped yet; when it does we
// swap this for the real layout, but the surfaces should look identical
// from the admin's POV so labels and vendors stay visually consistent.
function LabelPreviewCard({
  label,
  albums,
  people,
}: {
  label: AdminLabel;
  albums: AdminAlbum[];
  people: AdminPerson[];
}) {
  const [tab, setTab] = useState<"about" | "music" | "artists">("about");
  const [bioExpanded, setBioExpanded] = useState(false);

  // Music = every album credited to this label (hidden albums excluded —
  // they're invisible to fans, so the count would lie).
  const labelAlbums = albums.filter(
    (a) => a.labelId === label.id && !a.isHidden,
  );
  const musicCount = labelAlbums.length;

  // Artists = the union of two paths so an artist surfaces here as soon
  // as either link exists:
  //   1) People directly signed to this label via `people.labelId` — a
  //      freshly-linked artist appears in the stable immediately, even
  //      before they have a release.
  //   2) Primary artists on non-hidden albums attached to this label —
  //      either a real Person row (via primaryArtistId) or a snapshot
  //      name from older albums typed in before a Person existed.
  // We do the people-by-labelId pass FIRST and register BOTH an id key
  // and a name key per person. The album pass then dedupes against
  // either, so a signed artist who also has a snapshot-typed album on
  // this label only renders once (and we keep the richer Person row).
  const artistKeys = new Set<string>();
  const artistRows: { id: string; name: string; photoUrl: string | null }[] = [];
  const nameKey = (n: string) =>
    `name:${n.trim().toLowerCase()}`;
  for (const p of people) {
    if (p.labelId !== label.id) continue;
    if (artistKeys.has(p.id)) continue;
    artistKeys.add(p.id);
    artistKeys.add(nameKey(p.name));
    artistRows.push({ id: p.id, name: p.name, photoUrl: p.photoUrl });
  }
  for (const a of labelAlbums) {
    if (a.primaryArtistId) {
      if (artistKeys.has(a.primaryArtistId)) continue;
      const person = people.find((p) => p.id === a.primaryArtistId);
      artistKeys.add(a.primaryArtistId);
      if (person) artistKeys.add(nameKey(person.name));
      artistRows.push({
        id: a.primaryArtistId,
        name: person?.name ?? a.artist ?? "Unknown artist",
        photoUrl: person?.photoUrl ?? null,
      });
      continue;
    }
    const snapshot = (a.artist ?? "").trim();
    if (!snapshot) continue;
    const nk = nameKey(snapshot);
    if (artistKeys.has(nk)) continue;
    artistKeys.add(nk);
    artistRows.push({ id: `name:${snapshot}`, name: snapshot, photoUrl: null });
  }
  // Apple-Music / Spotify standard: alphabetical by display name as a
  // single string (case-insensitive). "Fernando Perdomo" sorts under F,
  // "SoulChef" under S — matches how fans scan a roster.
  artistRows.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  const artistsCount = artistRows.length;

  const domain = (() => {
    const raw = label.websiteUrl ?? "";
    try {
      return new URL(raw).hostname.replace(/^www\./, "");
    } catch {
      return (label.websiteUrl ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    }
  })();
  const tagline = label.location ?? domain;
  const bioFallback = `${label.name || "This label"} releases music on GoodTunes. Tap the globe icon to visit their site, or browse their catalog and roster in the tabs below.`;

  const IconBtn = ({
    children,
    testId,
  }: {
    children: React.ReactNode;
    testId?: string;
  }) => (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-white/85"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(12px)" }}
      data-testid={testId}
    >
      {children}
    </div>
  );

  return (
    <>
      <div
        className="relative rounded-[42px] overflow-hidden shadow-2xl"
        style={{
          width: 360,
          height: 760,
          background: "#00062B",
          padding: 10,
          boxShadow:
            "0 0 0 2px rgba(255,255,255,0.08), 0 30px 70px rgba(0,0,0,0.6)",
        }}
        data-testid="preview-label"
      >
        <div className="w-full h-full rounded-[32px] overflow-hidden bg-[#00062B] flex flex-col">
          <div className="flex-shrink-0 flex items-center justify-between px-5 pt-3 pb-1 text-[11px] font-medium text-white">
            <span>9:41</span>
            <span>● ● ●</span>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide relative">
            {/* Floating toolbar */}
            <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-3 pt-2">
              <IconBtn testId="preview-label-back">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </IconBtn>
              <div className="flex items-center gap-1.5">
                <IconBtn>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </IconBtn>
                <IconBtn>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3v12" />
                    <path d="M7 8l5-5 5 5" />
                    <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
                  </svg>
                </IconBtn>
                <IconBtn>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18" />
                    <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
                  </svg>
                </IconBtn>
                <IconBtn>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </IconBtn>
              </div>
            </div>

            {/* Hero — square-ish cover (matches VendorPreviewCard 1 / 1.05) */}
            <div className="relative w-full" style={{ aspectRatio: "1 / 1.05" }}>
              {label.coverUrl ? (
                <img
                  src={label.coverUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  data-testid="img-preview-label-cover"
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(135deg, #1a1f4a 0%, #2a1156 50%, #00062B 100%)",
                  }}
                >
                  {label.logoUrl && (
                    <>
                      <img
                        src={label.logoUrl}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{
                          filter: "blur(40px) saturate(160%)",
                          transform: "scale(1.3)",
                          opacity: 0.85,
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div
                          className="w-32 h-32 rounded-full flex items-center justify-center overflow-hidden"
                          style={{
                            background: "rgba(255,255,255,0.55)",
                            backdropFilter: "blur(8px)",
                          }}
                        >
                          <img
                            src={label.logoUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            style={{ opacity: 0.92 }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div
                className="absolute inset-x-0 bottom-0 h-1/3"
                style={{
                  background:
                    "linear-gradient(to bottom, rgba(0,6,43,0) 0%, #00062B 100%)",
                }}
              />
            </div>

            {/* Profile row */}
            <div className="px-5 -mt-10 relative flex items-end gap-3">
              <div
                className="flex-shrink-0 w-[72px] h-[72px] rounded-full p-[3px]"
                style={{
                  background:
                    "linear-gradient(135deg, #4AFFCA 0%, #319ED8 50%, #7F10A7 100%)",
                }}
                data-testid="preview-label-avatar"
              >
                <div
                  className="w-full h-full rounded-full overflow-hidden flex items-center justify-center"
                  style={{ background: "#fff" }}
                >
                  {label.logoUrl ? (
                    <img
                      src={label.logoUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span
                      className="text-[26px] font-bold"
                      style={{ color: "#00062B" }}
                    >
                      {(label.name || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <h2
                  className="text-white font-bold leading-tight tracking-tight line-clamp-2 break-words"
                  style={{ fontSize: (label.name?.length ?? 0) > 18 ? 17 : 20 }}
                  data-testid="text-preview-label-name"
                >
                  {label.name || "Untitled label"}
                </h2>
                {tagline && (
                  <p
                    className="text-[13px] mt-0.5 line-clamp-2"
                    style={{ color: "rgba(235,235,245,0.7)" }}
                  >
                    {tagline}
                  </p>
                )}
              </div>
            </div>

            {/* Tabs — About | Music N | Artists N */}
            <div className="px-5 pt-4">
              <div className="flex gap-5 border-b border-white/10">
                {([
                  { key: "about", label: "About", count: undefined as number | undefined },
                  { key: "music", label: "Music", count: musicCount > 0 ? musicCount : undefined },
                  { key: "artists", label: "Artists", count: artistsCount > 0 ? artistsCount : undefined },
                ] as const).map((t) => {
                  const active = tab === t.key;
                  return (
                    <button
                      type="button"
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className="relative pb-2 text-[14px] font-semibold active:opacity-80"
                      style={{
                        color: active ? "#fff" : "rgba(235,235,245,0.55)",
                      }}
                      data-testid={`tab-preview-label-${t.key}`}
                    >
                      {t.label}
                      {typeof t.count === "number" && (
                        <span
                          className="ml-1.5 text-[12px] font-medium"
                          style={{ color: "rgba(235,235,245,0.45)" }}
                        >
                          {t.count}
                        </span>
                      )}
                      {active && (
                        <span
                          aria-hidden
                          className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full"
                          style={{ background: "#319ED8" }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {tab === "about" && (
              <div className="px-5 pt-4 pb-6">
                <h3 className="text-white text-[18px] font-bold leading-tight tracking-tight mb-1.5">
                  About {label.name || "this label"}
                </h3>
                {(() => {
                  const body = label.bio || bioFallback;
                  const isLong = body.length > 260;
                  return (
                    <>
                      <p
                        className={`text-[13px] leading-relaxed whitespace-pre-line ${
                          isLong && !bioExpanded ? "line-clamp-5" : ""
                        }`}
                        style={{ color: "rgba(235,235,245,0.72)" }}
                        data-testid="text-preview-label-bio"
                      >
                        {body}
                      </p>
                      {isLong && (
                        <button
                          type="button"
                          onClick={() => setBioExpanded((v) => !v)}
                          className="mt-1.5 text-[13px] font-semibold active:opacity-70"
                          style={{ color: "#319ED8" }}
                          data-testid="button-preview-label-bio-toggle"
                        >
                          {bioExpanded ? "less" : "more"}
                        </button>
                      )}
                    </>
                  );
                })()}

                {label.location && (
                  <div className="mt-4">
                    <p className="text-[12px] mb-0.5" style={{ color: "rgba(235,235,245,0.55)" }}>
                      Location
                    </p>
                    <p className="text-white text-[14px]">{label.location}</p>
                  </div>
                )}

                {domain && (
                  <div className="mt-4">
                    <p className="text-[12px] mb-0.5" style={{ color: "rgba(235,235,245,0.55)" }}>
                      Web
                    </p>
                    <p className="text-[14px]" style={{ color: "#319ED8" }} data-testid="text-preview-label-website">
                      {domain}
                    </p>
                  </div>
                )}
              </div>
            )}

            {tab === "music" && (
              <div className="px-5 pt-4 pb-6">
                <h3 className="text-white text-[18px] font-bold leading-tight tracking-tight mb-3">
                  Albums
                </h3>
                {musicCount === 0 ? (
                  <p className="text-[13px]" style={{ color: "rgba(235,235,245,0.5)" }}>
                    No albums attached yet. Set this label on an album's editor to populate this list.
                  </p>
                ) : (
                  // 2-col grid of large square tiles — mirrors the fan-side
                  // ArtistDetail "Albums" section so a label sheet feels like
                  // a kind of artist sheet (one label, many artists).
                  <div className="grid grid-cols-2 gap-3">
                    {labelAlbums.map((a) => (
                      <div
                        key={a.id}
                        className="flex flex-col text-left"
                        data-testid={`preview-label-album-${a.id}`}
                      >
                        <div
                          className="aspect-square rounded-2xl overflow-hidden"
                          style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}
                        >
                          {a.artwork ? (
                            <img
                              src={a.artwork}
                              alt={a.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center text-white/40 text-[28px]"
                              style={{ background: "rgba(255,255,255,0.06)" }}
                              aria-hidden
                            >
                              ♪
                            </div>
                          )}
                        </div>
                        <p className="text-white text-[13px] font-semibold leading-tight truncate mt-2">
                          {a.title}
                        </p>
                        <p
                          className="text-[11px] truncate mt-0.5"
                          style={{ color: "rgba(235,235,245,0.5)" }}
                        >
                          {a.year ? `${a.year} · ${a.type}` : a.type}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "artists" && (
              <div className="px-5 pt-4 pb-6">
                <h3 className="text-white text-[18px] font-bold leading-tight tracking-tight mb-3">
                  Artists
                </h3>
                {artistsCount === 0 ? (
                  <p className="text-[13px]" style={{ color: "rgba(235,235,245,0.5)" }}>
                    No artists yet. They'll appear here once an album is attached to this label.
                  </p>
                ) : (
                  // 2-col grid of circular avatars + name centered below.
                  // Mirrors the Apple-Music roster-card look so a label's
                  // artists read as a stable of people, not a list row.
                  <div className="grid grid-cols-2 gap-3">
                    {artistRows.map((p) => {
                      const initials =
                        p.name
                          .split(" ")
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((w) => w[0]?.toUpperCase() ?? "")
                          .join("") || "•";
                      return (
                        <div
                          key={p.id}
                          className="flex flex-col items-center text-center"
                          data-testid={`preview-label-artist-${p.id}`}
                        >
                          {p.photoUrl ? (
                            <img
                              src={p.photoUrl}
                              alt={p.name}
                              className="rounded-full object-cover"
                              style={{
                                width: "100%",
                                aspectRatio: "1 / 1",
                                boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                              }}
                            />
                          ) : (
                            <div
                              className="rounded-full flex items-center justify-center text-white font-semibold"
                              style={{
                                width: "100%",
                                aspectRatio: "1 / 1",
                                background: "#319ED8",
                                fontSize: 32,
                                boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                              }}
                              aria-hidden
                            >
                              {initials}
                            </div>
                          )}
                          <p className="text-white text-[13px] font-semibold leading-tight mt-2 line-clamp-2">
                            {p.name}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="text-slate-300 text-xs mt-3">
        Preview of the in-app LabelSheet — {musicCount}{" "}
        {musicCount === 1 ? "album" : "albums"} ·{" "}
        {artistsCount} {artistsCount === 1 ? "artist" : "artists"}.
      </p>
    </>
  );
}


// ---------- LabelEditor ----------
// Editor pane for one record label. Mirrors the entity-level half of
// VendorPaneEditor: every field here lives on the label row itself, so
// editing once updates the label credit on every album it's attached to.
function LabelEditor({
  labelId,
  onDeleted,
}: {
  labelId: string;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<AdminLabel>({
    queryKey: ["/api/labels", labelId],
  });
  const [form, setForm] = useState<AdminLabel | null>(null);
  const [dirty, setDirty] = useState(false);

  // Paste-a-website-URL state. Mirrors the artist scrape flow but the
  // server endpoint here pulls og:title / og:description and prefers
  // apple-touch-icon as the logo (square, vs og:image which is usually a
  // wide banner). Manual upload via the Logo / Cover pickers below still
  // overrides whatever this returns.
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapeBusy, setScrapeBusy] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (data) {
      setForm({ ...data });
      setDirty(false);
      // Reset the scrape bar when switching to a different label.
      setScrapeUrl("");
      setScrapeMsg(null);
    }
  }, [data?.id]);

  async function runScrape() {
    const u = scrapeUrl.trim();
    if (!u) return;
    setScrapeBusy(true);
    setScrapeMsg(null);
    try {
      const res = await apiRequest("POST", "/api/admin/labels/scrape", {
        url: u,
      });
      const data = (await res.json()) as {
        name: string | null;
        logoUrl: string | null;
        bio: string | null;
        websiteUrl: string | null;
      };
      // Functional merge against the latest form — admin may have typed
      // into name/bio while the scrape was in flight. Never clobber a
      // non-empty existing value.
      setForm((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          name:
            prev.name && prev.name !== "New label"
              ? prev.name
              : data.name || prev.name,
          logoUrl: prev.logoUrl || data.logoUrl,
          bio: prev.bio || data.bio,
          websiteUrl: prev.websiteUrl || data.websiteUrl || u,
        };
      });
      setDirty(true);
      setScrapeMsg({
        kind: "ok",
        text: data.logoUrl
          ? "Filled name, logo, bio, and website. Review and Save."
          : "Filled what we could find. Couldn't pull a logo — upload one below.",
      });
      setScrapeUrl("");
    } catch (e: any) {
      setScrapeMsg({
        kind: "err",
        text: e?.message || "Couldn't read that page.",
      });
    } finally {
      setScrapeBusy(false);
    }
  }

  const invalidateLabelSurfaces = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/labels"] });
    queryClient.invalidateQueries({ queryKey: ["/api/labels", labelId] });
    // Album reads denormalize the joined label, so every cached album
    // detail needs to re-fetch when the label entity changes.
    queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
  };

  const saveLabel = useMutation({
    mutationFn: async (payload: Partial<AdminLabel>) => {
      const res = await apiRequest(
        "PUT",
        `/api/admin/labels/${labelId}`,
        payload,
      );
      return res.json();
    },
    onSuccess: () => {
      invalidateLabelSurfaces();
      setDirty(false);
    },
  });

  const deleteLabel = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/labels/${labelId}`);
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["/api/labels", labelId] });
      invalidateLabelSurfaces();
      onDeleted();
    },
  });

  if (isLoading || !form) {
    return <div className="p-8 text-slate-500">Loading…</div>;
  }

  const set = <K extends keyof AdminLabel>(k: K, v: AdminLabel[K]) => {
    setForm({ ...form, [k]: v });
    setDirty(true);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <div>
          <h2
            className="text-slate-900 text-lg font-semibold"
            data-testid="text-editor-title"
          >
            Edit label
          </h2>
          <p className="text-slate-400 text-xs">{labelId}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  "Delete this label? Albums released on it will lose their label credit (but stay in the catalog).",
                )
              ) {
                deleteLabel.mutate();
              }
            }}
            disabled={deleteLabel.isPending}
            className="px-3 py-1.5 text-[13px] text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50"
            data-testid="button-delete-label"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => saveLabel.mutate(form)}
            disabled={!dirty || saveLabel.isPending}
            className="px-4 py-1.5 text-[13px] font-medium rounded-md bg-[#319ED8] text-white hover:bg-[#319ED8]/90 disabled:opacity-40"
            data-testid="button-save-label"
          >
            {saveLabel.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        <div className="rounded-lg border border-slate-200 bg-[#f7fbff] p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={scrapeUrl}
              onChange={(e) => setScrapeUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runScrape();
                }
              }}
              placeholder="Paste the label's website URL to auto-fill logo, name, and bio"
              className={inputCls + " flex-1"}
              disabled={scrapeBusy}
              data-testid="input-label-scrape-url"
            />
            <OpenUrlButton url={scrapeUrl} testId="button-label-open-url" />
            <button
              type="button"
              onClick={runScrape}
              disabled={scrapeBusy || !scrapeUrl.trim()}
              className="px-3 py-2 rounded-md bg-[#319ED8] text-white text-sm font-medium disabled:opacity-40 shrink-0"
              data-testid="button-label-scrape"
            >
              {scrapeBusy ? "Reading…" : "Engage"}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Helper only — nothing saves until you click <strong>Save</strong>.
            Pulls the label's logo (square apple-touch-icon when available),
            name, and bio. Instagram pages can't be scraped — paste those
            into the Instagram field below.
          </p>
          <p
            role="status"
            aria-live="polite"
            className={`text-[12px] min-h-[1em] ${scrapeMsg?.kind === "err" ? "text-red-600" : "text-[#319ED8]"}`}
            data-testid="text-label-scrape-result"
          >
            {scrapeMsg?.text ?? ""}
          </p>
        </div>

        <Field label="Name">
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputCls}
            data-testid="input-label-name"
          />
        </Field>
        <Field label="Logo">
          <ArtworkPicker
            value={form.logoUrl ?? ""}
            onChange={(next) => set("logoUrl", next || null)}
            shape="square"
            testId="input-label-logo"
            hint="Square. 512×512 px recommended (1024×1024 retina). Transparent PNG or SVG. Shown on album headers + the label tab list."
          />
        </Field>
        <Field label="Cover image">
          <ArtworkPicker
            value={form.coverUrl ?? ""}
            onChange={(next) => set("coverUrl", next || null)}
            shape="square"
            testId="input-label-cover"
            hint="Wide hero. 1600×600 px recommended (3200×1200 retina). JPG. Optional — used on the future label page."
          />
        </Field>
        <Field label="Website">
          <input
            value={form.websiteUrl ?? ""}
            onChange={(e) => set("websiteUrl", e.target.value || null)}
            placeholder="https://…"
            className={inputCls}
            data-testid="input-label-website"
          />
        </Field>
        <Field label="Instagram">
          <input
            value={form.instagramUrl ?? ""}
            onChange={(e) => set("instagramUrl", e.target.value || null)}
            placeholder="https://instagram.com/…"
            className={inputCls}
            data-testid="input-label-instagram"
          />
        </Field>
        <Field label="Location">
          <input
            value={form.location ?? ""}
            onChange={(e) => set("location", e.target.value || null)}
            placeholder="Brooklyn, NY"
            className={inputCls}
            data-testid="input-label-location"
          />
        </Field>
        <Field label="Bio">
          <textarea
            value={form.bio ?? ""}
            onChange={(e) => set("bio", e.target.value || null)}
            rows={4}
            className={inputCls + " resize-none"}
            data-testid="input-label-bio"
          />
        </Field>
      </div>
    </div>
  );
}

// ---------- AdminAlbumFromUrlPanel ----------
// Albums-tab-only inline panel: paste an Apple Music album URL → server
// scrapes the iTunes Lookup API for the album + its tracklist, creates
// everything in one round-trip, and we select the new row so the admin
// drops straight into the editor. Mirrors the artist scrape UX, but for
// catalog seeding (slice #7 of the pre-streaming workflow).
function AdminAlbumFromUrlPanel({ onCreated }: { onCreated: (albumId: string) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const seed = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/admin/albums/from-apple-url", { url: trimmed });
      const body = (await res.json()) as { album: AdminAlbum; trackCount: number };
      await queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
      onCreated(body.album.id);
      setOpen(false);
      setUrl("");
      toast({ title: `Created “${body.album.title}”`, description: `${body.trackCount} track${body.trackCount === 1 ? "" : "s"} imported.` });
    } catch (e: any) {
      // apiRequest throws on non-2xx with the server message in e.message.
      toast({ title: "Couldn't import that album", description: e?.message ?? "" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-slate-100">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full px-4 py-2 flex items-center gap-2 text-left text-[12px] text-[#319ED8] hover:bg-slate-50"
          data-testid="button-album-from-url-open"
        >
          <SiApplemusic className="w-3.5 h-3.5" />
          Seed an album from an Apple Music URL
        </button>
      ) : (
        <div className="p-3 space-y-2 bg-slate-50">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">From Apple Music URL</div>
            <button
              type="button"
              onClick={() => { setOpen(false); setUrl(""); }}
              className="text-slate-400 hover:text-slate-700"
              data-testid="button-album-from-url-close"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !busy) seed(); }}
            placeholder="https://music.apple.com/us/album/…/123456789"
            className={inputCls}
            autoFocus
            data-testid="input-album-from-url"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-400 flex-1">Pulls title, artwork, year, and the full tracklist. Auto-links a matching artist profile if one already exists.</p>
            <button
              type="button"
              onClick={seed}
              disabled={busy || !url.trim()}
              className="px-3 py-1.5 rounded text-sm bg-[#319ED8] text-white disabled:opacity-50 shrink-0"
              data-testid="button-album-from-url-seed"
            >
              {busy ? "Importing…" : "Import"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- AlbumArtistPicker ----------
// Search-or-create picker for the album's primary artist. Backed by the
// People table (the same roster that powers SuperCredits). Falls back to a
// free-text "custom" mode for one-off names that don't warrant a profile
// row (collab billings, guest features, etc.). When a profile is picked,
// the album's `artist` display string mirrors the person's canonical name
// — so the fan UI keeps rendering exactly the same display while the
// underlying FK enables the artist page → "GoodTunes Releases" surface.
function AlbumArtistPicker({
  personId,
  displayName,
  onChange,
}: {
  personId: string | null;
  displayName: string;
  onChange: (next: { personId: string | null; name: string }) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: people = [] } = useQuery<AdminPerson[]>({
    queryKey: ["/api/people"],
  });
  const sorted = useMemo(
    () => [...people].sort((a, b) => a.name.localeCompare(b.name)),
    [people],
  );
  const linked = sorted.find((p) => p.id === personId) ?? null;

  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAppleUrl, setNewAppleUrl] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((p) => p.name.toLowerCase().includes(q));
  }, [sorted, query]);

  const createPersonFromUrl = async () => {
    const name = newName.trim();
    const url = newAppleUrl.trim();
    if (!name && !url) {
      toast({ title: "Add a name or paste an Apple Music URL." });
      return;
    }
    setCreateBusy(true);
    try {
      // If a URL was provided, hit the existing scrape endpoint first to
      // pre-fill canonical name / photo / bio. Falls back gracefully when
      // the URL is bad or the service is down — we still create the row
      // with whatever the admin typed.
      let scraped: Partial<ArtistScrapeResult> | null = null;
      if (url) {
        try {
          const r = await apiRequest("POST", "/api/admin/people/scrape", { url });
          scraped = (await r.json()) as ArtistScrapeResult;
        } catch {
          /* scrape is a bonus — fall through to a manual create */
        }
      }
      const payload = {
        name: name || scraped?.name || "New artist",
        photoUrl: scraped?.photoUrl ?? null,
        bio: scraped?.bio ?? null,
        appleMusicUrl: scraped?.appleMusicUrl ?? (url || null),
        spotifyUrl: scraped?.spotifyUrl ?? null,
        itunesArtistId: scraped?.itunesArtistId ?? null,
      };
      const res = await apiRequest("POST", "/api/admin/people", payload);
      const person = (await res.json()) as AdminPerson;
      await queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      onChange({ personId: person.id, name: person.name });
      setCreating(false);
      setPickerOpen(false);
      setNewName("");
      setNewAppleUrl("");
      setQuery("");
      toast({ title: `Linked “${person.name}”` });
    } catch (e: any) {
      toast({ title: "Couldn't create artist", description: e?.message ?? "" });
    } finally {
      setCreateBusy(false);
    }
  };

  return (
    <Field label="Artist">
      <div className="space-y-2">
        {/* Trigger row — shows the current selection (linked profile chip
            or the custom-typed name) and lets the admin open the picker. */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 bg-white text-left hover:border-slate-300"
            data-testid="button-album-artist-picker"
          >
            {linked ? (
              <>
                {linked.photoUrl ? (
                  <img
                    src={linked.photoUrl}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <span
                    className="w-7 h-7 rounded-full bg-slate-200 shrink-0 grid place-items-center text-[11px] font-semibold text-slate-500"
                    style={{ background: "#319ED8", color: "white" }}
                  >
                    {linked.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="flex-1 min-w-0 truncate text-sm text-slate-900">
                  {linked.name}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  Profile
                </span>
              </>
            ) : displayName ? (
              <>
                <span className="w-7 h-7 rounded-full bg-slate-100 shrink-0 grid place-items-center">
                  <UserRound className="w-4 h-4 text-slate-400" />
                </span>
                <span className="flex-1 min-w-0 truncate text-sm text-slate-900">
                  {displayName}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                  Custom
                </span>
              </>
            ) : (
              <span className="text-sm text-slate-400">— Choose artist —</span>
            )}
          </button>
          {linked && (
            <button
              type="button"
              onClick={() => onChange({ personId: null, name: displayName })}
              className="px-2 py-2 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-700"
              data-testid="button-album-artist-unlink"
              title="Unlink profile, keep the typed name"
            >
              <XIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Picker popover — inline, not a real popover, to keep this slice
            simple. Lists alpha-sorted People filtered by the search query,
            with a "+ Create new artist" footer and a "Use custom name" row. */}
        {pickerOpen && (
          <div className="border border-slate-200 rounded-md bg-white shadow-sm">
            <div className="p-2 border-b border-slate-100">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search artists…"
                className={inputCls}
                autoFocus
                data-testid="input-album-artist-search"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-center text-[12px] text-slate-400">
                  No matches. Create a new artist below.
                </div>
              )}
              {filtered.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => {
                    onChange({ personId: p.id, name: p.name });
                    setPickerOpen(false);
                    setQuery("");
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 ${
                    p.id === personId ? "bg-blue-50" : ""
                  }`}
                  data-testid={`button-album-artist-pick-${p.id}`}
                >
                  {p.photoUrl ? (
                    <img src={p.photoUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                  ) : (
                    <span
                      className="w-6 h-6 rounded-full bg-slate-200 shrink-0 grid place-items-center text-[10px] font-semibold text-slate-500"
                      style={{ background: "#319ED8", color: "white" }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="flex-1 min-w-0 truncate text-sm text-slate-800">
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
            <div className="border-t border-slate-100 p-2 space-y-2">
              {!creating ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(true);
                      setNewName(query.trim());
                    }}
                    className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm text-[#319ED8] hover:bg-slate-50 rounded"
                    data-testid="button-album-artist-create"
                  >
                    <Plus className="w-4 h-4" />
                    Create new artist{query.trim() ? ` “${query.trim()}”` : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // "Custom name" mode — clears the FK; admin can type
                      // a free string in the Title row above. Keeps any
                      // already-typed display name as the starting value.
                      onChange({ personId: null, name: displayName || query.trim() });
                      setPickerOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm text-slate-500 hover:bg-slate-50 rounded"
                    data-testid="button-album-artist-custom"
                  >
                    <UserRound className="w-4 h-4" />
                    Use a custom name (no profile)
                  </button>
                </>
              ) : (
                <div className="space-y-2 p-1">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Artist name"
                    className={inputCls}
                    autoFocus
                    data-testid="input-album-artist-new-name"
                  />
                  <input
                    value={newAppleUrl}
                    onChange={(e) => setNewAppleUrl(e.target.value)}
                    placeholder="Apple Music artist URL (optional — auto-fills photo + bio)"
                    className={inputCls}
                    data-testid="input-album-artist-new-apple-url"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(false);
                        setNewName("");
                        setNewAppleUrl("");
                      }}
                      className="px-3 py-1.5 rounded text-sm text-slate-500 hover:bg-slate-50"
                      data-testid="button-album-artist-new-cancel"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={createPersonFromUrl}
                      disabled={createBusy || (!newName.trim() && !newAppleUrl.trim())}
                      className="px-3 py-1.5 rounded text-sm bg-[#319ED8] text-white disabled:opacity-50"
                      data-testid="button-album-artist-new-save"
                    >
                      {createBusy ? "Linking…" : "Create & link"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </Field>
  );
}

// ---------- AlbumLabelPicker ----------
// Mirror of AlbumArtistPicker for the label FK. Same search-or-create UX
// (the label scrape endpoint already exists, so a pasted website URL
// auto-fills logo + bio). "No label" is the default; the picker treats
// `value === null` as a real choice (independent artist), not "missing".
function AlbumLabelPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: labels = [] } = useQuery<AdminLabel[]>({
    queryKey: ["/api/labels"],
  });
  const sorted = useMemo(
    () => [...labels].sort((a, b) => a.name.localeCompare(b.name)),
    [labels],
  );
  const linked = sorted.find((l) => l.id === value) ?? null;

  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWebsiteUrl, setNewWebsiteUrl] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  // Close the open dropdown when the admin clicks anywhere outside it or
  // presses Escape. Without this the panel just hangs open after picking,
  // saving, or moving on to another field — which made the form feel
  // stuck and obscured the rest of the editor.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pickerOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(e.target as Node)) {
        setPickerOpen(false);
        setCreating(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPickerOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((l) => l.name.toLowerCase().includes(q));
  }, [sorted, query]);

  const createLabelFromUrl = async () => {
    const name = newName.trim();
    const url = newWebsiteUrl.trim();
    if (!name && !url) {
      toast({ title: "Add a name or paste a label website URL." });
      return;
    }
    setCreateBusy(true);
    try {
      // Scrape is best-effort — if the label site blocks us or the URL
      // is bad we still create a row with the typed name.
      let scraped: any = null;
      if (url) {
        try {
          const r = await apiRequest("POST", "/api/admin/labels/scrape", { url });
          scraped = await r.json();
        } catch {
          /* ignore — manual create below */
        }
      }
      const payload = {
        name: name || scraped?.name || "New label",
        logoUrl: scraped?.logoUrl ?? null,
        bio: scraped?.bio ?? null,
        websiteUrl: scraped?.websiteUrl ?? (url || null),
      };
      const res = await apiRequest("POST", "/api/admin/labels", payload);
      const label = (await res.json()) as AdminLabel;
      await queryClient.invalidateQueries({ queryKey: ["/api/labels"] });
      onChange(label.id);
      setCreating(false);
      setPickerOpen(false);
      setNewName("");
      setNewWebsiteUrl("");
      setQuery("");
      toast({ title: `Linked “${label.name}”` });
    } catch (e: any) {
      toast({ title: "Couldn't create label", description: e?.message ?? "" });
    } finally {
      setCreateBusy(false);
    }
  };

  return (
    <Field label="Label">
      <div className="space-y-2" ref={rootRef}>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 bg-white text-left hover:border-slate-300"
          data-testid="select-album-label"
        >
          {linked ? (
            <>
              {linked.logoUrl ? (
                <img src={linked.logoUrl} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
              ) : (
                <span className="w-7 h-7 rounded bg-slate-200 shrink-0 grid place-items-center text-[11px] font-semibold text-slate-500">
                  {linked.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="flex-1 min-w-0 truncate text-sm text-slate-900">{linked.name}</span>
              <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                Linked
              </span>
            </>
          ) : (
            <span className="text-sm text-slate-400">— No label —</span>
          )}
        </button>

        {pickerOpen && (
          <div className="border border-slate-200 rounded-md bg-white shadow-sm">
            <div className="p-2 border-b border-slate-100">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search labels…"
                className={inputCls}
                autoFocus
                data-testid="input-album-label-search"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setPickerOpen(false);
                  setQuery("");
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 ${
                  value === null ? "bg-blue-50" : ""
                }`}
                data-testid="button-album-label-pick-none"
              >
                <span className="w-6 h-6 rounded bg-slate-100 shrink-0 grid place-items-center">
                  <XIcon className="w-3.5 h-3.5 text-slate-400" />
                </span>
                <span className="flex-1 min-w-0 truncate text-sm text-slate-600">— No label —</span>
              </button>
              {filtered.map((l) => (
                <button
                  type="button"
                  key={l.id}
                  onClick={() => {
                    onChange(l.id);
                    setPickerOpen(false);
                    setQuery("");
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 ${
                    l.id === value ? "bg-blue-50" : ""
                  }`}
                  data-testid={`button-album-label-pick-${l.id}`}
                >
                  {l.logoUrl ? (
                    <img src={l.logoUrl} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                  ) : (
                    <span className="w-6 h-6 rounded bg-slate-200 shrink-0 grid place-items-center text-[10px] font-semibold text-slate-500">
                      {l.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="flex-1 min-w-0 truncate text-sm text-slate-800">{l.name}</span>
                </button>
              ))}
            </div>
            <div className="border-t border-slate-100 p-2">
              {!creating ? (
                <button
                  type="button"
                  onClick={() => {
                    setCreating(true);
                    setNewName(query.trim());
                  }}
                  className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm text-[#319ED8] hover:bg-slate-50 rounded"
                  data-testid="button-album-label-create"
                >
                  <Plus className="w-4 h-4" />
                  Create new label{query.trim() ? ` “${query.trim()}”` : ""}
                </button>
              ) : (
                <div className="space-y-2 p-1">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Label name"
                    className={inputCls}
                    autoFocus
                    data-testid="input-album-label-new-name"
                  />
                  <input
                    value={newWebsiteUrl}
                    onChange={(e) => setNewWebsiteUrl(e.target.value)}
                    placeholder="Label website URL (optional — auto-fills logo + bio)"
                    className={inputCls}
                    data-testid="input-album-label-new-website-url"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(false);
                        setNewName("");
                        setNewWebsiteUrl("");
                      }}
                      className="px-3 py-1.5 rounded text-sm text-slate-500 hover:bg-slate-50"
                      data-testid="button-album-label-new-cancel"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={createLabelFromUrl}
                      disabled={createBusy || (!newName.trim() && !newWebsiteUrl.trim())}
                      className="px-3 py-1.5 rounded text-sm bg-[#319ED8] text-white disabled:opacity-50"
                      data-testid="button-album-label-new-save"
                    >
                      {createBusy ? "Linking…" : "Create & link"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Field>
  );
}

// ---------- Admin shell ----------

export function Admin() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  // Restore the last entity tab + per-entity selection across refreshes.
  // Without this, every reload snaps back to Albums + row[0], which is
  // disorienting when you're mid-edit on a Person / Instrument / Vendor.
  // Keys are namespaced under `gt:admin:` so they don't collide with the
  // fan-side localStorage keys (favorites, downloads, chat, etc.).
  const ENTITY_KEYS: EntityKey[] = ["albums", "people", "instruments", "vendors", "labels"];
  const [entity, setEntity] = useState<EntityKey>(() => {
    try {
      const raw = localStorage.getItem("gt:admin:entity");
      if (raw && (ENTITY_KEYS as string[]).includes(raw)) return raw as EntityKey;
    } catch {}
    return "albums";
  });
  // Per-entity selection so switching tabs preserves which row was open.
  const [selectedByEntity, setSelectedByEntity] = useState<
    Record<EntityKey, string | null>
  >(() => {
    const empty = { albums: null, people: null, instruments: null, vendors: null, labels: null };
    try {
      const raw = localStorage.getItem("gt:admin:selectedByEntity");
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<EntityKey, string | null>>;
        return { ...empty, ...parsed };
      }
    } catch {}
    return empty;
  });
  useEffect(() => {
    try { localStorage.setItem("gt:admin:entity", entity); } catch {}
  }, [entity]);
  useEffect(() => {
    try { localStorage.setItem("gt:admin:selectedByEntity", JSON.stringify(selectedByEntity)); } catch {}
  }, [selectedByEntity]);
  const selectedId = selectedByEntity[entity];
  const setSelectedId = (id: string | null) =>
    setSelectedByEntity((prev) => ({ ...prev, [entity]: id }));
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  // Per-entity search query for filtering the middle list. Kept per-tab so
  // switching between Albums / People / Instruments / Vendors preserves
  // whatever filter you had open in each. Empty string = no filter.
  const [searchByEntity, setSearchByEntity] = useState<
    Record<EntityKey, string>
  >({ albums: "", people: "", instruments: "", vendors: "", labels: "" });
  const search = searchByEntity[entity];
  const setSearch = (v: string) =>
    setSearchByEntity((prev) => ({ ...prev, [entity]: v }));
  // Whether the search input is revealed for the current tab. Auto-opens if
  // there's a stored query so the filter is never "invisible".
  const [searchOpen, setSearchOpen] = useState<Record<EntityKey, boolean>>({
    albums: false,
    people: false,
    instruments: false,
    vendors: false,
    labels: false,
  });
  const isSearchOpen = searchOpen[entity] || !!search;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Opt this route into the light theme by tagging <body>. The matching
  // `body.gt-admin` rule in index.css overrides the global dark body bg
  // and `color: white` that the fan player relies on. Cleaning the class
  // on unmount keeps the rest of the app dark.
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

  // Multi-admin live refresh. The global TanStack default is
  // `staleTime: Infinity`, which keeps the fan player snappy but means a
  // second admin's edits don't appear here until you reload. While the
  // /admin route is mounted we poll the admin lists every 5s (only when
  // the tab is visible) and also refetch the instant the tab regains
  // focus. Invalidate only nudges *active* queries to refetch, so this
  // stays cheap — it never wakes a query that isn't on screen.
  useEffect(() => {
    if (!user?.isAdmin) return;
    const ADMIN_KEYS: string[][] = [
      ["/api/albums"],
      ["/api/people"],
      ["/api/instruments"],
      ["/api/vendors"],
      ["/api/labels"],
    ];
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      for (const key of ADMIN_KEYS) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    };
    const intervalId = window.setInterval(refresh, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queryClient, user?.isAdmin]);

  const { data: albums = [] } = useQuery<AdminAlbum[]>({
    queryKey: ["/api/albums"],
    enabled: !!user?.isAdmin,
  });
  const { data: people = [] } = useQuery<AdminPerson[]>({
    queryKey: ["/api/people"],
    enabled: !!user?.isAdmin,
  });
  const { data: instruments = [] } = useQuery<AdminInstrument[]>({
    queryKey: ["/api/instruments"],
    enabled: !!user?.isAdmin,
  });
  const { data: labels = [] } = useQuery<AdminLabel[]>({
    queryKey: ["/api/labels"],
    enabled: !!user?.isAdmin,
  });

  // Auto-select the first row when switching to an entity that has no
  // selection yet. Run per-entity so each tab keeps its own cursor.
  useEffect(() => {
    // The Albums sidebar only shows curated GoodTunes releases, so the
    // default cursor has to come from that same filtered list — otherwise
    // we land on a discography import (e.g. "1833") that isn't even in the
    // visible sidebar. Also re-select when the current pick falls out of
    // the curated list (e.g. an album was un-flagged as a GoodTunes release).
    const curated = albums.filter((a) => a.isGoodTunesRelease);
    if (curated.length === 0) return;
    const current = selectedByEntity.albums;
    const stillVisible = current != null && curated.some((a) => a.id === current);
    if (!stillVisible) {
      setSelectedByEntity((p) => ({ ...p, albums: curated[0].id }));
    }
  }, [albums, selectedByEntity.albums]);
  // For each non-album entity: if nothing is selected OR the currently
  // selected id no longer exists in the refreshed list (deleted in this
  // tab or another), fall back to the first row. Mirrors the albums
  // effect above and prevents a "ghost editor" sticking around with
  // stale form state pointing at a row the server already removed.
  useEffect(() => {
    if (people.length === 0) return;
    const current = selectedByEntity.people;
    const stillVisible = current != null && people.some((p) => p.id === current);
    if (!stillVisible)
      setSelectedByEntity((p) => ({ ...p, people: people[0].id }));
  }, [people, selectedByEntity.people]);
  useEffect(() => {
    if (instruments.length === 0) return;
    const current = selectedByEntity.instruments;
    const stillVisible = current != null && instruments.some((i) => i.id === current);
    if (!stillVisible)
      setSelectedByEntity((p) => ({ ...p, instruments: instruments[0].id }));
  }, [instruments, selectedByEntity.instruments]);
  useEffect(() => {
    if (labels.length === 0) return;
    const current = selectedByEntity.labels;
    const stillVisible = current != null && labels.some((l) => l.id === current);
    if (!stillVisible)
      setSelectedByEntity((p) => ({ ...p, labels: labels[0].id }));
  }, [labels, selectedByEntity.labels]);

  // Flat cross-cut of every vendor row across every instrument. Vendors are
  // owned by instruments in the DB (FK), so this is a derivation — no
  // separate query. We tag each row with its parent instrument so the list
  // can show "for <instrument>" context. Newest first.
  // Group all attachments by vendorId so the Vendors tab lists each unique
  // vendor ENTITY once (e.g. one "Carter Vintage" row even though it powers
  // three instruments). The `id` field on each row is the vendorId so it
  // doubles as the pane's selection key. `attachments` gives the editor and
  // preview enough context to show "Used on N instruments" + a representative
  // affiliateUrl for the favicon fallback.
  const allVendors = useMemo(() => {
    const byVendor = new Map<string, AdminVendorGrouped>();
    for (const inst of instruments) {
      for (const v of inst.vendors) {
        const existing = byVendor.get(v.vendorId);
        const attachment = {
          attachmentId: v.id,
          instrumentId: v.instrumentId,
          instrumentName: inst.name,
          instrumentPhotoUrl: inst.photoUrl,
          instrumentCategory: inst.shortCategory ?? inst.category ?? null,
          affiliateUrl: v.affiliateUrl,
          isHidden: v.isHidden,
          position: v.position,
        };
        if (existing) {
          existing.attachments.push(attachment);
        } else {
          byVendor.set(v.vendorId, {
            id: v.vendorId,
            vendorId: v.vendorId,
            name: v.name,
            domain: v.domain,
            homeUrl: v.homeUrl,
            aboutUrl: v.aboutUrl,
            logoUrl: v.logoUrl,
            tagline: v.tagline,
            bio: v.bio,
            location: v.location,
            coverUrl: v.coverUrl,
            createdAt: v.createdAt,
            attachments: [attachment],
          });
        }
      }
    }
    const rows = Array.from(byVendor.values());
    // Apple-Music / Spotify standard: alphabetical by display name as a
    // single string (case- and accent-insensitive). "Carter Vintage
    // Guitars" sorts under C, "Martin Guitar" under M. Matches the same
    // rule used for People, Labels, and Gear so every roster surface
    // reads the same way.
    rows.sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", undefined, {
        sensitivity: "base",
      }),
    );
    return rows;
  }, [instruments]);
  // Auto-heal vendor selection: handles both initial mount AND the case
  // where the previously-selected vendor disappeared (e.g. deleted from
  // another surface, or cascaded by an instrument delete). Without the
  // "stale id" branch, the pane would sit on a "Vendor not found" state
  // until the admin manually clicked another row.
  useEffect(() => {
    if (allVendors.length === 0) return;
    const current = selectedByEntity.vendors;
    if (current == null || !allVendors.some((v) => v.id === current)) {
      setSelectedByEntity((p) => ({ ...p, vendors: allVendors[0].id }));
    }
  }, [allVendors, selectedByEntity.vendors]);

  // Apply the per-entity search filter just before render. We do a simple
  // case-insensitive substring match against the fields shown on each row
  // so admins can find a row by typing what they already see on screen.
  const needle = search.trim().toLowerCase();
  // Sidebar shows only GoodTunes-released albums by default. Discography
  // imports (a Person's Apple Music catalog) live in the same `albums`
  // table so they remain reachable from the artist profile + credits, but
  // we don't want them cluttering the "Albums" column — that's reserved
  // for the curated GoodTunes catalog.
  const filteredAlbums = useMemo(() => {
    const curated = albums.filter((a) => a.isGoodTunesRelease);
    if (!needle) return curated;
    return curated.filter(
      (a) =>
        a.title.toLowerCase().includes(needle) ||
        a.artist.toLowerCase().includes(needle),
    );
  }, [albums, needle]);
  const filteredPeople = useMemo(
    () =>
      !needle
        ? people
        : people.filter(
            (p) =>
              p.name.toLowerCase().includes(needle) ||
              (p.bio?.toLowerCase().includes(needle) ?? false),
          ),
    [people, needle],
  );
  const filteredInstruments = useMemo(
    () =>
      !needle
        ? instruments
        : instruments.filter(
            (i) =>
              i.name.toLowerCase().includes(needle) ||
              i.category.toLowerCase().includes(needle),
          ),
    [instruments, needle],
  );
  const filteredVendors = useMemo(
    () =>
      !needle
        ? allVendors
        : allVendors.filter(
            (v) =>
              (v.name ?? "").toLowerCase().includes(needle) ||
              v.domain.toLowerCase().includes(needle) ||
              v.attachments.some((a) =>
                a.instrumentName.toLowerCase().includes(needle),
              ),
          ),
    [allVendors, needle],
  );
  const filteredLabels = useMemo(
    () =>
      !needle
        ? labels
        : labels.filter(
            (l) =>
              l.name.toLowerCase().includes(needle) ||
              (l.location?.toLowerCase().includes(needle) ?? false),
          ),
    [labels, needle],
  );

  const bootstrap = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/bootstrap");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      setBootstrapError(null);
    },
    onError: (e: Error) => setBootstrapError(e.message),
  });

  // After a create, we need the new row to be visible in the list cache
  // BEFORE we move the cursor to it. The auto-heal effects above watch
  // each entity list and reset `selectedId` to list[0] whenever the
  // current selection isn't in the list — so if we just `invalidateQueries`
  // and `setSelected(newId)`, the auto-heal fires against the stale list
  // (the refetch hasn't landed yet), decides the new id isn't visible,
  // and snaps us back to the top row. Optimistically pushing the new row
  // into the cache first makes `stillVisible` true on the first pass; the
  // subsequent invalidate just reconciles with the server-shaped row.
  const createAlbum = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/albums", {
        title: "New album",
        artist: "Unknown artist",
        artwork: "/album-placeholder.svg",
        type: "LP",
        // Clicking "New" on the Albums tab is an explicit "I'm starting a
        // GoodTunes release" action. Without this flag the new row would
        // be filtered out of the curated sidebar (which only shows
        // GoodTunes releases), and the auto-heal would snap selection
        // back to the first existing row.
        isGoodTunesRelease: true,
      });
      return res.json() as Promise<AdminAlbum>;
    },
    onSuccess: (a) => {
      queryClient.setQueryData<AdminAlbum[]>(["/api/albums"], (old) =>
        old ? (old.some((x) => x.id === a.id) ? old : [...old, a]) : [a],
      );
      setSelectedByEntity((p) => ({ ...p, albums: a.id }));
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-albums"] });
    },
  });

  const createPerson = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/people", {
        name: "New person",
      });
      return res.json() as Promise<AdminPerson>;
    },
    onSuccess: (p) => {
      queryClient.setQueryData<AdminPerson[]>(["/api/people"], (old) =>
        old ? (old.some((x) => x.id === p.id) ? old : [...old, p]) : [p],
      );
      setSelectedByEntity((s) => ({ ...s, people: p.id }));
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
    },
  });

  const createInstrument = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/instruments", {
        name: "New instrument",
        category: "Guitar",
      });
      return res.json() as Promise<AdminInstrument>;
    },
    onSuccess: (i) => {
      queryClient.setQueryData<AdminInstrument[]>(
        ["/api/instruments"],
        (old) =>
          old
            ? old.some((x) => x.id === i.id)
              ? old
              : [...old, { ...i, vendors: [] }]
            : [{ ...i, vendors: [] }],
      );
      setSelectedByEntity((s) => ({ ...s, instruments: i.id }));
      queryClient.invalidateQueries({ queryKey: ["/api/instruments"] });
    },
  });

  const createLabel = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/labels", {
        name: "New label",
      });
      return res.json() as Promise<AdminLabel>;
    },
    onSuccess: (l) => {
      queryClient.setQueryData<AdminLabel[]>(["/api/labels"], (old) =>
        old ? (old.some((x) => x.id === l.id) ? old : [...old, l]) : [l],
      );
      setSelectedByEntity((s) => ({ ...s, labels: l.id }));
      queryClient.invalidateQueries({ queryKey: ["/api/labels"] });
    },
  });

  // Iframe lifecycle: change `src` when the selected album changes; remount
  // (via `key`) whenever any CMS-mutable field on that album changes, so the
  // preview re-fetches and re-renders without us reaching into iframe.contentWindow.
  // Only meaningful while the Albums tab is active — gating the query keeps
  // us from firing `/api/albums/<personId>` 404s when other tabs are open.
  const albumPreviewId = entity === "albums" ? selectedId : null;
  const iframeSrc = useMemo(
    () => (albumPreviewId ? `/album/${albumPreviewId}` : "/collection"),
    [albumPreviewId],
  );
  // Subscribe to the album-detail cache so React re-renders (and the key
  // recomputes) when the underlying data changes. `getQueryData` alone in a
  // useMemo body wouldn't trigger a re-render.
  const { data: previewDetail } = useQuery<AlbumWithSongs>({
    queryKey: ["/api/albums", albumPreviewId ?? ""],
    enabled: !!albumPreviewId,
  });
  const iframeKey = useMemo(() => {
    if (!albumPreviewId) return "none";
    if (!previewDetail) return `${albumPreviewId}:loading`;
    const a = previewDetail;
    const songSig = a.songs
      ?.map(
        (s) =>
          `${s.id}|${s.trackNumber}|${s.title}|${s.duration}|${s.lyrics ?? ""}|${s.audioUrl ?? ""}`,
      )
      .join("~");
    // Include labelId + the denormalized label entity fields fan-side
    // AlbumDetail actually reads (name/logo) so a label-only edit — either
    // reassigning the album to a different label or editing the label
    // entity itself — forces an iframe remount.
    const labelSig = `${a.labelId ?? ""}|${a.label?.name ?? ""}|${a.label?.logoUrl ?? ""}`;
    return `${a.id}|${a.title}|${a.artist}|${a.artwork}|${a.year}|${a.type}|${a.description ?? ""}|${labelSig}|${songSig}`;
  }, [albumPreviewId, previewDetail]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#f7f8fa] flex items-center justify-center text-slate-500">
        Loading…
      </main>
    );
  }
  if (!user) {
    navigate("/login");
    return null;
  }

  if (!user.isAdmin) {
    return (
      <main className="min-h-screen bg-[#f7f8fa] flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-slate-900 text-2xl font-semibold mb-2">
            Admin only
          </h1>
          <p className="text-slate-500 text-sm mb-6">
            You're signed in as{" "}
            <span className="text-slate-900 font-medium">@{user.username}</span>{" "}
            but this account isn't an admin yet. If no admin exists, you can
            claim the first slot now.
          </p>
          <button
            type="button"
            onClick={() => bootstrap.mutate()}
            disabled={bootstrap.isPending}
            className="px-4 py-2 rounded-md bg-[#319ED8] text-white font-medium hover:bg-[#319ED8]/90 disabled:opacity-50"
            data-testid="button-bootstrap-admin"
          >
            {bootstrap.isPending
              ? "Claiming…"
              : "Claim admin (if no admin yet)"}
          </button>
          {bootstrapError && (
            <p
              className="mt-3 text-red-600 text-sm"
              data-testid="text-bootstrap-error"
            >
              {bootstrapError}
            </p>
          )}
          <button
            type="button"
            onClick={() => navigate("/collection")}
            className="mt-6 block mx-auto text-slate-400 text-sm hover:text-slate-900"
          >
            Back to the player
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen overflow-hidden bg-[#f7f8fa] text-slate-900 flex flex-col">
      {/* Top bar spans the full width so the three columns below all align
          at the same y. The dark color logo reads cleanly on this near-white
          surface — we deliberately do NOT use the shared GoodTunesLogo
          component because it bakes in `mix-blend-mode: screen` for the
          dark fan UI, which makes the mark disappear on this bg. */}
      <header className="h-14 shrink-0 border-b border-slate-200 bg-white flex items-center px-6 gap-3">
        <img
          src="/goodtunes-logo-color.png"
          alt="GoodTunes®"
          className="h-10 w-auto"
          data-testid="img-admin-logo"
        />
        {/* ADMIN badge is pushed to the far right so the logo can breathe.
            ml-auto on a flex parent keeps it stuck to the edge regardless
            of viewport width. */}
        <span className="ml-auto text-[11px] uppercase tracking-widest text-slate-400 font-medium">
          Admin
        </span>
        <PromotePanel />
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left rail: entity nav */}
        <aside className="w-56 shrink-0 border-r border-slate-200 flex flex-col">
          <nav className="flex-1 px-2 py-3 space-y-1 text-sm">
            {(
              [
                {
                  key: "albums",
                  label: "Albums",
                  // Sidebar count mirrors the curated list shown in the
                  // Albums pane — only true GoodTunes Releases, not the
                  // larger pool of streaming-only album rows we ingest
                  // for crediting / discography purposes.
                  count: albums.filter((a) => a.isGoodTunesRelease).length,
                  Icon: Disc3,
                },
                { key: "people", label: "People", count: people.length, Icon: UserRound },
                {
                  key: "instruments",
                  // Public-facing label is "Gear" (matches the fan-side
                  // VendorSheet tab). The internal key stays `instruments`
                  // so schema and storage names don't have to change.
                  label: "Gear",
                  count: instruments.length,
                  Icon: Guitar,
                },
                { key: "vendors", label: "Vendors", count: allVendors.length, Icon: Store },
                { key: "labels", label: "Labels", count: labels.length, Icon: Tag },
              ] as { key: EntityKey; label: string; count: number; Icon: typeof Disc3 }[]
            ).map((t) => {
              const active = entity === t.key;
              const Icon = t.Icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setEntity(t.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left ${active ? "bg-[#eff4ff] text-[#319ED8] font-medium" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                  data-testid={`nav-${t.key}`}
                >
                  <Icon size={16} className={active ? "text-[#319ED8]" : "text-slate-400"} aria-hidden="true" />
                  <span className="flex-1">{t.label}</span>
                  <span className="text-[11px] text-slate-400">{t.count}</span>
                </button>
              );
            })}
          </nav>
          <div className="px-3 py-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => navigate("/collection")}
              className="w-full text-left px-3 py-2 text-slate-500 hover:text-slate-900 text-sm"
              data-testid="link-back-to-player"
            >
              ← Back to player
            </button>
          </div>
        </aside>

        {/* Middle: entity list */}
        <section className="w-72 shrink-0 border-r border-slate-200 flex flex-col">
          <div className="border-b border-slate-200">
            <div className="px-4 py-3 flex items-center justify-between gap-2">
              <h2 className="text-slate-900 text-sm font-semibold">
                {/* Public label map — `instruments` shows as "Gear" to match
                    the sidebar nav + fan-side VendorSheet tab. Internal
                    entity keys stay as-is so schema/storage names don't
                    need to change. */}
                {entity === "instruments" ? "Gear"
                  : entity === "albums" ? "Albums"
                  : entity === "people" ? "People"
                  : entity === "vendors" ? "Vendors"
                  : "Labels"}
              </h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen((prev) => {
                      const next = !prev[entity];
                      if (!next) {
                        // Closing the search bar — wipe any stored query so
                        // the list snaps back to showing every row.
                        setSearch("");
                      } else {
                        // Defer focus until the input is rendered.
                        requestAnimationFrame(() =>
                          searchInputRef.current?.focus(),
                        );
                      }
                      return { ...prev, [entity]: next };
                    });
                  }}
                  className={`p-1 rounded ${isSearchOpen ? "text-[#319ED8]" : "text-slate-400 hover:text-slate-600"}`}
                  aria-label={`Search ${entity}`}
                  aria-expanded={isSearchOpen}
                  title={`Search ${entity}`}
                  data-testid={`button-search-${entity}`}
                >
                  <Search size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (entity === "albums") createAlbum.mutate();
                    else if (entity === "people") createPerson.mutate();
                    else if (entity === "instruments") createInstrument.mutate();
                    else if (entity === "labels") createLabel.mutate();
                  }}
                  disabled={
                    entity === "vendors" ||
                    createAlbum.isPending ||
                    createPerson.isPending ||
                    createInstrument.isPending ||
                    createLabel.isPending
                  }
                  className={`w-8 h-8 inline-flex items-center justify-center rounded ${entity === "vendors" ? "text-slate-300 cursor-not-allowed" : "text-[#319ED8] hover:bg-slate-50"}`}
                  aria-label={`New ${entity.slice(0, -1)}`}
                  title={
                    entity === "vendors"
                      ? "Vendors are added via an instrument's scraper"
                      : `New ${entity.slice(0, -1)}`
                  }
                  data-testid={`button-new-${entity.slice(0, -1)}`}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
            {isSearchOpen && (
              <div className="px-4 pb-3">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    ref={searchInputRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setSearch("");
                        setSearchOpen((prev) => ({ ...prev, [entity]: false }));
                      }
                    }}
                    placeholder={`Search ${entity}…`}
                    className="w-full pl-8 pr-8 py-1.5 text-sm rounded-md bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#319ED8] focus:bg-white"
                    data-testid={`input-search-${entity}`}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        searchInputRef.current?.focus();
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                      aria-label="Clear search"
                      data-testid={`button-clear-search-${entity}`}
                    >
                      <XIcon size={13} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          {entity === "albums" && (
            <AdminAlbumFromUrlPanel
              onCreated={(albumId) =>
                setSelectedByEntity((p) => ({ ...p, albums: albumId }))
              }
            />
          )}
          <ul className="flex-1 overflow-y-auto py-2">
            {entity === "albums" &&
              filteredAlbums.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left ${selectedId === a.id ? "bg-blue-50" : ""} ${a.isHidden ? "opacity-50" : ""}`}
                    data-testid={`row-album-${a.id}`}
                  >
                    <img
                      src={a.artwork}
                      alt=""
                      className="w-10 h-10 rounded object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-slate-900 text-sm truncate">
                        {a.title}
                      </div>
                      <div className="text-slate-400 text-xs truncate">
                        {a.artist}
                      </div>
                    </div>
                    {a.isHidden && (
                      <span className="text-[10px] uppercase tracking-wider text-[#FF5470] bg-[#FF5470]/10 border border-[#FF5470]/30 rounded px-1.5 py-0.5 shrink-0">
                        Hidden
                      </span>
                    )}
                  </button>
                </li>
              ))}
            {entity === "people" &&
              filteredPeople.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left ${selectedId === p.id ? "bg-blue-50" : ""}`}
                    data-testid={`row-person-${p.id}`}
                  >
                    {p.photoUrl ? (
                      <img
                        src={p.photoUrl}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-slate-900 text-sm font-semibold shrink-0"
                        style={{ background: "#319ED8" }}
                      >
                        {p.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-slate-900 text-sm truncate">
                        {p.name}
                      </div>
                      <div className="text-slate-400 text-xs truncate">
                        {p.bio ?? "—"}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            {entity === "vendors" &&
              filteredVendors.map((v) => {
                // Favicon fallback uses the vendor's canonical domain so
                // the list looks right even with no attachments.
                const logo =
                  v.logoUrl ||
                  (v.domain
                    ? `https://www.google.com/s2/favicons?sz=128&domain=${v.domain}`
                    : "");
                // A vendor is "fully hidden" only when every one of its
                // attachments is hidden — dimmer signals "no fan ever sees
                // this anywhere", not "hidden on one of three".
                const allHidden =
                  v.attachments.length > 0 &&
                  v.attachments.every((a) => a.isHidden);
                const count = v.attachments.length;
                // Show the vendor's tagline under the name — same one fans
                // see on the VendorSheet. Falls back to the canonical domain,
                // then to an attachment summary, so unfilled rows still
                // carry useful context.
                const summary =
                  v.tagline ||
                  v.domain ||
                  (count === 0
                    ? "Not attached"
                    : count === 1
                      ? `on ${v.attachments[0].instrumentName}`
                      : `on ${count} instruments`);
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(v.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left ${selectedId === v.id ? "bg-blue-50" : ""} ${allHidden ? "opacity-50" : ""}`}
                      data-testid={`row-vendor-list-${v.id}`}
                    >
                      {logo ? (
                        <img
                          src={logo}
                          alt=""
                          className="w-10 h-10 rounded bg-slate-50 object-contain shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-slate-100 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="text-slate-900 text-sm truncate">
                          {v.name || "Untitled vendor"}
                        </div>
                        <div className="text-slate-400 text-xs truncate">
                          {summary}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            {entity === "instruments" &&
              filteredInstruments.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(i.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left ${selectedId === i.id ? "bg-blue-50" : ""}`}
                    data-testid={`row-instrument-${i.id}`}
                  >
                    {i.photoUrl ? (
                      <img
                        src={i.photoUrl}
                        alt=""
                        className="w-10 h-10 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-slate-100 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-slate-900 text-sm truncate">
                        {i.name}
                      </div>
                      <div className="text-slate-400 text-xs truncate">
                        {i.category}
                        {i.vendors.length > 0 &&
                          ` · ${i.vendors.length} vendor${i.vendors.length === 1 ? "" : "s"}`}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            {entity === "albums" && filteredAlbums.length === 0 && (
              <li className="px-4 py-6 text-slate-400 text-sm space-y-3">
                <div>
                  {needle
                    ? `No albums match "${search}".`
                    : "No GoodTunes releases yet."}
                </div>
                {!needle && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await apiRequest("POST", "/api/admin/albums/backfill-originals", {});
                        const data = await res.json() as { updated: { title: string }[]; count: number };
                        await queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
                        toast({
                          title: data.count > 0 ? `Marked ${data.count} originals` : "Nothing to backfill",
                          description: data.count > 0 ? data.updated.map((u) => u.title).join(", ") : "No matching titles found.",
                        });
                      } catch (e: any) {
                        toast({ title: "Backfill failed", description: String(e?.message || e), variant: "destructive" });
                      }
                    }}
                    className="text-[#319ED8] hover:underline text-sm font-medium"
                    data-testid="button-backfill-originals"
                  >
                    Mark the 5 originals as GoodTunes releases
                  </button>
                )}
              </li>
            )}
            {entity === "people" && filteredPeople.length === 0 && (
              <li className="px-4 py-6 text-slate-400 text-sm">
                {needle
                  ? `No people match "${search}".`
                  : "No people yet. Click + New."}
              </li>
            )}
            {entity === "instruments" && filteredInstruments.length === 0 && (
              <li className="px-4 py-6 text-slate-400 text-sm">
                {needle
                  ? `No instruments match "${search}".`
                  : "No instruments yet. Click + New."}
              </li>
            )}
            {entity === "vendors" && filteredVendors.length === 0 && (
              <li className="px-4 py-6 text-slate-400 text-sm leading-relaxed">
                {needle
                  ? `No vendors match "${search}".`
                  : "No vendors yet. Open an instrument and paste a Reverb / Sweetwater / Carter Vintage URL into its Vendors scraper."}
              </li>
            )}
            {entity === "labels" &&
              filteredLabels.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(l.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left ${selectedId === l.id ? "bg-blue-50" : ""}`}
                    data-testid={`row-label-${l.id}`}
                  >
                    {l.logoUrl ? (
                      <img
                        src={l.logoUrl}
                        alt=""
                        className="w-10 h-10 rounded bg-slate-50 object-contain shrink-0"
                      />
                    ) : (
                      // Initials fallback — matches the album-level label
                      // picker so a logoless label reads the same way
                      // everywhere (e.g. "F" for Forward Motion Records).
                      <div
                        className="w-10 h-10 rounded bg-slate-100 shrink-0 flex items-center justify-center text-slate-500 text-sm font-semibold"
                        aria-hidden
                      >
                        {(l.name || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-slate-900 text-sm truncate">
                        {l.name || "Untitled label"}
                      </div>
                      <div className="text-slate-400 text-xs truncate">
                        {l.location ?? "—"}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            {entity === "labels" && filteredLabels.length === 0 && (
              <li className="px-4 py-6 text-slate-400 text-sm">
                {needle
                  ? `No labels match "${search}".`
                  : "No labels yet. Click + New."}
              </li>
            )}
          </ul>
        </section>

        {/* Editor pane */}
        <section className="flex-1 min-w-0 min-h-0 overflow-hidden border-r border-slate-200">
          {!selectedId ? (
            <div className="h-full flex items-center justify-center text-slate-400">
              Select an item to edit.
            </div>
          ) : entity === "albums" ? (
            <AlbumEditor
              key={selectedId}
              albumId={selectedId}
              onDeleted={() => setSelectedId(null)}
            />
          ) : entity === "people" ? (
            <PersonEditor
              key={selectedId}
              personId={selectedId}
              onDeleted={() => setSelectedId(null)}
              onCreatedAlbum={(albumId) => {
                // Switch to the Albums tab and pre-select the new row.
                setEntity("albums");
                setSelectedByEntity((p) => ({ ...p, albums: albumId }));
              }}
            />
          ) : entity === "labels" ? (
            <LabelEditor
              key={selectedId}
              labelId={selectedId}
              onDeleted={() => setSelectedId(null)}
            />
          ) : entity === "vendors" ? (
            (() => {
              const v = allVendors.find((x) => x.id === selectedId);
              if (!v)
                return (
                  <div className="h-full flex items-center justify-center text-slate-400">
                    Vendor not found.
                  </div>
                );
              return (
                <VendorPaneEditor
                  key={v.id}
                  vendor={v}
                  onJumpToInstrument={(instrumentId) => {
                    setSelectedByEntity((p) => ({
                      ...p,
                      instruments: instrumentId,
                    }));
                    setEntity("instruments");
                  }}
                  onDeleted={() => setSelectedId(null)}
                />
              );
            })()
          ) : (
            <InstrumentEditor
              key={selectedId}
              instrumentId={selectedId}
              onDeleted={() => setSelectedId(null)}
            />
          )}
        </section>

        {/* Phone-frame preview — only meaningful for Albums today.
         People + Instruments don't have public detail pages yet; they
         surface inside album credits, which lights up in the next pass. */}
        <aside className="w-[420px] shrink-0 hidden xl:flex flex-col items-center justify-center bg-slate-100 py-6 px-4">
          <p className="text-slate-400 text-[11px] uppercase tracking-widest mb-3">
            Live preview
          </p>
          {entity === "albums" ? (
            <>
              <div
                className="relative rounded-[42px] overflow-hidden shadow-2xl"
                style={{
                  width: 360,
                  height: 760,
                  background: "#000",
                  padding: 10,
                  boxShadow:
                    "0 0 0 2px rgba(255,255,255,0.08), 0 30px 70px rgba(0,0,0,0.6)",
                }}
              >
                <iframe
                  key={iframeKey}
                  src={iframeSrc}
                  title="Live preview"
                  className="w-full h-full rounded-[32px] bg-[#f7f8fa]"
                  data-testid="iframe-preview"
                />
              </div>
              <p className="text-slate-300 text-xs mt-3">
                {selectedId
                  ? `Previewing /album/${selectedId.slice(0, 8)}…`
                  : "Open the player at /collection"}
              </p>
            </>
          ) : entity === "instruments" && selectedId ? (
            <InstrumentPreviewCard instrumentId={selectedId} />
          ) : entity === "people" && selectedId ? (
            (() => {
              const p = people.find((x) => x.id === selectedId);
              if (!p) return null;
              return <PersonPreviewCard person={p} />;
            })()
          ) : entity === "vendors" && selectedId ? (
            (() => {
              const v = allVendors.find((x) => x.id === selectedId);
              if (!v) return null;
              return <VendorPreviewCard vendor={v} />;
            })()
          ) : entity === "labels" && selectedId ? (
            (() => {
              const l = labels.find((x) => x.id === selectedId);
              if (!l) return null;
              return <LabelPreviewCard label={l} albums={albums} people={people} />;
            })()
          ) : (
            <div
              className="rounded-[42px] flex items-center justify-center text-center px-8"
              style={{
                width: 360,
                height: 760,
                background: "rgba(255,255,255,0.02)",
                border: "1px dashed rgba(255,255,255,0.12)",
              }}
              data-testid="placeholder-preview"
            >
              <p className="text-slate-400 text-sm leading-relaxed">
                Select a row on the left to see how it looks to fans.
              </p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
