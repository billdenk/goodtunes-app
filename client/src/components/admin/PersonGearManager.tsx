import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X as XIcon } from "lucide-react";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AddEntityButton } from "@/components/admin/AddEntityButton";

// ---------- Shared admin form primitives ----------
// Single-sourced here so both Admin.tsx (legacy Person editor) and
// AdminPerson.tsx (live artist page) reuse the SAME gear manager without
// duplicating any of its logic.

export const inputCls =
  "w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20 transition";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
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

export interface AdminVendor {
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

export interface AdminInstrument {
  id: string;
  name: string;
  category: string;
  shortCategory: string | null;
  photoUrl: string | null;
  about: string | null;
  artistNote: string | null;
  vendors: AdminVendor[];
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
export type GearContextAlbum = {
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

export function PersonGearManager({
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
          <AddEntityButton
            label="Add gear"
            onClick={() => setAdding(true)}
            testId="button-add-gear"
          />
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
export function AddGearPanel({
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
  // Task #1667 — additive search across ALL GoodTunes-release tracks so
  // gear can be attached to a track the artist isn't credited on yet.
  // The artist's own/credited albums (`context`) stay shown by default;
  // this only fires when the operator types.
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);
  const { data: searchResults = [], isFetching: searchFetching } = useQuery<
    GearContextAlbum[]
  >({
    queryKey: ["/api/admin/people", personId, "gear-context", { search: debouncedSearch }],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/people/${personId}/gear-context?search=${encodeURIComponent(debouncedSearch)}`,
        {
          credentials: "include",
          headers: getAuthToken()
            ? { Authorization: `Bearer ${getAuthToken()}` }
            : undefined,
        },
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: debouncedSearch.length > 0,
  });
  // De-dupe albums that already appear in the artist's own/credited list
  // so a searched-for own-album track doesn't render twice.
  const ownAlbumIds = new Set(context.map((a) => a.albumId));
  const searchAlbums = searchResults.filter((a) => !ownAlbumIds.has(a.albumId));
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
    // Look up across BOTH the artist's own/credited context and any
    // searched-for tracks — a selection can come from either list.
    for (const a of context) for (const t of a.tracks) songIdToTrack.set(t.songId, t);
    for (const a of searchResults) for (const t of a.tracks) {
      if (!songIdToTrack.has(t.songId)) songIdToTrack.set(t.songId, t);
    }
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

  // Shared album-group renderer — used by both the artist's own/credited
  // list and the "search all releases" results so the visual language
  // (artwork header, Select-all, checkbox rows, already-credited / other-
  // credits chips) stays identical across both surfaces.
  const renderAlbumGroup = (a: GearContextAlbum) => {
    const allSelected =
      a.tracks.length > 0 && a.tracks.every((t) => selectedSongIds.has(t.songId));
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
            className="text-[11px] text-[var(--brand-blue)] hover:underline"
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
                  className="h-3.5 w-3.5 accent-[var(--brand-blue)]"
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
  };

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
            No tracks from {personName}'s own catalog yet — search all releases below to credit gear on any track.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200" data-testid="list-add-gear-tracks">
            {context.map((a) => renderAlbumGroup(a))}
          </div>
        )}
      </div>

      {/* Task #1667 — additive "search all releases" picker. The artist's
          own/credited albums above stay the fast default; this surfaces
          any GoodTunes-release track so gear can be attached to a song
          the artist is only a guest on and isn't credited on yet. */}
      <div>
        <span className="block text-slate-400 text-[11px] uppercase tracking-wider mb-1">
          Search all releases
        </span>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Find any track by song or album title…"
          className={inputCls}
          data-testid="input-add-gear-search"
        />
        {debouncedSearch.length > 0 && (
          <div className="mt-2">
            {searchFetching && searchAlbums.length === 0 ? (
              <p className="text-slate-400 text-xs py-2" data-testid="text-add-gear-search-loading">
                Searching…
              </p>
            ) : searchAlbums.length === 0 ? (
              <p className="text-slate-400 text-xs py-2" data-testid="text-add-gear-search-empty">
                No other releases match “{debouncedSearch}”.
              </p>
            ) : (
              <div
                className="max-h-72 overflow-y-auto rounded-md border border-slate-200"
                data-testid="list-add-gear-search-results"
              >
                {searchAlbums.map((a) => renderAlbumGroup(a))}
              </div>
            )}
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
          className="px-3 py-1.5 text-[12px] rounded-md bg-[var(--brand-blue)] text-white font-medium disabled:opacity-40"
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
export function InstrumentPicker({
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
                className="w-full text-left px-3 py-2 border-t border-slate-100 text-[12px] text-[var(--brand-blue)] hover:bg-slate-50"
                data-testid="button-create-new-instrument"
              >
                + Create new gear{query.trim() ? ` "${query.trim()}"` : ""}
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
              className="px-2.5 py-1 text-[11px] rounded bg-[var(--brand-blue)] text-white font-medium disabled:opacity-40"
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
