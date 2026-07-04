import {
  useState,
  useMemo,
  useEffect,
} from "react";
import { useLocation } from "wouter";
import { getInitials } from "@/lib/initials";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { IconButton } from "@/components/ui/IconButton";
import { SheetClose } from "@/components/ui/SheetChrome";
import { FanScreen } from "@/components/ui/FanScreen";
import { AlbumCard } from "@/components/ui/AlbumCard";
import { useFavoriteArtists } from "@/hooks/useFavorites";
import { useRecordRecent } from "@/hooks/useRecents";
import { chatEnabled } from "@/lib/platform";
import {
  COLLECTION_HREF,
  COLLECTION_SONGS_HREF,
  COLLECTION_ARTISTS_HREF,
} from "@/lib/fanRail";
import { subscribeChats, totalUnread } from "@/lib/chatStore";
import { ARTIST_PHOTOS, type Album, type Song } from "@/data/musicData";
import { Disc3, Music2, Mic2, Users, ListMusic, LayoutGrid, List, Star, Bookmark } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { popBounce } from "@/lib/motion";

interface UserPlaylist {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
  artworks?: string[];
  songCount?: number;
}

type SongWithAlbum = Song & { album: Album };

// ---------------------------------------------------------------------------
// Shared data hook — the fan's own collection (owned / comp + active previews)
// projected into the three lenses (albums, songs, artists) plus a
// Recently-Added ordering keyed off the real backend `user_albums.acquired_at`
// timestamp. Used by every fan-library surface (Home, Collection landing,
// Songs detail, Artists detail) so they can't drift on which albums are in
// scope. (Task #1376.)
// ---------------------------------------------------------------------------
function useFanLibrary() {
  const [, navigate] = useLocation();
  const recordRecent = useRecordRecent();

  // Catalog albums + songs come from the DB so anything added through the
  // admin CMS shows up immediately. The shared queryClient default has
  // staleTime: Infinity, so these fetch once per session and are reused by
  // every other surface that calls the same queryKey.
  const { data: albumsRaw } = useQuery<Album[]>({ queryKey: ["/api/albums"] });
  const { data: songsRaw } = useQuery<Song[]>({ queryKey: ["/api/songs"] });
  // The fan's collection (real owned/comp + active previews; expired previews
  // already filtered server-side). `acquiredAt` is the real backend timestamp
  // recorded when each album entered the library — it drives Recently Added.
  // The owner-scoped ownership feed also resolves the full album row server-
  // side (`album`), which — unlike the public `/api/albums` catalog — includes
  // Prepping/hidden releases the fan owns. We source owned tiles from it so a
  // staged copy still renders in its owner's Library. (Task #2476.)
  const { data: myAlbumsRaw, isLoading: myAlbumsLoading } = useQuery<
    Array<{
      albumId: string;
      isPreview?: boolean;
      acquiredAt?: string | null;
      album?: Album;
    }> | null
  >({ queryKey: ["/api/my-albums"] });

  const previewAlbumIds = useMemo(
    () => new Set((myAlbumsRaw ?? []).filter((a) => a.isPreview).map((a) => a.albumId)),
    [myAlbumsRaw],
  );
  const ownedAlbumIds = useMemo(
    () => new Set((myAlbumsRaw ?? []).map((a) => a.albumId)),
    [myAlbumsRaw],
  );
  // albumId → the server-resolved album row from the ownership feed. Covers
  // Prepping/hidden owned releases the public catalog strips. (Task #2476.)
  const ownedAlbumById = useMemo(() => {
    const m = new Map<string, Album>();
    (myAlbumsRaw ?? []).forEach((a) => {
      if (a.album) m.set(a.albumId, a.album);
    });
    return m;
  }, [myAlbumsRaw]);
  // albumId → acquired-at epoch millis (0 when missing). Used to order
  // Recently Added freshest-first.
  const acquiredAtById = useMemo(() => {
    const m = new Map<string, number>();
    (myAlbumsRaw ?? []).forEach((a) => {
      m.set(a.albumId, a.acquiredAt ? Date.parse(a.acquiredAt) : 0);
    });
    return m;
  }, [myAlbumsRaw]);

  // GoodTunes releases the fan actually owns. Songs + artists derive from
  // this list so every lens stays scoped to the fan's collection.
  //
  // Task #2476 — sourced from OWNERSHIP, not the public catalog. For each
  // owned album we prefer the richer public-catalog row (label credit, artist
  // photo, share slug) but fall back to the owner-scoped ownership row for a
  // Prepping/hidden release the public feed strips. We keep the "curated
  // GoodTunes releases only" scope but NO LONGER drop Prepping/hidden — the
  // fan owns these, so they belong in their own Library at any stage.
  const dbAlbums = useMemo(() => {
    const publicById = new Map((albumsRaw ?? []).map((a) => [a.id, a] as const));
    const out: Album[] = [];
    ownedAlbumIds.forEach((id) => {
      const album = publicById.get(id) ?? ownedAlbumById.get(id);
      if (!album || !album.isGoodTunesRelease) return;
      out.push(album);
    });
    return out;
  }, [albumsRaw, ownedAlbumById, ownedAlbumIds]);
  const dbAlbumIds = useMemo(() => new Set(dbAlbums.map((a) => a.id)), [dbAlbums]);
  const dbSongs = useMemo(
    () => (songsRaw ?? []).filter((s) => dbAlbumIds.has(s.albumId)),
    [songsRaw, dbAlbumIds],
  );

  const allSongsWithAlbum = useMemo(
    () =>
      dbSongs
        .map((s) => ({ ...s, album: dbAlbums.find((a) => a.id === s.albumId)! }))
        .filter((s) => s.album),
    [dbAlbums, dbSongs],
  );

  const artists = useMemo(() => {
    const map = new Map<string, { name: string; albums: Album[] }>();
    dbAlbums.forEach((a) => {
      const cur = map.get(a.artist) ?? { name: a.artist, albums: [] };
      cur.albums.push(a);
      map.set(a.artist, cur);
    });
    return Array.from(map.values());
  }, [dbAlbums]);

  // Recently Added — every owned album, freshest-first by real acquired-at.
  const recentlyAdded = useMemo(
    () =>
      [...dbAlbums].sort(
        (a, b) => (acquiredAtById.get(b.id) ?? 0) - (acquiredAtById.get(a.id) ?? 0),
      ),
    [dbAlbums, acquiredAtById],
  );

  // Stamp a fan-recent every time we open an album / artist from a library
  // surface (the grid card, the carousel rail, or a song row's parent link).
  const openAlbum = (album: Album) => {
    recordRecent({
      entityKind: "album",
      entityId: album.id,
      title: album.title,
      subtitle: album.artist,
      thumbUrl: album.artwork ?? null,
      href: `/album/${album.id}`,
    });
    navigate(`/album/${album.id}`);
  };
  const openArtist = (name: string, photo?: string | null) => {
    recordRecent({
      entityKind: "artist",
      entityId: name,
      title: name,
      thumbUrl: photo ?? null,
      href: `/artist/${encodeURIComponent(name)}`,
    });
    navigate(`/artist/${encodeURIComponent(name)}`);
  };

  return {
    previewAlbumIds,
    myAlbumsLoading,
    dbAlbums,
    allSongsWithAlbum,
    artists,
    recentlyAdded,
    openAlbum,
    openArtist,
  };
}

