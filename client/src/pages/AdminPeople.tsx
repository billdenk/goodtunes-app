import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, X, User as UserIcon } from "lucide-react";
import { NewAlbumArtistDialog } from "@/components/admin/NewAlbumArtistDialog";
import { SiSpotify, SiApplemusic } from "react-icons/si";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  ViewModeToggle,
  useViewMode,
} from "@/components/admin/ViewModeToggle";
import { AddEntityButton } from "@/components/admin/AddEntityButton";

/**
 * Admin home · People (Phase 6a).
 *
 * Mirrors AdminAlbums: AdminFrame chrome, search affordance, grid view.
 * People don't have a release lifecycle so there are no tabs — just one
 * scrollable grid of avatar cards. Click → /admin/people/:id.
 *
 * "New person" pops an inline sheet with two paths (Phase 6e):
 *   1. Paste an Apple Music URL → scrape preview (name + photo + bio + a
 *      cover-art row of releases) → confirm → POST /api/admin/people
 *      then PUT /api/admin/people/:id/discography → navigate to the new
 *      person's page.
 *   2. "Add manually" → just a name field. The Person opens with empty
 *      tabs and the admin fills in Photo / Streaming / Discography there.
 */
interface PersonLite {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  labelId: string | null;
  itunesArtistId: string | null;
  spotifyUrl: string | null;
  // null = never scanned, true = scan found candidates (still needs admin
  // pick), false = scan returned zero results. Drives the small badge on
  // the People grid card so admins know who's been searched already.
  spotifyHasMatch: boolean | null;
  // Partner org this person is attached to (press / vendor / label /
  // fulfillment partner / non-profit) when they have no signed label.
  // Drives the People-index subtitle so a Hellbender contact reads
  // "Hellbender Vinyl" instead of "Independent".
  affiliation: { entityKind: string; entityId: string; name: string } | null;
}

interface LabelLite {
  id: string;
  name: string;
}

// Legacy: kept for `ScrapeResponse`-shaped types still referenced by
// other pages (AdminPerson). Not used directly here — the New-person
// composer now goes through `NewAlbumArtistDialog` which owns its own
// scrape types.
interface ScrapedAlbum {
  collectionId: number;
  name: string;
  artworkUrl: string;
  year: number | null;
  trackCount: number | null;
  type: "album" | "EP";
  appleMusicUrl: string | null;
}

interface ScrapeResponse {
  source: "apple" | "spotify" | "unknown";
  name: string | null;
  photoUrl: string | null;
  bio: string | null;
  itunesArtistId: string | null;
  appleMusicUrl: string | null;
  albums?: ScrapedAlbum[];
}

