import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X as XIcon, Plus as PlusIcon } from "lucide-react";
import { accessoryTypesFor, GEAR_ROLES } from "@shared/categories";
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
  as = "label",
}: {
  label: string;
  children: ReactNode;
  // Default `<label>` is right for a single plain input. Pass `as="div"` when
  // the field hosts interactive content with its own focusable controls (e.g.
  // the InstrumentPicker combobox): nesting labelable/interactive descendants
  // inside a <label> is invalid HTML, and Safari forwards the click to the
  // label's labeled control — which swallowed gear-picker selections (#1954).
  as?: "label" | "div";
}) {
  const Wrapper = as;
  return (
    <Wrapper className="block">
      <span className="block text-slate-400 text-[11px] uppercase tracking-wider mb-1">
        {label}
      </span>
      {children}
    </Wrapper>
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
    // Per-track attached rigs (base instrument + accessory lines). Only the
    // default (non-search) gear-context payload populates this; the "search
    // all releases" path omits it (that picker doesn't render accessories).
    rigs?: Array<{
      trackRigId: string;
      rigId: string | null;
      name: string;
      instrumentId: string | null;
      accessories: Array<{ type: string; value: string; instrumentId: string | null }>;
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
  type GearRowRig = {
    rigId: string;
    name: string;
    accessories: Array<{ type: string; value: string; instrumentId: string | null }>;
  };
  type GearRow = {
    instrumentId: string;
    instrumentName: string;
    instrumentPhotoUrl: string | null;
    instrumentCategory: string | null;
    // Closed shortCategory bucket only (drives accessory-type suggestions);
    // null when the instrument has only a free-text category.
    instrumentShortCategory: string | null;
    tracks: Array<{
      performerId: string;
      songId: string;
      songTitle: string;
      trackNumber: number;
      albumId: string;
      albumTitle: string;
      role: string;
      // The matching rig's track-attachment id on this song (if any), so
      // removing the performer credit also detaches its rig from the track.
      trackRigId: string | null;
    }>;
    // Distinct rigs (deduped by rigId) whose base instrument is THIS gear
    // row's instrument, gathered across the row's tracks — carries the
    // accessory lines the editor shows and edits.
    matchingRigs: GearRowRig[];
  };
  // songId → attached rigs, from the enriched gear-context payload.
  const rigsBySong = new Map<
    string,
    NonNullable<GearContextAlbum["tracks"][number]["rigs"]>
  >();
  for (const a of context) {
    for (const t of a.tracks) {
      if (t.rigs && t.rigs.length) rigsBySong.set(t.songId, t.rigs);
    }
  }
  const gearRows: GearRow[] = (() => {
    const byInst = new Map<string, GearRow>();
    const seenRigByInst = new Map<string, Set<string>>();
    for (const a of context) {
      for (const t of a.tracks) {
        const songRigs = rigsBySong.get(t.songId) ?? [];
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
              instrumentShortCategory: inst?.shortCategory ?? null,
              tracks: [],
              matchingRigs: [],
            } satisfies GearRow);
          // A rig matches this gear row when its base instrument is the
          // same instrument the person plays here.
          const matchOnSong = songRigs.find(
            (r) => r.instrumentId === key && !!r.rigId,
          );
          row.tracks.push({
            performerId: p.id,
            songId: t.songId,
            songTitle: t.title,
            trackNumber: t.trackNumber,
            albumId: a.albumId,
            albumTitle: a.albumTitle,
            role: p.role,
            trackRigId: matchOnSong?.trackRigId ?? null,
          });
          // Gather the distinct matching rigs (one rig can ride several
          // tracks) so the editor shows a single accessory set per rig.
          const seen = seenRigByInst.get(key) ?? new Set<string>();
          for (const r of songRigs) {
            if (r.instrumentId === key && r.rigId && !seen.has(r.rigId)) {
              seen.add(r.rigId);
              row.matchingRigs.push({
                rigId: r.rigId,
                name: r.name,
                accessories: r.accessories,
              });
            }
          }
          seenRigByInst.set(key, seen);
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
    // Rig catalog (the album RigPanel reads ["/api/rigs"]).
    queryClient.invalidateQueries({ queryKey: ["/api/rigs"] });
    queryClient.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey;
        if (!Array.isArray(k)) return false;
        // Adding/removing a performer row flips the counts on the
        // Instrument editor's Tracks + Artists tabs.
        if (k[0] === "/api/instruments" && k[2] === "profile") return true;
        // Album credits surface rigs via getAlbumCredits().bySongId[id].rigs.
        if (k[0] === "/api/albums" && k[2] === "credits") return true;
        // Per-song rig lists (the album RigPanel).
        if (k[0] === "/api/songs" && k[2] === "rigs") return true;
        return false;
      },
    });
  };

  // After a GearPicker scrapes + creates a new catalog row, refresh the
  // shared instrument list so the new row is immediately pickable.
  const onInstrumentCreated = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/instruments"] });
  };

  const deletePerformer = useMutation({
    mutationFn: async ({
      performerId,
      trackRigId,
    }: {
      performerId: string;
      trackRigId?: string | null;
    }) => {
      await apiRequest("DELETE", `/api/admin/performers/${performerId}`);
      // If this credit also carried an accessory rig on the same track,
      // detach it too — the person no longer plays this instrument here.
      if (trackRigId) {
        await apiRequest("DELETE", `/api/admin/track-rigs/${trackRigId}`);
      }
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
                  <div className="bg-slate-50/60 border-t border-slate-100">
                    <ul>
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
                                deletePerformer.mutate({
                                  performerId: t.performerId,
                                  trackRigId: t.trackRigId,
                                });
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
                    <GearRowAccessories
                      personName={personName}
                      instrumentId={g.instrumentId}
                      instrumentName={g.instrumentName}
                      instrumentShortCategory={g.instrumentShortCategory}
                      songIds={g.tracks.map((t) => t.songId)}
                      matchingRigs={g.matchingRigs}
                      onChanged={invalidate}
                      instruments={instruments}
                      onInstrumentCreated={onInstrumentCreated}
                    />
                  </div>
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

// ---------- Accessory editor (under an expanded gear row) ----------
// Lets the operator attach accessory gear (strings, picks, capo, etc.) to
// the instrument this person plays. Backed by the SAME Rig model the album
// Credits panel uses: a "rig" is the base instrument + its accessory lines.
//   - No matching rig yet → "+ Add accessories" builds one rig
//     (`${person}'s ${instrument}`, base = this instrument) and attaches it
//     to every track this gear row covers, so the accessories ride along.
//   - Matching rig(s) exist → show each rig's accessory chips with an Edit
//     button that PUTs the full accessory set (it replaces, not appends).
// Explicit Save (no autosave) is the sanctioned design-system exception for
// multi-field editors.
// `instrumentId` links this accessory line to a row in the gear catalog
// (picked or scraped). `null` = legacy free-text value (e.g. typed
// "Ernie Ball .010s") with no catalog row — fully back-compatible.
type AccessoryDraft = { type: string; value: string; instrumentId: string | null };

function AccessoryDraftEditor({
  draft,
  setDraft,
  shortCategory,
  idBase,
  onSave,
  onCancel,
  saving,
  saveLabel,
  instruments,
  onInstrumentCreated,
}: {
  draft: AccessoryDraft[];
  setDraft: (next: AccessoryDraft[]) => void;
  shortCategory: string | null;
  idBase: string;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  saveLabel: string;
  instruments: AdminInstrument[];
  onInstrumentCreated: () => void;
}) {
  const typeSuggestions = accessoryTypesFor(shortCategory);
  const canSave =
    !saving && draft.some((a) => a.type.trim() && a.value.trim());
  return (
    <div className="mt-2 space-y-2">
      <datalist id={`accessory-types-${idBase}`}>
        {typeSuggestions.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      {draft.length === 0 ? (
        <p className="text-slate-400 text-xs">
          No accessories yet — add strings, picks, capo, etc.
        </p>
      ) : (
        <ul className="space-y-2">
          {draft.map((a, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <input
                value={a.type}
                onChange={(e) =>
                  setDraft(
                    draft.map((x, i) =>
                      i === idx ? { ...x, type: e.target.value } : x,
                    ),
                  )
                }
                list={`accessory-types-${idBase}`}
                placeholder="Type (e.g. Strings)"
                className={`${inputCls} sm:w-44`}
                data-testid={`input-accessory-type-${idBase}-${idx}`}
              />
              <div className="flex-1 min-w-0">
                <GearPicker
                  instruments={instruments}
                  value={{ instrumentId: a.instrumentId, text: a.value }}
                  onChange={(next) =>
                    setDraft(
                      draft.map((x, i) =>
                        i === idx
                          ? { ...x, value: next.text, instrumentId: next.instrumentId }
                          : x,
                      ),
                    )
                  }
                  onCreated={onInstrumentCreated}
                  categoryHint={a.type}
                  idBase={`${idBase}-${idx}`}
                />
              </div>
              <button
                type="button"
                onClick={() => setDraft(draft.filter((_, i) => i !== idx))}
                className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 mt-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                data-testid={`button-remove-accessory-${idBase}-${idx}`}
                aria-label="Remove accessory"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={() =>
            setDraft([...draft, { type: "", value: "", instrumentId: null }])
          }
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-blue)] hover:underline"
          data-testid={`button-add-accessory-row-${idBase}`}
        >
          <PlusIcon className="w-3.5 h-3.5" /> Add accessory
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-40 px-2 py-1"
          data-testid={`button-cancel-accessories-${idBase}`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="text-xs font-semibold text-white bg-[var(--brand-blue)] hover:opacity-90 disabled:opacity-40 rounded-md px-3 py-1.5"
          data-testid={`button-save-accessories-${idBase}`}
        >
          {saving ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  );
}

function GearRowAccessories({
  personName,
  instrumentId,
  instrumentName,
  instrumentShortCategory,
  songIds,
  matchingRigs,
  onChanged,
  instruments,
  onInstrumentCreated,
}: {
  personName: string;
  instrumentId: string;
  instrumentName: string;
  instrumentShortCategory: string | null;
  songIds: string[];
  matchingRigs: Array<{
    rigId: string;
    name: string;
    accessories: Array<{ type: string; value: string; instrumentId: string | null }>;
  }>;
  onChanged: () => void;
  instruments: AdminInstrument[];
  onInstrumentCreated: () => void;
}) {
  const { toast } = useToast();
  // Which editor is open: a rigId (editing that rig) or "new" (building one).
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<AccessoryDraft[]>([]);

  const clean = (d: AccessoryDraft[]) =>
    d
      .map((a) => ({
        type: a.type.trim(),
        value: a.value.trim(),
        // Keep the catalog link — omitting it here silently strips the
        // inventory backing on every save (the legacy free-text bug).
        instrumentId: a.instrumentId ?? null,
      }))
      .filter((a) => a.type && a.value);

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/rigs", {
        name: `${personName}'s ${instrumentName}`,
        instrumentId,
        accessories: clean(draft),
      });
      const rig = await res.json();
      // Attach to every (distinct) track this gear row covers so the
      // accessories show up on each of the person's performances of this
      // instrument. Dedupe songIds so two credits on the same song don't
      // create duplicate track-rig rows. allSettled (not all) so one FK fail
      // doesn't strand the rest — we surface the failure count instead.
      const uniqueSongIds = Array.from(new Set(songIds));
      const results = await Promise.allSettled(
        uniqueSongIds.map((songId) =>
          apiRequest("POST", `/api/admin/songs/${songId}/rigs`, {
            rigId: rig.id,
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      return { failed, total: uniqueSongIds.length };
    },
    onSuccess: ({ failed, total }) => {
      setEditing(null);
      setDraft([]);
      onChanged();
      if (failed > 0) {
        toast({
          variant: "destructive",
          title: "Saved with errors",
          description: `Accessories added but ${failed} of ${total} track${total === 1 ? "" : "s"} didn't link.`,
        });
      } else {
        toast({ title: "Accessories added", description: "Saved to this gear." });
      }
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        description: e instanceof Error ? e.message : "Could not save accessories",
      }),
  });

  const updateMut = useMutation({
    mutationFn: async (rigId: string) => {
      await apiRequest("PUT", `/api/admin/rigs/${rigId}`, {
        accessories: clean(draft),
      });
    },
    onSuccess: () => {
      setEditing(null);
      setDraft([]);
      onChanged();
      toast({ title: "Accessories updated" });
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        description: e instanceof Error ? e.message : "Could not update accessories",
      }),
  });

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div
      className="border-t border-slate-100 px-3 py-2.5"
      data-testid={`accessories-${instrumentId}`}
    >
      <p className="text-slate-400 text-xs uppercase tracking-wider mb-1.5">
        Accessories
      </p>

      {matchingRigs.length === 0 ? (
        editing === "new" ? (
          <AccessoryDraftEditor
            draft={draft}
            setDraft={setDraft}
            shortCategory={instrumentShortCategory}
            idBase={`new-${instrumentId}`}
            onSave={() => createMut.mutate()}
            onCancel={() => {
              setEditing(null);
              setDraft([]);
            }}
            saving={saving}
            saveLabel="Save accessories"
            instruments={instruments}
            onInstrumentCreated={onInstrumentCreated}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditing("new");
              setDraft([{ type: "", value: "", instrumentId: null }]);
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-blue)] hover:underline"
            data-testid={`button-add-accessories-${instrumentId}`}
          >
            <PlusIcon className="w-3.5 h-3.5" /> Add accessories
          </button>
        )
      ) : (
        <ul className="space-y-2.5">
          {matchingRigs.map((rig) => (
            <li key={rig.rigId} data-testid={`rig-accessories-${rig.rigId}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {rig.accessories.length === 0 ? (
                    <span className="text-slate-400 text-xs">
                      No accessories yet.
                    </span>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {rig.accessories.map((a, idx) => (
                        <li
                          key={idx}
                          className="inline-flex items-center gap-1 rounded-full bg-white ring-1 ring-slate-200 px-2 py-0.5 text-xs text-slate-600"
                          data-testid={`chip-accessory-${rig.rigId}-${idx}`}
                        >
                          <span className="font-semibold text-slate-500">
                            {a.type}
                          </span>
                          <span>{a.value}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {editing !== rig.rigId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(rig.rigId);
                      setDraft(
                        rig.accessories.length
                          ? rig.accessories.map((a) => ({ ...a }))
                          : [{ type: "", value: "", instrumentId: null }],
                      );
                    }}
                    className="flex-shrink-0 text-xs font-semibold text-[var(--brand-blue)] hover:underline"
                    data-testid={`button-edit-accessories-${rig.rigId}`}
                  >
                    Edit
                  </button>
                )}
              </div>
              {editing === rig.rigId && (
                <AccessoryDraftEditor
                  draft={draft}
                  setDraft={setDraft}
                  shortCategory={instrumentShortCategory}
                  idBase={rig.rigId}
                  onSave={() => updateMut.mutate(rig.rigId)}
                  onCancel={() => {
                    setEditing(null);
                    setDraft([]);
                  }}
                  saving={saving}
                  saveLabel="Save"
                  instruments={instruments}
                  onInstrumentCreated={onInstrumentCreated}
                />
              )}
            </li>
          ))}
        </ul>
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
  // Task #1983 — "Role on these tracks" is a single-select pill group drawn
  // from the canonical GEAR_ROLES list, with a "Custom…" escape hatch that
  // reveals a free-text input for off-list roles. `customMode` forces the
  // custom input open even before anything is typed (so the empty-input case
  // works); a non-empty role that isn't in GEAR_ROLES also reads as custom.
  const [customMode, setCustomMode] = useState(false);
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
  // When the user picks an instrument, default the role ONLY from the
  // closed short-category bucket ("Guitar" / "Bass" / "Drums"). The
  // free-text `category` ("Hollow and Semi-Hollow Body", "Solid Body…")
  // is a body/build descriptor, NOT a performance role — never drop it
  // into Role. When there's no shortCategory we leave Role blank and let
  // the placeholder ("Guitar / Bass / Lead vocals…") guide the operator;
  // canSave already requires a non-empty role so nothing saves blank.
  useEffect(() => {
    if (selectedInstrument && !role) {
      const pre = selectedInstrument.shortCategory || "";
      setRole(pre);
      // A known short-category pre-selects its pill; an off-list value
      // (e.g. Amp/Pedal/Mic) reads as custom on its own, no flag needed.
      if ((GEAR_ROLES as readonly string[]).includes(pre)) setCustomMode(false);
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

  // Master "Select all" for the artist's own-catalog Tracks box — flips
  // every track across ALL releases at once. The per-release Select-all
  // only toggles a single release, which left no one-tap way to grab the
  // whole catalog; this sits above the box so "select all tracks" works.
  const allContextSongIds: string[] = [];
  for (const a of context) for (const t of a.tracks) allContextSongIds.push(t.songId);
  const allContextSelected =
    allContextSongIds.length > 0 && allContextSongIds.every((id) => selectedSongIds.has(id));
  const toggleAllContext = () => {
    setSelectedSongIds((prev) => {
      const next = new Set(prev);
      if (allContextSelected) {
        for (const id of allContextSongIds) next.delete(id);
      } else {
        for (const id of allContextSongIds) next.add(id);
      }
      return next;
    });
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

      <Field label="Instrument" as="div">
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

      <Field label="Role on these tracks" as="div">
        {(() => {
          // The custom input is shown when "Custom…" is tapped OR when the
          // current role is a non-empty value that isn't one of the pills
          // (e.g. an instrument pre-fill from an off-list short category).
          const roleIsKnown = (GEAR_ROLES as readonly string[]).includes(role);
          const customActive = customMode || (!!role && !roleIsKnown);
          return (
            <>
              <div className="flex flex-wrap gap-1.5">
                {GEAR_ROLES.map((r) => {
                  const selected = !customActive && role === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setRole(r);
                        setCustomMode(false);
                      }}
                      aria-pressed={selected}
                      className={[
                        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                        selected
                          ? "bg-slate-900 text-white ring-1 ring-slate-900"
                          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900 hover:ring-slate-300",
                      ].join(" ")}
                      data-testid={`button-role-pill-${r.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {r}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setCustomMode(true);
                    // Drop a known pill value so the custom input starts empty
                    // for a genuinely off-list role; keep an existing custom
                    // value so re-opening doesn't wipe what was typed.
                    if (roleIsKnown) setRole("");
                  }}
                  aria-pressed={customActive}
                  className={[
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    customActive
                      ? "bg-slate-900 text-white ring-1 ring-slate-900"
                      : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900 hover:ring-slate-300",
                  ].join(" ")}
                  data-testid="button-role-pill-custom"
                >
                  Custom…
                </button>
              </div>
              {customActive && (
                <input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Type a role…"
                  className={`${inputCls} mt-2`}
                  data-testid="input-add-gear-role"
                  autoFocus
                />
              )}
            </>
          );
        })()}
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
        <div className="flex items-center justify-between mb-1">
          <span className="text-slate-400 text-[11px] uppercase tracking-wider">
            Tracks ({selectedSongIds.size} selected)
          </span>
          {allContextSongIds.length > 0 && (
            <button
              type="button"
              onClick={toggleAllContext}
              className="text-[11px] text-[var(--brand-blue)] hover:underline"
              data-testid="button-toggle-all-tracks"
            >
              {allContextSelected ? "Clear all" : `Select all ${allContextSongIds.length} tracks`}
            </button>
          )}
        </div>
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

// Strip apiRequest's "502: {json}" envelope down to a readable sentence
// for inline picker errors (AdminInstruments' humanizeApiError isn't
// exported, and this surface is slimmer).
function gearPickerError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const m = raw.match(/^\d{3}:\s*(.*)$/);
  const body = m ? m[1] : raw;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }
  } catch {
    /* not JSON — fall through */
  }
  return body.trim() || "Couldn't read that link. Check it and try again.";
}

type ScrapedGear = {
  name: string | null;
  category: string | null;
  description: string | null;
  photoUrl: string | null;
};

// Accessory gear picker — mirrors the main "Add gear" flow in one slim
// inline control. The operator can:
//   (a) type a value and pick a matching catalog row from the dropdown
//       (links the line to inventory via instrumentId), or
//   (b) paste a product URL → scrape → preview → "Add to gear", which
//       creates a catalog row tagged shortCategory "Accessory" and links
//       it, or
//   (c) leave it as free text (no match, no URL) — instrumentId stays
//       null, exactly the legacy behavior, so old accessory lines and
//       quick one-offs like "Ernie Ball .010s" still read fine for fans.
// Minimal shape the picker needs — both AdminInstrument (Person editor)
// and AdminInstrumentLite (TrackCreditsPanel) satisfy it, so the one
// component serves both surfaces.
export type GearPickerInstrument = {
  id: string;
  name: string;
  category?: string | null;
  shortCategory?: string | null;
  photoUrl?: string | null;
};

export function GearPicker({
  instruments,
  value,
  onChange,
  onCreated,
  categoryHint,
  idBase,
}: {
  instruments: GearPickerInstrument[];
  value: { instrumentId: string | null; text: string };
  onChange: (next: { instrumentId: string | null; text: string }) => void;
  onCreated: (i: GearPickerInstrument) => void;
  categoryHint?: string | null;
  idBase: string;
}) {
  const [open, setOpen] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scraped, setScraped] = useState<ScrapedGear | null>(null);
  const [pendingSourceUrl, setPendingSourceUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const linked = value.instrumentId
    ? instruments.find((i) => i.id === value.instrumentId) ?? null
    : null;

  const text = value.text;
  const isUrl = /^https?:\/\/\S+$/i.test(text.trim());
  const matches = (() => {
    const q = text.trim().toLowerCase();
    if (!q || isUrl) return [];
    return instruments
      .filter((i) => {
        const hay =
          `${i.name} ${i.category ?? ""} ${i.shortCategory ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);
  })();

  async function handleScrape() {
    const url = text.trim();
    if (!url) return;
    setScraping(true);
    setErr(null);
    setScraped(null);
    try {
      const r = await apiRequest("POST", "/api/admin/instruments/scrape", {
        url,
      });
      const data = (await r.json()) as ScrapedGear;
      setScraped(data);
      setPendingSourceUrl(url);
      setOpen(false);
    } catch (e) {
      setErr(gearPickerError(e));
    } finally {
      setScraping(false);
    }
  }

  async function handleCreate() {
    if (!scraped) return;
    const name = (scraped.name ?? text).trim() || "New accessory";
    const category =
      (scraped.category ?? categoryHint ?? "Accessory").trim() || "Accessory";
    setCreating(true);
    setErr(null);
    try {
      const res = await apiRequest("POST", "/api/admin/instruments", {
        name,
        category,
        shortCategory: "Accessory",
        ...(scraped.photoUrl ? { photoUrl: scraped.photoUrl } : {}),
        ...(scraped.description ? { about: scraped.description } : {}),
        ...(pendingSourceUrl ? { sourceUrl: pendingSourceUrl } : {}),
      });
      const created = (await res.json()) as AdminInstrument;
      onCreated(created);
      onChange({ instrumentId: created.id, text: created.name });
      setScraped(null);
      setPendingSourceUrl(null);
    } catch (e) {
      setErr(gearPickerError(e));
    } finally {
      setCreating(false);
    }
  }

  // Linked to a catalog row — show the gear chip with a Change affordance.
  if (value.instrumentId) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"
        data-testid={`gear-linked-${idBase}`}
      >
        <div className="w-7 h-7 rounded overflow-hidden bg-slate-200 flex-shrink-0">
          {linked?.photoUrl ? (
            <img
              src={linked.photoUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : null}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-slate-900 text-[13px] font-medium truncate">
            {linked?.name ?? value.text ?? "Linked gear"}
          </p>
          {linked ? (
            <p className="text-slate-400 text-[11px] truncate">
              {linked.shortCategory ?? linked.category}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onChange({ instrumentId: null, text: "" })}
          className="text-[11px] text-slate-500 hover:text-slate-800"
          data-testid={`button-change-gear-${idBase}`}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative" data-testid={`gear-picker-${idBase}`}>
      <input
        value={text}
        onChange={(e) => {
          onChange({ instrumentId: null, text: e.target.value });
          setOpen(true);
          setErr(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && isUrl) {
            e.preventDefault();
            handleScrape();
          }
        }}
        placeholder="Value (e.g. Ernie Ball .010s) — or paste a link"
        className={inputCls}
        data-testid={`input-accessory-value-${idBase}`}
      />
      {open && text.trim().length > 0 && (
        <div className="absolute z-10 left-0 right-0 mt-1 rounded-md border border-slate-200 bg-white shadow-lg max-h-64 overflow-y-auto">
          {isUrl ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleScrape}
              disabled={scraping}
              className="w-full text-left px-3 py-2 text-xs text-[var(--brand-blue)] hover:bg-slate-50 disabled:opacity-50"
              data-testid={`button-import-gear-${idBase}`}
            >
              {scraping ? "Reading link…" : "Import gear from this link"}
            </button>
          ) : (
            <>
              {matches.length === 0 && (
                <p className="px-3 py-2 text-slate-400 text-xs">
                  No matching gear — paste a product link to import it.
                </p>
              )}
              {matches.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange({ instrumentId: i.id, text: i.name });
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 text-left"
                  data-testid={`option-gear-${idBase}-${i.id}`}
                >
                  <div className="w-7 h-7 rounded overflow-hidden bg-slate-200 flex-shrink-0">
                    {i.photoUrl ? (
                      <img
                        src={i.photoUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>
                  <span className="flex-1 min-w-0">
                    <span className="block text-slate-900 text-xs truncate">
                      {i.name}
                    </span>
                    <span className="block text-slate-400 text-[10px] truncate">
                      {i.shortCategory ?? i.category}
                    </span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
      {err && (
        <p
          className="mt-1 text-red-600 text-xs"
          data-testid={`gear-error-${idBase}`}
        >
          {err}
        </p>
      )}
      {scraped && (
        <div
          className="mt-2 rounded-md border border-slate-200 bg-white p-2"
          data-testid={`gear-scrape-preview-${idBase}`}
        >
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded overflow-hidden bg-slate-200 flex-shrink-0">
              {scraped.photoUrl ? (
                <img
                  src={scraped.photoUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : null}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-900 text-[13px] font-medium truncate">
                {scraped.name ?? "New accessory"}
              </p>
              <p className="text-slate-400 text-[11px] truncate">
                {scraped.category ?? categoryHint ?? "Accessory"}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setScraped(null);
                setPendingSourceUrl(null);
              }}
              className="text-[11px] text-slate-500 hover:text-slate-800 px-2 py-1"
              data-testid={`button-discard-scrape-${idBase}`}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={creating}
              onClick={handleCreate}
              className="px-2.5 py-1 text-[11px] rounded bg-[var(--brand-blue)] text-white font-medium disabled:opacity-40"
              data-testid={`button-add-scraped-gear-${idBase}`}
            >
              {creating ? "Adding…" : "Add to gear"}
            </button>
          </div>
        </div>
      )}
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
