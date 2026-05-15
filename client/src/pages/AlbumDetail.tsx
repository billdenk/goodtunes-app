import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/hooks/useAuth";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { GoodDeedCertificate } from "@/components/GoodDeedCertificate";
import { PlaylistPickerSheet } from "@/components/PlaylistPickerSheet";
import { useFavoriteSongs } from "@/hooks/useFavorites";
import { toast } from "@/hooks/use-toast";
import { startVendorChatAboutInstrument } from "@/lib/chatStore";
import { useScrollHideNav } from "@/hooks/useNavVisibility";
import { ALBUMS, getSongsByAlbum, getCreditsForSong, PEOPLE, INSTRUMENTS, type Song, type Album, type AlbumVideo, type AlbumPhoto, type Person, type Instrument, type InstrumentVendor, type TrackPerformer, type TrackCredits } from "@/data/musicData";

// Enriched credits as returned by GET /api/songs/:id/credits and
// GET /api/albums/:id/credits. Person/instrument joins are already done
// server-side so the fan-side credits surface renders from a single fetch.
type ApiPerson = { id: string; name: string; photoUrl?: string | null; bio?: string | null };
type ApiVendor = { id: string; instrumentId: string; vendorId: string; name: string; domain?: string; affiliateUrl: string; aboutUrl?: string | null; homeUrl?: string | null; logoUrl?: string | null; tagline?: string | null; bio?: string | null; location?: string | null; coverUrl?: string | null; position: number };
type ApiInstrument = { id: string; name: string; category: string; shortCategory?: string | null; photoUrl?: string | null; about?: string | null; artistNote?: string | null; vendors: ApiVendor[] };
type ApiSongCredits = {
  writers: Array<{ id: string; songId: string; personId: string | null; name: string; role: string; position: number; person: ApiPerson | null }>;
  performers: Array<{ id: string; songId: string; personId: string | null; instrumentId: string | null; name: string; role: string; tuningNotes: string | null; position: number; person: ApiPerson | null; instrument: ApiInstrument | null }>;
};

// API rows use `string | null` for optional columns; the static types use
// `string | undefined`. These tiny coercions keep TS happy and match the
// static-seed shapes already used by the credits sheets.
const nu = <T,>(v: T | null | undefined): T | undefined => v ?? undefined;
function normalizePerson(p: ApiPerson): Person {
  return { id: p.id, name: p.name, photoUrl: nu(p.photoUrl), bio: nu(p.bio) };
}
function normalizeInstrument(i: ApiInstrument): Instrument {
  return {
    id: i.id,
    name: i.name,
    category: i.category,
    shortCategory: nu(i.shortCategory),
    photoUrl: nu(i.photoUrl),
    about: nu(i.about),
    artistNote: nu(i.artistNote),
    vendors: i.vendors.map((v) => ({
      // Static-shape fields the static seed data also fills in.
      name: v.name,
      affiliateUrl: v.affiliateUrl,
      aboutUrl: nu(v.aboutUrl),
      logoUrl: nu(v.logoUrl),
      tagline: nu(v.tagline),
      bio: nu(v.bio),
      location: nu(v.location),
      coverUrl: nu(v.coverUrl),
      // API-only fields needed by VendorSheet (profile fetch + bookmark
      // keying). Static seed rows leave these undefined and fall back
      // gracefully.
      id: v.id,
      vendorId: v.vendorId,
      instrumentId: v.instrumentId,
      homeUrl: v.homeUrl ?? undefined,
      domain: v.domain,
    })),
  };
}