// Intentionally NOT wired to the shared `RecentsRail` /
// `usePersonCreditRecents` pattern used by the song-credit pickers
// (Gear, per-track Add credit, legacy /admin credits sheet). This is
// the People *index* — a navigation grid, not a credit picker — and
// the default expectation is "show me everyone, alphabetised". An
// empty-on-open rail-only state would hide the very list the page
// exists to surface.
export function AdminPeople() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [view, setView] = useViewMode("people");

  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const {
    data: people = [],
    isLoading,
    isError: peopleError,
    error: peopleErrorObj,
    refetch: refetchPeople,
  } = useQuery<PersonLite[]>({
    queryKey: ["/api/people"],
    enabled: !!user?.isAdmin,
  });
  const { data: labels = [] } = useQuery<LabelLite[]>({
    queryKey: ["/api/labels"],
    enabled: !!user?.isAdmin,
  });

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of labels) m.set(l.id, l.name);
    return m;
  }, [labels]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? people.filter((p) => p.name.toLowerCase().includes(q))
      : people.slice();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [people, search]);

  const openPerson = (id: string) => {
    navigate(`/admin/people/${id}`);
  };

  if (authLoading) {
    return (
      <AdminFrame active="people">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }

  if (!user?.isAdmin) {
    return (
      <AdminFrame active="people">
        <div className="py-20 text-center text-slate-500">
          You need to be signed in as an admin to view this page.
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="people">
      {/* Header — uses the shared AdminPageHeader primitive so title /
          subtitle / hairline match Albums and the rest of the admin
          family. Action cluster stays per-page. */}
      <div className="space-y-5">
      <AdminPageHeader
        title="People"
        subtitle="Artists, performers, writers, and producers — the SuperCredits™ catalog."
        actions={(<>
          {searchOpen ? (
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-md px-2.5 h-9">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people"
                className="w-44 text-[13px] bg-transparent outline-none placeholder:text-slate-400"
                data-testid="input-search-people"
              />
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSearchOpen(false);
                }}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Close search"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="h-9 w-9 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center justify-center transition-colors"
              aria-label="Search"
              data-testid="button-open-search"
            >
              <Search className="w-4 h-4" />
            </button>
          )}
          <ViewModeToggle
            value={view}
            onChange={setView}
            testIdPrefix="view-mode-people"
          />
          {/* Matches the Tracks card header on AdminAlbum: denser px-2.5/py-1.5
              chrome, white-outline buttons, so the People index reads as the
              same admin surface family rather than a louder blue CTA. */}
          <AddEntityButton
            label="Add Person"
            onClick={() => setComposerOpen(true)}
            testId="button-new-person"
          />
        </>)}
      />

      {/* Grid */}
      {isLoading ? (
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : peopleError ? (
        <ErrorState
          error={peopleErrorObj}
          onRetry={() => refetchPeople()}
          title="Couldn't load people"
          testId="admin-people-error"
        />
      ) : filtered.length === 0 ? (
        <EmptyState searching={search.trim().length > 0} />
      ) : view === "grid" ? (
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6"
          data-testid="grid-people"
        >
          {filtered.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              labelName={
                (p.labelId ? labelById.get(p.labelId) ?? null : null) ??
                p.affiliation?.name ??
                null
              }
              onOpen={() => openPerson(p.id)}
            />
          ))}
        </div>
      ) : (
        <div
          className="rounded-lg border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100"
          data-testid="list-people"
        >
          {filtered.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              labelName={
                (p.labelId ? labelById.get(p.labelId) ?? null : null) ??
                p.affiliation?.name ??
                null
              }
              onOpen={() => openPerson(p.id)}
            />
          ))}
        </div>
      )}

      {/* Phase 6e+: the People composer now reuses the same dialog the
          album-creation flow uses (`NewAlbumArtistDialog`) in
          `mode="person"`. Single source of truth for the search-first
          flow — local catalog matches first, then Spotify search,
          then Apple-Music linkage on confirm. Picking a local match
          jumps straight to that person's profile (the dialog calls
          `onSelect` immediately with the existing `id`). */}
      <NewAlbumArtistDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        mode="person"
        onSelect={({ id }) => {
          setComposerOpen(false);
          navigate(`/admin/people/${id}`);
        }}
        onSkip={() => setComposerOpen(false)}
      />
      </div>
    </AdminFrame>
  );
}

/**
 * StreamingBadge — small overlay glyph on a person's avatar tile telling
 * the admin which streaming services this person is linked to. Sits
 * half-on / half-off the avatar at ~4:30 (`bottom-[7%] right-[7%]`), the
 * same convention Apple Music uses for "verified" overlays.
 *
 * Priority (only one badge ever renders, max one source of truth):
 *
 *   1. `spotifyUrl` set        → full-color Spotify glyph (#1DB954).
 *      The artist has a confirmed Spotify profile — admin sees the
 *      brand color and knows the row is "done".
 *   2. `itunesArtistId` set    → full-color Apple Music glyph (#FA243C).
 *      Linked on Apple Music but not on Spotify. Common for the
 *      Apple-fallback path in the new-person dialog.
 *   3. `spotifyHasMatch === false` → dim slate-300 Spotify glyph.
 *      We checked Spotify and got zero results. Communicates "we
 *      looked, don't bother looking again" without claiming a link.
 *   4. otherwise (never scanned, no Apple link, no Spotify link)
 *      → no badge.
 *
 * Lives in AdminPeople.tsx for now; promote to client/src/components/admin/
 * if a second surface needs the same vocabulary.
 */
