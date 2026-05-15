import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import {
  SiApplemusic,
  SiSpotify,
  SiInstagram,
  SiTiktok,
  SiX,
  SiBluesky,
  SiFacebook,
} from "react-icons/si";
import { Globe, Check, Search, X as XIcon } from "lucide-react";

interface AdminAlbum {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  year: number | null;
  type: "album" | "EP";
  description: string | null;
  // Demo show/hide. When true the album (and its songs/credits) is hidden
  // from the fan-side catalog. CMS callers see hidden rows so they can
  // flip the toggle back on.
  isHidden: boolean;
  // Optional record-label FK. SET NULL in the DB so a deleted label leaves
  // the album's catalog row intact (just with no label credit). The album
  // read endpoints denormalize the full label entity onto `album.label`,
  // but the editor only ever writes back the FK.
  labelId: string | null;
  // Per-album streaming-service handoff. Populated either by the People
  // discography panel (Apple Music) or manually on the album editor.
  appleMusicUrl: string | null;
  spotifyUrl: string | null;
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
  bio: string | null;
  accent: string | null;
  appleMusicUrl: string | null;
  spotifyUrl: string | null;
  itunesArtistId: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  twitterUrl: string | null;
  blueskyUrl: string | null;
  facebookUrl: string | null;
  websiteUrl: string | null;
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

// Promote another user to admin by @username. Lives in the sidebar so it's
// reachable from any tab. No revoke — by design (see /api/admin/promote
// comment in server/routes.ts).
function PromotePanel() {
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
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
  return (
    <div className="px-3 py-3 border-t border-slate-200">
      <p className="px-1 text-[10px] uppercase tracking-widest text-slate-400 mb-2">
        Add admin
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const u = username.trim().replace(/^@/, "");
          if (!u) return;
          setMsg(null);
          promote.mutate(u);
        }}
        className="space-y-2"
      >
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="@username"
          className={inputCls + " py-1.5 text-xs"}
          data-testid="input-promote-username"
        />
        <button
          type="submit"
          disabled={promote.isPending || !username.trim()}
          className="w-full px-3 py-1.5 rounded-md bg-[#319ED8] text-white text-xs font-medium hover:bg-[#319ED8]/90 disabled:opacity-40"
          data-testid="button-promote-admin"
        >
          {promote.isPending ? "Promoting…" : "Promote to admin"}
        </button>
        {msg && (
          <p
            className={`text-[11px] ${msg.kind === "ok" ? "text-[#319ED8]" : "text-red-600"}`}
            data-testid="text-promote-result"
          >
            {msg.text}
          </p>
        )}
      </form>
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
        labelId: data.labelId ?? null,
        appleMusicUrl: data.appleMusicUrl,
        spotifyUrl: data.spotifyUrl,
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
            className="text-slate-900 text-lg font-semibold"
            data-testid="text-editor-title"
          >
            Edit album
          </h2>
          <p className="text-slate-400 text-xs">{albumId}</p>
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

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        <Field label="Title">
          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className={inputCls}
            data-testid="input-album-title"
          />
        </Field>
        <Field label="Artist">
          <input
            value={form.artist}
            onChange={(e) => set("artist", e.target.value)}
            className={inputCls}
            data-testid="input-album-artist"
          />
        </Field>
        <Field label="Artwork">
          <ArtworkPicker
            value={form.artwork}
            onChange={(next) => set("artwork", next)}
            shape="square"
            testId="input-album-artwork"
            hint="Square. 1000×1000 px recommended (3000×3000 for a future Apple-Music-grade master). JPG or PNG. Larger uploads are fine — the player scales them down."
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
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
              onChange={(e) => set("type", e.target.value as "album" | "EP")}
              className={inputCls}
              data-testid="select-album-type"
            >
              <option value="album">Album</option>
              <option value="EP">EP</option>
            </select>
          </Field>
        </div>
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
        <p className="text-[11px] text-slate-400 -mt-2">
          "Listen on…" handoff. Surfaced on the album page after the in-app
          preview window. Apple Music URL is auto-filled when an album is pulled
          from an artist's discography.
        </p>

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
              />
            ))}
            {(data?.songs ?? []).length === 0 && (
              <div className="px-4 py-6 text-center text-slate-400 text-sm">
                No songs yet.
              </div>
            )}
          </div>
        </div>
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

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["/api/songs", songId, "credits"],
    });

  const addWriter = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/admin/songs/${songId}/writers`,
        {
          name: "New writer",
          role: "Composer",
        },
      );
      return res.json();
    },
    onSuccess: invalidate,
  });
  const addPerformer = useMutation({
    mutationFn: async () => {
      const firstPerson = people[0];
      if (!firstPerson)
        throw new Error("Add at least one Person in the People tab first.");
      const res = await apiRequest(
        "POST",
        `/api/admin/songs/${songId}/performers`,
        {
          personId: firstPerson.id,
          name: firstPerson.name,
          role: "Guitar",
        },
      );
      return res.json();
    },
    onSuccess: invalidate,
    onError: (e: Error) => alert(e.message),
  });

  if (!credits)
    return <div className="text-slate-400 text-xs py-2">Loading credits…</div>;

  return (
    <div className="space-y-4 pt-2">
      {/* Writers */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-slate-500 text-[11px] uppercase tracking-wider">
            Writers{" "}
            <span className="text-slate-300 ml-1">
              ({credits.writers.length})
            </span>
          </h4>
          <button
            type="button"
            onClick={() => addWriter.mutate()}
            className="text-[11px] text-[#319ED8] hover:underline"
            data-testid={`button-add-writer-${songId}`}
          >
            + Writer
          </button>
        </div>
        <div className="space-y-1">
          {credits.writers.map((w) => (
            <WriterRow
              key={w.id}
              writer={w}
              people={people}
              onChanged={invalidate}
            />
          ))}
          {credits.writers.length === 0 && (
            <p className="text-slate-300 text-xs">No writers yet.</p>
          )}
        </div>
      </div>

      {/* Performers */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-slate-500 text-[11px] uppercase tracking-wider">
            Performers{" "}
            <span className="text-slate-300 ml-1">
              ({credits.performers.length})
            </span>
          </h4>
          <button
            type="button"
            onClick={() => addPerformer.mutate()}
            disabled={people.length === 0}
            title={people.length === 0 ? "Add People first" : ""}
            className="text-[11px] text-[#319ED8] hover:underline disabled:opacity-40 disabled:no-underline"
            data-testid={`button-add-performer-${songId}`}
          >
            + Performer
          </button>
        </div>
        <div className="space-y-1">
          {credits.performers.map((p) => (
            <PerformerRow
              key={p.id}
              performer={p}
              people={people}
              instruments={instruments}
              onChanged={invalidate}
            />
          ))}
          {credits.performers.length === 0 && (
            <p className="text-slate-300 text-xs">No performers yet.</p>
          )}
        </div>
      </div>
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

function WriterRow({
  writer,
  people,
  onChanged,
}: {
  writer: AdminTrackWriter & { person: AdminPerson | null };
  people: AdminPerson[];
  onChanged: () => void;
}) {
  const { draft, setDraft, dirty, snapshot } = useRowDraft(writer);
  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "PUT",
        `/api/admin/writers/${writer.id}`,
        snapshot(),
      );
      return res.json();
    },
    onSuccess: onChanged,
  });
  const del = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/writers/${writer.id}`);
    },
    onSuccess: onChanged,
  });
  return (
    <div
      className="grid grid-cols-[2fr_1fr_1.5fr_auto_auto] gap-2 items-center"
      data-testid={`row-writer-${writer.id}`}
    >
      <input
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="Name"
        className={inputCls + " py-1 text-xs"}
      />
      <input
        value={draft.role}
        onChange={(e) => setDraft({ ...draft, role: e.target.value })}
        placeholder="Composer / Lyricist / Producer"
        className={inputCls + " py-1 text-xs"}
      />
      <select
        value={draft.personId ?? ""}
        onChange={(e) => {
          const id = e.target.value || null;
          const matched = people.find((p) => p.id === id);
          setDraft({
            ...draft,
            personId: id,
            name: matched ? matched.name : draft.name,
          });
        }}
        className={inputCls + " py-1 text-xs"}
      >
        <option value="">— link to person (optional) —</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!dirty || save.isPending}
        onClick={() => save.mutate()}
        className="px-2 py-1 rounded bg-[#319ED8] text-slate-900 text-[11px] disabled:opacity-40"
        data-testid={`button-save-writer-${writer.id}`}
      >
        {save.isPending ? "…" : "Save"}
      </button>
      <button
        type="button"
        disabled={del.isPending}
        onClick={() => {
          if (confirm("Delete this writer credit?")) del.mutate();
        }}
        className="px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 rounded disabled:opacity-40"
        data-testid={`button-delete-writer-${writer.id}`}
      >
        ×
      </button>
    </div>
  );
}