// ---------------------------------------------------------------------------
// Account avatar — top-right identity chip. Unread chat count (the Chat tab
// was retired from the dock) shows as a small red dot so the inbox stays
// discoverable without a dedicated tab. (Task #530.)
// ---------------------------------------------------------------------------
function AccountAvatar() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [, setUnreadTick] = useState(0);
  useEffect(() => subscribeChats(() => setUnreadTick((n) => n + 1)), []);
  const unread = chatEnabled ? totalUnread() : 0;
  const avatarInitials = getInitials(user?.displayName || user?.username, "?");
  return (
    <button
      type="button"
      onClick={() => navigate("/account")}
      aria-label="Account"
      className="relative w-9 h-9 rounded-full overflow-hidden flex items-center justify-center active:opacity-70 lg:hidden"
      style={{
        background: "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
      data-testid="button-open-account"
    >
      {user?.photoUrl ? (
        <img src={user.photoUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-fan-primary text-xs font-semibold">{avatarInitials}</span>
      )}
      {unread > 0 && (
        <span
          aria-label={`${unread} unread messages`}
          className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
          style={{ background: "#FF5470", border: "1.5px solid #00062B" }}
          data-testid="badge-account-unread"
        />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Back button — returns a detail view (Songs / Artists) to the Collection
// landing. Lives in the fixed header's leading slot.
// ---------------------------------------------------------------------------
function BackButton() {
  const [, navigate] = useLocation();
  // Hidden at lg+ (TD): the left rail owns Collection navigation there, so a
  // per-page back arrow is redundant. Phone keeps it (no rail).
  return (
    <span className="lg:hidden">
      <IconButton
        onClick={() => navigate(COLLECTION_HREF)}
        label="Back to Collection"
        data-testid="button-back"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </IconButton>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sort popover — the top-right "filter" control on the Songs / Artists detail
// views. Apple-Music popover with no second backdrop-filter (the page has no
// frosted scope bar any more, so a ~0.97-opaque solid scrim is enough and
// dodges the iOS-WebKit stacked-blur kill). Anchored to the right edge.
// ---------------------------------------------------------------------------
function SortMenu({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  return (
    <div className="relative flex-shrink-0">
      <IconButton onClick={() => setOpen((s) => !s)} label="Sort" data-testid="button-sort">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M3 6h18M6 12h12M10 18h4" />
        </svg>
      </IconButton>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-30"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            />
            <motion.div
              className="absolute right-0 top-full mt-1.5 z-40 rounded-xl py-1 min-w-[180px]"
              style={{
                background: "rgba(32, 32, 36, 0.97)",
                boxShadow: "0 12px 32px rgba(0,0,0,0.55)",
                border: "1px solid rgba(255,255,255,0.08)",
                transformOrigin: "top right",
              }}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0, transition: popBounce(!!reduceMotion) }}
              exit={reduceMotion ? { opacity: 0, transition: { duration: 0.12 } } : { opacity: 0, scale: 0.92, y: -4, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } }}
            >
              <div className="px-3.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fan-faint">
                Sort by
              </div>
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-white transition-colors active:bg-white/10"
                  data-testid={`sort-${opt.value}`}
                >
                  <span className="w-4 flex-shrink-0 flex items-center justify-center">
                    {value === opt.value && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="3" strokeLinecap="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// Grid/List view toggle — TD-only (lg+). Phone never sees this (the trailing
// slot stays sort-only below lg), so the phone build is untouched. (Task #1404.)
function ViewToggle({
  view,
  onChange,
}: {
  view: "grid" | "list";
  onChange: (v: "grid" | "list") => void;
}) {
  return (
    <div
      className="hidden lg:flex items-center rounded-xl p-0.5 flex-shrink-0"
      style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)" }}
      role="group"
      aria-label="View"
    >
      <button
        type="button"
        onClick={() => onChange("grid")}
        aria-pressed={view === "grid"}
        aria-label="Grid view"
        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
        style={view === "grid" ? { background: "rgba(255,255,255,0.14)" } : undefined}
        data-testid="button-view-grid"
      >
        <LayoutGrid size={15} className={view === "grid" ? "text-white" : "text-fan-faint"} />
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        aria-pressed={view === "list"}
        aria-label="List view"
        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
        style={view === "list" ? { background: "rgba(255,255,255,0.14)" } : undefined}
        data-testid="button-view-list"
      >
        <List size={15} className={view === "list" ? "text-white" : "text-fan-faint"} />
      </button>
    </div>
  );
}

// Shared "Show more" button — extends an iOS render cap in 60-row chunks.
function ShowMore({ remaining, onClick, testId }: { remaining: number; onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full mt-5 py-3 rounded-xl text-sm font-semibold text-[#319ED8] active:opacity-60 transition-opacity"
      style={{ background: "rgba(49,158,216,0.12)" }}
      data-testid={testId}
    >
      Show more ({remaining} left)
    </button>
  );
}

// ===========================================================================
// HOME — the owned-albums grid. Large "Home" header, NO sort/filter scope
// bar (albums sort title-A→Z by default). (Task #1376.)
// ===========================================================================
export function Home() {
  const { previewAlbumIds, myAlbumsLoading, dbAlbums, openAlbum } = useFanLibrary();
  const [visibleCount, setVisibleCount] = useState(60);

  const albums = useMemo(
    () => [...dbAlbums].sort((a, b) => a.title.localeCompare(b.title)),
    [dbAlbums],
  );

  return (
    <FanScreen title="Home" trailing={<AccountAvatar />} fadeTrailing>
      <div className="px-5 pb-4">
        {myAlbumsLoading && albums.length === 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-4 lg:gap-5" data-testid="skeleton-albums">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="aspect-square rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.08)" }} />
                <div className="h-3 rounded animate-pulse w-3/4" style={{ background: "rgba(255,255,255,0.08)" }} />
                <div className="h-2.5 rounded animate-pulse w-1/2" style={{ background: "rgba(255,255,255,0.06)" }} />
              </div>
            ))}
          </div>
        ) : albums.length === 0 ? (
          <div className="text-center mt-16 px-6 flex flex-col items-center gap-3" data-testid="text-empty-albums">
            <Disc3 className="w-10 h-10 text-fan-faint" strokeWidth={1.5} />
            <p className="text-fan-secondary text-sm">No Albums yet</p>
            <p className="text-fan-faint text-xs">Albums you own will appear here</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-4 lg:gap-5">
              {albums.slice(0, visibleCount).map((album) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  isPreview={previewAlbumIds.has(album.id)}
                  notYetReleased={!!(album.isPrepping || album.isHidden)}
                  onNavigate={() => openAlbum(album)}
                />
              ))}
            </div>
            {albums.length > visibleCount && (
              <ShowMore
                remaining={albums.length - visibleCount}
                onClick={() => setVisibleCount((n) => n + 60)}
                testId="button-show-more-albums"
              />
            )}
          </>
        )}
      </div>
    </FanScreen>
  );
}

// ===========================================================================
// COLLECTION — the Apple-Library landing: tappable Songs / Artists / Playlists
// rows, then a "Recently Added" 2-up album grid ordered by real acquired-at.
// (Task #1376.)
// ===========================================================================
export function Collection() {
  const [, navigate] = useLocation();
  const { previewAlbumIds, myAlbumsLoading, recentlyAdded, openAlbum } = useFanLibrary();
  const [visibleCount, setVisibleCount] = useState(60);

  // Task #1406 — Favorite Artists + Bookmarks moved OFF the Account page
  // onto the Collection landing (they're saved-content, not settings). We
  // mirror the counts Account used to show: favorite artists from the
  // favorites hook, bookmarked gear from the same localStorage key the
  // Bookmarks page reads.
  const favArtists = useFavoriteArtists();
  const [bookmarkCount, setBookmarkCount] = useState(0);
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem("gt:bookmarked-instruments");
        const arr = raw ? JSON.parse(raw) : [];
        setBookmarkCount(Array.isArray(arr) ? arr.length : 0);
      } catch { setBookmarkCount(0); }
    };
    load();
    window.addEventListener("focus", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("focus", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const rows: { label: string; icon: typeof Music2; href: string; testId: string; count?: number }[] = [
    { label: "Songs", icon: Music2, href: COLLECTION_SONGS_HREF, testId: "row-library-songs" },
    { label: "Artists", icon: Users, href: COLLECTION_ARTISTS_HREF, testId: "row-library-artists" },
    { label: "Playlists", icon: ListMusic, href: "/playlists", testId: "row-library-playlists" },
    { label: "Favorite Artists", icon: Star, href: "/account/favorite-artists", testId: "row-library-favorite-artists", count: favArtists.ordered.length },
    { label: "Bookmarks", icon: Bookmark, href: "/account/bookmarks", testId: "row-library-bookmarks", count: bookmarkCount },
  ];

  return (
    <FanScreen title="Collection" trailing={<AccountAvatar />} fadeTrailing>
      {/* Apple-Library category rows — phone only. At lg+ (TD) the left rail
          already exposes Songs / Artists / Playlists nested under Collection,
          so these rows would be a redundant duplicate of the rail. */}
      <div className="px-5 lg:hidden">
        <div className="flex flex-col" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          {rows.map((r) => {
            const Icon = r.icon;
            return (
              <button
                key={r.href}
                type="button"
                onClick={() => navigate(r.href)}
                className="flex items-center gap-3.5 py-3.5 active:opacity-60 transition-opacity text-left"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
                data-testid={r.testId}
              >
                <Icon className="w-[22px] h-[22px] text-[color:var(--brand-blue)] flex-shrink-0" strokeWidth={2} />
                <span className="flex-1 text-fan-primary text-[17px] font-medium">{r.label}</span>
                {r.count !== undefined && (
                  <span className="text-fan-faint text-sm tabular-nums" data-testid={`${r.testId}-count`}>{r.count}</span>
                )}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" opacity="0.3">
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recently Added — 2-up grid, freshest-first by acquired-at. */}
      <div className="px-5 pt-7 pb-4">
        <h2 className="text-fan-primary text-[22px] font-bold tracking-tight mb-4" data-testid="text-recently-added">
          Recently Added
        </h2>
        {myAlbumsLoading && recentlyAdded.length === 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="skeleton-recently-added">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="aspect-square rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.08)" }} />
                <div className="h-3 rounded animate-pulse w-3/4" style={{ background: "rgba(255,255,255,0.08)" }} />
                <div className="h-2.5 rounded animate-pulse w-1/2" style={{ background: "rgba(255,255,255,0.06)" }} />
              </div>
            ))}
          </div>
        ) : recentlyAdded.length === 0 ? (
          <div className="text-center mt-8 px-6 flex flex-col items-center gap-3" data-testid="text-empty-recently-added">
            <Disc3 className="w-10 h-10 text-fan-faint" strokeWidth={1.5} />
            <p className="text-fan-secondary text-sm">Nothing here yet</p>
            <p className="text-fan-faint text-xs">Albums you add will appear here, newest first</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {recentlyAdded.slice(0, visibleCount).map((album) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  isPreview={previewAlbumIds.has(album.id)}
                  notYetReleased={!!(album.isPrepping || album.isHidden)}
                  onNavigate={() => openAlbum(album)}
                />
              ))}
            </div>
            {recentlyAdded.length > visibleCount && (
              <ShowMore
                remaining={recentlyAdded.length - visibleCount}
                onClick={() => setVisibleCount((n) => n + 60)}
                testId="button-show-more-recently-added"
              />
            )}
          </>
        )}
      </div>
    </FanScreen>
  );
}

