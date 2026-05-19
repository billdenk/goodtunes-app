import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ExternalLink, Loader2 } from "lucide-react";
import { SiSpotify, SiApplemusic } from "react-icons/si";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * "Who's the artist?" dialog — the entry point for `+ New album`.
 *
 * Three stages:
 *  1. `intro`     — name input + live local-match list. If a match
 *                   exists, picking it commits immediately. If not, two
 *                   actions: "Search on streaming" or "Enter manually".
 *  2. `streaming` — Spotify candidate grid (photos + names). Pick →
 *                   confirm step.
 *  3. `confirm`   — chosen artist preview + automatic Apple Music
 *                   lookup. Hitting "Create artist & album" runs:
 *                     a) POST /api/admin/people/scrape on the Apple
 *                        artistLinkUrl (when found) → photo, bio,
 *                        itunesArtistId, full Apple discography.
 *                     b) POST /api/admin/people with merged record
 *                        (Spotify URL always; Apple data when available).
 *                     c) PUT /people/:id/discography in background (fire-
 *                        and-forget — fan side reads this lazily).
 *                     d) Resolve a chosen `{ name, id }` back to the
 *                        opener so it can create the album with the
 *                        artist already attached.
 *
 * "Enter manually" / "Skip for now" both create the album without an
 * artist link (admin can re-attach later via the Metadata panel's
 * ArtistPickerField). Picking the wrong streaming artist is reversible
 * the same way — the Person row keeps `SET NULL` on delete from the
 * albums.primaryArtistId column, so deleting the Person just unlinks
 * the album.
 *
 * Design conformance: white admin chrome, h-9 buttons, brand blue
 * `#319ED8` primary, slate-300 borders, 13.5px input text, 12.5px
 * button text. Avatar fallback uses the same blue-circle-with-initial
 * treatment as the People grid.
 */

interface PersonLite {
  id: string;
  name: string;
  photoUrl?: string | null;
  itunesArtistId?: string | null;
}

interface SpotifyCandidate {
  id: string;
  name: string;
  spotifyUrl: string;
  photoUrl: string | null;
  popularity: number;
  followers: number;
  genres: string[];
}

interface AppleCandidate {
  artistId: string;
  name: string;
  appleMusicUrl: string;
  primaryGenre: string | null;
}

interface ScrapeResult {
  source: "apple" | "spotify" | "unknown";
  name: string | null;
  photoUrl: string | null;
  bio: string | null;
  itunesArtistId: string | null;
  appleMusicUrl: string | null;
  spotifyUrl: string | null;
  albums?: Array<{
    collectionId: number;
    name: string;
    artworkUrl: string;
    year: number | null;
    trackCount: number | null;
    type: "album" | "EP";
    appleMusicUrl: string | null;
  }>;
}

export interface NewAlbumArtistDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /**
   * Called when the admin has picked (or created) an artist. Receives
   * `{ name, id }` so the opener can create the album with the artist
   * already attached. `id` is empty string when the admin chose
   * "Enter manually" without a name (shouldn't happen in practice —
   * Manual still requires a name).
   */
  onSelect: (artist: { name: string; id: string }) => void;
  /**
   * Called when the admin skips the dialog ("I'll set the artist
   * later"). The opener should create the album with the legacy
   * "Unknown artist" placeholder so the editor still loads.
   */
  onSkip: () => void;
  /** Disables all internal actions while the album POST is in flight. */
  busy?: boolean;
  /**
   * "album" (default) — opener is creating an album and needs an artist
   * attached. Surfaces a "I'll set the artist later" skip footer and the
   * confirm button reads "Create artist & album".
   * "person" — opener is the People index. Picking commits a person row
   * and navigates to their profile. No skip footer; confirm reads
   * "Add person".
   */
  mode?: "album" | "person";
}

type Stage = "intro" | "streaming" | "confirm";

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function Avatar({ name, photoUrl, size = 56 }: { name: string; photoUrl: string | null; size?: number }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        style={{ width: size, height: size }}
        className="rounded-full object-cover flex-shrink-0 bg-slate-100"
      />
    );
  }
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <div
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className="rounded-full bg-[#319ED8] text-white font-semibold inline-flex items-center justify-center flex-shrink-0"
    >
      {initial}
    </div>
  );
}

