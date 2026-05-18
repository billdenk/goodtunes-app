import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X, User as UserIcon, Loader2, Sparkles, ChevronDown, SkipForward, AlertCircle } from "lucide-react";
import { SiSpotify } from "react-icons/si";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AdminFrame } from "@/components/admin/AdminFrame";
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
}

interface LabelLite {
  id: string;
  name: string;
}

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
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1
            className="text-slate-900 text-2xl font-bold tracking-tight"
            data-testid="text-page-title"
          >
            People
          </h1>
          <p className="text-slate-500 text-[13px] mt-0.5">
            Artists, performers, writers, and producers — the SuperCredits™
            catalog.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
                    Walk through everyone missing a Spotify link and pick the right artist.
                  </div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

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

      {composerOpen && (
        <NewPersonSheet
          existingPeople={people}
          onClose={() => setComposerOpen(false)}
          onCreated={(id) => {
            setComposerOpen(false);
            navigate(`/admin/people/${id}`);
          }}
        />
      )}

      <MatchSpotifySheet
        open={matchSpotifyOpen}
        onOpenChange={setMatchSpotifyOpen}
        people={people}
      />
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
  // Snapshot the queue when the dialog opens so that picking/skipping a
  // person — which mutates `people` via invalidation — doesn't reshuffle
  // our remaining list mid-walk.
  const [queue, setQueue] = useState<PersonLite[]>([]);
  const [idx, setIdx] = useState(0);
  const [resolved, setResolved] = useState(0);

  useEffect(() => {
    if (open) {
      const unlinked = people.filter((p) => !p.spotifyUrl);
      unlinked.sort((a, b) => a.name.localeCompare(b.name));
      setQueue(unlinked);
      setIdx(0);
      setResolved(0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = queue[idx] ?? null;

  const candidatesQ = useQuery<{ query: string; candidates: SpotifyCandidate[] }>({
    queryKey: ["/api/admin/people", current?.id, "spotify-candidates"],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/people/${current!.id}/spotify-candidates`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Spotify search failed");
      return res.json();
    },
    enabled: open && !!current,
    staleTime: 5 * 60_000,
  });

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

  const advance = (didResolve: boolean) => {
    const next = idx + 1;
    if (didResolve) setResolved((n) => n + 1);
    if (next >= queue.length) {
      // Use a fresh count rather than the stale state above so the
      // final toast reflects this last pick too.
      qc.invalidateQueries({ queryKey: ["/api/people"] });
      const total = resolved + (didResolve ? 1 : 0);
      if (total > 0) {
        toast({
          title: "Linked on Spotify",
          description: `${total} ${total === 1 ? "person" : "people"} updated.`,
        });
      } else {
        toast({ title: "Done", description: "No people linked." });
      }
      onOpenChange(false);
    } else {
      setIdx(next);
    }
  };

  const pickMut = useMutation({
    mutationFn: async (c: SpotifyCandidate) => {
      if (!current) throw new Error("No current person");
      // Conservative photo write: only overwrite when the row has no
      // portrait yet, mirroring SpotifyPickerDialog on AdminPerson so
      // we don't clobber an admin-uploaded photo.
      const updates: Record<string, string> = { spotifyUrl: c.spotifyUrl };
      if (!current.photoUrl && c.photoUrl) updates.photoUrl = c.photoUrl;
      const res = await apiRequest("PUT", `/api/admin/people/${current.id}`, updates);
      return res.json();
    },
    onSuccess: () => advance(true),
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
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-[17px] font-semibold text-slate-900">
            Match people on Spotify
          </DialogTitle>
          <DialogDescription className="text-[13px] font-normal text-slate-500">
            Everyone in the catalog without a Spotify link, one at a time. Pick the right artist or skip — we'll save the URL and photo when you pick.
          </DialogDescription>
        </DialogHeader>

        {queue.length === 0 ? (
          <div className="py-10 text-center">
            <SiSpotify className="w-8 h-8 mx-auto text-[#1DB954] mb-2" />
            <div className="text-[14px] font-semibold text-slate-900">
              Every person is already linked
            </div>
            <div className="text-[12px] text-slate-500 mt-0.5">
              Nothing to do here — great job.
            </div>
          </div>
        ) : !current ? null : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11.5px] font-medium uppercase tracking-wide text-slate-500">
                  {idx + 1} of {queue.length}
                  {resolved > 0 && <span className="text-slate-400"> · {resolved} linked</span>}
                </div>
                <div className="mt-0.5 text-[19px] font-semibold text-slate-900" data-testid="text-match-person-name">
                  {current.name}
                </div>
              </div>
              <SiSpotify className="w-6 h-6 text-[#1DB954]" />
            </div>

            {candidatesQ.isFetching ? (
              <div className="py-10 text-center text-[12.5px] text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin inline-block mr-1.5" />
                Searching Spotify…
              </div>
            ) : (candidatesQ.data?.candidates ?? []).length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
                <AlertCircle className="w-5 h-5 mx-auto text-slate-400 mb-1.5" />
                <div className="text-[13px] font-semibold text-slate-700">
                  No Spotify artist found for "{current.name}"
                </div>
                <div className="text-[12px] text-slate-500 mt-0.5">
                  Skip to keep moving — you can search by a different name later from the Streaming tab.
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
                {(candidatesQ.data?.candidates ?? []).slice(0, 3).map((c) => (
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
            )}
          </div>
        )}

        <DialogFooter className="border-t border-slate-200 pt-3 mt-2 gap-2 sm:justify-between">
          {/* Admin chrome: white-outline buttons on slate surface, never
              the default shadcn Button (which inherits the brand-dark
              background variable and looks like a navy slab here). */}
          <button
            type="button"
            onClick={finish}
            className="px-2.5 py-1.5 rounded-md text-[12px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            data-testid="button-match-finish"
          >
            Finish
          </button>
          {current && (
            <button
              type="button"
              onClick={() => advance(false)}
              disabled={pickMut.isPending}
              className="px-2.5 py-1.5 rounded-md text-[12px] font-semibold inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              data-testid="button-match-skip"
            >
              <SkipForward className="w-3.5 h-3.5" />
              Skip
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      <div className="relative w-full aspect-square rounded-full overflow-hidden bg-[#319ED8] ring-1 ring-slate-200 shadow-sm group-hover:shadow-md group-hover:ring-[#319ED8]/30 transition-all">
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
      <div className="w-10 h-10 rounded-full overflow-hidden bg-[#319ED8] ring-1 ring-slate-200 flex-shrink-0">
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

/**
 * NewPersonSheet — modal composer for adding a person.
 *
 * Two modes, switchable via a small tab strip:
 *   "From Apple Music" (default) — paste a music.apple.com/artist URL,
 *     press Preview → server scrape returns name/photo/bio + discography,
 *     admin reviews, then Create → POST /api/admin/people followed by
 *     PUT /api/admin/people/:id/discography. One round-trip for the
 *     non-technical case: paste → confirm → done.
 *   "Manual" — just a name field for cases where there's no Apple Music
 *     page yet (session musician, indie writer). Creates the row and
 *     drops the admin into the per-person editor.
 *
 * Either path ends with navigate(/admin/people/:id), so the admin is
 * immediately in the right place to add photos, streaming links, etc.
 */
function NewPersonSheet({
  existingPeople,
  onClose,
  onCreated,
}: {
  existingPeople: PersonLite[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"apple" | "manual">("apple");
  const [url, setUrl] = useState("");
  const [manualName, setManualName] = useState("");
  const [preview, setPreview] = useState<ScrapeResponse | null>(null);

  // Duplicate guard. After a successful preview we check the catalog for a
  // person already linked to that Apple itunesArtistId (the only reliable
  // key — names from Apple can drift, e.g. "Beatles" vs "The Beatles").
  // If we find one, we swap the Create button for "Open existing" so the
  // admin can't accidentally seed two rows for the same artist.
  const existingMatch = useMemo(() => {
    if (!preview?.itunesArtistId) return null;
    return (
      existingPeople.find(
        (p) => p.itunesArtistId === preview.itunesArtistId,
      ) ?? null
    );
  }, [preview, existingPeople]);

  // Close on Escape — keeps the modal feeling "real" without forcing the
  // admin to mouse up to the X.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const previewMut = useMutation({
    mutationFn: async (artistUrl: string) => {
      const res = await apiRequest("POST", "/api/admin/people/scrape", {
        url: artistUrl,
      });
      return (await res.json()) as ScrapeResponse;
    },
    onSuccess: (data) => {
      if (!data.name) {
        toast({
          title: "Couldn't read that page",
          description:
            "We didn't find an artist name there. Double-check it's a music.apple.com/artist link.",
          variant: "destructive",
        });
        return;
      }
      setPreview(data);
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't pull from Apple Music",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const createFromPreview = useMutation({
    mutationFn: async (p: ScrapeResponse) => {
      const created = await apiRequest("POST", "/api/admin/people", {
        name: p.name,
        photoUrl: p.photoUrl,
        bio: p.bio,
        appleMusicUrl: p.appleMusicUrl,
        itunesArtistId: p.itunesArtistId,
      });
      const person = (await created.json()) as { id: string };
      const albums = Array.isArray(p.albums) ? p.albums : [];
      if (albums.length > 0) {
        const items = albums.map((a, idx) => ({
          collectionId: String(a.collectionId),
          name: a.name,
          artworkUrl: a.artworkUrl,
          year: a.year,
          trackCount: a.trackCount,
          type: a.type,
          appleMusicUrl: a.appleMusicUrl,
          spotifyUrl: null,
          position: idx,
        }));
        await apiRequest(
          "PUT",
          `/api/admin/people/${person.id}/discography`,
          { items },
        );
      }
      return { id: person.id, releaseCount: albums.length };
    },
    onSuccess: async ({ id, releaseCount }) => {
      await qc.invalidateQueries({ queryKey: ["/api/people"] });
      toast({
        title: `Added ${preview?.name ?? "person"}`,
        description:
          releaseCount > 0
            ? `Pulled ${releaseCount} ${releaseCount === 1 ? "release" : "releases"} from Apple Music.`
            : "No discography found on that page — you can add releases later.",
      });
      onCreated(id);
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const createManual = useMutation({
    mutationFn: async (name: string) => {
      const created = await apiRequest("POST", "/api/admin/people", { name });
      return (await created.json()) as { id: string };
    },
    onSuccess: async (person) => {
      await qc.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: `Added ${manualName.trim()}` });
      onCreated(person.id);
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const busy =
    previewMut.isPending || createFromPreview.isPending || createManual.isPending;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-16 sm:pt-24 px-4"
      role="dialog"
      aria-modal="true"
      data-testid="sheet-new-person"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-slate-900 text-[15px] font-bold">
            New person
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
            aria-label="Close"
            data-testid="button-close-new-person"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex items-center gap-4 px-5 pt-3 border-b border-slate-100">
          <ModeTab
            label="From Apple Music"
            active={mode === "apple"}
            onClick={() => {
              setMode("apple");
              setPreview(null);
            }}
            testId="tab-mode-apple"
          />
          <ModeTab
            label="Manual"
            active={mode === "manual"}
            onClick={() => setMode("manual")}
            testId="tab-mode-manual"
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {mode === "apple" ? (
            preview ? (
              <PreviewBlock preview={preview} existingMatch={existingMatch} />
            ) : (
              <ApplePasteBlock
                url={url}
                setUrl={setUrl}
                busy={previewMut.isPending}
              />
            )
          ) : (
            <ManualBlock name={manualName} setName={setManualName} />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50">
          {mode === "apple" && preview ? (
            <>
              <button
                type="button"
                onClick={() => setPreview(null)}
                disabled={busy}
                className="px-3 py-1.5 rounded-md text-slate-600 text-[12.5px] font-semibold hover:bg-white disabled:opacity-50"
                data-testid="button-preview-back"
              >
                Back
              </button>
              {existingMatch ? (
                <button
                  type="button"
                  onClick={() => onCreated(existingMatch.id)}
                  className="px-4 py-1.5 rounded-md bg-[#319ED8] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5"
                  data-testid="button-open-existing-person"
                >
                  Open existing
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => createFromPreview.mutate(preview)}
                  disabled={busy}
                  className="px-4 py-1.5 rounded-md bg-[#319ED8] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-1.5"
                  data-testid="button-confirm-new-person"
                >
                  {createFromPreview.isPending && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  Add {preview.name}
                </button>
              )}
            </>
          ) : mode === "apple" ? (
            <button
              type="button"
              onClick={() => previewMut.mutate(url.trim())}
              disabled={busy || !url.trim()}
              className="px-4 py-1.5 rounded-md bg-[#319ED8] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-1.5"
              data-testid="button-preview-apple"
            >
              {previewMut.isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              Preview
            </button>
          ) : (
            <button
              type="button"
              onClick={() => createManual.mutate(manualName.trim())}
              disabled={busy || !manualName.trim()}
              className="px-4 py-1.5 rounded-md bg-[#319ED8] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-1.5"
              data-testid="button-create-manual"
            >
              {createManual.isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              Create
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ModeTab({
  label,
  active,
  onClick,
  testId,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "pb-2.5 text-[12.5px] font-semibold border-b-2 -mb-px " +
        (active
          ? "border-[#319ED8] text-slate-900"
          : "border-transparent text-slate-500 hover:text-slate-700")
      }
      data-testid={testId}
    >
      {label}
    </button>
  );
}

function ApplePasteBlock({
  url,
  setUrl,
  busy,
}: {
  url: string;
  setUrl: (v: string) => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-slate-700 text-[12.5px] font-semibold mb-1">
          Apple Music artist URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
          placeholder="https://music.apple.com/us/artist/…"
          className="w-full px-3 py-2 rounded-md border border-slate-300 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#319ED8]/30 focus:border-[#319ED8] disabled:opacity-50"
          data-testid="input-apple-url"
          autoFocus
        />
        <p className="text-slate-400 text-[11.5px] mt-1.5 leading-relaxed">
          Open the artist on Apple Music, copy the page URL, paste it here.
          We pull their name, photo, bio, and full release list.
        </p>
      </div>
    </div>
  );
}

function PreviewBlock({
  preview,
  existingMatch,
}: {
  preview: ScrapeResponse;
  existingMatch: PersonLite | null;
}) {
  const releaseCount = preview.albums?.length ?? 0;
  return (
    <div className="space-y-4" data-testid="preview-new-person">
      {existingMatch && (
        <div
          className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900 text-[12px] leading-relaxed"
          data-testid="warning-duplicate-person"
        >
          <span className="font-semibold">Already in your catalog</span> as{" "}
          <span className="font-semibold">{existingMatch.name}</span>. Click
          “Open existing” below to jump there instead of creating a duplicate.
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-[#319ED8] ring-1 ring-slate-200 flex-shrink-0">
          {preview.photoUrl ? (
            <img
              src={preview.photoUrl}
              alt={preview.name ?? ""}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white text-xl font-bold">
              {preview.name ? preview.name.charAt(0).toUpperCase() : "?"}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-slate-900 text-[15px] font-bold truncate">
            {preview.name}
          </div>
          {preview.bio && (
            <p className="text-slate-500 text-[12px] mt-1 leading-snug line-clamp-4">
              {preview.bio}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <div className="text-slate-700 text-[12px] font-semibold mb-2">
          {releaseCount === 0
            ? "No releases found"
            : `${releaseCount} ${releaseCount === 1 ? "release" : "releases"} from Apple Music`}
        </div>
        {releaseCount > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {preview.albums!.slice(0, 14).map((a) => (
              <div
                key={a.collectionId}
                className="flex-shrink-0 w-16"
                title={a.name}
              >
                <div className="w-16 h-16 rounded-md overflow-hidden bg-slate-100 ring-1 ring-slate-200">
                  <img
                    src={a.artworkUrl}
                    alt={a.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="text-slate-500 text-[10.5px] mt-1 truncate">
                  {a.year ?? a.type}
                </div>
              </div>
            ))}
            {releaseCount > 14 && (
              <div className="flex-shrink-0 w-16 h-16 rounded-md bg-slate-50 ring-1 ring-slate-200 flex items-center justify-center text-slate-400 text-[11px] font-semibold">
                +{releaseCount - 14}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ManualBlock({
  name,
  setName,
}: {
  name: string;
  setName: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-slate-700 text-[12.5px] font-semibold mb-1">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Phoebe Bridgers"
          className="w-full px-3 py-2 rounded-md border border-slate-300 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#319ED8]/30 focus:border-[#319ED8]"
          data-testid="input-manual-name"
          autoFocus
        />
        <p className="text-slate-400 text-[11.5px] mt-1.5 leading-relaxed">
          Use this for performers, writers, or producers who don't have an
          Apple Music page (yet). You can add photo, bio, and streaming
          links on the next screen.
        </p>
      </div>
    </div>
  );
}

function initialFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}