function PerformerRow({
  performer,
  people,
  instruments,
  onChanged,
}: {
  performer: AdminTrackPerformer & { person: AdminPerson | null };
  people: AdminPerson[];
  instruments: AdminInstrument[];
  onChanged: () => void;
}) {
  const { draft, setDraft, dirty, snapshot } = useRowDraft(performer);
  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "PUT",
        `/api/admin/performers/${performer.id}`,
        snapshot(),
      );
      return res.json();
    },
    onSuccess: onChanged,
  });
  const del = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/performers/${performer.id}`);
    },
    onSuccess: onChanged,
  });
  return (
    <div
      className="grid grid-cols-[1.5fr_1fr_1.5fr_1fr_auto_auto] gap-2 items-center"
      data-testid={`row-performer-${performer.id}`}
    >
      <select
        value={draft.personId ?? ""}
        onChange={(e) => {
          const id = e.target.value || null;
          const matched = people.find((p) => p.id === id);
          // Snapshot the display name whenever the link changes so credits
          // keep rendering even if the Person is later removed.
          setDraft({
            ...draft,
            personId: id,
            name: matched ? matched.name : draft.name,
          });
        }}
        className={inputCls + " py-1 text-xs"}
      >
        <option value="">— unlinked ({draft.name}) —</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input
        value={draft.role}
        onChange={(e) => setDraft({ ...draft, role: e.target.value })}
        placeholder="Guitar / Bass / Vocals"
        className={inputCls + " py-1 text-xs"}
      />
      <select
        value={draft.instrumentId ?? ""}
        onChange={(e) =>
          setDraft({ ...draft, instrumentId: e.target.value || null })
        }
        className={inputCls + " py-1 text-xs"}
      >
        <option value="">— instrument (optional) —</option>
        {instruments.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      <input
        value={draft.tuningNotes ?? ""}
        onChange={(e) =>
          setDraft({ ...draft, tuningNotes: e.target.value || null })
        }
        placeholder="DADGAD, capo 3…"
        className={inputCls + " py-1 text-xs"}
      />
      <button
        type="button"
        disabled={!dirty || save.isPending}
        onClick={() => save.mutate()}
        className="px-2 py-1 rounded bg-[#319ED8] text-slate-900 text-[11px] disabled:opacity-40"
        data-testid={`button-save-performer-${performer.id}`}
      >
        {save.isPending ? "…" : "Save"}
      </button>
      <button
        type="button"
        disabled={del.isPending}
        onClick={() => {
          if (confirm("Delete this performer credit?")) del.mutate();
        }}
        className="px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 rounded disabled:opacity-40"
        data-testid={`button-delete-performer-${performer.id}`}
      >
        ×
      </button>
    </div>
  );
}

function SongRow({
  song,
  onSave,
  onDelete,
}: {
  song: AdminSong;
  onSave: (p: Partial<AdminSong>) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(song);
  useEffect(
    () => setDraft(song),
    [
      song.id,
      song.title,
      song.lyrics,
      song.trackNumber,
      song.duration,
      song.audioUrl,
    ],
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(song);

  return (
    <div className="border-b border-slate-200 last:border-b-0">
      <div className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50">
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
          <input
            value={draft.audioUrl ?? ""}
            onChange={(e) => setDraft({ ...draft, audioUrl: e.target.value })}
            placeholder="Audio URL (optional)"
            className={inputCls}
          />
          <textarea
            value={draft.lyrics ?? ""}
            onChange={(e) => setDraft({ ...draft, lyrics: e.target.value })}
            placeholder="Lyrics (use [Verse 1], [Chorus] etc. for section headers)"
            rows={6}
            className={inputCls + " resize-none font-mono text-xs"}
          />
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

// Paste-an-artist-URL bar. Mirror of ScrapeBar for instruments. Reads the
// artist's Apple Music or Spotify page for name/photo/bio, and (Apple only)
// the full discography via the free iTunes Lookup API.
function ArtistScrapeBar({
  onPrefill,
}: {
  onPrefill: (r: ArtistScrapeResult, sourceUrl: string) => void;
}) {
  const [url, setUrl] = useState("");
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
      const res = await apiRequest("POST", "/api/admin/people/scrape", {
        url: u,
      });
      const data = (await res.json()) as ArtistScrapeResult;
      onPrefill(data, u);
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
      setMsg({
        kind: "ok",
        text: `Filled name, photo, bio, and ${src} URL below. Review and Save.${discog}`,
      });
      setUrl("");
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
          placeholder="Paste an Apple Music or Spotify artist URL to auto-fill the form"
          className={inputCls + " flex-1"}
          disabled={busy}
          data-testid="input-artist-scrape-url"
        />
        <button
          type="button"
          onClick={go}
          disabled={busy || !url.trim()}
          className="px-3 py-2 rounded-md bg-[#319ED8] text-white text-sm font-medium disabled:opacity-40"
          data-testid="button-artist-scrape-url"
        >
          {busy ? "Reading…" : "Fill form"}
        </button>
      </div>
      <p className="text-[11px] text-slate-400">
        Helper only — nothing is saved until you click <strong>Save changes</strong>.
        Drops the name, photo, bio, and matching streaming URL into the
        fields below. Apple Music URLs also list the artist's full
        discography.
      </p>
      <p
        role="status"
        aria-live="polite"
        className={`text-[12px] min-h-[1em] ${msg?.kind === "err" ? "text-red-600" : "text-[#319ED8]"}`}
        data-testid="text-artist-scrape-result"
      >
        {msg?.text ?? ""}
      </p>
    </div>
  );
}

// Discography row — one pulled album from iTunes Lookup. Shows artwork +
// title + year + a status pill on the right ("In library" if we already
// have a matching album, otherwise "+ Add" which one-clicks creating it
// in GoodTunes with the right artist/year/artwork/Apple Music URL).
function DiscographyRow({
  album,
  artistName,
  match,
  onAdded,
}: {
  album: ScrapedArtistAlbum;
  artistName: string;
  match: AdminAlbum | null;
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
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
      onAdded();
    },
  });
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
        <span className="text-[11px] font-medium text-[#319ED8] bg-[#319ED8]/10 px-2 py-1 rounded">
          In library
        </span>
      ) : (
        <button
          type="button"
          onClick={() => add.mutate()}
          disabled={add.isPending}
          className="text-[12px] text-[#319ED8] font-medium hover:underline disabled:opacity-40"
          data-testid={`button-add-album-${album.collectionId}`}
        >
          {add.isPending ? "Adding…" : "+ Add"}
        </button>
      )}
    </div>
  );
}

function PersonEditor({
  personId,
  onDeleted,
}: {
  personId: string;
  onDeleted: () => void;
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
  // Discography lives in client state — it's transient (pulled per session,
  // not persisted). On re-pull we replace it; on save we don't touch it.
  const [discography, setDiscography] = useState<ScrapedArtistAlbum[]>([]);
  // Which streaming/social tab is currently revealed below the icon strip.
  // Default to Apple Music — the most common starting point for a fresh
  // person (the Pull bar drops an Apple URL straight into that field).
  const [activeSocial, setActiveSocial] = useState<string>("apple");
  // The single input rendered under the active tab. One ref is enough now
  // — focusing it on tab change keeps the keyboard-paste flow smooth.
  const socialInputRef = useRef<HTMLInputElement>(null);
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
            style={{ background: form.accent || "#319ED8" }}
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

      <ArtistScrapeBar
        onPrefill={(r, sourceUrl) => {
          // Auto-fill the matching streaming field from the URL the admin
          // pasted into the Pull bar so they don't have to enter it twice.
          // The scraper may also return one (Apple URL → spotifyUrl, etc.)
          // — prefer the scraper response when it's there.
          const lower = sourceUrl.toLowerCase();
          const pastedIsApple = /music\.apple\.com/.test(lower);
          const pastedIsSpotify = /open\.spotify\.com/.test(lower);
          update({
            // Never clobber a non-empty existing value
            name:
              form.name && form.name !== "New person"
                ? form.name
                : r.name || form.name,
            photoUrl: form.photoUrl || r.photoUrl,
            bio: form.bio || r.bio,
            appleMusicUrl:
              r.appleMusicUrl ||
              (pastedIsApple ? sourceUrl : form.appleMusicUrl),
            spotifyUrl:
              r.spotifyUrl ||
              (pastedIsSpotify ? sourceUrl : form.spotifyUrl),
            itunesArtistId: r.itunesArtistId || form.itunesArtistId,
          });
          setDiscography(r.albums);
        }}
      />

      <Field label="Name">
        <input
          value={form.name}
          onChange={(e) => update({ name: e.target.value })}
          className={inputCls}
          data-testid="input-person-name"
        />
      </Field>
      <Field label="Photo URL">
        <input
          value={form.photoUrl ?? ""}
          onChange={(e) => update({ photoUrl: e.target.value || null })}
          className={inputCls}
          data-testid="input-person-photo"
        />
        <p className="text-[11px] text-slate-400 mt-1">
          Square, displayed as a circle. 400×400 px minimum (800×800 for
          retina). JPG or PNG.
        </p>
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

      {/* Streaming + social URLs collapsed into a single tabbed control:
          eight platform icons act as both completion indicators (mint check
          when filled) and tabs. Clicking one reveals a single input bound
          to that platform's URL field. Saves vertical space, removes the
          old redundant two-column grids, and gives the admin a glanceable
          "X of 8 filled" counter. */}
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
              <input
                ref={socialInputRef}
                key={active.key}
                value={activeValue}
                onChange={(e) =>
                  update({ [active.field]: e.target.value || null })
                }
                placeholder={active.placeholder}
                className={inputCls}
                data-testid={active.testid}
              />
            </Field>
            {(active.key === "apple" || active.key === "spotify") && (
              <p className="text-[11px] text-slate-400">
                After the in-app preview window, fans get "Listen on Apple
                Music / Spotify" buttons that point here.
              </p>
            )}
          </div>
        );
      })()}

      <Field label="Accent colour (hex, falls back to brand blue)">
        <div className="flex items-center gap-2">
          <input
            value={form.accent ?? ""}
            onChange={(e) => update({ accent: e.target.value || null })}
            placeholder="#319ED8"
            className={inputCls}
            data-testid="input-person-accent"
          />
          {["#319ED8", "#7F10A7", "#4AFFCA", "#FF5470"].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => update({ accent: c })}
              className="w-7 h-7 rounded-full shrink-0 border border-slate-300"
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>
      </Field>

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

      {discography.length > 0 && (
        <div
          className="pt-4 border-t border-slate-200 space-y-2"
          data-testid="section-discography"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-slate-900 text-sm font-semibold uppercase tracking-wider">
              Discography
            </h3>
            <span className="text-[11px] text-slate-400">
              {discography.length} from Apple Music · newest first
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            One-click adds an album to GoodTunes with real artwork + the Apple
            Music handoff URL. Track-by-track import and Spotify URLs come next.
          </p>
          <div className="divide-y divide-slate-100">
            {discography.map((a) => (
              <DiscographyRow
                key={a.collectionId}
                album={a}
                artistName={form.name}
                match={matchAlbum(a, form.name)}
                onAdded={() => {
                  /* match recomputes after invalidation refetches /api/albums */
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- InstrumentEditor ----------

// Paste-a-vendor-URL bar. Calls the server scraper, prefills name/photo/
// category on the parent form, and pushes a pre-populated vendor row.
// On hosts we don't recognise yet we still show what we found — the admin
// can edit the inferred vendor name before saving.
function ScrapeBar({
  onPrefill,
}: {
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
  const [url, setUrl] = useState("");
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
      setUrl("");
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

      <ScrapeBar
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

      {/* Vendors */}
      <div className="pt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-slate-900 text-sm font-semibold">
            Vendors{" "}
            <span className="text-slate-400 font-normal">
              ({form.vendors.length})
            </span>
          </h3>
          <button
            type="button"
            onClick={() => addVendor.mutate()}
            disabled={addVendor.isPending}
            className="text-[12px] text-[#319ED8] hover:underline"
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
              No vendors yet. Affiliate links surface here in the in-app
              instrument sheet.
            </p>
          )}
        </div>
      </div>
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
            <input
              value={draft.affiliateUrl}
              onChange={(e) =>
                setDraft({ ...draft, affiliateUrl: e.target.value })
              }
              className={inputCls}
              data-testid={`input-vendor-affiliate-${vendor.id}`}
            />
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

  const attachmentCount = vendor.attachments.length;

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
            {draft.domain || "no domain"} · Used on{" "}
            <span className="text-slate-700 font-medium">
              {attachmentCount}
            </span>{" "}
            {attachmentCount === 1 ? "instrument" : "instruments"}
          </p>
        </div>
      </div>

      {/* "Used on" list — each clickable, jumps to that instrument so the
          admin can edit its per-attachment affiliateUrl / visibility. */}
      <div className="px-6 py-4 border-b border-slate-200">
        <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">
          Used on
        </p>
        {attachmentCount === 0 ? (
          <p className="text-slate-400 text-sm">
            Not attached to any instrument yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {vendor.attachments.map((a) => (
              <li key={a.attachmentId}>
                <button
                  type="button"
                  onClick={() => onJumpToInstrument(a.instrumentId)}
                  className="text-sm text-slate-700 hover:text-[#319ED8] hover:underline text-left flex items-center gap-2"
                  data-testid={`link-vendor-instrument-${a.instrumentId}`}
                >
                  <span className="truncate">{a.instrumentName}</span>
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
      </div>

      <div className="px-6 py-5 space-y-3 max-w-2xl">
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
            hint="Small, square. PNG with transparency works best. Falls back to a Google-served favicon if empty."
          />
        </Field>
        <Field label="Cover / hero background">
          <ArtworkPicker
            value={draft.coverUrl ?? ""}
            onChange={(v) => setDraft({ ...draft, coverUrl: v || null })}
            testId="input-vendor-pane-cover"
            hint="Wide hero shot of the storefront, workshop, or product. ~1600×1200 recommended."
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
              <div className="px-5 pb-4">
                <p
                  className="text-[12.5px] leading-relaxed whitespace-pre-wrap"
                  style={{ color: "rgba(255,255,255,0.85)" }}
                >
                  {data.about}
                </p>
              </div>
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

// Phone-frame preview that mirrors the fan-side PerformerSheet header.
// People don't have a standalone public page yet — they surface inside a
// song's credits — so we render the header treatment (big avatar + name +
// accent dot + bio) the fan would see when they tap a performer row.
// Streaming links are previewed as the same pills we'll use post-window
// when fans get punted to Apple Music / Spotify for the full catalog.
function PersonPreviewCard({ person }: { person: AdminPerson }) {
  const initials =
    person.name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "•";
  const accent = person.accent || "#319ED8";
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
        <div className="w-full h-full rounded-[32px] overflow-hidden bg-[#00062B] flex flex-col">
          {/* Mock status bar */}
          <div className="flex-shrink-0 flex items-center justify-between px-5 pt-3 pb-1 text-[11px] font-medium text-white">
            <span>9:41</span>
            <span>● ● ●</span>
          </div>
          {/* Sheet chrome — close affordance, no back arrow on a fullscreen sheet */}
          <div className="flex-shrink-0 flex items-center justify-end px-3 pb-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/70"
              style={{ background: "rgba(255,255,255,0.10)" }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </div>
          </div>

          {/* Hero — large avatar + name + role placeholder */}
          <div className="flex flex-col items-center text-center px-5 pt-2 pb-5">
            {person.photoUrl ? (
              <img
                src={person.photoUrl}
                alt={person.name}
                className="rounded-full object-cover"
                style={{ width: 112, height: 112 }}
              />
            ) : (
              <div
                className="rounded-full flex items-center justify-center text-white font-semibold"
                style={{
                  width: 112,
                  height: 112,
                  background: accent,
                  fontSize: 42,
                }}
                aria-hidden="true"
              >
                {initials}
              </div>
            )}
            <h2
              className="text-white text-[24px] font-bold leading-tight mt-3"
              data-testid="text-preview-person-name"
            >
              {person.name || "Unnamed"}
            </h2>
            <p className="text-white/70 text-[13px] mt-1">
              Tap from any song credit to land here
            </p>
          </div>

          {/* Bio — explicit white at 0.95 (not /75) because the dark navy
              swallows lower-opacity text and Sam's "Hi I'm sam. Thanks for
              listening :)" became unreadable in the preview. */}
          {person.bio && (
            <div className="px-5">
              <h3 className="pt-1 pb-2 text-white text-[18px] font-bold tracking-tight">
                About
              </h3>
              <p
                className="text-[14px] leading-relaxed whitespace-pre-line line-clamp-6"
                style={{ color: "rgba(255,255,255,0.95)" }}
              >
                {person.bio}
              </p>
            </div>
          )}

          {/* Find-her-elsewhere icon row. Apple/Spotify are sized identically
              to the social icons — we want fans to know she's there, but not
              hand-hold them out of our player. Pure circles, white-on-glass. */}
          <SocialIconRow person={person} />
        </div>
      </div>
      <p className="text-slate-300 text-xs mt-3">
        Preview of the in-app PerformerSheet header.
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
  // Same favicon fallback the fan sheet uses, so an empty Logo field still
  // looks correct in the preview rather than showing a blank circle.
  const logoFallback = useMemo(() => {
    if (vendor.logoUrl) return vendor.logoUrl;
    if (vendor.domain)
      return `https://www.google.com/s2/favicons?sz=128&domain=${vendor.domain}`;
    return "";
  }, [vendor.logoUrl, vendor.domain]);

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
          {/* Mock status bar + back chevron (vendor is a sub-sheet of an instrument) */}
          <div className="flex-shrink-0 flex items-center justify-between px-5 pt-3 pb-1 text-[11px] font-medium text-white">
            <span>9:41</span>
            <span>● ● ●</span>
          </div>
          <div className="flex-shrink-0 flex items-center justify-between px-3 pb-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/70"
              style={{ background: "rgba(255,255,255,0.10)" }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </div>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/70"
              style={{ background: "rgba(255,255,255,0.10)" }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </div>
          </div>

          {/* Hero — full-bleed cover with gradient fade + vendor name overlay.
              Mirrors VendorSheet in AlbumDetail.tsx (negative margin pulls
              the image up under the sticky bar). Cover height is dialled in
              so name + tagline always sit above the scroll fold. */}
          <div
            className="relative w-full flex-shrink-0"
            style={{ height: 260 }}
          >
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
                {logoFallback && (
                  <>
                    <img
                      src={logoFallback}
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
                        className="w-28 h-28 rounded-full flex items-center justify-center overflow-hidden"
                        style={{
                          background: "rgba(255,255,255,0.55)",
                          backdropFilter: "blur(8px)",
                        }}
                      >
                        <img
                          src={logoFallback}
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
              className="absolute inset-x-0 bottom-0 h-2/3"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(0,6,43,0) 0%, rgba(0,6,43,0.85) 70%, #00062B 100%)",
              }}
            />
            <div className="absolute left-5 right-5 bottom-3">
              <h2
                className="text-white text-[26px] font-bold leading-tight tracking-tight"
                data-testid="text-preview-vendor-name"
              >
                {vendor.name || "Untitled vendor"}
              </h2>
              {vendor.tagline && (
                <p
                  className="text-[13px] mt-0.5"
                  style={{ color: "rgba(235,235,245,0.7)" }}
                >
                  {vendor.tagline}
                </p>
              )}
            </div>
          </div>

          {/* Primary actions — Visit + View listing. Non-interactive in preview. */}
          <div className="px-5 pt-3 flex gap-2 flex-shrink-0">
            <div
              className="flex-1 h-9 rounded-full flex items-center justify-center text-white text-[13px] font-semibold"
              style={{ background: "#319ED8" }}
            >
              Visit website
            </div>
            <div
              className="h-9 px-4 rounded-full flex items-center justify-center text-white text-[13px] font-semibold"
              style={{ background: "rgba(255,255,255,0.10)" }}
            >
              View listing
            </div>
          </div>

          {/* Bio / about — same "About {name}" pattern as the fan sheet */}
          <div className="px-5 pt-4 pb-2 flex-1 overflow-hidden">
            <h3 className="text-white text-[16px] font-bold leading-tight tracking-tight mb-1.5">
              About {vendor.name || "this vendor"}
            </h3>
            {vendor.bio ? (
              <p
                className="text-[13px] leading-relaxed line-clamp-6"
                style={{ color: "rgba(255,255,255,0.85)" }}
                data-testid="text-preview-vendor-bio"
              >
                {vendor.bio}
              </p>
            ) : (
              <p
                className="text-[12px]"
                style={{ color: "rgba(235,235,245,0.4)" }}
              >
                No bio yet — add a short paragraph so fans know who they're
                buying from.
              </p>
            )}
            {vendor.location && (
              <p
                className="text-[12px] mt-3"
                style={{ color: "rgba(235,235,245,0.55)" }}
              >
                <span aria-hidden>📍 </span>
                {vendor.location}
              </p>
            )}
          </div>
        </div>
      </div>
      <p className="text-slate-300 text-xs mt-3">
        Preview of the in-app VendorSheet hero — surfaces wherever this
        vendor is attached ({vendor.attachments.length}{" "}
        {vendor.attachments.length === 1 ? "instrument" : "instruments"}).
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

  useEffect(() => {
    if (data) {
      setForm({ ...data });
      setDirty(false);
    }
  }, [data?.id]);

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
            hint="Square logo, 512×512 recommended. Shown on album headers + the label tab list."
          />
        </Field>
        <Field label="Cover image">
          <ArtworkPicker
            value={form.coverUrl ?? ""}
            onChange={(next) => set("coverUrl", next || null)}
            shape="square"
            testId="input-label-cover"
            hint="Optional. Hero image for the future label page."
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

// ---------- AlbumLabelPicker ----------
// Lightweight dropdown shown inside AlbumEditor. Lists every label by name
// (alpha-sorted server-side) plus a "No label" option that writes null.
function AlbumLabelPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const { data: labels = [] } = useQuery<AdminLabel[]>({
    queryKey: ["/api/labels"],
  });
  return (
    <Field label="Label">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={inputCls}
        data-testid="select-album-label"
      >
        <option value="">— No label —</option>
        {labels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

// ---------- Admin shell ----------

export function Admin() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [entity, setEntity] = useState<EntityKey>("albums");
  // Per-entity selection so switching tabs preserves which row was open.
  const [selectedByEntity, setSelectedByEntity] = useState<
    Record<EntityKey, string | null>
  >({
    albums: null,
    people: null,
    instruments: null,
    vendors: null,
    labels: null,
  });
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
    if (selectedByEntity.albums == null && albums.length > 0)
      setSelectedByEntity((p) => ({ ...p, albums: albums[0].id }));
  }, [albums, selectedByEntity.albums]);
  useEffect(() => {
    if (selectedByEntity.people == null && people.length > 0)
      setSelectedByEntity((p) => ({ ...p, people: people[0].id }));
  }, [people, selectedByEntity.people]);
  useEffect(() => {
    if (selectedByEntity.instruments == null && instruments.length > 0)
      setSelectedByEntity((p) => ({ ...p, instruments: instruments[0].id }));
  }, [instruments, selectedByEntity.instruments]);
  useEffect(() => {
    if (selectedByEntity.labels == null && labels.length > 0)
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
    // Sort vendors by their newest attachment date (proxy for "recently
    // touched" since the vendor entity itself doesn't surface created_at
    // in the API response).
    rows.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
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
  const filteredAlbums = useMemo(
    () =>
      !needle
        ? albums
        : albums.filter(
            (a) =>
              a.title.toLowerCase().includes(needle) ||
              a.artist.toLowerCase().includes(needle),
          ),
    [albums, needle],
  );
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

  const createAlbum = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/albums", {
        title: "New album",
        artist: "Unknown artist",
        artwork: "/figmaAssets/artworks-000451097049-kerecr-t500x500.png",
        type: "album",
      });
      return res.json() as Promise<AdminAlbum>;
    },
    onSuccess: (a) => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-albums"] });
      setSelectedByEntity((p) => ({ ...p, albums: a.id }));
    },
  });

  const createPerson = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/people", {
        name: "New person",
        accent: "#319ED8",
      });
      return res.json() as Promise<AdminPerson>;
    },
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      setSelectedByEntity((s) => ({ ...s, people: p.id }));
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
      queryClient.invalidateQueries({ queryKey: ["/api/instruments"] });
      setSelectedByEntity((s) => ({ ...s, instruments: i.id }));
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
      queryClient.invalidateQueries({ queryKey: ["/api/labels"] });
      setSelectedByEntity((s) => ({ ...s, labels: l.id }));
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
    <main className="min-h-screen bg-[#f7f8fa] text-slate-900 flex flex-col">
      {/* Top bar spans the full width so the three columns below all align
          at the same y. The dark color logo reads cleanly on this near-white
          surface — we deliberately do NOT use the shared GoodTunesLogo
          component because it bakes in `mix-blend-mode: screen` for the
          dark fan UI, which makes the mark disappear on this bg. */}
      <header className="h-14 shrink-0 border-b border-slate-200 bg-white flex items-center px-6 gap-3">
        <img
          src="/goodtunes-logo-color.png"
          alt="GoodTunes®"
          className="h-7 w-auto"
          data-testid="img-admin-logo"
        />
        <span className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">
          Admin
        </span>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left rail: entity nav */}
        <aside className="w-56 shrink-0 border-r border-slate-200 flex flex-col">
          <nav className="flex-1 px-2 py-3 space-y-1 text-sm">
            {(
              [
                { key: "albums", label: "Albums", count: albums.length },
                { key: "people", label: "People", count: people.length },
                {
                  key: "instruments",
                  label: "Instruments",
                  count: instruments.length,
                },
                { key: "vendors", label: "Vendors", count: allVendors.length },
                { key: "labels", label: "Labels", count: labels.length },
              ] as { key: EntityKey; label: string; count: number }[]
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setEntity(t.key)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-left ${entity === t.key ? "bg-[#eff4ff] text-[#319ED8] font-medium" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                data-testid={`nav-${t.key}`}
              >
                <span>{t.label}</span>
                <span className="text-[11px] text-slate-400">{t.count}</span>
              </button>
            ))}
          </nav>
          <PromotePanel />
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
              <h2 className="text-slate-900 text-sm font-semibold capitalize">
                {entity}
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
                  className={`text-[12px] ${entity === "vendors" ? "text-slate-300 cursor-not-allowed" : "text-[#319ED8] hover:underline"}`}
                  title={
                    entity === "vendors"
                      ? "Vendors are added via an instrument's scraper"
                      : undefined
                  }
                  data-testid={`button-new-${entity.slice(0, -1)}`}
                >
                  + New
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
                        style={{ background: p.accent || "#319ED8" }}
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
                const summary =
                  count === 0
                    ? "Not attached"
                    : count === 1
                      ? `on ${v.attachments[0].instrumentName}`
                      : `on ${count} instruments`;
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
              <li className="px-4 py-6 text-slate-400 text-sm">
                {needle
                  ? `No albums match "${search}".`
                  : "No albums yet. Click + New."}
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
                      <div className="w-10 h-10 rounded bg-slate-100 shrink-0" />
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
        <section className="flex-1 min-w-0 border-r border-slate-200">
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
