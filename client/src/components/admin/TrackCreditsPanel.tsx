import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Download,
  Pencil,
  Plus,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Per-track Credits panel.
//
// Replaces the old WRITERS / PERFORMERS lists with three buckets — Song,
// Performance, Production — matching the Grammy axes and the
// AlbumCredits.tsx vocabulary so the album tier and the track tier speak
// the same language. Reuses the existing writer / performer endpoints so
// no server changes are required.

type WriterRow = {
  id: string;
  songId: string;
  personId: string | null;
  name: string;
  role: string;
  position: number;
  person: { id: string; name: string; photoUrl?: string | null } | null;
};
type PerformerRow = {
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
};

type AdminPersonLite = { id: string; name: string; photoUrl?: string | null };
type AdminCreditRole = {
  id: string;
  kind: "writer" | "performer";
  name: string;
};

type Bucket = "song" | "performance" | "production";

const BUCKET_TITLE: Record<Bucket, string> = {
  song: "Song",
  performance: "Performance",
  production: "Production",
};

// Roles in the performer table that actually belong to the Production
// axis on a Grammy ballot. Everything else in the performer table is
// Performance (Vocals, Guitar, etc.).
const PRODUCTION_PERFORMER_ROLES = new Set([
  "Engineer",
  "Mixing Engineer",
  "Mastering Engineer",
  "Tracking Engineer",
  "Recording Engineer",
]);

function bucketFor(kind: "writer" | "performer", role: string): Bucket {
  if (kind === "writer") return role === "Producer" ? "production" : "song";
  return PRODUCTION_PERFORMER_ROLES.has(role) ? "production" : "performance";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

/* ─── Person card (one per credited person inside a section) ──────── */

type PersonCard = {
  key: string;
  personId: string | null;
  name: string;
  photoUrl: string | null;
  rows: Array<{ id: string; kind: "writer" | "performer"; role: string }>;
};

function PersonColumn({
  p,
  armed,
  editing,
  busy,
  onRemove,
}: {
  p: PersonCard;
  armed: boolean;
  editing: boolean;
  busy: boolean;
  onRemove: () => void;
}) {
  return (
    <div
      className="flex w-[96px] shrink-0 flex-col items-center text-center"
      data-testid={`person-card-${p.key}`}
    >
      <div className="relative">
        <div
          className={[
            "flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold transition",
            armed ? "ring-2 ring-rose-400" : "",
            p.photoUrl ? "bg-slate-100" : "bg-slate-200 text-slate-600",
          ].join(" ")}
        >
          {p.photoUrl ? (
            <img
              src={p.photoUrl}
              alt={p.name}
              className="h-full w-full object-cover"
            />
          ) : (
            initials(p.name)
          )}
        </div>
        {editing && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className={[
              "absolute -right-1 -top-1 inline-flex items-center justify-center rounded-full shadow ring-1 transition",
              armed
                ? "h-5 px-1.5 gap-0.5 bg-rose-500 text-white ring-rose-500 text-[9.5px] font-semibold"
                : "h-4 w-4 bg-white text-slate-400 ring-slate-200 hover:text-slate-700",
              busy ? "opacity-50" : "",
            ].join(" ")}
            aria-label={armed ? `Confirm remove ${p.name}` : `Remove ${p.name}`}
            data-testid={`button-remove-credit-${p.key}`}
          >
            {armed ? (
              <>
                <X className="h-2.5 w-2.5" strokeWidth={2.5} /> Remove?
              </>
            ) : (
              <X className="h-2.5 w-2.5" strokeWidth={2.5} />
            )}
          </button>
        )}
      </div>
      <div className="mt-2 text-[12.5px] font-semibold leading-tight text-slate-900">
        {p.name}
      </div>
      <div className="mt-0.5 space-y-0 text-[11.5px] leading-snug text-slate-500">
        {p.rows.map((r) => (
          <div key={r.id}>{r.role}</div>
        ))}
      </div>
    </div>
  );
}

/* ─── Searchable Add picker (person + role) ──────────────────────── */