function StreamingBadge({
  person,
  size,
}: {
  person: PersonLite;
  size: "sm" | "md";
}) {
  const dim = size === "md" ? "w-6 h-6" : "w-4 h-4";
  const icon = size === "md" ? "w-3.5 h-3.5" : "w-2.5 h-2.5";

  let glyph: JSX.Element | null = null;
  let title = "";
  let testid = "";

  if (person.spotifyUrl) {
    glyph = <SiSpotify className={`${icon} text-[#1DB954]`} />;
    title = "Linked on Spotify";
    testid = `badge-spotify-linked-${person.id}`;
  } else if (person.itunesArtistId) {
    glyph = <SiApplemusic className={`${icon} text-[#FA243C]`} />;
    title = "Linked on Apple Music";
    testid = `badge-apple-linked-${person.id}`;
  } else if (person.spotifyHasMatch === false) {
    glyph = <SiSpotify className={`${icon} text-slate-300`} />;
    title = "Searched Spotify — no match found";
    testid = `badge-spotify-nomatch-${person.id}`;
  }

  if (!glyph) return null;
  return (
    <div
      className={`absolute bottom-[7%] right-[7%] ${dim} rounded-full bg-white ring-1 ring-slate-200 shadow-sm flex items-center justify-center`}
      title={title}
      data-testid={testid}
    >
      {glyph}
    </div>
  );
}

function PersonCard({
  person,
  labelName,
  onOpen,
}: {
  person: PersonLite;
  labelName: string | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left flex flex-col items-center"
      data-testid={`card-person-${person.id}`}
    >
      <div className="relative w-full aspect-square">
        <div className="w-full h-full rounded-full overflow-hidden bg-[var(--brand-blue)] ring-1 ring-slate-200 shadow-sm group-hover:shadow-md group-hover:ring-[var(--brand-blue)]/30 transition-all">
          {person.photoUrl ? (
            <img
              src={person.photoUrl}
              alt={person.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-white text-3xl font-bold">
                {initialFor(person.name)}
              </span>
            </div>
          )}
        </div>
        <StreamingBadge person={person} size="md" />
      </div>
      <div
        className="mt-3 w-full text-center text-slate-900 text-[13px] font-semibold truncate px-1"
        data-testid={`text-person-name-${person.id}`}
      >
        {person.name}
      </div>
      <div className="w-full text-center text-slate-400 text-[11.5px] truncate px-1">
        {labelName || "Independent"}
      </div>
    </button>
  );
}

function PersonRow({
  person,
  labelName,
  onOpen,
}: {
  person: PersonLite;
  labelName: string | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-slate-50 transition-colors"
      data-testid={`row-person-${person.id}`}
    >
      <div className="relative w-10 h-10 flex-shrink-0">
        <div className="w-full h-full rounded-full overflow-hidden bg-[var(--brand-blue)] ring-1 ring-slate-200">
          {person.photoUrl ? (
            <img
              src={person.photoUrl}
              alt={person.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">
                {initialFor(person.name)}
              </span>
            </div>
          )}
        </div>
        <StreamingBadge person={person} size="sm" />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-slate-900 text-[13.5px] font-semibold truncate group-hover:text-[var(--brand-blue)] transition-colors"
          data-testid={`text-person-name-${person.id}`}
        >
          {person.name}
        </div>
      </div>
      <div className="text-slate-400 text-[11.5px] truncate flex-shrink-0">
        {labelName || "Independent"}
      </div>
    </button>
  );
}

function EmptyState({ searching }: { searching: boolean }) {
  return (
    <div
      className="py-16 flex flex-col items-center justify-center text-center"
      data-testid="empty-people"
    >
      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
        <UserIcon className="w-6 h-6" />
      </div>
      <p className="text-slate-700 text-[14px] font-semibold">
        {searching ? "No people match that search" : "No people yet"}
      </p>
      <p className="text-slate-400 text-[12.5px] mt-1 max-w-xs">
        {searching
          ? "Try a different name."
          : "Add an artist, performer, writer, or producer to start building the SuperCredits™ catalog."}
      </p>
    </div>
  );
}


function initialFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}
