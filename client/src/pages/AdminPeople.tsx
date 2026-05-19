import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X, User as UserIcon, Loader2, Sparkles, ChevronDown, SkipForward, ChevronLeft } from "lucide-react";
import { NewAlbumArtistDialog } from "@/components/admin/NewAlbumArtistDialog";
import { SiSpotify } from "react-icons/si";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  ViewModeToggle,
  useViewMode,
} from "@/components/admin/ViewModeToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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

export function AdminPeople() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [matchSpotifyOpen, setMatchSpotifyOpen] = useState(false);
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

  const { data: people = [], isLoading } = useQuery<PersonLite[]>({
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
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
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
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            data-testid="button-new-person"
          >
            <Plus className="w-3 h-3" />
            Add Person
          </button>
          {/* Advanced — bulk operations across the whole People catalog.
              Today only ships "Match on Spotify"; future bulk operations
              (pull Apple discography for everyone missing one, etc.)
              would slot in here as additional menu items. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 data-[state=open]:bg-slate-100"
              data-testid="button-people-advanced"
              aria-label="Advanced people actions"
            >
              <Sparkles className="w-3 h-3" />
              Advanced
              <ChevronDown className="w-3 h-3 -mr-0.5 text-slate-400" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              className="min-w-[280px] p-1 bg-white text-slate-900 border border-slate-200 shadow-lg"
            >
              <DropdownMenuItem
                onSelect={() => setMatchSpotifyOpen(true)}
                data-testid="menu-match-spotify"
                className="gap-2.5 px-2.5 py-2 text-[12.5px] cursor-pointer focus:bg-slate-100 focus:text-slate-900"
              >
                <SiSpotify className="w-4 h-4 text-[#1DB954]" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900">
                    Match people on Spotify
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Link everyone missing a profile.
                  </div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>)}
      />

      {/* Grid */}
      {isLoading ? (
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
        </div>
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
              labelName={p.labelId ? labelById.get(p.labelId) ?? null : null}
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
              labelName={p.labelId ? labelById.get(p.labelId) ?? null : null}
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

      <MatchSpotifySheet
        open={matchSpotifyOpen}
        onOpenChange={setMatchSpotifyOpen}
        people={people}
      />
      </div>
    </AdminFrame>
  );
}

/* ─── Bulk Spotify matcher ──────────────────────────────────────────────
 * Walks through every Person who's still missing a Spotify URL and
 * fetches their top 3 candidates on demand via the existing
 * /api/admin/people/:id/spotify-candidates endpoint. Identical visual
 * vocabulary to the post-import Spotify step in CreditsImportSheet,
 * just sourced from the catalog rather than from a fresh commit.
 *
 * Per-person candidates fetched lazily (one Spotify API call at a
 * time) so opening the dialog with a 200-person catalog doesn't fan
 * out 200 requests up front.
 */
interface SpotifyCandidate {
  id: string;
  name: string;
  spotifyUrl: string;
  photoUrl: string | null;
  popularity: number;
  followers: number;
  genres: string[];
}

/* Queue entry — person + the candidates we already fetched for them in
 * the bulk scan. Cached up-front so Back/Skip navigation is instant and
 * the queue can be sorted matched-first before the walk begins. */
interface QueueEntry {
  id: string;
  name: string;
  photoUrl: string | null;
  candidates: SpotifyCandidate[];
}

function MatchSpotifySheet({
  open,
  onOpenChange,
  people,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  people: PersonLite[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [idx, setIdx] = useState(0);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<"scanning" | "walking" | "empty">("scanning");

  // Bulk scan on open: fetch candidates for every unlinked person at
  // once, then sort matched-first so the admin breezes through the easy
  // confirms before hitting the no-match tail. Skipped if nothing to do.
  useEffect(() => {
    if (!open) return;
    const unlinked = people.filter((p) => !p.spotifyUrl);
    if (unlinked.length === 0) {
      setQueue([]);
      setPhase("empty");
      setIdx(0);
      setResolvedIds(new Set());
      return;
    }
    let cancelled = false;
    setPhase("scanning");
    setIdx(0);
    setResolvedIds(new Set());
    (async () => {
      try {
        const res = await fetch("/api/admin/people/spotify-scan", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Scan failed");
        const json = (await res.json()) as {
          scanned: { id: string; name: string; candidates: SpotifyCandidate[] }[];
        };
        if (cancelled) return;
        // Only walk people who actually have candidates — no-match rows
        // are surfaced on the People grid with a small badge instead, so
        // the dialog doesn't waste the admin's time clicking Skip 20×.
        const photoById = new Map(people.map((p) => [p.id, p.photoUrl]));
        const sorted: QueueEntry[] = json.scanned
          .filter((s) => s.candidates.length > 0)
          .map((s) => ({
            ...s,
            photoUrl: photoById.get(s.id) ?? null,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        // Refresh the People list so the new spotifyHasMatch badges
        // appear immediately on the grid behind the dialog.
        qc.invalidateQueries({ queryKey: ["/api/people"] });
        setQueue(sorted);
        setPhase(sorted.length === 0 ? "empty" : "walking");
      } catch (e: any) {
        if (cancelled) return;
        toast({
          title: "Couldn't scan Spotify",
          description: e?.message ?? "Try again.",
          variant: "destructive",
        });
        onOpenChange(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = queue[idx] ?? null;
  const resolved = resolvedIds.size;

  const finish = () => {
    qc.invalidateQueries({ queryKey: ["/api/people"] });
    if (resolved > 0) {
      toast({
        title: "Linked on Spotify",
        description: `${resolved} ${resolved === 1 ? "person" : "people"} updated.`,
      });
    }
    onOpenChange(false);
  };

  const advance = () => {
    const next = idx + 1;
    if (next >= queue.length) {
      qc.invalidateQueries({ queryKey: ["/api/people"] });
      if (resolved > 0) {
        toast({
          title: "Linked on Spotify",
          description: `${resolved} ${resolved === 1 ? "person" : "people"} updated.`,
        });
      } else {
        toast({ title: "Done", description: "No people linked." });
      }
      onOpenChange(false);
    } else {
      setIdx(next);
    }
  };

  const goBack = () => {
    if (idx > 0) setIdx(idx - 1);
  };

  const pickMut = useMutation({
    mutationFn: async (c: SpotifyCandidate) => {
      if (!current) throw new Error("No current person");
      // Conservative photo write: only overwrite when the row has no
      // portrait yet, mirroring SpotifyPickerDialog on AdminPerson.
      const updates: Record<string, string> = { spotifyUrl: c.spotifyUrl };
      if (!current.photoUrl && c.photoUrl) updates.photoUrl = c.photoUrl;
      const res = await apiRequest("PUT", `/api/admin/people/${current.id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      if (current) {
        setResolvedIds((prev) => {
          const next = new Set(prev);
          next.add(current.id);
          return next;
        });
      }
      advance();
    },
    onError: (err: any) =>
      toast({
        title: "Couldn't save",
        description: err?.message ?? "Try again.",
        variant: "destructive",
      }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) finish();
        else onOpenChange(v);
      }}
    >
      <DialogContent
        className="max-w-2xl bg-white text-slate-900 rounded-xl border-slate-200 shadow-xl p-6 gap-4"
        data-testid="dialog-match-spotify"
      >
        <DialogHeader className="text-left space-y-1 pr-8">
          {/* Spotify glyph sits inline with the title — same vertical
              rhythm as the X close button (top-4 right-4) so the header
              reads as a balanced row across the top of the dialog. */}
          <div className="flex items-center gap-2">
            <SiSpotify className="w-5 h-5 text-[#1DB954] shrink-0" />
            <DialogTitle className="text-[17px] font-semibold text-slate-900">
              Match people on Spotify
            </DialogTitle>
          </div>
          <DialogDescription className="text-[13px] font-normal text-slate-500">
            Confirm the right artist, or skip.
          </DialogDescription>
        </DialogHeader>

        {phase === "scanning" ? (
          <div className="py-12 text-center">
            <Loader2 className="w-5 h-5 mx-auto animate-spin text-slate-400 mb-2" />
            <div className="text-[13px] font-semibold text-slate-700">
              Scanning Spotify…
            </div>
            <div className="text-[11.5px] text-slate-500 mt-0.5">
              Pulling candidates for everyone not yet linked.
            </div>
          </div>
        ) : phase === "empty" ? (
          <div className="py-10 text-center">
            <SiSpotify className="w-8 h-8 mx-auto text-[#1DB954] mb-2" />
            <div className="text-[14px] font-semibold text-slate-900">
              Nothing to confirm
            </div>
            <div className="text-[12px] text-slate-500 mt-0.5">
              Everyone is either linked or has no Spotify match. Check the
              grid for any "searched, no match" badges.
            </div>
          </div>
        ) : !current ? null : (
          <div className="space-y-4">
            <div>
              <div className="text-[11.5px] font-medium uppercase tracking-wide text-slate-500">
                {idx + 1} of {queue.length}
                {resolved > 0 && (
                  <span className="text-slate-400"> · {resolved} linked</span>
                )}
              </div>
              <div className="mt-0.5 text-[19px] font-semibold text-slate-900" data-testid="text-match-person-name">
                {current.name}
              </div>
            </div>

            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
                {current.candidates.slice(0, 3).map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => pickMut.mutate(c)}
                      disabled={pickMut.isPending}
                      className="w-full flex items-center gap-3 py-3 px-3 text-left hover:bg-slate-50 disabled:opacity-60"
                      data-testid={`button-pick-spotify-${c.id}`}
                    >
                      {c.photoUrl ? (
                        <img
                          src={c.photoUrl}
                          alt=""
                          className="w-14 h-14 rounded-full object-cover bg-slate-100"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-slate-200 inline-flex items-center justify-center text-slate-500">
                          <UserIcon className="w-6 h-6" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[14.5px] text-slate-900 truncate">
                          {c.name}
                        </div>
                        <div className="text-[12px] text-slate-500 truncate">
                          {c.followers.toLocaleString()} followers
                          {c.genres.length > 0 && ` · ${c.genres.slice(0, 3).join(", ")}`}
                        </div>
                      </div>
                      <SiSpotify className="w-4 h-4 text-[#1DB954] shrink-0" />
                    </button>
                  </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="border-t border-slate-200 pt-3 mt-2 gap-2 sm:justify-between">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={finish}
              className="px-2.5 py-1.5 rounded-md text-[12px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              data-testid="button-match-finish"
            >
              Finish
            </button>
          </div>
          {phase === "walking" && current && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={goBack}
                disabled={idx === 0 || pickMut.isPending}
                className="px-2.5 py-1.5 rounded-md text-[12px] font-semibold inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="button-match-back"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <button
                type="button"
                onClick={advance}
                disabled={pickMut.isPending}
                className="px-2.5 py-1.5 rounded-md text-[12px] font-semibold inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                data-testid="button-match-skip"
              >
                Skip
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * SpotifyMatchBadge — small overlay glyph on a person's avatar tile
 * indicating where they stand in the Spotify-match flow:
 *
 *   - spotifyUrl set → no badge (already linked, the row is "done")
 *   - spotifyHasMatch === true → green Spotify glyph (scan found candidates,
 *     admin still needs to confirm one via Advanced → Match on Spotify)
 *   - spotifyHasMatch === false → grey glyph with a slash (we searched but
 *     found nothing — admin can edit the person's name and rescan)
 *   - spotifyHasMatch === null → no badge (never scanned)
 *
 * Lives in AdminPeople.tsx for now because the Spotify-match flow is the
 * only consumer; promote to client/src/components/admin/ if a second
 * surface needs it.
 */
function SpotifyMatchBadge({
  person,
  size,
}: {
  person: PersonLite;
  size: "sm" | "md";
}) {
  if (person.spotifyUrl) return null;
  if (person.spotifyHasMatch === null || person.spotifyHasMatch === undefined) {
    return null;
  }
  // Sit half-on / half-off the avatar at the ~4:30 position. The badge
  // is a square so we anchor its bottom-right corner near the avatar's
  // bottom-right diagonal — `bottom-[7%] right-[7%]` puts the badge
  // centered roughly on the circle's edge at 45°, so about half overlaps
  // the photo and half hangs outside. Matches Apple Music's "verified"
  // / Spotify's "small-glyph-overlay" convention.
  const dim = size === "md" ? "w-6 h-6" : "w-4 h-4";
  const icon = size === "md" ? "w-3.5 h-3.5" : "w-2.5 h-2.5";
  const hasMatch = person.spotifyHasMatch === true;
  return (
    <div
      className={`absolute bottom-[7%] right-[7%] ${dim} rounded-full bg-white ring-1 ring-slate-200 shadow-sm flex items-center justify-center`}
      title={
        hasMatch
          ? "Spotify match found — confirm in Advanced › Match on Spotify"
          : "Searched Spotify — no match found"
      }
      data-testid={`badge-spotify-${hasMatch ? "match" : "nomatch"}-${person.id}`}
    >
      <SiSpotify
        className={`${icon} ${hasMatch ? "text-[#1DB954]" : "text-slate-300"}`}
      />
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
        <div className="w-full h-full rounded-full overflow-hidden bg-[#319ED8] ring-1 ring-slate-200 shadow-sm group-hover:shadow-md group-hover:ring-[#319ED8]/30 transition-all">
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
        <SpotifyMatchBadge person={person} size="md" />
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
        <div className="w-full h-full rounded-full overflow-hidden bg-[#319ED8] ring-1 ring-slate-200">
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
        <SpotifyMatchBadge person={person} size="sm" />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-slate-900 text-[13.5px] font-semibold truncate group-hover:text-[#319ED8] transition-colors"
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
