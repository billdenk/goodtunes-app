import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

interface AdminAlbum {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  year: number | null;
  type: "album" | "EP";
  description: string | null;
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
  songs: AdminSong[];
}

// ---------- AlbumEditor ----------

function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function AlbumEditor({ albumId, onDeleted }: { albumId: string; onDeleted: () => void }) {
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
      const res = await apiRequest("PUT", `/api/admin/albums/${albumId}`, payload);
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
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AdminSong> }) => {
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
    return <div className="p-8 text-white/50">Loading…</div>;
  }

  const set = <K extends keyof AdminAlbum>(k: K, v: AdminAlbum[K]) => {
    setForm({ ...form, [k]: v });
    setDirty(true);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div>
          <h2 className="text-white text-lg font-semibold" data-testid="text-editor-title">Edit album</h2>
          <p className="text-white/40 text-xs">{albumId}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (confirm("Delete this album, all its songs, and any playlist references? This cannot be undone.")) {
                deleteAlbum.mutate();
              }
            }}
            disabled={deleteAlbum.isPending}
            className="px-3 py-1.5 text-[13px] text-red-300 hover:bg-red-500/10 rounded-md disabled:opacity-50"
            data-testid="button-delete-album"
          >
            Delete
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
          <input value={form.title} onChange={(e) => set("title", e.target.value)} className={inputCls} data-testid="input-album-title" />
        </Field>
        <Field label="Artist">
          <input value={form.artist} onChange={(e) => set("artist", e.target.value)} className={inputCls} data-testid="input-album-artist" />
        </Field>
        <Field label="Artwork URL">
          <input value={form.artwork} onChange={(e) => set("artwork", e.target.value)} className={inputCls} data-testid="input-album-artwork" />
          {form.artwork ? (
            <img src={form.artwork} alt="" className="mt-2 w-32 h-32 rounded-md object-cover border border-white/10" />
          ) : null}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Year">
            <input
              type="number"
              value={form.year ?? ""}
              onChange={(e) => set("year", e.target.value === "" ? null : Number(e.target.value))}
              className={inputCls}
              data-testid="input-album-year"
            />
          </Field>
          <Field label="Type">
            <select value={form.type} onChange={(e) => set("type", e.target.value as "album" | "EP")} className={inputCls} data-testid="select-album-type">
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

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-sm font-semibold uppercase tracking-wider">Tracklist</h3>
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
          <div className="rounded-lg border border-white/10 overflow-hidden">
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
              <div className="px-4 py-6 text-center text-white/40 text-sm">No songs yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SongRow({ song, onSave, onDelete }: { song: AdminSong; onSave: (p: Partial<AdminSong>) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(song);
  useEffect(() => setDraft(song), [song.id, song.title, song.lyrics, song.trackNumber, song.duration, song.audioUrl]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(song);

  return (
    <div className="border-b border-white/10 last:border-b-0">
      <div className="flex items-center gap-3 px-3 py-2 hover:bg-white/[0.03]">
        <span className="text-white/40 text-xs w-6 text-right">{song.trackNumber}</span>
        <span className="flex-1 text-white text-sm truncate" data-testid={`text-song-${song.id}`}>{song.title}</span>
        <span className="text-white/40 text-xs tabular-nums">{fmtDuration(song.duration)}</span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-[12px] text-[#319ED8] hover:underline" data-testid={`button-edit-song-${song.id}`}>
          {open ? "Close" : "Edit"}
        </button>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 bg-white/[0.02]">
          <div className="grid grid-cols-[1fr_80px_80px] gap-2">
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title" className={inputCls} />
            <input
              type="number"
              value={draft.trackNumber}
              onChange={(e) => setDraft({ ...draft, trackNumber: Number(e.target.value) })}
              className={inputCls}
              title="Track #"
            />
            <input
              type="number"
              value={draft.duration}
              onChange={(e) => setDraft({ ...draft, duration: Number(e.target.value) })}
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
            <button type="button" onClick={onDelete} className="px-3 py-1 text-[12px] text-red-300 hover:bg-red-500/10 rounded" data-testid={`button-delete-song-${song.id}`}>Delete</button>
            <button
              type="button"
              disabled={!dirty}
              onClick={() => onSave({ title: draft.title, trackNumber: draft.trackNumber, duration: draft.duration, lyrics: draft.lyrics, audioUrl: draft.audioUrl })}
              className="px-3 py-1 text-[12px] rounded bg-[#319ED8] text-white disabled:opacity-40"
              data-testid={`button-save-song-${song.id}`}
            >
              Save song
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-[#319ED8]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-white/40 text-[11px] uppercase tracking-wider mb-1">{label}</span>
      {children}
    </label>
  );
}

// ---------- Admin shell ----------

export function Admin() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const { data: albums = [] } = useQuery<AdminAlbum[]>({
    queryKey: ["/api/albums"],
    enabled: !!user?.isAdmin,
  });

  useEffect(() => {
    if (!selectedId && albums.length > 0) setSelectedId(albums[0].id);
  }, [albums, selectedId]);

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
      setSelectedId(a.id);
    },
  });

  // Iframe lifecycle: change `src` when the selected album changes; remount
  // (via `key`) whenever any CMS-mutable field on that album changes, so the
  // preview re-fetches and re-renders without us reaching into iframe.contentWindow.
  const iframeSrc = useMemo(() => (selectedId ? `/album/${selectedId}` : "/collection"), [selectedId]);
  // Subscribe to the album-detail cache so React re-renders (and the key
  // recomputes) when the underlying data changes. `getQueryData` alone in a
  // useMemo body wouldn't trigger a re-render.
  const { data: previewDetail } = useQuery<AlbumWithSongs>({
    queryKey: ["/api/albums", selectedId ?? ""],
    enabled: !!selectedId,
  });
  const iframeKey = useMemo(() => {
    if (!selectedId) return "none";
    if (!previewDetail) return `${selectedId}:loading`;
    const a = previewDetail;
    const songSig = a.songs
      ?.map((s) => `${s.id}|${s.trackNumber}|${s.title}|${s.duration}|${s.lyrics ?? ""}|${s.audioUrl ?? ""}`)
      .join("~");
    return `${a.id}|${a.title}|${a.artist}|${a.artwork}|${a.year}|${a.type}|${a.description ?? ""}|${songSig}`;
  }, [selectedId, previewDetail]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#00062B] flex items-center justify-center text-white/50">Loading…</main>
    );
  }
  if (!user) {
    navigate("/login");
    return null;
  }

  if (!user.isAdmin) {
    return (
      <main className="min-h-screen bg-[#00062B] flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-white text-2xl font-semibold mb-2">Admin only</h1>
          <p className="text-white/60 text-sm mb-6">
            You're signed in as <span className="text-white">@{user.username}</span> but this account isn't an admin yet.
            {" "}If no admin exists, you can claim the first slot now.
          </p>
          <button
            type="button"
            onClick={() => bootstrap.mutate()}
            disabled={bootstrap.isPending}
            className="px-4 py-2 rounded-md bg-[#319ED8] text-white font-medium hover:bg-[#319ED8]/90 disabled:opacity-50"
            data-testid="button-bootstrap-admin"
          >
            {bootstrap.isPending ? "Claiming…" : "Claim admin (if no admin yet)"}
          </button>
          {bootstrapError && <p className="mt-3 text-red-300 text-sm" data-testid="text-bootstrap-error">{bootstrapError}</p>}
          <button type="button" onClick={() => navigate("/collection")} className="mt-6 block mx-auto text-white/40 text-sm hover:text-white">
            Back to the player
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#00062B] text-white flex">
      {/* Left rail: entity nav */}
      <aside className="w-56 shrink-0 border-r border-white/10 flex flex-col">
        <div className="px-5 py-5 border-b border-white/10">
          <p className="text-[11px] uppercase tracking-widest text-white/40">GoodTunes</p>
          <h1 className="text-white text-lg font-semibold">Admin</h1>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-1 text-sm">
          <button type="button" className="w-full text-left px-3 py-2 rounded-md bg-white/10 text-white" data-testid="nav-albums">
            Albums
          </button>
          {["People", "Instruments", "Vendors", "Credits"].map((label) => (
            <button
              key={label}
              type="button"
              disabled
              className="w-full text-left px-3 py-2 rounded-md text-white/30 cursor-not-allowed"
              title="Coming in the next pass"
            >
              {label} <span className="text-[10px] uppercase tracking-wider opacity-60 ml-1">soon</span>
            </button>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-white/10">
          <button type="button" onClick={() => navigate("/collection")} className="w-full text-left px-3 py-2 text-white/60 hover:text-white text-sm" data-testid="link-back-to-player">
            ← Back to player
          </button>
        </div>
      </aside>

      {/* Middle: list of albums */}
      <section className="w-72 shrink-0 border-r border-white/10 flex flex-col">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-white text-sm font-semibold">Albums</h2>
          <button
            type="button"
            onClick={() => createAlbum.mutate()}
            disabled={createAlbum.isPending}
            className="text-[12px] text-[#319ED8] hover:underline"
            data-testid="button-new-album"
          >
            + New
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto py-2">
          {albums.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setSelectedId(a.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.05] text-left ${selectedId === a.id ? "bg-white/[0.08]" : ""}`}
                data-testid={`row-album-${a.id}`}
              >
                <img src={a.artwork} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                <div className="min-w-0">
                  <div className="text-white text-sm truncate">{a.title}</div>
                  <div className="text-white/40 text-xs truncate">{a.artist}</div>
                </div>
              </button>
            </li>
          ))}
          {albums.length === 0 && (
            <li className="px-4 py-6 text-white/40 text-sm">No albums yet. Click + New.</li>
          )}
        </ul>
      </section>

      {/* Editor pane */}
      <section className="flex-1 min-w-0 border-r border-white/10">
        {selectedId ? (
          <AlbumEditor key={selectedId} albumId={selectedId} onDeleted={() => setSelectedId(null)} />
        ) : (
          <div className="h-full flex items-center justify-center text-white/40">Select an album to edit.</div>
        )}
      </section>

      {/* Phone-frame preview */}
      <aside className="w-[420px] shrink-0 hidden xl:flex flex-col items-center justify-center bg-black/40 py-6 px-4">
        <p className="text-white/40 text-[11px] uppercase tracking-widest mb-3">Live preview</p>
        <div
          className="relative rounded-[42px] overflow-hidden shadow-2xl"
          style={{
            width: 360,
            height: 760,
            background: "#000",
            padding: 10,
            boxShadow: "0 0 0 2px rgba(255,255,255,0.08), 0 30px 70px rgba(0,0,0,0.6)",
          }}
        >
          <iframe
            key={iframeKey}
            src={iframeSrc}
            title="Live preview"
            className="w-full h-full rounded-[32px] bg-[#00062B]"
            data-testid="iframe-preview"
          />
        </div>
        <p className="text-white/30 text-xs mt-3">
          {selectedId ? `Previewing /album/${selectedId.slice(0, 8)}…` : "Open the player at /collection"}
        </p>
      </aside>
    </main>
  );
}
