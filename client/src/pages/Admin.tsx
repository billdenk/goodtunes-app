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

interface AdminPerson {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  accent: string | null;
}

interface AdminVendor {
  id: string;
  instrumentId: string;
  name: string;
  affiliateUrl: string;
  aboutUrl: string | null;
  logoUrl: string | null;
  tagline: string | null;
  bio: string | null;
  location: string | null;
  coverUrl: string | null;
  position: number;
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

type EntityKey = "albums" | "people" | "instruments";

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

// ---------- PersonEditor ----------

function PersonEditor({ personId, onDeleted }: { personId: string; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<AdminPerson>({ queryKey: ["/api/people", personId] });
  const [form, setForm] = useState<AdminPerson | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (data) { setForm(data); setDirty(false); }
  }, [data?.id]);

  const update = (patch: Partial<AdminPerson>) => { setForm((f) => (f ? { ...f, ...patch } : f)); setDirty(true); };

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const res = await apiRequest("PUT", `/api/admin/people/${personId}`, form);
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

  if (isLoading || !form) return <div className="p-6 text-white/40">Loading…</div>;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4 max-w-2xl">
      <div className="flex items-center gap-4">
        {form.photoUrl ? (
          <img src={form.photoUrl} alt="" className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold text-white"
            style={{ background: form.accent || "#319ED8" }}
          >
            {form.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-white text-xl font-semibold truncate" data-testid="text-person-heading">{form.name || "Untitled person"}</h2>
          <p className="text-white/40 text-xs font-mono">{form.id}</p>
        </div>
      </div>

      <Field label="Name">
        <input value={form.name} onChange={(e) => update({ name: e.target.value })} className={inputCls} data-testid="input-person-name" />
      </Field>
      <Field label="Photo URL">
        <input value={form.photoUrl ?? ""} onChange={(e) => update({ photoUrl: e.target.value || null })} className={inputCls} data-testid="input-person-photo" />
      </Field>
      <Field label="Bio">
        <textarea value={form.bio ?? ""} onChange={(e) => update({ bio: e.target.value || null })} rows={4} className={inputCls + " resize-none"} data-testid="input-person-bio" />
      </Field>
      <Field label="Accent colour (hex, falls back to brand blue)">
        <div className="flex items-center gap-2">
          <input value={form.accent ?? ""} onChange={(e) => update({ accent: e.target.value || null })} placeholder="#319ED8" className={inputCls} data-testid="input-person-accent" />
          {["#319ED8", "#7F10A7", "#4AFFCA", "#FF5470"].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => update({ accent: c })}
              className="w-7 h-7 rounded-full shrink-0 border border-white/20"
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>
      </Field>

      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <button
          type="button"
          onClick={() => { if (confirm(`Delete ${form.name}? This cannot be undone.`)) del.mutate(); }}
          className="text-red-300 hover:bg-red-500/10 px-3 py-2 text-sm rounded"
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
    </div>
  );
}

// ---------- InstrumentEditor ----------

function InstrumentEditor({ instrumentId, onDeleted }: { instrumentId: string; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<AdminInstrument>({ queryKey: ["/api/instruments", instrumentId] });
  const [form, setForm] = useState<AdminInstrument | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (data) { setForm(data); setDirty(false); }
  }, [data?.id]);

  const update = (patch: Partial<AdminInstrument>) => { setForm((f) => (f ? { ...f, ...patch } : f)); setDirty(true); };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/instruments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/instruments", instrumentId] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const { vendors, ...rest } = form;
      const res = await apiRequest("PUT", `/api/admin/instruments/${instrumentId}`, rest);
      return res.json();
    },
    onSuccess: () => { invalidate(); setDirty(false); },
  });

  const del = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/instruments/${instrumentId}`);
    },
    onSuccess: async () => {
      // See PersonEditor.del — refetch before clearing selection.
      await queryClient.refetchQueries({ queryKey: ["/api/instruments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/instruments", instrumentId] });
      onDeleted();
    },
  });

  const addVendor = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/instruments/${instrumentId}/vendors`, {
        name: "New vendor",
        affiliateUrl: "https://",
      });
      return res.json();
    },
    onSuccess: () => invalidate(),
  });

  if (isLoading || !form) return <div className="p-6 text-white/40">Loading…</div>;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4 max-w-2xl">
      <div className="flex items-center gap-4">
        {form.photoUrl ? (
          <img src={form.photoUrl} alt="" className="w-20 h-20 rounded-lg object-cover" />
        ) : (
          <div className="w-20 h-20 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/30 text-xs">No photo</div>
        )}
        <div className="min-w-0">
          <h2 className="text-white text-xl font-semibold truncate" data-testid="text-instrument-heading">{form.name || "Untitled instrument"}</h2>
          <p className="text-white/40 text-xs">{form.category || "Uncategorised"}</p>
          <p className="text-white/30 text-xs font-mono">{form.id}</p>
        </div>
      </div>

      <Field label="Name (year + maker + model)">
        <input value={form.name} onChange={(e) => update({ name: e.target.value })} className={inputCls} data-testid="input-instrument-name" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <input value={form.category} onChange={(e) => update({ category: e.target.value })} placeholder="Acoustic Guitar" className={inputCls} data-testid="input-instrument-category" />
        </Field>
        <Field label="Short category (shown inline)">
          <input value={form.shortCategory ?? ""} onChange={(e) => update({ shortCategory: e.target.value || null })} placeholder="Guitar" className={inputCls} data-testid="input-instrument-short-category" />
        </Field>
      </div>
      <Field label="Photo URL">
        <input value={form.photoUrl ?? ""} onChange={(e) => update({ photoUrl: e.target.value || null })} className={inputCls} data-testid="input-instrument-photo" />
      </Field>
      <Field label="About (neutral: history, model facts)">
        <textarea value={form.about ?? ""} onChange={(e) => update({ about: e.target.value || null })} rows={3} className={inputCls + " resize-none"} data-testid="input-instrument-about" />
      </Field>
      <Field label="Artist note (why this artist chose THIS instrument)">
        <textarea value={form.artistNote ?? ""} onChange={(e) => update({ artistNote: e.target.value || null })} rows={3} className={inputCls + " resize-none"} data-testid="input-instrument-artist-note" />
      </Field>

      <div className="flex items-center justify-between pt-2 border-t border-white/10">
        <button
          type="button"
          onClick={() => { if (confirm(`Delete ${form.name}? Vendors will be removed too.`)) del.mutate(); }}
          className="text-red-300 hover:bg-red-500/10 px-3 py-2 text-sm rounded"
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
          <h3 className="text-white text-sm font-semibold">Vendors <span className="text-white/40 font-normal">({form.vendors.length})</span></h3>
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
            <p className="text-white/40 text-sm py-3">No vendors yet. Affiliate links surface here in the in-app instrument sheet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function VendorRow({ vendor, onChanged }: { vendor: AdminVendor; onChanged: () => void }) {
  const [draft, setDraft] = useState(vendor);
  const [open, setOpen] = useState(false);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(vendor), [draft, vendor]);
  useEffect(() => { setDraft(vendor); }, [vendor.id]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/admin/vendors/${vendor.id}`, draft);
      return res.json();
    },
    onSuccess: onChanged,
  });
  const del = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/admin/vendors/${vendor.id}`); },
    onSuccess: onChanged,
  });

  // Auto-derive default logo from affiliate hostname when none is set.
  const logoFallback = useMemo(() => {
    if (draft.logoUrl) return draft.logoUrl;
    try {
      const u = new URL(draft.affiliateUrl);
      return `https://www.google.com/s2/favicons?sz=128&domain=${u.hostname}`;
    } catch { return ""; }
  }, [draft.logoUrl, draft.affiliateUrl]);

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full px-3 py-2 flex items-center gap-3 text-left hover:bg-white/[0.04]" data-testid={`row-vendor-${vendor.id}`}>
        {logoFallback ? <img src={logoFallback} alt="" className="w-8 h-8 rounded bg-white/5 object-contain" /> : <div className="w-8 h-8 rounded bg-white/10" />}
        <div className="min-w-0 flex-1">
          <div className="text-white text-sm truncate">{draft.name || "Untitled vendor"}</div>
          <div className="text-white/40 text-xs truncate">{draft.affiliateUrl}</div>
        </div>
        <span className="text-white/40 text-xs">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-white/10">
          <Field label="Vendor name">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} data-testid={`input-vendor-name-${vendor.id}`} />
          </Field>
          <Field label="Affiliate / product URL (where the buy button goes)">
            <input value={draft.affiliateUrl} onChange={(e) => setDraft({ ...draft, affiliateUrl: e.target.value })} className={inputCls} data-testid={`input-vendor-affiliate-${vendor.id}`} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="About URL (homepage)">
              <input value={draft.aboutUrl ?? ""} onChange={(e) => setDraft({ ...draft, aboutUrl: e.target.value || null })} className={inputCls} data-testid={`input-vendor-about-${vendor.id}`} />
            </Field>
            <Field label="Logo URL (else favicon)">
              <input value={draft.logoUrl ?? ""} onChange={(e) => setDraft({ ...draft, logoUrl: e.target.value || null })} className={inputCls} data-testid={`input-vendor-logo-${vendor.id}`} />
            </Field>
          </div>
          <Field label="Tagline (one-liner)">
            <input value={draft.tagline ?? ""} onChange={(e) => setDraft({ ...draft, tagline: e.target.value || null })} className={inputCls} data-testid={`input-vendor-tagline-${vendor.id}`} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Location">
              <input value={draft.location ?? ""} onChange={(e) => setDraft({ ...draft, location: e.target.value || null })} placeholder="Nashville, TN" className={inputCls} data-testid={`input-vendor-location-${vendor.id}`} />
            </Field>
            <Field label="Cover URL (hero photo)">
              <input value={draft.coverUrl ?? ""} onChange={(e) => setDraft({ ...draft, coverUrl: e.target.value || null })} className={inputCls} data-testid={`input-vendor-cover-${vendor.id}`} />
            </Field>
          </div>
          <Field label="Bio (longer About copy)">
            <textarea value={draft.bio ?? ""} onChange={(e) => setDraft({ ...draft, bio: e.target.value || null })} rows={3} className={inputCls + " resize-none"} data-testid={`input-vendor-bio-${vendor.id}`} />
          </Field>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => { if (confirm("Delete this vendor?")) del.mutate(); }} className="px-3 py-1 text-[12px] text-red-300 hover:bg-red-500/10 rounded" data-testid={`button-delete-vendor-${vendor.id}`}>Delete</button>
            <button type="button" disabled={!dirty || save.isPending} onClick={() => save.mutate()} className="px-3 py-1 text-[12px] rounded bg-[#319ED8] text-white disabled:opacity-40" data-testid={`button-save-vendor-${vendor.id}`}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Admin shell ----------