export function NewAlbumArtistDialog({
  open,
  onOpenChange,
  onSelect,
  onSkip,
  busy: parentBusy,
  mode = "album",
}: NewAlbumArtistDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [stage, setStage] = useState<Stage>("intro");
  const [name, setName] = useState("");
  const [hasSearchedStreaming, setHasSearchedStreaming] = useState(false);
  const [spotifyError, setSpotifyError] = useState<"configured" | "failed" | null>(null);
  const [picked, setPicked] = useState<SpotifyCandidate | null>(null);
  const [appleCandidate, setAppleCandidate] = useState<AppleCandidate | null>(null);
  const [appleLooked, setAppleLooked] = useState(false);
  const [appleErrored, setAppleErrored] = useState(false);
  const [linkApple, setLinkApple] = useState(true);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Per-pick sequence number so a slow Apple lookup for an earlier pick
  // can't overwrite the result for the artist the admin is now looking at.
  // (Architect-flagged: pick A → back → pick B before A resolves used to
  // cross-wire A's Apple URL onto B's confirm screen.)
  const appleLookupSeqRef = useRef(0);

  // Reset when reopened so each new-album invocation starts clean.
  useEffect(() => {
    if (open) {
      setStage("intro");
      setName("");
      setHasSearchedStreaming(false);
      setSpotifyError(null);
      setPicked(null);
      setAppleCandidate(null);
      setAppleLooked(false);
      setAppleErrored(false);
      setLinkApple(true);
      setCreating(false);
      appleLookupSeqRef.current = 0;
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open]);

  const trimmed = name.trim();

  // ---------- Local typeahead ----------
  const { data: people = [] } = useQuery<PersonLite[]>({
    queryKey: ["/api/people"],
  });
  const localMatches = useMemo(() => {
    if (!trimmed) return [];
    const q = trimmed.toLowerCase();
    return people
      .filter((p) => p.name.toLowerCase().includes(q))
      .sort((a, b) => {
        // Exact / startsWith first
        const ax = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bx = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (ax !== bx) return ax - bx;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 6);
  }, [people, trimmed]);
  const hasExactLocal = useMemo(
    () => people.some((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase()),
    [people, trimmed],
  );

  // ---------- Spotify candidate search ----------
  // Manual fetch (not useQuery) because we want to differentiate
  // "no results" from "Spotify not configured" / "transport failed" so
  // the UI can show an honest error instead of a misleading empty state.
  const [spotifyCandidates, setSpotifyCandidates] = useState<SpotifyCandidate[]>([]);
  const [spotifyFetching, setSpotifyFetching] = useState(false);
  const runSpotifySearch = async () => {
    setSpotifyFetching(true);
    setSpotifyError(null);
    setSpotifyCandidates([]);
    try {
      const token = getAuthToken();
      const res = await fetch(
        `/api/admin/spotify/artist-search?q=${encodeURIComponent(trimmed)}`,
        {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (res.status === 503) {
        setSpotifyError("configured");
      } else if (!res.ok) {
        setSpotifyError("failed");
      } else {
        const json = (await res.json()) as { candidates: SpotifyCandidate[] };
        setSpotifyCandidates(json.candidates ?? []);
      }
    } catch {
      setSpotifyError("failed");
    } finally {
      setSpotifyFetching(false);
    }
  };

  // ---------- Mutations ----------
  const scrapeMut = useMutation({
    mutationFn: async (u: string): Promise<ScrapeResult> => {
      const res = await apiRequest("POST", "/api/admin/people/scrape", { url: u });
      return (await res.json()) as ScrapeResult;
    },
  });
  const createPersonMut = useMutation({
    mutationFn: async (body: Record<string, unknown>): Promise<PersonLite> => {
      const res = await apiRequest("POST", "/api/admin/people", body);
      return (await res.json()) as PersonLite;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/people"] });
    },
  });

  // ---------- Action: pick local ----------
  const pickLocal = (p: PersonLite) => {
    onSelect({ name: p.name, id: p.id });
  };

  // ---------- Action: enter manually (name only) ----------
  const handleManual = async () => {
    if (!trimmed) return;
    try {
      const person = await createPersonMut.mutateAsync({ name: trimmed });
      toast({ title: `Added ${person.name}` });
      onSelect({ name: person.name, id: person.id });
    } catch (e: any) {
      toast({
        title: "Couldn't create artist",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    }
  };

  // ---------- Action: search streaming ----------
  const handleSearchStreaming = async () => {
    if (!trimmed) return;
    setStage("streaming");
    setHasSearchedStreaming(true);
    await runSpotifySearch();
  };

  // ---------- Action: pick Spotify candidate → look up Apple ----------
  const handlePick = async (c: SpotifyCandidate) => {
    // Each pick gets its own monotonic id so a slow earlier lookup
    // can't overwrite a later pick's appleCandidate.
    appleLookupSeqRef.current += 1;
    const mySeq = appleLookupSeqRef.current;
    setPicked(c);
    setStage("confirm");
    setAppleLooked(false);
    setAppleErrored(false);
    setAppleCandidate(null);
    try {
      const token = getAuthToken();
      const res = await fetch(
        `/api/admin/apple/artist-search?q=${encodeURIComponent(c.name)}`,
        {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      // Stale guard: bail if the admin has since picked a different
      // candidate or navigated away from this pick.
      if (appleLookupSeqRef.current !== mySeq) return;
      if (res.ok) {
        const json = (await res.json()) as { candidates: AppleCandidate[] };
        if (appleLookupSeqRef.current !== mySeq) return;
        const wanted = c.name.trim().toLowerCase();
        const exact = json.candidates.find((a) => a.name.trim().toLowerCase() === wanted);
        setAppleCandidate(exact ?? json.candidates[0] ?? null);
      } else {
        setAppleErrored(true);
      }
    } catch {
      if (appleLookupSeqRef.current !== mySeq) return;
      setAppleErrored(true);
    } finally {
      // Only flip the "looked" flag if this is still the active lookup.
      if (appleLookupSeqRef.current === mySeq) setAppleLooked(true);
    }
  };

  // ---------- Action: confirm & create ----------
  const handleConfirm = async () => {
    if (!picked) return;
    setCreating(true);
    try {
      // 1) Best-effort Apple scrape (photo, bio, itunesArtistId, discography)
      let apple: ScrapeResult | null = null;
      if (linkApple && appleCandidate?.appleMusicUrl) {
        try {
          apple = await scrapeMut.mutateAsync(appleCandidate.appleMusicUrl);
        } catch {
          /* Apple scrape failed — proceed with Spotify-only enrichment */
        }
      }

      // 1a) Duplicate guard — if the Apple scrape produced an
      //     `itunesArtistId` we already have on a local person, OR if
      //     Apple's canonical name now matches a local row, treat as
      //     "open existing" instead of creating a duplicate. This is the
      //     guard the old `NewPersonSheet` used to do post-scrape.
      const scrapedItunesId = apple?.itunesArtistId || appleCandidate?.artistId || null;
      const scrapedName = (apple?.name || picked.name).trim().toLowerCase();
      const existing = people.find(
        (p) =>
          (scrapedItunesId && p.itunesArtistId && p.itunesArtistId === scrapedItunesId) ||
          p.name.trim().toLowerCase() === scrapedName,
      );
      if (existing) {
        toast({
          title: `Already in your catalog`,
          description: `Opening ${existing.name}.`,
        });
        onSelect({ name: existing.name, id: existing.id });
        return;
      }

      // 2) Create Person, preferring Apple's canonical name when present
      const personBody: Record<string, unknown> = {
        name: apple?.name || picked.name,
        photoUrl: apple?.photoUrl || picked.photoUrl || null,
        bio: apple?.bio || null,
        spotifyUrl: picked.spotifyUrl,
        appleMusicUrl: apple?.appleMusicUrl || appleCandidate?.appleMusicUrl || null,
        itunesArtistId: apple?.itunesArtistId || appleCandidate?.artistId || null,
      };
      const person = await createPersonMut.mutateAsync(personBody);

      // 3) Fire-and-forget discography PUT — fan side reads it lazily, so the
      //    album editor doesn't have to wait. Errors are non-blocking.
      if (apple?.albums && apple.albums.length > 0) {
        const items = apple.albums.map((a, idx) => ({
          collectionId: String(a.collectionId),
          name: a.name,
          artworkUrl: a.artworkUrl,
          year: a.year,
          type: a.type,
          trackCount: a.trackCount,
          appleMusicUrl: a.appleMusicUrl,
          spotifyUrl: null,
          position: idx,
        }));
        apiRequest("PUT", `/api/admin/people/${person.id}/discography`, { items }).catch(() => {
          /* discography is a bonus — silent on failure */
        });
      }

      toast({
        title: `Added ${person.name}`,
        description: apple?.albums?.length
          ? `Pulling ${apple.albums.length} releases in the background.`
          : undefined,
      });
      onSelect({ name: person.name, id: person.id });
    } catch (e: any) {
      toast({
        title: "Couldn't add artist",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
      setCreating(false);
    }
  };

  const busy = parentBusy || creating || createPersonMut.isPending || scrapeMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? null : onOpenChange(o))}>
      <DialogContent
        className="sm:max-w-[480px] p-0 gap-0 bg-white h-[560px] max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden"
        data-testid="dialog-new-album-artist"
        aria-describedby={undefined}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            {stage !== "intro" && (
              <button
                type="button"
                onClick={() => {
                  if (busy) return;
                  if (stage === "confirm") setStage("streaming");
                  else setStage("intro");
                }}
                className="w-6 h-6 -ml-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center justify-center"
                data-testid="button-artist-dialog-back"
                aria-label="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <DialogTitle className="text-[17px] font-semibold text-slate-900">
              {stage === "intro" && (mode === "person" ? "Add a person" : "Who's the artist?")}
              {stage === "streaming" && "Search Spotify"}
              {stage === "confirm" && (mode === "person" ? "Confirm person" : "Confirm artist")}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* ------------ INTRO ------------ */}
        {stage === "intro" && (
          <div className="flex-1 flex flex-col p-5 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-4">
              <div>
                <label
                  htmlFor="new-album-artist-name"
                  className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider block mb-1"
                >
                  Name
                </label>
                <input
                  id="new-album-artist-name"
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && localMatches[0] && hasExactLocal) {
                      e.preventDefault();
                      pickLocal(localMatches[0]);
                    } else if (e.key === "Enter" && trimmed && localMatches.length === 0) {
                      e.preventDefault();
                      handleSearchStreaming();
                    }
                  }}
                  placeholder="Start typing an artist…"
                  className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-[13.5px] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#319ED8] focus:border-transparent"
                  data-testid="input-artist-name"
                />
                <p className="text-[11.5px] text-slate-400 mt-1.5 leading-snug">
                  We'll match against people already in your catalog as you type.
                </p>
              </div>

              {trimmed && localMatches.length > 0 && (
                <div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    In your catalog
                  </div>
                  <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white overflow-hidden">
                    {localMatches.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pickLocal(p)}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left"
                        data-testid={`option-local-${p.id}`}
                      >
                        <Avatar name={p.name} photoUrl={p.photoUrl ?? null} size={36} />
                        <span className="flex-1 text-[13.5px] font-medium text-slate-900 truncate">
                          {p.name}
                        </span>
                        <Check className="w-3.5 h-3.5 text-slate-300" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {trimmed && localMatches.length === 0 && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleManual}
                    disabled={busy}
                    className="h-9 rounded-md border border-slate-300 bg-white text-slate-700 text-[12.5px] font-semibold hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                    data-testid="button-enter-manually"
                  >
                    {createPersonMut.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : null}
                    Enter manually
                  </button>
                  <button
                    type="button"
                    onClick={handleSearchStreaming}
                    disabled={busy}
                    className="h-9 rounded-md bg-[#1DB954] text-black text-[12.5px] font-semibold hover:bg-[#19a449] inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                    data-testid="button-search-streaming"
                  >
                    <SiSpotify className="w-3.5 h-3.5" />
                    Search Spotify
                  </button>
                </div>
              )}
            </div>

            {mode === "album" && (
              <div className="border-t border-slate-200 -mx-5 px-5 pt-3 mt-3 flex items-center">
                <button
                  type="button"
                  onClick={onSkip}
                  disabled={busy}
                  className="text-[11.5px] font-medium text-slate-500 hover:text-slate-900 disabled:opacity-60"
                  data-testid="button-skip-artist"
                >
                  I'll set the artist later
                </button>
              </div>
            )}
          </div>
        )}

        {/* ------------ STREAMING ------------ */}
        {stage === "streaming" && (
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            <div className="flex items-center gap-2 text-[12.5px] text-slate-500">
              <SiSpotify className="w-3.5 h-3.5 text-[#1DB954]" />
              Searching Spotify for <span className="font-semibold text-slate-700">"{trimmed}"</span>
            </div>

            {spotifyFetching ? (
              <div className="py-10 flex items-center justify-center text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : spotifyError ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-4">
                <div className="text-[13px] text-amber-900 font-semibold">
                  {spotifyError === "configured"
                    ? "Spotify isn't connected yet."
                    : "Spotify lookup failed."}
                </div>
                <div className="text-[11.5px] text-amber-800 mt-1 leading-snug">
                  {spotifyError === "configured"
                    ? "Add a Spotify client ID and secret to enable streaming search. You can still add the artist manually."
                    : "Couldn't reach Spotify just now. Try again, or add the artist manually."}
                </div>
                <div className="flex gap-2 mt-3">
                  {spotifyError === "failed" && (
                    <button
                      type="button"
                      onClick={runSpotifySearch}
                      disabled={busy}
                      className="h-9 px-3 rounded-md border border-slate-300 bg-white text-slate-700 text-[12.5px] font-semibold hover:bg-slate-50 disabled:opacity-60"
                      data-testid="button-retry-spotify"
                    >
                      Try again
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleManual}
                    disabled={busy}
                    className="h-9 px-3 rounded-md bg-[#319ED8] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                    data-testid="button-enter-manually-fallback"
                  >
                    {createPersonMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Enter manually instead
                  </button>
                </div>
              </div>
            ) : spotifyCandidates.length === 0 && hasSearchedStreaming ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center">
                <div className="text-[13px] text-slate-600 font-medium">
                  No Spotify artists found.
                </div>
                <button
                  type="button"
                  onClick={handleManual}
                  disabled={busy}
                  className="mt-3 h-9 px-4 rounded-md border border-slate-300 bg-white text-slate-700 text-[12.5px] font-semibold hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                  data-testid="button-enter-manually-fallback"
                >
                  {createPersonMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Enter manually instead
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-[360px] overflow-y-auto -mx-1 px-1">
                {spotifyCandidates.map((c) => (
                  // div + role=button (not a <button>) because the card
                  // contains a nested <a> (open-on-Spotify). Nesting <a>
                  // inside <button> is invalid HTML and breaks keyboard
                  // focus order. The picker stops propagation on the
                  // link click so opening Spotify in a new tab doesn't
                  // also commit the pick.
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handlePick(c)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handlePick(c);
                      }
                    }}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-center active:scale-[0.98] transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#319ED8]"
                    data-testid={`option-spotify-${c.id}`}
                  >
                    <Avatar name={c.name} photoUrl={c.photoUrl} size={64} />
                    <div className="w-full">
                      <div className="flex items-center justify-center gap-1 min-w-0">
                        <span className="text-[13px] font-semibold text-slate-900 truncate">
                          {c.name}
                        </span>
                        <a
                          href={c.spotifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-400 hover:text-[#1DB954] flex-shrink-0 inline-flex items-center"
                          aria-label={`Open ${c.name} on Spotify`}
                          title="Open on Spotify"
                          data-testid={`link-open-spotify-${c.id}`}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {c.followers > 0 ? `${formatFollowers(c.followers)} followers` : c.genres[0] || "Artist"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ------------ CONFIRM ------------ */}
        {stage === "confirm" && picked && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
              <Avatar name={picked.name} photoUrl={picked.photoUrl} size={56} />
              <div className="flex-1 min-w-0">
                <div className="text-[14.5px] font-semibold text-slate-900 truncate">
                  {picked.name}
                </div>
                <div className="text-[11.5px] text-slate-500 truncate flex items-center gap-1">
                  <SiSpotify className="w-3 h-3 text-[#1DB954] flex-shrink-0" />
                  {picked.followers > 0 ? `${formatFollowers(picked.followers)} followers on Spotify` : "Spotify"}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 px-3 py-2.5">
              {!appleLooked ? (
                <div className="flex items-center gap-2 text-[12.5px] text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Checking Apple Music…
                </div>
              ) : appleCandidate ? (
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={linkApple}
                    onChange={(e) => setLinkApple(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#319ED8] focus:ring-[#319ED8]"
                    data-testid="checkbox-link-apple"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-slate-900 flex items-center gap-1.5">
                      <SiApplemusic className="w-3.5 h-3.5 text-[#FA243C]" />
                      Found on Apple Music
                    </div>
                    <div className="text-[11.5px] text-slate-500 leading-snug mt-0.5">
                      We'll link the profile and pull their full Apple Music
                      catalog so fans see every release on the artist page.
                    </div>
                  </div>
                </label>
              ) : appleErrored ? (
                <div className="text-[12.5px] text-slate-500 flex items-center gap-1.5">
                  <SiApplemusic className="w-3.5 h-3.5 text-slate-300" />
                  Apple Music lookup failed — you can link it later.
                </div>
              ) : (
                <div className="text-[12.5px] text-slate-500 flex items-center gap-1.5">
                  <SiApplemusic className="w-3.5 h-3.5 text-slate-300" />
                  Not found on Apple Music — you can add it later.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-200 -mx-5 px-5 pt-3">
              <button
                type="button"
                onClick={() => setStage("streaming")}
                disabled={busy}
                className="h-9 px-3 rounded-md border border-slate-300 bg-white text-slate-700 text-[12.5px] font-semibold hover:bg-slate-50 disabled:opacity-60"
                data-testid="button-confirm-back"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy || !appleLooked}
                title={!appleLooked ? "Checking Apple Music…" : undefined}
                className="h-9 px-4 rounded-md bg-[#319ED8] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] inline-flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                data-testid="button-confirm-artist"
              >
                {busy || !appleLooked ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                {mode === "person" ? "Add person" : "Create artist & album"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
