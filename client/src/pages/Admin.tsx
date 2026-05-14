import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

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
  // Demo show/hide — hides this vendor's button from the fan-side
  // InstrumentSheet. Admins still see it in the CMS so they can flip it back.
  isHidden: boolean;
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
}: {
  value: string;
  onChange: (next: string) => void;
  shape?: "square" | "circle";
  testId: string;
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
          {err && <p className="text-red-600 text-xs" data-testid={`${testId}-error`}>{err}</p>}
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
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const promote = useMutation({
    mutationFn: async (u: string) => {
      const res = await apiRequest("POST", "/api/admin/promote", { username: u });
      return res.json() as Promise<{ username: string; alreadyAdmin?: boolean }>;
    },
    onSuccess: (r) => {
      setMsg({
        kind: "ok",
        text: r.alreadyAdmin ? `@${r.username} is already an admin.` : `@${r.username} is now an admin.`,
      });
      setUsername("");
    },
    onError: (e: Error) => setMsg({ kind: "err", text: e.message }),
  });
  return (
    <div className="px-3 py-3 border-t border-slate-200">
      <p className="px-1 text-[10px] uppercase tracking-widest text-slate-400 mb-2">Add admin</p>
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
        isHidden: data.isHidden,
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
          <h2 className="text-slate-900 text-lg font-semibold" data-testid="text-editor-title">Edit album</h2>
          <p className="text-slate-400 text-xs">{albumId}</p>
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
            title={form.isHidden ? "Hidden from fans. Click to show." : "Visible to fans. Click to hide."}
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
          <input value={form.title} onChange={(e) => set("title", e.target.value)} className={inputCls} data-testid="input-album-title" />
        </Field>
        <Field label="Artist">
          <input value={form.artist} onChange={(e) => set("artist", e.target.value)} className={inputCls} data-testid="input-album-artist" />
        </Field>
        <Field label="Artwork">
          <ArtworkPicker
            value={form.artwork}
            onChange={(next) => set("artwork", next)}
            shape="square"
            testId="input-album-artwork"
          />
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
            <h3 className="text-slate-900 text-sm font-semibold uppercase tracking-wider">Tracklist</h3>
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
              <div className="px-4 py-6 text-center text-slate-400 text-sm">No songs yet.</div>
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
  const { data: credits } = useQuery<SongCredits>({ queryKey: ["/api/songs", songId, "credits"] });
  const { data: people = [] } = useQuery<AdminPerson[]>({ queryKey: ["/api/people"] });
  const { data: instruments = [] } = useQuery<AdminInstrument[]>({ queryKey: ["/api/instruments"] });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/songs", songId, "credits"] });

  const addWriter = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/songs/${songId}/writers`, {
        name: "New writer",
        role: "Composer",
      });
      return res.json();
    },
    onSuccess: invalidate,
  });
  const addPerformer = useMutation({
    mutationFn: async () => {
      const firstPerson = people[0];
      if (!firstPerson) throw new Error("Add at least one Person in the People tab first.");
      const res = await apiRequest("POST", `/api/admin/songs/${songId}/performers`, {
        personId: firstPerson.id,
        name: firstPerson.name,
        role: "Guitar",
      });
      return res.json();
    },
    onSuccess: invalidate,
    onError: (e: Error) => alert(e.message),
  });

  if (!credits) return <div className="text-slate-400 text-xs py-2">Loading credits…</div>;

  return (
    <div className="space-y-4 pt-2">
      {/* Writers */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-slate-500 text-[11px] uppercase tracking-wider">Writers <span className="text-slate-300 ml-1">({credits.writers.length})</span></h4>
          <button type="button" onClick={() => addWriter.mutate()} className="text-[11px] text-[#319ED8] hover:underline" data-testid={`button-add-writer-${songId}`}>+ Writer</button>
        </div>
        <div className="space-y-1">
          {credits.writers.map((w) => (
            <WriterRow key={w.id} writer={w} people={people} onChanged={invalidate} />
          ))}
          {credits.writers.length === 0 && <p className="text-slate-300 text-xs">No writers yet.</p>}
        </div>
      </div>

      {/* Performers */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-slate-500 text-[11px] uppercase tracking-wider">Performers <span className="text-slate-300 ml-1">({credits.performers.length})</span></h4>
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
            <PerformerRow key={p.id} performer={p} people={people} instruments={instruments} onChanged={invalidate} />
          ))}
          {credits.performers.length === 0 && <p className="text-slate-300 text-xs">No performers yet.</p>}
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

function WriterRow({ writer, people, onChanged }: { writer: AdminTrackWriter & { person: AdminPerson | null }; people: AdminPerson[]; onChanged: () => void }) {
  const { draft, setDraft, dirty, snapshot } = useRowDraft(writer);
  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/admin/writers/${writer.id}`, snapshot());
      return res.json();
    },
    onSuccess: onChanged,
  });
  const del = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/admin/writers/${writer.id}`); },
    onSuccess: onChanged,
  });
  return (
    <div className="grid grid-cols-[2fr_1fr_1.5fr_auto_auto] gap-2 items-center" data-testid={`row-writer-${writer.id}`}>
      <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" className={inputCls + " py-1 text-xs"} />
      <input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} placeholder="Composer / Lyricist / Producer" className={inputCls + " py-1 text-xs"} />
      <select
        value={draft.personId ?? ""}
        onChange={(e) => {
          const id = e.target.value || null;
          const matched = people.find((p) => p.id === id);
          setDraft({ ...draft, personId: id, name: matched ? matched.name : draft.name });
        }}
        className={inputCls + " py-1 text-xs"}
      >
        <option value="">— link to person (optional) —</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button type="button" disabled={!dirty || save.isPending} onClick={() => save.mutate()} className="px-2 py-1 rounded bg-[#319ED8] text-slate-900 text-[11px] disabled:opacity-40" data-testid={`button-save-writer-${writer.id}`}>{save.isPending ? "…" : "Save"}</button>
      <button type="button" disabled={del.isPending} onClick={() => { if (confirm("Delete this writer credit?")) del.mutate(); }} className="px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 rounded disabled:opacity-40" data-testid={`button-delete-writer-${writer.id}`}>×</button>
    </div>
  );
}

function PerformerRow({ performer, people, instruments, onChanged }: { performer: AdminTrackPerformer & { person: AdminPerson | null }; people: AdminPerson[]; instruments: AdminInstrument[]; onChanged: () => void }) {
  const { draft, setDraft, dirty, snapshot } = useRowDraft(performer);
  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/admin/performers/${performer.id}`, snapshot());
      return res.json();
    },
    onSuccess: onChanged,
  });
  const del = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/admin/performers/${performer.id}`); },
    onSuccess: onChanged,
  });
  return (
    <div className="grid grid-cols-[1.5fr_1fr_1.5fr_1fr_auto_auto] gap-2 items-center" data-testid={`row-performer-${performer.id}`}>
      <select
        value={draft.personId ?? ""}
        onChange={(e) => {
          const id = e.target.value || null;
          const matched = people.find((p) => p.id === id);
          // Snapshot the display name whenever the link changes so credits
          // keep rendering even if the Person is later removed.
          setDraft({ ...draft, personId: id, name: matched ? matched.name : draft.name });
        }}
        className={inputCls + " py-1 text-xs"}
      >
        <option value="">— unlinked ({draft.name}) —</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} placeholder="Guitar / Bass / Vocals" className={inputCls + " py-1 text-xs"} />
      <select value={draft.instrumentId ?? ""} onChange={(e) => setDraft({ ...draft, instrumentId: e.target.value || null })} className={inputCls + " py-1 text-xs"}>
        <option value="">— instrument (optional) —</option>
        {instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
      <input value={draft.tuningNotes ?? ""} onChange={(e) => setDraft({ ...draft, tuningNotes: e.target.value || null })} placeholder="DADGAD, capo 3…" className={inputCls + " py-1 text-xs"} />
      <button type="button" disabled={!dirty || save.isPending} onClick={() => save.mutate()} className="px-2 py-1 rounded bg-[#319ED8] text-slate-900 text-[11px] disabled:opacity-40" data-testid={`button-save-performer-${performer.id}`}>{save.isPending ? "…" : "Save"}</button>
      <button type="button" disabled={del.isPending} onClick={() => { if (confirm("Delete this performer credit?")) del.mutate(); }} className="px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 rounded disabled:opacity-40" data-testid={`button-delete-performer-${performer.id}`}>×</button>
    </div>
  );
}

function SongRow({ song, onSave, onDelete }: { song: AdminSong; onSave: (p: Partial<AdminSong>) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(song);
  useEffect(() => setDraft(song), [song.id, song.title, song.lyrics, song.trackNumber, song.duration, song.audioUrl]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(song);

  return (
    <div className="border-b border-slate-200 last:border-b-0">
      <div className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50">
        <span className="text-slate-400 text-xs w-6 text-right">{song.trackNumber}</span>
        <span className="flex-1 text-slate-900 text-sm truncate" data-testid={`text-song-${song.id}`}>{song.title}</span>
        <span className="text-slate-400 text-xs tabular-nums">{fmtDuration(song.duration)}</span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-[12px] text-[#319ED8] hover:underline" data-testid={`button-edit-song-${song.id}`}>
          {open ? "Close" : "Edit"}
        </button>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 bg-white">
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
            <button type="button" onClick={onDelete} className="px-3 py-1 text-[12px] text-red-600 hover:bg-red-50 rounded" data-testid={`button-delete-song-${song.id}`}>Delete</button>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-slate-400 text-[11px] uppercase tracking-wider mb-1">{label}</span>
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

  if (isLoading || !form) return <div className="p-6 text-slate-400">Loading…</div>;

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
          <h2 className="text-slate-900 text-xl font-semibold truncate" data-testid="text-person-heading">{form.name || "Untitled person"}</h2>
          <p className="text-slate-400 text-xs font-mono">{form.id}</p>
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
          onClick={() => { if (confirm(`Delete ${form.name}? This cannot be undone.`)) del.mutate(); }}
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

  if (isLoading || !form) return <div className="p-6 text-slate-400">Loading…</div>;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4 max-w-2xl">
      <div className="flex items-center gap-4">
        {form.photoUrl ? (
          <img src={form.photoUrl} alt="" className="w-20 h-20 rounded-lg object-cover" />
        ) : (
          <div className="w-20 h-20 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300 text-xs">No photo</div>
        )}
        <div className="min-w-0">
          <h2 className="text-slate-900 text-xl font-semibold truncate" data-testid="text-instrument-heading">{form.name || "Untitled instrument"}</h2>
          <p className="text-slate-400 text-xs">{form.category || "Uncategorised"}</p>
          <p className="text-slate-300 text-xs font-mono">{form.id}</p>
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

      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
        <button
          type="button"
          onClick={() => { if (confirm(`Delete ${form.name}? Vendors will be removed too.`)) del.mutate(); }}
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
          <h3 className="text-slate-900 text-sm font-semibold">Vendors <span className="text-slate-400 font-normal">({form.vendors.length})</span></h3>
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
            <p className="text-slate-400 text-sm py-3">No vendors yet. Affiliate links surface here in the in-app instrument sheet.</p>
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
    <div className="rounded-md border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} className={`w-full px-3 py-2 flex items-center gap-3 text-left hover:bg-slate-50 ${draft.isHidden ? "opacity-50" : ""}`} data-testid={`row-vendor-${vendor.id}`}>
        {logoFallback ? <img src={logoFallback} alt="" className="w-8 h-8 rounded bg-slate-50 object-contain" /> : <div className="w-8 h-8 rounded bg-slate-100" />}
        <div className="min-w-0 flex-1">
          <div className="text-slate-900 text-sm truncate">{draft.name || "Untitled vendor"}</div>
          <div className="text-slate-400 text-xs truncate">{draft.affiliateUrl}</div>
        </div>
        {draft.isHidden && <span className="text-[10px] uppercase tracking-wider text-[#FF5470] bg-[#FF5470]/10 border border-[#FF5470]/30 rounded px-1.5 py-0.5">Hidden</span>}
        <span className="text-slate-400 text-xs">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-slate-200">
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
            {/* Demo hide toggle — rides the same Save button via the dirty flag. */}
            <button
              type="button"
              onClick={() => setDraft({ ...draft, isHidden: !draft.isHidden })}
              className={`px-3 py-1 text-[12px] rounded border ${
                draft.isHidden
                  ? "border-[#FF5470]/40 bg-[#FF5470]/10 text-[#FF5470]"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              } mr-auto`}
              title={draft.isHidden ? "Hidden from fans. Click to show." : "Visible to fans. Click to hide."}
              data-testid={`button-toggle-vendor-hidden-${vendor.id}`}
            >
              {draft.isHidden ? "Hidden" : "Visible"}
            </button>
            <button type="button" onClick={() => { if (confirm("Delete this vendor?")) del.mutate(); }} className="px-3 py-1 text-[12px] text-red-600 hover:bg-red-50 rounded" data-testid={`button-delete-vendor-${vendor.id}`}>Delete</button>
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
      <main className="min-h-screen bg-[#f7f8fa] flex items-center justify-center text-slate-500">Loading…</main>
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
          <h1 className="text-slate-900 text-2xl font-semibold mb-2">Admin only</h1>
          <p className="text-slate-500 text-sm mb-6">
            You're signed in as <span className="text-slate-900 font-medium">@{user.username}</span> but this account isn't an admin yet.
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
          {bootstrapError && <p className="mt-3 text-red-600 text-sm" data-testid="text-bootstrap-error">{bootstrapError}</p>}
          <button type="button" onClick={() => navigate("/collection")} className="mt-6 block mx-auto text-slate-400 text-sm hover:text-slate-900">
            Back to the player
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-900 flex">
      {/* Left rail: entity nav */}
      <aside className="w-56 shrink-0 border-r border-slate-200 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-200">
          <p className="text-[11px] uppercase tracking-widest text-slate-400">GoodTunes</p>
          <h1 className="text-slate-900 text-lg font-semibold">Admin</h1>
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
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-left ${entity === t.key ? "bg-[#eff4ff] text-[#319ED8] font-medium" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
              data-testid={`nav-${t.key}`}
            >
              <span>{t.label}</span>
              <span className="text-[11px] text-slate-400">{t.count}</span>
            </button>
          ))}
          {["Vendors", "Credits"].map((label) => (
            <button
              key={label}
              type="button"
              disabled
              className="w-full text-left px-3 py-2 rounded-md text-slate-300 cursor-not-allowed"
              title="Vendors live under each instrument · Credits panel coming next"
            >
              {label} <span className="text-[10px] uppercase tracking-wider opacity-60 ml-1">soon</span>
            </button>
          ))}
        </nav>
        <PromotePanel />
        <div className="px-3 py-3 border-t border-slate-200">
          <button type="button" onClick={() => navigate("/collection")} className="w-full text-left px-3 py-2 text-slate-500 hover:text-slate-900 text-sm" data-testid="link-back-to-player">
            ← Back to player
          </button>
        </div>
      </aside>

      {/* Middle: entity list */}
      <section className="w-72 shrink-0 border-r border-slate-200 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-slate-900 text-sm font-semibold capitalize">{entity}</h2>
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
                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left ${selectedId === a.id ? "bg-blue-50" : ""} ${a.isHidden ? "opacity-50" : ""}`}
                data-testid={`row-album-${a.id}`}
              >
                <img src={a.artwork} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-slate-900 text-sm truncate">{a.title}</div>
                  <div className="text-slate-400 text-xs truncate">{a.artist}</div>
                </div>
                {a.isHidden && <span className="text-[10px] uppercase tracking-wider text-[#FF5470] bg-[#FF5470]/10 border border-[#FF5470]/30 rounded px-1.5 py-0.5 shrink-0">Hidden</span>}
              </button>
            </li>
          ))}
          {entity === "people" && people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left ${selectedId === p.id ? "bg-blue-50" : ""}`}
                data-testid={`row-person-${p.id}`}
              >
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-slate-900 text-sm font-semibold shrink-0" style={{ background: p.accent || "#319ED8" }}>
                    {p.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-slate-900 text-sm truncate">{p.name}</div>
                  <div className="text-slate-400 text-xs truncate">{p.bio ?? "—"}</div>
                </div>
              </button>
            </li>
          ))}
          {entity === "instruments" && instruments.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => setSelectedId(i.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left ${selectedId === i.id ? "bg-blue-50" : ""}`}
                data-testid={`row-instrument-${i.id}`}
              >
                {i.photoUrl ? (
                  <img src={i.photoUrl} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded bg-slate-100 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-slate-900 text-sm truncate">{i.name}</div>
                  <div className="text-slate-400 text-xs truncate">{i.category}{i.vendors.length > 0 && ` · ${i.vendors.length} vendor${i.vendors.length === 1 ? "" : "s"}`}</div>
                </div>
              </button>
            </li>
          ))}
          {entity === "albums" && albums.length === 0 && (
            <li className="px-4 py-6 text-slate-400 text-sm">No albums yet. Click + New.</li>
          )}
          {entity === "people" && people.length === 0 && (
            <li className="px-4 py-6 text-slate-400 text-sm">No people yet. Click + New.</li>
          )}
          {entity === "instruments" && instruments.length === 0 && (
            <li className="px-4 py-6 text-slate-400 text-sm">No instruments yet. Click + New.</li>
          )}
        </ul>
      </section>

      {/* Editor pane */}
      <section className="flex-1 min-w-0 border-r border-slate-200">
        {!selectedId ? (
          <div className="h-full flex items-center justify-center text-slate-400">Select an item to edit.</div>
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
      <aside className="w-[420px] shrink-0 hidden xl:flex flex-col items-center justify-center bg-slate-100 py-6 px-4">
        <p className="text-slate-400 text-[11px] uppercase tracking-widest mb-3">Live preview</p>
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
                className="w-full h-full rounded-[32px] bg-[#f7f8fa]"
                data-testid="iframe-preview"
              />
            </div>
            <p className="text-slate-300 text-xs mt-3">
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
            <p className="text-slate-400 text-sm leading-relaxed">
              Live preview lights up once {entity === "people" ? "people" : "instruments"} are wired
              into a song's credits. Edit on the left — fields save independently.
            </p>
          </div>
        )}
      </aside>
    </main>
  );
}