// ===========================================================================
// COLLECTION → SONGS — every song from owned albums; sort (Title / Artist) in
// the top-right popover. Carries the Add-to-Playlist sheet. (Task #1376.)
// ===========================================================================
export function CollectionSongs() {
  const [, navigate] = useLocation();
  const { playSong, currentSong, setShowPlayer } = usePlayer();
  const { myAlbumsLoading, allSongsWithAlbum, previewAlbumIds } = useFanLibrary();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sortBy, setSortBy] = useState("title");
  const [visibleCount, setVisibleCount] = useState(60);
  const [addToPlaylistSong, setAddToPlaylistSong] = useState<SongWithAlbum | null>(null);
  useEffect(() => {
    setVisibleCount(60);
  }, [sortBy]);

  const { data: playlistsRaw } = useQuery<UserPlaylist[] | null>({
    queryKey: ["/api/playlists"],
  });
  const userPlaylists = playlistsRaw ?? [];

  const songs = useMemo(
    () =>
      [...allSongsWithAlbum].sort((a, b) =>
        sortBy === "artist"
          ? a.album.artist.localeCompare(b.album.artist)
          : a.title.localeCompare(b.title),
      ),
    [allSongsWithAlbum, sortBy],
  );

  const addSongMutation = useMutation({
    mutationFn: async ({ playlistId, songId }: { playlistId: string; songId: string }) => {
      const res = await apiRequest("POST", `/api/playlists/${playlistId}/songs`, { songId });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", vars.playlistId, "songs"] });
      const pl = userPlaylists.find((p) => p.id === vars.playlistId);
      toast({
        title: pl ? `Added to ${pl.name}` : "Added to Playlist",
        action: (
          <ToastAction
            altText="Go to Playlist"
            onClick={() => {
              setShowPlayer(false);
              navigate(`/playlists?playlist=${encodeURIComponent(vars.playlistId)}`);
            }}
          >
            Go to Playlist
          </ToastAction>
        ),
      });
      setAddToPlaylistSong(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "";
      const is403 = msg.startsWith("403:");
      toast({
        title: is403 ? "Album not in your library" : "Couldn't add song",
        description: is403
          ? "You need to own this album to add songs to a playlist."
          : "Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <FanScreen
      title="Songs"
      leading={<BackButton />}
      trailing={
        <SortMenu
          options={[
            { value: "title", label: "Title" },
            { value: "artist", label: "Artist" },
          ]}
          value={sortBy}
          onChange={setSortBy}
        />
      }
    >
      <div className="px-5 pb-4 flex flex-col">
        {myAlbumsLoading && songs.length === 0 ? (
          <div className="flex flex-col gap-0" data-testid="skeleton-songs">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5" style={{ borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                <div className="w-11 h-11 rounded-md animate-pulse flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="h-3 rounded animate-pulse w-2/3" style={{ background: "rgba(255,255,255,0.08)" }} />
                  <div className="h-2.5 rounded animate-pulse w-1/3" style={{ background: "rgba(255,255,255,0.06)" }} />
                </div>
              </div>
            ))}
          </div>
        ) : songs.length === 0 ? (
          <div className="text-center mt-16 px-6 flex flex-col items-center gap-3" data-testid="text-empty-songs">
            <Music2 className="w-10 h-10 text-fan-faint" strokeWidth={1.5} />
            <p className="text-fan-secondary text-sm">No Songs yet</p>
            <p className="text-fan-faint text-xs">Songs from albums you own will appear here</p>
          </div>
        ) : null}
        {songs.slice(0, visibleCount).map((song, idx, visibleSongs) => {
          const isActive = currentSong?.id === song.id;
          return (
            <div
              key={song.id}
              className="flex items-center gap-3 py-2.5"
              style={{ borderBottom: idx < visibleSongs.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}
              data-testid={`row-song-${song.id}`}
            >
              <button
                type="button"
                onClick={() => playSong(song, songs)}
                className="flex items-center gap-3 flex-1 min-w-0 active:opacity-60 transition-opacity text-left"
                data-testid={`button-play-song-${song.id}`}
              >
                <img src={song.album.artwork} alt={song.album.title} loading="lazy" decoding="async" className="w-11 h-11 rounded-md object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate leading-tight ${isActive ? "text-[#319ED8]" : "text-fan-primary"}`}>{song.title}</p>
                  <p className="text-fan-secondary text-xs truncate leading-tight mt-0.5">{song.album.artist}</p>
                </div>
                {isActive && (
                  <div className="flex gap-[2px] items-end h-3.5 mr-1">
                    {[0.6, 1, 0.75].map((h, i) => (
                      <div
                        key={i}
                        className="w-[2px] rounded-full"
                        style={{
                          background: "#319ED8",
                          height: `${h * 100}%`,
                          animation: "equalizerBounce 0.8s ease-in-out infinite alternate",
                          animationDelay: `${i * 0.2}s`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </button>
              {!previewAlbumIds.has(song.album.id) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAddToPlaylistSong(song);
                }}
                aria-label={`Add ${song.title} to a playlist`}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 active:scale-[0.94] transition-transform"
                style={{ background: "rgba(49,158,216,0.22)" }}
                data-testid={`button-add-to-playlist-${song.id}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="3" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              )}
            </div>
          );
        })}
        {songs.length > visibleCount && (
          <ShowMore
            remaining={songs.length - visibleCount}
            onClick={() => setVisibleCount((n) => n + 60)}
            testId="button-show-more-songs"
          />
        )}
      </div>

      {addToPlaylistSong && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            style={{ backdropFilter: "blur(4px)" }}
            onClick={() => setAddToPlaylistSong(null)}
          />
          <div className="relative w-full max-w-[390px] bg-[#0D1B4B] rounded-t-3xl pt-3 pb-6 z-10 flex flex-col" style={{ maxHeight: "78vh" }}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 flex-shrink-0" />
            <div className="flex items-center justify-between px-5 mb-3 flex-shrink-0">
              <h3 className="text-fan-primary font-semibold text-base">Add to Playlist</h3>
              <SheetClose onClick={() => setAddToPlaylistSong(null)} data-testid="button-close-add-to-playlist" />
            </div>
            <div className="flex items-center gap-3 px-5 pb-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <img src={addToPlaylistSong.album.artwork} alt={addToPlaylistSong.album.title} loading="lazy" decoding="async" className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-fan-primary text-sm font-medium truncate leading-tight">{addToPlaylistSong.title}</p>
                <p className="text-fan-secondary text-xs truncate leading-tight mt-0.5">{addToPlaylistSong.album.artist}</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-hide px-5">
              {userPlaylists.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-fan-secondary text-sm">No playlists yet</p>
                  <button
                    type="button"
                    onClick={() => {
                      setAddToPlaylistSong(null);
                      navigate("/playlists");
                    }}
                    className="text-[#319ED8] text-sm font-semibold mt-3"
                    data-testid="button-go-create-playlist"
                  >
                    Create one
                  </button>
                </div>
              ) : (
                userPlaylists.map((pl) => (
                  <button
                    key={pl.id}
                    type="button"
                    disabled={addSongMutation.isPending}
                    onClick={() => addSongMutation.mutate({ playlistId: pl.id, songId: addToPlaylistSong.id })}
                    className="w-full flex items-center gap-3 py-3 active:opacity-60 transition-opacity text-left disabled:opacity-50"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                    data-testid={`button-pick-playlist-${pl.id}`}
                  >
                    <div className="w-11 h-11 rounded-md flex-shrink-0 overflow-hidden flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                      {pl.artworks && pl.artworks[0] ? (
                        <img src={pl.artworks[0]} alt={pl.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round">
                          <path d="M9 17V5l12-2v12M9 17a3 3 0 11-3-3 3 3 0 013 3zM21 15a3 3 0 11-3-3 3 3 0 013 3z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-fan-primary text-sm font-medium truncate leading-tight">{pl.name}</p>
                      <p className="text-fan-secondary text-xs truncate leading-tight mt-0.5">
                        {pl.songCount ?? 0} {(pl.songCount ?? 0) === 1 ? "song" : "songs"}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </FanScreen>
  );
}

// Artist avatar that prefers the resolved artist photo and only falls back to
// album artwork once `/api/people` has loaded — while it's loading we show a
// gradient-initial placeholder rather than flashing the album cover (which is
// the exact wrong-image Bill reported for Nightbirde). Mirrors FavoriteArtists.
function CollectionArtistAvatar({
  name,
  photo,
  fallback,
  className,
}: {
  name: string;
  photo: string | undefined;
  fallback: string | undefined;
  className: string;
}) {
  const [errored, setErrored] = useState(false);
  const src = !errored ? photo ?? fallback : undefined;
  if (!src) {
    return (
      <div
        className={`${className} rounded-full flex items-center justify-center text-fan-secondary font-bold`}
        style={{
          background: "linear-gradient(135deg, #1D5E8F, #4A1E8F)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
        aria-hidden="true"
      >
        {getInitials(name, "?")}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      onError={() => setErrored(true)}
      loading="lazy"
      decoding="async"
      className={`${className} rounded-full object-cover`}
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        ...(photo && !errored ? { objectPosition: "50% 20%" } : {}),
      }}
    />
  );
}

// ===========================================================================
// COLLECTION → ARTISTS — artists from owned albums; sort (A–Z / Z–A) in the
// top-right popover. Tapping a row opens the artist page. (Task #1376.)
// ===========================================================================
export function CollectionArtists() {
  const { myAlbumsLoading, artists, openArtist } = useFanLibrary();
  const favArtists = useFavoriteArtists();
  // Prefer the admin-uploaded Person photo (same source ArtistDetail and
  // FavoriteArtists use) over the static fallback map, so artists like
  // Nightbirde show their real photo instead of their album cover. Shared
  // queryKey with ArtistDetail → a free read when already cached.
  const { data: people, isLoading: peopleLoading } = useQuery<Array<{ name: string; photoUrl: string | null }>>({
    queryKey: ["/api/people"],
  });
  const peoplePhotoByName = useMemo(() => {
    const map = new Map<string, string>();
    (people ?? []).forEach((p) => {
      if (p.photoUrl) map.set(p.name.trim().toLowerCase(), p.photoUrl);
    });
    return map;
  }, [people]);
  const [sortBy, setSortBy] = useState("name-asc");
  const [visibleCount, setVisibleCount] = useState(60);
  // TD (lg+) defaults to the artwork grid; the toggle only renders at lg+, so
  // phone always stays on the list. (Task #1404.)
  const [view, setView] = useState<"grid" | "list">(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width:1024px)").matches ? "grid" : "list",
  );
  useEffect(() => {
    setVisibleCount(60);
  }, [sortBy]);

  const sorted = useMemo(
    () =>
      [...artists].sort((a, b) =>
        sortBy === "name-desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name),
      ),
    [artists, sortBy],
  );

  return (
    <FanScreen
      title="Artists"
      leading={<BackButton />}
      trailing={
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          <SortMenu
            options={[
              { value: "name-asc", label: "A–Z" },
              { value: "name-desc", label: "Z–A" },
            ]}
            value={sortBy}
            onChange={setSortBy}
          />
        </div>
      }
    >
      <div className="px-5 pb-4 flex flex-col">
        {myAlbumsLoading && sorted.length === 0 ? (
          <div className="flex flex-col gap-0" data-testid="skeleton-artists">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3" style={{ borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                <div className="w-11 h-11 rounded-full animate-pulse flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />
                <div className="h-3 rounded animate-pulse w-1/2" style={{ background: "rgba(255,255,255,0.08)" }} />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center mt-16 px-6 flex flex-col items-center gap-3" data-testid="text-empty-artists">
            <Mic2 className="w-10 h-10 text-fan-faint" strokeWidth={1.5} />
            <p className="text-fan-secondary text-sm">No Artists yet</p>
            <p className="text-fan-faint text-xs">Artists from albums you own will appear here</p>
          </div>
        ) : null}
        {/* List — phone always; at lg+ only when the toggle picks "list". */}
        <div className={`flex flex-col ${view === "grid" ? "lg:hidden" : ""}`}>
          {sorted.slice(0, visibleCount).map((artist, idx, visibleArtists) => {
            const isFav = favArtists.has(artist.name);
            const personPhoto = peoplePhotoByName.get(artist.name.trim().toLowerCase());
            const photo = peopleLoading ? undefined : personPhoto ?? ARTIST_PHOTOS[artist.name];
            const fallbackArt = peopleLoading ? undefined : artist.albums[0]?.artwork;
            return (
              <button
                key={artist.name}
                type="button"
                onClick={() => openArtist(artist.name, photo ?? artist.albums[0]?.artwork ?? null)}
                className="flex items-center gap-3 py-3 active:opacity-60 transition-opacity text-left"
                style={{ borderBottom: idx < visibleArtists.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}
                data-testid={`row-artist-${artist.name}`}
              >
                <div className="relative flex-shrink-0">
                  <CollectionArtistAvatar
                    name={artist.name}
                    photo={photo}
                    fallback={fallbackArt}
                    className="w-12 h-12"
                  />
                  {isFav && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full"
                      style={{ background: "var(--brand-bg)" }}
                      aria-label="Favorited"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="rgba(255,255,255,0.55)">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-fan-primary text-sm font-semibold truncate leading-tight">{artist.name}</p>
                  <p className="text-fan-secondary text-xs truncate leading-tight mt-0.5">
                    {artist.albums.length} {artist.albums.length === 1 ? "album" : "albums"}
                  </p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.3">
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" />
                </svg>
              </button>
            );
          })}
        </div>
        {/* TD (lg+) — circular artwork grid. Phone never renders this. */}
        <div className={`hidden ${view === "grid" ? "lg:grid" : ""} lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-x-4 gap-y-6`}>
          {sorted.slice(0, visibleCount).map((artist) => {
            const isFav = favArtists.has(artist.name);
            const personPhoto = peoplePhotoByName.get(artist.name.trim().toLowerCase());
            const photo = peopleLoading ? undefined : personPhoto ?? ARTIST_PHOTOS[artist.name];
            const fallbackArt = peopleLoading ? undefined : artist.albums[0]?.artwork;
            return (
              <button
                key={artist.name}
                type="button"
                onClick={() => openArtist(artist.name, photo ?? artist.albums[0]?.artwork ?? null)}
                className="flex flex-col items-center gap-2 text-center active:opacity-70 transition-opacity"
                data-testid={`card-artist-${artist.name}`}
              >
                <div className="relative w-full">
                  <CollectionArtistAvatar
                    name={artist.name}
                    photo={photo}
                    fallback={fallbackArt}
                    className="w-full aspect-square"
                  />
                  {isFav && (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="rgba(255,255,255,0.9)"
                      aria-label="Favorited"
                      className="absolute bottom-1.5 right-1.5"
                      style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }}
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0 w-full">
                  <p className="text-fan-primary text-sm font-semibold truncate leading-tight">{artist.name}</p>
                  <p className="text-fan-secondary text-xs truncate leading-tight mt-0.5">
                    {artist.albums.length} {artist.albums.length === 1 ? "album" : "albums"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        {sorted.length > visibleCount && (
          <ShowMore
            remaining={sorted.length - visibleCount}
            onClick={() => setVisibleCount((n) => n + 60)}
            testId="button-show-more-artists"
          />
        )}
      </div>
    </FanScreen>
  );
}