function AddPicker({
  people,
  roles,
  bucket,
  busy,
  onAdd,
  onClose,
}: {
  people: AdminPersonLite[];
  roles: AdminCreditRole[];
  bucket: Bucket;
  busy: boolean;
  onAdd: (args: {
    personId: string | null;
    name: string;
    role: string;
    kind: "writer" | "performer";
  }) => Promise<void>;
  onClose: () => void;
}) {
  const validRoles = useMemo(
    () => roles.filter((r) => bucketFor(r.kind, r.name) === bucket),
    [roles, bucket],
  );

  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<AdminPersonLite | null>(null);
  const [pickedRoleId, setPickedRoleId] = useState<string>(
    validRoles[0]?.id ?? "",
  );

  // Refresh default role when the role list (or bucket) changes.
  useEffect(() => {
    if (validRoles.length === 0) return;
    if (!validRoles.some((r) => r.id === pickedRoleId)) {
      setPickedRoleId(validRoles[0].id);
    }
  }, [validRoles, pickedRoleId]);

  // We deliberately do NOT filter out people already in this section —
  // a single person commonly has multiple roles in the same bucket
  // (e.g. Composer + Lyricist in Song). Pick them again to add another role.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people.slice(0, 6);
    return people
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [people, query]);

  const commit = async () => {
    const role = validRoles.find((r) => r.id === pickedRoleId);
    if (!role) return;
    if (picked) {
      await onAdd({
        personId: picked.id,
        name: picked.name,
        role: role.name,
        kind: role.kind,
      });
    } else if (query.trim()) {
      await onAdd({
        personId: null,
        name: query.trim(),
        role: role.name,
        kind: role.kind,
      });
    }
  };

  return (
    <div
      className="w-full"
      onClick={(e) => e.stopPropagation()}
      data-testid="add-credit-picker"
    >
      <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white border border-[#319ED8] ring-2 ring-[#319ED8]/20">
        <Search className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
        <input
          autoFocus
          value={picked ? picked.name : query}
          onChange={(e) => {
            setPicked(null);
            setQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder="Search a person or type a new name…"
          className="flex-1 min-w-0 bg-transparent text-[12.5px] text-slate-700 placeholder-slate-400 focus:outline-none"
          data-testid="input-credit-person"
        />
        <button
          type="button"
          onClick={onClose}
          className="w-5 h-5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center"
          aria-label="Cancel"
          data-testid="button-cancel-add-credit"
        >
          <X className="h-3 w-3" />
        </button>
      </label>

      {!picked && (query || matches.length > 0) && (
        <div className="mt-1.5 rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
          {matches.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPicked(p);
                setQuery("");
              }}
              className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[12.5px] text-slate-700 hover:bg-[#319ED8]/5"
              data-testid={`button-pick-person-${p.id}`}
            >
              <span className="inline-flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-[9.5px] font-semibold text-slate-600">
                  {p.photoUrl ? (
                    <img
                      src={p.photoUrl}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    initials(p.name)
                  )}
                </span>
                {p.name}
              </span>
              <Plus className="h-3 w-3 text-slate-400" />
            </button>
          ))}
          {query.trim() &&
            !people.some(
              (p) => p.name.toLowerCase() === query.trim().toLowerCase(),
            ) && (
              <button
                type="button"
                onClick={() => {
                  setPicked(null);
                }}
                className="flex w-full items-center gap-2 border-t border-slate-100 bg-slate-50 px-2.5 py-1.5 text-left text-[12px] font-medium text-[#319ED8]"
                disabled
              >
                <Plus className="h-3 w-3" strokeWidth={2.5} />
                Will add as guest: "{query.trim()}"
              </button>
            )}
        </div>
      )}

      {/* Role + commit row */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[11px] text-slate-500 flex-shrink-0">
          Role on this song
        </span>
        <select
          value={pickedRoleId}
          onChange={(e) => setPickedRoleId(e.target.value)}
          className="flex-1 min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#319ED8]/30"
          data-testid="select-credit-role"
        >
          {validRoles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={commit}
          disabled={
            busy ||
            (!picked && !query.trim()) ||
            !pickedRoleId
          }
          className="rounded-md bg-[#319ED8] px-2.5 py-1 text-[12px] font-semibold text-white shadow-sm hover:bg-[#2789bd] disabled:opacity-40 inline-flex items-center gap-1"
          data-testid="button-commit-add-credit"
        >
          <Plus className="h-3 w-3" strokeWidth={2.5} />
          Add
        </button>
      </div>
    </div>
  );
}

/* ─── Section (Song / Performance / Production) ──────────────────── */

function Section({
  bucket,
  cards,
  songId,
  albumId,
  people,
  roles,
}: {
  bucket: Bucket;
  cards: PersonCard[];
  songId: string;
  albumId: string;
  people: AdminPersonLite[];
  roles: AdminCreditRole[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingRemoveKey, setPendingRemoveKey] = useState<string | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: ["/api/albums", albumId, "credits"],
    });

  // Click-away closes the pencil popover.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = () => setMenuOpen(false);
    const t = setTimeout(() => window.addEventListener("click", onClick), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", onClick);
    };
  }, [menuOpen]);

  // Auto-disarm Remove? after 3s.
  useEffect(() => {
    if (!pendingRemoveKey) return;
    if (removeTimer.current) clearTimeout(removeTimer.current);
    removeTimer.current = setTimeout(() => setPendingRemoveKey(null), 3000);
    return () => {
      if (removeTimer.current) clearTimeout(removeTimer.current);
    };
  }, [pendingRemoveKey]);

  const addMut = useMutation({
    mutationFn: async (args: {
      personId: string | null;
      name: string;
      role: string;
      kind: "writer" | "performer";
    }) => {
      const url =
        args.kind === "writer"
          ? `/api/admin/songs/${songId}/writers`
          : `/api/admin/songs/${songId}/performers`;
      await apiRequest("POST", url, {
        personId: args.personId,
        name: args.name,
        role: args.role,
      });
    },
    onSuccess: async () => {
      await invalidate();
      setAdding(false);
      toast({ title: "Credit added" });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't add credit",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const delMut = useMutation({
    mutationFn: async (card: PersonCard) => {
      // A person card in this section can span multiple role rows
      // (e.g. Vic = Producer + Engineer + Mixing in Production). Removing
      // the person from the section deletes every row that put them here;
      // it does NOT touch their People table row.
      //
      // allSettled so a failure on one row doesn't strand the others —
      // we refetch in `onSettled` regardless and surface the partial.
      const results = await Promise.allSettled(
        card.rows.map((r) => {
          const url =
            r.kind === "writer"
              ? `/api/admin/writers/${r.id}`
              : `/api/admin/performers/${r.id}`;
          return apiRequest("DELETE", url);
        }),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        throw new Error(
          `${failed} of ${card.rows.length} role row${
            card.rows.length === 1 ? "" : "s"
          } couldn't be removed. Refreshing.`,
        );
      }
    },
    onSettled: async () => {
      // Always resync so the UI matches what actually persisted, even on
      // partial failure.
      await invalidate();
      setPendingRemoveKey(null);
    },
    onSuccess: () => {
      toast({ title: "Credit removed from this song" });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't fully remove credit",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const handleRemove = (card: PersonCard) => {
    if (pendingRemoveKey !== card.key) {
      setPendingRemoveKey(card.key);
      return;
    }
    delMut.mutate(card);
  };

  const triggerVisible = editing || menuOpen || adding;

  return (
    <section className="group/section" data-testid={`section-credits-${bucket}`}>
      <header className="flex items-center gap-2 mb-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
          {BUCKET_TITLE[bucket]}
        </h2>
        {editing && (
          <span className="text-[10.5px] uppercase tracking-wider font-semibold text-[#319ED8]">
            · Editing
          </span>
        )}
        <div className="flex-1" />

        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={`Edit ${BUCKET_TITLE[bucket]} credits`}
            className={[
              "h-7 w-7 rounded-md inline-flex items-center justify-center transition",
              "text-slate-500 hover:text-[#319ED8] hover:bg-[#319ED8]/5",
              "focus-visible:opacity-100 transition-opacity",
              triggerVisible
                ? "opacity-100"
                : "opacity-0 group-hover/section:opacity-100",
              editing ? "bg-[#319ED8]/10 text-[#319ED8]" : "",
            ].join(" ")}
            data-testid={`button-section-menu-${bucket}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-10 w-44 rounded-md border border-slate-200 bg-white shadow-md py-1">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setAdding(true);
                }}
                className="w-full text-left px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
                data-testid={`button-menu-add-${bucket}`}
              >
                <UserPlus className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                <span className="flex-1">Add person</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setEditing((v) => !v);
                  setPendingRemoveKey(null);
                }}
                className="w-full text-left px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
                data-testid={`button-menu-edit-${bucket}`}
              >
                {editing ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#319ED8] flex-shrink-0" />
                    <span className="flex-1">Done editing</span>
                  </>
                ) : (
                  <>
                    <Pencil className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    <span className="flex-1">Edit credits</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </header>

      {adding && (
        <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-2">
          <AddPicker
            people={people}
            roles={roles}
            bucket={bucket}
            busy={addMut.isPending}
            onAdd={async (args) => {
              await addMut.mutateAsync(args);
            }}
            onClose={() => setAdding(false)}
          />
        </div>
      )}

      {editing && (
        <p className="mb-2 text-[10.5px] text-slate-500 italic">
          Tap a person's X to remove them from this song. They stay in
          your People list.
        </p>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-4 -mx-1 px-1">
        {cards.map((c) => (
          <PersonColumn
            key={c.key}
            p={c}
            armed={pendingRemoveKey === c.key}
            editing={editing}
            busy={delMut.isPending}
            onRemove={() => handleRemove(c)}
          />
        ))}
        {cards.length === 0 && (
          <div className="text-[11.5px] italic text-slate-400 py-3 px-1">
            No one credited yet.
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── Import dropdown (Muso.ai placeholder, more sources later) ───── */

function ImportMenu() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onClick = () => setOpen(false);
    const t = setTimeout(() => window.addEventListener("click", onClick), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        data-testid="button-import-credits-menu"
      >
        <Download className="h-3.5 w-3.5" />
        Import
        <ChevronDown className="h-3 w-3 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 w-44 rounded-md border border-slate-200 bg-white shadow-md py-1">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              toast({
                title: "Muso.ai import — coming soon",
                description:
                  "Connect a Muso.ai project and pull writers, performers, and aliases.",
              });
            }}
            className="w-full text-left px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
            data-testid="button-import-muso"
          >
            From Muso.ai
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Top-level panel ─────────────────────────────────────────────── */

export default function TrackCreditsPanel({
  songId,
  albumId,
  credits,
}: {
  songId: string;
  albumId: string;
  credits: { writers: WriterRow[]; performers: PerformerRow[] } | null;
}) {
  const { data: people = [] } = useQuery<AdminPersonLite[]>({
    queryKey: ["/api/people"],
  });
  const { data: roles = [] } = useQuery<AdminCreditRole[]>({
    queryKey: ["/api/admin/credit-roles"],
  });

  const cards = useMemo(() => {
    const writers = (credits?.writers ?? []).map((w) => ({
      ...w,
      _kind: "writer" as const,
    }));
    const performers = (credits?.performers ?? []).map((p) => ({
      ...p,
      _kind: "performer" as const,
    }));
    const all = [...writers, ...performers];

    const buckets: Record<Bucket, Map<string, PersonCard>> = {
      song: new Map(),
      performance: new Map(),
      production: new Map(),
    };

    for (const item of all) {
      const bucket = bucketFor(item._kind, item.role);
      const key =
        item.personId ?? `name:${item.name.trim().toLowerCase()}`;
      let card = buckets[bucket].get(key);
      if (!card) {
        card = {
          key,
          personId: item.personId,
          name: item.person?.name ?? item.name,
          photoUrl: item.person?.photoUrl ?? null,
          rows: [],
        };
        buckets[bucket].set(key, card);
      }
      card.rows.push({ id: item.id, kind: item._kind, role: item.role });
    }

    return {
      song: Array.from(buckets.song.values()),
      performance: Array.from(buckets.performance.values()),
      production: Array.from(buckets.production.values()),
    };
  }, [credits]);

  return (
    <div className="px-5 pb-4" data-testid={`panel-track-credits-${songId}`}>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-end mb-2">
          <ImportMenu />
        </div>

        <div className="divide-y divide-slate-100">
          {(["song", "performance", "production"] as Bucket[]).map(
            (bucket, i) => (
              <div key={bucket} className={i === 0 ? "pb-4" : "py-4 last:pb-0"}>
                <Section
                  bucket={bucket}
                  cards={cards[bucket]}
                  songId={songId}
                  albumId={albumId}
                  people={people}
                  roles={roles}
                />
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
