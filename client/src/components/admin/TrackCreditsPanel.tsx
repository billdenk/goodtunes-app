import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import { ExpandedPanelHeaderSlotContext } from "@/pages/AdminAlbum";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Download,
  Guitar,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AddEntityButton } from "@/components/admin/AddEntityButton";
import { RecentsRail } from "@/components/admin/RecentsRail";
import {
  pushRecentPerson,
  usePersonCreditRecents,
} from "@/hooks/usePersonCreditRecents";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/Spinner";
import { GearPicker, AccessoryTypeField } from "@/components/admin/PersonGearManager";

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
type AdminInstrumentLite = {
  id: string;
  name: string;
  category?: string | null;
  // Closed bucket ("Guitar"/"Bass"/…); drives accessory-type suggestions.
  // `category` can be a free-text body/build descriptor that the suggestion
  // map doesn't key on, so prefer shortCategory when present.
  shortCategory?: string | null;
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
  rows: Array<{
    id: string;
    kind: "writer" | "performer";
    role: string;
    // Performer rows only — null for writers. The instrument USED on this
    // track (e.g. "1973 Martin D-28") and any tuning / setup note ("Open D").
    instrument: { id: string; name: string } | null;
    tuningNotes: string | null;
  }>;
};

function PersonColumn({
  p,
  albumId,
  songId,
  armed,
  editing,
  busy,
  onRemove,
}: {
  p: PersonCard;
  albumId: string;
  songId: string;
  armed: boolean;
  editing: boolean;
  busy: boolean;
  onRemove: () => void;
}) {
  // Cross-section deep link: tapping a credited person jumps to their
  // /admin/people/:id page with `?from=album&albumId=…&trackId=…` so the
  // smart back crumb (see useSmartBackCrumb) returns to this album with
  // the originating track already expanded and scrolled into view, and
  // the breadcrumb reads `<Album> › <Track> › <Person>`. Mirrors the same
  // pattern used from gear and vendors. Unlinked snapshot rows
  // (personId === null) stay as plain text — there's no record to land on.
  const linkHref = p.personId
    ? `/admin/people/${p.personId}?from=album&albumId=${albumId}&trackId=${songId}`
    : null;
  return (
    <div
      className="flex w-[96px] shrink-0 flex-col items-center text-center"
      data-testid={`person-card-${p.key}`}
    >
      <div className="relative">
        {linkHref && !editing ? (
          <Link
            href={linkHref}
            className={[
              "flex h-14 w-14 items-center justify-center overflow-hidden rounded-full text-[13px] font-semibold transition hover:ring-2 hover:ring-slate-300",
              p.photoUrl ? "bg-slate-100" : "bg-slate-200 text-slate-600",
            ].join(" ")}
            data-testid={`link-person-avatar-${p.key}`}
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
          </Link>
        ) : (
          <div
            className={[
              "flex h-14 w-14 items-center justify-center overflow-hidden rounded-full text-[13px] font-semibold transition",
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
        )}
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
      {linkHref && !editing ? (
        <Link
          href={linkHref}
          className="mt-2 text-[12.5px] font-semibold leading-tight text-slate-900 hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
          data-testid={`link-person-name-${p.key}`}
        >
          {p.name}
        </Link>
      ) : (
        <div className="mt-2 text-[12.5px] font-semibold leading-tight text-slate-900">
          {p.name}
        </div>
      )}
      <div className="mt-0.5 space-y-0 text-[11.5px] leading-snug text-slate-500">
        {p.rows.map((r) => {
          const hasExtra = !!r.instrument || !!r.tuningNotes;
          return (
            <div key={r.id} className={hasExtra ? "pt-0.5 first:pt-0" : ""}>
              <div>{r.role}</div>
              {r.instrument && (
                <div
                  className="italic text-slate-600"
                  data-testid={`text-credit-instrument-${r.id}`}
                >
                  {r.instrument.name}
                </div>
              )}
              {r.tuningNotes && (
                <div
                  className="text-[10.5px] text-slate-400"
                  data-testid={`text-credit-tuning-${r.id}`}
                >
                  {r.tuningNotes}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Inline "Add gear from a URL" mini-form ─────────────────────── */

/**
 * Tiny URL-ingest row that mirrors the Gear admin's product-URL scraper
 * (Carter Vintage, Reverb, Sweetwater, Martin, Gibson…). Lets the admin
 * create a brand new instrument without leaving the credits picker.
 *
 * Flow: POST /api/admin/instruments/scrape (reads OG + JSON-LD, rehosts
 * hero image) → POST /api/admin/instruments (creates the row with the
 * prefilled fields) → invalidate /api/instruments → auto-select the new
 * id back in the parent.
 */
function AddInstrumentFromUrl({
  onCreated,
}: {
  onCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    const u = url.trim();
    if (!u) return;
    setBusy(true);
    setErr(null);
    try {
      const scrapeRes = await apiRequest(
        "POST",
        "/api/admin/instruments/scrape",
        { url: u },
      );
      const data = await scrapeRes.json();
      const name = (data?.name || "").toString().trim();
      if (!name) {
        throw new Error(
          "Couldn't read a product name from that page. Try a different URL.",
        );
      }
      // Server requires `category` — fall back to a generic when the
      // page didn't expose one. Admin can refine it later in the Gear
      // editor; the credit row itself only stores instrumentId.
      const category =
        (data?.category && String(data.category).trim()) || "Instrument";
      const createRes = await apiRequest("POST", "/api/admin/instruments", {
        name,
        category,
        photoUrl: data?.photoUrl || null,
        about: data?.description || null,
      });
      const created = (await createRes.json()) as { id: string; name: string };
      await queryClient.invalidateQueries({ queryKey: ["/api/instruments"] });
      onCreated(created.id);
      setUrl("");
      toast({
        title: "Added to gear",
        description: `${created.name} — selected on this credit.`,
      });
    } catch (e: any) {
      // apiRequest throws "<status>: <body>" — pull a clean `message`
      // out of the JSON body when present so the admin doesn't see raw
      // JSON ("400: {\"message\":\"…\"}") in the error row.
      const raw = e?.message || "";
      let msg = raw || "Couldn't read that page.";
      const m = raw.match(/^\d+:\s*(.+)$/s);
      if (m) {
        try {
          const parsed = JSON.parse(m[1]);
          if (parsed?.message) msg = String(parsed.message);
        } catch {
          msg = m[1];
        }
      }
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-dashed border-slate-200 bg-[#f7fbff] px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500 flex-shrink-0">
          Add from URL
        </span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              go();
            }
          }}
          placeholder="Paste a product URL…"
          className="flex-1 min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/30"
          disabled={busy}
          aria-label="Product URL to scrape into gear"
          data-testid="input-add-gear-url"
        />
        <button
          type="button"
          onClick={go}
          disabled={busy || !url.trim()}
          className="rounded-md bg-[var(--brand-blue)] px-2 py-1 text-[12px] font-semibold text-white shadow-sm hover:bg-[#2789bd] disabled:opacity-40 inline-flex items-center gap-1"
          data-testid="button-add-gear-url"
        >
          <Plus className="h-3 w-3" strokeWidth={2.5} />
          {busy ? "Reading…" : "Add"}
        </button>
      </div>
      {err && (
        <p
          className="mt-1 text-[11px] text-red-600"
          role="alert"
          aria-live="polite"
          data-testid="text-add-gear-error"
        >
          {err}
        </p>
      )}
    </div>
  );
}

/* ─── Searchable Add picker (person + role) ──────────────────────── */

function AddPicker({
  people,
  lineupPeople,
  roles,
  instruments,
  bucket,
  busy,
  onAdd,
  onClose,
}: {
  people: AdminPersonLite[];
  lineupPeople: AdminPersonLite[];
  roles: AdminCreditRole[];
  instruments: AdminInstrumentLite[];
  bucket: Bucket;
  busy: boolean;
  onAdd: (args: {
    personId: string | null;
    name: string;
    role: string;
    kind: "writer" | "performer";
    instrumentId: string | null;
    tuningNotes: string | null;
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
  // Instrument + tuning are only relevant when the chosen role is a
  // performer-kind role (Vocals, Guitar, Engineer, …). Writer-kind roles
  // (Composer, Lyricist, Producer) ignore these fields.
  const [instrumentId, setInstrumentId] = useState<string>("");
  const [tuningNotes, setTuningNotes] = useState<string>("");

  const currentRole = validRoles.find((r) => r.id === pickedRoleId);
  const showInstrumentFields = currentRole?.kind === "performer";

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
  // Task #448 — lineup members are also part of the search universe so
  // a freshly-added member is reachable even if /api/people hasn't
  // refetched yet. Merge by id; people wins (richer record).
  const searchUniverse = useMemo(() => {
    const byId = new Map<string, AdminPersonLite>();
    for (const p of lineupPeople) byId.set(p.id, p);
    for (const p of people) byId.set(p.id, p);
    return Array.from(byId.values());
  }, [people, lineupPeople]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as AdminPersonLite[];
    return searchUniverse
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [searchUniverse, query]);
  const recents = usePersonCreditRecents();

  const commit = async () => {
    const role = validRoles.find((r) => r.id === pickedRoleId);
    if (!role) return;
    if (picked) {
      await onAdd({
        personId: picked.id,
        name: picked.name,
        role: role.name,
        kind: role.kind,
        instrumentId: role.kind === "performer" && instrumentId ? instrumentId : null,
        tuningNotes:
          role.kind === "performer" && tuningNotes.trim()
            ? tuningNotes.trim()
            : null,
      });
    } else if (query.trim()) {
      await onAdd({
        personId: null,
        name: query.trim(),
        role: role.name,
        kind: role.kind,
        instrumentId: role.kind === "performer" && instrumentId ? instrumentId : null,
        tuningNotes:
          role.kind === "performer" && tuningNotes.trim()
            ? tuningNotes.trim()
            : null,
      });
    }
  };

  return (
    <div
      className="w-full"
      onClick={(e) => e.stopPropagation()}
      data-testid="add-credit-picker"
    >
      {!picked && !query && lineupPeople.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            From the album lineup
          </div>
          <div
            className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
            data-testid="rail-lineup-people"
          >
            {lineupPeople.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPicked(p);
                  setQuery("");
                }}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/5"
                data-testid={`button-lineup-person-${p.id}`}
              >
                <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-slate-200 font-semibold text-slate-600 leading-none">
                  {p.photoUrl ? (
                    <img
                      src={p.photoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    initials(p.name)
                  )}
                </span>
                <span className="whitespace-nowrap">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!picked && !query && recents.length > 0 && (
        <div className="mb-2">
          <RecentsRail
            recents={recents}
            onPick={(p) => {
              const existing = searchUniverse.find((person) => person.id === p.id);
              setPicked(
                existing ?? ({
                  id: p.id,
                  name: p.name,
                  photoUrl: p.photoUrl,
                } as AdminPersonLite),
              );
              setQuery("");
            }}
            testIdPrefix="recent-track-person"
          />
        </div>
      )}
      <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white border border-[var(--brand-blue)] ring-2 ring-[var(--brand-blue)]/20">
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

      {!picked && query && (
        <div className="mt-1.5 rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
          {matches.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPicked(p);
                setQuery("");
              }}
              className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[12.5px] text-slate-700 hover:bg-[var(--brand-blue)]/5"
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
                className="flex w-full items-center gap-2 border-t border-slate-100 bg-slate-50 px-2.5 py-1.5 text-left text-[12px] font-medium text-[var(--brand-blue)]"
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
          className="flex-1 min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/30"
          data-testid="select-credit-role"
        >
          {validRoles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <AddEntityButton
          label="Add"
          onClick={commit}
          disabled={
            busy ||
            (!picked && !query.trim()) ||
            !pickedRoleId
          }
          testId="button-commit-add-credit"
        />
      </div>

      {showInstrumentFields && (
        <div className="mt-2 space-y-2 rounded-md bg-white border border-slate-200 px-2 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 flex-shrink-0">
              Instrument
            </span>
            <select
              value={instrumentId}
              onChange={(e) => setInstrumentId(e.target.value)}
              className="flex-1 min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/30"
              data-testid="select-credit-instrument"
            >
              <option value="">— None on file —</option>
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.category ? ` · ${i.category}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 flex-shrink-0">
              Tuning / setup
            </span>
            <input
              value={tuningNotes}
              onChange={(e) => setTuningNotes(e.target.value)}
              placeholder='e.g. Open D, capo II'
              className="flex-1 min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/30"
              data-testid="input-credit-tuning"
            />
          </div>
          {/* Inline "Add gear from a URL" — same flow the Gear admin uses
              (POST /api/admin/instruments/scrape → POST /api/admin/instruments)
              so the admin can stay in the credits picker instead of
              context-switching to /admin/instruments to create a row and
              come back. The newly created row is auto-selected. */}
          <AddInstrumentFromUrl onCreated={(id) => setInstrumentId(id)} />
          <p className="text-[10.5px] text-slate-400 leading-tight">
            Both optional. Don't see the gear? Paste a product URL above
            (Carter Vintage, Reverb, Sweetwater, Martin, Gibson…) and
            we'll add it for you.
          </p>
        </div>
      )}
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
  lineupPeople,
  roles,
  instruments,
}: {
  bucket: Bucket;
  cards: PersonCard[];
  songId: string;
  albumId: string;
  people: AdminPersonLite[];
  lineupPeople: AdminPersonLite[];
  roles: AdminCreditRole[];
  instruments: AdminInstrumentLite[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingRemoveKey, setPendingRemoveKey] = useState<string | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Task #448 — credits ↔ lineup is bidirectional. After any per-track
  // credit add/remove also refetch the album's roll-up suggestion and
  // the surfaced lineup so the AlbumLineupPanel "+N from credits" badge
  // and the picker's lineup rail stay in sync without a page reload.
  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["/api/albums", albumId, "credits"] }),
      qc.invalidateQueries({
        queryKey: ["/api/admin/albums", albumId, "lineup", "suggest"],
      }),
      qc.invalidateQueries({ queryKey: ["/api/albums", albumId, "lineup"] }),
    ]);
  };

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
      instrumentId: string | null;
      tuningNotes: string | null;
    }) => {
      const url =
        args.kind === "writer"
          ? `/api/admin/songs/${songId}/writers`
          : `/api/admin/songs/${songId}/performers`;
      // Writers ignore instrument/tuning; performers carry them through.
      const body: Record<string, unknown> = {
        personId: args.personId,
        name: args.name,
        role: args.role,
      };
      if (args.kind === "performer") {
        body.instrumentId = args.instrumentId;
        body.tuningNotes = args.tuningNotes;
      }
      const res = await apiRequest("POST", url, body);
      let created: any = null;
      try {
        created = await res.json();
      } catch {
        // some endpoints may return no body
      }
      return created;
    },
    onSuccess: async (created, args) => {
      // Push onto the session-scoped Recents rail so the next picker
      // open surfaces this person as a one-tap re-credit. Use the
      // server-assigned id for guest names (personId was null on input).
      const id =
        args.personId ??
        created?.personId ??
        created?.person?.id ??
        created?.id ??
        null;
      if (id) {
        pushRecentPerson({
          id,
          name: args.name,
          photoUrl: created?.person?.photoUrl ?? null,
        });
      }
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
          <span className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--brand-blue)]">
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
              "text-slate-500 hover:text-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/5",
              "focus-visible:opacity-100 transition-opacity",
              triggerVisible
                ? "opacity-100"
                : "opacity-0 group-hover/section:opacity-100",
              editing ? "bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]" : "",
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
                    <Check className="h-3.5 w-3.5 text-[var(--brand-blue)] flex-shrink-0" />
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
            lineupPeople={lineupPeople}
            roles={roles}
            instruments={instruments}
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
            albumId={albumId}
            songId={songId}
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

/* ─── Dropbox credits importer dialog ──────────────────────────────── */

type ParsedRow = {
  kind: "writer" | "performer";
  name: string;
  personId: string | null;
  matchStatus: "exact" | "ambiguous" | "new";
  role: string;
  instrumentHint: string | null;
};

type EditableRow = ParsedRow & {
  // Stable local id so React keys stay stable as the operator
  // edits/removes rows before saving.
  _key: string;
  instrumentId: string | null;
  tuningNotes: string;
  // What bucket this row will land in once saved (computed from role).
  bucket: Bucket;
};

function DropboxCreditsImportDialog({
  open,
  onOpenChange,
  songId,
  albumId,
  people,
  roles,
  instruments,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  songId: string;
  albumId: string;
  people: AdminPersonLite[];
  roles: AdminCreditRole[];
  instruments: AdminInstrumentLite[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [rows, setRows] = useState<EditableRow[] | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset state whenever the dialog closes so opening it again is a
  // clean slate. Keeps the URL field empty between sessions.
  useEffect(() => {
    if (!open) {
      setUrl("");
      setParsing(false);
      setParseError(null);
      setFilename(null);
      setRows(null);
      setSaving(false);
    }
  }, [open]);

  const writerRoleNames = useMemo(
    () => roles.filter((r) => r.kind === "writer").map((r) => r.name),
    [roles],
  );
  const performerRoleNames = useMemo(
    () => roles.filter((r) => r.kind === "performer").map((r) => r.name),
    [roles],
  );

  async function runParse() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setParsing(true);
    setParseError(null);
    setRows(null);
    setFilename(null);
    try {
      const res = await apiRequest(
        "POST",
        `/api/admin/songs/${songId}/import-credits-from-dropbox`,
        { dropboxUrl: trimmed },
      );
      const data = (await res.json()) as {
        filename: string;
        rows: ParsedRow[];
      };
      setFilename(data.filename);
      // Snap each LLM-emitted name to an existing Person when one
      // matches exactly — the backend already did this, but if a new
      // role appears for a person whose name spelling is in the People
      // list we also catch it client-side.
      const byNameLower = new Map(
        people.map((p) => [p.name.toLowerCase(), p] as const),
      );
      const editable: EditableRow[] = data.rows.map((r, i) => {
        const localMatch =
          r.personId == null
            ? byNameLower.get(r.name.toLowerCase()) ?? null
            : null;
        return {
          ...r,
          _key: `r${i}`,
          personId: r.personId ?? localMatch?.id ?? null,
          matchStatus: localMatch ? "exact" : r.matchStatus,
          instrumentId: null,
          tuningNotes: "",
          bucket: bucketFor(r.kind, r.role),
        };
      });
      setRows(editable);
      if (editable.length === 0) {
        setParseError("The AI didn't find any credit rows in that file.");
      }
    } catch (e: any) {
      const raw = e?.message || "Couldn't read that link.";
      let msg = raw;
      const m = raw.match(/^\d+:\s*(.+)$/s);
      if (m) {
        try {
          const parsed = JSON.parse(m[1]);
          if (parsed?.message) msg = String(parsed.message);
        } catch {
          msg = m[1];
        }
      }
      setParseError(msg);
    } finally {
      setParsing(false);
    }
  }

  function updateRow(key: string, patch: Partial<EditableRow>) {
    setRows((prev) =>
      (prev ?? []).map((r) => {
        if (r._key !== key) return r;
        const next = { ...r, ...patch };
        // Re-bucket if role changed.
        if (patch.role !== undefined) {
          next.bucket = bucketFor(next.kind, next.role);
        }
        return next;
      }),
    );
  }

  function removeRow(key: string) {
    setRows((prev) => (prev ?? []).filter((r) => r._key !== key));
  }

  async function saveAll() {
    if (!rows || rows.length === 0) return;
    setSaving(true);
    const saved: number[] = [];
    const failed: string[] = [];
    // Sequential POSTs so the per-bucket `position` count from the
    // server stays consistent — concurrent inserts would race on
    // position and reorder rows unpredictably.
    for (const r of rows) {
      try {
        const url =
          r.kind === "writer"
            ? `/api/admin/songs/${songId}/writers`
            : `/api/admin/songs/${songId}/performers`;
        const body: Record<string, unknown> = {
          personId: r.personId,
          name: r.name,
          role: r.role,
        };
        if (r.kind === "performer") {
          body.instrumentId = r.instrumentId;
          body.tuningNotes = r.tuningNotes.trim() ? r.tuningNotes.trim() : null;
        }
        await apiRequest("POST", url, body);
        saved.push(1);
      } catch (e: any) {
        failed.push(`${r.name} (${r.role}): ${e?.message || "save failed"}`);
      }
    }
    await qc.invalidateQueries({
      queryKey: ["/api/albums", albumId, "credits"],
    });
    // Task #193 — newly imported per-track performers feed the
    // AlbumLineupPanel's "Use N from credits" proposal.
    await qc.invalidateQueries({
      queryKey: ["/api/admin/albums", albumId, "lineup", "suggest"],
    });
    setSaving(false);
    if (failed.length === 0) {
      toast({
        title: `Saved ${saved.length} credit${saved.length === 1 ? "" : "s"}`,
        description: filename ? `Imported from ${filename}` : undefined,
      });
      onOpenChange(false);
    } else {
      toast({
        title: `${saved.length} saved · ${failed.length} failed`,
        description: failed.slice(0, 3).join(" • "),
        variant: "destructive",
      });
    }
  }

  const rowsByBucket = useMemo(() => {
    const out: Record<Bucket, EditableRow[]> = {
      song: [],
      performance: [],
      production: [],
    };
    for (const r of rows ?? []) out[r.bucket].push(r);
    return out;
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl max-h-[85vh] overflow-y-auto"
        data-testid="dialog-import-credits-dropbox"
      >
        <DialogHeader>
          <DialogTitle>Import credits from Dropbox</DialogTitle>
          <DialogDescription>
            Paste a Dropbox link to a credits doc (PDF, Word, .txt, .md) or to a
            folder of per-track docs. For a folder we'll pick the file whose
            name matches this song's title. Nothing saves until you click{" "}
            <strong>Save credits</strong> below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="dropbox-credits-url">Dropbox link</Label>
          <div className="flex gap-2">
            <Input
              id="dropbox-credits-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !parsing && url.trim()) {
                  e.preventDefault();
                  runParse();
                }
              }}
              placeholder="https://www.dropbox.com/…"
              disabled={parsing || saving}
              data-testid="input-dropbox-credits-url"
            />
            <Button
              type="button"
              onClick={runParse}
              disabled={parsing || saving || !url.trim()}
              data-testid="button-parse-dropbox-credits"
            >
              {parsing ? <Spinner className="h-4 w-4" /> : "Read"}
            </Button>
          </div>
          {filename && !parsing && (
            <p
              className="text-[12px] text-slate-500"
              data-testid="text-dropbox-credits-filename"
            >
              Reading <span className="font-medium text-slate-700">{filename}</span>
            </p>
          )}
          {parseError && (
            <div
              className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700"
              role="alert"
              data-testid="text-dropbox-credits-error"
            >
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}
        </div>

        {rows && rows.length > 0 && (
          <div className="space-y-4">
            {(["song", "performance", "production"] as Bucket[]).map((b) => {
              const bucketRows = rowsByBucket[b];
              if (bucketRows.length === 0) return null;
              const optionsForBucket = roles
                .filter((r) => bucketFor(r.kind, r.name) === b)
                .map((r) => r.name);
              return (
                <section
                  key={b}
                  data-testid={`dropbox-credits-bucket-${b}`}
                  className="rounded-md border border-slate-200 bg-slate-50/50"
                >
                  <header className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    {BUCKET_TITLE[b]} ({bucketRows.length})
                  </header>
                  <ul className="divide-y divide-slate-200">
                    {bucketRows.map((r) => (
                      <DropboxRowEditor
                        key={r._key}
                        row={r}
                        people={people}
                        instruments={instruments}
                        roleOptions={
                          optionsForBucket.length > 0
                            ? optionsForBucket
                            : r.kind === "writer"
                              ? writerRoleNames
                              : performerRoleNames
                        }
                        onChange={(patch) => updateRow(r._key, patch)}
                        onRemove={() => removeRow(r._key)}
                        disabled={saving}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            data-testid="button-cancel-import-dropbox"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={saveAll}
            disabled={saving || !rows || rows.length === 0}
            data-testid="button-save-import-dropbox"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="h-4 w-4" /> Saving…
              </span>
            ) : (
              `Save ${rows?.length ?? 0} credit${(rows?.length ?? 0) === 1 ? "" : "s"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DropboxRowEditor({
  row,
  people,
  instruments,
  roleOptions,
  onChange,
  onRemove,
  disabled,
}: {
  row: EditableRow;
  people: AdminPersonLite[];
  instruments: AdminInstrumentLite[];
  roleOptions: string[];
  onChange: (patch: Partial<EditableRow>) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  // Person picker is a datalist-backed input: typing snaps to an
  // existing Person when the spelling matches, otherwise the name is
  // stored verbatim and the backend creates it as a guest credit.
  const matchedPerson = row.personId
    ? people.find((p) => p.id === row.personId) ?? null
    : null;

  function onNameChange(next: string) {
    const hit = people.find(
      (p) => p.name.toLowerCase() === next.trim().toLowerCase(),
    );
    onChange({
      name: next,
      personId: hit ? hit.id : null,
      matchStatus: hit ? "exact" : "new",
    });
  }

  return (
    <li
      className="px-3 py-2.5 grid gap-2 sm:grid-cols-[1fr,140px,auto] items-start"
      data-testid={`dropbox-credit-row-${row._key}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            list={`people-list-${row._key}`}
            value={row.name}
            onChange={(e) => onNameChange(e.target.value)}
            disabled={disabled}
            placeholder="Person's name"
            className="flex-1 min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12.5px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#319ED8]/30"
            data-testid={`input-credit-name-${row._key}`}
          />
          <datalist id={`people-list-${row._key}`}>
            {people.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </div>
        <div className="mt-1 text-[10.5px] leading-tight">
          {matchedPerson ? (
            <span className="text-emerald-700">
              ✓ Matched {matchedPerson.name}
            </span>
          ) : row.matchStatus === "ambiguous" ? (
            <span className="text-amber-700">
              Multiple matches — confirm or retype
            </span>
          ) : (
            <span className="text-slate-500">
              Will add as guest "{row.name}"
            </span>
          )}
        </div>
        {row.kind === "performer" && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <select
              value={row.instrumentId ?? ""}
              onChange={(e) =>
                onChange({ instrumentId: e.target.value || null })
              }
              disabled={disabled}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11.5px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#319ED8]/30"
              data-testid={`select-credit-instrument-${row._key}`}
            >
              <option value="">
                {row.instrumentHint
                  ? `Instrument — hint: ${row.instrumentHint}`
                  : "Instrument — none on file"}
              </option>
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.category ? ` · ${i.category}` : ""}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={row.tuningNotes}
              onChange={(e) => onChange({ tuningNotes: e.target.value })}
              disabled={disabled}
              placeholder="Tuning / setup (optional)"
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11.5px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#319ED8]/30"
              data-testid={`input-credit-tuning-${row._key}`}
            />
          </div>
        )}
      </div>
      <select
        value={row.role}
        onChange={(e) => onChange({ role: e.target.value })}
        disabled={disabled}
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#319ED8]/30"
        data-testid={`select-credit-role-${row._key}`}
      >
        {roleOptions.includes(row.role) ? null : (
          <option value={row.role}>{row.role}</option>
        )}
        {roleOptions.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40"
        aria-label="Remove this row"
        data-testid={`button-remove-credit-row-${row._key}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

/* ─── Import dropdown (Dropbox + Muso.ai placeholder) ──────────────── */

/* Renders the Import dropdown INTO the ExpandedPanel header slot (left
   of the chevron), matching the same portal pattern PreviewTrim's Reset
   button uses. Falls back to nothing if rendered outside an
   ExpandedPanel context. */
function ImportMenu({
  songId,
  albumId,
  people,
  roles,
  instruments,
}: {
  songId: string;
  albumId: string;
  people: AdminPersonLite[];
  roles: AdminCreditRole[];
  instruments: AdminInstrumentLite[];
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [dropboxOpen, setDropboxOpen] = useState(false);
  const headerSlot = useContext(ExpandedPanelHeaderSlotContext);

  useEffect(() => {
    if (!open) return;
    const onClick = () => setOpen(false);
    const t = setTimeout(() => window.addEventListener("click", onClick), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", onClick);
    };
  }, [open]);

  if (!headerSlot) return null;

  return (
    <>
      {createPortal(
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            data-testid="button-import-credits-menu"
          >
            <Download className="h-3.5 w-3.5" />
            Import
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-md border border-slate-200 bg-white shadow-md py-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setDropboxOpen(true);
                }}
                className="w-full text-left px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
                data-testid="button-import-dropbox"
              >
                From Dropbox link
              </button>
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
        </div>,
        headerSlot,
      )}
      <DropboxCreditsImportDialog
        open={dropboxOpen}
        onOpenChange={setDropboxOpen}
        songId={songId}
        albumId={albumId}
        people={people}
        roles={roles}
        instruments={instruments}
      />
    </>
  );
}

/* ─── Rig builder + attach ────────────────────────────────────────── */

// `instrumentId` links an accessory line to a row in the gear catalog
// (picked or scraped via GearPicker). `null` = legacy free-text value.
type RigAccessoryDraft = { type: string; value: string; instrumentId: string | null };
type RigDetailLite = {
  id: string;
  name: string;
  instrumentId: string | null;
  notes: string | null;
  accessories: { id?: string; type: string; value: string; instrumentId?: string | null }[];
  instrument: { id: string; name: string; photoUrl?: string | null } | null;
};
type TrackRigRow = {
  id: string;
  songId: string;
  rigId: string | null;
  rigName: string | null;
  tweakNote: string | null;
  rig: RigDetailLite | null;
};

function RigPanel({
  songId,
  albumId,
  instruments,
}: {
  songId: string;
  albumId: string;
  instruments: AdminInstrumentLite[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: attached = [], isLoading } = useQuery<TrackRigRow[]>({
    queryKey: ["/api/songs", songId, "rigs"],
    queryFn: async () => {
      const r = await fetch(`/api/songs/${songId}/rigs`);
      if (!r.ok) return [];
      return r.json();
    },
  });
  const { data: allRigs = [] } = useQuery<RigDetailLite[]>({
    queryKey: ["/api/rigs"],
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/songs", songId, "rigs"] });
    qc.invalidateQueries({ queryKey: ["/api/rigs"] });
    qc.invalidateQueries({ queryKey: ["/api/albums", albumId, "credits"] });
  };

  // Build-a-rig form state.
  const [building, setBuilding] = useState(false);
  const [name, setName] = useState("");
  const [instrumentId, setInstrumentId] = useState("");
  const [notes, setNotes] = useState("");
  const [accessories, setAccessories] = useState<RigAccessoryDraft[]>([]);

  const pickedInstrument =
    instruments.find((i) => i.id === instrumentId) ?? null;
  const accessoryCategory =
    pickedInstrument?.shortCategory ?? pickedInstrument?.category ?? null;

  const resetBuilder = () => {
    setName("");
    setInstrumentId("");
    setNotes("");
    setAccessories([]);
    setBuilding(false);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const cleanAcc = accessories
        .filter((a) => a.type.trim() && a.value.trim())
        .map((a) => ({
          type: a.type.trim(),
          value: a.value.trim(),
          // Keep the catalog link or it's silently stripped on save.
          instrumentId: a.instrumentId ?? null,
        }));
      const res = await apiRequest("POST", "/api/admin/rigs", {
        name: name.trim(),
        instrumentId: instrumentId || null,
        notes: notes.trim() || null,
        accessories: cleanAcc,
      });
      const rig = await res.json();
      await apiRequest("POST", `/api/admin/songs/${songId}/rigs`, {
        rigId: rig.id,
      });
      return rig;
    },
    onSuccess: () => {
      invalidate();
      resetBuilder();
      toast({ description: "Rig built and attached to this track." });
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        description: e instanceof Error ? e.message : "Could not build rig",
      }),
  });

  // Attach-an-existing-rig state.
  const [attachRigId, setAttachRigId] = useState("");
  const [tweakNote, setTweakNote] = useState("");
  const attachMut = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/admin/songs/${songId}/rigs`, {
        rigId: attachRigId,
        tweakNote: tweakNote.trim() || null,
      });
    },
    onSuccess: () => {
      invalidate();
      setAttachRigId("");
      setTweakNote("");
      toast({ description: "Rig attached to this track." });
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        description: e instanceof Error ? e.message : "Could not attach rig",
      }),
  });

  const detachMut = useMutation({
    mutationFn: async (trackRigId: string) => {
      await apiRequest("DELETE", `/api/admin/track-rigs/${trackRigId}`);
    },
    onSuccess: () => {
      invalidate();
      toast({ description: "Rig removed from this track." });
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        description: e instanceof Error ? e.message : "Could not remove rig",
      }),
  });

  const attachedRigIds = new Set(
    attached.map((a) => a.rigId).filter(Boolean) as string[],
  );
  const attachable = allRigs.filter((r) => !attachedRigIds.has(r.id));

  const selectCls =
    "h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40";

  return (
    <section
      data-testid={`section-rigs-${songId}`}
      className="rounded-xl border border-slate-200 bg-white px-4 py-4 mt-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Guitar className="w-4 h-4 text-slate-400" />
        <h3 className="text-sm font-bold text-slate-900">Rigs</h3>
        <span className="text-xs text-slate-400">
          Named gear bundles played on this track
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
          <Spinner className="h-3.5 w-3.5" /> Loading rigs…
        </div>
      ) : attached.length === 0 ? (
        <p className="text-xs text-slate-400 py-1">
          No rigs attached to this track yet.
        </p>
      ) : (
        <ul className="space-y-2.5" data-testid={`list-track-rigs-${songId}`}>
          {attached.map((tr) => (
            <li
              key={tr.id}
              className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
              data-testid={`track-rig-${tr.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">
                      {tr.rig?.name ?? tr.rigName ?? "Rig"}
                    </span>
                    {tr.rig?.instrument && (
                      <Link
                        href={`/admin/instruments/${tr.rig.instrument.id}`}
                        className="inline-flex items-center gap-1 rounded-full bg-white ring-1 ring-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                        data-testid={`link-rig-instrument-${tr.id}`}
                      >
                        {tr.rig.instrument.photoUrl ? (
                          <img
                            src={tr.rig.instrument.photoUrl}
                            alt=""
                            className="w-3.5 h-3.5 rounded-sm object-cover"
                          />
                        ) : (
                          <Guitar className="w-3 h-3 text-slate-400" />
                        )}
                        {tr.rig.instrument.name}
                      </Link>
                    )}
                  </div>
                  {tr.rig && tr.rig.accessories.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {tr.rig.accessories.map((a, idx) => (
                        <li
                          key={a.id ?? idx}
                          className="inline-flex items-center gap-1 rounded-full bg-white ring-1 ring-slate-200 px-2 py-0.5 text-xs text-slate-600"
                        >
                          <span className="font-semibold text-slate-500">
                            {a.type}
                          </span>
                          <span>{a.value}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {tr.tweakNote && (
                    <p className="mt-1.5 text-xs text-slate-500 italic">
                      “{tr.tweakNote}”
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => detachMut.mutate(tr.id)}
                  disabled={detachMut.isPending}
                  className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                  data-testid={`button-detach-rig-${tr.id}`}
                  aria-label="Remove rig from track"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Attach an existing rig */}
      {attachable.length > 0 && (
        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <Label className="text-xs font-semibold text-slate-600">
            Attach an existing rig
          </Label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={attachRigId}
              onChange={(e) => setAttachRigId(e.target.value)}
              className={selectCls}
              data-testid="select-attach-rig"
            >
              <option value="">Choose a rig…</option>
              {attachable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <Input
              value={tweakNote}
              onChange={(e) => setTweakNote(e.target.value)}
              placeholder="Per-track tweak (optional)"
              className="h-9 text-sm"
              data-testid="input-attach-rig-tweak"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => attachMut.mutate()}
              disabled={!attachRigId || attachMut.isPending}
              data-testid="button-attach-rig"
              className="flex-shrink-0"
            >
              {attachMut.isPending ? (
                <Spinner className="h-4 w-4" />
              ) : (
                "Attach"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Build a new rig */}
      <div className="mt-3">
        {!building ? (
          <button
            type="button"
            onClick={() => setBuilding(true)}
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-[var(--brand-blue)] hover:underline"
            data-testid="button-build-rig"
          >
            <Plus className="w-4 h-4" /> Build a new rig
          </button>
        ) : (
          <div className="rounded-lg border border-slate-200 p-3 space-y-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600">
                Rig name
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fernando's Folk Rig"
                className="mt-1 h-9 text-sm"
                data-testid="input-rig-name"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600">
                Base instrument
              </Label>
              <select
                value={instrumentId}
                onChange={(e) => setInstrumentId(e.target.value)}
                className={`${selectCls} mt-1`}
                data-testid="select-rig-instrument"
              >
                <option value="">None</option>
                {instruments.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-600">
                  Accessories
                </Label>
                <button
                  type="button"
                  onClick={() =>
                    setAccessories((a) => [
                      ...a,
                      { type: "", value: "", instrumentId: null },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-blue)] hover:underline"
                  data-testid="button-add-accessory"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
              {accessories.length === 0 ? (
                <p className="mt-1 text-xs text-slate-400">
                  No accessories — add strings, picks, settings, etc.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {accessories.map((a, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <AccessoryTypeField
                        value={a.type}
                        onChange={(next) =>
                          setAccessories((arr) =>
                            arr.map((x, i) =>
                              i === idx ? { ...x, type: next } : x,
                            ),
                          )
                        }
                        shortCategory={accessoryCategory}
                        idBase={`${idx}`}
                        className="sm:w-40"
                      />
                      <div className="flex-1">
                        <GearPicker
                          instruments={instruments}
                          value={{
                            instrumentId: a.instrumentId,
                            text: a.value,
                          }}
                          onChange={(next) =>
                            setAccessories((arr) =>
                              arr.map((x, i) =>
                                i === idx
                                  ? {
                                      ...x,
                                      value: next.text,
                                      instrumentId: next.instrumentId,
                                    }
                                  : x,
                              ),
                            )
                          }
                          onCreated={() =>
                            qc.invalidateQueries({
                              queryKey: ["/api/instruments"],
                            })
                          }
                          categoryHint={
                            pickedInstrument?.shortCategory ??
                            pickedInstrument?.category ??
                            null
                          }
                          idBase={`rig-${idx}`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setAccessories((arr) =>
                            arr.filter((_, i) => i !== idx),
                          )
                        }
                        className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        data-testid={`button-remove-accessory-${idx}`}
                        aria-label="Remove accessory"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600">
                Notes
              </Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional — how this rig is set up"
                className="mt-1 h-9 text-sm"
                data-testid="input-rig-notes"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => createMut.mutate()}
                disabled={!name.trim() || createMut.isPending}
                data-testid="button-save-rig"
              >
                {createMut.isPending ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  "Build & attach"
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={resetBuilder}
                disabled={createMut.isPending}
                data-testid="button-cancel-rig"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
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
  const { data: instruments = [] } = useQuery<AdminInstrumentLite[]>({
    queryKey: ["/api/instruments"],
  });
  // Task #448 — the album's pinned lineup is a first-class source in
  // the per-track Credits picker, alongside recent collaborators. The
  // public /api/albums/:id/lineup endpoint returns the same enriched
  // rows the admin panel uses (memberId + memberName + memberPhotoUrl).
  type AlbumLineupRow = {
    memberId: string;
    memberName: string;
    memberPhotoUrl: string | null;
    roles: string[] | null;
  };
  const { data: albumLineup = [] } = useQuery<AlbumLineupRow[]>({
    queryKey: ["/api/albums", albumId, "lineup"],
    queryFn: async () => {
      const r = await fetch(`/api/albums/${albumId}/lineup`);
      if (!r.ok) return [];
      return r.json();
    },
  });
  const lineupPeople = useMemo<AdminPersonLite[]>(
    () =>
      albumLineup.map((m) => ({
        id: m.memberId,
        name: m.memberName,
        photoUrl: m.memberPhotoUrl,
      })),
    [albumLineup],
  );

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
      // Group by (personId + name-snapshot) so that intentional dual-name
      // credits — Elton John / Reginald Dwight, Ringo / Richard Starkey —
      // render as two cards on the song even after aliasing collapses them
      // to one canonical Person row.
      const display = item.name.trim().toLowerCase();
      const key = item.personId
        ? `id:${item.personId}|${display}`
        : `name:${display}`;
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
      card.rows.push({
        id: item.id,
        kind: item._kind,
        role: item.role,
        instrument: item._kind === "performer" ? item.instrument : null,
        tuningNotes: item._kind === "performer" ? item.tuningNotes : null,
      });
    }

    return {
      song: Array.from(buckets.song.values()),
      performance: Array.from(buckets.performance.values()),
      production: Array.from(buckets.production.values()),
    };
  }, [credits]);

  return (
    <div className="px-5 pt-4 pb-4" data-testid={`panel-track-credits-${songId}`}>
      <ImportMenu
        songId={songId}
        albumId={albumId}
        people={people}
        roles={roles}
        instruments={instruments}
      />
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
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
                  lineupPeople={lineupPeople}
                  instruments={instruments}
                  roles={roles}
                />
              </div>
            ),
          )}
        </div>
      </div>
      <RigPanel songId={songId} albumId={albumId} instruments={instruments} />
    </div>
  );
}