export function AlbumDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { playSong, currentSong, isPlaying, togglePlay, playNext, playLast, addToQueue, queue, currentIndex } = usePlayer();
  const queueHasUpcoming = queue.length - currentIndex - 1 > 0;
  const { user } = useAuth();
  const favSongs = useFavoriteSongs();
  const [showCert, setShowCert] = useState(false);
  const [singleCertNum, setSingleCertNum] = useState<number | null>(null);
  const [provenanceCertNum, setProvenanceCertNum] = useState<number | null>(null);
  const [showOwnership, setShowOwnership] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [shareToast, setShareToast] = useState("");
  const [showPlaylistPicker, setShowPlaylistPicker] = useState<Song | null>(null);
  const [showAlbumPlaylistPicker, setShowAlbumPlaylistPicker] = useState(false);
  const [activeVideo, setActiveVideo] = useState<AlbumVideo | null>(null);
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const [songMenuFor, setSongMenuFor] = useState<{ song: Song; rect: DOMRect } | null>(null);
  const [creditsForSong, setCreditsForSong] = useState<Song | null>(null);
  const [performerSheet, setPerformerSheet] = useState<{ person: Person; song: Song; creditId?: string } | null>(null);
  const [instrumentSheet, setInstrumentSheet] = useState<{ instrument: Instrument; tuningNotes?: string; attribution?: { personId: string; songId: string } } | null>(null);
  const [inAppBrowser, setInAppBrowser] = useState<{ url: string; title: string; logoUrl?: string } | null>(null);
  const [showDescription, setShowDescription] = useState(false);
  const [vendorSheet, setVendorSheet] = useState<{ vendor: InstrumentVendor; instrument: Instrument } | null>(null);
  const [bookmarkedInstruments, setBookmarkedInstruments] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem("gt:bookmarked-instruments");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const toggleBookmarkInstrument = (id: string) => {
    setBookmarkedInstruments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { window.localStorage.setItem("gt:bookmarked-instruments", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };
  // Mirrors the instrument-bookmark store. Persisted client-only via
  // localStorage — same pattern as favorites/downloads/instruments.
  const [bookmarkedVendors, setBookmarkedVendors] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem("gt:bookmarked-vendors");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const toggleBookmarkVendor = (id: string) => {
    setBookmarkedVendors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { window.localStorage.setItem("gt:bookmarked-vendors", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };
  const [downloadedSongs, setDownloadedSongs] = useState<Set<string>>(new Set());

  // Source-of-truth for base album + tracklist is the API (so CMS edits and
  // newly-created albums show up here, including inside the /admin live
  // preview iframe). Static `musicData` is used only as enrichment for
  // fields the DB schema doesn't store yet (videos/photos/owned-cert numbers
  // /credits — those land when their CMS UIs do).
  type ApiAlbum = {
    id: string;
    title: string;
    artist: string;
    artwork: string;
    year: number | null;
    type: "Single" | "EP" | "LP";
    description: string | null;
    goodTunesReleaseDate: string | null;
    streamingReleaseDate: string | null;
    // Denormalized record-label entity (or null). Comes from the album's
    // LEFT JOIN on `labels` so we render name/logo without a second fetch.
    label: {
      id: string;
      name: string;
      logoUrl: string | null;
      websiteUrl: string | null;
    } | null;
    songs: {
      id: string;
      albumId: string;
      title: string;
      trackNumber: number;
      duration: number;
      lyrics: string | null;
      audioUrl: string | null;
      // WebVTT-derived per-line timing uploaded via Admin. When present,
      // Player.tsx uses these timestamps instead of auto-distributing the
      // plain-text `lyrics` field across `duration`.
      syncedLyrics: { timeMs: number; text: string }[] | null;
    }[];
  };
  const { data: apiAlbum } = useQuery<ApiAlbum>({
    queryKey: ["/api/albums", id],
    enabled: !!id,
  });
  const staticAlbum = ALBUMS.find((a) => a.id === id);
  const album: Album | undefined = useMemo(() => {
    if (apiAlbum) {
      return {
        ...(staticAlbum ?? ({} as Album)),
        id: apiAlbum.id,
        title: apiAlbum.title,
        artist: apiAlbum.artist,
        artwork: apiAlbum.artwork,
        year: apiAlbum.year ?? staticAlbum?.year ?? 0,
        type: apiAlbum.type,
        description: apiAlbum.description ?? staticAlbum?.description ?? "",
      };
    }
    return staticAlbum;
  }, [apiAlbum, staticAlbum]);
  const songs: Song[] = useMemo(() => {
    if (apiAlbum) {
      return apiAlbum.songs
        .slice()
        .sort((a, b) => a.trackNumber - b.trackNumber)
        .map((s) => ({
          id: s.id,
          albumId: s.albumId,
          title: s.title,
          trackNumber: s.trackNumber,
          duration: s.duration,
          lyrics: s.lyrics ?? undefined,
          audioUrl: s.audioUrl ?? undefined,
          syncedLyrics: s.syncedLyrics ?? null,
        }));
    }
    return album ? getSongsByAlbum(id) : [];
  }, [apiAlbum, album, id]);

  // True when the currently-playing track belongs to this album AND the
  // player is actively playing (not paused). Drives the Apple-style
  // shrink/grow of the album artwork in the hero.
  const isAlbumPlaying = useMemo(() => {
    if (!isPlaying || !currentSong) return false;
    return songs.some((s) => s.id === currentSong.id);
  }, [isPlaying, currentSong, songs]);

  // SuperCredits™ — fetch every song's credits for this album in one round-trip.
  // CreditsSheet + PerformerSheet both render from the resolved maps below;
  // the static `TRACK_CREDITS` / `PEOPLE` / `INSTRUMENTS` seed is kept as a
  // graceful fallback for songs that haven't been migrated into the DB yet.
  const { data: apiAlbumCredits } = useQuery<{ bySongId: Record<string, ApiSongCredits> }>({
    queryKey: ["/api/albums", id, "credits"],
    enabled: !!id,
  });
  const { creditsBySongId, peopleById, instrumentsById } = useMemo(() => {
    const peopleById = new Map<string, Person>();
    const instrumentsById = new Map<string, Instrument>();
    // Seed with the static rosters first so API-supplied rows override.
    for (const [pid, p] of Object.entries(PEOPLE)) peopleById.set(pid, p);
    for (const [iid, i] of Object.entries(INSTRUMENTS)) instrumentsById.set(iid, i);

    const creditsBySongId = new Map<string, TrackCredits>();
    if (apiAlbumCredits) {
      for (const [songId, api] of Object.entries(apiAlbumCredits.bySongId)) {
        for (const w of api.writers) {
          if (w.person) peopleById.set(w.person.id, normalizePerson(w.person));
        }
        for (const p of api.performers) {
          if (p.person) peopleById.set(p.person.id, normalizePerson(p.person));
          if (p.instrument) instrumentsById.set(p.instrument.id, normalizeInstrument(p.instrument));
        }
        creditsBySongId.set(songId, {
          writers: api.writers.map((w) => ({ name: w.name, role: w.role, personId: w.personId ?? undefined })),
          performers: api.performers.map((p) => ({
            personId: p.personId ?? undefined,
            name: p.name,
            creditId: p.id,
            role: p.role,
            instrumentId: p.instrumentId ?? undefined,
            tuningNotes: p.tuningNotes ?? undefined,
          })),
        });
      }
    }
    return { creditsBySongId, peopleById, instrumentsById };
  }, [apiAlbumCredits]);
  // Helper: live API credits for a song, falling back to the static seed.
  const getCredits = (songId: string): TrackCredits | undefined =>
    creditsBySongId.get(songId) ?? getCreditsForSong(songId);
  // Helper: every track on this album where this performer is credited.
  // Matches by personId when available, falling back to creditId so a
  // single unlinked snapshot row still resolves. Unlinked performers won't
  // cross-link across tracks (no shared identity), but they at least
  // resolve to their own track.
  const getTracksForPerformer = (sel: { personId?: string; creditId?: string }): Array<{ song: Song; performer: TrackPerformer }> => {
    // Defensive: with neither id supplied we'd match the first performer on
    // every song (because `undefined === undefined`), so bail early.
    if (!sel.personId && !sel.creditId) return [];
    const out: Array<{ song: Song; performer: TrackPerformer }> = [];
    for (const song of songs) {
      const c = getCredits(song.id);
      if (!c) continue;
      const perf = c.performers.find((p) =>
        sel.personId ? p.personId === sel.personId : p.creditId === sel.creditId,
      );
      if (perf) out.push({ song, performer: perf });
    }
    return out.sort((a, b) => a.song.trackNumber - b.song.trackNumber);
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollHideNav(scrollRef);
  const tint = "#00062B";
  const ownedNums = album?.ownedCertificates ?? (album?.certificateNumber ? [album.certificateNumber] : []);
  const isMulti = ownedNums.length > 1;

  const moreByArtist = album
    ? ALBUMS.filter((a) => a.artist === album.artist && a.id !== album.id)
    : [];

  useEffect(() => {
    setActiveVideo(null);
    setPhotoIndex(null);
    setShowOwnership(false);
    setProvenanceCertNum(null);
    setSongMenuFor(null);
    setCreditsForSong(null);
    setPerformerSheet(null);
    setInstrumentSheet(null);
    setShowDescription(false);
    if (album) {
      try {
        const raw = localStorage.getItem(`gt:downloaded-songs:${album.id}`);
        setDownloadedSongs(new Set(raw ? (JSON.parse(raw) as string[]) : []));
      } catch { setDownloadedSongs(new Set()); }
    }
  }, [id, album]);

  const toggleSongDownload = (songId: string) => {
    if (!album) return;
    setDownloadedSongs((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      try { localStorage.setItem(`gt:downloaded-songs:${album.id}`, JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  if (!album) {
    return (
      <main className="min-h-screen bg-[#00062B] flex items-center justify-center">
        <div className="text-white text-center">
          <p>Album not found</p>
          <button onClick={() => navigate("/collection")} className="mt-4 text-[#319ED8]">Back to Collection</button>
        </div>
      </main>
    );
  }

  const albumSongs = songs.map((s) => ({ ...s, album }));

  const handlePlaySong = (song: typeof albumSongs[0]) => {
    const isCurrentSong = currentSong?.id === song.id;
    if (isCurrentSong) togglePlay();
    else playSong(song, albumSongs);
  };

  const handlePlayAll = () => {
    if (albumSongs.length > 0) playSong(albumSongs[0], albumSongs);
  };

  const handleShuffle = () => {
    if (albumSongs.length === 0) return;
    const shuffled = [...albumSongs].sort(() => Math.random() - 0.5);
    playSong(shuffled[0], shuffled);
  };

  const totalDuration = songs.reduce((acc, s) => acc + s.duration, 0);
  const totalMin = Math.floor(totalDuration / 60);
  const totalSec = totalDuration % 60;
  const runtime = `${totalMin} min${totalSec > 0 ? ` ${totalSec} sec` : ""}`;
  const hasVideos = !!album.videos?.length;
  const hasPhotos = !!album.photos?.length;
  const hasMoreBy = moreByArtist.length > 0;

  return (
    <main className="h-screen w-full bg-[#00062B] flex justify-center overflow-hidden relative">
      <section className="relative w-full h-screen text-white flex flex-col">
        <button
          type="button"
          onClick={() => navigate("/collection")}
          aria-label="Back to collection"
          className="absolute top-11 left-4 z-50 w-12 h-12 rounded-full backdrop-blur flex items-center justify-center text-white active:opacity-70"
          style={{ background: "rgba(0,0,0,0.45)" }}
          data-testid="button-back-album"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div className="absolute top-11 right-4 z-50 flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              const url = `${window.location.origin}/album/${album.id}`;
              const shareData = { title: album.title, text: `${album.title} by ${album.artist}`, url };
              try {
                if (navigator.share) await navigator.share(shareData);
                else {
                  await navigator.clipboard.writeText(url);
                  setShareToast("Link copied");
                  setTimeout(() => setShareToast(""), 2000);
                }
              } catch {}
            }}
            aria-label="Share album"
            className="w-12 h-12 rounded-full backdrop-blur flex items-center justify-center text-white active:opacity-70"
            style={{ background: "rgba(0,0,0,0.45)" }}
            data-testid="button-share-album"
          >
            {/* iOS share glyph — square + up arrow */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4" />
              <path d="M8 8l4-4 4 4" />
              <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu((s) => !s)}
              aria-label="Album options"
              aria-haspopup="menu"
              aria-expanded={showMenu}
              className="w-12 h-12 rounded-full backdrop-blur flex items-center justify-center text-white active:opacity-70"
              style={{ background: "rgba(0,0,0,0.45)" }}
              data-testid="button-album-menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            </button>
          </div>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 z-40 rounded-2xl py-1 min-w-[230px] overflow-hidden"
                style={{
                  background: "rgba(28, 30, 38, 0.96)",
                  backdropFilter: "blur(28px) saturate(180%)",
                  WebkitBackdropFilter: "blur(28px) saturate(180%)",
                  boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <button
                  type="button"
                  onClick={() => { setShowMenu(false); setShowCert(true); }}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-white active:bg-white/10"
                  data-testid="menu-view-certificate"
                >
                  <span>View GoodDeed®</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4AFFCA" strokeWidth="2">
                    <path d="M9 12l2 2 4-4M7.8 4.7a3.4 3.4 0 001.95-.8 3.4 3.4 0 014.4 0 3.4 3.4 0 001.95.8 3.4 3.4 0 013.15 3.15 3.4 3.4 0 00.8 1.95 3.4 3.4 0 010 4.4 3.4 3.4 0 00-.8 1.95 3.4 3.4 0 01-3.15 3.15 3.4 3.4 0 00-1.95.8 3.4 3.4 0 01-4.4 0 3.4 3.4 0 00-1.95-.8 3.4 3.4 0 01-3.15-3.15 3.4 3.4 0 00-.8-1.95 3.4 3.4 0 010-4.4 3.4 3.4 0 00.8-1.95 3.4 3.4 0 013.15-3.15z" />
                  </svg>
                </button>
                <div className="h-px bg-white/8" />
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    if (isMulti) setShowOwnership(true);
                    else setProvenanceCertNum(ownedNums[0] ?? album.certificateNumber ?? 1);
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-white active:bg-white/10"
                  data-testid="menu-view-provenance"
                >
                  <span>{isMulti ? "Ownership" : "View Provenance"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                </button>
                <div className="h-px bg-white/8" />
                <button
                  type="button"
                  onClick={() => { setShowMenu(false); setShowAlbumPlaylistPicker(true); }}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-white active:bg-white/10"
                  data-testid="menu-add-album-to-playlist"
                >
                  <span>Add to Playlist</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="6" x2="14" y2="6" />
                    <line x1="3" y1="12" x2="14" y2="12" />
                    <line x1="3" y1="18" x2="10" y2="18" />
                    <line x1="18" y1="9" x2="18" y2="21" />
                    <line x1="12" y1="15" x2="24" y2="15" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide" style={{ paddingBottom: 160 }} data-testid="scroll-album">
          {/* Hero region — Apple-Music-style: a centered square artwork
              with a soft shadow, then the title / artist / meta stack
              centered below. The previous full-bleed hero + tinted gradient
              + LP badge + caret-after-artist were dropped to match Apple's
              album header more literally (per design feedback). The label
              now lives only in the metadata footer below the tracklist. */}
          <div style={{ background: "#00062B" }}>
            {/* pt-24 reserves a clear band above the artwork for the
                floating back / share / ⋯ chrome (anchored at top-11 with
                12-unit buttons → ends around 92px). Without this padding
                those buttons sat on top of the cover art, exactly the
                overlap Apple avoids in their album header. */}
            <div className="pt-24 px-6 flex justify-center">
              <div
                className="w-[72%] max-w-[300px] rounded-xl overflow-hidden transition-transform duration-300 ease-out"
                style={{
                  aspectRatio: "1 / 1",
                  boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
                  // Apple-style play/pause "breathing" — when a track
                  // from this album is the active, *playing* song, the
                  // cover sits at full size; otherwise it shrinks to
                  // ~92% so the difference is felt the moment the user
                  // taps play (and again the moment they pause).
                  transform: isAlbumPlaying ? "scale(1)" : "scale(0.92)",
                }}
              >
                <img
                  src={album.artwork}
                  alt=""
                  className="w-full h-full object-cover block"
                />
              </div>
            </div>

            <div className="relative pt-4 pb-3 px-5 text-center">
              <h1
                className="text-white text-[22px] font-bold leading-tight tracking-tight"
                data-testid="text-album-title"
              >
                {album.title}
              </h1>
              <button
                type="button"
                onClick={() =>
                  navigate(`/artist/${encodeURIComponent(album.artist)}`)
                }
                className="mt-1 text-[17px] font-medium active:opacity-70"
                style={{ color: "#319ED8" }}
                data-testid="link-album-artist"
              >
                {album.artist}
              </button>
              {/* Genre · Year muted meta line — Apple's "Afro-Pop · 1994 ·
                  Lossless" pattern. Both tokens are optional; we join only
                  what's available so the line never starts with a bullet. */}
              {(album.genre || album.year) && (
                <p
                  className="text-[13px] mt-1"
                  style={{ color: "#98A2B3" }}
                  data-testid="text-album-meta"
                >
                  {[album.genre, album.year].filter(Boolean).join(" · ")}
                </p>
              )}
              {album.description && (
                <ClampedDescription
                  text={album.description}
                  onExpand={() => setShowDescription(true)}
                />
              )}
            </div>

          </div>

          {/* Play / Shuffle / Add bar */}
          <div className="flex items-center justify-center gap-3 px-5 mt-1 mb-3">
            <button
              type="button"
              onClick={handleShuffle}
              aria-label="Shuffle album"
              className="w-12 h-12 rounded-full flex items-center justify-center text-white active:scale-[0.94] transition-transform flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.08)" }}
              data-testid="button-shuffle-album"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handlePlayAll}
              className="flex items-center justify-center gap-2.5 h-12 px-10 rounded-full font-semibold text-[17px] active:scale-[0.98] transition-transform"
              style={{ background: "#fff", color: "#00062B" }}
              data-testid="button-play-album"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
              Play
            </button>
            {(() => {
              const allDownloaded = songs.length > 0 && songs.every((s) => downloadedSongs.has(s.id));
              return (
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(downloadedSongs);
                    if (allDownloaded) songs.forEach((s) => next.delete(s.id));
                    else songs.forEach((s) => next.add(s.id));
                    setDownloadedSongs(next);
                    try { localStorage.setItem(`gt:downloaded-songs:${album.id}`, JSON.stringify(Array.from(next))); } catch {}
                  }}
                  aria-label={allDownloaded ? "Remove album downloads" : "Download album"}
                  aria-pressed={allDownloaded}
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white active:scale-[0.94] transition-transform flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                  data-testid="button-download-album"
                >
                  {allDownloaded ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12.5l4 4L19 7.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v12" />
                      <path d="M7 12.5L12 17.5l5-5" />
                    </svg>
                  )}
                </button>
              );
            })()}
          </div>

          {/* Tracks */}
          <div className="bg-[#00062B] px-5 mt-5 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            {songs.map((song, i) => {
              const isActive = currentSong?.id === song.id;
              return (
                <div
                  key={song.id}
                  className="flex items-center gap-3 h-16 active:bg-white/[0.03] transition-colors"
                  data-testid={`row-track-${song.id}`}
                >
                  <button
                    type="button"
                    onClick={() => handlePlaySong({ ...song, album })}
                    className="flex items-center gap-4 flex-1 min-w-0 h-full text-left"
                  >
                    <div className="w-6 flex-shrink-0 flex items-center justify-center">
                      {isActive ? (
                        <div className="flex gap-0.5 items-end h-4">
                          {[1, 2, 3].map((j) => (
                            <div
                              key={j}
                              className="w-0.5 rounded-full"
                              style={{
                                background: "#319ED8",
                                height: isPlaying ? `${40 + j * 20}%` : "40%",
                                animationName: isPlaying ? "pulse" : "none",
                                animationDuration: `${0.5 + j * 0.1}s`,
                                animationIterationCount: "infinite",
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-[15px] tabular-nums" style={{ color: "rgba(255,255,255,0.32)" }}>{song.trackNumber}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 relative h-full flex items-center">
                      <p className={`text-[15px] font-medium truncate ${isActive ? "text-[#319ED8]" : "text-white"}`}>
                        {song.title}
                      </p>
                      {i > 0 && (
                        <span
                          className="absolute left-0 right-0 top-0 h-px pointer-events-none"
                          style={{ background: "rgba(255,255,255,0.07)" }}
                        />
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSongDownload(song.id)}
                    aria-label={downloadedSongs.has(song.id) ? "Remove download" : "Download to this device"}
                    aria-pressed={downloadedSongs.has(song.id)}
                    className="w-9 h-9 flex items-center justify-center flex-shrink-0 active:scale-[0.9] transition-transform"
                    data-testid={`button-download-song-${song.id}`}
                  >
                    {downloadedSongs.has(song.id) ? (
                      // Downloaded: filled circle with check (Apple's "in library / downloaded")
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.85)" />
                        <path d="M8 12.5l2.8 2.8L16.5 9.5" stroke="#00062B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                    ) : (
                      // Not downloaded: Apple's outlined circle with down arrow
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 7v8" />
                        <path d="M8.5 11.5L12 15l3.5-3.5" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => setSongMenuFor({ song, rect: e.currentTarget.getBoundingClientRect() })}
                    aria-label="Song options"
                    aria-haspopup="menu"
                    aria-expanded={songMenuFor?.song.id === song.id}
                    className="w-7 h-9 flex items-center justify-center text-white/40 flex-shrink-0"
                    data-testid={`button-track-menu-${song.id}`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5" cy="12" r="1.6" />
                      <circle cx="12" cy="12" r="1.6" />
                      <circle cx="19" cy="12" r="1.6" />
                    </svg>
                  </button>
                </div>
              );
            })}
            <div className="h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
          </div>

          {/* Bonus content — surfaces only when the album has uploaded
              videos/photos. Keeps clean albums looking identical to before. */}
          <AlbumBonusContent albumId={album.id} />

          {/* Metadata block — Apple-Music-style footer that lives BELOW
              the tracklist (not above it). Carries release year, total
              runtime, label, and ownership. Year + label were previously
              up in the title block; moved here to match Apple's pattern
              where the date/copyright row sits under the tracks. */}
          <div className="px-5 mt-7">
            <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.32)" }}>
              <span className="block" data-testid="text-album-year-footer">{album.year}</span>
              <span className="block mt-0.5">{songs.length} {songs.length === 1 ? "song" : "songs"}, {runtime}</span>
              {apiAlbum?.label && (
                <span
                  className="mt-1 inline-flex items-center gap-1.5"
                  data-testid={`text-album-label-footer-${apiAlbum.label.id}`}
                >
                  {apiAlbum.label.logoUrl && (
                    <img
                      src={apiAlbum.label.logoUrl}
                      alt=""
                      className="w-3.5 h-3.5 rounded-sm object-contain bg-white/10"
                    />
                  )}
                  <span>{apiAlbum.label.name}</span>
                </span>
              )}
              {ownedNums.length > 0 && (
                <span className="block mt-1">
                  You own {ownedNums.length === 1 ? `No. ${(ownedNums[0]).toString().padStart(2, "0")}` : `${ownedNums.length} certificates`} of this {album.type === "EP" ? "EP" : album.type === "Single" ? "single" : "LP"}.
                </span>
              )}
            </p>
          </div>

          {/* Editorial panel — slightly lighter shelf for Music Videos / Photos / More By */}
          {(hasVideos || hasPhotos || hasMoreBy) && (
          <div
            className="mt-8 pt-7 pb-4"
            style={{
              background: "rgba(255,255,255,0.03)",
              borderTop: "1px solid rgba(255,255,255,0.07)",
            }}
          >
          {/* Music Videos */}
          {hasVideos && (
            <div>
              <h2 className="text-white text-xl font-bold tracking-tight mb-3 px-5">Music Videos</h2>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide px-5 pb-2" data-testid="section-videos">
                {album.videos!.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setActiveVideo(v)}
                    className="relative flex-shrink-0 rounded-2xl overflow-hidden text-left active:opacity-90"
                    style={{ width: 280, aspectRatio: "16 / 9" }}
                    data-testid={`video-${v.id}`}
                  >
                    <img src={v.thumbnail} alt={v.title} className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,6,43,0.85) 0%, rgba(0,6,43,0.05) 60%)" }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-13 h-13 w-[52px] h-[52px] rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.3)" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                          <path d="M8 5.14v14l11-7-11-7z" />
                        </svg>
                      </div>
                    </div>
                    <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2">
                      <p className="text-white text-xs font-semibold leading-tight line-clamp-2">{v.title}</p>
                      {v.duration && (
                        <span className="text-[10px] font-semibold text-white px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ background: "rgba(0,0,0,0.55)" }}>
                          {v.duration}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Photos */}
          {hasPhotos && (
            <div className={hasVideos ? "mt-9" : ""}>
              <h2 className="text-white text-xl font-bold tracking-tight mb-3 px-5">Photos</h2>
              <div className="px-5 grid grid-cols-3 gap-1.5" data-testid="section-photos">
                {album.photos!.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPhotoIndex(idx)}
                    className="relative rounded-xl overflow-hidden active:opacity-80"
                    style={{ aspectRatio: "1 / 1" }}
                    data-testid={`photo-${p.id}`}
                  >
                    <img src={p.url} alt={p.caption ?? ""} className="absolute inset-0 w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* More By Artist */}
          {hasMoreBy && (
            <div className={hasVideos || hasPhotos ? "mt-9" : ""}>
              <button
                type="button"
                onClick={() => navigate(`/artist/${encodeURIComponent(album.artist)}`)}
                className="flex items-center gap-1 px-5 mb-3 active:opacity-70"
                data-testid="link-more-by-artist"
              >
                <h2 className="text-white text-xl font-bold tracking-tight">More By {album.artist}</h2>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="text-white/55">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide px-5 pb-2" data-testid="section-more-by">
                {moreByArtist.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => navigate(`/album/${a.id}`)}
                    className="flex-shrink-0 flex flex-col text-left active:scale-[0.97] transition-transform"
                    style={{ width: 130 }}
                    data-testid={`more-by-${a.id}`}
                  >
                    <div className="w-full aspect-square rounded-2xl overflow-hidden" style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
                      <img src={a.artwork} alt={a.title} className="w-full h-full object-cover" />
                    </div>
                    <p className="text-white text-xs font-semibold leading-tight truncate mt-2">{a.title}</p>
                    <p className="text-white/45 text-[11px] truncate mt-0.5">{a.year}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          </div>
          )}
        </div>

        <MiniPlayer />
        <BottomNav />

        {showCert && (
          <GoodDeedCertificate
            album={album}
            ownerName={user?.displayName || "GoodTunes Fan"}
            identities={{
              realName: user?.realName ?? null,
              displayName: user?.displayName || "GoodTunes Fan",
              username: user?.username || "you",
            }}
            certificateNumber={singleCertNum ?? album.certificateNumber ?? 1}
            certificateNumbers={singleCertNum !== null ? [singleCertNum] : album.ownedCertificates}
            onClose={() => { setShowCert(false); setSingleCertNum(null); }}
          />
        )}

        {showPlaylistPicker && (
          <PlaylistPickerSheet
            songId={showPlaylistPicker.id}
            songTitle={showPlaylistPicker.title}
            onClose={() => setShowPlaylistPicker(null)}
          />
        )}

        {showAlbumPlaylistPicker && (
          <PlaylistPickerSheet
            songIds={songs.map((s) => s.id)}
            songTitle={`${album.title} · ${songs.length} song${songs.length === 1 ? "" : "s"}`}
            heading="Add Album to Playlist"
            onClose={() => setShowAlbumPlaylistPicker(false)}
          />
        )}

        {showDescription && album.description && (
          <AlbumDescriptionSheet
            album={album}
            onClose={() => setShowDescription(false)}
          />
        )}

        {provenanceCertNum !== null && (
          <ProvenanceSheet
            onViewGoodDeed={(n) => { setProvenanceCertNum(null); setShowCert(true); setSingleCertNum(n); }}
            album={album}
            ownerName={user?.displayName || "GoodTunes Fan"}
            certNum={provenanceCertNum}
            onClose={() => setProvenanceCertNum(null)}
          />
        )}

        {showOwnership && (
          <OwnershipSheet
            album={album}
            ownerName={user?.displayName || "GoodTunes Fan"}
            onClose={() => setShowOwnership(false)}
            onSelectCert={(n) => { setShowOwnership(false); setProvenanceCertNum(n); }}
          />
        )}

        {songMenuFor && (() => {
          const s = songMenuFor.song;
          return (
            <SongActionPopover
              song={s}
              album={album}
              anchorRect={songMenuFor.rect}
              isFavorite={favSongs.has(s.id)}
              onToggleFavorite={() => favSongs.toggle(s.id)}
              onShare={async () => {
                const url = `${window.location.origin}/album/${album.id}`;
                try {
                  if (navigator.share) await navigator.share({ title: s.title, text: `${s.title} — ${album.artist}`, url });
                  else {
                    await navigator.clipboard.writeText(url);
                    setShareToast("Link copied");
                    setTimeout(() => setShareToast(""), 2000);
                  }
                } catch {}
              }}
              onAddToPlaylist={() => { setSongMenuFor(null); setShowPlaylistPicker(s); }}
              onPlayNext={() => { playNext({ ...s, album }); setShareToast("Playing next"); setTimeout(() => setShareToast(""), 1600); }}
              onAddToQueue={() => { addToQueue({ ...s, album }); setShareToast("Added to Queue"); setTimeout(() => setShareToast(""), 1600); }}
              onPlayLast={() => { playLast({ ...s, album }); setShareToast("Added to queue"); setTimeout(() => setShareToast(""), 1600); }}
              queueHasUpcoming={queueHasUpcoming}
              onViewCredits={() => { setSongMenuFor(null); setCreditsForSong(s); }}
              hasCredits={!!getCredits(s.id)}
              onClose={() => setSongMenuFor(null)}
            />
          );
        })()}

        {/* Only one SuperCredits sheet is mounted at a time (instrument > performer > credits)
            so we don't stack multiple aria-modal dialogs simultaneously. */}
        {inAppBrowser ? (
          <InAppBrowserSheet
            url={inAppBrowser.url}
            title={inAppBrowser.title}
            logoUrl={inAppBrowser.logoUrl}
            onClose={() => setInAppBrowser(null)}
          />
        ) : vendorSheet ? (
          <VendorSheet
            vendor={vendorSheet.vendor}
            instrument={vendorSheet.instrument}
            isBookmarked={!!vendorSheet.vendor.vendorId && bookmarkedVendors.has(vendorSheet.vendor.vendorId)}
            onToggleBookmark={() => vendorSheet.vendor.vendorId && toggleBookmarkVendor(vendorSheet.vendor.vendorId)}
            onOpenInAppBrowser={(b) => setInAppBrowser(b)}
            onMessageVendor={(vendor) => {
              const inst = vendorSheet.instrument;
              try {
                const domain = new URL(vendor.affiliateUrl).hostname.replace(/^www\./, "");
                const tid = startVendorChatAboutInstrument({
                  kind: "instrument",
                  instrumentId: inst.id,
                  instrumentName: inst.name,
                  instrumentCategory: inst.shortCategory ?? inst.category,
                  instrumentPhotoUrl: inst.photoUrl,
                  vendorName: vendor.name,
                  vendorLogoUrl: vendor.logoUrl,
                  vendorDomain: domain,
                  url: vendor.affiliateUrl,
                });
                setVendorSheet(null);
                navigate(`/chat/${encodeURIComponent(tid)}`);
              } catch {
                toast({ title: "Couldn't start chat", description: "Invalid vendor link." });
              }
            }}
            onOpenInstrument={(inst) => {
              // Close the vendor sheet and swap in the InstrumentSheet for
              // the tapped gear row. The vendor stays in scope (no
              // attribution shown) because we're navigating *from* a
              // vendor profile rather than a song credit.
              setVendorSheet(null);
              setInstrumentSheet({ instrument: inst });
            }}
            onClose={() => setVendorSheet(null)}
          />
        ) : instrumentSheet ? (
          <InstrumentSheet
            instrument={instrumentSheet.instrument}
            tuningNotes={instrumentSheet.tuningNotes}
            attribution={instrumentSheet.attribution}
            isBookmarked={bookmarkedInstruments.has(instrumentSheet.instrument.id)}
            onToggleBookmark={() => toggleBookmarkInstrument(instrumentSheet.instrument.id)}
            onOpenInAppBrowser={(b) => setInAppBrowser(b)}
            onOpenVendor={(vendor) => setVendorSheet({ vendor, instrument: instrumentSheet.instrument })}
            onMessageVendor={(vendor) => {
              const inst = instrumentSheet.instrument;
              try {
                const domain = new URL(vendor.affiliateUrl).hostname.replace(/^www\./, "");
                const tid = startVendorChatAboutInstrument({
                  kind: "instrument",
                  instrumentId: inst.id,
                  instrumentName: inst.name,
                  instrumentCategory: inst.shortCategory ?? inst.category,
                  instrumentPhotoUrl: inst.photoUrl,
                  vendorName: vendor.name,
                  vendorLogoUrl: vendor.logoUrl,
                  vendorDomain: domain,
                  url: vendor.affiliateUrl,
                });
                setInstrumentSheet(null);
                navigate(`/chat/${encodeURIComponent(tid)}`);
              } catch {
                toast({ title: "Couldn't start chat", description: "Invalid vendor link." });
              }
            }}
            onClose={() => setInstrumentSheet(null)}
          />
        ) : performerSheet ? (
          <PerformerSheet
            person={performerSheet.person}
            song={performerSheet.song}
            album={album}
            selectedCreditId={performerSheet.creditId}
            currentSongCredits={getCredits(performerSheet.song.id)}
            otherTracks={getTracksForPerformer({
              personId: performerSheet.person.id.startsWith("unlinked-") ? undefined : performerSheet.person.id,
              creditId: performerSheet.creditId,
            }).filter(({ song: s }) => s.id !== performerSheet.song.id)}
            resolveInstrument={(iid) => (iid ? instrumentsById.get(iid) : undefined)}
            onOpenInstrument={(instrument, tuningNotes, attribution) => setInstrumentSheet({ instrument, tuningNotes, attribution })}
            onClose={() => setPerformerSheet(null)}
          />
        ) : creditsForSong ? (
          <CreditsSheet
            song={creditsForSong}
            album={album}
            credits={getCredits(creditsForSong.id)}
            resolvePerson={(pid) => (pid ? peopleById.get(pid) : undefined)}
            resolveInstrument={(iid) => (iid ? instrumentsById.get(iid) : undefined)}
            onOpenPerformer={(person, creditId) => setPerformerSheet({ person, song: creditsForSong, creditId })}
            onOpenInstrument={(instrument, tuningNotes, attribution) => setInstrumentSheet({ instrument, tuningNotes, attribution })}
            onClose={() => setCreditsForSong(null)}
          />
        ) : null}

        {activeVideo && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label={activeVideo.title}
            data-testid="modal-video"
          >
            <div className="absolute inset-0 bg-black/85" style={{ backdropFilter: "blur(8px)" }} onClick={() => setActiveVideo(null)} />
            <div className="relative w-full max-w-[390px] z-10 px-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-white text-sm font-semibold truncate pr-3">{activeVideo.title}</p>
                <button
                  type="button"
                  onClick={() => setActiveVideo(null)}
                  aria-label="Close video"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70 flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(20px)" }}
                  data-testid="button-close-video"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <video
                src={activeVideo.url}
                poster={activeVideo.thumbnail}
                controls
                autoPlay
                playsInline
                className="w-full rounded-2xl bg-black"
                style={{ aspectRatio: "16 / 9" }}
              />
            </div>
          </div>
        )}

        {photoIndex !== null && album.photos && (
          <PhotoLightbox
            photos={album.photos}
            startIndex={photoIndex}
            onClose={() => setPhotoIndex(null)}
          />
        )}

        {shareToast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-full text-white text-sm font-medium" style={{ background: "rgba(20,22,30,0.95)", backdropFilter: "blur(20px)", boxShadow: "0 12px 32px rgba(0,0,0,0.5)" }}>
            {shareToast}
          </div>
        )}
      </section>
    </main>
  );
}

function ProvenanceSheet({ album, ownerName, certNum, onClose, onViewGoodDeed }: { album: Album; ownerName: string; certNum: number; onClose: () => void; onViewGoodDeed?: (n: number) => void }) {
  const events = [
    { date: "2025-11-21", actor: ownerName, action: "Acquired via secondary transfer", color: "#4AFFCA" },
    { date: "2024-08-04", actor: "Original Owner", action: `Purchased from ${album.artist}`, color: "#319ED8" },
    { date: "2024-03-12", actor: "GoodTunes® Created", action: "Certificate #" + certNum + " created", color: "#7F10A7" },
  ];
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={`Provenance for ${album.title} certificate ${certNum}`}>
      <div className="absolute inset-0 bg-black/65" style={{ backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div className="relative w-full max-w-[390px] bg-[#0D1B4B] rounded-t-3xl pt-3 pb-8 z-10 flex flex-col" style={{ maxHeight: "82vh" }}>
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 flex-shrink-0" />
        <div className="flex items-center justify-between px-5 mb-4 flex-shrink-0">
          <div>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Digital Provenance</p>
            <h3 className="text-white font-semibold text-base mt-0.5">{album.title}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-[#319ED8] text-sm font-semibold" data-testid="button-close-provenance">Done</button>
        </div>

        <div className="px-5 mb-4 flex-shrink-0">
          <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: "rgba(74,255,202,0.08)", border: "1px solid rgba(74,255,202,0.2)" }}>
            <img src={album.artwork} alt={album.title} className="w-12 h-12 rounded-xl object-cover" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">Certificate #{certNum}</p>
              <p className="text-white/50 text-xs mt-0.5 truncate">Currently held by {ownerName}</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: "rgba(74,255,202,0.18)", color: "#4AFFCA" }}>VERIFIED</span>
          </div>
          {onViewGoodDeed && (
            <button
              type="button"
              onClick={() => onViewGoodDeed(certNum)}
              className="w-full mt-2.5 flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold text-white active:opacity-70 transition-opacity"
              style={{ background: "rgba(49,158,216,0.14)", border: "1px solid rgba(49,158,216,0.28)" }}
              data-testid="button-view-this-gooddeed"
            >
              <span>View GoodDeed® No. {certNum.toString().padStart(2, "0")}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="2.2" strokeLinecap="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-5">
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-3">Ownership chain</p>
          <div className="relative pl-5">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/10" />
            {events.map((e, i) => (
              <div key={i} className="relative pb-5 last:pb-0">
                <div className="absolute -left-[18px] top-1 w-3 h-3 rounded-full" style={{ background: e.color, boxShadow: `0 0 0 3px rgba(0,6,43,1), 0 0 12px ${e.color}55` }} />
                <p className="text-white/40 text-[11px]">{e.date}</p>
                <p className="text-white text-sm font-semibold mt-0.5">{e.actor}</p>
                <p className="text-white/55 text-xs mt-0.5">{e.action}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function OwnershipSheet({
  album,
  ownerName,
  onClose,
  onSelectCert,
}: {
  album: Album;
  ownerName: string;
  onClose: () => void;
  onSelectCert: (n: number) => void;
}) {
  const owned = album.ownedCertificates ?? [];
  const purchasesByNum = new Map((album.purchases ?? []).map((p) => [p.num, p]));
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Ownership">
      <div className="absolute inset-0 bg-black/65" style={{ backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div className="relative w-full max-w-[390px] bg-[#0D1B4B] rounded-t-3xl pt-3 pb-8 z-10 flex flex-col" style={{ maxHeight: "82vh" }}>
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 flex-shrink-0" />
        <div className="flex items-center justify-between px-5 mb-1 flex-shrink-0">
          <div>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Ownership</p>
            <h3 className="text-white font-semibold text-base mt-0.5">{album.title}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-[#319ED8] text-sm font-semibold" data-testid="button-close-ownership">Done</button>
        </div>
        <p className="px-5 text-white/50 text-xs mb-4">Held by {ownerName} · {owned.length} cop{owned.length === 1 ? "y" : "ies"}</p>

        <div className="px-5 mb-2 flex items-center text-[10px] font-bold uppercase tracking-widest text-white/40">
          <div className="w-16">No.</div>
          <div className="flex-1">Price</div>
          <div className="w-24 text-right">Date</div>
          <div className="w-5" />
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-3">
          {owned.map((num, i) => {
            const p = purchasesByNum.get(num);
            return (
              <button
                key={num}
                type="button"
                onClick={() => onSelectCert(num)}
                className="w-full flex items-center px-2 py-3.5 rounded-xl text-left active:bg-white/5 transition-colors"
                style={{ background: i % 2 === 0 ? "rgba(49,158,216,0.07)" : "transparent" }}
                data-testid={`row-cert-${num}`}
              >
                <div className="w-16 text-white text-sm font-semibold">#{num}</div>
                <div className="flex-1 text-white/80 text-sm">{p ? `$${p.price.toFixed(2)}` : "—"}</div>
                <div className="w-24 text-right text-white/55 text-xs">{p?.date ?? "—"}</div>
                <div className="w-5 flex justify-end text-white/35">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>

        <p className="px-5 mt-3 text-white/35 text-[11px] text-center">Tap a row to view that copy's provenance.</p>
      </div>
    </div>
  );
}

// ────────────────────── Song ⋯ popover (Apple-style) ──────────────────────
// Light glass popover anchored to the tapped ⋯ button. Opens to the left
// of the trigger and chooses up/down placement based on available space,
// matching iOS's Apple Music context menu.

function SongActionPopover({
  song,
  album,
  anchorRect,
  isFavorite,
  onToggleFavorite,
  onShare,
  onAddToPlaylist,
  onPlayNext,
  onAddToQueue,
  onPlayLast,
  onViewCredits,
  onClose,
  queueHasUpcoming,
  hasCredits,
}: {
  song: Song;
  album: Album;
  anchorRect: DOMRect;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onShare: () => void;
  onAddToPlaylist: () => void;
  onPlayNext: () => void;
  onAddToQueue: () => void;
  onPlayLast: () => void;
  onViewCredits: () => void;
  onClose: () => void;
  queueHasUpcoming: boolean;
  hasCredits: boolean;
}) {
  const POP_W = 244;
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; placement: "below" | "above" } | null>(null);

  // Animate in once mounted (so transform-origin → scale feels anchored).
  const [shown, setShown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(id); }, []);

  // Esc-to-close + dismiss on any scroll (anchorRect is captured at click
  // time, so once the underlying list scrolls the popover would detach from
  // its trigger — Apple closes its context menu on scroll for the same
  // reason).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onScroll = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true); // capture to catch nested scrollers
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  // Position after layout — needs the panel's measured height.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const GAP = 8;
    const SAFE = 12;
    // Right-edge aligned with trigger's right edge, but kept inside the viewport.
    const rawLeft = anchorRect.right - POP_W;
    const left = Math.max(SAFE, Math.min(rawLeft, vw - POP_W - SAFE));
    // Prefer below; flip above if it would clip.
    const fitsBelow = anchorRect.bottom + GAP + h + SAFE <= vh;
    const top = fitsBelow ? anchorRect.bottom + GAP : Math.max(SAFE, anchorRect.top - GAP - h);
    setPos({ top, left, placement: fitsBelow ? "below" : "above" });
  }, [anchorRect]);

  const close = (run?: () => void) => () => { run?.(); onClose(); };

  // Apple-style row: black icon on left, label right. Tight spacing.
  const Row = ({ label, icon, onClick, testId, disabled }: { label: string; icon: ReactNode; onClick: () => void; testId: string; disabled?: boolean }) => (
    <button
      type="button"
      role="menuitem"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 ${disabled ? "opacity-40" : "active:bg-black/[0.06]"}`}
      data-testid={testId}
    >
      <span className="text-[15px] text-black truncate">{label}</span>
      <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-black">{icon}</span>
    </button>
  );

  const Divider = () => <div className="h-px bg-black/10 mx-3" />;

  // transform-origin so the scale-in feels rooted near the trigger
  const originY = pos?.placement === "above" ? "bottom" : "top";

  return (
    <div
      className="fixed inset-0 z-[75]"
      role="presentation"
      data-testid="popover-song-actions"
      onClick={onClose}
    >
      {/* Subtle scrim — Apple barely dims; keeps the row context visible. */}
      <div className="absolute inset-0 bg-black/15" />
      <div
        ref={panelRef}
        role="menu"
        aria-label={`Options for ${song.title}`}
        onClick={(e) => e.stopPropagation()}
        className="absolute"
        style={{
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          width: POP_W,
          background: "rgba(245, 245, 247, 0.82)",
          backdropFilter: "blur(28px) saturate(180%)",
          WebkitBackdropFilter: "blur(28px) saturate(180%)",
          borderRadius: 14,
          boxShadow: "0 12px 40px rgba(0,0,0,0.32), 0 1px 0 rgba(255,255,255,0.4) inset",
          overflow: "hidden",
          transformOrigin: `right ${originY}`,
          transform: shown ? "scale(1)" : "scale(0.92)",
          opacity: shown ? 1 : 0,
          transition: "transform 160ms cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 120ms ease-out",
          visibility: pos ? "visible" : "hidden",
        }}
      >
        {/* Top: Favorite + Share — Apple's two-up icon-over-label header */}
        <div className="flex items-stretch">
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={isFavorite}
            onClick={() => { onToggleFavorite(); }}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-3 active:bg-black/[0.06]"
            data-testid="button-popover-favorite"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill={isFavorite ? "#FF5470" : "none"} stroke={isFavorite ? "#FF5470" : "#000"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span className="text-[12px] text-black">{isFavorite ? "Favorited" : "Favorite"}</span>
          </button>
          <div className="w-px bg-black/10 my-2" />
          <button
            type="button"
            role="menuitem"
            onClick={close(onShare)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-3 active:bg-black/[0.06]"
            data-testid="button-popover-share"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4" />
              <path d="M8 8l4-4 4 4" />
              <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
            <span className="text-[12px] text-black">Share</span>
          </button>
        </div>
        <Divider />
        <Row
          label="Add to Playlist"
          testId="row-popover-add-playlist"
          onClick={close(onAddToPlaylist)}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="14" y2="6" />
              <line x1="3" y1="12" x2="14" y2="12" />
              <line x1="3" y1="18" x2="10" y2="18" />
              <line x1="18" y1="9" x2="18" y2="21" />
              <line x1="12" y1="15" x2="24" y2="15" />
            </svg>
          }
        />
        <Divider />
        <Row
          label="Play Next"
          testId="row-popover-play-next"
          onClick={close(onPlayNext)}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="14" y2="6" />
              <line x1="3" y1="12" x2="14" y2="12" />
              <line x1="3" y1="18" x2="14" y2="18" />
              <polygon points="18,7 22,12 18,17" fill="currentColor" stroke="none" />
            </svg>
          }
        />
        {/* Apple shows "Add to Queue" only after an Up Next list exists.
            We mirror that: render it when the user has staged at least one
            song after the current track. */}
        {queueHasUpcoming && (
          <Row
            label="Add to Queue"
            testId="row-popover-add-to-queue"
            onClick={close(onAddToQueue)}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="14" y2="6" />
                <line x1="3" y1="12" x2="14" y2="12" />
                <line x1="3" y1="18" x2="14" y2="18" />
                <line x1="19" y1="9" x2="19" y2="15" />
                <line x1="16" y1="12" x2="22" y2="12" />
              </svg>
            }
          />
        )}
        <Row
          label="Play Last"
          testId="row-popover-play-last"
          onClick={close(onPlayLast)}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="14" y2="12" />
              <line x1="3" y1="18" x2="14" y2="18" />
              <polygon points="18,15 22,18 18,21" fill="currentColor" stroke="none" />
            </svg>
          }
        />
        <Divider />
        <Row
          label="View SuperCredits™"
          testId="row-popover-credits"
          disabled={!hasCredits}
          onClick={close(onViewCredits)}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v.01M11 12h1v4h1" />
            </svg>
          }
        />
      </div>
    </div>
  );
}

// ──────────────────────────── SuperCredits™ ────────────────────────────

function PersonAvatar({ person, size = 44 }: { person: Person; size?: number }) {
  const initials = person.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  if (person.photoUrl) {
    return (
      <img
        src={person.photoUrl}
        alt={person.name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold"
      style={{
        width: size,
        height: size,
        background: "#319ED8",
        fontSize: Math.round(size * 0.38),
      }}
      aria-hidden="true"
    >
      {initials || "•"}
    </div>
  );
}

// Apple-Music-style 2-line clamp on the album description with an inline
// "...more" affordance that fades into the truncated last line. Tapping
// either the text or the "...more" pill opens AlbumDescriptionSheet with
// the full copy. Overflow is detected with a layout effect (compares
// scrollHeight to clientHeight) and re-checked whenever the text or
// container width changes, so the pill never appears for short copy.
function ClampedDescription({ text, onExpand }: { text: string; onExpand: () => void }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const check = () => {
      // rAF to defer until after layout — avoids a stale measurement on the
      // initial paint in some Safari builds. Tracked so unmount can cancel
      // the pending callback and avoid a state update on a dead component.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!ref.current) return;
        setOverflowing(ref.current.scrollHeight - ref.current.clientHeight > 1);
      });
    };
    check();
    // ResizeObserver isn't on older Safari/WebKit. Guard + fall back to
    // window resize so we still recompute when the viewport rotates.
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(check);
      ro.observe(el);
      return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    }
    window.addEventListener("resize", check);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", check); };
  }, [text]);

  // The whole truncated paragraph is a button when it overflows so keyboard
  // users get the same affordance as the visible "…more" pill. When the
  // copy fits in 2 lines we render a plain <p> so there's no fake button.
  if (!overflowing) {
    return (
      <p
        ref={ref}
        className="text-white/70 text-sm mt-3 leading-relaxed line-clamp-2"
        data-testid="album-description"
      >
        {text}
      </p>
    );
  }

  return (
    <div className="relative mt-3" data-testid="album-description">
      <button
        type="button"
        onClick={onExpand}
        aria-label="Read more about this album"
        className="block w-full text-left active:opacity-80"
      >
        <p
          ref={ref}
          className="text-white/70 text-sm leading-relaxed line-clamp-2"
        >
          {text}
        </p>
        <span
          aria-hidden="true"
          className="absolute bottom-0 right-0 text-white text-sm font-semibold pl-8 leading-relaxed"
          style={{
            background:
              "linear-gradient(to right, rgba(0,6,43,0) 0%, #00062B 40%, #00062B 100%)",
          }}
          data-testid="button-album-description-more"
        >
          <span className="text-white/70">…</span>more
        </span>
      </button>
    </div>
  );
}

function AlbumDescriptionSheet({ album, onClose }: { album: Album; onClose: () => void }) {
  return (
    <SheetShell ariaLabel={`${album.title} — about`} testId="sheet-album-description" onClose={onClose}>
      <SheetHeader eyebrow="About" title={album.title} subtitle={album.artist} onClose={onClose} />
      <div className="px-5 pb-2">
        <p className="text-white/85 text-[15px] leading-relaxed whitespace-pre-wrap" data-testid="text-album-description-full">
          {album.description}
        </p>
      </div>
    </SheetShell>
  );
}

function SheetShell({
  ariaLabel,
  testId,
  onClose,
  variant = "bottom",
  children,
}: {
  ariaLabel: string;
  testId: string;
  onClose: () => void;
  variant?: "bottom" | "full";
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    // Lock the underlying page from scrolling while the sheet is open.
    // Without this, iOS passes touch-drag through to the AlbumDetail page
    // beneath the sheet, and the blurred peek at the top of the viewport
    // visibly shifts as the body scrolls under the user's thumb.
    const prevOverflow = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
    };
  }, [onClose]);

  const isFull = variant === "full";

  return (
    <div
      className={`fixed inset-0 z-[78] flex justify-center ${isFull ? "items-stretch" : "items-end"}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {/* Backdrop dim — only behind a bottom-sheet. Full-screen sheets cover the
          entire viewport edge-to-edge, Apple-style, so no backdrop is needed.
          A solid dim (no live blur) — backdrop-filter re-samples on every paint
          frame, which made the visible peek above the sheet wobble during
          touch-drag on iOS. The sheet background below is already ~98% opaque
          so the underlying page barely shows through anyway. */}
      {!isFull && <div className="absolute inset-0 bg-black/70" onClick={onClose} />}
      <div
        className={
          isFull
            ? "relative w-full z-10 h-full flex flex-col overflow-hidden"
            : "relative w-full max-w-[390px] z-10 rounded-t-3xl pt-3 pb-8 max-h-[88vh] overflow-y-auto scrollbar-hide"
        }
        style={{ background: "rgb(20, 24, 48)", boxShadow: isFull ? "none" : "0 -16px 40px rgba(0,0,0,0.6)" }}
      >
        {!isFull && <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />}
        {children}
      </div>
    </div>
  );
}

function SheetHeader({ eyebrow, title, subtitle, onClose }: { eyebrow?: string; title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div className="flex items-start gap-3 px-5 pb-4">
      <div className="flex-1 min-w-0">
        {eyebrow && <p className="text-[#319ED8] text-[11px] font-semibold uppercase tracking-wider mb-1">{eyebrow}</p>}
        <h2 className="text-white text-[22px] font-bold leading-tight tracking-tight">{title}</h2>
        {subtitle && <p className="text-[15px] mt-1 leading-snug" style={{ color: "rgba(235,235,245,0.55)" }}>{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 active:opacity-70 flex-shrink-0"
        style={{ background: "rgba(255,255,255,0.08)" }}
        data-testid="button-sheet-close-x"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function CreditsSheet({
  song,
  album,
  credits,
  resolvePerson,
  resolveInstrument,
  onOpenPerformer,
  onOpenInstrument,
  onClose,
}: {
  song: Song;
  album: Album;
  credits: TrackCredits | undefined;
  resolvePerson: (personId?: string) => Person | undefined;
  resolveInstrument: (instrumentId?: string) => Instrument | undefined;
  onOpenPerformer: (person: Person, creditId?: string) => void;
  onOpenInstrument: (instrument: Instrument, tuningNotes?: string, attribution?: { personId: string; songId: string }) => void;
  onClose: () => void;
}) {
  return (
    <SheetShell ariaLabel={`Credits for ${song.title}`} testId="sheet-credits" onClose={onClose}>
      <SheetHeader
        eyebrow="SuperCredits™"
        title={song.title}
        subtitle={`${album.artist} · ${album.title}`}
        onClose={onClose}
      />

      {!credits ? (
        <div className="px-5 pb-4 text-white/55 text-sm">
          Detailed credits for this track haven't been published yet. Check back soon — every song will eventually show writers, performers, and the exact instruments they used.
        </div>
      ) : (
        <>
          {/* Writers — tappable rows with avatars (same pattern as performers below) */}
          <h3 className="px-5 pt-3 pb-2 text-white text-[22px] font-bold leading-tight tracking-tight">Written by</h3>
          <div className="pb-2">
            {credits.writers.map((w, i) => {
              // If this writer is also in our PEOPLE roster, make the row tappable
              // and route to their PerformerSheet (so writers can be explored too).
              const person = resolvePerson(w.personId);
              if (person) {
                return (
                  <button
                    key={`${w.name}-${i}`}
                    type="button"
                    onClick={() => onOpenPerformer(person)}
                    className="w-full flex items-center gap-3 px-5 py-2.5 text-left active:bg-white/5"
                    data-testid={`button-writer-${i}`}
                  >
                    <PersonAvatar person={person} size={36} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-[15px] font-medium truncate">{w.name}</p>
                    </div>
                    <span className="text-white/45 text-[12px]">{w.role}</span>
                  </button>
                );
              }
              // Fall-back: writer not in the people roster yet — show name + role only.
              return (
                <div
                  key={`${w.name}-${i}`}
                  className="flex items-center gap-3 px-5 py-2.5"
                  data-testid={`row-writer-${i}`}
                >
                  <PersonAvatar person={{ id: `w-${i}`, name: w.name }} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[15px] font-medium truncate">{w.name}</p>
                  </div>
                  <span className="text-white/45 text-[12px]">{w.role}</span>
                </div>
              );
            })}
          </div>

          <div className="h-px bg-white/8 mx-5 my-2" />

          {/* Performers — Apple-style: name + role on left, instrument category text on right with chevron.
              Tap left → performer sheet. Tap right → instrument sheet. */}
          <h3 className="px-5 pt-3 pb-2 text-white text-[22px] font-bold leading-tight tracking-tight">Performed by</h3>
          <div className="pb-2">
            {credits.performers.map((perf, idx) => {
              // Prefer the live Person row; fall back to a synthesized one
              // from the snapshot `name` so credits still render after a
              // person row has been deleted (FK SET NULL).
              const resolved = resolvePerson(perf.personId);
              // `unlinked-${creditId|idx}` is a stable synthetic id used purely
              // as a React key and a sentinel ("don't try to match this back
              // to a real personId"). The actual cross-sheet match happens
              // via creditId in the parent.
              const syntheticId = perf.creditId ? `unlinked-${perf.creditId}` : `unlinked-${idx}`;
              const person: Person | undefined = resolved
                ?? (perf.name ? { id: syntheticId, name: perf.name } : undefined);
              const instrument = resolveInstrument(perf.instrumentId);
              if (!person) return null;
              const shortLabel = instrument?.shortCategory ?? instrument?.category ?? "";
              return (
                <div key={perf.creditId ?? person.id} className="flex items-center px-5 py-2.5 active:bg-white/5">
                  <button
                    type="button"
                    onClick={() => onOpenPerformer(person, perf.creditId)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-80"
                    data-testid={`button-performer-${perf.creditId ?? person.id}`}
                  >
                    <PersonAvatar person={person} size={44} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-[15px] font-semibold truncate">{person.name}</p>
                      <p className="text-[12px] truncate" style={{ color: "rgba(235,235,245,0.45)" }}>{perf.role}</p>
                    </div>
                  </button>
                  {instrument && (
                    <button
                      type="button"
                      onClick={() => onOpenInstrument(instrument, perf.tuningNotes, { personId: person.id, songId: song.id })}
                      className="flex items-center gap-1 pl-3 -mr-1 active:opacity-70"
                      data-testid={`button-instrument-${instrument.id}`}
                      aria-label={`Instrument: ${instrument.name}`}
                    >
                      <span className="text-white/70 text-[14px]">{shortLabel}</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/35" aria-hidden="true">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

        </>
      )}
    </SheetShell>
  );
}

function PerformerSheet({
  person,
  song,
  album,
  selectedCreditId,
  currentSongCredits,
  otherTracks,
  resolveInstrument,
  onOpenInstrument,
  onClose,
}: {
  person: Person;
  song: Song;                  // The song we're focused on — drives "instruments on this song"
  album: Album;
  // Stable credit-row id of the originally-clicked row. Required to match
  // unlinked (personId === null) snapshot performers; ignored when the
  // resolved person has a real id.
  selectedCreditId?: string;
  currentSongCredits: TrackCredits | undefined;
  // Other tracks on this album where this performer is credited (already filtered, sorted by parent).
  otherTracks: Array<{ song: Song; performer: TrackPerformer }>;
  resolveInstrument: (instrumentId?: string) => Instrument | undefined;
  onOpenInstrument: (instrument: Instrument, tuningNotes?: string, attribution?: { personId: string; songId: string }) => void;
  onClose: () => void;
}) {
  // Default to Music: the sheet is reached from a song row, so the
  // song-context view ("Played on this song" + "Also on this album") has
  // to lead. About/Gear are explicit opt-ins.
  const [tab, setTab] = useState<"about" | "music" | "gear">("music");

  // What this performer played on the CURRENT song. Match by personId when
  // we have a real one; otherwise fall back to the credit row id so unlinked
  // snapshot rows still resolve to their own performance.
  const isSynthetic = person.id.startsWith("unlinked-");
  const onThisSong = (currentSongCredits?.performers ?? []).filter((p) =>
    isSynthetic ? p.creditId === selectedCreditId : p.personId === person.id,
  );

  // Catalog-wide credits for this person — backs the Music tab's "Other
  // albums" section and the Gear tab's distinct-instruments list. Disabled
  // for synthetic snapshot rows (no real personId), in which case the sheet
  // falls back to current-album-only data already in props.
  type PersonProfile = {
    person: { id: string; name: string; photoUrl: string | null; bio: string | null };
    tracks: Array<{
      performerId: string;
      songId: string; songTitle: string; trackNumber: number;
      albumId: string; albumTitle: string; albumArtwork: string;
      albumArtist: string; albumYear: number | null;
      role: string; tuningNotes: string | null;
      instrumentId: string | null; instrumentName: string | null;
      instrumentShortCategory: string | null; instrumentCategory: string | null;
      instrumentPhotoUrl: string | null;
    }>;
  };
  const { data: profile } = useQuery<PersonProfile>({
    queryKey: ["/api/people", person.id, "profile"],
    enabled: !isSynthetic,
  });

  // Group catalog tracks by album for the Music tab. Current album is
  // intentionally surfaced first (as a dedicated "On this album" block)
  // so the contextual info from props still leads the view.
  const otherAlbums = (() => {
    if (!profile) return [] as Array<{
      albumId: string; albumTitle: string; albumArtwork: string;
      albumYear: number | null;
      tracks: PersonProfile["tracks"];
    }>;
    const byAlbum = new Map<string, { albumId: string; albumTitle: string; albumArtwork: string; albumYear: number | null; tracks: PersonProfile["tracks"] }>();
    for (const t of profile.tracks) {
      if (t.albumId === album.id) continue;
      const entry = byAlbum.get(t.albumId) ?? {
        albumId: t.albumId,
        albumTitle: t.albumTitle,
        albumArtwork: t.albumArtwork,
        albumYear: t.albumYear,
        tracks: [],
      };
      entry.tracks.push(t);
      byAlbum.set(t.albumId, entry);
    }
    return Array.from(byAlbum.values());
  })();

  // Distinct gear this person has played. Prefers the catalog-wide profile
  // payload when available; falls back to current-album data (this song +
  // other tracks on this album) for synthetic/unlinked snapshot rows that
  // don't have a real personId to look up. Same shape either way so the
  // render path is identical.
  const gear = (() => {
    type GearEntry = { id: string; name: string; shortCategory: string | null; category: string | null; photoUrl: string | null; tracks: Set<string> };
    const byInstrument = new Map<string, GearEntry>();
    if (profile) {
      for (const t of profile.tracks) {
        if (!t.instrumentId) continue;
        const entry = byInstrument.get(t.instrumentId) ?? {
          id: t.instrumentId,
          name: t.instrumentName ?? "Instrument",
          shortCategory: t.instrumentShortCategory,
          category: t.instrumentCategory,
          photoUrl: t.instrumentPhotoUrl,
          tracks: new Set<string>(),
        };
        entry.tracks.add(t.songId);
        byInstrument.set(t.instrumentId, entry);
      }
    } else {
      // Fallback: this album only. Combine onThisSong (current song) +
      // otherTracks (other tracks on this album), de-duped by instrumentId.
      const add = (instrumentId: string | null | undefined, songId: string) => {
        if (!instrumentId) return;
        const inst = resolveInstrument(instrumentId);
        if (!inst) return;
        const entry = byInstrument.get(instrumentId) ?? {
          id: instrumentId,
          name: inst.name,
          shortCategory: inst.shortCategory ?? null,
          category: inst.category ?? null,
          photoUrl: inst.photoUrl ?? null,
          tracks: new Set<string>(),
        };
        entry.tracks.add(songId);
        byInstrument.set(instrumentId, entry);
      };
      for (const p of onThisSong) add(p.instrumentId, song.id);
      for (const { song: s, performer } of otherTracks) add(performer.instrumentId, s.id);
    }
    return Array.from(byInstrument.values())
      .map(({ tracks, ...rest }) => ({ ...rest, trackCount: tracks.size }))
      .sort((a, b) => b.trackCount - a.trackCount || a.name.localeCompare(b.name));
  })();

  const totalTrackCount = profile?.tracks.length ?? (onThisSong.length + otherTracks.length);

  // Open an instrument by id, even when it lives on an album outside the
  // current page's static instrument map. Falls back to a minimal synthetic
  // Instrument built from the profile-row metadata so cross-album rows in
  // Music + Gear stay tappable. `songId` lets the InstrumentSheet anchor
  // its "played on" context to the right track.
  const openByIdWithFallback = (
    instrumentId: string,
    fallback: { name: string; category: string | null; shortCategory: string | null; photoUrl: string | null },
    tuningNotes: string | null | undefined,
    songIdForContext: string,
  ) => {
    const resolved = resolveInstrument(instrumentId);
    if (resolved) {
      onOpenInstrument(resolved, tuningNotes ?? undefined, { personId: person.id, songId: songIdForContext });
      return;
    }
    // The fan-side Instrument interface (musicData.ts) uses optional
    // `string | undefined` fields, while the profile payload comes through
    // as `string | null` from the DB — coerce nulls to undefined.
    const synthetic: Instrument = {
      id: instrumentId,
      name: fallback.name,
      category: fallback.category ?? "Instrument",
      shortCategory: fallback.shortCategory ?? undefined,
      photoUrl: fallback.photoUrl ?? undefined,
    };
    onOpenInstrument(synthetic, tuningNotes ?? undefined, { personId: person.id, songId: songIdForContext });
  };

  return (
    <SheetShell ariaLabel={`${person.name} on ${song.title}`} testId="sheet-performer" onClose={onClose}>
      {/* Apple-style header: close button floats top-right, hero is a centered large avatar + name */}
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-0 right-4 w-8 h-8 rounded-full flex items-center justify-center text-white/70 active:opacity-70"
          style={{ background: "rgba(255,255,255,0.08)" }}
          data-testid="button-performer-close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="flex flex-col items-center text-center px-5 pt-2 pb-5">
          <PersonAvatar person={person} size={112} />
          <h2 className="text-white text-[24px] font-bold leading-tight mt-3">{person.name}</h2>
          <p className="text-white/55 text-[13px] mt-1 truncate max-w-full">On "{song.title}"</p>
        </div>
      </div>

      {/* Tab strip — About | Music | Gear. Same shape/typography as the
          VendorSheet tabs so the two artist-adjacent sheets read as a pair. */}
      <div className="px-5 pt-1 pb-0" style={{ background: "#00062B" }}>
        <div className="flex gap-6 border-b border-white/10">
          {(["about", "music", "gear"] as const).map((t) => {
            const active = tab === t;
            const label = t === "about" ? "About" : t === "music" ? "Music" : "Gear";
            const count = t === "music" ? totalTrackCount : t === "gear" ? gear.length : undefined;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="relative pb-3 pt-2 text-[14px] font-semibold tracking-wide transition-colors"
                style={{ color: active ? "#FFFFFF" : "rgba(255,255,255,0.45)" }}
                data-testid={`tab-performer-${t}`}
              >
                <span className="flex items-center gap-1.5">
                  {label}
                  {typeof count === "number" && count > 0 && (
                    <span className="text-[12px] font-medium" style={{ color: active ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.35)" }}>
                      {count}
                    </span>
                  )}
                </span>
                {active && (
                  <span className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full" style={{ background: "#319ED8" }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ABOUT */}
      {tab === "about" && (
        <div className="pb-4">
          {person.bio ? (
            <p className="px-5 pt-4 text-white/80 text-[15px] leading-[1.55] whitespace-pre-line" data-testid="text-performer-bio">
              {person.bio}
            </p>
          ) : (
            <p className="px-5 pt-4 text-white/45 text-[14px]">No bio yet for {person.name}.</p>
          )}

          {/* Artist Profile link — placeholder for the future cross-album /
              streaming-handoff flow. See replit.md → "Streaming-service handoff". */}
          <div className="h-px bg-white/8 mx-5 mt-5 mb-3" />
          <div className="px-5">
            <button
              type="button"
              onClick={() => {
                toast({ title: `Artist profile for ${person.name}`, description: "Coming soon" });
              }}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl active:opacity-80"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
              data-testid="button-artist-profile"
            >
              <span className="text-white text-[14px] font-medium">View artist profile</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/45" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* MUSIC — played-on-this-song, also-on-this-album, then other albums. */}
      {tab === "music" && (
        <div className="pb-4">
          {onThisSong.length > 0 && (
            <>
              <h3 className="px-5 pt-4 pb-2 text-white text-[18px] font-bold leading-tight tracking-tight">Played on this song</h3>
              <div className="pb-1">
                {onThisSong.map((perf, i) => {
                  const inst = resolveInstrument(perf.instrumentId);
                  if (!inst) {
                    return (
                      <div key={`role-${i}`} className="px-5 py-2.5 text-white/80 text-[14px]">{perf.role}</div>
                    );
                  }
                  return (
                    <button
                      key={`inst-${i}`}
                      type="button"
                      onClick={() => onOpenInstrument(inst, perf.tuningNotes, { personId: person.id, songId: song.id })}
                      className="w-full flex items-center gap-3 px-5 py-2.5 text-left active:bg-white/5"
                      data-testid={`button-performer-song-instrument-${perf.instrumentId}`}
                    >
                      <div
                        className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0"
                        style={{ background: "linear-gradient(135deg, #1a1f4a 0%, #2a1156 100%)" }}
                      >
                        {inst.photoUrl ? (
                          <img src={inst.photoUrl} alt="" className="w-full h-full object-cover" />
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[15px] font-medium truncate">{inst.name}</p>
                        <p className="text-white/55 text-[12px] truncate">
                          {perf.role}{perf.tuningNotes ? ` · ${perf.tuningNotes}` : ""}
                        </p>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/35" aria-hidden="true">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {otherTracks.length > 0 && (
            <>
              <h3 className="px-5 pt-5 pb-2 text-white text-[18px] font-bold leading-tight tracking-tight">Also on {album.title}</h3>
              <div className="pb-2">
                {otherTracks.map(({ song: s, performer }) => {
                  const instrument = resolveInstrument(performer.instrumentId);
                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 px-5 py-3 active:bg-white/5"
                      data-testid={`row-performer-track-${s.id}`}
                    >
                      {/* Track number color matches the album track-list (rgba(255,255,255,0.32)) */}
                      <span className="w-6 text-[15px] tabular-nums text-right flex-shrink-0" style={{ color: "rgba(255,255,255,0.32)" }}>{s.trackNumber}</span>
                      <p className="flex-1 min-w-0 text-white text-[15px] truncate">{s.title}</p>
                      {instrument && (
                        <button
                          type="button"
                          onClick={() => onOpenInstrument(instrument, performer.tuningNotes, { personId: performer.personId ?? person.id, songId: s.id })}
                          className="flex items-center gap-1 pl-2 -mr-1 active:opacity-70 flex-shrink-0"
                          data-testid={`button-performer-track-instrument-${s.id}`}
                        >
                          <span className="text-white/65 text-[14px]">{instrument.shortCategory ?? instrument.category}</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/35" aria-hidden="true">
                            <path d="M9 6l6 6-6 6" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Other albums — from the catalog-wide profile fetch. Each album
              renders as a header (cover + title + year) followed by its
              track list, mirroring the album-page track row style. */}
          {otherAlbums.map((alb) => (
            <div key={alb.albumId} className="pt-3">
              <div className="flex items-center gap-3 px-5 pt-2 pb-2">
                <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 bg-white/5">
                  {alb.albumArtwork ? (
                    <img src={alb.albumArtwork} alt="" className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[15px] font-semibold truncate">{alb.albumTitle}</p>
                  <p className="text-white/45 text-[12px] truncate">
                    {alb.albumYear ? `${alb.albumYear} · ` : ""}{alb.tracks.length} track{alb.tracks.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              {alb.tracks.map((t) => (
                <div
                  key={t.performerId}
                  className="flex items-center gap-3 px-5 py-2.5 active:bg-white/5"
                  data-testid={`row-performer-other-track-${t.performerId}`}
                >
                  <span className="w-6 text-[15px] tabular-nums text-right flex-shrink-0" style={{ color: "rgba(255,255,255,0.32)" }}>{t.trackNumber}</span>
                  <p className="flex-1 min-w-0 text-white text-[15px] truncate">{t.songTitle}</p>
                  {t.instrumentId && (
                    <button
                      type="button"
                      onClick={() => openByIdWithFallback(
                        t.instrumentId!,
                        { name: t.instrumentName ?? "Instrument", category: t.instrumentCategory, shortCategory: t.instrumentShortCategory, photoUrl: t.instrumentPhotoUrl },
                        t.tuningNotes,
                        t.songId,
                      )}
                      className="flex items-center gap-1 pl-2 -mr-1 active:opacity-70 flex-shrink-0"
                      data-testid={`button-performer-other-track-instrument-${t.performerId}`}
                    >
                      <span className="text-white/65 text-[14px]">{t.instrumentShortCategory ?? t.instrumentCategory}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/35" aria-hidden="true">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}

          {onThisSong.length === 0 && otherTracks.length === 0 && otherAlbums.length === 0 && (
            <p className="px-5 py-6 text-white/55 text-sm">No detailed credits yet for {person.name}.</p>
          )}
        </div>
      )}

      {/* GEAR — distinct instruments this person plays across the catalog.
          Each row is tappable, opening the InstrumentSheet. */}
      {tab === "gear" && (
        <div className="pb-4 pt-2">
          {gear.length === 0 ? (
            <p className="px-5 py-6 text-white/55 text-sm">No gear credited to {person.name} yet.</p>
          ) : (
            gear.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => openByIdWithFallback(
                  g.id,
                  { name: g.name, category: g.category, shortCategory: g.shortCategory, photoUrl: g.photoUrl },
                  null,
                  song.id,
                )}
                className="w-full flex items-center gap-3 px-5 py-2.5 text-left active:bg-white/5"
                data-testid={`button-performer-gear-${g.id}`}
              >
                <div
                  className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #1a1f4a 0%, #2a1156 100%)" }}
                >
                  {g.photoUrl ? (
                    <img src={g.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[15px] font-medium truncate">{g.name}</p>
                  <p className="text-white/55 text-[12px] truncate">
                    {g.shortCategory ?? g.category ?? "Instrument"} · {g.trackCount} track{g.trackCount === 1 ? "" : "s"}
                  </p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/35" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            ))
          )}
        </div>
      )}
    </SheetShell>
  );
}

// Parses an `about` blob into { prose, specs }.
// A line counts as a spec when it looks like a short "Label: Value" pair —
// label starts with an uppercase letter, value is ≤ 80 chars and doesn't end
// in a sentence period (so prose with a colon, e.g. "Note: this guitar sings.",
// stays in the prose bucket). Consecutive non-matching lines are joined as
// paragraphs. Order is preserved; we don't try to merge non-contiguous prose.
function parseInstrumentAbout(about: string): { prose: string; specs: { label: string; value: string }[] } {
  const lines = about.split(/\r?\n/);
  const proseLines: string[] = [];
  const specs: { label: string; value: string }[] = [];
  const specLine = /^\s*([A-Z][A-Za-z0-9 /()&'.-]{0,40}):\s+(.{1,80})\s*$/;
  for (const raw of lines) {
    const m = raw.match(specLine);
    // Treat anything that reads as a sentence — multi-sentence or
    // terminal-punctuation — as prose, not a spec. Catches both mid-sentence
    // ("Note: this is great. And…") and trailing ("Note: this guitar sings.")
    // shapes so prose with an incidental colon doesn't get pulled into the
    // spec grid.
    const looksProse = m && (/[.!?]\s+\S/.test(m[2]) || /[.!?]["')\]]?\s*$/.test(m[2]));
    if (m && !looksProse) {
      specs.push({ label: m[1].trim(), value: m[2].trim() });
    } else {
      proseLines.push(raw);
    }
  }
  // Collapse runs of blank lines, trim outer whitespace.
  const prose = proseLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { prose, specs };
}

// About / Specs section with an Apple-Music-style segmented pill control.
// - If the about field has no extractable specs, renders prose as before
//   (no tab chrome — keeps simple instruments visually quiet).
// - If specs exist but no prose, defaults to Specs (no empty About tab).
// - Otherwise: two tabs, default About. Specs are hidden until tapped, so
//   the rest of the sheet (artist note, vendors) stays near the top.
function InstrumentAboutSection({ category, about }: { category: string; about: string }) {
  const { prose, specs } = useMemo(() => parseInstrumentAbout(about), [about]);
  const hasProse = prose.length > 0;
  const hasSpecs = specs.length > 0;
  const [tab, setTab] = useState<"about" | "specs">(hasProse ? "about" : "specs");

  // No specs detected → original render, unchanged.
  if (!hasSpecs) {
    return (
      <section className="px-5 pt-3 pb-5">
        <h3 className="text-white text-[22px] font-bold leading-tight tracking-tight mb-2">About this {category.toLowerCase()}</h3>
        <p className="text-[16px] leading-relaxed whitespace-pre-line" style={{ color: "rgba(235,235,245,0.72)" }}>{prose || about}</p>
      </section>
    );
  }

  const showBoth = hasProse && hasSpecs;
  const SegBtn = ({ value, label }: { value: "about" | "specs"; label: string }) => {
    const active = tab === value;
    return (
      <button
        type="button"
        onClick={() => setTab(value)}
        aria-pressed={active}
        className="flex-1 h-9 rounded-full text-[14px] font-semibold transition-colors active:opacity-80"
        style={{
          background: active ? "rgba(255,255,255,0.14)" : "transparent",
          color: active ? "#ffffff" : "rgba(235,235,245,0.55)",
        }}
        data-testid={`tab-instrument-${value}`}
      >
        {label}
      </button>
    );
  };

  return (
    <section className="px-5 pt-3 pb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white text-[22px] font-bold leading-tight tracking-tight">About this {category.toLowerCase()}</h3>
      </div>

      {showBoth && (
        <div
          className="flex items-center gap-1 p-1 rounded-full mb-3"
          style={{ background: "rgba(255,255,255,0.06)" }}
          role="tablist"
          aria-label="About or specs"
        >
          <SegBtn value="about" label="About" />
          <SegBtn value="specs" label="Specs" />
        </div>
      )}

      {tab === "about" && hasProse && (
        <p className="text-[16px] leading-relaxed whitespace-pre-line" style={{ color: "rgba(235,235,245,0.72)" }} data-testid="text-instrument-about">
          {prose}
        </p>
      )}

      {tab === "specs" && (
        // Two-column dl: label dim, value white. Subtle hairline rows so the
        // grid reads cleanly even with a long list — matches the dense spec
        // sheets fans expect to see on Reverb / Carter Vintage listings.
        <dl className="text-[15px] leading-snug" data-testid="list-instrument-specs">
          {specs.map((s, i) => (
            <div
              key={`${s.label}-${i}`}
              className="grid grid-cols-[40%_60%] gap-3 py-2"
              style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}
            >
              <dt style={{ color: "rgba(235,235,245,0.55)" }}>{s.label}</dt>
              <dd className="text-white">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function InstrumentSheet({
  instrument,
  tuningNotes,
  attribution,
  isBookmarked,
  onToggleBookmark,
  onOpenInAppBrowser,
  onOpenVendor,
  onMessageVendor,
  onClose,
}: {
  instrument: Instrument;
  tuningNotes?: string;
  attribution?: { personId: string; songId: string };
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onOpenInAppBrowser: (b: { url: string; title: string; logoUrl?: string }) => void;
  onOpenVendor: (vendor: InstrumentVendor) => void;
  onMessageVendor: (vendor: { name: string; logoUrl?: string; affiliateUrl: string }) => void;
  onClose: () => void;
}) {
  // SuperCredits-derived list of artists who've played this instrument on
  // a track. Anchored on instrument.id (not vendor.id), so it works for
  // both demo instruments and real DB rows. Empty list → section hidden.
  type InstrumentProfile = {
    instrument: { id: string };
    artists: Array<{
      id: string; name: string; photoUrl: string | null;
      bio: string | null; trackCount: number;
    }>;
  };
  const { data: instrumentProfile } = useQuery<InstrumentProfile>({
    queryKey: ["/api/instruments", instrument.id, "profile"],
    enabled: !!instrument.id,
  });
  const instrumentArtists: Person[] = (instrumentProfile?.artists ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    photoUrl: a.photoUrl ?? undefined,
  } as Person));

  // Split the admin-pasted "about" blob into prose vs. structured specs once,
  // up here, so the top-level tab strip below can decide which tabs to show.
  // Mirrors the same parse used inline by the older InstrumentAboutSection.
  const { prose: aboutProse, specs: aboutSpecs } = useMemo(
    () => parseInstrumentAbout(instrument.about ?? ""),
    [instrument.about],
  );
  const hasProse = aboutProse.length > 0;
  const hasSpecs = aboutSpecs.length > 0;
  const hasArtists = instrumentArtists.length > 0;

  // Vendor-style top tabs: About | Specs | Artists. Tabs hide themselves
  // when their content is empty (no specs uploaded yet, no SuperCredits
  // performers yet) so a sparse instrument doesn't show empty sections.
  // Default tab prefers About when prose exists, otherwise Specs, otherwise
  // Artists — same priority as the original linear order.
  const availableTabs = (
    ["about", "specs", "artists"] as const
  ).filter((t) =>
    t === "about" ? hasProse || instrument.artistNote || (instrument.vendors && instrument.vendors.length > 0)
    : t === "specs" ? hasSpecs
    : hasArtists,
  );
  const [instrumentTab, setInstrumentTab] = useState<"about" | "specs" | "artists">(
    availableTabs[0] ?? "about",
  );

  // Resolve attribution → who wrote the note + which song it's about.
  // Used so a bookmarked instrument still tells you "this note was from X on Y".
  const noteFromPerson = attribution ? PEOPLE[attribution.personId] : undefined;
  const noteFromSong = attribution
    ? ALBUMS.flatMap((a) => getSongsByAlbum(a.id)).find((s) => s.id === attribution.songId)
    : undefined;

  const handleShare = async () => {
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    const shareText = `${instrument.name} — featured on GoodTunes SuperCredits™`;
    try {
      if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share) {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: instrument.name,
          text: shareText,
          url: shareUrl,
        });
        return;
      }
    } catch { /* user cancelled or share unavailable */ }
    try {
      await navigator.clipboard.writeText(`${shareText} — ${shareUrl}`);
      toast({ title: "Link copied", description: instrument.name });
    } catch {
      toast({ title: "Share unavailable", description: "Couldn't copy link in this browser." });
    }
  };

  return (
    <SheetShell ariaLabel={instrument.name} testId="sheet-instrument" variant="full" onClose={onClose}>
      {/* Apple-style top bar: back chevron on left (this is a sub-sheet from credits),
          Share + Bookmark on right. shrink-0 so it stays pinned. Top padding respects safe area. */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-3 pb-2"
        style={{ background: "rgba(20,24,48,0.85)", backdropFilter: "blur(20px) saturate(180%)", paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70"
          style={{ background: "rgba(255,255,255,0.10)" }}
          data-testid="button-instrument-close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share"
            className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70"
            style={{ background: "rgba(255,255,255,0.10)" }}
            data-testid="button-instrument-share"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="M7 8l5-5 5 5" />
              <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onToggleBookmark}
            aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"}
            aria-pressed={isBookmarked}
            className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-70"
            style={{ background: "rgba(255,255,255,0.10)" }}
            data-testid="button-instrument-bookmark"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill={isBookmarked ? "#4AFFCA" : "none"}
              stroke={isBookmarked ? "#4AFFCA" : "currentColor"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-white"
              aria-hidden="true"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable content area (header above is shrink-0). Pin
          overflow-x off — see VendorSheet for the same reason. */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide pb-8">
      {/* Hero photo (no overlay X — that's in the sticky bar above) */}
      <div className="mx-5 mt-2 rounded-2xl overflow-hidden mb-4" style={{ aspectRatio: "16 / 10", background: "linear-gradient(135deg, #1a1f4a 0%, #2a1156 100%)" }}>
        {instrument.photoUrl ? (
          <img src={instrument.photoUrl} alt={instrument.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/35">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
        )}
      </div>

      {/* Title block — Apple Music "About Neil Diamond" pattern: small grey eyebrow, big bold title */}
      <div className="px-5 pb-4">
        <p className="text-[12px] font-medium mb-1" style={{ color: "rgba(235,235,245,0.55)" }}>{instrument.category}</p>
        <h2 className="text-white text-[26px] font-bold leading-tight tracking-tight">{instrument.name}</h2>
        {tuningNotes && (
          <p className="text-[15px] mt-1.5" style={{ color: "rgba(235,235,245,0.55)" }}>Tuning · {tuningNotes}</p>
        )}
      </div>

      {/* Top-level tab strip — mirrors VendorSheet's About | Gear | Artists
          treatment so the two gear-adjacent sheets feel like a pair. Tabs
          self-hide when their content is empty. Underline is #319ED8 (brand
          blue) — same component shape used on the vendor sheet at ~L2773. */}
      {availableTabs.length > 1 && (
        <div className="px-5 pt-1 pb-0">
          <div className="flex gap-6 border-b border-white/10">
            {availableTabs.map((t) => {
              const active = instrumentTab === t;
              const label = t === "about" ? "About" : t === "specs" ? "Specs" : "Artists";
              const count = t === "specs" ? aboutSpecs.length : t === "artists" ? instrumentArtists.length : undefined;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setInstrumentTab(t)}
                  aria-pressed={active}
                  className="relative pb-2.5 text-[15px] font-semibold active:opacity-80"
                  style={{ color: active ? "#fff" : "rgba(235,235,245,0.55)" }}
                  data-testid={`tab-instrument-${t}`}
                >
                  {label}
                  {typeof count === "number" && count > 0 && (
                    <span className="ml-1.5 text-[13px] font-medium" style={{ color: "rgba(235,235,245,0.45)" }}>
                      {count}
                    </span>
                  )}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full"
                      style={{ background: "#319ED8" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Specs tab — structured key:value grid lifted out of the old
          InstrumentAboutSection. Two-column dl: label dim, value white,
          hairline rows. Matches the dense spec sheets on Reverb / Carter
          Vintage listings. */}
      {instrumentTab === "specs" && hasSpecs && (
        <section className="px-5 pt-4 pb-5">
          <h3 className="text-white text-[22px] font-bold leading-tight tracking-tight mb-2">Specs</h3>
          <dl className="text-[15px] leading-snug" data-testid="list-instrument-specs">
            {aboutSpecs.map((s, i) => (
              <div
                key={`${s.label}-${i}`}
                className="grid grid-cols-[40%_60%] gap-3 py-2"
                style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}
              >
                <dt style={{ color: "rgba(235,235,245,0.55)" }}>{s.label}</dt>
                <dd className="text-white">{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* About tab — prose only (no specs; those moved to their own tab).
          Notes from artist + Where to buy live here too, because they're
          the "story" of this instrument; Specs is the dry data view. */}
      {instrumentTab === "about" && hasProse && (
        <section className="px-5 pt-4 pb-3">
          <h3 className="text-white text-[22px] font-bold leading-tight tracking-tight mb-2">About this {instrument.category.toLowerCase()}</h3>
          <p className="text-[16px] leading-relaxed whitespace-pre-line" style={{ color: "rgba(235,235,245,0.72)" }} data-testid="text-instrument-about">
            {aboutProse}
          </p>
        </section>
      )}

      {/* Notes from the artist — attributed (so the note still makes sense after bookmarking) */}
      {instrumentTab === "about" && instrument.artistNote && (
        <section className="px-5 pt-3 pb-5">
          <h3 className="text-white text-[22px] font-bold leading-tight tracking-tight mb-2">Notes from the artist</h3>
          <p className="pb-3 text-[16px] leading-relaxed italic" style={{ color: "rgba(235,235,245,0.78)" }}>"{instrument.artistNote}"</p>
          {noteFromPerson && (
            <div className="flex items-center gap-2.5">
              <PersonAvatar person={noteFromPerson} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-white text-[14px] font-medium truncate">{noteFromPerson.name}</p>
                {noteFromSong && (
                  <p className="text-[13px] truncate" style={{ color: "rgba(235,235,245,0.55)" }}>on "{noteFromSong.title}"</p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Where to buy — vendor list. Tap row → direct buy link. Tap logo → vendor about page. */}
      {instrumentTab === "about" && instrument.vendors && instrument.vendors.length > 0 && (
        <section className="pt-3 pb-2">
          <h3 className="px-5 text-white text-[22px] font-bold leading-tight tracking-tight mb-3">Where to buy</h3>
          <div className="pb-1">
            {instrument.vendors.map((v, i) => (
              <div
                key={`${v.name}-${i}`}
                className="flex items-center px-5 py-2.5 active:bg-white/5"
                data-testid={`row-vendor-${i}`}
              >
                {/* Tap the logo → vendor profile sheet (Apple Music artist-style page) */}
                <button
                  type="button"
                  onClick={() => onOpenVendor(v)}
                  aria-label={`About ${v.name}`}
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-70 overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.92)" }}
                  data-testid={`button-vendor-about-${i}`}
                >
                  {v.logoUrl ? (
                    <img src={v.logoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[#00062B] text-[13px] font-bold">{v.name.charAt(0)}</span>
                  )}
                </button>
                {/* Tap the row → direct product / buy link (opens in in-app browser sheet) */}
                <button
                  type="button"
                  onClick={() => onOpenVendor(v)}
                  className="flex-1 flex items-center min-w-0 ml-3 active:opacity-80 text-left"
                  data-testid={`button-vendor-buy-${i}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[15px] font-medium truncate">{v.name}</p>
                  </div>
                </button>
                {/* Chat bubble — opens a chat with this vendor seeded with the current instrument as an OG-style preview card. */}
                <button
                  type="button"
                  onClick={() => onMessageVendor({ name: v.name, logoUrl: v.logoUrl, affiliateUrl: v.affiliateUrl })}
                  aria-label={`Message ${v.name}`}
                  className="w-9 h-9 ml-1 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-70"
                  style={{ background: "rgba(49,158,216,0.16)" }}
                  data-testid={`button-vendor-message-${i}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
                {/* "Opens in browser" indicator — circle with external-link arrow, matches the chat-bubble button style on the left */}
                <button
                  type="button"
                  onClick={() => onOpenInAppBrowser({ url: v.affiliateUrl, title: v.name, logoUrl: v.logoUrl })}
                  aria-label={`Open ${v.name} in browser`}
                  className="w-9 h-9 ml-1 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-70"
                  style={{ background: "rgba(255,255,255,0.10)" }}
                  data-testid={`button-vendor-open-${i}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/85" aria-hidden="true">
                    <path d="M14 4h6v6" />
                    <path d="M20 4L10 14" />
                    <path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <p className="px-5 pt-4 pb-3 text-[11px] text-center leading-relaxed" style={{ color: "rgba(235,235,245,0.45)" }}>
            Outbound links support the artist via SuperCredits™ Micro-Sponsorships. Artist receives the lion's share; GoodTunes receives a small connection fee.
          </p>
        </section>
      )}

      {/* Artists tab — SuperCredits™ derived. Mirrors the Artists grid on
          VendorSheet (3-col avatar wall) so the two gear-adjacent sheets
          read as a pair. The tab itself self-hides when empty (see
          availableTabs filter), so we don't need a heading here. */}
      {instrumentTab === "artists" && instrumentArtists.length > 0 && (
        <section className="px-5 pt-5 pb-5">
          <div className="grid grid-cols-3 gap-x-4 gap-y-5">
            {instrumentArtists.map((person) => (
              <div key={person.id} className="flex flex-col items-center" data-testid={`instrument-artist-${person.id}`}>
                <PersonAvatar person={person} size={88} />
                <p className="text-white text-[13px] font-medium mt-2 text-center leading-tight line-clamp-2">{person.name}</p>
              </div>
            ))}
          </div>
          <p className="pt-4 text-[11px] leading-relaxed" style={{ color: "rgba(235,235,245,0.45)" }}>
            From SuperCredits™ — artists credited with playing this instrument on a track.
          </p>
        </section>
      )}
      </div>
    </SheetShell>
  );
}

/**
 * VendorSheet — Apple Music artist-page-style profile for an instrument vendor.
 * Hero cover photo with the vendor name overlaid, About copy, location/web contact,
 * Share + Chat actions, and a concept "Artists who use them" rail. Tapping the primary
 * "Visit website" button opens the in-app browser.
 */
function VendorSheet({
  vendor,
  instrument,
  isBookmarked,
  onToggleBookmark,
  onOpenInAppBrowser,
  onMessageVendor,
  onOpenInstrument,
  onClose,
}: {
  vendor: InstrumentVendor;
  instrument: Instrument;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onOpenInAppBrowser: (b: { url: string; title: string; logoUrl?: string }) => void;
  onMessageVendor: (vendor: { name: string; logoUrl?: string; affiliateUrl: string }) => void;
  onOpenInstrument: (instrument: Instrument) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"about" | "instruments" | "artists">("about");

  // One-shot fetch of the vendor profile bundle (vendor entity + all
  // non-hidden instruments attached to it + SuperCredits-derived artists
  // who've played those instruments). The InstrumentVendor row passed in
  // is just one specific attachment — the profile pulls the full picture.
  type VendorProfile = {
    vendor: {
      id: string; name: string; domain: string;
      homeUrl: string | null; aboutUrl: string | null;
      logoUrl: string | null; tagline: string | null; bio: string | null;
      location: string | null; coverUrl: string | null;
    };
    instruments: Array<{
      id: string; name: string; category: string;
      shortCategory: string | null; photoUrl: string | null;
      about: string | null; artistNote: string | null;
    }>;
    artists: Array<{
      id: string; name: string; photoUrl: string | null;
      bio: string | null;
      trackCount: number;
    }>;
  };
  const { data: profile, isError: profileError } = useQuery<VendorProfile>({
    queryKey: ["/api/vendors", vendor.vendorId, "profile"],
    // Static-seed vendors (older demo data) have no vendorId — skip the
    // fetch entirely so we don't 404 on `/api/vendors//profile`. The
    // Instruments tab will show an empty hint and Artists falls back to
    // the static `usedByPersonIds` rail.
    enabled: !!vendor.vendorId,
  });

  const domain = (() => {
    try { return new URL(vendor.aboutUrl ?? vendor.affiliateUrl).hostname.replace(/^www\./, ""); }
    catch { return ""; }
  })();
  // Prefer real SuperCredits-derived artists from the profile endpoint;
  // fall back to the static stub `usedByPersonIds` so this still looks
  // populated on demo vendors with no track_performers wired up yet.
  const usedBy: Person[] = profile?.artists?.length
    ? profile.artists.map((a) => ({
        id: a.id,
        name: a.name,
        photoUrl: a.photoUrl ?? undefined,
      } as Person))
    : ((vendor.usedByPersonIds ?? Object.keys(PEOPLE).slice(0, 4))
        .map((pid) => PEOPLE[pid])
        .filter(Boolean) as Person[]);

  const bio = vendor.bio
    ?? `${vendor.name} is one of the trusted shops we link out to from SuperCredits™. Tap the globe icon to visit their full catalog, or start a chat to ask about availability, condition, and shipping.`;
  const tagline = vendor.tagline ?? domain;
  const websiteUrl = vendor.aboutUrl ?? vendor.homeUrl ?? vendor.affiliateUrl;

  const handleShare = async () => {
    const shareUrl = vendor.aboutUrl ?? vendor.affiliateUrl;
    try {
      if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share) {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: vendor.name,
          text: `${vendor.name} on GoodTunes`,
          url: shareUrl,
        });
        return;
      }
    } catch { /* user cancelled */ }
    try {
      await navigator.clipboard.writeText(`${vendor.name} — ${shareUrl}`);
      toast({ title: "Link copied", description: vendor.name });
    } catch {
      toast({ title: "Share unavailable" });
    }
  };

  return (
    <SheetShell ariaLabel={vendor.name} testId="sheet-vendor" variant="full" onClose={onClose}>
      {/* Top bar: floating back chevron + actions over the hero (Apple Music artist page).
          NOTE: `overflow-x-hidden` is intentional — when only overflow-y is set
          the browser computes overflow-x as `auto` too, which let the whole
          vendor page slide horizontally when any descendant (e.g. the action
          row when chat is enabled) measured even a hair wider than the
          viewport. Pin x-scroll off so this stays a vertical-only page. */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide pb-10 relative">
        {/* Toolbar + tab strip share a single sticky container so the tabs
            always sit immediately under the toolbar regardless of the
            device safe-area inset (a hardcoded `top-[60px]` would overlap
            on notched devices with large insets). */}
        <div
          className="sticky top-0 z-20 flex items-center justify-between px-3 pb-2"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70"
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(12px)" }}
            data-testid="button-vendor-close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            {/* Bookmark — saves the vendor to the user's bookmark list
                (localStorage). Filled when active. */}
            <button
              type="button"
              onClick={onToggleBookmark}
              aria-label={isBookmarked ? "Remove bookmark" : "Bookmark vendor"}
              aria-pressed={isBookmarked}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70"
              style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(12px)" }}
              data-testid="button-vendor-bookmark"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={isBookmarked ? "#4AFFCA" : "none"} stroke={isBookmarked ? "#4AFFCA" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleShare}
              aria-label="Share"
              className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70"
              style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(12px)" }}
              data-testid="button-vendor-share"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12" />
                <path d="M7 8l5-5 5 5" />
                <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
              </svg>
            </button>
            {/* Website — opens in-app browser to the vendor homepage.
                Replaces the old "Visit website" pill so we don't compete
                with the tabs below for vertical space. */}
            <button
              type="button"
              onClick={() => onOpenInAppBrowser({ url: websiteUrl, title: vendor.name, logoUrl: vendor.logoUrl })}
              aria-label={`Visit ${vendor.name} website`}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70"
              style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(12px)" }}
              data-testid="button-vendor-website"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18" />
                <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onMessageVendor({ name: vendor.name, logoUrl: vendor.logoUrl, affiliateUrl: vendor.affiliateUrl })}
              aria-label={`Message ${vendor.name}`}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70"
              style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(12px)" }}
              data-testid="button-vendor-chat"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Hero — full-bleed cover with vendor name overlay (gradient fade for legibility).
            Pulled up under the sticky bar with a negative margin so the bar floats
            over it. The pull-up MUST match the toolbar's real height, which
            includes the device safe-area inset (`env(safe-area-inset-top) + 12px`
            padding-top + 36px button + 8px padding-bottom = inset + 56px). A
            hardcoded 60px left a visible navy strip above the hero on notched
            iPhones where the inset is ~50px. */}
        <div className="relative w-full" style={{ aspectRatio: "1 / 1.05", marginTop: "calc((env(safe-area-inset-top, 0px) + 56px) * -1)" }}>
          {vendor.coverUrl ? (
            <img src={vendor.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(135deg, #1a1f4a 0%, #2a1156 50%, #00062B 100%)` }}
            >
              {vendor.logoUrl && (
                <>
                  {/* Blurred large logo as backdrop (Apple-Music album style) */}
                  <img
                    src={vendor.logoUrl}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ filter: "blur(40px) saturate(160%)", transform: "scale(1.3)", opacity: 0.85 }}
                  />
                  {/* Sharp logo on top — translucent tile so the blur bleeds through */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-40 h-40 rounded-full flex items-center justify-center overflow-hidden" style={{ background: "rgba(255,255,255,0.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
                      <img src={vendor.logoUrl} alt="" className="w-full h-full object-cover" style={{ opacity: 0.92 }} />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {/* Bottom gradient — softens the hero so the avatar overlap sits
              clean against page bg. Less aggressive than before because the
              vendor name no longer lives inside the hero. */}
          <div className="absolute inset-x-0 bottom-0 h-1/3" style={{ background: "linear-gradient(to bottom, rgba(0,6,43,0) 0%, #00062B 100%)" }} />
        </div>

        {/* Instagram-style profile row: circular logo with brand-gradient
            ring overlapping the hero, then name + tagline beside it.
            Stats (posts/followers/friends in IG) are intentionally absent —
            we'll wire them in once we have something to count. */}
        <div className="px-5 -mt-12 relative flex items-end gap-4">
          <div
            className="flex-shrink-0 w-[88px] h-[88px] rounded-full p-[3px]"
            style={{ background: "linear-gradient(135deg, #4AFFCA 0%, #319ED8 50%, #7F10A7 100%)" }}
            data-testid="vendor-avatar"
          >
            <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center" style={{ background: "#fff" }}>
              {vendor.logoUrl ? (
                <img src={vendor.logoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[32px] font-bold" style={{ color: "#00062B" }}>
                  {vendor.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h2 className="text-white text-[24px] font-bold leading-tight tracking-tight truncate" data-testid="text-vendor-name">{vendor.name}</h2>
            {tagline && <p className="text-[14px] mt-0.5 truncate" style={{ color: "rgba(235,235,245,0.7)" }}>{tagline}</p>}
          </div>
        </div>

        {/* Tabs — Apple Music artist-page style: text labels with an
            underline that animates under the active tab. Three sections:
            • About: hero copy + contact meta (the old default view).
            • Instruments: every instrument this vendor is attached to,
              regardless of which one opened the sheet.
            • Artists: SuperCredits-derived list of people who've played
              one of the vendor's instruments on a credited track. */}
        {/* Tab strip scrolls with content (Apple Music's actual artist-page
            behavior) — pinning it under a safe-area-aware toolbar requires
            a measured offset which we'd otherwise hardcode and risk overlap
            on notched devices. */}
        <div className="px-5 pt-5 pb-0" style={{ background: "#00062B" }}>
          <div className="flex gap-6 border-b border-white/10">
            {(["about", "instruments", "artists"] as const).map((t) => {
              const active = tab === t;
              // "Gear" is the public-facing name for the Instruments bucket
              // — see the Admin "Gear" nav entry. Internally we keep the key
              // `instruments` so the schema/storage names don't have to change.
              // "Gear" is the public name for instruments. "Artists" stays
              // (over "People") because you only reach a vendor sheet through
              // gear, so the only people who land in this tab are performers
              // who actually played a vendor's instrument — producers and
              // lyricists don't get tagged on a gear-driven page.
              const label = t === "about" ? "About" : t === "instruments" ? "Gear" : "Artists";
              const count = t === "instruments" ? profile?.instruments.length : t === "artists" ? usedBy.length : undefined;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  aria-pressed={active}
                  className="relative pb-2.5 text-[15px] font-semibold active:opacity-80"
                  style={{ color: active ? "#fff" : "rgba(235,235,245,0.55)" }}
                  data-testid={`tab-vendor-${t}`}
                >
                  {label}
                  {typeof count === "number" && count > 0 && (
                    <span className="ml-1.5 text-[13px] font-medium" style={{ color: "rgba(235,235,245,0.45)" }}>
                      {count}
                    </span>
                  )}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full"
                      style={{ background: "#319ED8" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {tab === "about" && (
          <>
            <section className="px-5 pt-5 pb-2">
              <h3 className="text-white text-[22px] font-bold leading-tight tracking-tight mb-2">About {vendor.name}</h3>
              <p className="text-[16px] leading-relaxed" style={{ color: "rgba(235,235,245,0.72)" }}>{bio}</p>
            </section>

            <section className="px-5 pt-5 grid grid-cols-1 gap-4">
              {vendor.location && (
                <div>
                  <p className="text-[13px] mb-0.5" style={{ color: "rgba(235,235,245,0.55)" }}>Location</p>
                  <p className="text-white text-[16px]">{vendor.location}</p>
                </div>
              )}
              {domain && (
                <div>
                  <p className="text-[13px] mb-0.5" style={{ color: "rgba(235,235,245,0.55)" }}>Web</p>
                  <button
                    type="button"
                    onClick={() => onOpenInAppBrowser({ url: websiteUrl, title: vendor.name, logoUrl: vendor.logoUrl })}
                    className="text-[16px] active:opacity-70"
                    style={{ color: "#319ED8" }}
                    data-testid="button-vendor-domain"
                  >
                    {domain}
                  </button>
                </div>
              )}
              <div>
                <p className="text-[13px] mb-0.5" style={{ color: "rgba(235,235,245,0.55)" }}>Featured instrument</p>
                <p className="text-white text-[16px]">{instrument.name}</p>
                <p className="text-[12px] mt-0.5" style={{ color: "rgba(235,235,245,0.45)" }}>The instrument that opened this page — tap the Gear tab to see the rest.</p>
              </div>
            </section>
          </>
        )}

        {tab === "instruments" && (
          <section className="px-5 pt-5">
            {!vendor.vendorId ? (
              <p className="text-[14px]" style={{ color: "rgba(235,235,245,0.5)" }}>Instrument list isn't available for this demo vendor.</p>
            ) : profileError ? (
              <p className="text-[14px]" style={{ color: "rgba(235,235,245,0.5)" }}>Couldn't load instruments. Try again later.</p>
            ) : !profile ? (
              <p className="text-[14px]" style={{ color: "rgba(235,235,245,0.5)" }}>Loading…</p>
            ) : profile.instruments.length === 0 ? (
              <p className="text-[14px]" style={{ color: "rgba(235,235,245,0.5)" }}>No instruments attached yet.</p>
            ) : (
              <ul className="flex flex-col">
                {profile.instruments.map((inst, idx) => {
                  // Build a fan-side Instrument from the profile payload so
                  // tapping the row can hand off straight to InstrumentSheet
                  // without a second fetch. Nulls → undefined to match the
                  // musicData Instrument shape (same pattern as the
                  // PerformerSheet synthetic at line ~1808).
                  const fullInst: Instrument = {
                    id: inst.id,
                    name: inst.name,
                    category: inst.category,
                    shortCategory: inst.shortCategory ?? undefined,
                    photoUrl: inst.photoUrl ?? undefined,
                    about: inst.about ?? undefined,
                    artistNote: inst.artistNote ?? undefined,
                  } as Instrument;
                  return (
                  <li
                    key={inst.id}
                    className={`flex items-center gap-3 py-3 ${idx > 0 ? "border-t border-white/8" : ""}`}
                    data-testid={`vendor-instrument-${inst.id}`}
                  >
                    {/* Tap thumbnail or text → open this instrument's sheet.
                        Same UX as song rows / discography rows elsewhere in
                        the app: the row itself is the primary action. */}
                    <button
                      type="button"
                      onClick={() => onOpenInstrument(fullInst)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-80"
                      data-testid={`button-vendor-instrument-open-${inst.id}`}
                    >
                      <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0" style={{ background: "rgba(255,255,255,0.06)" }}>
                        {inst.photoUrl ? (
                          <img src={inst.photoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/40 text-[20px]">♪</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-[15px] font-medium leading-tight truncate">{inst.name}</p>
                        <p className="text-[13px] mt-0.5 truncate" style={{ color: "rgba(235,235,245,0.55)" }}>{inst.shortCategory ?? inst.category}</p>
                      </div>
                    </button>
                    {/* Chat bubble — start a chat with THIS vendor about
                        this specific instrument. Mirrors the chat button in
                        the InstrumentSheet vendor list so fans get the same
                        affordance from either entry point. */}
                    <button
                      type="button"
                      onClick={() => onMessageVendor({ name: vendor.name, logoUrl: vendor.logoUrl, affiliateUrl: vendor.affiliateUrl })}
                      aria-label={`Message ${vendor.name} about ${inst.name}`}
                      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-70"
                      style={{ background: "rgba(49,158,216,0.16)" }}
                      data-testid={`button-vendor-instrument-chat-${inst.id}`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </button>
                    {/* Chevron — Apple-style "this row is tappable" indicator. */}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/35 flex-shrink-0" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </li>
                  );
                })}
              </ul>
            )}
            <p className="pt-4 text-[11px] leading-relaxed" style={{ color: "rgba(235,235,245,0.45)" }}>
              Everything {vendor.name} is currently attached to across the GoodTunes catalog.
            </p>
          </section>
        )}

        {tab === "artists" && (
          <section className="px-5 pt-5">
            {usedBy.length === 0 ? (
              <p className="text-[14px]" style={{ color: "rgba(235,235,245,0.5)" }}>No artists credited with this vendor's instruments yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-x-4 gap-y-5">
                {usedBy.map((person) => (
                  <div key={person.id} className="flex flex-col items-center" data-testid={`vendor-artist-${person.id}`}>
                    <PersonAvatar person={person} size={88} />
                    <p className="text-white text-[13px] font-medium mt-2 text-center leading-tight line-clamp-2">{person.name}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="pt-5 text-[11px] leading-relaxed" style={{ color: "rgba(235,235,245,0.45)" }}>
              From SuperCredits™ — artists who've credited one of {vendor.name}'s instruments on a track. Official sponsorships will badge here once that admin field lands.
            </p>
          </section>
        )}
      </div>
    </SheetShell>
  );
}

/**
 * Instagram-style in-app browser. Loads `url` in an iframe so users stay inside GoodTunes;
 * the top bar shows the vendor logo + domain, with an "open in system browser" arrow on
 * the right. Many vendor sites block iframing via X-Frame-Options/CSP — when that happens
 * the iframe stays blank, so we surface a fallback CTA after a short delay so the user can
 * still escape to their browser.
 */
function InAppBrowserSheet({
  url,
  title,
  logoUrl,
  onClose,
}: {
  url: string;
  title: string;
  logoUrl?: string;
  onClose: () => void;
}) {
  // Validate https. We refuse to render anything we can't safely embed/open.
  const safeUrl = (() => {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") return null;
      return u;
    } catch { return null; }
  })();

  const domain = safeUrl ? safeUrl.hostname.replace(/^www\./, "") : url;

  const openExternal = () => {
    if (!safeUrl) return;
    window.open(safeUrl.toString(), "_blank", "noopener,noreferrer");
  };

  return (
    <SheetShell ariaLabel={`${title} — in-app browser`} testId="sheet-inapp-browser" variant="full" onClose={onClose}>
      {/* Top bar — close on left, vendor logo + domain center, "open in browser" on right */}
      <div
        className="sticky top-0 z-20 flex items-center gap-2 px-3 py-2 border-b border-white/8"
        style={{ background: "rgba(20,24,48,0.92)", backdropFilter: "blur(20px) saturate(180%)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70 flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.10)" }}
          data-testid="button-inapp-close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="flex-1 flex items-center gap-2 min-w-0">
          {logoUrl && (
            <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.92)" }}>
              <img src={logoUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-white text-[14px] font-semibold truncate leading-tight">{title}</p>
            <p className="text-white/50 text-[11px] truncate leading-tight">{domain}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={openExternal}
          aria-label="Open in browser"
          className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70 flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.10)" }}
          data-testid="button-inapp-open-external"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6" />
            <path d="M20 4l-9 9" />
            <path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
          </svg>
        </button>
      </div>

      {/* Preview card. Virtually every vendor site (Fender, Reverb, Sweetwater,
          Martin, etc.) blocks framing via X-Frame-Options / CSP frame-ancestors,
          which left the iframe painting blank white over our placeholder. Apple
          Music and Replit's own in-app browser take the honest approach: show
          a rich preview card with brand identity + a single primary CTA to open
          in the system browser. That's what this renders now. */}
      <div className="flex-1 min-h-0 relative overflow-hidden" style={{ background: "#00062B" }}>
        {safeUrl ? (
          <>
            {/* Blurred logo as ambient backdrop (Apple Music style). */}
            {logoUrl && (
              <img
                src={logoUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: "blur(60px) saturate(160%)", transform: "scale(1.3)", opacity: 0.45 }}
              />
            )}
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(180deg, rgba(0,6,43,0.4) 0%, rgba(0,6,43,0.7) 60%, #00062B 100%)" }}
            />

            <div className="relative h-full flex flex-col items-center justify-center px-8 text-center">
              {logoUrl ? (
                <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center mb-5" style={{ background: "rgba(255,255,255,0.95)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
                  <img src={logoUrl} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5" style={{ background: "rgba(49,158,216,0.16)" }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>
              )}
              <p className="text-white text-[22px] font-bold mb-1 tracking-tight">{title}</p>
              <p className="text-white/55 text-[13px] mb-7">{domain}</p>

              <button
                type="button"
                onClick={openExternal}
                className="flex items-center gap-2 px-6 py-3 rounded-full text-white text-[15px] font-semibold active:opacity-80"
                style={{ background: "#319ED8", boxShadow: "0 6px 24px rgba(49,158,216,0.45)" }}
                data-testid="button-inapp-primary-open"
              >
                <span>Open in browser</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 4h6v6" />
                  <path d="M20 4l-9 9" />
                  <path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
                </svg>
              </button>

              <p className="mt-6 text-white/40 text-[11px] leading-relaxed max-w-[280px]">
                Most shops don't allow being shown inside another app. You'll land directly on the page above.
              </p>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <p className="text-white text-[15px] font-semibold mb-1">Can't open this link</p>
            <p className="text-white/55 text-[13px] break-all">{url}</p>
          </div>
        )}
      </div>

    </SheetShell>
  );
}

const FAV_PHOTOS_KEY = "gt:fav:photos";
function readFavPhotos(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_PHOTOS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}
function writeFavPhotos(s: Set<string>) {
  try { localStorage.setItem(FAV_PHOTOS_KEY, JSON.stringify(Array.from(s))); } catch {}
  try { window.dispatchEvent(new Event("gt:fav-photos-changed")); } catch {}
}

function PhotoLightbox({ photos, startIndex, onClose }: { photos: AlbumPhoto[]; startIndex: number; onClose: () => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(startIndex);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [zoom, setZoom] = useState(false);
  const lastTapRef = useRef(0);
  const [favPhotos, setFavPhotos] = useState<Set<string>>(() => readFavPhotos());
  const currentLiked = !!photos[index] && favPhotos.has(photos[index].id);
  const toggleLike = () => {
    const p = photos[index];
    if (!p) return;
    setFavPhotos((prev) => {
      const next = new Set(prev);
      if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
      writeFavPhotos(next);
      return next;
    });
  };

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: startIndex * el.clientWidth, behavior: "auto" });
  }, [startIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && scrollerRef.current) {
        scrollerRef.current.scrollBy({ left: scrollerRef.current.clientWidth, behavior: "smooth" });
      }
      if (e.key === "ArrowLeft" && scrollerRef.current) {
        scrollerRef.current.scrollBy({ left: -scrollerRef.current.clientWidth, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) {
      setIndex(i);
      setZoom(false);
    }
  };

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      setZoom((z) => !z);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      setTimeout(() => {
        if (lastTapRef.current && Date.now() - lastTapRef.current >= 280) {
          setChromeVisible((v) => !v);
          lastTapRef.current = 0;
        }
      }, 290);
    }
  };

  const current = photos[index];

  return (
    <div
      className="fixed inset-0 z-[70] bg-black select-none"
      role="dialog"
      aria-modal="true"
      aria-label={current?.caption ?? "Photo viewer"}
      data-testid="modal-photo"
    >
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="absolute inset-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-hide"
        style={{ scrollSnapType: zoom ? "none" : "x mandatory", overflowX: zoom ? "hidden" : "auto" }}
      >
        {photos.map((p, i) => (
          <div
            key={p.id}
            className="relative w-full h-full flex-shrink-0 snap-center flex items-center justify-center"
            style={{ minWidth: "100%" }}
          >
            <button
              type="button"
              onClick={i === index ? handleTap : undefined}
              onDoubleClick={i === index ? () => setZoom((z) => !z) : undefined}
              aria-label={zoom ? "Zoom out" : "Zoom in"}
              className="w-full h-full flex items-center justify-center bg-transparent border-0 p-0 focus:outline-none"
              style={{ cursor: i === index ? (zoom ? "zoom-out" : "zoom-in") : "default" }}
              tabIndex={i === index ? 0 : -1}
            >
              <img
                src={p.url}
                alt={p.caption ?? `Photo ${i + 1} of ${photos.length}`}
                className="max-w-full max-h-full object-contain transition-transform duration-200 ease-out pointer-events-none"
                style={{
                  transform: i === index && zoom ? "scale(2)" : "scale(1)",
                  transformOrigin: "center center",
                  touchAction: "pinch-zoom",
                }}
                draggable={false}
                data-testid={`lightbox-photo-${p.id}`}
              />
            </button>
          </div>
        ))}
      </div>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => {
              const el = scrollerRef.current;
              if (el) el.scrollBy({ left: -el.clientWidth, behavior: "smooth" });
            }}
            disabled={index === 0}
            aria-label="Previous photo"
            className={`hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full items-center justify-center text-white transition-opacity ${chromeVisible && index > 0 ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(20px)" }}
            data-testid="button-prev-photo"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button
            type="button"
            onClick={() => {
              const el = scrollerRef.current;
              if (el) el.scrollBy({ left: el.clientWidth, behavior: "smooth" });
            }}
            disabled={index === photos.length - 1}
            aria-label="Next photo"
            className={`hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full items-center justify-center text-white transition-opacity ${chromeVisible && index < photos.length - 1 ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(20px)" }}
            data-testid="button-next-photo"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </>
      )}

      <div
        className={`absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-12 pb-4 transition-opacity duration-200 ${chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)" }}
      >
        <span className="text-white/80 text-sm font-medium tabular-nums" data-testid="text-photo-counter">
          {index + 1} of {photos.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLike}
            aria-label={currentLiked ? "Unfavorite photo" : "Favorite photo"}
            aria-pressed={currentLiked}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white active:opacity-70"
            style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(20px)" }}
            data-testid="button-favorite-photo"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill={currentLiked ? "#FF5470" : "none"} stroke={currentLiked ? "#FF5470" : "currentColor"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-full flex items-center justify-center text-white active:opacity-70"
            style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(20px)" }}
            data-testid="button-close-photo"
          >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        </div>
      </div>

      <div
        className={`absolute bottom-0 left-0 right-0 z-20 px-6 pb-10 pt-6 transition-opacity duration-200 ${chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)" }}
      >
        {current?.caption && (
          <p className="text-white text-center text-[15px] mb-4" data-testid="text-photo-caption">{current.caption}</p>
        )}
        {photos.length > 1 && (
          <div className="flex justify-center gap-1.5">
            {photos.map((_, i) => (
              <span
                key={i}
                className="rounded-full transition-all"
                style={{
                  width: i === index ? 18 : 6,
                  height: 6,
                  background: i === index ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ----- Bonus content (admin-uploaded videos + photos) ---------------------
// Mounted between the tracklist and the metadata footer. Each subsection
// self-hides when its array is empty so a fresh album keeps the original
// "tracks → metadata" rhythm. Fetched here (not via the parent useQuery on
// /api/albums/:id) so we keep one round-trip per surface rather than
// bloating the album payload that every other surface (search, library,
// playlist hydration) already loads.
interface BonusVideo { id: string; albumId: string; title: string; videoUrl: string; posterUrl: string | null; position: number; }
interface BonusPhoto { id: string; albumId: string; photoUrl: string; caption: string | null; position: number; }

function AlbumBonusContent({ albumId }: { albumId: string }) {
  const { data: videos = [] } = useQuery<BonusVideo[]>({
    queryKey: ["/api/albums", albumId, "videos"],
  });
  const { data: photos = [] } = useQuery<BonusPhoto[]>({
    queryKey: ["/api/albums", albumId, "photos"],
  });
  const [activePhoto, setActivePhoto] = useState<BonusPhoto | null>(null);

  if (videos.length === 0 && photos.length === 0) return null;

  return (
    <>
      {videos.length > 0 && (
        <div className="mt-8 px-5">
          <h3 className="text-white text-[22px] font-bold tracking-tight mb-3" data-testid="heading-album-videos">
            Music Videos
          </h3>
          <div className="-mx-5 px-5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            <div className="flex gap-3 pb-2" style={{ width: "max-content" }}>
              {videos.map((v) => (
                <div
                  key={v.id}
                  className="w-[260px] flex-shrink-0"
                  data-testid={`tile-album-video-${v.id}`}
                >
                  <div className="relative rounded-lg overflow-hidden bg-black/40" style={{ aspectRatio: "16 / 9" }}>
                    <video
                      src={v.videoUrl}
                      poster={v.posterUrl ?? undefined}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="mt-2 text-[14px] text-white font-medium truncate">{v.title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {photos.length > 0 && (
        <div className="mt-8 px-5">
          <h3 className="text-white text-[22px] font-bold tracking-tight mb-3" data-testid="heading-album-photos">
            Photos
          </h3>
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePhoto(p)}
                className="relative rounded-md overflow-hidden bg-white/5 active:opacity-80"
                style={{ aspectRatio: "1 / 1" }}
                data-testid={`button-album-photo-${p.id}`}
              >
                <img src={p.photoUrl} alt={p.caption ?? ""} className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}

      {activePhoto && (
        <div
          className="fixed inset-0 z-[120] bg-black/95 flex flex-col"
          onClick={() => setActivePhoto(null)}
          data-testid="overlay-album-photo"
        >
          <div className="flex justify-end p-4">
            <button
              type="button"
              onClick={() => setActivePhoto(null)}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white"
              aria-label="Close"
              data-testid="button-close-album-photo"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center px-4">
            <img
              src={activePhoto.photoUrl}
              alt={activePhoto.caption ?? ""}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          {activePhoto.caption && (
            <p className="text-center text-white/70 text-[13px] px-6 pb-8 pt-4">{activePhoto.caption}</p>
          )}
        </div>
      )}
    </>
  );
}