export function Admin() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [entity, setEntity] = useState<EntityKey>("albums");
  // Per-entity selection so switching tabs preserves which row was open.
  const [selectedByEntity, setSelectedByEntity] = useState<Record<EntityKey, string | null>>({
    albums: null,
    people: null,
    instruments: null,
  });
  const selectedId = selectedByEntity[entity];
  const setSelectedId = (id: string | null) =>
    setSelectedByEntity((prev) => ({ ...prev, [entity]: id }));
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

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

  // Iframe lifecycle: change `src` when the selected album changes; remount
  // (via `key`) whenever any CMS-mutable field on that album changes, so the
  // preview re-fetches and re-renders without us reaching into iframe.contentWindow.
  // Only meaningful while the Albums tab is active — gating the query keeps
  // us from firing `/api/albums/<personId>` 404s when other tabs are open.
  const albumPreviewId = entity === "albums" ? selectedId : null;
  const iframeSrc = useMemo(() => (albumPreviewId ? `/album/${albumPreviewId}` : "/collection"), [albumPreviewId]);
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
      ?.map((s) => `${s.id}|${s.trackNumber}|${s.title}|${s.duration}|${s.lyrics ?? ""}|${s.audioUrl ?? ""}`)
      .join("~");
    return `${a.id}|${a.title}|${a.artist}|${a.artwork}|${a.year}|${a.type}|${a.description ?? ""}|${songSig}`;
  }, [albumPreviewId, previewDetail]);

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
          {([
            { key: "albums", label: "Albums", count: albums.length },
            { key: "people", label: "People", count: people.length },
            { key: "instruments", label: "Instruments", count: instruments.length },
          ] as { key: EntityKey; label: string; count: number }[]).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setEntity(t.key)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-left ${entity === t.key ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
              data-testid={`nav-${t.key}`}
            >
              <span>{t.label}</span>
              <span className="text-[11px] text-white/40">{t.count}</span>
            </button>
          ))}
          {["Vendors", "Credits"].map((label) => (
            <button
              key={label}
              type="button"
              disabled
              className="w-full text-left px-3 py-2 rounded-md text-white/30 cursor-not-allowed"
              title="Vendors live under each instrument · Credits panel coming next"
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

      {/* Middle: entity list */}
      <section className="w-72 shrink-0 border-r border-white/10 flex flex-col">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-white text-sm font-semibold capitalize">{entity}</h2>
          <button
            type="button"
            onClick={() => {
              if (entity === "albums") createAlbum.mutate();
              else if (entity === "people") createPerson.mutate();
              else createInstrument.mutate();
            }}
            disabled={createAlbum.isPending || createPerson.isPending || createInstrument.isPending}
            className="text-[12px] text-[#319ED8] hover:underline"
            data-testid={`button-new-${entity.slice(0, -1)}`}
          >
            + New
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto py-2">
          {entity === "albums" && albums.map((a) => (
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
          {entity === "people" && people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.05] text-left ${selectedId === p.id ? "bg-white/[0.08]" : ""}`}
                data-testid={`row-person-${p.id}`}
              >
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0" style={{ background: p.accent || "#319ED8" }}>
                    {p.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-white text-sm truncate">{p.name}</div>
                  <div className="text-white/40 text-xs truncate">{p.bio ?? "—"}</div>
                </div>
              </button>
            </li>
          ))}
          {entity === "instruments" && instruments.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => setSelectedId(i.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.05] text-left ${selectedId === i.id ? "bg-white/[0.08]" : ""}`}
                data-testid={`row-instrument-${i.id}`}
              >
                {i.photoUrl ? (
                  <img src={i.photoUrl} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded bg-white/10 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-white text-sm truncate">{i.name}</div>
                  <div className="text-white/40 text-xs truncate">{i.category}{i.vendors.length > 0 && ` · ${i.vendors.length} vendor${i.vendors.length === 1 ? "" : "s"}`}</div>
                </div>
              </button>
            </li>
          ))}
          {entity === "albums" && albums.length === 0 && (
            <li className="px-4 py-6 text-white/40 text-sm">No albums yet. Click + New.</li>
          )}
          {entity === "people" && people.length === 0 && (
            <li className="px-4 py-6 text-white/40 text-sm">No people yet. Click + New.</li>
          )}
          {entity === "instruments" && instruments.length === 0 && (
            <li className="px-4 py-6 text-white/40 text-sm">No instruments yet. Click + New.</li>
          )}
        </ul>
      </section>

      {/* Editor pane */}
      <section className="flex-1 min-w-0 border-r border-white/10">
        {!selectedId ? (
          <div className="h-full flex items-center justify-center text-white/40">Select an item to edit.</div>
        ) : entity === "albums" ? (
          <AlbumEditor key={selectedId} albumId={selectedId} onDeleted={() => setSelectedId(null)} />
        ) : entity === "people" ? (
          <PersonEditor key={selectedId} personId={selectedId} onDeleted={() => setSelectedId(null)} />
        ) : (
          <InstrumentEditor key={selectedId} instrumentId={selectedId} onDeleted={() => setSelectedId(null)} />
        )}
      </section>

      {/* Phone-frame preview — only meaningful for Albums today.
         People + Instruments don't have public detail pages yet; they
         surface inside album credits, which lights up in the next pass. */}
      <aside className="w-[420px] shrink-0 hidden xl:flex flex-col items-center justify-center bg-black/40 py-6 px-4">
        <p className="text-white/40 text-[11px] uppercase tracking-widest mb-3">Live preview</p>
        {entity === "albums" ? (
          <>
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
          </>
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
            <p className="text-white/40 text-sm leading-relaxed">
              Live preview lights up once {entity === "people" ? "people" : "instruments"} are wired
              into a song's credits. Edit on the left — fields save independently.
            </p>
          </div>
        )}
      </aside>
    </main>
  );
}
